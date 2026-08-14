/**
 * ===========================================
 * Arthings - Listing Routes
 * ===========================================
 *
 * CRUD and search for both rentable items and housing. The `listingType`
 * discriminator decides which set of attributes applies; everything else
 * (images, ownership, geocoding, availability) is shared.
 */

const express = require('express');
const prisma = require('../db/db');
const listings = require('../services/listings');
const geocoding = require('../services/geocoding');
const storage = require('../services/storage');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const schemas = require('../validators/listings');

const router = express.Router();

/** Address fields that, when changed, invalidate stored coordinates. */
const ADDRESS_KEYS = ['country', 'region', 'district', 'city', 'village', 'street', 'houseNumber', 'postcode'];

function pickAddress(source) {
    const address = {};
    for (const key of ADDRESS_KEYS) {
        if (source[key] !== undefined) address[key] = source[key];
    }
    return address;
}

/** Housing attributes only apply to housing listings. */
const HOUSING_KEYS = [
    'housingCategory', 'rentalPeriod', 'housingType', 'rooms', 'area', 'floor',
    'totalFloors', 'maxGuests', 'isFurnished', 'petsAllowed', 'smokingAllowed',
    'hasInternet', 'hasParking', 'utilitiesIncluded', 'studentsAllowed'
];

function pickHousing(source, listingType) {
    const data = {};
    for (const key of HOUSING_KEYS) {
        if (source[key] === undefined) continue;
        // Silently dropping these on item listings keeps the data honest:
        // an "apartment" bicycle should not be storable.
        if (listingType !== 'housing' && key !== 'studentsAllowed') continue;
        data[key] = source[key];
    }
    return data;
}

/**
 * Resolves coordinates for an address, returning the columns to persist.
 * A geocoding failure is non-fatal — the listing saves without a pin.
 */
async function resolveCoordinates(address) {
    const result = await geocoding.geocodeAddress(address);
    if (!result) {
        return { latitude: null, longitude: null, geocodedAt: null, geocodeAccuracy: null, geocodeQuery: null };
    }
    return {
        latitude: result.latitude,
        longitude: result.longitude,
        geocodedAt: new Date(),
        geocodeAccuracy: result.accuracy,
        geocodeQuery: result.query?.slice(0, 500) ?? null
    };
}

/** Loads a listing and asserts the caller owns it. */
async function loadOwnedListing(itemId, userId) {
    const item = await prisma.item.findUnique({
        where: { id: itemId },
        include: { images: true }
    });

    if (!item) return { error: { status: 404, message: 'Listing not found' } };
    if (item.userId !== userId) {
        return { error: { status: 403, message: 'You can only modify your own listings' } };
    }
    return { item };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * GET /api/products
 * Paginated listing search.
 */
router.get('/', validate({ query: schemas.list }), async (req, res) => {
    try {
        const result = await listings.search(req.query);
        res.json(result);
    } catch (error) {
        console.error('Get listings error:', error);
        res.status(500).json({ error: 'Failed to load listings' });
    }
});

/**
 * GET /api/products/map
 * Marker payloads for the map, by viewport or radius.
 *
 * Declared before `/:id` so the literal path is not swallowed by the
 * parameterised route.
 */
router.get('/map', validate({ query: schemas.mapQuery }), async (req, res) => {
    try {
        const result = await listings.searchMap(req.query);
        res.json(result);
    } catch (error) {
        console.error('Map search error:', error);
        res.status(500).json({ error: 'Failed to load map listings' });
    }
});

/**
 * GET /api/products/:id
 */
router.get('/:id', validate({ params: schemas.idParam }), async (req, res) => {
    try {
        const item = await prisma.item.findUnique({
            where: { id: req.params.id },
            include: listings.LISTING_INCLUDE
        });

        if (!item) return res.status(404).json({ error: 'Listing not found' });

        // View counting is incidental to the response; do not make the reader
        // wait on it or fail the request if it errors.
        prisma.item
            .update({ where: { id: item.id }, data: { views: { increment: 1 } } })
            .catch(() => {});

        res.json({ product: { ...listings.formatListing(item), views: item.views + 1 } });
    } catch (error) {
        console.error('Get listing error:', error);
        res.status(500).json({ error: 'Failed to load listing' });
    }
});

/**
 * GET /api/products/:id/availability
 * Booked and blocked ranges, for the calendar.
 */
router.get('/:id/availability', validate({ params: schemas.idParam }), async (req, res) => {
    try {
        const ranges = await listings.busyRanges(req.params.id);
        res.json({ busy: ranges });
    } catch (error) {
        console.error('Availability error:', error);
        res.status(500).json({ error: 'Failed to load availability' });
    }
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * POST /api/products
 * Creates a listing, geocoding its address in the process.
 */
router.post(
    '/',
    requireAuth,
    requireVerifiedEmail,
    limiters.write,
    storage.uploader.array('images', 10),
    validate({ body: schemas.create }),
    async (req, res) => {
        try {
            const body = req.body;
            const address = pickAddress(body);
            const coordinates = await resolveCoordinates(address);
            const imagePaths = await storage.persistFiles(req.files);

            const created = await prisma.$transaction(async tx => {
                const item = await tx.item.create({
                    data: {
                        userId: req.session.userId,
                        listingType: body.listingType,
                        title: body.title,
                        description: body.description,
                        category: body.category,
                        pricePerDay: body.price,
                        priceUnit: body.priceUnit,
                        address: body.address ?? null,
                        country: body.country || 'Ukraine',
                        region: body.region ?? null,
                        district: body.district ?? null,
                        city: body.city ?? null,
                        village: body.village ?? null,
                        street: body.street ?? null,
                        houseNumber: body.houseNumber ?? null,
                        postcode: body.postcode ?? null,
                        ...coordinates,
                        ...pickHousing(body, body.listingType),
                        isAvailable: true,
                        views: 0
                    }
                });

                if (imagePaths.length) {
                    await tx.itemImage.createMany({
                        data: imagePaths.map((path, index) => ({
                            itemId: item.id,
                            imagePath: path,
                            sortOrder: index
                        }))
                    });
                }

                return item;
            });

            const complete = await prisma.item.findUnique({
                where: { id: created.id },
                include: listings.LISTING_INCLUDE
            });

            res.status(201).json({
                message: 'Listing created',
                geocoded: coordinates.latitude !== null,
                product: listings.formatListing(complete)
            });
        } catch (error) {
            console.error('Create listing error:', error);
            res.status(500).json({ error: 'Failed to create listing' });
        }
    }
);

/**
 * PUT /api/products/:id
 * Owner-only update. Coordinates are refreshed only when the address moved.
 */
router.put(
    '/:id',
    requireAuth,
    requireVerifiedEmail,
    storage.uploader.array('images', 10),
    validate({ params: schemas.idParam, body: schemas.update }),
    async (req, res) => {
        try {
            const { item, error } = await loadOwnedListing(req.params.id, req.session.userId);
            if (error) return res.status(error.status).json({ error: error.message });

            const body = req.body;
            const addressPatch = pickAddress(body);

            // Re-geocoding is an outbound network call; only pay for it when an
            // address component actually changed.
            const addressChanged = Object.entries(addressPatch).some(
                ([key, value]) => (value ?? null) !== (item[key] ?? null)
            );

            const coordinates = addressChanged
                ? await resolveCoordinates({ ...pickAddress(item), ...addressPatch })
                : {};

            const newImagePaths = await storage.persistFiles(req.files);
            const removeList = body.removeImages ?? [];

            const updated = await prisma.$transaction(async tx => {
                const record = await tx.item.update({
                    where: { id: item.id },
                    data: {
                        ...(body.title !== undefined && { title: body.title }),
                        ...(body.description !== undefined && { description: body.description }),
                        ...(body.category !== undefined && { category: body.category }),
                        ...(body.price !== undefined && { pricePerDay: body.price }),
                        ...(body.priceUnit !== undefined && { priceUnit: body.priceUnit }),
                        ...(body.available !== undefined && { isAvailable: body.available }),
                        ...(body.address !== undefined && { address: body.address ?? null }),
                        ...addressPatch,
                        ...coordinates,
                        ...pickHousing(body, item.listingType)
                    }
                });

                if (removeList.length) {
                    await tx.itemImage.deleteMany({
                        where: { itemId: item.id, imagePath: { in: removeList } }
                    });
                }

                if (newImagePaths.length) {
                    const last = await tx.itemImage.findFirst({
                        where: { itemId: item.id },
                        orderBy: { sortOrder: 'desc' },
                        select: { sortOrder: true }
                    });
                    const startOrder = last ? last.sortOrder + 1 : 0;

                    await tx.itemImage.createMany({
                        data: newImagePaths.map((path, index) => ({
                            itemId: item.id,
                            imagePath: path,
                            sortOrder: startOrder + index
                        }))
                    });
                }

                return record;
            });

            // Blob/disk cleanup happens after the transaction commits, so a
            // rollback can never leave the database pointing at deleted files.
            for (const path of removeList) {
                if (item.images.some(image => image.imagePath === path)) {
                    await storage.deleteFile(path);
                }
            }

            const complete = await prisma.item.findUnique({
                where: { id: updated.id },
                include: listings.LISTING_INCLUDE
            });

            res.json({ message: 'Listing updated', product: listings.formatListing(complete) });
        } catch (error) {
            console.error('Update listing error:', error);
            res.status(500).json({ error: 'Failed to update listing' });
        }
    }
);

/**
 * DELETE /api/products/:id
 */
router.delete('/:id', requireAuth, validate({ params: schemas.idParam }), async (req, res) => {
    try {
        const { item, error } = await loadOwnedListing(req.params.id, req.session.userId);
        if (error) return res.status(error.status).json({ error: error.message });

        await prisma.item.delete({ where: { id: item.id } });

        for (const image of item.images) {
            await storage.deleteFile(image.imagePath);
        }

        res.json({ message: 'Listing deleted' });
    } catch (error) {
        console.error('Delete listing error:', error);
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

// ---------------------------------------------------------------------------
// Availability calendar (owner-managed blocked ranges)
// ---------------------------------------------------------------------------

router.post(
    '/:id/availability',
    requireAuth,
    validate({ params: schemas.idParam, body: schemas.availabilityBlock }),
    async (req, res) => {
        try {
            const { item, error } = await loadOwnedListing(req.params.id, req.session.userId);
            if (error) return res.status(error.status).json({ error: error.message });

            const block = await prisma.itemAvailability.create({
                data: {
                    itemId: item.id,
                    startDate: req.body.startDate,
                    endDate: req.body.endDate,
                    reason: req.body.reason ?? null
                }
            });

            res.status(201).json({
                message: 'Dates blocked',
                block: {
                    id: block.id,
                    start: block.startDate.toISOString().slice(0, 10),
                    end: block.endDate.toISOString().slice(0, 10),
                    reason: block.reason
                }
            });
        } catch (error) {
            console.error('Block dates error:', error);
            res.status(500).json({ error: 'Failed to block dates' });
        }
    }
);

router.delete('/:id/availability/:blockId', requireAuth, validate({ params: schemas.idParam.passthrough() }), async (req, res) => {
    try {
        const { item, error } = await loadOwnedListing(req.params.id, req.session.userId);
        if (error) return res.status(error.status).json({ error: error.message });

        const blockId = Number.parseInt(req.params.blockId, 10);
        if (!Number.isInteger(blockId)) {
            return res.status(400).json({ error: 'Invalid block id' });
        }

        // Scoped by itemId so a valid block id cannot be used to delete a
        // range belonging to someone else's listing.
        const result = await prisma.itemAvailability.deleteMany({
            where: { id: blockId, itemId: item.id }
        });

        if (result.count === 0) return res.status(404).json({ error: 'Block not found' });
        res.json({ message: 'Dates unblocked' });
    } catch (error) {
        console.error('Unblock dates error:', error);
        res.status(500).json({ error: 'Failed to unblock dates' });
    }
});

// Translates multer failures into readable 400s instead of generic 500s.
router.use(storage.handleUploadError);

module.exports = router;

/**
 * ===========================================
 * Arthings - Listing Query Service
 * ===========================================
 *
 * Shared query construction and serialisation for listings. Browse, housing
 * and map endpoints all funnel through here so a filter behaves identically
 * everywhere it appears.
 */

const prisma = require('../db/db');
const { categoryFilter } = require('../config/housing');

const EARTH_RADIUS_KM = 6371;

/** Relations every listing response needs. Kept in one place so no endpoint
 *  accidentally triggers a lazy per-row fetch. */
const LISTING_INCLUDE = {
    user: {
        select: {
            id: true,
            name: true,
            city: true,
            phone: true,
            avatar: true,
            isVerified: true,
            ratingAvg: true,
            ratingCount: true
        }
    },
    images: { orderBy: { sortOrder: 'asc' } }
};

/** Lighter projection for map markers — avoids shipping full descriptions
 *  for hundreds of pins. */
const MAP_SELECT = {
    id: true,
    listingType: true,
    title: true,
    pricePerDay: true,
    priceUnit: true,
    category: true,
    city: true,
    village: true,
    street: true,
    latitude: true,
    longitude: true,
    rooms: true,
    area: true,
    isAvailable: true,
    housingCategory: true,
    rentalPeriod: true,
    user: {
        select: { id: true, name: true, isVerified: true, ratingAvg: true, ratingCount: true }
    },
    images: { orderBy: { sortOrder: 'asc' }, take: 1 }
};

/**
 * Great-circle distance in kilometres.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Bounding box around a point, used to narrow a radius search in SQL before
 * the exact distance test runs.
 */
function boundingBoxFor(lat, lng, radiusKm) {
    const latDelta = radiusKm / 111.32;
    // Longitude degrees shrink with latitude; guard against the poles.
    const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
    const lngDelta = radiusKm / (111.32 * cos);

    return {
        south: lat - latDelta,
        north: lat + latDelta,
        west: lng - lngDelta,
        east: lng + lngDelta
    };
}

/**
 * Builds the Prisma `where` clause from validated filters.
 *
 * @param {object} filters - output of the listings validators
 * @returns {object}
 */
function buildWhere(filters = {}) {
    const where = {};

    if (filters.listingType) where.listingType = filters.listingType;

    if (filters.search) {
        // `insensitive` matters: Postgres `contains` is case-sensitive by
        // default, which previously made "Дриль" unfindable as "дриль".
        where.OR = [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } }
        ];
    }

    if (filters.category) where.category = filters.category;

    // Browsable housing presets expand into concrete field filters.
    if (filters.housingPreset) {
        Object.assign(where, categoryFilter(filters.housingPreset));
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        where.pricePerDay = {};
        if (filters.minPrice !== undefined) where.pricePerDay.gte = filters.minPrice;
        if (filters.maxPrice !== undefined) where.pricePerDay.lte = filters.maxPrice;
    }

    // Location text filters are case-insensitive so "київ" matches "Київ".
    for (const field of ['city', 'village', 'street', 'region']) {
        if (filters[field]) {
            where[field] = { equals: filters[field], mode: 'insensitive' };
        }
    }

    if (filters.available !== undefined) where.isAvailable = filters.available;

    if (filters.minRooms !== undefined || filters.maxRooms !== undefined) {
        where.rooms = {};
        if (filters.minRooms !== undefined) where.rooms.gte = filters.minRooms;
        if (filters.maxRooms !== undefined) where.rooms.lte = filters.maxRooms;
    }

    if (filters.minArea !== undefined || filters.maxArea !== undefined) {
        where.area = {};
        if (filters.minArea !== undefined) where.area.gte = filters.minArea;
        if (filters.maxArea !== undefined) where.area.lte = filters.maxArea;
    }

    if (filters.housingCategory) where.housingCategory = filters.housingCategory;
    if (filters.rentalPeriod) where.rentalPeriod = filters.rentalPeriod;

    const booleanMap = {
        furnished: 'isFurnished',
        petsAllowed: 'petsAllowed',
        smokingAllowed: 'smokingAllowed',
        hasInternet: 'hasInternet',
        hasParking: 'hasParking',
        utilitiesIncluded: 'utilitiesIncluded',
        studentsAllowed: 'studentsAllowed'
    };
    for (const [key, column] of Object.entries(booleanMap)) {
        if (filters[key] !== undefined) where[column] = filters[key];
    }

    if (filters.userId) where.userId = filters.userId;

    // Owner-level filters ride on the relation.
    const ownerFilter = {};
    if (filters.verifiedOwner) ownerFilter.isVerified = true;
    if (filters.minRating !== undefined) ownerFilter.ratingAvg = { gte: filters.minRating };
    if (Object.keys(ownerFilter).length) where.user = ownerFilter;

    // Availability window: exclude anything already committed for those dates.
    if (filters.availableFrom && filters.availableTo) {
        const from = filters.availableFrom;
        const to = filters.availableTo;

        // Two ranges overlap when each starts before the other ends.
        const overlaps = { startDate: { lte: to }, endDate: { gte: from } };

        where.AND = [
            ...(where.AND ?? []),
            { rentals: { none: { ...overlaps, status: { in: ['pending', 'approved'] } } } },
            { availability: { none: overlaps } }
        ];
    }

    return where;
}

/** Maps the sort key to a Prisma orderBy clause. */
function buildOrderBy(sort) {
    switch (sort) {
        case 'price-asc': return { pricePerDay: 'asc' };
        case 'price-desc': return { pricePerDay: 'desc' };
        case 'popular': return { views: 'desc' };
        case 'rating': return { user: { ratingAvg: 'desc' } };
        default: return { createdAt: 'desc' };
    }
}

/**
 * Serialises a listing for the API, preserving the historical field names the
 * existing frontend already consumes.
 */
function formatListing(item) {
    return {
        id: `prod-${item.id}`,
        userId: `user-${item.userId}`,
        listingType: item.listingType,
        title: item.title,
        description: item.description,
        category: item.category,
        price: Number(item.pricePerDay),
        priceUnit: item.priceUnit,

        // Address
        country: item.country,
        region: item.region,
        district: item.district,
        city: item.city,
        village: item.village,
        street: item.street,
        houseNumber: item.houseNumber,
        postcode: item.postcode,
        address: item.address,
        latitude: item.latitude,
        longitude: item.longitude,
        geocodeAccuracy: item.geocodeAccuracy,

        // Housing attributes
        housingType: item.housingType,
        housingCategory: item.housingCategory,
        rentalPeriod: item.rentalPeriod,
        rooms: item.rooms,
        area: item.area === null || item.area === undefined ? null : Number(item.area),
        floor: item.floor,
        totalFloors: item.totalFloors,
        maxGuests: item.maxGuests,
        isFurnished: item.isFurnished,
        petsAllowed: item.petsAllowed,
        smokingAllowed: item.smokingAllowed,
        hasInternet: item.hasInternet,
        hasParking: item.hasParking,
        utilitiesIncluded: item.utilitiesIncluded,
        studentsAllowed: item.studentsAllowed,

        available: item.isAvailable,
        images: item.images?.map(image => image.imagePath) ?? [],
        views: item.views,
        createdAt: item.createdAt,

        // Owner
        ownerName: item.user?.name || 'Unknown',
        ownerCity: item.user?.city || '',
        ownerPhone: item.user?.phone || '',
        ownerAvatar: item.user?.avatar || null,
        ownerVerified: Boolean(item.user?.isVerified),
        ownerRating: Number(item.user?.ratingAvg ?? 0),
        ownerRatingCount: item.user?.ratingCount ?? 0
    };
}

/** Compact marker payload. */
function formatMarker(item, origin) {
    const distanceKm =
        origin && item.latitude !== null && item.longitude !== null
            ? haversineKm(origin.lat, origin.lng, item.latitude, item.longitude)
            : null;

    return {
        id: `prod-${item.id}`,
        listingType: item.listingType,
        title: item.title,
        price: Number(item.pricePerDay),
        priceUnit: item.priceUnit,
        category: item.category,
        housingCategory: item.housingCategory,
        rentalPeriod: item.rentalPeriod,
        rooms: item.rooms,
        area: item.area === null || item.area === undefined ? null : Number(item.area),
        city: item.city,
        village: item.village,
        street: item.street,
        latitude: item.latitude,
        longitude: item.longitude,
        image: item.images?.[0]?.imagePath ?? null,
        available: item.isAvailable,
        ownerName: item.user?.name || 'Unknown',
        ownerVerified: Boolean(item.user?.isVerified),
        ownerRating: Number(item.user?.ratingAvg ?? 0),
        ownerRatingCount: item.user?.ratingCount ?? 0,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10
    };
}

/**
 * Paginated listing search.
 */
async function search(filters) {
    const where = buildWhere(filters);
    const skip = (filters.page - 1) * filters.limit;

    const [items, total] = await Promise.all([
        prisma.item.findMany({
            where,
            orderBy: buildOrderBy(filters.sort),
            include: LISTING_INCLUDE,
            skip,
            take: filters.limit
        }),
        prisma.item.count({ where })
    ]);

    return {
        products: items.map(formatListing),
        total,
        page: filters.page,
        limit: filters.limit,
        pages: Math.max(1, Math.ceil(total / filters.limit))
    };
}

/**
 * Map marker search, by viewport or radius.
 *
 * Radius queries prefilter with a bounding box in SQL, then apply the exact
 * great-circle test in JS. That keeps the query index-friendly without
 * requiring PostGIS.
 */
async function searchMap(filters) {
    const where = buildWhere(filters);

    // Only geocoded listings can be drawn.
    where.latitude = { not: null };
    where.longitude = { not: null };

    let origin = null;

    if (filters.lat !== undefined && filters.lng !== undefined && filters.radiusKm) {
        origin = { lat: filters.lat, lng: filters.lng };
        const box = boundingBoxFor(filters.lat, filters.lng, filters.radiusKm);
        where.latitude = { gte: box.south, lte: box.north };
        where.longitude = { gte: box.west, lte: box.east };
    } else if (filters.north !== undefined) {
        where.latitude = { gte: filters.south, lte: filters.north };
        // Note: does not handle a viewport crossing the antimeridian. Ukraine
        // is nowhere near it, so the extra complexity is not justified.
        where.longitude = { gte: filters.west, lte: filters.east };
        if (filters.lat !== undefined && filters.lng !== undefined) {
            origin = { lat: filters.lat, lng: filters.lng };
        }
    } else if (filters.lat !== undefined && filters.lng !== undefined) {
        origin = { lat: filters.lat, lng: filters.lng };
    }

    const items = await prisma.item.findMany({
        where,
        select: MAP_SELECT,
        take: filters.limit
    });

    let markers = items.map(item => formatMarker(item, origin));

    // Exact radius test, discarding the bounding box's corner overshoot.
    if (origin && filters.radiusKm) {
        markers = markers.filter(
            marker => marker.distanceKm !== null && marker.distanceKm <= filters.radiusKm
        );
    }

    if (origin) {
        markers.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }

    return { markers, total: markers.length };
}

/**
 * Determines whether a listing is free for a date range.
 * Shared by the rental request flow and the availability calendar.
 *
 * @returns {Promise<{available:boolean, conflicts:Array}>}
 */
async function checkAvailability(itemId, startDate, endDate) {
    const overlaps = { startDate: { lte: endDate }, endDate: { gte: startDate } };

    const [rentals, blocks] = await Promise.all([
        prisma.rental.findMany({
            where: { itemId, status: { in: ['pending', 'approved'] }, ...overlaps },
            select: { id: true, startDate: true, endDate: true, status: true }
        }),
        prisma.itemAvailability.findMany({
            where: { itemId, ...overlaps },
            select: { id: true, startDate: true, endDate: true, reason: true }
        })
    ]);

    return {
        available: rentals.length === 0 && blocks.length === 0,
        conflicts: [
            ...rentals.map(r => ({ type: 'rental', ...r })),
            ...blocks.map(b => ({ type: 'blocked', ...b }))
        ]
    };
}

/**
 * All dates unavailable for a listing, for rendering the calendar.
 */
async function busyRanges(itemId, { from, to } = {}) {
    const window = from && to ? { startDate: { lte: to }, endDate: { gte: from } } : {};

    const [rentals, blocks] = await Promise.all([
        prisma.rental.findMany({
            where: { itemId, status: { in: ['pending', 'approved'] }, ...window },
            select: { startDate: true, endDate: true, status: true }
        }),
        prisma.itemAvailability.findMany({
            where: { itemId, ...window },
            select: { startDate: true, endDate: true, reason: true }
        })
    ]);

    const toRange = (range, type) => ({
        start: range.startDate.toISOString().slice(0, 10),
        end: range.endDate.toISOString().slice(0, 10),
        type,
        status: range.status ?? null,
        reason: range.reason ?? null
    });

    return [
        ...rentals.map(r => toRange(r, 'rental')),
        ...blocks.map(b => toRange(b, 'blocked'))
    ];
}

module.exports = {
    LISTING_INCLUDE,
    MAP_SELECT,
    buildWhere,
    buildOrderBy,
    formatListing,
    formatMarker,
    search,
    searchMap,
    checkAvailability,
    busyRanges,
    haversineKm,
    boundingBoxFor
};

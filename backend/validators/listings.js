/**
 * Validation schemas for listings (both items and housing) and map queries.
 */

const { z } = require('zod');
const {
    prefixedId,
    optionalText,
    requiredText,
    optionalNumeric,
    optionalBoolish,
    numeric,
    latitude,
    longitude,
    isoDate,
    pagination
} = require('./common');
const { HOUSING_CATEGORY_VALUES, RENTAL_PERIOD_VALUES } = require('../config/housing');

const listingType = z.enum(['item', 'housing']);

/** Structured address. Only the country is mandatory at the schema level;
 *  how much detail is required depends on listing type (see `refineAddress`). */
const addressFields = {
    country: optionalText(100),
    region: optionalText(120),
    district: optionalText(120),
    city: optionalText(100),
    village: optionalText(120),
    street: optionalText(160),
    houseNumber: optionalText(30),
    postcode: optionalText(20),
    address: optionalText(255)
};

const housingFields = {
    housingCategory: z.enum(HOUSING_CATEGORY_VALUES).optional(),
    rentalPeriod: z.enum(RENTAL_PERIOD_VALUES).optional(),
    housingType: optionalText(30),
    rooms: optionalNumeric({ min: 0, max: 50, int: true }),
    area: optionalNumeric({ min: 0, max: 100000 }),
    floor: optionalNumeric({ min: -5, max: 200, int: true }),
    totalFloors: optionalNumeric({ min: 0, max: 200, int: true }),
    maxGuests: optionalNumeric({ min: 1, max: 100, int: true }),
    isFurnished: optionalBoolish,
    petsAllowed: optionalBoolish,
    smokingAllowed: optionalBoolish,
    hasInternet: optionalBoolish,
    hasParking: optionalBoolish,
    utilitiesIncluded: optionalBoolish,
    studentsAllowed: optionalBoolish
};

/**
 * A listing needs enough address to be placed on the map. Items can be
 * pinned to a settlement; housing is expected to carry a street so renters
 * can judge location.
 */
function refineAddress(schema) {
    return schema.superRefine((value, ctx) => {
        if (!value.city && !value.village) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['city'],
                message: 'Specify a city or village'
            });
        }
        if (value.listingType === 'housing' && !value.street) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['street'],
                message: 'Street is required for housing listings'
            });
        }
    });
}

const create = refineAddress(
    z.object({
        listingType: listingType.default('item'),
        title: requiredText(3, 255, 'Title'),
        description: requiredText(10, 5000, 'Description'),
        category: requiredText(1, 50, 'Category'),
        price: numeric({ min: 0, max: 10_000_000 }),
        priceUnit: z.enum(['hour', 'day', 'week', 'month']).default('day'),
        ...addressFields,
        ...housingFields
    })
);

/** Every field optional on update; the address refinement is skipped so a
 *  partial edit (e.g. price only) does not demand the whole address again. */
const update = z.object({
    title: requiredText(3, 255, 'Title').optional(),
    description: requiredText(10, 5000, 'Description').optional(),
    category: optionalText(50),
    price: optionalNumeric({ min: 0, max: 10_000_000 }),
    priceUnit: z.enum(['hour', 'day', 'week', 'month']).optional(),
    available: optionalBoolish,
    /** Image URLs to remove, allowing photos to be fixed after publishing. */
    removeImages: z
        .union([z.string(), z.array(z.string())])
        .transform(value => (Array.isArray(value) ? value : [value]))
        .optional(),
    ...addressFields,
    ...housingFields
});

/** Shared filter surface for list and map queries. */
const filterFields = {
    listingType: listingType.optional(),
    search: optionalText(160),
    category: optionalText(50),
    housingPreset: optionalText(40),
    minPrice: optionalNumeric({ min: 0 }),
    maxPrice: optionalNumeric({ min: 0 }),
    city: optionalText(100),
    village: optionalText(120),
    street: optionalText(160),
    region: optionalText(120),
    available: optionalBoolish,
    minRooms: optionalNumeric({ min: 0, int: true }),
    maxRooms: optionalNumeric({ min: 0, int: true }),
    minArea: optionalNumeric({ min: 0 }),
    maxArea: optionalNumeric({ min: 0 }),
    housingCategory: z.enum(HOUSING_CATEGORY_VALUES).optional(),
    rentalPeriod: z.enum(RENTAL_PERIOD_VALUES).optional(),
    furnished: optionalBoolish,
    petsAllowed: optionalBoolish,
    smokingAllowed: optionalBoolish,
    hasInternet: optionalBoolish,
    hasParking: optionalBoolish,
    utilitiesIncluded: optionalBoolish,
    studentsAllowed: optionalBoolish,
    /** Minimum owner rating. */
    minRating: optionalNumeric({ min: 0, max: 5 }),
    /** Restrict to owners with a verified badge. */
    verifiedOwner: optionalBoolish,
    /** Availability window — excludes listings already booked in this range. */
    availableFrom: isoDate.optional(),
    availableTo: isoDate.optional(),
    userId: prefixedId('user').optional()
};

const list = z.object({
    ...filterFields,
    sort: z.enum(['newest', 'price-asc', 'price-desc', 'popular', 'rating']).default('newest'),
    ...pagination
});

/**
 * Map query. Either a viewport (bounding box) or a radius around a point.
 */
const mapQuery = z
    .object({
        ...filterFields,
        // Visible map area.
        north: optionalNumeric({ min: -90, max: 90 }),
        south: optionalNumeric({ min: -90, max: 90 }),
        east: optionalNumeric({ min: -180, max: 180 }),
        west: optionalNumeric({ min: -180, max: 180 }),
        // "Listings near me".
        lat: optionalNumeric({ min: -90, max: 90 }),
        lng: optionalNumeric({ min: -180, max: 180 }),
        radiusKm: optionalNumeric({ min: 0.1, max: 500 }),
        limit: z.coerce.number().int().min(1).max(2000).default(500)
    })
    .superRefine((value, ctx) => {
        const hasBounds = [value.north, value.south, value.east, value.west].every(v => v !== undefined);
        const partialBounds = [value.north, value.south, value.east, value.west].some(v => v !== undefined);
        if (partialBounds && !hasBounds) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['bounds'],
                message: 'Provide all four bounds (north, south, east, west)'
            });
        }
        if ((value.lat === undefined) !== (value.lng === undefined)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['lat'],
                message: 'Provide both lat and lng'
            });
        }
        if (hasBounds && value.north <= value.south) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['north'],
                message: 'north must be greater than south'
            });
        }
    });

const idParam = z.object({ id: prefixedId('prod') });

const availabilityBlock = z
    .object({
        startDate: isoDate,
        endDate: isoDate,
        reason: optionalText(255)
    })
    .refine(value => value.endDate >= value.startDate, {
        path: ['endDate'],
        message: 'End date must be on or after the start date'
    });

module.exports = {
    create,
    update,
    list,
    mapQuery,
    idParam,
    availabilityBlock,
    latitude,
    longitude
};

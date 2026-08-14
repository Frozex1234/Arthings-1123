/**
 * ===========================================
 * Arthings - Shared Validation Primitives
 * ===========================================
 *
 * The API exposes prefixed ids (`prod-12`, `user-3`, `rental-8`) while the
 * database uses plain integers. These helpers centralise that translation,
 * which was previously re-implemented inline in every route.
 */

const { z } = require('zod');

/**
 * Accepts `prefix-123` or a bare `123` and yields the numeric id.
 * @param {string} prefix
 */
function prefixedId(prefix) {
    return z
        .union([z.string(), z.number()])
        .transform(value => {
            const raw = String(value).trim();
            const digits = raw.startsWith(`${prefix}-`) ? raw.slice(prefix.length + 1) : raw;
            return Number.parseInt(digits, 10);
        })
        .refine(value => Number.isInteger(value) && value > 0, {
            message: 'Invalid identifier'
        });
}

/** Query-string booleans arrive as the strings "true"/"false". */
const boolish = z
    .union([z.boolean(), z.string()])
    .transform(value => {
        if (typeof value === 'boolean') return value;
        return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    });

/** Optional boolean that stays `undefined` when the field was omitted. */
const optionalBoolish = z.preprocess(
    value => (value === '' || value === undefined || value === null ? undefined : value),
    boolish.optional()
);

/** Trims, and converts empty strings to `undefined` rather than storing "". */
function optionalText(max) {
    return z.preprocess(
        value => {
            if (typeof value !== 'string') return value ?? undefined;
            const trimmed = value.trim();
            return trimmed === '' ? undefined : trimmed;
        },
        z.string().max(max, `Must be ${max} characters or fewer`).optional()
    );
}

function requiredText(min, max, label = 'Value') {
    return z
        .string({ required_error: `${label} is required` })
        .transform(value => value.trim())
        .refine(value => value.length >= min, { message: `${label} must be at least ${min} characters` })
        .refine(value => value.length <= max, { message: `${label} must be ${max} characters or fewer` });
}

/** Numeric query params arrive as strings. */
function numeric({ min, max, int = false } = {}) {
    let schema = z.coerce.number({ invalid_type_error: 'Must be a number' });
    if (int) schema = schema.int('Must be a whole number');
    if (min !== undefined) schema = schema.min(min, `Must be at least ${min}`);
    if (max !== undefined) schema = schema.max(max, `Must be at most ${max}`);
    return schema;
}

function optionalNumeric(options = {}) {
    return z.preprocess(
        value => (value === '' || value === undefined || value === null ? undefined : value),
        numeric(options).optional()
    );
}

const latitude = numeric({ min: -90, max: 90 });
const longitude = numeric({ min: -180, max: 180 });

/** Calendar date in `YYYY-MM-DD`, normalised to UTC midnight. */
const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .transform(value => new Date(`${value}T00:00:00.000Z`))
    .refine(value => !Number.isNaN(value.getTime()), { message: 'Invalid date' });

const email = z
    .string({ required_error: 'Email is required' })
    .transform(value => value.trim().toLowerCase())
    .pipe(z.string().email('Enter a valid email address').max(255));

/**
 * Password policy. Length is the dominant factor in resisting offline
 * cracking, so the floor is raised from the previous 6 characters.
 */
const password = z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password must be 200 characters or fewer');

const pagination = {
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24)
};

module.exports = {
    prefixedId,
    boolish,
    optionalBoolish,
    optionalText,
    requiredText,
    numeric,
    optionalNumeric,
    latitude,
    longitude,
    isoDate,
    email,
    password,
    pagination
};

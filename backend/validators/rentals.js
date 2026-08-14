/**
 * Validation schemas for the rental request lifecycle.
 */

const { z } = require('zod');
const { prefixedId, isoDate, optionalText } = require('./common');

/** Public status vocabulary. `accepted`/`rejected` are the user-facing names
 *  for the stored `approved`/`declined` enum values. */
const PUBLIC_STATUSES = ['pending', 'accepted', 'rejected', 'cancelled', 'completed'];

const create = z
    .object({
        productId: prefixedId('prod'),
        startDate: isoDate,
        endDate: isoDate,
        message: optionalText(1000)
    })
    .superRefine((value, ctx) => {
        if (value.endDate < value.startDate) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endDate'],
                message: 'End date must be on or after the start date'
            });
        }

        // Compare against today at UTC midnight, matching how isoDate parses.
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (value.startDate < today) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['startDate'],
                message: 'Start date cannot be in the past'
            });
        }

        const days = (value.endDate - value.startDate) / (1000 * 60 * 60 * 24) + 1;
        if (days > 365) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['endDate'],
                message: 'A single booking cannot exceed 365 days'
            });
        }
    });

const respond = z.object({
    response: optionalText(1000)
});

const listQuery = z.object({
    role: z.enum(['renter', 'owner']).default('renter'),
    status: z.enum(PUBLIC_STATUSES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

const idParam = z.object({ id: prefixedId('rental') });

module.exports = { create, respond, listQuery, idParam, PUBLIC_STATUSES };

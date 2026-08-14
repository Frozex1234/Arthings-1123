/**
 * ===========================================
 * Arthings - Request Validation
 * ===========================================
 *
 * Thin zod adapter. Parsing happens at the edge so route handlers can trust
 * their inputs, and the *parsed* result replaces the raw input — unknown keys
 * are stripped, which stops clients smuggling extra fields into writes.
 */

const { ZodError } = require('zod');

/** Flattens a ZodError into `{ field: message }` for the frontend. */
function formatIssues(error) {
    const fields = {};
    for (const issue of error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
    }
    return fields;
}

/**
 * @param {object} schemas - any of `{ body, query, params }` zod schemas.
 */
function validate(schemas) {
    return (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body ?? {});
            }
            if (schemas.query) {
                // req.query is a getter on newer Express versions; assigning to
                // a own-property keeps the parsed value without tripping it.
                Object.defineProperty(req, 'query', {
                    value: schemas.query.parse(req.query ?? {}),
                    writable: true,
                    configurable: true
                });
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params ?? {});
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation failed',
                    code: 'VALIDATION_ERROR',
                    fields: formatIssues(error)
                });
            }
            next(error);
        }
    };
}

module.exports = { validate, formatIssues };

/**
 * ===========================================
 * Arthings - Security Middleware
 * ===========================================
 *
 * Content security headers and rate limiting.
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * Helmet with a CSP tuned to the assets this app actually loads.
 *
 * The frontend pulls Leaflet and Google Fonts from CDNs and uses inline
 * <style>/<script> blocks throughout the existing pages, so those origins are
 * allow-listed explicitly rather than disabling CSP wholesale.
 */
const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            // Map tiles come from the OSM tile servers; uploads may be served
            // from a blob host in production.
            imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com', 'https:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    // Tile images are cross-origin; the default policy would block them.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
});

function minutes(n) {
    return n * 60 * 1000;
}

/**
 * Rate limiters.
 *
 * Keyed by IP. Behind Vercel/ngrok this depends on `trust proxy` being set
 * correctly, otherwise every request appears to come from the proxy.
 */
const limiters = {
    /** Login, register, password reset — the brute-force surface. */
    auth: rateLimit({
        windowMs: minutes(config.security.rateLimit.authWindowMinutes),
        max: config.security.rateLimit.authMax,
        standardHeaders: true,
        legacyHeaders: false,
        // Only failed attempts count, so a legitimate user is never locked out
        // by their own successful logins.
        skipSuccessfulRequests: true,
        message: { error: 'Too many attempts. Please try again later.' }
    }),

    /** Broad ceiling for the whole API. */
    api: rateLimit({
        windowMs: minutes(config.security.rateLimit.apiWindowMinutes),
        max: config.security.rateLimit.apiMax,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests. Please slow down.' }
    }),

    /** Content creation — listings, messages, rental requests. */
    write: rateLimit({
        windowMs: minutes(config.security.rateLimit.writeWindowMinutes),
        max: config.security.rateLimit.writeMax,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'You are creating content too quickly. Please wait a moment.' }
    }),

    /**
     * Outbound-email endpoints. Deliberately strict: every request here sends
     * a real email, so abuse costs money and reputation.
     */
    email: rateLimit({
        windowMs: minutes(60),
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many email requests. Please try again in an hour.' }
    }),

    /** Geocoding proxy — protects our shared Nominatim quota. */
    geocode: rateLimit({
        windowMs: minutes(1),
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many search requests. Please slow down.' }
    })
};

module.exports = { securityHeaders, limiters };

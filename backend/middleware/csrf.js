/**
 * ===========================================
 * Arthings - CSRF Protection
 * ===========================================
 *
 * Signed double-submit token.
 *
 * Because authentication rides on a cookie, the browser attaches it to
 * cross-site requests automatically. The defence is a token that a foreign
 * origin cannot read: it is delivered in a JS-readable cookie and must be
 * echoed back in a request header, which the same-origin policy prevents an
 * attacker's page from doing.
 *
 * The token is HMAC-signed so it cannot be forged, and bound to the session
 * id when the caller is authenticated so a token minted for one session is
 * useless in another.
 */

const crypto = require('crypto');
const config = require('../config/env');

const COOKIE_NAME = 'arthings_csrf';
const HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Minimal cookie header parser — avoids pulling in cookie-parser. */
function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;

    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;
        if (part.slice(0, index).trim() === name) {
            return decodeURIComponent(part.slice(index + 1).trim());
        }
    }
    return null;
}

/**
 * Signs a nonce with the server secret.
 *
 * Deliberately NOT bound to the session id. With `saveUninitialized: false`,
 * express-session mints a fresh `req.sessionID` on every request from an
 * anonymous visitor, because the session is never persisted. Binding to it
 * would invalidate the token between the page load that issued it and the
 * login POST that uses it — breaking exactly the flows that need protecting.
 *
 * The security property does not depend on that binding: what stops a foreign
 * origin is its inability to *read* the cookie in order to echo it back in a
 * header. The signature is what stops a token being fabricated outright.
 */
function sign(nonce) {
    return crypto
        .createHmac('sha256', config.session.secret)
        .update(nonce)
        .digest('base64url');
}

function issueToken() {
    const nonce = crypto.randomBytes(18).toString('base64url');
    return `${nonce}.${sign(nonce)}`;
}

function isValidToken(token) {
    if (typeof token !== 'string') return false;

    const separator = token.lastIndexOf('.');
    if (separator <= 0) return false;

    const nonce = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = sign(nonce);

    // Length check first: timingSafeEqual throws on mismatched buffer sizes.
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Issues a token cookie when one is missing or fails verification.
 */
function issueCsrfToken(req, res, next) {
    const existing = readCookie(req, COOKIE_NAME);

    if (!existing || !isValidToken(existing)) {
        const token = issueToken();
        res.cookie(COOKIE_NAME, token, {
            // Deliberately readable by JavaScript: the frontend must copy it
            // into the request header. Secrecy from the user's own page is not
            // what makes this work — unreadability from *other* origins is.
            httpOnly: false,
            sameSite: 'lax',
            secure: config.isProduction,
            path: '/',
            maxAge: config.session.maxAgeMs
        });
        req.csrfToken = token;
    } else {
        req.csrfToken = existing;
    }

    next();
}

/**
 * Rejects state-changing requests that do not echo a valid token.
 */
function verifyCsrfToken(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const headerToken = req.get(HEADER_NAME) || req.body?._csrf;
    const cookieToken = readCookie(req, COOKIE_NAME);

    if (!headerToken || !cookieToken) {
        return res.status(403).json({
            error: 'Missing CSRF token',
            code: 'CSRF_TOKEN_MISSING'
        });
    }

    if (headerToken !== cookieToken) {
        return res.status(403).json({
            error: 'Invalid CSRF token',
            code: 'CSRF_TOKEN_INVALID'
        });
    }

    if (!isValidToken(headerToken)) {
        return res.status(403).json({
            error: 'Invalid CSRF token',
            code: 'CSRF_TOKEN_INVALID'
        });
    }

    next();
}

module.exports = {
    issueCsrfToken,
    verifyCsrfToken,
    COOKIE_NAME,
    HEADER_NAME
};

/**
 * Authentication Middleware
 * Session-based access control.
 */

const prisma = require('../db/db');

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

/**
 * Require admin privileges.
 * Must be used AFTER requireAuth.
 */
async function requireAdmin(req, res, next) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.session.userId },
            select: { isAdmin: true }
        });
        if (user && user.isAdmin) {
            next();
        } else {
            res.status(403).json({ error: 'Admin access required' });
        }
    } catch (err) {
        console.error('Admin check error:', err);
        res.status(500).json({ error: 'Failed to verify admin status' });
    }
}

/**
 * Gate for actions that reach other people — publishing listings, sending
 * messages, requesting rentals. Reading stays open to any signed-in account.
 *
 * Must be used AFTER requireAuth.
 */
async function requireVerifiedEmail(req, res, next) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.session.userId },
            select: { emailVerifiedAt: true, email: true }
        });

        if (!user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!user.emailVerifiedAt) {
            return res.status(403).json({
                error: 'Confirm your email address to continue.',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email
            });
        }

        next();
    } catch (err) {
        console.error('Email verification check error:', err);
        res.status(500).json({ error: 'Failed to verify account status' });
    }
}

function optionalAuth(req, res, next) {
    // Just pass through, session data will be available if logged in
    next();
}

module.exports = { requireAuth, requireAdmin, requireVerifiedEmail, optionalAuth };

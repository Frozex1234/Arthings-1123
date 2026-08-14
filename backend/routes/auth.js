/**
 * ===========================================
 * Arthings - Authentication Routes
 * ===========================================
 *
 * Registration, email confirmation, login, password reset and profile
 * management.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db/db');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const { requireAuth } = require('../middleware/auth');
const verification = require('../services/verification');
const schemas = require('../validators/auth');

const router = express.Router();

/** Public shape of a user. Never includes the password hash. */
function formatUser(user) {
    return {
        id: `user-${user.id}`,
        email: user.email,
        name: user.name,
        phone: user.phone,
        city: user.city,
        avatar: user.avatar,
        isVerified: user.isVerified,
        isEmailVerified: Boolean(user.emailVerifiedAt),
        isAdmin: user.isAdmin,
        rating: Number(user.ratingAvg ?? 0),
        ratingCount: user.ratingCount ?? 0,
        createdAt: user.createdAt
    };
}

/**
 * Establishes a logged-in session.
 *
 * The session id is regenerated first: without this, a session token an
 * attacker planted before login would stay valid afterwards (session
 * fixation).
 */
function startSession(req, user) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) return reject(error);
            req.session.userId = user.id;
            req.session.userEmail = user.email;
            req.session.save(saveError => (saveError ? reject(saveError) : resolve()));
        });
    });
}

// ---------------------------------------------------------------------------
// Registration & email confirmation
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/register
 * Creates an inactive account and emails a confirmation code.
 */
router.post('/register', limiters.auth, validate({ body: schemas.register }), async (req, res) => {
    try {
        const { email, password, name, phone, city, consents } = req.body;

        const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true, emailVerifiedAt: true }
        });

        if (existing) {
            // An unconfirmed account is not proof the address belongs to
            // whoever registered it, so let the real owner restart the flow.
            if (!existing.emailVerifiedAt) {
                const user = await prisma.user.findUnique({ where: { id: existing.id } });
                await verification.issueEmailVerification(user);
                return res.status(200).json({
                    message: 'This email is already awaiting confirmation. A new code has been sent.',
                    requiresVerification: true,
                    email
                });
            }
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.$transaction(async tx => {
            const created = await tx.user.create({
                data: {
                    email,
                    passwordHash,
                    name: name || email.split('@')[0],
                    phone: phone || null,
                    city: city || null,
                    avatar: null,
                    isVerified: false
                }
            });

            if (consents?.length) {
                await tx.legalConsent.createMany({
                    data: consents.map(item => ({
                        userId: created.id,
                        documentType: item.type,
                        documentVersion: item.version,
                        ipAddress: req.ip || null,
                        userAgent: req.get('User-Agent')?.slice(0, 500) || null
                    }))
                });
            }

            return created;
        });

        await verification.issueEmailVerification(user);

        res.status(201).json({
            message: 'Registration successful. Check your email for the confirmation code.',
            requiresVerification: true,
            email: user.email,
            user: formatUser(user)
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/verify-email
 * Confirms the code and signs the user in.
 */
router.post('/verify-email', limiters.auth, validate({ body: schemas.verifyEmail }), async (req, res) => {
    try {
        const { email, code } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid code', code: 'INVALID_CODE' });
        }

        if (user.emailVerifiedAt) {
            return res.json({ message: 'Email already confirmed', alreadyVerified: true });
        }

        const result = await verification.confirmEmail(user.id, code);

        if (!result.ok) {
            const responses = {
                NO_PENDING_CODE: { status: 400, error: 'No active code. Request a new one.' },
                EXPIRED: { status: 400, error: 'This code has expired. Request a new one.' },
                TOO_MANY_ATTEMPTS: { status: 429, error: 'Too many incorrect attempts. Request a new code.' },
                INVALID_CODE: {
                    status: 400,
                    error: result.attemptsLeft > 0
                        ? `Incorrect code. ${result.attemptsLeft} attempt(s) left.`
                        : 'Incorrect code.'
                }
            };
            const response = responses[result.reason] || { status: 400, error: 'Verification failed' };
            return res.status(response.status).json({ error: response.error, code: result.reason });
        }

        const confirmed = await prisma.user.findUnique({ where: { id: user.id } });
        await startSession(req, confirmed);

        res.json({ message: 'Email confirmed', user: formatUser(confirmed) });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * POST /api/auth/resend-verification
 */
router.post('/resend-verification', limiters.email, validate({ body: schemas.resend }), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: req.body.email } });

        // Always report success: a differing response would reveal which
        // addresses are registered.
        if (!user || user.emailVerifiedAt) {
            return res.json({ message: 'If the account exists, a new code has been sent.' });
        }

        const result = await verification.issueEmailVerification(user);
        if (!result.sent) {
            return res.status(429).json({
                error: `Please wait ${result.retryAfter}s before requesting another code.`,
                retryAfter: result.retryAfter
            });
        }

        res.json({ message: 'If the account exists, a new code has been sent.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Could not resend the code' });
    }
});

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

router.post('/login', limiters.auth, validate({ body: schemas.login }), async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        // Compare against a dummy hash when the user is absent so response
        // timing does not reveal whether the address is registered.
        const hash = user
            ? user.passwordHash
            : '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
        const matches = await bcrypt.compare(password, hash);

        if (!user || !matches) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.emailVerifiedAt) {
            return res.status(403).json({
                error: 'Confirm your email address before signing in.',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email
            });
        }

        await startSession(req, user);
        res.json({ message: 'Login successful', user: formatUser(user) });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(error => {
        if (error) return res.status(500).json({ error: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

router.post('/forgot-password', limiters.email, validate({ body: schemas.forgotPassword }), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { email: req.body.email } });
        if (user) await verification.issuePasswordReset(user);

        // Constant response regardless of whether the account exists.
        res.json({ message: 'If an account exists for that address, a reset link has been sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Could not start password reset' });
    }
});

/** Lets the reset page decide whether to render a form or an error. */
router.get('/reset-password/validate', async (req, res) => {
    const result = await verification.inspectPasswordReset(req.query.token);
    res.json({ valid: result.ok });
});

router.post('/reset-password', limiters.auth, validate({ body: schemas.resetPassword }), async (req, res) => {
    try {
        const result = await verification.consumePasswordReset(req.body.token, req.body.password);
        if (!result.ok) {
            return res.status(400).json({
                error: 'This reset link is invalid or has expired.',
                code: 'INVALID_TOKEN'
            });
        }
        res.json({ message: 'Password updated. You can now sign in.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Could not reset password' });
    }
});

router.post('/change-password', requireAuth, validate({ body: schemas.changePassword }), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
        const matches = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
        if (!matches) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: await bcrypt.hash(req.body.newPassword, 10) }
        });

        res.json({ message: 'Password updated' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Could not change password' });
    }
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

router.get('/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
        if (!user) {
            // Session outlived the account.
            return req.session.destroy(() => res.status(401).json({ error: 'Not authenticated' }));
        }
        res.json({ user: formatUser(user) });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

router.put('/profile', requireAuth, validate({ body: schemas.updateProfile }), async (req, res) => {
    try {
        const { name, phone, city } = req.body;

        const user = await prisma.user.update({
            where: { id: req.session.userId },
            data: {
                ...(name !== undefined && { name }),
                ...(phone !== undefined && { phone: phone || null }),
                ...(city !== undefined && { city: city || null })
            }
        });

        res.json({ message: 'Profile updated', user: formatUser(user) });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Profile update failed' });
    }
});

/**
 * DELETE /api/auth/account
 * Requires the current password — a stolen session alone must not be enough
 * to destroy an account and every listing attached to it.
 */
router.delete('/account', requireAuth, async (req, res) => {
    try {
        const password = req.body?.password;
        if (!password) {
            return res.status(400).json({ error: 'Password confirmation is required' });
        }

        const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
        const matches = await bcrypt.compare(String(password), user.passwordHash);
        if (!matches) {
            return res.status(403).json({ error: 'Password is incorrect' });
        }

        await prisma.user.delete({ where: { id: user.id } });
        req.session.destroy(() => {});
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router;
// Shared with other routes that need to serialise a user consistently.
module.exports.formatUser = formatUser;

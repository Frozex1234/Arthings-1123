/**
 * ===========================================
 * Arthings - Verification Tokens
 * ===========================================
 *
 * Issues and consumes the secrets behind email confirmation and password
 * reset.
 *
 * Two hashing strategies, chosen by entropy:
 *
 *   • The 6-digit email code has ~10^6 possibilities. If the token table ever
 *     leaked, a fast hash would be exhausted instantly — so it uses bcrypt,
 *     and online guessing is separately capped by an attempt counter.
 *
 *   • The password-reset token is 32 random bytes. Brute force is already
 *     infeasible, so SHA-256 is sufficient and avoids bcrypt's 72-byte input
 *     limit and per-verification cost.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../db/db');
const config = require('../config/env');
const mail = require('./mail');

const { verification: settings } = config;

/** Cryptographically uniform numeric code, free of modulo bias. */
function generateNumericCode(length) {
    let code = '';
    while (code.length < length) {
        // rejection-sample bytes so each digit is uniformly distributed
        const byte = crypto.randomBytes(1)[0];
        if (byte >= 250) continue; // 250 = 25 * 10, largest multiple of 10
        code += String(byte % 10);
    }
    return code;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function minutesFromNow(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Invalidates any outstanding tokens of a purpose.
 * Issuing a new code must retire the old one, otherwise every code ever sent
 * stays valid until its own expiry.
 */
async function revokeOutstanding(userId, purpose, tx = prisma) {
    await tx.verificationToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() }
    });
}

/**
 * Enforces the resend cooldown.
 * @returns {Promise<number>} seconds remaining, or 0 when sending is allowed.
 */
async function cooldownRemaining(userId, purpose) {
    const latest = await prisma.verificationToken.findFirst({
        where: { userId, purpose },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
    });
    if (!latest) return 0;

    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
    const remaining = Math.ceil(settings.resendCooldownSeconds - elapsed);
    return remaining > 0 ? remaining : 0;
}

/**
 * Creates and emails an email-confirmation code.
 *
 * @param {{id:number,email:string,name:string}} user
 * @returns {Promise<{sent:boolean, retryAfter?:number}>}
 */
async function issueEmailVerification(user) {
    const retryAfter = await cooldownRemaining(user.id, 'email_verification');
    if (retryAfter > 0) return { sent: false, retryAfter };

    const code = generateNumericCode(settings.codeLength);

    // Hashed before the transaction opens: bcrypt is deliberately slow, and
    // doing it inside would pin a database connection for the duration.
    const tokenHash = await bcrypt.hash(code, 10);

    await prisma.$transaction(async tx => {
        await revokeOutstanding(user.id, 'email_verification', tx);
        await tx.verificationToken.create({
            data: {
                userId: user.id,
                purpose: 'email_verification',
                tokenHash,
                expiresAt: minutesFromNow(settings.ttlMinutes)
            }
        });
    });

    const template = mail.templates.verifyEmail({
        name: user.name,
        code,
        ttlMinutes: settings.ttlMinutes
    });
    await mail.send({ to: user.email, ...template });

    return { sent: true };
}

/**
 * Checks a submitted code and, on success, marks the account confirmed.
 *
 * @returns {Promise<{ok:boolean, reason?:string, attemptsLeft?:number}>}
 */
async function confirmEmail(userId, submittedCode) {
    const token = await prisma.verificationToken.findFirst({
        where: { userId, purpose: 'email_verification', consumedAt: null },
        orderBy: { createdAt: 'desc' }
    });

    if (!token) return { ok: false, reason: 'NO_PENDING_CODE' };

    if (token.expiresAt.getTime() < Date.now()) {
        return { ok: false, reason: 'EXPIRED' };
    }

    if (token.attempts >= settings.maxAttempts) {
        // Burn the token rather than letting it sit at the limit forever.
        await prisma.verificationToken.update({
            where: { id: token.id },
            data: { consumedAt: new Date() }
        });
        return { ok: false, reason: 'TOO_MANY_ATTEMPTS' };
    }

    const matches = await bcrypt.compare(String(submittedCode), token.tokenHash);

    if (!matches) {
        const updated = await prisma.verificationToken.update({
            where: { id: token.id },
            data: { attempts: { increment: 1 } },
            select: { attempts: true }
        });
        return {
            ok: false,
            reason: 'INVALID_CODE',
            attemptsLeft: Math.max(0, settings.maxAttempts - updated.attempts)
        };
    }

    await prisma.$transaction([
        prisma.verificationToken.update({
            where: { id: token.id },
            data: { consumedAt: new Date() }
        }),
        prisma.user.update({
            where: { id: userId },
            data: { emailVerifiedAt: new Date() }
        })
    ]);

    return { ok: true };
}

/**
 * Creates and emails a password-reset link.
 *
 * The token is `<id>.<secret>`: the id locates the row without an indexed
 * lookup on the secret itself, and only the secret's hash is stored.
 */
async function issuePasswordReset(user) {
    const retryAfter = await cooldownRemaining(user.id, 'password_reset');
    if (retryAfter > 0) return { sent: false, retryAfter };

    const secret = crypto.randomBytes(32).toString('base64url');

    const token = await prisma.$transaction(async tx => {
        await revokeOutstanding(user.id, 'password_reset', tx);
        return tx.verificationToken.create({
            data: {
                userId: user.id,
                purpose: 'password_reset',
                tokenHash: sha256(secret),
                expiresAt: minutesFromNow(settings.resetTtlMinutes)
            },
            select: { id: true }
        });
    });

    const url = `${config.appUrl}/pages/reset-password.html?token=${token.id}.${secret}`;
    const template = mail.templates.passwordReset({
        name: user.name,
        url,
        ttlMinutes: settings.resetTtlMinutes
    });
    await mail.send({ to: user.email, ...template });

    return { sent: true };
}

/**
 * Validates a reset token without consuming it — used to decide whether the
 * reset form should render at all.
 *
 * @returns {Promise<{ok:boolean, userId?:number, tokenId?:number}>}
 */
async function inspectPasswordReset(rawToken) {
    const separator = String(rawToken || '').indexOf('.');
    if (separator <= 0) return { ok: false };

    const tokenId = Number.parseInt(rawToken.slice(0, separator), 10);
    const secret = rawToken.slice(separator + 1);
    if (!Number.isInteger(tokenId) || !secret) return { ok: false };

    const token = await prisma.verificationToken.findUnique({ where: { id: tokenId } });

    if (
        !token ||
        token.purpose !== 'password_reset' ||
        token.consumedAt ||
        token.expiresAt.getTime() < Date.now()
    ) {
        return { ok: false };
    }

    const expected = Buffer.from(token.tokenHash);
    const actual = Buffer.from(sha256(secret));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        return { ok: false };
    }

    return { ok: true, userId: token.userId, tokenId: token.id };
}

/**
 * Consumes a reset token and sets the new password in one transaction, so a
 * token can never be spent twice.
 */
async function consumePasswordReset(rawToken, newPassword) {
    const inspected = await inspectPasswordReset(rawToken);
    if (!inspected.ok) return { ok: false };

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
        prisma.verificationToken.update({
            where: { id: inspected.tokenId },
            data: { consumedAt: new Date() }
        }),
        prisma.user.update({
            where: { id: inspected.userId },
            data: {
                passwordHash,
                // Completing a reset proves control of the mailbox.
                emailVerifiedAt: new Date()
            }
        }),
        // Any other outstanding reset tokens are now stale.
        prisma.verificationToken.updateMany({
            where: { userId: inspected.userId, purpose: 'password_reset', consumedAt: null },
            data: { consumedAt: new Date() }
        })
    ]);

    return { ok: true, userId: inspected.userId };
}

module.exports = {
    issueEmailVerification,
    confirmEmail,
    issuePasswordReset,
    inspectPasswordReset,
    consumePasswordReset,
    cooldownRemaining
};

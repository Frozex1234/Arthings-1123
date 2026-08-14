/**
 * ===========================================
 * Arthings - Environment Configuration
 * ===========================================
 *
 * Single source of truth for environment variables.
 * Validates at boot so misconfiguration fails fast and loudly
 * instead of silently degrading at runtime.
 */

const isProduction = process.env.NODE_ENV === 'production';

/** Collected during load, reported together so one boot shows every problem. */
const problems = [];

function required(name, { allowInDev } = {}) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();

    if (isProduction) {
        problems.push(`${name} is required in production`);
        return null;
    }
    if (allowInDev === undefined) {
        problems.push(`${name} is required`);
        return null;
    }
    return allowInDev;
}

function optional(name, fallback = null) {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : fallback;
}

function integer(name, fallback) {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(name, fallback = false) {
    const raw = optional(name);
    if (raw === null) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const config = {
    isProduction,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: integer('PORT', 3000),

    /** Public origin, used to build links inside outgoing emails. */
    appUrl: optional('APP_URL', `http://localhost:${integer('PORT', 3000)}`).replace(/\/$/, ''),
    appName: optional('APP_NAME', 'Arthings'),

    database: {
        url: required('DATABASE_URL')
    },

    session: {
        // No hardcoded fallback: a guessable secret lets anyone forge an admin
        // session. Dev gets a random per-boot value (logs everyone out on
        // restart, which is the correct nudge to set the variable properly).
        secret: required('SESSION_SECRET', {
            allowInDev: require('crypto').randomBytes(32).toString('hex')
        }),
        maxAgeMs: integer('SESSION_MAX_AGE_HOURS', 24 * 7) * 60 * 60 * 1000,
        tableName: optional('SESSION_TABLE', 'user_sessions')
    },

    mail: {
        // When SMTP is not configured, the mailer falls back to a console
        // transport so local development never blocks on credentials.
        host: optional('SMTP_HOST'),
        port: integer('SMTP_PORT', 587),
        secure: boolean('SMTP_SECURE', false),
        user: optional('SMTP_USER'),
        password: optional('SMTP_PASSWORD'),
        from: optional('MAIL_FROM', 'Arthings <no-reply@arthings.local>'),
        get isConfigured() {
            return Boolean(this.host && this.user && this.password);
        }
    },

    verification: {
        codeLength: integer('VERIFICATION_CODE_LENGTH', 6),
        ttlMinutes: integer('VERIFICATION_TTL_MINUTES', 15),
        maxAttempts: integer('VERIFICATION_MAX_ATTEMPTS', 5),
        resendCooldownSeconds: integer('VERIFICATION_RESEND_COOLDOWN', 60),
        /** Password reset links live longer than login codes but still expire. */
        resetTtlMinutes: integer('PASSWORD_RESET_TTL_MINUTES', 60)
    },

    geocoding: {
        endpoint: optional('NOMINATIM_URL', 'https://nominatim.openstreetmap.org'),
        // Nominatim's usage policy requires a genuine identifying User-Agent
        // with contact details. Requests without one get blocked.
        userAgent: optional(
            'NOMINATIM_USER_AGENT',
            'Arthings/1.0 (rental marketplace; contact: admin@arthings.local)'
        ),
        // Policy also caps absolute maximum at 1 request/second.
        minIntervalMs: integer('NOMINATIM_MIN_INTERVAL_MS', 1100),
        cacheTtlDays: integer('GEOCODE_CACHE_TTL_DAYS', 180),
        countryCodes: optional('GEOCODE_COUNTRY_CODES', 'ua')
    },

    storage: {
        // 'local' writes to ./uploads (fine for a VM, useless on Vercel).
        // 'blob' pushes to Vercel Blob so uploads survive redeploys.
        driver: optional('STORAGE_DRIVER', isProduction ? 'blob' : 'local'),
        blobToken: optional('BLOB_READ_WRITE_TOKEN'),
        maxFileBytes: integer('MAX_UPLOAD_MB', 5) * 1024 * 1024,
        maxFilesPerListing: integer('MAX_FILES_PER_LISTING', 10)
    },

    security: {
        trustProxyHops: integer('TRUST_PROXY_HOPS', 1),
        rateLimit: {
            authWindowMinutes: integer('RATE_LIMIT_AUTH_WINDOW', 15),
            authMax: integer('RATE_LIMIT_AUTH_MAX', 10),
            apiWindowMinutes: integer('RATE_LIMIT_API_WINDOW', 15),
            apiMax: integer('RATE_LIMIT_API_MAX', 600),
            writeWindowMinutes: integer('RATE_LIMIT_WRITE_WINDOW', 60),
            writeMax: integer('RATE_LIMIT_WRITE_MAX', 100)
        }
    }
};

if (config.storage.driver === 'blob' && !config.storage.blobToken && isProduction) {
    problems.push('BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=blob');
}

if (isProduction && !config.mail.isConfigured) {
    problems.push('SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required in production');
}

if (problems.length) {
    const message = [
        'Invalid environment configuration:',
        ...problems.map(p => `  - ${p}`),
        '',
        'See .env.example for the full list of supported variables.'
    ].join('\n');

    // Never boot a production process with a broken security configuration.
    if (isProduction) throw new Error(message);
    console.warn(`\n⚠️  ${message}\n`);
}

module.exports = config;

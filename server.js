/**
 * ===========================================
 * Arthings - Main Server
 * ===========================================
 *
 * Peer-to-peer rental marketplace for local communities.
 * Database: Neon Postgres (via Prisma).
 */

// Load environment variables before anything reads them.
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const config = require('./backend/config/env');
const prisma = require('./backend/db/db');
const { securityHeaders, limiters } = require('./backend/middleware/security');
const { issueCsrfToken, verifyCsrfToken } = require('./backend/middleware/csrf');
const { handleUploadError } = require('./backend/services/storage');
const { publicCategories } = require('./backend/config/housing');

// Routes
const authRoutes = require('./backend/routes/auth');
const productsRoutes = require('./backend/routes/products');
const housingRoutes = require('./backend/routes/housing');
const favoritesRoutes = require('./backend/routes/favorites');
const rentalsRoutes = require('./backend/routes/rentals');
const legalRoutes = require('./backend/routes/legal');
const adminRoutes = require('./backend/routes/admin');
const ratingsRoutes = require('./backend/routes/ratings');
const rentalRequestsRoutes = require('./backend/routes/rental-requests');
const messagesRoutes = require('./backend/routes/messages');
const notificationsRoutes = require('./backend/routes/notifications');
const geoRoutes = require('./backend/routes/geo');

const app = express();

// Behind Vercel/ngrok the client IP arrives in X-Forwarded-For. Rate limiting
// keys on it, so an incorrect setting either lumps every visitor together or
// lets a spoofed header bypass the limits.
app.set('trust proxy', config.security.trustProxyHops);
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------

app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/**
 * Session store.
 *
 * The default MemoryStore keeps sessions in process memory, which leaks and
 * — decisively for this deployment — cannot work on serverless, where each
 * invocation may run in a different instance. Postgres-backed sessions are
 * shared across instances and survive restarts.
 */
function createSessionStore() {
    try {
        const PgSession = require('connect-pg-simple')(session);
        return new PgSession({
            conString: config.database.url,
            tableName: config.session.tableName,
            // Owned by the store rather than Prisma, so Prisma does not report
            // permanent drift against a table it has no model for.
            createTableIfMissing: true,
            pruneSessionInterval: 60 * 15
        });
    } catch (error) {
        if (config.isProduction) throw error;
        console.warn(
            '⚠️  connect-pg-simple unavailable, falling back to in-memory sessions.\n' +
            '   Run `npm install` — sessions will not survive a restart until you do.'
        );
        return undefined;
    }
}

app.use(session({
    store: createSessionStore(),
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: config.isProduction,
        httpOnly: true,
        // 'lax' still sends the cookie on top-level navigations, so inbound
        // links from email keep the user signed in, while blocking the
        // cross-site POSTs that CSRF depends on.
        sameSite: 'lax',
        maxAge: config.session.maxAgeMs
    }
}));

app.use(issueCsrfToken);

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

// Only meaningful for STORAGE_DRIVER=local; blob-hosted uploads are served
// from their own origin.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.use('/api', limiters.api);

/** Hands the frontend its CSRF token. */
app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken });
});

// Rejects cross-site state changes. Registered after the token endpoint and
// before every mutating route.
app.use('/api', verifyCsrfToken);

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/housing', housingRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/rentals', rentalsRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/rental-requests', rentalRequestsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/admin', adminRoutes);

/**
 * GET /api/config
 * Categories, cities and housing presets used to populate filter controls.
 */
app.get('/api/config', async (req, res) => {
    try {
        const [categories, cities] = await Promise.all([
            prisma.category.findMany(),
            prisma.city.findMany({ orderBy: { name: 'asc' } })
        ]);

        res.json({
            categories: categories.map(category => ({
                id: category.id,
                name: category.name,
                nameUk: category.nameUk,
                icon: category.icon
            })),
            // Retained for the legacy dropdowns. Map search resolves every
            // Ukrainian settlement live from OpenStreetMap instead.
            cities: cities.map(city => city.name),
            housingCategories: publicCategories()
        });
    } catch (error) {
        console.error('Config error:', error);
        res.status(500).json({ error: 'Failed to load config' });
    }
});

/**
 * GET /api/health
 */
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({
            status: 'healthy',
            database: 'connected',
            mail: config.mail.isConfigured ? 'configured' : 'console-fallback',
            storage: config.storage.driver,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

// ---------------------------------------------------------------------------
// HTML pages
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Serves a page from public/pages.
 *
 * `root` is what makes this safe: Express resolves the path against it and
 * rejects anything that escapes. Building the path with path.join() instead
 * would allow `/pages/..%2f..%2f.env` — Express decodes route parameters
 * after matching, turning that into a traversal out of the pages directory.
 */
app.get('/pages/:page', (req, res, next) => {
    res.sendFile(
        req.params.page,
        { root: path.join(__dirname, 'public', 'pages'), dotfiles: 'deny' },
        error => {
            if (error) next(error.status === 404 ? undefined : error);
        }
    );
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

// Upload failures reach here from any route that accepts files.
app.use(handleUploadError);

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err.stack || err);

    if (res.headersSent) return;

    res.status(err.status || 500).json({
        error: config.isProduction ? 'Internal server error' : err.message
    });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function shutdown(signal) {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
    await prisma.$disconnect();
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// On Vercel the platform imports the app and handles the listener itself;
// binding a port there would break the serverless invocation model.
if (require.main === module) {
    app.listen(config.port, '0.0.0.0', () => {
        console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║   🎯 ARTHINGS — Rental Marketplace                        ║
    ║                                                           ║
    ║   http://localhost:${String(config.port).padEnd(39)}║
    ║   env:     ${config.nodeEnv.padEnd(47)}║
    ║   storage: ${config.storage.driver.padEnd(47)}║
    ║   mail:    ${(config.mail.isConfigured ? 'SMTP' : 'console fallback').padEnd(47)}║
    ╚═══════════════════════════════════════════════════════════╝
        `);
    });
}

module.exports = app;

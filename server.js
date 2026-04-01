/**
 * ===========================================
 * Arthings - Main Server
 * ===========================================
 * 
 * Peer-to-peer rental platform for local communities
 * Database: Neon Postgres
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

// Import Prisma client
const prisma = require('./backend/db/db');

// Import routes
const authRoutes = require('./backend/routes/auth');
const productsRoutes = require('./backend/routes/products');
const favoritesRoutes = require('./backend/routes/favorites');
const rentalsRoutes = require('./backend/routes/rentals');
const legalRoutes = require('./backend/routes/legal');
const adminRoutes = require('./backend/routes/admin');
const ratingsRoutes = require('./backend/routes/ratings');
const rentalRequestsRoutes = require('./backend/routes/rental-requests');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required when behind ngrok/reverse proxy)
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'arthings-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
const isVercel = process.env.VERCEL === '1';
app.use('/uploads', express.static(isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/rentals', rentalsRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/rental-requests', rentalRequestsRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/admin', adminRoutes);

/**
 * GET /api/config
 * Get categories and cities from database
 */
app.get('/api/config', async (req, res) => {
    try {
        const [categories, cities] = await Promise.all([
            prisma.category.findMany(),
            prisma.city.findMany()
        ]);

        res.json({
            categories: categories.map(c => ({
                id: c.id,
                name: c.name,
                nameUk: c.nameUk,
                icon: c.icon
            })),
            cities: cities.map(c => c.name)
        });
    } catch (error) {
        console.error('Config error:', error);
        res.status(500).json({ error: 'Failed to load config' });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        res.json({
            status: 'healthy',
            database: 'connected',
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

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/pages/:page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', req.params.page));
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🎯 ARTHINGS - Rental Platform                          ║
    ║                                                           ║
    ║   Server running at: http://localhost:${PORT}               ║
    ║   Database: MariaDB (via Prisma)                         ║
    ║                                                           ║
    ║   Ready to connect communities!                          ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;

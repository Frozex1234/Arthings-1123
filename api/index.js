/**
 * Vercel serverless entry point.
 *
 * Vercel imports the Express app and drives it per-invocation rather than
 * letting it bind a port, so this file only re-exports the app. server.js
 * calls listen() exclusively when run directly (`require.main === module`),
 * which keeps `npm start` working locally without changes.
 *
 * Two things must be configured for this deployment to actually work, both
 * because serverless instances share nothing and are recycled freely:
 *
 *   • STORAGE_DRIVER=blob   — the filesystem is ephemeral, so uploads written
 *                             to ./uploads vanish and are invisible to other
 *                             instances.
 *   • Postgres sessions     — already wired via connect-pg-simple; the default
 *                             MemoryStore would lose every session between
 *                             invocations.
 */

module.exports = require('../server.js');

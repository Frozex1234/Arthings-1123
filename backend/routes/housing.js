/**
 * ===========================================
 * Arthings - Housing Routes
 * ===========================================
 *
 * The housing marketplace is a scoped view over the shared listing store:
 * every query here is pinned to `listingType = 'housing'`, so the two
 * marketplaces stay separate in the UI without duplicating the listing,
 * image, rental and rating subsystems underneath.
 */

const express = require('express');
const listings = require('../services/listings');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/listings');
const { publicCategories } = require('../config/housing');

const router = express.Router();

/** Forces the housing scope regardless of what the client asked for. */
function scopeToHousing(req, res, next) {
    req.query.listingType = 'housing';
    next();
}

/**
 * GET /api/housing/categories
 * The twelve browsable categories for the housing navigation.
 */
router.get('/categories', (req, res) => {
    res.json({ categories: publicCategories() });
});

/**
 * GET /api/housing
 * Paginated housing search.
 */
router.get('/', validate({ query: schemas.list }), scopeToHousing, async (req, res) => {
    try {
        const result = await listings.search(req.query);
        res.json(result);
    } catch (error) {
        console.error('Housing search error:', error);
        res.status(500).json({ error: 'Failed to load housing' });
    }
});

/**
 * GET /api/housing/map
 * Housing markers for the map view.
 */
router.get('/map', validate({ query: schemas.mapQuery }), scopeToHousing, async (req, res) => {
    try {
        const result = await listings.searchMap(req.query);
        res.json(result);
    } catch (error) {
        console.error('Housing map error:', error);
        res.status(500).json({ error: 'Failed to load housing map' });
    }
});

module.exports = router;

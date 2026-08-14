/**
 * ===========================================
 * Arthings - Geocoding Proxy Routes
 * ===========================================
 *
 * The browser must never call Nominatim directly: the usage policy is scoped
 * to an application, not to each visitor, and a direct integration would leak
 * every user's IP to a third party while blowing the shared rate limit.
 */

const express = require('express');
const { z } = require('zod');
const geocoding = require('../services/geocoding');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const { latitude, longitude } = require('../validators/common');

const router = express.Router();

router.use(limiters.geocode);

/**
 * GET /api/geo/autocomplete?q=...
 * Settlement and street suggestions for the map search box.
 */
router.get(
    '/autocomplete',
    validate({
        query: z.object({
            q: z.string().trim().min(3, 'Enter at least 3 characters').max(160),
            limit: z.coerce.number().int().min(1).max(10).default(8)
        })
    }),
    async (req, res) => {
        try {
            const suggestions = await geocoding.autocomplete(req.query.q, req.query.limit);
            res.json({ suggestions });
        } catch (error) {
            console.error('Autocomplete route error:', error);
            res.status(502).json({ error: 'Address search is temporarily unavailable' });
        }
    }
);

/**
 * GET /api/geo/reverse?lat=..&lng=..
 * Used by "use my location" and the map pin-drop control.
 */
router.get(
    '/reverse',
    validate({ query: z.object({ lat: latitude, lng: longitude }) }),
    async (req, res) => {
        try {
            const result = await geocoding.reverseGeocode(req.query.lat, req.query.lng);
            if (!result) {
                return res.status(404).json({ error: 'No address found for these coordinates' });
            }
            res.json({ address: result });
        } catch (error) {
            console.error('Reverse geocode route error:', error);
            res.status(502).json({ error: 'Address lookup is temporarily unavailable' });
        }
    }
);

module.exports = router;

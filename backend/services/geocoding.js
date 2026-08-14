/**
 * ===========================================
 * Arthings - Geocoding Service
 * ===========================================
 *
 * Wraps OpenStreetMap Nominatim.
 *
 * Nominatim is free but its usage policy is strict: at most one request per
 * second, a genuine identifying User-Agent, and results must be cached rather
 * than re-fetched. Violating it gets the deployment's IP blocked outright.
 *
 * Two rules follow from that, and both are enforced here:
 *
 *   1. The browser never talks to Nominatim directly. Every lookup is proxied
 *      so one shared quota is respected instead of one per visitor.
 *   2. Coordinates are resolved once at write time and stored on the listing,
 *      so rendering the map is a pure database read.
 */

const prisma = require('../db/db');
const config = require('../config/env');

const { geocoding: settings } = config;

// ---------------------------------------------------------------------------
// Outbound request throttle
// ---------------------------------------------------------------------------

/**
 * Serialises outbound calls with a minimum gap between them.
 *
 * Caveat: this is per-process. On serverless platforms concurrent instances
 * each hold their own chain, so the effective rate can exceed one per second
 * under load. The cache is what actually keeps volume low; if traffic grows
 * enough for that to matter, move to a hosted geocoder or self-host Nominatim.
 */
let queue = Promise.resolve();
let lastRequestAt = 0;

function schedule(task) {
    const run = async () => {
        const elapsed = Date.now() - lastRequestAt;
        const wait = settings.minIntervalMs - elapsed;
        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }
        lastRequestAt = Date.now();
        return task();
    };

    // Keep the chain alive even when a task rejects.
    queue = queue.then(run, run);
    return queue;
}

async function callNominatim(pathname, params) {
    const url = new URL(pathname, settings.endpoint);
    url.searchParams.set('format', 'jsonv2');
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    }

    return schedule(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': settings.userAgent,
                    'Accept-Language': 'uk,en'
                },
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Nominatim responded ${response.status}`);
            }
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    });
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Normalises a query so trivial spelling variants share a cache entry. */
function cacheKey(kind, value) {
    return `${kind}:${String(value).toLowerCase().replace(/\s+/g, ' ').trim()}`.slice(0, 500);
}

function isFresh(entry) {
    const ageDays = (Date.now() - entry.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays < settings.cacheTtlDays;
}

async function readCache(key) {
    const entry = await prisma.geocodeCache.findUnique({ where: { queryKey: key } });
    if (!entry || !isFresh(entry)) return null;

    // Fire-and-forget: hit counting must not slow the response or fail it.
    prisma.geocodeCache
        .update({ where: { id: entry.id }, data: { hits: { increment: 1 } } })
        .catch(() => {});

    return entry;
}

async function writeCache(key, result) {
    const data = {
        latitude: result.latitude,
        longitude: result.longitude,
        displayName: result.displayName?.slice(0, 500) ?? null,
        accuracy: result.accuracy ?? null,
        payload: result.payload ?? null
    };

    return prisma.geocodeCache.upsert({
        where: { queryKey: key },
        create: { queryKey: key, ...data },
        update: { ...data, updatedAt: new Date() }
    });
}

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

/**
 * Builds a single-line query from structured address parts, ordered
 * most-specific first as Nominatim expects.
 *
 * @param {object} address
 */
function buildAddressQuery(address = {}) {
    const parts = [
        [address.street, address.houseNumber].filter(Boolean).join(' '),
        address.village,
        address.city,
        address.district,
        address.region,
        address.postcode,
        address.country || 'Ukraine'
    ];

    return parts
        .map(part => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(', ');
}

/** Describes how precise a result is, for UI disclosure and map zoom. */
function classifyAccuracy(result) {
    const type = result.addresstype || result.type;
    if (['house', 'building', 'residential'].includes(type)) return 'house';
    if (['road', 'street', 'pedestrian'].includes(type)) return 'street';
    if (['village', 'hamlet'].includes(type)) return 'village';
    if (['city', 'town', 'municipality'].includes(type)) return 'city';
    if (['state', 'region', 'administrative'].includes(type)) return 'region';
    return 'approximate';
}

function normaliseResult(raw) {
    return {
        latitude: Number.parseFloat(raw.lat),
        longitude: Number.parseFloat(raw.lon),
        displayName: raw.display_name,
        accuracy: classifyAccuracy(raw),
        payload: {
            osmId: raw.osm_id,
            osmType: raw.osm_type,
            type: raw.type,
            addresstype: raw.addresstype,
            address: raw.address ?? null,
            boundingbox: raw.boundingbox ?? null
        }
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves structured address parts to coordinates.
 *
 * @param {object} address - { country, region, district, city, village, street, houseNumber, postcode }
 * @returns {Promise<object|null>}
 */
async function geocodeAddress(address) {
    const query = buildAddressQuery(address);
    if (!query) return null;

    const key = cacheKey('fwd', query);
    const cached = await readCache(key);
    if (cached) {
        return {
            latitude: cached.latitude,
            longitude: cached.longitude,
            displayName: cached.displayName,
            accuracy: cached.accuracy,
            query,
            cached: true
        };
    }

    try {
        const results = await callNominatim('/search', {
            q: query,
            addressdetails: 1,
            limit: 1,
            countrycodes: settings.countryCodes
        });

        if (!Array.isArray(results) || results.length === 0) return null;

        const result = normaliseResult(results[0]);
        if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;

        await writeCache(key, result).catch(() => {});
        return { ...result, query, cached: false };
    } catch (error) {
        // A geocoding outage must not block someone from publishing a listing;
        // the listing is saved without coordinates and can be retried later.
        console.error('Geocoding failed:', query, error.message);
        return null;
    }
}

/**
 * Settlement/street autocomplete for the map search box.
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function autocomplete(query, limit = 8) {
    const trimmed = String(query || '').trim();
    if (trimmed.length < 3) return [];

    const key = cacheKey('ac', `${trimmed}|${limit}`);
    const cached = await readCache(key);
    if (cached?.payload?.suggestions) {
        return cached.payload.suggestions;
    }

    try {
        const results = await callNominatim('/search', {
            q: trimmed,
            addressdetails: 1,
            limit,
            countrycodes: settings.countryCodes,
            // Restricts noise to places and streets rather than shops/POIs.
            featureType: undefined,
            dedupe: 1
        });

        if (!Array.isArray(results)) return [];

        const suggestions = results.map(raw => {
            const normalised = normaliseResult(raw);
            const address = raw.address || {};
            return {
                label: raw.display_name,
                shortLabel: [
                    address.road,
                    address.village || address.town || address.city || address.municipality,
                    address.state
                ].filter(Boolean).join(', ') || raw.name || raw.display_name,
                latitude: normalised.latitude,
                longitude: normalised.longitude,
                accuracy: normalised.accuracy,
                boundingBox: raw.boundingbox
                    ? raw.boundingbox.map(Number)
                    : null,
                address: {
                    region: address.state || null,
                    district: address.county || address.district || null,
                    city: address.city || address.town || address.municipality || null,
                    village: address.village || address.hamlet || null,
                    street: address.road || null,
                    houseNumber: address.house_number || null,
                    postcode: address.postcode || null,
                    country: address.country || 'Ukraine'
                }
            };
        });

        // Autocomplete results are cached under a synthetic coordinate; only
        // the payload matters for this cache kind.
        await writeCache(key, {
            latitude: suggestions[0]?.latitude ?? 0,
            longitude: suggestions[0]?.longitude ?? 0,
            displayName: trimmed,
            accuracy: 'autocomplete',
            payload: { suggestions }
        }).catch(() => {});

        return suggestions;
    } catch (error) {
        console.error('Autocomplete failed:', trimmed, error.message);
        return [];
    }
}

/**
 * Turns coordinates into a structured address — used by "use my location"
 * and by the pin-drop control on the listing form.
 */
async function reverseGeocode(latitude, longitude) {
    const key = cacheKey('rev', `${latitude.toFixed(5)},${longitude.toFixed(5)}`);
    const cached = await readCache(key);
    if (cached?.payload) {
        return { ...cached.payload, latitude: cached.latitude, longitude: cached.longitude };
    }

    try {
        const raw = await callNominatim('/reverse', {
            lat: latitude,
            lon: longitude,
            addressdetails: 1,
            zoom: 18
        });

        if (!raw || raw.error) return null;

        const address = raw.address || {};
        const result = {
            displayName: raw.display_name,
            region: address.state || null,
            district: address.county || address.district || null,
            city: address.city || address.town || address.municipality || null,
            village: address.village || address.hamlet || null,
            street: address.road || null,
            houseNumber: address.house_number || null,
            postcode: address.postcode || null,
            country: address.country || 'Ukraine'
        };

        await writeCache(key, {
            latitude,
            longitude,
            displayName: raw.display_name,
            accuracy: 'reverse',
            payload: result
        }).catch(() => {});

        return { ...result, latitude, longitude };
    } catch (error) {
        console.error('Reverse geocoding failed:', error.message);
        return null;
    }
}

module.exports = {
    geocodeAddress,
    autocomplete,
    reverseGeocode,
    buildAddressQuery
};

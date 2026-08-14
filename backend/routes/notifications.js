/**
 * ===========================================
 * Arthings - Notification Routes
 * ===========================================
 */

const express = require('express');
const { z } = require('zod');
const prisma = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/notifications
 */
router.get(
    '/',
    validate({
        query: z.object({
            unreadOnly: z.coerce.boolean().default(false),
            limit: z.coerce.number().int().min(1).max(100).default(30)
        })
    }),
    async (req, res) => {
        try {
            const userId = req.session.userId;
            const where = { userId, ...(req.query.unreadOnly ? { readAt: null } : {}) };

            const [items, unread] = await Promise.all([
                prisma.notification.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    take: req.query.limit
                }),
                prisma.notification.count({ where: { userId, readAt: null } })
            ]);

            res.json({
                notifications: items.map(item => ({
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    body: item.body,
                    link: item.link,
                    read: Boolean(item.readAt),
                    createdAt: item.createdAt
                })),
                unread
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({ error: 'Failed to load notifications' });
        }
    }
);

/** GET /api/notifications/unread-count — drives the header badge. */
router.get('/unread-count', async (req, res) => {
    try {
        const unread = await prisma.notification.count({
            where: { userId: req.session.userId, readAt: null }
        });
        res.json({ unread });
    } catch (error) {
        console.error('Unread count error:', error);
        res.status(500).json({ error: 'Failed to load unread count' });
    }
});

/** POST /api/notifications/:id/read */
router.post('/:id/read', async (req, res) => {
    try {
        const id = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

        // Scoped by userId so one account cannot mark another's notifications.
        const result = await prisma.notification.updateMany({
            where: { id, userId: req.session.userId, readAt: null },
            data: { readAt: new Date() }
        });

        res.json({ updated: result.count });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

/** POST /api/notifications/read-all */
router.post('/read-all', async (req, res) => {
    try {
        const result = await prisma.notification.updateMany({
            where: { userId: req.session.userId, readAt: null },
            data: { readAt: new Date() }
        });
        res.json({ updated: result.count });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

module.exports = router;

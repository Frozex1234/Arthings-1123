/**
 * Arthings - Ratings Routes
 * Rate owner or renter after completed rental
 */

const express = require('express');
const prisma = require('../db/db');
const notifications = require('../services/notifications');

const router = express.Router();

/**
 * POST /api/ratings
 * Create a rating (after completed rental). Owner rates renter, or renter rates owner.
 */
router.post('/', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { rentalId: rawRentalId, toUserId: rawToUserId, score, comment } = req.body;

        const rentalId = typeof rawRentalId === 'string' && rawRentalId.startsWith('rental-')
            ? parseInt(rawRentalId.replace('rental-', ''), 10)
            : parseInt(rawRentalId, 10);
        const toUserId = typeof rawToUserId === 'string' && rawToUserId.startsWith('user-')
            ? parseInt(rawToUserId.replace('user-', ''), 10)
            : parseInt(rawToUserId, 10);

        if (isNaN(rentalId) || isNaN(toUserId) || !score) {
            return res.status(400).json({ error: 'rentalId, toUserId, and score are required' });
        }

        if (score < 1 || score > 5) {
            return res.status(400).json({ error: 'Score must be between 1 and 5' });
        }

        const rental = await prisma.rental.findUnique({
            where: { id: rentalId },
            include: { item: true }
        });

        if (!rental) {
            return res.status(404).json({ error: 'Rental not found' });
        }

        if (rental.status !== 'completed') {
            return res.status(400).json({ error: 'You can only rate after the rental is completed' });
        }

        const ownerId = rental.item.userId;
        const renterId = rental.renterId;

        // Current user must be owner or renter; toUserId must be the other party
        const isOwner = rental.item.userId === req.session.userId;
        const isRenter = rental.renterId === req.session.userId;

        if (!isOwner && !isRenter) {
            return res.status(403).json({ error: 'You can only rate for your own rentals' });
        }

        if (isOwner && toUserId !== renterId) {
            return res.status(400).json({ error: 'You can only rate the renter' });
        }
        if (isRenter && toUserId !== ownerId) {
            return res.status(400).json({ error: 'You can only rate the owner' });
        }

        const existing = await prisma.rating.findUnique({
            where: {
                rentalId_fromUserId_toUserId: {
                    rentalId,
                    fromUserId: req.session.userId,
                    toUserId
                }
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'You have already rated this user for this rental' });
        }

        const rating = await prisma.$transaction(async tx => {
            const created = await tx.rating.create({
                data: {
                    rentalId,
                    fromUserId: req.session.userId,
                    toUserId,
                    score: Math.min(5, Math.max(1, parseInt(score, 10))),
                    comment: comment ? String(comment).trim().slice(0, 1000) : null
                },
                include: {
                    toUser: { select: { id: true, name: true } }
                }
            });

            // Refresh the denormalised aggregates the listing and map queries
            // read. Recomputed from source rather than incrementally adjusted,
            // so the stored value cannot drift out of sync with the rows.
            const aggregate = await tx.rating.aggregate({
                where: { toUserId },
                _avg: { score: true },
                _count: { score: true }
            });

            await tx.user.update({
                where: { id: toUserId },
                data: {
                    ratingAvg: Number((aggregate._avg.score ?? 0).toFixed(2)),
                    ratingCount: aggregate._count.score
                }
            });

            return created;
        });

        // Best-effort: a failed notification must not undo the rating.
        notifications
            .notify({
                userId: toUserId,
                type: 'rating_received',
                title: `Ви отримали оцінку ${rating.score}★`,
                body: rating.comment,
                link: '/pages/profile.html'
            })
            .catch(() => {});

        res.status(201).json({
            message: 'Rating submitted',
            rating: {
                id: rating.id,
                rentalId: `rental-${rating.rentalId}`,
                toUserId: `user-${rating.toUserId}`,
                toUserName: rating.toUser.name,
                score: rating.score,
                comment: rating.comment,
                createdAt: rating.createdAt.toISOString()
            }
        });
    } catch (error) {
        console.error('Create rating error:', error);
        res.status(500).json({ error: 'Failed to submit rating' });
    }
});

/**
 * GET /api/ratings/user/:userId
 * Get ratings received by a user (for profile display)
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const raw = req.params.userId;
        const userId = raw.startsWith('user-') ? parseInt(raw.replace('user-', ''), 10) : parseInt(raw, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }

        const ratings = await prisma.rating.findMany({
            where: { toUserId: userId },
            include: {
                fromUser: { select: { id: true, name: true } },
                rental: {
                    include: {
                        item: { select: { title: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        const agg = await prisma.rating.aggregate({
            where: { toUserId: userId },
            _avg: { score: true },
            _count: true
        });

        res.json({
            ratings: ratings.map(r => ({
                id: r.id,
                score: r.score,
                comment: r.comment,
                createdAt: r.createdAt.toISOString(),
                fromUserName: r.fromUser.name,
                itemTitle: r.rental?.item?.title
            })),
            averageScore: agg._avg.score ? Math.round(agg._avg.score * 10) / 10 : null,
            totalCount: agg._count
        });
    } catch (error) {
        console.error('Get user ratings error:', error);
        res.status(500).json({ error: 'Failed to load ratings' });
    }
});

/**
 * GET /api/ratings/rental/:rentalId
 * Get ratings for a specific rental (to show if current user already rated / can rate)
 */
router.get('/rental/:rentalId', async (req, res) => {
    try {
        const raw = req.params.rentalId;
        const rentalId = raw.startsWith('rental-') ? parseInt(raw.replace('rental-', ''), 10) : parseInt(raw, 10);
        if (isNaN(rentalId)) {
            return res.status(400).json({ error: 'Invalid rental ID' });
        }

        const ratings = await prisma.rating.findMany({
            where: { rentalId },
            include: {
                fromUser: { select: { id: true, name: true } },
                toUser: { select: { id: true, name: true } }
            }
        });

        const currentUserId = req.session.userId || null;
        const givenByMe = currentUserId
            ? ratings.filter(r => r.fromUserId === currentUserId)
            : [];

        res.json({
            ratings: ratings.map(r => ({
                id: r.id,
                fromUserId: `user-${r.fromUserId}`,
                fromUserName: r.fromUser.name,
                toUserId: `user-${r.toUserId}`,
                toUserName: r.toUser.name,
                score: r.score,
                comment: r.comment,
                createdAt: r.createdAt.toISOString()
            })),
            canRateOwner: false,
            canRateRenter: false,
            alreadyRatedOwner: givenByMe.some(r => r.toUserId !== currentUserId && ratings.some(x => x.toUserId === r.toUserId)),
            alreadyRatedRenter: givenByMe.some(r => r.toUserId !== currentUserId)
        });
    } catch (error) {
        console.error('Get rental ratings error:', error);
        res.status(500).json({ error: 'Failed to load ratings' });
    }
});

/**
 * GET /api/ratings/rental/:rentalId/can-rate
 * Returns who the current user can still rate for this rental (owner/renter) and if already rated
 */
router.get('/rental/:rentalId/can-rate', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.json({ canRateOwner: false, canRateRenter: false, alreadyRatedOwner: false, alreadyRatedRenter: false });
        }

        const raw = req.params.rentalId;
        const rentalId = raw.startsWith('rental-') ? parseInt(raw.replace('rental-', ''), 10) : parseInt(raw, 10);
        if (isNaN(rentalId)) {
            return res.status(400).json({ error: 'Invalid rental ID' });
        }

        const rental = await prisma.rental.findUnique({
            where: { id: rentalId },
            include: {
                item: { include: { user: { select: { id: true, name: true } } } },
                renter: { select: { id: true, name: true } }
            }
        });

        if (!rental || rental.status !== 'completed') {
            return res.json({ canRateOwner: false, canRateRenter: false, alreadyRatedOwner: false, alreadyRatedRenter: false });
        }

        const ownerId = rental.item.userId;
        const renterId = rental.renterId;
        const me = req.session.userId;

        const existing = await prisma.rating.findMany({
            where: {
                rentalId,
                fromUserId: me
            }
        });

        const alreadyRatedOwner = existing.some(r => r.toUserId === ownerId);
        const alreadyRatedRenter = existing.some(r => r.toUserId === renterId);

        let canRateOwner = false;
        let canRateRenter = false;
        if (me === renterId) {
            canRateOwner = !alreadyRatedOwner;
        }
        if (me === ownerId) {
            canRateRenter = !alreadyRatedRenter;
        }

        res.json({
            canRateOwner,
            canRateRenter,
            alreadyRatedOwner,
            alreadyRatedRenter,
            ownerId: `user-${ownerId}`,
            renterId: `user-${renterId}`,
            ownerName: rental.item?.user?.name || null,
            renterName: rental.renter?.name || null
        });
    } catch (error) {
        console.error('Can-rate check error:', error);
        res.status(500).json({ error: 'Failed to check' });
    }
});

module.exports = router;

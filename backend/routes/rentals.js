/**
 * ===========================================
 * Arthings - Rental Request Routes
 * ===========================================
 *
 * The booking lifecycle:
 *
 *   pending ──accept──▶ accepted ──complete──▶ completed
 *      │                    │
 *      ├──reject──▶ rejected│
 *      └──────cancel────────┴──▶ cancelled
 *
 * Every transition is validated against the state machine below and appended
 * to an immutable event log, so both parties can see what happened and when.
 *
 * Naming note: the stored enum keeps `approved`/`declined` for backwards
 * compatibility with existing rows. The API speaks `accepted`/`rejected`.
 */

const express = require('express');
const prisma = require('../db/db');
const listings = require('../services/listings');
const notifications = require('../services/notifications');
const mail = require('../services/mail');
const { validate } = require('../middleware/validate');
const { limiters } = require('../middleware/security');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const schemas = require('../validators/rentals');

const router = express.Router();

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

const TO_PUBLIC = { approved: 'accepted', declined: 'rejected' };
const TO_DB = { accepted: 'approved', rejected: 'declined' };

const toPublic = status => TO_PUBLIC[status] ?? status;
const toDb = status => TO_DB[status] ?? status;

/**
 * Permitted transitions, keyed by current stored status.
 * `actor` names who may perform each one.
 */
const TRANSITIONS = {
    pending: {
        approved: 'owner',
        declined: 'owner',
        cancelled: 'either'
    },
    approved: {
        completed: 'owner',
        cancelled: 'either'
    },
    declined: {},
    cancelled: {},
    completed: {}
};

function canTransition(from, to, role) {
    const allowed = TRANSITIONS[from]?.[to];
    if (!allowed) return false;
    return allowed === 'either' || allowed === role;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const RENTAL_INCLUDE = {
    item: {
        include: {
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            user: { select: { id: true, name: true, email: true, phone: true, isVerified: true } }
        }
    },
    renter: { select: { id: true, name: true, email: true, phone: true, isVerified: true } },
    events: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, name: true } } }
    }
};

const isoDay = date => date.toISOString().slice(0, 10);

function formatRental(rental, viewerId) {
    const ownerId = rental.item?.userId ?? null;
    const isOwner = ownerId === viewerId;
    const counterparty = isOwner ? rental.renter : rental.item?.user;

    return {
        id: `rental-${rental.id}`,
        productId: `prod-${rental.itemId}`,
        renterId: `user-${rental.renterId}`,
        ownerId: ownerId ? `user-${ownerId}` : null,
        role: isOwner ? 'owner' : 'renter',

        startDate: isoDay(rental.startDate),
        endDate: isoDay(rental.endDate),
        days: rental.days,
        pricePerDay: Number(rental.pricePerDay),
        totalPrice: Number(rental.totalPrice),

        status: toPublic(rental.status),
        message: rental.message,
        ownerResponse: rental.ownerResponse,
        respondedAt: rental.respondedAt,
        cancelledAt: rental.cancelledAt,
        cancelledBy: rental.cancelledById ? `user-${rental.cancelledById}` : null,
        completedAt: rental.completedAt,
        createdAt: rental.createdAt,

        /** Actions the viewer may take right now — drives the UI buttons. */
        availableActions: Object.entries(TRANSITIONS[rental.status] ?? {})
            .filter(([, who]) => who === 'either' || who === (isOwner ? 'owner' : 'renter'))
            .map(([status]) => toPublic(status)),

        product: rental.item
            ? {
                id: `prod-${rental.item.id}`,
                title: rental.item.title,
                image: rental.item.images?.[0]?.imagePath ?? null,
                price: Number(rental.item.pricePerDay),
                priceUnit: rental.item.priceUnit,
                listingType: rental.item.listingType,
                city: rental.item.city
            }
            : null,

        /** The other party, for the chat button and contact details. */
        counterparty: counterparty
            ? {
                id: `user-${counterparty.id}`,
                name: counterparty.name,
                // Contact details are only useful once a booking is live, and
                // only to the two people involved.
                phone: rental.status === 'approved' ? counterparty.phone : null,
                isVerified: counterparty.isVerified
            }
            : null,

        timeline: (rental.events ?? []).map(event => ({
            id: event.id,
            status: toPublic(event.status),
            note: event.note,
            actor: event.actor ? { id: `user-${event.actor.id}`, name: event.actor.name } : null,
            createdAt: event.createdAt
        })),

        // Kept for compatibility with the existing frontend.
        renterName: rental.renter?.name || 'Unknown',
        renterEmail: rental.renter?.email || '',
        renterPhone: rental.renter?.phone || '',
        ownerName: rental.item?.user?.name || 'Unknown',
        ownerPhone: rental.item?.user?.phone || ''
    };
}

/** Loads a rental and resolves the caller's role, or an error. */
async function loadParticipantRental(rentalId, userId) {
    const rental = await prisma.rental.findUnique({
        where: { id: rentalId },
        include: RENTAL_INCLUDE
    });

    if (!rental) return { error: { status: 404, message: 'Request not found' } };

    const isOwner = rental.item?.userId === userId;
    const isRenter = rental.renterId === userId;
    if (!isOwner && !isRenter) {
        return { error: { status: 403, message: 'Access denied' } };
    }

    return { rental, role: isOwner ? 'owner' : 'renter' };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * GET /api/rentals?role=renter|owner&status=...
 * Request history for whichever side the caller is on.
 */
router.get('/', requireAuth, validate({ query: schemas.listQuery }), async (req, res) => {
    try {
        const { role, status, page, limit } = req.query;
        const userId = req.session.userId;

        const where = role === 'owner'
            ? { item: { userId } }
            : { renterId: userId };

        if (status) where.status = toDb(status);

        const [rentals, total] = await Promise.all([
            prisma.rental.findMany({
                where,
                include: RENTAL_INCLUDE,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.rental.count({ where })
        ]);

        res.json({
            rentals: rentals.map(rental => formatRental(rental, userId)),
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (error) {
        console.error('Get rentals error:', error);
        res.status(500).json({ error: 'Failed to load requests' });
    }
});

/**
 * GET /api/rentals/:id
 */
router.get('/:id', requireAuth, validate({ params: schemas.idParam }), async (req, res) => {
    try {
        const { rental, error } = await loadParticipantRental(req.params.id, req.session.userId);
        if (error) return res.status(error.status).json({ error: error.message });

        res.json({ rental: formatRental(rental, req.session.userId) });
    } catch (error) {
        console.error('Get rental error:', error);
        res.status(500).json({ error: 'Failed to load request' });
    }
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * POST /api/rentals
 * Creates a rental request for a date range.
 */
router.post(
    '/',
    requireAuth,
    requireVerifiedEmail,
    limiters.write,
    validate({ body: schemas.create }),
    async (req, res) => {
        try {
            const { productId, startDate, endDate, message } = req.body;
            const renterId = req.session.userId;

            const item = await prisma.item.findUnique({
                where: { id: productId },
                include: { user: { select: { id: true, name: true, email: true } } }
            });

            if (!item) return res.status(404).json({ error: 'Listing not found' });
            if (item.userId === renterId) {
                return res.status(400).json({ error: 'You cannot rent your own listing' });
            }
            if (!item.isAvailable) {
                return res.status(409).json({ error: 'This listing is not currently available' });
            }

            const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            const totalPrice = Number(item.pricePerDay) * days;

            let rental;
            try {
                rental = await prisma.$transaction(
                    async tx => {
                        // Re-check inside the transaction: the gap between an
                        // outside check and the insert is exactly where two
                        // simultaneous requests would both succeed.
                        const overlapping = await tx.rental.count({
                            where: {
                                itemId: item.id,
                                status: { in: ['pending', 'approved'] },
                                startDate: { lte: endDate },
                                endDate: { gte: startDate }
                            }
                        });

                        const blocked = await tx.itemAvailability.count({
                            where: {
                                itemId: item.id,
                                startDate: { lte: endDate },
                                endDate: { gte: startDate }
                            }
                        });

                        if (overlapping > 0 || blocked > 0) {
                            const conflict = new Error('DATES_UNAVAILABLE');
                            conflict.code = 'DATES_UNAVAILABLE';
                            throw conflict;
                        }

                        const created = await tx.rental.create({
                            data: {
                                itemId: item.id,
                                renterId,
                                startDate,
                                endDate,
                                days,
                                pricePerDay: item.pricePerDay,
                                totalPrice,
                                message: message ?? null,
                                status: 'pending'
                            }
                        });

                        await tx.rentalEvent.create({
                            data: {
                                rentalId: created.id,
                                actorId: renterId,
                                status: 'pending',
                                note: 'Request created'
                            }
                        });

                        return created;
                    },
                    // Serializable prevents the phantom read that would let two
                    // concurrent requests each pass the overlap check.
                    { isolationLevel: 'Serializable' }
                );
            } catch (error) {
                if (error.code === 'DATES_UNAVAILABLE') {
                    const { conflicts } = await listings.checkAvailability(item.id, startDate, endDate);
                    return res.status(409).json({
                        error: 'Those dates are no longer available',
                        code: 'DATES_UNAVAILABLE',
                        conflicts: conflicts.map(c => ({
                            type: c.type,
                            start: isoDay(c.startDate),
                            end: isoDay(c.endDate)
                        }))
                    });
                }
                throw error;
            }

            const renter = await prisma.user.findUnique({
                where: { id: renterId },
                select: { name: true }
            });

            const link = `/pages/rental-requests.html?role=owner&rental=rental-${rental.id}`;
            await notifications.notifyAndEmail({
                userId: item.userId,
                type: 'rental_requested',
                title: `Новий запит на «${item.title}»`,
                body: `${renter.name} хоче орендувати з ${isoDay(startDate)} до ${isoDay(endDate)}.`,
                link,
                email: {
                    to: item.user.email,
                    ...mail.templates.rentalRequested({
                        ownerName: item.user.name,
                        renterName: renter.name,
                        itemTitle: item.title,
                        startDate: isoDay(startDate),
                        endDate: isoDay(endDate),
                        url: notifications.absoluteUrl(link)
                    })
                }
            });

            const complete = await prisma.rental.findUnique({
                where: { id: rental.id },
                include: RENTAL_INCLUDE
            });

            res.status(201).json({
                message: 'Request sent',
                rental: formatRental(complete, renterId)
            });
        } catch (error) {
            console.error('Create rental error:', error);
            res.status(500).json({ error: 'Failed to create request' });
        }
    }
);

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Applies a status transition, writing the event log entry alongside it.
 *
 * @param {object} params
 * @returns {Promise<object>} the updated rental
 */
async function applyTransition({ rental, targetStatus, actorId, note }) {
    const now = new Date();

    const data = { status: targetStatus };
    if (targetStatus === 'approved' || targetStatus === 'declined') {
        data.respondedAt = now;
        data.ownerResponse = note ?? null;
    }
    if (targetStatus === 'cancelled') {
        data.cancelledAt = now;
        data.cancelledById = actorId;
    }
    if (targetStatus === 'completed') {
        data.completedAt = now;
    }

    return prisma.$transaction(async tx => {
        const updated = await tx.rental.update({ where: { id: rental.id }, data });

        await tx.rentalEvent.create({
            data: {
                rentalId: rental.id,
                actorId,
                status: targetStatus,
                note: note ?? null
            }
        });

        // Accepting a booking releases the dates from competing requests:
        // leaving them pending would let the owner double-book by accident.
        if (targetStatus === 'approved') {
            const conflicting = await tx.rental.findMany({
                where: {
                    itemId: rental.itemId,
                    status: 'pending',
                    id: { not: rental.id },
                    startDate: { lte: rental.endDate },
                    endDate: { gte: rental.startDate }
                },
                select: { id: true }
            });

            if (conflicting.length) {
                const ids = conflicting.map(row => row.id);
                await tx.rental.updateMany({
                    where: { id: { in: ids } },
                    data: {
                        status: 'declined',
                        respondedAt: now,
                        ownerResponse: 'These dates were booked by another renter.'
                    }
                });
                await tx.rentalEvent.createMany({
                    data: ids.map(id => ({
                        rentalId: id,
                        actorId,
                        status: 'declined',
                        note: 'Automatically declined — dates booked by another request'
                    }))
                });
            }
        }

        return updated;
    });
}

/** Shared handler for owner accept/reject and either-party cancel. */
function transitionRoute(targetStatus) {
    return async (req, res) => {
        try {
            const { rental, role, error } = await loadParticipantRental(
                req.params.id,
                req.session.userId
            );
            if (error) return res.status(error.status).json({ error: error.message });

            if (!canTransition(rental.status, targetStatus, role)) {
                return res.status(409).json({
                    error: `Cannot move a ${toPublic(rental.status)} request to ${toPublic(targetStatus)}`,
                    code: 'INVALID_TRANSITION',
                    currentStatus: toPublic(rental.status)
                });
            }

            await applyTransition({
                rental,
                targetStatus,
                actorId: req.session.userId,
                note: req.body?.response ?? null
            });

            // Notify whoever did not press the button.
            const isOwnerActing = role === 'owner';
            const recipientId = isOwnerActing ? rental.renterId : rental.item.userId;
            const recipient = isOwnerActing ? rental.renter : rental.item.user;
            const link = `/pages/rental-requests.html?role=${isOwnerActing ? 'renter' : 'owner'}&rental=rental-${rental.id}`;

            const notificationByStatus = {
                approved: {
                    type: 'rental_accepted',
                    title: `Запит на «${rental.item.title}» підтверджено`,
                    email: mail.templates.rentalDecision({
                        renterName: recipient.name,
                        itemTitle: rental.item.title,
                        accepted: true,
                        ownerResponse: req.body?.response,
                        url: notifications.absoluteUrl(link)
                    })
                },
                declined: {
                    type: 'rental_rejected',
                    title: `Запит на «${rental.item.title}» відхилено`,
                    email: mail.templates.rentalDecision({
                        renterName: recipient.name,
                        itemTitle: rental.item.title,
                        accepted: false,
                        ownerResponse: req.body?.response,
                        url: notifications.absoluteUrl(link)
                    })
                },
                cancelled: {
                    type: 'rental_cancelled',
                    title: `Запит на «${rental.item.title}» скасовано`,
                    email: mail.templates.rentalCancelled({
                        recipientName: recipient.name,
                        itemTitle: rental.item.title,
                        url: notifications.absoluteUrl(link)
                    })
                },
                completed: {
                    type: 'rental_completed',
                    title: `Оренду «${rental.item.title}» завершено`,
                    email: null
                }
            };

            const payload = notificationByStatus[targetStatus];
            if (payload) {
                await notifications.notifyAndEmail({
                    userId: recipientId,
                    type: payload.type,
                    title: payload.title,
                    body: req.body?.response ?? null,
                    link,
                    email: payload.email ? { to: recipient.email, ...payload.email } : undefined
                });
            }

            const complete = await prisma.rental.findUnique({
                where: { id: rental.id },
                include: RENTAL_INCLUDE
            });

            res.json({
                message: 'Request updated',
                rental: formatRental(complete, req.session.userId)
            });
        } catch (error) {
            console.error(`Transition to ${targetStatus} failed:`, error);
            res.status(500).json({ error: 'Failed to update request' });
        }
    };
}

router.post(
    '/:id/accept',
    requireAuth,
    validate({ params: schemas.idParam, body: schemas.respond }),
    transitionRoute('approved')
);

router.post(
    '/:id/reject',
    requireAuth,
    validate({ params: schemas.idParam, body: schemas.respond }),
    transitionRoute('declined')
);

router.post(
    '/:id/cancel',
    requireAuth,
    validate({ params: schemas.idParam, body: schemas.respond }),
    transitionRoute('cancelled')
);

router.post(
    '/:id/complete',
    requireAuth,
    validate({ params: schemas.idParam, body: schemas.respond }),
    transitionRoute('completed')
);

/**
 * PUT /api/rentals/:id/status
 * Legacy endpoint retained so existing frontend code keeps working; it maps
 * onto the same state machine as the verb routes above.
 */
router.put('/:id/status', requireAuth, validate({ params: schemas.idParam }), (req, res, next) => {
    const requested = String(req.body?.status || '');
    const target = toDb(requested);

    if (!['approved', 'declined', 'cancelled', 'completed'].includes(target)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    req.body = { response: req.body?.response ?? null };
    return transitionRoute(target)(req, res, next);
});

module.exports = router;

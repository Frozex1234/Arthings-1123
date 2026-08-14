/** Private messaging between authenticated users. */
const express = require('express');
const prisma = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const notifications = require('../services/notifications');

const router = express.Router();
router.use(requireAuth);

function numericUserId(value) {
    const source = String(value || '');
    const id = Number.parseInt(source.replace('user-', ''), 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function formatMessage(message) {
    return {
        id: message.id,
        senderId: `user-${message.senderId}`,
        recipientId: `user-${message.recipientId}`,
        itemId: message.itemId ? `prod-${message.itemId}` : null,
        body: message.body,
        readAt: message.readAt,
        createdAt: message.createdAt
    };
}

router.get('/conversations', async (req, res) => {
    try {
        const userId = req.session.userId;
        const messages = await prisma.message.findMany({
            where: { OR: [{ senderId: userId }, { recipientId: userId }] },
            include: {
                sender: { select: { id: true, name: true } },
                recipient: { select: { id: true, name: true } },
                item: { select: { id: true, title: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const seen = new Set();
        const conversations = messages.filter(message => {
            const otherId = message.senderId === userId ? message.recipientId : message.senderId;
            const key = `${otherId}:${message.itemId || ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map(message => {
            const other = message.senderId === userId ? message.recipient : message.sender;
            return {
                userId: `user-${other.id}`,
                userName: other.name,
                itemId: message.itemId ? `prod-${message.itemId}` : null,
                itemTitle: message.item?.title || null,
                lastMessage: message.body,
                lastMessageAt: message.createdAt,
                unread: message.recipientId === userId && !message.readAt
            };
        });
        res.json({ conversations });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

router.get('/:userId', async (req, res) => {
    try {
        const userId = req.session.userId;
        const otherUserId = numericUserId(req.params.userId);
        const itemId = req.query.itemId ? Number.parseInt(String(req.query.itemId).replace('prod-', ''), 10) : null;
        if (!otherUserId || otherUserId === userId) return res.status(400).json({ error: 'Choose another user' });

        const where = {
            OR: [
                { senderId: userId, recipientId: otherUserId },
                { senderId: otherUserId, recipientId: userId }
            ],
            ...(itemId ? { itemId } : {})
        };
        const messages = await prisma.message.findMany({ where, orderBy: { createdAt: 'asc' } });
        await prisma.message.updateMany({
            where: { senderId: otherUserId, recipientId: userId, readAt: null, ...(itemId ? { itemId } : {}) },
            data: { readAt: new Date() }
        });
        res.json({ messages: messages.map(formatMessage) });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

router.post('/', async (req, res) => {
    try {
        const senderId = req.session.userId;
        const recipientId = numericUserId(req.body.recipientId);
        const itemId = req.body.itemId ? Number.parseInt(String(req.body.itemId).replace('prod-', ''), 10) : null;
        const body = String(req.body.body || '').trim();
        if (!recipientId || recipientId === senderId) return res.status(400).json({ error: 'Choose another user' });
        if (!body || body.length > 2000) return res.status(400).json({ error: 'Message must contain 1–2000 characters' });

        const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
        if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
        if (itemId) {
            const item = await prisma.item.findUnique({ where: { id: itemId }, select: { userId: true } });
            if (!item) return res.status(404).json({ error: 'Listing not found' });
            if (item.userId !== senderId && item.userId !== recipientId) return res.status(403).json({ error: 'This listing is not associated with the conversation' });
        }
        const message = await prisma.message.create({ data: { senderId, recipientId, itemId, body } });

        // Best-effort: a failed notification must not fail the send.
        prisma.user
            .findUnique({ where: { id: senderId }, select: { name: true } })
            .then(sender => notifications.notify({
                userId: recipientId,
                type: 'message_received',
                title: `Нове повідомлення від ${sender?.name || 'користувача'}`,
                body: body.slice(0, 140),
                link: `/pages/messages.html?user=user-${senderId}${itemId ? `&itemId=prod-${itemId}` : ''}`
            }))
            .catch(() => {});

        res.status(201).json({ message: formatMessage(message) });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

module.exports = router;

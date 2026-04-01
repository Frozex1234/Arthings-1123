/**
 * ===========================================
 * Arthings - Products/Items Routes
 * ===========================================
 * 
 * Handles CRUD operations for rentable items
 */

const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const prisma = require('../db/db');

const router = express.Router();

// Multer configuration for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Vercel only allows writing to /tmp directory
        const isVercel = process.env.VERCEL === '1';
        const uploadDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../../uploads');
        
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});

/**
 * GET /api/products
 * Get all products with optional filtering
 */
router.get('/', async (req, res) => {
    try {
        const { search, category, minPrice, maxPrice, available, city, userId, sort } = req.query;

        // Build where clause
        const where = {};

        // Filter by search query (title and description)
        if (search) {
            where.OR = [
                { title: { contains: search } },
                { description: { contains: search } }
            ];
        }

        // Filter by category
        if (category) {
            where.category = category;
        }

        // Filter by price range
        if (minPrice || maxPrice) {
            where.pricePerDay = {};
            if (minPrice) where.pricePerDay.gte = parseFloat(minPrice);
            if (maxPrice) where.pricePerDay.lte = parseFloat(maxPrice);
        }

        // Filter by availability
        if (available !== undefined) {
            where.isAvailable = available === 'true';
        }

        // Filter by city
        if (city) {
            where.city = { equals: city, mode: 'insensitive' };
        }

        // Filter by user (for my-listings)
        if (userId) {
            // Handle both "user-123" format and numeric ID
            const numericId = userId.startsWith('user-')
                ? parseInt(userId.replace('user-', ''))
                : parseInt(userId);
            if (!isNaN(numericId)) {
                where.userId = numericId;
            }
        }

        // Build orderBy
        let orderBy = { createdAt: 'desc' }; // Default: newest first
        if (sort) {
            switch (sort) {
                case 'price-asc':
                    orderBy = { pricePerDay: 'asc' };
                    break;
                case 'price-desc':
                    orderBy = { pricePerDay: 'desc' };
                    break;
                case 'newest':
                    orderBy = { createdAt: 'desc' };
                    break;
                case 'popular':
                    orderBy = { views: 'desc' };
                    break;
            }
        }

        // Fetch products with relations
        const products = await prisma.item.findMany({
            where,
            orderBy,
            include: {
                user: {
                    select: { id: true, name: true, city: true }
                },
                images: {
                    orderBy: { sortOrder: 'asc' }
                }
            }
        });

        // Transform to match expected format
        const formattedProducts = products.map(p => ({
            id: `prod-${p.id}`,
            userId: `user-${p.userId}`,
            title: p.title,
            description: p.description,
            category: p.category,
            price: Number(p.pricePerDay),
            priceUnit: p.priceUnit,
            city: p.city,
            available: p.isAvailable,
            images: p.images.map(img => img.imagePath),
            views: p.views,
            createdAt: p.createdAt.toISOString(),
            ownerName: p.user?.name || 'Unknown',
            ownerCity: p.user?.city || ''
        }));

        res.json({ products: formattedProducts, total: formattedProducts.length });

    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ error: 'Failed to get products' });
    }
});

/**
 * GET /api/products/:id
 * Get single product by ID
 */
router.get('/:id', async (req, res) => {
    try {
        // Handle both "prod-123" format and numeric ID
        const idParam = req.params.id;
        const numericId = idParam.startsWith('prod-')
            ? parseInt(idParam.replace('prod-', ''))
            : parseInt(idParam);

        if (isNaN(numericId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        const product = await prisma.item.findUnique({
            where: { id: numericId },
            include: {
                user: {
                    select: { id: true, name: true, city: true, phone: true }
                },
                images: {
                    orderBy: { sortOrder: 'asc' }
                }
            }
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Increment view count
        await prisma.item.update({
            where: { id: numericId },
            data: { views: { increment: 1 } }
        });

        res.json({
            product: {
                id: `prod-${product.id}`,
                userId: `user-${product.userId}`,
                title: product.title,
                description: product.description,
                category: product.category,
                price: Number(product.pricePerDay),
                priceUnit: product.priceUnit,
                city: product.city,
                available: product.isAvailable,
                images: product.images.map(img => img.imagePath),
                views: product.views + 1,
                createdAt: product.createdAt.toISOString(),
                ownerName: product.user?.name || 'Unknown',
                ownerCity: product.user?.city || '',
                ownerPhone: product.user?.phone || ''
            }
        });

    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ error: 'Failed to get product' });
    }
});

/**
 * POST /api/products
 * Create new product (authenticated)
 */
router.post('/', upload.array('images', 5), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { title, description, category, price, priceUnit, city } = req.body;

        // Validation
        if (!title || !description || !category || !price) {
            return res.status(400).json({ error: 'Title, description, category, and price are required' });
        }

        // Create product with images in a transaction
        const newProduct = await prisma.$transaction(async (tx) => {
            // Create product
            const product = await tx.item.create({
                data: {
                    userId: req.session.userId,
                    title,
                    description,
                    pricePerDay: parseFloat(price),
                    priceUnit: priceUnit || 'day',
                    category,
                    city: city || null,
                    isAvailable: true,
                    views: 0
                }
            });

            // Create image records
            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    await tx.itemImage.create({
                        data: {
                            itemId: product.id,
                            imagePath: '/uploads/' + req.files[i].filename,
                            sortOrder: i
                        }
                    });
                }
            }

            return product;
        });

        // Fetch complete product with images
        const productWithImages = await prisma.item.findUnique({
            where: { id: newProduct.id },
            include: { images: { orderBy: { sortOrder: 'asc' } } }
        });

        res.status(201).json({
            message: 'Product created successfully',
            product: {
                id: `prod-${productWithImages.id}`,
                userId: `user-${productWithImages.userId}`,
                title: productWithImages.title,
                description: productWithImages.description,
                category: productWithImages.category,
                price: Number(productWithImages.pricePerDay),
                priceUnit: productWithImages.priceUnit,
                city: productWithImages.city,
                available: productWithImages.isAvailable,
                images: productWithImages.images.map(img => img.imagePath),
                views: productWithImages.views,
                createdAt: productWithImages.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

/**
 * PUT /api/products/:id
 * Update product (owner only)
 */
router.put('/:id', upload.array('images', 5), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Parse ID
        const idParam = req.params.id;
        const numericId = idParam.startsWith('prod-')
            ? parseInt(idParam.replace('prod-', ''))
            : parseInt(idParam);

        if (isNaN(numericId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        // Check ownership
        const existingProduct = await prisma.item.findUnique({
            where: { id: numericId }
        });

        if (!existingProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (existingProduct.userId !== req.session.userId) {
            return res.status(403).json({ error: 'You can only edit your own products' });
        }

        const { title, description, category, price, priceUnit, city, available } = req.body;

        // Update product with images in a transaction
        const updatedProduct = await prisma.$transaction(async (tx) => {
            // Update product fields
            const product = await tx.item.update({
                where: { id: numericId },
                data: {
                    ...(title && { title }),
                    ...(description && { description }),
                    ...(category && { category }),
                    ...(price && { pricePerDay: parseFloat(price) }),
                    ...(priceUnit && { priceUnit }),
                    ...(city !== undefined && { city: city || null }),
                    ...(available !== undefined && { isAvailable: available === 'true' || available === true })
                }
            });

            // Add new images if uploaded
            if (req.files && req.files.length > 0) {
                // Get current max sort order
                const lastImage = await tx.itemImage.findFirst({
                    where: { itemId: numericId },
                    orderBy: { sortOrder: 'desc' }
                });
                const startOrder = lastImage ? lastImage.sortOrder + 1 : 0;

                for (let i = 0; i < req.files.length; i++) {
                    await tx.itemImage.create({
                        data: {
                            itemId: product.id,
                            imagePath: '/uploads/' + req.files[i].filename,
                            sortOrder: startOrder + i
                        }
                    });
                }
            }

            return product;
        });

        // Fetch complete product with images
        const productWithImages = await prisma.item.findUnique({
            where: { id: updatedProduct.id },
            include: { images: { orderBy: { sortOrder: 'asc' } } }
        });

        res.json({
            message: 'Product updated successfully',
            product: {
                id: `prod-${productWithImages.id}`,
                userId: `user-${productWithImages.userId}`,
                title: productWithImages.title,
                description: productWithImages.description,
                category: productWithImages.category,
                price: Number(productWithImages.pricePerDay),
                priceUnit: productWithImages.priceUnit,
                city: productWithImages.city,
                available: productWithImages.isAvailable,
                images: productWithImages.images.map(img => img.imagePath),
                views: productWithImages.views,
                createdAt: productWithImages.createdAt.toISOString()
            }
        });

    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

/**
 * DELETE /api/products/:id
 * Delete product (owner only)
 */
router.delete('/:id', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Parse ID
        const idParam = req.params.id;
        const numericId = idParam.startsWith('prod-')
            ? parseInt(idParam.replace('prod-', ''))
            : parseInt(idParam);

        if (isNaN(numericId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        // Fetch product with images
        const product = await prisma.item.findUnique({
            where: { id: numericId },
            include: { images: true }
        });

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        if (product.userId !== req.session.userId) {
            return res.status(403).json({ error: 'You can only delete your own products' });
        }

        // Delete associated image files from filesystem
        for (const img of product.images) {
            const fullPath = path.join(__dirname, '../..', img.imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        // Delete product (cascade will delete images, favorites, rentals)
        await prisma.item.delete({
            where: { id: numericId }
        });

        res.json({ message: 'Product deleted successfully' });

    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

module.exports = router;

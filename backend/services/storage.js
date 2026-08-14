/**
 * ===========================================
 * Arthings - Upload Storage
 * ===========================================
 *
 * Abstracts where listing photos live.
 *
 *   local — writes to ./uploads. Fine on a VM or during development.
 *   blob  — pushes to Vercel Blob. Required in serverless deployments, where
 *           the filesystem is ephemeral and per-invocation: anything written
 *           to disk disappears on the next request and is invisible to other
 *           instances.
 *
 * Routes call `persistFiles()` and receive public URLs; they never care which
 * driver is active.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const isBlob = config.storage.driver === 'blob';

/**
 * Blob uploads need the file body in hand, so memory storage is used there.
 * Local uploads stream straight to disk to keep peak memory flat.
 */
const storage = isBlob
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
            cb(null, UPLOAD_DIR);
        },
        filename: (req, file, cb) => {
            cb(null, uuidv4() + path.extname(file.originalname).toLowerCase());
        }
    });

/**
 * Multer instance shared by every upload route.
 *
 * Note the extension is derived from the *mimetype*, never from the client's
 * filename, so a `.php`/`.svg` name cannot ride along with an image mimetype.
 */
const uploader = multer({
    storage,
    limits: {
        fileSize: config.storage.maxFileBytes,
        files: config.storage.maxFilesPerListing
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        const error = new Error('Only JPEG, PNG, GIF and WebP images are allowed.');
        error.code = 'INVALID_FILE_TYPE';
        cb(error);
    }
});

function extensionFor(mimetype) {
    switch (mimetype) {
        case 'image/png': return '.png';
        case 'image/gif': return '.gif';
        case 'image/webp': return '.webp';
        default: return '.jpg';
    }
}

let blobClient = null;
function getBlobClient() {
    if (blobClient) return blobClient;
    try {
        // Lazily required so a local install without the package still boots.
        blobClient = require('@vercel/blob');
    } catch {
        throw new Error(
            'STORAGE_DRIVER=blob requires the @vercel/blob package. ' +
            'Run: npm install @vercel/blob'
        );
    }
    return blobClient;
}

/**
 * Persists uploaded files and returns their public URLs, in input order.
 *
 * @param {Array} files - multer file objects
 * @returns {Promise<string[]>}
 */
async function persistFiles(files) {
    if (!files || files.length === 0) return [];

    if (!isBlob) {
        // diskStorage already wrote them; just map to their public path.
        return files.map(file => `/uploads/${file.filename}`);
    }

    const { put } = getBlobClient();
    return Promise.all(
        files.map(async file => {
            const key = `listings/${uuidv4()}${extensionFor(file.mimetype)}`;
            const result = await put(key, file.buffer, {
                access: 'public',
                contentType: file.mimetype,
                token: config.storage.blobToken
            });
            return result.url;
        })
    );
}

/**
 * Best-effort removal of a previously stored file.
 * Never throws: a failed cleanup must not fail the user's delete request.
 *
 * @param {string} url - value previously returned by persistFiles()
 */
async function deleteFile(url) {
    if (!url) return;

    try {
        if (url.startsWith('/uploads/')) {
            const filename = path.basename(url);
            // Guard against traversal via a crafted stored path.
            const target = path.join(UPLOAD_DIR, filename);
            if (!target.startsWith(UPLOAD_DIR)) return;
            await fsp.unlink(target).catch(() => {});
            return;
        }

        if (isBlob && url.startsWith('http')) {
            const { del } = getBlobClient();
            await del(url, { token: config.storage.blobToken });
        }
    } catch (error) {
        console.error('Storage cleanup failed:', url, error.message);
    }
}

/**
 * Translates multer's errors into user-facing messages.
 * Without this, an oversized upload surfaces as a generic 500.
 */
function handleUploadError(error, req, res, next) {
    if (error instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: `Each image must be ${Math.round(config.storage.maxFileBytes / (1024 * 1024))}MB or smaller.`,
            LIMIT_FILE_COUNT: `You can upload at most ${config.storage.maxFilesPerListing} images.`,
            LIMIT_UNEXPECTED_FILE: 'Unexpected file field.'
        };
        return res.status(400).json({
            error: messages[error.code] || 'Upload failed.',
            code: error.code
        });
    }

    if (error && error.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ error: error.message, code: error.code });
    }

    next(error);
}

module.exports = {
    uploader,
    persistFiles,
    deleteFile,
    handleUploadError,
    UPLOAD_DIR
};

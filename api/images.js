// Cover pictures and cutting drawings in PRIVATE Vercel Blob storage, so the
// catalog JSON carries short references instead of base64 images.
//   POST /api/images { dataUrl } → { url: '/api/images?p=img/<id>.jpg' }   (admin)
//                                  501 storage_off when no Blob store is linked
//   GET  /api/images?p=img/<id>.jpg → the image                          (admin or workshop device)
// Blobs are never public: every read goes through the same access check as
// the catalog.
import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';
import { getAdminUser } from './_lib/session.js';
import { getUserByUsername } from './_lib/db.js';
import { canRead, resolveReader } from './_lib/access.js';
import { neonSettingsStore } from './_lib/settingsStore.js';
import { PayloadTooLargeError, readJsonBody } from './_lib/http.js';

export const IMAGE_PATH_RE = /^img\/[0-9a-f]{32}\.(jpg|png|webp|gif)$/;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// base64 is 4/3 of the bytes; keep under Vercel's 4.5 MB request limit
const BODY_LIMIT = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 1024;

export const blobConfigured = (env = process.env) => Boolean(env.BLOB_READ_WRITE_TOKEN);

/** { buffer, ext, contentType } from a raster data URL, or null. */
export function decodeDataUrl(dataUrl) {
    const m = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_RE) : null;
    if (!m) return null;
    const type = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    return { buffer, ext: type === 'jpeg' ? 'jpg' : type, contentType: `image/${type}` };
}

export async function handleImages(req, res, opts = {}) {
    const blob = opts.blob ?? { get, put };
    const settings = opts.settingsStore ?? neonSettingsStore;
    const env = opts.env ?? process.env;
    const lookupUser = opts.lookupUser ?? getUserByUsername;
    try {
        if (req.method === 'GET') {
            const path = req.query?.p;
            if (typeof path !== 'string' || !IMAGE_PATH_RE.test(path)) {
                res.status(400).json({ error: 'bad_path' });
                return;
            }
            if (!canRead(await resolveReader(req.headers?.cookie, settings, { lookupUser }))) {
                res.status(401).json({ error: 'locked' });
                return;
            }
            const found = await blob.get(path, { access: 'private' });
            if (!found?.stream) {
                res.status(404).json({ error: 'not_found' });
                return;
            }
            res.setHeader('Content-Type', found.blob?.contentType || 'image/jpeg');
            // a day, so a device signed out by a new workshop code does not keep them for long
            res.setHeader('Cache-Control', 'private, max-age=86400');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const bytes = Buffer.from(await new Response(found.stream).arrayBuffer());
            res.status(200).send(bytes);
            return;
        }

        if (req.method === 'POST') {
            if (!(await getAdminUser(req.headers?.cookie, lookupUser))) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
            if (!blobConfigured(env)) {
                res.status(501).json({ error: 'storage_off', message: 'No Blob store is linked; images stay inside the catalog.' });
                return;
            }
            const body = await readJsonBody(req, { maxBytes: BODY_LIMIT });
            const img = decodeDataUrl(body?.dataUrl);
            if (!img) {
                res.status(400).json({ error: 'invalid_image', message: 'Only PNG, JPEG, WebP or GIF up to 2 MB.' });
                return;
            }
            const path = `img/${crypto.randomBytes(16).toString('hex')}.${img.ext}`;
            await blob.put(path, img.buffer, { access: 'private', contentType: img.contentType, addRandomSuffix: false });
            res.status(200).json({ url: `/api/images?p=${path}` });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof PayloadTooLargeError) {
            res.status(413).json({ error: err.code, message: 'Image is too large.' });
            return;
        }
        console.error('/api/images failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export default function handler(req, res) {
    return handleImages(req, res);
}

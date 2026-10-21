import { describe, it, expect, beforeEach } from 'vitest';
import { handleImages, decodeDataUrl, IMAGE_PATH_RE } from './images.js';
import { fakeAdmin } from './_lib/fakeAdmin.js';
import { ACCESS_COOKIE, signAccess } from './_lib/access.js';
import { isSafeImageSrc } from '../src/domain/migration.js';

const SECRET = 'images-test-secret';
const PNG = `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`;
const settingsStore = { async getWorkshopCode() { return { hash: 'h', salt: 's', version: 1 }; } };

function mockRes() {
    return {
        statusCode: null, headers: {}, body: undefined,
        status(c) { this.statusCode = c; return this; },
        setHeader(k, v) { this.headers[k] = v; },
        json(o) { this.body = o; return this; },
        send(b) { this.body = b; return this; },
    };
}

function memoryBlob() {
    const files = new Map();
    return {
        files,
        async put(path, buffer, opts) {
            expect(opts.access).toBe('private');
            files.set(path, { buffer, contentType: opts.contentType });
            return { pathname: path };
        },
        async get(path) {
            const f = files.get(path);
            if (!f) return null;
            return { stream: new Response(f.buffer).body, blob: { contentType: f.contentType } };
        },
    };
}

const admin = () => fakeAdmin('Tomek', SECRET).cookie;
const lookupUser = fakeAdmin('Tomek', SECRET).lookupUser;
const workshop = () => `${ACCESS_COOKIE}=${signAccess(1, { secret: SECRET })}`;
const ENV = { BLOB_READ_WRITE_TOKEN: 'x' };

async function call(req, blob, env = ENV) {
    const res = mockRes();
    await handleImages({ headers: {}, ...req }, res, { blob, settingsStore, env, lookupUser });
    return res;
}

beforeEach(() => { process.env.SESSION_SECRET = SECRET; });

describe('/api/images', () => {
    it('admin upload → private blob → workshop device can read it back', async () => {
        const blob = memoryBlob();
        const up = await call({ method: 'POST', headers: { cookie: admin() }, body: { dataUrl: PNG } }, blob);
        expect(up.statusCode).toBe(200);
        expect(isSafeImageSrc(up.body.url)).toBe(true);
        const path = up.body.url.split('p=')[1];
        expect(IMAGE_PATH_RE.test(path)).toBe(true);

        const read = await call({ method: 'GET', query: { p: path }, headers: { cookie: workshop() } }, blob);
        expect(read.statusCode).toBe(200);
        expect(read.headers['Content-Type']).toBe('image/png');
        expect(read.body.toString()).toBe('fake-png-bytes');
    });

    it('reading needs access', async () => {
        const blob = memoryBlob();
        const res = await call({ method: 'GET', query: { p: `img/${'a'.repeat(32)}.jpg` } }, blob);
        expect(res.statusCode).toBe(401);
    });

    it('rejects paths outside img/<hex>', async () => {
        for (const p of ['../secret', 'img/x.jpg', `img/${'a'.repeat(32)}.svg`, undefined]) {
            const res = await call({ method: 'GET', query: { p }, headers: { cookie: admin() } }, memoryBlob());
            expect(res.statusCode).toBe(400);
        }
    });

    it('upload needs an admin session, a raster image and a linked store', async () => {
        const blob = memoryBlob();
        expect((await call({ method: 'POST', headers: { cookie: workshop() }, body: { dataUrl: PNG } }, blob)).statusCode).toBe(401);
        expect((await call({ method: 'POST', headers: { cookie: admin() }, body: { dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' } }, blob)).statusCode).toBe(400);
        expect((await call({ method: 'POST', headers: { cookie: admin() }, body: { dataUrl: PNG } }, blob, {})).statusCode).toBe(501);
        expect(blob.files.size).toBe(0);
    });

    it('decodes only raster data URLs', () => {
        expect(decodeDataUrl(PNG).ext).toBe('png');
        expect(decodeDataUrl('data:image/jpg;base64,AAAA').contentType).toBe('image/jpeg');
        expect(decodeDataUrl('https://example.com/a.png')).toBeNull();
    });
});

describe('catalog image values', () => {
    it('accepts data URLs and stored refs, nothing else', () => {
        expect(isSafeImageSrc(PNG)).toBe(true);
        expect(isSafeImageSrc(`/api/images?p=img/${'f'.repeat(32)}.jpg`)).toBe(true);
        expect(isSafeImageSrc('https://evil.example/x.png')).toBe(false);
        expect(isSafeImageSrc(`/api/images?p=img/${'f'.repeat(32)}.jpg&x=1`)).toBe(false);
    });
});

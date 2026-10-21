import { describe, it, expect } from 'vitest';
import { handleState } from './state.js';
import { fakeAdmin } from './_lib/fakeAdmin.js';
import { ACCESS_COOKIE, signAccess } from './_lib/access.js';
import { hashPassword } from './_lib/password.js';

const SECRET = 'state-route-test-secret';
const code = hashPassword('workshop-123');
const settingsV2 = { async getWorkshopCode() { return { ...code, version: 2 }; } };
const okStore = { async readState() { return { data: { version: 2, holds: [], angles: [] }, revision: 4 }; } };

function mockRes() {
    return {
        statusCode: null,
        headers: {},
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        setHeader(k, v) { this.headers[k] = v; },
        json(obj) { this.body = obj; return this; },
    };
}

// store that throws if touched — proves these paths short-circuit before any DB access
const explodingStore = {
    readState() { throw new Error('store should not be touched'); },
    initState() { throw new Error('store should not be touched'); },
    commitWrite() { throw new Error('store should not be touched'); },
};

describe('/api/state read access', () => {
    it('locks GET without admin session or workshop token', async () => {
        process.env.SESSION_SECRET = SECRET;
        const res = mockRes();
        await handleState({ method: 'GET', headers: {} }, res, explodingStore, settingsV2);
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('locked');
    });

    it('serves GET to a device with a current workshop token', async () => {
        process.env.SESSION_SECRET = SECRET;
        const res = mockRes();
        const cookie = `${ACCESS_COOKIE}=${signAccess(2, { secret: SECRET })}`;
        await handleState({ method: 'GET', headers: { cookie } }, res, okStore, settingsV2);
        expect(res.statusCode).toBe(200);
        expect(res.body.revision).toBe(4);
    });

    it('locks GET when the workshop code was changed since the token was issued', async () => {
        process.env.SESSION_SECRET = SECRET;
        const res = mockRes();
        const cookie = `${ACCESS_COOKIE}=${signAccess(1, { secret: SECRET })}`;
        await handleState({ method: 'GET', headers: { cookie } }, res, explodingStore, settingsV2);
        expect(res.statusCode).toBe(401);
    });

    it('serves GET to an admin session', async () => {
        process.env.SESSION_SECRET = SECRET;
        const res = mockRes();
        const { cookie, lookupUser } = fakeAdmin('Tomek', SECRET);
        await handleState({ method: 'GET', headers: { cookie } }, res, okStore, settingsV2, { lookupUser });
        expect(res.statusCode).toBe(200);
    });
});

describe('/api/state route guards', () => {
    it('rejects an unauthenticated PUT with 401', async () => {
        const req = { method: 'PUT', headers: {} }; // no cookie
        const res = mockRes();
        await handleState(req, res, explodingStore);
        expect(res.statusCode).toBe(401);
    });

    it('rejects an invalid method with 405', async () => {
        for (const method of ['POST', 'DELETE', 'PATCH']) {
            const res = mockRes();
            await handleState({ method, headers: {} }, res, explodingStore);
            expect(res.statusCode).toBe(405);
        }
    });

    it('rejects an oversized PUT body with 413 before storage work', async () => {
        process.env.SESSION_SECRET = 'state-route-test-secret';
        const { cookie, lookupUser } = fakeAdmin('Tomek', 'state-route-test-secret');
        const res = mockRes();
        await handleState({
            method: 'PUT',
            headers: { cookie },
            body: JSON.stringify({ data: { holds: [], angles: [] }, revision: 1, pad: 'x'.repeat(6 * 1024 * 1024) }),
        }, res, explodingStore, undefined, { lookupUser });
        expect(res.statusCode).toBe(413);
        expect(res.body.error).toBe('payload_too_large');
    });
});

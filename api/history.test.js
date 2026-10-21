import { describe, it, expect } from 'vitest';
import { handleHistory } from './history.js';
import { signSession, buildSessionCookie } from './_lib/session.js';
import { fakeAdmin } from './_lib/fakeAdmin.js';

function mockRes() {
    return {
        statusCode: null,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
    };
}

const explodingStore = {
    readHistory() { throw new Error('store should not be touched'); },
};

describe('/api/history route', () => {
    it('rejects unauthenticated reads with 401', async () => {
        const res = mockRes();
        await handleHistory({ method: 'GET', headers: {}, query: {} }, res, explodingStore);
        expect(res.statusCode).toBe(401);
    });

    it('rejects invalid methods with 405', async () => {
        for (const method of ['POST', 'PUT', 'DELETE']) {
            const res = mockRes();
            await handleHistory({ method, headers: {}, query: {} }, res, explodingStore);
            expect(res.statusCode).toBe(405);
        }
    });

    it('returns newest history rows for a valid session', async () => {
        process.env.SESSION_SECRET = 'test-secret';
        const rows = [{ id: 10, username: 'Tomek', action: 'hold_added', entity: 'Austin' }];
        const store = {
            async readHistory(limit) {
                expect(limit).toBe(50);
                return rows;
            },
        };
        const { cookie, lookupUser } = fakeAdmin('Tomek', 'test-secret');
        const res = mockRes();
        await handleHistory(
            { method: 'GET', headers: { cookie }, query: { limit: '50' } },
            res,
            store,
            { lookupUser },
        );
        expect(res.statusCode).toBe(200);
        expect(res.body.rows).toEqual(rows);
    });

    it('rejects a session opened before a password change', async () => {
        process.env.SESSION_SECRET = 'test-secret';
        const cookie = buildSessionCookie(signSession('Tomek', { secret: 'test-secret', fp: 'old-fingerprint' }), { secure: false });
        const { lookupUser } = fakeAdmin('Tomek', 'test-secret');
        const res = mockRes();
        await handleHistory({ method: 'GET', headers: { cookie }, query: {} }, res, explodingStore, { lookupUser });
        expect(res.statusCode).toBe(401);
    });

    it('rejects a session without a password fingerprint (pre-2.0 cookie)', async () => {
        process.env.SESSION_SECRET = 'test-secret';
        const cookie = buildSessionCookie(signSession('Tomek', { secret: 'test-secret' }), { secure: false });
        const { lookupUser } = fakeAdmin('Tomek', 'test-secret');
        const res = mockRes();
        await handleHistory({ method: 'GET', headers: { cookie }, query: {} }, res, explodingStore, { lookupUser });
        expect(res.statusCode).toBe(401);
    });

    it('keeps the original assertion shape', async () => {
        const rows = [];
        const store = { async readHistory() { return rows; } };
        process.env.SESSION_SECRET = 'test-secret';
        const { cookie, lookupUser } = fakeAdmin('Tomek', 'test-secret');
        const res = mockRes();
        await handleHistory({ method: 'GET', headers: { cookie }, query: {} }, res, store, { lookupUser });
        expect(res.statusCode).toBe(200);
        expect(res.body.rows).toEqual(rows);
    });
});

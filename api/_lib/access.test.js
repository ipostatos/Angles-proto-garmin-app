import { describe, it, expect } from 'vitest';
import { ACCESS_COOKIE, signAccess, verifyAccess, resolveReader, isAcceptableWorkshopCode } from './access.js';
import { COOKIE_NAME, signSession, verifySession } from './session.js';

const opts = { secret: 'access-test-secret' };
const settings = (version) => ({ async getWorkshopCode() { return version ? { hash: 'h', salt: 's', version } : null; } });

describe('workshop access token', () => {
    it('verifies for the version it was issued for only', () => {
        const t = signAccess(3, opts);
        expect(verifyAccess(t, 3, opts)).toBe(true);
        expect(verifyAccess(t, 4, opts)).toBe(false);
    });

    it('expires', () => {
        const t = signAccess(1, { ...opts, now: 0, ttlMs: 1000 });
        expect(verifyAccess(t, 1, { ...opts, now: 2000 })).toBe(false);
    });

    it('rejects a tampered payload', () => {
        const t = signAccess(1, opts);
        const [, sig] = t.split('.');
        const forged = `${Buffer.from(JSON.stringify({ v: 1, e: Date.now() + 1e9 })).toString('base64url')}.${sig}`;
        expect(verifyAccess(forged, 1, opts)).toBe(false);
    });

    it('cannot be replayed as an admin session (different key)', () => {
        const t = signAccess(1, opts);
        expect(verifySession(t, opts)).toBeNull();
    });

    it('an admin token is not a workshop token', () => {
        expect(verifyAccess(signSession('Tomek', opts), 1, opts)).toBe(false);
    });
});

describe('resolveReader', () => {
    it('admin session wins without touching settings', async () => {
        const cookie = `${COOKIE_NAME}=${signSession('Tomek', opts)}`;
        const r = await resolveReader(cookie, { getWorkshopCode() { throw new Error('no'); } }, opts);
        expect(r).toEqual({ username: 'Tomek', workshop: false });
    });

    it('workshop token against current version', async () => {
        const cookie = `${ACCESS_COOKIE}=${signAccess(5, opts)}`;
        expect((await resolveReader(cookie, settings(5), opts)).workshop).toBe(true);
        expect((await resolveReader(cookie, settings(6), opts)).workshop).toBe(false);
    });

    it('no code configured means no workshop access', async () => {
        const cookie = `${ACCESS_COOKIE}=${signAccess(1, opts)}`;
        expect((await resolveReader(cookie, settings(null), opts)).workshop).toBe(false);
    });
});

describe('isAcceptableWorkshopCode', () => {
    it('needs at least 6 characters', () => {
        expect(isAcceptableWorkshopCode('12345')).toBe(false);
        expect(isAcceptableWorkshopCode('123456')).toBe(true);
        expect(isAcceptableWorkshopCode('      ')).toBe(false);
    });
});

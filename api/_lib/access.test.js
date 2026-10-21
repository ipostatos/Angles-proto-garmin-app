import { describe, it, expect } from 'vitest';
import { ACCESS_COOKIE, signAccess, verifyAccess, resolveReader, isAcceptableWorkshopCode } from './access.js';
import { COOKIE_NAME, passwordFingerprint, signSession, verifySession } from './session.js';
import { ipBucket } from './rateLimit.js';

const opts = { secret: 'access-test-secret' };
const settings = (version) => ({ async getWorkshopCode() { return version ? { hash: 'h', salt: 's', version } : null; } });

describe('rate limit buckets', () => {
    it('groups IPv6 by /64 and keeps IPv4 as is', () => {
        expect(ipBucket('2001:db8:1:2:aaaa::1')).toBe(ipBucket('2001:db8:1:2:ffff:ffff:ffff:ffff'));
        expect(ipBucket('2001:db8:1:2::1')).not.toBe(ipBucket('2001:db8:1:3::1'));
        expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
        expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    });
});

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
        const fp = passwordFingerprint('h1');
        const cookie = `${COOKIE_NAME}=${signSession('Tomek', { ...opts, fp })}`;
        const lookupUser = async () => ({ pass_hash: 'h1' });
        const r = await resolveReader(cookie, { getWorkshopCode() { throw new Error('no'); } }, { ...opts, lookupUser });
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
    it('needs at least 8 characters', () => {
        expect(isAcceptableWorkshopCode('1234567')).toBe(false);
        expect(isAcceptableWorkshopCode('12345678')).toBe(true);
        expect(isAcceptableWorkshopCode('        ')).toBe(false);
    });
});

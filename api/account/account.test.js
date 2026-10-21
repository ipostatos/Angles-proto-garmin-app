import { describe, it, expect, beforeEach } from 'vitest';
import { handleAccount, setupTokenRequired } from './[action].js';
import { hashPassword } from '../_lib/password.js';
import { ACCESS_COOKIE, verifyAccess } from '../_lib/access.js';
import { COOKIE_NAME, buildSessionCookie, signSession, verifySession } from '../_lib/session.js';

const SECRET = 'account-test-secret';

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

function memorySettings({ users = [], code = null } = {}) {
    const state = { users: [...users], code, events: [] };
    return {
        state,
        async getWorkshopCode() { return state.code; },
        async setWorkshopCode({ hash, salt }) {
            state.code = { hash, salt, version: (state.code?.version ?? 0) + 1 };
            return state.code.version;
        },
        async countUsers() { return state.users.length; },
        async createFirstUser(u) {
            if (state.users.length) return false;
            state.users.push({ username: u.username, pass_hash: u.hash, salt: u.salt });
            return true;
        },
        async updatePassword({ username, hash, salt }) {
            const u = state.users.find((x) => x.username === username);
            if (!u) return false;
            u.pass_hash = hash; u.salt = salt;
            return true;
        },
        async logEvent(e) { state.events.push(e); },
    };
}

function memoryRate() {
    const m = new Map();
    return {
        async getFailureCount(k) { return m.get(k) ?? 0; },
        async recordFailure(k) { m.set(k, (m.get(k) ?? 0) + 1); },
        async clearFailures(k) { m.delete(k); },
    };
}

function call(action, { method = 'POST', body = {}, cookie, settings, env = {}, rate = memoryRate() } = {}) {
    const res = mockRes();
    const lookupUser = async (name) => settings.state.users.find((u) => u.username === name) ?? null;
    return handleAccount(
        { method, query: { action }, headers: cookie ? { cookie } : {}, body },
        res,
        { settings, rateStore: rate, lookupUser, env },
    ).then(() => res);
}

function cookieValue(setCookie, name) {
    const m = String(setCookie).match(new RegExp(`${name}=([^;]*)`));
    return m ? m[1] : null;
}

const userWith = (username, password) => {
    const { hash, salt } = hashPassword(password);
    return { username, pass_hash: hash, salt };
};

beforeEach(() => { process.env.SESSION_SECRET = SECRET; });

describe('setupTokenRequired', () => {
    it('is required on Vercel and when a token is configured', () => {
        expect(setupTokenRequired({})).toBe(false);
        expect(setupTokenRequired({ VERCEL_ENV: 'production' })).toBe(true);
        expect(setupTokenRequired({ SETUP_TOKEN: 'x' })).toBe(true);
    });
});

describe('/api/account/status', () => {
    it('reports first-run state', async () => {
        const res = await call('status', { method: 'GET', settings: memorySettings() });
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ needsSetup: true, hasWorkshopCode: false, username: null, workshop: false });
    });
});

describe('/api/account/setup', () => {
    const good = { username: 'Owner', password: 'long-password-1', workshopCode: 'saw-2026' };

    it('creates the first admin, sets the workshop code and signs in', async () => {
        const settings = memorySettings();
        const res = await call('setup', { body: good, settings });
        expect(res.statusCode).toBe(200);
        expect(settings.state.users).toHaveLength(1);
        expect(settings.state.code.version).toBe(1);
        const token = cookieValue(res.headers['Set-Cookie'], COOKIE_NAME);
        expect(verifySession(token, { secret: SECRET }).username).toBe('Owner');
    });

    it('refuses once an admin exists', async () => {
        const settings = memorySettings({ users: [userWith('Tomek', 'whatever-123')] });
        const res = await call('setup', { body: good, settings });
        expect(res.statusCode).toBe(409);
        expect(settings.state.code).toBeNull();
    });

    it('needs the setup token on Vercel', async () => {
        const env = { VERCEL_ENV: 'production', SETUP_TOKEN: 'tok-123' };
        const settings = memorySettings();
        expect((await call('setup', { body: good, settings, env })).statusCode).toBe(403);
        expect((await call('setup', { body: { ...good, setupToken: 'tok-123' }, settings, env })).statusCode).toBe(200);
    });

    it('is closed on Vercel when no SETUP_TOKEN is configured', async () => {
        const res = await call('setup', { body: good, settings: memorySettings(), env: { VERCEL_ENV: 'production' } });
        expect(res.statusCode).toBe(503);
    });

    it('rejects a short password or code', async () => {
        const settings = memorySettings();
        expect((await call('setup', { body: { ...good, password: 'short' }, settings })).statusCode).toBe(400);
        expect((await call('setup', { body: { ...good, workshopCode: '123' }, settings })).statusCode).toBe(400);
        expect(settings.state.users).toHaveLength(0);
    });
});

describe('/api/account/unlock', () => {
    it('sets a workshop cookie for the right code', async () => {
        const { hash, salt } = hashPassword('saw-2026');
        const settings = memorySettings({ code: { hash, salt, version: 3 } });
        const res = await call('unlock', { body: { code: ' saw-2026 ' }, settings });
        expect(res.statusCode).toBe(200);
        expect(verifyAccess(cookieValue(res.headers['Set-Cookie'], ACCESS_COOKIE), 3, { secret: SECRET })).toBe(true);
    });

    it('rejects a wrong code and throttles repeated guesses', async () => {
        const { hash, salt } = hashPassword('saw-2026');
        const settings = memorySettings({ code: { hash, salt, version: 1 } });
        const rate = memoryRate();
        for (let i = 0; i < 8; i++) {
            expect((await call('unlock', { body: { code: `nope-${i}` }, settings, rate })).statusCode).toBe(401);
        }
        expect((await call('unlock', { body: { code: 'saw-2026' }, settings, rate })).statusCode).toBe(429);
    });

    it('is locked when no code is configured', async () => {
        const res = await call('unlock', { body: { code: 'anything' }, settings: memorySettings() });
        expect(res.statusCode).toBe(401);
    });
});

describe('admin-only actions', () => {
    const admin = () => buildSessionCookie(signSession('Tomek', { secret: SECRET }), { secure: false });

    it('need a session', async () => {
        const settings = memorySettings();
        expect((await call('password', { body: {}, settings })).statusCode).toBe(401);
        expect((await call('workshop-code', { body: { code: 'new-code-1' }, settings })).statusCode).toBe(401);
    });

    it('password change checks the current password', async () => {
        const settings = memorySettings({ users: [userWith('Tomek', 'old-password-1')] });
        const bad = await call('password', { cookie: admin(), settings, body: { currentPassword: 'wrong', newPassword: 'new-password-1' } });
        expect(bad.statusCode).toBe(403);
        const ok = await call('password', { cookie: admin(), settings, body: { currentPassword: 'old-password-1', newPassword: 'new-password-1' } });
        expect(ok.statusCode).toBe(200);
        expect(settings.state.events[0].action).toBe('password_changed');
    });

    it('new workshop code bumps the version', async () => {
        const { hash, salt } = hashPassword('saw-2026');
        const settings = memorySettings({ code: { hash, salt, version: 1 } });
        const res = await call('workshop-code', { cookie: admin(), settings, body: { code: 'saw-2027' } });
        expect(res.statusCode).toBe(200);
        expect(settings.state.code.version).toBe(2);
    });
});

describe('routing', () => {
    it('clears the workshop cookie on lock', async () => {
        const res = await call('lock', { settings: memorySettings() });
        expect(res.headers['Set-Cookie']).toContain(`${ACCESS_COOKIE}=;`);
    });

    it('404 for unknown actions, 405 for wrong methods', async () => {
        expect((await call('nope', { settings: memorySettings() })).statusCode).toBe(404);
        expect((await call('setup', { method: 'GET', settings: memorySettings() })).statusCode).toBe(405);
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleWatch, toWatchCatalog, watchTokenHash, MAX_PENDING_PAIRS, MAX_UNKNOWN_TOKENS } from './watch.js';
import { fakeAdmin } from './_lib/fakeAdmin.js';
import { ACCESS_COOKIE, signAccess } from './_lib/access.js';

const SECRET = 'watch-test-secret';
const NOW = 1_800_000_000_000;

function mockRes() {
    return {
        statusCode: null,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
    };
}

const data = {
    version: 2,
    holds: [{ id: 'b', name: 'Base 15', coverImage: 'data:x' }, { id: 'a', name: 'Amon' }],
    angles: [
        { id: '1', holdId: 'a', value: 39.8, saw: 'main' },
        { id: '2', holdId: 'a', value: 24.7, saw: 'main' },
        { id: '3', holdId: 'a', value: 32, saw: 'stefan' },
        { id: '4', holdId: 'b', value: 15, saw: 'stefan' },
    ],
};
const stateStore = { readState: async () => ({ data, revision: 7 }), initState: async () => ({ data, revision: 7 }) };
const settingsStore = { async getWorkshopCode() { return { hash: 'h', salt: 's', version: 1 }; } };

function memoryStations() {
    const st = { stations: [], devices: new Map(), nextId: 1 };
    return {
        st,
        async listStations() {
            return st.stations.map((s) => ({
                ...s,
                watches: [...st.devices.entries()].filter(([, d]) => d.stationId === s.id)
                    .map(([h, d]) => ({ id: h.slice(0, 16), label: d.label, lastSeen: 0 })),
            }));
        },
        async createStation(name) {
            if (st.stations.some((s) => s.name === name)) return null;
            const s = { id: st.nextId++, name, holds: [], sentAt: 0 };
            st.stations.push(s);
            return { id: s.id, name };
        },
        async deleteStation(id) {
            const before = st.stations.length;
            st.stations = st.stations.filter((s) => s.id !== id);
            for (const d of st.devices.values()) if (d.stationId === id) d.stationId = null;
            return st.stations.length < before;
        },
        async sendToStation(id, holds) {
            const s = st.stations.find((x) => x.id === id);
            if (!s) return null;
            s.holds = holds;
            s.sentAt = 555;
            return 555;
        },
        async findDevice(h) {
            const d = st.devices.get(h);
            if (!d) return null;
            const s = st.stations.find((x) => x.id === d.stationId);
            return { stationId: s ? s.id : null, stationName: s?.name, holds: s?.holds ?? [], sentAt: s?.sentAt ?? 0, pairCode: d.code, pairExpires: d.expires };
        },
        async touchDevice() {},
        async startPairing(h, code, expires, maxPending) {
            const d = st.devices.get(h);
            if (d?.stationId) return { alreadyPaired: true };
            if ([...st.devices.entries()].some(([k, x]) => k !== h && !x.stationId && x.code === code)) {
                throw Object.assign(new Error('dup'), { code: '23505' });
            }
            const waiting = [...st.devices.entries()].filter(([k, x]) => !x.stationId && k !== h);
            while (waiting.length >= maxPending) st.devices.delete(waiting.shift()[0]);
            st.devices.set(h, { stationId: null, code, expires });
            return { alreadyPaired: false };
        },
        async approvePairing(code, stationId, label) {
            if (!st.stations.some((s) => s.id === stationId)) return false;
            for (const d of st.devices.values()) {
                if (!d.stationId && d.code === code && d.expires > NOW) {
                    Object.assign(d, { stationId, label, code: null });
                    return true;
                }
            }
            return false;
        },
        async moveWatch(prefix, stationId) {
            for (const [h, d] of st.devices) {
                if (h.startsWith(prefix) && d.stationId) {
                    if (stationId == null) st.devices.delete(h);
                    else d.stationId = stationId;
                    return true;
                }
            }
            return false;
        },
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

const admin = () => fakeAdmin('Tomek', SECRET).cookie;
const lookupUser = fakeAdmin('Tomek', SECRET).lookupUser;
const workshop = () => `${ACCESS_COOKIE}=${signAccess(1, { secret: SECRET })}`;
const bearer = (t) => ({ authorization: `Bearer ${t}` });
const TOKEN = 'a'.repeat(32);

let stations;
let rate;
async function call({ method = 'GET', a, headers = {}, body, ip = '1.2.3.4' } = {}) {
    const res = mockRes();
    await handleWatch(
        { method, query: a ? { a } : {}, headers: { 'x-real-ip': ip, ...headers }, body },
        res,
        { stateStore, stationStore: stations, settingsStore, rateStore: rate, lookupUser, now: NOW },
    );
    return res;
}

async function station(name) {
    return (await call({ method: 'POST', a: 'station', headers: { cookie: admin() }, body: { name } })).body;
}

/** Pair a new watch; returns its server-issued token. */
async function pairTo(stationId) {
    const { body } = await call({ method: 'POST', a: 'pair' });
    await call({ method: 'POST', a: 'approve', headers: { cookie: admin() }, body: { code: body.c, station: stationId, label: 'Instinct' } });
    return body.k;
}

beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    stations = memoryStations();
    rate = memoryRate();
});

describe('catalog for the watch', () => {
    it('compacts the catalog without images, sorted by name', () => {
        expect(toWatchCatalog(data)).toEqual([
            ['Amon', [24.7, 39.8], [32]],
            ['Base 15', [], [15]],
        ]);
    });

    it('hashes only well-formed bearer tokens', () => {
        expect(watchTokenHash({ headers: bearer('short') })).toBeNull();
        expect(watchTokenHash({ headers: bearer(TOKEN) })).toBe(crypto.createHash('sha256').update(TOKEN).digest('hex'));
    });
});

describe('pairing flow', () => {
    it('no catalog without a paired token', async () => {
        expect((await call()).statusCode).toBe(401);
        expect((await call({ headers: bearer(TOKEN) })).body).toEqual({ e: 'unpaired' });
    });

    it('pair → pending with code → admin approves → watch gets its station job', async () => {
        const pair = await call({ method: 'POST', a: 'pair' });
        expect(pair.body.c).toMatch(/^\d{6}$/);
        expect(pair.body.k).toMatch(/^[A-Za-z0-9_-]{32}$/);
        const TOKEN = pair.body.k;

        const pending = await call({ headers: bearer(TOKEN) });
        expect(pending.statusCode).toBe(403);
        expect(pending.body).toEqual({ e: 'pending', c: pair.body.c });

        const st = await station('Saw 1');
        const ok = await call({ method: 'POST', a: 'approve', headers: { cookie: admin() }, body: { code: pair.body.c, station: st.id, label: 'Instinct' } });
        expect(ok.statusCode).toBe(200);

        await call({ method: 'POST', a: 'send', headers: { cookie: workshop() }, body: { station: st.id, holds: ['Amon', 'Nope'] } });
        const read = await call({ headers: bearer(TOKEN) });
        expect(read.statusCode).toBe(200);
        expect(read.body).toMatchObject({ r: 7, s: ['Amon'], t: 555, n: 'Saw 1' });
        expect(read.body.h[0][0]).toBe('Amon');
    });

    it('a waiting watch asking again keeps its token and gets a new code', async () => {
        const first = await call({ method: 'POST', a: 'pair' });
        const again = await call({ method: 'POST', a: 'pair', headers: bearer(first.body.k) });
        expect(again.body.k).toBeUndefined();
        expect(again.body.c).toMatch(/^\d{6}$/);
    });

    it('a client-made token is never accepted as a new identity', async () => {
        const res = await call({ method: 'POST', a: 'pair', headers: bearer(TOKEN) });
        expect(res.body.k).toBeDefined();
        expect(res.body.k).not.toBe(TOKEN);
    });

    it('two stations keep separate jobs', async () => {
        const s1 = await station('Saw 1');
        const s2 = await station('Saw 2');
        const A = await pairTo(s1.id);
        const B = await pairTo(s2.id);
        await call({ method: 'POST', a: 'send', headers: { cookie: workshop() }, body: { station: s1.id, holds: ['Amon'] } });
        await call({ method: 'POST', a: 'send', headers: { cookie: workshop() }, body: { station: s2.id, holds: ['Base 15'] } });
        expect((await call({ headers: bearer(A) })).body.s).toEqual(['Amon']);
        expect((await call({ headers: bearer(B) })).body.s).toEqual(['Base 15']);
    });

    it('wrong approval codes are throttled', async () => {
        const st = await station('Saw 1');
        for (let i = 0; i < 8; i++) {
            const r = await call({ method: 'POST', a: 'approve', headers: { cookie: admin() }, body: { code: '000000', station: st.id } });
            expect(r.statusCode).toBe(404);
        }
        const r = await call({ method: 'POST', a: 'approve', headers: { cookie: admin() }, body: { code: '000000', station: st.id } });
        expect(r.statusCode).toBe(429);
    });

    it('pairing requests are limited per network; a flood evicts old requests instead of blocking', async () => {
        for (let i = 0; i < 10; i++) await call({ method: 'POST', a: 'pair', ip: '2001:db8:9:9::' + i });
        expect((await call({ method: 'POST', a: 'pair', ip: '2001:db8:9:9::ffff' })).statusCode).toBe(429);
        for (let i = 0; i < MAX_PENDING_PAIRS + 5; i++) await call({ method: 'POST', a: 'pair', ip: `10.0.${i >> 8}.${i & 255}` });
        const late = await call({ method: 'POST', a: 'pair', ip: '10.9.9.9' });
        expect(late.statusCode).toBe(200);
        expect(late.body.c).toMatch(/^\d{6}$/);
        expect([...stations.st.devices.values()].filter((d) => !d.stationId).length).toBeLessThanOrEqual(MAX_PENDING_PAIRS);
    });

    it('unknown tokens are throttled per network', async () => {
        for (let i = 0; i < MAX_UNKNOWN_TOKENS; i++) {
            expect((await call({ headers: bearer(`${String(i).padStart(32, 'u')}`), ip: '198.51.100.7' })).statusCode).toBe(401);
        }
        expect((await call({ headers: bearer('v'.repeat(32)), ip: '198.51.100.7' })).statusCode).toBe(429);
    });

    it('unpairing removes the watch', async () => {
        const st = await station('Saw 1');
        const TOKEN = await pairTo(st.id);
        const id = watchTokenHash({ headers: bearer(TOKEN) }).slice(0, 16);
        expect((await call({ method: 'POST', a: 'move', headers: { cookie: admin() }, body: { watch: id, station: null } })).statusCode).toBe(200);
        expect((await call({ headers: bearer(TOKEN) })).statusCode).toBe(401);
    });
});

describe('web access to stations', () => {
    it('locked without session or workshop code', async () => {
        expect((await call({ a: 'stations' })).statusCode).toBe(401);
        expect((await call({ method: 'POST', a: 'send', body: { station: 1, holds: [] } })).statusCode).toBe(401);
    });

    it('operators can list and send, but not manage', async () => {
        const st = await station('Saw 1');
        const list = await call({ a: 'stations', headers: { cookie: workshop() } });
        expect(list.body.stations[0]).toEqual({ id: st.id, name: 'Saw 1', sentAt: 0, count: 0 });
        expect((await call({ method: 'POST', a: 'station', headers: { cookie: workshop() }, body: { name: 'X' } })).statusCode).toBe(403);
        expect((await call({ method: 'POST', a: 'approve', headers: { cookie: workshop() }, body: { code: '123456', station: st.id } })).statusCode).toBe(403);
    });

    it('admin list includes paired watches', async () => {
        const st = await station('Saw 1');
        await pairTo(st.id);
        const list = await call({ a: 'stations', headers: { cookie: admin() } });
        expect(list.body.stations[0].watches).toHaveLength(1);
        expect(list.body.stations[0].watches[0].label).toBe('Instinct');
    });

    it('validates send', async () => {
        expect((await call({ method: 'POST', a: 'send', headers: { cookie: workshop() }, body: { station: 'x', holds: [] } })).statusCode).toBe(400);
        expect((await call({ method: 'POST', a: 'send', headers: { cookie: workshop() }, body: { station: 99, holds: [] } })).statusCode).toBe(404);
        expect((await call({ method: 'POST', a: 'send', headers: { cookie: workshop() }, body: { station: 1, holds: new Array(201).fill('x') } })).statusCode).toBe(400);
    });
});

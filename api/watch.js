// Garmin watch + stations, one function:
//
// Watch (header `Authorization: Bearer <token>`, token issued by ?a=pair):
//   GET  /api/watch            → 200 { r, h, s, t, n }  catalog + its station's selection
//                                401 { e: 'unpaired' } | 403 { e: 'pending', c: code }
//   POST /api/watch?a=pair     → { c: code, k: token } six digits for the admin (15 min) and
//                                the watch's new token; with a waiting token: { c } only
//
// Web (admin session or workshop-code device):
//   GET  /api/watch?a=stations → { stations: [{ id, name, sentAt, count, watches? }] } (watches: admin only)
//   POST /api/watch?a=send     { station, holds } → "Send to watch" for one station
//
// Admin only:
//   POST /api/watch?a=station  { name } create · { id, delete: true } delete
//   POST /api/watch?a=approve  { code, station, label } pair the watch that shows `code`
//   POST /api/watch?a=move     { watch, station } move a watch · { watch, station: null } unpair
//
// Response field names stay short: Connect IQ responses must stay small.
import crypto from 'node:crypto';
import { getState } from './_lib/stateService.js';
import { neonStore } from './_lib/stateStore.js';
import { neonStationStore } from './_lib/stationStore.js';
import { neonSettingsStore } from './_lib/settingsStore.js';
import { neonRateLimitStore } from './_lib/rateLimitStore.js';
import { isRateLimited, rateLimitKey, recordFailure } from './_lib/rateLimit.js';
import { canRead, resolveReader } from './_lib/access.js';
import { getUserByUsername } from './_lib/db.js';
import { getClientIp, PayloadTooLargeError, readJsonBody } from './_lib/http.js';

export const MAX_SENT_HOLDS = 200;
export const PAIR_TTL_MS = 15 * 60 * 1000;
export const MAX_PENDING_PAIRS = 50;
export const MAX_UNKNOWN_TOKENS = 30; // per network per 15 min
const MAX_NAME = 40;

export function toWatchCatalog(data) {
    const holds = Array.isArray(data?.holds) ? data.holds : [];
    const angles = Array.isArray(data?.angles) ? data.angles : [];
    const pick = (id, saw) => angles
        .filter(a => a.holdId === id && a.saw === saw)
        .map(a => Number(a.value))
        .sort((x, y) => x - y);
    return holds
        .map(h => [h.name, pick(h.id, 'main'), pick(h.id, 'stefan')])
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
}

/** Bearer token from the watch: 32..128 hex/base64url characters. */
export function watchTokenHash(req) {
    const auth = req.headers?.authorization;
    const m = typeof auth === 'string' ? auth.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/) : null;
    return m ? crypto.createHash('sha256').update(m[1]).digest('hex') : null;
}

export function newWatchToken() {
    return crypto.randomBytes(24).toString('base64url'); // 32 characters
}

export function newPairCode() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_NAME) : '');
const asId = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

async function watchRead(req, res, d) {
    // unknown tokens are counted, so tokens cannot be guessed (or the DB hammered) in bulk
    const key = rateLimitKey(getClientIp(req), 'watch-token');
    if (await isRateLimited(d.rate, key, d.now, { maxFailures: MAX_UNKNOWN_TOKENS })) {
        res.status(429).json({ e: 'slow_down' });
        return;
    }
    const tokenHash = watchTokenHash(req);
    const device = tokenHash ? await d.stations.findDevice(tokenHash) : null;
    if (!device) {
        await recordFailure(d.rate, key, d.now);
        res.status(401).json({ e: 'unpaired' });
        return;
    }
    if (device.stationId == null) {
        const live = device.pairExpires > d.now;
        res.status(403).json({ e: 'pending', c: live ? device.pairCode : null });
        return;
    }
    const { data, revision } = await getState(d.state);
    await d.stations.touchDevice(tokenHash);
    res.status(200).json({
        r: revision,
        h: toWatchCatalog(data),
        s: device.holds,
        t: device.sentAt,
        n: device.stationName,
    });
}

async function watchPair(req, res, d) {
    // Every pairing request counts against the network, so the table cannot be flooded.
    const key = rateLimitKey(getClientIp(req), 'watch-pair');
    if (await isRateLimited(d.rate, key, d.now, { maxFailures: 10 })) {
        res.status(429).json({ e: 'slow_down' });
        return;
    }
    await recordFailure(d.rate, key, d.now, { windowMs: PAIR_TTL_MS });

    // A watch that is already waiting keeps its token and gets a fresh code;
    // anything else gets a new server-made token (strong on every device).
    let tokenHash = watchTokenHash(req);
    let token = null;
    if (!tokenHash || !(await d.stations.findDevice(tokenHash))) {
        token = newWatchToken();
        tokenHash = watchTokenHash({ headers: { authorization: `Bearer ${token}` } });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = newPairCode();
        try {
            const { alreadyPaired } = await d.stations.startPairing(tokenHash, code, d.now + PAIR_TTL_MS, MAX_PENDING_PAIRS);
            res.status(200).json(alreadyPaired ? { ok: true } : { c: code, ...(token ? { k: token } : {}) });
            return;
        } catch (err) {
            if (err?.code !== '23505') throw err; // code already shown by another waiting watch: draw again
        }
    }
    res.status(503).json({ e: 'busy' });
}

async function webAction(req, res, d, action) {
    const reader = await resolveReader(req.headers?.cookie, d.settings, { lookupUser: d.lookupUser });
    if (!canRead(reader)) {
        res.status(401).json({ error: 'locked' });
        return;
    }
    const admin = reader.username;

    if (action === 'stations' && req.method === 'GET') {
        const list = await d.stations.listStations();
        res.status(200).json({
            stations: list.map((s) => ({
                id: s.id, name: s.name, sentAt: s.sentAt, count: s.holds.length,
                ...(admin ? { watches: s.watches } : {}),
            })),
        });
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const body = await readJsonBody(req, { maxBytes: 16 * 1024 });

    if (action === 'send') {
        const station = asId(body?.station);
        const sent = body?.holds;
        if (!station || !Array.isArray(sent) || sent.length > MAX_SENT_HOLDS) {
            res.status(400).json({ error: 'invalid_body' });
            return;
        }
        // Keep only names that exist in the catalog.
        const { data } = await getState(d.state);
        const known = new Set((data?.holds ?? []).map(h => h.name));
        const holds = [...new Set(sent.filter(n => typeof n === 'string' && known.has(n)))];
        const t = await d.stations.sendToStation(station, holds);
        if (t == null) {
            res.status(404).json({ error: 'no_station' });
            return;
        }
        res.status(200).json({ ok: true, count: holds.length, t });
        return;
    }

    if (!admin) {
        res.status(403).json({ error: 'admin_only' });
        return;
    }
    if (action === 'station') {
        if (body?.delete) {
            const ok = asId(body.id) && await d.stations.deleteStation(asId(body.id));
            res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'no_station' });
            return;
        }
        const name = cleanName(body?.name);
        if (!name) {
            res.status(400).json({ error: 'invalid_body', message: 'Enter a station name.' });
            return;
        }
        const created = await d.stations.createStation(name);
        res.status(created ? 200 : 409).json(created ?? { error: 'exists', message: 'A station with this name already exists.' });
        return;
    }
    if (action === 'approve') {
        const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : '';
        const station = asId(body?.station);
        if (!/^\d{6}$/.test(code) || !station) {
            res.status(400).json({ error: 'invalid_body', message: 'Enter the 6-digit code shown on the watch.' });
            return;
        }
        // Six digits are guessable at scale, so wrong codes are throttled like logins.
        const key = rateLimitKey(getClientIp(req), `approve:${admin}`);
        if (await isRateLimited(d.rate, key, d.now)) {
            res.status(429).json({ error: 'too_many_attempts' });
            return;
        }
        const ok = await d.stations.approvePairing(code, station, cleanName(body?.label) || null);
        if (!ok) {
            await recordFailure(d.rate, key, d.now);
            res.status(404).json({ error: 'no_code', message: 'No watch is waiting with this code. Start pairing on the watch again.' });
            return;
        }
        res.status(200).json({ ok: true });
        return;
    }
    if (action === 'move') {
        const watch = typeof body?.watch === 'string' && /^[0-9a-f]{16}$/.test(body.watch) ? body.watch : null;
        const station = body?.station === null ? null : asId(body?.station);
        if (!watch || (body?.station !== null && !station)) {
            res.status(400).json({ error: 'invalid_body' });
            return;
        }
        const ok = await d.stations.moveWatch(watch, station);
        res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'no_watch' });
        return;
    }
    res.status(404).json({ error: 'not_found' });
}

/** Testable handler: stores and clock are injected so it can run without a DB. */
export async function handleWatch(req, res, opts = {}) {
    const d = {
        state: opts.stateStore ?? neonStore,
        stations: opts.stationStore ?? neonStationStore,
        settings: opts.settingsStore ?? neonSettingsStore,
        rate: opts.rateStore ?? neonRateLimitStore,
        lookupUser: opts.lookupUser ?? getUserByUsername,
        now: opts.now ?? Date.now(),
    };
    const action = req.query?.a;
    try {
        if (!action && req.method === 'GET') return await watchRead(req, res, d);
        if (action === 'pair' && req.method === 'POST') return await watchPair(req, res, d);
        if (action) return await webAction(req, res, d, action);
        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof PayloadTooLargeError) {
            res.status(413).json({ error: err.code, message: err.message });
            return;
        }
        console.error('/api/watch failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export default function handler(req, res) {
    return handleWatch(req, res);
}

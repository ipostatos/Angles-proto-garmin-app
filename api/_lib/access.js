// Workshop access: operators unlock catalog reads with a shared workshop code.
// The access token is signed with a key DERIVED from SESSION_SECRET, so it can
// never be replayed as an admin session cookie (different key, different
// cookie). It carries the code version: changing the workshop code bumps the
// version and signs every device out.
import crypto from 'node:crypto';
import { getSessionUser, parseCookies } from './session.js';

export const ACCESS_COOKIE = 'angles_access';
export const ACCESS_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const MIN_WORKSHOP_CODE_LENGTH = 6;
export const MAX_WORKSHOP_CODE_LENGTH = 128;

function accessKey(opts) {
    const secret = opts?.secret ?? process.env.SESSION_SECRET;
    if (!secret) throw new Error('SESSION_SECRET is not set');
    return crypto.createHmac('sha256', secret).update('angles-workshop-access-v1').digest();
}

function isProd(opts) {
    return opts?.secure ?? (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV));
}

function sign(payloadB64, opts) {
    return crypto.createHmac('sha256', accessKey(opts)).update(payloadB64).digest('base64url');
}

export function isAcceptableWorkshopCode(code) {
    return typeof code === 'string'
        && code.trim().length >= MIN_WORKSHOP_CODE_LENGTH
        && code.length <= MAX_WORKSHOP_CODE_LENGTH;
}

/** Signed workshop token: `base64url({ v, e }).signature`. */
export function signAccess(version, opts = {}) {
    const expiry = (opts.now ?? Date.now()) + (opts.ttlMs ?? ACCESS_TTL_MS);
    const payloadB64 = Buffer.from(JSON.stringify({ v: version, e: expiry })).toString('base64url');
    return `${payloadB64}.${sign(payloadB64, opts)}`;
}

/** True when the token is genuine, unexpired and issued for `version`. */
export function verifyAccess(token, version, opts = {}) {
    try {
        if (typeof token !== 'string' || !Number.isFinite(version)) return false;
        const dot = token.indexOf('.');
        if (dot <= 0 || dot === token.length - 1) return false;
        const payloadB64 = token.slice(0, dot);
        const sigBuf = Buffer.from(token.slice(dot + 1));
        const expBuf = Buffer.from(sign(payloadB64, opts));
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (typeof payload.e !== 'number' || payload.e <= (opts.now ?? Date.now())) return false;
        return payload.v === version;
    } catch {
        return false;
    }
}

export function buildAccessCookie(token, opts = {}) {
    const maxAge = Math.floor((opts.ttlMs ?? ACCESS_TTL_MS) / 1000);
    const attrs = [`${ACCESS_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${maxAge}`];
    if (isProd(opts)) attrs.push('Secure');
    return attrs.join('; ');
}

export function buildClearAccessCookie(opts = {}) {
    const attrs = [`${ACCESS_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0'];
    if (isProd(opts)) attrs.push('Secure');
    return attrs.join('; ');
}

/**
 * Who may read the catalog: an admin session, or a workshop token that matches
 * the current code version. Returns { username, workshop } — both falsy means
 * the request is locked.
 */
export async function resolveReader(cookieHeader, settingsStore, opts = {}) {
    const username = getSessionUser(cookieHeader, opts);
    if (username) return { username, workshop: false };
    const token = parseCookies(cookieHeader)[ACCESS_COOKIE];
    if (!token) return { username: null, workshop: false };
    const workshop = await settingsStore.getWorkshopCode();
    if (!workshop) return { username: null, workshop: false };
    return { username: null, workshop: verifyAccess(token, workshop.version, opts) };
}

export function canRead(reader) {
    return Boolean(reader?.username || reader?.workshop);
}

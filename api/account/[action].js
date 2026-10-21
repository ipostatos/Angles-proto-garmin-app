// Account and access endpoints, one function (Vercel Hobby allows 12):
//   GET  /api/account/status          → { needsSetup, setupTokenRequired, hasWorkshopCode, username, workshop }
//   POST /api/account/setup           { setupToken?, username, password, workshopCode } → first admin (empty DB only)
//   POST /api/account/unlock          { code } → workshop access cookie for operators
//   POST /api/account/lock            → clears the workshop access cookie
//   POST /api/account/password        { currentPassword, newPassword } → admin changes own password
//   POST /api/account/workshop-code   { code } → admin sets a new workshop code (signs all devices out)
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../_lib/password.js';
import { authenticateUser, hasAcceptableCredentialShape, normalizeLoginUsername } from '../_lib/auth.js';
import { getUserByUsername } from '../_lib/db.js';
import { buildSessionCookie, getAdminUser, passwordFingerprint, signSession } from '../_lib/session.js';
import {
    buildAccessCookie, buildClearAccessCookie, isAcceptableWorkshopCode,
    resolveReader, signAccess, MIN_WORKSHOP_CODE_LENGTH,
} from '../_lib/access.js';
import { getClientIp, PayloadTooLargeError, readJsonBody } from '../_lib/http.js';
import { neonSettingsStore } from '../_lib/settingsStore.js';
import { neonRateLimitStore } from '../_lib/rateLimitStore.js';
import { clearFailures, isRateLimited, rateLimitKey, recordFailure } from '../_lib/rateLimit.js';

export const MIN_PASSWORD_LENGTH = 10;
export const MIN_SETUP_TOKEN_LENGTH = 24;
// All wrong workshop codes together, from any address: a slow brute force
// spread over many networks still stops (existing devices keep working).
export const GLOBAL_UNLOCK_FAILURES = 100;
const BODY_LIMIT = 16 * 1024;

/**
 * Outside local development the first-run form must carry SETUP_TOKEN, so a
 * fresh deploy cannot be claimed by a stranger.
 */
export function setupTokenRequired(env = process.env) {
    return Boolean(env.SETUP_TOKEN) || Boolean(env.VERCEL_ENV) || env.NODE_ENV === 'production';
}

function tokenMatches(given, expected) {
    if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

function passwordProblem(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password.length > 256) return 'Password is too long.';
    return null;
}

async function status(req, res, deps) {
    const reader = await resolveReader(req.headers?.cookie, deps.settings, { lookupUser: deps.lookupUser });
    const [users, workshop] = await Promise.all([deps.settings.countUsers(), deps.settings.getWorkshopCode()]);
    res.status(200).json({
        needsSetup: users === 0,
        setupTokenRequired: setupTokenRequired(deps.env),
        hasWorkshopCode: Boolean(workshop),
        username: reader.username,
        workshop: reader.workshop,
    });
}

async function setup(req, res, deps) {
    const body = await readJsonBody(req, { maxBytes: BODY_LIMIT });
    const key = rateLimitKey(getClientIp(req), 'setup');
    if (await isRateLimited(deps.rate, key, deps.now)) {
        res.status(429).json({ error: 'too_many_attempts' });
        return;
    }
    if (setupTokenRequired(deps.env)) {
        if (!deps.env.SETUP_TOKEN || deps.env.SETUP_TOKEN.length < MIN_SETUP_TOKEN_LENGTH) {
            res.status(503).json({ error: 'setup_token_missing', message: `Set the SETUP_TOKEN environment variable (at least ${MIN_SETUP_TOKEN_LENGTH} random characters) first.` });
            return;
        }
        if (!tokenMatches(body.setupToken, deps.env.SETUP_TOKEN)) {
            await recordFailure(deps.rate, key, deps.now);
            res.status(403).json({ error: 'bad_setup_token', message: 'Setup token is not correct.' });
            return;
        }
    }
    const username = normalizeLoginUsername(body.username);
    const problem = passwordProblem(body.password);
    if (!hasAcceptableCredentialShape(username, body.password) || problem) {
        res.status(400).json({ error: 'invalid_body', message: problem ?? 'Enter a username and a password.' });
        return;
    }
    if (!isAcceptableWorkshopCode(body.workshopCode)) {
        res.status(400).json({ error: 'invalid_body', message: `Workshop code must be at least ${MIN_WORKSHOP_CODE_LENGTH} characters.` });
        return;
    }
    const pw = hashPassword(body.password);
    const created = await deps.settings.createFirstUser({ username, hash: pw.hash, salt: pw.salt });
    if (!created) {
        res.status(409).json({ error: 'already_set_up', message: 'An admin already exists. Sign in instead.' });
        return;
    }
    const code = hashPassword(body.workshopCode.trim());
    await deps.settings.setWorkshopCode({ hash: code.hash, salt: code.salt });
    await clearFailures(deps.rate, key);
    res.setHeader('Set-Cookie', buildSessionCookie(signSession(username, { fp: passwordFingerprint(pw.hash) })));
    res.status(200).json({ username });
}

async function unlock(req, res, deps) {
    const body = await readJsonBody(req, { maxBytes: BODY_LIMIT });
    const key = rateLimitKey(getClientIp(req), 'workshop-code');
    const globalKey = 'global:workshop-code';
    if (await isRateLimited(deps.rate, key, deps.now)
        || await isRateLimited(deps.rate, globalKey, deps.now, { maxFailures: GLOBAL_UNLOCK_FAILURES })) {
        res.status(429).json({ error: 'too_many_attempts', message: 'Too many wrong codes. Try again later.' });
        return;
    }
    const workshop = await deps.settings.getWorkshopCode();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!workshop || !code || code.length > 128 || !verifyPassword(code, workshop.hash, workshop.salt)) {
        await recordFailure(deps.rate, key, deps.now);
        await recordFailure(deps.rate, globalKey, deps.now);
        res.status(401).json({ error: 'invalid_code', message: 'Wrong workshop code.' });
        return;
    }
    await clearFailures(deps.rate, key);
    res.setHeader('Set-Cookie', buildAccessCookie(signAccess(workshop.version)));
    res.status(200).json({ ok: true });
}

async function changePassword(req, res, deps, username) {
    const body = await readJsonBody(req, { maxBytes: BODY_LIMIT });
    const key = rateLimitKey(getClientIp(req), `password:${username}`);
    if (await isRateLimited(deps.rate, key, deps.now)) {
        res.status(429).json({ error: 'too_many_attempts' });
        return;
    }
    if (!(await authenticateUser(username, body.currentPassword, deps.lookupUser))) {
        await recordFailure(deps.rate, key, deps.now);
        res.status(403).json({ error: 'wrong_password', message: 'Current password is not correct.' });
        return;
    }
    const problem = passwordProblem(body.newPassword);
    if (problem) {
        res.status(400).json({ error: 'invalid_body', message: problem });
        return;
    }
    const pw = hashPassword(body.newPassword);
    await deps.settings.updatePassword({ username, hash: pw.hash, salt: pw.salt });
    await deps.settings.logEvent({ username, action: 'password_changed', entity: username });
    await clearFailures(deps.rate, key);
    // Every other session (old password fingerprint) is now invalid; this one gets a fresh cookie.
    res.setHeader('Set-Cookie', buildSessionCookie(signSession(username, { fp: passwordFingerprint(pw.hash) })));
    res.status(200).json({ ok: true });
}

async function setWorkshopCode(req, res, deps, username) {
    const body = await readJsonBody(req, { maxBytes: BODY_LIMIT });
    // Locks every operator out until they get the new code: ask for the password, not just the cookie.
    const key = rateLimitKey(getClientIp(req), `password:${username}`);
    if (await isRateLimited(deps.rate, key, deps.now)) {
        res.status(429).json({ error: 'too_many_attempts' });
        return;
    }
    if (!(await authenticateUser(username, body.currentPassword, deps.lookupUser))) {
        await recordFailure(deps.rate, key, deps.now);
        res.status(403).json({ error: 'wrong_password', message: 'Your password is not correct.' });
        return;
    }
    if (!isAcceptableWorkshopCode(body.code)) {
        res.status(400).json({ error: 'invalid_body', message: `Workshop code must be at least ${MIN_WORKSHOP_CODE_LENGTH} characters.` });
        return;
    }
    const code = hashPassword(body.code.trim());
    await deps.settings.setWorkshopCode({ hash: code.hash, salt: code.salt });
    await deps.settings.logEvent({ username, action: 'workshop_code_changed', entity: null });
    res.status(200).json({ ok: true });
}

/** Testable handler: storage, env and clock are injected. */
export async function handleAccount(req, res, opts = {}) {
    const deps = {
        settings: opts.settings ?? neonSettingsStore,
        rate: opts.rateStore ?? neonRateLimitStore,
        lookupUser: opts.lookupUser ?? getUserByUsername,
        env: opts.env ?? process.env,
        now: opts.now ?? Date.now(),
    };
    const action = req.query?.action;
    try {
        if (action === 'status' && req.method === 'GET') return await status(req, res, deps);
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        if (action === 'setup') return await setup(req, res, deps);
        if (action === 'unlock') return await unlock(req, res, deps);
        if (action === 'lock') {
            res.setHeader('Set-Cookie', buildClearAccessCookie());
            res.status(200).json({ ok: true });
            return;
        }
        if (action === 'password' || action === 'workshop-code') {
            const username = await getAdminUser(req.headers?.cookie, deps.lookupUser);
            if (!username) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
            if (action === 'password') return await changePassword(req, res, deps, username);
            return await setWorkshopCode(req, res, deps, username);
        }
        res.status(404).json({ error: 'not_found' });
    } catch (err) {
        if (err instanceof PayloadTooLargeError) {
            res.status(413).json({ error: err.code, message: err.message });
            return;
        }
        console.error(`/api/account/${action} failed:`, err);
        res.status(500).json({ error: 'Server error' });
    }
}

export default function handler(req, res) {
    return handleAccount(req, res);
}

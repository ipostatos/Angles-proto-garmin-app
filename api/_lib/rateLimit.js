// Login throttle policy, decoupled from storage. Every persistence operation
// goes through an injected `store`, so this is unit-testable without a database
// and the same policy runs against the Neon-backed store in production.
//
// Design notes:
// - The limiter is a DEFENSE-IN-DEPTH layer, not a correctness guarantee. If the
//   store is unavailable we FAIL OPEN (allow the attempt) rather than locking
//   every user out when the DB hiccups — see `isRateLimited` / `recordFailure`.
// - State is keyed by `${ip}:${username}` so one abusive source can't lock out a
//   victim's account globally, and a victim's failures elsewhere don't add up.

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES = 8;

/**
 * Throttle bucket for a client address. IPv6 users usually own a whole /64,
 * so an address is reduced to its first four groups; otherwise rotating the
 * last 64 bits would give fresh attempts on every request.
 */
export function ipBucket(ip) {
    const s = String(ip || 'unknown').trim().toLowerCase();
    if (!s.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/.test(s)) return s.replace(/^::ffff:/, '');
    const [head, tail = ''] = s.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const groups = s.includes('::')
        ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
        : left;
    return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

export function rateLimitKey(ip, username) {
    return `${ipBucket(ip)}:${String(username || '').toLowerCase()}`;
}

/**
 * @returns {Promise<boolean>} true when the key is currently locked out.
 * Fails OPEN (returns false) if the store throws.
 */
export async function isRateLimited(store, key, now, { maxFailures = LOGIN_MAX_FAILURES } = {}) {
    try {
        const count = await store.getFailureCount(key, now);
        return count >= maxFailures;
    } catch {
        return false;
    }
}

/**
 * Record one failed attempt within the sliding window. Swallows store errors so
 * a throttle-store outage never turns a wrong password into a 500.
 */
export async function recordFailure(store, key, now, { windowMs = LOGIN_RATE_LIMIT_WINDOW_MS } = {}) {
    try {
        await store.recordFailure(key, now, windowMs);
    } catch {
        // best-effort: a missed increment is acceptable, a crash is not.
    }
}

/** Clear the counter for a key after a successful login. Best-effort. */
export async function clearFailures(store, key) {
    try {
        await store.clearFailures(key);
    } catch {
        // best-effort
    }
}

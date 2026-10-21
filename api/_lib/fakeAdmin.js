// Test helper: an admin cookie plus the matching user lookup, so handlers that
// verify the password fingerprint can run without a database.
import { buildSessionCookie, passwordFingerprint, signSession } from './session.js';

export function fakeAdmin(username = 'Tomek', secret = process.env.SESSION_SECRET) {
    const passHash = `hash-of-${username}`;
    const token = signSession(username, { secret, fp: passwordFingerprint(passHash) });
    return {
        cookie: buildSessionCookie(token, { secure: false }),
        lookupUser: async (name) => (name === username ? { username, pass_hash: passHash, salt: 's' } : null),
    };
}

// GET  /api/state  → read of the shared catalog { data, revision } for an admin
//                    session or a workshop-code device; 401 { error: 'locked' } otherwise
// PUT  /api/state  → authenticated write with revision optimistic locking
import { getState, putState } from './_lib/stateService.js';
import { neonStore } from './_lib/stateStore.js';
import { neonSettingsStore } from './_lib/settingsStore.js';
import { canRead, resolveReader } from './_lib/access.js';
import { getSessionUser } from './_lib/session.js';
import { PayloadTooLargeError, readJsonBody } from './_lib/http.js';

export const STATE_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

/** Testable handler: store is injected so it can be exercised without a DB. */
export async function handleState(req, res, store, settingsStore = neonSettingsStore) {
    try {
        if (req.method === 'GET') {
            if (!canRead(await resolveReader(req.headers?.cookie, settingsStore))) {
                res.status(401).json({ error: 'locked' });
                return;
            }
            const result = await getState(store);
            res.status(200).json(result);
            return;
        }

        if (req.method === 'PUT') {
            const username = getSessionUser(req.headers?.cookie);
            if (!username) {
                res.status(401).json({ error: 'unauthorized' });
                return;
            }
            const body = await readJsonBody(req, { maxBytes: STATE_BODY_LIMIT_BYTES });
            const result = await putState(store, { body, username });
            res.status(result.status).json(result.body);
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        if (err instanceof PayloadTooLargeError) {
            res.status(413).json({ error: err.code, message: err.message });
            return;
        }
        console.error('/api/state failed:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

export default function handler(req, res) {
    return handleState(req, res, neonStore);
}

// Stations and Garmin watches. "Send to watch" stores the selected hold names
// for ONE station; the watches paired to that station pick them up through
// GET /api/watch on their next sync.

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };
export const LS_LAST_STATION_KEY = 'angles_last_station';

async function call(action, { method = 'POST', body } = {}) {
    const res = await fetch(`/api/watch?a=${action}`, {
        method,
        headers: method === 'GET' ? { accept: 'application/json' } : JSON_HEADERS,
        credentials: 'same-origin',
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    if (!res.ok) {
        const err = new Error(payload?.message || `/api/watch responded with status ${res.status}`);
        err.status = res.status;
        err.code = payload?.error;
        throw err;
    }
    return payload;
}

/** [{ id, name, sentAt, count, watches? }] — `watches` only for admins. */
export async function listStations() {
    return (await call('stations', { method: 'GET' })).stations ?? [];
}

export function sendHoldsToStation(stationId, holdNames) {
    return call('send', { body: { station: stationId, holds: holdNames } });
}

export const createStation = (name) => call('station', { body: { name } });
export const deleteStation = (id) => call('station', { body: { id, delete: true } });
export const approveWatch = (code, stationId, label) => call('approve', { body: { code, station: stationId, label } });
export const moveWatch = (watchId, stationId) => call('move', { body: { watch: watchId, station: stationId } });

export function loadLastStation() {
    try { return Number(localStorage.getItem(LS_LAST_STATION_KEY)) || null; } catch { return null; }
}

export function saveLastStation(id) {
    try { localStorage.setItem(LS_LAST_STATION_KEY, String(id)); } catch { /* per-device convenience only */ }
}

// Client for /api/account/*: first-run setup, workshop code unlock, admin
// password and workshop code changes. Cookies are httpOnly and set by the
// server; nothing secret is kept in the browser.

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

async function post(action, body) {
    const res = await fetch(`/api/account/${action}`, {
        method: 'POST',
        headers: JSON_HEADERS,
        credentials: 'same-origin',
        body: JSON.stringify(body ?? {}),
    });
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    if (!res.ok) {
        const err = new Error(payload?.message || `Request failed (${res.status})`);
        err.status = res.status;
        err.code = payload?.error;
        throw err;
    }
    return payload;
}

/** { needsSetup, setupTokenRequired, hasWorkshopCode, username, workshop } */
export async function getAccessStatus() {
    const res = await fetch('/api/account/status', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`/api/account/status responded with status ${res.status}`);
    return res.json();
}

export const runSetup = (fields) => post('setup', fields);
export const unlockWorkshop = (code) => post('unlock', { code });
export const lockDevice = () => post('lock');
export const changePassword = (currentPassword, newPassword) => post('password', { currentPassword, newPassword });
export const setWorkshopCode = (code) => post('workshop-code', { code });

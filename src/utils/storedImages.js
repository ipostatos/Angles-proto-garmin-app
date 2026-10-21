// Images in private storage (/api/images) instead of base64 inside the catalog.
// Without a linked Blob store the server answers 501 and images simply stay
// inline as before, so a fork without storage keeps working.
import { isSafeRasterDataUrl, isStoredImageRef } from '../domain/migration.js';

/** Upload a data URL; resolves to the stored reference, or the same data URL when storage is off. */
export async function storeImage(dataUrl) {
    const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ dataUrl }),
    });
    if (res.status === 501) return dataUrl;
    const body = await res.json().catch(() => null);
    if (!res.ok || typeof body?.url !== 'string') {
        const err = new Error(body?.message || `Image upload failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return body.url;
}

function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}

async function fetchAsDataUrl(ref) {
    const res = await fetch(ref, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Could not read ${ref} (${res.status})`);
    return readAsDataUrl(await res.blob());
}

/** Map every coverImage / drawing through `fn` (async), returning a new catalog. */
async function mapImages(data, test, fn, onProgress) {
    const jobs = [];
    for (const h of data.holds || []) if (test(h.coverImage)) jobs.push(h.coverImage);
    for (const a of data.angles || []) if (test(a.drawing)) jobs.push(a.drawing);
    const done = new Map();
    let n = 0;
    for (const src of jobs) {
        if (!done.has(src)) done.set(src, await fn(src));
        onProgress?.(++n, jobs.length);
    }
    const swap = (v) => (done.has(v) ? done.get(v) : v);
    return {
        ...data,
        holds: (data.holds || []).map((h) => (h.coverImage ? { ...h, coverImage: swap(h.coverImage) } : h)),
        angles: (data.angles || []).map((a) => (a.drawing ? { ...a, drawing: swap(a.drawing) } : a)),
        moved: jobs.length,
    };
}

/** For EXPORT: put stored images back inline so a backup is self-contained. */
export async function inlineStoredImages(data) {
    const { moved: _moved, ...out } = await mapImages(data, isStoredImageRef, fetchAsDataUrl);
    return out;
}

/** Upload every inline image; returns { data, moved }. Stops with an error when storage is off. */
export async function moveImagesToStorage(data, onProgress) {
    const { moved, ...out } = await mapImages(data, isSafeRasterDataUrl, async (src) => {
        const url = await storeImage(src);
        if (url === src) {
            const err = new Error('No Blob store is linked to this deployment.');
            err.code = 'storage_off';
            throw err;
        }
        return url;
    }, onProgress);
    return { data: out, moved };
}

export function countInlineImages(data) {
    let n = 0;
    for (const h of data?.holds || []) if (isSafeRasterDataUrl(h.coverImage)) n++;
    for (const a of data?.angles || []) if (isSafeRasterDataUrl(a.drawing)) n++;
    return n;
}

// Stations (one per saw / operator) and the watches paired to them.
// Each station keeps its own "Send to watch" selection, so two operators never
// overwrite each other's job. A watch is identified by a random token it
// generates itself; only its SHA-256 is stored. Tables are created lazily and
// the old single-row `watch_selection` becomes the first station.
import { getSql } from './db.js';

let ensured = false;

async function ensure(sql) {
    if (ensured) return;
    await sql`
        CREATE TABLE IF NOT EXISTS stations (
            id      SERIAL PRIMARY KEY,
            name    TEXT NOT NULL UNIQUE,
            holds   JSONB NOT NULL DEFAULT '[]'::jsonb,
            sent_at TIMESTAMPTZ
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS watch_devices (
            token_hash   TEXT PRIMARY KEY,
            station_id   INT REFERENCES stations(id) ON DELETE SET NULL,
            label        TEXT,
            pair_code    TEXT,
            pair_expires TIMESTAMPTZ,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_seen    TIMESTAMPTZ
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS watch_devices_pair_code_idx ON watch_devices (pair_code)`;
    // One-time carry-over of the v1 single selection into a first station.
    await sql`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM stations)
               AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'watch_selection') THEN
                INSERT INTO stations (name, holds, sent_at)
                SELECT 'Saw 1', holds, sent_at FROM watch_selection WHERE id = 1;
            END IF;
        END $$
    `;
    ensured = true;
}

const toSeconds = (d) => (d ? Math.floor(new Date(d).getTime() / 1000) : 0);

export const neonStationStore = {
    /** All stations with their paired watches. */
    async listStations() {
        const sql = getSql();
        await ensure(sql);
        const stations = await sql`SELECT id, name, holds, sent_at FROM stations ORDER BY name`;
        const devices = await sql`
            SELECT token_hash, station_id, label, pair_code, pair_expires, last_seen, created_at
              FROM watch_devices ORDER BY created_at
        `;
        return stations.map((s) => ({
            id: s.id,
            name: s.name,
            holds: s.holds,
            sentAt: toSeconds(s.sent_at),
            watches: devices
                .filter((d) => d.station_id === s.id)
                .map((d) => ({ id: d.token_hash.slice(0, 16), label: d.label, lastSeen: toSeconds(d.last_seen) })),
        }));
    },

    async createStation(name) {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`
            INSERT INTO stations (name) VALUES (${name})
            ON CONFLICT (name) DO NOTHING
            RETURNING id, name
        `;
        return rows[0] ?? null;
    },

    async deleteStation(id) {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`DELETE FROM stations WHERE id = ${id} RETURNING id`;
        return rows.length === 1;
    },

    async sendToStation(id, holds) {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`
            UPDATE stations SET holds = ${JSON.stringify(holds)}::jsonb, sent_at = now()
             WHERE id = ${id}
            RETURNING sent_at
        `;
        return rows[0] ? toSeconds(rows[0].sent_at) : null;
    },

    /** The device row for a token hash, with its station (if approved). */
    async findDevice(tokenHash) {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`
            SELECT d.token_hash, d.station_id, d.pair_code, d.pair_expires,
                   s.name AS station_name, s.holds, s.sent_at
              FROM watch_devices d
              LEFT JOIN stations s ON s.id = d.station_id
             WHERE d.token_hash = ${tokenHash}
        `;
        const r = rows[0];
        if (!r) return null;
        return {
            stationId: r.station_id,
            stationName: r.station_name,
            holds: r.holds ?? [],
            sentAt: toSeconds(r.sent_at),
            pairCode: r.pair_code,
            pairExpires: r.pair_expires ? new Date(r.pair_expires).getTime() : 0,
        };
    },

    async touchDevice(tokenHash) {
        await getSql()`UPDATE watch_devices SET last_seen = now() WHERE token_hash = ${tokenHash}`;
    },

    /**
     * Register (or refresh) an unpaired watch with a pairing code. An already
     * approved watch keeps its station. Expired pending rows are swept here.
     */
    async startPairing(tokenHash, code, expiresMs) {
        const sql = getSql();
        await ensure(sql);
        await sql`DELETE FROM watch_devices WHERE station_id IS NULL AND pair_expires < now()`;
        const expires = new Date(expiresMs).toISOString();
        const rows = await sql`
            INSERT INTO watch_devices (token_hash, pair_code, pair_expires)
            VALUES (${tokenHash}, ${code}, ${expires})
            ON CONFLICT (token_hash) DO UPDATE
               SET pair_code = CASE WHEN watch_devices.station_id IS NULL THEN EXCLUDED.pair_code ELSE NULL END,
                   pair_expires = CASE WHEN watch_devices.station_id IS NULL THEN EXCLUDED.pair_expires ELSE NULL END
            RETURNING station_id
        `;
        return { alreadyPaired: rows[0]?.station_id != null };
    },

    async countPending() {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`SELECT count(*)::int AS n FROM watch_devices WHERE station_id IS NULL AND pair_expires > now()`;
        return rows[0].n;
    },

    /** Approve the pending watch that shows `code`; returns false when no such code is live. */
    async approvePairing(code, stationId, label) {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`
            UPDATE watch_devices
               SET station_id = ${stationId}, label = ${label}, pair_code = NULL, pair_expires = NULL
             WHERE pair_code = ${code} AND station_id IS NULL AND pair_expires > now()
               AND EXISTS (SELECT 1 FROM stations WHERE id = ${stationId})
            RETURNING token_hash
        `;
        return rows.length === 1;
    },

    /** Move a paired watch to another station (`stationId` null = unpair). */
    async moveWatch(idPrefix, stationId) {
        const sql = getSql();
        await ensure(sql);
        const like = `${idPrefix}%`;
        if (stationId == null) {
            const rows = await sql`DELETE FROM watch_devices WHERE token_hash LIKE ${like} AND station_id IS NOT NULL RETURNING 1`;
            return rows.length === 1;
        }
        const rows = await sql`
            UPDATE watch_devices SET station_id = ${stationId}
             WHERE token_hash LIKE ${like} AND station_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM stations WHERE id = ${stationId})
            RETURNING 1
        `;
        return rows.length === 1;
    },
};

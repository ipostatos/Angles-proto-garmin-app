// Neon-backed settings + account storage: workshop code, first-run admin,
// password changes. Tables are created lazily so an existing deployment needs
// no manual migration.
import { getSql } from './db.js';

let ensured = false;

async function ensure(sql) {
    if (ensured) return;
    await sql`
        CREATE TABLE IF NOT EXISTS settings (
            key        TEXT PRIMARY KEY,
            value      JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;
    ensured = true;
}

export const neonSettingsStore = {
    /** @returns {Promise<{hash: string, salt: string, version: number}|null>} */
    async getWorkshopCode() {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`SELECT value FROM settings WHERE key = 'workshop_code'`;
        const v = rows[0]?.value;
        if (!v || typeof v.hash !== 'string') return null;
        return { hash: v.hash, salt: v.salt, version: Number(v.version) || 1 };
    },

    /** Store a new code hash; bumps the version so old devices are signed out. */
    async setWorkshopCode({ hash, salt }) {
        const sql = getSql();
        await ensure(sql);
        const rows = await sql`
            INSERT INTO settings (key, value)
            VALUES ('workshop_code', jsonb_build_object('hash', ${hash}::text, 'salt', ${salt}::text, 'version', 1))
            ON CONFLICT (key) DO UPDATE
               SET value = jsonb_build_object(
                       'hash', ${hash}::text, 'salt', ${salt}::text,
                       'version', COALESCE((settings.value->>'version')::int, 0) + 1),
                   updated_at = now()
            RETURNING (value->>'version')::int AS version
        `;
        return Number(rows[0].version);
    },

    async countUsers() {
        const rows = await getSql()`SELECT count(*)::int AS n FROM users`;
        return rows[0].n;
    },

    /**
     * Create the first admin only while the users table is empty. One
     * statement, so two concurrent first-run requests cannot both win.
     * @returns {Promise<boolean>} true when this call created the user
     */
    async createFirstUser({ username, hash, salt }) {
        const rows = await getSql()`
            INSERT INTO users (username, pass_hash, salt)
            SELECT ${username}, ${hash}, ${salt}
             WHERE NOT EXISTS (SELECT 1 FROM users)
            RETURNING username
        `;
        return rows.length === 1;
    },

    async updatePassword({ username, hash, salt }) {
        const rows = await getSql()`
            UPDATE users SET pass_hash = ${hash}, salt = ${salt}
             WHERE username = ${username}
            RETURNING username
        `;
        return rows.length === 1;
    },

    /** Audit row for settings changes (shown in the admin HISTORY view). */
    async logEvent({ username, action, entity }) {
        await getSql()`
            INSERT INTO change_log (username, action, entity)
            VALUES (${username}, ${action}, ${entity ?? null})
        `;
    },
};

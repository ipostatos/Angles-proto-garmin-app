// Three-way merge of two catalog edits made from the same base revision, used
// when a save hits 409 stale_revision. Holds and angles are matched by id;
// changes on different records (or different fields of one record) combine
// on their own. Only the same field changed differently on both sides, or a
// record edited on one side and deleted on the other, is a conflict.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function byId(list) {
    const map = new Map();
    for (const item of list || []) if (item?.id != null) map.set(item.id, item);
    return map;
}

/**
 * Merge one record. Returns { mine, theirs, conflict }: the result when this
 * editor wins conflicting fields, and when the saved version wins.
 * `undefined` means the record is deleted.
 */
function mergeRecord(b, m, t) {
    if (same(m, b)) return { mine: t, theirs: t, conflict: false };
    if (same(t, b)) return { mine: m, theirs: m, conflict: false };
    if (same(m, t)) return { mine: m, theirs: m, conflict: false };
    // deleted on one side, changed on the other
    if (m === undefined || t === undefined || b === undefined) {
        return { mine: m, theirs: t, conflict: true };
    }
    const mine = {};
    const theirs = {};
    let conflict = false;
    for (const key of new Set([...Object.keys(b), ...Object.keys(m), ...Object.keys(t)])) {
        const [bv, mv, tv] = [b[key], m[key], t[key]];
        let mineV;
        let theirsV;
        if (same(mv, bv)) { mineV = tv; theirsV = tv; }
        else if (same(tv, bv) || same(mv, tv)) { mineV = mv; theirsV = mv; }
        else { mineV = mv; theirsV = tv; conflict = true; }
        if (mineV !== undefined) mine[key] = mineV;
        if (theirsV !== undefined) theirs[key] = theirsV;
    }
    return { mine, theirs, conflict };
}

function mergeList(baseList, mineList, theirsList, label) {
    const b = byId(baseList);
    const m = byId(mineList);
    const t = byId(theirsList);
    // their order first, then records only I added
    const ids = [...t.keys(), ...[...m.keys()].filter((id) => !t.has(id) && !b.has(id))];
    for (const id of b.keys()) if (!ids.includes(id) && m.has(id)) ids.push(id);
    const mine = [];
    const theirs = [];
    const conflicts = [];
    for (const id of ids) {
        const r = mergeRecord(b.get(id), m.get(id), t.get(id));
        if (r.mine !== undefined) mine.push(r.mine);
        if (r.theirs !== undefined) theirs.push(r.theirs);
        if (r.conflict) conflicts.push({ id, label: label(m.get(id) ?? t.get(id) ?? b.get(id)) });
    }
    return { mine, theirs, conflicts };
}

/** Drop angles whose hold is gone in that variant. */
function withoutOrphans(holds, angles) {
    const ids = new Set(holds.map((h) => h.id));
    return angles.filter((a) => ids.has(a.holdId));
}

const normName = (n) => String(n ?? '').trim().toLowerCase();

/**
 * @returns {{ mine: object, theirs: object, conflicts: Array<{kind, id, label}> }}
 *   `mine` resolves conflicts in favour of this editor, `theirs` in favour of
 *   the saved version. Both are equal when `conflicts` is empty.
 */
export function mergeCatalogs(base, mine, theirs) {
    const holdName = (h) => h?.name ?? '?';
    const holds = mergeList(base?.holds, mine?.holds, theirs?.holds, holdName);
    const names = new Map([...(base?.holds || []), ...(theirs?.holds || []), ...(mine?.holds || [])].map((h) => [h.id, h.name]));
    const angleLabel = (a) => `${names.get(a?.holdId) ?? '?'} ${String(a?.saw ?? '').toUpperCase()} ${a?.value ?? '?'}°`;
    const angles = mergeList(base?.angles, mine?.angles, theirs?.angles, angleLabel);
    const conflicts = [
        ...holds.conflicts.map((c) => ({ kind: 'hold', ...c })),
        ...angles.conflicts.map((c) => ({ kind: 'angle', ...c })),
    ];
    const conflictIds = new Set(conflicts.map((c) => c.id));

    // My new or edited angle on a hold the other admin deleted: never drop it
    // silently. "Mine" brings the hold back, "theirs" lets it go.
    const baseAngles = byId(base?.angles);
    const baseHolds = byId(base?.holds);
    const myHolds = byId(mine?.holds);
    const mineHoldIds = new Set(holds.mine.map((h) => h.id));
    for (const a of angles.mine) {
        if (mineHoldIds.has(a.holdId) || conflictIds.has(a.id)) continue;
        if (same(a, baseAngles.get(a.id))) continue;
        conflicts.push({ kind: 'angle', id: a.id, label: `${angleLabel(a)} (hold deleted by the other admin)` });
        conflictIds.add(a.id);
        const hold = myHolds.get(a.holdId) ?? baseHolds.get(a.holdId);
        if (hold && !mineHoldIds.has(hold.id)) {
            holds.mine.push(hold);
            mineHoldIds.add(hold.id);
        }
    }

    // Both admins created a hold with the same name.
    const theirNames = new Map((theirs?.holds || []).map((h) => [normName(h.name), h.id]));
    const dropFromTheirs = new Set();
    for (const h of mine?.holds || []) {
        const other = theirNames.get(normName(h.name));
        if (baseHolds.has(h.id) || other == null || other === h.id) continue;
        conflicts.push({ kind: 'hold', id: h.id, label: `${h.name} (also added by the other admin)` });
        const taken = new Set(holds.mine.map((x) => normName(x.name)));
        let n = 2;
        while (taken.has(normName(`${h.name} (${n})`))) n++;
        holds.mine = holds.mine.map((x) => (x.id === h.id ? { ...x, name: `${h.name} (${n})` } : x));
        dropFromTheirs.add(h.id);
    }
    const theirsHolds = holds.theirs.filter((h) => !dropFromTheirs.has(h.id));

    const meta = { ...(theirs || {}), ...(mine || {}) };
    return {
        mine: { ...meta, holds: holds.mine, angles: withoutOrphans(holds.mine, angles.mine) },
        theirs: { ...meta, holds: theirsHolds, angles: withoutOrphans(theirsHolds, angles.theirs) },
        conflicts,
    };
}

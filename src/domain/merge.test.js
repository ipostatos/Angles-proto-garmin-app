import { describe, it, expect } from 'vitest';
import { mergeCatalogs } from './merge.js';

const base = {
    version: 2,
    holds: [{ id: 'h1', name: 'Amon' }, { id: 'h2', name: 'Anton' }],
    angles: [
        { id: 'a1', holdId: 'h1', value: 30, saw: 'main' },
        { id: 'a2', holdId: 'h2', value: 40, saw: 'stefan' },
    ],
};
const clone = (x) => JSON.parse(JSON.stringify(x));

describe('mergeCatalogs', () => {
    it('combines edits on different records without conflicts', () => {
        const mine = clone(base);
        mine.angles[0].value = 31;
        const theirs = clone(base);
        theirs.holds.push({ id: 'h3', name: 'Base 10' });
        theirs.angles.push({ id: 'a3', holdId: 'h3', value: 10, saw: 'main' });
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([]);
        expect(r.mine.angles.find((a) => a.id === 'a1').value).toBe(31);
        expect(r.mine.holds.map((h) => h.id)).toEqual(['h1', 'h2', 'h3']);
        expect(r.mine.angles).toHaveLength(3);
        expect(r.theirs).toEqual(r.mine);
    });

    it('combines different fields of the same record', () => {
        const mine = clone(base);
        mine.angles[1].value = 41;
        const theirs = clone(base);
        theirs.angles[1].drawing = '/api/images?p=img/' + 'a'.repeat(32) + '.jpg';
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([]);
        expect(r.mine.angles[1]).toMatchObject({ value: 41, drawing: expect.stringContaining('/api/images') });
    });

    it('keeps additions from both sides', () => {
        const mine = clone(base);
        mine.angles.push({ id: 'm1', holdId: 'h1', value: 22, saw: 'main' });
        const theirs = clone(base);
        theirs.angles.push({ id: 't1', holdId: 'h2', value: 44, saw: 'stefan' });
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.mine.angles.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'm1', 't1']);
    });

    it('applies deletions from either side', () => {
        const mine = clone(base);
        mine.angles = mine.angles.filter((a) => a.id !== 'a1');
        const theirs = clone(base);
        theirs.holds = theirs.holds.filter((h) => h.id !== 'h2');
        theirs.angles = theirs.angles.filter((a) => a.holdId !== 'h2');
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([]);
        expect(r.mine.holds.map((h) => h.id)).toEqual(['h1']);
        expect(r.mine.angles).toEqual([]);
    });

    it('reports the same field changed differently', () => {
        const mine = clone(base);
        mine.angles[0].value = 31;
        const theirs = clone(base);
        theirs.angles[0].value = 32;
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([{ kind: 'angle', id: 'a1', label: 'Amon MAIN 31°' }]);
        expect(r.mine.angles[0].value).toBe(31);
        expect(r.theirs.angles[0].value).toBe(32);
    });

    it('reports edit-vs-delete and drops orphan angles in each variant', () => {
        const mine = clone(base);
        mine.holds[1].name = 'Anton 2';
        const theirs = clone(base);
        theirs.holds = theirs.holds.filter((h) => h.id !== 'h2');
        theirs.angles = theirs.angles.filter((a) => a.holdId !== 'h2');
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([{ kind: 'hold', id: 'h2', label: 'Anton 2' }]);
        expect(r.mine.holds.map((h) => h.name)).toEqual(['Amon', 'Anton 2']);
        expect(r.theirs.holds.map((h) => h.name)).toEqual(['Amon']);
        expect(r.theirs.angles.map((a) => a.id)).toEqual(['a1']);
    });

    it('asks instead of dropping my new angle on a hold the other admin deleted', () => {
        const mine = clone(base);
        mine.angles.push({ id: 'm1', holdId: 'h2', value: 12, saw: 'main' });
        const theirs = clone(base);
        theirs.holds = theirs.holds.filter((h) => h.id !== 'h2');
        theirs.angles = theirs.angles.filter((a) => a.holdId !== 'h2');
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([{ kind: 'angle', id: 'm1', label: 'Anton MAIN 12° (hold deleted by the other admin)' }]);
        expect(r.mine.holds.map((h) => h.id)).toEqual(['h1', 'h2']);
        expect(r.mine.angles.map((a) => a.id).sort()).toEqual(['a1', 'm1']); // their delete of a2 stands
        expect(r.theirs.holds.map((h) => h.id)).toEqual(['h1']);
        expect(r.theirs.angles.map((a) => a.id)).toEqual(['a1']);
    });

    it('treats the same new hold name on both sides as a conflict', () => {
        const mine = clone(base);
        mine.holds.push({ id: 'm9', name: 'Base 10' });
        mine.angles.push({ id: 'ma', holdId: 'm9', value: 10, saw: 'main' });
        const theirs = clone(base);
        theirs.holds.push({ id: 't9', name: 'base 10' });
        const r = mergeCatalogs(base, mine, theirs);
        expect(r.conflicts).toEqual([{ kind: 'hold', id: 'm9', label: 'Base 10 (also added by the other admin)' }]);
        expect(r.mine.holds.map((h) => h.name)).toEqual(['Amon', 'Anton', 'base 10', 'Base 10 (2)']);
        expect(r.theirs.holds.map((h) => h.id)).toEqual(['h1', 'h2', 't9']);
        expect(r.theirs.angles.some((a) => a.id === 'ma')).toBe(false);
    });
});

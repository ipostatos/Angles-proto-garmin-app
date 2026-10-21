// Writes the bundled offline catalog from an admin EXPORT (JSON backup):
//   node garmin/tools/build-catalog.mjs path/to/angles-export.json
// Without it the watch ships with an empty catalog and gets the real one on its
// first sync after pairing (the catalog API needs a paired watch).
// Output: [[name, [main angles], [stefan angles]], ...]
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
    console.error('Usage: node garmin/tools/build-catalog.mjs <export.json>');
    process.exit(1);
}
const raw = JSON.parse(readFileSync(file, 'utf8'));
const data = raw.data ?? raw;
const pick = (id, saw) => data.angles
    .filter(a => a.holdId === id && a.saw === saw)
    .map(a => Number(a.value)).sort((x, y) => x - y);
const rows = data.holds
    .map(h => [h.name, pick(h.id, 'main'), pick(h.id, 'stefan')])
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));
writeFileSync(new URL('../resources/jsonData/catalog.json', import.meta.url), JSON.stringify(rows));
console.log(`${rows.length} holds written`);

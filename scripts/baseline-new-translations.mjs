import { readdir, readFile, writeFile } from 'node:fs/promises';
import { translationFingerprint } from './event-translations.mjs';

const dataDir = new URL('../data/', import.meta.url);
const events = JSON.parse(await readFile(new URL('events.json', dataDir), 'utf8'));
const byId = new Map(events.map(event => [event.id, event]));
const files = (await readdir(dataDir))
  .filter(name => /^translations\.zh(?:\.[^.]+(?:-[^.]+)*)?\.json$/i.test(name))
  .filter(name => name !== 'translations.zh.manifest.json')
  .sort();
let total = 0;
for (const name of files) {
  const url = new URL(name, dataDir);
  const catalog = JSON.parse(await readFile(url, 'utf8'));
  let changed = 0;
  for (const entry of catalog.entries || []) {
    if (entry.status !== 'approved' || entry.sourceFingerprint !== 'AUTO') continue;
    const event = byId.get(entry.id);
    if (!event) throw new Error(`Cannot baseline translation; event not found: ${entry.id}`);
    entry.sourceFingerprint = translationFingerprint(event);
    changed += 1;
  }
  if (changed) {
    await writeFile(url, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`${name}: baselined ${changed} translation(s)`);
    total += changed;
  }
}
console.log(`Baselined ${total} new Chinese translation(s). Existing fingerprints were never changed.`);

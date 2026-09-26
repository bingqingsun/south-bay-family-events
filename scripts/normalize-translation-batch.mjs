import { readFile, writeFile } from 'node:fs/promises';
import { translationFingerprint } from './event-translations.mjs';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const byId = new Map(events.map(event => [event.id, event]));
const target = new URL('../data/translations.zh.2026-h2-b2.json', import.meta.url);
const catalog = JSON.parse(await readFile(target, 'utf8'));
let changed = 0;
for (const entry of catalog.entries || []) {
  const event = byId.get(entry.id);
  if (!event) throw new Error(`Cannot baseline translation; event not found: ${entry.id}`);
  const fingerprint = translationFingerprint(event);
  if (entry.sourceFingerprint !== fingerprint) {
    entry.sourceFingerprint = fingerprint;
    changed += 1;
  }
}
await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Normalized ${changed} translation fingerprint(s).`);

import { readFile } from 'node:fs/promises';
import { translationFingerprint, auditTranslationCatalog } from './event-translations.mjs';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const primary = JSON.parse(await readFile(new URL('../data/translations.zh.json', import.meta.url), 'utf8'));
const h2 = await readFile(new URL('../data/translations.zh.2026-h2.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => ({ entries: [] }));
const catalog = { ...primary, entries: [...(primary.entries || []), ...(h2.entries || [])] };
const { stats, problems, duplicates } = auditTranslationCatalog(events, catalog);

if (duplicates.length) {
  console.error('Duplicate translation catalog keys:', duplicates);
  process.exit(1);
}
if (problems.length) {
  console.error('Translation QA failed:', JSON.stringify(problems.slice(0, 20), null, 2));
  process.exit(1);
}

const approvedEntries = (catalog.entries || []).filter(entry => entry.status === 'approved');
const catalogById = new Map(approvedEntries.filter(entry => entry.id).map(entry => [entry.id, entry]));
const staleEntries = events.flatMap(event => {
  const entry = event.id ? catalogById.get(event.id) : null;
  if (!entry) return [];
  const currentFingerprint = translationFingerprint(event);
  if (entry.sourceFingerprint === currentFingerprint) return [];
  return [{ id: event.id, title: event.title, sourceFingerprint: entry.sourceFingerprint, currentFingerprint, description: event.description, url: event.url || '' }];
});

if (stats.stale) {
  console.warn(`::warning::${stats.stale} approved Chinese translation(s) are stale and will fall back to English until reviewed.`);
  console.warn(`STALE_TRANSLATIONS=${JSON.stringify(staleEntries)}`);
}
console.log(`translation QA passed: ${JSON.stringify(stats)}`);

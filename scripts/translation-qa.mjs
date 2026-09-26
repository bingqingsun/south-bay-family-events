import { readFile } from 'node:fs/promises';
import { translationFingerprint, auditTranslationCatalog } from './event-translations.mjs';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../data/translations.zh.json', import.meta.url), 'utf8'));
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
const catalogByUrl = new Map(approvedEntries.filter(entry => entry.sourceUrl).map(entry => [String(entry.sourceUrl).toLowerCase(), entry]));
const staleEntries = events.flatMap(event => {
  const byId = event.id ? catalogById.get(event.id) : null;
  const byUrl = event.url ? catalogByUrl.get(String(event.url).toLowerCase()) : null;
  const entry = byId || byUrl;
  if (!entry) return [];
  const currentFingerprint = translationFingerprint(event);
  if (entry.sourceFingerprint === currentFingerprint) return [];
  return [{
    id: event.id,
    matchedBy: byId ? 'id' : 'sourceUrl',
    catalogId: entry.id || '',
    title: event.title,
    sourceFingerprint: entry.sourceFingerprint,
    currentFingerprint,
    description: event.description,
    url: event.url || ''
  }];
});

if (stats.stale) {
  console.warn(`::warning::${stats.stale} approved Chinese translation match(es) are stale and will fall back to English until reviewed.`);
  console.warn(`STALE_TRANSLATIONS=${JSON.stringify(staleEntries)}`);
}
console.log(`translation QA passed: ${JSON.stringify(stats)}`);

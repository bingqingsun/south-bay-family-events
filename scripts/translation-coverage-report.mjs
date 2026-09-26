import { readFile } from 'node:fs/promises';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../data/translations.zh.json', import.meta.url), 'utf8'));
const approvedIds = new Set((catalog.entries || []).filter(entry => entry.status === 'approved').map(entry => entry.id));

const today = '2026-09-25';
const active = events
  .filter(event => {
    const end = String(event.endDateValue || event.dateValue || '').slice(0, 10);
    return !end || end >= today;
  })
  .sort((a, b) => String(a.dateValue || '').localeCompare(String(b.dateValue || '')) || String(a.title || '').localeCompare(String(b.title || '')));

const missing = active.filter(event => !approvedIds.has(event.id));
const batch = missing.slice(0, 60).map(event => ({
  id: event.id,
  dateValue: event.dateValue || '',
  title: event.title || '',
  description: event.description || '',
  source: event.source || '',
  url: event.url || ''
}));

const byMonth = missing.reduce((counts, event) => {
  const month = String(event.dateValue || 'unknown').slice(0, 7) || 'unknown';
  counts[month] = (counts[month] || 0) + 1;
  return counts;
}, {});

console.log(`translation coverage: ${JSON.stringify({ active: active.length, approvedIds: approvedIds.size, missing: missing.length, byMonth })}`);
console.log(`TRANSLATION_MISSING_BATCH=${JSON.stringify(batch)}`);

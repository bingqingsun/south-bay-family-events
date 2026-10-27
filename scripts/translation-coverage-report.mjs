import { readFile } from 'node:fs/promises';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';
import { auditTranslationCatalog, translationFingerprint } from './event-translations.mjs';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const catalog = await loadChineseTranslationCatalogs();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

const active = events.filter(event => {
  const end = String(event.endDateValue || event.dateValue || '').slice(0, 10);
  return !end || end >= today;
});
const audit = auditTranslationCatalog(active, catalog);
const { applyChineseTranslationCatalog } = await import('./event-translations.mjs');
const cloned = active.map(event => ({ ...event }));
applyChineseTranslationCatalog(cloned, catalog, { strict: false });
const statuses = cloned.map(event => event.translationStatus);
const gaps = active.map((event, index) => ({
  event, status: statuses[index] || 'missing'
})).filter(item => item.status !== 'current')
  .sort((a, b) => String(a.event.dateValue || '').localeCompare(String(b.event.dateValue || '')) || String(a.event.title || '').localeCompare(String(b.event.title || '')));

const byMonth = gaps.reduce((counts, item) => {
  const month = String(item.event.dateValue || 'unknown').slice(0, 7) || 'unknown';
  counts[month] = (counts[month] || 0) + 1;
  return counts;
}, {});
const byStatus = gaps.reduce((counts, item) => {
  counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
}, {});

const priorById = new Map((catalog.entries || []).filter(entry => entry?.id).map(entry => [entry.id, entry]));
console.log(`translation catalogs: ${catalog.files.join(', ')}`);
console.log(`translation coverage: ${JSON.stringify({ active: active.length, catalog: catalog.entries.length, current: active.length - gaps.length, gaps: gaps.length, byStatus, byMonth })}`);

for (let offset = 0; offset < gaps.length; offset += 40) {
  const batch = gaps.slice(offset, offset + 40).map(({ event, status }) => {
    const prior = [event.id, ...(Array.isArray(event.legacyIds) ? event.legacyIds : [])]
      .map(id => priorById.get(id)).find(Boolean);
    return {
      id: event.id,
      dateValue: event.dateValue || '',
      endDateValue: event.endDateValue || '',
      title: event.title || '',
      description: event.description || '',
      source: event.source || '',
      url: event.url || '',
      status,
      sourceFingerprint: translationFingerprint(event),
      priorTitleZh: status === 'stale' ? prior?.title || '' : '',
      priorDescriptionZh: status === 'stale' ? prior?.description || '' : ''
    };
  });
  console.log(`TRANSLATION_GAPS_BATCH_${Math.floor(offset / 40) + 1}=${JSON.stringify(batch)}`);
}

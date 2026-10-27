import { readFile, writeFile } from 'node:fs/promises';
import { applyChineseTranslationCatalog } from './event-translations.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';

const catalog = await loadChineseTranslationCatalogs();
const overlay = {};

for (const entry of catalog.entries || []) {
  if (!entry?.id || entry.status !== 'approved') continue;
  if (overlay[entry.id]) {
    throw new Error(`Duplicate approved translation id: ${entry.id}`);
  }
  overlay[entry.id] = {
    title: String(entry.title || '').trim(),
    description: String(entry.description || '').trim(),
    sourceFingerprint: entry.sourceFingerprint,
    status: entry.status
  };
}

// The static overlay must agree with the current published events, even when
// the default catalog winner is an older translation for the same event ID.
const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const currentEvents = events.map(event => ({ ...event }));
applyChineseTranslationCatalog(currentEvents, catalog, { strict: true });
for (const event of currentEvents) {
  if (event.translationStatus !== 'current' || !event.translations?.zh) continue;
  const zh = event.translations.zh;
  overlay[event.id] = {
    title: zh.title,
    description: zh.description,
    sourceFingerprint: zh.fingerprint,
    status: 'approved'
  };
}

const output = `window.SBFF_TRANSLATIONS_ZH = ${JSON.stringify(overlay)};\n`;
await writeFile(new URL('../data/translations.zh.js', import.meta.url), output, 'utf8');
console.log(`translation overlay written for ${Object.keys(overlay).length} approved entries from ${catalog.files.length} sidecars`);

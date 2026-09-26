import { writeFile } from 'node:fs/promises';
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

const output = `window.SBFF_TRANSLATIONS_ZH = ${JSON.stringify(overlay)};\n`;
await writeFile(new URL('../data/translations.zh.js', import.meta.url), output, 'utf8');
console.log(`translation overlay written for ${Object.keys(overlay).length} approved entries from ${catalog.files.length} sidecars`);

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';

const catalog = await loadChineseTranslationCatalogs();
const overlaySource = await readFile(new URL('../data/translations.zh.js', import.meta.url), 'utf8');
const match = overlaySource.match(/^window\.SBFF_TRANSLATIONS_ZH\s*=\s*([\s\S]*);\s*$/);
assert.ok(match, 'translations.zh.js must expose window.SBFF_TRANSLATIONS_ZH');
const overlay = JSON.parse(match[1]);
const approved = Object.fromEntries(
  catalog.entries
    .filter(entry => entry.status === 'approved')
    .map(entry => [entry.id, {
      title: String(entry.title || '').trim(),
      description: String(entry.description || '').trim(),
      sourceFingerprint: entry.sourceFingerprint,
      status: entry.status
    }])
);
assert.equal(Object.keys(approved).length, catalog.entries.filter(entry => entry.status === 'approved').length, 'approved translation IDs must be unique across all sidecars');
assert.deepEqual(overlay, approved, 'translations.zh.js must exactly mirror approved entries across all translation sidecars');
console.log(`translation overlay sync passed for ${Object.keys(overlay).length} entries across ${catalog.files.length} sidecars`);

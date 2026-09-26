import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../data/translations.zh.json', import.meta.url), 'utf8'));
const overlaySource = await readFile(new URL('../data/translations.zh.js', import.meta.url), 'utf8');
const match = overlaySource.match(/^window\.SBFF_TRANSLATIONS_ZH\s*=\s*([\s\S]*);\s*$/);
assert.ok(match, 'translations.zh.js must expose window.SBFF_TRANSLATIONS_ZH');
const overlay = JSON.parse(match[1]);
const approved = Object.fromEntries(
  catalog.entries
    .filter(entry => entry.status === 'approved')
    .map(entry => [entry.id, {
      title: entry.title,
      description: entry.description,
      sourceFingerprint: entry.sourceFingerprint,
      status: entry.status
    }])
);
assert.deepEqual(overlay, approved, 'translations.zh.js must exactly mirror approved translation catalog entries');
console.log(`translation overlay sync passed for ${Object.keys(overlay).length} entries`);

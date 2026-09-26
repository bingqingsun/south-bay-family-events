import { readFile } from 'node:fs/promises';
import { auditTranslationCatalog } from './event-translations.mjs';

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

if (stats.stale) {
  console.warn(`::warning::${stats.stale} approved Chinese translation(s) are stale and will fall back to English until reviewed.`);
}
console.log(`translation QA passed: ${JSON.stringify(stats)}`);

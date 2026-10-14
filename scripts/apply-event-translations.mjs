import { readFile, writeFile } from 'node:fs/promises';
import { applyChineseTranslationCatalog } from './event-translations.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';
import { applyVerifiedSummaryOverrides } from './lib/verified-summary-overrides.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const browserUrl = new URL('../data/events.js', import.meta.url);

const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
const catalog = await loadChineseTranslationCatalogs();
const { stats } = applyChineseTranslationCatalog(events, catalog, { strict: true });
// This final, source-backed editorial pass must win over stale sidecar
// translations and low-information scrape excerpts during every refresh.
const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const verified = applyVerifiedSummaryOverrides(events, sources);
events.splice(0, events.length, ...verified.events);

await writeFile(eventsUrl, `${JSON.stringify(events, null, 2)}\n`);
await writeFile(
  browserUrl,
  `window.SOUTH_BAY_EVENTS = ${JSON.stringify(events)};\nwindow.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt: new Date().toISOString() })};\n`
);

console.log(`Applied Chinese translations for preview/build: ${JSON.stringify(stats)}; ${verified.applied} source-verified editorial summaries`);

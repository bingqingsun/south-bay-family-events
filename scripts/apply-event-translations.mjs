import { readFile, writeFile } from 'node:fs/promises';
import { applyChineseTranslationCatalog } from './event-translations.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';
import { buildPublicEventPayload } from './public-event-payload.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const browserUrl = new URL('../data/events.js', import.meta.url);

const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
const catalog = await loadChineseTranslationCatalogs();
const { stats } = applyChineseTranslationCatalog(events, catalog, { strict: true });

await writeFile(eventsUrl, `${JSON.stringify(events, null, 2)}\n`);
await writeFile(
  browserUrl,
  `window.SOUTH_BAY_EVENTS = ${JSON.stringify(buildPublicEventPayload(events))};\nwindow.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt: new Date().toISOString() })};\n`
);

console.log(`Applied Chinese translations for preview/build: ${JSON.stringify(stats)}`);

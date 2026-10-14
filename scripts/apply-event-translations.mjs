import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EVENT_SUMMARY_VERSION } from './event-summary-engine.mjs';
import { applyChineseTranslationCatalog } from './event-translations.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const browserUrl = new URL('../data/events.js', import.meta.url);

const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
const catalog = await loadChineseTranslationCatalogs();
const { stats } = applyChineseTranslationCatalog(events, catalog, { strict: true });

const reviews = JSON.parse(await readFile(new URL('../data/reviewed-event-summaries.json', import.meta.url), 'utf8'));
for (const rule of reviews) {
  const event = events.find(e => e.title === rule.title
    && e.dateValue?.slice(0, 10) === rule.dateValue
    && [e.ticketUrl, e.url, e.canonicalUrl].some(u => String(u || '').includes('evt=' + rule.ticketId)));
  if (!event) continue;
  const evidence = [event.sourceDescriptionRaw || '', rule.sourceSynopsis || ''].filter(Boolean).join(' ');
  const fingerprint = createHash('sha256').update(event.title + '\n' + rule.en).digest('hex');
  Object.assign(event, {
    description: rule.en, parentSummary: rule.en, summaryStatus: 'manual_verified',
    summaryMethod: 'editorial_storyline_review', summaryQuality: 'manual_verified',
    sourceDescriptionRaw: evidence, sourceDescriptionHash: createHash('sha256').update(evidence).digest('hex'),
    summaryEvidence: evidence, summaryVersion: EVENT_SUMMARY_VERSION,
    summaryVerifiedAt: new Date().toISOString(),
    translations: { ...event.translations, zh: {
      title: event.translations?.zh?.title || event.title, description: rule.zh,
      fingerprint, translatedAt: '2026-10-14', translationSource: 'editorial-reviewed', status: 'approved'
    } }, translationStatus: 'current'
  });
}

await writeFile(eventsUrl, `${JSON.stringify(events, null, 2)}\n`);
await writeFile(
  browserUrl,
  `window.SOUTH_BAY_EVENTS = ${JSON.stringify(events)};\nwindow.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt: new Date().toISOString() })};\n`
);

console.log(`Applied Chinese translations for preview/build: ${JSON.stringify(stats)}`);

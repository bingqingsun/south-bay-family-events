import { readFile, writeFile } from 'node:fs/promises';
import { applyEditorialCovers } from './editorial-cover.mjs';

const eventJsonPath = 'data/events.json';
const eventJsPath = 'data/events.js';
const sources = JSON.parse(await readFile('data/sources.json', 'utf8'));
const generatedAt = new Date().toISOString();

const configuredImages = new Map();
for (const source of sources) {
  for (const configured of source.events || []) {
    if (!configured.image) continue;
    const day = String(configured.dateValue || '').slice(0, 10);
    const key = [source.name, configured.title, day].join('\u001f');
    configuredImages.set(key, {
      image: configured.image,
      sourceUrl: configured.url || source.feedUrl || source.landingUrl || ''
    });
  }
}

let events = JSON.parse(await readFile(eventJsonPath, 'utf8'));
events = events.map(event => {
  const day = String(event.dateValue || '').slice(0, 10);
  const configured = configuredImages.get([event.source, event.title, day].join('\u001f'));
  if (!configured) return event;
  return {
    ...event,
    image: configured.image,
    imageStatus: 'official',
    imageProvenance: {
      source: 'curated-manual',
      method: 'manual_verified',
      sourceUrl: configured.sourceUrl,
      verifiedAt: generatedAt,
      score: 100,
      evidence: 'first-party-curated-official-image'
    }
  };
});

const result = await applyEditorialCovers(events, {
  outputDir: new URL('../assets/generated/event-covers/', import.meta.url),
  publicBase: '/assets/generated/event-covers',
  generatedAt
});
await writeFile(eventJsonPath, JSON.stringify(result.events, null, 2) + '\n');
await writeFile(eventJsPath, 'window.SOUTH_BAY_EVENTS = ' + JSON.stringify(result.events) + ';\nwindow.SOUTH_BAY_EVENTS_META = ' + JSON.stringify({ generatedAt }) + ';\n');
console.log(JSON.stringify(result.stats, null, 2));

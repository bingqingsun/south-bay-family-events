import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  fetchPaloAltoChildrensTheatreDetail,
  normalizePaloAltoTheatreTitle
} from './lib/palo-alto-childrens-theatre.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const sourcesUrl = new URL('../data/sources.json', import.meta.url);

export async function enrichPaloAltoChildrensTheatreEvents(events, source, fetchDetail = fetchPaloAltoChildrensTheatreDetail) {
  if (!source?.officialDetailBaseUrl) return { events, enriched: 0 };
  const output = Array.isArray(events) ? events.map(event => ({ ...event })) : [];
  const titleDetails = new Map();
  const titles = [...new Set(output
    .filter(event => event.source === source.name && event.title)
    .map(event => event.title))];

  await Promise.all(titles.map(async title => {
    const detail = await fetchDetail(title, { baseUrl: source.officialDetailBaseUrl });
    if (detail) titleDetails.set(normalizePaloAltoTheatreTitle(title), detail);
  }));

  let enriched = 0;
  for (let index = 0; index < output.length; index += 1) {
    const event = output[index];
    if (event.source !== source.name) continue;
    const detail = titleDetails.get(normalizePaloAltoTheatreTitle(event.title));
    if (!detail?.image || !detail?.url) continue;
    const previousUrl = event.url || '';
    output[index] = {
      ...event,
      image: detail.image,
      imageStatus: 'official',
      imageFailureReason: '',
      imageProvenance: {
        source: 'canonical-detail',
        method: 'og:image',
        sourceUrl: detail.url,
        verifiedAt: new Date().toISOString(),
        score: 100,
        evidence: 'palo-alto-city-title-matches-showare-event'
      },
      url: detail.url,
      ticketUrl: event.ticketUrl || previousUrl
    };
    enriched += 1;
  }
  return { events: output, enriched };
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const sources = JSON.parse(await readFile(sourcesUrl, 'utf8'));
  const source = sources.find(item => item.name === "Palo Alto Children's Theatre");
  if (!source) {
    console.log("Palo Alto Children's Theatre source not configured; nothing to enrich.");
    return;
  }
  const result = await enrichPaloAltoChildrensTheatreEvents(events, source);
  await writeFile(eventsUrl, JSON.stringify(result.events, null, 2) + '\n');
  console.log(`Enriched ${result.enriched} Palo Alto Children's Theatre event row(s) from first-party City detail pages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}

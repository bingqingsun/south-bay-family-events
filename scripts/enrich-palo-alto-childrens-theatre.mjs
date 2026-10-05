import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  fetchPaloAltoChildrensTheatreDetail,
  normalizePaloAltoTheatreTitle
} from './lib/palo-alto-childrens-theatre.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const sourcesUrl = new URL('../data/sources.json', import.meta.url);

function officialImageFallbackFor(event, source) {
  const title = String(event?.title || '');
  return (source?.officialImageFallbacks || []).find(rule => {
    if (rule.titlePrefix && !title.startsWith(rule.titlePrefix)) return false;
    if (rule.titleIncludes && !title.includes(rule.titleIncludes)) return false;
    if (rule.titleExact && title !== rule.titleExact) return false;
    return Boolean(rule.image && rule.sourceUrl);
  }) || null;
}

export async function enrichPaloAltoChildrensTheatreEvents(events, source, fetchDetail = fetchPaloAltoChildrensTheatreDetail, options = {}) {
  if (!source?.officialDetailBaseUrl) return { events, enriched: 0 };
  const verifiedAt = options.verifiedAt || new Date().toISOString();
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
    const fallback = officialImageFallbackFor(event, source);
    if ((!detail?.image || !detail?.url) && !fallback) continue;

    const previousUrl = event.url || '';
    const previousCanonical = event.canonicalUrl || previousUrl;
    const preferFallbackImage = Boolean(fallback?.preferFallbackImage);
    const useDetail = Boolean(detail?.image && detail?.url && !preferFallbackImage);
    const image = useDetail ? detail.image : fallback.image;
    const sourceUrl = useDetail ? detail.url : fallback.sourceUrl;
    const canonicalUrl = detail?.url || fallback?.canonicalUrl || previousCanonical;
    const method = useDetail ? 'og:image' : 'program-page';
    const evidence = useDetail
      ? 'palo-alto-city-title-matches-showare-event'
      : fallback.evidence || 'official-program-image';

    const fieldProvenance = {
      ...(event.fieldProvenance || {}),
      image: {
        source: useDetail ? 'canonical-detail' : 'official-program',
        method,
        sourceUrl,
        verifiedAt
      }
    };
    const canonicalDetail = {
      ...(event.canonicalDetail || {}),
      status: 'enriched',
      sourceUrl: canonicalUrl,
      verifiedAt,
      fieldsUpdated: [...new Set([
        ...(event.canonicalDetail?.fieldsUpdated || []),
        'image',
        ...(canonicalUrl !== previousCanonical ? ['canonicalUrl'] : [])
      ])],
      reason: useDetail ? 'palo-alto-city-title-match' : 'palo-alto-official-program-image',
      canonicalChanged: canonicalUrl !== previousCanonical
    };
    output[index] = {
      ...event,
      image,
      imageStatus: 'official',
      imageProvenance: {
        source: useDetail ? 'canonical-detail' : 'official-program',
        method,
        sourceUrl,
        verifiedAt,
        score: useDetail ? 100 : 90,
        evidence
      },
      fieldProvenance,
      canonicalDetail,
      detailVerifiedAt: verifiedAt,
      detailStatus: 'enriched',
      detailFailureCount: 0,
      url: canonicalUrl,
      canonicalUrl,
      ticketUrl: event.ticketUrl || previousUrl,
      refreshStatus: useDetail ? 'official-detail-enriched' : 'official-program-image',
      refreshVerifiedAt: verifiedAt
    };
    delete output[index].imageFailureReason;
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

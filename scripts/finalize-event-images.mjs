import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { applyEditorialCovers } from './editorial-cover.mjs';
import { buildPublicEventPayload } from './public-event-payload.mjs';
import { fetchOfficialDetail } from './lib/detail-fetch.mjs';
import { eventSchemas, extractImageCandidates } from './lib/detail-extractors/generic.mjs';

const root = new URL('../', import.meta.url);
const eventsUrl = new URL('data/events.json', root);
const browserUrl = new URL('data/events.js', root);
const healthUrl = new URL('data/source-health.json', root);

function usableCandidate(candidate) {
  const url = candidate.url || '';
  // Lazy-loading placeholders can be linked to the correct event but still
  // be only a few pixels wide. Never publish those as card artwork.
  if (/blur_\d|smallthumbnail/i.test(url)) return false;
  const wixWidth = url.match(/(?:^|\/)w_(\d+),h_\d+/i);
  if (wixWidth && Number(wixWidth[1]) < 400) return false;
  try {
    const parsed = new URL(url);
    return !(parsed.searchParams.has('w') && Number(parsed.searchParams.get('w')) < 400);
  } catch { return false; }
}

async function imageLoads(url, fetchImpl, timeoutMs) {
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'SouthBayFamilyFindsImageAudit/1.0', accept: 'image/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok || !/^image\/(?:png|jpeg|webp|gif|avif)/i.test(response.headers.get('content-type') || '')) return false;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength >= 10000 && bytes.byteLength <= 15000000;
  } catch { return false; }
}

export async function resolveMissingOfficialImages(events, {
  fetchImpl = fetch, timeoutMs = 12000, verifiedAt = new Date().toISOString()
} = {}) {
  const output = events.map(event => ({ ...event }));
  const diagnostics = [];
  const cache = new Map();
  for (const event of output) {
    if (event.image && event.imageStatus !== 'generated-editorial') continue;
    if (!/^https?:\/\//i.test(event.url || '')) continue;
    let detail = cache.get(event.url);
    if (!detail) {
      detail = await fetchOfficialDetail(event.url, { fetchImpl, timeoutMs });
      cache.set(event.url, detail);
    }
    if (!detail.ok) {
      diagnostics.push({ id: event.id, title: event.title, reason: `detail_http_${detail.status || 'failed'}` });
      continue;
    }
    const schema = eventSchemas(detail.html, event.title)[0] || {};
    const candidates = extractImageCandidates({
      html: detail.html, schema, baseUrl: detail.finalUrl || event.url, title: event.title
    }).filter(usableCandidate);
    let selected;
    for (const candidate of candidates) {
      if (await imageLoads(candidate.url, fetchImpl, timeoutMs)) {
        selected = candidate;
        break;
      }
    }
    if (!selected) {
      diagnostics.push({ id: event.id, title: event.title, reason: 'no_loadable_event_image' });
      continue;
    }
    event.image = selected.url;
    event.imageStatus = 'official';
    event.imageProvenance = {
      source: 'supplement-detail', method: selected.method,
      sourceUrl: detail.finalUrl || event.url, verifiedAt,
      score: selected.score, evidence: selected.evidence
    };
    delete event.imageFailureReason;
    delete event.generatedImage;
  }
  return { events: output, diagnostics };
}

export async function finalizeEventImages(events, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const resolved = await resolveMissingOfficialImages(events, { ...options, verifiedAt: generatedAt });
  const illustrated = await applyEditorialCovers(resolved.events, {
    outputDir: options.outputDir || new URL('assets/generated/event-covers/', root),
    publicBase: '/assets/generated/event-covers', generatedAt
  });
  const counts = illustrated.events.reduce((result, event) => {
    const kind = event.imageStatus === 'generated-editorial' ? 'illustration'
      : event.image ? 'officialOrSource' : 'missing';
    result[kind] += 1;
    return result;
  }, { officialOrSource: 0, illustration: 0, missing: 0 });
  return {
    events: illustrated.events,
    stats: { checkedAt: generatedAt, ...counts, unresolvedOfficial: resolved.diagnostics,
      generated: illustrated.stats.generated }
  };
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const health = JSON.parse(await readFile(healthUrl, 'utf8'));
  const result = await finalizeEventImages(events);
  if (result.stats.missing) throw new Error(`${result.stats.missing} published event(s) still have no image`);
  health.publishedImageCoverage = result.stats;
  await writeFile(eventsUrl, JSON.stringify(result.events, null, 2) + '\n');
  await writeFile(browserUrl,
    `window.SOUTH_BAY_EVENTS = ${JSON.stringify(buildPublicEventPayload(result.events))};\n` +
    `window.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt: result.stats.checkedAt })};\n`);
  await writeFile(healthUrl, JSON.stringify(health, null, 2) + '\n');
  console.log(`Final image coverage: ${JSON.stringify(result.stats)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();

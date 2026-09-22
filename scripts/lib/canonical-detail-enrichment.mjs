import { allowedHostsFor, sourceForEvent } from '../link-health.mjs';
import { fetchOfficialDetail } from './detail-fetch.mjs';
import { DETAIL_QUALITY_STATES, buildEventQuality, enrichEventFromDetail } from './detail-enrichment.mjs';

function sameUrl(a, b) {
  try {
    const left = new URL(a); const right = new URL(b);
    left.hash = ''; right.hash = '';
    return left.href === right.href;
  } catch { return false; }
}

export function shouldEnrichCanonicalDetail(event, source = {}) {
  const url = event?.canonicalUrl || event?.url || '';
  if (!/^https?:\/\//i.test(url)) return false;
  if (source.detailEnrichment === false) return false;
  // Transactional showtime/ticket URLs are already authoritative for the
  // session but are not stable editorial detail pages.
  if (event.format === 'movie-screening' || source.linkPolicy === 'ticket_partner') return false;
  if (sameUrl(url, source.feedUrl) || sameUrl(url, source.landingUrl)) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/(?:^|\/)(?:api|feed|rss|search)(?:\/|$)|\.json$/.test(path)) return false;
  } catch { return false; }
  return true;
}

function emptyDiagnostic(event, status, warning = '') {
  return buildEventQuality(event, {
    detailStatus: status,
    mode: 'canonical-refresh',
    detailUrl: event.canonicalUrl || event.url || '',
    warnings: warning ? [warning] : []
  });
}

export async function enrichCanonicalDetails(events, sources, {
  concurrency = 8,
  timeoutMs = 12000,
  verifiedAt = new Date().toISOString(),
  fetchImpl = fetch
} = {}) {
  const output = new Array(events.length);
  const diagnostics = new Array(events.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(concurrency) || 8, 12)) }, async () => {
    while (cursor < events.length) {
      const index = cursor++;
      const event = events[index];
      const source = sourceForEvent(event, sources);
      if (!shouldEnrichCanonicalDetail(event, source)) {
        output[index] = event;
        diagnostics[index] = emptyDiagnostic(event, 'not-eligible');
        continue;
      }

      const detailUrl = event.canonicalUrl || event.url;
      const fetched = await fetchOfficialDetail(detailUrl, {
        allowedHosts: allowedHostsFor(source),
        timeoutMs,
        fetchImpl
      });
      if (!fetched.ok) {
        output[index] = {
          ...event,
          detailStatus: 'fetch-failed',
          detailFailureCount: Number(event.detailFailureCount || 0) + 1,
          detailVerifiedAt: verifiedAt,
          detailSourceUrl: detailUrl
        };
        diagnostics[index] = buildEventQuality(output[index], {
          detailStatus: 'fetch-failed',
          mode: 'canonical-refresh',
          detailUrl,
          detailVerifiedAt: verifiedAt,
          fetchStatus: fetched.status,
          warnings: [fetched.error || 'detail_fetch_failed']
        });
        continue;
      }

      const result = enrichEventFromDetail(event, {
        source,
        html: fetched.html,
        finalUrl: fetched.finalUrl,
        mode: 'canonical-refresh',
        verifiedAt,
        fetchStatus: fetched.status
      });
      output[index] = result.event;
      diagnostics[index] = result.diagnostics;
    }
  }));

  const summary = diagnostics.reduce((all, item) => {
    const status = item?.detail_status || 'unknown';
    all.statuses[status] = (all.statuses[status] || 0) + 1;
    for (const field of item?.fields_updated || []) all.fieldsUpdated[field] = (all.fieldsUpdated[field] || 0) + 1;
    return all;
  }, { checkedAt: verifiedAt, total: events.length, statuses: {}, fieldsUpdated: {} });

  return {
    events: output.filter((event, index) => diagnostics[index]?.quality_state !== DETAIL_QUALITY_STATES.CANCELLED),
    diagnostics,
    summary
  };
}

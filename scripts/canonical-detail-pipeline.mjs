import { allowedHostsFor, isAllowedOfficialUrl, normalizeOfficialUrl, sourceForEvent } from './link-health.mjs';
import { fetchOfficialDetail } from './lib/detail-fetch.mjs';
import { DETAIL_QUALITY_STATES, enrichEventFromDetail } from './lib/detail-enrichment.mjs';

const DAY = 86400000;
const IMAGE_RETRY_TTL = 7 * DAY;

function missingHighChangeField(event) {
  return !/T\d{2}:\d{2}/.test(String(event.dateValue || ''))
    || !event.costStatus || event.costStatus === 'unknown'
    || !event.registrationStatus || event.registrationStatus === 'unknown';
}

function missingLowChangeField(event) {
  return !event.image || !event.description || !event.place || !event.address;
}

function canonicalUrl(event) {
  return normalizeOfficialUrl(event.canonicalUrl || event.url || '');
}

export function canonicalEnrichmentDecision(event, previous, now = Date.now()) {
  const current = canonicalUrl(event);
  if (!current) return { run: false, reason: 'no-canonical' };
  const prior = normalizeOfficialUrl(previous?.canonicalDetail?.sourceUrl || previous?.canonicalUrl || previous?.url || '');
  if (!previous) return { run: true, reason: 'first-canonical-pass' };
  if (current !== prior) return { run: true, reason: 'canonical-changed' };
  if (missingHighChangeField(event) || missingLowChangeField(event)) return { run: true, reason: 'missing-fields' };
  const verified = Date.parse(previous?.canonicalDetail?.verifiedAt || '');
  if (!Number.isFinite(verified)) return { run: true, reason: 'unverified' };
  const imageNeedsRetry = !event.image || event.imageStatus === 'missing' || Boolean(event.imageFailureReason);
  const ttl = missingHighChangeField(event) || imageNeedsRetry ? IMAGE_RETRY_TTL : 30 * DAY;
  return { run: now - verified >= ttl, reason: now - verified >= ttl ? 'ttl-expired' : 'cached' };
}

function previousFor(event, previousById) {
  return previousById.get(event.id)
    || (event.legacyIds || []).map(id => previousById.get(id)).find(Boolean)
    || null;
}

function reuseCanonicalEvidence(event, previous) {
  if (!previous || canonicalUrl(event) !== normalizeOfficialUrl(previous?.canonicalDetail?.sourceUrl || previous?.canonicalUrl || previous?.url || '')) return event;
  const provenance = previous.fieldProvenance || {};
  const merged = { ...event, fieldProvenance: { ...(event.fieldProvenance || {}) } };
  const strongerSummaryEvidence = ['official_structured', 'manual_verified'].includes(event.summaryStatus);
  Object.entries(provenance).forEach(([field, evidence]) => {
    if (evidence?.source !== 'canonical-detail' || previous[field] === undefined) return;
    if (strongerSummaryEvidence && ['description', 'sourceDescriptionRaw'].includes(field)) return;
    // Never let stale empty canonical evidence erase a value recovered by the
    // current source pass. This previously blanked newly recovered official
    // artwork (for example Cupertino Bike Fest) while retaining old provenance.
    if (field === 'image' && !previous[field] && merged[field]) return;
    merged[field] = previous[field];
    merged.fieldProvenance[field] = evidence;
  });
  if (!strongerSummaryEvidence && previous.sourceDescriptionRaw && provenance.sourceDescriptionRaw?.source === 'canonical-detail') {
    merged.sourceDescriptionRaw = previous.sourceDescriptionRaw;
  }
  if (previous.canonicalDetail) merged.canonicalDetail = previous.canonicalDetail;
  // A transient fetch/parser failure must never erase a previously verified
  // official image. Carry its evidence forward until stronger evidence exists.
  if (previous.imageStatus === 'official' && previous.image && previous.imageProvenance?.source === 'canonical-detail') {
    merged.image = previous.image;
    merged.imageStatus = 'official';
    merged.imageProvenance = previous.imageProvenance;
    delete merged.imageFailureReason;
  }
  return merged;
}

export async function enrichOneCanonicalEvent(event, {
  sources = [],
  previous = null,
  verifiedAt = new Date().toISOString(),
  timeoutMs = 12000,
  fetchImpl = fetch
} = {}) {
  const source = sourceForEvent(event, sources);
  const decision = canonicalEnrichmentDecision(event, previous, Date.parse(verifiedAt));
  const currentUrl = canonicalUrl(event);
  const baseline = reuseCanonicalEvidence(event, previous);

  if (!decision.run) {
    return {
      event: baseline,
      diagnostics: { status: 'cached', reason: decision.reason, sourceUrl: currentUrl, fieldsUpdated: [] }
    };
  }
  if (!source?.name || !currentUrl || !isAllowedOfficialUrl(currentUrl, source)) {
    return {
      event: { ...baseline, canonicalDetail: { status: 'skipped-untrusted-url', sourceUrl: currentUrl, verifiedAt, fieldsUpdated: [] } },
      diagnostics: { status: 'skipped-untrusted-url', reason: decision.reason, sourceUrl: currentUrl, fieldsUpdated: [] }
    };
  }

  const detail = await fetchOfficialDetail(currentUrl, {
    domain: source.domain,
    allowedHosts: allowedHostsFor(source),
    timeoutMs,
    fetchImpl
  });
  if (!detail.ok || !isAllowedOfficialUrl(detail.finalUrl || currentUrl, source)) {
    const status = detail.status === 403 || detail.status === 429 ? 'fetch-blocked' : 'fetch-failed';
    return {
      event: {
        ...baseline,
        canonicalDetail: {
          ...(baseline.canonicalDetail || {}),
          status, sourceUrl: currentUrl, verifiedAt,
          fieldsUpdated: [], httpStatus: detail.status, error: detail.error || ''
        }
      },
      diagnostics: { status, reason: decision.reason, sourceUrl: currentUrl, fieldsUpdated: [], httpStatus: detail.status }
    };
  }

  const enriched = enrichEventFromDetail(baseline, {
    source,
    html: detail.html,
    finalUrl: detail.finalUrl || currentUrl,
    mode: 'canonical-detail',
    verifiedAt,
    fetchStatus: detail.status
  });

  if (enriched.diagnostics.quality_state === DETAIL_QUALITY_STATES.CANCELLED) {
    return {
      event: {
        ...baseline,
        availabilityStatus: 'cancelled',
        canonicalDetail: { status: 'cancelled', sourceUrl: detail.finalUrl || currentUrl, verifiedAt, fieldsUpdated: [] }
      },
      diagnostics: { status: 'cancelled', reason: decision.reason, sourceUrl: detail.finalUrl || currentUrl, fieldsUpdated: [] }
    };
  }
  if (enriched.diagnostics.detail_status === 'identity-mismatch') {
    return {
      event: {
        ...baseline,
        canonicalDetail: { status: 'identity-mismatch', sourceUrl: detail.finalUrl || currentUrl, verifiedAt, fieldsUpdated: [] }
      },
      diagnostics: { status: 'identity-mismatch', reason: decision.reason, sourceUrl: detail.finalUrl || currentUrl, fieldsUpdated: [] }
    };
  }

  const fieldsUpdated = enriched.diagnostics.fields_updated || [];
  const result = {
    ...enriched.event,
    canonicalDetail: {
      ...(enriched.event.canonicalDetail || {}),
      status: 'enriched',
      sourceUrl: detail.finalUrl || currentUrl,
      verifiedAt,
      reason: decision.reason,
      canonicalChanged: decision.reason === 'canonical-changed',
      fieldsUpdated
    }
  };
  return {
    event: result,
    diagnostics: { status: 'enriched', reason: decision.reason, sourceUrl: detail.finalUrl || currentUrl, fieldsUpdated }
  };
}

export async function enrichCanonicalEvents(events, {
  sources = [],
  previousEvents = [],
  verifiedAt = new Date().toISOString(),
  concurrency = 6,
  timeoutMs = 12000,
  fetchImpl = fetch
} = {}) {
  const previousById = new Map();
  previousEvents.forEach(event => {
    if (event.id) previousById.set(event.id, event);
    (event.legacyIds || []).forEach(id => previousById.set(id, event));
  });
  const output = new Array(events.length);
  const diagnostics = new Array(events.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(Number(concurrency) || 6, 10));

  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < events.length) {
      const index = cursor++;
      const event = events[index];
      const result = await enrichOneCanonicalEvent(event, {
        sources,
        previous: previousFor(event, previousById),
        verifiedAt,
        timeoutMs,
        fetchImpl
      });
      output[index] = result.event;
      diagnostics[index] = { id: event.id, title: event.title, source: event.source, ...result.diagnostics };
    }
  }));
  return { events: output, diagnostics };
}

// Keep the canonical JSON rich enough for refresh, audit, and repair jobs while
// publishing only fields the browser needs. This avoids shipping duplicate raw
// source text and internal provenance with every activity card.
const INTERNAL_EVENT_FIELDS = new Set([
  'sourceDescriptionRaw',
  'sourceDescriptionHash',
  'summaryStatus',
  'summaryVersion',
  'summaryVerifiedAt',
  'summaryMethod',
  'summaryQuality',
  'summaryEvidence',
  'summaryEvidenceData',
  'fieldProvenance',
  'canonicalDetail',
  'imageProvenance',
  'imageFailureReason',
  'refreshStatus',
  'refreshErrorAt',
  'refreshVerifiedAt',
  'linkStatus',
  'linkCheckedAt',
  'linkHttpStatus',
  'linkSource',
  'canonicalUrl',
  'audienceStatus'
]);

export function publicEventPayload(event = {}) {
  return Object.fromEntries(
    Object.entries(event).filter(([field]) => !INTERNAL_EVENT_FIELDS.has(field))
  );
}

export function buildPublicEventPayload(events = []) {
  return Array.isArray(events) ? events.map(publicEventPayload) : [];
}

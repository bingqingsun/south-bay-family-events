import assert from 'node:assert/strict';
import { buildPublicEventPayload, publicEventPayload } from './public-event-payload.mjs';

const canonical = {
  id: 'event-1',
  title: 'Family Event',
  description: 'Public summary',
  parentSummary: 'Parent-facing summary',
  dateValue: '2026-11-15T10:00',
  imageStatus: 'official',
  verification: 'verified',
  linkResolution: 'canonical',
  translations: { zh: { title: '亲子活动' } },
  legacyIds: ['legacy-event-1'],
  costEvidence: 'Official page says free.',
  sourceDescriptionRaw: 'Long organizer source text',
  summaryEvidence: 'Duplicate audit evidence',
  fieldProvenance: { description: 'official-detail' },
  imageProvenance: { source: 'official' },
  refreshStatus: 'verified',
  linkCheckedAt: '2026-11-02T12:00:00Z',
  canonicalUrl: 'https://example.com/canonical'
};

const projected = publicEventPayload(canonical);
for (const field of [
  'id', 'title', 'description', 'parentSummary', 'dateValue', 'imageStatus',
  'verification', 'linkResolution', 'translations', 'legacyIds', 'costEvidence'
]) {
  assert.deepEqual(projected[field], canonical[field], `public field ${field} should be preserved`);
}
for (const field of [
  'sourceDescriptionRaw', 'summaryEvidence', 'fieldProvenance',
  'imageProvenance', 'refreshStatus', 'linkCheckedAt', 'canonicalUrl'
]) {
  assert.equal(Object.hasOwn(projected, field), false, `internal field ${field} should be omitted`);
}
assert.equal(canonical.sourceDescriptionRaw, 'Long organizer source text');
assert.deepEqual(buildPublicEventPayload([canonical]), [projected]);
assert.deepEqual(buildPublicEventPayload(null), []);
console.log('Public event payload contract tests passed.');

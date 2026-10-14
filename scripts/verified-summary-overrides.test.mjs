import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyVerifiedSummaryOverrides } from './lib/verified-summary-overrides.mjs';
import { translationFingerprint } from './event-translations.mjs';
import { semanticSummaryIssues } from './summary-semantic-coverage.test.mjs';

const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const pact = sources.find(source => source.name === "Palo Alto Children's Theatre");
assert.equal(pact?.verifiedSummaryOverrides?.length, 2);

const cases = pact.verifiedSummaryOverrides.map((item, index) => ({
  id: `mock-${index}`,
  title: item.title,
  dateValue: item.date,
  source: pact.name,
  description: 'Old scrape of date and crew credits only',
  summaryStatus: 'extractive',
  translations: { zh: { description: 'Old untranslated schedule' } }
}));
const differentOrganizers = {
  ...cases[0], id: 'other-organizer', source: 'Different Theatre'
};
const differentDate = {
  ...cases[1], id: 'other-date', dateValue: '2027-11-05'
};

const result = applyVerifiedSummaryOverrides([...cases, differentOrganizers, differentDate], sources);
assert.equal(result.applied, 2, 'only the exact event, source and date may be overridden');
for (const [index, item] of pact.verifiedSummaryOverrides.entries()) {
  const event = result.events[index];
  assert.equal(event.description, item.description);
  assert.equal(event.parentSummary, item.description);
  assert.equal(event.sourceDescriptionRaw, item.sourceText.replace(/\s+/g, ' ').trim());
  assert.equal(event.summaryStatus, 'manual_verified');
  assert.equal(event.summaryEvidence, event.sourceDescriptionRaw);
  assert.equal(event.translationStatus, 'current');
  assert.equal(event.translations.zh.description, item.zh.description);
  assert.equal(event.translations.zh.fingerprint, translationFingerprint(event));
  assert.deepEqual(event.summaryEvidenceData.sourceUrls, item.sourceUrls);
  assert.deepEqual(semanticSummaryIssues(event), [], 'must be a readable event synopsis');
}
assert.equal(result.events[2].description, differentOrganizers.description);
assert.equal(result.events[3].description, differentDate.description);
// Regression: the next nightly scrape can replace the temporary description,
// but a second editorial pass must restore the same verified copy.
const refreshed = result.events.map((item, index) => index < 2 ? {
  ...item, description: 'Daily scrape reintroduced the old date listing',
  parentSummary: 'Daily scrape reintroduced the old date listing'
} : item);
const rechecked = applyVerifiedSummaryOverrides(refreshed, sources);
assert.equal(rechecked.applied, 2);
assert.equal(rechecked.events[0].description, pact.verifiedSummaryOverrides[0].description);
assert.equal(rechecked.events[1].description, pact.verifiedSummaryOverrides[1].description);

console.log('Verified PACT summary overrides and Chinese translation regressions passed.');

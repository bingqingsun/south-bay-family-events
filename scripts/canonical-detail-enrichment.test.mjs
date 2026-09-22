import assert from 'node:assert/strict';
import { enrichCanonicalDetails, shouldEnrichCanonicalDetail } from './lib/canonical-detail-enrichment.mjs';

const source = { id: 'city-test', name: 'City Test', domain: 'example.gov', method: 'civic', feedUrl: 'https://example.gov/events', landingUrl: 'https://example.gov/events' };
const base = {
  id: 'event-1', title: 'Family Lantern Night', source: 'City Test',
  url: 'https://example.gov/events/family-lantern-night', canonicalUrl: 'https://example.gov/events/family-lantern-night',
  dateValue: '2026-09-26', endDateValue: '', place: 'Civic Center', address: '', city: 'San Jose',
  description: 'Short discovery-feed copy about the lantern event.', sourceDescriptionRaw: 'Short discovery-feed copy about the lantern event.',
  image: 'https://example.gov/images/listing-thumbnail.jpg', ageLabel: '', ageRanges: [], costStatus: 'unknown', registrationStatus: 'unknown', format: 'program'
};

assert.equal(shouldEnrichCanonicalDetail(base, source), true);
assert.equal(shouldEnrichCanonicalDetail({ ...base, url: source.feedUrl, canonicalUrl: source.feedUrl }, source), false);
assert.equal(shouldEnrichCanonicalDetail({ ...base, format: 'movie-screening' }, source), false);

const html = '<html><head><title>Family Lantern Night</title>' +
  '<meta property="og:image" content="/images/official-lantern.jpg">' +
  '<script type="application/ld+json">{' +
  '"@context":"https://schema.org","@type":"Event","name":"Family Lantern Night",' +
  '"startDate":"2026-09-26T18:00:00","endDate":"2026-09-26T20:00:00",' +
  '"description":"Families make lanterns, enjoy live music, and join an evening community celebration together.",' +
  '"image":"https://example.gov/images/official-lantern.jpg",' +
  '"location":{"@type":"Place","name":"Civic Plaza","address":{"@type":"PostalAddress","streetAddress":"100 Main St","addressLocality":"San Jose"}},' +
  '"audience":{"@type":"Audience","name":"Ages 5–12"},"offers":{"@type":"Offer","price":"12"}' +
  '}</script></head><body><h1>Family Lantern Night</h1></body></html>';

const fakeFetch = body => async url => ({ ok: true, status: 200, url, headers: { get: () => 'text/html' }, text: async () => body });
const enriched = await enrichCanonicalDetails([base], [source], { concurrency: 1, verifiedAt: '2026-09-22T08:00:00Z', fetchImpl: fakeFetch(html) });
const event = enriched.events[0];
assert.equal(event.image, 'https://example.gov/images/official-lantern.jpg');
assert.match(event.description, /Families make lanterns/);
assert.equal(event.dateValue, '2026-09-26T18:00:00');
assert.equal(event.place, 'Civic Plaza');
assert.equal(event.address, '100 Main St, San Jose');
assert.equal(event.ageLabel, 'Ages 5–12');
assert.equal(event.costStatus, 'paid');
assert.equal(event.detailSourceUrl, 'https://example.gov/events/family-lantern-night');
assert.equal(event.detailProvenance.image.method, 'schema.org');
assert.equal(enriched.summary.fieldsUpdated.image, 1);

const staleHtml = html.replaceAll('2026-09-26', '2025-09-26');
const stale = await enrichCanonicalDetails([base], [source], { concurrency: 1, fetchImpl: fakeFetch(staleHtml) });
assert.equal(stale.events[0].dateValue, '2026-09-26');

const logoHtml = '<html><head><title>Family Lantern Night</title>' +
  '<meta property="og:image" content="/assets/site-logo.png">' +
  '<meta name="description" content="Families make lanterns and enjoy music at this community celebration.">' +
  '</head><body><h1>Family Lantern Night</h1></body></html>';
const logo = await enrichCanonicalDetails([base], [source], { concurrency: 1, fetchImpl: fakeFetch(logoHtml) });
assert.equal(logo.events[0].image, base.image);

// A truncated meta teaser must not replace a complete discovery description.
const truncatedHtml = '<html><head><title>Family Lantern Night</title>' +
  '<meta name="description" content="Families make lanterns, enjoy music, and celebrate together…">' +
  '</head><body><h1>Family Lantern Night</h1></body></html>';
const truncated = await enrichCanonicalDetails([base], [source], { concurrency: 1, fetchImpl: fakeFetch(truncatedHtml) });
assert.equal(truncated.events[0].description, base.description);

console.log('canonical detail enrichment tests passed');

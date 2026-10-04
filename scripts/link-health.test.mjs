import assert from 'node:assert/strict';
import {
  auditLinks, normalizeOfficialUrl, releaseBlockingLinks, resolvePublishedLink,
  sourceForEvent, staticLinkResult, titleMatchesPage
} from './link-health.mjs';

const source = {
  id: 'library', name: 'Library', domain: 'library.org',
  linkHosts: ['events.platform.org'], landingUrl: 'https://events.platform.org/events'
};
assert.equal(normalizeOfficialUrl('http://events.platform.org/a?utm_source=x#top'), 'https://events.platform.org/a');
assert.equal(staticLinkResult({ url: 'https://gateway.platform.org/rss/events' }, source).linkStatus, 'invalid');

const cityWithOrganizerCompanion = {
  id: 'palo-alto',
  name: 'City of Palo Alto',
  domain: 'paloalto.gov',
  specialEventPageDiscovery: { allowedDomains: ['bikepaloalto.org'] }
};
const organizerCompanion = staticLinkResult({
  title: 'Bike Palo Alto',
  canonicalUrl: 'https://bikepaloalto.org/'
}, cityWithOrganizerCompanion);
assert.equal(organizerCompanion.linkStatus, 'unknown');
assert.equal(organizerCompanion.canonicalUrl, 'https://bikepaloalto.org/');

const fallback = resolvePublishedLink(
  { title: 'Book club', source: 'Library' },
  { canonicalUrl: 'https://events.platform.org/events/1', fallbackUrl: source.landingUrl, linkStatus: 'not-found', linkCheckedAt: 'now', linkCheckMethod: 'machine', linkEvidence: '404' },
  source
);
assert.equal(fallback.url, source.landingUrl);


const strictDetailSource = {
  id: 'strict-detail',
  name: 'Strict Detail Source',
  domain: 'example.org',
  landingUrl: 'https://example.org/events',
  linkPolicy: 'first_party_detail'
};
const strictMissing = staticLinkResult(
  { title: 'Family Show', url: 'https://example.org/events/family-show' },
  strictDetailSource
);
assert.equal(strictMissing.fallbackUrl, '');

const listingFallbackSource = {
  ...strictDetailSource,
  id: 'listing-fallback',
  linkPolicy: 'first_party_detail_with_listing_fallback'
};
const listingFallback = staticLinkResult(
  { title: 'Family Show', url: 'https://example.org/events/family-show' },
  listingFallbackSource
);
assert.equal(listingFallback.fallbackUrl, listingFallbackSource.landingUrl);

const result = await auditLinks(
  [{ title: 'Book Club', source: 'Library', url: 'https://events.platform.org/events/1' }],
  [source],
  { fetchImpl: async () => new Response('<title>Book Club</title>', { status: 200 }), concurrency: 1 }
);
assert.equal(result.events[0].linkStatus, 'ok');

// Aggregated cards may use a parent-facing source label. Recover the concrete
// source contract from the canonical host/venue rather than rejecting it.
const cinemaSources = [
  { id: 'oakridge', name: 'Cinemark Century Oakridge 20', domain: 'cinemark.com' },
  { id: 'almaden', name: 'CineLux Almaden', domain: 'cineluxtheatres.com' }
];
assert.equal(sourceForEvent({
  source: 'Official cinema listings',
  place: 'CineLux Almaden',
  url: 'https://www.cineluxtheatres.com/cinelux-almaden-cafe-lounge/tickets/123'
}, cinemaSources).id, 'almaden');

// Curated first-party links remain publishable when a machine parser cannot
// extract the title, but only if the page did not redirect or return soft error.
const curatedSource = {
  id: 'city-curated', name: 'City Seasonal Events', domain: 'city.gov',
  method: 'curated', feedUrl: 'https://city.gov/events/123'
};
const curated = await auditLinks(
  [{ title: 'Family Harvest', source: curatedSource.name, url: curatedSource.feedUrl, linkSource: 'curated_verified' }],
  [curatedSource],
  { fetchImpl: async url => ({ ok: true, status: 200, url, text: async () => '<html><body>Calendar detail rendered client-side</body></html>' }), concurrency: 1 }
);
assert.equal(curated.events[0].linkStatus, 'ok');
assert.equal(curated.events[0].url, curatedSource.feedUrl);

const softError = await auditLinks(
  [{ title: 'Family Harvest', source: curatedSource.name, url: curatedSource.feedUrl, linkSource: 'curated_verified' }],
  [curatedSource],
  { fetchImpl: async url => ({ ok: true, status: 200, url, text: async () => '<html>Page not found</html>' }), concurrency: 1 }
);
assert.equal(softError.events[0].linkStatus, 'content-mismatch');

assert.equal(titleMatchesPage('Children’s SpooktaClara', '<h1>Childrens SpooktaClara</h1>'), true);
assert.equal(releaseBlockingLinks([{ linkResolution: 'unavailable', linkStatus: 'invalid' }]).length, 1);
assert.equal(releaseBlockingLinks([{ linkResolution: 'fallback', linkStatus: 'not-found' }]).length, 0);

// Official-domain migration regression: the current canonical domain remains
// publishable while a legacy Squarespace host stays explicitly allowlisted.
const migratedSource = {
  id: 'santa-clara-parade-of-champions',
  name: 'Santa Clara Parade of Champions',
  domain: 'scparadeofchampions.org',
  linkHosts: ['www.scparadeofchampions.org', 'sc-parade-of-champions.squarespace.com']
};
const migrated = staticLinkResult({
  title: 'Santa Clara Parade of Champions & Festival',
  canonicalUrl: 'https://www.scparadeofchampions.org/parade-schedule'
}, migratedSource);
assert.equal(migrated.linkStatus, 'unknown');
assert.equal(migrated.canonicalUrl, 'https://www.scparadeofchampions.org/parade-schedule');

console.log('link health tests passed');

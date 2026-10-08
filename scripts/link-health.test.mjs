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

// A manually verified event page must outrank a feed's ticket URL, while
// never silently substituting the source's general event calendar.
const montalvoSource = {
  id: 'montalvo-arts-center', name: 'Montalvo Arts Center',
  domain: 'montalvoarts.org', linkPolicy: 'first_party_detail',
  landingUrl: 'https://montalvoarts.org/experience/events-calendar/',
  detailUrlOverrides: [
    { title: 'Goblins in the Garden', date: '2026-10-25', url: 'https://my.montalvoarts.org/3257/3258' }
  ]
};
const goblins = {
  title: 'Goblins in the Garden', dateValue: '2026-10-25T11:00:00+00:00',
  canonicalUrl: 'https://my.montalvoarts.org/3257/3258', source: montalvoSource.name
};
assert.equal(staticLinkResult(goblins, montalvoSource).canonicalUrl,
  'https://my.montalvoarts.org/3257/3258');
assert.equal(staticLinkResult(goblins, montalvoSource).fallbackUrl, '');
const checkedGoblins = await auditLinks([goblins], [montalvoSource], {
  concurrency: 1,
  fetchImpl: async url => ({
    ok: true, status: 200, url,
    text: async () => '<h1>Seat selection</h1>'
  })
});
assert.equal(checkedGoblins.events[0].linkResolution, 'canonical');
assert.equal(checkedGoblins.events[0].url,
  'https://my.montalvoarts.org/3257/3258');

// A verified ActiveCommunities per-activity link often redirects from its
// legacy route to a new SPA route. The numeric ID must survive unchanged.
const ardenwoodSource = {
  id: 'ebparks-ardenwood-harvest-festival',
  name: 'East Bay Regional Park District · Ardenwood Harvest Festival',
  domain: 'ebparks.org', linkPolicy: 'first_party_detail',
  linkHosts: ['apm.activecommunities.com', 'anc.apm.activecommunities.com']
};
const ardenwood = {
  title: 'Ardenwood Harvest Festival', source: ardenwoodSource.name,
  url: 'https://apm.activecommunities.com/ebparks/Activity_Search/60196',
  linkSource: 'curated_verified'
};
const ardenwoodResult = await auditLinks([ardenwood], [ardenwoodSource], {
  concurrency: 1,
  fetchImpl: async () => ({
    ok: true, status: 200,
    url: 'https://anc.apm.activecommunities.com/ebparks/activity/search/detail/60196?onlineSiteId=0',
    text: async () => '<h1>Register for an activity</h1>'
  })
});
assert.equal(ardenwoodResult.events[0].linkResolution, 'canonical');
assert.match(ardenwoodResult.events[0].url, /\/detail\/60196/);

const unrelatedTicket = await auditLinks([ardenwood], [ardenwoodSource], {
  concurrency: 1,
  fetchImpl: async () => ({
    ok: true, status: 200,
    url: 'https://anc.apm.activecommunities.com/ebparks/activity/search/detail/60197',
    text: async () => '<h1>Register for an activity</h1>'
  })
});
assert.equal(unrelatedTicket.events[0].linkStatus, 'content-mismatch');
assert.equal(unrelatedTicket.events[0].url, '');

console.log('link health tests passed');

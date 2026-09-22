import assert from 'node:assert/strict';
import { auditLinks, normalizeOfficialUrl, resolvePublishedLink, staticLinkResult } from './link-health.mjs';
const source = { id: 'library', name: 'Library', domain: 'library.org', linkHosts: ['events.platform.org'], landingUrl: 'https://events.platform.org/events' };
assert.equal(normalizeOfficialUrl('http://events.platform.org/a?utm_source=x#top'), 'https://events.platform.org/a');
assert.equal(staticLinkResult({ url: 'https://gateway.platform.org/rss/events' }, source).linkStatus, 'invalid');
const fallback = resolvePublishedLink({ title: 'Book club', source: 'Library' }, { canonicalUrl: 'https://events.platform.org/events/1', fallbackUrl: source.landingUrl, linkStatus: 'not-found', linkCheckedAt: 'now', linkCheckMethod: 'machine', linkEvidence: '404' });
assert.equal(fallback.url, source.landingUrl);
const result = await auditLinks([{ title: 'Book Club', source: 'Library', url: 'https://events.platform.org/events/1' }], [source], { fetchImpl: async () => new Response('<title>Book Club</title>', { status: 200 }), concurrency: 1 });
assert.equal(result.events[0].linkStatus, 'ok');

// Official-domain migration regression: a current canonical domain must remain
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

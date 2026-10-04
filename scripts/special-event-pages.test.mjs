import assert from 'node:assert/strict';
import { approvedSpecialEventUrl, configuredCandidates, sitemapCandidates, verifySpecialEventPage } from './special-event-pages.mjs';

const event = { title: 'Cupertino Fall Bike Fest', dateValue: '2026-09-26' };
const sitemap = `<?xml version="1.0"?><urlset>
  <url><loc>https://www.cupertino.gov/Events-directory/Bike-Fest-2026</loc></url>
  <url><loc>https://www.cupertino.gov/Your-City/Safe-Routes/Bike-Fest</loc></url>
  <url><loc>https://www.cupertino.gov/News-articles/Fall-Bike-Fest</loc></url>
</urlset>`;
const candidates = sitemapCandidates(sitemap, event, { domain: 'cupertino.gov' });
assert.deepEqual(candidates.map(item => item.url), ['https://www.cupertino.gov/Your-City/Safe-Routes/Bike-Fest']);
assert.deepEqual(configuredCandidates(event, [{ titlePattern: 'bike\\s+fest', url: 'https://www.cupertino.gov/bikefest' }]).map(item => item.url), ['https://www.cupertino.gov/bikefest']);
const verified = verifySpecialEventPage(event, candidates[0], `
  <title>Bike Fest Cupertino CA</title><h1>Bike Fest</h1>
  <p><strong>Saturday, September 26, 2026</strong></p>
  <p>Bring your bike for on-bike games, arts and crafts, and family rides at Civic Center Plaza.</p>`);
assert.equal(verified.url, 'https://www.cupertino.gov/Your-City/Safe-Routes/Bike-Fest');
assert.match(verified.description, /arts and crafts/);
assert.equal(verifySpecialEventPage(event, candidates[0], '<h1>Bike Fest</h1><p>Saturday, September 27, 2026</p><p>Bring your bike for on-bike games, arts and crafts, and family rides at Civic Center Plaza.</p>'), null);

assert.equal(approvedSpecialEventUrl('https://bikepaloalto.org/', ['paloalto.gov', 'bikepaloalto.org']), true);
assert.equal(approvedSpecialEventUrl('https://events.example.com/bike', ['paloalto.gov', 'bikepaloalto.org']), false);

const paloAltoEvent = { title: 'Bike Palo Alto', dateValue: '2026-10-04' };
const paloAltoCandidate = configuredCandidates(paloAltoEvent, [
  { titlePattern: '\\bbike\\s+palo\\s+alto\\b', url: 'https://bikepaloalto.org/' }
])[0];
const paloAltoVerified = verifySpecialEventPage(paloAltoEvent, paloAltoCandidate, `
  <title>Bike Palo Alto – Get Rolling, Palo Alto</title>
  <h1>Bike Palo Alto 2026, Come Join Us!</h1>
  <table>
    <tr><td>When</td><td>Sunday, October 4, 2026 Time: 1-3pm</td></tr>
    <tr><td>What</td><td>Enjoy the Fairmeadow event fair. This year’s activities include maps and route selection, helmet fitting, Safe Routes to School information, bike mini tune-ups, free bike registration, and more.</td></tr>
    <tr><td>How</td><td>Select a route map and ride! All rides are self-guided.</td></tr>
  </table>
`);
assert.ok(paloAltoVerified);
assert.match(paloAltoVerified.description, /activities include maps and route selection/i);
assert.match(paloAltoVerified.description, /bike mini tune-ups/i);

const entityAndChromeVerified = verifySpecialEventPage(paloAltoEvent, paloAltoCandidate, `
  <h1>Bike Palo Alto 2026</h1>
  <p>Sunday, October 4, 2026</p>
  <p>This year&#8217;s activities include helmet fitting, route maps, bike mini tune-ups, and free bike registration for families.</p>
  <p>Create a website or blog at WordPress.com Subscribe Manage subscriptions Copy shortlink View post in Reader.</p>
`);
assert.ok(entityAndChromeVerified);
assert.match(entityAndChromeVerified.description, /This year’s activities include/i);
assert.doesNotMatch(entityAndChromeVerified.description, /WordPress|Manage subscriptions|Copy shortlink/i);

console.log('special event page tests passed');

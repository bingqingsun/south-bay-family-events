import assert from 'node:assert/strict';
import { configuredCandidates, sitemapCandidates, verifySpecialEventPage } from './special-event-pages.mjs';

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
console.log('special event page tests passed');

import assert from 'node:assert/strict';
import {
  linkedOfficialDetailCandidates,
  linkedOfficialDescription,
  linkedOfficialPageMatches
} from './lib/linked-official-detail.mjs';

const cityHtml = `
<html><body>
  <h1>Bike Palo Alto</h1>
  <p>Bike Palo Alto is an annual, family-friendly event encouraging people to bike more often.</p>
  <a href="https://bikepaloalto.org/">Bike Palo Alto official website</a>
  <a href="https://www.facebook.com/example">Facebook</a>
  <a href="/Departments/Transportation">Transportation</a>
</body></html>`;

const candidates = linkedOfficialDetailCandidates(cityHtml, {
  pageUrl: 'https://www.paloalto.gov/Events-Directory/Office-of-Transportation/Bike-Palo-Alto',
  title: 'Bike Palo Alto'
});
assert.equal(candidates[0]?.url, 'https://bikepaloalto.org/');
assert.equal(candidates.length, 1);

const organizerHtml = `
<html>
<head><title>Bike Palo Alto – Get Rolling, Palo Alto</title></head>
<body><main>
  <h1>Bike Palo Alto 2026, Come Join Us!</h1>
  <table>
    <tr><td>What</td><td>Enjoy the event fair. This year’s activities include maps and route selection, helmet fitting, Safe Routes to School information, bike mini tune-ups, free bike registration, and more.</td></tr>
    <tr><td>How</td><td>Select a route map and ride! All rides are self-guided.</td></tr>
  </table>
  <p>Bring a water bottle, bike lock, and bike helmet.</p>
</main></body></html>`;

assert.equal(linkedOfficialPageMatches(organizerHtml, 'Bike Palo Alto'), true);
const description = linkedOfficialDescription(organizerHtml);
assert.match(description, /maps and route selection/i);
assert.match(description, /mini tune-ups/i);
assert.match(description, /Select a route map and ride/i);

console.log('Linked official detail fallback contracts passed');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Regress against the publishable event data after the live official refresh.
// Happy Hollow's /events/ listing may be empty even when seasonal landing
// pages contain a valid parent-facing family event.
const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const source = sources.find(source => source.name === 'Happy Hollow Park & Zoo');
assert.ok(source, 'Happy Hollow must remain a monitored official source');
assert.equal(source.method, 'happyhollow');
assert.ok(source.specialEvents?.some(event => /Green Halloween/i.test(event.title)),
  'Stand-alone Happy Hollow seasonal events must be discoverable');
const matches = events.filter(event => /Green Halloween/i.test(event.title) && /Happy Hollow/i.test(event.source || ''));
// Live feeds prune the October 31 one-off event after it ends. The official
// specialEvents configuration must remain intact, without requiring archive data
// to be carried in current events.json.
const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date());
const get = key => parts.find(part => part.type === key)?.value || '';
const today = [get('year'), get('month'), get('day')].join('-');
if (today <= '2026-10-31') {
  assert.equal(matches.length, 1, 'Current Green Halloween should publish exactly once');
} else {
  assert.ok(matches.length <= 1, 'Archived Halloween must not duplicate');
}
for (const event of matches) {
assert.equal(event.url, 'https://happyhollow.org/green-halloween/');
assert.equal(event.dateValue, '2026-10-31T11:00');
assert.ok(event.endDateValue.startsWith('2026-10-31T14:00'), 'The event must end at 2 PM, allowing normalized seconds');
assert.equal(event.costStatus, 'paid', 'Included with admission is not free admission');
assert.notEqual(event.costLabel, '$3', 'Costume discount must not be mistaken for ticket price');
assert.match(event.description || '', /critter|costume|craft|trick-or-treat/i);
assert.doesNotMatch(event.description || '', /connects people to nature through play/i, 'Generic site SEO copy must not replace event content');
assert.equal(event.image, 'https://happyhollow.org/wp-content/uploads/2026/08/Green-Halloween-2025-website-.png');
}
assert.ok(!events.some(event => /^Today.s Hours/i.test(event.title) && event.source === source.name),
  'Routine opening hours must not be published as a special event');
console.log('Happy Hollow special-event publication regression passed');

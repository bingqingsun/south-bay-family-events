import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({
  window: {},
  URL,
  Intl,
  Date,
  console
});

vm.runInContext(fs.readFileSync(new URL('../data/weekend-picks.js', import.meta.url), 'utf8'), context);
vm.runInContext(fs.readFileSync(new URL('../weekend-picks-runtime.js', import.meta.url), 'utf8'), context);

const runtime = context.window.SBFFWeekendPicksRuntime;
const config = context.window.SBFF_WEEKEND_PICKS;
const events = JSON.parse(fs.readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

assert.ok(runtime, 'Weekend Picks runtime should load');
assert.equal(config.picks.length, 11, 'Pilot should contain the 11 editor-selected activities');

// Resolver contracts: benign URL differences and editorial title variants must
// still resolve to the canonical event instead of being reported as missing.
assert.equal(
  runtime.urlsMatch('https://www.example.com/event/?id=123&utm_source=test', 'https://example.com/event?id=123'),
  true
);
assert.equal(runtime.normalizeTitle('13th Annual Fall Bike Fest'), 'fall bike fest');
assert.equal(runtime.normalizeTitle('Great Glass Pumpkin Patch 2026'), 'great glass pumpkin patch');

const resolved = config.picks.map((pick) => ({
  title: pick.eventRef.title,
  event: runtime.resolveEvent(pick.eventRef, events)
}));
const unresolved = resolved.filter((item) => !item.event).map((item) => item.title);
assert.deepEqual(unresolved, [], `All Weekend Picks must resolve against data/events.json; unresolved: ${unresolved.join(', ')}`);

const offWeekend = resolved
  .filter((item) => !runtime.eventOverlapsWeekend(item.event, config.weekendStart, config.weekendEnd))
  .map((item) => item.title);
assert.deepEqual(offWeekend, [], `All pilot picks must overlap ${config.weekendStart}–${config.weekendEnd}; outside weekend: ${offWeekend.join(', ')}`);

const model = runtime.getWeekendPicksViewModel(events);
assert.equal(model.resolvedPicks.length, 11);
assert.equal(model.unresolvedPicks.length, 0);
assert.equal(model.expiredPicks.length, 0);
assert.equal(model.validPicks.length, 11);

console.log('weekend-picks-runtime tests passed: 11/11 resolved and valid');

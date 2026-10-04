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
assert.equal(config.picks.length, 7, 'Live Weekend Picks should contain the seven remaining editor-selected activities after Saturday events end');

// Resolver contracts are tested against stable fixtures instead of today's
// active event database. The production database intentionally drops expired
// one-off events, so an archived Weekend Picks edition must not become a CI
// failure merely because its historical activities have aged out.
assert.equal(
  runtime.urlsMatch('https://www.example.com/event/?id=123&utm_source=test', 'https://example.com/event?id=123'),
  true
);
assert.equal(runtime.normalizeTitle('13th Annual Fall Bike Fest'), 'fall bike fest');
assert.equal(runtime.normalizeTitle('Great Glass Pumpkin Patch 2026'), 'great glass pumpkin patch');

const resolverFixtures = [
  {
    id: 'new-bike-fest-id',
    legacyIds: ['curated-b7185603c68c065f'],
    title: '13th Annual Fall Bike Fest',
    url: 'https://www.cupertino.gov/bikefest',
    dateValue: '2026-10-03T10:00',
    endDateValue: '2026-10-03T14:00'
  },
  {
    id: 'url-fallback-id',
    title: 'Black Holes — The Other Side of Infinity',
    url: 'https://daweb2.deanza.edu/events/event.html?id=191545133&utm_source=calendar',
    dateValue: '2026-10-03T19:00'
  },
  {
    id: 'title-fallback-id',
    title: 'Great Glass Pumpkin Patch',
    dateValue: '2026-10-04T10:00'
  }
];

assert.equal(
  runtime.resolveEvent({ id: 'curated-b7185603c68c065f', title: 'Fall Bike Fest', url: 'https://www.cupertino.gov/bikefest' }, resolverFixtures)?.id,
  'new-bike-fest-id',
  'legacy id should resolve after canonical id changes'
);
assert.equal(
  runtime.resolveEvent({ title: 'Black Holes: The Other Side of Infinity', url: 'https://daweb2.deanza.edu/events/event.html?id=191545133' }, resolverFixtures)?.id,
  'url-fallback-id',
  'official URL should resolve across benign URL differences'
);
assert.equal(
  runtime.resolveEvent({ title: 'Great Glass Pumpkin Patch 2026', aliases: ['Great Glass Pumpkin Patch'] }, resolverFixtures)?.id,
  'title-fallback-id',
  'normalized editorial title should resolve when id and URL are unavailable'
);

for (const fixture of resolverFixtures) {
  assert.equal(
    runtime.eventOverlapsWeekend(fixture, config.weekendStart, config.weekendEnd),
    true,
    `${fixture.title} fixture should overlap ${config.weekendStart}–${config.weekendEnd}`
  );
}

const model = runtime.getWeekendPicksViewModel(events);
const today = runtime.currentPacificDate();
if (today <= config.weekendEnd) {
  // While an edition is live, every editorial pick must still resolve against
  // the active canonical database and overlap the configured weekend.
  assert.equal(model.unresolvedPicks.length, 0, `Live Weekend Picks must all resolve; unresolved: ${model.unresolvedPicks.map(item => item.eventRef.title).join(', ')}`);
  assert.equal(model.expiredPicks.length, 0, 'Live Weekend Picks must all overlap the configured weekend');
  assert.equal(model.validPicks.length, config.picks.length, 'Live Weekend Picks should expose every editorial pick');
  assert.equal(model.state, 'live');
} else {
  // Once the edition is over, current events.json may legitimately prune its
  // expired one-off activities. The archive state must remain deterministic
  // and must not require historical events to stay in the live event database.
  assert.equal(model.state, 'ended');
  assert.equal(model.homepageVisible, false);
  assert.ok(model.resolvedPicks.length <= config.picks.length);
}

console.log(`weekend-picks-runtime tests passed: state=${model.state}, resolved=${model.resolvedPicks.length}/${config.picks.length}`);

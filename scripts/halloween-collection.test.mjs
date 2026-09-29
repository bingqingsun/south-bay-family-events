import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const runtime = require('../collection-runtime.js');

global.window = {};
require('../data/collections.js');

const events = JSON.parse(fs.readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const config = window.SBFF_COLLECTIONS.find((item) => item.slug === 'halloween');

assert.ok(config, 'Halloween collection config must exist');
assert.equal(config.lastChanceThreshold, 3, 'Halloween must use the approved Last Chance threshold');
assert.ok(config.selectedEventRefs.length > 0, 'Halloween must contain curated canonical event references');
assert.equal(config.quickPickIds.length, 4, 'Halloween should configure four Quick Picks');

const model = runtime.buildCollectionViewModel(config, events, { now: '2026-09-28T12:00:00' });
assert.deepEqual(
  model.unresolvedRefs,
  [],
  `All Halloween collection refs must resolve against data/events.json; unresolved: ${JSON.stringify(model.unresolvedRefs)}`
);
assert.equal(model.resolvedEditorialCount, config.selectedEventRefs.length, 'Each selected reference should resolve to one canonical event');
assert.ok(model.currentEventCount > 0, 'Halloween should have current events on Sep 28, 2026');
assert.equal(model.currentQuickPicks.length, 4, 'All four Halloween Quick Picks should be current on Sep 28, 2026');
assert.ok([runtime.STATES.FEATURED, runtime.STATES.LAST_CHANCE].includes(model.collectionState), 'Halloween should be visible while active');

const afterSeason = runtime.buildCollectionViewModel(config, events, { now: '2026-12-01T12:00:00' });
assert.equal(afterSeason.collectionState, runtime.STATES.ENDED, 'Halloween should archive after the final selected event ends');

console.log(`Halloween collection test passed: ${model.resolvedEditorialCount} canonical events, ${model.currentQuickPicks.length} Quick Picks`);

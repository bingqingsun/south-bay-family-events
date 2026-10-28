import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { mergeEventSupplements } from './apply-event-supplements.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../collection-runtime.js');

global.window = {};
require('../data/collections.js');

const baseEvents = JSON.parse(fs.readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));
const supplements = JSON.parse(fs.readFileSync(new URL('../data/event-supplements.json', import.meta.url), 'utf8'));
const sources = JSON.parse(fs.readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8'));
const events = mergeEventSupplements(baseEvents, supplements);
const config = window.SBFF_COLLECTIONS.find((item) => item.slug === 'halloween');

assert.ok(config, 'Halloween collection config must exist');
const configuredEvent = (sourceName, title) => sources.find(source => source.name === sourceName)?.events?.find(event => event.title === title);
assert.equal(
  configuredEvent('City of Fremont · Seasonal Events', 'Fremont Trick-or-Treat Event')?.image,
  'https://www.fremont.gov/home/showpublishedimage/12597/639246516544470000',
  'Fremont Trick-or-Treat must keep the organizer-provided 2026 banner'
);
assert.equal(
  configuredEvent('City of Santa Clara · Seasonal Events', 'Children’s SpooktaClara')?.image,
  'https://www.santaclaraca.gov/home/showpublishedimage/81421/638974267888570000',
  'Children’s SpooktaClara must keep its official event hero image'
);
assert.equal(config.lastChanceThreshold, 3, 'Halloween must use the approved Last Chance threshold');
assert.ok(config.selectedEventRefs.length > 0, 'Halloween must contain curated canonical event references');
assert.equal(config.quickPickIds.length, 3, 'Halloween should configure three active Quick Picks after the October 27 event expires');
assert.equal(events.some((event) => event.title === 'Laser Halloween Spooktacular'), false, 'Removed Laser Halloween Spooktacular duplicate must stay absent');
assert.ok(events.some((event) => event.id === 'editorial-32d6b7102984722f' || event.legacyIds?.includes('editorial-32d6b7102984722f')), 'Tech or Treat supplement must enter canonical data');

const model = runtime.buildCollectionViewModel(config, events, { now: '2026-10-26T12:00:00' });
assert.deepEqual(
  model.unresolvedRefs,
  [],
  `All Halloween collection refs must resolve against canonical events plus verified supplements; unresolved: ${JSON.stringify(model.unresolvedRefs)}`
);
assert.equal(model.resolvedEditorialCount, config.selectedEventRefs.length, 'Each selected reference should resolve to one canonical event');
assert.equal(model.resolvedEditorialCount, 6, 'Halloween should contain only currently resolvable editorial selections after expired refs are pruned');
assert.ok(model.currentEventCount > 0, 'Halloween should still have current events on Oct 26, 2026');
assert.ok(model.currentQuickPicks.length >= 1 && model.currentQuickPicks.length <= config.quickPickIds.length,
  'Only still-active Halloween Quick Picks should be displayed as the season winds down');
assert.ok(model.currentQuickPicks.every(event => model.currentEvents.some(active => active.id === event.id)),
  'Each displayed Halloween Quick Pick must be current, not an expired event');
assert.ok([runtime.STATES.FEATURED, runtime.STATES.LAST_CHANCE].includes(model.collectionState), 'Halloween should be visible while active');

const afterSeason = runtime.buildCollectionViewModel(config, events, { now: '2026-12-01T12:00:00' });
assert.equal(afterSeason.collectionState, runtime.STATES.ENDED, 'Halloween should archive after the approved season window');

console.log(`Halloween collection test passed: ${model.resolvedEditorialCount} canonical events, ${model.currentQuickPicks.length} Quick Picks`);

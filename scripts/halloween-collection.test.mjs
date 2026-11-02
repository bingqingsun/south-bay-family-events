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
const now = '2026-11-02T12:00:00';
const events = mergeEventSupplements(baseEvents, supplements, { now });
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
assert.ok(config.selectedEventRefs.length > 0, 'Halloween must retain curated references for its archived guide');
assert.equal(config.quickPickIds.length, 3, 'Halloween should retain its approved Quick Pick configuration');
assert.equal(events.some((event) => event.title === 'Laser Halloween Spooktacular'), false,
  'Removed Laser Halloween Spooktacular duplicate must stay absent');
assert.equal(events.some((event) => event.id === 'editorial-32d6b7102984722f'), false,
  'Expired Tech or Treat supplement must not re-enter current canonical data');

const model = runtime.buildCollectionViewModel(config, events, { now });
assert.equal(model.collectionState, runtime.STATES.ENDED,
  'Halloween must archive after the approved season window');
assert.equal(model.currentQuickPicks.length, 0,
  'An archived guide must not display expired Quick Picks');
assert.ok(model.unresolvedRefs.length > 0,
  'Archived references may remain in editorial configuration without forcing expired activities into canonical data');

const afterSeason = runtime.buildCollectionViewModel(config, events, { now: '2026-12-01T12:00:00' });
assert.equal(afterSeason.collectionState, runtime.STATES.ENDED,
  'Halloween must remain archived after the season');

console.log('Halloween collection archive and lifecycle test passed');

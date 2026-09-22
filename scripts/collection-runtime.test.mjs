import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtime = require('../collection-runtime.js');

const baseConfig = {
  slug: 'test-guide',
  published: true,
  publishAt: '2026-09-01T00:00:00',
  lastChanceThreshold: 2,
  selectedEventRefs: [],
  quickPickIds: []
};

function event(id, dateValue, extra = {}) {
  return {
    id,
    title: id,
    city: extra.city || 'San Jose',
    dateValue,
    ...extra
  };
}

function configFor(events, extra = {}) {
  return {
    ...baseConfig,
    selectedEventRefs: events.map((item) => item.id),
    quickPickIds: events.slice(0, 3).map((item) => item.id),
    ...extra
  };
}

function vm(config, events, now = '2026-09-21T12:00:00') {
  return runtime.buildCollectionViewModel(config, events, { now });
}

// A: all editorial events are current.
{
  const events = Array.from({ length: 9 }, (_, i) => event(`a${i}`, `2026-09-${String(22 + i).padStart(2, '0')}`));
  const model = vm(configFor(events), events);
  assert.equal(model.collectionState, runtime.STATES.FEATURED);
  assert.equal(model.currentEventCount, 9);
  assert.equal(model.resolvedEditorialCount, 9);
}

// B: some events expired, but more than the Last Chance threshold remain.
{
  const expired = [event('b0', '2026-09-18'), event('b1', '2026-09-19'), event('b2', '2026-09-20')];
  const current = Array.from({ length: 6 }, (_, i) => event(`b${i + 3}`, `2026-09-${22 + i}`));
  const events = [...expired, ...current];
  const model = vm(configFor(events), events);
  assert.equal(model.collectionState, runtime.STATES.FEATURED);
  assert.equal(model.currentEventCount, 6);
  assert.equal(model.expiredEvents.length, 3);
}

// C: only two remain after earlier selected events expired.
{
  const events = [
    event('c0', '2026-09-18'),
    event('c1', '2026-09-19'),
    event('c2', '2026-09-20'),
    event('c3', '2026-09-22'),
    event('c4', '2026-09-23')
  ];
  const model = vm(configFor(events), events);
  assert.equal(model.collectionState, runtime.STATES.LAST_CHANCE);
  assert.equal(model.currentEventCount, 2);
}

// D: singular current count remains correct.
{
  const events = [
    event('d0', '2026-09-18'),
    event('d1', '2026-09-19'),
    event('d2', '2026-09-20'),
    event('d3', '2026-09-22')
  ];
  const model = vm(configFor(events), events);
  assert.equal(model.collectionState, runtime.STATES.LAST_CHANCE);
  assert.equal(model.currentEventCount, 1);
}

// E: all resolved editorial events expired -> ENDED, not DATA_ERROR.
{
  const events = [event('e0', '2026-09-18'), event('e1', '2026-09-20')];
  const model = vm(configFor(events), events);
  assert.equal(model.collectionState, runtime.STATES.ENDED);
  assert.equal(model.resolvedEditorialCount, 2);
  assert.equal(model.currentEventCount, 0);
}

// F: multiple sessions count as one event; only future/current sessions remain visible.
{
  const events = [event('f0', '2026-09-18', {
    sessions: [
      { id: 'f0-s1', dateValue: '2026-09-18T10:00:00' },
      { id: 'f0-s2', dateValue: '2026-09-20T10:00:00' },
      { id: 'f0-s3', dateValue: '2026-09-22T10:00:00' }
    ]
  })];
  const model = vm(configFor(events), events);
  assert.equal(model.currentEventCount, 1);
  assert.equal(model.currentSessionsByEventId.f0.length, 1);
  assert.equal(model.currentSessionsByEventId.f0[0].id, 'f0-s3');
}

// G: a partial unresolved reference is data-incomplete but does not hide healthy events.
{
  const events = [event('g0', '2026-09-22'), event('g1', '2026-09-23')];
  const config = {
    ...configFor(events),
    selectedEventRefs: ['g0', 'missing-ref', 'g1']
  };
  const model = vm(config, events);
  assert.equal(model.collectionState, runtime.STATES.FEATURED);
  assert.equal(model.currentEventCount, 2);
  assert.equal(model.unresolvedRefs.length, 1);
  assert.equal(model.dataIncomplete, true);
}

// H: all refs unresolved -> DATA_ERROR, never ENDED.
{
  const config = { ...baseConfig, selectedEventRefs: ['missing-a', 'missing-b'] };
  const model = vm(config, []);
  assert.equal(model.collectionState, runtime.STATES.DATA_ERROR);
  assert.equal(model.resolvedEditorialCount, 0);
}

// I: expiry boundary follows America/Los_Angeles, not the visitor/browser timezone.
{
  const events = [event('i0', '2026-09-20')];
  const config = configFor(events);
  const beforePacificMidnight = runtime.buildCollectionViewModel(config, events, { now: new Date('2026-09-21T06:30:00Z') });
  const afterPacificMidnight = runtime.buildCollectionViewModel(config, events, { now: new Date('2026-09-21T07:30:00Z') });
  assert.equal(beforePacificMidnight.currentEventCount, 1);
  assert.equal(afterPacificMidnight.currentEventCount, 0);
}

// URL fallback resolves a migrated editorial id without duplicating canonical events.
{
  const events = [event('new-id', '2026-09-22', {
    url: 'https://example.com/event',
    legacyIds: ['old-id']
  })];
  const config = {
    ...baseConfig,
    selectedEventRefs: [{ id: 'missing-current-id', url: 'https://example.com/event' }, 'old-id']
  };
  const model = vm(config, events);
  assert.equal(model.resolvedEditorialCount, 1);
  assert.equal(model.currentEventCount, 1);
}

// Quick Picks never auto-fill: expired picks disappear and ordinary events do not replace them.
{
  const events = [event('q0', '2026-09-20'), event('q1', '2026-09-22'), event('q2', '2026-09-23')];
  const config = {
    ...configFor(events),
    quickPickIds: ['q0']
  };
  const model = vm(config, events);
  assert.equal(model.currentQuickPicks.length, 0);
  assert.equal(model.currentEventCount, 2);
}

// Small guides do not start in Last Chance merely because their total size is <= threshold.
{
  const events = [event('s0', '2026-09-22'), event('s1', '2026-09-23')];
  const model = vm(configFor(events), events);
  assert.equal(model.collectionState, runtime.STATES.FEATURED);
}

// Date range and city list use current events only.
{
  const events = [
    event('m0', '2026-09-18', { city: 'Old City' }),
    event('m1', '2026-09-22', { city: 'San Jose', endDateValue: '2026-09-24' }),
    event('m2', '2026-09-23', { city: 'Cupertino' })
  ];
  const model = vm(configFor(events), events);
  assert.deepEqual(model.currentDateRange, { start: '2026-09-22', end: '2026-09-24' });
  assert.deepEqual(model.currentCities, ['San Jose', 'Cupertino']);
}

// Explicit ongoing content with no end date remains current.
{
  const events = [event('o0', '2026-01-01', { ongoing: true })];
  const model = vm(configFor(events), events);
  assert.equal(model.currentEventCount, 1);
}

// Future publishAt stays DRAFT and fails closed on the homepage.
{
  const events = [event('p0', '2026-09-22')];
  const config = configFor(events, { publishAt: '2026-09-22T09:00:00' });
  const model = vm(config, events);
  assert.equal(model.collectionState, runtime.STATES.DRAFT);
}

console.log('collection-runtime tests passed');

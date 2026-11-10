import { readFile } from 'node:fs/promises';
import { applyChineseTranslationCatalog, translationFingerprint } from './event-translations.mjs';
import assert from 'node:assert/strict';
import { applyCuratedImageOverrides, mergeEventSupplements } from './apply-event-supplements.mjs';

const canonical = [{
  id: 'deanza-official-1',
  title: 'Laser Spooktacular Halloween',
  dateValue: '2026-10-24T17:15',
  source: 'De Anza College Planetarium',
  url: 'https://daweb2.deanza.edu/events/event.html?id=185122379',
  image: 'https://daweb2.deanza.edu/official.jpg',
  description: 'Official De Anza event calendar description.'
}];

const staleSupplement = [{
  id: 'editorial-old-laser',
  title: 'Laser Halloween Spooktacular',
  dateValue: '2026-10-24T17:15',
  source: 'De Anza College Planetarium',
  url: 'https://deanzaplanetarium.ludus.com/index.php',
  description: 'Legacy manual supplement.',
  replaceExisting: true
}];

const merged = mergeEventSupplements(canonical, staleSupplement, { now: '2026-10-20T12:00:00' });
assert.equal(merged.length, 1);
assert.equal(merged[0].title, 'Laser Spooktacular Halloween');
assert.equal(merged[0].url, 'https://daweb2.deanza.edu/events/event.html?id=185122379');
assert.equal(merged[0].image, 'https://daweb2.deanza.edu/official.jpg');
assert.deepEqual(merged[0].legacyIds, ['editorial-old-laser']);

const differentSource = mergeEventSupplements(canonical, [{
  ...staleSupplement[0],
  id: 'different-source',
  source: 'Another Organizer'
}], { now: '2026-10-20T12:00:00' });
assert.equal(differentSource.length, 2);


const curatedImage = 'https://www.mountainview.gov/home/showpublishedimage/9558/639237821395300000';
const curatedOverride = applyCuratedImageOverrides([{
  id: 'curated-monster-bash',
  title: 'Monster Bash',
  dateValue: '2026-10-24T10:00',
  source: 'City of Mountain View · Seasonal Events',
  url: 'https://www.mountainview.gov/our-city/departments/community-services/special-events/monster-bash',
  image: curatedImage
}], [{
  name: 'City of Mountain View · Seasonal Events',
  feedUrl: 'https://www.mountainview.gov/our-city/departments/community-services/special-events',
  events: [{
    title: 'Monster Bash',
    dateValue: '2026-10-24T10:00',
    image: curatedImage,
    url: 'https://www.mountainview.gov/our-city/departments/community-services/special-events/monster-bash'
  }]
}]);
assert.equal(curatedOverride.applied, 1);
assert.equal(curatedOverride.events[0].image, curatedImage);
assert.equal(curatedOverride.events[0].imageStatus, 'official');
assert.equal(curatedOverride.events[0].imageProvenance.method, 'manual_verified');
assert.equal(curatedOverride.events[0].imageProvenance.source, 'curated-manual');


// A bad RSS summary can be replaced with text verified against the organizer's
// exact event page, without creating a duplicate event or losing session time.
{
  const id = 'rss-6a77a9a6a5e5f025a9ced0c9';
  const officialUrl = 'https://sccl.bibliocommons.com/events/6a77a9a6a5e5f025a9ced0c9';
  const canonical = [{
    id, title: 'Tween Dungeons and Dragons',
    dateValue: '2026-10-28T15:30', endDateValue: '2026-10-28T17:00',
    source: 'Santa Clara County Library District', url: officialUrl,
    description: '21Oct. 28 Players must attend the first meeting.'
  }];
  const supplement = [{
    id, title: 'Tween Dungeons and Dragons',
    dateValue: '2026-10-28T15:30', endDateValue: '2026-10-28T17:00',
    source: 'Santa Clara County Library District', url: officialUrl,
    description: 'Kids ages 9–12 join a Dungeons & Dragons adventure with a Game Master.',
    sourceDescriptionRaw: 'The official organizer welcomes kids ages 9-12 and notes registration is full.',
    ageMin: 9, ageMax: 12, ageLabel: 'Ages 9–12',
    registrationStatus: 'full', replaceExisting: true
  }];
  const repaired = mergeEventSupplements(canonical, supplement, { now: '2026-10-20T12:00:00' });
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].id, id);
  assert.match(repaired[0].description, /Game Master/);
  assert.equal(repaired[0].dateValue, '2026-10-28T15:30');
  assert.equal(repaired[0].registrationStatus, 'full');
  assert.equal(repaired[0].ageMin, 9);
}


{
  const now = '2026-11-02T12:00:00';
  const expiredSupplement = {
    id: 'expired-manual-event',
    title: 'Expired Manual Event',
    dateValue: '2026-10-31T10:00',
    endDateValue: '2026-10-31T12:00',
    source: 'Verified Organizer',
    url: 'https://example.com/expired',
    description: 'An event that has already ended.'
  };
  const cleaned = mergeEventSupplements([
    { ...expiredSupplement, id: 'stale-canonical-event' }
  ], [expiredSupplement], { now });
  assert.equal(cleaned.length, 0);
}

{
  const url = 'https://example.com/recurring-series';
  const current = [{
    id: 'live-recurring-event',
    title: 'Recurring Family Program',
    dateValue: '2026-11-15T10:00',
    endDateValue: '2026-11-15T11:00',
    source: 'Verified Organizer',
    url,
    description: 'Live listing.'
  }];
  const olderVerification = [{
    id: 'manual-recurring-event',
    title: 'Recurring Family Program',
    dateValue: '2026-10-15T10:00',
    endDateValue: '2026-10-15T11:00',
    source: 'Verified Organizer',
    url,
    description: 'Organizer-verified family program details.',
    replaceExisting: true
  }];
  const enriched = mergeEventSupplements(current, olderVerification, {
    now: '2026-11-02T12:00:00'
  });
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].dateValue, '2026-11-15T10:00');
  assert.match(enriched[0].description, /Organizer-verified/);
}


// Regression: all reviewed November 13–15 seasonal discoveries remain bilingual,
// deduplicated and retain separate sessions for the two-day performances.
{
  const dataRoot = new URL('../data/', import.meta.url);
  const supplements = JSON.parse(await readFile(new URL('event-supplements.json', dataRoot), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('translations.zh.weekend-20261114.json', dataRoot), 'utf8'));
  const expectedIds = [
    'editorial-sj-holiday-lights-2026',
    'editorial-los-altos-holiday-stroll-20261113',
    'editorial-filoli-holiday-lights-2026',
    'editorial-raptor-fest-20261114',
    'editorial-sj-salmon-festival-20261114',
    'editorial-jrmf-raft-20261114',
    'editorial-sbdc-coppelia-20261114',
    'editorial-sj-water-lantern-20261114'
  ];
  const discoveries = expectedIds.map(id => {
    const event = supplements.find(item => item.id === id);
    assert.ok(event, 'Missing verified event supplement: ' + id);
    assert.ok(event.url.startsWith('https://'), 'Missing official detail URL: ' + id);
    assert.ok(event.dateValue.startsWith('2026-11-'), 'Unverified date: ' + id);
    const zh = catalog.entries.find(entry => entry.id === id);
    assert.ok(zh, 'Missing reviewed Chinese translation: ' + id);
    assert.equal(zh.sourceFingerprint, translationFingerprint(event), 'Translation does not match source: ' + id);
    return event;
  });
  assert.equal(new Set(discoveries.map(e => e.id)).size, 8);
  assert.equal(new Set(discoveries.map(e => e.url)).size, 8);
  for (const id of ['editorial-sbdc-coppelia-20261114', 'editorial-sj-water-lantern-20261114']) {
    const item = discoveries.find(event => event.id === id);
    assert.equal(item.sessions.length, 2, 'Keep each day's own performance for ' + id);
    assert.equal(new Set(item.sessions.map(session => session.dateValue.slice(0, 10))).size, 2);
  }
  const withOnePrior = [
    { id: 'already-ingested-stroll', title: 'Holiday Stroll',
      dateValue: '2026-11-13', url: 'https://downtownlosaltos.org/event/holiday-stroll/',
      source: 'Los Altos Village Association' }
  ];
  const merged = mergeEventSupplements(withOnePrior, discoveries, { now: '2026-11-09T14:00:00' });
  assert.equal(merged.length, 8, 'Official annual source and manual verified event must not double-publish');
  assert.ok(merged.some(e => e.id === 'already-ingested-stroll'));
  const variantsById = new Map(catalog.entries.map(entry => [entry.id, [entry]]));
  const localized = applyChineseTranslationCatalog(merged, { ...catalog, variantsById }, { strict: true });
  assert.equal(localized.stats.current, 8, 'All eight event descriptions must be approved and current');
}

console.log('Event supplement lifecycle, duplicate-guard and Nov 13–15 bilingual coverage tests passed.');

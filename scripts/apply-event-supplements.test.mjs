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

const merged = mergeEventSupplements(canonical, staleSupplement);
assert.equal(merged.length, 1);
assert.equal(merged[0].title, 'Laser Spooktacular Halloween');
assert.equal(merged[0].url, 'https://daweb2.deanza.edu/events/event.html?id=185122379');
assert.equal(merged[0].image, 'https://daweb2.deanza.edu/official.jpg');
assert.deepEqual(merged[0].legacyIds, ['editorial-old-laser']);

const differentSource = mergeEventSupplements(canonical, [{
  ...staleSupplement[0],
  id: 'different-source',
  source: 'Another Organizer'
}]);
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

console.log('Event supplement duplicate-guard tests passed.');

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
  const repaired = mergeEventSupplements(canonical, supplement);
  assert.equal(repaired.length, 1);
  assert.equal(repaired[0].id, id);
  assert.match(repaired[0].description, /Game Master/);
  assert.equal(repaired[0].dateValue, '2026-10-28T15:30');
  assert.equal(repaired[0].registrationStatus, 'full');
  assert.equal(repaired[0].ageMin, 9);
}

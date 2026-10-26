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

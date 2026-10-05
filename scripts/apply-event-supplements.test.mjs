import assert from 'node:assert/strict';
import { mergeEventSupplements } from './apply-event-supplements.mjs';

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

console.log('Event supplement duplicate-guard tests passed.');

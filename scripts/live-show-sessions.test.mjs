import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function seriesKey');
const end = source.indexOf('// Grouping can select an older retained occurrence');
assert.ok(start >= 0 && end > start);

const context = {
  createHash,
  isStillActive: () => true,
  normalizedMovieTitle: value => String(value || '').toLowerCase(),
  cautiousMovieRating: () => '',
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const base = {
  source: 'De Anza College Planetarium',
  title: 'Laser Spooktacular Halloween',
  place: 'Fujitsu Planetarium at De Anza',
  address: '21250 Stevens Creek Boulevard, Cupertino',
  meetingPoint: '',
  city: 'Cupertino',
  type: 'shows',
  format: 'live-show',
  ageRanges: [],
  ageLabel: 'Family-friendly',
  costLabel: '需付费／价格见详情',
  costSource: '官方活动说明',
  registrationStatus: 'unknown',
  movieRating: '',
  date: '',
  endDateValue: ''
};

const sessions = [
  {
    ...base,
    id: 'deanza-first',
    dateValue: '2026-10-24T17:15',
    description: 'Celebrate Halloween under the Planetarium Sky with laser-drawn images and music.',
    url: 'https://daweb2.deanza.edu/events/event.html?id=185122379'
  },
  {
    ...base,
    id: 'deanza-second',
    dateValue: '2026-10-24T19:00',
    description: 'Show features songs such as Ghostbusters, Monster Mash, Thriller and more.',
    url: 'https://daweb2.deanza.edu/events/event.html?id=191549239'
  }
];

const grouped = JSON.parse(JSON.stringify(context.groupRepeatedSessions(sessions)));
assert.equal(grouped.length, 1, 'same live production must render as one card even when per-session detail prose differs');
assert.equal(grouped[0].sessions.length, 2, 'both official showtimes must be preserved as sessions');
assert.deepEqual(grouped[0].sessions.map(session => session.dateValue), [
  '2026-10-24T17:15',
  '2026-10-24T19:00'
]);
assert.deepEqual(grouped[0].sessions.map(session => session.url), [
  'https://daweb2.deanza.edu/events/event.html?id=185122379',
  'https://daweb2.deanza.edu/events/event.html?id=191549239'
]);

const programA = { ...sessions[0], id: 'program-a', format: 'program', description: 'Program A description.' };
const programB = { ...sessions[1], id: 'program-b', format: 'program', description: 'Program B description.' };
assert.equal(context.groupRepeatedSessions([programA, programB]).length, 2,
  'non-show programs with materially different descriptions must remain conservatively separate');

console.log('Live-show session grouping tests passed.');

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
assert.ok(grouped[0].legacyIds.includes('deanza-first') && grouped[0].legacyIds.includes('deanza-second'),
  'individual showing IDs must remain resolvable after grouping');
assert.ok(grouped[0].legacyIds.some(id => /^series-[0-9a-f]{16}$/.test(id)),
  'historical description-based live-show series IDs must remain as migration aliases');


// Session-level commerce/availability differences must not split one show into
// multiple parent cards.
const mixedSessionFacts = [
  {
    ...sessions[0],
    costStatus: 'paid',
    costLabel: '需付费／价格见详情',
    costSource: '官方活动说明',
    registrationStatus: 'unknown',
    availabilityStatus: ''
  },
  {
    ...sessions[1],
    costStatus: 'unknown',
    costLabel: '费用未注明',
    costSource: '',
    registrationStatus: 'full',
    availabilityStatus: 'full'
  }
];
const mixedGrouped = JSON.parse(JSON.stringify(context.groupRepeatedSessions(mixedSessionFacts)));
assert.equal(mixedGrouped.length, 1,
  'price or registration differences between showtimes must not create duplicate show cards');
assert.equal(mixedGrouped[0].sessions.length, 2);
assert.equal(mixedGrouped[0].sessions[0].costStatus, 'paid',
  'session-level cost facts must be preserved');
assert.equal(mixedGrouped[0].sessions[1].registrationStatus, 'full',
  'session-level registration facts must be preserved');

// Generic recurring programs keep description/audience as identity, but
// registration/cost/category derivation must not split otherwise identical
// sessions.
const recurringBase = {
  source: 'Santa Clara County Library District',
  title: 'Reading Buddies for Grades K-6',
  description: 'Practice your reading skills by reading aloud one on one with a friendly dog!',
  place: 'Morgan Hill Library · Children\'s Activity Room',
  address: '660 West Main Ave, Morgan Hill',
  meetingPoint: '',
  city: 'Morgan Hill',
  format: 'program',
  type: 'community',
  ageRanges: [[5, 13]],
  ageLabel: 'Grades K–8',
  costStatus: 'unknown',
  costLabel: '费用未注明',
  costSource: '',
  registrationStatus: 'unknown',
  movieRating: '',
  date: '',
  endDateValue: ''
};
const recurring = [
  {
    ...recurringBase,
    id: 'reading-a',
    dateValue: '2026-10-19T18:00',
    registrationStatus: 'full',
    availabilityStatus: 'full',
    url: 'https://example.org/a'
  },
  {
    ...recurringBase,
    id: 'reading-b',
    dateValue: '2026-10-19T18:15',
    type: 'play',
    registrationStatus: 'unknown',
    availabilityStatus: '',
    url: 'https://example.org/b'
  }
];
const recurringGrouped = JSON.parse(JSON.stringify(context.groupRepeatedSessions(recurring)));
assert.equal(recurringGrouped.length, 1,
  'derived category or registration status must not split one recurring program');
assert.equal(recurringGrouped[0].sessions.length, 2);

// Sports games with the same opponent remain separate fixtures.
const gameBase = {
  ...recurringBase,
  source: 'San Jose Barracuda',
  title: 'San Jose Barracuda vs Stars',
  description: 'Official San Jose Barracuda home game against Stars at Tech CU Arena.',
  place: 'Tech CU Arena',
  address: '1500 S 10th St, San Jose',
  city: 'San Jose',
  format: 'sports-game',
  type: 'sports',
  ageRanges: [],
  ageLabel: ''
};
assert.equal(context.groupRepeatedSessions([
  { ...gameBase, id: 'game-a', dateValue: '2026-12-04T19:00', url: 'https://example.org/game-a' },
  { ...gameBase, id: 'game-b', dateValue: '2026-12-05T18:00', url: 'https://example.org/game-b' }
]).length, 2, 'separate sports fixtures must never be collapsed into sessions');

// Revalidation must expand a generated series back into concrete occurrences,
// never feed the old parent card back into the next grouping pass.
const publishedSeries = grouped[0];
const revalidation = JSON.parse(JSON.stringify(context.revalidationOccurrences(publishedSeries)));
assert.equal(revalidation.length, 2, 'series revalidation should expose each concrete occurrence once');
assert.deepEqual(revalidation.map(item => item.dateValue), [
  '2026-10-24T17:15',
  '2026-10-24T19:00'
]);
assert.ok(revalidation.every(item => !String(item.id).startsWith('series-')),
  'revalidation inputs must be concrete occurrence IDs, not generated parent series IDs');
assert.ok(revalidation.every(item => Array.isArray(item.sessions) && item.sessions.length === 0),
  'revalidation occurrences must not carry nested sessions');


const staleGeneratedParent = {
  ...publishedSeries,
  id: 'revalidated-stale-parent',
  legacyIds: [...publishedSeries.legacyIds, 'series-old-parent'],
  sessions: []
};
assert.deepEqual(
  JSON.parse(JSON.stringify(context.revalidationOccurrences(staleGeneratedParent))),
  [],
  'a synthetic revalidated series parent with no concrete sessions must be dropped instead of perpetuating itself'
);

const parentWithNonConcreteTopLevel = {
  ...publishedSeries,
  id: 'series-old-parent',
  dateValue: '2026-12-19T10:00',
  url: 'https://example.org/event-series',
  sessions: [
    { id: 'show-1', dateValue: '2026-12-20T10:00', url: 'https://example.org/event-series#show-1' },
    { id: 'show-2', dateValue: '2026-12-21T10:00', url: 'https://example.org/event-series#show-2' }
  ]
};
const concreteOnly = JSON.parse(JSON.stringify(context.revalidationOccurrences(parentWithNonConcreteTopLevel)));
assert.deepEqual(concreteOnly.map(item => item.dateValue), [
  '2026-12-20T10:00',
  '2026-12-21T10:00'
], 'generated series revalidation must ignore a non-concrete parent date and keep only source sessions');

const oldIdentityAliases = recurringGrouped[0].legacyIds.filter(id => /^series-[0-9a-f]{16}$/.test(id));
assert.ok(oldIdentityAliases.length >= 2,
  'stable regrouping must retain historical series hashes for translation/saved-card migration');

const programA = { ...sessions[0], id: 'program-a', format: 'program', description: 'Program A description.' };
const programB = { ...sessions[1], id: 'program-b', format: 'program', description: 'Program B description.' };
assert.equal(context.groupRepeatedSessions([programA, programB]).length, 2,
  'non-show programs with materially different descriptions must remain conservatively separate');

console.log('Live-show session grouping tests passed.');

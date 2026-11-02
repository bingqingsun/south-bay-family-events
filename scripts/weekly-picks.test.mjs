import assert from 'node:assert/strict';
import { weekendFor, candidateEvents, choosePicks, editorialPicks, updateCollection } from './weekly-picks.mjs';

assert.deepEqual(weekendFor('2026-10-27'), { friday: '2026-10-30', sunday: '2026-11-01' });
assert.deepEqual(weekendFor('2026-11-02'), { friday: '2026-11-06', sunday: '2026-11-08' });

const days = ['2026-10-30T17:00', '2026-10-31T11:00', '2026-11-01T13:00'];
const events = Array.from({ length: 10 }, (_, index) => ({
  id: 'verified-' + index,
  title: ['Halloween Family Festival', 'Community Arts for Kids', 'Children’s Science Fair'][index % 3] + ' #' + index,
  dateValue: days[index % days.length],
  endDateValue: days[index % days.length],
  source: 'Official Organizer ' + index,
  city: index % 2 ? 'San Jose' : 'Cupertino',
  place: 'Venue ' + index,
  ageLabel: 'All ages',
  parentSummary: 'Families and children explore hands-on activities, games, art and local culture in this verified organizer event.',
  translations: { zh: { description: '适合全家参与的亲子活动，包括动手创作、游戏、艺术与本地文化体验。' } },
  linkStatus: 'ok',
  url: 'https://official' + index + '.example.com/event/' + index,
  costStatus: 'free',
  type: 'community'
}));
events.push({
  ...events[0], id: 'adult-party', title: 'Champagne Lounge Party', url: 'https://official.example.com/lounge'
});
events.push({
  ...events[0], id: 'expired', dateValue: '2026-10-24', endDateValue: '2026-10-24'
});
events.push({
  ...events[0], id: 'broken', linkStatus: 'invalid', url: 'https://official.example.com/bad'
});

assert.equal(candidateEvents(events, '2026-10-30').length, 10);
const libraryVerified = {
  ...events[0], id: 'trusted-library',
  linkStatus: 'blocked-machine', source: 'Santa Clara County Library District',
  url: 'https://sccl.bibliocommons.com/events/6ad152c696ec3a003adae180'
};
const siteBlocked = {
  ...events[0], id: 'untrusted-blocked',
  linkStatus: 'blocked-machine', source: 'Unknown source',
  url: 'https://unknown.example.com/events/6ad152c696ec3a003adae180'
};
const ticketBlocked = {
  ...events[0], id: 'trusted-tech',
  linkStatus: 'blocked-machine', source: 'The Tech Interactive',
  url: 'https://tickets.thetech.org/events/f4a8a127-14ee-4150-ca58-24df1287e87c'
};
assert.ok(candidateEvents([libraryVerified], '2026-10-30').some(e => e.id === 'trusted-library'),
  'Recognize official BiblioCommons event IDs despite bot blocking');
assert.ok(candidateEvents([ticketBlocked], '2026-10-30').some(e => e.id === 'trusted-tech'),
  'Recognize exact The Tech Interactive ticket event IDs despite bot blocking');
assert.equal(candidateEvents([siteBlocked], '2026-10-30').length, 0,
  'Never whitelist arbitrary sites just because a machine was blocked');
assert.equal(choosePicks(events, '2026-10-30').length, 10);
assert.equal(choosePicks(events.slice(0, 6), '2026-10-30').length, 6, 'Sparse weekends publish quality selections without padding');
assert.equal(editorialPicks(events, '2026-10-30').length, 10);
assert.throws(() => choosePicks(events.slice(0, 2), '2026-10-30'), /publish gate/);

const before = [
  'window.SBFF_COLLECTIONS = [',
  "    Object.freeze({",
  "      slug: 'weekend-picks',",
  "      year: 2026,",
  "      homeDescription: 'old',",
  "      homeTags: ['old'],",
  "      landingDescription: 'old',",
  "      translations: Object.freeze({",
  "        zh: Object.freeze({",
  "          homeDescription: '旧',",
  "          homeTags: ['旧'],",
  "          landingDescription: '旧'",
  '        })',
  '      }),',
  "      published: false,",
  "      publishAt: 'old',",
  '      selectedEventRefs: [',
  "        {id:'old'}",
  '      ],',
  '    }),',
  "    Object.freeze({",
  "      slug: 'halloween',",
  '      homeDescription: "keep"',
  '    })',
  '];'
].join('\n');
const picks = editorialPicks(events, '2026-10-30');
const after = updateCollection(before, picks, '2026-10-30', '2026-11-01', 'publish', '2026-10-26T12:00:00Z');
assert.ok(after.includes('Oct 30–Nov 1'));
assert.ok(after.includes('10月30日周五–11月1日周日'));
assert.ok(after.includes('selectedEventRefs: ['));
assert.ok(after.includes('"id":"verified-0"'));
assert.ok(after.includes('published: true'));
assert.ok(after.includes('homeDescription: "keep"'));
const retired = updateCollection(after, picks, '2026-10-30', '2026-11-01', 'retire', '2026-11-02T07:55:00Z');
assert.ok(retired.includes('published: false'));
const workflow = (await import('node:fs/promises')).readFile(new URL('../.github/workflows/weekly-picks.yml', import.meta.url), 'utf8');
const configYaml = await workflow;
assert.match(configYaml, /cron: '20 16 \* \* 1'/, 'Monday catch-up attempt required');
assert.match(configYaml, /cron: '20 19 \* \* 1'/, 'Late Monday catch-up attempt required');
assert.match(configYaml, /paths:\s*\n\s*- '\.github\/workflows\/weekly-picks\.yml'/, 'Workflow changes should launch a catch-up run');
console.log('Weekly Picks automation tests passed');

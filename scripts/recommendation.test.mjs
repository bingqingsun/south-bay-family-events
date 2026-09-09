import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(await readFile(new URL('../recommendation.js', import.meta.url), 'utf8'), context);
const recommendation = context.window.SouthBayRecommendation;
const todayKey = '2026-09-08';

function event(overrides = {}) {
  return {
    id: overrides.id || Math.random().toString(36),
    title: 'Family activity',
    description: 'A hands-on family activity with enough official information for parents to decide whether to attend.',
    dateValue: '2026-09-09',
    address: '1 Main St, San Jose',
    place: 'Community Center',
    source: 'Official organizer',
    url: 'https://example.org/event',
    ageRanges: [[4, 12]],
    ageLabel: 'Ages 4–12',
    ageSource: 'Official audience information',
    costLabel: 'Free',
    costSource: 'Official event page',
    type: 'community',
    format: 'program',
    lastVerifiedAt: '2026-09-08T12:00:00Z',
    ...overrides
  };
}

const ordinaryToday = event({ id: 'today', dateValue: todayKey });
const festivalLater = event({ id: 'festival', title: 'Family Festival', format: 'festival', dateValue: '2026-09-12' });
const timing = recommendation.rankRecommendedEvents([festivalLater, ordinaryToday], { todayKey });
assert.equal(timing[0].id, 'today', 'a useful activity today should outrank a later festival');

const farFuture = event({ id: 'future', title: 'Annual Family Festival', format: 'festival', dateValue: '2027-03-01' });
assert.ok(
  recommendation.calculateRecommendationScore(ordinaryToday, todayKey).totalScore
    > recommendation.calculateRecommendationScore(farFuture, todayKey).totalScore,
  'far-future special events must be meaningfully down-ranked'
);

const nearby = event({ id: 'nearby' });
const farAway = event({ id: 'far-away' });
const distanceRanked = recommendation.rankRecommendedEvents([farAway, nearby], {
  todayKey,
  getDistance: item => item.id === 'nearby' ? 1 : 30
});
assert.equal(distanceRanked[0].id, 'nearby', 'distance should personalize otherwise equal recommendations');
assert.ok(distanceRanked[0].recommendationBreakdown.distanceScore > distanceRanked[1].recommendationBreakdown.distanceScore);

const recurring = Array.from({ length: 12 }, (_, index) => event({
  id: `recurring-${index}`,
  title: 'Weekly Family Club',
  eventFrequency: 'weekly',
  dateValue: `2026-09-${String(9 + index).padStart(2, '0')}`
}));
const recurringRanked = recommendation.rankRecommendedEvents(recurring, { todayKey });
assert.equal(recurringRanked.length, recurring.length, 'recommendation diversity must never remove activities');
assert.equal(new Set(recurringRanked.map(item => item.id)).size, recurring.length);

const completeEvents = Array.from({ length: 10 }, (_, index) => event({
  id: `complete-${index}`,
  dateValue: `2026-09-${String(9 + index).padStart(2, '0')}`,
  type: index % 2 ? 'learning' : 'community',
  place: `Venue ${index}`,
  source: `Organizer ${index}`
}));
const incomplete = event({ id: 'incomplete', title: 'Festival', format: 'festival', address: '', ageRanges: [], ageLabel: '', ageSource: '' });
const readyFirst = recommendation.rankRecommendedEvents([incomplete, ...completeEvents], { todayKey });
assert.ok(readyFirst.slice(0, 10).every(item => item.recommendationReady), 'the first discovery viewport should prefer decision-ready activities');

const stalePick = event({ id: 'stale-pick', editorPick: true, editorPickUntil: '2026-09-07', editorPickReason: 'Timely family event' });
const activePick = event({ id: 'active-pick', editorPick: true, editorPickUntil: '2026-09-12', editorPickReason: 'Timely family event' });
const unexplainedPick = event({ id: 'unexplained-pick', editorPick: true, editorPickUntil: '2026-09-12' });
assert.equal(recommendation.isActiveEditorPick(stalePick, todayKey), false, 'expired editorial picks must not keep a boost');
assert.equal(recommendation.isActiveEditorPick(activePick, todayKey), true);
assert.equal(recommendation.isActiveEditorPick(unexplainedPick, todayKey), false, 'editorial picks require an internal reason');

const cancelled = event({ id: 'cancelled', title: 'Cancelled family event' });
assert.ok(
  recommendation.calculateRecommendationScore(cancelled, todayKey).totalScore < -900,
  'cancelled activities must fall to the bottom of recommendations'
);

console.log('Recommendation tests passed.');

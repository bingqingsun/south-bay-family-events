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

const ordinaryToday = event({ id: 'today', title: 'Weekly Math Club', type: 'learning', description: 'A recurring math practice session for elementary students with a structured lesson plan.', dateValue: todayKey });
const festivalLater = event({ id: 'festival', title: 'Family Festival', format: 'festival', dateValue: '2026-09-12' });
const timing = recommendation.rankRecommendedEvents([festivalLater, ordinaryToday], { todayKey });
assert.equal(timing[0].id, 'festival', 'an imminent family festival should outrank a routine learning class today');

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
assert.notEqual(readyFirst[0].id, 'incomplete', 'a missing address and audience evidence must keep an otherwise attractive event from taking the first slot');

const weekendSpotlight = event({
  id: 'weekend-spotlight',
  title: 'Rotary Fall Festival',
  description: 'A vibrant festival with artisan crafts, live entertainment, food trucks, and hands-on family activities.',
  dateValue: '2026-09-12',
  format: 'live-show',
  type: 'shows',
  ageRanges: [],
  ageLabel: '',
  ageSource: ''
});
const weekdayPlan = event({ id: 'weekday-plan', dateValue: '2026-09-11' });
const spotlightRanked = recommendation.rankRecommendedEvents([weekdayPlan, weekendSpotlight], { todayKey: '2026-09-11' });
assert.equal(spotlightRanked[0].id, 'weekend-spotlight', 'an imminent family-focused festival should lead the recommended list');
assert.equal(spotlightRanked[0].recommendationBadge, 'weekend-spotlight');
assert.equal(recommendation.isWeekendSpotlight(weekendSpotlight, '2026-09-11'), true);

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

const learningHeavy = Array.from({ length: 5 }, (_, index) => event({
  id: `learning-${index}`,
  title: `Math Program ${index + 1}`,
  type: 'learning',
  description: 'A structured math lesson for elementary students with guided practice and a short assessment.',
  dateValue: '2026-09-09',
  place: `Learning venue ${index}`,
  source: `Learning organizer ${index}`
}));
const outingHeavy = Array.from({ length: 8 }, (_, index) => event({
  id: `outing-${index}`,
  title: `Family Festival ${index + 1}`,
  format: 'festival',
  description: 'A family festival with music, outdoor games, food, crafts, and hands-on activities for children.',
  dateValue: '2026-09-10',
  place: `Festival venue ${index}`,
  source: `Festival organizer ${index}`
}));
const everydayFamily = Array.from({ length: 2 }, (_, index) => event({
  id: `everyday-${index}`,
  title: `Family Story Circle ${index + 1}`,
  type: 'play',
  description: 'Families can join a welcoming story circle with songs, books, and a simple activity for young children.',
  dateValue: '2026-09-09',
  place: `Family venue ${index}`,
  source: `Family organizer ${index}`
}));
const background = event({
  id: 'background',
  title: 'Job Interview Coaching for Adults & Teens',
  type: 'learning',
  description: 'One-on-one preparation for job interviews, resumes, and career planning for participants.',
  dateValue: todayKey
});
const discoveryRanked = recommendation.rankRecommendedEvents([...learningHeavy, ...outingHeavy, ...everydayFamily, background], { todayKey });
const discoveryViewport = discoveryRanked.slice(0, recommendation.CONFIG.topResults);
assert.ok(discoveryViewport.filter(item => item.recommendationBreakdown.discoveryTier === 'outing').length >= 7, 'homepage discovery should reserve most of its first viewport for family outings');
assert.ok(discoveryViewport.filter(item => item.type === 'learning').length <= 2, 'homepage discovery should not be dominated by learning activities');
assert.equal(discoveryViewport.some(item => item.id === 'background'), false, 'background activities must not enter the homepage discovery viewport');

const learningCategoryRanked = recommendation.rankRecommendedEvents(learningHeavy, { todayKey, enforceDiscoveryMix: false });
assert.equal(learningCategoryRanked.length, learningHeavy.length, 'a chosen category should retain all of its matching activities without homepage quotas');

console.log('Recommendation tests passed.');

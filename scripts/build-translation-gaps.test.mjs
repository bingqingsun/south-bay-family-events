import assert from 'node:assert/strict';
import { buildTranslationGapSnapshot, isActiveForTranslation } from './build-translation-gaps.mjs';
import { translationFingerprint } from './event-translations.mjs';

const currentEvent = {
  id: 'current',
  dateValue: '2026-11-03T10:00',
  title: 'Current Family Event 2026',
  description: 'Enjoy music and crafts.'
};
const missingEvent = {
  id: 'missing',
  dateValue: '2026-11-04T10:00',
  title: 'Missing Family Event',
  description: 'Make a paper lantern.'
};
const staleEvent = {
  id: 'stale',
  dateValue: '2026-11-05T10:00',
  title: 'Updated Family Event',
  description: 'The organizer changed this description.'
};
const expiredEvent = {
  id: 'expired',
  dateValue: '2026-11-01T10:00',
  endDateValue: '2026-11-01T12:00',
  title: 'Expired Family Event',
  description: 'This event has ended.'
};

const currentTranslation = {
  id: currentEvent.id,
  sourceFingerprint: translationFingerprint(currentEvent),
  title: '2026 当前家庭活动',
  description: '参加音乐和手工活动。',
  status: 'approved',
  reviewedAt: '2026-11-01T00:00:00Z'
};
const staleTranslation = {
  id: staleEvent.id,
  sourceFingerprint: translationFingerprint({ ...staleEvent, description: 'The old description.' }),
  title: '已更新的家庭活动',
  description: '旧活动介绍。',
  status: 'approved',
  reviewedAt: '2026-11-01T00:00:00Z'
};
const catalog = {
  entries: [currentTranslation, staleTranslation],
  variantsById: new Map([
    [currentEvent.id, [currentTranslation]],
    [staleEvent.id, [staleTranslation]]
  ])
};

assert.equal(isActiveForTranslation(expiredEvent, '2026-11-02'), false);
assert.equal(isActiveForTranslation(missingEvent, '2026-11-02'), true);

const snapshot = buildTranslationGapSnapshot({
  events: [expiredEvent, staleEvent, currentEvent, missingEvent],
  catalog,
  today: '2026-11-02',
  generatedAt: '2026-11-02T20:00:00.000Z',
  batchSize: 1
});

assert.deepEqual(snapshot.manifest.stats, {
  current: 1,
  gaps: 2,
  missing: 1,
  stale: 1,
  invalid: 0
});
assert.equal(snapshot.manifest.activeEventCount, 3);
assert.equal(snapshot.manifest.sourceEventCount, 4);
assert.deepEqual(snapshot.manifest.batches, [
  { file: 'batch-001.json', count: 1 },
  { file: 'batch-002.json', count: 1 }
]);
assert.equal(snapshot.batches[0].data.entries[0].id, missingEvent.id);
assert.equal(snapshot.batches[1].data.entries[0].id, staleEvent.id);
assert.equal(snapshot.batches[1].data.entries[0].priorTitleZh, staleTranslation.title);
assert.ok(snapshot.batches.every(batch => batch.data.entries.every(entry => /^[a-f0-9]{64}$/.test(entry.sourceFingerprint))));
assert.ok(snapshot.batches.every(batch => batch.data.entries.every(entry => entry.id !== expiredEvent.id)));

console.log('translation gap snapshot contracts passed');

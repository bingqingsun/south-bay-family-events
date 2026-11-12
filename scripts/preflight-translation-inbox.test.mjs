import assert from 'node:assert/strict';
import { buildTranslationGapSnapshot } from './build-translation-gaps.mjs';
import { translationFingerprint } from './event-translations.mjs';
import { validateTranslationInboxPreflight } from './preflight-translation-inbox.mjs';

const now = '2026-11-11T23:00:00.000Z';
const today = '2026-11-11';
const events = [
  { id: 'current', title: 'Storytime 2026', description: 'Songs and stories.', dateValue: '2026-11-12T10:00' },
  { id: 'missing', title: 'Music for Grades K-8', description: 'Learn songs together.', dateValue: '2026-11-12T11:00' },
  { id: 'stale', title: 'Craft Day', description: 'Make a paper lantern.', dateValue: '2026-11-12T12:00' },
  { id: 'expired', title: 'Past Event', description: 'Already ended.', dateValue: '2026-11-09T12:00', endDateValue: '2026-11-09T13:00' }
];

const current = {
  id: 'current', sourceFingerprint: translationFingerprint(events[0]),
  title: '2026 故事时间', description: '听歌曲和故事。',
  status: 'approved', reviewedAt: now
};
const stale = {
  id: 'stale', sourceFingerprint: translationFingerprint({ ...events[2], description: 'Old text.' }),
  title: '手工日', description: '旧活动内容。',
  status: 'approved', reviewedAt: now
};
const originalCatalog = { entries: [current, stale] };
const snapshot = buildTranslationGapSnapshot({
  events, catalog: originalCatalog, generatedAt: now, today, batchSize: 1
});
const inbox = {
  version: 1, locale: 'zh-Hans', submittedAt: now,
  entries: snapshot.batches.map(batch => {
    const gap = batch.data.entries[0];
    return {
      id: gap.id, sourceFingerprint: gap.sourceFingerprint,
      title: gap.id === 'missing' ? 'K–8 年级音乐活动' : '手工日',
      description: gap.id === 'missing' ? '一起学习歌曲。' : '制作纸灯笼。',
      status: 'approved', translationSource: 'chatgpt-reviewed',
      reviewedAt: now, override: true, sourceUrl: gap.sourceUrl
    };
  })
};
const mergedCatalog = { entries: [current, ...inbox.entries] };
const input = {
  inbox, manifest: snapshot.manifest, batches: snapshot.batches.map(b => b.data),
  events, catalog: mergedCatalog, today
};

const ok = validateTranslationInboxPreflight(input);
assert.equal(ok.active, 3);
assert.equal(ok.submitted, 2);
assert.equal(ok.stats.current, 3);
assert.equal(ok.stats.missing + ok.stats.stale + ok.stats.invalid, 0);
assert.equal(validateTranslationInboxPreflight({ ...input, catalogOnly: true, inbox: null }).stats.current, 3);

const badDate = structuredClone(input.batches);
badDate[0].generatedAt = '2026-11-10T00:00:00Z';
assert.throws(() => validateTranslationInboxPreflight({ ...input, batches: badDate }), /inconsistent metadata/);

const badCount = structuredClone(input.manifest);
badCount.stats.gaps += 1;
assert.throws(() => validateTranslationInboxPreflight({ ...input, manifest: badCount }), /manifest counts/);

assert.throws(() => validateTranslationInboxPreflight({
  ...input, inbox: { ...inbox, entries: inbox.entries.slice(0, 1) }
}), /missing current gap/);

const added = structuredClone(inbox);
added.entries[0].id = 'not-in-snapshot';
assert.throws(() => validateTranslationInboxPreflight({ ...input, inbox: added }), /unexpected id/);

const badFingerprint = structuredClone(inbox);
badFingerprint.entries[0].sourceFingerprint = 'a'.repeat(64);
assert.throws(() => validateTranslationInboxPreflight({
  ...input, inbox: badFingerprint
}), /outdated sourceFingerprint/);

const badNumber = structuredClone(inbox);
badNumber.entries.find(e => e.id === 'missing').title = 'K–9 年级音乐活动';
assert.throws(() => validateTranslationInboxPreflight({
  ...input, inbox: badNumber
}), /numeric-facts-changed/);

const unsupportedFree = structuredClone(inbox);
unsupportedFree.entries[0].description += ' 免费。';
assert.throws(() => validateTranslationInboxPreflight({
  ...input, inbox: unsupportedFree
}), /unsupported-claim:free/);

const changedSource = structuredClone(events);
changedSource.find(e => e.id === 'stale').description = 'Changed again.';
assert.throws(() => validateTranslationInboxPreflight({
  ...input, events: changedSource
}), /no longer matches/);

const incompleteCatalog = { entries: [current, inbox.entries[0]] };
assert.throws(() => validateTranslationInboxPreflight({
  ...input, catalog: incompleteCatalog
}), /coverage: current=/);

console.log('translation inbox preflight contracts passed');

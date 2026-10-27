import assert from 'node:assert/strict';
import { applyChineseTranslationCatalog, auditChineseTranslation, translationFingerprint } from './event-translations.mjs';

const event = {
  id: 'sample-1',
  url: 'https://example.org/event',
  title: 'Family Festival 2026',
  description: 'Enjoy crafts and music for all ages.'
};
const fingerprint = translationFingerprint(event);
const catalog = {
  entries: [{
    id: event.id,
    sourceUrl: event.url,
    sourceFingerprint: fingerprint,
    title: '2026 家庭节',
    description: '参加手工和音乐活动，适合所有年龄。',
    status: 'approved',
    translationSource: 'test',
    reviewedAt: '2026-09-25T00:00:00Z'
  }]
};

const [current] = [structuredClone(event)];
const result = applyChineseTranslationCatalog([current], catalog);
assert.equal(result.stats.current, 1);
assert.equal(current.translationStatus, 'current');
assert.equal(current.translations.zh.title, '2026 家庭节');

const stale = structuredClone(event);
stale.description = 'Enjoy crafts and music.';
const staleResult = applyChineseTranslationCatalog([stale], catalog);
assert.equal(staleResult.stats.stale, 1);
assert.equal(stale.translationStatus, 'stale');
assert.equal(stale.translations, undefined);

const numericMismatch = auditChineseTranslation(event, {
  title: '2027 家庭节',
  description: '参加手工和音乐活动，适合所有年龄。'
});
assert.equal(numericMismatch.ok, false);
assert.ok(numericMismatch.issues.some(issue => issue.startsWith('numeric-facts-changed')));

const unsupportedFree = auditChineseTranslation(
  { title: 'Craft Day', description: 'Make a paper lantern.' },
  { title: '手工日', description: '免费制作纸灯笼。' }
);
assert.equal(unsupportedFree.ok, false);
assert.ok(unsupportedFree.issues.includes('unsupported-claim:free'));

console.log('event translation contracts passed');


const canonicalized = {
  id: 'canonical-1',
  legacyIds: ['legacy-1'],
  title: 'Merged Family Event',
  description: 'Enjoy music and crafts.'
};
const canonicalizedCatalog = {
  entries: [{
    id: 'legacy-1',
    sourceFingerprint: translationFingerprint(canonicalized),
    title: '合并后的家庭活动',
    description: '参加音乐和手工活动。',
    status: 'approved',
    translationSource: 'test',
    reviewedAt: '2026-10-07T00:00:00Z'
  }]
};
const canonicalizedResult = applyChineseTranslationCatalog([canonicalized], canonicalizedCatalog);
assert.equal(canonicalizedResult.stats.current, 1);
assert.equal(canonicalized.translationStatus, 'current');
assert.equal(canonicalized.translations.zh.title, '合并后的家庭活动');

// Earlier reviewed versions remain available, but the active event selects the
// exact approved fingerprint instead of whichever sidecar happens to load last.
const oldRevision = {
  id: event.id, sourceFingerprint: 'stale-english-fingerprint',
  title: '旧译文', description: '旧描述', status: 'approved',
  override: true, reviewedAt: '2026-10-27T23:00:00Z'
};
const matchingRevision = {
  ...catalog.entries[0], reviewedAt: '2026-10-10T00:00:00Z'
};
const revisionsCatalog = {
  entries: [oldRevision],
  variantsById: new Map([[event.id, [matchingRevision, oldRevision]]])
};
const revised = structuredClone(event);
const revisionResult = applyChineseTranslationCatalog([revised], revisionsCatalog);
assert.equal(revisionResult.stats.current, 1);
assert.equal(revised.translations.zh.title, matchingRevision.title);

// Library organizers commonly say 'no registration needed' instead of 'required'.
assert.equal(auditChineseTranslation(
  { title: 'Poetry', description: 'No registration needed. Read poems together.' },
  { title: '诗歌朗读', description: '无需报名，大家一起朗读诗歌。' }
).ok, true);

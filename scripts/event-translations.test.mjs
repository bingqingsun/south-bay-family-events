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

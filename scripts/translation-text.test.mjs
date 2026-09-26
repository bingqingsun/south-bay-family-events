import assert from 'node:assert/strict';
import { splitTranslationText, translateTextSafely } from './translation-text.mjs';

const longTitle = 'Family Science Festival with Robotics, Space Exploration, Hands-on Engineering, Live Demonstrations, Maker Activities, and Community Partners for Children and Families Across the South Bay';
const chunks = splitTranslationText(longTitle, { maxChars: 48 });
assert.ok(chunks.length > 1, 'long titles must be chunked before translation');
assert.ok(chunks.every(chunk => chunk.length <= 48 || !chunk.includes(' ')), 'chunks should respect the configured safety size');
assert.equal(chunks.join(' ').replace(/\s+/g, ' '), longTitle.replace(/\s+/g, ' '));

const calls = [];
const fakeTranslator = async source => {
  calls.push(source);
  return [{ translation_text: `中:${source}` }];
};
const translated = await translateTextSafely(fakeTranslator, longTitle, { maxChars: 48, maxNewTokens: 64 });
assert.equal(calls.length, chunks.length, 'every safe chunk should be translated');
assert.ok(translated.startsWith('中:'), 'translated chunks should be reassembled');

await assert.rejects(
  () => translateTextSafely(async () => [{ translation_text: '' }], 'A sufficiently long title', { maxChars: 10 }),
  /empty-translation-output/,
  'empty model output must be rejected instead of silently publishing English fallback as an approved translation'
);

console.log(`length-safe translation text passed with ${chunks.length} chunks`);

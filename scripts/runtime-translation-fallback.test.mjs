import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const file of ['app.js', 'collections.js']) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  // Runtime may use the sidecar overlay only when it matches the fingerprint
  // embedded into the current canonical event. Otherwise it falls back to the
  // reviewed embedded translation, then to organizer-supplied English.
  assert.match(source, /overlay\.sourceFingerprint === embedded\.fingerprint/);
  assert.match(source, /embedded\?\.\[field\] \|\| event\[field\]/);
}

const translationPipeline = await readFile(new URL('./event-translations.mjs', import.meta.url), 'utf8');
assert.match(translationPipeline, /entry\.status !== 'approved'/);
assert.match(translationPipeline, /entry\.sourceFingerprint !== fingerprint/);
assert.match(translationPipeline, /event\.translationStatus = 'stale'/);
assert.match(translationPipeline, /translationSource: entry\.translationSource \|\| 'reviewed-sidecar'/);

const dailyWorkflow = await readFile(new URL('../.github/workflows/daily-events.yml', import.meta.url), 'utf8');
assert.match(dailyWorkflow, /Re-apply reviewed Chinese translations/);
assert.doesNotMatch(dailyWorkflow, /Xenova\/opus-mt-en-zh|@huggingface\/transformers|generate-event-translations\.mjs/);

console.log('runtime translation fallback safety passed');

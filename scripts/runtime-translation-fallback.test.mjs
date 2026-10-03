import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Release guard: keep stale/missing Chinese translations on the safe English fallback path.
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

// Event refresh and translation review are intentionally separate pipelines.
// The nightly event refresh must not invoke translation generation or require
// an OpenAI key. Missing/stale Chinese safely falls back to English at runtime
// until the post-refresh translation review updates the reviewed sidecars.
const dailyWorkflow = await readFile(new URL('../.github/workflows/daily-events.yml', import.meta.url), 'utf8');
assert.doesNotMatch(dailyWorkflow, /OPENAI_API_KEY|Generate missing Chinese translations|Re-apply reviewed Chinese translations/);
assert.doesNotMatch(dailyWorkflow, /Xenova\/opus-mt-en-zh|@huggingface\/transformers|generate-event-translations\.mjs|generate-chinese-translations\.mjs/);

console.log('runtime translation fallback safety passed');

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
// The 10 PM event refresh must not invoke translation generation or require
// an OpenAI key. Missing/stale Chinese safely falls back to English until
// the 10:30 PM translation workflow updates the reviewed sidecars.
const updateEvents = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
assert.match(updateEvents, /loadChineseTranslationCatalogs/);
assert.match(updateEvents, /applyChineseTranslationCatalog\(events, translationCatalog/);
assert.doesNotMatch(updateEvents, /OPENAI_API_KEY|generate-chinese-translations\.mjs/);

const dailyWorkflow = await readFile(new URL('../.github/workflows/daily-events.yml', import.meta.url), 'utf8');
assert.doesNotMatch(dailyWorkflow, /OPENAI_API_KEY|generate-chinese-translations\.mjs|Build runtime translation overlay|Apply approved Chinese translations|Re-apply reviewed Chinese translations/);

const nightlyTranslationWorkflow = await readFile(new URL('../.github/workflows/nightly-translations.yml', import.meta.url), 'utf8');
assert.match(nightlyTranslationWorkflow, /Refresh Chinese translations/);
assert.match(nightlyTranslationWorkflow, /cron: '30 5 \* \* \*'/);
assert.match(nightlyTranslationWorkflow, /cron: '30 6 \* \* \*'/);
assert.match(nightlyTranslationWorkflow, /OPENAI_API_KEY/);
assert.match(nightlyTranslationWorkflow, /generate-chinese-translations\.mjs/);
assert.match(nightlyTranslationWorkflow, /build-translation-overlay\.mjs/);
assert.match(nightlyTranslationWorkflow, /apply-event-translations\.mjs/);
assert.match(nightlyTranslationWorkflow, /translation-qa\.mjs/);
assert.doesNotMatch(nightlyTranslationWorkflow, /Xenova\/opus-mt-en-zh|@huggingface\/transformers|generate-event-translations\.mjs/);

console.log('runtime translation fallback safety passed');

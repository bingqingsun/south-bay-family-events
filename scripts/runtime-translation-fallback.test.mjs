import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

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

// Event refresh and translation review are intentionally separate. The 10 PM
// GitHub refresh may re-apply already approved local translations, but must not
// generate translations or require any OpenAI API key. New/stale translations
// are reviewed and written by the assistant-managed nightly task.
const updateEvents = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
assert.match(updateEvents, /loadChineseTranslationCatalogs/);
assert.match(updateEvents, /applyChineseTranslationCatalog\(events, translationCatalog/);
assert.doesNotMatch(updateEvents, /OPENAI_API_KEY|generate-chinese-translations\.mjs/);

const dailyWorkflow = await readFile(new URL('../.github/workflows/daily-events.yml', import.meta.url), 'utf8');
assert.match(dailyWorkflow, /Re-apply approved Chinese translations/);
assert.match(dailyWorkflow, /apply-event-translations\.mjs/);
assert.doesNotMatch(dailyWorkflow, /OPENAI_API_KEY|generate-chinese-translations\.mjs|Build runtime translation overlay/);
assert.match(dailyWorkflow, /github\.event\.schedule/);
assert.match(dailyWorkflow, /nominal_utc/);
assert.doesNotMatch(dailyWorkflow, /TZ=America\/Los_Angeles date \+%H/);

const workflowDir = new URL('../.github/workflows/', import.meta.url);
const workflowNames = (await readdir(workflowDir)).filter(name => /\.ya?ml$/i.test(name));
for (const name of workflowNames) {
  const workflow = await readFile(new URL(name, workflowDir), 'utf8');
  assert.doesNotMatch(workflow, /OPENAI_API_KEY/);
}
assert.ok(!workflowNames.includes('nightly-translations.yml'));

console.log('runtime translation fallback safety passed');

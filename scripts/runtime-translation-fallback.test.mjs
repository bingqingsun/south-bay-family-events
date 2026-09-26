import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
for (const file of ['app.js','collections.js']) {
  const source = await readFile(new URL(`../${file}`, import.meta.url),'utf8');
  assert.match(source,/overlay\.sourceFingerprint === embedded\.fingerprint/);
  assert.match(source,/embedded\?\.\[field\] \|\| event\[field\]/);
}
const generator = await readFile(new URL('./generate-event-translations.mjs', import.meta.url),'utf8');
assert.match(generator,/translationSource: 'auto-local-opus-mt-en-zh'/);
assert.match(generator,/qualityGate: 'automated-qa'/);
console.log('runtime translation fallback safety passed');

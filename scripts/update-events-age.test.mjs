import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function decodeXml');
const end = source.indexOf('function costInfo');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const rangesOf = result => JSON.parse(JSON.stringify(result.ageRanges));

let result = context.ageInfo('Grades K–8 Grades 5–8');
assert.deepEqual(rangesOf(result), [[5, 13]]);
assert.equal(result.ageMin, 5);
assert.equal(result.ageMax, 13);
assert.equal(result.ageLabel, 'Grades K–8');

result = context.ageInfo('Grades K–2 Grades 3–5');
assert.deepEqual(rangesOf(result), [[5, 7], [8, 10]], 'adjacent independent grade ranges must remain separate');
assert.equal(result.ageLabel, 'Grades K–2 · Grades 3–5');

result = context.ageInfo('Babies Teens. All ages are welcome. Grades K–8 Grades 5–8');
assert.deepEqual(rangesOf(result), [[0, 18]], 'explicit All ages wording must still take precedence');
assert.equal(result.ageMin, 0);
assert.equal(result.ageMax, 18);
assert.equal(result.ageLabel, 'All ages');

console.log('Update-events age tests passed.');

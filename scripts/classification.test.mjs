import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function typeFor');
const end = source.indexOf('function formatFor');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.equal(
  context.typeFor('OneinMath: Math Program for K-3 with engaging math activities, games, and lessons.'),
  'learning',
  'subject learning must outrank game mechanics'
);
assert.equal(context.typeFor('Family storytime with songs, games, and playtime.'), 'play');
assert.equal(context.typeFor('Bilingual family storytime with early literacy songs and rhymes.'), 'play');
assert.equal(context.typeFor('LEGO free play with STEAM benefits for early childhood development.'), 'play');
assert.equal(context.typeFor('LEGO robotics workshop with coding challenges.'), 'learning');
assert.equal(context.typeFor('Rotary Fall Festival with music, artisan crafts, and games.'), 'community');
assert.equal(context.typeFor('Kids painting and craft games at the library.'), 'arts');
assert.equal(context.typeFor('Digital illustration workshop using the Procreate app.'), 'arts');
assert.equal(context.typeFor('Digital illustration workshop listed in a STEM catalog.'), 'arts');
assert.equal(context.typeFor('Digital illustration workshop listed in an engineering catalog.'), 'arts');
assert.equal(context.typeFor('Robot design challenge: build, code, and test a rover.'), 'learning');
assert.equal(context.typeFor('Beginner yoga class with simple movement games.'), 'workshops');

console.log('Classification tests passed.');

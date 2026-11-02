import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Runs after applying reviewed official supplements and repairing summaries.
// A green unit test alone is insufficient: these exact card descriptions
// must be correct in the final publishable events.json.
const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const find = title => events.find(event => event.title === title);

const tween = find('Tween Dungeons and Dragons');
assert.ok(tween, 'A current SCCLD Tween Dungeons and Dragons session must remain visible');
assert.ok((tween.description || '').length >= 40,
  'The current session must keep a useful organizer-grounded description');
assert.doesNotMatch(tween.description || '', /21Oct\.|September 2/,
  'Malformed date fragments from an older feed item must not leak into the current session');

for (const [title, fragment] of [
  ["Singin' In The Rain", /Hollywood classic/],
  ["Lilly's Purple Plastic Purse", /Kevin Henkes/]
]) {
  const show = find(title);
  assert.ok(show, `Missing official PYT production: ${title}`);
  assert.equal(show.source, 'Peninsula Youth Theatre');
  assert.match(show.description || '', fragment);
  assert.doesNotMatch(show.description || '', /Read this site in Spanish|copyright|501\s*\(c\)/i);
  assert.ok((show.description || '').length >= 60);
}
assert.ok(!events.some(event => /CAH Museum Closed for Thanksgiving Holiday/i.test(event.title)),
  'Museum closure is not an outing and must not be published');
console.log('Current source-description publication regressions passed');

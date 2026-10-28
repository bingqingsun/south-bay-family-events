import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Runs after the official-source smoke refresh. Verify the exact official
// organizer program survives summary, audience, date, link and data gates.
const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
const source = sources.find(item => item.id === 'calpulli-tonalehqueh-dia-de-muertos');
assert.ok(source, 'The official Calpulli Tonalehqueh source must be configured');
assert.equal(source.method, 'curated');
assert.equal(source.feedUrl, 'https://www.aztecadancers.com/dia-de-muertos');
const matches = events.filter(event => /22nd Annual Micailhuitl/i.test(event.title));
assert.equal(matches.length, 1, 'Publish the family-friendly Micailhuitl festival exactly once');
const event = matches[0];
assert.equal(event.dateValue.slice(0, 10), '2026-10-31');
assert.equal(event.endDateValue.slice(0, 10), '2026-11-01');
assert.equal(event.url, 'https://www.aztecadancers.com/dia-de-muertos');
assert.equal(event.place, 'History Park');
assert.match(event.description || '', /Danza Azteca|Ballet Folklórico|sugar skull/i);
assert.equal(event.costStatus, 'free');
console.log('Official Micailhuitl event publication regression passed.');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sources = JSON.parse(await readFile('data/sources.json', 'utf8'));
const events = JSON.parse(await readFile('data/events.json', 'utf8'));

const configured = [];
for (const source of sources) {
  for (const item of source.events || []) {
    if (!item.image) continue;
    configured.push({
      source: source.name,
      title: item.title,
      day: String(item.dateValue || '').slice(0, 10),
      image: item.image
    });
  }
}

const violations = [];
for (const event of events) {
  const days = new Set([
    String(event.dateValue || '').slice(0, 10),
    ...(event.sessions || []).map(session => String(session.dateValue || '').slice(0, 10))
  ].filter(Boolean));
  const matches = configured.filter(item =>
    item.source === event.source &&
    item.title === event.title &&
    days.has(item.day)
  );
  if (!matches.length) continue;
  const uniqueImages = [...new Set(matches.map(item => item.image))];
  if (uniqueImages.length !== 1) continue;
  const expected = uniqueImages[0];
  if (event.image !== expected || event.imageProvenance?.method !== 'manual_verified') {
    violations.push({
      id:event.id,
      title:event.title,
      expected,
      actual:event.image || '',
      provenance:event.imageProvenance?.method || ''
    });
  }
}

assert.deepEqual(
  violations,
  [],
  'Curated official images must remain authoritative in published event data: ' + JSON.stringify(violations)
);
console.log(`Curated image integrity passed: ${configured.length} configured source images checked.`);

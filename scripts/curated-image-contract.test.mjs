import assert from 'node:assert/strict';
import fs from 'node:fs';

const sources = JSON.parse(fs.readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8'));
const events = JSON.parse(fs.readFileSync(new URL('../data/events.json', import.meta.url), 'utf8'));

const explicit = [];
for (const source of sources) {
  for (const configured of source.events || []) {
    if (!configured.image) continue;
    explicit.push({
      source: source.name,
      title: configured.title,
      day: String(configured.dateValue || '').slice(0, 10),
      image: configured.image
    });
  }
}

let checked = 0;
for (const event of events) {
  const days = new Set([
    String(event.dateValue || '').slice(0, 10),
    ...(event.sessions || []).map(session => String(session.dateValue || '').slice(0, 10))
  ].filter(Boolean));
  const matches = explicit.filter(item =>
    item.source === event.source
    && item.title === event.title
    && days.has(item.day)
  );
  if (!matches.length) continue;

  const allowedImages = [...new Set(matches.map(item => item.image))];
  checked += 1;
  assert.ok(
    allowedImages.includes(event.image),
    `${event.title}: published image must remain one of the explicitly curated source images; got ${event.image}`
  );
  assert.equal(event.imageStatus, 'official', `${event.title}: curated image must remain official`);
  assert.equal(
    event.imageProvenance?.method,
    'manual_verified',
    `${event.title}: canonical enrichment must not downgrade/replace a manually verified source image`
  );
}

assert.ok(checked > 0, 'Expected at least one published event with an explicitly curated source image');
console.log(`Curated image contract passed for ${checked} published events`);

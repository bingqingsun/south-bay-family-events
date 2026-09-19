import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
assert.ok(Array.isArray(events) && events.length > 0, 'events.json must contain published activities');

const allowedStatuses = new Set(['extractive', 'official_structured', 'manual_verified']);
const violations = [];

for (const event of events) {
  const id = event.id || event.title || 'unknown-event';
  const summary = String(event.parentSummary || event.description || '').replace(/\s+/g, ' ').trim();
  const raw = String(event.sourceDescriptionRaw || '').replace(/\s+/g, ' ').trim();
  const comparableSummary = summary.replace(/…$/, '').trim();

  if (!allowedStatuses.has(event.summaryStatus)) violations.push(`${id}: invalid summaryStatus=${event.summaryStatus || 'missing'}`);
  if (event.summaryVersion !== 'event-summary-v2-p1') violations.push(`${id}: summaryVersion must be event-summary-v2-p1`);
  if (!event.summaryVerifiedAt) violations.push(`${id}: missing summaryVerifiedAt`);
  if (!summary) violations.push(`${id}: missing parentSummary`);
  if (event.description !== event.parentSummary) violations.push(`${id}: description must mirror parentSummary during v2 migration`);
  if (!raw) violations.push(`${id}: missing sourceDescriptionRaw`);
  if (!event.sourceDescriptionHash) violations.push(`${id}: missing sourceDescriptionHash`);

  // Extractive summaries may shorten or select official-source text, but must
  // never introduce a clause that is absent from the preserved source copy.
  if (event.summaryStatus === 'extractive' && comparableSummary && raw && !raw.includes(comparableSummary)) {
    violations.push(`${id}: extractive summary is not present in sourceDescriptionRaw | summary="${summary.slice(0, 220)}" | raw="${raw.slice(0, 320)}"`);
  }
}

if (violations.length) {
  console.error(`summary-output audit failed with ${violations.length} violation(s):`);
  violations.slice(0, 50).forEach(item => console.error(`- ${item}`));
  if (violations.length > 50) console.error(`... and ${violations.length - 50} more`);
  process.exit(1);
}

const counts = events.reduce((acc, event) => {
  acc[event.summaryStatus] = (acc[event.summaryStatus] || 0) + 1;
  return acc;
}, {});
console.log(`summary-output audit passed for ${events.length} events: ${JSON.stringify(counts)}`);

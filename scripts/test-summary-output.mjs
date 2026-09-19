import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessSummaryReadability } from './event-summary-engine.mjs';

const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
assert.ok(Array.isArray(events) && events.length > 0, 'events.json must contain published activities');

const allowedStatuses = new Set(['extractive', 'official_structured', 'manual_verified']);
const allowedQualities = new Set(['strong', 'acceptable', 'structured', 'manual_verified']);
const violations = [];

for (const event of events) {
  const id = event.id || event.title || 'unknown-event';
  const summary = String(event.parentSummary || event.description || '').replace(/\s+/g, ' ').trim();
  const raw = String(event.sourceDescriptionRaw || '').replace(/\s+/g, ' ').trim();
  const evidence = String(event.summaryEvidence || '').replace(/\s+/g, ' ').trim();

  if (!allowedStatuses.has(event.summaryStatus)) violations.push(`${id}: invalid summaryStatus=${event.summaryStatus || 'missing'}`);
  if (event.summaryVersion !== 'event-summary-v2-p3') violations.push(`${id}: summaryVersion must be event-summary-v2-p3`);
  if (!event.summaryVerifiedAt) violations.push(`${id}: missing summaryVerifiedAt`);
  if (!summary) violations.push(`${id}: missing parentSummary`);
  if (event.description !== event.parentSummary) violations.push(`${id}: description must mirror parentSummary during v2 migration`);
  if (!raw) violations.push(`${id}: missing sourceDescriptionRaw`);
  if (!event.sourceDescriptionHash) violations.push(`${id}: missing sourceDescriptionHash`);
  if (!event.summaryMethod) violations.push(`${id}: missing summaryMethod`);
  if (!allowedQualities.has(event.summaryQuality)) violations.push(`${id}: invalid summaryQuality=${event.summaryQuality || 'missing'}`);
  if (!evidence) violations.push(`${id}: missing summaryEvidence`);

  const readability = assessSummaryReadability(summary);
  if (!readability.ok) violations.push(`${id}: unreadable summary [${readability.issues.join(', ')}] | summary="${summary.slice(0, 240)}"`);

  // Extractive summaries must remain an exact official-source excerpt. No
  // generated truncation, rewritten clause, or inferred activity can pass.
  if (event.summaryStatus === 'extractive') {
    if (raw && summary && !raw.includes(summary)) {
      violations.push(`${id}: extractive summary is not present in sourceDescriptionRaw | summary="${summary.slice(0, 220)}" | raw="${raw.slice(0, 320)}"`);
    }
    if (evidence !== summary) violations.push(`${id}: extractive summaryEvidence must exactly equal parentSummary`);
    if (summary.endsWith('…')) violations.push(`${id}: extractive summary must not contain ingest-time ellipsis`);
  }

  // Manual and structured summaries are still required to declare exactly
  // which stored source text supports the published card.
  if (event.summaryStatus !== 'extractive' && evidence !== raw) {
    violations.push(`${id}: non-extractive summaryEvidence must equal its stored verified source text`);
  }

  if (event.summaryStatus === 'official_structured') {
    const data = event.summaryEvidenceData;
    if (!data || typeof data !== 'object' || !data.kind) {
      violations.push(`${id}: official_structured summary requires summaryEvidenceData`);
    } else if (data.kind === 'sports-game' && (!data.homeTeam || !data.opponent)) {
      violations.push(`${id}: sports-game evidence requires homeTeam and opponent`);
    } else if (data.kind === 'movie-screening' && !data.rating) {
      violations.push(`${id}: movie-screening evidence requires rating`);
    }
  }
}

if (violations.length) {
  console.error(`summary-output audit failed with ${violations.length} violation(s):`);
  violations.slice(0, 50).forEach(item => console.error(`- ${item}`));
  if (violations.length > 50) console.error(`... and ${violations.length - 50} more`);
  process.exit(1);
}

const counts = events.reduce((acc, event) => {
  acc.status[event.summaryStatus] = (acc.status[event.summaryStatus] || 0) + 1;
  acc.quality[event.summaryQuality] = (acc.quality[event.summaryQuality] || 0) + 1;
  acc.method[event.summaryMethod] = (acc.method[event.summaryMethod] || 0) + 1;
  return acc;
}, { status: {}, quality: {}, method: {} });

console.log(`summary-output audit passed for ${events.length} events: ${JSON.stringify(counts)}`);

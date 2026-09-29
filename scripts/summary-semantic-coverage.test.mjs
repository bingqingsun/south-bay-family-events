import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const eventsUrl = new URL('../data/events.json', import.meta.url);

const BAD_PREFIX = /^(?:at|in|on|for|of|into|through|during|after|before|under|over|near|around|inside|outside)\b/i;
const LEGAL_ONLY = /\b(?:terms and conditions|terms of use|privacy policy|release of liability|refund policy|all rights reserved)\b/i;
const AUDIENCE_ONLY = /^(?:family audience|recommended for|suggested ages?|ages?\s+\d|children\s+ages?|all ages(?:\s+are)?\s+welcome)\b/i;
const CORE_ACTIVITY = /\b(?:make|build|create|paint|decorate|craft|play|watch|read|dance|sing|taste|tour|hike|explore|learn|draw|meet|listen|perform|ride|visit|follow|collect|trick[- ]or[- ]treat|show|concert|performance|workshop|class|festival|parade|story|game|movie|film|exhibit|music|activity|activities)\b/i;
const GENERIC_EXPERIENCE = /\b(?:family[- ]friendly|interactive|immersive|magical|special|fun)\b[^.!?]{0,100}\bexperience\b/i;

export function semanticSummaryIssues(event) {
  const text = String(event?.parentSummary || event?.description || '').replace(/\s+/g, ' ').trim();
  const issues = [];
  if (!text) return ['empty'];
  if (BAD_PREFIX.test(text) && /^[a-z]/.test(text)) issues.push('dependent_prefix_fragment');
  if (LEGAL_ONLY.test(text) && !CORE_ACTIVITY.test(text)) issues.push('legal_copy_only');
  if (AUDIENCE_ONLY.test(text) && !CORE_ACTIVITY.test(text)) issues.push('audience_copy_only');
  if (GENERIC_EXPERIENCE.test(text) && !CORE_ACTIVITY.test(text)) issues.push('generic_experience_without_activity');
  return issues;
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const failures = [];

  for (const event of events) {
    // Enforce on all records produced by the current summary pipeline and on
    // manually verified replacements. Legacy records are reported separately
    // so the migration can proceed without hiding newly introduced regressions.
    const currentPipeline = Boolean(event.summaryVersion || event.parentSummary || event.summaryStatus === 'manual_verified');
    const issues = semanticSummaryIssues(event);
    if (currentPipeline && issues.length) {
      failures.push({ id: event.id, title: event.title, issues, summary: event.parentSummary || event.description });
    }
  }

  assert.equal(
    failures.length,
    0,
    `Semantic summary quality failures:\n${failures.map(item => `- ${item.title} (${item.id}): ${item.issues.join(', ')} :: ${item.summary}`).join('\n')}`
  );

  console.log(`Semantic summary coverage audit passed for ${events.length} events.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}

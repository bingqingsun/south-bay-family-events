import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { splitSourceSentences } from './event-summary-engine.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);

const BAD_PREFIX = /^(?:at|in|on|for|of|into|through|during|after|before|under|over|near|around|inside|outside)\b/i;
const LEGAL_ONLY = /\b(?:terms and conditions|terms of use|privacy policy|release of liability|refund policy|all rights reserved)\b/i;
const AUDIENCE_ONLY = /^(?:family audience|recommended for|suggested ages?|ages?\s+\d|children\s+ages?|all ages(?:\s+are)?\s+welcome)\b/i;
const CORE_ACTIVITY = /\b(?:make|build|create|paint|decorate|craft|play|watch|read|dance|sing|taste|tour|hike|explore|learn|draw|meet|listen|perform|ride|visit|follow|collect|trick[- ]or[- ]treat|show|concert|performance|workshop|class|festival|parade|story|game|movie|film|exhibit|music|activity|activities)\b/i;
const GENERIC_EXPERIENCE = /\b(?:family[- ]friendly|interactive|immersive|magical|special|fun)\b[^.!?]{0,100}\bexperience\b/i;
const SECONDARY_ONLY = /^(?:there (?:will|is|are) (?:be )?.*\b(?:after|following)\b|after\s+(?:storytime|the\s+program|the\s+event|the\s+show|the\s+class)\b|following\s+(?:storytime|the\s+program|the\s+event|the\s+show|the\s+class)\b)|\b\d+\s+minutes?\s+followed by\b/i;
const ADMINISTRATIVE_MEMBERSHIP = /\b(?:annual membership rates?|membership rates?|join or renew membership|ongoing bookstore hours?|regular bookstore hours?|proceeds help fund)\b/i;
const LIMITED_DETAIL = /\b(?:giveaway|giving away|special guest|guest appearance|free (?:books?|tote bags?|bulbs?|souvenirs?|gifts?))\b/i;
const DATE_DETAIL = /\b(?:on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const OVERVIEW_SIGNAL = /\b(?:event|festival|celebration|experience)\b/i;
const MULTI_ACTIVITY = /\b(?:activities|shows?|performances?|trick[- ]or[- ]treat(?:ing)?|games?|crafts?|music|rides?|characters?|stations?|zones?)\b/i;

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasBroaderOverview(event, summary) {
  const raw = normalize(event?.sourceDescriptionRaw);
  if (!raw || raw.length <= summary.length + 80) return false;
  return splitSourceSentences(raw, { title: event?.title || '' }).some((sentence) => {
    const candidate = normalize(sentence);
    if (!candidate || candidate === summary) return false;
    return OVERVIEW_SIGNAL.test(candidate)
      && MULTI_ACTIVITY.test(candidate)
      && CORE_ACTIVITY.test(candidate);
  });
}

export function semanticSummaryIssues(event) {
  const text = normalize(event?.parentSummary || event?.description);
  const issues = [];
  if (!text) return ['empty'];
  if (BAD_PREFIX.test(text) && /^[a-z]/.test(text)) issues.push('dependent_prefix_fragment');
  if (LEGAL_ONLY.test(text) && !CORE_ACTIVITY.test(text)) issues.push('legal_copy_only');
  if (AUDIENCE_ONLY.test(text) && !CORE_ACTIVITY.test(text)) issues.push('audience_copy_only');
  if (GENERIC_EXPERIENCE.test(text) && !CORE_ACTIVITY.test(text)) issues.push('generic_experience_without_activity');
  if (SECONDARY_ONLY.test(text)) issues.push('secondary_followup_only');
  if (ADMINISTRATIVE_MEMBERSHIP.test(text)) issues.push('administrative_membership_copy');
  if (text.length > 520) issues.push('overlong_card_summary');
  if (DATE_DETAIL.test(text) && LIMITED_DETAIL.test(text) && hasBroaderOverview(event, text)) {
    issues.push('limited_subevent_over_parent_overview');
  }
  return issues;
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const failures = [];
  const counts = new Map();

  for (const event of events) {
    // Enforce on all records produced by the current summary pipeline and on
    // manually verified replacements. Legacy records are reported separately
    // so the migration can proceed without hiding newly introduced regressions.
    const currentPipeline = Boolean(event.summaryVersion || event.parentSummary || event.summaryStatus === 'manual_verified');
    const issues = semanticSummaryIssues(event);
    if (currentPipeline && issues.length) {
      failures.push({
        id: event.id,
        title: event.title,
        source: event.source,
        issues,
        summary: normalize(event.parentSummary || event.description)
      });
      for (const issue of issues) counts.set(issue, (counts.get(issue) || 0) + 1);
    }
  }

  if (failures.length) {
    console.error('SUMMARY_SEMANTIC_AUDIT=' + JSON.stringify({
      total: failures.length,
      byIssue: Object.fromEntries([...counts.entries()].sort()),
      events: failures
    }));
  }

  assert.equal(
    failures.length,
    0,
    `Semantic summary quality failures:\n${failures.map(item => `- ${item.title} (${item.id}) [${item.issues.join(', ')}] :: ${item.summary}`).join('\n')}`
  );

  console.log(`Semantic summary coverage audit passed for ${events.length} events.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}

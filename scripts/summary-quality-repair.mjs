import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isSummaryAcceptable, splitSourceSentences } from './event-summary-engine.mjs';
import { semanticSummaryIssues } from './summary-semantic-coverage.test.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);

const CORE_ACTIVITY = /\b(?:make|build|create|paint|decorate|craft|play|watch|read|dance|sing|taste|tour|hike|explore|learn|draw|meet|listen|perform|ride|visit|follow|collect|trick[- ]or[- ]treat|show|concert|performance|workshop|class|festival|parade|story|stories|songs?|rhymes?|game|games|movie|film|exhibit|music|movement|activity|activities|sale|shopping)\b/gi;
const PARTICIPATION = /\b(?:families|family|kids?|children|participants?|attendees?|visitors?|guests?|you|your)\b/i;
const OVERVIEW = /\b(?:event|festival|celebration|experience|program|storytime|concert|show|workshop|class)\b/i;
const SECONDARY = /\b(?:after(?:ward)?|followed by|stay\s*(?:&|and)\s*play|all ages (?:are )?welcome|membership rates?|bookstore hours?)\b/i;
const SECTION_HEADING = /\b(?:entertainment schedule|schedule|location|zoom information|registration|tickets?|admission|education goals|agenda)\s*:/ig;

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleTokens(title) {
  return normalize(title).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
}

function candidateSegments(source, title) {
  const raw = normalize(source);
  const segments = new Set(splitSourceSentences(raw, { title }));

  // Some source adapters flatten HTML block boundaries, producing a useful
  // intro immediately followed by a section heading without a space/newline.
  // Preserve exact source wording by slicing, never rewriting.
  for (const match of raw.matchAll(SECTION_HEADING)) {
    const before = raw.slice(0, match.index).trim();
    if (before) segments.add(before);
  }

  return [...segments].map(normalize).filter(Boolean);
}

function scoreCandidate(text, index, title) {
  const actions = new Set((text.match(CORE_ACTIVITY) || []).map(item => item.toLowerCase())).size;
  let score = actions * 12;
  if (PARTICIPATION.test(text)) score += 8;
  if (OVERVIEW.test(text)) score += 8;
  if (text.length >= 45 && text.length <= 260) score += 8;
  if (text.length > 360) score -= 12;
  if (SECONDARY.test(text)) score -= 18;

  const lower = text.toLowerCase();
  const matchedTitleTokens = titleTokens(title).filter(token => lower.includes(token)).length;
  score += Math.min(matchedTitleTokens * 3, 9);
  score -= index * 0.75;
  return score;
}

export function repairEventSummary(event) {
  if (!event || event.summaryStatus !== 'extractive') return { event, changed: false, issues: [] };

  const issues = semanticSummaryIssues(event);
  if (!issues.length) return { event, changed: false, issues };

  const source = normalize(event.sourceDescriptionRaw);
  if (!source) return { event, changed: false, issues };

  const options = { title: event.title || '', format: event.format || '' };
  const candidates = candidateSegments(source, event.title || '')
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => text !== normalize(event.parentSummary || event.description))
    .filter(({ text }) => text.length <= 520)
    .filter(({ text }) => source.includes(text))
    .filter(({ text }) => isSummaryAcceptable(text, options))
    .filter(({ text }) => semanticSummaryIssues({ ...event, description: text, parentSummary: text }).length === 0)
    .map(item => ({ ...item, score: scoreCandidate(item.text, item.index, event.title || '') }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = candidates[0]?.text || '';
  if (!selected) return { event, changed: false, issues };

  return {
    changed: true,
    issues,
    event: {
      ...event,
      description: selected,
      parentSummary: selected,
      summaryEvidence: selected,
      summaryMethod: 'quality_repair',
      summaryQuality: 'strong',
      summaryQualityRepairVersion: 'summary-quality-repair-v1'
    }
  };
}

export function repairEventSummaries(events) {
  let changed = 0;
  const repaired = [];
  const unresolved = [];
  const output = (Array.isArray(events) ? events : []).map((event) => {
    const result = repairEventSummary(event);
    if (result.changed) {
      changed += 1;
      repaired.push({ id: event.id, title: event.title, issues: result.issues, summary: result.event.parentSummary });
    } else if (result.issues.length) {
      unresolved.push({ id: event.id, title: event.title, issues: result.issues, summary: event.parentSummary || event.description });
    }
    return result.event;
  });
  return { events: output, changed, repaired, unresolved };
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const result = repairEventSummaries(events);
  if (result.changed) {
    await writeFile(eventsUrl, `${JSON.stringify(result.events, null, 2)}\n`);
  }
  console.log(`summary-quality repair: ${result.changed} repaired, ${result.unresolved.length} unresolved`);
  if (result.repaired.length) console.log('SUMMARY_QUALITY_REPAIRED=' + JSON.stringify(result.repaired));
  if (result.unresolved.length) console.warn('SUMMARY_QUALITY_UNRESOLVED=' + JSON.stringify(result.unresolved));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}

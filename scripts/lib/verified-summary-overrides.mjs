import { createHash } from 'node:crypto';
import { EVENT_SUMMARY_VERSION, assessSummaryReadability } from '../event-summary-engine.mjs';
import { auditChineseTranslation, translationFingerprint } from '../event-translations.mjs';

function titleKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateKey(value) {
  return String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

// Source-owned, title-and-first-date scoped editorial summaries are applied
// AFTER the daily scrape and summary-quality repair but BEFORE publishing.
// They stay independent of the extractive engine, which never rewrites text.
export function applyVerifiedSummaryOverrides(events, sources) {
  const output = (events || []).map(event => ({ ...event }));
  let applied = 0;
  for (const source of sources || []) {
    for (const item of source.verifiedSummaryOverrides || []) {
      if (!item.title || !item.date || !item.description || !item.sourceText
        || !Array.isArray(item.sourceUrls) || !item.sourceUrls.length || !item.verifiedAt) {
        throw new Error(`Incomplete verified summary override for ${source.name || 'unknown source'}: ${item.title || 'untitled'}`);
      }
      const readability = assessSummaryReadability(item.description);
      if (!readability.ok) {
        throw new Error(`Unpublishable verified summary for ${item.title}: ${readability.issues.join(', ')}`);
      }
      for (const event of output) {
        if (event.source !== source.name
          || titleKey(event.title) !== titleKey(item.title)
          || dateKey(event.dateValue) !== dateKey(item.date)) continue;

        const raw = String(item.sourceText).replace(/\s+/g, ' ').trim();
        event.description = item.description;
        event.parentSummary = item.description;
        event.sourceDescriptionRaw = raw;
        event.sourceDescriptionHash = createHash('sha256').update(raw).digest('hex');
        event.summaryStatus = 'manual_verified';
        event.summaryMethod = 'source_verified_editorial';
        event.summaryQuality = 'manual_verified';
        event.summaryEvidence = raw;
        event.summaryEvidenceData = {
          kind: 'verified-editorial',
          sourceUrls: item.sourceUrls
        };
        event.summaryVersion = EVENT_SUMMARY_VERSION;
        event.summaryVerifiedAt = item.verifiedAt;

        if (item.zh) {
          const fingerprint = translationFingerprint(event);
          const candidate = { title: item.zh.title, description: item.zh.description };
          const audit = auditChineseTranslation(event, candidate);
          if (!audit.ok) {
            throw new Error(`Verified Chinese summary failed audit for ${item.title}: ${audit.issues.join(', ')}`);
          }
          event.translations = {
            ...(event.translations || {}),
            zh: {
              ...candidate,
              fingerprint,
              translatedAt: item.verifiedAt,
              translationSource: 'official-evidence-editorial-reviewed',
              status: 'approved'
            }
          };
          event.translationStatus = 'current';
          delete event.translationSourceFingerprint;
        }
        applied += 1;
      }
    }
  }
  return { events: output, applied };
}

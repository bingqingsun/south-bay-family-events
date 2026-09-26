import { createHash } from 'node:crypto';

export function translationFingerprint(event) {
  return createHash('sha256')
    .update(String(event?.title || '') + '\n' + String(event?.description || ''))
    .digest('hex');
}

function normalizedNumbers(text) {
  return [...String(text || '').matchAll(/(?:[$€£¥]\s*)?\d+(?:[.,]\d+)?%?/g)]
    .map(match => match[0].replace(/\s+/g, '').replace(/,/g, ''))
    .sort();
}

function unsupportedClaimIssues(source, translated) {
  const issues = [];
  const sourceText = String(source || '').toLowerCase();
  const zh = String(translated || '');

  const claims = [
    {
      target: /免费/,
      source: /\bfree\b|\bno\s+(?:cost|charge|fee)\b|complimentary/,
      label: 'free'
    },
    {
      target: /(?:所有|全部|全年龄|不限)年龄|适合各年龄/,
      source: /\ball[-\s]?ages?\b|\bfor all ages\b/,
      label: 'all-ages'
    },
    {
      target: /(?:无需|不需要|不用)报名/,
      source: /\bno registration (?:is )?required\b|\bregistration (?:is )?not required\b/,
      label: 'no-registration'
    }
  ];

  claims.forEach(rule => {
    if (rule.target.test(zh) && !rule.source.test(sourceText)) {
      issues.push(`unsupported-claim:${rule.label}`);
    }
  });
  return issues;
}

export function auditChineseTranslation(event, entry) {
  const issues = [];
  const title = String(entry?.title || '').trim();
  const description = String(entry?.description || '').trim();
  if (!title) issues.push('missing-title');
  if (String(event?.description || '').trim() && !description) issues.push('missing-description');

  const sourceFacts = normalizedNumbers(`${event?.title || ''} ${event?.description || ''}`);
  const translatedFacts = normalizedNumbers(`${title} ${description}`);
  if (JSON.stringify(sourceFacts) !== JSON.stringify(translatedFacts)) {
    issues.push(`numeric-facts-changed:${sourceFacts.join(',')}=>${translatedFacts.join(',')}`);
  }

  issues.push(...unsupportedClaimIssues(
    `${event?.title || ''} ${event?.description || ''}`,
    `${title} ${description}`
  ));

  return { ok: issues.length === 0, issues };
}

function buildCatalogIndexes(catalog) {
  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const byId = new Map();
  const duplicates = [];

  entries.forEach(entry => {
    if (entry?.id) {
      if (byId.has(entry.id)) duplicates.push(`id:${entry.id}`);
      byId.set(entry.id, entry);
    }
  });
  return { entries, byId, duplicates };
}

export function applyChineseTranslationCatalog(items, catalog, { generatedAt = new Date().toISOString(), strict = true } = {}) {
  const { entries, byId, duplicates } = buildCatalogIndexes(catalog);
  if (duplicates.length && strict) throw new Error(`Duplicate translation catalog keys: ${duplicates.join(', ')}`);

  const stats = { catalog: entries.length, current: 0, stale: 0, invalid: 0, missing: 0 };
  const problems = [];

  for (const event of items || []) {
    // Event ID is the only publish-time identity key. Organizer URLs are not
    // unique enough for reuse: sports schedules and recurring series commonly
    // share one landing URL across many distinct events.
    const entry = event?.id ? byId.get(event.id) : null;
    if (!entry || entry.status !== 'approved') {
      event.translationStatus = entry?.status || 'missing';
      stats.missing += 1;
      continue;
    }

    const fingerprint = translationFingerprint(event);
    if (entry.sourceFingerprint !== fingerprint) {
      event.translationStatus = 'stale';
      event.translationSourceFingerprint = fingerprint;
      stats.stale += 1;
      continue;
    }

    const audit = auditChineseTranslation(event, entry);
    if (!audit.ok) {
      event.translationStatus = 'invalid';
      stats.invalid += 1;
      problems.push({ id: event.id, title: event.title, issues: audit.issues });
      continue;
    }

    event.translations = {
      ...(event.translations || {}),
      zh: {
        title: String(entry.title).trim(),
        description: String(entry.description || '').trim(),
        fingerprint,
        translatedAt: entry.reviewedAt || generatedAt,
        translationSource: entry.translationSource || 'reviewed-sidecar',
        status: 'approved'
      }
    };
    event.translationStatus = 'current';
    stats.current += 1;
  }

  if (problems.length && strict) {
    throw new Error(`Chinese translation QA failed: ${JSON.stringify(problems.slice(0, 20))}`);
  }
  return { stats, problems, duplicates };
}

export function auditTranslationCatalog(items, catalog) {
  const cloned = (items || []).map(item => ({ ...item }));
  return applyChineseTranslationCatalog(cloned, catalog, { strict: false });
}

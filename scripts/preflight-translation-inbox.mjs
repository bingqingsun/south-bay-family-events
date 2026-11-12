import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateInbox } from './merge-translation-inbox.mjs';
import { auditChineseTranslation, auditTranslationCatalog, translationFingerprint } from './event-translations.mjs';
import { isActiveForTranslation, pacificDate } from './build-translation-gaps.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';

const dataDir = new URL('../data/', import.meta.url);
const gapDir = new URL('translation-gaps/', dataDir);

function fail(issues) {
  if (issues.length) {
    throw new Error('Translation inbox preflight rejected ' + issues.length + ' issue(s):\n' +
      issues.slice(0, 20).join('\n') + (issues.length > 20 ? '\n...and more' : ''));
  }
}

export function validateTranslationInboxPreflight({
  inbox = null, manifest, batches, events, catalog,
  today = pacificDate(), catalogOnly = false
}) {
  const issues = [];
  if (!manifest || manifest.version !== 1 || manifest.locale !== 'zh-Hans') {
    throw new Error('Translation gap snapshot has an invalid manifest version or locale.');
  }
  if (!Array.isArray(events) || !Array.isArray(batches) || !Array.isArray(manifest.batches)) {
    throw new Error('Translation gap snapshot or canonical events are malformed.');
  }
  if (!manifest.generatedAt || !manifest.generatedForDate || !manifest.stats) {
    throw new Error('Translation gap manifest has missing generation metadata or statistics.');
  }

  const gaps = [];
  const seenGaps = new Set();
  if (manifest.batches.length !== batches.length) {
    issues.push('snapshot: expected ' + manifest.batches.length + ' batches; received ' + batches.length);
  }

  for (let i = 0; i < manifest.batches.length; i += 1) {
    const declared = manifest.batches[i];
    const batch = batches[i];
    if (!declared || !/^batch-\d{3}\.json$/.test(declared.file || '')) {
      issues.push('snapshot: invalid batch filename at index ' + i);
    }
    if (!batch || !Array.isArray(batch.entries)) {
      issues.push('snapshot: ' + (declared?.file || i) + ' is missing or malformed');
      continue;
    }
    if (batch.version !== 1 || batch.locale !== 'zh-Hans' ||
        batch.generatedAt !== manifest.generatedAt ||
        batch.generatedForDate !== manifest.generatedForDate ||
        batch.batch !== i + 1 || batch.totalBatches !== manifest.batches.length) {
      issues.push('snapshot: ' + declared.file + ' has inconsistent metadata');
    }
    if (batch.entries.length !== declared.count) {
      issues.push('snapshot: ' + declared.file + ' contains ' + batch.entries.length + ' entries, expected ' + declared.count);
    }
    for (const entry of batch.entries) {
      if (!entry?.id || seenGaps.has(entry.id)) {
        issues.push('snapshot: missing or duplicate id ' + entry?.id);
        continue;
      }
      seenGaps.add(entry.id);
      if (!['missing', 'stale', 'invalid'].includes(entry.status)) {
        issues.push('snapshot: ' + entry.id + ' has invalid status ' + entry.status);
      }
      if (entry.sourceFingerprint !== translationFingerprint(entry)) {
        issues.push('snapshot: ' + entry.id + ' has a source fingerprint inconsistent with its English text');
      }
      gaps.push(entry);
    }
  }

  const counts = {
    missing: gaps.filter(e => e.status === 'missing').length,
    stale: gaps.filter(e => e.status === 'stale').length,
    invalid: gaps.filter(e => e.status === 'invalid').length
  };
  if (manifest.stats.gaps !== gaps.length || manifest.stats.gaps !== counts.missing + counts.stale + counts.invalid ||
      manifest.stats.missing !== counts.missing || manifest.stats.stale !== counts.stale ||
      manifest.stats.invalid !== counts.invalid) {
    issues.push('snapshot: manifest counts do not match batches (' + JSON.stringify(counts) + ', total ' + gaps.length + ')');
  }
  if (manifest.sourceEventCount !== events.length) {
    issues.push('snapshot: canonical event count changed (' + manifest.sourceEventCount + ' -> ' + events.length + ')');
  }

  const active = events.filter(e => isActiveForTranslation(e, today));
  if (manifest.activeEventCount !== active.length) {
    issues.push('snapshot: active event count changed (' + manifest.activeEventCount + ' -> ' + active.length + '); refresh snapshot');
  }

  const eventById = new Map();
  for (const event of active) {
    if (!event?.id || eventById.has(event.id)) {
      issues.push('canonical: duplicate or missing event ID ' + event?.id);
      continue;
    }
    eventById.set(event.id, event);
  }
  for (const gap of gaps) {
    const canonical = eventById.get(gap.id);
    if (!canonical || translationFingerprint(canonical) !== gap.sourceFingerprint) {
      issues.push('snapshot: ' + gap.id + ' no longer matches the latest active canonical event; regenerate snapshot');
    }
  }
  fail(issues);

  if (!catalogOnly) {
    const incoming = validateInbox(inbox);
    if (!inbox?.submittedAt || Number.isNaN(Date.parse(inbox.submittedAt))) {
      issues.push('inbox: submittedAt must be a valid ISO timestamp');
    }
    const gapById = new Map(gaps.map(e => [e.id, e]));
    const receivedIds = new Set(incoming.map(e => e.id));
    for (const gap of gaps) {
      if (!receivedIds.has(gap.id)) issues.push('inbox: missing current gap ' + gap.id);
    }
    for (const entry of incoming) {
      const gap = gapById.get(entry.id);
      if (!gap) {
        issues.push('inbox: unexpected id ' + entry.id + '; submit the complete latest snapshot only');
        continue;
      }
      if (entry.sourceFingerprint !== gap.sourceFingerprint) {
        issues.push('inbox: ' + entry.id + ' has an outdated sourceFingerprint');
        continue;
      }
      if (entry.sourceUrl && entry.sourceUrl !== gap.sourceUrl) {
        issues.push('inbox: ' + entry.id + ' changed sourceUrl');
      }
      const canonical = eventById.get(entry.id);
      if (canonical) {
        const qa = auditChineseTranslation(canonical, entry);
        if (!qa.ok) issues.push('inbox QA: ' + entry.id + ': ' + qa.issues.join(', '));
      }
    }
    if (incoming.length !== gaps.length) {
      issues.push('inbox: expected ' + gaps.length + ' reviewed translations, received ' + incoming.length);
    }
    fail(issues);
  }

  const audit = auditTranslationCatalog(active, catalog);
  if (audit.duplicates.length || audit.problems.length ||
      audit.stats.missing || audit.stats.stale || audit.stats.invalid) {
    issues.push('coverage: current=' + audit.stats.current + ', missing=' + audit.stats.missing +
      ', stale=' + audit.stats.stale + ', invalid=' + audit.stats.invalid);
    for (const item of audit.problems.slice(0, 15)) {
      issues.push('catalog QA: ' + item.id + ': ' + item.issues.join(', '));
    }
    for (const duplicate of audit.duplicates.slice(0, 5)) {
      issues.push('catalog: duplicate ' + duplicate);
    }
  }
  fail(issues);

  return {
    active: active.length,
    submitted: catalogOnly ? null : inbox.entries.length,
    snapshotGaps: gaps.length,
    stats: audit.stats,
    generatedAt: manifest.generatedAt,
    generatedForDate: manifest.generatedForDate
  };
}

async function main() {
  const catalogOnly = process.argv.includes('--catalog-only');
  const inboxPath = process.argv.find(arg => arg !== process.argv[0] &&
    arg !== process.argv[1] && arg !== '--catalog-only') || new URL('translation-inbox.json', dataDir);

  const manifest = JSON.parse(await readFile(new URL('manifest.json', gapDir), 'utf8'));
  const batches = await Promise.all((manifest.batches || []).map(async batch =>
    JSON.parse(await readFile(new URL(batch.file, gapDir), 'utf8'))
  ));
  const events = JSON.parse(await readFile(new URL('events.json', dataDir), 'utf8'));
  const catalog = await loadChineseTranslationCatalogs();
  const inbox = catalogOnly ? null : JSON.parse(await readFile(inboxPath, 'utf8'));
  const result = validateTranslationInboxPreflight({ inbox, manifest, batches, events, catalog, catalogOnly });
  console.log('translation inbox preflight passed: ' + JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('::error::Translation inbox preflight failed: ' + error.message);
    process.exitCode = 1;
  });
}

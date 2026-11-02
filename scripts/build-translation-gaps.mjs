import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { applyChineseTranslationCatalog, translationFingerprint } from './event-translations.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';

const DEFAULT_BATCH_SIZE = 40;
const eventsUrl = new URL('../data/events.json', import.meta.url);
const outputDirUrl = new URL('../data/translation-gaps/', import.meta.url);

export function pacificDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function isActiveForTranslation(event, today) {
  const end = String(event?.endDateValue || event?.dateValue || '').slice(0, 10);
  return !end || end >= today;
}

function priorApprovedTranslation(event, catalog) {
  const ids = [event?.id, ...(Array.isArray(event?.legacyIds) ? event.legacyIds : [])].filter(Boolean);
  const candidates = ids.flatMap(id => {
    const variants = catalog?.variantsById instanceof Map ? catalog.variantsById.get(id) || [] : [];
    if (variants.length) return variants;
    return (catalog?.entries || []).filter(entry => entry?.id === id);
  });
  return candidates
    .filter(entry => entry?.status === 'approved')
    .sort((a, b) => Date.parse(b.reviewedAt || b.generatedAt || 0) - Date.parse(a.reviewedAt || a.generatedAt || 0))[0] || null;
}

export function buildTranslationGapSnapshot({
  events,
  catalog,
  today = pacificDate(),
  generatedAt = new Date().toISOString(),
  batchSize = DEFAULT_BATCH_SIZE
}) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('batchSize must be a positive integer');

  const active = events.filter(event => isActiveForTranslation(event, today));
  const audited = active.map(event => ({ ...event }));
  const { stats, problems, duplicates } = applyChineseTranslationCatalog(audited, catalog, { strict: false });
  if (duplicates.length || problems.length) {
    throw new Error(`Cannot publish translation gaps with catalog QA errors: ${JSON.stringify({ duplicates, problems: problems.slice(0, 20) })}`);
  }

  const entries = active.map((event, index) => ({
    event,
    status: audited[index]?.translationStatus || 'missing'
  }))
    .filter(item => item.status !== 'current')
    .sort((a, b) =>
      String(a.event.dateValue || '').localeCompare(String(b.event.dateValue || '')) ||
      String(a.event.title || '').localeCompare(String(b.event.title || ''))
    )
    .map(({ event, status }) => {
      const prior = status === 'missing' ? null : priorApprovedTranslation(event, catalog);
      return {
        id: event.id,
        dateValue: event.dateValue || '',
        endDateValue: event.endDateValue || '',
        title: event.title || '',
        description: event.description || '',
        source: event.source || '',
        sourceUrl: event.url || '',
        status,
        sourceFingerprint: translationFingerprint(event),
        priorTitleZh: prior?.title || '',
        priorDescriptionZh: prior?.description || ''
      };
    });

  const batches = [];
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const number = Math.floor(offset / batchSize) + 1;
    batches.push({
      file: `batch-${String(number).padStart(3, '0')}.json`,
      entries: entries.slice(offset, offset + batchSize)
    });
  }

  const manifest = {
    version: 1,
    locale: 'zh-Hans',
    generatedAt,
    generatedForDate: today,
    sourceEventCount: events.length,
    activeEventCount: active.length,
    stats: {
      current: stats.current,
      gaps: entries.length,
      missing: stats.missing,
      stale: stats.stale,
      invalid: stats.invalid
    },
    batches: batches.map(batch => ({ file: batch.file, count: batch.entries.length }))
  };

  return {
    manifest,
    batches: batches.map((batch, index) => ({
      file: batch.file,
      data: {
        version: 1,
        locale: 'zh-Hans',
        generatedAt,
        generatedForDate: today,
        batch: index + 1,
        totalBatches: batches.length,
        entries: batch.entries
      }
    }))
  };
}

export async function writeTranslationGapSnapshot(snapshot, outputDir = outputDirUrl) {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await writeFile(new URL('manifest.json', outputDir), `${JSON.stringify(snapshot.manifest, null, 2)}\n`, 'utf8');
  await Promise.all(snapshot.batches.map(batch =>
    writeFile(new URL(batch.file, outputDir), `${JSON.stringify(batch.data, null, 2)}\n`, 'utf8')
  ));
}

async function main() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const catalog = await loadChineseTranslationCatalogs();
  const snapshot = buildTranslationGapSnapshot({ events, catalog });
  await writeTranslationGapSnapshot(snapshot);
  console.log(`Translation gap snapshot: ${JSON.stringify(snapshot.manifest)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

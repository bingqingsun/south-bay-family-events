import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { EVENT_SUMMARY_VERSION } from './event-summary-engine.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const supplementsUrl = new URL('../data/event-supplements.json', import.meta.url);
const sourcesUrl = new URL('../data/sources.json', import.meta.url);

const CATEGORY_META = Object.freeze({
  shows: { icon: '🎭', color: '#f0def2', tag: '演出与表演' },
  learning: { icon: '🔭', color: '#dce7fa', tag: '学习与 STEM' },
  community: { icon: '🤝', color: '#dceeea', tag: '社区与家庭' }
});

function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateKey(value) {
  return String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}

function canonicalCost(item) {
  const label = String(item.costLabel || '').trim();
  const explicitStatus = String(item.costStatus || '').trim();
  const allowed = new Set(['unknown', 'free', 'paid', 'donation', 'variable']);
  let status = allowed.has(explicitStatus) ? explicitStatus : '';

  if (!status) {
    if (!label || label === '费用未注明') status = 'unknown';
    else if (label === '免费') status = 'free';
    else if (label === '建议捐赠') status = 'donation';
    else if (label === '会员／非会员价格见详情') status = 'variable';
    else if (label === '需付费／价格见详情' || /^\$\s*\d/.test(label) || /\$\s*\d/.test(label)) status = 'paid';
    else status = 'unknown';
  }

  const resolvedLabel = label || (status === 'unknown' ? '费用未注明' : '');
  const source = status === 'unknown'
    ? ''
    : String(item.costSource || 'Official organizer or ticketing source').trim();
  const evidence = status === 'unknown' ? '' : String(item.costEvidence || '').trim();

  return { costStatus: status, costLabel: resolvedLabel, costSource: source, costEvidence: evidence };
}

function canonicalRegistration(item, fallback = {}) {
  const allowed = new Set(['unknown', 'required', 'recommended', 'not-required', 'walk-in', 'full']);
  const requested = String(item.registrationStatus || fallback.registrationStatus || '').trim();
  const status = allowed.has(requested) ? requested : 'unknown';
  const source = status === 'unknown'
    ? ''
    : String(item.registrationSource || fallback.registrationSource || '').trim();
  const evidence = status === 'unknown'
    ? ''
    : String(item.registrationEvidence || fallback.registrationEvidence || '').trim();
  return { registrationStatus: status, registrationSource: source, registrationEvidence: evidence };
}

function canonicalSupplement(item) {
  const raw = String(item.sourceDescriptionRaw || item.description || '').replace(/\s+/g, ' ').trim();
  const description = String(item.description || '').replace(/\s+/g, ' ').trim();
  const type = item.type || 'community';
  const meta = CATEGORY_META[type] || CATEGORY_META.community;
  const verifiedAt = item.verifiedAt || new Date().toISOString();
  const cost = canonicalCost(item);
  const registration = canonicalRegistration(item);
  return {
    id: item.id,
    title: item.title,
    dateValue: item.dateValue,
    endDateValue: item.endDateValue || '',
    time: '',
    description,
    parentSummary: description,
    sourceDescriptionRaw: raw,
    sourceDescriptionHash: createHash('sha256').update(raw).digest('hex'),
    summaryStatus: 'manual_verified',
    summaryVersion: EVENT_SUMMARY_VERSION,
    summaryVerifiedAt: verifiedAt,
    summaryMethod: 'manual_verified',
    summaryQuality: 'manual_verified',
    summaryEvidence: raw,
    image: item.image || '',
    place: item.place || '',
    address: item.address || '',
    city: item.city || '',
    source: item.source || '',
    url: item.url || '',
    ageMin: Number.isFinite(item.ageMin) ? item.ageMin : null,
    ageMax: Number.isFinite(item.ageMax) ? item.ageMax : null,
    ageLabel: item.ageLabel || '',
    ageSource: item.ageSource || '',
    audienceStatus: item.ageSource ? 'organizer-confirmed' : 'not-confirmed',
    ...cost,
    ...registration,
    type,
    icon: meta.icon,
    color: meta.color,
    tag: meta.tag,
    format: item.format || 'program',
    seasonalTheme: item.seasonalTheme || '',
    sessions: Array.isArray(item.sessions) ? item.sessions : [],
    verification: 'manual-verified',
    refreshStatus: 'verified-supplement',
    linkSource: 'manual_verified'
  };
}

function mergeVerifiedReplacement(existing, supplement) {
  const verified = canonicalSupplement({ ...supplement, id: existing.id || supplement.id });
  const registration = canonicalRegistration(supplement, existing);
  return {
    ...existing,
    ...verified,
    ...registration,
    id: existing.id || supplement.id,
    legacyIds: [...new Set([...(existing.legacyIds || []), supplement.id].filter(Boolean))],
    // Preserve canonical recurrence/session timing gathered by the live source
    // when replacing a recurring event whose supplement verification date may
    // refer to a different occurrence of the same official series.
    dateValue: existing.dateValue || verified.dateValue,
    endDateValue: existing.endDateValue || verified.endDateValue,
    sessions: Array.isArray(existing.sessions) && existing.sessions.length ? existing.sessions : verified.sessions,
    image: supplement.image || existing.image || '',
    imagePresentation: existing.imagePresentation || '',
    imageBackground: existing.imageBackground || ''
  };
}


export function applyCuratedImageOverrides(events, sources) {
  const output = Array.isArray(events) ? events.map((event) => ({ ...event })) : [];
  let applied = 0;

  for (const source of sources || []) {
    for (const item of source.events || []) {
      if (!item?.image || !item?.imageOverride) continue;
      const targetTitle = normalizeTitle(item.title);
      const targetDate = dateKey(item.dateValue);
      const targetSource = String(source.name || '').trim();

      for (let index = 0; index < output.length; index += 1) {
        const event = output[index];
        if (normalizeTitle(event.title) !== targetTitle) continue;
        if (targetDate && dateKey(event.dateValue) !== targetDate) continue;
        if (targetSource && String(event.source || '').trim() !== targetSource) continue;

        const override = typeof item.imageOverride === 'object' ? item.imageOverride : {};
        output[index] = {
          ...event,
          image: item.image,
          imageStatus: 'official',
          imageFailureReason: '',
          imageProvenance: {
            source: 'curated-manual',
            method: 'manual_verified',
            sourceUrl: override.sourceUrl || source.feedUrl || event.url || '',
            verifiedAt: override.verifiedAt || new Date().toISOString(),
            score: 100,
            evidence: override.evidence || 'first-party-curated-official-image'
          }
        };
        applied += 1;
      }
    }
  }

  return { events: output, applied };
}

export function mergeEventSupplements(events, supplements) {
  const output = Array.isArray(events) ? events.map((event) => ({ ...event })) : [];
  for (const item of supplements || []) {
    if (!item?.id || !item?.title || !item?.dateValue || !item?.url) continue;
    const targetTitle = normalizeTitle(item.title);
    const targetDate = dateKey(item.dateValue);
    const existingIndex = output.findIndex((event) => {
      const sameTitleAndDate = normalizeTitle(event.title) === targetTitle && dateKey(event.dateValue) === targetDate;
      const sameUrlAndDate = event.url === item.url && dateKey(event.dateValue) === targetDate;
      const sameVerifiedCanonicalUrl = item.replaceExisting === true && event.url === item.url;
      return sameTitleAndDate || sameUrlAndDate || sameVerifiedCanonicalUrl;
    });
    if (existingIndex >= 0) {
      const existing = output[existingIndex];
      if (item.replaceExisting === true) {
        output[existingIndex] = mergeVerifiedReplacement(existing, item);
      } else {
        const legacyIds = new Set([...(existing.legacyIds || []), item.id]);
        existing.legacyIds = [...legacyIds];
      }
      continue;
    }
    output.push(canonicalSupplement(item));
  }
  output.sort((a, b) => String(a.dateValue || '').localeCompare(String(b.dateValue || '')) || String(a.title || '').localeCompare(String(b.title || '')));
  return output;
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const supplements = JSON.parse(await readFile(supplementsUrl, 'utf8'));
  const sources = JSON.parse(await readFile(sourcesUrl, 'utf8'));
  const merged = mergeEventSupplements(events, supplements);
  const overridden = applyCuratedImageOverrides(merged, sources);
  await writeFile(eventsUrl, `${JSON.stringify(overridden.events, null, 2)}\n`);
  console.log(`Applied ${supplements.length} verified event supplement(s); canonical count ${events.length} -> ${overridden.events.length}`);
  console.log(`Applied ${overridden.applied} curated official image override(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}

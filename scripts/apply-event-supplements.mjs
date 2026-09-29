import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const supplementsUrl = new URL('../data/event-supplements.json', import.meta.url);

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

function canonicalSupplement(item) {
  const raw = String(item.sourceDescriptionRaw || item.description || '').replace(/\s+/g, ' ').trim();
  const description = String(item.description || '').replace(/\s+/g, ' ').trim();
  const type = item.type || 'community';
  const meta = CATEGORY_META[type] || CATEGORY_META.community;
  const verifiedAt = item.verifiedAt || new Date().toISOString();
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
    summaryVersion: 'event-summary-v2-p4',
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
    costLabel: item.costLabel || '费用未注明',
    costSource: item.costLabel ? 'Official organizer or ticketing source' : '',
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
  return {
    ...existing,
    ...verified,
    id: existing.id || supplement.id,
    legacyIds: [...new Set([...(existing.legacyIds || []), supplement.id].filter(Boolean))],
    sessions: Array.isArray(existing.sessions) && existing.sessions.length ? existing.sessions : verified.sessions,
    image: supplement.image || existing.image || '',
    imagePresentation: existing.imagePresentation || '',
    imageBackground: existing.imageBackground || ''
  };
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
      return sameTitleAndDate || sameUrlAndDate;
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
  const merged = mergeEventSupplements(events, supplements);
  await writeFile(eventsUrl, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Applied ${supplements.length} verified event supplement(s); canonical count ${events.length} -> ${merged.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}

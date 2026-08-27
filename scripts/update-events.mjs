/*
 * Daily South Bay family-event refresh.
 * Requires SERPAPI_KEY in the environment. Uses SerpApi's standard Google
 * search engine so the job also works on plans without Google Events access.
 */
import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.SERPAPI_KEY;
if (!key) throw new Error('SERPAPI_KEY is required to refresh events.');

const queries = [
  'South Bay California family events this weekend',
  'Palo Alto kids activities this weekend',
  'San Jose family events this weekend'
];

const typeFor = text => /hike|nature|park|outdoor|garden/i.test(text) ? 'outdoor'
  : /art|craft|paint|music|theater|museum/i.test(text) ? 'arts'
  : /science|stem|robot|tech|library|learn/i.test(text) ? 'learning' : 'community';
const labels = { outdoor: '户外自然', arts: '艺术创作', learning: '科学与学习', community: '社区活动' };
const icons = { outdoor: '🌿', arts: '🎨', learning: '🔭', community: '✨' };
const colors = { outdoor: '#d8eee0', arts: '#ffd9bd', learning: '#dce7fa', community: '#ffe9a8' };
const fallbackTime = '请点击活动详情查看活动时间';

const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Returns date + time when available, then date-only, never a guessed date.
function displayEventDate(value) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (iso) return `${Number(iso[2])}月${Number(iso[3])}日${iso[4] ? ` ${iso[4]}:${iso[5]}` : ''}`;

  const natural = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+\d{4})?/i);
  if (!natural) return null;
  const month = months[natural[1].slice(0, 3).toLowerCase()];
  const date = `${month}月${Number(natural[2])}日`;
  const time = text.match(/(?:\bat\b|@|·)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.)?)/i)?.[1]
    || text.match(/\b(\d{1,2}:\d{2})\b/)?.[1];
  return `${date}${time ? ` ${time.toUpperCase().replace(/\./g, '')}` : ''}`;
}

function eventNodes(value) {
  if (Array.isArray(value)) return value.flatMap(eventNodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...eventNodes(value['@graph'])];
}

async function displayTime(item) {
  const direct = [item.date?.start_date, item.date?.when, item.start_date, item.rich_snippet?.top?.detected_extensions?.date]
    .map(displayEventDate).find(Boolean);
  if (direct) return direct;
  // Publisher-provided Event metadata is preferred over search-result snippets.
  try {
    const response = await fetch(item.link, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return fallbackTime;
    const html = await response.text();
    const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const block of blocks) {
      try {
        const schema = JSON.parse(block[1].trim());
        const event = eventNodes(schema).find(node => {
          const type = node['@type'];
          return type === 'Event' || (Array.isArray(type) && type.includes('Event'));
        });
        const date = displayEventDate(event?.startDate);
        if (date) return date;
      } catch { /* Ignore malformed metadata and try the next source. */ }
    }
  } catch { /* A source may block automated reads; link users to its details page. */ }
  return fallbackTime;
}

async function search(query) {
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google', q: query, api_key: key, hl: 'en', gl: 'us', location: 'Santa Clara, California, United States' });
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`Search failed: ${response.status}${payload.error ? ` — ${payload.error}` : ''}`);
  }
  return payload.organic_results || [];
}

const target = new URL('../data/events.json', import.meta.url);
const currentEvents = JSON.parse(await readFile(target, 'utf8'));
const attempts = await Promise.allSettled(queries.map(search));
const failures = attempts.filter(result => result.status === 'rejected');
failures.forEach(result => console.warn(`Skipping one search: ${result.reason.message}`));
const raw = attempts.flatMap(result => result.status === 'fulfilled' ? result.value : []);
if (!raw.length) throw new Error('All event searches failed; leaving the published list unchanged.');
const unique = [...new Map(raw.filter(item => item.title && item.link).map(item => [item.link.toLowerCase(), item])).values()];
const candidates = await Promise.all(unique.slice(0, 18).map(async (item, index) => {
  const source = `${item.title} ${item.snippet || item.description || ''}`;
  const type = typeFor(source);
  return {
    id: `daily-${Date.now()}-${index}`, title: item.title, date: await displayTime(item),
    when: 'weekend', age: 'all', type, icon: icons[type], color: colors[type], tag: labels[type],
    description: item.snippet || '请查看主办方页面了解活动详情与报名要求。',
    place: item.source || '南湾地区', url: item.link
  };
}));
// Do not publish unverified directory pages or search snippets. A card must
// carry a direct search date or publisher-provided Event startDate.
const events = candidates.filter(event => event.date !== fallbackTime);

await writeFile(target, `${JSON.stringify(events, null, 2)}\n`);
console.log(`Published ${events.length} verified activities; skipped ${candidates.length - events.length} unverified results.`);

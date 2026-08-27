/*
 * Daily South Bay family-event refresh.
 * Requires SERPAPI_KEY in the environment. SerpApi's Google Events endpoint
 * returns public event listings; the site always links visitors to the source.
 */
import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.SERPAPI_KEY;
if (!key) throw new Error('SERPAPI_KEY is required to refresh events.');

const queries = [
  'kids family events South Bay California this weekend',
  'children activities Palo Alto Mountain View San Jose this weekend',
  'family events Santa Clara County this weekend',
  'Foothill College Physics Show upcoming dates'
];

const typeFor = text => /hike|nature|park|outdoor|garden/i.test(text) ? 'outdoor'
  : /art|craft|paint|music|theater|museum/i.test(text) ? 'arts'
  : /science|stem|robot|tech|library|learn/i.test(text) ? 'learning' : 'community';
const labels = { outdoor: '户外自然', arts: '艺术创作', learning: '科学与学习', community: '社区活动' };
const icons = { outdoor: '🌿', arts: '🎨', learning: '🔭', community: '✨' };
const colors = { outdoor: '#d8eee0', arts: '#ffd9bd', learning: '#dce7fa', community: '#ffe9a8' };

async function search(query) {
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google_events', q: query, api_key: key, hl: 'en', gl: 'us' });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  return (await response.json()).events_results || [];
}

const raw = (await Promise.all(queries.map(search))).flat();
const unique = [...new Map(raw.filter(item => item.title && item.link).map(item => [`${item.title}|${item.date?.start_date || ''}`.toLowerCase(), item])).values()];
const events = unique.slice(0, 18).map((item, index) => {
  const source = `${item.title} ${item.description || ''}`;
  const type = typeFor(source);
  const date = [item.date?.start_date, item.date?.when].filter(Boolean).join(' · ') || '请查看主办方时间';
  return {
    id: `daily-${Date.now()}-${index}`, title: item.title, date,
    when: /today/i.test(date) ? 'today' : 'weekend', age: 'all', type, icon: icons[type], color: colors[type], tag: labels[type],
    description: item.description || '请查看主办方页面了解活动详情与报名要求。',
    place: item.venue?.name || item.address?.join(', ') || '南湾地区', url: item.link
  };
});

if (events.length < 3) throw new Error('Too few event results; leaving the published list unchanged.');
await readFile(new URL('../data/events.json', import.meta.url)); // ensure target exists before overwriting
await writeFile(new URL('../data/events.json', import.meta.url), `${JSON.stringify(events, null, 2)}\n`);
console.log(`Updated ${events.length} events.`);

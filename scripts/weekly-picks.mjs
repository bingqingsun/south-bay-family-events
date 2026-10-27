import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const path = name => new URL(name, root);
const day = value => String(value || '').slice(0, 10);
const addDays = (iso, delta) => {
  const value = new Date(iso + 'T12:00:00Z');
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid date: ' + iso);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
};
const pacificToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
};

export function weekendFor(value = pacificToday()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected YYYY-MM-DD');
  const weekday = new Date(value + 'T12:00:00Z').getUTCDay();
  const friday = addDays(value, (5 - weekday + 7) % 7);
  return { friday, sunday: addDays(friday, 2) };
}

const banned = /champagne lounge|happy hour|meditation with|adult only|18\+|21\+|nr-rated|movie yotsuba|college admissions|business networking|technical lecture|fundraiser gala|private event|girl scout program/i;
const poor = /storytime|regular class|homework help|library ukulele|museum open|practice your vote|thursday live on cal ave/i;
const focus = /halloween|spook|boo!|trick.or.treat|pumpkin|ghost|día de los muertos|dia de los muertos|lowrider|family festival|bluey|science fun/i;
const family = /\bfamil(?:y|ies)\b|\bchildren\b|\bkids?\b|\bages?\b|\btoddlers?\b|\ball ages\b/i;
const validLink = event => ['ok', 'redirected'].includes(event.linkStatus)
  && /^https:\/\//.test(event.url || '')
  && !/(?:\/events?|\/schedule)\/?$/.test(new URL(event.url).pathname)
  && !event.linkEvidence?.includes('content-mismatch');
const spanishOrChinese = /dia de los muertos|día de los muertos|文化|亡灵节/i;
const topic = event => {
  const text = (event.title + ' ' + (event.seasonalTheme || '')).toLowerCase();
  if (/halloween|spook|boo|nightfall|trick.or.treat|tech or treat/.test(text)) return 'halloween';
  if (spanishOrChinese.test(text)) return 'culture';
  if (event.type === 'sports') return 'sports';
  if (/bluey|puppet|theatre|theater|play/.test(text) || event.type === 'shows') return 'shows';
  if (/science|stem|planetarium/.test(text) || event.type === 'learning') return 'learning';
  if (event.type === 'outdoor') return 'outdoor';
  if (event.type === 'arts') return 'arts';
  return 'community';
};

export function candidateEvents(events, friday) {
  const sunday = addDays(friday, 2);
  return events.filter(event => {
    if (!event?.id || !event.title || !validLink(event) || banned.test(event.title)) return false;
    const start = day(event.dateValue);
    const end = day(event.endDateValue || event.dateValue);
    if (!start || !end || start > sunday || end < friday || event.ongoing) return false;
    if (/cancelled|canceled|unavailable/i.test(String(event.availabilityStatus || ''))) return false;
    const description = String(event.parentSummary || event.description || '').replace(/\s+/g, ' ').trim();
    if (description.length < 45 || description.length > 1100) return false;
    const audience = [event.title, event.ageLabel, description].join(' ');
    if (!family.test(audience) && !focus.test(audience) && !['sports', 'arts'].includes(event.type)) return false;
    if (!event.translations?.zh?.description) return false; // do not publish English-only editorial cards
    return true;
  });
}

function score(event, friday) {
  const title = String(event.title);
  const description = String(event.parentSummary || event.description || '');
  const text = title + ' ' + description;
  let value = 25;
  if (focus.test(title)) value += 24;
  if (/family|children|kids|all ages/i.test(event.ageLabel || '')) value += 14;
  if (family.test(description)) value += 8;
  if (/free/i.test(event.costStatus || '')) value += 6;
  if (event.linkStatus === 'ok') value += 5;
  if (event.seasonalTheme) value += 6;
  if (day(event.dateValue) >= friday) value += 7;
  if (poor.test(title)) value -= 45;
  if (/costume|creative|hands.on|festival|puppet|garden|museum|science|craft|art|music|dance/i.test(text)) value += 5;
  if (topic(event) === 'sports') value -= 8;
  if (day(event.dateValue) < addDays(friday, -30)) value -= 6;
  return value;
}

export function choosePicks(events, friday, { min = 8, max = 14 } = {}) {
  const candidates = candidateEvents(events, friday).sort((a, b) =>
    score(b, friday) - score(a, friday) ||
    String(a.dateValue).localeCompare(String(b.dateValue)) ||
    String(a.id).localeCompare(String(b.id))
  );
  const selected = [];
  const selectedIds = new Set();
  const sources = new Map(), cities = new Map(), topics = new Map();
  for (const loose of [false, true]) {
    for (const event of candidates) {
      if (selectedIds.has(event.id) || selected.length >= max) continue;
      const source = event.source || event.place || '';
      const city = event.city || 'South Bay';
      const category = topic(event);
      if ((sources.get(source) || 0) >= 2) continue;
      if ((cities.get(city) || 0) >= (loose ? 8 : 5)) continue;
      if (category === 'sports' && (topics.get(category) || 0) >= 2) continue;
      if (!loose && category === 'halloween' && (topics.get(category) || 0) >= 4) continue;
      if (!loose && category === 'culture' && (topics.get(category) || 0) >= 3) continue;
      selected.push(event);
      selectedIds.add(event.id);
      sources.set(source, (sources.get(source) || 0) + 1);
      cities.set(city, (cities.get(city) || 0) + 1);
      topics.set(category, (topics.get(category) || 0) + 1);
    }
  }
  if (selected.length < min) throw new Error(
    'Weekly Picks publish gate: only ' + selected.length +
    ' eligible diverse bilingual activities (' + candidates.length + ' candidates); keeping previous edition.'
  );
  return selected.sort((a, b) => {
    const aDay = day(a.dateValue) < friday ? friday : day(a.dateValue);
    const bDay = day(b.dateValue) < friday ? friday : day(b.dateValue);
    return aDay.localeCompare(bDay) || String(a.dateValue).localeCompare(String(b.dateValue)) ||
      String(a.title).localeCompare(String(b.title));
  });
}

const labels = {
  halloween: ['Halloween Pick', '万圣节精选'],
  culture: ['Culture & Community Pick', '文化社区精选'],
  sports: ['Live Sports Pick', '现场体育精选'],
  shows: ['Family Show Pick', '亲子演出精选'],
  learning: ['Hands-on Learning Pick', '探索学习精选'],
  outdoor: ['Outdoor Adventure Pick', '户外探索精选'],
  arts: ['Creative Arts Pick', '艺术体验精选'],
  community: ['Community Favorite', '社区亲子精选']
};

const clean = value => String(value || '').replace(/\s+/g, ' ').replace(/&nbsp;|nbsp;/gi, ' ').trim();
const snip = (value, limit) => {
  const s = clean(value);
  if (s.length <= limit) return s;
  const sentence = s.slice(0, limit).match(/^(.+?[.!。！？])(?:\s|$)/);
  if (sentence && sentence[1].length >= 45) return sentence[1];
  return s.slice(0, limit).replace(/\s+\S*$/, '').replace(/[,;:，；、\s]+$/, '') + '…';
};
export function editorialPicks(events, friday) {
  return choosePicks(events, friday).map(event => {
    const category = topic(event);
    const [label, labelZh] = labels[category];
    return {
      eventRef: {
        id: event.id, title: event.title, url: event.url,
        dateValue: day(event.dateValue) < friday ? friday : event.dateValue
      },
      label, labelZh,
      whyWePicked: snip(event.parentSummary || event.description, 200),
      whyWePickedZh: snip(event.translations.zh.description, 150)
    };
  });
}

function editionFromJs(source) {
  const body = source.replace(/^\s*window\.SBFF_WEEKEND_PICKS\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(body);
}

function englishDate(friday, sunday) {
  const fmt = iso => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric'
  }).format(new Date(iso + 'T12:00:00Z'));
  return fmt(friday) + '–' + fmt(sunday);
}
function chineseDate(friday, sunday) {
  const d = iso => {
    const value = new Date(iso + 'T12:00:00Z');
    return (value.getUTCMonth() + 1) + '月' + value.getUTCDate() + '日';
  };
  return d(friday) + '周五–' + d(sunday) + '周日';
}
const jsValue = value => JSON.stringify(value);
function replaceLine(block, key, value) {
  const regexp = new RegExp('^(\\s*' + key + ':\\s*).+$', 'm');
  if (!regexp.test(block)) throw new Error('Collection property missing: ' + key);
  return block.replace(regexp, (_match, prefix) => prefix + jsValue(value) + ',');
}

export function updateCollection(content, picks, friday, sunday, mode, timestamp) {
  const marker = "    Object.freeze({\n      slug: 'halloween',";
  const index = content.indexOf(marker);
  if (index < 0) throw new Error('Halloween collection boundary not found; refusing unsafe edit');
  let weekend = content.slice(0, index);
  const rest = content.slice(index);
  if (!weekend.includes("slug: 'weekend-picks'")) throw new Error('Weekend collection missing');
  if (mode === 'publish') {
    const count = picks.length, en = englishDate(friday, sunday), zh = chineseDate(friday, sunday);
    const translationIndex = weekend.indexOf('translations: Object.freeze');
    const before = weekend.slice(0, translationIndex), after = weekend.slice(translationIndex);
    weekend = replaceLine(before, 'homeDescription', count + ' curated South Bay family activities · ' + en);
    weekend = replaceLine(weekend, 'homeTags', ["Editor's picks", en, 'South Bay']);
    weekend = replaceLine(weekend, 'landingDescription', count + ' South Bay family activities for ' + en + ', with official event links.');
    weekend += replaceLine(replaceLine(replaceLine(after,
      'homeDescription', '南湾本周末 ' + count + ' 个亲子活动 · ' + zh),
      'homeTags', ['编辑精选', zh, '南湾']),
      'landingDescription', '精选 ' + zh + ' 南湾亲子活动，详情以主办方官方页面为准。');
    const refs = picks.map(p => '        ' + JSON.stringify({
      id: p.eventRef.id, title: p.eventRef.title, url: p.eventRef.url
    }) + ',').join('\n');
    const refsRegex = /(selectedEventRefs:\s*)\[[\s\S]*?\](\s*,)/;
    if (!refsRegex.test(weekend)) throw new Error('Weekend selectedEventRefs array not found');
    weekend = weekend.replace(refsRegex, (_full, head, tail) => head + '[\n' + refs + '\n      ]' + tail);
  }
  weekend = replaceLine(weekend, 'published', mode === 'publish');
  if (mode === 'publish') weekend = replaceLine(weekend, 'publishAt', timestamp);
  return weekend + rest;
}

function bustMarkup(text, path, version) {
  const target = path === 'data/weekend-picks.js' ? 'weekend-picks' : 'collections';
  const regexp = new RegExp('(src="[^"]*data/' + target + '\\.js\\?v=)[^"]+', 'g');
  if (!regexp.test(text)) throw new Error('Missing script reference for ' + path);
  return text.replace(regexp, '$1' + version);
}

async function save({ edition, friday, sunday, mode, events }) {
  const isPublish = mode === 'publish';
  const timestamp = new Date().toISOString();
  const picks = isPublish ? editorialPicks(events, friday) : edition.picks;
  const nextEdition = isPublish ? {
    id: addDays(friday, 1),
    weekendStart: friday,
    weekendEnd: sunday,
    status: 'published',
    publishedAt: timestamp,
    updatedAt: timestamp,
    intro: picks.length + ' curated South Bay family activities for ' + englishDate(friday, sunday) + ', selected from verified organizer listings.',
    introZh: '精选 ' + chineseDate(friday, sunday) + ' ' + picks.length + ' 个南湾亲子活动，活动信息来自主办方官方渠道。',
    picks
  } : { ...edition, status: 'ended', updatedAt: timestamp };
  const source = 'window.SBFF_WEEKEND_PICKS = ' + JSON.stringify(nextEdition, null, 2) + ';\n';
  const collection = await readFile(path('data/collections.js'), 'utf8');
  const newCollection = updateCollection(collection, picks, friday, sunday, mode, timestamp);
  await writeFile(path('data/weekend-picks.js'), source);
  await writeFile(path('data/collections.js'), newCollection);
  const version = friday.replace(/-/g, '') + (isPublish ? 'publish' : 'retire');
  for (const filename of ['index.html', 'zh/index.html', 'weekend-picks/index.html', 'zh/weekend-picks/index.html']) {
    let markup = await readFile(path(filename), 'utf8');
    markup = bustMarkup(markup, 'data/weekend-picks.js', version);
    if (filename.endsWith('index.html') && !filename.includes('weekend-picks/')) {
      markup = bustMarkup(markup, 'data/collections.js', version);
    }
    await writeFile(path(filename), markup);
  }
  console.log('WEEKEND_PICKS=' + JSON.stringify({
    mode, friday, sunday, picks: picks.map(p => p.eventRef.title), count: picks.length, status: nextEdition.status
  }));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const eq = a.indexOf('=');
    return eq < 0 ? [a.slice(2), 'true'] : [a.slice(2, eq), a.slice(eq + 1)];
  }));
  const mode = args.mode || 'publish';
  if (!['publish', 'retire'].includes(mode)) throw new Error('Expected --mode=publish|retire');
  const { friday, sunday } = args.friday
    ? { friday: args.friday, sunday: addDays(args.friday, 2) }
    : weekendFor();
  const edition = editionFromJs(await readFile(path('data/weekend-picks.js'), 'utf8'));
  if (mode === 'publish' && edition.weekendStart === friday && edition.status === 'published' && args.force !== 'true') {
    console.log('Current edition already published; preserving editor changes');
    return;
  }
  if (mode === 'retire' && (edition.status !== 'published' || pacificToday() < edition.weekendEnd)) {
    // Scheduled retirement is allowed exactly on the edition's final Sunday.
    if (edition.status !== 'published' || pacificToday() !== edition.weekendEnd) {
      console.log('Nothing to retire');
      return;
    }
  }
  const events = mode === 'publish'
    ? JSON.parse(await readFile(path('data/events.json'), 'utf8'))
    : [];
  await save({ edition, friday, sunday, mode, events });
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  await main();
}

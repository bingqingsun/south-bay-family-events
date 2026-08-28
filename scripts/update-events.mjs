/*
 * Daily South Bay family-event refresh.
 * Requires SERPAPI_KEY in the environment. Uses SerpApi's standard Google
 * search engine so the job also works on plans without Google Events access.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const key = process.env.SERPAPI_KEY;
// Translation is intentionally paused: no third-party translation key is read
// or called until the product is ready to offer this feature again.
const translationEnabled = false;
const translationKey = translationEnabled ? process.env.GOOGLE_TRANSLATE_API_KEY : '';

const typeFor = text => /hike|nature|park|outdoor|garden/i.test(text) ? 'outdoor'
  : /art|craft|paint|music|theater|museum/i.test(text) ? 'arts'
  : /science|stem|robot|tech|library|learn/i.test(text) ? 'learning' : 'community';
const labels = { outdoor: '户外自然', arts: '艺术创作', learning: '科学与学习', community: '社区活动' };
const icons = { outdoor: '🌿', arts: '🎨', learning: '🔭', community: '✨' };
const colors = { outdoor: '#d8eee0', arts: '#ffd9bd', learning: '#dce7fa', community: '#ffe9a8' };
const fallbackTime = '请点击活动详情查看活动时间';
const generatedAt = new Date().toISOString();

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

function isOfficialUrl(url, domain) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch { return false; }
}

function isSameEvent(resultTitle, eventTitle) {
  const words = text => new Set(String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 3));
  const result = words(resultTitle);
  const event = words(eventTitle);
  if (!result.size || !event.size) return false;
  const shared = [...result].filter(word => event.has(word)).length;
  return shared >= Math.min(2, result.size, event.size);
}

function isUpcoming(value) {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  return match[0] >= today;
}

function decodeXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function xmlText(item, tag) {
  // BiblioCommons puts event-specific fields in its `bc:` XML namespace.
  // Accept either a plain RSS field (`title`) or a namespaced field
  // (`bc:start_date_local`) while keeping the caller's field names simple.
  const field = '(?:[A-Za-z][\\w-]*:)?' + tag;
  const match = item.match(new RegExp('<' + field + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + field + '>', 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function xmlTexts(item, tag) {
  const field = '(?:[A-Za-z][\\w-]*:)?' + tag;
  return [...item.matchAll(new RegExp('<' + field + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + field + '>', 'gi'))]
    .map(match => decodeXml(match[1]).trim());
}

function xmlAttribute(item, tag, attribute) {
  const field = '(?:[A-Za-z][\\w-]*:)?' + tag;
  const element = item.match(new RegExp('<' + field + '\\b([^>]*)>', 'i'));
  if (!element) return '';
  const value = element[1].match(new RegExp('\\b' + attribute + '=["\\\']([^"\\\']*)["\\\']', 'i'));
  return value ? decodeXml(value[1]).trim() : '';
}

function plainText(html) {
  return decodeXml(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

function isLogisticsOnly(text) {
  return /^(?:free|by appointment|call(?:\s|\.|$)|contact\b|same day|offered in|registration|reserve\b|tickets?\b|admission\b|please\b|drop-?ins?\b|no registration|must\b|participants?\b)/i.test(text)
    || /ada accommodation|for more information|please (?:call|email|visit)|click here|all minors under|parent\/guardian approval|release of liability|difficulty rating|terms & conditions|reserves the right to cancel/i.test(text);
}

function hasActivitySummary(text) {
  const value = plainText(text);
  return value.length >= 20 && !isLogisticsOnly(value);
}

function cardSummary(html) {
  const text = plainText(html).replace(/https?:\/\/\S+/g, '').trim();
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const listItems = [...String(html || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match => plainText(match[1])).filter(Boolean);
  const listText = listItems.slice(0, 5).map(item => {
    let cleaned = item.replace(/^intro to\s+/i, '');
    if (/what we do/i.test(html)) cleaned = cleaned.replace(/^(Account|Job|Navigating)\b/, match => match.toLowerCase());
    return cleaned;
  }).join(', ');
  const listSummary = listItems.length >= 2 ? /what we do/i.test(html) ? `One-on-one help with ${listText}.` : `Includes ${listText}.` : '';
  const candidates = [...sentences.map(sentence => sentence.trim()), listSummary].filter(Boolean);
  const score = candidate => {
    const value = candidate.toLowerCase();
    let result = Math.min(candidate.length, 150) / 30;
    if (candidate.length < 20) result -= 5;
    if (isLogisticsOnly(candidate)) result -= 12;
    if (/^one-on-one help with/i.test(candidate)) result += 3;
    if (/^what we do:/i.test(candidate)) result -= 4;
    if (/\b(?:learn|explore|discover|create|build|make|play|story|song|meditat\w*|yoga|computer|tech|science|stem|hike|nature|art|music|read|watch|design|help|practice|harvest|taste|garden|repair|volunteer|cook|craft|exercise|football|dance|robot|marsh|slug|berry|puzzle|print|knit|crochet)\b/.test(value)) result += 8;
    if (/would you like|do you love|do you have what it takes/.test(value)) result -= 3;
    return result;
  };
  const useful = candidates.sort((a, b) => score(b) - score(a)).find(hasActivitySummary) || '';
  // Keep enough of the organizer-derived summary for the in-card “expand”
  // control. The collapsed card remains short through CSS line clamping.
  return useful.length > 320 ? `${useful.slice(0, 317).trimEnd()}…` : useful;
}

function officialImageUrl(item) {
  const url = xmlAttribute(item, 'enclosure', 'url');
  return url ? url.replace(/^http:/i, 'https:') : '';
}

// Addresses are shown only when the organizer supplies both a street and a
// city. Postal codes and state are intentionally omitted for this South Bay
// product, where a short, scannable address is more useful on a card.
function shortAddress(street, city) {
  // The card adds its own comma before the city. Remove a trailing period
  // from source abbreviations (for example, "Ave., San Jose" → "Ave, San Jose").
  const cleanStreet = plainText(street).replace(/[.,;:]$/, '');
  const cleanCity = plainText(city);
  return cleanStreet && cleanCity ? `${cleanStreet}, ${cleanCity}` : '';
}

function canonicalCity(value) {
  const city = plainText(value);
  if (!city) return '';
  // Keep one stable value per city so one place never becomes two filters
  // merely because official sources differ on the accent in San Jose.
  return /^san jos[eé]$/i.test(city) ? 'San Jose' : city;
}

// Keep audience labels deliberately conservative. A generic "kids" category
// does not prove a grade range, and "family" does not prove that every age is
// suitable. The original publisher categories remain the source of truth.
function ageBandsFor(categories) {
  const text = String(categories || '').toLowerCase();
  const bands = new Set();
  if (/bab(?:y|ies)|infant|toddler|18\s*(?:months?|mos?)/.test(text)) bands.add('0-2');
  if (/pre[ -]?school(?:er|ers)?|ages?\s*3\s*(?:-|–|to)\s*5/.test(text)) bands.add('3-5');
  if (/elementary|school[ -]?age|kids?\s*\(\s*6\s*(?:-|–|to)\s*11\s*\)|ages?\s*6\s*(?:-|–|to)\s*11/.test(text)) bands.add('k5');
  if (/pre[ -]?teens?|tweens?|middle[ -]?school|ages?\s*11\s*(?:-|–|to)\s*13/.test(text)) bands.add('middle');
  if (/teens?|high[ -]?school|ages?\s*14\s*(?:-|–|to)\s*18/.test(text)) bands.add('high');
  if (/all ages/.test(text)) bands.add('all-ages');
  if (/family/.test(text)) bands.add('family');
  return [...bands];
}

const ageLabels = {
  '0-2': '0–2 岁', '3-5': '3–5 岁', k5: 'K–5 年级', middle: '6–8 年级',
  high: '9–12 年级', 'all-ages': '所有年龄', family: '全家适合'
};
const ageOrder = ['0-2', '3-5', 'k5', 'middle', 'high', 'all-ages', 'family'];

function ageInfo(categories) {
  const ageBands = ageBandsFor(categories);
  const ordered = ageOrder.filter(band => ageBands.includes(band));
  return {
    ageBands: ordered,
    ageLabel: ordered.length ? ordered.map(band => ageLabels[band]).join(' · ') : '年龄未注明',
    ageSource: ordered.length ? '官方受众分类' : ''
  };
}

function costInfo(cost, description = '') {
  const officialCost = plainText(cost).replace(/\s+/g, ' ').trim();
  const officialText = plainText(description).replace(/\s+/g, ' ').trim();
  const classifyField = text => {
    if (!text) return null;
    if (/^(?:free|no cost|no charge|\$?0(?:\.00)?)$/i.test(text)) return '免费';
    if (/^suggested donation/i.test(text)) return '建议捐赠';
    if (/member/i.test(text) && /\$|\d|price|fee|admission/i.test(text)) return '会员／非会员价格见详情';
    if (/\$\s*\d|\b(?:usd|fee|admission|ticket|price)\b/i.test(text)) return text;
    return null;
  };
  const classifyDescription = text => {
    if (/suggested donation/i.test(text)) return '建议捐赠';
    if (/\b(?:free admission|free event|free program|free activity|free entry|free to attend|admission is free|registration is free|free (?:class|workshop|tour|screening|concert|performance|bicycle repair|repair service|drop-?in))\b/i.test(text)) return '免费';
    if (/\b(?:tickets?|admission|registration|entry|fee|cost|price)\b[^.!?]{0,45}(?:\$\s*\d|purchase|required|available)/i.test(text)) return '需购票／价格见详情';
    return null;
  };
  const label = classifyField(officialCost) || classifyDescription(officialText) || '费用未注明';
  return { costLabel: label, costSource: label === '费用未注明' ? '' : officialCost ? '官方费用字段' : '官方活动说明' };
}

async function readRss(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const xml = await response.text();
  if (!response.ok || !/<rss[\s>]/i.test(xml)) throw new Error('RSS feed was not valid: ' + response.status);
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return itemBlocks.flatMap((item, index) => {
    const title = xmlText(item, 'title');
    const link = xmlText(item, 'link');
    const startDate = xmlText(item, 'start_date_local');
    const categories = xmlTexts(item, 'category').join(' ').toLowerCase();
    const familyAudience = /young children|kids|children|teens|family|all ages|school age/.test(categories);
    if (!title || !link || !isUpcoming(startDate) || !familyAudience || xmlText(item, 'is_cancelled') === 'true') return [];
    const type = typeFor(title + ' ' + categories);
    const age = ageInfo(categories);
    const cost = costInfo(xmlText(item, 'cost'), xmlText(item, 'description'));
    const eventId = (xmlText(item, 'guid') || link).split('/').filter(Boolean).pop() || String(index);
    const location = xmlText(item, 'location');
    const venue = xmlText(location, 'name');
    const room = xmlText(location, 'location_details');
    const city = canonicalCity(xmlText(location, 'city'));
    const address = shortAddress(`${xmlText(location, 'number')} ${xmlText(location, 'street')}`, city);
    return [{
      id: 'rss-' + eventId, title, date: displayEventDate(startDate), dateValue: startDate, ...age, ...cost,
      type, icon: icons[type], color: colors[type], tag: labels[type], verification: 'rss', lastVerifiedAt: generatedAt,
      description: cardSummary(xmlText(item, 'description')),
      image: officialImageUrl(item),
      place: [venue, room].filter(Boolean).join(' · ') || source.name, address, city, source: source.name, url: link
    }];
  });
}

async function tribePageSummary(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) return '';
    const body = html.match(/tribe-events-single-event-description[\s\S]*?<div class="text">([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || '';
    const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || '';
    return cardSummary(body) || cardSummary(meta);
  } catch {
    return '';
  }
}

async function readTribe(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.events)) throw new Error('Official calendar API was not valid: ' + response.status);
  const seeds = payload.events.flatMap((item, index) => {
    const startDate = String(item.start_date || '').replace(' ', 'T');
    const title = decodeXml(item.title || '').trim();
    const categories = (item.categories || []).map(category => decodeXml(category.name || '')).join(' ').toLowerCase();
    if (!title || !item.url || !isUpcoming(startDate)) return [];
    const type = typeFor(title + ' ' + categories);
    const age = ageInfo(`family ${categories}`);
    const cost = costInfo(item.cost, item.description || item.excerpt || '');
    return [{
      id: 'calendar-' + (item.id || index), title, date: displayEventDate(startDate), dateValue: startDate, ...age, ...cost,
      type, icon: icons[type], color: colors[type], tag: labels[type], verification: 'calendar', lastVerifiedAt: generatedAt,
      description: cardSummary(item.description || item.excerpt || ''),
      image: item.image?.url || '', place: item.venue?.venue || source.name,
      address: shortAddress(item.venue?.address, item.venue?.city), city: canonicalCity(item.venue?.city), source: source.name, url: item.url
    }];
  });
  const enriched = await Promise.all(seeds.map(async event => ({
    ...event,
    description: hasActivitySummary(event.description) ? event.description : await tribePageSummary(event.url)
  })));
  return enriched.filter(event => hasActivitySummary(event.description));
}

function isoDateFromOfficialText(dateText, timeText = '') {
  const match = String(dateText || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/i);
  if (!match) return '';
  const month = months[match[1].slice(0, 3).toLowerCase()];
  if (!month) return '';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  let year = Number(match[3] || today.slice(0, 4));
  let date = [year, String(month).padStart(2, '0'), String(match[2]).padStart(2, '0')].join('-');
  // A date without a year must still be upcoming. We deliberately reject
  // stale month/day labels rather than guessing that they mean next year.
  if (!match[3] && date < today) return '';
  const time = String(timeText || '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (!time) return date;
  let hour = Number(time[1]) % 12;
  if (time[3].toUpperCase() === 'PM') hour += 12;
  return date + 'T' + String(hour).padStart(2, '0') + ':' + (time[2] || '00');
}

function directEvent({ id, title, dateValue, description, image = '', place, address = '', city = '', source, url, ageText = '' }) {
  const type = typeFor(title + ' ' + description + ' ' + ageText);
  const age = ageInfo(ageText);
  return {
    id, title, date: displayEventDate(dateValue), dateValue, ...age,
    costLabel: '费用未注明', costSource: '', type, icon: icons[type], color: colors[type], tag: labels[type],
    verification: 'official-page', lastVerifiedAt: generatedAt,
    description: cardSummary(description),
    image, place, address, city: canonicalCity(city), source, url
  };
}

function htmlAttribute(block, pattern) {
  return block.match(pattern)?.[1] ? decodeXml(block.match(pattern)[1]).trim() : '';
}

async function readFoothill(source) {
  const [response, physicsResponse] = await Promise.all([
    fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) }),
    fetch('https://foothill.edu/physics/index.html', { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) }).catch(() => null)
  ]);
  const html = await response.text();
  if (!response.ok || !/Events__item/i.test(html)) throw new Error('Foothill official event list was not valid: ' + response.status);
  const physicsHtml = physicsResponse?.ok ? await physicsResponse.text() : '';
  const physicsSummary = cardSummary(physicsHtml.match(/Physics Show at Foothill[\s\S]{0,1200}?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  return html.split(/<div class="Events__item">/i).slice(1).flatMap(block => {
    const title = htmlAttribute(block, /Event__title[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const titleText = block.match(/Event__title[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const dateText = htmlAttribute(block, /Events__date[^>]*>([\s\S]*?)<\/div>/i);
    const timeText = htmlAttribute(block, /Events__time[^>]*>([\s\S]*?)<\/div>/i);
    const place = htmlAttribute(block, /Events__location[^>]*>([\s\S]*?)<\/div>/i) || source.name;
    const cleanTitle = plainText(titleText);
    const dateValue = isoDateFromOfficialText(plainText(dateText), plainText(timeText));
    // Foothill's homepage mixes campus closures with public programs. Only
    // publish entries whose official title signals a K–12/family STEM program.
    if (!cleanTitle || !title || !isUpcoming(dateValue) || !/physics show|observatory|astronomy|family|children|youth|science/i.test(cleanTitle)) return [];
    return [directEvent({
      id: 'foothill-' + createHash('sha256').update(title).digest('hex').slice(0, 16),
      title: cleanTitle, dateValue, description: cleanTitle === 'The Physics Show' ? physicsSummary : '',
      place, address: source.address || '', city: source.city || '', source: source.name, url: title
    })];
  });
}

async function midpenPageSummary(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) return '';
    const description = html.match(/<div class="event-page__description">([\s\S]*?)<div class="event-page__meetup-location">/i)?.[1]
      || html.match(/<h2[^>]*>Description<\/h2>[\s\S]*?<div class="section-content[^>]*">([\s\S]*?)<\/div>/i)?.[1] || '';
    return cardSummary(description);
  } catch {
    return '';
  }
}

async function readTheTech(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/card-grid-item/i.test(html)) throw new Error('The Tech official event list was not valid: ' + response.status);
  return html.split(/<li class="card-grid-item">/i).slice(1).flatMap(block => {
    const url = htmlAttribute(block, /card-item-title[\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
    const titleHtml = block.match(/card-item-title[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const spans = [...block.matchAll(/<span class="small">([\s\S]*?)<\/span>/gi)].map(match => plainText(match[1]));
    const dateValue = isoDateFromOfficialText(spans[0], spans.slice(1).join(' '));
    const place = plainText(block.match(/<p class="italic">([\s\S]*?)<\/p>/i)?.[1]) || source.name;
    const description = plainText(block.match(/<p class="italic">[\s\S]*?<\/p>\s*<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i)?.[1]);
    const image = htmlAttribute(block, /<img[^>]+src=["']([^"']+)["']/i);
    const title = plainText(titleHtml);
    // The page includes member-only events and adult concert/film programs.
    // Keep only cards whose official title or description explicitly signals a
    // family, youth, school, or hands-on learning audience.
    const audienceText = title + ' ' + description;
    if (!title || !url || !isUpcoming(dateValue) || /member.?only/i.test(audienceText) || !/family|kids?|children|youth|girl scout|homeschool|school|hands-on|workshop|science|stem/i.test(audienceText)) return [];
    return [directEvent({
      id: 'thetech-' + createHash('sha256').update(url).digest('hex').slice(0, 16),
      title, dateValue, description, image: image ? new URL(image, source.feedUrl).href : '',
      place, address: source.address || '', city: source.city || '', source: source.name, url, ageText: audienceText
    })];
  });
}

async function readMidpen(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/activity-search-date/i.test(html)) throw new Error('Midpen family calendar was not valid: ' + response.status);
  const seeds = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].flatMap(match => {
    const row = match[1];
    const href = htmlAttribute(row, /views-field-title[\s\S]*?<a[^>]+href=["']([^"']+)["']/i);
    const titleHtml = row.match(/views-field-title[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const dateText = htmlAttribute(row, /activity-search-date[^>]*>([\s\S]*?)<\/div>/i);
    const timeText = htmlAttribute(row, /activity-search-time[^>]*>([\s\S]*?)<\/div>/i);
    const preserve = htmlAttribute(row, /views-field-field-preserve-term-1[^>]*>([\s\S]*?)<\/td>/i) || source.name;
    const title = plainText(titleHtml);
    const dateValue = isoDateFromOfficialText(plainText(dateText), plainText(timeText));
    if (!title || !href || !isUpcoming(dateValue)) return [];
    return [{ id: 'midpen-' + createHash('sha256').update(href).digest('hex').slice(0, 16), title, dateValue,
      place: preserve, url: new URL(href, source.feedUrl).href }];
  });
  return Promise.all(seeds.map(async seed => {
    const event = directEvent({ ...seed, description: await midpenPageSummary(seed.url), source: source.name, ageText: 'family' });
    event.ageSource = '官方 Family-Friendly 分类';
    return event;
  }));
}

async function readStanford(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.events)) throw new Error('Stanford official event API was not valid: ' + response.status);
  // “Everyone” in Stanford's calendar includes adult lectures. We only accept
  // entries with an explicit youth/family signal in the organizer's own copy.
  const youthSignal = /family day|family-friendly|families welcome|for families|family program|family event|family workshop|family activit(?:y|ies)|\b(?:kids?|children|teens?|tweens?)\b|youth (?:program|workshop|activit(?:y|ies)|camp)|for youth|K[-– ]?12|elementary|middle school|high school|school[- ]age|girl scout|summer camp|homeschool/i;
  return payload.events.flatMap(wrapper => {
    const item = wrapper.event || wrapper;
    const instance = item.event_instances?.[0]?.event_instance;
    const dateValue = String(instance?.start || '');
    const title = decodeXml(item.title || '').trim();
    const description = item.description_text || item.description || '';
    const audiences = (item.filters?.event_audience || []).map(value => value.name || '').join(' ');
    const departments = (item.departments || []).map(value => value.name || '').join(' ');
    const tags = [...(item.tags || []), ...(item.keywords || [])].join(' ');
    const audienceText = [title, description, audiences, departments, tags].join(' ');
    const url = item.localist_url || item.url;
    if (!title || !url || !isUpcoming(dateValue) || item.private || item.status !== 'live' || /\bcancel+ed\b/i.test(title) || !youthSignal.test(audienceText)) return [];
    const event = directEvent({
      id: 'stanford-' + createHash('sha256').update(String(item.id || url)).digest('hex').slice(0, 16),
      title, dateValue, description, image: item.photo_url || '',
      place: item.location_name || item.location || 'Stanford University',
      source: source.name, url, ageText: audienceText
    });
    return [{ ...event, ...costInfo(item.ticket_cost || '', description) }];
  });
}

async function officialStartDate(item) {
  // The card date must come from the same publisher page as the activity.
  try {
    const response = await fetch(item.link, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return '';
    const html = await response.text();
    const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const block of blocks) {
      try {
        const schema = JSON.parse(block[1].trim());
        const event = eventNodes(schema).find(node => {
          const type = node['@type'];
          const isEvent = type === 'Event' || (Array.isArray(type) && type.includes('Event'));
          return isEvent && isSameEvent(item.title, node.name);
        });
        if (!isUpcoming(event?.startDate)) continue;
        if (event?.startDate) return String(event.startDate);
      } catch { /* Ignore malformed metadata and try the next source. */ }
    }
  } catch { /* A source may block automated reads; link users to its details page. */ }
  return '';
}

async function search(source) {
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({
    engine: 'google', q: `site:${source.domain} ${source.query}`, api_key: key, hl: 'en', gl: 'us',
    location: 'Santa Clara, California, United States'
  });
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`Search failed: ${response.status}${payload.error ? ` — ${payload.error}` : ''}`);
  }
  const candidates = (payload.organic_results || [])
    .filter(item => item.title && item.link && isOfficialUrl(item.link, source.domain))
    .map(item => ({ ...item, source: source.name }));
  console.log(`SerpApi discovery · ${source.name}: ${(payload.organic_results || []).length} results, ${candidates.length} official-domain candidates.`);
  return candidates;
}

const target = new URL('../data/events.json', import.meta.url);
const browserTarget = new URL('../data/events.js', import.meta.url);
const existingEvents = JSON.parse(await readFile(target, 'utf8')); // Preserve translations already verified for unchanged cards.
const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const directSources = sources.filter(source => ['rss', 'tribe', 'thetech', 'foothill', 'midpen', 'stanford'].includes(source.method) && source.feedUrl);
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(new Date());
// Scheduled runs have no workflow input (empty value), so they use the normal
// Tuesday/Thursday fallback. A manually dispatched `false` explicitly disables
// it; `true` explicitly enables it on any weekday.
const serpapiInput = process.env.INCLUDE_SERPAPI;
const includeSerpapi = serpapiInput === 'true'
  || (serpapiInput !== 'false' && ['Tue', 'Thu'].includes(weekday));
const searchSources = includeSerpapi ? sources.filter(source => !['rss', 'tribe', 'thetech', 'foothill', 'midpen', 'stanford'].includes(source.method)) : [];
if (searchSources.length && !key) throw new Error('SERPAPI_KEY is required when the fallback search is scheduled or manually enabled.');

const feedAttempts = await Promise.allSettled(directSources.map(source => {
  if (source.method === 'tribe') return readTribe(source);
  if (source.method === 'thetech') return readTheTech(source);
  if (source.method === 'foothill') return readFoothill(source);
  if (source.method === 'midpen') return readMidpen(source);
  if (source.method === 'stanford') return readStanford(source);
  return readRss(source);
}));
const searchAttempts = await Promise.allSettled(searchSources.map(search));
const failures = [...feedAttempts, ...searchAttempts].filter(result => result.status === 'rejected');
failures.forEach(result => console.warn(`Skipping one search: ${result.reason.message}`));
if (directSources.length && feedAttempts.every(result => result.status === 'rejected')) {
  throw new Error('All official calendars failed; leaving the published list unchanged.');
}
const feedEvents = feedAttempts.flatMap(result => result.status === 'fulfilled' ? result.value : []);
const raw = searchAttempts.flatMap(result => result.status === 'fulfilled' ? result.value : []);
const unique = [...new Map(raw.filter(item => item.title && item.link).map(item => [item.link.toLowerCase(), item])).values()];
// Search discovery is balanced per source. The old global slice only validated
// the earliest 18 links across all 18 sources, starving lower-listed sources
// such as Foothill and De Anza before they could be checked.
const sourceLimited = searchSources.flatMap(source => unique.filter(item => item.source === source.name).slice(0, 3));
searchSources.forEach(source => {
  const discovered = unique.filter(item => item.source === source.name).length;
  console.log(`SerpApi validation queue · ${source.name}: ${Math.min(discovered, 3)} of ${discovered} official candidates.`);
});
const candidateResults = await Promise.all(sourceLimited.map(async item => {
  const source = `${item.title} ${item.snippet || item.description || ''}`;
  const type = typeFor(source);
  const dateValue = await officialStartDate(item);
  return {
    sourceName: item.source,
    event: {
    id: 'search-' + createHash('sha256').update(item.link.toLowerCase()).digest('hex').slice(0, 16), title: item.title, date: displayEventDate(dateValue) || fallbackTime, dateValue,
    ageBands: [], ageLabel: '年龄未注明', ageSource: '', costLabel: '费用未注明', costSource: '',
    lastVerifiedAt: generatedAt, type, icon: icons[type], color: colors[type], tag: labels[type],
    description: cardSummary(item.snippet || item.description || ''),
    image: '',
    place: item.source || '南湾地区', source: item.source || '', verification: 'search-verified', url: item.link
    }
  };
}));
const candidates = candidateResults.filter(result => result.event.date !== fallbackTime).map(result => result.event);
searchSources.forEach(source => {
  const attempted = candidateResults.filter(result => result.sourceName === source.name).length;
  const accepted = candidates.filter(event => event.source === source.name).length;
  console.log(`SerpApi verification · ${source.name}: ${accepted} published / ${attempted} checked (requires matching official Event data and future date).`);
});
// Do not publish unverified directory pages or search snippets. A card must
// carry a direct search date or publisher-provided Event startDate.
const events = [...new Map([...feedEvents, ...candidates]
  .map(event => [event.url.toLowerCase(), event])).values()]
  // A card must explain what the activity is. We do not replace missing
  // organizer copy with generic prompts or publish logistics-only text.
  .filter(event => hasActivitySummary(event.description))
  .sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));

if (!events.length) throw new Error('No verified upcoming events; leaving the published list unchanged.');

function translationFingerprint(event) {
  return createHash('sha256').update(String(event.title || '') + '\n' + String(event.description || '')).digest('hex');
}

function needsChineseTranslation(text) {
  const value = String(text || '').trim();
  return /[A-Za-z]/.test(value) && !(/^[\u3400-\u9fff\s\p{P}\p{N}]+$/u.test(value));
}

async function translateToChinese(texts) {
  const endpoint = 'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(translationKey);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: texts, source: 'en', target: 'zh-CN', format: 'text' }),
    signal: AbortSignal.timeout(30000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.data?.translations)) {
    throw new Error('Google Translation failed: ' + response.status + (payload.error?.message ? ' — ' + payload.error.message : ''));
  }
  return payload.data.translations.map(item => decodeXml(item.translatedText || '').trim());
}

async function addChineseTranslations(items) {
  if (!translationEnabled) return { cached: 0, translated: 0 };
  const existingByUrl = new Map(existingEvents.filter(event => event.url).map(event => [event.url.toLowerCase(), event]));
  const missing = [];
  for (const event of items) {
    const prior = existingByUrl.get(event.url.toLowerCase());
    const fingerprint = translationFingerprint(event);
    const cached = prior?.translations?.zh;
    if (cached?.fingerprint === fingerprint && cached.title && cached.description) {
      event.translations = { zh: cached };
    } else if (needsChineseTranslation(event.title) || needsChineseTranslation(event.description)) {
      missing.push({ event, fingerprint });
    } else {
      event.translations = { zh: { title: event.title, description: event.description, fingerprint, translatedAt: generatedAt } };
    }
  }
  if (!missing.length) return { cached: items.length, translated: 0 };
  if (!translationKey) {
    console.warn('Google translation is not configured; ' + missing.length + ' new or changed cards remain in the organizer original language.');
    return { cached: items.length - missing.length, translated: 0 };
  }
  // Batch title and short card summary. Only new or changed content consumes quota.
  const texts = missing.flatMap(({ event }) => [event.title, event.description]);
  const translated = [];
  for (let index = 0; index < texts.length; index += 80) {
    translated.push(...await translateToChinese(texts.slice(index, index + 80)));
  }
  missing.forEach(({ event, fingerprint }, index) => {
    event.translations = { zh: { title: translated[index * 2], description: translated[index * 2 + 1], fingerprint, translatedAt: generatedAt } };
  });
  return { cached: items.length - missing.length, translated: missing.length };
}

const translationStats = await addChineseTranslations(events);

await writeFile(target, `${JSON.stringify(events, null, 2)}\n`);
// A same-origin script works both on GitHub Pages and when the user opens the
// local HTML file directly, where browsers often block fetch() of JSON files.
await writeFile(browserTarget, `window.SOUTH_BAY_EVENTS = ${JSON.stringify(events)};\nwindow.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt })};\n`);
console.log(`Published ${events.length} verified activities from ${directSources.length} official calendars and ${searchSources.length} fallback sources; ${translationStats.translated} translated and ${translationStats.cached} reused from cache.`);

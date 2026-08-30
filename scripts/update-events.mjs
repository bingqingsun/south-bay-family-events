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

function typeFor(text) {
  const value = String(text || '').toLowerCase();
  // Service, mutual-aid, and community-care activities take precedence over
  // a host site's broad “maker” or “craft” category.
  if (/\b(?:bike|bicycle)\b[^.!?]{0,48}\brepair\b|\b(?:community service|volunteer(?:ing)?|cleanup|donation|food drive|swap|mento(?:r|ring)|appointment|customer service|career help)\b/.test(value)) return 'community';
  if (/\b(?:hike|nature|park|outdoor|garden|trail|wildlife|marsh|forest|creek|pond)\b/.test(value)) return 'outdoor';
  if (/\b(?:science|stem|robot(?:ics)?|technology|tech|learn(?:ing)?|engineering|coding|computer|3d print(?:ing)?|forensics|dna|astronomy)\b/.test(value)) return 'learning';
  if (/\b(?:art|crafts?|paint(?:ing)?|music|theat(?:er|re)|museum|knit(?:ting)?|crochet|dance|cooking|baking|design)\b/.test(value)) return 'arts';
  return 'community';
}
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
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
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
    .replace(/<[^>]*>/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/(?:\s*[-–—_]\s*){3,}/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

function isLogisticsOnly(text) {
  return /^(?:free|by appointment|call(?:\s|\.|$)|contact\b|same day|offered in|registration|reserve\b|tickets?\b|admission\b|please\b|drop-?ins?\b|no registration|must\b|participants?\b)/i.test(text)
    || /^(?:children|kids?|adults?|teens?|famil(?:y|ies)|participants?)\b[\s\S]{0,120}\b(?:welcome|must|should|need|able to|can comfortably|may participate)\b/i.test(text)
    || /^(?:all ages|families|everyone|you(?:'re| are)?)\b[\s\S]{0,120}\b(?:invited|welcome|join us|spend a (?:beautiful|fun|lovely))\b/i.test(text)
    || /^(?:designs?|prints?|library staff|color|file format|materials?)\b.*\b(?:must|are|will|may|if|criteria|available)\b/i.test(text)
    || /ada accommodation|for more information|please (?:call|email|visit)|click here|all minors under|parent\/guardian approval|release of liability|difficulty rating|terms & conditions|reserves the right to (?:cancel|refuse)|printable if|load and save|file format/i.test(text);
}

function hasActivitySummary(text) {
  const value = plainText(text);
  return value.length >= 20 && !isLogisticsOnly(value);
}

function cardSummary(html, title = '') {
  const text = plainText(html).replace(/https?:\/\/\S+/g, '').trim();
  // Some official pages lead with a question and then bury the activity in
  // printer requirements. Preserve the actual service in a short, faithful
  // summary rather than exposing a technical or safety-rule fragment.
  if (/\b3d printer\b/i.test(text) && /\bthingiverse\b/i.test(text) && /\b(?:choose a design|provide (?:their|your) own design)\b/i.test(text)) {
    return 'Submit a design to print on the library’s 3D printer—choose from Thingiverse or provide your own.';
  }
  if (/\b(?:DIY|hazlo)\b/i.test(title) && /decor(?:a|ar) velas con servilletas/i.test(text)) {
    return 'Hands-on adult DIY activity focused on decorating candles with napkins.';
  }
  if (/^giving thanks$/i.test(title) && /Native Californians/i.test(text)) {
    return 'A moderately paced docent-led hike exploring how Native Californians have cared for local land and plants.';
  }
  const sentences = (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(sentence => sentence
    .replace(/^(?:[a-z]+,?\s+)?[a-z]+\s+\d{1,2}\s*[-:–—]\s*/i, '')
    .replace(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*[-:–—]\s*/, ''));
  const listItems = [...String(html || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match => plainText(match[1])).filter(Boolean);
  const bulletItems = [...decodeXml(String(html || '')).replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, ' ').matchAll(/(?:^|\n)\s*(?:[•●▪◦]|\*)\s*([^\n]+)/g)].map(match => plainText(match[1])).filter(Boolean);
  const activityItems = [...new Set([...listItems, ...bulletItems])];
  const listText = activityItems.slice(0, 5).map(item => {
    let cleaned = item.replace(/^intro to\s+/i, '').replace(/[.!?]+$/, '');
    if (/what we do/i.test(html)) cleaned = cleaned.replace(/^(Account|Job|Navigating)\b/, match => match.toLowerCase());
    else cleaned = cleaned.replace(/^[A-Z]/, match => match.toLowerCase());
    return cleaned;
  }).join(', ');
  const listSummary = activityItems.length >= 2 ? /what we do/i.test(html) ? `One-on-one help with ${listText}.` : `Includes ${listText}.` : '';
  const candidates = [...sentences.map(sentence => sentence.trim()), listSummary].filter(Boolean);
  const score = candidate => {
    const value = candidate.toLowerCase();
    let result = Math.min(candidate.length, 150) / 30;
    if (candidate.length < 20) result -= 5;
    if (isLogisticsOnly(candidate)) result -= 12;
    if (/^one-on-one help with/i.test(candidate)) result += 3;
    if (/^(?:includes|one-on-one help with)/i.test(candidate)) result -= 2;
    if (/^what we do:/i.test(candidate)) result -= 4;
    // Supplementary schedules and bilingual duplicates are useful on the
    // organizer page, but do not explain what the activity itself is.
    if (/\b(?:we will also|also host|these dates|every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on (?:mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays))\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b[^.!?]{0,100}\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(value)) result -= 18;
    if (/^[\W_–—-]{3,}|[¡¿]/.test(candidate)) result -= 12;
    if (/\b(?:arrive early|first-come|space is limited|we do not offer|not available|not permitted|must not|limit to|do not trade|not (?:accepted|allowed)|requirements?|no weapons?|personal use only|lawful purposes?|copyright|patent|trademark|liability)\b/i.test(value)) result -= 16;
    if (/\b(?:printable if|load and save|file format|filament availability|staff have the right|reserve the right to refuse|technical specifications?)\b/i.test(value)) result -= 18;
    if (/\b(?:is|are)\s+\d+\s+minutes?\b|\bfollowed by\s+(?:stay|free|open)\b|\buntil\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(value)) result -= 16;
    if (/\b(?:will be offering|offers?|provides?|join us for|come (?:to|and)|enjoy|take part|explore)\b/i.test(value)) result += 5;
    if (/\b(?:stories|storytime|rhymes?|fingerplays?|songs?|toddlers?|babies|children|kids?|hands-on|crafts?|games?)\b/i.test(value)) result += 7;
    // Eligibility or fitness requirements can mention children and hiking,
    // but they do not tell a parent what the activity actually is.
    if (isLogisticsOnly(candidate)) result -= 18;
    if (/\b(?:learn|explore|discover|create|build|make|play|story|song|meditat\w*|yoga|computer|tech|science|stem|hike|nature|art|music|read|watch|design|help|practice|harvest|taste|garden|repair|volunteer|cook|craft|exercise|football|dance|robot|marsh|slug|berry|puzzle|print|knit|crochet)\b/.test(value)) result += 8;
    if (/would you like|do you love|do you have what it takes/.test(value)) result -= 3;
    return result;
  };
  const useful = candidates.sort((a, b) => score(b) - score(a)).find(hasActivitySummary) || '';
  const concise = useful.replace(/^(?:[a-z]+,?\s+)?[a-z]+\s+\d{1,2}\s*[-:–—]\s*/i, '')
    .replace(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*[-:–—]\s*/, '');
  // Keep enough of the organizer-derived summary for the in-card “expand"
  // control. The collapsed card remains short through CSS line clamping.
  return concise.length > 320 ? `${concise.slice(0, 317).trimEnd()}…` : concise;
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
    const description = xmlText(item, 'description');
    const type = typeFor(title + ' ' + categories + ' ' + description);
    const age = ageInfo(categories);
    const cost = costInfo(xmlText(item, 'cost'), description);
    const eventId = (xmlText(item, 'guid') || link).split('/').filter(Boolean).pop() || String(index);
    const location = xmlText(item, 'location');
    const venue = xmlText(location, 'name');
    const room = xmlText(location, 'location_details');
    const city = canonicalCity(xmlText(location, 'city'));
    const address = shortAddress(`${xmlText(location, 'number')} ${xmlText(location, 'street')}`, city);
    return [{
      id: 'rss-' + eventId, title, date: displayEventDate(startDate), dateValue: startDate, ...age, ...cost,
      type, icon: icons[type], color: colors[type], tag: labels[type], verification: 'rss', lastVerifiedAt: generatedAt,
      description: cardSummary(description, title),
      image: officialImageUrl(item),
      place: [venue, room].filter(Boolean).join(' · ') || source.name, address, city, source: source.name, url: link
    }];
  });
}

async function tribePageDetails(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) return { description: '', image: '' };
    const body = html.match(/tribe-events-single-event-description[\s\S]*?<div class="text">([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || '';
    const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || '';
    // Prefer the event image inside the event content. The wide page-header
    // image is site decoration and may not depict the activity itself.
    const image = html.match(/(?:mobile-event-image|my-event-image)[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';
    return {
      description: cardSummary(body) || cardSummary(meta),
      image: image ? new URL(decodeXml(image), url).href : ''
    };
  } catch {
    return { description: '', image: '' };
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
  const enriched = await Promise.all(seeds.map(async event => {
    if (hasActivitySummary(event.description) && event.image) return event;
    const details = await tribePageDetails(event.url);
    return {
      ...event,
      description: hasActivitySummary(event.description) ? event.description : details.description,
      image: event.image || details.image
    };
  }));
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

function directEvent({ id, title, dateValue, description, image = '', place, address = '', city = '', meetingPoint = '', mapUrl = '', source, url, ageText = '' }) {
  const type = typeFor(title + ' ' + description + ' ' + ageText);
  const age = ageInfo(ageText);
  return {
    id, title, date: displayEventDate(dateValue), dateValue, ...age,
    costLabel: '费用未注明', costSource: '', type, icon: icons[type], color: colors[type], tag: labels[type],
    verification: 'official-page', lastVerifiedAt: generatedAt,
    description: cardSummary(description),
    image, place, address, city: canonicalCity(city), meetingPoint, mapUrl, source, url
  };
}

function htmlAttribute(block, pattern) {
  return block.match(pattern)?.[1] ? decodeXml(block.match(pattern)[1]).trim() : '';
}

function officialPageImage(html, pageUrl, sectionPattern) {
  const section = html.match(sectionPattern)?.[1] || '';
  const image = htmlAttribute(section, /<img[^>]+src=["']([^"']+)["']/i);
  return image ? new URL(image, pageUrl).href : '';
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
  const physicsImage = officialPageImage(physicsHtml, 'https://foothill.edu/physics/index.html', /(<img[^>]+alt=["'][^"']*Physics Show[^"']*["'][^>]*>)/i);
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
      title: cleanTitle, dateValue, description: cleanTitle === 'The Physics Show' ? physicsSummary : '', image: cleanTitle === 'The Physics Show' ? physicsImage : '',
      place, address: source.address || '', city: source.city || '', source: source.name, url: title
    })];
  });
}

function conciseOfficialMeetingPoint(value) {
  let text = plainText(value).replace(/\b(?:Link to Google Map|Register on Eventbrite)\b[\s\S]*$/i, '').trim();
  text = (text.match(/^[\s\S]*?[.!?](?:\s|$)/)?.[0] || text).trim();
  return text
    .replace(/^For this activity at [^,]+,\s*/i, '')
    .replace(/^Meet at\s+/i, '')
    .replace(/^The\s+/i, '')
    .replace(/\s+at the lower portion of the preserve\s+is located on\s+/i, ' · ')
    .replace(/\s+is located on\s+/i, ' · ')
    .replace(/,\s*(?:\d+(?:\.\d+)? miles?|Those traveling|Please note:).*/i, '')
    .replace(/\s+/g, ' ').trim();
}

function officialMeetupLocation(html, pageUrl) {
  const meetupHtml = html.match(/<div class="event-page__meetup-location">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1] || '';
  const meetingPoint = conciseOfficialMeetingPoint(plainText(meetupHtml).replace(/^Where to Meet\s*/i, ''));
  const rawMapUrl = htmlAttribute(meetupHtml, /location-info__address-link[^>]+href=["']([^"']+)["']/i);
  return {
    // A named meeting point is intentionally kept separate from a street
    // address. It is shown only when the organizer also provides its map.
    meetingPoint: rawMapUrl ? meetingPoint : '',
    mapUrl: rawMapUrl ? new URL(rawMapUrl.replace(/^http:/i, 'https:'), pageUrl).href : ''
  };
}

async function midpenPageDetails(url, title = '') {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) return { description: '', image: '', meetingPoint: '', mapUrl: '' };
    const description = html.match(/<div class="event-page__description">([\s\S]*?)<div class="event-page__meetup-location">/i)?.[1]
      || html.match(/<h2[^>]*>Description<\/h2>[\s\S]*?<div class="section-content[^>]*">([\s\S]*?)<\/div>/i)?.[1] || '';
    // Midpen's event image may be absent while its official event-page hero
    // remains available. This is still organizer-provided artwork, and ranks
    // above our generated fallback image.
    const image = officialPageImage(html, url, /<section[^>]+\bid=(?:["']block-guidedactivityfallbackheroimage["']|block-guidedactivityfallbackheroimage)[^>]*>([\s\S]*?)<\/section>/i)
      || officialPageImage(html, url, /<div class=["']event-page__image["']>([\s\S]*?)<\/div>/i);
    return { description: cardSummary(description, title), image, ...officialMeetupLocation(html, url) };
  } catch {
    return { description: '', image: '', meetingPoint: '', mapUrl: '' };
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
    const details = await midpenPageDetails(seed.url, seed.title);
    const event = directEvent({ ...seed, ...details, source: source.name, ageText: 'family' });
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

// Cupertino publishes a server-rendered public event list rather than an RSS
// or ICS feed. The list itself includes an official date, description, venue,
// image, and audience tags, so it is more reliable than a web-search result.
async function readCupertino(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/list-item-container[\s\S]*list-item-title/i.test(html)) {
    throw new Error('Cupertino official calendar was not valid: ' + response.status);
  }
  const monthNumbers = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const seen = new Set();
  return [...html.matchAll(/<div class=["']list-item-container[\s\S]*?<\/article>/gi)].flatMap(blockMatch => {
    const block = blockMatch[0];
    const href = htmlAttribute(block, /<a[^>]+href=["']([^"']+)["']/i);
    const title = plainText(block.match(/list-item-title[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
    const day = htmlAttribute(block, /part-date[^>]*>([\s\S]*?)<\/span>/i);
    const month = htmlAttribute(block, /part-month[^>]*>([\s\S]*?)<\/span>/i).slice(0, 3).toLowerCase();
    const year = htmlAttribute(block, /part-year[^>]*>([\s\S]*?)<\/span>/i);
    const description = htmlAttribute(block, /list-item-block-desc[^>]*>([\s\S]*?)<\/span>/i);
    const placeText = htmlAttribute(block, /list-item-address[^>]*>([\s\S]*?)<\/p>/i).replace(/\s*,\s*/g, ', ');
    const audience = htmlAttribute(block, /tagged-as-list[\s\S]*?<span class=["']text["'][^>]*>([\s\S]*?)<\/span>\s*<\/p>/i);
    const image = htmlAttribute(block, /<img[^>]+src=["']([^"']+)["']/i);
    const dateValue = year && monthNumbers[month] && day ? `${year}-${monthNumbers[month]}-${String(Number(day)).padStart(2, '0')}` : '';
    const activityText = `${title} ${description} ${audience}`;
    const youthSignal = /kids?\s*&\s*family|children|famil(?:y|ies)|youth|teen|toddler|school/i.test(activityText);
    const url = href ? new URL(decodeXml(href), source.feedUrl).href : '';
    const id = url && dateValue ? `${url}|${dateValue}` : '';
    if (!id || seen.has(id) || !isUpcoming(dateValue) || !youthSignal) return [];
    seen.add(id);
    const locationParts = placeText.split(',').map(value => value.trim()).filter(Boolean);
    const place = locationParts.shift() || source.name;
    const street = locationParts.filter(value => !/^\d{5}(?:-\d{4})?$/.test(value)).join(', ');
    const event = directEvent({
      id: 'cupertino-' + createHash('sha256').update(id).digest('hex').slice(0, 16),
      title, dateValue, description, image: image ? new URL(decodeXml(image), source.feedUrl).href : '',
      place, address: shortAddress(street, source.city || 'Cupertino'), city: source.city || 'Cupertino', source: source.name, url,
      ageText: audience || activityText
    });
    return [{ ...event, ...costInfo('', description) }];
  });
}

// SLAC's public-events page links to current event details. Each detail page
// carries the official description, calendar start time, and hero image.
async function readSlac(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/\/events\//i.test(html)) throw new Error('SLAC official events page was not valid: ' + response.status);
  const links = [...new Set([...html.matchAll(/href=["'](\/events\/[^"'#?]+)["']/gi)].map(match => new URL(match[1], source.feedUrl).href))];
  const items = await Promise.all(links.map(async url => {
    try {
      const detailResponse = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      if (!detailResponse.ok) return null;
      const title = decodeXml(detail.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1] || '').replace(/\s*\|\s*SLAC National Accelerator Laboratory\s*$/i, '').trim();
      const description = decodeXml(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
      const image = decodeXml(detail.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || '');
      const detailText = plainText(detail);
      const range = description.match(/\bfrom\s+(\d{1,2}(?::\d{2})?)\s*(?:-|–|to)\s*\d{1,2}(?::\d{2})?\s*(AM|PM)\b/i);
      const dateValue = isoDateFromOfficialText(description, range ? `${range[1]} ${range[2]}` : description);
      const youthSignal = /famil(?:y|ies)|children|kids?|youth|teen|all ages|community day|school/i.test(`${title} ${description} ${detailText}`);
      if (!title || !description || !isUpcoming(dateValue) || !youthSignal) return null;
      const event = directEvent({
        id: 'slac-' + createHash('sha256').update(url).digest('hex').slice(0, 16), title, dateValue, description,
        image, place: source.name, address: source.address || '', city: source.city || '', source: source.name, url,
        ageText: `${title} ${description} ${detailText}`
      });
      return { ...event, ...costInfo('', detailText) };
    } catch { return null; }
  }));
  return items.filter(Boolean);
}

// CHM exposes its event posts through an official RSS feed. Event dates live
// on each official detail page, so RSS is used only for discovery and the
// published card is verified against that same source page.
async function readChm(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const xml = await response.text();
  if (!response.ok || !/<rss[\s>]/i.test(xml)) throw new Error('CHM official RSS was not valid: ' + response.status);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  const events = await Promise.all(items.map(async item => {
    const title = xmlText(item, 'title');
    const url = xmlText(item, 'link');
    if (!title || !url) return null;
    try {
      const detailResponse = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      if (!detailResponse.ok) return null;
      const detailText = plainText(detail);
      const startText = plainText(detail.match(/class=["']start["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
      const match = startText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (!match) return null;
      let hour = Number(match[4]) % 12;
      if (match[6].toUpperCase() === 'PM') hour += 12;
      const dateValue = `${match[3]}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${match[5] || '00'}`;
      const youthSignal = /famil(?:y|ies)|children|kids?|youth|teen|all ages|school/i.test(`${title} ${detailText}`);
      if (!isUpcoming(dateValue) || !youthSignal) return null;
      const description = detail.match(/three-column-grid__center[\s\S]*?<div class=["']wysiwyg["']>([\s\S]*?)<\/div>/i)?.[1] || xmlText(item, 'content:encoded') || xmlText(item, 'description');
      const image = decodeXml(detail.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || '');
      const locationText = plainText(detail.match(/<div class=["']location["'][\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] || '');
      const city = locationText.match(/([A-Za-z .'-]+),\s*CA\s*,?\s*\d{5}/i)?.[1]?.trim() || source.city || '';
      const address = locationText.match(/(?:CHM|Computer History Museum)\s+(.+?)(?:\s+[A-Za-z .'-]+,\s*CA|$)/i)?.[1] || source.address || '';
      const event = directEvent({
        id: 'chm-' + createHash('sha256').update(url).digest('hex').slice(0, 16), title, dateValue, description, image,
        place: locationText.split(/\s{2,}|\n/)[0] || 'Computer History Museum', address: shortAddress(address, city), city,
        source: source.name, url, ageText: `${title} ${detailText}`
      });
      return { ...event, ...costInfo('', detailText) };
    } catch { return null; }
  }));
  return events.filter(Boolean);
}

// De Anza's Planetarium maintains a public, server-rendered month calendar.
// Detail pages provide the official audience guidance and artwork, while the
// month view provides every individual performance time.
async function readDeAnza(source) {
  const now = new Date();
  const monthsToRead = [0, 1, 2].map(offset => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { month: String(date.getMonth() + 1).padStart(2, '0'), year: date.getFullYear() };
  });
  const pages = await Promise.all(monthsToRead.map(async ({ month, year }) => {
    const url = new URL(source.feedUrl);
    url.search = new URLSearchParams({ m: month, y: String(year) });
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok || !/class=["']event planet["']/i.test(html)) return [];
    return [...html.matchAll(/<td class=["']day[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].flatMap(cellMatch => {
      const cell = cellMatch[1];
      const day = cell.match(/<time\s+datetime=["'](\d{4}-\d{2}-\d{2})["']/i)?.[1] || '';
      return [...cell.matchAll(/<div class=["']event planet["'][\s\S]*?<div class=["']link["']>([^<]+)<\/div>\s*<\/div>/gi)].map(eventMatch => ({ day, block: eventMatch[0], href: plainText(eventMatch[1]) }));
    });
  }));
  const seen = new Set();
  const seeds = pages.flat().flatMap(({ day, block, href }) => {
    const title = plainText(block.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || '');
    const description = plainText(block.match(/class=["']desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const timeText = plainText(block.match(/class=["']datetime["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const place = plainText(block.match(/class=["']location["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const time = timeText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
    let hour = time ? Number(time[1]) % 12 : 0;
    if (time?.[3]?.toUpperCase() === 'PM') hour += 12;
    const dateValue = day ? `${day}${time ? `T${String(hour).padStart(2, '0')}:${time[2] || '00'}` : ''}` : '';
    const url = href ? new URL(href, source.feedUrl).href : '';
    const key = `${url}|${dateValue}`;
    if (!title || !url || !isUpcoming(dateValue) || seen.has(key)) return [];
    seen.add(key);
    return [{ title, description, timeText, place, dateValue, url }];
  });
  const events = await Promise.all(seeds.map(async seed => {
    try {
      const response = await fetch(seed.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const detail = await response.text();
      if (!response.ok) return null;
      // The sidebar lists other upcoming shows. It must not influence the
      // audience label for the current show.
      const mainContent = detail.match(/<div class=["']col-xs-12 col-lg-9 l-content["']>([\s\S]*?)<\/div>\s*<div class=["']col-xs-12 col-lg-3 promo-sidebar["']/i)?.[1] || '';
      const detailText = plainText(mainContent);
      const youthSignal = /family audience|famil(?:y|ies)|children|kids?|youth|teen|all ages|elementary|school-age/i.test(`${seed.title} ${detailText}`);
      if (!youthSignal) return null;
      const description = detail.match(/<div class=["']col-sm-7["']>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || seed.description;
      const image = htmlAttribute(detail, /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*img-responsive/i);
      const event = directEvent({
        id: 'deanza-' + createHash('sha256').update(`${seed.url}|${seed.dateValue}`).digest('hex').slice(0, 16),
        title: seed.title, dateValue: seed.dateValue, description, image: image ? new URL(image, seed.url).href : '',
        place: seed.place || source.name, address: source.address || '', city: source.city || '', source: source.name, url: seed.url,
        ageText: `${seed.title} ${detailText}`
      });
      return { ...event, ...costInfo('', detailText) };
    } catch { return null; }
  }));
  return events.filter(Boolean);
}

// Palo Alto publishes a server-rendered citywide event directory.  The city
// also lists meetings and administrative notices here, so this reader only
// keeps entries whose official title, summary, or tags explicitly identify a
// child, teen, or family audience.
async function readPaloAlto(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/list-container events-list-container/i.test(html)) {
    throw new Error('Palo Alto official calendar was not valid: ' + response.status);
  }
  const monthNumbers = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const youthSignal = /children|kids?|famil(?:y|ies)|youth|teen|toddler|preschool|elementary|middle school|high school|all ages|parent(?:s)?\s*(?:and|&)\s*(?:child|kid)/i;
  const excluded = /\b(?:committee|commission|council|board|meeting|recruitment|hearing|work session)\b/i;
  const seen = new Set();
  return [...html.matchAll(/<div class=["']list-item-container[\s\S]*?<\/article>/gi)].flatMap(blockMatch => {
    const block = blockMatch[0];
    const href = htmlAttribute(block, /<a[^>]+href=["']([^"']+)["']/i);
    const title = plainText(block.match(/list-item-title[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
    const day = htmlAttribute(block, /part-date[^>]*>([\s\S]*?)<\/span>/i);
    const month = htmlAttribute(block, /part-month[^>]*>([\s\S]*?)<\/span>/i).slice(0, 3).toLowerCase();
    const year = htmlAttribute(block, /part-year[^>]*>([\s\S]*?)<\/span>/i);
    const description = htmlAttribute(block, /list-item-block-desc[^>]*>([\s\S]*?)<\/span>/i);
    const venue = htmlAttribute(block, /list-item-address[^>]*>([\s\S]*?)<\/p>/i).replace(/\s*,\s*/g, ', ');
    const tags = htmlAttribute(block, /tagged-as-list[\s\S]*?<span class=["']text["'][^>]*>([\s\S]*?)<\/span>\s*<\/p>/i);
    const image = htmlAttribute(block, /<img[^>]+src=["']([^"']+)["']/i);
    const dateValue = year && monthNumbers[month] && day ? `${year}-${monthNumbers[month]}-${String(Number(day)).padStart(2, '0')}` : '';
    const audienceText = `${title} ${description} ${tags}`;
    const url = href ? new URL(href, source.feedUrl).href : '';
    const key = `${url}|${dateValue}`;
    if (!title || !url || !dateValue || seen.has(key) || !isUpcoming(dateValue) || !youthSignal.test(audienceText) || excluded.test(title)) return [];
    seen.add(key);
    const parts = venue.split(',').map(value => value.trim()).filter(Boolean);
    const place = parts.shift() || source.name;
    const cityIndex = parts.findIndex(value => /^palo alto(?:\s+ca)?$/i.test(value));
    const street = cityIndex >= 0 ? parts.slice(0, cityIndex).join(', ') : '';
    const event = directEvent({
      id: 'paloalto-' + createHash('sha256').update(key).digest('hex').slice(0, 16), title, dateValue, description,
      image: image ? new URL(image, source.feedUrl).href : '', place, address: shortAddress(street, 'Palo Alto'), city: 'Palo Alto',
      source: source.name, url, ageText: audienceText
    });
    return [{ ...event, ...costInfo('', description) }];
  });
}

// Happy Hollow exposes its special-event calendar as server-rendered Event
// schema.  It also includes daily operating hours in that same calendar;
// those are intentionally excluded because they are not activities.
async function readHappyHollow(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/simcal-event/i.test(html)) throw new Error('Happy Hollow official calendar was not valid: ' + response.status);
  const youthSignal = /children|kids?|famil(?:y|ies)|youth|toddler|preschool|school|animal|zoo|park/i;
  return [...html.matchAll(/<li class=["'][^"']*simcal-event[^"']*["'][\s\S]*?<\/li>/gi)].flatMap((match, index) => {
    const block = match[0];
    const title = plainText(block.match(/class=["'][^"']*simcal-event-title[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || '');
    const description = plainText(block.match(/class=["'][^"']*simcal-event-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const dateValue = htmlAttribute(block, /itemprop=["']startDate["']\s+content=["']([^"']+)["']/i);
    const image = htmlAttribute(block, /<img[^>]+src=["']([^"']+)["']/i);
    const text = `${title} ${description}`;
    if (!title || !isUpcoming(dateValue) || /^today'?s hours/i.test(title) || /\bhours?\b/i.test(title) || !youthSignal.test(text) || /\b(?:gala|fundraiser|senior)\b/i.test(text)) return [];
    const event = directEvent({
      id: 'happyhollow-' + createHash('sha256').update(`${title}|${dateValue}|${index}`).digest('hex').slice(0, 16), title, dateValue, description,
      image: image ? new URL(image, source.feedUrl).href : '', place: source.name, address: source.address || '', city: source.city || '',
      source: source.name, url: source.feedUrl, ageText: text
    });
    return hasActivitySummary(event.description) ? [{ ...event, ...costInfo('', description) }] : [];
  });
}

// Gilroy Gardens publishes every dated occurrence as Event schema on its
// calendar.  Opening hours use that schema too, so each named activity is
// matched to its official WordPress detail page before it can be published.
async function readGilroyGardens(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok || !/calendar-hours|application\/ld\+json/i.test(html)) throw new Error('Gilroy Gardens official calendar was not valid: ' + response.status);
  const schemaEvents = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
    try { return eventNodes(JSON.parse(match[1].trim())); } catch { return []; }
  }).filter(item => {
    const type = item?.['@type'];
    return type === 'Event' || (Array.isArray(type) && type.includes('Event'));
  });
  const seeds = [...new Map(schemaEvents.flatMap(item => {
    const title = decodeXml(item.name || '').trim();
    const dateValue = String(item.startDate || '');
    if (!title || !isUpcoming(dateValue) || /^(?:regular )?park hours$/i.test(title)) return [];
    return [[`${title}|${dateValue}`, { title, dateValue }]];
  })).values()];
  const detailsByTitle = new Map();
  await Promise.all([...new Set(seeds.map(seed => seed.title.toLowerCase()))].map(async normalizedTitle => {
    try {
      const searchUrl = new URL('/wp-json/wp/v2/search', source.feedUrl);
      searchUrl.search = new URLSearchParams({ search: normalizedTitle, per_page: '10' });
      const searchResponse = await fetch(searchUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const results = await searchResponse.json();
      if (!searchResponse.ok || !Array.isArray(results)) return;
      const exact = results.filter(item => plainText(item.title || '').toLowerCase() === normalizedTitle);
      const result = exact.find(item => item.subtype === 'page') || exact.find(item => item.subtype === 'upcoming-events') || exact[0];
      if (!result?.url) return;
      const detailResponse = await fetch(result.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      if (!detailResponse.ok) return;
      const description = decodeXml(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
      const image = decodeXml(detail.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || '');
      if (!hasActivitySummary(description)) return;
      detailsByTitle.set(normalizedTitle, { url: result.url, description, image, detailText: plainText(detail) });
    } catch { /* A missing campaign landing page is not a publishable activity. */ }
  }));
  return seeds.flatMap(seed => {
    const detail = detailsByTitle.get(seed.title.toLowerCase());
    if (!detail) return [];
    const event = directEvent({
      id: 'gilroy-' + createHash('sha256').update(`${seed.title}|${seed.dateValue}`).digest('hex').slice(0, 16),
      title: seed.title, dateValue: seed.dateValue, description: detail.description, image: detail.image,
      place: source.name, address: source.address || '', city: source.city || '', source: source.name, url: detail.url,
      ageText: `${seed.title} ${detail.description} ${detail.detailText}`
    });
    return [{ ...event, ...costInfo('', detail.detailText) }];
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
const directSources = sources.filter(source => ['rss', 'tribe', 'thetech', 'foothill', 'midpen', 'stanford', 'cupertino', 'slac', 'chm', 'deanza', 'paloalto', 'happyhollow', 'gilroy'].includes(source.method) && source.feedUrl);
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(new Date());
// Scheduled runs have no workflow input (empty value), so they use the normal
// Tuesday/Thursday fallback. A manually dispatched `false` explicitly disables
// it; `true` explicitly enables it on any weekday.
const serpapiInput = process.env.INCLUDE_SERPAPI;
const includeSerpapi = serpapiInput === 'true'
  || (serpapiInput !== 'false' && ['Tue', 'Thu'].includes(weekday));
const searchSources = includeSerpapi ? sources.filter(source => !['rss', 'tribe', 'thetech', 'foothill', 'midpen', 'stanford', 'cupertino', 'slac', 'chm', 'deanza', 'paloalto', 'happyhollow', 'gilroy'].includes(source.method)) : [];
if (searchSources.length && !key) throw new Error('SERPAPI_KEY is required when the fallback search is scheduled or manually enabled.');

const feedAttempts = await Promise.allSettled(directSources.map(source => {
  if (source.method === 'tribe') return readTribe(source);
  if (source.method === 'thetech') return readTheTech(source);
  if (source.method === 'foothill') return readFoothill(source);
  if (source.method === 'midpen') return readMidpen(source);
  if (source.method === 'stanford') return readStanford(source);
  if (source.method === 'cupertino') return readCupertino(source);
  if (source.method === 'slac') return readSlac(source);
  if (source.method === 'chm') return readChm(source);
  if (source.method === 'deanza') return readDeAnza(source);
  if (source.method === 'paloalto') return readPaloAlto(source);
  if (source.method === 'happyhollow') return readHappyHollow(source);
  if (source.method === 'gilroy') return readGilroyGardens(source);
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
const individualEvents = [...new Map([...feedEvents, ...candidates]
  .map(event => [event.url.toLowerCase(), event])).values()]
  // A card must explain what the activity is. We do not replace missing
  // organizer copy with generic prompts or publish logistics-only text.
  .filter(event => hasActivitySummary(event.description))
  .sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));

function seriesKey(event) {
  // Deliberately conservative: different themes, venues, audience rules, or
  // pricing stay as separate cards even when a host reuses the same title.
  return [event.source, event.title, event.description, event.place, event.address, event.meetingPoint, event.city, event.type,
    (event.ageBands || []).join(','), event.costLabel, event.costSource].join('\u001f');
}

function groupRepeatedSessions(items) {
  const groups = new Map();
  items.forEach(event => { const key = seriesKey(event); (groups.get(key) || groups.set(key, []).get(key)).push(event); });
  return [...groups.entries()].flatMap(([key, group]) => {
    const ordered = group.sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));
    if (ordered.length === 1) return ordered;
    const first = ordered[0];
    return [{
      ...first,
      id: 'series-' + createHash('sha256').update(key).digest('hex').slice(0, 16),
      legacyIds: ordered.map(event => event.id),
      sessions: ordered.map(event => ({ id: event.id, date: event.date, dateValue: event.dateValue, url: event.url }))
    }];
  }).sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));
}

const events = groupRepeatedSessions(individualEvents);

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

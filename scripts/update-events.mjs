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
  // One parent-facing taxonomy: categorize by the main experience, not by
  // the organizer or every subject mentioned in the description.
  if (/\b(?:vs\.?|versus|football|soccer|hockey|baseball|basketball|matchday|regular season|playoffs?)\b/.test(value)) return 'sports';
  if (/\b(?:show|theat(?:er|re)|concert|performance|musical|dance recital|magic|planetarium|laser show|ice show)\b/.test(value)) return 'shows';
  if (/\b(?:museum|gallery|exhibit(?:ion)?|on view|collection)\b/.test(value)) return 'museums';
  if (/\b(?:bike|bicycle)\b[^.!?]{0,48}\brepair\b|\b(?:community service|volunteer(?:ing)?|cleanup|donation|food drive|swap|mento(?:r|ring)|appointment|customer service|career help|tech help|free snacks|festival|celebration)\b/.test(value)) return 'community';
  if (/\b(?:hike|nature(?:\s+walk)?|trail|wildlife|marsh|forest|creek|pond|ranger|bird(?:s)?\b|habitat restoration|environmental education)\b/.test(value)) return 'outdoor';
  if (/\b(?:story ?time|stay (?:&|and) play|play(?:time)?|games?|lego|scavenger hunt|board games?|puzzle|toddler|tiny tot|baby bounce)\b/.test(value)) return 'play';
  if (/\b(?:art(?:s)?|crafts?|paint(?:ing)?|photography|knit(?:ting)?|crochet|tie-dye|ceramics?|pottery|drawing|design)\b/.test(value)) return 'arts';
  if (/\b(?:science|stem|robot(?:ics)?|technology|tech|learn(?:ing)?|engineering|coding|computer|3d print(?:ing)?|forensics|dna|astronomy|physics|math(?:ematics)?|tutor(?:ing)?|chess|black holes?|solar|sun|moon|space|cosmic|earthquake|homeschool)\b/.test(value)) return 'learning';
  if (/\b(?:workshop|class|course|yoga|tai chi|meditation|mindfulness|wellness|breathwork|line dancing|movement class|fitness|cooking|baking)\b/.test(value)) return 'workshops';
  return 'community';
}
function formatFor(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(?:vs\.?|versus|football|soccer|hockey|baseball|basketball|matchday|regular season|playoffs?)\b/.test(value)) return 'sports-game';
  if (/\b(?:museum|gallery|exhibit(?:ion)?|collection)\b/.test(value) && /\b(?:tour|family day|drawing|drop-in|workshop|program)\b/.test(value)) return 'museum-program';
  if (/\b(?:exhibit(?:ion)?|on view|gallery)\b/.test(value)) return 'museum-exhibition';
  if (/\b(?:show|theat(?:er|re)|concert|performance|musical|dance|magic|planetarium|laser|ice (?:show|skating))\b/.test(value)) return 'live-show';
  return 'program';
}
const labels = { sports: '体育与比赛', shows: '演出与表演', museums: '博物馆与展览', outdoor: '户外自然', arts: '艺术与创作', learning: '学习与 STEM', play: '故事与玩乐', community: '社区与家庭', workshops: '课程与工作坊' };
const icons = { sports: '⚽', shows: '🎭', museums: '🏛️', outdoor: '🌿', arts: '🎨', learning: '🔭', play: '🎈', community: '🤝', workshops: '🛠️' };
const colors = { sports: '#dce7fa', shows: '#f0def2', museums: '#ece5d8', outdoor: '#d8eee0', arts: '#ffd9bd', learning: '#dce7fa', play: '#ffe9a8', community: '#dceeea', workshops: '#e7ddf6' };
const fallbackTime = '请点击活动详情查看活动时间';
const generatedAt = new Date().toISOString();

function isFamilyRelevant(event) {
  const value = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  // Do not surface professional education or clinical-provider training as a
  // family activity merely because it appears on a broad local event calendar.
  if (/\b(?:primary care provider|healthcare professional|medical professional|continuing medical education|cme credits?|clinician training|physician training)\b/.test(value)) return false;
  // An organizer's explicit 18+ audience is an adult-only activity. Never
  // let a broad venue/category such as "Family Learning Center" override it.
  return !isExplicitlyAdultOnly(`${event.title || ''} ${event.description || ''} ${event.ageLabel || ''}`)
    && !(Number(event.ageMin) >= 18 && Number(event.ageMax) >= 18);
}

function hasExplicitChildAudience(text) {
  return /\b(?:bab(?:y|ies)|infants?|toddlers?|pre-?school(?:ers?)?|young children|children|kids?|school age|pre-?teens?|tweens?|teens?|all ages|grades?)\b/i.test(plainText(text));
}

function isExplicitlyAdultOnly(text) {
  const value = plainText(text);
  const adult18Plus = /\badults?\s*,?\s*(?:ages?\s*)?18\s*\+|\badults?\s+only\b|\bages?\s*18\s*\+\s*(?:only)?\b/i.test(value);
  return adult18Plus && !hasExplicitChildAudience(value);
}
function withPresentationFields(event) {
  const audienceText = `${event.title || ''} ${event.description || ''} ${event.ageLabel || ''} ${event.ageSource || ''}`;
  return {
    ...event,
    format: event.format || formatFor(audienceText),
    audienceStatus: event.audienceStatus || (event.ageSource ? 'organizer-confirmed' : 'not-confirmed')
  };
}

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

// A parent chooses a child's actual age, so cards must preserve the
// organizer's age range instead of reducing it to a broad school-grade band.
// `ageMin` and `ageMax` drive the filter; `ageLabel` is the same range shown
// on the card.  We only create a range from explicit organizer wording or a
// structured organizer age category, never from a generic "kids" mention.
const writtenAges = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18 };
const ageNumber = value => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^\d+$/.test(normalized) ? Number(normalized) : writtenAges[normalized];
};

function ageInfo(categories) {
  const text = plainText(categories).replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const familyFriendly = /family(?:-friendly)?/.test(lower);
  const allAges = /\ball ages?\b|\bfor all ages\b|\bappropriate for all ages\b/.test(lower);

  const ranges = [];
  const addRange = (min, max) => {
    if (Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min && max <= 18) ranges.push([min, max]);
  };
  const token = '(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|\\d{1,2})';
  const rangePattern = new RegExp(`(?:suggested\\s+)?ages?\\s*${token}\\s*(?:-|–|—|to)\\s*${token}`, 'gi');
  for (const match of text.matchAll(rangePattern)) addRange(ageNumber(match[1]), ageNumber(match[2]));
  for (const match of text.matchAll(/(?:kids?|teens?|pre-?teens?|tweens?)\s*\(\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*\)/gi)) addRange(Number(match[1]), Number(match[2]));
  for (const match of text.matchAll(/(?:young children|kids?|pre-?teens?|teens?)\s*,?\s*ages?\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/gi)) addRange(Number(match[1]), Number(match[2]));
  for (const match of text.matchAll(/(?:ages?\s*)?(\d{1,2})\s*(?:years?\s*(?:old)?\s*)?(?:and|or)\s*under/gi)) addRange(0, Number(match[1]));
  // "Ages 6 and up" is an explicit organizer age recommendation. Keep the
  // open-ended wording on the card and use 18 only as the product's K–12
  // filter ceiling, not as an organizer-implied upper limit.
  const upMatch = text.match(/(?:recommended\s+for\s+)?ages?\s*(\d{1,2})\s*(?:(?:and|&)\s*up\b|\+)/i);
  let openEndedMin = null;
  if (upMatch) {
    const min = Number(upMatch[1]);
    addRange(min, 18);
    openEndedMin = min;
  }
  if (/bab(?:y|ies)\s*\(\s*under\s*2\s*\)|\bkids?:\s*bab(?:y|ies)\b|\bunder\s*2\b|\binfants?\b/.test(lower)) addRange(0, 1);
  if (/toddlers?|18\s*(?:months?|mos?)/.test(lower)) addRange(1, 3);
  if (/pre-?school(?:ers?)?/.test(lower)) addRange(3, 5);
  if (/\bpre-?teens?\b|\btweens?\b/.test(lower)) addRange(10, 13);
  if (/\bteens?\b/.test(lower)) addRange(13, 18);
  // A grade category is an official audience field but not an exact age
  // statement. Its conventional age equivalent is used only for matching;
  // the card keeps the organizer's grade wording so we do not imply precision.
  const gradeRange = lower.match(/grades?\s*(k|kindergarten|\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/);
  const isKindergarten = gradeRange?.[1] === 'k' || gradeRange?.[1] === 'kindergarten';
  const gradeStart = isKindergarten ? 0 : Number(gradeRange?.[1]);
  const gradeEnd = Number(gradeRange?.[2]);
  if (gradeRange && Number.isFinite(gradeStart) && Number.isFinite(gradeEnd) && gradeEnd >= 0 && gradeEnd <= 12) {
    const min = isKindergarten ? 5 : gradeStart + 5;
    addRange(min, gradeEnd + 5);
    if (ranges.length === 1) return { ageBands: [], ageRanges: [[min, gradeEnd + 5]], ageMin: min, ageMax: gradeEnd + 5, ageLabel: `Grades ${gradeRange[1].toUpperCase()}–${gradeEnd}`, ageSource: 'Official organizer grade range', familyFriendly };
  }
  if (!ranges.length && allAges) return { ageBands: ['all-ages'], ageRanges: [[0, 18]], ageMin: 0, ageMax: 18, ageLabel: 'All ages', ageSource: 'Official audience information', familyFriendly };
  if (!ranges.length) return { ageBands: familyFriendly ? ['family'] : [], ageRanges: [], ageMin: null, ageMax: null, ageLabel: familyFriendly ? 'Family-friendly' : '', ageSource: familyFriendly ? 'Official audience information' : '', familyFriendly };
  const normalized = ranges.sort((a, b) => a[0] - b[0]).reduce((merged, range) => {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([...range]);
    return merged;
  }, []);
  const min = normalized[0][0];
  const max = normalized.at(-1)[1];
  const label = openEndedMin !== null && normalized.length === 1 && normalized[0][0] === openEndedMin && normalized[0][1] === 18
    ? `Ages ${openEndedMin}+`
    : normalized.map(([start, end]) => start === end ? `Age ${start}` : `Ages ${start}–${end}`).join(' · ');
  return { ageBands: [], ageRanges: normalized, ageMin: min, ageMax: max, ageLabel: label, ageSource: 'Official audience information', familyFriendly };
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
    const categories = xmlTexts(item, 'category').join(' ');
    const categoriesLower = categories.toLowerCase();
    const familyAudience = /young children|kids|children|teens|family|all ages|school age/.test(categoriesLower);
    // Source category taxonomy may include a family-oriented department even
    // when the event itself is expressly for adults. Audience eligibility wins.
    if (isExplicitlyAdultOnly(categories)) return [];
    if (!title || !link || !isUpcoming(startDate) || !familyAudience || xmlText(item, 'is_cancelled') === 'true') return [];
    const description = xmlText(item, 'description');
    const type = typeFor(title + ' ' + categoriesLower + ' ' + description);
    const age = ageInfo(`${categories} ${description}`);
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
    const audienceText = `${title} ${item.description || ''} ${item.excerpt || ''} ${categories}`;
    const sourceFamilyPattern = source.familyPattern ? new RegExp(source.familyPattern, 'i') : null;
    if (!title || !item.url || !isUpcoming(startDate) || (sourceFamilyPattern && !sourceFamilyPattern.test(audienceText))) return [];
    const type = typeFor(title + ' ' + categories);
    // Do not infer a family age label from the calendar platform itself. The
    // card only shows an age range when the organizer actually supplied one.
    const age = ageInfo(audienceText);
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

async function readChcp(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/idUpcomingEventsContainer|boxesListItem/i.test(html)) throw new Error('CHCP official event list was not valid: ' + response.status);
  return html.split(/<li class=["']boxesListItem["'][^>]*>/i).slice(1).flatMap((block, index) => {
    const title = plainText(block.match(/class=["']eventDetailsLink["'][^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    const href = htmlAttribute(block, /class=["']eventDetailsLink["'][^>]*href=["']([^"']+)["']/i);
    const dateText = plainText(block.match(/eventInfoStartDate[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)?.[1] || '');
    const timeText = plainText(block.match(/eventInfoStartTime[\s\S]*?<div[^>]*eventInfoBoxValue[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const location = plainText(block.match(/eventInfoLocation[\s\S]*?<div[^>]*eventInfoBoxValue[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    let description = cardSummary(block, title);
    if (/^CAH Museum Open/i.test(title)) {
      description = 'Explore the Chinese American Historical Museum at History Park and its stories of early Chinese American communities in Santa Clara Valley.';
    } else if (/Doors Open Tour: Gilded Altars and Lost Chinatowns/i.test(title)) {
      description = 'A guided History Park tour exploring San José’s lost Chinatowns, Chinese American history, and the Chinese American Historical Museum.';
    }
    const dateValue = isoDateFromOfficialText(dateText, timeText);
    const eventText = `${title} ${description}`;
    const city = ['San Jose', 'Santa Clara', 'Mountain View', 'Palo Alto', 'Milpitas', 'Cupertino', 'Los Altos', 'Sunnyvale']
      .find(candidate => new RegExp(`\\b${candidate}\\b`, 'i').test(location)) || source.city || '';
    const familySignal = /\b(?:family|children|kids?|youth|teen|all ages|festival|celebration|cultural|museum open|hands-on|lion dance|scavenger hunt)\b/i.test(eventText);
    // CHCP's calendar also syndicates adult lectures and non-local events.
    // Keep only locally held cultural activities with an explicit family or
    // youth signal in CHCP's own title or description.
    if (!title || !href || !isUpcoming(dateValue) || /\bonline\b/i.test(location) || !/San Jose|Santa Clara|Mountain View|Palo Alto|Milpitas|Cupertino|Los Altos|Sunnyvale/i.test(location) || !familySignal || !hasActivitySummary(description)) return [];
    const url = new URL(href, source.feedUrl).href;
    const event = directEvent({
      id: 'chcp-' + createHash('sha256').update(`${url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, description,
      image: officialPageImage(block, source.feedUrl, /([\s\S]*)/),
      place: location || source.name, city, source: source.name, url,
      // “Festival” alone does not prove an age range. Only expose an age tag
      // when CHCP explicitly names an audience; otherwise leave it unlabelled.
      ageText: /family|children|kids?|youth|all ages/i.test(eventText) ? eventText : ''
    });
    return [event];
  });
}

function historySanJoseSummary(title) {
  const cleanTitle = plainText(title).replace(/^\*+|\*+$/g, '').trim();
  if (/children[’']?s halloween haunt/i.test(cleanTitle)) return 'A Halloween celebration created for children and families at History Park.';
  if (/italian family festa/i.test(cleanTitle)) return 'A free Italian cultural festival for families at History Park.';
  if (/lunar new year/i.test(cleanTitle)) return 'A family celebration of Lunar New Year with cultural performances and hands-on activities.';
  if (/family sunday/i.test(cleanTitle)) return 'A family program at History Park with activities that explore local history and culture.';
  return '';
}

async function readHistorySanJose(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/event-box\s+event_all_box/i.test(html)) throw new Error('History San José official event list was not valid: ' + response.status);
  return html.split(/<div class=["']event-box\s+event_all_box["'][^>]*>/i).slice(1).flatMap((block, index) => {
    const dateText = plainText(block.match(/<div class=["']event-content["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const title = plainText(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '').replace(/^\*+|\*+$/g, '').trim();
    const locationHtml = block.match(/<span class=["']eventlocation["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
    const locationText = plainText(locationHtml);
    const times = [...block.matchAll(/<span class=["']eventtime["'][^>]*>([\s\S]*?)<\/span>/gi)].map(match => plainText(match[1]));
    const url = htmlAttribute(block, /<a[^>]+class=["'][^"']*backend-button[^"']*["'][^>]+href=["']([^"']+)["']/i) || source.feedUrl;
    const image = htmlAttribute(block, /background-image:\s*url\(['"]?([^'")]+)/i);
    const dateValue = isoDateFromOfficialText(dateText, times[0] || '');
    const familySignal = /\b(?:children|child|family|families|kid|youth|teen|lunar new year|cultural)\b/i.test(`${title} ${locationText}`);
    const description = historySanJoseSummary(title);
    // The listing also contains fundraisers, private rentals, and adult-only
    // programs. Publish only when the official title has an explicit family
    // signal and it yields a parent-facing explanation of the activity.
    if (!title || !isUpcoming(dateValue) || !familySignal || !hasActivitySummary(description) || isExplicitlyAdultOnly(`${title} ${locationText}`)) return [];
    const event = directEvent({
      id: 'history-' + createHash('sha256').update(`${url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, description,
      image: image ? new URL(image, source.feedUrl).href : '',
      place: plainText(locationText.split(/\b(?:Cost:|Stay tuned|Tickets?)/i)[0]) || source.name,
      address: source.address || '', city: source.city || '', source: source.name, url,
      ageText: 'family'
    });
    return [event];
  });
}

function isoDateFromOfficialText(dateText, timeText = '') {
  const numeric = String(dateText || '').match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (numeric) {
    const date = [numeric[3], String(Number(numeric[1])).padStart(2, '0'), String(Number(numeric[2])).padStart(2, '0')].join('-');
    const time = String(timeText || '').replace(/\./g, '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
    if (!time) return date;
    let hour = Number(time[1]) % 12;
    if (time[3].toUpperCase() === 'PM') hour += 12;
    return date + 'T' + String(hour).padStart(2, '0') + ':' + (time[2] || '00');
  }
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
  // Organizer pages commonly use both "11 AM" and "11 a.m.". Normalize
  // periods before parsing so an official punctuation style never loses the
  // event time on the published card.
  const time = String(timeText || '').replace(/\./g, '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (!time) return date;
  let hour = Number(time[1]) % 12;
  if (time[3].toUpperCase() === 'PM') hour += 12;
  return date + 'T' + String(hour).padStart(2, '0') + ':' + (time[2] || '00');
}

function directEvent({ id, title, dateValue, description, image = '', place, address = '', city = '', meetingPoint = '', mapUrl = '', source, url, ageText = '', format = '' }) {
  const type = format === 'live-show' ? 'shows' : typeFor(title + ' ' + description + ' ' + ageText);
  const age = ageInfo(ageText);
  return {
    id, title, date: displayEventDate(dateValue), dateValue, ...age,
    costLabel: '费用未注明', costSource: '', type, icon: icons[type], color: colors[type], tag: labels[type],
    verification: 'official-page', lastVerifiedAt: generatedAt, format,
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
  const [response, physicsResponse, physicsScheduleResponse] = await Promise.all([
    fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) }),
    fetch('https://foothill.edu/physics/index.html', { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) }).catch(() => null),
    // The college homepage announces the show but currently lists only two
    // performances. The show's own official page has every ticketed session.
    fetch('https://www.thephysicsshow.com/home', { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) }).catch(() => null)
  ]);
  const html = await response.text();
  if (!response.ok || !/Events__item/i.test(html)) throw new Error('Foothill official event list was not valid: ' + response.status);
  const physicsHtml = physicsResponse?.ok ? await physicsResponse.text() : '';
  const physicsScheduleHtml = physicsScheduleResponse?.ok ? await physicsScheduleResponse.text() : '';
  const physicsSummary = cardSummary(physicsHtml.match(/Physics Show at Foothill[\s\S]{0,1200}?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  const physicsImage = officialPageImage(physicsHtml, 'https://foothill.edu/physics/index.html', /(<img[^>]+alt=["'][^"']*Physics Show[^"']*["'][^>]*>)/i);
  const physicsScheduleYear = Number(physicsScheduleHtml.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},\s+(20\d{2})\b/i)?.[1]
    || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()).slice(0, 4));
  const scheduledPhysicsSessions = [...physicsScheduleHtml.matchAll(/<a[^>]+href=["']([^"']*eventcreate[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap((match, index) => {
    const url = decodeXml(match[1]).trim();
    const text = plainText(match[2]);
    const dateText = text.match(/\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/)?.[1] || '';
    const timeText = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i)?.[1] || '';
    // A few Google Sites anchors contain a nested span that ends the HTML
    // match before their visible label. The EventCreate URL still has the
    // exact official month, day, and start time, so use it as a lossless
    // fallback rather than dropping those performances.
    const urlSchedule = url.match(/the-physics-show-([a-z]{3,9})-(\d{1,2})-(\d{1,4})(am|pm)\b/i);
    const urlMonth = urlSchedule ? months[urlSchedule[1].slice(0, 3).toLowerCase()] : null;
    const timeNumber = urlSchedule ? Number(urlSchedule[3]) : null;
    const minutes = timeNumber && timeNumber >= 100 ? timeNumber % 100 : 0;
    let hour = timeNumber && timeNumber >= 100 ? Math.floor(timeNumber / 100) : timeNumber;
    if (urlSchedule && urlSchedule[4].toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (urlSchedule && urlSchedule[4].toLowerCase() === 'am' && hour === 12) hour = 0;
    const dateValue = isoDateFromOfficialText(dateText, timeText)
      || (urlMonth && Number.isInteger(hour) ? `${physicsScheduleYear}-${String(urlMonth).padStart(2, '0')}-${String(Number(urlSchedule[2])).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : '');
    if (!url || !dateValue || !isUpcoming(dateValue)) return [];
    return [directEvent({
      id: 'physics-show-' + createHash('sha256').update(`${url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title: 'The Physics Show', dateValue, description: physicsSummary, image: physicsImage,
      place: 'Smithwick Theatre', address: source.address || '', city: source.city || '', source: source.name, url
    })];
  });
  const homepageEvents = html.split(/<div class="Events__item">/i).slice(1).flatMap(block => {
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
    // When the dedicated official schedule is available, it supersedes the
    // partial performance list on the college homepage.
    if (cleanTitle === 'The Physics Show' && scheduledPhysicsSessions.length) return [];
    return [directEvent({
      id: 'foothill-' + createHash('sha256').update(title).digest('hex').slice(0, 16),
      title: cleanTitle, dateValue, description: cleanTitle === 'The Physics Show' ? physicsSummary : '', image: cleanTitle === 'The Physics Show' ? physicsImage : '',
      place, address: source.address || '', city: source.city || '', source: source.name, url: title
    })];
  });
  return [...homepageEvents, ...scheduledPhysicsSessions];
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

function pacificDateTime(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(value)).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function currentNhlSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}${start + 1}`;
}

async function readNhl(source) {
  const response = await fetch(`${source.feedUrl}${currentNhlSeason()}`, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.games)) throw new Error('NHL official schedule was not valid: ' + response.status);
  return payload.games.flatMap(game => {
    if (game.homeTeam?.abbrev !== 'SJS' || !isUpcoming(game.gameDate) || !game.startTimeUTC) return [];
    const opponent = [game.awayTeam?.placeName?.default, game.awayTeam?.commonName?.default].filter(Boolean).join(' ');
    const dateValue = pacificDateTime(game.startTimeUTC);
    const url = `https://www.nhl.com/sharks/gamecenter/sjs-vs-${String(game.awayTeam?.abbrev || '').toLowerCase()}/${dateValue.slice(0, 4)}/${dateValue.slice(5, 7)}/${dateValue.slice(8, 10)}/${game.id}`;
    return [directEvent({
      id: `nhl-${game.id}`, title: `San Jose Sharks vs ${opponent}`, dateValue,
      description: `Official San Jose Sharks home game against the ${opponent}.`, image: game.homeTeam?.logo || '',
      place: game.venue?.default || 'SAP Center at San Jose', address: source.address || '', city: source.city || '', source: source.name, url,
      ageText: 'all ages', format: 'sports-game'
    })];
  });
}

async function readBayfc(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/match-type-home/i.test(html)) throw new Error('Bay FC official schedule was not valid: ' + response.status);
  const year = Number(html.match(/\b(20\d{2})\s+Schedule\b/i)?.[1] || new Date().getFullYear());
  const monthLookup = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  return html.split(/<div class=["'][^"']*\bgb-query-loop-item\b/i).slice(1).flatMap(block => {
    if (!/\bmatch-type-home\b/i.test(block)) return [];
    const plain = plainText(block);
    const day = plain.match(/\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+([A-Z][a-z]{2})\s+(\d{1,2})\b/);
    const time = plain.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\s*PT\b/i);
    const opponent = plainText(block.match(/gb-headline-b003332e[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '').replace(/^At\s+/i, '');
    const matchUrl = htmlAttribute(block, /gb-headline-b003332e[^>]*>\s*<a[^>]+href=["']([^"']+)/i);
    const image = htmlAttribute(block, /gb-image-f65ac648[^>]+src=["']([^"']+)/i);
    if (!day || !time || !opponent || !matchUrl) return [];
    let hour = Number(time[1]) % 12; if (time[3].toLowerCase() === 'pm') hour += 12;
    const dateValue = `${year}-${String(monthLookup[day[1].toLowerCase()]).padStart(2, '0')}-${String(day[2]).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${time[2]}`;
    if (!isUpcoming(dateValue)) return [];
    return [directEvent({
      id: 'bayfc-' + createHash('sha256').update(`${matchUrl}|${dateValue}`).digest('hex').slice(0, 16), title: `Bay FC vs ${opponent}`, dateValue,
      description: `Official Bay FC home match against ${opponent} at PayPal Park.`, image: image ? new URL(image, source.feedUrl).href : '',
      place: 'PayPal Park', address: source.address || '', city: source.city || '', source: source.name, url: new URL(matchUrl, source.feedUrl).href,
      ageText: 'all ages', format: 'sports-game'
    })];
  });
}

async function readMlb(source) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  // The public MiLB endpoint rejects broad, cross-season ranges. A rolling
  // 120-day window is sufficient for family planning and refreshes daily.
  const end = new Date(); end.setUTCDate(end.getUTCDate() + 120);
  const endDate = end.toISOString().slice(0, 10);
  const url = new URL(source.feedUrl);
  url.searchParams.set('sportId', '14'); url.searchParams.set('startDate', today); url.searchParams.set('endDate', endDate); url.searchParams.set('hydrate', 'teams,venue');
  const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.dates)) throw new Error('MLB official schedule was not valid: ' + response.status);
  return payload.dates.flatMap(day => day.games || []).flatMap(game => {
    if (game.teams?.home?.team?.id !== 476 || !game.gameDate || !isUpcoming(game.gameDate)) return [];
    const opponent = game.teams?.away?.team?.name || 'away team';
    return [directEvent({
      id: `mlb-${game.gamePk}`, title: `San Jose Giants vs ${opponent}`, dateValue: pacificDateTime(game.gameDate),
      description: `Official San Jose Giants home game against ${opponent} at Excite Ballpark.`, image: '',
      place: game.venue?.name || 'Excite Ballpark', address: source.address || '', city: source.city || '', source: source.name,
      url: 'https://www.milb.com/san-jose/schedule', ageText: 'all ages', format: 'sports-game'
    })];
  });
}

async function readMls(source) {
  const seasonResponse = await fetch(source.feedUrl, { headers: { accept: 'application/json', 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const seasonPayload = await seasonResponse.json();
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }).format(new Date()));
  const season = (seasonPayload.seasons || []).find(item => Number(item.season) === currentYear) || (seasonPayload.seasons || []).find(item => Number(item.season) === currentYear + 1);
  if (!seasonResponse.ok || !season?.season_id) throw new Error('MLS official seasons endpoint was not valid: ' + seasonResponse.status);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const end = new Date(); end.setUTCDate(end.getUTCDate() + 150);
  const scheduleUrl = new URL(`https://stats-api.mlssoccer.com/matches/seasons/${season.season_id}`);
  scheduleUrl.searchParams.set('match_date[gte]', today); scheduleUrl.searchParams.set('match_date[lte]', end.toISOString().slice(0, 10));
  scheduleUrl.searchParams.set('competition_id', 'MLS-COM-000001'); scheduleUrl.searchParams.set('per_page', '100'); scheduleUrl.searchParams.set('sort', 'planned_kickoff_time:asc');
  const response = await fetch(scheduleUrl, { headers: { accept: 'application/json', 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.schedule)) throw new Error('MLS official schedule was not valid: ' + response.status);
  return payload.schedule.flatMap(match => {
    if (match.home_team_id !== 'MLS-CLU-00000Q' || !match.planned_kickoff_time || !isUpcoming(match.planned_kickoff_time)) return [];
    const opponent = match.away_team_name || 'away team';
    const venueName = match.stadium_name || 'PayPal Park';
    const city = /levi/i.test(venueName) ? 'Santa Clara' : (source.city || 'San Jose');
    const address = /levi/i.test(venueName) ? '4900 Marie P DeBartolo Way, Santa Clara' : (source.address || '');
    return [directEvent({
      id: `mls-${match.match_id}`, title: `San Jose Earthquakes vs ${opponent}`, dateValue: pacificDateTime(match.planned_kickoff_time),
      description: `Official San Jose Earthquakes home match against ${opponent} at ${venueName}.`, image: '', place: venueName, address, city,
      source: source.name, url: `https://www.sjearthquakes.com/schedule/matches#${encodeURIComponent(match.match_id)}`, ageText: 'all ages', format: 'sports-game'
    })];
  });
}

async function readShoware(source) {
  const response = await fetch(source.feedUrl, { headers: { accept: 'application/json', 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.performance)) throw new Error('ShoWare official performance list was not valid: ' + response.status);
  return payload.performance.flatMap(item => {
    const dateValue = isoDateFromOfficialText(item.PerformanceDateTime || '');
    const description = plainText(item.Description || '');
    const title = plainText(item.Event || '').replace(/^\s*\([^)]*\)\s*/i, '').replace(/\s*-\s*go to\b.*$/i, '').trim();
    if (!title || !dateValue || !isUpcoming(dateValue) || !hasActivitySummary(description)) return [];
    const eventId = item.EventID || item.PerformanceID;
    const url = new URL(`eventperformances.asp?evt=${encodeURIComponent(eventId)}`, 'https://pact.showare.com/');
    url.hash = `performance-${item.PerformanceID}`;
    const ageText = `${description} ${item.PerformanceName || ''}`;
    return [directEvent({
      id: `showare-${item.PerformanceID}`, title, dateValue, description, image: '',
      place: item.Venue || source.name, address: String(item.VenueAddress || source.address || '').replace(/\s*1305 Middlefield Rd\s*$/i, '').trim() || source.address || '', city: item.VenueCity || source.city || '',
      source: source.name, url: url.href, ageText, format: 'live-show'
    })];
  });
}

// CMT publishes its season and each production as public WordPress pages.
// We read the production page rather than treating the season announcement as
// a calendar: only pages that explicitly say the show is family-friendly (or
// all ages) and list individual public performance times are published.
async function readCmt(source) {
  const headers = { accept: 'application/json', 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const parsePayload = text => {
    // The WordPress endpoint occasionally prepends a harmless stylesheet tag.
    // Locate the actual JSON object instead of making the refresh fragile.
    const start = text.indexOf('{"id"');
    if (start < 0) throw new Error('CMT official API returned no page JSON');
    return JSON.parse(text.slice(start));
  };
  const seasonResponse = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
  const season = parsePayload(await seasonResponse.text());
  if (!seasonResponse.ok || !season?.content?.rendered) throw new Error('CMT official season page was not valid: ' + seasonResponse.status);
  const seasonText = plainText(season.content.rendered);
  const year = Number(seasonText.match(/\b(20\d{2})\b/)?.[1] || new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }).format(new Date()));
  const seasonTitles = [...seasonText.matchAll(/CMT\s+(?:Junior Talents|Rising Stars)[\s\S]{0,140}?([A-Z][\w'’:&,!?. -]+?)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/gi)]
    .map(match => plainText(match[1]).replace(/^(?:Disney\s+)?/i, '').trim())
    .filter(title => title.length > 2);
  const seen = new Set();
  const titles = seasonTitles.filter(title => !seen.has(title.toLowerCase()) && seen.add(title.toLowerCase()));
  const shows = await Promise.all(titles.map(async seasonTitle => {
    try {
      const lookup = new URL('https://www.cmtsj.org/wp-json/wp/v2/search');
      lookup.searchParams.set('search', seasonTitle);
      lookup.searchParams.set('per_page', '10');
      const searchResponse = await fetch(lookup, { headers, signal: AbortSignal.timeout(15000) });
      const matches = JSON.parse(await searchResponse.text().then(text => text.slice(text.indexOf('['))));
      const match = matches.find(item => item.subtype === 'page' && new RegExp(seasonTitle.split(/\s+/).slice(0, 2).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i').test(item.title || ''));
      if (!searchResponse.ok || !match?.id) return [];
      const detailResponse = await fetch(`https://www.cmtsj.org/wp-json/wp/v2/pages/${match.id}`, { headers, signal: AbortSignal.timeout(15000) });
      const detail = parsePayload(await detailResponse.text());
      const html = detail.content?.rendered || '';
      const text = plainText(html);
      // CMT has adult/older-teen productions too. The site must not infer
      // suitability merely because young performers are on stage.
      if (!detailResponse.ok || !/family-friendly|for all ages|all ages/i.test(text)) return [];
      const title = plainText(detail.title?.rendered || seasonTitle).replace(/\s+The Musical Jr\.?$/i, ' The Musical Jr.').trim();
      const summary = text.match(/\b(?:Follow|Join|Discover)\b[^.]{20,360}[.]/i)?.[0]
        || text.match(/(?:family-friendly|for all ages)[^.]{0,360}[.]/i)?.[0] || '';
      const slots = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)];
      if (!title || !summary || !slots.length) return [];
      const imageId = html.match(/\[vc_single_image\s+image=&#8221;(\d+)/i)?.[1] || '';
      let image = '';
      if (imageId) {
        try {
          const mediaResponse = await fetch(`https://www.cmtsj.org/wp-json/wp/v2/media/${imageId}`, { headers, signal: AbortSignal.timeout(15000) });
          if (mediaResponse.ok) image = JSON.parse(await mediaResponse.text()).source_url || '';
        } catch { /* Card fallback art is used when the official asset is unavailable. */ }
      }
      return slots.flatMap(slot => {
        let hour = Number(slot[3]) % 12; if (slot[5].toLowerCase() === 'pm') hour += 12;
        const dateValue = `${year}-${String(slot[1]).padStart(2, '0')}-${String(slot[2]).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${slot[4] || '00'}`;
        if (!isUpcoming(dateValue)) return [];
        return [directEvent({
          id: 'cmt-' + createHash('sha256').update(`${detail.link}|${dateValue}`).digest('hex').slice(0, 16), title, dateValue,
          description: summary, image, place: 'Montgomery Theater', address: source.address || '', city: source.city || '',
          source: source.name, url: detail.link, ageText: 'all ages family-friendly', format: 'live-show'
        })];
      });
    } catch { return []; }
  }));
  return shows.flat();
}

// PYT exposes its forthcoming productions as ordinary, public show pages.
// Each page lists its actual ticketed performance times, age suitability,
// price, venue and a show image—better evidence than a season-announcement.
async function readPyt(source) {
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const response = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/\/boxoffice\//i.test(html)) throw new Error('PYT official show list was not valid: ' + response.status);
  const links = [...new Set([...html.matchAll(/href=["'](https:\/\/pytnet\.org\/boxoffice\/[^"'#?]+\/?)["']/gi)].map(match => match[1]))].slice(0, 16);
  const shows = await Promise.all(links.map(async url => {
    try {
      const detailResponse = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      const text = plainText(detail);
      if (!detailResponse.ok || !/appropriate for all ages/i.test(text)) return [];
      const title = plainText(detail.match(/<h1[^>]*class=["'][^"']*heading[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
      const descriptionCandidates = [...detail.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(match => plainText(match[1]))
        .filter(value => hasActivitySummary(value) && !/^(?:performances?|dates?|location|length|appropriate|general admission|student matinee|tickets?|box office|auditions?)\b/i.test(value))
        .filter(value => !/\b(?:audition|rehears|conflict|casting|participation fee|volunteer hours?|student groups?)\b/i.test(value));
      const description = descriptionCandidates.find(value => /\b(?:follow|find out|discover|story|tale|adventure|journey|based on|world premiere)\b/i.test(value))
        || descriptionCandidates.find(value => /\b(?:musical|production)\b/i.test(value) && value.length > 90) || descriptionCandidates[0] || '';
      const clearDescription = description.match(/\b(?:Follow|Find out|Discover)\b[^.!?]{20,360}[.!?]/i)?.[0] || description;
      const year = text.match(/\b(20\d{2})\b/)?.[1] || '';
      const image = decodeXml(detail.match(/<div\s+id=["']sub-banner["'][\s\S]*?<img[^>]+src=["']([^"']+)/i)?.[1] || '');
      const ticketRows = [...detail.matchAll(/<div\s+class=["']ticket-row["'][\s\S]*?<div\s+class=["']ticket-col ticketname["'][\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>[\s\S]*?<div\s+class=["']ticket-col ticketdate["'][\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/gi)];
      if (!title || !hasActivitySummary(description)) return [];
      return ticketRows.flatMap(row => {
        const ticketType = plainText(row[1]);
        // The product is for families planning outings, not closed school
        // field trips; retain only the public performance inventory.
        if (!/general admission/i.test(ticketType)) return [];
        const dateText = plainText(row[2]);
        const dateValue = isoDateFromOfficialText(dateText.replace(/\b(am|pm)\b/i, `$1, ${year}`), dateText);
        if (!isUpcoming(dateValue)) return [];
        const event = directEvent({
          id: 'pyt-' + createHash('sha256').update(`${url}|${dateValue}`).digest('hex').slice(0, 16), title, dateValue, description: clearDescription,
          image, place: 'Mountain View Center for the Performing Arts', address: source.address || '', city: source.city || '',
          source: source.name, url, ageText: 'all ages', format: 'live-show'
        });
        return [{ ...event, ...costInfo('$17–$20', text) }];
      });
    } catch { return []; }
  }));
  return shows.flat();
}

// The Barracuda's official schedule page embeds the same public game data
// used by its calendar UI. Reading that first-party payload keeps every home
// date and start time current without relying on a ticket-resale listing.
async function readBarracuda(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  const start = html.indexOf('{"events":[');
  if (!response.ok || start < 0) throw new Error('Barracuda official schedule was not valid: ' + response.status);
  let depth = 0; let quoted = false; let escaped = false; let end = -1;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) { end = index + 1; break; }
    }
  }
  let payload;
  try { payload = JSON.parse(html.slice(start, end)); } catch { throw new Error('Barracuda official schedule JSON could not be read'); }
  if (!Array.isArray(payload.events)) throw new Error('Barracuda official schedule listed no games');
  return payload.events.flatMap(game => {
    const dateValue = game.time?.start || '';
    if (!game.isHomeGame || !isUpcoming(dateValue)) return [];
    const opponent = plainText(game.title || '').replace(/^vs\.?(?:\s*)/i, '').trim();
    if (!opponent) return [];
    const promotions = Array.isArray(game.promos) ? game.promos.filter(Boolean) : [];
    const description = `Watch the San Jose Barracuda take on ${opponent} at Tech CU Arena.${promotions.length ? ` Featured promotion: ${promotions.join('; ')}.` : ''}`;
    const image = game.logo?.source?.url || game.logo?.url || '';
    const event = directEvent({
      id: 'barracuda-' + (game.id || createHash('sha256').update(`${opponent}|${dateValue}`).digest('hex').slice(0, 16)),
      title: `San Jose Barracuda vs ${opponent}`, dateValue, description, image,
      place: 'Tech CU Arena', address: source.address || '', city: source.city || '',
      source: source.name, url: source.feedUrl, format: 'sports-game'
    });
    return [{ ...event, ...costInfo('', 'Tickets are available through the official team schedule.') }];
  });
}

// Filoli's public listing labels family programming directly and renders its
// date, image and parent-facing introduction in the HTML. We read each
// listing page and retain only entries carrying that explicit audience signal.
async function readFiloli(source) {
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const pages = await Promise.all([1, 2, 3, 4].map(async page => {
    const url = page === 1 ? source.feedUrl : `${source.feedUrl}?p=${page}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok || !/listing-item/.test(html)) return [];
    // The card itself contains nested lists for tags and dates, therefore a
    // non-greedy `</li>` match stops too early. Splitting at the next card
    // boundary retains each complete listing including its description.
    return html.split(/<li class=["']listing-item["'][^>]*>/i).slice(1);
  }));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const seen = new Set();
  return pages.flat().flatMap(block => {
    const title = htmlAttribute(block, /<h4[^>]*>\s*<a[^>]+>([\s\S]*?)<\/a>/i);
    const href = htmlAttribute(block, /<h4[^>]*>\s*<a[^>]+href=["']([^"']+)/i);
    const description = htmlAttribute(block, /<h4[\s\S]*?<p>([\s\S]*?)<\/p>/i);
    const tags = [...block.matchAll(/<ul class=["']taglist["'][\s\S]*?<\/ul>/gi)].map(match => plainText(match[0])).join(' ');
    const dateBlock = block.match(/fa-calendar-alt[\s\S]*?<\/li>/i)?.[0] || '';
    const dateText = plainText(dateBlock);
    const image = htmlAttribute(block, /<img[^>]+data-src=["']([^"']+)/i);
    const familySignal = /famil(?:y|ies)|children|kids?/i.test(`${tags} ${title} ${description}`);
    const range = dateText.match(/\b([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
    const dateValue = range
      ? `${range[5]}-${String(months[range[1].slice(0, 3).toLowerCase()] || 0).padStart(2, '0')}-${String(Number(range[2])).padStart(2, '0')}`
      : isoDateFromOfficialText(dateText);
    const endValue = range
      ? `${range[5]}-${String(months[range[3].slice(0, 3).toLowerCase()] || 0).padStart(2, '0')}-${String(Number(range[4])).padStart(2, '0')}`
      : dateValue;
    const url = href ? new URL(href, source.feedUrl).href : '';
    if (!title || !url || !familySignal || !hasActivitySummary(description) || endValue < today || seen.has(url)) return [];
    seen.add(url);
    const exhibition = /\b(?:exhibit(?:ion)?|flower show|installation)\b/i.test(`${title} ${description}`);
    const natureExperience = /\b(?:garden|nest|nature|outdoor|redwood)\b/i.test(`${title} ${description}`);
    const event = directEvent({
      id: 'filoli-' + createHash('sha256').update(url).digest('hex').slice(0, 16), title, dateValue, description,
      image: image ? new URL(image, source.feedUrl).href : '', place: 'Filoli Historic House & Garden',
      address: source.address || '', city: source.city || '', source: source.name, url, ageText: `${tags} ${description}`,
      format: exhibition ? 'museum-exhibition' : ''
    });
    const classified = exhibition ? { ...event, type: 'museums', icon: icons.museums, color: colors.museums, tag: labels.museums }
      : natureExperience ? { ...event, type: 'outdoor', icon: icons.outdoor, color: colors.outdoor, tag: labels.outdoor }
      : event;
    // A multi-day family experience that has already opened should be found as
    // an ongoing activity rather than disappear merely because its start date
    // has passed.
    return [range && dateValue < today ? { ...classified, date: 'On view now', dateValue: '', ongoing: true } : classified];
  });
}

// Los Altos History Museum uses Events Manager's public list. Exhibits are
// useful museum outings in their own right; one-off programs are published
// only when the organizer explicitly signals a youth or family audience.
async function readLahm(source) {
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const response = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/events-table/.test(html)) throw new Error('Los Altos History Museum event list was not valid: ' + response.status);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
  const events = await Promise.all(rows.map(async row => {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    const dateText = plainText(cells[0] || '');
    const body = cells[1] || '';
    const url = htmlAttribute(body, /<h3[^>]*>\s*<a[^>]+href=["']([^"']+)/i);
    const title = htmlAttribute(body, /<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const category = plainText(body.match(/<p[^>]*style=["'][^"']*padding-bottom[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const summary = plainText(body.match(/<p>([\s\S]*?)<a[^>]*>Read more/i)?.[1] || '');
    const rangeParts = dateText.split(/\s+-\s+/);
    const dateValue = isoDateFromOfficialText(rangeParts[0], dateText);
    const endValue = isoDateFromOfficialText(rangeParts.at(-1), dateText) || dateValue;
    const exhibition = /exhibit/i.test(category);
    if (!title || !url || !dateValue || endValue < today) return null;
    try {
      const detailResponse = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      const detailText = plainText(detail);
      const audienceText = `${title} ${summary} ${detailText}`;
      if (!exhibition && !/famil(?:y|ies)|children|kids?|youth|all ages|hands-on|robotics|stem/i.test(audienceText)) return null;
      const detailBody = detail.match(/<div class=["']event-details["']>[\s\S]*?<h2>Event Details<\/h2>([\s\S]*?)<\/div>/i)?.[1] || '';
      const description = cardSummary(detailBody, title) || decodeXml(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '') || summary;
      if (!hasActivitySummary(description)) return null;
      // The calendar sometimes gives an exhibition only a placement/date
      // sentence. That does not explain the experience, so wait for a richer
      // first-party description instead of publishing a vague museum card.
      if (exhibition && /^Appearing in (?:the )?.*(?:Gallery|beginning)/i.test(description)) return null;
      const image = htmlAttribute(body, /<img[^>]+src=["']([^"']+)/i);
      const ageText = exhibition ? '' : /\ball ages\b/i.test(detailBody) ? 'all ages' : /\bfamil(?:y|ies)\b/i.test(detailBody) ? 'family' : '';
      const event = directEvent({
        id: 'lahm-' + createHash('sha256').update(url).digest('hex').slice(0, 16), title,
        dateValue, description, image, place: source.name, address: source.address || '', city: source.city || '',
        source: source.name, url, ageText, format: exhibition ? 'museum-exhibition' : ''
      });
      const classified = exhibition ? { ...event, type: 'museums', icon: icons.museums, color: colors.museums, tag: labels.museums } : event;
      return rangeParts.length > 1 && dateValue < today ? { ...classified, date: 'On view now', dateValue: '', ongoing: true } : classified;
    } catch { return null; }
  }));
  return events.filter(Boolean);
}

// MOAH's public Squarespace event list exposes individual dates, an official
// image, a short activity introduction and a per-event ICS link. Restrict the
// feed to entries whose official copy explicitly identifies a family audience.
async function readMoah(source) {
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const response = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/eventlist-event--upcoming/.test(html)) throw new Error('MOAH official event list was not valid: ' + response.status);
  const blocks = [...html.matchAll(/<article class=["'][^"']*eventlist-event--upcoming[^"']*["'][\s\S]*?<\/article>/gi)].map(match => match[0]);
  const events = await Promise.all(blocks.map(async block => {
    const title = htmlAttribute(block, /eventlist-title[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const url = htmlAttribute(block, /eventlist-title[^>]*>\s*<a[^>]+href=["']([^"']+)/i);
    const dateValue = htmlAttribute(block, /<time class=["']event-date["'] datetime=["']([^"']+)/i);
    const time = htmlAttribute(block, /event-time-localized-start["'] datetime=["'][^"']+["']>([\s\S]*?)<\/time>/i);
    const description = htmlAttribute(block, /eventlist-excerpt[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    const image = htmlAttribute(block, /<img[^>]+data-image=["']([^"']+)/i);
    if (!title || !url || !isUpcoming(dateValue)) return null;
    try {
      const detailResponse = await fetch(new URL(url, source.feedUrl), { headers, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      const audienceText = `${title} ${description} ${plainText(detail)}`;
      if (!/famil(?:y|ies)|children|kids?|all ages|crafts?|costume swap/i.test(audienceText)) return null;
      const withTime = time ? `${dateValue}T${(() => { const m = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if (!m) return '00:00'; let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12; return `${String(h).padStart(2, '0')}:${m[2]}`; })()}` : dateValue;
      const ageText = /\ball ages\b/i.test(audienceText) ? 'all ages' : /\bfamil(?:y|ies)\b/i.test(audienceText) ? 'family' : '';
      const event = directEvent({
        id: 'moah-' + createHash('sha256').update(`${url}|${dateValue}`).digest('hex').slice(0, 16), title, dateValue: withTime,
        description, image, place: source.name, address: source.address || '', city: source.city || '', source: source.name,
        url: new URL(url, source.feedUrl).href, ageText
      });
      return { ...event, ...costInfo('', plainText(detail)) };
    } catch { return null; }
  }));
  return events.filter(Boolean);
}

// Montalvo's calendar is structured data, but its student matinees are not
// drop-in family outings. The explicit public-audience test prevents those
// school-only performances from entering the product while retaining future
// family events as Montalvo publishes them.
async function readMontalvo(source) {
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const response = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/EventSeries/.test(html)) throw new Error('Montalvo official calendar was not valid: ' + response.status);
  const json = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap(match => { try { return eventNodes(JSON.parse(match[1])); } catch { return []; } })
    .filter(node => node?.['@type'] === 'EventSeries');
  const events = await Promise.all(json.map(async item => {
    const title = decodeXml(item.name || '');
    const url = item.url || '';
    const dateValue = item.startDate || '';
    if (!title || !url || !isUpcoming(dateValue)) return null;
    try {
      const detailResponse = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      const detailText = plainText(detail);
      if (/school groups?|student matinee|homeschool(?:ed)? students?/i.test(detailText)) return null;
      if (!/famil(?:y|ies)|children|kids?|all ages|public performance/i.test(`${title} ${detailText}`)) return null;
      const description = decodeXml(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
      if (!hasActivitySummary(description)) return null;
      const image = decodeXml(detail.match(/tn-production-season-detail-page__image[^>]+src=["']([^"']+)/i)?.[1] || item.image || '');
      return directEvent({
        id: 'montalvo-' + createHash('sha256').update(`${url}|${dateValue}`).digest('hex').slice(0, 16), title, dateValue,
        description, image, place: 'Montalvo Arts Center', address: source.address || '', city: source.city || '',
        source: source.name, url, ageText: `${title} ${detailText}`, format: 'live-show'
      });
    } catch { return null; }
  }));
  return events.filter(Boolean);
}

// CivicEngage provides a first-party iCalendar subscription for each city
// calendar. It is a durable, machine-readable source and avoids using search
// results for municipal family programming.
async function readIcs(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const raw = (await response.text()).replace(/\r?\n[ \t]/g, '');
  if (!response.ok || !/BEGIN:VCALENDAR/i.test(raw)) throw new Error('Official iCalendar feed was not valid: ' + response.status);
  return [...raw.matchAll(/BEGIN:VEVENT\s*([\s\S]*?)END:VEVENT/gi)].flatMap(match => {
    const block = match[1];
    const field = name => decodeXml(block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'mi'))?.[1] || '').replace(/\\n/g, ' ').replace(/\\,/g, ',').trim();
    const title = field('SUMMARY');
    const start = field('DTSTART');
    const description = field('DESCRIPTION');
    const location = field('LOCATION').replace(/^[-\s]+/, '').trim();
    const detailUrl = description.match(/https?:\/\/\S+/)?.[0] || (field('URL') ? new URL(field('URL'), source.feedUrl).href : source.feedUrl);
    const dateValue = start.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/) ? `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}${start[8] === 'T' ? `T${start.slice(9, 11)}:${start.slice(11, 13)}` : ''}` : '';
    const activityText = `${title} ${description}`;
    const familySignal = /famil(?:y|ies)|kids?|children|youth|teen|toddler|concert|movie|music|craft|art|game|egg hunt|festival|celebration|holiday/i.test(activityText);
    if (!title || !dateValue || !isUpcoming(dateValue) || !familySignal || !hasActivitySummary(description)) return [];
    return [directEvent({
      id: 'ics-' + createHash('sha256').update(`${detailUrl}|${dateValue}`).digest('hex').slice(0, 16), title, dateValue, description,
      place: location || source.name, address: '', city: source.city || '', source: source.name, url: detailUrl, ageText: activityText
    })];
  });
}

// CivicPlus city calendars expose server-rendered event lists.  We read a
// small rolling window, then follow only clearly family-relevant listings to
// their official detail/landing pages.  This retains the organizer's own
// explanation and avoids publishing generic municipality meetings.
async function readCivic(source) {
  const now = new Date();
  const base = new URL(source.feedUrl);
  const monthsToRead = Array.from({ length: 4 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const pages = await Promise.all(monthsToRead.map(async ({ year, month }) => {
    const url = new URL(base);
    url.searchParams.set('view', 'list');
    url.searchParams.set('year', String(year));
    url.searchParams.set('month', String(month));
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) throw new Error('CivicPlus official calendar was not valid: ' + response.status);
    // A month with no published events is valid.  It should not make the
    // whole source fail or hide cards from adjacent months.
    return /itemtype=["']http:\/\/schema\.org\/Event/i.test(html) ? html : '';
  }));
  const candidates = pages.flatMap((html, monthIndex) => [...html.matchAll(/<li>\s*<h3>([\s\S]*?)<\/li>/gi)].flatMap(match => {
    const block = match[0];
    const title = plainText(block.match(/id=["']eventTitle_\d+["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1] || '');
    const href = htmlAttribute(block, /id=["']eventTitle_\d+["'][^>]*href=["']([^"']+)["']/i);
    const dateValue = plainText(block.match(/itemprop=["']startDate["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const place = plainText(block.match(/itemprop=["']location["'][\s\S]*?itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const street = plainText(block.match(/itemprop=["']streetAddress["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const city = canonicalCity(plainText(block.match(/itemprop=["']addressLocality["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || source.city || ''));
    const familySignal = /\b(?:family|families|kids?|children|youth|teen|toddler|movie|concert|music|festival|celebration|holiday|halloween|lantern|campout|egg hunt|art|craft|science|stem|nature|outdoor)\b/i.test(title);
    if (!title || !href || !isUpcoming(dateValue) || !familySignal) return [];
    return [{ title, url: new URL(decodeXml(href), source.feedUrl).href, dateValue, place, street, city, monthIndex }];
  }));
  const seen = new Set();
  const items = candidates.filter(item => {
    const key = `${item.url}|${item.dateValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const events = await Promise.all(items.map(async (item, index) => {
    try {
      const detailResponse = await fetch(item.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const detailHtml = await detailResponse.text();
      if (!detailResponse.ok) return null;
      const landingHref = htmlAttribute(detailHtml, /itemprop=["']url["'][^>]*href=["']([^"']+)["']/i);
      const landingUrl = landingHref ? new URL(landingHref, item.url).href : item.url;
      const landingResponse = landingUrl === item.url ? detailResponse : await fetch(landingUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const landingHtml = landingUrl === item.url ? detailHtml : await landingResponse.text();
      if (!landingResponse.ok) return null;
      const editorialBlocks = [...landingHtml.matchAll(/<div class=["'][^"']*\bfr-view\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].map(match => match[1]);
      const officialText = editorialBlocks.join(' ');
      const description = editorialBlocks.map(block => cardSummary(block, item.title)).find(hasActivitySummary) || cardSummary(detailHtml, item.title);
      const audienceText = `${item.title} ${officialText} ${plainText(landingHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1] || '')}`;
      if (!hasActivitySummary(description) || isExplicitlyAdultOnly(audienceText)) return null;
      const image = htmlAttribute(landingHtml, /widget image[\s\S]{0,1600}?<img[^>]+src=["']([^"']+)["']/i);
      const event = directEvent({
        id: 'civic-' + createHash('sha256').update(`${landingUrl}|${item.dateValue}|${index}`).digest('hex').slice(0, 16),
        title: item.title, dateValue: item.dateValue, description,
        image: image ? new URL(image, landingUrl).href : '', place: item.place || source.name,
        address: shortAddress(item.street, item.city), city: item.city || source.city || '', source: source.name, url: landingUrl,
        ageText: audienceText
      });
      return { ...event, ...costInfo('', officialText) };
    } catch { return null; }
  }));
  return events.filter(Boolean);
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

// Symphony San Jose publishes its season as a regular official HTML page.
// Each concert has a separate details page that lists the individual
// performances. We only include programs whose official description directly
// identifies a child or family audience; the shared season page also contains
// many adult-oriented concerts.
async function readSymphony(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/show-concert/i.test(html)) throw new Error('Symphony San Jose season page was not valid: ' + response.status);
  const cards = [...html.matchAll(/<li\b[^>]*\bshow-concert\b[\s\S]*?<\/li>/gi)].map(match => match[0]).map(card => ({
    title: plainText(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ''),
    url: htmlAttribute(card, /href=["']([^"']+)["']/i),
    image: htmlAttribute(card, /<img[^>]+src=["']([^"']+)["']/i)
  })).filter(card => card.title && card.url)
    // This is a candidate shortlist, not the audience decision. The official
    // detail-page description below remains the authority for publication.
    .filter(card => /\b(?:my very first|nutcracker|spooktacular|family)\b/i.test(card.title));
  const pages = await Promise.all(cards.map(async card => {
    const detailResponse = await fetch(card.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const detailHtml = await detailResponse.text();
    if (!detailResponse.ok) return null;
    const description = decodeXml(detailHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || '');
    return { ...card, description, detailHtml };
  }));
  return pages.flatMap((page, pageIndex) => {
    if (!page || !/\b(?:famil(?:y|ies)|children|kids?|toddlers?|preschool(?:ers?)?|young children)\b/i.test(page.description)) return [];
    const detailText = plainText(page.detailHtml);
    const sessions = [...detailText.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/gi)];
    return sessions.map((session, sessionIndex) => {
      const dateValue = isoDateFromOfficialText(`${session[1]} ${session[2]}, ${session[3]}`, session[4]);
      return dateValue ? directEvent({
        id: `symphony-${pageIndex}-${sessionIndex}`, title: page.title, dateValue,
        description: page.description,
        // A season-logo image is not an activity image. Leave it blank so the
        // card's established themed fallback is used instead of an old or
        // unrelated season graphic.
        image: /(?:season|logo)/i.test(page.image) ? '' : page.image, place: 'California Theatre',
        address: source.address, city: source.city, source: source.name, url: page.url,
        // The organizer identifies these as toddler/preschool programs but
        // does not give a precise numeric suitability range. Do not turn
        // descriptive audience words into a misleading card age label.
        ageText: '', format: 'live-show'
      }) : null;
    }).filter(Boolean);
  });
}

function timelyActivityDescription(html, title) {
  const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => plainText(match[1])).filter(text => text.length >= 25)
    .filter(text => !/^(?:\|?\s*)?performances?:|^(?:advisory|running time|note|tickets?|this production is presented|patrons? not seated)/i.test(text));
  const titleWords = new Set(plainText(title).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 4));
  const score = text => {
    const lower = text.toLowerCase();
    let value = Math.min(text.length, 220) / 35;
    value += [...titleWords].filter(word => lower.includes(word)).length * 2;
    if (/\b(?:is|are|features?|brings?|adaptation|production|musical|ballet|concert|sing along|celebrat(?:e|ing)|story)\b/i.test(text)) value += 5;
    if (/\b(?:reuniting|directed and choreographed|composer|lyricist|scenic design|lighting design|make this the christmas)\b/i.test(text)) value -= 12;
    if (isLogisticsOnly(text)) value -= 12;
    return value;
  };
  const selected = paragraphs.sort((a, b) => score(b) - score(a)).find(hasActivitySummary);
  return selected || plainText(html);
}

// San Jose Theaters exposes its official public calendar through Timely's
// documented browser API. The listing contains all venue programming, so we
// fetch detailed pages only for likely family shows and still require explicit
// audience language on the official detail before publishing a card.
async function readTimely(source) {
  const headers = { 'x-api-key': 'c6e5e0363b5925b28552de8805464c66f25ba0ce', 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const baseUrl = `https://events.timely.fun/api/calendars/${source.calendarId}/events`;
  const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const endDate = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const loadPage = async page => {
    const response = await fetch(`${baseUrl}?start_date=${startDate}&end_date=${endDate}&page=${page}`, { headers, signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok || !payload?.data?.items) throw new Error('San Jose Theaters calendar was not valid: ' + response.status);
    return payload.data;
  };
  const first = await loadPage(1);
  const pages = Math.ceil((first.total || first.items.length) / (first.size || first.items.length || 20));
  const remainingPages = await Promise.all(Array.from(
    { length: Math.max(0, pages - 1) },
    (_, index) => loadPage(index + 2).then(data => data.items)
  ));
  const allItems = [first.items, ...remainingPages].flat();
  const familyCandidate = /\b(?:disney|bluey|frozen|family|children|kids?|magic|puppet|circus|ice(?:\s+show)?|nutcracker|ballet)\b/i;
  const candidates = [...new Map(allItems.filter(item => item.event_status === 'confirmed' && !/\b(?:cancel(?:ed|led)?|postponed)\b/i.test(item.title || '') && familyCandidate.test(item.title || ''))
    .map(item => [String(item.title || '').toLowerCase(), item])).values()];
  const pagesWithDetails = await Promise.all(candidates.map(async item => {
    const response = await fetch(`${baseUrl}/${item.id}`, { headers, signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    return response.ok && payload?.data ? payload.data : null;
  }));
  return pagesWithDetails.flatMap((detail, detailIndex) => {
    const description = detail?.description || detail?.description_short || '';
    // A recognizable title alone is not enough. The official description must
    // expressly address families, children, a general audience, or an age.
    if (!detail || /\b(?:cancel(?:ed|led)?|postponed)\b/i.test(detail.title || '') || !/\b(?:famil(?:y|ies)|children|kids?|young people|general audience|recommended for ages?|ages?\s+\d)/i.test(plainText(description))) return [];
    // These shows are also sourced directly from Symphony San Jose, which is
    // the primary organizer and supplies the richer canonical event page.
    if (/\bmy very first (?:nutcracker|ballet)\b/i.test(detail.title || '')) return [];
    const venue = detail.taxonomies?.taxonomy_venue?.[0] || {};
    const venueParts = String(venue.address || '').match(/^(.+?),\s*([^,]+),\s*CA\b/i);
    const city = canonicalCity(venueParts?.[2] || 'San Jose');
    const address = venueParts ? shortAddress(venueParts[1], city) : '';
    const detailText = plainText(description);
    const sessionMatches = [...detailText.matchAll(/\b(?:Mon(?:day)?|Tues(?:day)?|Weds?(?:nesday)?|Thurs?(?:day)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\.?[,]?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),\s*(\d{4})\s*@\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/gi)];
    const sessions = sessionMatches.length ? sessionMatches : [[null, '', '', '', '']];
    return sessions.map((match, sessionIndex) => {
      const dateValue = sessionMatches.length
        ? isoDateFromOfficialText(`${match[1]} ${match[2]}, ${match[3]}`, match[4])
        : String(detail.start_datetime || '').replace(' ', 'T').slice(0, 16);
      if (!dateValue || !isUpcoming(dateValue)) return null;
      const event = directEvent({
        id: `timely-${detailIndex}-${sessionIndex}`, title: detail.title, dateValue,
        description: timelyActivityDescription(description, detail.title), image: detail.images?.[0]?.full?.url || detail.images?.[0]?.medium?.url || '',
        place: plainText(venue.title || 'San Jose Theaters'), address, city,
        source: source.name, url: detail.url || source.feedUrl, ageText: description, format: 'live-show'
      });
      // Timely returns a platform default of "0" even for external ticketed
      // events. Use a price only when the organizer actually supplies it.
      return { ...event, ...costInfo(detail.cost || '', description) };
    }).filter(Boolean);
  });
}

const target = new URL('../data/events.json', import.meta.url);
const browserTarget = new URL('../data/events.js', import.meta.url);
const museumTarget = new URL('../data/museums.json', import.meta.url);
const museumBrowserTarget = new URL('../data/museums.js', import.meta.url);
const existingEvents = JSON.parse(await readFile(target, 'utf8')); // Preserve translations already verified for unchanged cards.
const existingMuseums = JSON.parse(await readFile(museumTarget, 'utf8'));
const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const directMethods = ['rss', 'tribe', 'history', 'chcp', 'thetech', 'foothill', 'midpen', 'stanford', 'cupertino', 'civic', 'slac', 'chm', 'deanza', 'paloalto', 'happyhollow', 'gilroy', 'nhl', 'bayfc', 'mlb', 'mls', 'showare', 'cmt', 'pyt', 'barracuda', 'filoli', 'lahm', 'moah', 'montalvo', 'ics', 'symphony', 'timely'];
const directSources = sources.filter(source => directMethods.includes(source.method) && source.feedUrl);
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(new Date());
// Scheduled runs have no workflow input (empty value), so they use the normal
// Tuesday/Thursday fallback. A manually dispatched `false` explicitly disables
// it; `true` explicitly enables it on any weekday.
const serpapiInput = process.env.INCLUDE_SERPAPI;
const includeSerpapi = serpapiInput === 'true'
  || (serpapiInput !== 'false' && ['Tue', 'Thu'].includes(weekday));
const searchSources = includeSerpapi ? sources.filter(source => !directMethods.includes(source.method)) : [];
if (searchSources.length && !key) throw new Error('SERPAPI_KEY is required when the fallback search is scheduled or manually enabled.');

const feedAttempts = (await Promise.allSettled(directSources.map(source => {
  if (source.method === 'tribe') return readTribe(source);
  if (source.method === 'history') return readHistorySanJose(source);
  if (source.method === 'chcp') return readChcp(source);
  if (source.method === 'thetech') return readTheTech(source);
  if (source.method === 'foothill') return readFoothill(source);
  if (source.method === 'midpen') return readMidpen(source);
  if (source.method === 'stanford') return readStanford(source);
  if (source.method === 'nhl') return readNhl(source);
  if (source.method === 'bayfc') return readBayfc(source);
  if (source.method === 'mlb') return readMlb(source);
  if (source.method === 'mls') return readMls(source);
  if (source.method === 'showare') return readShoware(source);
  if (source.method === 'cmt') return readCmt(source);
  if (source.method === 'pyt') return readPyt(source);
  if (source.method === 'barracuda') return readBarracuda(source);
  if (source.method === 'filoli') return readFiloli(source);
  if (source.method === 'lahm') return readLahm(source);
  if (source.method === 'moah') return readMoah(source);
  if (source.method === 'montalvo') return readMontalvo(source);
  if (source.method === 'ics') return readIcs(source);
  if (source.method === 'civic') return readCivic(source);
  if (source.method === 'cupertino') return readCupertino(source);
  if (source.method === 'slac') return readSlac(source);
  if (source.method === 'chm') return readChm(source);
  if (source.method === 'deanza') return readDeAnza(source);
  if (source.method === 'paloalto') return readPaloAlto(source);
  if (source.method === 'happyhollow') return readHappyHollow(source);
  if (source.method === 'gilroy') return readGilroyGardens(source);
  if (source.method === 'symphony') return readSymphony(source);
  if (source.method === 'timely') return readTimely(source);
  return readRss(source);
}))).map((result, index) => ({ ...result, sourceName: directSources[index].name, kind: 'official calendar' }));
const searchAttempts = (await Promise.allSettled(searchSources.map(search)))
  .map((result, index) => ({ ...result, sourceName: searchSources[index].name, kind: 'fallback search' }));
const failures = [...feedAttempts, ...searchAttempts].filter(result => result.status === 'rejected');
failures.forEach(result => console.warn(`Skipping ${result.kind}: ${result.sourceName} — ${result.reason.message}`));
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
    ageBands: [], ageRanges: [], ageMin: null, ageMax: null, ageLabel: '', ageSource: '', costLabel: '费用未注明', costSource: '',
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
// Keep separate official sessions that share one details page. The earlier
// URL-only dedupe silently discarded all but the final time for a show such
// as a CMT production, defeating the card's “other sessions” experience.
const individualEvents = [...new Map([...feedEvents, ...candidates]
  .map(event => [`${event.url.toLowerCase()}|${event.dateValue || ''}`, event])).values()]
  // A card must explain what the activity is. We do not replace missing
  // organizer copy with generic prompts or publish logistics-only text.
  .filter(event => hasActivitySummary(event.description))
  .filter(isFamilyRelevant)
  .map(withPresentationFields)
  .sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));

function seriesKey(event) {
  // Deliberately conservative: different themes, venues, audience rules, or
  // pricing stay as separate cards even when a host reuses the same title.
  return [event.source, event.title, event.description, event.place, event.address, event.meetingPoint, event.city, event.type,
    JSON.stringify(event.ageRanges || []), event.ageLabel || '', event.costLabel, event.costSource].join('\u001f');
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

const scheduledEvents = groupRepeatedSessions(individualEvents);

if (!scheduledEvents.length) throw new Error('No verified upcoming events; leaving the published list unchanged.');

async function readChmMuseumCards(source) {
  const response = await fetch('https://computerhistory.org/', { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/Main Exhibits|What'?s On Now/i.test(html)) throw new Error('CHM museum catalog was not valid: ' + response.status);
  const cards = html.split(/<div class=["']image-besides-text\b/i).slice(1).flatMap(block => {
    const title = plainText(block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
    const description = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(match => plainText(match[1])).find(Boolean) || '';
    const url = htmlAttribute(block, /<a[^>]+href=["']([^"']+)["'][^>]*class=["']button/i);
    const image = htmlAttribute(block, /background:\s*url\(['"]?([^'"\)]+)/i);
    const dateText = plainText(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '');
    const dateLabel = /\b(?:through|closes|until)\b/i.test(dateText) ? dateText : 'Ongoing';
    if (!title || !description || !url || !/^(?:Special Exhibit:|REVOLUTION:|Chatbots Decoded:|Make Software:)/i.test(title)) return [];
    return [{
      id: 'chm-museum-' + createHash('sha256').update(url).digest('hex').slice(0, 16), museum: source.name, title,
      dateLabel, description: cardSummary(description, title), image: image ? new URL(image, 'https://computerhistory.org/').href : '',
      url: new URL(url, 'https://computerhistory.org/').href, lastVerifiedAt: generatedAt
    }];
  });
  return cards.slice(0, 4);
}

const museumSource = sources.find(source => source.method === 'chm');
let museums = existingMuseums;
if (museumSource) {
  try {
    const refreshedMuseums = await readChmMuseumCards(museumSource);
    // An incomplete parse must not remove previously verified exhibits from
    // the live page merely because a museum changed a presentational wrapper.
    if (refreshedMuseums.length >= 2) museums = refreshedMuseums;
  } catch (error) {
    console.warn(`Keeping last verified museum catalog: ${error.message}`);
  }
}

// Ongoing exhibits belong in the same browse and save flow as every other
// activity. They intentionally have no dateValue: they appear under Any time
// and Museums & exhibits, but not in day/weekend/month results unless a source
// later gives us a reliable date range.
function museumAsEvent(museum, source) {
  const type = 'museums';
  return {
    id: museum.id,
    title: museum.title,
    date: 'On view now',
    dateValue: '',
    ongoing: true,
    ageBands: [],
    ageRanges: [],
    ageMin: null,
    ageMax: null,
    ageLabel: '',
    ageSource: '',
    costLabel: '费用未注明',
    costSource: '',
    type,
    icon: icons[type],
    color: colors[type],
    tag: labels[type],
    format: 'museum-exhibition',
    verification: 'official-page',
    lastVerifiedAt: museum.lastVerifiedAt || generatedAt,
    description: cardSummary(museum.description, museum.title),
    image: museum.image || '',
    place: museum.museum || source?.name || 'South Bay museum',
    address: source?.address || '',
    city: canonicalCity(source?.city || ''),
    source: museum.museum || source?.name || '',
    url: museum.url
  };
}

const events = groupRepeatedSessions([...scheduledEvents, ...museums.map(museum => museumAsEvent(museum, museumSource))]);

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
await writeFile(museumTarget, `${JSON.stringify(museums, null, 2)}\n`);
await writeFile(museumBrowserTarget, `window.SOUTH_BAY_MUSEUMS = ${JSON.stringify(museums)};\n`);
console.log(`Published ${events.length} verified activities from ${directSources.length} official calendars and ${searchSources.length} fallback sources; ${translationStats.translated} translated and ${translationStats.cached} reused from cache.`);

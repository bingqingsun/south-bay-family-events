Warning: truncated output (original token count: 54587)
Total output lines: 3295

/*
 * Daily South Bay family-event refresh.
 * Requires SERPAPI_KEY in the environment. Uses SerpApi's standard Google
 * search engine so the job also works on plans without Google Events access.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  cautiousMovieRating,
  isKidAppropriateMovie,
  isPotentialFamilyMovieRating,
  normalizedMovieTitle,
  normalizedMovieRating
} from './movie-policy.mjs';
import {
  buildOfficialMovieScreeningSummary,
  buildOfficialSportsSummary,
  buildSummaryRecord,
  hasPublishableSummary,
  hasUsableSourceContent
} from './event-summary-engine.mjs';

const key = process.env.SERPAPI_KEY;
// Translation is intentionally paused: no third-party translation key is read
// or called until the product is ready to offer this feature again.
const translationEnabled = false;
const translationKey = translationEnabled ? process.env.GOOGLE_TRANSLATE_API_KEY : '';

function typeFor(text, title = '') {
  const value = String(text || '').toLowerCase();
  const titleValue = String(title || '').toLowerCase();
  // One parent-facing taxonomy: categorize by the main experience, not by
  // the organizer or a secondary activity mechanic. Subject learning and
  // making must outrank words such as “games” when both appear.
  if (/\b(?:vs\.?|versus|football|soccer|hockey|baseball|basketball|matchday|regular season|playoffs?)\b/.test(value)) return 'sports';
  if (/\b(?:show|theat(?:er|re)|concert|performance|musical|dance recital|magic|planetarium|laser show|ice show)\b/.test(value)) return 'shows';
  if (/\b(?:museum|gallery|exhibit(?:ion)?|on view|collection)\b/.test(value)) return 'museums';
  if (/\b(?:hike|nature(?:\s+walk)?|trail|wildlife|marsh|forest|creek|pond|ranger|bird(?:s)?\b|habitat restoration|environmental education)\b/.test(value)) return 'outdoor';
  // Citywide festivals and service/help events are community experiences even
  // when their schedules include music, crafts, or games.
  if (/\b(?:bike|bicycle)\b[^.!?]{0,48}\brepair\b|\b(?:community service|volunteer(?:ing)?|cleanup|donation|food drive|swap|mento(?:r|ring)|appointment|customer service|career help|tech help|free snacks|festival|celebration|fest)\b/.test(value)) return 'community';
  // A title naming a concrete art medium is more trustworthy than a broad
  // source taxonomy such as “STEM” or “Engineering” attached to the listing.
  if (/\b(?:illustration|paint(?:ing)?|photography|knit(?:ting)?|crochet|tie-dye|ceramics?|pottery|drawing|sew(?:ing)?|mend(?:ing)?)\b/.test(titleValue)
    && !/\b(?:science|robot(?:ics)?|coding|3d print(?:ing)?|forensics|dna|astronomy|physics|math(?:ematics)?|video game design)\b/.test(titleValue)) return 'arts';
  const learningCore = /\b(?:science|stem|robot(?:ics)?|engineering|coding|3d print(?:ing)?|forensics|dna|astronomy|physics|math(?:ematics)?|tutor(?:ing)?|chess|black holes?|solar|moon|space|cosmic|earthquake|homeschool|video game design)\b/.test(value);
  const creativeMaking = /\b(?:art(?:s)?|crafts?|paint(?:ing)?|photography|knit(?:ting)?|crochet|tie-dye|ceramics?|pottery|drawing|design|illustration|sew(?:ing)?|mend(?:ing)?)\b/.test(value);
  const fineArtMaking = /\b(?:illustration|paint(?:ing)?|photography|knit(?:ting)?|crochet|tie-dye|ceramics?|pottery|drawing|sew(?:ing)?|mend(?:ing)?)\b/.test(value);
  // Storytimes, LEGO free play, and movement/song programs remain play even
  // when organizers describe developmental or early-literacy benefits.
  if (/\b(?:story ?time|stay (?:&|and) play|play(?:time)?|toddler|tiny tot|baby bounce|music and movement|finger ?plays?|songs? and rhymes?|reading to furry|assistance dogs?|swimming|pool|pumpkin patch)\b/.test(value)) return 'play';
  if (/\blego\b/.test(value) && !/\b(?:robot(?:ics)?|coding|programming|class|workshop|competition|challenge)\b/.test(value)) return 'play';
  // A creative activity stays Arts & making unless it is explicitly a STEM
  // design/robotics/coding activity. “Digital illustration” is arts; “robot
  // design challenge” is Learning & STEM.
  if (fineArtMaking && !/\b(?:science|robot(?:ics)?|coding|3d print(?:ing)?|forensics|dna|astronomy|physics|math(?:ematics)?|video game design)\b/.test(value)) return 'arts';
  if (creativeMaking && !learningCore) return 'arts';
  // Curriculum and skill-building take precedence over playful delivery.
  // “Math activities and games” is Learning & STEM, not Stories & play.
  if (learningCore) return 'learning';
  if (/\b(?:workshop|class|course|yoga|tai chi|meditation|mindfulness|wellness|breathwork|line dancing|movement class|fitness|cooking|baking)\b/.test(value)) return 'workshops';
  if (/\b(?:games?|scavenger hunt|board games?|puzzle)\b/.test(value)) return 'play';
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

// Seasonal intent is useful for recommendations and future collections, but it
// is not another user-facing category. Keep it as quiet metadata so a Moon
// Festival can remain a community event while still receiving timely seasonal
// treatment in ranking and editorial collections.
function seasonalThemeFor(text) {
  const value = plainText(text).toLowerCase();
  if (/\b(?:mid[-\s]?autumn|moon(?:cake)? festival|moon festival)\b/.test(value)) return 'mid-autumn';
  if (/\b(?:d[ií]a de (?:los )?muertos|day of the dead|alebrijes)\b/.test(value)) return 'dia-de-muertos';
  if (/\b(?:halloween|hallowe'en|trick[-\s]?or[-\s]?treat|monster mash|spooktacular|spooky|pumpkins? in the park|pumpkin (?:pool|patch|carving|party|palooza)|haunted)\b/.test(value)) return 'halloween';
  return '';
}
const labels = { sports: '体育与比赛', shows: '演出与表演', movies: '电影与放映', museums: '博物馆与展览', outdoor: '户外自然', arts: '艺术与创作', learning: '学习与 STEM', play: '故事与玩乐', community: '社区与家庭', workshops: '课程与工作坊' };
const icons = { sports: '⚽', shows: '🎭', movies: '🎬', museums: '🏛️', outdoor: '🌿', arts: '🎨', learning: '🔭', play: '🎈', community: '🤝', workshops: '🛠️' };
const colors = { sports: '#dce7fa', shows: '#f0def2', movies: '#e5e0f8', museums: '#ece5d8', outdoor: '#d8eee0', arts: '#ffd9bd', learning: '#dce7fa', play: '#ffe9a8', community: '#dceeea', workshops: '#e7ddf6' };
const fallbackTime = '请点击活动详情查看活动时间';
const generatedAt = new Date().toISOString();
// Official team marks used for local home-game cards when the schedule APIs
// do not provide match photography. These are hosted on each club/league's
// own public asset domain, not generated fallback illustrations.
const BAY_FC_TEAM_MARK = 'https://bayfc.com/wp-content/uploads/logo_bayfc_primary-steel-bay.svg';
const EARTHQUAKES_TEAM_MARK = 'https://images.mlssoccer.com/image/upload/assets/logos/SJ.svg';
const SAN_JOSE_GIANTS_TEAM_MARK = 'https://www.mlbstatic.com/team-logos/team-cap-on-light/476.svg';

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

function isUnavailableEvent(event) {
  const value = plainText([
    event.title, event.description, event.availabilityStatus,
    event.registrationStatus, event.ticketStatus
  ].filter(Boolean).join(' '));
  // Full registration is a status, not evidence that the event disappeared.
  // Keep full/waitlisted programs visible so families can still inspect the
  // organizer page. Suppress only explicit cancellation or hard sold-out
  // signals with no remaining availability.
  if (/\b(?:waitlist|waiting list|registration (?:is )?full|event (?:is )?full)\b/i.test(value)) return false;
  return /\b(?:sold out|fully booked|no (?:tickets|spaces?|spots?|seats?) (?:remain|remaining|available)|cancel(?:ed|led)|event cancelled)\b/i.test(value);
}

function hasExplicitChildAudience(text) {
  return /\b(?:bab(?:y|ies)|infants?|toddlers?|pre-?school(?:ers?)?|young children|children|kids?|school age|pre-?teens?|tweens?|teens?|all ages|grades?)\b/i.test(plainText(text));
}

function isExplicitlyAdultOnly(text) {
  const value = plainText(text);
  const adultOnly = /\badults?\s*,?\s*(?:ages?\s*)?(?:18|21)\s*\+|\badults?\s+only\b|\bages?\s*(?:18|21)\s*\+(?:\s*only)?|\b21\s*\+|\b21\s+and (?:over|up)\b/i.test(value);
  return adultOnly && !hasExplicitChildAudience(value);
}
function withPresentationFields(event) {
  const audienceText = `${event.title || ''} ${event.description || ''} ${event.ageLabel || ''} ${event.ageSource || ''}`;
  const knownMidAutumnEvent = /^Lantern Festival$/i.test(event.title || '') && /^City of Milpitas$/i.test(event.source || '');
  return {
    ...event,
    format: event.format || formatFor(audienceText),
    seasonalTheme: event.seasonalTheme || (knownMidAutumnEvent ? 'mid-autumn' : seasonalThemeFor(audienceText)),
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

function pacificNowValue() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function normalizedDateTime(value, { endOfDay = false } = {}) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return '';
  return `${match[1]}T${match[2] || (endOfDay ? '23' : '00')}:${match[3] || (endOfDay ? '59' : '00')}:${match[4] || (endOfDay ? '59' : '00')}`;
}

function addMinutesToLocalDateTime(value, minutes) {
  const match = normalizedDateTime(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):/);
  if (!match) return '';
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]) + minutes));
  return `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, '0')}-${String(instant.getUTCDate()).padStart(2, '0')}T${String(instant.getUTCHours()).padStart(2, '0')}:${String(instant.getUTCMinutes()).padStart(2, '0')}:00`;
}

function fallbackDurationMinutes(event) {
  const text = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  if (event.format === 'movie-screening') return 200;
  if (event.format === 'sports-game') return 240;
  if (event.format === 'live-show') return 210;
  if (/\b(?:story ?time|tiny tot|baby bounce|stay (?:&|and) play)\b/.test(text)) return 90;
  if (/\b(?:festival|celebration|carnival|parade|fair|art walk)\b/.test(text)) return 480;
  return 240;
}

function effectiveEndDateValue(event) {
  if (event.ongoing) return '';
  const explicit = event.endDateValue;
  if (explicit) return normalizedDateTime(explicit, { endOfDay: !String(explicit).includes('T') && !String(explicit).includes(' ') });
  if (!String(event.dateValue || '').includes('T') && !String(event.dateValue || '').includes(' ')) return normalizedDateTime(event.dateValue, { endOfDay: true });
  return addMinutesToLocalDateTime(event.dateValue, fallbackDurationMinutes(event));
}

function withEffectiveEndTime(event) {
  return { ...event, endDateValue: effectiveEndDateValue(event) };
}

function isStillActive(event, now = pacificNowValue()) {
  return Boolean(event.ongoing || (event.endDateValue && event.endDateValue > now));
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

function sourceDescriptionText(html, maxLength = 4000) {
  const value = plainText(html).replace(/https?:\/\/\S+/g, '').trim();
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function officialParagraphText(html, { minLength = 20, excludePattern = null } = {}) {
  const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => plainText(match[1]))
    .filter(text => text.length >= minLength)
    .filter(text => !/^(?:performances?|dates?|location|length|running time|advisory|note|tickets?|box office|general admission|student matinee|auditions?|registration|parking)\b/i.test(text))
    .filter(text => !(excludePattern && excludePattern.test(text)));
  return sourceDescriptionText(paragraphs.join(' '));
}

function qualityGateSummary(event) {
  const normalized = buildSummaryRecord({
    sourceText: event.sourceDescriptionRaw || sourceDescriptionText(event.description || ''),
    title: event.title,
    format: event.format,
    status: event.summaryStatus || 'extractive',
    verifiedAt: event.summaryVerifiedAt || generatedAt,
    evidenceData: event.summaryEvidenceData || null
  });
  if (normalized.summaryStatus === 'needs_review') return null;
  return {
    ...event,
    ...normalized,
    description: normalized.parentSummary,
    parentSummary: normalized.parentSummary
  };
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

// Some official partner calendars place a venue and its complete mailing
// address in one field (for example, “Civic Center Plaza, 457 E. Calaveras
// Blvd, Milpitas, CA 95035”). Split it before publishing: parents can read
// the venue name and immediately tap the street address for directions.
function venueAndAddress(value, fallbackCity = '') {
  const location = plainText(value);
  const match = location.match(/^(.*?)\s*,\s*(\d+\s+[^,]+?)\s*,\s*([A-Za-z .'-]+?)\s*,\s*(?:CA|California)\s*\d{5}(?:-\d{4})?\s*$/i);
  if (!match) return { place: location, address: '', city: canonicalCity(fallbackCity) };
  const city = canonicalCity(match[3] || fallbackCity);
  return { place: match[1].trim(), address: shortAddress(match[2], city), city };
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
  const allAges = /\ball[-\s]ages?\b|\bfor all[-\s]ages\b|\bappropriate for all[-\s]ages\b/.test(lower);

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
  // Broad audience taxonomy such as “Kids” or “Pre-teens” must not widen a
  // precise organizer range. For example, “Ages 5–12” can also carry the
  // platform's Pre-teens category, but the card and filter should remain 5–12.
  const hasExplicitAgeRange = ranges.length > 0;
  if (!hasExplicitAgeRange) {
    if (/bab(?:y|ies)\s*\(\s*under\s*2\s*\)|\bkids?:\s*bab(?:y|ies)\b|\bunder\s*2\b|\binfants?\b/.test(lower)) addRange(0, 1);
    if (/toddlers?|18\s*(?:months?|mos?)/.test(lower)) addRange(1, 3);
    if (/pre-?school(?:ers?)?/.test(lower)) addRange(3, 5);
    if (/\bpre-?teens?\b|\btweens?\b/.test(lower)) addRange(10, 13);
    if (/\bteens?\b/.test(lower)) addRange(13, 18);
  }
  // A grade category is an official audience field but not an exact age
  // statement. Its conventional age equivalent is used only for matching;
  // the card keeps the organizer's grade wording so we do not imply precision.
  const gradeRange = lower.match(/grades?\s*(k|kindergarten|\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/);
  const isKindergarten = gradeRange?.[1] === 'k' || gradeRange?.[1] === 'kindergarten';
  const gradeStart = isKindergarten ? 0 : Number(gradeRange?.[1]);
  const gradeEnd = Number(gradeRange?.[2]);
  if (!hasExplicitAgeRange && gradeRange && Number.isFinite(gradeStart) && Number.isFinite(gradeEnd) && gradeEnd >= 0 && gradeEnd <= 12) {
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
  const combined = [officialCost, officialText].filter(Boolean).join('. ');
  const sentences = combined.split(/(?<=[.!?;])\s+|\n+/).map(value => value.trim()).filter(Boolean);
  const evidenceFor = pattern => sentences.find(sentence => pattern.test(sentence)) || '';
  const compactEvidence = value => value.replace(/\s+/g, ' ').trim().slice(0, 180);

  // Registration is deliberately independent from cost. Negative wording is
  // resolved first so "no registration required" can never become a paid or
  // registration-required signal.
  let registrationStatus = 'unknown';
  let registrationEvidence = '';
  const noRegistrationPattern = /\b(?:no registration (?:is )?required|registration (?:is )?not required|without registration)\b/i;
  const walkInPattern = /\b(?:walk-?ins? (?:are )?(?:welcome|accepted|available)|walk-?in (?:event|program|activity|while)|drop-?ins? (?:are )?(?:welcome|accepted))\b/i;
  const registrationRequiredPattern = /\b(?:registration (?:is )?required|advance registration (?:is )?required|register (?:online |in advance |beforehand )?(?:to attend|required)|reservation (?:is )?required|free tickets? (?:are )?required|tickets? (?:are )?required for (?:admission|entry))\b/i;
  const registrationRecommendedPattern = /\b(?:registration|reservations?) (?:is |are )?(?:recommended|encouraged)\b/i;
  if (walkInPattern.test(combined)) {
    registrationStatus = 'walk-in';
    registrationEvidence = evidenceFor(walkInPattern);
  } else if (noRegistrationPattern.test(combined)) {
    registrationStatus = 'not-required';
    registrationEvidence = evidenceFor(noRegistrationPattern);
  } else if (registrationRequiredPattern.test(combined)) {
    registrationStatus = 'required';
    registrationEvidence = evidenceFor(registrationRequiredPattern);
  } else if (registrationRecommendedPattern.test(combined)) {
    registrationStatus = 'recommended';
    registrationEvidence = evidenceFor(registrationRecommendedPattern);
  }

  const donationPattern = /\b(?:suggested|requested|optional) donation\b/i;
  const freePattern = /\b(?:free admission|admission is free|free event|free program|free activity|free entry|free to attend|free and open to (?:the )?public|complimentary admission|registration is free|no (?:admission )?cost|no (?:admission |entry )?charge|no (?:registration |entry |admission )?fee)\b/i;
  const memberPricingPattern = /(?<!non-)\bmembers?\b[\s\S]{0,180}\b(?:non-?members?|general (?:public|admission))\b|\b(?:non-?members?|general (?:public|admission))\b[\s\S]{0,180}(?<!non-)\bmembers?\b/i;
  const paidPattern = /\b(?:paid admission|admission fee|entry fee|registration fee|fee applies|ticket purchase (?:is )?required|tickets? must be purchased|purchase (?:a |your )?tickets?|buy (?:a |your )?tickets?)\b/i;
  const costContextPattern = /\b(?:admission|entry|registration|ticket|tickets|fee|fees|cost|price|pricing)\b/i;

  const priceLabel = text => {
    const normalized = text.replace(/[—-]/g, '–');
    const from = normalized.match(/\b(?:from|starting at|starts at)\s*(?:USD\s*)?(\$\s*\d+(?:\.\d{1,2})?)/i);
    if (from) return `From ${from[1].replace(/\s+/g, '')}`;
    const range = normalized.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:–|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
    if (range) return `$${range[1]}–$${range[2]}`;
    const values = [...normalized.matchAll(/(?:\$\s*|\bUSD\s+)(\d+(?:\.\d{1,2})?)/gi)].map(match => Number(match[1])).filter(Number.isFinite);
    const unique = [...new Set(values)].sort((a, b) => a - b);
    if (unique.length === 1) return `$${unique[0]}`;
    if (unique.length > 1) return `$${unique[0]}–$${unique.at(-1)}`;
    return '';
  };

  let costStatus = 'unknown';
  let costLabel = '费用未注明';
  let costEvidence = '';
  const structuredFree = /^(?:free|no cost|no charge|no fee|\$?0(?:\.00)?)$/i.test(officialCost);
  const donationInField = donationPattern.test(officialCost);
  const memberInField = memberPricingPattern.test(officialCost) && /\$\s*\d/.test(officialCost);
  const memberInDescription = memberPricingPattern.test(officialText) && /\$\s*\d/.test(officialText)
    && /\b(?:admission|entry|tickets?)\b/i.test(officialText);
  const freeInField = structuredFree || freePattern.test(officialCost);
  const priceInField = priceLabel(officialCost);
  const paidInField = paidPattern.test(officialCost);
  const donationEvidence = donationInField ? officialCost : evidenceFor(donationPattern);
  const memberEvidence = memberInField ? officialCost : memberInDescription ? officialText : '';
  const freeEvidence = freeInField ? officialCost : evidenceFor(freePattern);
  const priceEvidence = priceInField ? officialCost : sentences.find(sentence => costContextPattern.test(sentence) && !/\b(?:parking|shipping|service) fee\b/i.test(sentence) && priceLabel(sentence)) || '';
  const paidEvidence = paidInField ? officialCost : evidenceFor(paidPattern);
  let costFromField = false;

  if (donationEvidence) {
    costStatus = 'donation'; costLabel = '建议捐赠'; costEvidence = donationEvidence;
    costFromField = donationInField;
  } else if (memberEvidence) {
    costStatus = 'variable'; costLabel = '会员／非会员价格见详情'; costEvidence = memberEvidence;
    costFromField = memberInField;
  } else if (freeEvidence) {
    costStatus = 'free'; costLabel = '免费'; costEvidence = freeEvidence;
    costFromField = freeInField;
  } else if (priceEvidence) {
    costStatus = 'paid'; costLabel = priceLabel(priceEvidence) || '需付费／价格见详情'; costEvidence = priceEvidence;
    costFromField = Boolean(priceInField);
  } else if (paidEvidence) {
    costStatus = 'paid'; costLabel = '需付费／价格见详情'; costEvidence = paidEvidence;
    costFromField = paidInField;
  }

  const registrationFromField = registrationStatus !== 'unknown' && (
    walkInPattern.test(officialCost) || noRegistrationPattern.test(officialCost)
    || registrationRequiredPattern.test(officialCost) || registrationRecommendedPattern.test(officialCost)
  );
  return {
    costStatus,
    costLabel,
    costSource: costStatus === 'unknown' ? '' : costFromField ? '官方费用字段' : '官方活动说明',
    costEvidence: costStatus === 'unknown' ? '' : compactEvidence(costEvidence),
    registrationStatus,
    registrationSource: registrationStatus === 'unknown' ? '' : registrationFromField ? '官方费用字段' : '官方活动说明',
    registrationEvidence: registrationStatus === 'unknown' ? '' : compactEvidence(registrationEvidence)
  };
}

function isClosureNotice(title, description = '') {
  const heading = plainText(title);
  const detail = plainText(description);
  // Library RSS feeds use the same event schema for programs and operational
  // notices. A closure cannot be an outing, even if the feed's broad audience
  // category happens to include families or children.
  return /^(?:closed|closure|closing|holiday\s+(?:hours|closure)|special\s+hours)\b/i.test(heading)
    || /\b(?:all\s+)?(?:city\s+)?(?:libraries|library branches?|branches?)\s+(?:will be|are)\s+closed\b/i.test(detail);
}

async function readRss(source) {
  // BiblioCommons RSS defaults to only 25 entries. Sources with maxPages opt
  // into official feed pagination so older-published future programs are not
  // hidden behind newer calendar entries.
  const maxPages = Math.max(1, Math.min(Number(source.maxPages) || 1, 40));
  const attempts = await Promise.allSettled(Array.from({ length: maxPages }, async (_, index) => {
    const url = new URL(source.feedUrl);
    url.searchParams.set('page', String(index + 1));
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const xml = await response.text();
    if (!response.ok || !/<rss[\s>]/i.test(xml)) throw new Error(`RSS page ${index + 1} was not valid: ${response.status}`);
    return xml;
  }));
  const pages = attempts.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (!pages.length) throw new Error('RSS feed was not valid on any requested page');
  const itemBlocks = pages.flatMap(xml => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]));
  const seen = new Set();
  return itemBlocks.flatMap((item, index) => {
    const title = xmlText(item, 'title');
    const link = xmlText(item, 'link');
    const startDate = xmlText(item, 'start_date_local');
    const endDate = xmlText(item, 'end_date_local');
    const categories = xmlTexts(item, 'category').join(' ');
    const categoriesLower = categories.toLowerCase();
    const familyAudience = /young children|kids|children|teens|family|all ages|school age/.test(categoriesLower);
    // Source category taxonomy may include a family-oriented department even
    // when the event itself is expressly for adults. Audience eligibility wins.
    if (isExplicitlyAdultOnly(categories)) return [];
    const description = xmlText(item, 'description');
    const summary = buildSummaryRecord({ sourceText: sourceDescriptionText(description), title, verifiedAt: generatedAt });
    const eventKey = `${xmlText(item, 'guid') || link}|${startDate}`;
    if (!title || !link || seen.has(eventKey) || !isUpcoming(startDate) || !familyAudience
      || xmlText(item, 'is_cancelled') === 'true'
      || isClosureNotice(title, description)) return [];
    seen.add(eventKey);
    const type = typeFor(title + ' ' + categoriesLower + ' ' + description, title);
    const age = ageInfo(`${categories} ${description}`);
    const isFull = xmlText(item, 'is_full') === 'true';
    const cost = costInfo(xmlText(item, 'cost'), description);
    if (isFull) {
      cost.registrationStatus = 'full';
      cost.registrationSource = 'Official registration status';
      cost.registrationEvidence = 'Registration is full; check the organizer page for current waitlist options.';
    }
    const eventId = (xmlText(item, 'guid') || link).split('/').filter(Boolean).pop() || String(index);
    const location = xmlText(item, 'location');
    const venue = xmlText(location, 'name');
    const room = xmlText(location, 'location_details');
    const city = canonicalCity(xmlText(location, 'city'));
    const address = shortAddress(`${xmlText(location, 'number')} ${xmlText(location, 'street')}`, city);
    return [{
      id: 'rss-' + eventId, title, date: displayEventDate(startDate), dateValue: startDate, endDateValue: endDate, ...age, ...cost,
      type, icon: icons[type], color: colors[type], tag: labels[type], verification: 'rss', lastVerifiedAt: generatedAt,
      ...summary,
      image: officialImageUrl(item),
      place: [venue, room].filter(Boolean).join(' · ') || source.name, address, city, source: source.name, url: link,
      availabilityStatus: isFull ? 'full' : ''
    }];
  });
}

async function tribePageDetails(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) return { sourceDescriptionRaw: '', image: '' };
    const body = html.match(/tribe-events-single-event-description[\s\S]*?<div class="text">([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] || '';
    const meta = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || '';
    const image = html.match(/(?:mobile-event-image|my-event-image)[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';
    return {
      sourceDescriptionRaw: sourceDescriptionText(body || meta),
      image: image ? new URL(decodeXml(image), url).href : ''
    };
  } catch {
    return { sourceDescriptionRaw: '', image: '' };
  }
}

async function readTribe(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.events)) throw new Error('Official calendar API was not valid: ' + response.status);
  const seeds = payload.events.flatMap((item, index) => {
    const startDate = String(item.start_date || '').replace(' ', 'T');
    const endDate = String(item.end_date || '').replace(' ', 'T');
    const title = decodeXml(item.title || '').trim();
    const categories = (item.categories || []).map(category => decodeXml(category.name || '')).join(' ').toLowerCase();
    const audienceText = `${title} ${item.description || ''} ${item.excerpt || ''} ${categories}`;
    const sourceFamilyPattern = source.familyPattern ? new RegExp(source.familyPattern, 'i') : null;
    if (!title || !item.url || !isUpcoming(startDate) || (sourceFamilyPattern && !sourceFamilyPattern.test(audienceText))) return [];
    const type = typeFor(title + ' ' + categories, title);
    // Do not infer a family age label from the calendar platform itself. The
    // card only shows an age range when the organizer actually supplied one.
    const age = ageInfo(audienceText);
    const cost = costInfo(item.cost, item.description || item.excerpt || '');
    const summary = buildSummaryRecord({ sourceText: sourceDescriptionText(item.description || item.excerpt || ''), title, verifiedAt: generatedAt });
    return [{
      id: 'calendar-' + (item.id || index), title, date: displayEventDate(startDate), dateValue: startDate, endDateValue: endDate, ...age, ...cost,
      type, icon: icons[type], color: colors[type], tag: labels[type], verification: 'calendar', lastVerifiedAt: generatedAt,
      ...summary,
      image: item.image?.url || '', place: item.venue?.venue || source.name,
      address: shortAddress(item.venue?.address, item.venue?.city), city: canonicalCity(item.venue?.city), source: source.name, url: item.url
    }];
  });
  const enriched = await Promise.all(seeds.map(async event => {
    if (hasUsableSourceContent(event.description) && event.image) return event;
    const details = await tribePageDetails(event.url);
    const detailSummary = details.sourceDescriptionRaw
      ? buildSummaryRecord({ sourceText: details.sourceDescriptionRaw, title: event.title, format: event.format, verifiedAt: generatedAt })
      : null;
    const useDetail = detailSummary && hasUsa…34587 tokens truncated…       const schema = JSON.parse(block[1].trim());
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
    const metaDescription = decodeXml(detailHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || '');
    const description = officialParagraphText(detailHtml, {
      excludePattern: /\b(?:directed and choreographed|composer|lyricist|scenic design|lighting design|patrons? not seated)\b/i
    }) || sourceDescriptionText(metaDescription);
    const cssImage = decodeXml(detailHtml.match(/background-image\s*:\s*url\((?:["']?)([^)'"\s]+)(?:["']?)\)/i)?.[1] || '');
    return { ...card, description, image: officialPageOgImage(detailHtml) || cssImage || card.image, detailHtml };
  }));
  return pages.flatMap((page, pageIndex) => {
    if (!page) return [];
    const detailText = plainText(page.detailHtml);
    const explicitFamilyAudience = /\b(?:famil(?:y|ies)|children|kids?|toddlers?|preschool(?:ers?)?|young children|youth(?:\s+under\s+18)?)\b/i.test(detailText);
    const officialFamilyProgram = /\bspooktacular\b/i.test(page.title) && /\b(?:costume contest|costume parade|best youth|everyone)\b/i.test(detailText);
    if (!explicitFamilyAudience && !officialFamilyProgram) return [];
    const sessions = [...detailText.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))/gi)];
    return sessions.map((session, sessionIndex) => {
      const dateValue = isoDateFromOfficialText(`${session[1]} ${session[2]}, ${session[3]}`, session[4]);
      return dateValue ? directEvent({
        id: `symphony-${pageIndex}-${sessionIndex}`, title: page.title, dateValue,
        description: page.description,
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
        description: sourceDescriptionText(description), image: detail.images?.[0]?.full?.url || detail.images?.[0]?.medium?.url || '',
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
const directMethods = ['jmz-family', 'stanford-venue-family', 'rss', 'tribe', 'history', 'chcp', 'thetech', 'foothill', 'midpen', 'stanford', 'cupertino', 'civic', 'slac', 'chm', 'deanza', 'paloalto', 'happyhollow', 'gilroy', 'nhl', 'sapcenter', 'cinelux', 'cinemark', 'southfirstfridays', 'bayfc', 'mlb', 'mls', 'showare', 'cmt', 'pyt', 'barracuda', 'filoli', 'lahm', 'moah', 'montalvo', 'ics', 'symphony', 'timely', 'wix-events', 'squarespace-events', 'santana-row', 'annual-festival', 'curated', 'google-visitor-events', 'eventbrite-organizer'];
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
  if (source.method === 'jmz-family') return readJmzFamily(source);
  if (source.method === 'stanford-venue-family') return readStanfordVenueFamily(source);
  if (source.method === 'curated') return readCurated(source);
  if (source.method === 'google-visitor-events') return readGoogleVisitorEvents(source);
  if (source.method === 'eventbrite-organizer') return readEventbriteOrganizer(source);
  if (source.method === 'wix-events') return readWixEvents(source);
  if (source.method === 'squarespace-events') return readSquarespaceEvents(source);
  if (source.method === 'santana-row') return readSantanaRow(source);
  if (source.method === 'annual-festival') return readAnnualFestival(source);
  if (source.method === 'tribe') return readTribe(source);
  if (source.method === 'history') return readHistorySanJose(source);
  if (source.method === 'chcp') return readChcp(source);
  if (source.method === 'thetech') return readTheTech(source);
  if (source.method === 'foothill') return readFoothill(source);
  if (source.method === 'midpen') return readMidpen(source);
  if (source.method === 'stanford') return readStanford(source);
  if (source.method === 'nhl') return readNhl(source);
  if (source.method === 'sapcenter') return readSapCenter(source);
  if (source.method === 'cinelux') return readCinelux(source);
  if (source.method === 'cinemark') return readCinemark(source);
  if (source.method === 'southfirstfridays') return readSouthFirstFridays(source);
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
// A transient source failure must not erase future events that were verified
// successfully on the previous refresh. Reuse only still-active cards from
// failed official sources, preserving their original lastVerifiedAt timestamp.
const failedDirectSourceNames = new Set(feedAttempts
  .filter(result => result.status === 'rejected')
  .map(result => result.sourceName));
const retainedSourceEvents = existingEvents
  .filter(event => failedDirectSourceNames.has(event.source) && isStillActive(event))
  .map(event => ({ ...event, refreshStatus: 'stale-source', refreshErrorAt: generatedAt }));
const freshFeedEvents = feedAttempts.flatMap(result => result.status === 'fulfilled' ? result.value : []);

const sourceRefreshCounts = Object.fromEntries(feedAttempts.map((result, index) => [
  `${result.sourceName} [${directSources[index].method || 'rss'}]`,
  result.status === 'fulfilled' ? result.value.length : -1
]));
console.log(`Source refresh counts: ${JSON.stringify(sourceRefreshCounts)}`);
// A successful calendar parse can still miss one valid event when the
// organizer changes only that card/detail wrapper. Do not silently delete a
// previously verified future activity just because it disappeared from the
// parser output. Re-open its first-party detail URL and retain it only when:
// - the source itself refreshed successfully;
// - the old occurrence is still active;
// - the URL is still on that source's approved official domain;
// - the live page still contains the event title;
// - the page does not explicitly say the event is cancelled.
// This is a general source-resilience rule, not an event-specific exception.
const successfulDirectSourceNames = new Set(feedAttempts
  .filter(result => result.status === 'fulfilled')
  .map(result => result.sourceName));
const directSourceByName = new Map(directSources.map(source => [source.name, source]));
const freshOfficialKeys = new Set(freshFeedEvents.map(event =>
  `${event.source}\u001f${plainText(event.title).toLowerCase()}\u001f${String(event.url || '').toLowerCase()}`
));

async function revalidateMissingOfficialEvent(event) {
  const source = directSourceByName.get(event.source);
  if (!source || !event.url || !successfulDirectSourceNames.has(event.source) || !isStillActive(event)) return null;
  if (!isOfficialUrl(event.url, source.domain)) return null;
  const key = `${event.source}\u001f${plainText(event.title).toLowerCase()}\u001f${String(event.url).toLowerCase()}`;
  if (freshOfficialKeys.has(key)) return null;
  try {
    const response = await fetch(event.url, {
      headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' },
      signal: AbortSignal.timeout(12000)
    });
    const html = await response.text();
    if (!response.ok) return null;
    const pageText = plainText(html);
    if (!isSameEvent(event.title, pageText)) return null;
    if (/\b(?:this event (?:has been )?cancell?ed|event cancell?ed)\b/i.test(pageText)) return null;
    return {
      ...event,
      refreshStatus: 'revalidated-missing',
      refreshVerifiedAt: generatedAt
    };
  } catch {
    return null;
  }
}

const revalidatedMissingEvents = (await Promise.all(existingEvents
  .filter(event => successfulDirectSourceNames.has(event.source) && isStillActive(event))
  .map(revalidateMissingOfficialEvent))).filter(Boolean);
const feedEvents = [...freshFeedEvents, ...retainedSourceEvents, ...revalidatedMissingEvents];
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
  const type = typeFor(source, item.title);
  const dateValue = await officialStartDate(item);
  return {
    sourceName: item.source,
    event: {
    id: 'search-' + createHash('sha256').update(item.link.toLowerCase()).digest('hex').slice(0, 16), title: item.title, date: displayEventDate(dateValue) || fallbackTime, dateValue,
    ageBands: [], ageRanges: [], ageMin: null, ageMax: null, ageLabel: '', ageSource: '',
    costStatus: 'unknown', costLabel: '费用未注明', costSource: '', costEvidence: '',
    registrationStatus: 'unknown', registrationSource: '', registrationEvidence: '',
    lastVerifiedAt: generatedAt, type, icon: icons[type], color: colors[type], tag: labels[type],
    ...buildSummaryRecord({ sourceText: '', title: item.title, verifiedAt: generatedAt }),
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
const preliminaryEvents = [...new Map([...feedEvents, ...candidates]
  .map(event => [`${event.url.toLowerCase()}|${event.dateValue || ''}`, event])).values()]
  // A card must explain what the activity is. A source's speaker bio, social
  // promotion, or logistics copy is not an activity summary and cannot pass
  // this final publication gate.
  .filter(event => hasUsableSourceContent(event.description))
  // A closure notice is useful operational information, but it is not a
  // family activity and must never enter the browse catalog.
  .filter(event => !/\b(?:library|bookmobile|museum|park|facility|center)\b.*\bclosed\b|\bclosed\b.*\b(?:library|bookmobile|museum|park|facility|center)\b/i.test(event.title || ''))
  .filter(event => !isUnavailableEvent(event))
  .filter(isFamilyRelevant)
  .map(withPresentationFields)
  .map(qualityGateSummary)
  .filter(Boolean)
  .sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));

function eventTitleTokens(title) {
  return new Set(plainText(title).toLowerCase().replace(/\b(?:san|jose|milpitas|palo|alto|santa|clara|cupertino|sunnyvale|mountain|view|los)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 2));
}

function normalizedEventLocation(event) {
  return plainText([event.address, event.place].filter(Boolean).join(' '))
    .toLowerCase()
    .replace(/\b(?:california|ca)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDirectEventUrl(value) {
  try {
    const url = new URL(value);
    return /\/events\/[a-z0-9-]{8,}\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function organizerPriority(event) {
  // Canonical duplicates should favor the most actionable first-party record:
  // a direct event-detail URL and official event image are more useful than a
  // generic category/listing page, even when that listing is manually curated.
  let score = 0;
  if (isDirectEventUrl(event.url)) score += 8;
  if (event.image) score += 4;
  if (/^City of\s+/i.test(event.source || '')) score += 6;
  if (event.source && event.place && plainText(event.place).toLowerCase().includes(plainText(event.source).toLowerCase())) score += 4;
  if (event.verification === 'official-page') score += 3;
  if (event.verification === 'rss') score += 2;
  if (event.address) score += 1;
  return score;
}

function mergeDuplicateEvent(primary, secondary) {
  const merged = {
    ...primary,
    legacyIds: [...new Set([
      ...(primary.legacyIds || []), primary.id,
      ...(secondary.legacyIds || []), secondary.id
    ].filter(Boolean))]
  };
  if (!merged.image && secondary.image) merged.image = secondary.image;
  if (!merged.endDateValue && secondary.endDateValue) merged.endDateValue = secondary.endDateValue;
  if ((!merged.costStatus || merged.costStatus === 'unknown') && secondary.costStatus && secondary.costStatus !== 'unknown') {
    merged.costStatus = secondary.costStatus;
    merged.costLabel = secondary.costLabel;
    merged.costSource = secondary.costSource;
    merged.costEvidence = secondary.costEvidence;
  }
  if ((!merged.registrationStatus || merged.registrationStatus === 'unknown')
      && secondary.registrationStatus && secondary.registrationStatus !== 'unknown') {
    merged.registrationStatus = secondary.registrationStatus;
    merged.registrationSource = secondary.registrationSource;
    merged.registrationEvidence = secondary.registrationEvidence;
  }
  return merged;
}

function coalesceCrossSourceDuplicates(events) {
  const result = [];
  events.forEach(event => {
    const tokens = eventTitleTokens(event.title);
    const matchIndex = result.findIndex(existing => {
      const eventDay = String(event.dateValue || '').slice(0, 10);
      const existingDay = String(existing.dateValue || '').slice(0, 10);
      if (!eventDay || eventDay !== existingDay || !event.city || existing.city !== event.city) return false;

      const eventTime = String(event.dateValue || '').match(/T(\d{2}:\d{2})/)?.[1] || '';
      const existingTime = String(existing.dateValue || '').match(/T(\d{2}:\d{2})/)?.[1] || '';
      // A date-only organizer listing may duplicate a partner listing with an
      // exact start time. Two explicit, different times remain separate.
      if (eventTime && existingTime && eventTime !== existingTime) return false;

      const sameSourceExactTitle = event.source === existing.source
        && plainText(event.title).toLowerCase() === plainText(existing.title).toLowerCase();
      if (sameSourceExactTitle) return true;

      const eventLocation = normalizedEventLocation(event)
        .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd');
      const existingLocation = normalizedEventLocation(existing)
        .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd');
      const eventLocationTokens = new Set(eventLocation.split(' ').filter(Boolean));
      const existingLocationTokens = new Set(existingLocation.split(' ').filter(Boolean));
      const sharedLocationTokens = [...eventLocationTokens].filter(token => existingLocationTokens.has(token));
      const eventStreetNumber = eventLocation.match(/\b\d{2,6}\b/)?.[0] || '';
      const existingStreetNumber = existingLocation.match(/\b\d{2,6}\b/)?.[0] || '';
      const sameStreet = eventStreetNumber && eventStreetNumber === existingStreetNumber && sharedLocationTokens.length >= 3;
      const sameLocation = eventLocation && existingLocation
        && (eventLocation === existingLocation || eventLocation.includes(existingLocation) || existingLocation.includes(eventLocation) || sameStreet);
      if (!sameLocation) return false;

      const otherTokens = eventTitleTokens(existing.title);
      const shared = [...tokens].filter(token => otherTokens.has(token)).length;
      const minSize = Math.min(tokens.size, otherTokens.size);
      return shared >= 2 && minSize > 0 && shared / minSize >= 0.6;
    });
    if (matchIndex < 0) {
      result.push(event);
    } else {
      const existing = result[matchIndex];
      const eventWins = organizerPriority(event) > organizerPriority(existing);
      result[matchIndex] = eventWins
        ? mergeDuplicateEvent(event, existing)
        : mergeDuplicateEvent(existing, event);
    }
  });
  return result;
}

const individualEvents = coalesceCrossSourceDuplicates(preliminaryEvents)
  .map(withEffectiveEndTime)
  .sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));

function seriesKey(event) {
  if (event.format === 'movie-screening') {
    // A title is one parent-facing activity even when cinema chains disagree
    // about its rating or capitalization. Keep the rating off the identity key
    // and resolve any disagreement conservatively while building the card.
    return [event.format, normalizedMovieTitle(event.title), event.type].join('\u001f');
  }
  // Deliberately conservative: different themes, venues, audience rules, or
  // pricing stay as separate cards even when a host reuses the same title.
  return [event.source, event.title, event.description, event.place, event.address, event.meetingPoint, event.city, event.type,
    JSON.stringify(event.ageRanges || []), event.ageLabel || '', event.costLabel, event.costSource, event.registrationStatus].join('\u001f');
}

function groupRepeatedSessions(items) {
  const groups = new Map();
  items.forEach(event => { const key = seriesKey(event); (groups.get(key) || groups.set(key, []).get(key)).push(event); });
  return [...groups.entries()].flatMap(([key, group]) => {
    const ordered = group.sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));
    // Preserve the series identity (and saved-card migration IDs) while
    // removing sessions that have already ended in Pacific time. A morning
    // storytime and next week's storytime must remain one activity, but only
    // the future session should be shown or offered in “other sessions”.
    const active = ordered.filter(event => isStillActive(event));
    if (!active.length) return [];
    if (ordered.length === 1) return active;
    const first = active[0];
    // A cinema can expose several formats and dozens of showtimes per day.
    // Keep the earliest official purchase link for each theater/day on the
    // card; the ticket page remains the complete source of showtimes.
    const cardSessions = first.format === 'movie-screening'
      ? [...new Map(active.map(event => [`${String(event.dateValue).slice(0, 10)}\u001f${event.place}`, event])).values()]
      : active;
    const movieRating = first.format === 'movie-screening'
      ? cautiousMovieRating(ordered.map(event => event.movieRating))
      : first.movieRating;
    const displayTitle = first.format === 'movie-screening'
      ? ordered.find(event => /[a-z]/.test(event.title || ''))?.title || first.title
      : first.title;
    const audience = first.format === 'movie-screening' && movieRating !== 'G'
      ? { ageBands: [], ageRanges: [], ageMin: null, ageMax: null, ageLabel: '', ageSource: '', familyFriendly: false, audienceStatus: 'not-confirmed' }
      : {};
    return [{
      ...first,
      ...audience,
      id: 'series-' + createHash('sha256').update(key).digest('hex').slice(0, 16),
      title: displayTitle,
      movieRating,
      legacyIds: [...new Set(ordered.flatMap(event => [event.id, ...(event.legacyIds || [])]))],
      source: first.format === 'movie-screening' ? 'Official cinema listings' : first.source,
      sessions: cardSessions.map(event => ({ id: event.id, date: event.date, dateValue: event.dateValue, endDateValue: event.endDateValue, url: event.url, place: event.place, address: event.address, city: event.city }))
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
      dateLabel, description: sourceDescriptionText(description), image: image ? new URL(image, 'https://computerhistory.org/').href : '',
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
    costStatus: 'unknown',
    costLabel: '费用未注明',
    costSource: '',
    costEvidence: '',
    registrationStatus: 'unknown',
    registrationSource: '',
    registrationEvidence: '',
    type,
    icon: icons[type],
    color: colors[type],
    tag: labels[type],
    format: 'museum-exhibition',
    verification: 'official-page',
    lastVerifiedAt: museum.lastVerifiedAt || generatedAt,
    ...buildSummaryRecord({ sourceText: sourceDescriptionText(museum.description), title: museum.title, format: 'museum-exhibition', verifiedAt: generatedAt }),
    image: museum.image || '',
    place: museum.museum || source?.name || 'South Bay museum',
    address: source?.address || '',
    city: canonicalCity(source?.city || ''),
    source: museum.museum || source?.name || '',
    url: museum.url
  };
}

const events = groupRepeatedSessions([...scheduledEvents, ...museums.map(museum => museumAsEvent(museum, museumSource)).map(qualityGateSummary).filter(Boolean)])
  .map(event => ({ ...event, image: optimizedOfficialImageUrl(event.image, event.source) }));

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
const summaryStatusCounts = events.reduce((counts, event) => {
  const status = event.summaryStatus || 'missing';
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});
console.log(`Published ${events.length} verified activities from ${directSources.length} official calendars and ${searchSources.length} fallback sources; ${retainedSourceEvents.length} retained from last-known-good source data; ${translationStats.translated} translated and ${translationStats.cached} translation entries reused from cache.`);
console.log(`Event summary coverage: ${JSON.stringify(summaryStatusCounts)}`);

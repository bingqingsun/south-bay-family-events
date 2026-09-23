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
import { auditLinks, releaseBlockingLinks } from './link-health.mjs';
import { enrichCanonicalEvents } from './canonical-detail-pipeline.mjs';
import { selectPublishableOfficialDescription } from './official-description.mjs';
import { configuredCandidates, sitemapCandidates, verifySpecialEventPage } from './special-event-pages.mjs';
import { selectCupertinoDetailDates } from './cupertino-detail-date.mjs';
import { cupertinoAudienceEvidence } from './cupertino-audience.mjs';

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
  if (/\b(?:bike|bicycle)\b[^.!?]{0,48}\brepair\b|\b(?:community service|volunteer(?:ing)?|cleanup|donation|food drive|swap|mento(?:r|ring)|appointment|customer service|career help|tech help|free snacks|festival|celebration|fest|halloween|trick[- ]or[- ]treat|monster mash|tree lighting|holiday|santa)\b/.test(value)) return 'community';
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
  const format = event.format || formatFor(audienceText);
  // A stale-source card deliberately preserves official content when a source
  // times out, but its old presentation fields are derived data. Recompute
  // them so a previous bad category cannot survive an otherwise safe fallback.
  const type = event.refreshStatus === 'stale-source'
    ? (format === 'live-show' ? 'shows' : typeFor(audienceText, event.title))
    : event.type;
  return {
    ...event,
    type,
    icon: icons[type],
    color: colors[type],
    tag: labels[type],
    format,
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
  const noRegistrationPattern = /\b(?:no registration (?:is )?required|registration (?:is )?not required|without registration|does not require (?:tickets?|registration)|no tickets? (?:or )?registration (?:is )?required)\b/i;
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
  const freePattern = /\b(?:free admission|admission is free|free (?:community )?event|free program|free activity|free entry|free to attend|free to (?:the )?public|free and open to (?:the )?public|complimentary admission|registration is free|no (?:admission )?cost|no (?:admission |entry )?charge|no (?:registration |entry |admission )?fee)\b/i;
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
    const useDetail = detailSummary && hasUsableSourceContent(detailSummary.description);
    return {
      ...event,
      ...(useDetail ? detailSummary : {}),
      image: event.image || details.image
    };
  }));
  return enriched.filter(event => hasUsableSourceContent(event.description));
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
    const description = sourceDescriptionText(block);
    const dateValue = isoDateFromOfficialText(dateText, timeText);
    const eventText = `${title} ${description}`;
    const parsedLocation = venueAndAddress(location, source.city || '');
    const city = parsedLocation.city || ['San Jose', 'Santa Clara', 'Mountain View', 'Palo Alto', 'Milpitas', 'Cupertino', 'Los Altos', 'Sunnyvale']
      .find(candidate => new RegExp(`\\b${candidate}\\b`, 'i').test(location)) || source.city || '';
    const familySignal = /\b(?:family|children|kids?|youth|teen|all ages|festival|celebration|cultural|museum open|hands-on|lion dance|scavenger hunt)\b/i.test(eventText);
    // CHCP's calendar also syndicates adult lectures and non-local events.
    // Keep only locally held cultural activities with an explicit family or
    // youth signal in CHCP's own title or description.
    if (!title || !href || !isUpcoming(dateValue) || /\bonline\b/i.test(location) || !/San Jose|Santa Clara|Mountain View|Palo Alto|Milpitas|Cupertino|Los Altos|Sunnyvale/i.test(location) || !familySignal || !hasUsableSourceContent(description)) return [];
    const url = new URL(href, source.feedUrl).href;
    const event = directEvent({
      id: 'chcp-' + createHash('sha256').update(`${url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, description,
      image: officialPageImage(block, source.feedUrl, /([\s\S]*)/),
      place: parsedLocation.place || source.name, address: parsedLocation.address, city, source: source.name, url,
      // “Festival” alone does not prove an age range. Only expose an age tag
      // when CHCP explicitly names an audience; otherwise leave it unlabelled.
      ageText: /family|children|kids?|youth|all ages/i.test(eventText) ? eventText : ''
    });
    return [event];
  });
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
    const endDateValue = isoDateFromOfficialText(dateText, times.at(-1) || times[0] || '');
    const familySignal = /\b(?:children|child|family|families|kid|youth|teen|lunar new year|cultural|cars in the park)\b/i.test(`${title} ${locationText}`);
    const description = sourceDescriptionText(block);
    // The listing also contains fundraisers, private rentals, and adult-only
    // programs. Publish only when the official title has an explicit family
    // signal and it yields a parent-facing explanation of the activity.
    if (!title || !isUpcoming(dateValue) || !familySignal || !hasPublishableSummary(description, { title }) || isExplicitlyAdultOnly(`${title} ${locationText}`)) return [];
    const event = directEvent({
      id: 'history-' + createHash('sha256').update(`${url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, endDateValue, description,
      image: image ? new URL(image, source.feedUrl).href : '',
      place: plainText(locationText.split(/\b(?:Cost:|Stay tuned|Tickets?)/i)[0]) || source.name,
      address: source.address || '', city: source.city || '', source: source.name, url,
      ageText: 'family'
    });
    const costText = locationText.match(/\bCost:\s*([^|]+?)(?=\s+(?:Register|Stay tuned|Tickets?)|$)/i)?.[1] || '';
    return [{ ...event, ...costInfo(costText, locationText) }];
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

function directEvent({ id, title, dateValue, endDateValue = '', description, image = '', imagePresentation = '', imageBackground = '', place, address = '', city = '', meetingPoint = '', mapUrl = '', source, url, ageText = '', format = '', movieRating = '', forcedType = '', seasonalTheme = '', availabilityStatus = '', summaryStatus = 'extractive', summaryEvidenceData = null }) {
  // Detail-page chrome can list unrelated sports/classes. It is useful for
  // detecting a stated child audience, but must never determine the card's
  // activity type. Classify from the actual event title and description.
  const sourceText = title + ' ' + description;
  const effectiveFormat = format || formatFor(sourceText);
  const type = forcedType || (effectiveFormat === 'live-show' ? 'shows' : effectiveFormat === 'movie-screening' ? 'movies' : typeFor(sourceText, title));
  const age = ageInfo(sourceText + ' ' + ageText);
  const summary = buildSummaryRecord({
    sourceText: sourceDescriptionText(description),
    title,
    format,
    status: summaryStatus,
    verifiedAt: generatedAt,
    evidenceData: summaryEvidenceData
  });
  return {
    id, title, date: displayEventDate(dateValue), dateValue, endDateValue, ...age,
    costStatus: 'unknown', costLabel: '费用未注明', costSource: '', costEvidence: '',
    registrationStatus: 'unknown', registrationSource: '', registrationEvidence: '',
    type, icon: icons[type], color: colors[type], tag: labels[type],
    verification: 'official-page', lastVerifiedAt: generatedAt, format: effectiveFormat,
    ...summary,
    image: optimizedOfficialImageUrl(image, source), imagePresentation, imageBackground, place, address, city: canonicalCity(city), meetingPoint, mapUrl, source, url, movieRating,
    seasonalTheme: seasonalTheme || seasonalThemeFor(`${title} ${description}`), availabilityStatus
  };
}

function optimizedOfficialImageUrl(value, source = '') {
  if (!value || !/^https?:\/\//i.test(value)) return value || '';
  try {
    const url = new URL(value);
    if (url.hostname.endsWith('cupertino.gov') && (url.searchParams.get('dimension') === 'smallthumbnail' || (url.searchParams.has('w') && Number(url.searchParams.get('w')) <= 100))) url.search = '';
    if (url.hostname === 'filoli.org' && /\/media\//.test(url.pathname) && url.searchParams.has('width') && Number(url.searchParams.get('width')) <= 320) url.search = '';
    // Preserve organizer-provided event artwork even when the upstream CMS uses
    // a small/square filename convention. A verified official image is safer
    // than silently discarding it and forcing generic fallback art.
    return url.href;
  } catch { return value; }
}

// A few major local festivals publish a single authoritative event page rather
// than a calendar feed.  Keep their verified current-season occurrences in
// the source registry so they enter the same validation, grouping, expiry and
// card pipeline as calendar-fed events.  Once their date passes, isUpcoming
// removes them automatically; a new season is added only after its organizer
// publishes an official date.
async function curatedOfficialDescription(url, title) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    if (!response.ok) return '';

    // Prefer schema.org Event data because it binds the description to a
    // specific event entity instead of to the surrounding website.
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const nodes = eventNodes(JSON.parse(decodeXml(match[1])));
        const event = nodes.find(node => {
          const type = String(node?.['@type'] || '').toLowerCase();
          const name = node?.name || node?.headline || '';
          return type.includes('event') && isSameEvent(name, title);
        });
        const description = sourceDescriptionText(event?.description || '');
        if (description && hasPublishableSummary(description, { title })) return description;
      } catch {
        // Malformed analytics JSON-LD must not block the verified manual copy.
      }
    }

    // Some official pages expose only OpenGraph/HTML metadata. Use it only
    // when the same page title clearly matches the curated event title.
    const pageTitle = decodeXml(
      html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1]
      || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || ''
    );
    if (!isSameEvent(pageTitle, title)) return '';
    const meta = decodeXml(
      html.match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)/i)?.[1]
      || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](?:description|og:description)["']/i)?.[1]
      || ''
    );
    const description = sourceDescriptionText(meta);
    return description && hasPublishableSummary(description, { title }) ? description : '';
  } catch {
    return '';
  }
}

async function readCurated(source) {
  const items = (source.events || []).filter(item => item.title && isUpcoming(item.dateValue));
  return (await Promise.all(items.map(async (item, index) => {
    const url = item.url || source.feedUrl;
    const officialDescription = await curatedOfficialDescription(url, item.title);
    const description = officialDescription || item.description || '';
    const event = directEvent({
      id: 'curated-' + createHash('sha256').update(`${source.feedUrl}|${item.title}|${item.dateValue}|${index}`).digest('hex').slice(0, 16),
      title: item.title,
      dateValue: item.dateValue,
      endDateValue: item.endDateValue || '',
      description,
      image: item.image || '',
      place: item.place || source.name,
      address: item.address || '',
      city: item.city || source.city || '',
      source: source.name,
      url,
      ageText: item.ageText || '',
      format: item.format || '',
      seasonalTheme: item.seasonalTheme || '',
      availabilityStatus: item.availabilityStatus || '',
      summaryStatus: officialDescription ? 'extractive' : 'manual_verified'
    });
    if (!hasUsableSourceContent(event.description)) return null;
    return {
      ...event,
      ...costInfo(item.cost || '', officialDescription || item.description || ''),
      ...(item.image ? {
        imageStatus: 'official',
        imageProvenance: {
          source: 'curated-manual',
          method: 'manual_verified',
          sourceUrl: url,
          verifiedAt: generatedAt,
          score: 100,
          evidence: 'first-party-curated-official-image'
        }
      } : {}),
      // This URL is explicitly configured from a first-party organizer page.
      // Link Health still checks HTTP/soft errors, but an inconclusive machine
      // title extraction must not erase this human-verified evidence.
      linkSource: 'curated_verified'
    };
  }))).filter(Boolean);
}

// Eventbrite organizer pages expose an official upcoming-events payload that
// includes ticket availability. This lets us retain The Village as a durable
// source while suppressing sold-out, cancelled, protected and expired events.
async function readEventbriteOrganizer(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok) throw new Error('Eventbrite organizer page was not valid: ' + response.status);
  const payloadText = html.match(/"upcomingEvents":(\[[\s\S]*?\]),"hasMoreUpcoming"/)?.[1];
  if (!payloadText) throw new Error('Eventbrite organizer payload was not found');
  let items;
  try { items = JSON.parse(payloadText); } catch { throw new Error('Eventbrite organizer payload could not be read'); }
  const familyPattern = new RegExp(source.familyPattern || 'family|children|kids?|all ages|youth', 'i');
  const available = items.filter(item => item?.url && isUpcoming(item.start_date)
    && !item.is_cancelled && !item.is_protected_event
    && item.event_sales_status?.sales_status !== 'sold_out'
    && item.ticket_availability?.is_sold_out !== true
    && item.ticket_availability?.has_available_tickets !== false);
  const events = await Promise.all(available.map(async (item, index) => {
    const detailResponse = await fetch(item.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
    const detailHtml = await detailResponse.text();
    if (!detailResponse.ok || /"salesStatus"\s*:\s*"sold_out"/i.test(detailHtml)) return null;
    const schemas = [...detailHtml.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
      try { return eventNodes(JSON.parse(decodeXml(match[1]))); } catch { return []; }
    });
    const schema = schemas.find(node => String(node?.['@type'] || '').toLowerCase() === 'event') || {};
    const title = plainText(schema.name || item.name);
    const longDescription = plainText(detailHtml.match(/Overview[^>]*__summary[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
    const description = longDescription || plainText(schema.description || item.summary);
    const audienceText = `${title} ${description}`;
    if (!title || !hasUsableSourceContent(description) || !familyPattern.test(audienceText) || isExplicitlyAdultOnly(audienceText)) return null;
    const venue = schema.location || {};
    const venueAddress = item.primary_venue?.address || {};
    const city = canonicalCity(venueAddress.city || venue.address?.addressLocality || source.city || '');
    const dateValue = String(schema.startDate || `${item.start_date}T${item.start_time || '00:00'}`).slice(0, 19);
    const endDateValue = String(schema.endDate || `${item.end_date || item.start_date}T${item.end_time || item.start_time || '23:59'}`).slice(0, 19);
    const event = directEvent({
      id: 'eventbrite-' + createHash('sha256').update(`${item.url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, endDateValue, description,
      image: schema.image || item.image?.image_sizes?.medium || item.image?.url || '',
      place: plainText(venue.name || item.primary_venue?.name || source.name),
      address: shortAddress(venueAddress.address_1 || venue.address?.streetAddress || source.address || '', city), city,
      source: source.name, url: item.url, ageText: audienceText
    });
    return { ...event, ...costInfo(item.ticket_availability?.is_free ? 'Free' : '', description) };
  }));
  return events.filter(Boolean);
}

// Google Visitor Experience renders its calendar client-side, but publishes
// an official, public JSON file for every calendar month. Read that feed
// directly so family events get their exact session, official image and RSVP
// page without relying on search results or a manually curated occurrence.
function validatedGoogleVisitorSourceDescription(title, description) {
  const genericWords = new Set(['google', 'visitor', 'experience', 'event', 'events', 'family', 'class', 'workshop', 'with', 'the', 'and', 'for']);
  const specificTitleWords = plainText(title).toLowerCase().match(/[a-z]{4,}/g)?.filter(word => !genericWords.has(word)) || [];
  const descriptionText = plainText(description).toLowerCase();
  // Calendar systems occasionally carry a stale description from another
  // event. A card must never claim that a yoga class is a craft workshop. In
  // that case the official title is the only trustworthy activity detail.
  if (specificTitleWords.length && !specificTitleWords.some(word => descriptionText.includes(word))) {
    return '';
  }
  return description;
}

async function readGoogleVisitorEvents(source) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric'
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const firstYear = Number(parts.year);
  const firstMonth = Number(parts.month);
  const monthsAhead = Math.max(1, Math.min(Number(source.monthsAhead) || 4, 12));
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const familyPattern = new RegExp(source.familyPattern || 'family|children|kids?|all ages|youth', 'i');
  const payloads = await Promise.all(Array.from({ length: monthsAhead }, async (_, index) => {
    const monthOffset = (firstMonth - 1) + index;
    const year = firstYear + Math.floor(monthOffset / 12);
    const month = (monthOffset % 12) + 1;
    const url = new URL(`/static/data/${year}/${month}.json`, source.feedUrl);
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Google Visitor Experience calendar was not valid: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.eventsForMonth)) throw new Error('Google Visitor Experience calendar payload was not valid');
    return data.eventsForMonth;
  }));
  const candidates = payloads.flat().flatMap(item => {
    const event = item?.document_content || {};
    const title = plainText(event.title);
    const description = validatedGoogleVisitorSourceDescription(event.title, plainText(event.description));
    const dateValue = String(event.start_time || '').replace(' ', 'T').slice(0, 16);
    const endDateValue = String(event.end_time || '').replace(' ', 'T').slice(0, 19);
    const url = event.rsvp_link?.button_link_url || source.feedUrl;
    const activityText = `${title} ${description}`;
    if (!title || !dateValue || !isUpcoming(dateValue) || !familyPattern.test(activityText) || isExplicitlyAdultOnly(activityText)) return [];
    return [{ title, description, dateValue, endDateValue, url, event }];
  });
  // The Google feed can contain duplicate sessions when an event RSVP page is
  // updated. Keep one card for the session and prefer the year-specific RSVP
  // page plus the richer official description.
  const unique = [...candidates.reduce((events, item) => {
    const key = `${item.title.toLowerCase()}|${item.dateValue}`;
    const previous = events.get(key);
    const score = value => (value.url.includes(String(value.dateValue).slice(0, 4)) ? 1000 : 0) + value.description.length;
    if (!previous) events.set(key, item);
    else {
      const preferred = score(item) > score(previous) ? item : previous;
      const richerDescription = item.description.length > previous.description.length ? item.description : previous.description;
      events.set(key, { ...preferred, description: richerDescription });
    }
    return events;
  }, new Map()).values()];
  return unique.map((item, index) => {
    const image = item.event.image?.image?.url || '';
    const place = plainText(item.event.location || source.name);
    const event = directEvent({
      id: 'google-visitor-' + createHash('sha256').update(`${item.url}|${item.dateValue}|${index}`).digest('hex').slice(0, 16),
      title: item.title, dateValue: item.dateValue, endDateValue: item.endDateValue,
      description: item.description, image, place, address: source.address || '', city: source.city || '',
      source: source.name, url: item.url, ageText: `${item.title} ${item.description}`
    });
    return { ...event, ...costInfo('', item.description) };
  }).filter(event => hasUsableSourceContent(event.description));
}

function officialPageOgImage(html) {
  return decodeXml(html.match(/<meta\s+(?:property|name)=["'](?:og:image|twitter:image)["']\s+content=["']([^"']+)/i)?.[1]
    || html.match(/<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["'](?:og:image|twitter:image)["']/i)?.[1]
    || '');
}

function isWithinPublishingHorizon(dateValue, days = 180) {
  const date = String(dateValue || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!date) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  return (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000 <= days;
}

// Wix Events exposes its public event records in appsWarmupData. The markup is
// dynamic, but these official fields contain the exact date, venue, address,
// description, image and event slug without relying on a search fallback.
async function readWixEvents(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok || !/"startDate":"20\d{2}-\d{2}-\d{2}/.test(html)) throw new Error('Wix official event list was not valid: ' + response.status);
  const seen = new Set();
  return [...html.matchAll(/"startDate":"(20\d{2}-\d{2}-\d{2}T[^"]+)"/g)].flatMap((match, index) => {
    const start = decodeXml(match[1]).replace(/\\\//g, '/');
    const block = html.slice(Math.max(0, match.index - 1800), match.index + 5000);
    const title = decodeXml(block.match(/"title":"([^"]+)"/)?.[1] || '').replace(/\\\//g, '/');
    const description = decodeXml(block.match(/"description":"([^"]*)"/)?.[1] || '').replace(/\\\//g, '/');
    const startDateText = decodeXml(block.match(/"startDateFormatted":"([^"]+)"/)?.[1] || '');
    const startTimeText = decodeXml(block.match(/"startTimeFormatted":"([^"]+)"/)?.[1] || '');
    const endDateText = decodeXml(block.match(/"endDateFormatted":"([^"]+)"/)?.[1] || '');
    const endTimeText = decodeXml(block.match(/"endTimeFormatted":"([^"]+)"/)?.[1] || '');
    const address = decodeXml(block.match(/"address":"([^"]+)"/)?.[1] || '').replace(/\\\//g, '/').replace(/, USA$/i, '');
    const place = decodeXml(block.match(/"location":\{"name":"([^"]+)"/)?.[1] || source.name).replace(/\\\//g, '/');
    const image = decodeXml(block.match(/"mainImage":\{[^}]*"url":"([^"]+)"/)?.[1] || '').replace(/\\\//g, '/');
    const slug = decodeXml(block.match(/"slug":"([^"]+)"/)?.[1] || '');
    const key = `${title}|${start}`;
    const dateValue = isoDateFromOfficialText(startDateText, startTimeText) || start;
    const endDateValue = isoDateFromOfficialText(endDateText, endTimeText);
    if (!title || !description || !isUpcoming(dateValue) || seen.has(key)) return [];
    seen.add(key);
    return [directEvent({
      id: 'wix-' + createHash('sha256').update(`${source.feedUrl}|${key}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, endDateValue, description, image, place, address, city: source.city || '', source: source.name,
      url: slug ? new URL(`/event-details/${slug}`, source.feedUrl).href : source.feedUrl, format: source.format || 'festival'
    })];
  }).filter(event => hasUsableSourceContent(event.description));
}

// Squarespace event collections are server rendered, which makes them a
// durable official feed for organizations that do not offer RSS or ICS.
async function readSquarespaceEvents(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok || !/eventlist-event/i.test(html)) throw new Error('Squarespace official event list was not valid: ' + response.status);
  const familyPattern = new RegExp(source.familyPattern || 'family|children|kids?|all ages|youth', 'i');
  return [...html.matchAll(/<article class=["'][^"']*eventlist-event[^"']*["'][\s\S]*?<\/article>/gi)].flatMap((match, index) => {
    const block = match[0];
    const title = htmlAttribute(block, /eventlist-title[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i);
    const href = htmlAttribute(block, /eventlist-title[^>]*>\s*<a[^>]+href=["']([^"']+)/i);
    const dates = [...block.matchAll(/<time class=["']event-date["']\s+datetime=["']([^"']+)/gi)].map(item => item[1]);
    const dateValue = dates[0] || '';
    const endDateValue = dates.at(-1) || '';
    const description = htmlAttribute(block, /eventlist-excerpt[^>]*>([\s\S]*?)<\/div>/i);
    const image = htmlAttribute(block, /<img[^>]+(?:data-image|src)=["']([^"']+)/i);
    const place = htmlAttribute(block, /eventlist-meta-address-line["'][^>]*>([\s\S]*?)<\/span>/i) || source.name;
    const text = `${title} ${description}`;
    if (!title || !href || !isUpcoming(dateValue) || !familyPattern.test(text) || !hasUsableSourceContent(description)) return [];
    const event = directEvent({
      id: 'squarespace-' + createHash('sha256').update(`${href}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title, dateValue, endDateValue, description, image, place, address: source.address || '', city: source.city || '',
      source: source.name, url: new URL(href, source.feedUrl).href, ageText: text, format: source.format || 'festival'
    });
    return [{ ...event, ...costInfo('', description) }];
  });
}

// Santana Row's public events index is server-rendered and provides one card
// per official event. Read that index instead of hard-coding one Halloween
// date, so future family festivals are picked up when the organizer publishes
// them. Detail pages are used only to improve the official image/summary.
async function readSantanaRow(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok || !/class=["'][^"']*events/i.test(html)) throw new Error('Santana Row events page was not valid: ' + response.status);
  const familyPattern = new RegExp(source.familyPattern || 'family|families|children|kids?|all ages|pumpkin|halloween|trick-or-treat|d[ií]a de|craft', 'i');
  const blocks = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bevent\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bevent\b|<\/section>|$)/gi)].map(match => match[0]);
  const cards = blocks.map((block, index) => {
    const title = plainText(block.match(/<h2\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1] || '');
    const href = htmlAttribute(block, /<a\b[^>]*href=["']([^"']+)["']/i);
    const dateText = plainText(block.match(/<div\b[^>]*class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const description = plainText(block.match(/<div\b[^>]*class=["'][^"']*excerpt[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const image = htmlAttribute(block, /<img\b[^>]*(?:data-src|src)=["']([^"']+)["']/i);
    const dateValue = isoDateFromOfficialText(dateText, dateText);
    return { index, title, href: href ? new URL(href, source.feedUrl).href : '', dateText, dateValue, description, image };
  }).filter(card => card.title && card.href && card.dateValue && isUpcoming(card.dateValue)
    && familyPattern.test(`${card.title} ${card.description}`));

  const details = await Promise.all(cards.map(async card => {
    try {
      const detailResponse = await fetch(card.href, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      const detailHtml = await detailResponse.text();
      if (!detailResponse.ok) return card;
      const detailText = plainText(detailHtml);
      const metaDescription = decodeXml(detailHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
      const description = sourceDescriptionText(metaDescription || card.description);
      return {
        ...card,
        description,
        image: officialPageOgImage(detailHtml) || card.image,
        audienceText: detailText,
        availabilityStatus: /\b(?:sold out|registration (?:is )?full|fully booked)\b/i.test(detailText) ? 'sold out' : ''
      };
    } catch { return card; }
  }));

  return details.flatMap(card => {
    if (!hasUsableSourceContent(card.description)) return [];
    const event = directEvent({
      id: 'santana-' + createHash('sha256').update(`${card.href}|${card.dateValue}`).digest('hex').slice(0, 16),
      title: card.title, dateValue: card.dateValue, description: card.description, image: card.image,
      place: source.place || source.name, address: source.address || '', city: source.city || '',
      source: source.name, url: card.href, ageText: `${card.title} ${card.description} ${card.audienceText || ''}`,
      format: /festival|celebration|trick-or-treat/i.test(card.title) ? 'festival' : '',
      availabilityStatus: card.availabilityStatus || ''
    });
    return [{ ...event, ...costInfo('', card.description) }];
  });
}

// Some annual organizers publish a single landing page rather than a real
// calendar. A source-owned date pattern lets us pick up their next season once
// announced, while keeping far-future cards out of the live discovery feed.
async function readAnnualFestival(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(20000) });
  const html = await response.text();
  if (!response.ok) throw new Error('Annual festival official page was not valid: ' + response.status);
  const pattern = new RegExp(source.datePattern || '', 'i');
  const dateText = pattern.exec(plainText(html))?.[0] || '';
  const dateValue = isoDateFromOfficialText(dateText);
  if (!dateValue || !isUpcoming(dateValue) || !isWithinPublishingHorizon(dateValue)) return [];
  const metaDescription = decodeXml(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1]
    || html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i)?.[1] || '');
  const officialDescription = sourceDescriptionText(metaDescription || source.description || '');
  const event = directEvent({
    id: 'annual-' + createHash('sha256').update(`${source.feedUrl}|${dateValue}`).digest('hex').slice(0, 16),
    title: source.title || source.name, dateValue, description: officialDescription, image: officialPageOgImage(html),
    place: source.place || source.name, address: source.address || '', city: source.city || '', source: source.name,
    url: source.feedUrl, ageText: source.ageText || '', format: source.format || 'festival',
    summaryStatus: metaDescription ? 'extractive' : 'manual_verified'
  });
  return hasUsableSourceContent(event.description) ? [event] : [];
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
  const physicsDescription = sourceDescriptionText(physicsHtml.match(/Physics Show at Foothill[\s\S]{0,1200}?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
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
      title: 'The Physics Show', dateValue, description: physicsDescription, image: physicsImage,
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
      title: cleanTitle, dateValue, description: cleanTitle === 'The Physics Show' ? physicsDescription : '', image: cleanTitle === 'The Physics Show' ? physicsImage : '',
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
    return { description: sourceDescriptionText(description), image, ...officialMeetupLocation(html, url) };
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

function stanfordEventsFromPayloads(payloads, source) {
  // “Everyone” in Stanford's calendar includes adult lectures. We only accept
  // entries with an explicit youth/family signal in the organizer's own copy.
  const youthSignal = /family day|family-friendly|families welcome|for families|family program|family event|family workshop|family activit(?:y|ies)|\b(?:kids?|children|teens?|tweens?)\b|youth (?:program|workshop|activit(?:y|ies)|camp)|for youth|K[-– ]?12|elementary|middle school|high school|school[- ]age|girl scout|summer camp|homeschool|storytime/i;
  const titlePattern = source.titlePattern ? new RegExp(source.titlePattern, 'i') : null;
  const seen = new Set();
  return payloads.flatMap(payload => payload.events || []).flatMap(wrapper => {
    const item = wrapper.event || wrapper;
    const instances = (item.event_instances || []).map(value => value.event_instance || value).filter(Boolean);
    const liveInstances = instances.filter(instance => isUpcoming(String(instance?.start || '')));
    if (!liveInstances.length) return [];
    const title = decodeXml(item.title || '').trim();
    const description = item.description_text || item.description || '';
    const audiences = (item.filters?.event_audience || []).map(value => value.name || '').join(' ');
    const departments = (item.departments || []).map(value => value.name || '').join(' ');
    const tags = [...(item.tags || []), ...(item.keywords || [])].join(' ');
    const audienceText = [title, description, audiences, departments, tags].join(' ');
    const url = item.localist_url || item.url;
    const key = String(item.id || url || '');
    if (!title || !url || !key || seen.has(key) || item.private || item.status !== 'live' || /\bcancel+ed\b/i.test(title) || !youthSignal.test(audienceText) || (titlePattern && !titlePattern.test(title))) return [];
    seen.add(key);
    return liveInstances.map((instance, instanceIndex) => {
      const dateValue = String(instance.start || '');
      const endDateValue = String(instance.end || '');
      const event = directEvent({
        id: 'stanford-' + createHash('sha256').update(`${key}|${dateValue}|${instanceIndex}`).digest('hex').slice(0, 16),
        title, dateValue, endDateValue, description, image: item.photo_url || '',
        place: item.location_name || item.location || 'Stanford University',
        address: item.address || '', city: canonicalCity(item.geo?.city || source.city || 'Stanford'),
        source: source.name, url, ageText: audienceText
      });
      return { ...event, ...costInfo(item.ticket_cost || '', description) };
    });
  });
}

async function readStanford(source) {
  const maxPages = Math.max(1, Math.min(Number(source.maxPages) || 1, 10));
  const payloads = await Promise.all(Array.from({ length: maxPages }, async (_, pageIndex) => {
    const url = new URL(source.feedUrl);
    if (maxPages > 1) url.searchParams.set('page', String(pageIndex + 1));
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.events)) throw new Error('Stanford official event API was not valid: ' + response.status);
    return payload;
  }));
  return stanfordEventsFromPayloads(payloads, source);
}

async function readStanfordVenueFamily(source) {
  const base = new URL(source.feedUrl || 'https://events.stanford.edu');
  const matchPattern = new RegExp(source.venuePattern || source.venueSearch || source.departmentSearch || 'Cantor Arts Center', 'i');

  let filterKey = '';
  let filterId = '';

  const placeUrl = new URL('/api/2/places/search', base);
  placeUrl.searchParams.set('search', source.venueSearch || 'Cantor Arts Center');
  placeUrl.searchParams.set('pp', '50');
  const placeResponse = await fetch(placeUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  if (placeResponse.ok) {
    const placePayload = await placeResponse.json();
    const place = (placePayload.places || []).map(wrapper => wrapper.place || wrapper)
      .find(item => matchPattern.test(String(item?.name || item?.title || item?.location || '')));
    if (place?.id) {
      filterKey = 'venue_id';
      filterId = String(place.id);
    }
  }

  if (!filterId) {
    const departmentUrl = new URL('/api/2/departments/search', base);
    departmentUrl.searchParams.set('search', source.departmentSearch || source.venueSearch || 'Cantor Arts Center');
    departmentUrl.searchParams.set('pp', '50');
    const departmentResponse = await fetch(departmentUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    if (departmentResponse.ok) {
      const departmentPayload = await departmentResponse.json();
      const department = (departmentPayload.departments || []).map(wrapper => wrapper.department || wrapper)
        .find(item => matchPattern.test(String(item?.name || item?.title || '')));
      if (department?.id) {
        filterKey = 'group_id';
        filterId = String(department.id);
      }
    }
  }

  if (!filterId) throw new Error('Stanford venue/department was not found for ' + source.name);

  const eventsUrl = new URL('/api/2/events', base);
  eventsUrl.searchParams.set(filterKey, filterId);
  eventsUrl.searchParams.set('days', String(Math.max(1, Math.min(Number(source.days) || 365, 365))));
  eventsUrl.searchParams.set('pp', '100');
  const response = await fetch(eventsUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.events)) throw new Error('Stanford venue/department event API was not valid: ' + response.status);
  return stanfordEventsFromPayloads([payload], source);
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
    // NHL game pages live on the league-wide Gamecenter route, with the
    // away team listed first. The old team-prefixed, home-first URL resolves
    // to an NHL 404 page even though the schedule API data is valid.
    const url = `https://www.nhl.com/gamecenter/${String(game.awayTeam?.abbrev || '').toLowerCase()}-vs-sjs/${dateValue.slice(0, 4)}/${dateValue.slice(5, 7)}/${dateValue.slice(8, 10)}/${game.id}`;
    const structured = buildOfficialSportsSummary({
      homeTeam: 'San Jose Sharks', opponent, venue: game.venue?.default || 'SAP Center at San Jose', gameWord: 'game'
    });
    return [directEvent({
      id: `nhl-${game.id}`, title: `San Jose Sharks vs ${opponent}`, dateValue,
      description: structured.summary, summaryStatus: 'official_structured', summaryEvidenceData: structured.evidenceData, image: game.homeTeam?.logo || '',
      place: game.venue?.default || 'SAP Center at San Jose', address: source.address || '', city: source.city || '', source: source.name, url,
      ageText: 'all ages', format: 'sports-game'
    })];
  });
}

// SAP Center's public list mixes family shows with adult-oriented concerts.
// A venue alone is not an audience signal, so publish only clearly named
// children's/family productions. Sharks home games already come from the NHL
// schedule API, which is the canonical source for game dates and details.
function isSapCenterFamilyShow(title) {
  return /\b(?:monster jam|disney on ice|paw patrol|bluey|blippi|sesame street|harlem globetrotters|hot wheels monster trucks|jurassic world|marvel universe live|family|children(?:'s)?|kids?|youth)\b/i.test(title);
}

function sapCenterListingDates(dateText) {
  const text = String(dateText || '').replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?,?\s+(20\d{2})\b/i);
  if (!match) return [];
  const month = months[match[1].slice(0, 3).toLowerCase()];
  if (!month) return [];
  const firstDay = Number(match[2]);
  const lastDay = Number(match[3] || match[2]);
  const year = Number(match[4]);
  if (lastDay < firstDay || lastDay - firstDay > 14) return [];
  return Array.from({ length: lastDay - firstDay + 1 }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(firstDay + index).padStart(2, '0')}`);
}

function sapCenterDetailSessions(html, year) {
  // SAP Center's session table has nested spans. Parse the published cells
  // before using a text fallback: unrelated inline scripts can otherwise
  // make a generic HTML-to-text conversion swallow later sessions.
  const tableSessions = [...String(html || '').matchAll(/showings_date[\s\S]*?m-date__month[^>]*>\s*([^<]+)[\s\S]*?m-date__day[^>]*>\s*(\d{1,2})[\s\S]*?<span class=["']time\s+cell["'][^>]*>\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi)];
  const parsedTableSessions = tableSessions.map(match => isoDateFromOfficialText(`${plainText(match[1])} ${match[2]}, ${year}`, match[3])).filter(Boolean);
  if (parsedTableSessions.length) return [...new Set(parsedTableSessions)];
  const text = plainText(html).replace(/\s+/g, ' ').trim();
  const sessions = [...text.matchAll(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2})\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/gi)];
  return [...new Set(sessions.map(match => isoDateFromOfficialText(`${match[1]}, ${year}`, match[2])).filter(Boolean))];
}

async function readSapCenter(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/eventItem\s+entry/i.test(html)) throw new Error('SAP Center official event list was not valid: ' + response.status);
  const listings = html.split(/<div class=["'][^"']*\beventItem\b[^"']*["'][^>]*>/i).slice(1).flatMap(block => {
    const url = htmlAttribute(block, /<h3[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)/i)
      || htmlAttribute(block, /<a[^>]+href=["']([^"']*\/events\/detail\/[^"']+)/i);
    const title = plainText(block.match(/<h3[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    const dateText = plainText(block.match(/<div class=["']date["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '');
    const image = htmlAttribute(block, /<div class=["']thumb["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)/i);
    const listingDates = sapCenterListingDates(dateText);
    const year = Number(dateText.match(/\b(20\d{2})\b/)?.[1] || '');
    // Sharks promotional game names can contain “Youth” or “Family”, but the
    // NHL source remains the canonical sports schedule and prevents duplicate
    // cards with a less useful promotional title.
    if (!title || !url || /\b(?:sharks|hockey)\b/i.test(`${title} ${url}`) || !listingDates.length || !isSapCenterFamilyShow(title)) return [];
    return [{ title, url: new URL(url, source.feedUrl).href, image: image ? new URL(image, source.feedUrl).href : '', listingDates, year }];
  });
  const expanded = await Promise.all(listings.map(async listing => {
    let dates = listing.listingDates;
    let description = '';
    try {
      const detailResponse = await fetch(listing.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      if (detailResponse.ok) {
        const detailHtml = await detailResponse.text();
        const detailSessions = sapCenterDetailSessions(detailHtml, listing.year || Number(listing.listingDates[0].slice(0, 4)));
        if (detailSessions.length) dates = detailSessions;
        const meta = decodeXml(detailHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1]
          || detailHtml.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i)?.[1] || '');
        const body = detailHtml.match(/<div[^>]+class=["'][^"']*(?:eventDescription|event-description|description)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
        description = sourceDescriptionText(body || meta);
      }
    } catch {
      // Without first-party description evidence, do not infer show content
      // from the event title.
    }
    if (!hasPublishableSummary(description, { title: listing.title, format: 'live-show' })) return [];
    return dates.filter(isUpcoming).map((dateValue, index) => directEvent({
      id: 'sapcenter-' + createHash('sha256').update(`${listing.url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title: listing.title, dateValue, description, image: listing.image,
      place: 'SAP Center at San Jose', address: source.address || '', city: source.city || '', source: source.name, url: listing.url,
      ageText: 'family', format: 'live-show'
    }));
  }));
  return expanded.flat();
}

function cinemaDateValue(date, time) {
  const match = String(time || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])(?:m)?$/i);
  if (!match) return '';
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'p') hour += 12;
  return `${date}T${String(hour).padStart(2, '0')}:${match[2] || '00'}`;
}

function cineluxMovieMetadata(html, title) {
  const value = String(html || '');
  const synopsis = value.match(/Synopsis\s*<\/h4>[\s\S]{0,500}?<div[^>]+:class=["'][^"']+["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || value.match(/(?:<h2[^>]*>\s*Synopsis\s*<\/h2>|\bSynopsis\b)[\s\S]{0,1800}?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
    || '';
  const genre = value.match(/Genre\s*<\/h4>\s*<div[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  return { summary: sourceDescriptionText(synopsis), genre: plainText(genre) };
}

function cinemarkMovieMetadata(html, title) {
  const value = String(html || '');
  let movie = null;
  for (const match of value.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      movie = eventNodes(JSON.parse(decodeXml(match[1]))).find(item => String(item?.['@type'] || '').toLowerCase() === 'movie') || movie;
    } catch {
      // Fall through to the page metadata below when malformed JSON-LD is
      // injected by an analytics or consent wrapper.
    }
  }
  const meta = value.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]
    || value.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]
    || value.match(/class=["'][^"']*movie-(?:synopsis|description)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]
    || '';
  return {
    summary: sourceDescriptionText(movie?.description || meta),
    genre: plainText(Array.isArray(movie?.genre) ? movie.genre.join(', ') : movie?.genre || '')
  };
}

function cinemarkModels(html) {
  return [...String(html || '').matchAll(/\bdata-json-model=(['"])([\s\S]*?)\1/gi)].flatMap(match => {
    try { return [JSON.parse(decodeXml(match[2]))]; } catch { return []; }
  });
}

async function readCinemark(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (!response.ok || !/data-json-model=/i.test(html)) throw new Error('Cinemark official showtimes were not valid: ' + response.status);
  const candidates = cinemarkModels(html).flatMap(movie => {
    const title = plainText(movie.movieTitle || '');
    const rating = normalizedMovieRating(movie.movieRating || '');
    if (!title || !isPotentialFamilyMovieRating(rating) || !Array.isArray(movie.showTimes)) return [];
    return movie.showTimes.flatMap(showtime => {
      const dateValue = String(showtime.showTime || '').slice(0, 16);
      if (!dateValue || !isUpcoming(dateValue)) return [];
      return [{
        title, rating, dateValue, movieUrl: movie.movieUrl ? new URL(movie.movieUrl, source.feedUrl).href : source.feedUrl,
        image: movie.posterLargeImageUrl || movie.posterMediumImageUrl || '',
        ticketUrl: showtime.showTimeUrl ? new URL(showtime.showTimeUrl, source.feedUrl).href : source.feedUrl
      }];
    });
  });
  const metadata = new Map(await Promise.all([...new Set(candidates.map(item => item.movieUrl))].map(async url => {
    try {
      const detailResponse = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      return [url, detailResponse.ok ? cinemarkMovieMetadata(await detailResponse.text(), '') : { summary: '', genre: '' }];
    } catch { return [url, { summary: '', genre: '' }]; }
  })));
  return candidates.filter(item => {
    const details = metadata.get(item.movieUrl) || {};
    return isKidAppropriateMovie(item.title, item.rating, `${details.genre || ''} ${details.summary || ''}`);
  }).map(item => {
    const details = metadata.get(item.movieUrl) || {};
    const structuredScreening = buildOfficialMovieScreeningSummary({ rating: item.rating, theater: source.name });
    const event = directEvent({
      id: 'cinemark-' + createHash('sha256').update(`${source.feedUrl}|${item.title}|${item.dateValue}|${item.ticketUrl}`).digest('hex').slice(0, 16),
      title: item.title, dateValue: item.dateValue,
      description: details.summary || structuredScreening.summary,
      summaryStatus: details.summary ? 'extractive' : 'official_structured',
      summaryEvidenceData: details.summary ? null : structuredScreening.evidenceData,
      image: item.image, place: source.name, address: source.address || '', city: source.city || '', source: 'Cinemark Theatres', url: item.ticketUrl,
      ageText: item.rating === 'G' ? 'all ages' : '', format: 'movie-screening', movieRating: item.rating
    });
    return { ...event, costStatus: 'paid', costLabel: '需付费／价格见详情', costSource: 'Official cinema ticketing', costEvidence: 'A ticketed cinema screening' };
  });
}

async function readSouthFirstFridays(source) {
  const response = await fetch(source.feedUrl, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
  const posts = await response.json();
  if (!response.ok || !Array.isArray(posts)) throw new Error('South FIRST FRIDAYS official feed was not valid: ' + response.status);
  return posts.flatMap(post => {
    const postTitle = plainText(post?.title?.rendered || '');
    const content = String(post?.content?.rendered || '');
    if (!/south\s+first\s+fridays|artwalksj|art\s*walk/i.test(`${postTitle} ${content}`)) return [];
    // The post headline carries the one authoritative occurrence date; do not
    // derive an event merely from the recurring "first Friday" convention.
    const dateValue = isoDateFromOfficialText(postTitle, plainText(content));
    if (!dateValue || !isUpcoming(dateValue)) return [];
    const hasStreetMarket = /street\s*mrkt|street\s*market/i.test(`${postTitle} ${content}`);
    const image = htmlAttribute(content, /<img[^>]+src=["']([^"']+)/i);
    const title = hasStreetMarket ? 'South FIRST FRIDAYS ArtWalk SJ + Street Mrkt' : 'South FIRST FRIDAYS ArtWalk SJ';
    const description = sourceDescriptionText(content);
    return [directEvent({
      id: 'south-first-fridays-' + createHash('sha256').update(`${post.link}|${dateValue}`).digest('hex').slice(0, 16),
      // The ArtWalk is intentionally spread across the SoFA district. Publish
      // its official street corridor for navigation, never a made-up host
      // venue or a single participant's address.
      title, dateValue, description, image, place: 'SoFA District', address: 'South 1st St, San Jose', city: 'San Jose',
      source: source.name, url: post.link, forcedType: 'arts'
    })];
  });
}

async function readCinelux(source) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const dates = Array.from({ length: 7 }, (_, index) => { const day = new Date(`${today}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + index); return day.toISOString().slice(0, 10); });
  const pages = await Promise.all(dates.map(async date => {
    const url = date === today ? source.feedUrl : `${source.feedUrl}?date=${date}`;
    const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
    return response.ok ? { date, html: await response.text() } : { date, html: '' };
  }));
  const candidates = pages.flatMap(({ date, html }) => html.split(/<div class=["']cin-movie-card\b[^>]*>/i).slice(1).flatMap(block => {
    const title = plainText(block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || '');
    const movieUrl = htmlAttribute(block, /<h3[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)/i);
    const image = htmlAttribute(block, /cin-showtimes-poster-desktop[\s\S]*?<img[^>]+src=["']([^"']+)/i);
    const rating = normalizedMovieRating(block.match(/rounded-sm[^>]*>\s*(G|PG|PG-13|PG13|R|NR)\s*<\/div>/i)?.[1] || '');
    const showings = [...block.matchAll(/cin-showtimes-button[\s\S]*?href=["']([^"']+)[^>]*>[\s\S]*?([0-9]{1,2}:[0-9]{2}\s*[ap])\s*<\/a>/gi)];
    if (!title || !movieUrl || !isPotentialFamilyMovieRating(rating) || !showings.length) return [];
    const displayTitle = title.replace(/^DBOX\s+/i, '').trim();
    return showings.map(match => ({ title: displayTitle, movieUrl: new URL(movieUrl, source.feedUrl).href, image: image ? new URL(image, source.feedUrl).href : '', rating, dateValue: cinemaDateValue(date, plainText(match[2])), ticketUrl: new URL(decodeXml(match[1]), source.feedUrl).href }));
  }));
  const metadata = new Map(await Promise.all([...new Set(candidates.map(item => item.movieUrl))].map(async url => {
    try { const response = await fetch(url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) }); return [url, response.ok ? cineluxMovieMetadata(await response.text(), '') : { summary: '', genre: '' }]; } catch { return [url, { summary: '', genre: '' }]; }
  })));
  return candidates.filter(item => {
    const details = metadata.get(item.movieUrl) || {};
    return item.dateValue && isUpcoming(item.dateValue) && isKidAppropriateMovie(item.title, item.rating, `${details.genre || ''} ${details.summary || ''}`);
  }).map(item => {
    const details = metadata.get(item.movieUrl) || {};
    const structuredScreening = buildOfficialMovieScreeningSummary({ rating: item.rating, theater: source.name });
    const event = directEvent({
      id: 'cinelux-' + createHash('sha256').update(`${source.feedUrl}|${item.title}|${item.dateValue}|${item.ticketUrl}`).digest('hex').slice(0, 16),
      title: item.title, dateValue: item.dateValue, description: details.summary || structuredScreening.summary,
      summaryStatus: details.summary ? 'extractive' : 'official_structured',
      summaryEvidenceData: details.summary ? null : structuredScreening.evidenceData, image: item.image,
      place: source.name, address: source.address || '', city: source.city || '', source: 'CineLux Theatres', url: item.ticketUrl,
      ageText: item.rating === 'G' ? 'all ages' : '', format: 'movie-screening', movieRating: item.rating
    });
    return { ...event, costStatus: 'paid', costLabel: '需付费／价格见详情', costSource: 'Official cinema ticketing', costEvidence: 'A ticketed cinema screening' };
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
    const structured = buildOfficialSportsSummary({ homeTeam: 'Bay FC', opponent, venue: 'PayPal Park', gameWord: 'match' });
    return [directEvent({
      id: 'bayfc-' + createHash('sha256').update(`${matchUrl}|${dateValue}`).digest('hex').slice(0, 16), title: `Bay FC vs ${opponent}`, dateValue,
      description: structured.summary, summaryStatus: 'official_structured', summaryEvidenceData: structured.evidenceData, image: BAY_FC_TEAM_MARK,
      imagePresentation: 'team-mark', imageBackground: '#e5eef1',
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
    const venue = game.venue?.name || 'Excite Ballpark';
    const structured = buildOfficialSportsSummary({ homeTeam: 'San Jose Giants', opponent, venue, gameWord: 'game' });
    return [directEvent({
      id: `mlb-${game.gamePk}`, title: `San Jose Giants vs ${opponent}`, dateValue: pacificDateTime(game.gameDate),
      description: structured.summary, summaryStatus: 'official_structured', summaryEvidenceData: structured.evidenceData, image: SAN_JOSE_GIANTS_TEAM_MARK,
      imagePresentation: 'team-mark', imageBackground: '#f4f1ed',
      place: venue, address: source.address || '', city: source.city || '', source: source.name,
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
    const structured = buildOfficialSportsSummary({ homeTeam: 'San Jose Earthquakes', opponent, venue: venueName, gameWord: 'match' });
    return [directEvent({
      id: `mls-${match.match_id}`, title: `San Jose Earthquakes vs ${opponent}`, dateValue: pacificDateTime(match.planned_kickoff_time),
      description: structured.summary, summaryStatus: 'official_structured', summaryEvidenceData: structured.evidenceData, image: EARTHQUAKES_TEAM_MARK,
      imagePresentation: 'team-mark', imageBackground: '#0d2c4b', place: venueName, address, city,
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
    if (!title || !dateValue || !isUpcoming(dateValue) || !hasUsableSourceContent(description)) return [];
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
      const sourceDescription = officialParagraphText(html, {
        excludePattern: /\b(?:audition|rehears|casting|participation fee|volunteer hours?|student groups?)\b/i
      });
      const slots = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)];
      if (!title || !hasPublishableSummary(sourceDescription, { title, format: 'live-show' }) || !slots.length) return [];
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
          description: sourceDescription, image, place: 'Montgomery Theater', address: source.address || '', city: source.city || '',
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
      const sourceDescription = officialParagraphText(detail, {
        excludePattern: /\b(?:audition|rehears|conflict|casting|participation fee|volunteer hours?|student groups?)\b/i
      });
      const year = text.match(/\b(20\d{2})\b/)?.[1] || '';
      const image = decodeXml(detail.match(/<div\s+id=["']sub-banner["'][\s\S]*?<img[^>]+src=["']([^"']+)/i)?.[1] || '');
      const ticketRows = [...detail.matchAll(/<div\s+class=["']ticket-row["'][\s\S]*?<div\s+class=["']ticket-col ticketname["'][\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>[\s\S]*?<div\s+class=["']ticket-col ticketdate["'][\s\S]*?>([\s\S]*?)<\/div>\s*<\/div>/gi)];
      if (!title || !hasPublishableSummary(sourceDescription, { title, format: 'live-show' })) return [];
      return ticketRows.flatMap(row => {
        const ticketType = plainText(row[1]);
        // The product is for families planning outings, not closed school
        // field trips; retain only the public performance inventory.
        if (!/general admission/i.test(ticketType)) return [];
        const dateText = plainText(row[2]);
        const dateValue = isoDateFromOfficialText(dateText.replace(/\b(am|pm)\b/i, `$1, ${year}`), dateText);
        if (!isUpcoming(dateValue)) return [];
        const event = directEvent({
          id: 'pyt-' + createHash('sha256').update(`${url}|${dateValue}`).digest('hex').slice(0, 16), title, dateValue, description: sourceDescription,
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
    const structured = buildOfficialSportsSummary({
      homeTeam: 'San Jose Barracuda', opponent, venue: 'Tech CU Arena', gameWord: 'game', promotions
    });
    const image = game.logo?.source?.url || game.logo?.url || '';
    const event = directEvent({
      id: 'barracuda-' + (game.id || createHash('sha256').update(`${opponent}|${dateValue}`).digest('hex').slice(0, 16)),
      title: `San Jose Barracuda vs ${opponent}`, dateValue, description: structured.summary,
      summaryStatus: 'official_structured', summaryEvidenceData: structured.evidenceData, image,
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
    // non-greedy </li> match stops too early. Splitting at the next card
    // boundary retains each complete listing including its teaser.
    return html.split(/<li class=["']listing-item["'][^>]*>/i).slice(1);
  }));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const seen = new Set();
  const candidates = pages.flat().flatMap(block => {
    const title = htmlAttribute(block, /<h4[^>]*>\s*<a[^>]+>([\s\S]*?)<\/a>/i);
    const href = htmlAttribute(block, /<h4[^>]*>\s*<a[^>]+href=["']([^"']+)/i);
    const listingDescription = htmlAttribute(block, /<h4[\s\S]*?<p>([\s\S]*?)<\/p>/i);
    const tags = [...block.matchAll(/<ul class=["']taglist["'][\s\S]*?<\/ul>/gi)].map(match => plainText(match[0])).join(' ');
    const dateBlock = block.match(/fa-calendar-alt[\s\S]*?<\/li>/i)?.[0] || '';
    const dateText = plainText(dateBlock);
    const image = htmlAttribute(block, /<img[^>]+data-src=["']([^"']+)/i);
    const familySignal = /famil(?:y|ies)|children|kids?/i.test(`${tags} ${title} ${listingDescription}`);
    const range = dateText.match(/\b([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
    const dateValue = range
      ? `${range[5]}-${String(months[range[1].slice(0, 3).toLowerCase()] || 0).padStart(2, '0')}-${String(Number(range[2])).padStart(2, '0')}`
      : isoDateFromOfficialText(dateText);
    const endValue = range
      ? `${range[5]}-${String(months[range[3].slice(0, 3).toLowerCase()] || 0).padStart(2, '0')}-${String(Number(range[4])).padStart(2, '0')}`
      : dateValue;
    const url = href ? new URL(href, source.feedUrl).href : '';
    if (!title || !url || !familySignal || endValue < today || seen.has(url)) return [];
    seen.add(url);
    return [{ title, url, listingDescription, tags, dateValue, endValue, range, image }];
  });

  const events = await Promise.all(candidates.map(async candidate => {
    let description = candidate.listingDescription;
    let image = candidate.image;
    try {
      const detailResponse = await fetch(candidate.url, { headers, signal: AbortSignal.timeout(15000) });
      const detail = await detailResponse.text();
      if (detailResponse.ok) {
        // Listing cards are often intentionally short marketing teasers.
        // Scope extraction to the page's main content first so global
        // membership, donation, newsletter, and footer modules cannot compete
        // with the event itself. The shared engine still owns sentence ranking.
        const mainContent = detail.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || detail;
        const detailDescription = officialParagraphText(mainContent, {
          excludePattern: /\b(?:members? receive|buy tickets?|reserve seats?|parking|hours?:|dates?:|typical visit length|what to wear|terms (?:&|and) conditions|privacy policy|refund policy)\b/i
        });
        if (hasUsableSourceContent(detailDescription)) description = detailDescription;
        const detailImage = decodeXml(detail.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || '');
        if (detailImage) image = detailImage;
      }
    } catch { /* Keep the official listing teaser if the detail page is temporarily unavailable. */ }

    const exhibition = /\b(?:exhibit(?:ion)?|flower show|installation)\b/i.test(`${candidate.title} ${description}`);
    const format = exhibition ? 'museum-exhibition' : '';
    if (!hasPublishableSummary(description, { title: candidate.title, format })) return null;
    const natureExperience = /\b(?:garden|nest|nature|outdoor|redwood|woodland|trail)\b/i.test(`${candidate.title} ${description}`);
    const event = directEvent({
      id: 'filoli-' + createHash('sha256').update(candidate.url).digest('hex').slice(0, 16),
      title: candidate.title, dateValue: candidate.dateValue, description,
      image: image ? new URL(image, source.feedUrl).href : '', place: 'Filoli Historic House & Garden',
      address: source.address || '', city: source.city || '', source: source.name, url: candidate.url,
      ageText: `${candidate.tags} ${description}`, format
    });
    const classified = exhibition ? { ...event, type: 'museums', icon: icons.museums, color: colors.museums, tag: labels.museums }
      : natureExperience ? { ...event, type: 'outdoor', icon: icons.outdoor, color: colors.outdoor, tag: labels.outdoor }
      : event;
    return candidate.range && candidate.dateValue < today
      ? { ...classified, date: 'On view now', dateValue: '', ongoing: true }
      : classified;
  }));
  return events.filter(Boolean);
}

// Los Altos History Museum uses Events Manager's public list. Exhibits are
// useful museum outings in their own right; one-off programs are published
// only when the organizer explicitly signals a youth or family audience.
async function readLahm(source) {
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  // The museum's CDN occasionally answers the first calendar request with
  // 202 Accepted while warming the page. Retry once before treating a real
  // source outage as a failed refresh.
  let response;
  let html = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
    html = await response.text();
    if (response.status !== 202) break;
    await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
  }
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
      const metaDescription = decodeXml(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
      const description = sourceDescriptionText(detailBody || metaDescription || summary);
      if (!hasPublishableSummary(description, { title, format: exhibition ? 'museum-exhibition' : '' })) return null;
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
      if (!hasUsableSourceContent(description)) return null;
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
    if (!title || !dateValue || !isUpcoming(dateValue) || !familySignal || !hasUsableSourceContent(description)) return [];
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

function officialListingPattern(source, key, fallback) {
  try { return new RegExp(source[key] || fallback, 'i'); } catch { return new RegExp(fallback, 'i'); }
}

function firstOfficialEventSchema(html) {
  return [...String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
    try { return eventNodes(JSON.parse(decodeXml(match[1]))); } catch { return []; }
  }).find(node => String(node?.['@type'] || '').toLowerCase() === 'event') || {};
}

function officialDetailDescription(html, schema, title) {
  const blocks = [
    schema?.description || '',
    ...[...String(html || '').matchAll(/<(?:div|section)[^>]+(?:itemprop=["']description["']|class=["'][^"']*(?:fr-view|detail-content|event-description|eventDescription|content-body|event-body)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|section)>/gi)].map(match => match[1]),
    decodeXml(String(html || '').match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)/i)?.[1] || '')
  ].map(sourceDescriptionText).filter(Boolean);
  // Detail pages occasionally expose a visual placeholder (for example, a
  // standalone ellipsis) in their description field. Never let a non-empty
  // but non-publishable detail value replace the usable official teaser from
  // the calendar listing; the caller retains that listing description.
  return selectPublishableOfficialDescription(blocks, value => hasPublishableSummary(value, { title }));
}

async function readJmzFamily(source) {
  const response = await fetch(source.feedUrl, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; SouthBayFamilyFinds/1.0; +https://southbayfamilyfinds.com/)', 'accept': 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15000)
  });
  const html = await response.text();
  if (!response.ok) throw new Error('JMZ family page was not valid: ' + response.status);
  const text = plainText(html);
  const dateMatch = text.match(/(20\d{2}) dates:\s*([^.]*(?:January|February|March|April|May|June|July|August|September|October|November|December)[^.]*)/i);
  const timeMatch = text.match(/Event time for all:\s*(\d{1,2}(?::\d{2})?)\s*-\s*\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)/i);
  const description = sourceDescriptionText(
    text.match(/(A free event when the JMZ is open exclusively to families with children[^.]*\. Children with all disabilities are welcome[^.]*\. Come and meet zoo animals up-close\.)/i)?.[1] || ''
  );
  if (!dateMatch || !timeMatch || !hasPublishableSummary(description, { title: 'Super Family Sunday' })) return [];
  const year = dateMatch[1];
  const dates = [...dateMatch[2].matchAll(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/gi)];
  return dates.flatMap(match => {
    const dateValue = isoDateFromOfficialText(`${match[1]} ${match[2]}, ${year}`, `${timeMatch[1]} ${timeMatch[2]}`);
    if (!isUpcoming(dateValue)) return [];
    const event = directEvent({
      id: 'jmz-family-' + createHash('sha256').update(`${dateValue}|Super Family Sunday`).digest('hex').slice(0, 16),
      title: 'Super Family Sunday', dateValue, description,
      image: htmlAttribute(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i),
      place: 'Palo Alto Junior Museum & Zoo',
      address: source.address || '1451 Middlefield Rd, Palo Alto',
      city: source.city || 'Palo Alto',
      source: source.name, url: source.feedUrl,
      ageText: 'Families Children Parents Siblings Grandparents',
      costStatus: 'free',
      costLabel: '免费',
      costSource: 'Official event page',
      costEvidence: 'A free event',
      format: 'museum-program'
    });
    return [event];
  });
}

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
      const officialText = sourceDescriptionText(editorialBlocks.join(' ') || detailHtml);
      const description = officialText;
      const audienceText = `${item.title} ${officialText} ${plainText(landingHtml.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1] || '')}`;
      if (!hasPublishableSummary(description, { title: item.title }) || isExplicitlyAdultOnly(audienceText)) return null;
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

function cupertinoAddressCandidate(text) {
  const value = String(text || '');
  const pattern = /\b(\d{1,6}\s+(?:(?:N|S|E|W|North|South|East|West)\s+)?(?:[A-Za-z0-9.'’#-]+\s+){0,5}(?:Avenue|Ave\.?|Street|St\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Court|Ct\.?|Way|Parkway|Pkwy\.?|Circle|Cir\.?))(?=\s*(?:,?\s*Cupertino\b|,?\s*CA\b|\d{5}\b|$))/gi;
  for (const match of value.matchAll(pattern)) {
    const context = value.slice(Math.max(0, match.index - 90), Math.min(value.length, match.index + match[0].length + 90));
    if (/Back to top|Site Footer|Contact Us/i.test(context)) continue;
    return { street: match[1].replace(/[.,;:]$/, ''), index: match.index };
  }
  return null;
}

function cupertinoDetailEnrichment(event, html, source) {
  if (!html) return event;
  const schema = firstOfficialEventSchema(html);
  const detailText = plainText(html);
  const detailTitle = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || event.title);
  const canonicalHref = htmlAttribute(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)
    || htmlAttribute(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)
    || String(schema?.url || '');
  const canonicalUrl = (() => {
    if (!canonicalHref) return event.url;
    try {
      const value = new URL(decodeXml(canonicalHref), event.url || source.feedUrl).href;
      return isOfficialUrl(value, source.domain) ? value : event.url;
    } catch {
      return event.url;
    }
  })();

  const normalizeClock = value => String(value || '').replace(/a\.?m\.?/i, 'AM').replace(/p\.?m\.?/i, 'PM');

  const nextDate = detailText.match(/Next date:\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\s*\|\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))(?:\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)))?/i);
  const plainDate = detailText.match(/\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\b/i);
  const dateAnchor = nextDate?.[1] || plainDate?.[1] || '';
  const nearbyText = dateAnchor ? detailText.slice(Math.max(0, detailText.indexOf(dateAnchor)), detailText.indexOf(dateAnchor) + 260) : '';
  const timeRange = nextDate
    ? [nextDate[2], nextDate[3] || '']
    : (() => {
        const match = nearbyText.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))/i);
        return match ? [match[1], match[2]] : [];
      })();
  const visibleStart = dateAnchor && timeRange[0]
    ? isoDateFromOfficialText(dateAnchor, normalizeClock(timeRange[0]))
    : '';
  const visibleEnd = dateAnchor && timeRange[1]
    ? isoDateFromOfficialText(dateAnchor, normalizeClock(timeRange[1]))
    : '';
  const selectedDates = selectCupertinoDetailDates({
    listingStart: event.dateValue,
    listingEnd: event.endDateValue,
    schemaStart: schema?.startDate || '',
    schemaEnd: schema?.endDate || '',
    visibleStart,
    visibleEnd
  });
  const dateValue = selectedDates.startDateValue;
  const endDateValue = selectedDates.endDateValue;
  if (selectedDates.ignoredSchemaStart) {
    console.warn(`Ignoring mismatched Cupertino schema startDate for "${event.title}": ${schema.startDate} (listing ${String(event.dateValue || '').slice(0, 10) || 'unknown'})`);
  }
  if (selectedDates.ignoredSchemaEnd) {
    console.warn(`Ignoring mismatched Cupertino schema endDate for "${event.title}": ${schema.endDate} (listing ${String(event.dateValue || '').slice(0, 10) || 'unknown'})`);
  }

  const schemaLocation = Array.isArray(schema?.location) ? schema.location[0] : schema?.location;
  const schemaAddress = schemaLocation && typeof schemaLocation === 'object' ? schemaLocation.address : null;
  let city = event.city || source.city || 'Cupertino';
  let place = event.place || '';
  let address = event.address || '';

  if (schemaLocation && typeof schemaLocation === 'object') {
    place = plainText(schemaLocation.name || '') || place;
    if (schemaAddress && typeof schemaAddress === 'object') {
      city = canonicalCity(schemaAddress.addressLocality || city);
      address = shortAddress(schemaAddress.streetAddress || '', city) || address;
    } else if (typeof schemaAddress === 'string') {
      const parsed = venueAndAddress([place, schemaAddress].filter(Boolean).join(', '), city);
      place = parsed.place || place;
      address = parsed.address || address;
      city = parsed.city || city;
    }
  }

  const addressMatch = cupertinoAddressCandidate(detailText);
  if (!address && addressMatch) {
    city = canonicalCity(city || 'Cupertino');
    address = shortAddress(addressMatch.street, city);
  }
  if ((!place || place === source.name) && addressMatch) {
    const addressIndex = addressMatch.index;
    let prefix = detailText.slice(Math.max(0, addressIndex - 220), addressIndex);
    prefix = prefix
      .replace(detailTitle, ' ')
      .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/gi, ' ')
      .replace(/\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)\s*(?:to|-|–|—)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)/gi, ' ')
      .replace(/\b(?:Next date|When|Where|Location)\b\s*:?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const candidate = prefix.match(/([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){1,5})$/)?.[1] || '';
    if (candidate && !/^(?:South Bay|City of Cupertino)$/i.test(candidate)) place = candidate;
  }

  const description = officialDetailDescription(html, schema, detailTitle) || event.description;
  const image = event.image || htmlAttribute(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i);
  const pricing = costInfo('', detailText);
  const costFields = pricing.costStatus !== 'unknown' ? {
    costStatus: pricing.costStatus,
    costLabel: pricing.costLabel,
    costSource: pricing.costSource,
    costEvidence: pricing.costEvidence
  } : {};
  const registrationFields = pricing.registrationStatus !== 'unknown' ? {
    registrationStatus: pricing.registrationStatus,
    registrationSource: pricing.registrationSource,
    registrationEvidence: pricing.registrationEvidence
  } : {};

  return {
    ...event,
    title: detailTitle || event.title,
    dateValue: dateValue || event.dateValue,
    endDateValue: endDateValue || event.endDateValue,
    description,
    image,
    place: place || event.place,
    address: address || event.address,
    city: canonicalCity(city),
    url: canonicalUrl || event.url,
    canonicalUrl: canonicalUrl || event.canonicalUrl || event.url,
    ...costFields,
    ...registrationFields
  };
}

// Some organizers publish a terse calendar entry and a richer evergreen
// event page on the same official domain. Sources opt in with their sitemap;
// a page is used only after title, date, and content all agree with the
// calendar listing. This keeps discovery general while preserving the
// calendar page whenever a specialty-page match is uncertain.
async function enrichWithSpecialEventPage(event, source) {
  const config = source.specialEventPageDiscovery;
  if (!config?.sitemapUrl || !event.url || !event.dateValue) return event;
  try {
    let sitemap = '';
    try {
      const sitemapResponse = await fetch(config.sitemapUrl, {
        headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000)
      });
      if (sitemapResponse.ok) sitemap = await sitemapResponse.text();
    } catch { /* Configured aliases remain independently verifiable. */ }
    const candidates = [
      ...configuredCandidates(event, config.preferredPages),
      ...sitemapCandidates(sitemap, event, {
        domain: source.domain,
        maxCandidates: config.maxCandidates || 4
      })
    ].filter(candidate => isOfficialUrl(candidate.url, source.domain))
      .filter((candidate, index, list) => list.findIndex(other => other.url === candidate.url) === index);
    for (const candidate of candidates) {
      const response = await fetch(candidate.url, {
        headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) continue;
      const html = await response.text();
      const verified = verifySpecialEventPage(event, candidate, html);
      if (!verified) continue;
      const pageEnriched = cupertinoDetailEnrichment(event, html, source);
      const officialImages = [...html.matchAll(/<img\b[^>]+src=["']([^"']+)["'][^>]*>/gi)]
        .map(match => decodeXml(match[1]))
        .filter(value => /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(value))
        // A title strip and a parking diagram are official assets, but neither
        // is a useful activity-card image. Prefer the organizer's real event
        // photography; never synthesize a fallback for this case.
        .filter(value => !/(?:short[-_]?header|parking[-_]?map)/i.test(value))
        .map(value => {
          const url = new URL(value, verified.url);
          if (url.hostname.endsWith('cupertino.gov')) url.search = '';
          return url.href;
        });
      const officialImage = officialImages[0] || '';
      return {
        ...pageEnriched,
        // Keep the calendar title, but make the verified specialty page the
        // parent-facing destination and evidence for the generated summary.
        title: event.title,
        url: verified.url,
        canonicalUrl: verified.url,
        description: verified.description,
        sourceDescriptionRaw: verified.description,
        image: officialImage || pageEnriched.image || event.image || '',
        ...(officialImage ? {
          imageStatus: 'official',
          imageProvenance: {
            source: 'special-event-page',
            method: 'special-page-bound',
            sourceUrl: verified.url,
            verifiedAt: generatedAt,
            score: 85,
            evidence: verified.evidence || 'verified-special-event-page-image'
          }
        } : {}),
        specialEventPageUrl: verified.url,
        specialEventPageEvidence: verified.evidence
      };
    }
  } catch { /* A sitemap/page outage must not erase the calendar activity. */ }
  return event;
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
  const items = [...html.matchAll(/<div class=["']list-item-container[\s\S]*?<\/article>/gi)].flatMap(blockMatch => {
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
    const youthSignal = officialListingPattern(source, 'familyPattern', 'kids?\s*&\s*family|children|famil(?:y|ies)|youth|teen|toddler|school').test(activityText);
    const url = href ? new URL(decodeXml(href), source.feedUrl).href : '';
    const id = url && dateValue ? `${url}|${dateValue}` : '';
    if (!id || seen.has(id) || !isUpcoming(dateValue) || !youthSignal) return [];
    seen.add(id);
    return [{ title, dateValue, description, placeText, audience, image, url }];
  });

  const events = await Promise.all(items.map(async (item, index) => {
    let detailHtml = '';
    try {
      const detailResponse = await fetch(item.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      if (detailResponse.ok) detailHtml = await detailResponse.text();
    } catch {}
    const detailText = plainText(detailHtml);
    const detailTitle = plainText(detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || item.title);
    let dateValue = item.dateValue;
    const nextDate = detailText.match(/Next date:\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\s*\|\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    const plainDate = detailText.match(/\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\b/i);
    const timeAfterDate = plainDate ? detailText.slice(detailText.indexOf(plainDate[0]) + plainDate[0].length, detailText.indexOf(plainDate[0]) + plainDate[0].length + 180)
      .match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s+(?:to|-)/i) : null;
    const normalizeClock = value => String(value || '').replace(/a\.?m\.?/i, 'AM').replace(/p\.?m\.?/i, 'PM');
    if (nextDate) dateValue = isoDateFromOfficialText(nextDate[1], normalizeClock(nextDate[2]));
    else if (plainDate && timeAfterDate) dateValue = isoDateFromOfficialText(plainDate[1], normalizeClock(timeAfterDate[1]));
    const description = detailHtml ? officialDetailDescription(detailHtml, firstOfficialEventSchema(detailHtml), detailTitle) || item.description : item.description;
    const locationParts = item.placeText.split(',').map(value => value.trim()).filter(Boolean);
    const place = locationParts.shift() || source.name;
    const street = locationParts.filter(value => !/^\d{5}(?:-\d{4})?$/.test(value)).join(', ');
    // Do not use the first N characters of the whole detail page as audience
    // evidence. Cupertino's global Parks & Recreation chrome contains labels
    // such as "Preschool" and "Teens", which previously produced fake,
    // disconnected ranges like Ages 3–5 · Ages 13–18 on unrelated events.
    const costEvidence = `${detailTitle} ${description} ${item.audience} ${detailText.slice(0, 3500)}`;
    const initialAudienceEvidence = cupertinoAudienceEvidence(item.audience, description);
    const event = directEvent({
      id: 'cupertino-' + createHash('sha256').update(`${item.url}|${dateValue}|${index}`).digest('hex').slice(0, 16),
      title: detailTitle, dateValue, description,
      image: item.image ? new URL(decodeXml(item.image), source.feedUrl).href : htmlAttribute(detailHtml, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i),
      place, address: shortAddress(street, source.city || 'Cupertino'), city: source.city || 'Cupertino',
      source: source.name, url: item.url, ageText: initialAudienceEvidence
    });
    const withCost = { ...event, ...costInfo('', costEvidence) };
    const calendarEnriched = detailHtml ? cupertinoDetailEnrichment(withCost, detailHtml, source) : withCost;
    const pageEnriched = await enrichWithSpecialEventPage(calendarEnriched, source);
    const finalAudienceEvidence = cupertinoAudienceEvidence(
      item.audience,
      pageEnriched.sourceDescriptionRaw || pageEnriched.description || description
    );
    return { ...pageEnriched, ...ageInfo(finalAudienceEvidence) };
  }));
  return events.filter(Boolean);
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
  const headers = { 'user-agent': 'SouthBayFamilyEventsBot/1.0' };
  const firstResponse = await fetch(source.feedUrl, { headers, signal: AbortSignal.timeout(15000) });
  const firstHtml = await firstResponse.text();
  if (!firstResponse.ok || !/list-container events-list-container/i.test(firstHtml)) {
    throw new Error('Palo Alto official calendar was not valid: ' + firstResponse.status);
  }

  const totalPages = Number(firstHtml.match(/Page\s+1\s+of\s+(\d+)/i)?.[1] || 1);
  const pageSelectName = decodeXml(firstHtml.match(/<select\b[^>]*name=["']([^"']+)["'][^>]*title=["']Please select the page here\./i)?.[1]
    || firstHtml.match(/<select\b[^>]*title=["']Please select the page here\.[^>]*name=["']([^"']+)["']/i)?.[1] || '');
  const goButtonName = decodeXml(firstHtml.match(/<input\b[^>]*name=["']([^"']+)["'][^>]*value=["']Go["'][^>]*class=["'][^"']*btn_scPagingNonJS_enabled/i)?.[1]
    || firstHtml.match(/<input\b[^>]*value=["']Go["'][^>]*name=["']([^"']+)["'][^>]*class=["'][^"']*btn_scPagingNonJS_enabled/i)?.[1] || '');

  const pageHtmls = [firstHtml];
  let currentHtml = firstHtml;
  for (let page = 2; page <= totalPages; page += 1) {
    if (!pageSelectName || !goButtonName) break;
    const form = new URLSearchParams();
    for (const input of currentHtml.match(/<input\b[^>]*>/gi) || []) {
      const type = htmlAttribute(input, /\btype=["']([^"']+)["']/i).toLowerCase();
      const name = decodeXml(htmlAttribute(input, /\bname=["']([^"']+)["']/i));
      if (type !== 'hidden' || !name) continue;
      form.set(name, decodeXml(htmlAttribute(input, /\bvalue=["']([^"']*)["']/i)));
    }
    form.set(pageSelectName, String(page));
    form.set(goButtonName, 'Go');
    try {
      const pageResponse = await fetch(source.feedUrl, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(15000)
      });
      const pageHtml = await pageResponse.text();
      if (!pageResponse.ok || !/list-container events-list-container/i.test(pageHtml)) break;
      pageHtmls.push(pageHtml);
      currentHtml = pageHtml;
    } catch {
      break;
    }
  }
  const html = pageHtmls.join('\n');
  const monthNumbers = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const youthSignal = new RegExp(source.familyPattern
    || 'children|kids?|famil(?:y|ies)|youth|teen|toddler|preschool|elementary|middle school|high school|all ages|parent(?:s)?\\s*(?:and|&)\\s*(?:child|kid)', 'i');
  const excluded = /\b(?:committee|commission|council|board|meeting|recruitment|hearing|work session)\b/i;
  const seen = new Set();
  const candidates = [...html.matchAll(/<div class=["']list-item-container[\s\S]*?<\/article>/gi)].flatMap(blockMatch => {
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
    const listingFamilySignal = youthSignal.test(audienceText);
    // Some Palo Alto Community Services listings have terse calendar cards
    // with only a generic "Community Events" tag. Their detail pages carry
    // the actual family evidence. Allow those candidates through for a second
    // pass instead of permanently filtering them before detail verification.
    const detailFamilyCandidate = /\/Events-Directory\/Community-Services\//i.test(url)
      && /\bCommunity Events\b/i.test(tags);
    if (!title || !url || !dateValue || seen.has(key) || !isUpcoming(dateValue)
      || !isOfficialUrl(url, source.domain)
      || (!listingFamilySignal && !detailFamilyCandidate) || excluded.test(title)) return [];
    seen.add(key);
    const parts = venue.split(',').map(value => value.trim()).filter(Boolean);
    const place = parts.shift() || source.name;
    const cityIndex = parts.findIndex(value => /^palo alto(?:\s+ca)?$/i.test(value));
    const street = cityIndex >= 0 ? parts.slice(0, cityIndex).join(', ') : '';
    return [{ title, url, dateValue, description, image, place, street, audienceText, listingFamilySignal, key }];
  });
  const events = await Promise.all(candidates.map(async candidate => {
    let detailHtml = '';
    try {
      const detailResponse = await fetch(candidate.url, { headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' }, signal: AbortSignal.timeout(15000) });
      if (detailResponse.ok) detailHtml = await detailResponse.text();
    } catch {}
    const detailText = plainText(detailHtml);
    const detailDescription = officialParagraphText(detailHtml, { minLength: 20 });
    const titleIndex = detailText.toLowerCase().indexOf(candidate.title.toLowerCase());
    let familyDetailText = detailText.slice(Math.max(0, titleIndex), Math.max(0, titleIndex) + 7000);
    const accommodationIndex = familyDetailText.search(/If you or a family member requires accommodations/i);
    if (accommodationIndex >= 0) familyDetailText = familyDetailText.slice(0, accommodationIndex);
    const detailFamilySignal = youthSignal.test(`${candidate.audienceText} ${detailDescription || ''} ${familyDetailText}`);
    // Listing-confirmed family events keep the existing resilience behavior if
    // the detail request is temporarily unavailable. Candidates admitted only
    // for second-pass validation must prove family relevance in activity copy,
    // not in Palo Alto's sitewide "family member requires accommodations" text.
    if (!candidate.listingFamilySignal && (!detailHtml || !detailFamilySignal)) return null;
    const dateMatch = detailText.match(/Next date:\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\s*\|\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    const dateValue = dateMatch ? isoDateFromOfficialText(dateMatch[1], dateMatch[2]) : candidate.dateValue;
    const description = detailDescription || candidate.description;
    const event = directEvent({
      id: 'paloalto-' + createHash('sha256').update(`${candidate.url}|${dateValue}`).digest('hex').slice(0, 16),
      title: candidate.title, dateValue, description,
      image: officialPageOgImage(detailHtml) || (candidate.image ? new URL(candidate.image, source.feedUrl).href : ''),
      place: candidate.place, address: shortAddress(candidate.street, 'Palo Alto'), city: 'Palo Alto',
      source: source.name, url: candidate.url, ageText: `${candidate.audienceText} ${detailText.slice(0, 3500)}`
    });
    return hasUsableSourceContent(event.description) ? { ...event, ...costInfo('', detailDescription || detailText || description) } : null;
  }));
  return events.filter(Boolean);
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
    return hasUsableSourceContent(event.description) ? [{ ...event, ...costInfo('', description) }] : [];
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
      const metaDescription = decodeXml(detail.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
      // Preserve the richest reliable first-party activity copy. Event pages
      // often expose a vague SEO meta description while the visible body gives
      // parents the actual things they can do. The shared summary engine still
      // owns ranking and publication; this adapter only broadens source evidence.
      const description = officialParagraphText(detail, {
        excludePattern: /\b(?:premium membership|single-day admission|buy tickets?|parking|terms (?:&|and) conditions|privacy policy|refund policy)\b/i
      }) || metaDescription;
      const image = decodeXml(detail.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || '');
      if (!hasUsableSourceContent(description)) return;
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
  const cards = [...html.matchAll(/<li\b[^>]*\bshow-concert\b[\s\S]*?<\/li>/gi)].map(match => match[0]).map(card => {
    const imageTag = card.match(/<img\b[^>]*>/i)?.[0] || '';
    const responsive = imageTag.match(/\bsrcset=["']([^"']+)["']/i)?.[1]
      ?.split(',').at(-1)?.trim().split(/\s+/)[0] || '';
    const image = htmlAttribute(imageTag, /\b(?:data-lazy-src|data-src)=["']([^"']+)["']/i)
      || responsive
      || htmlAttribute(imageTag, /\bsrc=["']([^"']+)["']/i);
    return {
      title: plainText(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ''),
      url: htmlAttribute(card, /href=["']([^"']+)["']/i),
      image
    };
  }).filter(card => card.title && card.url)
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
      if (!dateValue) return null;
      const verifiedImage = source.verifiedImages?.[page.title] || '';
      const event = directEvent({
        id: `symphony-${pageIndex}-${sessionIndex}`, title: page.title, dateValue,
        description: page.description,
        image: verifiedImage || (/(?:season|logo)/i.test(page.image) ? '' : page.image), place: 'California Theatre',
        address: source.address, city: source.city, source: source.name, url: page.url,
        // The organizer identifies these as toddler/preschool programs but
        // does not give a precise numeric suitability range. Do not turn
        // descriptive audience words into a misleading card age label.
        ageText: '', format: 'live-show'
      });
      return verifiedImage ? {
        ...event,
        imageStatus: 'official',
        imageProvenance: {
          source: 'source-verified',
          method: 'manual_verified',
          sourceUrl: source.feedUrl,
          verifiedAt: generatedAt,
          score: 100,
          evidence: 'official-season-card-title-image-binding'
        }
      } : event;
    }).filter(Boolean);
  });
}

function eventDetailSlug(title) {
  return plainText(title).toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function resolveConfiguredFirstPartyDetail(source, title, dateValue) {
  if (!source.canonicalEventBase || !title) return '';
  const slug = eventDetailSlug(title);
  const year = String(dateValue || '').match(/^(20\d{2})/)?.[1] || '';
  const base = String(source.canonicalEventBase).replace(/\/+$/, '') + '/';
  const candidates = [...new Set([
    new URL(slug + '/', base).href,
    year ? new URL(slug + '-' + year + '/', base).href : ''
  ].filter(Boolean))];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      });
      const html = await response.text();
      if (!response.ok) continue;
      const pageText = plainText(html);
      if (!isSameEvent(title, pageText)) continue;
      if (year && !pageText.includes(year)) continue;
      const resolved = response.url || candidate;
      if (isOfficialUrl(resolved, source.domain)) return resolved;
    } catch {
      // Try the next deterministic first-party candidate.
    }
  }
  return '';
}

// San Jose Theaters exposes discovery data through Timely, but the public CTA
// belongs on SanJoseTheaters.org. The resolver above deterministically checks
// the first-party event slug (plus a year variant) and verifies title/year.
// Timely remains discovery infrastructure, never the long-lived user canonical.
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
    if (!response.ok || !payload?.data) return null;
    const detail = payload.data;
    const firstPartyUrl = await resolveConfiguredFirstPartyDetail(
      source,
      detail.title,
      String(detail.start_datetime || '').replace(' ', 'T')
    );
    return { ...detail, firstPartyUrl };
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
        source: source.name, url: detail.firstPartyUrl || source.landingUrl || source.feedUrl,
        ageText: description, format: 'live-show'
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
const sourceHealthTarget = new URL('../data/source-health.json', import.meta.url);
const existingEvents = JSON.parse(await readFile(target, 'utf8')); // Preserve translations already verified for unchanged cards.
const existingMuseums = JSON.parse(await readFile(museumTarget, 'utf8'));
const existingSourceHealth = await readFile(sourceHealthTarget, 'utf8').then(JSON.parse).catch(() => ({ sources: [] }));
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
const retainedSourceEvents = await Promise.all(existingEvents
  .filter(event => failedDirectSourceNames.has(event.source) && isStillActive(event))
  .map(async event => {
    const retained = { ...event, refreshStatus: 'stale-source', refreshErrorAt: generatedAt };
    const source = directSources.find(candidate => candidate.name === event.source);
    // A calendar timeout must not prevent a separately available, verified
    // official specialty page from refreshing a retained card's details.
    return source?.specialEventPageDiscovery ? enrichWithSpecialEventPage(retained, source) : retained;
  }));
const freshFeedEvents = await Promise.all(feedAttempts.flatMap((result, index) =>
  result.status === 'fulfilled'
    ? result.value.map(event => {
      const source = directSources[index];
      // Apply the same verified specialty-page resolution to fresh calendar
      // entries. Otherwise the next successful calendar refresh would undo a
      // richer card that was previously retained after a source outage.
      return source?.specialEventPageDiscovery
        ? enrichWithSpecialEventPage(event, source)
        : event;
    })
    : []
));

const sourceRefreshCounts = Object.fromEntries(feedAttempts.map((result, index) => [
  `${result.sourceName} [${directSources[index].method || 'rss'}]`,
  result.status === 'fulfilled' ? result.value.length : -1
]));
console.log(`Source refresh counts: ${JSON.stringify(sourceRefreshCounts)}`);
const sourceHealthKey = source => `${source.name}|${source.domain || ''}|${source.feedUrl || ''}`;
const previousHealthByKey = new Map((existingSourceHealth.sources || []).map(source => [source.key || source.name, source]));
const directHealthByKey = new Map(feedAttempts.map((result, index) => [sourceHealthKey(directSources[index]), result]));
const fallbackHealthByKey = new Map(searchAttempts.map((result, index) => [sourceHealthKey(searchSources[index]), result]));
const sourceHealth = {
  generatedAt,
  configuredSources: sources.length,
  directSources: directSources.length,
  fallbackSourcesRun: searchSources.length,
  sources: sources.map(source => {
    const key = sourceHealthKey(source);
    const previous = previousHealthByKey.get(key) || {};
    const result = directHealthByKey.get(key) || fallbackHealthByKey.get(key);
    if (!result) return {
      key, name: source.name, method: source.method || 'search-fallback', mode: 'not-run',
      failureStreak: previous.failureStreak || 0
    };
    const failed = result.status === 'rejected';
    return {
      key,
      name: source.name,
      method: source.method || 'search-fallback',
      mode: directHealthByKey.has(key) ? 'direct' : 'search-fallback',
      status: failed ? 'failed' : 'ok',
      eventCount: failed ? 0 : result.value.length,
      failureStreak: failed ? (previous.failureStreak || 0) + 1 : 0,
      error: failed ? String(result.reason?.message || 'unknown refresh error').slice(0, 240) : ''
    };
  })
};
sourceHealth.alerts = sourceHealth.sources
  .filter(source => source.status === 'failed' && source.failureStreak >= 3)
  .map(source => ({ name: source.name, failureStreak: source.failureStreak, error: source.error }));
if (sourceHealth.alerts.length) {
  console.warn(`::warning::Source health alert: ${JSON.stringify(sourceHealth.alerts)}`);
}
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
    const refreshedEvent = source.method === 'cupertino'
      ? cupertinoDetailEnrichment(event, html, source)
      : event;
    return {
      ...refreshedEvent,
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
      // Keep the parent-facing movie label while preserving each concrete
      // session's real source identity and official ticket URL.
      source: first.format === 'movie-screening' ? 'Official cinema listings' : first.source,
      sessions: cardSessions.map(event => ({
        id: event.id, date: event.date, dateValue: event.dateValue, endDateValue: event.endDateValue,
        url: event.url, source: event.source, place: event.place, address: event.address, city: event.city
      }))
    }];
  }).sort((a, b) => String(a.dateValue || '9999').localeCompare(String(b.dateValue || '9999')));
}

// Grouping can select an older retained occurrence as the card representative.
// Apply presentation derivation once more after that selection so stale cards
// cannot reintroduce a legacy type/icon/tag into the final published payload.
const scheduledEvents = groupRepeatedSessions(individualEvents).map(withPresentationFields);

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

let events = groupRepeatedSessions([...scheduledEvents, ...museums.map(museum => museumAsEvent(museum, museumSource)).map(qualityGateSummary).filter(Boolean)])
  .map(event => ({ ...event, image: optimizedOfficialImageUrl(event.image, event.source) }));

// Once a stable official canonical destination exists, reopen that exact page
// and let event-level evidence strengthen the card before Link Health.
const beforeCanonicalById = new Map(events.map(event => [event.id, event]));
const canonicalDetail = await enrichCanonicalEvents(events, {
  sources,
  previousEvents: existingEvents,
  verifiedAt: generatedAt,
  concurrency: 6,
  timeoutMs: 12000
});
events = canonicalDetail.events
  .filter(event => !isUnavailableEvent(event))
  .map(event => {
    const prior = beforeCanonicalById.get(event.id);
    const canonicalDescriptionEvidence = event.fieldProvenance?.description?.source === 'canonical-detail'
      || event.fieldProvenance?.sourceDescriptionRaw?.source === 'canonical-detail';
    const descriptionEvidenceChanged = canonicalDescriptionEvidence
      && (event.description !== prior?.description || event.sourceDescriptionRaw !== prior?.sourceDescriptionRaw);
    if (!descriptionEvidenceChanged) return event;
    const normalized = qualityGateSummary(event);
    if (normalized) {
      const summary = String(normalized.parentSummary || normalized.description || '').replace(/\s+/g, ' ').trim();
      const raw = String(normalized.sourceDescriptionRaw || '').replace(/\s+/g, ' ').trim();
      const evidence = String(normalized.summaryEvidence || '').replace(/\s+/g, ' ').trim();
      const summaryContractOk = normalized.summaryStatus === 'extractive'
        ? Boolean(summary && raw.includes(summary) && evidence === summary && !summary.endsWith('…'))
        : Boolean(evidence && evidence === raw);
      if (summaryContractOk) return normalized;
    }
    // Canonical prose is only promoted when it can satisfy the existing
    // summary evidence contract. Otherwise keep the previously verified card
    // summary while still accepting independent canonical fields such as image,
    // venue, time, cost, registration and age.
    const restored = { ...event };
    for (const field of [
      'description','parentSummary','sourceDescriptionRaw','sourceDescriptionHash',
      'summaryMethod','summaryStatus','summaryQuality','summaryEvidence',
      'summaryEvidenceData','summaryVersion','summaryVerifiedAt'
    ]) {
      if (prior?.[field] !== undefined) restored[field] = prior[field];
      else delete restored[field];
    }
    restored.fieldProvenance = { ...(event.fieldProvenance || {}) };
    delete restored.fieldProvenance.description;
    delete restored.fieldProvenance.sourceDescriptionRaw;
    return restored;
  })
  .map(event => ({ ...event, image: optimizedOfficialImageUrl(event.image, event.source) }));

function withImageQualityState(event) {
  if (event.image) {
    if (event.imageStatus === 'missing') {
      const next = { ...event, imageStatus: event.imageProvenance ? 'official' : 'unclassified' };
      delete next.imageFailureReason;
      return next;
    }
    return event;
  }
  if (event.imageStatus === 'missing' && event.imageFailureReason) return event;
  const detailStatus = event.canonicalDetail?.status || '';
  const reason = detailStatus === 'fetch-blocked' ? 'official_page_fetch_blocked'
    : detailStatus === 'fetch-failed' ? 'official_page_fetch_failed'
    : detailStatus === 'identity-mismatch' ? 'official_page_identity_mismatch'
    : 'no_verified_official_image_candidate';
  return { ...event, imageStatus: 'missing', imageFailureReason: reason };
}

events = events.map(withImageQualityState);

const canonicalStatusCounts = canonicalDetail.diagnostics.reduce((counts, item) => {
  counts[item.status] = (counts[item.status] || 0) + 1;
  return counts;
}, {});
const canonicalFieldUpdates = canonicalDetail.diagnostics.reduce((counts, item) => {
  (item.fieldsUpdated || []).forEach(field => { counts[field] = (counts[field] || 0) + 1; });
  return counts;
}, {});
sourceHealth.canonicalDetailEnrichment = {
  frameworkVersion: 'canonical-detail-enrichment-v1',
  checkedAt: generatedAt,
  ...canonicalStatusCounts,
  fieldUpdates: canonicalFieldUpdates
};
console.log(`Canonical detail summary: ${JSON.stringify(sourceHealth.canonicalDetailEnrichment)}`);
const imageQualityCounts = events.reduce((counts, event) => {
  const status = event.imageStatus || (event.image ? 'unclassified' : 'missing');
  counts[status] = (counts[status] || 0) + 1;
  if (event.imageFailureReason) counts['failure:' + event.imageFailureReason] = (counts['failure:' + event.imageFailureReason] || 0) + 1;
  return counts;
}, {});
sourceHealth.officialImageEnrichment = {
  frameworkVersion: 'official-image-enrichment-v2',
  checkedAt: generatedAt,
  ...imageQualityCounts
};
console.log(`Official image summary: ${JSON.stringify(sourceHealth.officialImageEnrichment)}`);

// Link health is a release-quality stage. A known-bad detail URL is replaced
// only with an explicitly configured, user-facing official landing page.
const linkHealth = await auditLinks(events, sources, { concurrency: 6 });
events = linkHealth.events.map(event => ({
  ...event,
  // Never erase a session's concrete official URL because the parent card was
  // downgraded. If a session has no URL of its own, it may inherit the card's
  // already-resolved safe destination; otherwise preserve the source URL.
  sessions: (event.sessions || []).map(session => ({
    ...session,
    url: session.url || event.url || '',
    linkResolution: session.url ? 'session-canonical' : event.linkResolution
  }))
}));
const linkHealthSummary = {
  checkedAt: generatedAt, publishedEvents: events.length, checkedLinks: events.length,
  ...linkHealth.counts,
  fallbackUsed: events.filter(event => event.linkResolution === 'fallback').length,
  unavailable: events.filter(event => event.linkResolution === 'unavailable').length
};
console.log(`Link health summary: ${JSON.stringify(linkHealthSummary)}`);
const releaseBlocking = releaseBlockingLinks(events);
if (releaseBlocking.length) {
  const sample = releaseBlocking.slice(0, 12).map(event => ({
    title: event.title, source: event.source, status: event.linkStatus,
    canonicalUrl: event.canonicalUrl
  }));
  throw new Error(`Link Health publish gate blocked ${releaseBlocking.length} known-broken official links: ${JSON.stringify(sample)}`);
}
if ((linkHealthSummary['not-found'] || 0) + (linkHealthSummary['content-mismatch'] || 0) > 0) {
  console.warn(`::warning::Link health downgraded ${(linkHealthSummary['not-found'] || 0) + (linkHealthSummary['content-mismatch'] || 0)} detail links to a verified official fallback.`);
}

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
await writeFile(sourceHealthTarget, `${JSON.stringify(sourceHealth, null, 2)}\n`);
const summaryStatusCounts = events.reduce((counts, event) => {
  const status = event.summaryStatus || 'missing';
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});
console.log(`Published ${events.length} verified activities from ${directSources.length} official calendars and ${searchSources.length} fallback sources; ${retainedSourceEvents.length} retained from last-known-good source data; ${translationStats.translated} translated and ${translationStats.cached} translation entries reused from cache.`);
console.log(`Event summary coverage: ${JSON.stringify(summaryStatusCounts)}`);

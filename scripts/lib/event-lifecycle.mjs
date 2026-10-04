const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

export function pacificToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PACIFIC_TIME_ZONE }).format(now);
}

export function pacificNowValue(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function dateKey(value) {
  return String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

export function normalizedDateTime(value, { endOfDay = false } = {}) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return '';
  return `${match[1]}T${match[2] || (endOfDay ? '23' : '00')}:${match[3] || (endOfDay ? '59' : '00')}:${match[4] || (endOfDay ? '59' : '00')}`;
}

export function addMinutesToLocalDateTime(value, minutes) {
  const match = normalizedDateTime(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):/);
  if (!match) return '';
  const instant = new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]) + minutes
  ));
  return `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, '0')}-${String(instant.getUTCDate()).padStart(2, '0')}T${String(instant.getUTCHours()).padStart(2, '0')}:${String(instant.getUTCMinutes()).padStart(2, '0')}:00`;
}

export function fallbackDurationMinutes(event = {}) {
  const text = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  if (event.format === 'movie-screening') return 200;
  if (event.format === 'sports-game') return 240;
  if (event.format === 'live-show') return 210;
  if (/\b(?:story ?time|tiny tot|baby bounce|stay (?:&|and) play)\b/.test(text)) return 90;
  if (/\b(?:festival|celebration|carnival|parade|fair|art walk)\b/.test(text)) return 480;
  return 240;
}

export function effectiveEndDateValue(event = {}) {
  if (event.ongoing) return '';
  const explicit = event.endDateValue;
  if (explicit) {
    return normalizedDateTime(explicit, {
      endOfDay: !String(explicit).includes('T') && !String(explicit).includes(' ')
    });
  }
  const start = event.dateValue || '';
  if (!start) return '';
  if (!String(start).includes('T') && !String(start).includes(' ')) {
    return normalizedDateTime(start, { endOfDay: true });
  }
  return addMinutesToLocalDateTime(start, fallbackDurationMinutes(event));
}

export function withEffectiveEndTime(event = {}) {
  return event.ongoing ? { ...event } : { ...event, endDateValue: effectiveEndDateValue(event) };
}

export function isStillActive(event = {}, now = pacificNowValue()) {
  if (event.ongoing) return true;
  const end = effectiveEndDateValue(event);
  return Boolean(end && end > now);
}

// Source adapters often pre-filter before they know the final event type or
// exact duration. At that stage use the inclusive end DATE, not the start date.
// This keeps a multi-day event eligible throughout its final day while the
// final pipeline still applies exact end-time expiry.
export function isUpcomingByEventWindow(event = {}, today = pacificToday()) {
  if (event.ongoing) return true;
  const end = dateKey(event.endDateValue || event.dateValue);
  return Boolean(end && end >= today);
}

function isoDate(year, month, day) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() + 1 !== Number(month)
    || parsed.getUTCDate() !== Number(day)
    ? ''
    : value;
}

// Extracts a bounded multi-day window from organizer-owned event copy.
// It intentionally understands visible month/day labels only; it never invents
// a range from prose such as "this weekend". A reference date supplies the
// year for schedule lines like "Friday, October 2nd".
export function officialDateWindowFromText(text, {
  referenceDateValue = '',
  maxSpanDays = 45
} = {}) {
  const referenceDate = dateKey(referenceDateValue);
  const referenceYear = Number(referenceDate.slice(0, 4)) || null;
  const found = [];

  for (const match of String(text || '').matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/gi)) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    const year = Number(match[3] || referenceYear);
    const value = year && month ? isoDate(year, month, Number(match[2])) : '';
    if (value) found.push(value);
  }

  if (referenceDate) found.push(referenceDate);
  const unique = [...new Set(found)].sort();
  if (!unique.length) return { startDateValue: '', endDateValue: '' };

  // Keep dates in the same local event window as the listing/reference date.
  // This rejects unrelated footer/archive dates without preventing legitimate
  // multi-day festivals or exhibits.
  let candidates = unique;
  if (referenceDate) {
    const ref = new Date(`${referenceDate}T12:00:00Z`);
    candidates = unique.filter(value => {
      const days = Math.abs((new Date(`${value}T12:00:00Z`) - ref) / 86400000);
      return days <= maxSpanDays;
    });
    if (!candidates.includes(referenceDate)) candidates.push(referenceDate);
    candidates.sort();
  }

  const startDateValue = candidates[0] || referenceDate;
  const endDateValue = candidates.at(-1) || referenceDate;
  const spanDays = startDateValue && endDateValue
    ? (new Date(`${endDateValue}T12:00:00Z`) - new Date(`${startDateValue}T12:00:00Z`)) / 86400000
    : 0;

  if (spanDays < 0 || spanDays > maxSpanDays) {
    return { startDateValue: referenceDate, endDateValue: referenceDate };
  }
  return { startDateValue, endDateValue };
}

export function dateRangesOverlap(startA, endA, startB, endB) {
  const aStart = dateKey(startA);
  const aEnd = dateKey(endA || startA);
  const bStart = dateKey(startB);
  const bEnd = dateKey(endB || startB);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && aEnd >= bStart;
}

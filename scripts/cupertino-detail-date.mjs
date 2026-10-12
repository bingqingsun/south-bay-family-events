function dayOf(value) {
  return String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
}

export function sameCupertinoListingDay(value, listingDateValue) {
  const listingDay = dayOf(listingDateValue);
  const candidateDay = dayOf(value);
  return Boolean(candidateDay && (!listingDay || candidateDay === listingDay));
}

export function selectCupertinoDetailDates({
  listingStart = '',
  listingEnd = '',
  schemaStart = '',
  schemaEnd = '',
  visibleStart = '',
  visibleEnd = ''
} = {}) {
  const schemaStartMatches = Boolean(schemaStart && sameCupertinoListingDay(schemaStart, listingStart));
  const schemaEndMatches = Boolean(schemaEnd && sameCupertinoListingDay(schemaEnd, listingStart));
  const visibleStartMatches = Boolean(visibleStart && sameCupertinoListingDay(visibleStart, listingStart));
  const visibleEndMatches = Boolean(visibleEnd && sameCupertinoListingDay(visibleEnd, listingStart));

  return {
    startDateValue: schemaStartMatches
      ? String(schemaStart)
      : visibleStartMatches
        ? String(visibleStart)
        : String(listingStart || ''),
    endDateValue: schemaEndMatches
      ? String(schemaEnd)
      : visibleEndMatches
        ? String(visibleEnd)
        : String(listingEnd || ''),
    ignoredSchemaStart: Boolean(schemaStart && !schemaStartMatches),
    ignoredSchemaEnd: Boolean(schemaEnd && !schemaEndMatches)
  };
}

const CUPERTINO_MONTH_NUMBERS = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12'
};

// Only trust dates explicitly labeled as the event's "Next date" or "When".
// Navigation/footer dates and generic text elsewhere on Cupertino pages
// must not silently replace an event occurrence.
export function explicitCupertinoDetailDay(pageText) {
  const match = String(pageText || '').match(/\b(?:Next date:|When\s*:?)\s*[*•-]?\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!match) return '';
  return `${match[3]}-${CUPERTINO_MONTH_NUMBERS[match[1].toLowerCase()]}-${match[2].padStart(2, '0')}`;
}

export function cupertinoDetailConflictsWithOccurrence(pageText, occurrenceDate) {
  const officialDay = explicitCupertinoDetailDay(pageText);
  const occurrenceDay = dayOf(occurrenceDate);
  return Boolean(officialDay && occurrenceDay && officialDay !== occurrenceDay);
}

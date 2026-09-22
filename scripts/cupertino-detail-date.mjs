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

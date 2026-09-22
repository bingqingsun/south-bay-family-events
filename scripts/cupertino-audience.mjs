function clean(value) {
  return String(value || '')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cupertino detail pages contain site-wide Parks & Recreation navigation.
// Labels such as "Preschool" and "Teens" in that chrome are not the audience
// of the event being viewed. Only the listing's own audience tags plus
// explicit organizer age statements from event-specific copy may feed ageInfo.
export function cupertinoAudienceEvidence(listingAudience = '', eventCopy = '') {
  const audience = clean(listingAudience);
  const copy = clean(eventCopy);
  const clauses = [];
  const patterns = [
    /\bages?\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|\d{1,2})\s*(?:-|–|—|to)\s*(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|\d{1,2})\b/gi,
    /\b(?:recommended\s+for\s+)?ages?\s+\d{1,2}\s*(?:(?:and|&)\s*up\b|\+)/gi,
    /\bgrades?\s*(?:k|kindergarten|\d{1,2})\s*(?:-|–|—|to)\s*\d{1,2}\b/gi
  ];
  for (const pattern of patterns) {
    for (const match of copy.matchAll(pattern)) clauses.push(match[0]);
  }
  return [...new Set([audience, ...clauses].filter(Boolean))].join(' ');
}

// Palo Alto's Art Center publishes its seasonal events as ordinary content
// pages under a landing page, not as cards in the citywide Event Directory.
// These helpers deliberately parse only that landing-page component and the
// event-detail fields, never site navigation or page chrome.

function decode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;|&#39;/g, "'").replace(/&ndash;/g, '–')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function paloAltoSpecialEventLinks(html, landingUrl) {
  return [...String(html || '').matchAll(/<div\b[^>]*class=["'][^"']*\blist-item-container\b[^"']*\blanding-3-col\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)]
    .flatMap(match => {
      const block = match[1];
      const href = block.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] || '';
      const title = decode(block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
      const description = decode(block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
      if (!href || !title || !description) return [];
      return [{ title, description, url: new URL(href, landingUrl).href }];
    });
}

export function paloAltoSpecialEventOccurrences(html) {
  return [...String(html || '').matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\s*\|\s*(\d{1,2}:\d{2}\s*(?:AM|PM))\s*(?:-|to)\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/gi)]
    .map(match => ({ dateText: match[1], startTime: match[2], endTime: match[3] }));
}

export function paloAltoSpecialEventDescription(html) {
  const afterTitle = String(html || '').split(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)[1] || '';
  return decode(afterTitle.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
}

// Only the card and matching event description are safe audience evidence.
// A Palo Alto calendar page also renders citywide audience navigation, which
// is not a statement about the event being parsed.
export function paloAltoSpecialEventAudienceEvidence(candidate, detailDescription) {
  return [candidate?.title, candidate?.description, detailDescription]
    .filter(Boolean)
    .join(' ');
}

export function paloAltoSpecialEventCalendarUrl(html, detailUrl) {
  const href = String(html || '').match(/<a\b[^>]*href=["']([^"']*\/Events-Directory\/[^"']+)["']/i)?.[1] || '';
  return href ? new URL(href, detailUrl).href : '';
}

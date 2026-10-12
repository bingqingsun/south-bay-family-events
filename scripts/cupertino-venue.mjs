// Prefer a clearly labelled venue heading on Cupertino's official event page.
// Looking backwards from a street address through flattened page text can
// accidentally include the final word of the preceding description ("Santa"
// before "Quinlan Community Center", for example).
export function cupertinoVenueFromHeading(html, streetAddress, eventTitle = '') {
  const page = String(html || '');
  const streetNumber = String(streetAddress || '').match(/^\s*(\d{2,6})\b/)?.[1] || '';
  if (!streetNumber) return '';

  const headings = [...page.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(match => ({
      end: match.index + match[0].length,
      name: match[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    }))
    .filter(item => item.name.length >= 4
      && item.name.length <= 90
      && item.name.toLowerCase() !== String(eventTitle || '').trim().toLowerCase()
      && !/^(?:where|when|location|contact us|join us!?|get social|quick links|add to calendar)$/i.test(item.name)
      && !/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\w+\s+\d{1,2}\b/i.test(item.name));

  const streetPattern = new RegExp('\\b' + streetNumber + '\\b', 'g');
  let best = null;
  for (const match of page.matchAll(streetPattern)) {
    for (const heading of headings) {
      const gap = match.index - heading.end;
      if (gap < 0 || gap > 700) continue;
      if (!best || gap < best.gap) best = { name: heading.name, gap };
    }
  }
  return best?.name || '';
}

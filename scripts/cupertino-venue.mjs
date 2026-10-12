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
    }));

  const isVenueHeading = name => name.length >= 4
    && name.length <= 90
    && name.toLowerCase() !== String(eventTitle || '').trim().toLowerCase()
    && /(?:community|recreation|civic|senior|arts|aquatic|ice) center|park|library|museum|garden|theat(?:er|re)|school|farm|field|hall|plaza|arena|auditorium|gymnasium/i.test(name)
    && !/^(?:where|when|location|contact us|join us!?|get social|quick links|add to calendar)$/i.test(name)
    && !/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\w+\s+\d{1,2}\b/i.test(name);

  const streetPattern = new RegExp('\\b' + streetNumber + '\\b', 'g');
  let best = null;
  for (const match of page.matchAll(streetPattern)) {
    // The closest heading always wins. Never skip a non-venue heading (such
    // as "Contact Us") and then accidentally borrow an earlier event venue.
    const closest = headings
      .map(heading => ({ ...heading, gap: match.index - heading.end }))
      .filter(heading => heading.gap >= 0 && heading.gap <= 700)
      .sort((a, b) => a.gap - b.gap)[0];
    if (closest && isVenueHeading(closest.name) && (!best || closest.gap < best.gap)) {
      best = closest;
    }
  }
  return best?.name || '';
}

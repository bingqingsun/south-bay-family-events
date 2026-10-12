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

/**
 * Cupertino's flattened detail page text can concatenate the last word of an
 * activity title with the venue right before an address. For example,
 * "Breakfast with Santa" + "Quinlan Community Center" becomes
 * "Santa Quinlan Community Center". Remove only a demonstrably repeated
 * title-tail token and preserve real compound city names such as Santa Clara.
 */
export function cleanCupertinoVenueCandidate(value, eventTitle = '') {
  const candidate = String(value || '').replace(/\s+/g, ' ').trim();
  const words = candidate.split(' ').filter(Boolean);
  const titleWords = String(eventTitle || '').trim().replace(/[^A-Za-z0-9]+$/g, '').split(/\s+/).filter(Boolean);
  const titleTail = titleWords[titleWords.length - 1]?.toLowerCase() || '';
  const remainder = words.slice(1).join(' ');
  const isKnownCompoundPlace = /^(?:Santa Clara|San Jose|San Francisco|San Mateo|Palo Alto|Mountain View|Los Altos|Los Gatos|Menlo Park)\b/i.test(candidate);
  if (words.length >= 4 && titleTail && words[0].toLowerCase() === titleTail
      && !isKnownCompoundPlace
      && /\b(?:community center|recreation center|civic center|senior center|arts center|library|museum|garden|theat(?:er|re)|school|park|hall|plaza|auditorium|gymnasium)\b/i.test(remainder)) {
    return remainder;
  }
  return candidate;
}

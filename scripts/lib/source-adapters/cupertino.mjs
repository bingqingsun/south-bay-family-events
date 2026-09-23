import { plainText } from '../detail-extractors/generic.mjs';


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

function isoDateFromOfficialText(dateText, timeText = '') {
  const months = { january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
  const d = String(dateText || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!d) return '';
  const date = d[3] + '-' + String(months[d[1].toLowerCase()]).padStart(2,'0') + '-' + String(Number(d[2])).padStart(2,'0');
  const t = String(timeText || '').replace(/\./g,'').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!t) return date;
  let hour = Number(t[1]) % 12;
  if (t[3].toUpperCase() === 'PM') hour += 12;
  return date + 'T' + String(hour).padStart(2,'0') + ':' + (t[2] || '00') + ':00';
}

export function parseCupertinoDetail({ html, event }) {
  const text = plainText(html);
  const title = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || event.title);
  const nextDate = text.match(/Next date:\s*((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\s*\|\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))(?:\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)))?/i);
  const plainDate = text.match(/\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\b/i);
  const dateAnchor = nextDate?.[1] || plainDate?.[1] || '';
  const nearby = dateAnchor ? text.slice(Math.max(0, text.indexOf(dateAnchor)), text.indexOf(dateAnchor) + 280) : '';
  const range = nextDate
    ? [nextDate[2], nextDate[3] || '']
    : (() => {
        const match = nearby.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))/i);
        return match ? [match[1], match[2]] : [];
      })();

  const addressMatch = cupertinoAddressCandidate(text);
  let venue = '';
  if (addressMatch) {
    const addressIndex = addressMatch.index;
    let prefix = text.slice(Math.max(0, addressIndex - 220), addressIndex);
    prefix = prefix
      .replace(title, ' ')
      .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/gi, ' ')
      .replace(/\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)\s*(?:to|-|–|—)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM)/gi, ' ')
      .replace(/\b(?:Next date|When|Where|Location)\b\s*:?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    venue = prefix.match(/([A-Z][A-Za-z0-9&'’.-]*(?:\s+[A-Z][A-Za-z0-9&'’.-]*){1,5})$/)?.[1] || '';
  }

  const age = text.match(/\bages?\s*(\d{1,2})\s*(?:\+|and up)\b/i)?.[1];
  return {
    title,
    startDate: dateAnchor && range[0] ? isoDateFromOfficialText(dateAnchor, range[0]) : '',
    endDate: dateAnchor && range[1] ? isoDateFromOfficialText(dateAnchor, range[1]) : '',
    venue: venue && !/^(?:South Bay|City of Cupertino)$/i.test(venue) ? venue : '',
    streetAddress: addressMatch?.street ? addressMatch.street + ', Cupertino' : '',
    city: addressMatch ? 'Cupertino' : '',
    audienceText: age ? 'Ages ' + age + '+' : '',
    evidenceText: text.slice(0, 12000),
    method: 'cupertino-adapter'
  };
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export function decodeHtml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

export function plainText(html = '') {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export function htmlAttribute(html, pattern) {
  const match = String(html || '').match(pattern);
  return decodeHtml(match?.[1] || '').trim();
}

function eventNodes(value) {
  if (Array.isArray(value)) return value.flatMap(eventNodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...eventNodes(value['@graph'])];
}

function words(value) {
  return new Set(plainText(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(word => word.length > 3));
}

export function sameEventIdentity(a, b) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return false;
  const shared = [...left].filter(word => right.has(word)).length;
  return shared >= Math.min(2, left.size, right.size);
}

export function eventSchemas(html, title = '') {
  const nodes = [...String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap(match => {
      try { return eventNodes(JSON.parse(decodeHtml(match[1]))); } catch { return []; }
    })
    .filter(node => String(node?.['@type'] || '').toLowerCase().includes('event'));
  if (!title) return nodes;
  // Never borrow structured data from another Event node on a calendar or
  // venue page. With a requested title, no identity match means no schema
  // evidence; meta/HTML extraction may still contribute non-structured fields.
  return nodes.filter(node => sameEventIdentity(node?.name || node?.headline || '', title));
}

function approvedUrl(value, baseUrl, domain) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    const host = url.hostname.toLowerCase();
    if (!domain || host === domain.toLowerCase() || host.endsWith('.' + domain.toLowerCase())) return url.href;
  } catch {}
  return '';
}

export function extractCanonical({ html, schema, currentUrl, finalUrl, domain }) {
  const canonical = htmlAttribute(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)
    || htmlAttribute(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i);
  const candidates = [
    { value: canonical, method: 'html-canonical' },
    { value: schema?.url || '', method: 'schema.org' },
    { value: finalUrl || '', method: 'http-final-url' },
    { value: currentUrl || '', method: 'existing-url' }
  ];
  for (const candidate of candidates) {
    const url = approvedUrl(candidate.value, currentUrl || finalUrl, domain);
    if (url) return { value: url, method: candidate.method };
  }
  return { value: currentUrl || '', method: 'existing-url' };
}

function normalizeIso(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return '';
  if (!match[2]) return match[1];
  return match[1] + 'T' + match[2] + ':' + match[3] + (match[4] ? ':' + match[4] : '');
}

function isoFromText(dateText, timeText = '') {
  const d = String(dateText || '').match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!d) return '';
  const month = MONTHS[d[1].toLowerCase()];
  const date = d[3] + '-' + String(month).padStart(2, '0') + '-' + String(Number(d[2])).padStart(2, '0');
  const t = String(timeText || '').replace(/\./g, '').match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (!t) return date;
  let hour = Number(t[1]) % 12;
  if (t[3].toUpperCase() === 'PM') hour += 12;
  return date + 'T' + String(hour).padStart(2, '0') + ':' + (t[2] || '00') + ':00';
}

export function extractDateTime({ html, schema, currentDate = '' }) {
  const startSchema = normalizeIso(schema?.startDate);
  const endSchema = normalizeIso(schema?.endDate);
  if (startSchema) {
    const pageText = plainText(html);
    const explicitMidnight = /\b(?:12(?::00)?\s*(?:a\.?m\.?|AM)|midnight)\b/i.test(pageText);
    const startMidnightPlaceholder = /T00:00(?::00)?$/.test(startSchema) && !explicitMidnight;
    const dateOnlyWithMidnightEnd = /^\d{4}-\d{2}-\d{2}$/.test(startSchema)
      && endSchema.startsWith(startSchema + 'T00:00')
      && !explicitMidnight;
    if (startMidnightPlaceholder || dateOnlyWithMidnightEnd) {
      return { startDate: startSchema.slice(0, 10), endDate: '', method: 'schema.org-date-only' };
    }
    return { startDate: startSchema, endDate: endSchema, method: 'schema.org' };
  }

  // Text-only time parsing is intentionally conservative. It may refine an
  // already-known occurrence on the same day, but it may not move an event to
  // a different date based on an arbitrary date found elsewhere on the page.
  const currentDay = String(currentDate || '').slice(0, 10);
  if (!currentDay) return { startDate: '', endDate: '', method: '' };
  const text = plainText(html);
  const date = text.match(/\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\b/i);
  if (!date) return { startDate: '', endDate: '', method: '' };
  const parsedDay = isoFromText(date[2]).slice(0, 10);
  if (parsedDay !== currentDay) return { startDate: '', endDate: '', method: '' };
  const startIndex = text.indexOf(date[0]);
  const nearby = text.slice(startIndex, startIndex + 220);
  const range = nearby.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))\s*(?:to|-|–|—)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|AM|PM))/i);
  if (!range) return { startDate: '', endDate: '', method: '' };
  return { startDate: isoFromText(date[2], range[1]), endDate: isoFromText(date[2], range[2]), method: 'official-text' };
}

function postalAddressParts(address) {
  if (!address) return {};
  if (typeof address === 'string') return { streetAddress: plainText(address) };
  return { streetAddress: plainText(address.streetAddress || ''), city: plainText(address.addressLocality || '') };
}

export function extractLocation({ schema }) {
  const raw = Array.isArray(schema?.location) ? schema.location[0] : schema?.location;
  if (!raw || typeof raw !== 'object') return { venue: '', streetAddress: '', city: '', method: '' };
  const address = postalAddressParts(raw.address);
  return {
    venue: plainText(raw.name || ''),
    streetAddress: address.streetAddress || '',
    city: address.city || '',
    method: raw.name || address.streetAddress ? 'schema.org' : ''
  };
}

export function extractDescription({ html, schema }) {
  const schemaDescription = plainText(schema?.description || '');
  if (schemaDescription.length >= 25) return { value: schemaDescription, method: 'schema.org' };
  const meta = htmlAttribute(html, /<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']+)/i)
    || htmlAttribute(html, /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["'](?:description|og:description)["']/i);
  const value = plainText(meta);
  return { value: value.length >= 25 ? value : '', method: value.length >= 25 ? 'meta-description' : '' };
}

export function usefulOfficialImage(value) {
  if (!/^https?:\/\//i.test(String(value || ''))) return false;
  try {
    const url = new URL(value);
    const fingerprint = decodeURIComponent(url.pathname + ' ' + url.search).toLowerCase();
    // A canonical page may expose a site logo/default share card as og:image.
    // Those are official assets but not evidence of the event's main image.
    return !/(?:^|[\\/_ .-])(?:favicon|logo|brandmark|site[-_ ]?icon|avatar|placeholder|default[-_ ]?(?:image|event|share)|transparent|spacer|sprite|seal)(?:[\\/_ .-]|$)/.test(fingerprint);
  } catch {
    return false;
  }
}

export function extractImage({ html, schema, baseUrl }) {
  const schemaImage = Array.isArray(schema?.image) ? schema.image[0] : (typeof schema?.image === 'object' ? schema.image?.url : schema?.image);
  const ogImage = htmlAttribute(html, /<meta\s+property=["']og:image(?::secure_url)?["']\s+content=["']([^"']+)/i)
    || htmlAttribute(html, /<meta\s+content=["']([^"']+)["']\s+property=["']og:image(?::secure_url)?["']/i);
  const twitterImage = htmlAttribute(html, /<meta\s+(?:name|property)=["']twitter:image["']\s+content=["']([^"']+)/i)
    || htmlAttribute(html, /<meta\s+content=["']([^"']+)["']\s+(?:name|property)=["']twitter:image["']/i);
  for (const [rawImage, method] of [[schemaImage, 'schema.org'], [ogImage, 'og:image'], [twitterImage, 'twitter:image']]) {
    if (!rawImage) continue;
    try {
      const value = new URL(decodeHtml(rawImage), baseUrl).href;
      if (usefulOfficialImage(value)) return { value, method };
    } catch {}
  }
  return { value: '', method: '' };
}

export function extractAudience({ schema, text = '' }) {
  const audience = Array.isArray(schema?.audience) ? schema.audience[0] : schema?.audience;
  const structured = plainText(typeof audience === 'object' ? (audience?.name || audience?.audienceType || '') : audience || schema?.typicalAgeRange || '');
  const source = structured || plainText(text);
  const range = source.match(/\b(?:ages?\s*)?(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b/i);
  if (range) return { value: 'Ages ' + range[1] + '–' + range[2], method: structured ? 'schema.org' : 'official-text' };
  const plus = source.match(/\bages?\s*(\d{1,2})\s*(?:\+|and up)\b/i);
  if (plus) return { value: 'Ages ' + plus[1] + '+', method: structured ? 'schema.org' : 'official-text' };
  if (/\ball ages\b/i.test(source)) return { value: 'All ages', method: structured ? 'schema.org' : 'official-text' };
  if (/\bfamil(?:y|ies)(?:-friendly)?\b/i.test(source)) return { value: 'Family-friendly', method: structured ? 'schema.org' : 'official-text' };
  return { value: '', method: '' };
}

function moneyValues(value) {
  return [...String(value || '').matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map(match => Number(match[1])).filter(Number.isFinite);
}

export function extractCostAndRegistration({ schema, text = '' }) {
  const body = plainText(text);
  const offers = Array.isArray(schema?.offers) ? schema.offers : schema?.offers ? [schema.offers] : [];
  const offerPrices = offers.flatMap(offer => {
    if (offer?.price === 0 || offer?.price === '0') return [0];
    if (offer?.price != null && Number.isFinite(Number(offer.price))) return [Number(offer.price)];
    return [];
  });
  let costStatus = 'unknown', costLabel = '', costEvidence = '', costMethod = '';
  if (offerPrices.length) {
    const unique = [...new Set(offerPrices)].sort((a,b)=>a-b);
    if (unique.every(value => value === 0)) { costStatus = 'free'; costLabel = '免费'; }
    else { costStatus = 'paid'; costLabel = unique.length === 1 ? '$' + unique[0] : '$' + unique[0] + '–$' + unique.at(-1); }
    costEvidence = 'schema.org offers'; costMethod = 'schema.org';
  } else {
    const freeSentence = body.match(/[^.!?]{0,90}\b(?:free admission|admission is free|free event|free program|free activity|free entry|free to attend|no admission cost|no admission charge|no entry fee)\b[^.!?]{0,90}/i)?.[0] || '';
    const donationSentence = body.match(/[^.!?]{0,90}\b(?:suggested|optional|requested) donation\b[^.!?]{0,90}/i)?.[0] || '';
    const priceSentence = body.match(/[^.!?]{0,100}\b(?:resident|non-resident|admission|tickets?|registration|price|cost|fee)\b[^.!?]{0,140}\$\s*\d+(?:\.\d{1,2})?[^.!?]{0,120}/i)?.[0] || '';
    if (donationSentence) { costStatus='donation'; costLabel='建议捐赠'; costEvidence=plainText(donationSentence); costMethod='official-text'; }
    else if (freeSentence) { costStatus='free'; costLabel='免费'; costEvidence=plainText(freeSentence); costMethod='official-text'; }
    else if (priceSentence) {
      const values=[...new Set(moneyValues(priceSentence))].sort((a,b)=>a-b);
      if (values.length) { costStatus='paid'; costLabel=values.length===1?'$'+values[0]:'$'+values[0]+'–$'+values.at(-1); costEvidence=plainText(priceSentence); costMethod='official-text'; }
    }
  }

  let registrationStatus='unknown', registrationEvidence='';
  const patterns=[
    // "No registration required; walk-in while supplies last" is best shown as
    // walk-in because it is the more actionable organizer instruction.
    ['walk-in', /[^.!?]{0,110}\b(?:walk-?ins?(?:\s+while\s+supplies\s+last)?|walk-?ins? (?:are )?(?:welcome|accepted)|drop-?ins? (?:are )?(?:welcome|accepted))\b[^.!?]{0,110}/i],
    ['not-required', /[^.!?]{0,90}\b(?:no registration (?:is )?required|registration (?:is )?not required|without registration)\b[^.!?]{0,90}/i],
    ['required', /[^.!?]{0,100}\b(?:registration (?:is )?required|advance registration (?:is )?required|all attendees must register|register (?:online |in advance )?to attend|tickets? (?:are )?required for (?:admission|entry))\b[^.!?]{0,100}/i],
    ['recommended', /[^.!?]{0,100}\b(?:(?:registration|reservations?|rsvp) (?:is |are )?(?:recommended|encouraged)|please rsvp)\b[^.!?]{0,100}/i]
  ];
  for (const [status,pattern] of patterns) {
    const match=body.match(pattern)?.[0];
    if (match) { registrationStatus=status; registrationEvidence=plainText(match); break; }
  }
  return {
    costStatus,costLabel,costEvidence,costMethod,
    registrationStatus,registrationEvidence,
    registrationMethod: registrationStatus==='unknown'?'':'official-text'
  };
}

export function genericDetailExtraction({ html, title, currentUrl, finalUrl, domain, currentDate = '' }) {
  const schema = eventSchemas(html, title)[0] || {};
  const canonical = extractCanonical({ html, schema, currentUrl, finalUrl, domain });
  const dateTime = extractDateTime({ html, schema, currentDate });
  const location = extractLocation({ schema });
  const description = extractDescription({ html, schema });
  const image = extractImage({ html, schema, baseUrl: canonical.value || currentUrl || finalUrl });
  const pageText = plainText(html);
  // Generic enrichment only trusts structured audience data. Broad words such
  // as "family" in site navigation must never manufacture an age label.
  const audience = extractAudience({ schema, text: '' });
  // Generic commerce parsing is likewise scoped to event description/schema.
  // Full-page text is available only to a source adapter that understands the
  // organizer's layout.
  const commerce = extractCostAndRegistration({
    schema,
    text: [plainText(schema?.description || ''), description.value].filter(Boolean).join(' ')
  });
  const pageTitle = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || htmlAttribute(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  return {
    pageTitle,
    canonicalUrl: canonical.value, canonicalMethod: canonical.method,
    startDate: dateTime.startDate, endDate: dateTime.endDate, dateMethod: dateTime.method,
    venue: location.venue, streetAddress: location.streetAddress, city: location.city, locationMethod: location.method,
    description: description.value, descriptionMethod: description.method,
    image: image.value, imageMethod: image.method,
    audienceText: audience.value, audienceMethod: audience.method,
    ...commerce
  };
}

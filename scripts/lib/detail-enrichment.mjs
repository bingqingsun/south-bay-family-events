import {
  extractCostAndRegistration,
  genericDetailExtraction,
  plainText,
  sameEventIdentity
} from './detail-extractors/generic.mjs';
import { parseCupertinoDetail } from './source-adapters/cupertino.mjs';
import { parseSymphonyDetail } from './source-adapters/symphony.mjs';

export const DETAIL_QUALITY_STATES = Object.freeze({
  PUBLISH_READY: 'PUBLISH_READY',
  PUBLISH_PARTIAL: 'PUBLISH_PARTIAL',
  HOLD_DATA_ERROR: 'HOLD_DATA_ERROR',
  CANCELLED: 'CANCELLED'
});

function adapterFor(source) {
  if (source?.method === 'cupertino') return parseCupertinoDetail;
  if (source?.method === 'symphony') return parseSymphonyDetail;
  return null;
}

function hasTime(value) {
  return /T\d{2}:\d{2}/.test(String(value || ''));
}

function fieldExists(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function isVirtualEvent(event) {
  return /\b(?:online|virtual|zoom|webinar)\b/i.test([event.title, event.place, event.description].filter(Boolean).join(' '));
}

function hasMeaningfulLocation(event) {
  if (isVirtualEvent(event)) return true;
  if (fieldExists(event.city) || fieldExists(event.meetingPoint) || fieldExists(event.address)) return true;
  return fieldExists(event.place) && plainText(event.place).toLowerCase() !== plainText(event.source).toLowerCase();
}

function normalizeAddress(street, city) {
  const cleanStreet = plainText(street).replace(/[.,;:]$/, '');
  const cleanCity = plainText(city);
  if (!cleanStreet) return '';
  if (cleanCity && !cleanStreet.toLowerCase().includes(cleanCity.toLowerCase())) return cleanStreet + ', ' + cleanCity;
  return cleanStreet;
}

function meaningfulPlace(value, sourceName) {
  const text = plainText(value);
  return Boolean(text && text.toLowerCase() !== plainText(sourceName).toLowerCase());
}

function cancelled(text) {
  return /\b(?:this event (?:has been )?cancell?ed|event cancell?ed|cancelled event)\b/i.test(text);
}

function agePatch(text) {
  const value = plainText(text);
  if (!value) return {};
  const range = value.match(/Ages?\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/i);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return {
      ageBands: [],
      ageRanges: [[min, max]],
      ageMin: min,
      ageMax: max,
      ageLabel: 'Ages ' + min + '–' + max,
      ageSource: 'Official organizer age range'
    };
  }
  const plus = value.match(/Ages?\s*(\d{1,2})\+/i);
  if (plus) {
    const min = Number(plus[1]);
    return {
      ageBands: [],
      ageRanges: [[min, 18]],
      ageMin: min,
      ageMax: 18,
      ageLabel: 'Ages ' + min + '+',
      ageSource: 'Official organizer age range'
    };
  }
  if (/all ages/i.test(value)) {
    return { ageBands: ['all-ages'], ageRanges: [[0,18]], ageMin: 0, ageMax: 18, ageLabel: 'All ages', ageSource: 'Official audience information' };
  }
  if (/family-friendly/i.test(value)) {
    return { ageBands: ['family'], ageRanges: [], ageMin: null, ageMax: null, ageLabel: 'Family-friendly', ageSource: 'Official audience information', familyFriendly: true };
  }
  return {};
}

export function detailCompletenessScore(event) {
  const ongoing = event.ongoing === true;
  const virtual = isVirtualEvent(event);
  let score = 0;
  if (/^https?:\/\//i.test(event.url || event.canonicalUrl || '')) score += 15;
  if (ongoing || /^\d{4}-\d{2}-\d{2}/.test(event.dateValue || '')) score += 10;
  if (ongoing || hasTime(event.dateValue)) score += 10;
  if (virtual || (fieldExists(event.place) && !/^City of\s+/i.test(String(event.place)))) score += 10;
  if (virtual || fieldExists(event.address) || fieldExists(event.meetingPoint)) score += 10;
  if (String(event.description || '').trim().length >= 25) score += 10;
  if (/^https?:\/\//i.test(event.image || '')) score += 5;
  if (fieldExists(event.ageLabel) || (Array.isArray(event.ageRanges) && event.ageRanges.length)) score += 8;
  if (event.costStatus && event.costStatus !== 'unknown') score += 8;
  if (event.registrationStatus && event.registrationStatus !== 'unknown') score += 6;
  if (ongoing || hasTime(event.endDateValue)) score += 4;
  if (virtual || fieldExists(event.address) || fieldExists(event.meetingPoint) || fieldExists(event.mapUrl)) score += 4;
  return score;
}

function qualityState(event) {
  const identityCore = [event.title, event.source, event.url || event.canonicalUrl, event.description];
  const dateCore = event.ongoing === true || /^\d{4}-\d{2}-\d{2}/.test(event.dateValue || '');
  if (identityCore.some(value => !fieldExists(value)) || !dateCore || !hasMeaningfulLocation(event)) {
    return DETAIL_QUALITY_STATES.HOLD_DATA_ERROR;
  }
  return detailCompletenessScore(event) >= 80
    ? DETAIL_QUALITY_STATES.PUBLISH_READY
    : DETAIL_QUALITY_STATES.PUBLISH_PARTIAL;
}

export function buildEventQuality(event, {
  detailStatus = 'not-enriched',
  mode = '',
  detailUrl = '',
  detailVerifiedAt = '',
  fieldsUpdated = [],
  fetchStatus = 0,
  warnings = [],
  extractionSignals = [],
  fieldProvenance = {}
} = {}) {
  const ongoing = event.ongoing === true;
  const virtual = isVirtualEvent(event);
  const checks = {
    url: /^https?:\/\//i.test(event.url || event.canonicalUrl || ''),
    date: ongoing || /^\d{4}-\d{2}-\d{2}/.test(event.dateValue || ''),
    start_time: ongoing || hasTime(event.dateValue),
    venue: virtual || (fieldExists(event.place) && !/^City of\s+/i.test(String(event.place))),
    address: virtual || fieldExists(event.address) || fieldExists(event.meetingPoint),
    description: String(event.description || '').trim().length >= 25,
    image: /^https?:\/\//i.test(event.image || ''),
    age: fieldExists(event.ageLabel) || (Array.isArray(event.ageRanges) && event.ageRanges.length > 0),
    cost: event.costStatus && event.costStatus !== 'unknown',
    registration: event.registrationStatus && event.registrationStatus !== 'unknown',
    end_time: ongoing || hasTime(event.endDateValue)
  };
  const missingFields = Object.entries(checks).filter(([, ok]) => !ok).map(([field]) => field);
  return {
    event_id: event.id || '',
    title: event.title || '',
    source: event.source || '',
    detail_status: detailStatus,
    mode,
    detail_url: detailUrl || event.url || '',
    detail_verified_at: detailVerifiedAt || '',
    fetch_status: fetchStatus,
    completeness_score: detailCompletenessScore(event),
    quality_state: qualityState(event),
    missing_fields: missingFields,
    extraction_gaps: extractionSignals.filter(field => missingFields.includes(field)),
    fields_updated: [...new Set(fieldsUpdated)],
    warnings: [...new Set(warnings)],
    field_provenance: fieldProvenance
  };
}

export function enrichEventFromDetail(event, {
  source,
  html,
  finalUrl = '',
  mode = 'fresh',
  verifiedAt = new Date().toISOString(),
  fetchStatus = 200
} = {}) {
  if (!event || !source || !html) {
    return {
      event,
      diagnostics: buildEventQuality(event || {}, {
        detailStatus: 'fetch-failed',
        mode,
        detailUrl: event?.url || '',
        detailVerifiedAt: verifiedAt,
        fetchStatus,
        warnings: ['detail_html_missing']
      })
    };
  }

  const generic = genericDetailExtraction({
    html,
    title: event.title,
    currentUrl: event.url,
    finalUrl,
    domain: source.domain,
    currentDate: event.dateValue
  });
  const adapter = adapterFor(source);
  const specific = adapter ? adapter({ html, event, source, generic, finalUrl }) : {};
  const pageTitle = specific.title || generic.pageTitle || '';
  const pageText = plainText(html);

  const pageCarriesTitle = plainText(pageText).toLowerCase().includes(plainText(event.title).toLowerCase());
  if (pageTitle && !sameEventIdentity(event.title, pageTitle) && !pageCarriesTitle) {
    return {
      event,
      diagnostics: buildEventQuality(event, {
        detailStatus: 'identity-mismatch',
        mode,
        detailUrl: finalUrl || event.url,
        detailVerifiedAt: verifiedAt,
        fetchStatus,
        warnings: ['detail_identity_mismatch']
      })
    };
  }

  if (cancelled(pageText)) {
    return {
      event,
      diagnostics: {
        ...buildEventQuality(event, {
          detailStatus: 'cancelled',
          mode,
          detailUrl: finalUrl || event.url,
          detailVerifiedAt: verifiedAt,
          fetchStatus
        }),
        quality_state: DETAIL_QUALITY_STATES.CANCELLED
      }
    };
  }

  const merged = { ...event };
  const fieldsUpdated = [];
  const fieldProvenance = { ...(event.fieldProvenance || {}) };
  const set = (field, value, method, { onlyIfMissing = false } = {}) => {
    if (!fieldExists(value)) return;
    if (onlyIfMissing && fieldExists(merged[field])) return;
    const evidence = {
      source: 'canonical-detail',
      method: method || 'detail-page',
      sourceUrl: finalUrl || event.url || '',
      verifiedAt
    };
    // Provenance matters even when discovery and canonical page agree on the
    // exact value: it proves the published field was re-verified at source.
    if (String(merged[field] ?? '') === String(value)) {
      fieldProvenance[field] = evidence;
      return;
    }
    merged[field] = value;
    fieldsUpdated.push(field);
    fieldProvenance[field] = evidence;
  };

  // Canonical resolution happens before this stage. Enrichment may strengthen
  // facts from that page, but it must not silently choose a different URL.
  const canonicalStart = specific.startDate || generic.startDate;
  const canonicalEnd = specific.endDate || generic.endDate;
  const knownDay = String(event.dateValue || '').slice(0, 10);
  const sameStartDay = canonicalStart && (!knownDay || String(canonicalStart).slice(0, 10) === knownDay);
  const currentHasTime = hasTime(event.dateValue);
  const canonicalHasTime = hasTime(canonicalStart) && !/T00:00(?::00)?$/.test(String(canonicalStart));
  // Preserve precise session times from an official discovery feed when the
  // canonical page exposes only an all-day umbrella. A source adapter may
  // refine an existing time because it understands that organizer's layout.
  if (sameStartDay && canonicalHasTime && (!currentHasTime || specific.startDate)) {
    set('dateValue', canonicalStart, specific.startDate ? specific.method : generic.dateMethod);
  }
  if (canonicalEnd && (!knownDay || String(canonicalEnd).slice(0, 10) === knownDay)
      && hasTime(canonicalEnd) && !/T00:00(?::00)?$/.test(String(canonicalEnd))) {
    set('endDateValue', canonicalEnd, specific.endDate ? specific.method : generic.dateMethod);
  }

  // Earlier refreshes may have persisted a schema.org all-day placeholder as
  // 00:00 on the same day. Once the generic extractor recognizes the detail
  // page as date-only, repair that stale value to end-of-day so the event
  // cannot expire at the start of its advertised date.
  const mergedKnownDay = String(merged.dateValue || event.dateValue || '').slice(0, 10);
  if (generic.dateMethod === 'schema.org-date-only'
      && mergedKnownDay
      && String(merged.endDateValue || '') === mergedKnownDay + 'T00:00:00') {
    set('endDateValue', mergedKnownDay + 'T23:59:59', 'schema.org-date-only-repair');
  }

  const city = specific.city || generic.city || merged.city || source.city || '';
  if (meaningfulPlace(specific.venue || generic.venue, source.name)) {
    set('place', specific.venue || generic.venue, specific.venue ? specific.method : generic.locationMethod);
  }
  if (specific.streetAddress || generic.streetAddress) {
    set('address', normalizeAddress(specific.streetAddress || generic.streetAddress, city), specific.streetAddress ? specific.method : generic.locationMethod);
  }
  if (city) set('city', city, specific.city ? specific.method : generic.locationMethod);

  // Once identity is verified, the canonical detail page is the stronger
  // source for ordinary extractive copy and event-specific artwork. Structured
  // summaries (movie ratings, sports matchups) and manual editorial evidence
  // are already stronger than a generic venue meta description and must not be
  // replaced by it.
  const genericDescriptionIsWeakMeta = generic.descriptionMethod === 'meta-description';
  const hasSourceSpecificDescription = String(event.description || '').trim().length >= 40;
  const canonicalMayReplaceDescription = !['official_structured', 'manual_verified'].includes(event.summaryStatus)
    && !(genericDescriptionIsWeakMeta && hasSourceSpecificDescription);
  if (canonicalMayReplaceDescription) set('description', generic.description, generic.descriptionMethod);
  const officialImage = specific.image || generic.image;
  const officialImageMethod = specific.image ? specific.imageMethod : generic.imageMethod;
  const officialImageScore = specific.image ? specific.imageScore : generic.imageScore;
  const officialImageEvidence = specific.image ? specific.imageEvidence : generic.imageEvidence;
  set('image', officialImage, officialImageMethod);
  if (officialImage) {
    merged.imageProvenance = {
      source: 'canonical-detail',
      method: officialImageMethod || 'detail-page',
      sourceUrl: finalUrl || event.url || '',
      verifiedAt,
      score: officialImageScore || 0,
      evidence: officialImageEvidence || ''
    };
    merged.imageStatus = 'official';
    delete merged.imageFailureReason;
  } else if (!fieldExists(merged.image)) {
    merged.imageStatus = 'missing';
    merged.imageFailureReason = 'no_verified_official_image_candidate';
  }
  if (canonicalMayReplaceDescription && generic.description) {
    merged.sourceDescriptionRaw = generic.description;
    fieldProvenance.sourceDescriptionRaw = {
      source: 'canonical-detail',
      method: generic.descriptionMethod || 'detail-page',
      sourceUrl: finalUrl || event.url || '',
      verifiedAt
    };
  }

  const audience = specific.audienceText || generic.audienceText;
  const age = agePatch(audience);
  if ((!merged.ageLabel || merged.ageLabel === 'Family-friendly') && age.ageLabel) {
    Object.entries(age).forEach(([field, value]) => {
      if (JSON.stringify(merged[field]) === JSON.stringify(value)) return;
      merged[field] = value;
      fieldsUpdated.push(field);
      fieldProvenance[field] = {
        source: 'canonical-detail',
        method: specific.audienceText ? specific.method : generic.audienceMethod,
        sourceUrl: finalUrl || event.url || '',
        verifiedAt
      };
    });
  }

  const adapterCommerce = specific.evidenceText
    ? extractCostAndRegistration({ schema: {}, text: specific.evidenceText })
    : {};
  const commerce = {
    costStatus: adapterCommerce.costStatus && adapterCommerce.costStatus !== 'unknown' ? adapterCommerce.costStatus : generic.costStatus,
    costLabel: adapterCommerce.costStatus && adapterCommerce.costStatus !== 'unknown' ? adapterCommerce.costLabel : generic.costLabel,
    costEvidence: adapterCommerce.costStatus && adapterCommerce.costStatus !== 'unknown' ? adapterCommerce.costEvidence : generic.costEvidence,
    costMethod: adapterCommerce.costStatus && adapterCommerce.costStatus !== 'unknown' ? adapterCommerce.costMethod : generic.costMethod,
    registrationStatus: adapterCommerce.registrationStatus && adapterCommerce.registrationStatus !== 'unknown'
      ? adapterCommerce.registrationStatus : generic.registrationStatus,
    registrationEvidence: adapterCommerce.registrationStatus && adapterCommerce.registrationStatus !== 'unknown'
      ? adapterCommerce.registrationEvidence : generic.registrationEvidence,
    registrationMethod: adapterCommerce.registrationStatus && adapterCommerce.registrationStatus !== 'unknown'
      ? adapterCommerce.registrationMethod : generic.registrationMethod
  };

  if ((!merged.costStatus || merged.costStatus === 'unknown') && commerce.costStatus && commerce.costStatus !== 'unknown') {
    set('costStatus', commerce.costStatus, commerce.costMethod);
    set('costLabel', commerce.costLabel, commerce.costMethod);
    set('costSource', commerce.costMethod === 'schema.org' ? 'Official structured data' : '官方活动说明', commerce.costMethod);
    set('costEvidence', commerce.costEvidence, commerce.costMethod);
  }
  if ((!merged.registrationStatus || merged.registrationStatus === 'unknown') && commerce.registrationStatus && commerce.registrationStatus !== 'unknown') {
    set('registrationStatus', commerce.registrationStatus, commerce.registrationMethod);
    set('registrationSource', '官方活动说明', commerce.registrationMethod);
    set('registrationEvidence', commerce.registrationEvidence, commerce.registrationMethod);
  }

  merged.fieldProvenance = fieldProvenance;
  merged.detailVerifiedAt = verifiedAt;
  merged.detailStatus = 'enriched';
  merged.detailFailureCount = 0;
  merged.canonicalDetail = {
    status: 'enriched',
    sourceUrl: finalUrl || event.url || '',
    verifiedAt,
    fieldsUpdated: [...new Set(fieldsUpdated)]
  };

  const extractionSignals = [];
  if (/\b(?:time|when|starts?|am|pm)\b/i.test(pageText)) extractionSignals.push('start_time');
  if (/\b\d{1,6}\s+[A-Za-z0-9.'’ -]+\s+(?:Ave|Avenue|St|Street|Rd|Road|Blvd|Boulevard|Dr|Drive|Way)\b/i.test(pageText)) extractionSignals.push('address');
  if (/\b(?:admission|ticket|price|cost|fee|resident|non-resident)\b/i.test(pageText)) extractionSignals.push('cost');
  if (/\b(?:registration|required|rsvp|walk-in)\b/i.test(pageText)) extractionSignals.push('registration');

  return {
    event: merged,
    diagnostics: buildEventQuality(merged, {
      detailStatus: 'enriched',
      mode,
      detailUrl: generic.canonicalUrl || finalUrl || event.url,
      detailVerifiedAt: verifiedAt,
      fieldsUpdated,
      fetchStatus,
      extractionSignals,
      fieldProvenance
    })
  };
}

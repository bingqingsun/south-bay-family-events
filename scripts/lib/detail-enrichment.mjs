import {
  extractCostAndRegistration,
  genericDetailExtraction,
  plainText,
  sameEventIdentity
} from './detail-extractors/generic.mjs';
import { parseCupertinoDetail } from './source-adapters/cupertino.mjs';

export const DETAIL_QUALITY_STATES = Object.freeze({
  PUBLISH_READY: 'PUBLISH_READY',
  PUBLISH_PARTIAL: 'PUBLISH_PARTIAL',
  HOLD_DATA_ERROR: 'HOLD_DATA_ERROR',
  CANCELLED: 'CANCELLED'
});

function adapterFor(source) {
  if (source?.method === 'cupertino') return parseCupertinoDetail;
  return null;
}

function hasTime(value) {
  return /T\d{2}:\d{2}/.test(String(value || ''));
}

function fieldExists(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
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
  let score = 0;
  if (/^https?:\/\//i.test(event.url || event.canonicalUrl || '')) score += 15;
  if (/^\d{4}-\d{2}-\d{2}/.test(event.dateValue || '')) score += 10;
  if (hasTime(event.dateValue)) score += 10;
  if (fieldExists(event.place) && !/^City of\s+/i.test(String(event.place))) score += 10;
  if (fieldExists(event.address) || fieldExists(event.meetingPoint)) score += 10;
  if (String(event.description || '').trim().length >= 25) score += 10;
  if (/^https?:\/\//i.test(event.image || '')) score += 5;
  if (fieldExists(event.ageLabel) || (Array.isArray(event.ageRanges) && event.ageRanges.length)) score += 8;
  if (event.costStatus && event.costStatus !== 'unknown') score += 8;
  if (event.registrationStatus && event.registrationStatus !== 'unknown') score += 6;
  if (hasTime(event.endDateValue)) score += 4;
  if (fieldExists(event.address) || fieldExists(event.meetingPoint) || fieldExists(event.mapUrl)) score += 4;
  return score;
}

function qualityState(event) {
  const core = [
    event.title,
    event.source,
    event.dateValue,
    event.url || event.canonicalUrl,
    event.description,
    event.city
  ];
  if (core.some(value => !fieldExists(value))) return DETAIL_QUALITY_STATES.HOLD_DATA_ERROR;
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
  const checks = {
    url: /^https?:\/\//i.test(event.url || event.canonicalUrl || ''),
    date: /^\d{4}-\d{2}-\d{2}/.test(event.dateValue || ''),
    start_time: hasTime(event.dateValue),
    venue: fieldExists(event.place) && !/^City of\s+/i.test(String(event.place)),
    address: fieldExists(event.address) || fieldExists(event.meetingPoint),
    description: String(event.description || '').trim().length >= 25,
    image: /^https?:\/\//i.test(event.image || ''),
    age: fieldExists(event.ageLabel) || (Array.isArray(event.ageRanges) && event.ageRanges.length > 0),
    cost: event.costStatus && event.costStatus !== 'unknown',
    registration: event.registrationStatus && event.registrationStatus !== 'unknown',
    end_time: hasTime(event.endDateValue)
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
  const specific = adapter ? adapter({ html, event, source, generic }) : {};
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
  const fieldProvenance = {};
  const set = (field, value, method, { onlyIfMissing = false } = {}) => {
    if (!fieldExists(value)) return;
    if (onlyIfMissing && fieldExists(merged[field])) return;
    if (String(merged[field] ?? '') === String(value)) return;
    merged[field] = value;
    fieldsUpdated.push(field);
    fieldProvenance[field] = {
      method: method || 'detail-page',
      sourceUrl: finalUrl || event.url || '',
      verifiedAt
    };
  };

  set('url', generic.canonicalUrl, generic.canonicalMethod);
  set('canonicalUrl', generic.canonicalUrl, generic.canonicalMethod);
  set('dateValue', specific.startDate || generic.startDate, specific.startDate ? specific.method : generic.dateMethod);
  set('endDateValue', specific.endDate || generic.endDate, specific.endDate ? specific.method : generic.dateMethod);

  const city = specific.city || generic.city || merged.city || source.city || '';
  if (meaningfulPlace(specific.venue || generic.venue, source.name)) {
    set('place', specific.venue || generic.venue, specific.venue ? specific.method : generic.locationMethod);
  }
  if (specific.streetAddress || generic.streetAddress) {
    set('address', normalizeAddress(specific.streetAddress || generic.streetAddress, city), specific.streetAddress ? specific.method : generic.locationMethod);
  }
  if (city) set('city', city, specific.city ? specific.method : generic.locationMethod);

  set('description', generic.description, generic.descriptionMethod, { onlyIfMissing: true });
  set('image', generic.image, generic.imageMethod, { onlyIfMissing: true });

  const audience = specific.audienceText || generic.audienceText;
  const age = agePatch(audience);
  if ((!merged.ageLabel || merged.ageLabel === 'Family-friendly') && age.ageLabel) {
    Object.entries(age).forEach(([field, value]) => {
      if (JSON.stringify(merged[field]) === JSON.stringify(value)) return;
      merged[field] = value;
      fieldsUpdated.push(field);
      fieldProvenance[field] = {
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

  merged.detailVerifiedAt = verifiedAt;
  merged.detailStatus = 'enriched';
  merged.detailFailureCount = 0;

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

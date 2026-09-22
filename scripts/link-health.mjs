/* Link-quality contract shared by the event refresh and regression tests. */
const TRACKING_KEYS = /^(?:utm_[^=]+|fbclid|gclid|mc_[^=]+)$/i;
const API_PATH = /(?:^|\/)(?:api|v\d+|rss|feed|feeds|search)(?:\/|$)|\.json(?:$|\?)/i;
const SOFT_ERROR = /\b(?:page\s+not\s+found|event\s+(?:is\s+)?(?:unavailable|expired)|access\s+denied|the\s+requested\s+page\s+could\s+not\s+be\s+found)\b/i;

export function sourceIdFor(source = {}) {
  return String(source.id || source.sourceId || source.name || 'unknown')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

export function normalizeOfficialUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return '';
    url.protocol = 'https:';
    url.hash = '';
    [...url.searchParams.keys()].forEach(key => {
      if (TRACKING_KEYS.test(key)) url.searchParams.delete(key);
    });
    return url.href;
  } catch {
    return '';
  }
}

export function allowedHostsFor(source = {}) {
  return [...new Set([source.domain, ...(source.linkHosts || [])]
    .map(host => String(host || '').toLowerCase()).filter(Boolean))];
}

export function isAllowedOfficialUrl(value, source = {}) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return allowedHostsFor(source).some(host => hostname === host || hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}

export function isUserFacingUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !API_PATH.test(url.pathname);
  } catch {
    return false;
  }
}

export function landingUrlFor(source = {}) {
  // Curated sources are manually configured first-party pages. Their feedUrl is
  // therefore a safe fallback only when it is itself a user-facing allowlisted
  // page. Other source types must opt in with landingUrl.
  const candidate = source.landingUrl || (source.method === 'curated' ? source.feedUrl : '') || '';
  const landing = normalizeOfficialUrl(candidate);
  return landing && isAllowedOfficialUrl(landing, source) && isUserFacingUrl(landing) ? landing : '';
}

export function staticLinkResult(event, source) {
  const canonicalUrl = normalizeOfficialUrl(event.canonicalUrl || event.url || '');
  const fallbackUrl = normalizeOfficialUrl(event.fallbackUrl || landingUrlFor(source));
  if (!canonicalUrl || !isAllowedOfficialUrl(canonicalUrl, source) || !isUserFacingUrl(canonicalUrl)) {
    return {
      canonicalUrl,
      fallbackUrl,
      linkStatus: 'invalid',
      linkCheckMethod: 'static',
      linkEvidence: 'URL is missing, off allowlist, or is an API/feed/search endpoint.'
    };
  }
  return {
    canonicalUrl,
    fallbackUrl,
    linkStatus: 'unknown',
    linkCheckMethod: 'static',
    linkEvidence: 'Static URL policy passed.'
  };
}

function identityWords(value) {
  const stop = new Set(['with','from','your','this','that','the','and','for','san','jose','santa','clara','city','event','events','festival']);
  return (String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])
    .filter(word => !stop.has(word));
}

export function titleMatchesPage(title, html) {
  const words = identityWords(title);
  if (!words.length) return true;
  const page = String(html || '').toLowerCase();
  const matched = words.filter(word => page.includes(word)).length;
  if (words.length === 1) return matched === 1;
  return matched >= Math.min(2, words.length) && matched / words.length >= 0.45;
}

export function sourceForEvent(event, sources = []) {
  const byId = new Map(sources.map(source => [sourceIdFor(source), source]));
  const explicitId = sourceIdFor({ sourceId: event.sourceId || '' });
  if (event.sourceId && byId.has(explicitId)) return byId.get(explicitId);

  const exact = sources.find(source => source.name === event.source);
  if (exact) return exact;

  // Aggregation may intentionally use a parent-facing display source name.
  // Recover the real source contract from the event's canonical host and venue
  // instead of inventing a synthetic registry entry.
  const canonical = normalizeOfficialUrl(event.canonicalUrl || event.url || '');
  const hostMatches = canonical ? sources.filter(source => isAllowedOfficialUrl(canonical, source)) : [];
  if (hostMatches.length === 1) return hostMatches[0];
  if (hostMatches.length > 1) {
    const place = String(event.place || '').toLowerCase();
    return hostMatches.find(source => place && String(source.name || '').toLowerCase() === place)
      || hostMatches.find(source => place && String(source.name || '').toLowerCase().includes(place))
      || hostMatches[0];
  }
  return { name: event.source || 'Unknown source', domain: '' };
}

export async function checkLink(event, source, { fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const result = staticLinkResult(event, source);
  const checkedAt = new Date().toISOString();
  if (result.linkStatus === 'invalid') return { ...result, linkCheckedAt: checkedAt };

  try {
    const response = await fetchImpl(result.canonicalUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; SouthBayFamilyFindsLinkHealth/2.0)',
        accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
    const redirectTarget = normalizeOfficialUrl(response.url || result.canonicalUrl);
    const html = await response.text();

    if (response.status === 403 || response.status === 429) {
      return {
        ...result, linkStatus: 'blocked-machine', linkCheckMethod: 'machine',
        linkCheckedAt: checkedAt, redirectTarget,
        linkEvidence: 'GET returned ' + response.status + '; user-browser availability is not inferred.'
      };
    }
    if (response.status === 404 || response.status === 410) {
      return {
        ...result, linkStatus: 'not-found', linkCheckMethod: 'machine',
        linkCheckedAt: checkedAt, redirectTarget,
        linkEvidence: 'GET returned ' + response.status + '.'
      };
    }
    if (!response.ok) {
      return {
        ...result, linkStatus: 'unknown', linkCheckMethod: 'machine',
        linkCheckedAt: checkedAt, redirectTarget,
        linkEvidence: 'GET returned ' + response.status + '.'
      };
    }
    if (!isAllowedOfficialUrl(redirectTarget, source)) {
      return {
        ...result, linkStatus: 'unknown', linkCheckMethod: 'machine',
        linkCheckedAt: checkedAt, redirectTarget,
        linkEvidence: 'Redirect left the official source allowlist.'
      };
    }
    if (SOFT_ERROR.test(html)) {
      return {
        ...result, linkStatus: 'content-mismatch', linkCheckMethod: 'machine',
        linkCheckedAt: checkedAt, redirectTarget,
        linkEvidence: 'Page returned a soft-error signal.'
      };
    }
    if (!titleMatchesPage(event.title, html)) {
      // A curated_verified URL is human-configured first-party evidence. When
      // the URL itself remains stable, allow an inconclusive machine parser to
      // defer to that evidence; a redirect or soft error still fails above.
      if (event.linkSource === 'curated_verified' && redirectTarget === result.canonicalUrl) {
        return {
          ...result, canonicalUrl: redirectTarget, linkStatus: 'ok',
          linkCheckMethod: 'machine+curated', linkCheckedAt: checkedAt, redirectTarget,
          linkEvidence: 'First-party curated URL returned 2xx; machine title extraction was inconclusive.'
        };
      }
      return {
        ...result, linkStatus: 'content-mismatch', linkCheckMethod: 'machine',
        linkCheckedAt: checkedAt, redirectTarget,
        linkEvidence: 'Page did not contain enough event identity signals.'
      };
    }
    return {
      ...result,
      canonicalUrl: redirectTarget,
      linkStatus: redirectTarget === result.canonicalUrl ? 'ok' : 'redirected',
      linkCheckMethod: 'machine',
      linkCheckedAt: checkedAt,
      redirectTarget,
      linkEvidence: 'GET succeeded and event identity matched.'
    };
  } catch (error) {
    return {
      ...result, linkStatus: 'unknown', linkCheckMethod: 'machine',
      linkCheckedAt: checkedAt,
      linkEvidence: 'GET failed: ' + String(error.message || error).slice(0, 160)
    };
  }
}

export function resolvePublishedLink(event, result, source = {}) {
  const trustedCanonicalEvidence = ['canonical_resolved_live', 'canonical_resolved_previous', 'curated_verified'].includes(event.linkSource);
  // A transient machine fetch failure is not evidence that a previously
  // verified first-party canonical disappeared. Keep that canonical on
  // UNKNOWN; definitive 404/410/content-mismatch still downgrade normally.
  const canonicalWorks = ['ok', 'redirected', 'blocked-machine'].includes(result.linkStatus)
    || (result.linkStatus === 'unknown' && trustedCanonicalEvidence);
  const url = canonicalWorks ? result.canonicalUrl : result.fallbackUrl;
  return {
    ...event,
    sourceId: event.sourceId || sourceIdFor(source.name ? source : { name: event.source }),
    canonicalUrl: result.canonicalUrl || '',
    sourceLandingUrl: result.fallbackUrl || '',
    fallbackUrl: result.fallbackUrl || '',
    linkStatus: result.linkStatus,
    linkCheckedAt: result.linkCheckedAt,
    linkCheckMethod: result.linkCheckMethod,
    redirectTarget: result.redirectTarget || '',
    linkEvidence: result.linkEvidence,
    linkResolution: canonicalWorks ? 'canonical' : (url ? 'fallback' : 'unavailable'),
    url: url || ''
  };
}

export function releaseBlockingLinks(events = []) {
  return events.filter(event =>
    event.linkResolution === 'unavailable'
    && ['invalid', 'not-found', 'content-mismatch'].includes(event.linkStatus)
  );
}

export async function auditLinks(events, sources, options = {}) {
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 6, 12));
  const output = new Array(events.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < events.length) {
      const index = cursor++;
      const event = events[index];
      const source = sourceForEvent(event, sources);
      const result = await checkLink(event, source, options);
      output[index] = resolvePublishedLink(event, result, source);
    }
  }));

  const counts = output.reduce((all, event) => {
    all[event.linkStatus] = (all[event.linkStatus] || 0) + 1;
    return all;
  }, {});
  return { events: output, counts };
}

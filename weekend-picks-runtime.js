(() => {
  const config = () => window.SBFF_WEEKEND_PICKS || null;

  function normalizeUrl(value) {
    try {
      const url = new URL(value);
      url.hash = '';
      url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      url.pathname = url.pathname.replace(/\/+$/, '') || '/';
      [...url.searchParams.keys()].forEach(key => {
        if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
      });
      url.searchParams.sort();
      return url.href.replace(/\/$/, '');
    } catch {
      return String(value || '').trim().replace(/\/$/, '');
    }
  }

  function urlIdentity(value) {
    try {
      const url = new URL(normalizeUrl(value));
      const identityParams = ['id', 'event', 'eventid', 'event_id', 'eid'];
      const identity = identityParams.map(key => [key, url.searchParams.get(key)]).find(([, val]) => val);
      return {
        host: url.hostname,
        path: url.pathname.replace(/\/+$/, '') || '/',
        identityKey: identity?.[0] || '',
        identityValue: identity?.[1] || ''
      };
    } catch {
      return null;
    }
  }

  function urlsMatch(left, right) {
    const a = normalizeUrl(left);
    const b = normalizeUrl(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const ai = urlIdentity(a);
    const bi = urlIdentity(b);
    if (!ai || !bi || ai.host !== bi.host) return false;
    if (ai.identityValue && bi.identityValue && ai.identityValue === bi.identityValue) return true;
    return ai.path === bi.path && !ai.identityValue && !bi.identityValue;
  }

  function eventUrls(event) {
    return [event.url, event.sourceUrl, event.officialUrl, event.link, event.detailsUrl, event.registrationUrl]
      .filter(Boolean);
  }

  function normalizeTitle(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[’‘`]/g, "'")
      .replace(/&/g, ' and ')
      .replace(/\b20\d{2}\b/g, ' ')
      .replace(/\b\d+(?:st|nd|rd|th)\s+annual\b/gi, ' ')
      .replace(/\bannual\b/gi, ' ')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
  }

  function titleCandidates(ref) {
    return [...new Set([ref.title, ...(ref.aliases || [])].filter(Boolean).map(normalizeTitle).filter(Boolean))];
  }

  function resolveEvent(ref, events) {
    if (!ref || !Array.isArray(events)) return null;
    if (ref.id) {
      const direct = events.find(event => event.id === ref.id || (event.legacyIds || []).includes(ref.id));
      if (direct) return direct;
    }
    if (ref.url) {
      const byUrl = events.find(event => eventUrls(event).some(value => urlsMatch(ref.url, value)));
      if (byUrl) return byUrl;
    }
    const names = titleCandidates(ref);
    if (!names.length) return null;
    return events.find(event => names.includes(normalizeTitle(event.title))) || null;
  }

  function dateKey(value) {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function eventOverlapsWeekend(event, weekendStart, weekendEnd) {
    if (!event) return false;
    if (event.ongoing) return true;
    const sessions = event.sessions?.length ? event.sessions : [event];
    if (sessions.some(session => {
      const day = dateKey(session.dateValue || session.startDateValue || session.date);
      return day && day >= weekendStart && day <= weekendEnd;
    })) return true;
    const start = dateKey(event.dateValue || event.startDateValue || event.date);
    const end = dateKey(event.endDateValue || event.endDate || event.dateValue || event.date);
    if (start && end) return start <= weekendEnd && end >= weekendStart;
    return false;
  }

  function currentPacificDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function dateRangeLabel(start, end) {
    if (!start) return '';
    const render = value => new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', month: 'short', day: 'numeric'
    }).format(new Date(`${value}T12:00:00Z`));
    if (!end || start === end) return render(start);
    const first = render(start);
    const last = render(end);
    const [m1, d1] = first.split(' ');
    const [m2, d2] = last.split(' ');
    return m1 === m2 ? `${m1} ${d1}–${d2}` : `${first}–${last}`;
  }

  function getWeekendPicksViewModel(events = window.SOUTH_BAY_EVENTS || []) {
    const source = config();
    if (!source) return null;
    const resolvedPicks = [];
    const unresolvedPicks = [];
    const expiredPicks = [];
    source.picks.forEach((pick, index) => {
      const event = resolveEvent(pick.eventRef, events);
      if (!event) {
        unresolvedPicks.push({ ...pick, index });
        return;
      }
      const resolved = { ...pick, event, index };
      resolvedPicks.push(resolved);
      if (!eventOverlapsWeekend(event, source.weekendStart, source.weekendEnd)) expiredPicks.push(resolved);
    });
    const validPicks = resolvedPicks.filter(pick => !expiredPicks.includes(pick));
    const today = currentPacificDate();
    let state = 'draft';
    if (source.status === 'published') {
      if (today > source.weekendEnd) state = 'ended';
      else if (!validPicks.length && source.picks.length) state = 'data_error';
      else if (validPicks.length) state = 'live';
      else state = 'coming_soon';
    }
    return {
      editionId: source.id,
      weekendStart: source.weekendStart,
      weekendEnd: source.weekendEnd,
      dateLabel: dateRangeLabel(source.weekendStart, source.weekendEnd),
      publishedAt: source.publishedAt,
      updatedAt: source.updatedAt,
      intro: source.intro,
      state,
      resolvedPicks,
      unresolvedPicks,
      expiredPicks,
      validPicks,
      pickCount: validPicks.length,
      homepageVisible: state === 'live' && validPicks.length > 0
    };
  }

  window.SBFFWeekendPicksRuntime = Object.freeze({
    normalizeUrl,
    normalizeTitle,
    urlsMatch,
    resolveEvent,
    eventOverlapsWeekend,
    currentPacificDate,
    getWeekendPicksViewModel
  });
})();

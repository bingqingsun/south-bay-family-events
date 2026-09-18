(() => {
  const collectionSlug = 'mid-autumn-festival';
  const categoryLabels = {
    sports: 'Sports & games',
    shows: 'Shows & performances',
    movies: 'Movies & screenings',
    museums: 'Museums & exhibits',
    outdoor: 'Outdoors & nature',
    arts: 'Arts & making',
    learning: 'Learning & STEM',
    play: 'Stories & play',
    community: 'Community & family',
    workshops: 'Classes & workshops'
  };
  const fallbackImageType = {
    sports: 'sports',
    shows: 'shows',
    movies: 'shows',
    museums: 'museums',
    play: 'play',
    workshops: 'workshops'
  };
  const costLabels = {
    '免费': 'Free',
    '建议捐赠': 'Suggested donation',
    '会员／非会员价格见详情': 'Member pricing available',
    '需付费／价格见详情': 'Paid admission',
    '需购票／价格见详情': 'Paid admission'
  };
  // Editorial membership is explicit. The event database supplies fresh
  // details, but a newly scraped seasonal event must not silently change the
  // guide's curated lineup.
  const selectedEventIds = [
    'curated-2ef8db4c6c34be78',
    'lahm-50332644c3a62b5d',
    'rss-6a8f6bb3aafa6100295f6779',
    'curated-261f4bd1519605e7',
    'rss-6a7fa742d4b10d0030069349',
    'civic-70e54d8492ed1a97',
    'curated-f1d6a411a90a62b1',
    'curated-3dc3446a01d92775',
    'squarespace-86e397631a011714'
  ];
  const quickPickIds = [
    'curated-2ef8db4c6c34be78',
    'lahm-50332644c3a62b5d',
    'curated-3dc3446a01d92775'
  ];
  let savedIds = JSON.parse(localStorage.getItem('southBaySaved') || '[]');

  function track(name, parameters = {}) {
    if (typeof window.trackAnalyticsEvent === 'function') {
      window.trackAnalyticsEvent(name, parameters);
    }
  }

  function isCurrent(event) {
    const endValue = event.endDateValue || event.dateValue;
    if (!endValue) return true;
    const normalized = String(endValue).includes('T') ? endValue : `${endValue}T23:59:59`;
    const endDate = new Date(normalized);
    return Number.isNaN(endDate.getTime()) || endDate.getTime() >= Date.now();
  }

  function activeSessions(event) {
    const candidates = Array.isArray(event.sessions) && event.sessions.length ? event.sessions : [event];
    const current = candidates.filter((session) => isCurrent({ ...event, ...session }));
    return current.length ? current : candidates.slice(0, 1);
  }

  function dateLabel(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!match) return null;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    const currentYear = new Date().getFullYear().toString();
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      year: match[1] === currentYear ? undefined : 'numeric'
    }).format(date);
    return `${formatted}${match[4] ? ` · ${match[4]}:${match[5]}` : ''}`;
  }

  function eventAgeFact(event) {
    let label = String(event.ageLabel || '').trim();
    if (!label && Array.isArray(event.ageRanges) && event.ageRanges.length) {
      label = event.ageRanges.map(([start, end]) => start === end ? String(start) : `${start}–${end}`).join(' · ');
    }
    if (!label) return '';
    if (label === 'Family-friendly' && !(event.ageRanges || []).length) return 'All ages';
    const grade = label.match(/^Grades?\s+(.+)$/i);
    if (grade && event.ageRanges?.length) {
      return `Ages ${event.ageRanges.map(([start, end]) => start === end ? start : `${start}–${end}`).join(' · ')}`;
    }
    if (/^all ages$/i.test(label)) return 'All ages';
    return `Ages ${label.replace(/\bAges?\s*/gi, '')}`;
  }

  function eventCostLabel(event) {
    if (!event.costLabel || event.costLabel === '费用未注明') return '';
    return costLabels[event.costLabel] || event.costLabel;
  }

  function optimizedOfficialImageUrl(value, source = '') {
    if (!value || !/^https?:\/\//i.test(value)) return value || '';
    try {
      const url = new URL(value);
      if (url.hostname.endsWith('cupertino.gov') && (url.searchParams.get('dimension') === 'smallthumbnail' || (url.searchParams.has('w') && Number(url.searchParams.get('w')) <= 100))) url.search = '';
      if (url.hostname === 'filoli.org' && /\/media\//.test(url.pathname) && url.searchParams.has('width') && Number(url.searchParams.get('width')) <= 320) url.search = '';
      if (source === 'San Jose Theaters' && /(?:^|[-_])200(?:x200)?(?:[-_.]|$)/i.test(url.pathname)) return '';
      return url.href;
    } catch {
      return value;
    }
  }

  function eventAnalytics(event, rank, entryPoint) {
    return {
      collection_slug: collectionSlug,
      collection_position: rank,
      entry_point: entryPoint,
      event_id: event.id,
      event_title: event.title,
      event_city: event.city || '',
      event_type: event.type || '',
      event_date: event.dateValue || '',
      source_name: event.source || '',
      rank,
      sort_type: 'editorial',
      activity_category: event.type || 'other',
      organizer: event.source || 'unknown'
    };
  }

  function isSaved(event) {
    return savedIds.includes(event.id) || (event.legacyIds || []).some((id) => savedIds.includes(id));
  }

  function syncSavedButtons(event) {
    const saved = isSaved(event);
    document.querySelectorAll(`.heart[data-id="${CSS.escape(event.id)}"]`).forEach((heart) => {
      heart.classList.toggle('saved', saved);
      heart.textContent = saved ? '♥' : '♡';
      heart.setAttribute('aria-pressed', String(saved));
      heart.setAttribute('aria-label', `${saved ? 'Remove saved activity' : 'Save'}: ${event.title}`);
    });
  }

  function buildCard(event, rank, entryPoint) {
    const template = document.getElementById('cardTemplate');
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.event-card');
    const sessions = activeSessions(event);
    const session = sessions[0] || event;
    const analytics = eventAnalytics(event, rank, entryPoint);
    const assetRoot = document.body.classList.contains('collection-page') ? '../../' : '';
    const fallbackType = fallbackImageType[event.type] || event.type || 'community';
    const fallbackImage = `${assetRoot}assets/fallback/${fallbackType}.png?v=20260830-1`;
    const officialImage = optimizedOfficialImageUrl(event.image, event.source);
    const imageArea = node.querySelector('.card-image');
    const setCardImage = (url) => {
      imageArea.style.backgroundImage = `linear-gradient(0deg, rgba(18, 49, 42, .08), rgba(18, 49, 42, .08)), url(${JSON.stringify(url)})`;
    };
    imageArea.style.backgroundColor = event.imageBackground || event.color || '#d8eee0';
    imageArea.classList.add('has-image');
    setCardImage(officialImage || fallbackImage);
    if (officialImage) {
      const probe = new Image();
      probe.onerror = () => setCardImage(fallbackImage);
      probe.src = officialImage;
    }

    node.querySelector('.event-icon').textContent = event.icon || '✦';
    node.querySelector('.tag').textContent = categoryLabels[event.type] || event.tag || 'Family activity';
    node.querySelector('h3').textContent = event.title;

    const facts = node.querySelector('.card-facts');
    const ageFact = node.querySelector('.fact-age');
    const ageText = event.ageSource ? eventAgeFact(event) : '';
    ageFact.textContent = ageText;
    ageFact.title = ageText ? event.ageSource : '';
    if (!ageText) ageFact.remove();

    const ratingFact = node.querySelector('.fact-rating');
    const ratingText = event.movieRating ? `Rated ${event.movieRating}` : '';
    ratingFact.textContent = ratingText;
    if (!ratingText) ratingFact.remove();

    const costFact = node.querySelector('.fact-cost');
    const costText = event.costSource ? eventCostLabel(event) : '';
    costFact.textContent = costText;
    costFact.title = costText ? [event.costSource, event.costEvidence].filter(Boolean).join(': ') : '';
    costFact.classList.toggle('is-free', /^Free$/i.test(costText));
    if (!costText) costFact.remove();

    const registrationFact = node.querySelector('.fact-registration');
    const registrationText = event.registrationStatus === 'full'
      ? 'Registration full · Check waitlist'
      : event.registrationStatus === 'required' ? 'Registration required' : '';
    registrationFact.textContent = registrationText;
    registrationFact.title = registrationText ? [event.registrationSource, event.registrationEvidence].filter(Boolean).join(': ') : '';
    if (!registrationText) registrationFact.remove();
    facts.hidden = facts.querySelectorAll('.fact').length === 0;

    const distance = node.querySelector('.distance');
    distance.hidden = true;

    const description = node.querySelector('.description');
    const descriptionToggle = node.querySelector('.description-toggle');
    description.textContent = event.description || '';
    description.hidden = !description.textContent.trim();
    description.id = `${entryPoint}-description-${event.id}`;
    descriptionToggle.dataset.eventId = event.id;
    descriptionToggle.setAttribute('aria-controls', description.id);
    descriptionToggle.setAttribute('aria-expanded', 'false');
    descriptionToggle.textContent = 'Show description';
    descriptionToggle.addEventListener('click', () => {
      const expanded = description.classList.toggle('is-expanded');
      descriptionToggle.textContent = expanded ? 'Hide description' : 'Show description';
      descriptionToggle.setAttribute('aria-expanded', String(expanded));
    });

    node.querySelector('.time .detail-text').textContent = event.ongoing ? 'On view now' : (dateLabel(session.dateValue) || session.date || 'See organizer details for the event time');
    node.querySelector('.place .detail-text').textContent = session.place || event.place || event.city || 'South Bay';

    const address = node.querySelector('.address');
    const addressLink = node.querySelector('.address-link');
    const addressText = session.address || event.address || '';
    const meetingPoint = !addressText ? String(event.meetingPoint || '').trim() : '';
    const locationText = addressText || (meetingPoint ? `Meet at: ${meetingPoint}` : '');
    address.hidden = !locationText;
    addressLink.href = event.mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText)}`;
    addressLink.querySelector('.detail-text').textContent = locationText;
    addressLink.querySelector('.directions').textContent = 'Directions';
    addressLink.setAttribute('aria-label', `Directions: ${locationText}`);
    addressLink.addEventListener('click', () => track('directions_click', {
      ...analytics,
      date_filter: 'collection',
      city_filter: event.city || 'all',
      age_filter: 'all',
      type_filter: event.type || 'all',
      sort_order: 'editorial',
      saved_only: false
    }));

    const organizerName = event.verification === 'search-verified' ? '' : String(event.source || '').trim();
    if (organizerName) {
      const organizer = document.createElement('p');
      organizer.className = 'organizer';
      organizer.textContent = `Hosted by ${organizerName}`;
      node.querySelector('.details').append(organizer);
    }

    const otherSessions = sessions.slice(1);
    const sessionToggle = node.querySelector('.sessions-inline-toggle');
    const sessionList = node.querySelector('.sessions-list');
    sessionToggle.hidden = otherSessions.length === 0;
    sessionList.id = `${entryPoint}-sessions-${event.id}`;
    sessionToggle.setAttribute('aria-controls', sessionList.id);
    sessionToggle.setAttribute('aria-expanded', 'false');
    sessionToggle.textContent = `Show ${otherSessions.length} other session${otherSessions.length === 1 ? '' : 's'}`;
    otherSessions.forEach((item) => {
      const row = document.createElement('li');
      const sessionLink = document.createElement('a');
      sessionLink.href = item.url || event.url;
      sessionLink.target = '_blank';
      sessionLink.rel = 'noopener';
      sessionLink.textContent = dateLabel(item.dateValue) || item.date || 'View session';
      row.append(sessionLink);
      sessionList.append(row);
    });
    sessionToggle.addEventListener('click', () => {
      const expanded = !sessionList.hidden;
      sessionList.hidden = expanded;
      sessionToggle.textContent = expanded ? `Show ${otherSessions.length} other session${otherSessions.length === 1 ? '' : 's'}` : 'Hide other sessions';
      sessionToggle.setAttribute('aria-expanded', String(!expanded));
    });

    const link = node.querySelector('.source-link');
    link.href = session.url || event.url;
    link.firstChild.textContent = 'View details ';
    link.addEventListener('click', () => {
      track('collection_event_click', analytics);
      if (entryPoint === 'collection-quick-pick') {
        track('collection_quick_pick_click', {
          collection_slug: collectionSlug,
          event_id: event.id,
          collection_position: rank
        });
      }
      track('view_event_details', {
        ...analytics,
        date_filter: 'collection',
        city_filter: event.city || 'all',
        age_filter: 'all',
        type_filter: event.type || 'all',
        sort_order: 'editorial',
        saved_only: false
      });
    });

    const heart = node.querySelector('.heart');
    heart.dataset.id = event.id;
    heart.addEventListener('click', () => {
      const wasSaved = isSaved(event);
      const legacyIds = event.legacyIds || [];
      savedIds = wasSaved
        ? savedIds.filter((id) => id !== event.id && !legacyIds.includes(id))
        : [...savedIds.filter((id) => !legacyIds.includes(id)), event.id];
      localStorage.setItem('southBaySaved', JSON.stringify(savedIds));
      track(wasSaved ? 'unsave_event' : 'save_event', {
        ...analytics,
        date_filter: 'collection',
        city_filter: event.city || 'all',
        age_filter: 'all',
        type_filter: event.type || 'all',
        sort_order: 'editorial',
        saved_only: false
      });
      syncSavedButtons(event);
    });

    if (entryPoint === 'collection-all-events') card.id = `event-${event.id}`;
    card.dataset.analytics = JSON.stringify(analytics);
    requestAnimationFrame(() => {
      descriptionToggle.hidden = description.hidden || description.scrollHeight <= description.clientHeight + 1;
    });
    setTimeout(() => syncSavedButtons(event), 0);
    return node;
  }

  function renderCollectionEvents() {
    const grid = document.getElementById('collectionEventGrid');
    const quickGrid = document.getElementById('quickPickGrid');
    if (!grid || !quickGrid || !document.getElementById('cardTemplate')) return;

    const databaseEvents = Array.isArray(window.SOUTH_BAY_EVENTS)
      ? window.SOUTH_BAY_EVENTS.filter((event) => isCurrent(event))
      : [];
    const byId = new Map();
    databaseEvents.forEach((event) => {
      byId.set(event.id, event);
      (event.legacyIds || []).forEach((legacyId) => byId.set(legacyId, event));
    });
    const events = selectedEventIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index)
      .sort((a, b) => String(a.dateValue).localeCompare(String(b.dateValue)));

    const empty = document.getElementById('collectionEmpty');
    if (!events.length) {
      if (empty) empty.hidden = false;
      return;
    }

    const quickEvents = quickPickIds
      .map((id) => byId.get(id))
      .filter((event) => event && isCurrent(event))
      .filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index);
    const quickIdSet = new Set(quickEvents.map((event) => event.id));
    const otherEvents = events.filter((event) => !quickIdSet.has(event.id));

    quickEvents.forEach((event, index) => quickGrid.append(buildCard(event, index + 1, 'collection-quick-pick')));
    otherEvents.forEach((event, index) => grid.append(buildCard(event, index + 1, 'collection-all-events')));

    const countNode = document.getElementById('collectionEventCount');
    const datesNode = document.getElementById('collectionDateRange');
    const citiesNode = document.getElementById('collectionCities');
    if (countNode) countNode.textContent = `${events.length} selected event${events.length === 1 ? '' : 's'}`;
    if (datesNode) {
      const dates = events.map((event) => String(event.dateValue || '').slice(0, 10)).filter(Boolean);
      if (dates.length) {
        const first = dateLabel(dates[0])?.replace(/,?\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i, '') || dates[0];
        const last = dateLabel(dates.at(-1))?.replace(/,?\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i, '') || dates.at(-1);
        datesNode.textContent = first === last ? first : `${first}–${last}`;
      }
    }
    if (citiesNode) citiesNode.textContent = [...new Set(events.map((event) => event.city).filter(Boolean))].join(' · ');

    track('collection_view', {
      collection_slug: collectionSlug,
      collection_title: '2026 South Bay Mid-Autumn Festival Guide',
      event_count: events.length
    });
  }

  function bindCollectionEntry() {
    document.querySelectorAll('[data-collection-slug]').forEach((entry, index) => {
      entry.addEventListener('click', () => {
        track('collection_card_click', {
          collection_slug: entry.dataset.collectionSlug,
          collection_position: index + 1,
          entry_point: 'homepage'
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindCollectionEntry();
    renderCollectionEvents();
  });
})();

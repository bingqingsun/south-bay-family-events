(() => {
  const runtime = window.SBFFCollectionRuntime;
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

  let savedIds = JSON.parse(localStorage.getItem('southBaySaved') || '[]');
  const seenCardImpressions = new Set();
  let cardImpressionObserver = null;

  function track(name, parameters = {}) {
    window.trackAnalyticsEvent?.(name, parameters);
  }

  function dateLabel(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!match) return null;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      year: match[1] === String(new Date().getFullYear()) ? undefined : 'numeric'
    }).format(date);
    return `${formatted}${match[4] ? ` · ${match[4]}:${match[5]}` : ''}`;
  }

  function conciseDate(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return value;
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: match[1] === String(new Date().getFullYear()) ? undefined : 'numeric'
    }).format(date);
  }

  function dateRangeLabel(range) {
    if (!range?.start) return '';
    if (!range.end || range.start === range.end) return conciseDate(range.start);
    const first = conciseDate(range.start);
    const last = conciseDate(range.end);
    const firstMonth = first.split(' ')[0];
    const lastMonth = last.split(' ')[0];
    if (firstMonth === lastMonth && !first.includes(',')) {
      return `${firstMonth} ${first.split(' ')[1]}–${last.split(' ')[1]}`;
    }
    return `${first}–${last}`;
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

  function collectionLifecycleAnalytics(viewModel) {
    return {
      collection_state: runtime.analyticsState(viewModel.collectionState),
      current_event_count: viewModel.currentEventCount,
      event_count: viewModel.currentEventCount,
      resolved_event_count: viewModel.resolvedEditorialCount,
      unresolved_ref_count: viewModel.unresolvedRefs.length
    };
  }

  function eventAnalytics(viewModel, event, rank, placement) {
    return {
      surface: 'collection',
      placement,
      collection_slug: viewModel.slug,
      collection_position: rank,
      event_id: event.id,
      event_title: event.title,
      event_city: event.city || '',
      event_type: event.type || '',
      event_date: event.dateValue || '',
      source_name: event.source || '',
      rank,
      sort_type: 'editorial',
      activity_category: event.type || 'other',
      organizer: event.source || 'unknown',
      ...collectionLifecycleAnalytics(viewModel)
    };
  }

  function collectionContextParameters(event) {
    return {
      selected_category: 'all',
      selected_date_filter: 'collection',
      selected_city: event.city || 'all',
      selected_age_band: 'any',
      search_query: '',
      saved_only: false
    };
  }

  function observeCardImpression(card) {
    if (!card || typeof IntersectionObserver !== 'function') return;
    if (!cardImpressionObserver) {
      cardImpressionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) return;
          const cardNode = entry.target;
          const key = cardNode.dataset.impressionKey;
          if (!key || seenCardImpressions.has(key)) return;
          seenCardImpressions.add(key);
          track('event_card_impression', JSON.parse(cardNode.dataset.analytics || '{}'));
          cardImpressionObserver.unobserve(cardNode);
        });
      }, { threshold: 0.5 });
    }
    cardImpressionObserver.observe(card);
  }

  function buildCard(viewModel, event, rank, placement) {
    const entryPoint = placement === 'quick_picks' ? 'collection-quick-pick' : 'collection-all-events';
    const node = window.SBFFEventCard.render({ eventId: event.id, entryPoint });
    const card = node.querySelector('.event-card');
    const sessions = viewModel.currentSessionsByEventId[event.id] || [];
    const session = sessions[0] || event;
    const analytics = eventAnalytics(viewModel, event, rank, placement);
    const fallbackType = fallbackImageType[event.type] || event.type || 'community';
    const fallbackImage = `../../assets/fallback/${fallbackType}.png?v=20260830-1`;
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

    node.querySelector('.time .detail-text').textContent = event.ongoing
      ? 'On view now'
      : (dateLabel(session.dateValue) || session.date || 'See organizer details for the event time');
    node.querySelector('.place .detail-text').textContent = session.place || event.place || event.city || 'South Bay';

    const address = node.querySelector('.address');
    const addressLink = node.querySelector('.address-link');
    const mapTarget = window.SBFFMapNavigation?.getNavigationTarget({ event, session });
    const addressText = session.address || event.address || '';
    const meetingPoint = !addressText ? String(event.meetingPoint || '').trim() : '';
    const locationText = addressText || (meetingPoint ? `Meet at: ${meetingPoint}` : (mapTarget ? (session.place || event.place || event.city || 'Map location') : ''));
    address.hidden = !locationText;
    address.querySelector('.detail-text').textContent = locationText;
    addressLink.hidden = !mapTarget;
    addressLink.querySelector('.directions').textContent = 'Directions';
    addressLink.setAttribute('aria-label', `Directions: ${locationText}`);
    addressLink.addEventListener('click', () => window.SBFFMapNavigation?.openMapPicker({
      event,
      session,
      analyticsParameters: { ...analytics, ...collectionContextParameters(event) },
      triggerElement: addressLink
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
    const resolvedLink = event.url || '';
    link.hidden = !resolvedLink;
    link.href = resolvedLink;
    link.firstChild.textContent = 'View details ';
    link.addEventListener('click', () => {
      if (!resolvedLink) return;
      track('view_event_details', {
        ...analytics,
        ...collectionContextParameters(event),
        link_resolution: event.linkResolution || 'canonical'
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
        ...collectionContextParameters(event)
      });
      syncSavedButtons(event);
    });

    if (placement === 'event_grid') card.id = `event-${event.id}`;
    card.dataset.analytics = JSON.stringify({ ...analytics, ...collectionContextParameters(event) });
    card.dataset.impressionKey = [viewModel.slug, placement, event.id].join(':');
    requestAnimationFrame(() => {
      descriptionToggle.hidden = description.hidden || description.scrollHeight <= description.clientHeight + 1;
    });
    setTimeout(() => syncSavedButtons(event), 0);
    return node;
  }

  function buildHomeCard(viewModel, position) {
    const { config } = viewModel;
    const card = document.createElement('a');
    card.className = 'collection-home-card collection-home-card-featured';
    card.href = config.landingPath;
    card.dataset.collectionSlug = config.slug;
    card.style.setProperty('--collection-cover', `url("${config.coverImage}")`);

    const overlay = document.createElement('span');
    overlay.className = 'collection-home-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const body = document.createElement('span');
    body.className = 'collection-home-content';

    const label = document.createElement('span');
    label.className = 'collection-home-label';
    label.textContent = viewModel.collectionState === runtime.STATES.LAST_CHANCE
      ? (config.homeLabelLastChance || 'Last chance')
      : (config.homeLabelActive || 'Featured guide');

    const title = document.createElement('strong');
    title.textContent = config.title;

    const description = document.createElement('span');
    description.className = 'collection-home-description';
    description.textContent = config.homeDescription || '';

    const tags = document.createElement('span');
    tags.className = 'collection-home-tags';
    (config.homeTags || []).forEach((tagText) => {
      const tag = document.createElement('span');
      tag.textContent = tagText;
      tags.append(tag);
    });

    const cta = document.createElement('span');
    cta.className = 'collection-home-cta';
    cta.append(document.createTextNode(`${config.homeCta || 'Explore the guide'} `));
    const arrow = document.createElement('b');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    cta.append(arrow);

    body.append(label, title, description, tags, cta);
    card.append(overlay, body);
    card.addEventListener('click', () => {
      track('collection_card_click', {
        collection_slug: viewModel.slug,
        collection_position: position,
        entry_point: 'homepage',
        ...collectionLifecycleAnalytics(viewModel)
      });
    });
    return card;
  }

  function renderCollectionHome() {
    const section = document.querySelector('.collection-home');
    const strip = document.getElementById('collectionStrip');
    if (!section || !strip || !runtime) return;

    const viewModels = (window.SBFF_COLLECTIONS || [])
      .map((config) => runtime.getCollectionViewModel(config.slug))
      .filter(Boolean)
      .filter((viewModel) => [runtime.STATES.FEATURED, runtime.STATES.LAST_CHANCE].includes(viewModel.collectionState));

    strip.innerHTML = '';
    viewModels.forEach((viewModel, index) => strip.append(buildHomeCard(viewModel, index + 1)));
    section.hidden = viewModels.length === 0;
  }

  function setLandingStatePanel({ title, body, cta = 'Explore current family activities' }) {
    const panel = document.getElementById('collectionStatePanel');
    if (!panel) return;
    panel.hidden = false;
    document.getElementById('collectionStateTitle').textContent = title;
    document.getElementById('collectionStateBody').textContent = body;
    document.getElementById('collectionStateCta').textContent = cta;
  }

  function hideLandingActivitySections() {
    document.getElementById('quickPicksSection')?.setAttribute('hidden', '');
    document.getElementById('allEventsSection')?.setAttribute('hidden', '');
  }

  function updateFestivalExploreLink(viewModel) {
    const link = document.getElementById('festivalExploreLink');
    if (!link) return;
    if ([runtime.STATES.ENDED, runtime.STATES.DATA_ERROR, runtime.STATES.DRAFT].includes(viewModel.collectionState)) {
      link.href = '../../#events';
      link.firstChild.textContent = 'Explore current family activities ';
      return;
    }
    const target = viewModel.currentQuickPicks.length ? '#quickPicksHeading' : '#allEventsHeading';
    link.href = target;
    link.firstChild.textContent = 'Find a celebration near you ';
  }

  function renderCollectionLanding() {
    const page = document.querySelector('.collection-page');
    if (!page || !runtime) return;
    const slug = page.dataset.collectionSlug;
    const viewModel = runtime.getCollectionViewModel(slug);
    const config = viewModel?.config;

    if (!viewModel || !config) {
      hideLandingActivitySections();
      setLandingStatePanel({
        title: 'This guide is temporarily unavailable',
        body: 'We are refreshing this guide. Explore current South Bay family activities in the meantime.'
      });
      return;
    }

    if (viewModel.dataIncomplete) {
      console.warn('[SBFF collection] unresolved editorial refs', slug, viewModel.unresolvedRefs);
    }

    const hero = document.getElementById('collectionHero');
    if (hero) hero.style.setProperty('--collection-cover', `url("../../${config.coverImage}")`);
    document.getElementById('collectionHeroTitle').textContent = config.landingTitle || config.title;
    document.getElementById('collectionHeroDescription').textContent = config.landingDescription || config.homeDescription || '';

    const eyebrow = document.getElementById('collectionHeroEyebrow');
    const heroMeta = document.getElementById('collectionHeroMeta');
    const quickSection = document.getElementById('quickPicksSection');
    const allSection = document.getElementById('allEventsSection');
    const quickGrid = document.getElementById('quickPickGrid');
    const allGrid = document.getElementById('collectionEventGrid');
    const statePanel = document.getElementById('collectionStatePanel');

    statePanel.hidden = true;
    quickGrid.innerHTML = '';
    allGrid.innerHTML = '';

    if ([runtime.STATES.FEATURED, runtime.STATES.LAST_CHANCE].includes(viewModel.collectionState)) {
      eyebrow.textContent = `${config.year} FAMILY GUIDE`;
      heroMeta.hidden = false;
      document.getElementById('collectionEventCount').textContent = `${viewModel.currentEventCount} upcoming celebration${viewModel.currentEventCount === 1 ? '' : 's'}`;
      document.getElementById('collectionDateRange').textContent = dateRangeLabel(viewModel.currentDateRange);
      const cities = viewModel.currentCities.join(' · ');
      const cityNode = document.getElementById('collectionCities');
      cityNode.textContent = cities;
      cityNode.hidden = !cities;

      const quickIds = new Set(viewModel.currentQuickPicks.map((event) => event.id));
      const otherEvents = viewModel.currentEvents.filter((event) => !quickIds.has(event.id));

      quickSection.hidden = viewModel.currentQuickPicks.length === 0;
      allSection.hidden = otherEvents.length === 0;

      viewModel.currentQuickPicks.forEach((event, index) => {
        const node = buildCard(viewModel, event, index + 1, 'quick_picks');
        quickGrid.append(node);
        observeCardImpression(node.querySelector('.event-card'));
      });
      otherEvents.forEach((event, index) => {
        const node = buildCard(viewModel, event, index + 1, 'event_grid');
        allGrid.append(node);
        observeCardImpression(node.querySelector('.event-card'));
      });
    } else if (viewModel.collectionState === runtime.STATES.ENDED) {
      eyebrow.textContent = config.archiveEyebrow || `${config.year} SEASON ENDED`;
      heroMeta.hidden = true;
      hideLandingActivitySections();
      setLandingStatePanel({
        title: config.archiveTitle || 'This season has ended',
        body: config.archiveDescription || 'These events have passed, but there are plenty of family activities happening across the South Bay.'
      });
    } else {
      eyebrow.textContent = config.unavailableEyebrow || 'GUIDE TEMPORARILY UNAVAILABLE';
      heroMeta.hidden = true;
      hideLandingActivitySections();
      setLandingStatePanel({
        title: config.unavailableTitle || 'This guide is temporarily unavailable',
        body: config.unavailableDescription || 'We are refreshing the event details for this guide. Explore current South Bay family activities in the meantime.'
      });
    }

    updateFestivalExploreLink(viewModel);
    track('collection_view', {
      collection_slug: slug,
      collection_title: config.title,
      ...collectionLifecycleAnalytics(viewModel)
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderCollectionHome();
    renderCollectionLanding();
  });
})();

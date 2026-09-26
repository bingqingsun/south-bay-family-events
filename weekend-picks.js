(() => {
  const runtime = window.SBFFWeekendPicksRuntime;
  if (!runtime) return;
  const isLanding = document.body.classList.contains('weekend-picks-page');
  const assetBase = String(window.SBFF_ASSET_BASE || (isLanding ? '..' : '.')).replace(/\/$/, '');
  const track = (name, parameters = {}) => window.trackAnalyticsEvent?.(name, parameters);
  const fallbackType = { movies: 'shows', play: 'play', workshops: 'workshops', sports: 'sports', shows: 'shows', museums: 'museums' };
  const categoryLabels = { sports:'Sports & games', shows:'Shows & performances', movies:'Movies & screenings', museums:'Museums & exhibits', outdoor:'Outdoors & nature', arts:'Arts & making', learning:'Learning & STEM', play:'Stories & play', community:'Community & family', workshops:'Classes & workshops' };
  const costLabels = { '免费':'Free', '建议捐赠':'Suggested donation', '会员／非会员价格见详情':'Member pricing available', '需付费／价格见详情':'Paid admission', '需购票／价格见详情':'Paid admission' };

  function fallbackImage(event) {
    return `${assetBase}/assets/fallback/${fallbackType[event.type] || event.type || 'community'}.png?v=20260830-1`;
  }
  function officialImage(event) {
    if (!event.image || !/^https?:\/\//i.test(event.image)) return '';
    try {
      const url = new URL(event.image);
      if (url.hostname.endsWith('cupertino.gov') && (url.searchParams.get('dimension') === 'smallthumbnail' || Number(url.searchParams.get('w')) <= 100)) url.search = '';
      if (url.hostname === 'filoli.org' && /\/media\//.test(url.pathname) && Number(url.searchParams.get('width')) <= 320) url.search = '';
      return url.href;
    } catch { return event.image; }
  }
  function pickSession(event, vm) {
    const sessions = event.sessions?.length ? event.sessions : [event];
    return sessions.find(session => {
      const match = String(session.dateValue || session.startDateValue || session.date || '').match(/^(\d{4}-\d{2}-\d{2})/);
      return match && match[1] >= vm.weekendStart && match[1] <= vm.weekendEnd;
    }) || sessions[0] || event;
  }
  function formatDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!match) return String(value || 'See organizer details for the event time');
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    const label = new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(date);
    return match[4] ? `${label} · ${match[4]}:${match[5]}` : label;
  }
  function eventUrl(event, pick) {
    return pick?.eventRef?.url || event.officialUrl || event.sourceUrl || event.url || event.link || '';
  }
  function savedIds() {
    try { return JSON.parse(localStorage.getItem('southBaySaved') || '[]'); } catch { return []; }
  }
  function setSavedIds(ids) { localStorage.setItem('southBaySaved', JSON.stringify([...new Set(ids)])); }

  function buildCard(vm, pick, position) {
    const event = pick.event;
    const session = pickSession(event, vm);
    const node = window.SBFFEventCard.render({ eventId:event.id, entryPoint:'weekend-picks' });
    const card = node.querySelector('.event-card');
    const analytics = { surface:'weekend_picks', placement:'pick_grid', edition_id:vm.editionId, pick_position:position, editorial_label:pick.label, event_id:event.id, event_title:event.title, event_city:event.city || '', event_type:event.type || '' };
    card.dataset.analytics = JSON.stringify(analytics);

    const imageArea = node.querySelector('.card-image');
    const image = officialImage(event) || fallbackImage(event);
    imageArea.classList.add('has-image');
    imageArea.style.backgroundColor = event.imageBackground || event.color || '#d8eee0';
    imageArea.style.backgroundImage = `linear-gradient(0deg, rgba(18,49,42,.08), rgba(18,49,42,.08)), url(${JSON.stringify(image)})`;
    node.querySelector('.event-icon').textContent = event.icon || '✦';
    node.querySelector('.tag').textContent = categoryLabels[event.type] || event.tag || 'Family activity';
    node.querySelector('h3').textContent = event.title;

    const label = document.createElement('span');
    label.className = 'weekend-pick-label';
    label.textContent = pick.label || 'Family Finds Pick';
    node.querySelector('.card-content').insertBefore(label, node.querySelector('h3'));

    const facts = node.querySelector('.card-facts');
    const ageFact = node.querySelector('.fact-age');
    const ageText = event.ageSource && window.SBFFAgePolicy ? window.SBFFAgePolicy.displayLabel(event) : '';
    ageFact.textContent = ageText || '';
    if (!ageText) ageFact.remove();
    const ratingFact = node.querySelector('.fact-rating');
    if (event.movieRating) ratingFact.textContent = `Rated ${event.movieRating}`; else ratingFact.remove();
    const costFact = node.querySelector('.fact-cost');
    const costText = event.costSource ? (costLabels[event.costLabel] || event.costLabel || '') : '';
    costFact.textContent = costText;
    costFact.classList.toggle('is-free', /^Free$/i.test(costText));
    if (!costText) costFact.remove();
    const registrationFact = node.querySelector('.fact-registration');
    const registrationText = event.registrationStatus === 'full' ? 'Registration full · Check waitlist' : event.registrationStatus === 'required' ? 'Registration required' : '';
    registrationFact.textContent = registrationText;
    if (!registrationText) registrationFact.remove();
    facts.hidden = facts.querySelectorAll('.fact').length === 0;

    const editorial = document.createElement('div');
    editorial.className = 'weekend-editorial';
    editorial.innerHTML = '<strong>Why we picked it</strong>';
    const editorialText = document.createElement('p');
    editorialText.textContent = pick.whyWePicked || '';
    editorial.append(editorialText);
    facts.after(editorial);

    const description = node.querySelector('.description');
    description.textContent = event.description || '';
    description.hidden = !description.textContent.trim();
    node.querySelector('.description-toggle').remove();
    node.querySelector('.distance').remove();
    node.querySelector('.time .detail-text').textContent = event.ongoing ? 'On view now' : formatDate(session.dateValue || event.dateValue || session.date || event.date);
    node.querySelector('.place .detail-text').textContent = session.place || event.place || event.city || 'South Bay';

    const location = node.querySelector('.address');
    const address = session.address || event.address || '';
    const mapTarget = window.SBFFMapNavigation?.getNavigationTarget({ event, session });
    location.hidden = !address && !mapTarget;
    location.querySelector('.detail-text').textContent = address || session.place || event.place || event.city || '';
    const directions = node.querySelector('.address-link');
    directions.hidden = !mapTarget;
    directions.querySelector('.directions').textContent = 'Directions';
    directions.addEventListener('click', () => window.SBFFMapNavigation?.openMapPicker({ event, session, analyticsParameters:analytics, triggerElement:directions }));

    const source = node.querySelector('.source-link');
    source.textContent = 'View activity details →';
    const href = eventUrl(event, pick);
    source.href = href;
    source.addEventListener('click', () => track('view_event_details', analytics));

    const heart = node.querySelector('.heart');
    const ids = savedIds();
    const initiallySaved = ids.includes(event.id) || (event.legacyIds || []).some(id => ids.includes(id));
    heart.dataset.id = event.id;
    heart.classList.toggle('saved', initiallySaved);
    heart.textContent = initiallySaved ? '♥' : '♡';
    heart.setAttribute('aria-pressed', String(initiallySaved));
    heart.addEventListener('click', () => {
      const current = savedIds();
      const aliases = event.legacyIds || [];
      const isSaved = current.includes(event.id) || aliases.some(id => current.includes(id));
      const next = isSaved ? current.filter(id => id !== event.id && !aliases.includes(id)) : [...current.filter(id => !aliases.includes(id)), event.id];
      setSavedIds(next);
      heart.classList.toggle('saved', !isSaved);
      heart.textContent = !isSaved ? '♥' : '♡';
      heart.setAttribute('aria-pressed', String(!isSaved));
      track(!isSaved ? 'save_event' : 'unsave_event', analytics);
    });
    return node;
  }

  function renderHomepage(events) {
    const host = document.querySelector('#weekendPicksEntry');
    if (!host) return;
    const vm = runtime.getWeekendPicksViewModel(events);
    if (!vm?.homepageVisible) { host.hidden = true; return; }
    host.hidden = false;
    host.replaceChildren();
    const link = document.createElement('a');
    link.className = 'weekend-picks-entry-card';
    link.href = 'weekend-picks/';
    const copy = document.createElement('div');
    copy.className = 'weekend-picks-entry-copy';
    copy.innerHTML = `<p class="eyebrow">THIS WEEKEND</p><h2>This Weekend’s Family Finds</h2><p class="weekend-picks-entry-date">${vm.dateLabel}</p><p>A few South Bay family activities we’d genuinely recommend this weekend.</p><span class="weekend-picks-entry-cta">See this weekend’s picks →</span>`;
    const collage = document.createElement('div');
    collage.className = 'weekend-picks-collage';
    vm.validPicks.slice(0,3).forEach(pick => {
      const tile = document.createElement('span');
      tile.style.backgroundImage = `url(${JSON.stringify(officialImage(pick.event) || fallbackImage(pick.event))})`;
      collage.append(tile);
    });
    link.append(copy, collage);
    link.addEventListener('click', () => track('weekend_picks_card_click', { edition_id:vm.editionId, weekend_start:vm.weekendStart, weekend_end:vm.weekendEnd, pick_count:vm.pickCount, entry_point:'homepage' }));
    host.append(link);
  }

  function renderLanding(events) {
    const grid = document.querySelector('#weekendPicksGrid');
    const status = document.querySelector('#weekendPicksStatus');
    if (!grid || !status) return;
    const vm = runtime.getWeekendPicksViewModel(events);
    const title = document.querySelector('#weekendPicksTitle');
    const date = document.querySelector('#weekendPicksDate');
    const count = document.querySelector('#weekendPicksCount');
    const updated = document.querySelector('#weekendPicksUpdated');
    const intro = document.querySelector('#weekendPicksIntro');
    if (title) title.textContent = `Family Finds for ${vm?.dateLabel || 'this weekend'}`;
    if (date) date.textContent = vm?.dateLabel || '';
    if (count) count.textContent = `${vm?.pickCount || 0} picks`;
    if (updated) updated.textContent = `Updated ${new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'America/Los_Angeles'}).format(new Date(vm?.updatedAt || Date.now()))}`;
    if (intro && vm?.intro) intro.textContent = vm.intro;
    grid.replaceChildren();
    status.replaceChildren();
    if (!vm || vm.state === 'data_error') {
      status.hidden = false;
      status.innerHTML = '<div class="weekend-picks-status-card"><h2>Weekend Picks are temporarily unavailable.</h2><p>We could not resolve the current edition against the verified event feed. Please explore upcoming activities instead.</p><a href="../#events">Explore upcoming activities →</a></div>';
      return;
    }
    if (vm.state === 'ended') {
      status.hidden = false;
      status.innerHTML = '<div class="weekend-picks-status-card"><h2>This weekend’s picks have wrapped up.</h2><p>We’re putting together the next set of Family Finds. In the meantime, explore upcoming South Bay family activities.</p><a href="../#events">Explore upcoming activities →</a></div>';
      return;
    }
    if (vm.state !== 'live') {
      status.hidden = false;
      status.innerHTML = '<div class="weekend-picks-status-card"><h2>Next Weekend Picks are coming soon.</h2><p>Explore the full activity guide while we prepare the next edition.</p><a href="../#events">Explore activities →</a></div>';
      return;
    }
    status.hidden = true;
    vm.validPicks.forEach((pick,index) => grid.append(buildCard(vm,pick,index + 1)));
    track('weekend_picks_view', { edition_id:vm.editionId, pick_count:vm.pickCount, weekend_start:vm.weekendStart, weekend_end:vm.weekendEnd });
  }

  function loadLandingFeed() {
    fetch(`${assetBase}/data/events.json`).then(response => {
      if (!response.ok) throw new Error(`Unable to load events.json: ${response.status}`);
      return response.json();
    }).then(events => renderLanding(events)).catch(error => {
      console.error('Weekend Picks event feed failed to load.', error);
      renderLanding([]);
    });
  }

  if (isLanding) loadLandingFeed();
  else if (Array.isArray(window.SOUTH_BAY_EVENTS) && window.SOUTH_BAY_EVENTS.length) renderHomepage(window.SOUTH_BAY_EVENTS);
  else window.addEventListener('sbff:events-ready', () => renderHomepage(window.SOUTH_BAY_EVENTS || []), { once:true });
})();

(() => {
  const runtime = window.SBFFWeekendPicksRuntime;
  if (!runtime) return;
  const isLanding = document.body.classList.contains('weekend-picks-page');
  const assetBase = String(window.SBFF_ASSET_BASE || (isLanding ? '..' : '.')).replace(/\/$/, '');
  const locale = window.SBFF_LOCALE === 'zh' ? 'zh' : 'en';
  const isZh = locale === 'zh';
  const translations = window.SBFF_TRANSLATIONS_ZH || {};
  const track = (name, parameters = {}) => window.trackAnalyticsEvent?.(name, parameters);
  const fallbackType = { movies: 'shows', play: 'play', workshops: 'workshops', sports: 'sports', shows: 'shows', museums: 'museums' };
  const categoryLabels = isZh
    ? { sports:'运动与游戏', shows:'演出与表演', movies:'电影与放映', museums:'博物馆与展览', outdoor:'户外与自然', arts:'艺术与创作', learning:'学习与 STEM', play:'故事与游戏', community:'社区与家庭', workshops:'课程与工作坊' }
    : { sports:'Sports & games', shows:'Shows & performances', movies:'Movies & screenings', museums:'Museums & exhibits', outdoor:'Outdoors & nature', arts:'Arts & making', learning:'Learning & STEM', play:'Stories & play', community:'Community & family', workshops:'Classes & workshops' };
  const costLabels = isZh
    ? { '免费':'免费', '建议捐赠':'建议捐赠', '会员／非会员价格见详情':'会员价格见详情', '需付费／价格见详情':'需付费', '需购票／价格见详情':'需购票' }
    : { '免费':'Free', '建议捐赠':'Suggested donation', '会员／非会员价格见详情':'Member pricing available', '需付费／价格见详情':'Paid admission', '需购票／价格见详情':'Paid admission' };

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
  function localizedEvent(event) {
    if (!isZh) return { title:event.title, description:event.description || '' };
    const translated = translations[event.id];
    const zhTitle = translated?.status === 'approved' ? translated.title : '';
    const zhDescription = translated?.status === 'approved' ? translated.description : '';
    return {
      title: zhTitle && zhTitle !== event.title ? `${zhTitle}（${event.title}）` : event.title,
      description: zhDescription || event.description || ''
    };
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
    if (!match) return String(value || (isZh ? '活动时间请查看主办方页面' : 'See organizer details for the event time'));
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
    const label = new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US',{timeZone:'UTC',weekday:'short',month:isZh ? 'numeric' : 'short',day:'numeric'}).format(date);
    return match[4] ? `${label} · ${match[4]}:${match[5]}` : label;
  }
  function eventUrl(event, pick) {
    return pick?.eventRef?.url || event.officialUrl || event.sourceUrl || event.url || event.link || '';
  }
  function savedIds() {
    try { return JSON.parse(localStorage.getItem('southBaySaved') || '[]'); } catch { return []; }
  }
  function setSavedIds(ids) { localStorage.setItem('southBaySaved', JSON.stringify([...new Set(ids)])); }
  function updateSavedBadge() {
    const count = savedIds().length;
    document.querySelectorAll('.collection-saved-count').forEach(node => { node.textContent = String(count); });
  }

  function buildCard(vm, pick, position) {
    const event = pick.event;
    const localized = localizedEvent(event);
    const session = pickSession(event, vm);
    const node = window.SBFFEventCard.render({ eventId:event.id, entryPoint:'weekend-picks' });
    const card = node.querySelector('.event-card');
    const editorialLabel = isZh ? (pick.labelZh || pick.label) : pick.label;
    const analytics = { surface:'weekend_picks', placement:'pick_grid', edition_id:vm.editionId, pick_position:position, editorial_label:pick.label, event_id:event.id, event_title:event.title, event_city:event.city || '', event_type:event.type || '' };
    card.dataset.analytics = JSON.stringify(analytics);

    const imageArea = node.querySelector('.card-image');
    const image = officialImage(event) || fallbackImage(event);
    imageArea.classList.add('has-image');
    imageArea.style.backgroundColor = event.imageBackground || event.color || '#d8eee0';
    imageArea.style.backgroundImage = `linear-gradient(0deg, rgba(18,49,42,.08), rgba(18,49,42,.08)), url(${JSON.stringify(image)})`;
    node.querySelector('.event-icon').textContent = event.icon || '✦';
    node.querySelector('.tag').textContent = categoryLabels[event.type] || event.tag || (isZh ? '亲子活动' : 'Family activity');
    node.querySelector('h3').textContent = localized.title;

    const label = document.createElement('span');
    label.className = 'weekend-pick-label';
    label.textContent = editorialLabel || (isZh ? 'Family Finds 精选' : 'Family Finds Pick');
    node.querySelector('.card-content').insertBefore(label, node.querySelector('h3'));

    const facts = node.querySelector('.card-facts');
    const ageFact = node.querySelector('.fact-age');
    const ageText = event.ageSource && window.SBFFAgePolicy ? window.SBFFAgePolicy.displayLabel(event) : '';
    ageFact.textContent = ageText || '';
    if (!ageText) ageFact.remove();
    const ratingFact = node.querySelector('.fact-rating');
    if (event.movieRating) ratingFact.textContent = isZh ? `评级 ${event.movieRating}` : `Rated ${event.movieRating}`; else ratingFact.remove();
    const costFact = node.querySelector('.fact-cost');
    const costText = event.costSource ? (costLabels[event.costLabel] || event.costLabel || '') : '';
    costFact.textContent = costText;
    costFact.classList.toggle('is-free', /^(Free|免费)$/i.test(costText));
    if (!costText) costFact.remove();
    const registrationFact = node.querySelector('.fact-registration');
    const registrationText = event.registrationStatus === 'full' ? (isZh ? '报名已满 · 可查看候补' : 'Registration full · Check waitlist') : event.registrationStatus === 'required' ? (isZh ? '需要报名' : 'Registration required') : '';
    registrationFact.textContent = registrationText;
    if (!registrationText) registrationFact.remove();
    facts.hidden = facts.querySelectorAll('.fact').length === 0;

    const editorial = document.createElement('div');
    editorial.className = 'weekend-editorial';
    editorial.innerHTML = `<strong>${isZh ? '为什么推荐' : 'Why we picked it'}</strong>`;
    const editorialText = document.createElement('p');
    editorialText.textContent = isZh ? (pick.whyWePickedZh || pick.whyWePicked || '') : (pick.whyWePicked || '');
    editorial.append(editorialText);
    facts.after(editorial);

    const description = node.querySelector('.description');
    description.textContent = localized.description;
    description.hidden = !description.textContent.trim();
    node.querySelector('.description-toggle')?.remove();
    node.querySelector('.distance')?.remove();
    node.querySelector('.time .detail-text').textContent = event.ongoing ? (isZh ? '正在展出' : 'On view now') : formatDate(session.dateValue || event.dateValue || session.date || event.date);
    node.querySelector('.place .detail-text').textContent = session.place || event.place || event.city || (isZh ? '南湾' : 'South Bay');

    const location = node.querySelector('.address');
    const address = session.address || event.address || '';
    const mapTarget = window.SBFFMapNavigation?.getNavigationTarget({ event, session });
    location.hidden = !address && !mapTarget;
    location.querySelector('.detail-text').textContent = address || session.place || event.place || event.city || '';
    const directions = node.querySelector('.address-link');
    directions.hidden = !mapTarget;
    directions.querySelector('.directions').textContent = isZh ? '导航' : 'Directions';
    directions.addEventListener('click', () => window.SBFFMapNavigation?.openMapPicker({ event, session, analyticsParameters:analytics, triggerElement:directions }));

    const source = node.querySelector('.source-link');
    source.textContent = isZh ? '查看活动详情 →' : 'View activity details →';
    source.href = eventUrl(event, pick);
    source.addEventListener('click', () => track('view_event_details', analytics));

    const heart = node.querySelector('.heart');
    const ids = savedIds();
    const initiallySaved = ids.includes(event.id) || (event.legacyIds || []).some(id => ids.includes(id));
    heart.dataset.id = event.id;
    heart.classList.toggle('saved', initiallySaved);
    heart.textContent = initiallySaved ? '♥' : '♡';
    heart.setAttribute('aria-pressed', String(initiallySaved));
    heart.setAttribute('aria-label', initiallySaved ? (isZh ? '取消收藏' : 'Remove from saved') : (isZh ? '收藏活动' : 'Save activity'));
    heart.addEventListener('click', () => {
      const current = savedIds();
      const aliases = event.legacyIds || [];
      const isSaved = current.includes(event.id) || aliases.some(id => current.includes(id));
      const next = isSaved ? current.filter(id => id !== event.id && !aliases.includes(id)) : [...current.filter(id => !aliases.includes(id)), event.id];
      setSavedIds(next);
      heart.classList.toggle('saved', !isSaved);
      heart.textContent = !isSaved ? '♥' : '♡';
      heart.setAttribute('aria-pressed', String(!isSaved));
      heart.setAttribute('aria-label', !isSaved ? (isZh ? '取消收藏' : 'Remove from saved') : (isZh ? '收藏活动' : 'Save activity'));
      updateSavedBadge();
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
    link.href = isZh ? 'zh/weekend-picks/' : 'weekend-picks/';
    const copy = document.createElement('div');
    copy.className = 'weekend-picks-entry-copy';
    copy.innerHTML = isZh
      ? `<p class="eyebrow">本周末</p><h2>本周末 Family Finds</h2><p class="weekend-picks-entry-date">${vm.dateLabel}</p><p>我们本周真正想推荐给南湾家庭的几场活动。</p><span class="weekend-picks-entry-cta">查看本周精选 →</span>`
      : `<p class="eyebrow">THIS WEEKEND</p><h2>This Weekend’s Family Finds</h2><p class="weekend-picks-entry-date">${vm.dateLabel}</p><p>A few South Bay family activities we’d genuinely recommend this weekend.</p><span class="weekend-picks-entry-cta">See this weekend’s picks →</span>`;
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
    const picksSection = document.querySelector('#weekendPicksSection');
    if (!grid || !status) return;
    const vm = runtime.getWeekendPicksViewModel(events);
    const title = document.querySelector('#weekendPicksTitle');
    const date = document.querySelector('#weekendPicksDate');
    const count = document.querySelector('#weekendPicksCount');
    const updated = document.querySelector('#weekendPicksUpdated');
    const intro = document.querySelector('#weekendPicksIntro');
    if (title) title.textContent = isZh ? `本周末亲子活动精选 · ${vm?.dateLabel || ''}` : `Family Finds for ${vm?.dateLabel || 'this weekend'}`;
    if (date) date.textContent = vm?.dateLabel || '';
    if (count) count.textContent = isZh ? `${vm?.pickCount || 0} 个精选` : `${vm?.pickCount || 0} picks`;
    if (updated) updated.textContent = `${isZh ? '更新于' : 'Updated'} ${new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US',{month:isZh ? 'numeric' : 'short',day:'numeric',timeZone:'America/Los_Angeles'}).format(new Date(vm?.updatedAt || Date.now()))}`;
    if (intro) intro.textContent = isZh ? (window.SBFF_WEEKEND_PICKS?.introZh || vm?.intro || intro.textContent) : (vm?.intro || intro.textContent);
    grid.replaceChildren();
    status.replaceChildren();
    if (!vm || vm.state === 'data_error') {
      status.hidden = false;
      if (picksSection) picksSection.hidden = true;
      status.innerHTML = isZh
        ? '<h2>周末精选暂时无法显示</h2><p>当前精选活动暂时无法与已核验的活动数据匹配，请先浏览其他近期活动。</p><a href="../../#events">浏览近期活动 →</a>'
        : '<h2>Weekend Picks are temporarily unavailable.</h2><p>We could not resolve the current edition against the verified event feed. Please explore upcoming activities instead.</p><a href="../#events">Explore upcoming activities →</a>';
      return;
    }
    if (vm.state === 'ended') {
      status.hidden = false;
      if (picksSection) picksSection.hidden = true;
      status.innerHTML = isZh
        ? '<h2>本周末精选已经结束</h2><p>下一期 Family Finds 正在准备中，你可以先浏览南湾近期亲子活动。</p><a href="../../#events">浏览近期活动 →</a>'
        : '<h2>This weekend’s picks have wrapped up.</h2><p>We’re putting together the next set of Family Finds. In the meantime, explore upcoming South Bay family activities.</p><a href="../#events">Explore upcoming activities →</a>';
      return;
    }
    if (vm.state !== 'live') {
      status.hidden = false;
      if (picksSection) picksSection.hidden = true;
      status.innerHTML = isZh
        ? '<h2>下一期周末精选即将上线</h2><p>在我们准备下一期精选时，可以先浏览完整活动指南。</p><a href="../../#events">浏览活动 →</a>'
        : '<h2>Next Weekend Picks are coming soon.</h2><p>Explore the full activity guide while we prepare the next edition.</p><a href="../#events">Explore activities →</a>';
      return;
    }
    status.hidden = true;
    if (picksSection) picksSection.hidden = false;
    vm.validPicks.forEach((pick,index) => grid.append(buildCard(vm,pick,index + 1)));
    updateSavedBadge();
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

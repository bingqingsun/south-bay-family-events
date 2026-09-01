let events = Array.isArray(window.SOUTH_BAY_EVENTS) ? window.SOUTH_BAY_EVENTS : [];
// Kept as a single switch so bilingual presentation can be restored later
// without changing the canonical, organizer-supplied event data.
const translationEnabled = false;
const state = { type: 'all', age: 'all', city: 'all', date: 'all', sort: 'date', position: null, locationRequested: false, locationPending: false, locationFailed: false, saved: JSON.parse(localStorage.getItem('southBaySaved') || '[]'), onlySaved: false, language: 'en' };
const grid = document.querySelector('#eventGrid');
const template = document.querySelector('#cardTemplate');
const track = (name, parameters = {}) => window.trackAnalyticsEvent?.(name, parameters);
const analyticsAgeBand = age => {
  const value = Number(age);
  if (!Number.isInteger(value)) return 'any';
  if (value <= 2) return '0-2';
  if (value <= 5) return '3-5';
  if (value <= 11) return '6-11';
  if (value <= 14) return '12-14';
  return '15-18';
};

const copy = {
  zh: {
    brand: '南湾家庭计划', findEvents: '找活动', howItWorks: '出发小提示', heroTitle: '发现值得全家一起参与的<br /><em>南湾活动。</em>', heroIntro: '为南湾从幼儿到青少年的孩子与家庭精选活动：从亲子故事会、自然探索到创意工坊和科学体验，帮你轻松发现适合全家一起出发的好去处。', weekendCta: '查看本周末活动', sectionTitle: '今天想做点什么？', date: '日期', anyTime: '任意时间', today: '今天', weekend: '本周末', month: '本月', sort: '排序', sortDate: '按时间', sortDistance: '离我最近', locating: '正在确认你的位置…', nearbyReady: '已按离你最近排序；距离为直线估算。', locationUnavailable: '未能取得你的位置，已按时间排序。你可以在浏览器中允许定位后再试。', distance: miles => `距你约 ${miles} 英里`, city: '城市', allCities: '全部城市', age: '孩子年龄', anyChildAge: '不限年龄', ageValue: age => `${age} 岁`, family: '全家适合', all: '全部活动', sports: '体育与比赛', shows: '演出与表演', museums: '博物馆与展览', outdoor: '户外自然', arts: '艺术与创作', learning: '学习与 STEM', play: '故事与玩乐', community: '社区与家庭', workshops: '课程与工作坊', onViewNow: '正在展出', clearFilters: '清除筛选',
    tipsEyebrow: '出发前看看', howTitle: '周末出发小提示', how1Title: '出门前确认', how1Body: '活动时间、名额和费用可能变化；出发前请查看主办方页面。', how2Title: '提前安排', how2Body: '热门活动建议先预约；户外活动留意天气、停车和步行距离。', how3Title: '先收藏，再决定', how3Body: '点击心形收藏感兴趣的活动，周末可在“已收藏”中集中查看。', footer: '为南湾的好奇心而做 · 活动信息请以主办方页面为准',
    saved: '已收藏', results: count => `发现 ${count} 个活动`, savedResults: count => `已收藏 ${count} 个活动`, emptyFiltered: '当前筛选条件下暂无活动。试试放宽日期、年龄或类别。', emptyAll: '暂时没有已核验的活动，请稍后再试。', updateUnavailable: '最近更新信息暂不可用 · 来自官方活动来源', update: date => `最近更新：${date}（南湾时间）· 官方来源`, ageFact: label => label, costFact: label => `费用：${label}`, ageUnknown: '年龄未注明', costUnknown: '费用未注明', viewDetails: '查看活动详情', hostedBy: source => `主办方：${source}`, directions: '导航', expandDescription: '展开简介', collapseDescription: '收起简介', showOtherSessions: count => `查看其他 ${count} 个场次`, hideOtherSessions: '收起其他场次', save: title => `收藏：${title}`, unsave: title => `取消收藏：${title}`, showAll: '显示全部活动', showSaved: '只查看收藏活动', timeUnavailable: '请点击活动详情查看活动时间'
  },
  en: {
    brand: 'South Bay Family Plans', findEvents: 'Find events', howItWorks: 'Before you go', heroTitle: 'Find family activities <br /><em>worth doing across the South Bay.</em>', heroIntro: 'From storytimes and nature walks to creative workshops, science experiences, shows, and museum exhibits—find a plan that works for your family.', weekendCta: 'See this weekend', sectionTitle: 'What would you like to do?', date: 'Date', anyTime: 'Any time', today: 'Today', weekend: 'This weekend', month: 'This month', sort: 'Sort', sortDate: 'By date', sortDistance: 'Nearest to me', locating: 'Confirming your location…', nearbyReady: 'Sorted by nearby; distances are straight-line estimates.', locationUnavailable: 'We could not get your location, so activities are sorted by date. Allow location in your browser and try again.', distance: miles => `About ${miles} mi away`, city: 'City', allCities: 'All cities', age: "Child's age", anyChildAge: 'Any age', ageValue: age => `Age ${age}`, family: 'Family-friendly', all: 'All activities', sports: 'Sports & games', shows: 'Shows & performances', museums: 'Museums & exhibits', outdoor: 'Outdoors & nature', arts: 'Arts & making', learning: 'Learning & STEM', play: 'Stories & play', community: 'Community & family', workshops: 'Classes & workshops', onViewNow: 'On view now', clearFilters: 'Clear filters',
    tipsEyebrow: 'BEFORE YOU GO', howTitle: 'A few tips for the weekend', how1Title: 'Confirm before leaving', how1Body: 'Times, capacity, and prices can change. Check the organizer’s page before you head out.', how2Title: 'Plan ahead', how2Body: 'Reserve popular activities early, and check weather, parking, and walking distance for outdoor plans.', how3Title: 'Save now, decide later', how3Body: 'Tap the heart to save activities and review them together in Saved when the weekend arrives.', footer: 'Made for curious South Bay families · Please confirm details with the organizer',
    saved: 'Saved', results: count => `${count} activities found`, savedResults: count => `${count} saved activities`, emptyFiltered: 'No activities match these filters. Try widening the date, age, or category.', emptyAll: 'No verified activities are available right now. Please try again soon.', updateUnavailable: 'Latest refresh information is unavailable · Official sources', update: date => `Last updated: ${date} · Official sources`, ageFact: label => label, costFact: label => `Cost: ${label}`, ageUnknown: 'Age not specified', costUnknown: 'Cost not specified', viewDetails: 'View details', hostedBy: source => `Hosted by ${source}`, directions: 'Directions', expandDescription: 'Show description', collapseDescription: 'Hide description', showOtherSessions: count => `Show ${count} other sessions`, hideOtherSessions: 'Hide other sessions', save: title => `Save: ${title}`, unsave: title => `Remove saved activity: ${title}`, showAll: 'Show all activities', showSaved: 'Show saved activities', timeUnavailable: 'See organizer details for the event time'
  }
};
const categoryLabels = { sports: ['体育与比赛', 'Sports & games'], shows: ['演出与表演', 'Shows & performances'], museums: ['博物馆与展览', 'Museums & exhibits'], outdoor: ['户外自然', 'Outdoors & nature'], arts: ['艺术与创作', 'Arts & making'], learning: ['学习与 STEM', 'Learning & STEM'], play: ['故事与玩乐', 'Stories & play'], community: ['社区与家庭', 'Community & family'], workshops: ['课程与工作坊', 'Classes & workshops'] };
// Each parent-facing activity label has its own fallback image. Official event
// artwork always wins; these are used only when a verified source has none.
const fallbackImageType = { sports: 'sports', shows: 'shows', museums: 'museums', play: 'play', workshops: 'workshops' };
const legacyAgeLabels = { '0-2': ['0–2 岁', 'Ages 0–2'], '3-5': ['3–5 岁', 'Ages 3–5'], k5: ['K–5 年级', 'Grades K–5'], middle: ['6–8 年级', 'Grades 6–8'], high: ['9–12 年级', 'Grades 9–12'], 'all-ages': ['所有年龄', 'All ages'], family: ['全家适合', 'Family-friendly'] };
const costLabels = { '免费': ['免费', 'Free'], '建议捐赠': ['建议捐赠', 'Suggested donation'], '会员／非会员价格见详情': ['会员／非会员价格见详情', 'Member / non-member price—see details'], '需购票／价格见详情': ['需购票／价格见详情', 'Tickets / price—see details'] };
// Coordinates are only supplied for a specific organizer-provided street address.
// Missing entries intentionally remain unlocated instead of falling back to a city center.
const venueCoordinates = {
  '6445 Camden Ave, San Jose': [37.2214644, -121.8691377], '4270 Pearl Ave, San Jose': [37.2677995, -121.8664471], '3090 Alum Rock Ave, San Jose': [37.3652963, -121.8280550], '150 E San Fernando St, San Jose': [37.3355074, -121.8850772], '290 International Circle, San Jose': [37.2374873, -121.79983], '1450 Blossom Hill Rd, San Jose': [37.24027, -121.8921881], '350 W. Sixth Street, Gilroy': [37.0050762, -121.5726956], '660 West Main Ave, Morgan Hill': [37.1244091, -121.6628141], '160 North Main Street, Milpitas': [37.4324266, -121.9070434], '921 South First St, San Jose': [37.3222883, -121.8804012], '1213 Newell Rd, Palo Alto': [37.4449758, -122.1390735], '10800 Torre Avenue, Cupertino': [37.3178237, -122.0289235], '3700 Middlefield Rd, Palo Alto': [37.4221606, -122.1128177], '1451 Middlefield Road, Palo Alto': [37.4434284, -122.1444282], '3411 Rocky Mountain Dr, San Jose': [37.352429, -121.8018853], '4001 Evergreen Village Square, San Jose': [37.3134183, -121.7744198], '3590 Cas Dr, San Jose': [37.2850574, -121.8328893], '2300 Wellesley St, Palo Alto': [37.4231855, -122.1488209], '1102 E Santa Clara St, San Jose': [37.3464402, -121.8682181], '1000 S. Bascom Ave, San Jose': [37.3075348, -121.9311591], '13650 Saratoga Avenue, Saratoga': [37.2700537, -122.0152172], '1276 Harriet Street, Palo Alto': [37.4448143, -122.14519], '270 Forest Ave, Palo Alto': [37.4438796, -122.1592083], '600 East Meadow Drive, Palo Alto': [37.4232558, -122.1163817], '201 S Market St, San Jose': [37.331404, -121.8901566], '12345 El Monte Rd, Los Altos Hills': [37.3617195, -122.1283018], '1431 Waverley Street, Palo Alto': [37.4397144, -122.1480637]
};
const t = key => copy[state.language][key];
const eventText = (event, field) => translationEnabled && state.language === 'zh' ? event.translations?.zh?.[field] || event[field] : event[field];
const categoryLabel = event => categoryLabels[event.type || 'community']?.[state.language === 'zh' ? 0 : 1] || event.tag;
function eventAgeLabel(event) {
  if (event.ageLabel) return event.ageLabel;
  return event.ageBands?.length ? event.ageBands.map(band => legacyAgeLabels[band]?.[state.language === 'zh' ? 0 : 1]).filter(Boolean).join(' · ') : t('ageUnknown');
}
function eventAgeFact(event) {
  const label = eventAgeLabel(event).trim();
  if (!label) return '';
  // When an organizer marks an activity family-friendly but does not publish
  // a narrower age range, treat it as available to every child-age filter.
  // The card uses the same concise wording as the explicit All ages category.
  if (label === 'Family-friendly' && !(event.ageRanges || []).length) return 'Ages: All';
  const grade = label.match(/^Grades?\s+(.+)$/i);
  if (grade) {
    // The filter already uses the conventional K–12 age equivalent. Show
    // that same parent-friendly range on the card rather than a grade label.
    const ranges = event.ageRanges || [];
    if (ranges.length) return `Ages: ${ranges.map(([start, end]) => start === end ? start : `${start}–${end}`).join(' · ')}`;
    return `Ages: ${grade[1]}`;
  }
  // Keep every age-range pill in the same field/value pattern, including
  // organizer wording such as “All ages” and “Ages 6+”.
  return `Ages: ${label.replace(/\bAges?\s*/gi, '')}`;
}
function eventCostLabel(event) { return !event.costLabel || event.costLabel === '费用未注明' ? t('costUnknown') : costLabels[event.costLabel]?.[state.language === 'zh' ? 0 : 1] || event.costLabel; }
function renderUpdateTime() {
  const generatedAt = window.SOUTH_BAY_EVENTS_META?.generatedAt;
  if (!generatedAt) { document.querySelector('#updateText').textContent = t('updateUnavailable'); return; }
  const display = new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric' }).format(new Date(generatedAt));
  document.querySelector('#updateText').textContent = t('update')(display);
}
function applyStaticCopy() {
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
  document.title = state.language === 'zh' ? '南湾家庭计划｜亲子活动' : 'South Bay Family Plans | Kids & Family Activities';
  document.querySelector('meta[name="description"]').content = state.language === 'zh' ? '发现值得全家一起参与的南湾活动。' : 'Find family activities worth doing across the South Bay.';
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(node => { node.innerHTML = t(node.dataset.i18nHtml); });
  document.querySelectorAll('.language-button').forEach(button => { const active = button.dataset.language === state.language; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  document.querySelector('#savedLabel').textContent = t('saved');
  renderUpdateTime();
}
function dateKey(value) { return String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || ''; }
function localToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); }
function dateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/); if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`); const currentYear = localToday().slice(0, 4);
  if (state.language === 'en') return `${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', weekday: 'short', year: match[1] === currentYear ? undefined : 'numeric' }).format(date)}${match[4] ? ` · ${match[4]}:${match[5]}` : ''}`;
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', weekday: 'short' }).format(date);
  return `${match[1] === currentYear ? '' : `${match[1]}年`}${Number(match[2])}月${Number(match[3])}日（${weekday}）${match[4] ? ` ${match[4]}:${match[5]}` : ''}`;
}
function dateMatches(event, filter) {
  if (filter === 'all') return true; const date = dateKey(event.dateValue); if (!date) return false; const todayKey = localToday();
  if (filter === 'today') return date === todayKey; if (filter === 'month') return date.slice(0, 7) === todayKey.slice(0, 7);
  if (filter === 'weekend') { const todayDate = new Date(`${todayKey}T12:00:00`); const untilSaturday = todayDate.getDay() === 0 ? -1 : 6 - todayDate.getDay(); const start = new Date(todayDate); start.setDate(todayDate.getDate() + untilSaturday); const end = new Date(start); end.setDate(start.getDate() + 1); const eventDate = new Date(`${date}T12:00:00`); return eventDate >= start && eventDate <= end; }
  return false;
}
function ageMatches(event, age) {
  if (age === 'all') return true;
  const childAge = Number(age);
  if (!Number.isInteger(childAge)) return true;
  const ranges = event.ageRanges?.length ? event.ageRanges : (Number.isInteger(event.ageMin) && Number.isInteger(event.ageMax) ? [[event.ageMin, event.ageMax]] : []);
  if (ranges.length) return ranges.some(([min, max]) => childAge >= min && childAge <= max);
  // A broad family-friendly designation has no narrower organizer age band,
  // so it remains discoverable for every child age rather than disappearing
  // from filtered family plans.
  if (event.familyFriendly || (event.ageBands || []).includes('family')) return true;
  // Backward compatibility while a browser may still hold a cached event file.
  return (event.ageBands || []).includes('all-ages');
}
function eventSessions(event) { return event.sessions?.length ? event.sessions : [event]; }
function matchingSessions(event) { return eventSessions(event).filter(session => dateMatches({ ...event, ...session }, state.date)); }
function activeSession(event) { return matchingSessions(event)[0] || eventSessions(event)[0]; }
function isSaved(event) { return state.saved.includes(event.id) || event.legacyIds?.some(id => state.saved.includes(id)); }
function migrateSavedSeries() {
  const legacyToSeries = new Map();
  events.forEach(event => event.legacyIds?.forEach(id => legacyToSeries.set(id, event.id)));
  const migrated = [...new Set(state.saved.map(id => legacyToSeries.get(id) || id))];
  if (migrated.join('\u001f') !== state.saved.join('\u001f')) { state.saved = migrated; localStorage.setItem('southBaySaved', JSON.stringify(state.saved)); }
}
function eventDistance(event) {
  const venue = venueCoordinates[event.address];
  if (!state.position || !venue) return null;
  const toRadians = value => value * Math.PI / 180;
  const [lat, lon] = venue; const { lat: userLat, lon: userLon } = state.position;
  const a = Math.sin(toRadians(lat - userLat) / 2) ** 2 + Math.cos(toRadians(userLat)) * Math.cos(toRadians(lat)) * Math.sin(toRadians(lon - userLon) / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function sortEvents(items) {
  const dated = [...items].sort((a, b) => String(activeSession(a).dateValue || '9999').localeCompare(String(activeSession(b).dateValue || '9999')) || String(a.title).localeCompare(String(b.title)));
  if (state.sort !== 'distance' || !state.position) return dated;
  return dated.sort((a, b) => {
    const distanceA = eventDistance(a); const distanceB = eventDistance(b);
    if (distanceA === null && distanceB === null) return 0;
    if (distanceA === null) return 1;
    if (distanceB === null) return -1;
    return distanceA - distanceB;
  });
}
function populateCityFilter() {
  const select = document.querySelector('#cityFilter');
  const previous = state.city;
  const counts = new Map();
  events.forEach(event => { if (event.city) counts.set(event.city, (counts.get(event.city) || 0) + 1); });
  select.replaceChildren(new Option(t('allCities'), 'all'));
  [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).forEach(([city, count]) => select.add(new Option(`${city} (${count})`, city)));
  state.city = counts.has(previous) ? previous : 'all';
  select.value = state.city;
}
function populateAgeFilter() {
  const select = document.querySelector('#ageFilter');
  const previous = state.age;
  select.replaceChildren(new Option(t('anyChildAge'), 'all'));
  for (let age = 0; age <= 18; age += 1) select.add(new Option(t('ageValue')(age), String(age)));
  state.age = previous === 'all' || /^\d+$/.test(previous) ? previous : 'all';
  select.value = state.age;
}
function render() {
  const visible = sortEvents(events.filter(event => (state.type === 'all' || event.type === state.type) && (state.city === 'all' || event.city === state.city) && ageMatches(event, state.age) && matchingSessions(event).length && (!state.onlySaved || isSaved(event))));
  grid.innerHTML = '';
  visible.forEach(event => {
    const session = activeSession(event); const sessions = matchingSessions(event); const node = template.content.cloneNode(true); const fallbackImage = `assets/fallback/${fallbackImageType[event.type] || event.type || 'community'}.png?v=20260830-1`; const image = event.image || fallbackImage; const imageArea = node.querySelector('.card-image');
    const setCardImage = url => { imageArea.style.backgroundImage = `linear-gradient(0deg, rgba(18, 49, 42, .08), rgba(18, 49, 42, .08)), url(${JSON.stringify(url)})`; };
    imageArea.style.backgroundColor = event.color; setCardImage(image); imageArea.classList.add('has-image');
    if (event.image) { const imageProbe = new Image(); imageProbe.onerror = () => setCardImage(fallbackImage); imageProbe.src = event.image; }
    node.querySelector('.event-icon').textContent = event.icon; node.querySelector('.tag').textContent = categoryLabel(event); node.querySelector('h3').textContent = eventText(event, 'title');
    const description = node.querySelector('.description'); const descriptionToggle = node.querySelector('.description-toggle'); description.textContent = eventText(event, 'description'); description.hidden = !description.textContent.trim(); description.id = `description-${event.id}`;
    descriptionToggle.dataset.eventId = event.id; descriptionToggle.setAttribute('aria-controls', description.id); descriptionToggle.setAttribute('aria-expanded', 'false'); descriptionToggle.textContent = t('expandDescription');
    // A source field by itself is not a customer-facing label. Only show a
    // pill when it has actual readable content; otherwise an empty styled
    // span appears as a confusing little oval under the age badge.
    const facts = node.querySelector('.card-facts');
    const ageFact = node.querySelector('.fact-age'); const ageText = event.ageSource ? eventAgeFact(event) : ''; ageFact.textContent = ageText; ageFact.title = ageText ? event.ageSource : ''; if (!ageText) ageFact.remove();
    const costFact = node.querySelector('.fact-cost'); const costText = event.costSource ? t('costFact')(eventCostLabel(event)).trim() : ''; costFact.textContent = costText; costFact.title = costText ? event.costSource : ''; if (!costText) costFact.remove();
    facts.hidden = facts.querySelectorAll('.fact').length === 0;
    const distance = eventDistance(event); const distanceNode = node.querySelector('.distance'); distanceNode.hidden = distance === null; distanceNode.textContent = distance === null ? '' : t('distance')(distance < 10 ? distance.toFixed(1) : Math.round(distance));
    node.querySelector('.time .detail-text').textContent = event.ongoing ? t('onViewNow') : (dateLabel(session.dateValue) || (session.date === '请查看主办方时间' ? t('timeUnavailable') : session.date)); node.querySelector('.place .detail-text').textContent = event.place;
    const address = node.querySelector('.address'); const addressLink = node.querySelector('.address-link'); const addressText = event.address || ''; const meetingPoint = !addressText ? String(event.meetingPoint || '').trim() : ''; const locationText = addressText || (meetingPoint ? `Meet at: ${meetingPoint}` : '');
    address.hidden = !locationText; addressLink.href = event.mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText)}`; addressLink.querySelector('.detail-text').textContent = locationText; addressLink.querySelector('.directions').textContent = t('directions'); addressLink.setAttribute('aria-label', `${t('directions')}: ${locationText}`);
    const organizerName = event.verification === 'search-verified' ? '' : String(event.source || '').trim(); if (organizerName) { const organizer = document.createElement('p'); organizer.className = 'organizer'; organizer.textContent = t('hostedBy')(organizerName); node.querySelector('.details').append(organizer); }
    const sessionToggle = node.querySelector('.sessions-inline-toggle'); const sessionList = node.querySelector('.sessions-list'); const allSessions = eventSessions(event); const otherSessions = allSessions.filter(item => item.id !== session.id); sessionToggle.hidden = otherSessions.length === 0; sessionToggle.dataset.eventId = event.id; sessionToggle.setAttribute('aria-expanded', 'false'); sessionToggle.textContent = t('showOtherSessions')(otherSessions.length); sessionList.id = `sessions-${event.id}`; sessionToggle.setAttribute('aria-controls', sessionList.id); otherSessions.forEach(item => { const row = document.createElement('li'); const sessionLink = document.createElement('a'); sessionLink.href = item.url || event.url; sessionLink.target = '_blank'; sessionLink.rel = 'noopener'; sessionLink.textContent = dateLabel(item.dateValue) || item.date; row.append(sessionLink); sessionList.append(row); });
    const link = node.querySelector('.source-link'); link.href = session.url || event.url; link.firstChild.textContent = `${t('viewDetails')} `; link.addEventListener('click', () => track('activity_details_opened', { activity_category: event.type || 'other', organizer: event.source || 'unknown' }));
    const heart = node.querySelector('.heart'); const saved = isSaved(event); heart.dataset.id = event.id; heart.dataset.legacyIds = JSON.stringify(event.legacyIds || []); heart.classList.toggle('saved', saved); heart.textContent = saved ? '♥' : '♡'; heart.setAttribute('aria-pressed', String(saved)); heart.setAttribute('aria-label', saved ? t('unsave')(eventText(event, 'title')) : t('save')(eventText(event, 'title'))); grid.append(node);
    requestAnimationFrame(() => { descriptionToggle.hidden = description.hidden || description.scrollHeight <= description.clientHeight + 1; });
  });
  document.querySelector('#emptyState').hidden = visible.length !== 0; const active = state.type !== 'all' || state.age !== 'all' || state.city !== 'all' || state.date !== 'all' || state.onlySaved;
  document.querySelector('#emptyMessage').textContent = active ? t('emptyFiltered') : t('emptyAll'); document.querySelector('#clearFilters').hidden = !active; document.querySelector('#resultCount').textContent = state.onlySaved ? t('savedResults')(visible.length) : t('results')(visible.length); document.querySelector('#savedCount').textContent = state.saved.length;
  const savedButton = document.querySelector('#savedButton'); savedButton.setAttribute('aria-pressed', String(state.onlySaved)); savedButton.setAttribute('aria-label', state.onlySaved ? t('showAll') : t('showSaved')); syncMobileQuickFilters();
}
function setActiveType(type) { document.querySelectorAll('.chip').forEach(chip => { const active = chip.dataset.type === type; chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active)); }); }
function syncDatePriority() { document.querySelector('.date-priority').classList.toggle('is-active', state.date !== 'all'); }
function setLocationStatus(message = '') { const node = document.querySelector('#locationStatus'); node.textContent = message; node.hidden = !message; }
function enableNearbySort() {
  const sortFilter = document.querySelector('#sortFilter');
  if (state.position) { state.sort = 'distance'; sortFilter.value = 'distance'; track('sort_changed', { sort_method: 'distance' }); setLocationStatus(t('nearbyReady')); render(); return; }
  if (state.locationPending) { state.sort = 'distance'; sortFilter.value = 'distance'; setLocationStatus(t('locating')); render(); return; }
  if (!navigator.geolocation || state.locationFailed || state.locationRequested) { state.sort = 'date'; sortFilter.value = 'date'; setLocationStatus(t('locationUnavailable')); render(); return; }
  state.locationRequested = true; state.locationPending = true; state.sort = 'distance'; sortFilter.value = 'distance'; setLocationStatus(t('locating')); render();
  navigator.geolocation.getCurrentPosition(position => {
    state.position = { lat: position.coords.latitude, lon: position.coords.longitude }; state.locationPending = false;
    if (state.sort === 'distance') { track('sort_changed', { sort_method: 'distance' }); setLocationStatus(t('nearbyReady')); }
    render();
  }, () => {
    state.locationPending = false; state.locationFailed = true;
    if (state.sort === 'distance') { state.sort = 'date'; sortFilter.value = 'date'; setLocationStatus(t('locationUnavailable')); }
    render();
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}
function resetFilters({ date = 'all' } = {}) { state.type = 'all'; state.age = 'all'; state.city = 'all'; state.date = date; state.sort = 'date'; state.onlySaved = false; document.querySelector('#ageFilter').value = 'all'; document.querySelector('#cityFilter').value = 'all'; document.querySelector('#dateFilter').value = date; document.querySelector('#sortFilter').value = 'date'; setLocationStatus(); setActiveType('all'); syncDatePriority(); document.querySelector('#savedButton').classList.remove('active'); }
document.querySelector('#typeFilters').addEventListener('click', e => {
  // Browser translation can wrap a chip label in an inner element. Resolve the
  // actual button instead of requiring the exact clicked node to be the button.
  const chip = e.target.closest('.chip');
  if (!chip || !e.currentTarget.contains(chip)) return;
  state.type = chip.dataset.type;
  track('filter_applied', { filter_name: 'category', filter_value: state.type });
  setActiveType(state.type);
  render();
});
document.querySelector('#ageFilter').addEventListener('change', e => { state.age = e.target.value; track('filter_applied', { filter_name: 'age_band', filter_value: analyticsAgeBand(state.age) }); render(); });
document.querySelector('#cityFilter').addEventListener('change', e => { state.city = e.target.value; track('filter_applied', { filter_name: 'city', filter_value: state.city }); render(); });
document.querySelector('#dateFilter').addEventListener('change', e => { state.date = e.target.value; track('filter_applied', { filter_name: 'date', filter_value: state.date }); syncDatePriority(); render(); });
document.querySelector('#sortFilter').addEventListener('change', e => {
  if (e.target.value === 'date') { state.sort = 'date'; track('sort_changed', { sort_method: 'date' }); setLocationStatus(); render(); return; }
  enableNearbySort();
});
document.querySelector('#clearFilters').addEventListener('click', () => { resetFilters(); render(); });
document.querySelector('#weekendCta').addEventListener('click', event => { event.preventDefault(); track('quick_filter_used', { filter_name: 'date', filter_value: 'weekend' }); resetFilters({ date: 'weekend' }); render(); document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
const mobileFilters = document.querySelector('#filtersPanel');
const mobileFilterToggle = document.querySelector('#mobileFilterToggle');
const mobileWeekend = document.querySelector('#mobileWeekend');
const mobileNearby = document.querySelector('#mobileNearby');
function syncMobileQuickFilters() { mobileWeekend.classList.toggle('active', state.date === 'weekend'); mobileWeekend.setAttribute('aria-pressed', String(state.date === 'weekend')); mobileNearby.classList.toggle('active', state.sort === 'distance'); mobileNearby.setAttribute('aria-pressed', String(state.sort === 'distance')); }
mobileFilterToggle.addEventListener('click', () => { const isOpen = mobileFilters.classList.toggle('is-open'); mobileFilterToggle.setAttribute('aria-expanded', String(isOpen)); });
mobileWeekend.addEventListener('click', () => { state.date = state.date === 'weekend' ? 'all' : 'weekend'; document.querySelector('#dateFilter').value = state.date; track('quick_filter_used', { filter_name: 'date', filter_value: state.date }); syncDatePriority(); render(); });
mobileNearby.addEventListener('click', () => { const sortFilter = document.querySelector('#sortFilter'); if (state.sort === 'distance') { state.sort = 'date'; sortFilter.value = 'date'; setLocationStatus(); render(); return; } enableNearbySort(); });
grid.addEventListener('click', e => { const sessionToggle = e.target.closest('.sessions-inline-toggle'); if (sessionToggle) { const list = document.querySelector(`#sessions-${sessionToggle.dataset.eventId}`); const isExpanded = !list.hidden; list.hidden = isExpanded; sessionToggle.textContent = isExpanded ? t('showOtherSessions')(list.children.length) : t('hideOtherSessions'); sessionToggle.setAttribute('aria-expanded', String(!isExpanded)); return; } const toggle = e.target.closest('.description-toggle'); if (toggle) { const description = document.querySelector(`#description-${toggle.dataset.eventId}`); const isExpanded = description.classList.toggle('is-expanded'); toggle.textContent = isExpanded ? t('collapseDescription') : t('expandDescription'); toggle.setAttribute('aria-expanded', String(isExpanded)); return; } const button = e.target.closest('.heart'); if (!button) return; const id = button.dataset.id; const legacyIds = JSON.parse(button.dataset.legacyIds || '[]'); const saved = state.saved.includes(id) || legacyIds.some(legacyId => state.saved.includes(legacyId)); track(saved ? 'activity_unsaved' : 'activity_saved'); state.saved = saved ? state.saved.filter(item => item !== id && !legacyIds.includes(item)) : [...state.saved.filter(item => !legacyIds.includes(item)), id]; localStorage.setItem('southBaySaved', JSON.stringify(state.saved)); render(); });
document.querySelector('#savedButton').addEventListener('click', () => { state.onlySaved = !state.onlySaved; document.querySelector('#savedButton').classList.toggle('active', state.onlySaved); render(); document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
applyStaticCopy();
fetch('./data/events.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()).then(data => { if (Array.isArray(data)) events = data; }).catch(() => {}).finally(() => { migrateSavedSeries(); populateAgeFilter(); populateCityFilter(); render(); });

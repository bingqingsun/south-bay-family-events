let events = Array.isArray(window.SOUTH_BAY_EVENTS) ? window.SOUTH_BAY_EVENTS : [];
// Kept as a single switch so bilingual presentation can be restored later
// without changing the canonical, organizer-supplied event data.
const translationEnabled = false;
const state = { type: 'all', age: 'all', city: 'all', date: 'all', saved: JSON.parse(localStorage.getItem('southBaySaved') || '[]'), onlySaved: false, language: 'zh' };
const grid = document.querySelector('#eventGrid');
const template = document.querySelector('#cardTemplate');

const copy = {
  zh: {
    brand: '周末去哪儿', findEvents: '找活动', howItWorks: '出发小提示', heroTitle: '把这个周末，<br /><em>留给一起探索。</em>', heroIntro: '为南湾 K–12 孩子和家庭精选的活动灵感。从林间徒步、创意工坊到博物馆夜场，持续更新。', weekendCta: '查看本周末活动', sectionTitle: '今天想做点什么？', date: '日期', anyTime: '任意时间', today: '今天', weekend: '本周末', month: '本月', city: '城市', allCities: '全部城市', age: '适合年龄', allAges: '不限年龄', age02: '0–2 岁', age35: '3–5 岁', middle: '6–8 年级', high: '9–12 年级', family: '全家适合', all: '全部', outdoor: '户外自然', arts: '艺术创作', learning: '科学与学习', community: '社区活动', clearFilters: '清除筛选',
    tipsEyebrow: '出发前看看', howTitle: '周末出发小提示', how1Title: '出门前确认', how1Body: '活动时间、名额和费用可能变化；出发前请查看主办方页面。', how2Title: '提前安排', how2Body: '热门活动建议先预约；户外活动留意天气、停车和步行距离。', how3Title: '先收藏，再决定', how3Body: '点击心形收藏感兴趣的活动，周末可在“已收藏”中集中查看。', footer: '为南湾的好奇心而做 · 活动信息请以主办方页面为准',
    saved: '已收藏', results: count => `发现 ${count} 个活动`, savedResults: count => `已收藏 ${count} 个活动`, emptyFiltered: '当前筛选条件下暂无活动。试试放宽日期、年龄或类别。', emptyAll: '暂时没有已核验的活动，请稍后再试。', updateUnavailable: '最近更新信息暂不可用 · 来自官方活动来源', update: date => `最近更新：${date}（南湾时间）· 官方来源`, ageFact: label => `适合：${label}`, costFact: label => `费用：${label}`, ageUnknown: '年龄未注明', costUnknown: '费用未注明', viewDetails: source => source ? `查看 ${source} 详情` : '查看活动详情', save: title => `收藏：${title}`, unsave: title => `取消收藏：${title}`, showAll: '显示全部活动', showSaved: '只查看收藏活动', timeUnavailable: '请点击活动详情查看活动时间'
  },
  en: {
    brand: 'Weekend Plans', findEvents: 'Find events', howItWorks: 'Before you go', heroTitle: 'Make this weekend<br /><em>an adventure together.</em>', heroIntro: 'Handpicked ideas for South Bay K–12 kids and families—from nature walks and creative workshops to museum evenings, continually updated.', weekendCta: 'See this weekend', sectionTitle: 'What would you like to do?', date: 'Date', anyTime: 'Any time', today: 'Today', weekend: 'This weekend', month: 'This month', city: 'City', allCities: 'All cities', age: 'Ages', allAges: 'All ages', age02: 'Ages 0–2', age35: 'Ages 3–5', middle: 'Grades 6–8', high: 'Grades 9–12', family: 'Family-friendly', all: 'All', outdoor: 'Outdoors', arts: 'Arts & making', learning: 'Learning & STEM', community: 'Community', clearFilters: 'Clear filters',
    tipsEyebrow: 'BEFORE YOU GO', howTitle: 'A few tips for the weekend', how1Title: 'Confirm before leaving', how1Body: 'Times, capacity, and prices can change. Check the organizer’s page before you head out.', how2Title: 'Plan ahead', how2Body: 'Reserve popular activities early, and check weather, parking, and walking distance for outdoor plans.', how3Title: 'Save now, decide later', how3Body: 'Tap the heart to save activities and review them together in Saved when the weekend arrives.', footer: 'Made for curious South Bay families · Please confirm details with the organizer',
    saved: 'Saved', results: count => `${count} activities found`, savedResults: count => `${count} saved activities`, emptyFiltered: 'No activities match these filters. Try widening the date, age, or category.', emptyAll: 'No verified activities are available right now. Please try again soon.', updateUnavailable: 'Latest refresh information is unavailable · Official sources', update: date => `Last updated: ${date} · Official sources`, ageFact: label => `Ages: ${label}`, costFact: label => `Cost: ${label}`, ageUnknown: 'Age not specified', costUnknown: 'Cost not specified', viewDetails: source => source ? `View ${source} details` : 'View activity details', save: title => `Save: ${title}`, unsave: title => `Remove saved activity: ${title}`, showAll: 'Show all activities', showSaved: 'Show saved activities', timeUnavailable: 'See organizer details for the event time'
  }
};
const categoryLabels = { outdoor: ['户外自然', 'Outdoors'], arts: ['艺术创作', 'Arts & making'], learning: ['科学与学习', 'Learning & STEM'], community: ['社区活动', 'Community'] };
const ageLabels = { '0-2': ['0–2 岁', '0–2'], '3-5': ['3–5 岁', '3–5'], k5: ['K–5 年级', 'Grades K–5'], middle: ['6–8 年级', 'Grades 6–8'], high: ['9–12 年级', 'Grades 9–12'], 'all-ages': ['所有年龄', 'All ages'], family: ['全家适合', 'Family-friendly'] };
const costLabels = { '免费': ['免费', 'Free'], '建议捐赠': ['建议捐赠', 'Suggested donation'], '会员／非会员价格见详情': ['会员／非会员价格见详情', 'Member / non-member price—see details'], '需购票／价格见详情': ['需购票／价格见详情', 'Tickets / price—see details'] };
const t = key => copy[state.language][key];
const eventText = (event, field) => translationEnabled && state.language === 'zh' ? event.translations?.zh?.[field] || event[field] : event[field];
const categoryLabel = event => categoryLabels[event.type || 'community']?.[state.language === 'zh' ? 0 : 1] || event.tag;
function eventAgeLabel(event) { return event.ageBands?.length ? event.ageBands.map(band => ageLabels[band]?.[state.language === 'zh' ? 0 : 1]).filter(Boolean).join(' · ') : t('ageUnknown'); }
function eventCostLabel(event) { return !event.costLabel || event.costLabel === '费用未注明' ? t('costUnknown') : costLabels[event.costLabel]?.[state.language === 'zh' ? 0 : 1] || event.costLabel; }
function renderUpdateTime() {
  const generatedAt = window.SOUTH_BAY_EVENTS_META?.generatedAt;
  if (!generatedAt) { document.querySelector('#updateText').textContent = t('updateUnavailable'); return; }
  const display = new Intl.DateTimeFormat(state.language === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric' }).format(new Date(generatedAt));
  document.querySelector('#updateText').textContent = t('update')(display);
}
function applyStaticCopy() {
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
  document.title = state.language === 'zh' ? '周末去哪儿 · 南湾亲子活动' : 'Weekend Plans · South Bay Family Activities';
  document.querySelector('meta[name="description"]').content = state.language === 'zh' ? '南湾 K-12 亲子活动与周末去处，持续更新。' : 'Continuously updated K–12 and family activities in the South Bay.';
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
function ageMatches(event, age) { if (age === 'all') return true; const bands = event.ageBands || []; return age === 'family' ? bands.includes('family') || bands.includes('all-ages') : bands.includes(age) || bands.includes('all-ages'); }
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
function render() {
  const visible = events.filter(event => (state.type === 'all' || event.type === state.type) && (state.city === 'all' || event.city === state.city) && ageMatches(event, state.age) && dateMatches(event, state.date) && (!state.onlySaved || state.saved.includes(event.id)));
  grid.innerHTML = '';
  visible.forEach(event => {
    const node = template.content.cloneNode(true); const image = event.image || `assets/fallback/${event.type || 'community'}.png`; const imageArea = node.querySelector('.card-image');
    imageArea.style.backgroundColor = event.color; imageArea.style.backgroundImage = `linear-gradient(0deg, rgba(18, 49, 42, .08), rgba(18, 49, 42, .08)), url(${JSON.stringify(image)})`; imageArea.classList.add('has-image');
    node.querySelector('.event-icon').textContent = event.icon; node.querySelector('.tag').textContent = categoryLabel(event); node.querySelector('h3').textContent = eventText(event, 'title');
    const description = node.querySelector('.description'); description.textContent = eventText(event, 'description'); description.hidden = !description.textContent.trim();
    const ageFact = node.querySelector('.fact-age'); ageFact.textContent = t('ageFact')(eventAgeLabel(event)); ageFact.title = event.ageSource || ''; ageFact.hidden = !event.ageSource;
    const costFact = node.querySelector('.fact-cost'); costFact.textContent = t('costFact')(eventCostLabel(event)); costFact.title = event.costSource || ''; costFact.hidden = !event.costSource;
    node.querySelector('.card-facts').hidden = !event.ageSource && !event.costSource;
    node.querySelector('.time').textContent = dateLabel(event.dateValue) || (event.date === '请查看主办方时间' ? t('timeUnavailable') : event.date); node.querySelector('.place').textContent = event.place;
    const address = node.querySelector('.address'); address.textContent = event.address || ''; address.hidden = !address.textContent.trim();
    const link = node.querySelector('.source-link'); link.href = event.url; link.firstChild.textContent = `${t('viewDetails')(event.source)} `;
    const heart = node.querySelector('.heart'); const isSaved = state.saved.includes(event.id); heart.dataset.id = event.id; heart.classList.toggle('saved', isSaved); heart.textContent = isSaved ? '♥' : '♡'; heart.setAttribute('aria-pressed', String(isSaved)); heart.setAttribute('aria-label', isSaved ? t('unsave')(eventText(event, 'title')) : t('save')(eventText(event, 'title'))); grid.append(node);
  });
  document.querySelector('#emptyState').hidden = visible.length !== 0; const active = state.type !== 'all' || state.age !== 'all' || state.city !== 'all' || state.date !== 'all' || state.onlySaved;
  document.querySelector('#emptyMessage').textContent = active ? t('emptyFiltered') : t('emptyAll'); document.querySelector('#clearFilters').hidden = !active; document.querySelector('#resultCount').textContent = state.onlySaved ? t('savedResults')(visible.length) : t('results')(visible.length); document.querySelector('#savedCount').textContent = state.saved.length;
  const savedButton = document.querySelector('#savedButton'); savedButton.setAttribute('aria-pressed', String(state.onlySaved)); savedButton.setAttribute('aria-label', state.onlySaved ? t('showAll') : t('showSaved'));
}
function setActiveType(type) { document.querySelectorAll('.chip').forEach(chip => { const active = chip.dataset.type === type; chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active)); }); }
function syncDatePriority() { document.querySelector('.date-priority').classList.toggle('is-active', state.date !== 'all'); }
function resetFilters({ date = 'all' } = {}) { state.type = 'all'; state.age = 'all'; state.city = 'all'; state.date = date; state.onlySaved = false; document.querySelector('#ageFilter').value = 'all'; document.querySelector('#cityFilter').value = 'all'; document.querySelector('#dateFilter').value = date; setActiveType('all'); syncDatePriority(); document.querySelector('#savedButton').classList.remove('active'); }
document.querySelector('#typeFilters').addEventListener('click', e => { if (!e.target.matches('.chip')) return; state.type = e.target.dataset.type; setActiveType(state.type); render(); });
document.querySelector('#ageFilter').addEventListener('change', e => { state.age = e.target.value; render(); });
document.querySelector('#cityFilter').addEventListener('change', e => { state.city = e.target.value; render(); });
document.querySelector('#dateFilter').addEventListener('change', e => { state.date = e.target.value; syncDatePriority(); render(); });
document.querySelector('#clearFilters').addEventListener('click', () => { resetFilters(); render(); });
document.querySelector('#weekendCta').addEventListener('click', event => { event.preventDefault(); resetFilters({ date: 'weekend' }); render(); document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
grid.addEventListener('click', e => { const button = e.target.closest('.heart'); if (!button) return; const id = button.dataset.id; state.saved = state.saved.includes(id) ? state.saved.filter(item => item !== id) : [...state.saved, id]; localStorage.setItem('southBaySaved', JSON.stringify(state.saved)); render(); });
document.querySelector('#savedButton').addEventListener('click', () => { state.onlySaved = !state.onlySaved; document.querySelector('#savedButton').classList.toggle('active', state.onlySaved); render(); });
applyStaticCopy();
fetch('./data/events.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : Promise.reject()).then(data => { if (Array.isArray(data)) events = data; }).catch(() => {}).finally(() => { populateCityFilter(); render(); });

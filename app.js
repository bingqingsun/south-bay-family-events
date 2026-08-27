let events = Array.isArray(window.SOUTH_BAY_EVENTS) ? window.SOUTH_BAY_EVENTS : [];
const state = { type: 'all', age: 'all', date: 'all', saved: JSON.parse(localStorage.getItem('southBaySaved') || '[]'), onlySaved: false };
const grid = document.querySelector('#eventGrid');
const template = document.querySelector('#cardTemplate');

function renderUpdateTime() {
  const generatedAt = window.SOUTH_BAY_EVENTS_META?.generatedAt;
  if (!generatedAt) {
    document.querySelector('#updateText').textContent = '最近更新信息暂不可用 · 来自官方活动来源';
    return;
  }
  const display = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric'
  }).format(new Date(generatedAt));
  document.querySelector('#updateText').textContent = `最近更新：${display}（南湾时间）· 官方来源`;
}
renderUpdateTime();

function dateKey(value) {
  return String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

function dateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const currentYear = localToday().slice(0, 4);
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', weekday: 'short' })
    .format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`));
  const prefix = match[1] === currentYear ? '' : `${match[1]}年`;
  return `${prefix}${Number(match[2])}月${Number(match[3])}日（${weekday}）${match[4] ? ` ${match[4]}:${match[5]}` : ''}`;
}

function dateMatches(event, filter) {
  if (filter === 'all') return true;
  const date = dateKey(event.dateValue);
  if (!date) return false;
  const todayKey = localToday();
  if (filter === 'today') return date === todayKey;
  if (filter === 'month') return date.slice(0, 7) === todayKey.slice(0, 7);
  if (filter === 'weekend') {
    const todayDate = new Date(`${todayKey}T12:00:00`);
    // Sunday belongs to the weekend that began yesterday; it must not spill
    // into the following Monday.
    const daysUntilSaturday = todayDate.getDay() === 0 ? -1 : 6 - todayDate.getDay();
    const start = new Date(todayDate); start.setDate(todayDate.getDate() + daysUntilSaturday);
    const end = new Date(start); end.setDate(start.getDate() + 1);
    const eventDate = new Date(`${date}T12:00:00`);
    return eventDate >= start && eventDate <= end;
  }
  return false;
}

function ageMatches(event, age) {
  if (age === 'all') return true;
  const ageBands = event.ageBands || [];
  if (age === 'family') return ageBands.includes('family') || ageBands.includes('all-ages');
  // Only an explicit "all ages" label can satisfy every age-band filter.
  // A generic family activity stays discoverable under “全家适合”, but is not
  // silently treated as suitable for a particular child age.
  return ageBands.includes(age) || ageBands.includes('all-ages');
}

function render() {
  const visible = events.filter(event => (state.type === 'all' || event.type === state.type) && ageMatches(event, state.age) && dateMatches(event, state.date) && (!state.onlySaved || state.saved.includes(event.id)));
  grid.innerHTML = '';
  visible.forEach(event => {
    const node = template.content.cloneNode(true);
    const image = event.image || `assets/fallback/${event.type || 'community'}.png`;
    const imageArea = node.querySelector('.card-image');
    imageArea.style.backgroundColor = event.color;
    imageArea.style.backgroundImage = `linear-gradient(0deg, rgba(18, 49, 42, .08), rgba(18, 49, 42, .08)), url(${JSON.stringify(image)})`;
    imageArea.classList.add('has-image');
    node.querySelector('.event-icon').textContent = event.icon;
    node.querySelector('.tag').textContent = event.tag;
    node.querySelector('h3').textContent = event.title;
    node.querySelector('.description').textContent = event.description;
    const ageFact = node.querySelector('.fact-age');
    ageFact.textContent = `适合：${event.ageLabel || '年龄未注明'}`;
    ageFact.title = event.ageSource || '主办方页面未注明年龄';
    ageFact.hidden = !event.ageSource;
    const costFact = node.querySelector('.fact-cost');
    costFact.textContent = `费用：${event.costLabel || '费用未注明'}`;
    costFact.title = event.costSource || '主办方页面未注明费用';
    costFact.hidden = !event.costSource;
    node.querySelector('.card-facts').hidden = !event.ageSource && !event.costSource;
    node.querySelector('.time').textContent = dateLabel(event.dateValue) || (event.date === '请查看主办方时间' ? '请点击活动详情查看活动时间' : event.date);
    node.querySelector('.place').textContent = event.place;
    const link = node.querySelector('.source-link'); link.href = event.url; link.firstChild.textContent = event.source ? `查看 ${event.source} 详情 ` : '查看活动详情 ';
    const heart = node.querySelector('.heart');
    const isSaved = state.saved.includes(event.id);
    heart.dataset.id = event.id; heart.classList.toggle('saved', isSaved); heart.textContent = isSaved ? '♥' : '♡';
    heart.setAttribute('aria-pressed', String(isSaved));
    heart.setAttribute('aria-label', isSaved ? `取消收藏：${event.title}` : `收藏：${event.title}`);
    grid.append(node);
  });
  document.querySelector('#emptyState').hidden = visible.length !== 0;
  const hasActiveFilters = state.type !== 'all' || state.age !== 'all' || state.date !== 'all' || state.onlySaved;
  document.querySelector('#emptyMessage').textContent = hasActiveFilters
    ? '当前筛选条件下暂无活动。试试放宽日期、年龄或类别。'
    : '暂时没有已核验的活动，请稍后再试。';
  document.querySelector('#clearFilters').hidden = !hasActiveFilters;
  document.querySelector('#resultCount').textContent = state.onlySaved ? `已收藏 ${visible.length} 个活动` : `发现 ${visible.length} 个活动`;
  document.querySelector('#savedCount').textContent = state.saved.length;
  const savedButton = document.querySelector('#savedButton');
  savedButton.setAttribute('aria-pressed', String(state.onlySaved));
  savedButton.setAttribute('aria-label', state.onlySaved ? '显示全部活动' : '只查看收藏活动');
}
function setActiveType(type) {
  document.querySelectorAll('.chip').forEach(chip => {
    const active = chip.dataset.type === type;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}
function syncDatePriority() {
  document.querySelector('.date-priority').classList.toggle('is-active', state.date !== 'all');
}
function resetFilters({ date = 'all' } = {}) {
  state.type = 'all'; state.age = 'all'; state.date = date; state.onlySaved = false;
  document.querySelector('#ageFilter').value = 'all';
  document.querySelector('#dateFilter').value = date;
  setActiveType('all');
  syncDatePriority();
  document.querySelector('#savedButton').classList.remove('active');
}
document.querySelector('#typeFilters').addEventListener('click', e => { if (!e.target.matches('.chip')) return; state.type = e.target.dataset.type; setActiveType(state.type); render(); });
document.querySelector('#ageFilter').addEventListener('change', e => { state.age = e.target.value; render(); });
document.querySelector('#dateFilter').addEventListener('change', e => { state.date = e.target.value; syncDatePriority(); render(); });
document.querySelector('#clearFilters').addEventListener('click', () => {
  resetFilters();
  render();
});
document.querySelector('#weekendCta').addEventListener('click', event => {
  event.preventDefault();
  resetFilters({ date: 'weekend' });
  render();
  document.querySelector('#events').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
grid.addEventListener('click', e => { const button = e.target.closest('.heart'); if (!button) return; const id = button.dataset.id; state.saved = state.saved.includes(id) ? state.saved.filter(item => item !== id) : [...state.saved, id]; localStorage.setItem('southBaySaved', JSON.stringify(state.saved)); render(); });
document.querySelector('#savedButton').addEventListener('click', () => { state.onlySaved = !state.onlySaved; document.querySelector('#savedButton').classList.toggle('active', state.onlySaved); render(); });
fetch('./data/events.json', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : Promise.reject())
  .then(data => { if (Array.isArray(data)) events = data; })
  .catch(() => {})
  .finally(render);

let events = Array.isArray(window.SOUTH_BAY_EVENTS) ? window.SOUTH_BAY_EVENTS : [];
const state = { type: 'all', age: 'all', date: 'all', saved: JSON.parse(localStorage.getItem('southBaySaved') || '[]'), onlySaved: false };
const grid = document.querySelector('#eventGrid');
const template = document.querySelector('#cardTemplate');
const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date());
document.querySelector('#updateText').textContent = `${today} 已更新 · 来自官方活动来源`;

function dateKey(value) {
  return String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
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
    const daysUntilSaturday = todayDate.getDay() === 0 ? 0 : 6 - todayDate.getDay();
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
    node.querySelector('.card-meta').textContent = event.source ? (event.verification === 'rss' ? '官方 RSS 日历 · 日期来自主办方' : event.verification === 'calendar' ? '官方活动日历 · 日期来自主办方' : '官方页面自动核验 · 日期来自主办方') : '官方页面自动核验 · 日期来自主办方';
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
    node.querySelector('.time').textContent = event.date === '请查看主办方时间' ? '请点击活动详情查看活动时间' : event.date;
    node.querySelector('.place').textContent = event.place;
    const link = node.querySelector('.source-link'); link.href = event.url; link.firstChild.textContent = event.source ? `查看 ${event.source} 详情 ` : '查看活动详情 ';
    const heart = node.querySelector('.heart'); heart.dataset.id = event.id; heart.classList.toggle('saved', state.saved.includes(event.id)); heart.textContent = state.saved.includes(event.id) ? '♥' : '♡';
    grid.append(node);
  });
  document.querySelector('#emptyState').hidden = visible.length !== 0;
  document.querySelector('#resultCount').textContent = state.onlySaved ? `已收藏 ${visible.length} 个活动` : `发现 ${visible.length} 个活动`;
  document.querySelector('#savedCount').textContent = state.saved.length;
}
document.querySelector('#typeFilters').addEventListener('click', e => { if (!e.target.matches('.chip')) return; document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); e.target.classList.add('active'); state.type = e.target.dataset.type; render(); });
document.querySelector('#ageFilter').addEventListener('change', e => { state.age = e.target.value; render(); });
document.querySelector('#dateFilter').addEventListener('change', e => { state.date = e.target.value; render(); });
grid.addEventListener('click', e => { const button = e.target.closest('.heart'); if (!button) return; const id = button.dataset.id; state.saved = state.saved.includes(id) ? state.saved.filter(item => item !== id) : [...state.saved, id]; localStorage.setItem('southBaySaved', JSON.stringify(state.saved)); render(); });
document.querySelector('#savedButton').addEventListener('click', () => { state.onlySaved = !state.onlySaved; document.querySelector('#savedButton').classList.toggle('active', state.onlySaved); render(); });
fetch('./data/events.json', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : Promise.reject())
  .then(data => { if (Array.isArray(data)) events = data; })
  .catch(() => {})
  .finally(render);

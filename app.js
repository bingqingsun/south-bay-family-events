let events = [];
const state = { type: 'all', age: 'all', date: 'all', saved: JSON.parse(localStorage.getItem('southBaySaved') || '[]'), onlySaved: false };
const grid = document.querySelector('#eventGrid');
const template = document.querySelector('#cardTemplate');
const today = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date());
document.querySelector('#updateText').textContent = `${today} 已更新 · 来自本地活动来源`;

function render() {
  const visible = events.filter(event => (state.type === 'all' || event.type === state.type) && (state.age === 'all' || event.age === state.age || event.age === 'all') && (state.date === 'all' || event.when === state.date) && (!state.onlySaved || state.saved.includes(event.id)));
  grid.innerHTML = '';
  visible.forEach(event => {
    const node = template.content.cloneNode(true);
    node.querySelector('.card-image').style.background = event.color;
    node.querySelector('.event-icon').textContent = event.icon;
    node.querySelector('.tag').textContent = event.tag;
    node.querySelector('.card-meta').textContent = event.age === 'all' ? '适合全家' : `适合 ${event.age === 'k5' ? 'K–5' : event.age === 'middle' ? '6–8 年级' : '9–12 年级'}`;
    node.querySelector('h3').textContent = event.title;
    node.querySelector('.description').textContent = event.description;
    node.querySelector('.time').textContent = event.date === '请查看主办方时间' ? '请点击活动详情查看活动时间' : event.date;
    node.querySelector('.place').textContent = event.place;
    const link = node.querySelector('.source-link'); link.href = event.url;
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
document.querySelector('#signupForm').addEventListener('submit', e => { e.preventDefault(); document.querySelector('#formMessage').textContent = '已收到！周四见。'; e.target.reset(); });
fetch('./data/events.json', { cache: 'no-store' })
  .then(response => response.ok ? response.json() : Promise.reject())
  .then(data => { if (Array.isArray(data)) events = data; })
  .catch(() => {})
  .finally(render);

const demoEvents = [
  { id: 'nature', title: '家庭自然探索日', date: '请点击活动详情查看活动时间', when: 'weekend', age: 'k5', type: 'outdoor', icon: '🌿', color: '#d8eee0', tag: '户外自然', description: '带上放大镜，一起认识春天的植物与小动物。', place: 'Rancho San Antonio', url: 'https://www.openspace.org/preserves/rancho-san-antonio' },
  { id: 'makers', title: '小小创客：纸板城市', date: '请点击活动详情查看活动时间', when: 'weekend', age: 'k5', type: 'arts', icon: '✂️', color: '#ffd9bd', tag: '艺术创作', description: '用简单材料，把脑海里的城市变成立体作品。', place: 'Palo Alto Children’s Library', url: 'https://library.cityofpaloalto.org/' },
  { id: 'tech', title: '科技博物馆家庭实验室', date: '请点击活动详情查看活动时间', when: 'weekend', age: 'middle', type: 'learning', icon: '🔭', color: '#dce7fa', tag: '科学与学习', description: '动手挑战、现场演示，适合好奇的大小科学家。', place: 'The Tech Interactive · San José', url: 'https://www.thetech.org/' },
  { id: 'market', title: '农夫市集亲子早晨', date: '请点击活动详情查看活动时间', when: 'weekend', age: 'all', type: 'community', icon: '🍓', color: '#ffe9a8', tag: '社区活动', description: '新鲜食材、音乐和轻松的周日散步。', place: 'Mountain View Farmers’ Market', url: 'https://www.pcfma.org/mountain-view' },
  { id: 'stars', title: '抬头看星星：夜空观测', date: '请点击活动详情查看活动时间', when: 'today', age: 'high', type: 'learning', icon: '✨', color: '#dcd6ee', tag: '科学与学习', description: '和志愿天文爱好者一起认识夏季星空。', place: 'Foothill College Observatory', url: 'https://www.foothill.edu/astronomy/' },
  { id: 'artwalk', title: '周末家庭艺术漫步', date: '请点击活动详情查看活动时间', when: 'weekend', age: 'middle', type: 'arts', icon: '🎨', color: '#f8d3d9', tag: '艺术创作', description: '展览导览与适合孩子的即兴创作角。', place: 'San José Museum of Art', url: 'https://sjmusart.org/' }
];

const featuredEvents = [...demoEvents, { id: 'foothill-physics-show', title: 'Foothill College Physics Show', date: '请点击活动详情查看活动时间', when: 'weekend', age: 'all', type: 'learning', icon: '⚗️', color: '#dce7fa', tag: '科学与学习', description: '用现场演示把物理概念变得直观有趣。', place: 'Foothill College · Los Altos Hills', url: 'https://www.thephysicsshow.com/home' }];
let events = featuredEvents;
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
  .then(data => { if (Array.isArray(data) && data.length) events = [...featuredEvents, ...data.filter(event => !featuredEvents.some(featured => featured.id === event.id))]; })
  .catch(() => {})
  .finally(render);

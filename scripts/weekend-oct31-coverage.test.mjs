import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
const events = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
for(const [id,minPages] of [['san-jose-public-library',24],['palo-alto-library',12]]) {
  const source=sources.find(s=>s.id===id);
  assert.ok(source?.maxPages>=minPages, `Library RSS pagination not configured: ${id}`);
}
for(const [sourceId,title,date,urlPart,price] of [
 ['mhp-avenida','Avenida de Altares','2026-10-31','mhplaza.org/allevents/avenida26','free'],
 ['jamsj-halloween','Skate Day & Halloween in Japantown','2026-10-31','jamsj.org/upcoming-events/skate-halloween','free'],
 ['saratoga-witchy','Witchy Walk-A-Bout','2026-10-31','saratoga.ca.us/Calendar.aspx?EID=2691','free'],
 ['stanford-shopping-halloween','Halloween Spooktacular at Stanford Shopping Center','2026-10-31','simon.com/mall/stanford-shopping-center/stream/halloween-spooktacular',null],
 ['morgan-hill-safe-trick-or-treat','Downtown Safe Trick or Treat and Pumpkin Market','2026-10-31','visitmorganhill.org/event-calendar-detail/safetrickortreat','free']
]) {
  assert.ok(sources.some(s=>s.id===sourceId&&s.events?.length), `Missing official source: ${title}`);
  const matches=events.filter(e=>e.title===title&&String(e.dateValue||'').startsWith(date));
  assert.equal(matches.length,1,`Missing or duplicated weekend event: ${title} (got ${matches.length})`);
  const e=matches[0];
  assert.ok(e.url.includes(urlPart), `Official detail URL lost: ${title}`);
  assert.ok((e.description||'').length>=45,`Activity description too short: ${title}`);
  if(price) assert.equal(e.costStatus,price,`Price label wrong: ${title}`);
}
for(const [id,title] of [
 ['rss-6abc15d2035faf0033d92969','Halloween Party'],
 ['rss-6ac4082ede300e0045186d78','Halloween Festival at Joyce Ellington Branch']
]) {
  const e=events.find(x=>x.id===id);
  assert.ok(e, `SJPL missed a late-page event: ${title}`);
  assert.equal(e.dateValue.slice(0,10),'2026-10-31');
  assert.equal(e.source,'San José Public Library');
}
console.log('Halloween weekend organizer and paginated library coverage passed');

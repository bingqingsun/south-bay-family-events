import fs from 'node:fs';

const file = process.argv[2] || 'data/events.json';
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const events = Array.isArray(raw) ? raw : (raw.events || []);
const today = new Date().toISOString().slice(0, 10);

function future(event) {
  const end = String(event.endDateValue || event.dateValue || '').slice(0, 10);
  return !end || end >= today;
}

function fallbackLike(event) {
  const image = String(event.image || '');
  return !image || /(?:fallback|placeholder|default[-_ ]?image|assets\/.*(?:fallback|default))/i.test(image);
}

const affected = events.filter(event => future(event) && fallbackLike(event));
const bySource = new Map();
for (const event of affected) {
  const key = event.source || 'Unknown';
  bySource.set(key, (bySource.get(key) || 0) + 1);
}

const report = {
  generatedAt: new Date().toISOString(),
  futureEvents: events.filter(future).length,
  fallbackOrMissingImages: affected.length,
  bySource: [...bySource.entries()].sort((a,b) => b[1]-a[1]).map(([source,count]) => ({source,count})),
  events: affected.map(event => ({
    id: event.id || '',
    title: event.title || '',
    dateValue: event.dateValue || '',
    source: event.source || '',
    url: event.url || event.canonicalUrl || '',
    image: event.image || '',
    imageStatus: event.imageStatus || (event.image ? 'unclassified' : 'missing'),
    imageFailureReason: event.imageFailureReason || (event.image ? '' : 'no_image_in_event_data'),
    imageProvenance: event.imageProvenance || null
  }))
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'events.json');
const EVENTS_DIR = path.join(ROOT, 'events');

const PILOTS = [
  { slug: 'monster-mash-cupertino', title: /monster mash/i },
  { slug: 'cupertino-fall-bike-fest', title: /cupertino fall bike fest/i },
  { slug: 'santa-clara-parade-of-champions', title: /parade of champions/i },
  { slug: 'breakfast-with-santa', title: /breakfast with santa/i },
  { slug: 'science-of-spa-day', title: /science of spa day/i },
  { slug: 'mariachi-estelar', title: /mariachi estelar/i }
];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function eventList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.items)) return payload.items;
  throw new Error('Unsupported events.json shape');
}

function matches(event, pilot) {
  if (!pilot.title.test(clean(event.title))) return false;
  if (pilot.source && !pilot.source.test(clean(event.source))) return false;
  return true;
}

function firstSession(event) {
  return Array.isArray(event.sessions) && event.sessions.length ? event.sessions[0] : event;
}

function absoluteImage(value) {
  const image = clean(value);
  if (!image) return 'https://southbayfamilyfinds.com/assets/home-hero-family-v1.jpg';
  if (/^https?:\/\//i.test(image)) return image;
  return 'https://southbayfamilyfinds.com/' + image.replace(/^\/+/, '');
}

function officialUrl(event, session) {
  const value = clean(session?.url || event.url);
  return /^https?:\/\//i.test(value) ? value : '';
}

function dateText(value) {
  const v = clean(value);
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: v.includes('T') ? 'numeric' : undefined,
    minute: v.includes('T') ? '2-digit' : undefined
  }).format(d);
}

function schema(event, session, canonical) {
  const startDate = clean(session?.dateValue || event.dateValue);
  if (!startDate) return '';
  const endDate = clean(session?.endDateValue || event.endDateValue);
  const locationName = clean(session?.place || event.place || event.city);
  const streetAddress = clean(session?.address || event.address);
  const city = clean(event.city);
  const organizer = clean(event.source);
  const sourceUrl = officialUrl(event, session);
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: clean(event.title),
    startDate,
    url: canonical,
    description: clean(event.description || event.parentSummary),
    image: [absoluteImage(event.image)],
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: locationName || city || 'South Bay',
      address: {
        '@type': 'PostalAddress',
        streetAddress: streetAddress || undefined,
        addressLocality: city || undefined,
        addressRegion: 'CA',
        addressCountry: 'US'
      }
    },
    organizer: organizer ? {
      '@type': 'Organization',
      name: organizer,
      url: sourceUrl || undefined
    } : undefined
  };
  if (endDate) payload.endDate = endDate;
  return JSON.stringify(payload, null, 2);
}

function render(event, pilot) {
  const session = firstSession(event);
  const canonical = `https://southbayfamilyfinds.com/events/${pilot.slug}/`;
  const title = clean(event.title);
  const city = clean(event.city);
  const description = clean(event.description || event.parentSummary);
  const source = clean(event.source);
  const sourceUrl = officialUrl(event, session);
  const place = clean(session?.place || event.place);
  const address = clean(session?.address || event.address);
  const startDate = clean(session?.dateValue || event.dateValue);
  const age = clean(event.ageLabel || event.ageDisplay || '');
  const cost = clean(event.costLabel || '');
  const metaDescription = clean(
    `${title}${city ? ` in ${city}` : ''}: dates, location and family details verified from the official event source.`
  ).slice(0, 160);
  const eventSchema = schema(event, session, canonical);

  const fact = (label, value) => value
    ? `<div class="event-fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(metaDescription)}" />
  <meta property="og:site_name" content="South Bay Family Finds" />
  <meta property="og:title" content="${escapeHtml(title)} | South Bay Family Finds" />
  <meta property="og:description" content="${escapeHtml(metaDescription)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${escapeHtml(absoluteImage(event.image))}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" href="../../assets/brand/south-bay-family-finds-mark-v2.svg" type="image/svg+xml" />
  <title>${escapeHtml(title)}${city ? ` in ${escapeHtml(city)}` : ''} | South Bay Family Finds</title>
  <link rel="stylesheet" href="../../styles.css?v=20260830-1" />
  <link rel="stylesheet" href="../../design-system.css?v=20260919-1" />
  <link rel="stylesheet" href="../../event-detail.css?v=20260925-1" />
  ${eventSchema ? `<script type="application/ld+json">${eventSchema.replaceAll('</', '<\\/')}</script>` : ''}
</head>
<body class="site-page event-detail-page">
  <main>
    <nav class="site-nav wrap">
      <a class="brand" href="../../" aria-label="South Bay Family Finds home"><img class="brand-mark" src="../../assets/brand/south-bay-family-finds-mark-v2.svg" width="36" height="36" alt="" /><span class="brand-name"><span>South Bay Family</span> <span class="brand-accent">Finds</span></span></a>
      <div><a href="../../#events">Find events</a><a href="../../about.html">About</a></div>
    </nav>

    <article class="event-detail wrap">
      <nav class="event-breadcrumbs" aria-label="Breadcrumb"><a href="../../">Home</a><span>/</span><a href="../../#events">Family activities</a><span>/</span><span aria-current="page">${escapeHtml(title)}</span></nav>

      <header class="event-detail-header">
        <p class="eyebrow">FAMILY ACTIVITY</p>
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p class="event-detail-summary">${escapeHtml(description)}</p>` : ''}
      </header>

      <div class="event-detail-layout">
        <section class="event-detail-main" aria-labelledby="eventDetailsHeading">
          <h2 id="eventDetailsHeading">Event details</h2>
          <dl class="event-facts">
            ${fact('Date & time', dateText(startDate))}
            ${fact('Venue', place)}
            ${fact('Address', address)}
            ${fact('City', city)}
            ${fact('Age', age)}
            ${fact('Cost', cost)}
            ${fact('Organizer', source)}
          </dl>

          <section class="event-source-note">
            <h2>Before you go</h2>
            <p>South Bay Family Finds uses organizer-provided information for this listing. Times, availability, pricing, and registration can change, so please confirm the latest details with the organizer before leaving.</p>
            ${sourceUrl ? `<p><a class="event-official-link" href="${escapeHtml(sourceUrl)}" rel="noopener noreferrer">View official event source →</a></p>` : ''}
          </section>
        </section>

        <aside class="event-detail-aside">
          <img src="${escapeHtml(absoluteImage(event.image))}" alt="" loading="eager" />
          <a href="../../#events">Explore more South Bay family activities →</a>
        </aside>
      </div>
    </article>
  </main>

  <footer><div class="wrap"><a class="brand" href="../../"><img class="brand-mark" src="../../assets/brand/south-bay-family-finds-mark-v2.svg" width="36" height="36" alt="" /><span class="brand-name"><span>South Bay Family</span> <span class="brand-accent">Finds</span></span></a><p>Made for curious South Bay families · Please confirm details with the organizer</p><div class="legal-links"><a class="privacy-link" href="../../about.html">About &amp; contact</a><a class="privacy-link" href="../../privacy.html">Privacy &amp; analytics</a><a class="privacy-link" href="../../terms.html">Terms &amp; data notice</a></div></div></footer>
</body>
</html>
`;
}

const payload = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const events = eventList(payload);
const selected = [];

for (const pilot of PILOTS) {
  const event = events.find(item => matches(item, pilot));
  if (!event) {
    console.error(`Pilot event not found: ${pilot.slug}`);
    process.exitCode = 1;
    continue;
  }
  const session = firstSession(event);
  if (!clean(event.title) || !clean(event.description || event.parentSummary) || !officialUrl(event, session)) {
    console.error(`Pilot event lacks minimum verified detail-page fields: ${pilot.slug}`);
    process.exitCode = 1;
    continue;
  }
  selected.push({ pilot, event });
}

if (process.exitCode) process.exit(process.exitCode);

fs.rmSync(EVENTS_DIR, { recursive: true, force: true });
fs.mkdirSync(EVENTS_DIR, { recursive: true });

for (const { pilot, event } of selected) {
  const dir = path.join(EVENTS_DIR, pilot.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(event, pilot));
}

console.log(`Generated ${selected.length} pilot event detail pages:`);
for (const { pilot, event } of selected) console.log(`- ${pilot.slug}: ${clean(event.title)}`);

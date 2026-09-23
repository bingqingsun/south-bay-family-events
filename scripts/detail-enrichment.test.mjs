import assert from 'node:assert/strict';
import { enrichEventFromDetail, detailCompletenessScore, DETAIL_QUALITY_STATES } from './lib/detail-enrichment.mjs';

const baseEvent = {
  id: 'e1',
  title: 'Family Lantern Night',
  source: 'City Test',
  url: 'https://example.gov/events/old-lantern-night',
  canonicalUrl: 'https://example.gov/events/old-lantern-night',
  dateValue: '2026-09-26',
  endDateValue: '2026-09-26T23:59:59',
  city: 'San Jose',
  place: 'City Test',
  address: '',
  description: 'Families make lanterns, listen to music, and join an evening community celebration.',
  image: '',
  ageLabel: 'Family-friendly',
  ageRanges: [],
  costStatus: 'unknown',
  registrationStatus: 'unknown'
};

const source = { name: 'City Test', method: 'civic', domain: 'example.gov', city: 'San Jose' };

// Generic schema.org enrichment strengthens canonical-page facts after URL
// resolution. URL selection itself remains the resolver/Link Health contract.
{
  const html = `
  <html><head>
    <link rel="canonical" href="/events/family-lantern-night">
    <meta property="og:image" content="/images/lantern.jpg">
    <script type="application/ld+json">
    {
      "@context":"https://schema.org",
      "@type":"Event",
      "name":"Family Lantern Night",
      "startDate":"2026-09-26T18:00:00",
      "endDate":"2026-09-26T20:30:00",
      "url":"https://example.gov/events/family-lantern-night",
      "location":{
        "@type":"Place",
        "name":"Civic Plaza",
        "address":{"@type":"PostalAddress","streetAddress":"100 Main St","addressLocality":"San Jose"}
      },
      "offers":{"@type":"Offer","price":"12"},
      "image":"https://example.gov/images/lantern-official.jpg"
    }
    </script>
  </head><body><h1>Family Lantern Night</h1></body></html>`;
  const result = enrichEventFromDetail(baseEvent, {
    source, html,
    finalUrl: 'https://example.gov/events/family-lantern-night',
    mode: 'revalidated-missing',
    verifiedAt: '2026-09-21T12:00:00Z'
  });
  assert.equal(result.event.id, 'e1');
  assert.equal(result.event.url, 'https://example.gov/events/old-lantern-night');
  assert.equal(result.event.dateValue, '2026-09-26T18:00:00');
  assert.equal(result.event.endDateValue, '2026-09-26T20:30:00');
  assert.equal(result.event.place, 'Civic Plaza');
  assert.equal(result.event.address, '100 Main St, San Jose');
  assert.equal(result.event.costStatus, 'paid');
  assert.equal(result.event.costLabel, '$12');
  assert.equal(result.event.image, 'https://example.gov/images/lantern-official.jpg');
  assert.equal(result.event.imageStatus, 'official');
  assert.equal(result.event.imageProvenance.method, 'schema.org');
  assert.equal(result.event.imageProvenance.score, 100);
  assert.equal(result.event.detailStatus, 'enriched');
  assert.ok(result.diagnostics.fields_updated.includes('dateValue'));
}


// Image v2: a listing card may provide an official image when title, detail
// href and the single image are bound inside the same event container.
{
  const event = { ...baseEvent, image: '' };
  const html = `<html><body>
    <article class="event-card">
      <a href="/events/family-lantern-night"><h2>Family Lantern Night</h2></a>
      <img src="/images/lantern-card.jpg" alt="">
    </article>
    <article class="event-card">
      <a href="/events/adult-tax-workshop"><h2>Adult Tax Workshop</h2></a>
      <img src="/images/tax.jpg" alt="">
    </article>
  </body></html>`;
  const result = enrichEventFromDetail(event, { source, html, finalUrl: event.url });
  assert.equal(result.event.image, 'https://example.gov/images/lantern-card.jpg');
  assert.equal(result.event.imageProvenance.method, 'card-dom-bound');
  assert.equal(result.event.imageProvenance.evidence, 'same-card-title-link-image');
}

// Image v2: multi-image ambiguous containers stay conservative rather than
// borrowing a neighboring activity image.
{
  const event = { ...baseEvent, image: '' };
  const html = `<html><body><section>
    <a href="/events/family-lantern-night"><h2>Family Lantern Night</h2></a>
    <img src="/images/one.jpg"><img src="/images/two.jpg">
  </section></body></html>`;
  const result = enrichEventFromDetail(event, { source, html, finalUrl: event.url });
  assert.equal(result.event.image, '');
  assert.equal(result.event.imageStatus, 'missing');
  assert.equal(result.event.imageFailureReason, 'no_verified_official_image_candidate');
}

// Image v2: event-specific OG title is valid evidence even when the image URL
// is a CMS asset path with no event words.
{
  const event = { ...baseEvent, image: '' };
  const html = `<html><head>
    <meta property="og:title" content="Family Lantern Night">
    <meta property="og:image" content="/uploads/2026/09/hero-18492.jpg">
  </head><body><h1>Family Lantern Night</h1></body></html>`;
  const result = enrichEventFromDetail(event, { source, html, finalUrl: event.url });
  assert.equal(result.event.image, 'https://example.gov/uploads/2026/09/hero-18492.jpg');
}

// Official page with no price must not invent a price.
{
  const html = `<html><body><h1>Family Lantern Night</h1><p>Bring your family for crafts and music.</p></body></html>`;
  const result = enrichEventFromDetail(baseEvent, { source, html, finalUrl: baseEvent.url });
  assert.equal(result.event.costStatus, 'unknown');
  assert.equal(result.event.registrationStatus, 'unknown');
}

// Explicit cancellation is never silently revalidated.
{
  const html = `<html><body><h1>Family Lantern Night</h1><p>This event has been cancelled.</p></body></html>`;
  const result = enrichEventFromDetail(baseEvent, { source, html, finalUrl: baseEvent.url });
  assert.equal(result.diagnostics.quality_state, DETAIL_QUALITY_STATES.CANCELLED);
  assert.equal(result.diagnostics.detail_status, 'cancelled');
}

// Identity mismatch protects against a recycled or redirected detail URL.
{
  const html = `<html><body><h1>Adult Tax Workshop</h1><p>Tax filing information for adults.</p></body></html>`;
  const result = enrichEventFromDetail(baseEvent, { source, html, finalUrl: baseEvent.url });
  assert.equal(result.diagnostics.detail_status, 'identity-mismatch');
  assert.deepEqual(result.event, baseEvent);
}

// Midnight schema placeholders must not turn a date-only occurrence into
// a user-visible 12:00 AM event or make it expire at the start of the day.
{
  const html = `<html><body><h1>Family Lantern Night</h1>
    <script type="application/ld+json">{
      "@context":"https://schema.org","@type":"Event","name":"Family Lantern Night",
      "startDate":"2026-09-26T00:00:00","endDate":"2026-09-26T00:00:00"
    }</script>
  </body></html>`;
  const result = enrichEventFromDetail(baseEvent, { source, html, finalUrl: baseEvent.url });
  assert.equal(result.event.dateValue, '2026-09-26');
  assert.equal(result.event.endDateValue, '2026-09-26T23:59:59');
}

// A date-only schema start paired with an end at 00:00 is also an all-day
// placeholder. Preserve the previously verified end-of-day behavior.
{
  const html = `<html><body><h1>Family Lantern Night</h1>
    <script type="application/ld+json">{
      "@context":"https://schema.org","@type":"Event","name":"Family Lantern Night",
      "startDate":"2026-09-26","endDate":"2026-09-26T00:00:00"
    }</script>
  </body></html>`;
  const result = enrichEventFromDetail(baseEvent, { source, html, finalUrl: baseEvent.url });
  assert.equal(result.event.dateValue, '2026-09-26');
  assert.equal(result.event.endDateValue, '2026-09-26T23:59:59');
}

// Generic pages may mention "family" in global navigation. Without structured
// audience evidence that must not create an age label.
{
  const event = { ...baseEvent, ageLabel: '', ageRanges: [], ageBands: [] };
  const html = `<html><body><nav>Family resources</nav><h1>Family Lantern Night</h1>
    <p>Lantern making and music.</p></body></html>`;
  const result = enrichEventFromDetail(event, { source, html, finalUrl: event.url });
  assert.equal(result.event.ageLabel, '');
}

// Cupertino adapter: recover text-only time and address when structured data is absent.
{
  const cupertinoSource = { name: 'City of Cupertino', method: 'cupertino', domain: 'cupertino.gov', city: 'Cupertino' };
  const event = {
    ...baseEvent,
    id: 'pumpkin',
    title: 'Pumpkin Pool-ooza',
    source: 'City of Cupertino',
    url: 'https://www.cupertino.gov/Parks-Recreation/Events/Pumpkin-Pool-ooza',
    canonicalUrl: 'https://www.cupertino.gov/Parks-Recreation/Events/Pumpkin-Pool-ooza',
    dateValue: '2026-09-27',
    city: 'Cupertino',
    place: 'City of Cupertino',
    description: 'Pumpkin Pool-ooza features swimming, pumpkin decorating, games, and music.'
  };
  const html = `<html><body>
    <h1>Pumpkin Pool-ooza</h1>
    <p>Next date: Sunday, September 27, 2026 | 10:00 AM to 11:30 AM</p>
    <p>Blackberry Farm Pools 21979 San Fernando Avenue Cupertino, CA 95014</p>
    <p>Cupertino resident $14 Non-resident $18. Registration is required for every person attending.</p>
  </body></html>`;
  const result = enrichEventFromDetail(event, {
    source: cupertinoSource,
    html,
    finalUrl: event.url,
    mode: 'revalidated-missing'
  });
  assert.equal(result.event.dateValue, '2026-09-27T10:00:00');
  assert.equal(result.event.endDateValue, '2026-09-27T11:30:00');
  assert.equal(result.event.place, 'Blackberry Farm Pools');
  assert.equal(result.event.address, '21979 San Fernando Avenue, Cupertino');
  assert.equal(result.event.costLabel, '$14–$18');
  assert.equal(result.event.registrationStatus, 'required');
}


// Symphony adapter: an official season listing binds the image immediately
// preceding a concert title when generic structured/OG evidence is absent.
{
  const symphonySource = { name: 'Symphony San Jose', method: 'symphony', domain: 'symphonysanjose.org', city: 'San Jose' };
  const event = {
    ...baseEvent,
    id: 'spooktacular',
    title: 'Symphonic Spooktacular',
    source: 'Symphony San Jose',
    url: 'https://www.symphonysanjose.org/attend/2026-2027-season/concerts-2026-2027/',
    canonicalUrl: 'https://www.symphonysanjose.org/attend/2026-2027-season/concerts-2026-2027/',
    image: ''
  };
  const html = `<html><body>
    <div class="concert"><img src="/wp-content/uploads/2026/01/5.jpg" alt="5">
      <h3>Symphonic Spooktacular</h3>
      <a href="/attend/2026-2027-season/concerts/symphonic-spooktacular/">Tickets & Information</a>
    </div>
  </body></html>`;
  const result = enrichEventFromDetail(event, { source: symphonySource, html, finalUrl: event.url });
  assert.equal(result.event.image, 'https://www.symphonysanjose.org/wp-content/uploads/2026/01/5.jpg');
  assert.equal(result.event.imageProvenance.method, 'symphony-season-card');
  assert.equal(result.event.imageProvenance.score, 90);
}

// Completeness is diagnostic only and should favor exact actionable details.
{
  const sparse = detailCompletenessScore(baseEvent);
  const complete = detailCompletenessScore({
    ...baseEvent,
    dateValue: '2026-09-26T18:00:00',
    endDateValue: '2026-09-26T20:00:00',
    place: 'Civic Plaza',
    address: '100 Main St, San Jose',
    image: 'https://example.gov/image.jpg',
    ageLabel: 'Ages 5+',
    costStatus: 'free',
    registrationStatus: 'not-required'
  });
  assert.ok(complete > sparse);
  assert.equal(complete, 100);
}

console.log('detail-enrichment tests passed');

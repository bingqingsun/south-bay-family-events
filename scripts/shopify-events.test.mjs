import assert from 'node:assert/strict';
import { shopifyEventSeeds } from './shopify-events.mjs';
const source = { feedUrl: 'https://www.sanjosemade.com/pages.json', discoveryDays: 90 };
const page = { title: 'Holiday Fair 2026', handle: 'holiday-fair-2026',
  body_html: '<p>Discover handmade gifts and local artists.</p><h2>Event Details</h2>Location: Convention Center, 500 Main St, Santa Clara, CA (view on Google Maps) Date: November 27, 2026 and November 28, 2026 Time: 11 AM to 6 PM. Free admission.' };
const found = shopifyEventSeeds([page], source, '2026-11-17');
assert.equal(found.length, 1);
assert.equal(found[0].dateValue, '2026-11-27');
assert.equal(found[0].endDateValue, '2026-11-28');
assert.equal(found[0].city, 'Santa Clara');
assert.equal(shopifyEventSeeds([page], source, '2026-12-01').length, 0);
assert.equal(shopifyEventSeeds([page], source, '2026-01-01').length, 0);
assert.equal(shopifyEventSeeds([{ ...page, body_html: 'Vendor applications open now' }], source, '2026-11-17').length, 0);
console.log('Shopify discovery dates, horizon and visitor event checks passed.');

import assert from 'node:assert/strict';
import { sameCupertinoListingDay, selectCupertinoDetailDates, explicitCupertinoDetailDay, cupertinoDetailConflictsWithOccurrence } from './cupertino-detail-date.mjs';

assert.equal(sameCupertinoListingDay('2026-09-27T10:00:00', '2026-09-27'), true);
assert.equal(sameCupertinoListingDay('2025-09-27T10:00:00', '2026-09-27'), false);

const staleSchema = selectCupertinoDetailDates({
  listingStart: '2026-09-27',
  listingEnd: '2026-09-27T23:59:59',
  schemaStart: '2025-09-27T10:00:00',
  schemaEnd: '2025-09-27T11:30:00',
  visibleStart: '2026-09-27T10:00:00',
  visibleEnd: '2026-09-27T11:30:00'
});
assert.equal(staleSchema.startDateValue, '2026-09-27T10:00:00');
assert.equal(staleSchema.endDateValue, '2026-09-27T11:30:00');
assert.equal(staleSchema.ignoredSchemaStart, true);
assert.equal(staleSchema.ignoredSchemaEnd, true);

const matchingSchema = selectCupertinoDetailDates({
  listingStart: '2026-09-27',
  listingEnd: '2026-09-27T23:59:59',
  schemaStart: '2026-09-27T09:45:00',
  schemaEnd: '2026-09-27T11:45:00',
  visibleStart: '2026-09-27T10:00:00',
  visibleEnd: '2026-09-27T11:30:00'
});
assert.equal(matchingSchema.startDateValue, '2026-09-27T09:45:00');
assert.equal(matchingSchema.endDateValue, '2026-09-27T11:45:00');
assert.equal(matchingSchema.ignoredSchemaStart, false);

const noUsableDetailDate = selectCupertinoDetailDates({
  listingStart: '2026-10-03',
  listingEnd: '2026-10-03T23:59:59',
  schemaStart: '2025-10-03T08:00:00',
  visibleStart: '2025-10-03T08:00:00'
});
assert.equal(noUsableDetailDate.startDateValue, '2026-10-03');

const santaPage = 'Breakfast with Santa Next date: Saturday, December 05, 2026 | 08:30 AM to 11:30 AM When Saturday, December 05, 2026 | 08:30 AM - 11:30 AM';
assert.equal(explicitCupertinoDetailDay(santaPage), '2026-12-05');
assert.equal(cupertinoDetailConflictsWithOccurrence(santaPage, '2026-12-06T08:30:00'), true);
assert.equal(cupertinoDetailConflictsWithOccurrence(santaPage, '2026-12-05T08:30:00'), false);
assert.equal(cupertinoDetailConflictsWithOccurrence('Navigation December 5, 2026 Contact Us', '2026-12-06'), false);

// Run venue regression checks in the existing Cupertino CI test suite.
const { cupertinoVenueFromHeading } = await import('./cupertino-venue.mjs');
const santaVenueHtml = '<h1>Breakfast with Santa</h1><p>Photos with Santa!</p><h6>Quinlan Community Center</h6><p>10185 North Stelling Road, Cupertino</p><h3>Contact Us</h3><p>10300 Torre Ave</p>';
assert.equal(cupertinoVenueFromHeading(santaVenueHtml, '10185 North Stelling Road', 'Breakfast with Santa'), 'Quinlan Community Center');
assert.equal(cupertinoVenueFromHeading(santaVenueHtml, '10300 Torre Ave', 'Breakfast with Santa'), '');
const { cleanCupertinoVenueCandidate } = await import('./cupertino-venue.mjs');
const { parseCupertinoDetail } = await import('./lib/source-adapters/cupertino.mjs');
assert.equal(cleanCupertinoVenueCandidate('Santa Quinlan Community Center', 'Breakfast with Santa'), 'Quinlan Community Center');
assert.equal(cleanCupertinoVenueCandidate('Santa Clara Community Center', 'Breakfast with Santa'), 'Santa Clara Community Center');
assert.equal(cleanCupertinoVenueCandidate('Quinlan Community Center', 'Breakfast with Santa'), 'Quinlan Community Center');
const santaFlattenedPage = '<h1>Breakfast with Santa</h1><p>Next date: Saturday, December 05, 2026 | 08:30 AM to 11:30 AM</p><p>Photos with Santa Quinlan Community Center 10185 North Stelling Road, Cupertino</p>';
const santaCanonical = parseCupertinoDetail({ html: santaFlattenedPage, event: { title: 'Breakfast with Santa' } });
assert.equal(santaCanonical.venue, 'Quinlan Community Center', 'Canonical detail adapter must not reintroduce the title word Santa');
assert.equal(santaCanonical.streetAddress, '10185 North Stelling Road, Cupertino');

console.log('Cupertino detail date and venue guard tests passed');

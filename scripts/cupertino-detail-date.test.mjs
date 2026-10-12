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

console.log('Cupertino detail date guard tests passed');

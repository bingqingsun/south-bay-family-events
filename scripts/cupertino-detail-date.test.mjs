import assert from 'node:assert/strict';
import { sameCupertinoListingDay, selectCupertinoDetailDates } from './cupertino-detail-date.mjs';

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

console.log('Cupertino detail date guard tests passed');

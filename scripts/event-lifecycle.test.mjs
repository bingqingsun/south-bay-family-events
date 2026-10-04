import assert from 'node:assert/strict';
import {
  effectiveEndDateValue,
  isStillActive,
  isUpcomingByEventWindow,
  officialDateWindowFromText
} from './lib/event-lifecycle.mjs';

const festival = {
  title: 'Glass Pumpkin Festival',
  format: 'festival',
  dateValue: '2026-10-02',
  endDateValue: '2026-10-04'
};
assert.equal(isUpcomingByEventWindow(festival, '2026-10-03'), true);
assert.equal(isUpcomingByEventWindow(festival, '2026-10-04'), true);
assert.equal(isUpcomingByEventWindow(festival, '2026-10-05'), false);
assert.equal(isStillActive(festival, '2026-10-03T12:00:00'), true);
assert.equal(isStillActive(festival, '2026-10-04T23:00:00'), true);
assert.equal(isStillActive(festival, '2026-10-05T00:00:00'), false);

assert.equal(
  effectiveEndDateValue({ dateValue: '2026-10-04' }),
  '2026-10-04T23:59:59'
);

const santanaWindow = officialDateWindowFromText(
  'Date: October 4, 2026 - October 4, 2026. Schedule: Friday, October 2nd from 3 pm – 9 pm; Saturday, October 3rd from 10 am – 9 pm; Sunday, October 4th from 10 am – 5 pm',
  { referenceDateValue: '2026-10-04', maxSpanDays: 14 }
);
assert.deepEqual(santanaWindow, {
  startDateValue: '2026-10-02',
  endDateValue: '2026-10-04'
});

const boundedWindow = officialDateWindowFromText(
  'October 2, 2026. Unrelated archive note: November 20, 2026.',
  { referenceDateValue: '2026-10-02', maxSpanDays: 14 }
);
assert.deepEqual(boundedWindow, {
  startDateValue: '2026-10-02',
  endDateValue: '2026-10-02'
});

console.log('event lifecycle tests passed');

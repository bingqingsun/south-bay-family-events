const assert = require('node:assert/strict');
const { displayLabel } = require('../age-policy.js');

assert.equal(
  displayLabel({ ageLabel: 'Ages 2–12', ageRanges: [[2, 12]], ageSource: 'Official audience information' }),
  'Ages 2–12'
);
assert.equal(
  displayLabel({ ageLabel: 'Ages 6+', ageRanges: [[6, 18]], ageSource: 'Official audience information' }),
  'Ages 6+'
);
assert.equal(
  displayLabel({ ageLabel: 'Grades K–5', ageRanges: [[5, 10]], ageSource: 'Official organizer grade range' }),
  'Grades K–5'
);
assert.equal(
  displayLabel({ ageLabel: 'All ages', ageRanges: [[0, 18]], ageSource: 'Official audience information' }),
  'All ages'
);
assert.equal(
  displayLabel({ ageLabel: 'Family-friendly', ageRanges: [], ageSource: 'Official audience information' }),
  'Family-friendly'
);

// Filtering metadata is not display evidence.
assert.equal(
  displayLabel({ ageRanges: [[5, 10]], ageMin: 5, ageMax: 10, ageSource: 'Official organizer grade range' }),
  ''
);
assert.equal(
  displayLabel({ ageLabel: 'Ages 5–10', ageRanges: [[5, 10]] }),
  ''
);

console.log('Age display policy tests passed');

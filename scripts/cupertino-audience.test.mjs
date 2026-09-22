import assert from 'node:assert/strict';
import { cupertinoAudienceEvidence } from './cupertino-audience.mjs';

const chrome = 'Parks & Recreation Preschool Teens Adult 50+ Classes Camps';
assert.equal(
  cupertinoAudienceEvidence('Kids & family', chrome),
  'Kids & family'
);

assert.equal(
  cupertinoAudienceEvidence(
    'Kids & family',
    'Monster Mash is a kids Halloween event in Cupertino for children ages 2–12 and their families.'
  ),
  'Kids & family children ages 2–12 Ages 2–12'
);

assert.equal(
  cupertinoAudienceEvidence(
    'Kids & family',
    'Performers of all ages. $5 for all attendees. Preschool Teens'
  ),
  'Kids & family'
);

assert.equal(
  cupertinoAudienceEvidence(
    'Kids & family Youth events',
    'High school students can volunteer. Adults over the age of 18 can volunteer.'
  ),
  'Kids & family Youth events'
);

assert.equal(
  cupertinoAudienceEvidence(
    'Kids & family',
    'Recommended for ages 6 and up.'
  ),
  'Kids & family ages 6 and up'
);

console.log('Cupertino audience evidence tests passed');

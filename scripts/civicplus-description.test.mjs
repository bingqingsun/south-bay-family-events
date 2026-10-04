import assert from 'node:assert/strict';
import { selectCivicPlusEventDescription } from './civicplus-description.mjs';

const html = `
<div class="fr-view"><p>Our summertime Movie Nights Out bring family friendly movies to the big screen in parks throughout Milpitas.</p></div>
<div class="fr-view"><p>Milpitas celebrates the late summer Harvest Moon with a family-friendly Lantern Festival at Civic Center Plaza, incorporating cultural traditions of our large Vietnamese community.</p></div>
<div><p>Guests can decorate lanterns and enjoy colorful dance performances, lively music and fare from local food trucks.</p></div>
`;
const picked = selectCivicPlusEventDescription(html, 'Lantern Festival', 'fallback');
assert.match(picked, /Harvest Moon/);
assert.doesNotMatch(picked, /Movie Nights Out/);

const fallback = selectCivicPlusEventDescription('<p>Generic city information only.</p>', 'Tree Lighting', 'Verified fallback copy');
assert.equal(fallback, 'Verified fallback copy');

const paloAltoHtml = `
<main>
  <h1>Bike Palo Alto</h1>
  <p>Explore Palo Alto’s parks, open spaces and other fun destinations using route maps to find little known bike bridges, off-road trails and less traveled streets that make bicycling Palo Alto easy and fun.</p>
  <p>This free, city-sponsored event offers booths with bicycle mini tune-ups, helmet fitting help, safe riding tips, and more.</p>
</main>
<footer>
  <p>Find details at Fairmeadow Elementary School, 500 E. Meadow Drive, Palo Alto, CA, View Map 500 E. Meadow Drive, Palo Alto, CA Fields marked as 'Required' must be completed Email Address * (Required) Enter your email address or your friend's email addresses all separated by commas.</p>
</footer>
`;
const paloAltoPicked = selectCivicPlusEventDescription(
  paloAltoHtml,
  'Bike Palo Alto',
  'Bike Palo Alto is an annual, family-friendly event encouraging people of all ages and abilities to bike more places more often.'
);
assert.match(paloAltoPicked, /Explore Palo Alto’s parks/);
assert.doesNotMatch(paloAltoPicked, /Email Address|View Map|Fields marked/i);

const singleParagraphPaloAlto = `
<main>
  <h1>Bike Palo Alto</h1>
  <p>Explore Palo Alto’s parks, open spaces and other fun destinations using route maps to find little known bike bridges, off-road trails and less traveled streets that make bicycling Palo Alto easy and fun.</p>
  <p>Find details at Fairmeadow Elementary School, 500 E. Meadow Drive, Palo Alto, CA, View Map 500 E. Meadow Drive, Palo Alto, CA Fields marked as 'Required' must be completed Email Address * (Required) Enter your email address or your friend's email addresses all separated by commas.</p>
</main>
`;
const singleParagraphPicked = selectCivicPlusEventDescription(
  singleParagraphPaloAlto,
  'Bike Palo Alto',
  'Bike Palo Alto is an annual, family-friendly event encouraging people of all ages and abilities to bike more places more often.'
);
assert.match(singleParagraphPicked, /Explore Palo Alto’s parks/);
assert.doesNotMatch(singleParagraphPicked, /Email Address|View Map|Fields marked/i);

console.log('CivicPlus description selection contracts passed');

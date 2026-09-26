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

console.log('CivicPlus description selection contracts passed');

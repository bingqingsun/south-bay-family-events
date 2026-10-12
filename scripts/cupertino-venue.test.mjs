import assert from 'node:assert/strict';
import { cupertinoVenueFromHeading } from './cupertino-venue.mjs';

const officialPage = '<h1>Breakfast with Santa</h1><p>Photos with Santa!</p><h6>Quinlan Community Center</h6><p>10185 North Stelling Road, Cupertino</p><h3>Contact Us</h3><p>10300 Torre Ave</p>';
assert.equal(cupertinoVenueFromHeading(officialPage, '10185 North Stelling Road', 'Breakfast with Santa'), 'Quinlan Community Center');
assert.equal(cupertinoVenueFromHeading(officialPage, '10300 Torre Ave', 'Breakfast with Santa'), '');
assert.equal(cupertinoVenueFromHeading('<h1>Breakfast with Santa</h1><p>10185 North Stelling Road</p>', '10185 North Stelling Road', 'Breakfast with Santa'), '');
assert.equal(cupertinoVenueFromHeading('<h3>Santa Clara Community Center</h3><p>1600 Civic Center Drive</p>', '1600 Civic Center Drive'), 'Santa Clara Community Center');

console.log('Cupertino venue extraction tests passed');

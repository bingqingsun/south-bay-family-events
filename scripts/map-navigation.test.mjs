import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: {}, URL, encodeURIComponent };
vm.runInNewContext(fs.readFileSync(new URL('../map-navigation.js', import.meta.url), 'utf8'), context);
const { getNavigationTarget, providerUrl } = context.window.SBFFMapNavigation;

assert.deepEqual(JSON.parse(JSON.stringify(getNavigationTarget({ event: { address: '1 Main St, San Jose' } }))), { destination: '1 Main St, San Jose', type: 'address' });
assert.deepEqual(getNavigationTarget({ event: { meetingPoint: 'Library entrance' } }), null);
assert.deepEqual(JSON.parse(JSON.stringify(getNavigationTarget({ event: { mapUrl: 'https://www.google.com/maps/@37.3382,-121.8863,15z' } }))), { destination: '37.3382,-121.8863', type: 'coordinates' });
assert.equal(providerUrl('apple_maps', '37.3382,-121.8863'), 'https://maps.apple.com/?daddr=37.3382%2C-121.8863');
assert.equal(providerUrl('google_maps', '1 Main St'), 'https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St');
console.log('map navigation tests passed');

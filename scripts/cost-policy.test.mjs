import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function decodeXml');
const end = source.indexOf('function isClosureNotice');
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const classify = (cost, description) => context.costInfo(cost, description);

let result = classify('', 'No previous skills needed; no registration required; walk-in while supplies last.');
assert.equal(result.costStatus, 'unknown');
assert.equal(result.costSource, '');
assert.equal(result.registrationStatus, 'walk-in');

result = classify('', 'Registration is required before attending.');
assert.equal(result.costStatus, 'unknown', 'registration must not imply payment');
assert.equal(result.registrationStatus, 'required');

result = classify('', 'This is a free event. Registration required.');
assert.equal(result.costLabel, '免费');
assert.equal(result.registrationStatus, 'required');

result = classify('', 'Tickets are available through the official team schedule.');
assert.equal(result.costStatus, 'unknown', 'ticket availability alone does not prove a price');

result = classify('$17–$20', 'Family performance.');
assert.equal(result.costLabel, '$17–$20');

result = classify('', 'Suggested donation of $5 supports the program.');
assert.equal(result.costLabel, '建议捐赠');

result = classify('', 'Paid admission. See the organizer page for current pricing.');
assert.equal(result.costLabel, '需付费／价格见详情');

result = classify('', 'Purchase tickets for $12 admission.');
assert.equal(result.costLabel, '$12');

result = classify('', 'No fee. Registration is required.');
assert.equal(result.costLabel, '免费');
assert.equal(result.registrationStatus, 'required');

result = classify('', 'Member admission $8; non-member admission $12.');
assert.equal(result.costLabel, '会员／非会员价格见详情');

result = classify('', 'Friends members receive book-sale discounts; non-members may buy books starting at $2.');
assert.equal(result.costStatus, 'unknown', 'merchandise pricing must not become event admission pricing');

result = classify('', 'A $10 parking fee may apply. The activity details do not list admission pricing.');
assert.equal(result.costStatus, 'unknown', 'parking fees must not become activity admission prices');

const generatedEvents = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
assert.ok(generatedEvents.length > 0, 'the generated feed must contain activities');
assert.equal(generatedEvents.some(event => event.costLabel === '需购票／价格见详情'), false, 'ambiguous legacy price labels must not be published');
assert.equal(generatedEvents.some(event => event.costStatus === 'unknown' && event.costSource), false, 'unknown costs must stay hidden');
assert.equal(generatedEvents.every(event => ['unknown', 'free', 'paid', 'donation', 'variable'].includes(event.costStatus)), true, 'every activity needs a canonical cost status');
assert.equal(generatedEvents.every(event => ['unknown', 'required', 'recommended', 'not-required', 'walk-in'].includes(event.registrationStatus)), true, 'every activity needs a canonical registration status');
const pumpkinCharm = generatedEvents.find(event => event.title === 'DIY Felt Pumpkin Bag Charms');
assert.equal(pumpkinCharm?.costStatus, 'unknown');
assert.equal(pumpkinCharm?.registrationStatus, 'walk-in');

console.log('Cost and registration policy tests passed.');

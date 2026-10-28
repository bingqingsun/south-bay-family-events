import assert from 'node:assert/strict';
import { isRoutineVenueAccessNotice } from './lib/source-detail-repair.mjs';

for (const title of [
  'CAH Museum Open',
  'CAH Museum Open (during Dia de Muertos)',
  'CAH Museum Open for Welcome in Wednesdays (thru Aug 26)',
  'Chinese American Historical Museum Open',
  'Museum Is Open on Saturday',
  'Gallery Open for Visitors',
  'Visitor Center Open during the Festival',
  'Zoo Open'
]) {
  assert.equal(isRoutineVenueAccessNotice(title), true, `Routine opening should not be a published event: ${title}`);
}
for (const title of [
  'Museum Open House: Family Art Activities',
  'Museum Open Studio',
  'Museum Open (with guided tours)',
  'Museum Open: Special Workshop for Kids',
  'Hands-on Family Workshop at the Museum',
  'Dia de Muertos Celebration at History Park',
  'Chatbots Decoded: Exploring AI',
  'Grand Opening of the New Museum Exhibit',
  'Museum Closed for Thanksgiving Holiday'
]) {
  assert.equal(isRoutineVenueAccessNotice(title), false, `Do not suppress an actual program or separate closure policy: ${title}`);
}
console.log('Routine venue access-notice tests passed.');

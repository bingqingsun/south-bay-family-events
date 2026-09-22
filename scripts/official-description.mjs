// Source adapters may collect several official description fields. Select
// only a field that has already passed the shared parent-facing summary gate;
// an empty or visual placeholder must leave the listing's own copy intact.
export function selectPublishableOfficialDescription(blocks, isPublishable) {
  return blocks.find(value => isPublishable(value)) || '';
}

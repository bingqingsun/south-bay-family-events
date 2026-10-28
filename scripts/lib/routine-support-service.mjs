// A public library calendar is also a directory of appointments, tutoring,
// drop-in support and recurring services. SBFF publishes family outings and
// distinct participatory activities, not those ongoing service listings.
//
// Keep this check narrow and title-led: a hands-on science workshop, playful
// math festival, family storytime or a read-to-therapy-dog event is NOT routine
// tutoring merely because its description mentions learning or practice.
const simplify = text => String(text || '').replace(/&nbsp;|nbsp;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export function isRoutineSupportService(event = {}) {
  const title = simplify(typeof event === 'string' ? event : event.title);
  const details = simplify(typeof event === 'string' ? '' : event.description);
  if (!title) return false;

  // On-demand information services and individual help appointments.
  if (/\b(?:one[ -]?on[ -]?one|1\s*(?:on|to)\s*1)\b/.test(title)
      && /\b(?:tech|computer|digital|reading|tutor|coach|printing|appointment|help|assistance|support)\b/.test(title)) return true;
  if (/\b(?:tech|computer|digital|device)\s+(?:help|assistance|support|mentor(?:ing)?)\b/.test(title)) return true;
  if (/\b(?:3d printing|3-d printing)\s+(?:on demand|service|one[ -]?on[ -]?one appointment)\b/.test(title)) return true;
  if (/\b(?:virtual library app tour|library app tour)\b/.test(title)) return true;

  // Regular math/homework assistance is different from math games, STEM
  // challenges and family workshops that have their own activity.
  if (/\b(?:one\s*in\s*math|oneinmath|math buddies|homework (?:help|coaching|coach|tutoring|support)|homework help)\b/.test(title)) return true;
  if (/\b(?:math club|junior math club)\b/.test(title)
      && /\b(?:tutor(?:ing|s)?|worksheets?|arithmetic|fractions?|math skills|math olympiad)\b/.test(details)) return true;

  // Individual reading support is a standing service. Do not suppress the
  // separately enjoyable reading-to-animals programs or group storytimes.
  const animalReading = /\b(?:dog|dogs|cat|cats|furry friends?|therapy animals?|paws|paws and play)\b/.test(title + ' ' + details);
  if (!animalReading
      && /\b(?:reading buddies|reading partners|reading coach|reading tutoring|reading tutor)\b/.test(title)) return true;

  // General-purpose job-search services are not family leisure activities.
  if (/\b(?:resume (?:review|help)|mock interview|interview\s*(?:&|and)\s*networking skills|job(?:-|\s)search assistance)\b/.test(title)) return true;
  return false;
}

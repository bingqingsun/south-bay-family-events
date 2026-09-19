import assert from 'node:assert/strict';
import {
  assessSummaryReadability,
  buildExtractiveSummary,
  isLikelyFragment,
  selectConcreteSourceSentence,
  selectLabeledActivityBundle,
  splitSourceSentences
} from './event-summary-engine.mjs';

const escapeRegex = value => value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

const sourceFixtures = [
  {
    name: 'concrete activity beats background context',
    source: "It's fall migration season and there are lots of birds in the Secret Garden! Say hi to our feathered friends by making a bird feeder with us; hang your feeder in your own backyard and maybe they will visit you! Supplies are limited.",
    mustInclude: ['making a bird feeder', 'hang your feeder'],
    mustNotInclude: ['identify birds', 'birdwatching']
  },
  {
    name: 'concrete making beats developmental benefit copy',
    source: "We have the LEGOs! Bring your imagination and build something fun! LEGOs will stay at the library, so be sure to snap a pic of your creation! In addition to being a great way to introduce the engineering and art concepts of STEAM, playing with LEGOs supports early childhood development.",
    mustInclude: ['build something fun'],
    mustNotInclude: ['supports early childhood development']
  },
  {
    name: 'mission statement does not beat a later concrete activity',
    source: "Our mission is to inspire curiosity and spark a love for science in younger students. This session will test your brainpower with hands-on activities and simple neuroscience challenges.",
    mustInclude: ['test your brainpower'],
    mustNotInclude: ['Our mission is']
  },
  {
    name: 'background-only copy is not upgraded into a made-up activity',
    source: "Fall is here and the garden is full of color.",
    expected: ''
  }
];

for (const fixture of sourceFixtures) {
  const result = buildExtractiveSummary(fixture.source);
  if ('expected' in fixture) {
    assert.equal(result.summary, fixture.expected, fixture.name);
    continue;
  }
  assert.ok(result.summary, `${fixture.name}: expected a summary`);
  assert.ok(fixture.source.includes(result.summary), `${fixture.name}: summary must remain verbatim source evidence`);
  for (const phrase of fixture.mustInclude || []) {
    assert.match(result.summary, new RegExp(escapeRegex(phrase), 'i'), `${fixture.name}: missing ${phrase}`);
  }
  for (const phrase of fixture.mustNotInclude || []) {
    assert.doesNotMatch(result.summary, new RegExp(escapeRegex(phrase), 'i'), `${fixture.name}: unsupported or wrong emphasis: ${phrase}`);
  }
  assert.equal(assessSummaryReadability(result.summary).ok, true, `${fixture.name}: summary must be readable`);
}

// Sentence segmentation is a general parser concern, not an event-specific
// exception. Abbreviations must not create dangling fragments.
const timeSentence = "Children of all ages: please join us on Wednesday, September 23 at 3:30 p.m. to make beautiful 3D layered greeting cards in celebration of the Mid-Autumn Moon Festival. Online registration required.";
const timeSegments = splitSourceSentences(timeSentence);
assert.equal(timeSegments[0], "Children of all ages: please join us on Wednesday, September 23 at 3:30 p.m. to make beautiful 3D layered greeting cards in celebration of the Mid-Autumn Moon Festival.");
assert.equal(timeSegments[1], 'Online registration required.');

const abbreviationSentence = "Meet Dr. Rivera for a hands-on science demonstration. Families can try the activity afterward.";
assert.equal(splitSourceSentences(abbreviationSentence).length, 2, 'honorific abbreviations must not create fake boundaries');

const adjacentTimeSentences = "The program begins at 10 a.m. Families can make a paper lantern afterward.";
assert.equal(splitSourceSentences(adjacentTimeSentences).length, 2, 'a real sentence after a time abbreviation must remain separate');

// Readability gate: reject dependent clauses, allow complete imperatives.
assert.equal(isLikelyFragment('to make beautiful 3D layered greeting cards in celebration of the festival.'), true);
assert.equal(isLikelyFragment('Make beautiful 3D layered greeting cards in celebration of the festival.'), false);
assert.equal(isLikelyFragment('And enjoy a craft with your family.'), true);

// Multi-activity bundles must remain exact contiguous source excerpts and skip
// operational/accessibility labels.
const festivalSource = "You're invited! Yummy Mooncakes: Eat sweet, delicious treats shaped like the moon! DIY Lanterns: Make your own glowing lantern to take home. Awesome Tales: Explore the origins of the festival and enjoy beautiful moon lore!";
const festivalBundle = selectLabeledActivityBundle(festivalSource);
assert.match(festivalBundle, /Yummy Mooncakes:/);
assert.match(festivalBundle, /DIY Lanterns:/);
assert.match(festivalBundle, /Awesome Tales:/);
assert.ok(festivalSource.includes(festivalBundle), 'activity bundle must remain contiguous official-source evidence');

const sensorySource = "Little Explorers is celebrating fall! Make mess-free leaf art, shoot pom-pom spiders onto sticky webs, and enjoy some not-so spooky fun. Sensory Notes: Sound: Little Explorers may become noisy with lots of play. Visuals: Little Explorers will have different stations for play.";
assert.equal(selectLabeledActivityBundle(sensorySource), '', 'sensory/accessibility sections cannot become activity bundles');
assert.match(selectConcreteSourceSentence(sensorySource), /Make mess-free leaf art/i, 'actual participation must outrank sensory notes');

// Engine contract: it selects evidence but never truncates a selected sentence
// into a stored ellipsis or invents a replacement clause.
const longAction = "Families can create a detailed paper city together using reusable templates, markers, stickers, recycled materials, and guided design prompts while talking with library staff about how neighborhoods are planned and built.";
const longResult = buildExtractiveSummary(longAction);
assert.equal(longResult.summary, longAction, 'selected source sentences are stored whole');
assert.ok(!longResult.summary.endsWith('…'), 'engine must not create ingest-time ellipsis');

console.log('event-summary-engine: parser, grounding, ranking, and readability contracts passed');

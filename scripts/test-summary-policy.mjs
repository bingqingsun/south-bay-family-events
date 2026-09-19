import assert from 'node:assert/strict';
import { selectConcreteSourceSentence, selectLabeledActivityBundle, shouldReplaceWeakSummary } from './summary-policy.mjs';

const escapeRegex = value => value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

const cases = [
  {
    name: 'Birds in Your Backyard selects the official bird-feeder activity',
    source: "It's fall migration season and there are lots of birds in the Secret Garden! Say hi to our feathered friends by making a bird feeder with us; hang your feeder in your own backyard and maybe they will visit you! Supplies are limited.",
    mustInclude: ['making a bird feeder', 'hang your feeder'],
    mustNotInclude: ['identify birds', 'birdwatching']
  },
  {
    name: 'LEGO activity favors the concrete build action over benefit copy',
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

for (const testCase of cases) {
  const summary = selectConcreteSourceSentence(testCase.source);
  if ('expected' in testCase) {
    assert.equal(summary, testCase.expected, testCase.name);
    continue;
  }

  assert.ok(summary, `${testCase.name}: expected a source sentence`);
  assert.ok(testCase.source.includes(summary), `${testCase.name}: summary must be extractive and exist verbatim in official source text`);
  for (const phrase of testCase.mustInclude || []) {
    assert.match(summary, new RegExp(escapeRegex(phrase), 'i'), `${testCase.name}: missing ${phrase}`);
  }
  for (const phrase of testCase.mustNotInclude || []) {
    assert.doesNotMatch(summary, new RegExp(escapeRegex(phrase), 'i'), `${testCase.name}: invented or wrong emphasis: ${phrase}`);
  }
}

console.log(`summary-policy: ${cases.length} regression cases passed`);


const midAutumnSource = "You're Invited to the Mid-Autumn Festival! Check out all the fun waiting for you: Yummy Mooncakes: Eat sweet, delicious treats shaped like the moon! DIY Lanterns: Make your own glowing lantern to take home. Awesome Tales: Explore the origins of the festival and enjoy beautiful moon lore!";
const midAutumnBundle = selectLabeledActivityBundle(midAutumnSource);
assert.match(midAutumnBundle, /Yummy Mooncakes:/, 'multi-activity bundle should keep mooncakes');
assert.match(midAutumnBundle, /DIY Lanterns:/, 'multi-activity bundle should keep lanterns');
assert.match(midAutumnBundle, /Awesome Tales:/, 'multi-activity bundle should keep stories');
assert.ok(midAutumnSource.includes(midAutumnBundle), 'multi-activity bundle must remain a contiguous official-source excerpt');

assert.equal(shouldReplaceWeakSummary("It's fall migration season and there are lots of birds in the Secret Garden!"), true);
assert.equal(shouldReplaceWeakSummary("Our mission is to inspire curiosity and spark a love for science."), true);
assert.equal(shouldReplaceWeakSummary("Come listen, come read, come perform, or simply come to be present."), false);
assert.equal(shouldReplaceWeakSummary("The Happy Birds Show includes over 25 amazing tricks performed by talking and singing parrots."), false);

const littleExplorersSource = "Little Explorers is celebrating fall! Make mess-free leaf art, shoot pom-pom spiders onto sticky webs, and enjoy some not-so spooky fun. Sensory Notes: Sound: Little Explorers may become noisy with lots of play. Visuals: Little Explorers will have different stations for play.";
assert.equal(selectLabeledActivityBundle(littleExplorersSource), '', 'sensory/accessibility labels must not become an activity bundle');
assert.match(selectConcreteSourceSentence(littleExplorersSource), /Make mess-free leaf art/i, 'concrete fall activities should outrank sensory notes');

const midAutumnCardSource = "Children of all ages: please join us on Wednesday, September 23 at 3:30 p.m. to make beautiful 3D layered greeting cards in celebration of the Mid-Autumn Moon Festival. Online registration required.";
const midAutumnCardSummary = selectConcreteSourceSentence(midAutumnCardSource);
assert.match(midAutumnCardSummary, /^Children of all ages:/i, 'p.m. must not split the official sentence into a fragment');
assert.match(midAutumnCardSummary, /make beautiful 3D layered greeting cards/i, 'Mid-Autumn craft action must remain in the complete sentence');
assert.doesNotMatch(midAutumnCardSummary, /^to\s+/i, 'summary must not begin with a dangling infinitive fragment');

console.log('summary-policy: safety-gate assertions passed');

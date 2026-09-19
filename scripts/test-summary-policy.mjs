import assert from 'node:assert/strict';
import { selectConcreteSourceSentence } from './summary-policy.mjs';

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

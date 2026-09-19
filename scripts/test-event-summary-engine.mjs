import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assessSummaryReadability,
  buildExtractiveSummary,
  buildOfficialMovieScreeningSummary,
  buildOfficialSportsSummary,
  buildSummaryRecord,
  hasUsableSourceContent,
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

const punctuatedTitleSource = "Join The Great Big BOO! at Gilroy Gardens for a family-friendly Halloween experience with light displays and interactive adventures. Come in costume and follow the BOO Trail throughout the park to go trick-or-treating for candy. Find all 8 BOO Zones to uncover the hidden message.";
const punctuatedTitleSegments = splitSourceSentences(punctuatedTitleSource, { title: 'The Great Big BOO!' });
assert.equal(
  punctuatedTitleSegments[0],
  "Join The Great Big BOO! at Gilroy Gardens for a family-friendly Halloween experience with light displays and interactive adventures.",
  'punctuation inside an event title must not create a fake sentence boundary'
);
const punctuatedTitleSummary = buildExtractiveSummary(punctuatedTitleSource, { title: 'The Great Big BOO!' });
assert.match(punctuatedTitleSummary.summary, /(?:follow the BOO Trail|Find all 8 BOO Zones)/i,
  'a generic SEO experience sentence must not beat concrete official activity copy');
assert.doesNotMatch(punctuatedTitleSummary.summary, /family-friendly Halloween experience/i,
  'generic experience copy must not be the parent-facing summary when concrete activity evidence exists');

// Readability gate: reject dependent clauses, allow complete imperatives.
assert.equal(isLikelyFragment('to make beautiful 3D layered greeting cards in celebration of the festival.'), true);
assert.equal(isLikelyFragment('Make beautiful 3D layered greeting cards in celebration of the festival.'), false);
assert.equal(isLikelyFragment('And enjoy a craft with your family.'), true);
assert.equal(isLikelyFragment('at Gilroy Gardens for a family-friendly Halloween experience.'), true,
  'lowercase dependent prepositional fragments must be rejected');
assert.equal(isLikelyFragment('In this weekly class, participants will learn basic Tai Chi principles.'), false,
  'capitalized complete prepositional sentences must remain valid');
assert.equal(isLikelyFragment('Until the day they start following him… or do they?'), true,
  'narrative continuation fragments must not become activity summaries');

assert.equal(
  buildExtractiveSummary("Join The Great Big BOO! at Gilroy Gardens for a family-friendly Halloween experience with light displays and interactive adventures.", { title: 'The Great Big BOO!' }).summary,
  '',
  'generic experience-only SEO copy must not publish by itself'
);
assert.equal(
  buildExtractiveSummary('This beloved community tradition is treasured by local families and offers an unforgettable experience.').summary,
  '',
  'promotional-only copy must not publish as an activity description'
);
assert.equal(
  buildExtractiveSummary('Start your Journey Today Your gift makes the entire visitor experience possible, from care of the estate to public programs and events.').summary,
  '',
  'site-wide donation copy must not publish as an event description'
);
assert.equal(
  buildExtractiveSummary('Terms and Conditions apply. Please review the refund policy before purchasing.').summary,
  '',
  'legal and policy copy must never become an activity description'
);

const featureListVsAction = buildExtractiveSummary(
  "Games, live music, food and drink, and thousands of pumpkins. Follow the trail of clues through a glowing woodland and into a hidden village."
);
assert.match(featureListVsAction.summary, /Follow the trail of clues/i,
  'a visitor action should outrank a static feature list');

const liveShowStory = buildExtractiveSummary(
  "Jasper Rabbit loves carrots, especially the ones from Crackenhopper Field. Based on the beloved book by Aaron Reynolds and illustrated by Peter Brown, this funny and slightly spooky tale is the perfect fall treat for our youngest community members and their families.",
  { title: 'Creepy Carrots!', format: 'live-show' }
);
assert.match(liveShowStory.summary, /Jasper Rabbit loves carrots/i,
  'live-show story evidence should outrank promotional adaptation copy');
assert.doesNotMatch(liveShowStory.summary, /perfect fall treat/i);

assert.equal(hasUsableSourceContent('Fall is here and the garden is full of color. Make a lantern with your family.'), true,
  'source gate should keep multi-sentence official content for the engine to evaluate');
assert.equal(hasUsableSourceContent('Registration required. Parking is available in the rear lot.'), false,
  'source gate should reject logistics-only content');

const homeworkSummary = buildExtractiveSummary(
  "Are you a student in grades K-6th and need help with homework? We have tutors for you to receive homework help Monday through Thursday. Walk-ins welcome as spaces allow. Homework Help will not be held on October 12."
);
assert.match(homeworkSummary.summary, /tutors.*homework help/i,
  'educational support copy must outrank walk-in and no-session logistics');
assert.doesNotMatch(homeworkSummary.summary, /Walk-ins|will not be held/i);

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

const sportsStructured = buildOfficialSportsSummary({
  homeTeam: 'Example FC', opponent: 'Rivals United', venue: 'Community Stadium', gameWord: 'match',
  promotions: ['Kids Day']
});
assert.equal(sportsStructured.summary, 'Official Example FC home match against Rivals United at Community Stadium. Featured promotion: Kids Day.');
assert.deepEqual(sportsStructured.evidenceData, {
  kind: 'sports-game', homeTeam: 'Example FC', opponent: 'Rivals United', venue: 'Community Stadium',
  gameWord: 'match', promotions: ['Kids Day']
});

const movieStructured = buildOfficialMovieScreeningSummary({ rating: 'PG', theater: 'Example Cinema' });
assert.equal(movieStructured.summary, 'PG-rated movie screening at Example Cinema.');
assert.deepEqual(movieStructured.evidenceData, { kind: 'movie-screening', rating: 'PG', theater: 'Example Cinema' });

// Engine contract: it selects evidence but never truncates a selected sentence
// into a stored ellipsis or invents a replacement clause.
const longAction = "Families can create a detailed paper city together using reusable templates, markers, stickers, recycled materials, and guided design prompts while talking with library staff about how neighborhoods are planned and built.";
const longResult = buildExtractiveSummary(longAction);
assert.equal(longResult.summary, longAction, 'selected source sentences are stored whole');
assert.ok(!longResult.summary.endsWith('…'), 'engine must not create ingest-time ellipsis');

const summaryRecord = buildSummaryRecord({
  sourceText: timeSentence,
  title: 'Mid-Autumn Moon Festival Craft',
  status: 'extractive',
  verifiedAt: '2026-09-19T00:00:00.000Z'
});
assert.equal(summaryRecord.summaryVersion, 'event-summary-v2-p4');
assert.equal(summaryRecord.parentSummary, timeSegments[0]);
assert.equal(summaryRecord.summaryEvidence, summaryRecord.parentSummary);
assert.ok(summaryRecord.sourceDescriptionHash, 'engine owns source hash and provenance');
assert.equal(summaryRecord.summaryVerifiedAt, '2026-09-19T00:00:00.000Z');

const updateScript = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(updateScript, /summary-policy\.mjs/, 'legacy summary-policy module must not be referenced');
assert.doesNotMatch(updateScript, /\bhasActivitySummary\b/, 'source adapters must use source-content gate, not the legacy mixed gate');
assert.doesNotMatch(updateScript, /\bcardSummary\s*\(/, 'source adapters must not implement their own card-summary entrypoint');
assert.match(updateScript, /event-summary-engine\.mjs/, 'all summary generation must route through the shared engine');
assert.doesNotMatch(updateScript, /\beventSummaryFields\b|\bextractParentSummary\b|\bbuildExtractiveSummary\b|\bisSummaryAcceptable\b/,
  'update-events must not contain a second summary implementation');
assert.doesNotMatch(updateScript, /function\s+[A-Za-z0-9_]*(?:ActivitySummary|ActivityDescription)\s*\(/,
  'source-specific adapters must not define activity-summary or activity-description selectors');
assert.doesNotMatch(updateScript, /\.find\(hasUsableSourceContent\)|descriptionCandidates\.find|const\s+summary\s*=\s*text\.match/,
  'source adapters may extract official text but must not rank or hand-pick the parent-facing sentence');
assert.match(updateScript, /buildSummaryRecord\s*\(/, 'summary metadata must come from the shared engine');
assert.match(updateScript, /hasPublishableSummary\s*\(/, 'adapter publishability checks must use the shared engine');

assert.doesNotMatch(updateScript, /description:\s*`Official San Jose/i, 'sports adapters must use the structured summary builder');
assert.doesNotMatch(updateScript, /family movie screening/i, 'cinema adapters must not maintain their own structured fallback copy');

console.log('event-summary-engine: parser, grounding, ranking, readability, provenance, and architecture contracts passed');

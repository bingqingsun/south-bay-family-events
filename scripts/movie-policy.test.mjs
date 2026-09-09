import assert from 'node:assert/strict';
import {
  cautiousMovieRating,
  isKidAppropriateMovie,
  isPotentialFamilyMovieRating,
  kidMovieSummary,
  normalizedMovieTitle,
  normalizedMovieRating
} from './movie-policy.mjs';

assert.equal(normalizedMovieRating('PG-13'), 'PG13');
assert.equal(normalizedMovieTitle('CARS 20TH ANNIVERSARY'), normalizedMovieTitle('Cars 20th Anniversary'));
assert.equal(cautiousMovieRating(['G', 'PG']), 'PG');
assert.equal(cautiousMovieRating(['NR', 'PG13']), 'PG13');
assert.equal(isPotentialFamilyMovieRating('R'), false);
assert.equal(isKidAppropriateMovie('General Audiences Film', 'G'), true);
assert.equal(isKidAppropriateMovie('Unrelated Adult Drama', 'PG'), false);
assert.equal(isKidAppropriateMovie('A New Adventure', 'PG', 'An animated comedy for families.'), true);
assert.equal(isKidAppropriateMovie('Spider-Man: Brand New Day', 'PG-13'), true);
assert.equal(isKidAppropriateMovie('Unrelated Adult Drama', 'PG-13'), false);
assert.equal(isKidAppropriateMovie('All Wishes Come True! (Mandarin with Chinese and English Subtitles)', 'NR'), true);
assert.equal(isKidAppropriateMovie('Festival Selection', 'NR', 'An animated adventure for families.'), true);
assert.equal(isKidAppropriateMovie('Unrated Crime Documentary', 'NR'), false);
assert.equal(isKidAppropriateMovie('Animated Horror', 'R'), false);
assert.match(kidMovieSummary('Coyote vs. Acme'), /Wile E. Coyote/);
assert.match(kidMovieSummary('All Wishes Come True!'), /Eight Immortals/);
assert.match(kidMovieSummary('Spider-Man: Brand New Day'), /Peter Parker/);

console.log('Movie policy tests passed.');

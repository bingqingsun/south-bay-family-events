function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizedMovieRating(rating) {
  return cleanText(rating).toUpperCase().replace(/PG\s*-?\s*13/, 'PG13');
}

export function normalizedMovieTitle(title) {
  return cleanText(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function cautiousMovieRating(ratings) {
  const values = [...new Set((ratings || []).map(normalizedMovieRating).filter(Boolean))];
  // Prefer the most cautious recognized rating when official cinema feeds
  // disagree. NR is used only when no rated listing is available.
  for (const rating of ['PG13', 'PG', 'G']) if (values.includes(rating)) return rating;
  return values.includes('NR') ? 'NR' : '';
}

// Cinema feeds are inconsistent: some provide only a rating and title, while
// others also expose an official genre or synopsis. Reject adult ratings
// immediately, then apply the content policy after detail metadata is loaded.
export function isPotentialFamilyMovieRating(rating) {
  return ['G', 'PG', 'PG13', 'NR', ''].includes(normalizedMovieRating(rating));
}

export function hasStrongFamilyMovieSignal(title, description = '') {
  const value = `${title || ''} ${description || ''}`;
  return /\b(?:animated|animation|family-friendly|for families|children(?:'s)?|kids?|young audiences?|superhero|paw patrol|coyote vs\.? acme|harry potter|cars|tom and jerry|toy story|moana|frozen|disney|pixar|minions|despicable me|sonic|paddington|smurfs|how to train your dragon|spongebob|spider[ -]?man|mario|lego|dog man|kung fu panda)\b/i.test(value);
}

export function isVerifiedFamilyMovieWithoutFeedMetadata(title) {
  // Pearl Studio's official page identifies this NR release as an animated
  // comedy/fantasy feature, but Cinemark publishes an empty genre and synopsis.
  return /\ball wishes come true(?:!|\b)|八仙/iu.test(String(title || ''));
}

export function isKidAppropriateMovie(title, rating, description = '') {
  const normalizedRating = normalizedMovieRating(rating);
  if (normalizedRating === 'G') return true;
  if (normalizedRating === 'PG' || normalizedRating === 'PG13' || normalizedRating === 'NR' || !normalizedRating) {
    return hasStrongFamilyMovieSignal(title, description) || isVerifiedFamilyMovieWithoutFeedMetadata(title);
  }
  return false;
}

export function kidMovieSummary(title) {
  if (/paw patrol.*dino/i.test(title)) return 'PAW Patrol pups explore a dinosaur-filled island and race to stop a volcanic disaster.';
  if (/coyote vs\.? acme/i.test(title)) return 'Wile E. Coyote takes Acme to court after its products repeatedly derail his Roadrunner pursuits.';
  if (/harry potter.*sorcerer/i.test(title)) return 'Harry Potter begins his first year at Hogwarts and discovers a hidden magical world.';
  if (/cars.*20th/i.test(title)) return 'A big-screen anniversary screening of Pixar’s Cars, following Lightning McQueen’s unexpected detour to Radiator Springs.';
  if (/tom and jerry/i.test(title)) return 'Tom and Jerry embark on a family-friendly animated adventure.';
  if (/all wishes come true|八仙/i.test(title)) return 'Eight ordinary mortals pose as immortals and embark on a comic fantasy adventure inspired by the legend of the Eight Immortals.';
  if (/spider[ -]?man.*brand new day/i.test(title)) return 'Peter Parker returns as Spider-Man to face a mysterious new threat while trying to protect the people he loves.';
  return '';
}

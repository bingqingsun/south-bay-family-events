export function eventDetailSlug(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function slugCandidatesForTitle(title) {
  const slug = eventDetailSlug(title);
  if (!slug) return [];

  const words = slug.split('-').filter(Boolean);
  const removable = new Set(['a', 'an', 'the', 'for', 'to', 'is']);
  const candidates = [slug];

  if (removable.has(words[0]) && words.length > 1) {
    candidates.push(words.slice(1).join('-'));
  }

  const compact = words.filter(word => !removable.has(word)).join('-');
  if (compact) candidates.push(compact);

  return candidates.filter(Boolean);
}

export function eventDetailSlugCandidates(title) {
  const value = String(title || '').trim();
  if (!value) return [];

  // Discovery feeds often append organizer/venue metadata after a spaced
  // dash or pipe, while the first-party CMS slug uses only the event name.
  // Keep the full title first, then try the main-title prefix generically.
  const titleVariants = [value];
  const mainTitle = value.split(/\s+(?:[–—-]|\|)\s+/)[0]?.trim();
  if (mainTitle && mainTitle !== value) titleVariants.push(mainTitle);

  return [...new Set(titleVariants.flatMap(slugCandidatesForTitle))];
}

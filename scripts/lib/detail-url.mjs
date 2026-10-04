export function eventDetailSlug(title) {
  return String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function eventDetailSlugCandidates(title) {
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

  return [...new Set(candidates.filter(Boolean))];
}

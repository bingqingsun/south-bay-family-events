import { plainText, sameEventIdentity } from '../detail-extractors/generic.mjs';

function absolute(raw, baseUrl) {
  try { return new URL(raw, baseUrl).href; } catch { return ''; }
}

function imageFromTag(tag, baseUrl) {
  const raw = tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1] || '';
  return absolute(raw, baseUrl);
}

export function parseSymphonyDetail({ html, event, generic, finalUrl = '' }) {
  // Symphony concert detail pages can contain many decorative/program images.
  // Prefer generic structured/OG evidence there; this adapter primarily adds a
  // safe fallback for the official season listing where each concert is a
  // repeated image + title + Tickets & Information unit.
  if (generic?.image) return {};

  const text = String(html || '');
  const title = event?.title || '';
  const titleIndex = text.toLowerCase().indexOf(title.toLowerCase());
  if (titleIndex < 0) return {};

  const before = text.slice(Math.max(0, titleIndex - 2500), titleIndex);
  const after = text.slice(titleIndex, titleIndex + 2500);
  const imageTags = [...before.matchAll(/<img\b[^>]*>/gi)].map(match => match[0]);
  const imageTag = imageTags.at(-1) || '';
  const image = imageFromTag(imageTag, finalUrl || event?.url || 'https://www.symphonysanjose.org/');
  if (!image) return {};

  const nearbyTitle = plainText(after.slice(0, 800));
  if (!sameEventIdentity(title, nearbyTitle)) return {};

  return {
    image,
    imageMethod: 'symphony-season-card',
    imageScore: 90,
    imageEvidence: 'official-season-image-immediately-precedes-event-title'
  };
}

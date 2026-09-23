import { plainText, sameEventIdentity } from '../detail-extractors/generic.mjs';

function absolute(raw, baseUrl) {
  try { return new URL(raw, baseUrl).href; } catch { return ''; }
}

function imageFromTag(tag, baseUrl) {
  const raw = tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1] || '';
  return absolute(raw, baseUrl);
}

export function parseSymphonyDetail({ html, event, generic, finalUrl = '' }) {
  // This adapter is only valid on Symphony's season listing, where an image
  // immediately preceding a concert title is a stable card association. On a
  // concert detail page, nearby images are date/location/program icons and must
  // never be promoted as the event hero.
  let pagePath = '';
  try { pagePath = new URL(finalUrl || event?.url || '').pathname.replace(/\/+$/, '/'); } catch {}
  if (!/\/attend\/2026-2027-season\/concerts(?:-2026-2027)?\/$/i.test(pagePath)) return {};
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

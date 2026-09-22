// Resolve a calendar listing to a richer, same-domain official event page.
// This deliberately does not use web search: a candidate must be discoverable
// from the organizer's own sitemap and independently match the listing.
const STOP_WORDS = new Set(['annual', 'city', 'community', 'cupertino', 'event', 'events', 'fall', 'the']);
const NON_SPECIAL_PATH = /\/(?:events?-directory|news-articles|home\/featured-content)(?:\/|$)/i;

export function plainText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&(?:amp|quot|#39|apos);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function titleTokens(value) {
  return new Set((plainText(value).toLowerCase().match(/[a-z0-9]{3,}/g) || [])
    .filter(word => !STOP_WORDS.has(word)));
}

function sharedCount(left, right) {
  return [...left].filter(word => right.has(word)).length;
}

function locsFromSitemap(xml) {
  return [...String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(match => match[1].trim());
}

export function sitemapCandidates(xml, event, { domain, maxCandidates = 4 } = {}) {
  const tokens = titleTokens(event.title);
  if (tokens.size < 2) return [];
  return locsFromSitemap(xml)
    .filter(url => {
      try { return new URL(url).hostname === domain || new URL(url).hostname.endsWith(`.${domain}`); } catch { return false; }
    })
    .filter(url => !NON_SPECIAL_PATH.test(new URL(url).pathname))
    .map(url => ({ url, shared: sharedCount(tokens, titleTokens(decodeURIComponent(new URL(url).pathname))) }))
    .filter(candidate => candidate.shared >= 2)
    // A short, specific path is generally the organizer's maintained landing
    // page; deep article/news paths were removed above.
    .sort((a, b) => b.shared - a.shared || new URL(a.url).pathname.split('/').length - new URL(b.url).pathname.split('/').length || a.url.localeCompare(b.url))
    .slice(0, maxCandidates);
}

// A source can provide a short, parent-facing official alias when its CMS
// sitemap publishes only a long canonical path. The alias is never trusted on
// configuration alone: it still goes through the same title/date/content
// verification as sitemap candidates.
export function configuredCandidates(event, pages = []) {
  return pages.flatMap(page => {
    try {
      if (!page?.url || !page?.titlePattern || !(new RegExp(page.titlePattern, 'i')).test(event.title || '')) return [];
      return [{ url: new URL(page.url).href, shared: Number.MAX_SAFE_INTEGER }];
    } catch { return []; }
  });
}

function dateTextFor(isoDate) {
  const match = String(isoDate || '').match(/^(20\d{2})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function pageTitle(html) {
  return plainText(String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function pageDescription(html) {
  const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => plainText(match[1]))
    .filter(text => text.length >= 50)
    .filter(text => !/^(?:schedule|participant registration|volunteers|getting to)\b/i.test(text));
  return paragraphs.join(' ').slice(0, 4000).trim();
}

export function verifySpecialEventPage(event, candidate, html) {
  const title = pageTitle(html);
  const titleOverlap = sharedCount(titleTokens(event.title), titleTokens(title));
  const expectedDate = dateTextFor(event.dateValue);
  const text = plainText(html);
  const description = pageDescription(html);
  if (titleOverlap < 2 || !expectedDate || !text.includes(expectedDate) || description.length < 50) return null;
  return { url: candidate.url, title, description, evidence: `Sitemap candidate; title overlap ${titleOverlap}; page contains ${expectedDate}.` };
}

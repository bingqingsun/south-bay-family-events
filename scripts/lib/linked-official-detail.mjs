const SOCIAL_OR_UTILITY_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|nextdoor\.com|google\.com|googleapis\.com|youtube\.com|youtu\.be)$/i;
const GENERIC_DETAIL_LABEL = /\b(?:event website|official website|website|learn more|more information|more info|event details|details)\b/i;
const PAGE_CHROME = /\b(?:view map|email address|fields marked as ['’"]?required|enter your email address|share this page|back to top|site footer|privacy policy|terms of use)\b/i;

function decode(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—');
}

function plainText(value) {
  return decode(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(title) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'annual', 'event', 'festival']);
  return plainText(title).toLowerCase().split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4 && !stop.has(token));
}

function overlapCount(title, value) {
  const lower = plainText(value).toLowerCase();
  return titleTokens(title).filter(token => lower.includes(token)).length;
}

export function linkedOfficialDetailCandidates(html, { pageUrl = '', title = '' } = {}) {
  let base;
  try { base = new URL(pageUrl); } catch { return []; }
  const candidates = [];

  for (const match of String(html || '').matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = `${match[1] || ''} ${match[3] || ''}`;
    const label = plainText(match[4]);
    let url;
    try { url = new URL(decode(match[2]), base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.hostname === base.hostname || SOCIAL_OR_UTILITY_HOST.test(url.hostname)) continue;

    const evidence = `${label} ${plainText(attrs)} ${decodeURIComponent(url.pathname).replace(/[-_/]+/g, ' ')}`;
    const overlap = overlapCount(title, evidence);
    const generic = GENERIC_DETAIL_LABEL.test(label) || GENERIC_DETAIL_LABEL.test(attrs);
    if (!overlap && !generic) continue;

    candidates.push({
      url: url.href,
      score: overlap * 10 + (generic ? 3 : 0),
      evidence: label || url.hostname
    });
  }

  return [...new Map(candidates
    .sort((a, b) => b.score - a.score)
    .map(item => [item.url, item])).values()].slice(0, 5);
}

export function linkedOfficialPageMatches(html, title) {
  const identity = plainText(
    String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || String(html || '').match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)/i)?.[1]
    || String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || ''
  );
  const tokens = titleTokens(title);
  if (!identity || !tokens.length) return false;
  const overlap = overlapCount(title, identity);
  return overlap >= Math.min(2, tokens.length);
}

export function linkedOfficialDescription(html) {
  const source = String(html || '');
  const scope = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || source.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    || source;

  const blocks = [...scope.matchAll(/<(?:p|li|td|dd)\b[^>]*>([\s\S]*?)<\/(?:p|li|td|dd)>/gi)]
    .map(match => plainText(match[1]))
    .filter(text => text.length >= 20 && text.length <= 1400)
    .filter(text => !PAGE_CHROME.test(text));

  return blocks.join(' ').replace(/\s+/g, ' ').trim().slice(0, 7000);
}

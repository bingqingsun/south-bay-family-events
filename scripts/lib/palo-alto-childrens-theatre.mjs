const DEFAULT_BASE_URL = 'https://www.paloalto.gov/Events-Directory/Community-Services/';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

export function normalizePaloAltoTheatreTitle(value = '') {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function paloAltoTheatreTitlesMatch(left, right) {
  const a = normalizePaloAltoTheatreTitle(left);
  const b = normalizePaloAltoTheatreTitle(right);
  return Boolean(a && b && a === b);
}

export function paloAltoTheatreDetailTitleCandidates(title = '') {
  const value = decodeHtml(title).trim();
  const candidates = [value];
  if (/^Main Stage Production:/i.test(value)) {
    candidates.push(value.replace(/^Main Stage Production:/i, 'Main Stage:'));
  }
  if (/^Playhouse Series:\s*One Grain of Rice\b/i.test(value)) {
    candidates.push('Playhouse Series: One Grain of Rice');
  }
  return [...new Set(candidates.filter(Boolean))];
}

export function paloAltoChildrensTheatreDetailUrl(title, baseUrl = DEFAULT_BASE_URL) {
  const slug = decodeHtml(title)
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return '';
  return new URL(slug, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').href;
}

function metaContent(html, key) {
  const escaped = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const patterns = [
    new RegExp('<meta\\s+(?:property|name)=["\\\']' + escaped + '["\\\']\\s+content=["\\\']([^"\\\']+)["\\\']', 'i'),
    new RegExp('<meta\\s+content=["\\\']([^"\\\']+)["\\\']\\s+(?:property|name)=["\\\']' + escaped + '["\\\']', 'i')
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return '';
}

function pageTitle(html) {
  return metaContent(html, 'og:title')
    || decodeHtml(String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    || decodeHtml(String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
}

export function parsePaloAltoChildrensTheatreDetail(html, expectedTitle, url = '') {
  const title = pageTitle(html);
  if (!paloAltoTheatreTitlesMatch(title, expectedTitle)) return null;
  const image = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  const description = metaContent(html, 'og:description') || metaContent(html, 'description');
  const text = decodeHtml(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return { title, url, image, description, text };
}

export async function fetchPaloAltoChildrensTheatreDetail(title, options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 12000;
  for (const candidateTitle of paloAltoTheatreDetailTitleCandidates(title)) {
    const url = paloAltoChildrensTheatreDetailUrl(candidateTitle, baseUrl);
    if (!url) continue;
    try {
      const response = await fetchImpl(url, {
        headers: { 'user-agent': 'SouthBayFamilyEventsBot/1.0' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) continue;
      const html = await response.text();
      const parsed = parsePaloAltoChildrensTheatreDetail(html, candidateTitle, response.url || url);
      if (parsed) return parsed;
    } catch {}
  }
  return null;
}

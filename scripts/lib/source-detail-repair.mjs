// Organizer-specific safeguards: do not turn closure notices or footer chrome
// into family outings, and bind PYT synopsis text to its own production page.
const plain = value => String(value || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<(?:nav|footer|aside)\b[^>]*>[\s\S]*?<\/(?:nav|footer|aside)>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&(?:amp|#38);/gi, '&')
  .replace(/&(?:rsquo|#8217);/gi, '’')
  .replace(/&(?:ldquo|#8220);/gi, '“')
  .replace(/&(?:rdquo|#8221);/gi, '”')
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/\s+/g, ' ')
  .trim();

const compactTitle = text => plain(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function isOfficialClosureNotice(title, description = '') {
  const name = plain(title);
  const detail = plain(description);
  // CMS calendars often label a venue closure as an event, particularly on
  // holidays. Keep this narrowly scoped to an explicit operational notice.
  return /^(?:closed|closure|closing|holiday (?:hours|closure)|special hours)\b/i.test(name)
    || /\b(?:museum|libraries|library|bookmobile|branches?|visitor center)\b.{0,70}\b(?:closed|closure)\b/i.test(name)
    || /\b(?:museum|libraries|library branches?|bookmobile)\s+(?:will be|is|are)\s+closed\b/i.test(detail);
}

export function pytSynopsisFromDetail(html, expectedTitle) {
  const body = String(html || '');
  const heading = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .find(match => compactTitle(match[1]) === compactTitle(expectedTitle));
  if (!heading) return '';

  // The PYT show templates put their official show synopsis after this
  // production-specific CTA, even when it is a div and not a <p>. By contrast
  // generic paragraph scanning could pick the page's copyright/footer copy.
  const markup = body.slice(heading.index + heading[0].length)
    .split(/<footer\b/i)[0];
  const visible = plain(markup);
  const cta = /\bSponsor This Show\b/i.exec(visible);
  if (!cta) return '';
  let synopsis = visible.slice(cta.index + cta[0].length).trim();
  synopsis = synopsis.split(/\b(?:Why is there a fee on my ticket|Screenplay By|Music published by|Produced by arrangement|Read this site in Spanish|Tickets & details|Sponsorship opportunities)\b/i)[0].trim();
  if (synopsis.length > 1100) synopsis = synopsis.slice(0, 1100);
  if (synopsis.length < 60 || /\b(?:501\s*\(c\)|all rights reserved|site in spanish|privacy policy)\b/i.test(synopsis)) return '';
  return synopsis;
}

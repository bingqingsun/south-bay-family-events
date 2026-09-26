function plainText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(title) {
  const stop = new Set(['the','and','for','with','from','festival','event','annual']);
  return plainText(title).toLowerCase().split(/[^a-z0-9]+/)
    .filter(token => token.length >= 4 && !stop.has(token));
}

function candidateScore(text, title) {
  const value = plainText(text);
  const lower = value.toLowerCase();
  const tokens = titleTokens(title);
  const titleHits = tokens.filter(token => lower.includes(token)).length;
  const exactTitle = plainText(title).length >= 5 && lower.includes(plainText(title).toLowerCase()) ? 1 : 0;
  const activityHits = (lower.match(/\b(?:family|families|kids?|children|lantern|dance|music|craft|food|performance|games?|celebrat|community|admission|free)\w*\b/g) || []).length;
  const genericPenalty = /movie nights? out|site footer|contact us|back to top/i.test(value) ? 8 : 0;
  const lengthBonus = value.length >= 80 && value.length <= 900 ? 2 : 0;
  return exactTitle * 10 + titleHits * 5 + Math.min(activityHits, 5) + lengthBonus - genericPenalty;
}

export function selectCivicPlusEventDescription(html, title, fallback = '') {
  const paragraphs = [...String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => plainText(match[1]))
    .filter(text => text.length >= 35 && text.length <= 1600)
    .filter(text => !/^(?:contact us|back to top|site footer|copyright|privacy|accessibility)/i.test(text));

  const ranked = paragraphs
    .map((text, index) => ({ text, index, score: candidateScore(text, title) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (ranked[0]?.score >= 5) {
    const primary = ranked[0];
    const next = paragraphs[primary.index + 1] || '';
    const nextScore = next ? candidateScore(next, title) : 0;
    const nextLooksRelated = nextScore >= 2
      && !/movie nights? out|site footer|contact us|back to top/i.test(next);
    return nextLooksRelated ? `${primary.text} ${next}` : primary.text;
  }
  return plainText(fallback);
}

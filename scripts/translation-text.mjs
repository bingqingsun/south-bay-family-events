export function splitTranslationText(value, { maxChars = 360 } = {}) {
  const source = String(value || '').trim();
  if (!source) return [];
  if (source.length <= maxChars) return [source];

  const sentenceLike = source
    .split(/(?<=[.!?;:])\s+|\s+[—–-]\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  const chunks = [];
  for (const part of sentenceLike.length ? sentenceLike : [source]) {
    if (part.length <= maxChars) {
      chunks.push(part);
      continue;
    }

    const words = part.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      const next = `${current} ${word}`;
      if (next.length <= maxChars) {
        current = next;
      } else {
        chunks.push(current);
        current = word;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks;
}

async function translateChunk(translator, source, { maxNewTokens = 256 } = {}) {
  const output = await translator(source, { max_new_tokens: maxNewTokens });
  const value = Array.isArray(output) ? output[0]?.translation_text : output?.translation_text;
  const translated = String(value || '').trim();
  if (!translated) throw new Error('empty-translation-output');
  return translated;
}

export async function translateTextSafely(translator, value, options = {}) {
  const source = String(value || '').trim();
  if (!source) return '';
  const chunks = splitTranslationText(source, options);
  const translated = [];
  for (const chunk of chunks) translated.push(await translateChunk(translator, chunk, options));
  return translated.join(' ').replace(/\s+/g, ' ').trim();
}

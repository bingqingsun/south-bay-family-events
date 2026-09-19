// South Bay Family Finds event-summary engine.
//
// Architectural rule:
// - source adapters provide official source text only;
// - this module decides how that text becomes a parent-facing summary;
// - no activity-specific title exceptions live here;
// - extractive summaries must remain verbatim substrings of the normalized
//   official source text so every published claim is directly auditable.

const CONCRETE_ACTION = /\b(?:make|making|build|building|create|creating|paint|painting|decorate|decorating|assemble|assembling|plant|planting|cook|cooking|bake|baking|craft|crafting|play|playing|watch|watching|read|reading|dance|dancing|sing|singing|taste|tasting|eat|eating|drink|drinking|tour|touring|hike|hiking|try|trying|practice|practicing|explore|exploring|learn|learning|design|designing|draw|drawing|sew|sewing|knit|knitting|crochet|crocheting|meet|meeting|listen|listening|perform|performing|compete|competing|solve|solving|experiment|experimenting|test|testing|launch|launching|fly|flying|throw|throwing|kick|kicking|jump|jumping|stamp|stamping|fold|folding|coloring|write|writing|ride|riding|visit|visiting|see|seeing|experience|experiencing)\b/i;

const PARTICIPATION_SIGNAL = /\b(?:with us|hands-on|take (?:it|them) home|bring .* home|hang your|your own|kids?|children|families|participants|attendees|together|you(?:'ll| will| can)|visitors? can)\b/i;

const SPECIFIC_OBJECT = /\b(?:feeder|kite|lantern|painting|paint|flower|keychain|cardholder|card|cards|lego|legos|craft|project|experiment|game|games|story|stories|song|songs|instrument|bracelet|jewelry|robot|puzzle|mooncake|collage|mask|puppet|book|books|seed|garden|cookie|cookies|cake|clay|pottery|origami|model|slime|rocket|birdhouse|art|workshop|performance|show|concert|film|movie|exhibit|exhibition)\b/i;

const BACKGROUND_ONLY = /\b(?:our mission is|is designed to|aims? to|a great way to|fall migration season|there are lots of|celebrates? the history of|highlights? the participation of|inspires? curiosity|spark a love for|benefits? include|supports? .* development)\b/i;

const LOGISTICS = /\b(?:parking|entrance|room|location|arrive early|first[- ]come|space is limited|registration required|register online|weather permitting|held indoors|held outdoors|cancell?ed|rescheduled|sensory notes?|accessibility|accommodations?|visuals?|noise level|sound|check[- ]in|waiver|required form|ticket(?:s|ing)?|admission)\b/i;

const BIOGRAPHY_OR_PROMOTION = /\b(?:recent publications?|publications? include|translations? of|editorial prefaces?|biography|biographical|curriculum vitae|cv\b|degrees?|earned (?:a|an|their)|has performed|has appeared|awards?|accolades?|career highlights?|follow us|follow along|subscribe|newsletter|youtube|instagram|facebook|donate|support us)\b/i;

const OPERATIONAL_NOTE = /\b(?:will be|is) held (?:inside|indoors?|outdoors?)\b|\b(?:in case of|depending on) (?:rain|weather)\b|\b(?:parking|entrance|room|location) (?:is|will be|has changed)\b|\b(?:cancell?ed|postponed|rescheduled)\b/i;

const ACTIVITY_VERB = /\b(?:watch|watching|listen|listening|enjoy|join|explore|discover|create|build|make|making|play|sing|dance|read|learn|practice|taste|eat|drink|walk|hike|tour|meet|test|testing|paint|painting|decorate|decorating|design|designing|draw|drawing|sew|sewing|knit|knitting|crochet|crocheting|see|experience|ride|visit|try|participate)\b/i;
const EVENT_NOUN = /\b(?:story(?:time)?|songs?|rhymes?|crafts?|games?|workshop|class|concert|performance|show|movie|film|exhibit(?:ion)?|festival|parade|museum|science|art|music|opera|ballet|theat(?:er|re)|sports?|match|game)\b/i;
const EXPERIENCE_STRUCTURE = /\b(?:with|featur(?:e|es|ing)|includes?|offers?|offering|where|activities?|demonstrations?|performances?|stations?|zone|zones)\b/i;

const CONTINUATION_START = /^(?:and|or|but|because|which|that|who|whose|where|when|while|with|without|from|by|including|such as)\b/i;
const DANGLING_INFINITIVE = /^to\s+[a-z]+\b/i;
const NON_ACTIVITY_LABEL = /^(?:sensory notes?|sound|visuals?|accessibility|accommodations?|registration|parking|location|tickets?|admission|check[- ]in)$/i;
const ABBREVIATION_END = /(?:\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|a\.m|p\.m)\.|(?:\b[A-Za-z]\.){2,})$/i;
const HONORIFIC_END = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st)\.$/i;
const INITIAL_END = /\b[A-Z]\.$/;

function normalizeText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function rawSentenceSegments(text) {
  if (typeof Intl?.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)]
      .map(item => item.segment.trim())
      .filter(Boolean);
  }
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(item => item.trim()).filter(Boolean);
}

export function splitSourceSentences(sourceText) {
  const text = normalizeText(sourceText);
  if (!text) return [];

  const raw = rawSentenceSegments(text);
  const merged = [];

  for (const segment of raw) {
    if (!merged.length) {
      merged.push(segment);
      continue;
    }

    const previous = merged.at(-1);
    const startsLikeContinuation = /^[a-z]/.test(segment)
      || CONTINUATION_START.test(segment)
      || DANGLING_INFINITIVE.test(segment);
    const previousLooksAbbreviated = ABBREVIATION_END.test(previous);
    const honorificNeedsName = HONORIFIC_END.test(previous) && /^[A-Z][A-Za-z'’-]+\b/.test(segment);
    const initialNeedsName = INITIAL_END.test(previous) && /^[A-Z][A-Za-z'’-]+\b/.test(segment);

    // Sentence segmenters occasionally split after abbreviations. Merge a
    // dependent lower-case continuation after any abbreviation, and merge a
    // capitalized proper name after honorifics/initials. Time abbreviations
    // followed by a new capitalized sentence remain separate.
    if ((previousLooksAbbreviated && startsLikeContinuation) || honorificNeedsName || initialNeedsName) {
      merged[merged.length - 1] = `${previous} ${segment}`;
    } else {
      merged.push(segment);
    }
  }

  return merged;
}

export function isLogisticsOnly(text) {
  const value = normalizeText(text);
  if (!value) return true;
  return /^(?:free|by appointment|call(?:\s|\.|$)|contact\b|same day|offered in|registration|reserve\b|tickets?\b|admission\b|please\b|drop-?ins?\b|no registration|must\b|participants?\b)/i.test(value)
    || /^(?:children|kids?|adults?|teens?|famil(?:y|ies)|participants?)\b[\s\S]{0,120}\b(?:welcome|must|should|need|able to|can comfortably|may participate)\b/i.test(value)
    || /^(?:designs?|prints?|library staff|color|file format|materials?)\b.*\b(?:must|are|will|may|if|criteria|available)\b/i.test(value)
    || /ada accommodation|for more information|please (?:call|email|visit)|click here|all minors under|parent\/guardian approval|release of liability|difficulty rating|terms & conditions|reserves the right to (?:cancel|refuse)|printable if|load and save|file format/i.test(value)
    || (LOGISTICS.test(value) && !CONCRETE_ACTION.test(value));
}

export function isBiographyOrPromotion(text) {
  const value = normalizeText(text);
  return BIOGRAPHY_OR_PROMOTION.test(value)
    || /\b(?:musical director|guest speaker|presenter|lecturer|conductor|pianist|soprano|tenor)\b[^.!?]{0,180}\b(?:studied|trained|graduated|received|earned|published|translated)\b/i.test(value);
}

export function isOperationalNote(text) {
  return OPERATIONAL_NOTE.test(normalizeText(text));
}

export function hasActivitySignal(text) {
  const value = normalizeText(text);
  return ACTIVITY_VERB.test(value)
    || CONCRETE_ACTION.test(value)
    || (EVENT_NOUN.test(value) && EXPERIENCE_STRUCTURE.test(value));
}

export function isLikelyFragment(text) {
  const value = normalizeText(text);
  if (!value) return true;
  const words = value.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  if (words.length < 3) return true;
  if (CONTINUATION_START.test(value)) return true;
  // "To make cards..." without a following independent clause is usually a
  // clause torn from the previous sentence. "To make cards, join us..." is
  // allowed because the comma introduces a complete main clause.
  if (DANGLING_INFINITIVE.test(value) && !/^[^,]{1,120},\s*[A-Z]?[a-z]+\b/.test(value)) return true;
  if (/[:;,–—-]\s*$/.test(value)) return true;
  if (/^(?:also|then|however|therefore|instead|additionally)\b/i.test(value)) return true;
  return false;
}

export function isSummaryAcceptable(text, { title = '', format = '' } = {}) {
  const value = normalizeText(text);
  if (value.length < 20) return false;
  if (isLikelyFragment(value) || isLogisticsOnly(value) || isBiographyOrPromotion(value) || isOperationalNote(value)) return false;
  if (/\bpreview\b/i.test(title) && !/\b(?:preview|introduction|intro(?:duction)?|talk|discussion|guide)\b/i.test(value)) return false;
  return hasActivitySignal(value)
    || ['movie-screening', 'live-show', 'museum-exhibition', 'sports-game'].includes(format)
    || /\b(?:movie|film|concert|performance|show|exhibit(?:ion)?|opera|ballet|musical|game|match)\b/i.test(title);
}

export function hasActivitySummary(text) {
  const value = normalizeText(text);
  return value.length >= 20 && !isLogisticsOnly(value) && !isLikelyFragment(value);
}

function scoreSentence(sentence, index) {
  let score = Math.min(sentence.length, 220) / 35;
  if (CONCRETE_ACTION.test(sentence)) score += 22;
  if (PARTICIPATION_SIGNAL.test(sentence)) score += 8;
  if (SPECIFIC_OBJECT.test(sentence)) score += 8;
  if (/\b(?:by|while|then|and)\b/i.test(sentence) && CONCRETE_ACTION.test(sentence)) score += 3;
  if (sentence.length >= 35 && sentence.length <= 260) score += 4;
  if (sentence.length > 420) score -= 8;
  if (sentence.length < 22) score -= 8;
  if (BACKGROUND_ONLY.test(sentence)) score -= 22;
  if (LOGISTICS.test(sentence)) score -= 20;
  if (isBiographyOrPromotion(sentence)) score -= 60;
  if (isOperationalNote(sentence)) score -= 24;
  if (isLikelyFragment(sentence)) score -= 60;
  // Small tie-breaker toward earlier official text without allowing a generic
  // lead sentence to beat a later sentence that contains the actual activity.
  score -= index * 0.15;
  return score;
}

export function selectConcreteSourceSentence(sourceText, options = {}) {
  const sentences = splitSourceSentences(sourceText);
  let best = null;

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    if (!isSummaryAcceptable(sentence, options)) continue;
    const score = scoreSentence(sentence, index);
    if (!best || score > best.score) best = { sentence, score, index };
  }

  return best && best.score >= 22 ? best.sentence : '';
}

export function selectLabeledActivityBundle(sourceText, options = {}) {
  const text = normalizeText(sourceText);
  if (!text) return '';

  const matches = [...text.matchAll(/\b([A-Z][A-Za-z'’&-]*(?:\s+[A-Z][A-Za-z'’&-]*){0,3}):\s*([^.!?]+[.!?])/g)]
    .map(match => ({
      start: match.index,
      end: match.index + match[0].length,
      label: match[1].trim(),
      body: match[2].trim(),
      text: match[0].trim()
    }));

  const runs = [];
  let current = [];

  for (const item of matches) {
    const valid = !NON_ACTIVITY_LABEL.test(item.label)
      && !LOGISTICS.test(item.text)
      && (CONCRETE_ACTION.test(item.body) || SPECIFIC_OBJECT.test(item.body))
      && !isLikelyFragment(item.body);

    if (!valid) {
      if (current.length >= 2) runs.push(current);
      current = [];
      continue;
    }

    if (current.length) {
      const previous = current.at(-1);
      const gap = text.slice(previous.end, item.start).trim();
      if (gap) {
        if (current.length >= 2) runs.push(current);
        current = [];
      }
    }
    current.push(item);
  }
  if (current.length >= 2) runs.push(current);

  const candidates = runs
    .map(run => text.slice(run[0].start, run.at(-1).end).trim())
    .filter(bundle => isSummaryAcceptable(bundle, options))
    .sort((a, b) => {
      const actionDelta = (b.match(new RegExp(CONCRETE_ACTION.source, 'gi')) || []).length
        - (a.match(new RegExp(CONCRETE_ACTION.source, 'gi')) || []).length;
      return actionDelta || Math.min(b.length, 420) - Math.min(a.length, 420);
    });

  return candidates[0] || '';
}

export function buildExtractiveSummary(sourceText, { title = '', format = '' } = {}) {
  const text = normalizeText(sourceText);
  if (!text) return { summary: '', method: 'none', quality: 'needs_review', evidence: '' };

  const options = { title, format };

  const bundle = selectLabeledActivityBundle(text, options);
  if (bundle) {
    return { summary: bundle, method: 'labeled_activity_bundle', quality: 'strong', evidence: bundle };
  }

  const concrete = selectConcreteSourceSentence(text, options);
  if (concrete) {
    return { summary: concrete, method: 'concrete_sentence', quality: 'strong', evidence: concrete };
  }

  const candidates = splitSourceSentences(text)
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index) }))
    .filter(item => isSummaryAcceptable(item.sentence, options))
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0]?.sentence || '';
  return selected
    ? { summary: selected, method: 'best_source_sentence', quality: 'acceptable', evidence: selected }
    : { summary: '', method: 'none', quality: 'needs_review', evidence: '' };
}

export function assessSummaryReadability(text) {
  const value = normalizeText(text);
  const issues = [];
  if (!value) issues.push('empty');
  if (value && isLikelyFragment(value)) issues.push('fragment');
  if (value && isLogisticsOnly(value)) issues.push('logistics_only');
  if (value && isBiographyOrPromotion(value)) issues.push('biography_or_promotion');
  if (value && isOperationalNote(value)) issues.push('operational_note');
  return { ok: issues.length === 0, issues };
}

import { createHash } from 'node:crypto';

export const EVENT_SUMMARY_VERSION = 'event-summary-v2-p4';

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

const BIOGRAPHY_OR_PROMOTION = /\b(?:recent publications?|publications? include|translations? of|editorial prefaces?|biography|biographical|curriculum vitae|cv\b|degrees?|earned (?:a|an|their)|has performed|has appeared|awards?|accolades?|career highlights?|follow us|follow along|subscribe|newsletter|youtube|instagram|facebook|donate|support us|your gift makes|start your journey today|become a member|membership now includes|sign up for email)\b/i;

const OPERATIONAL_NOTE = /\b(?:will be|is) held (?:inside|indoors?|outdoors?)\b|\b(?:will not|won't|does not|doesn't) (?:be )?held\b|\bnot (?:be )?held\b|\b(?:in case of|depending on) (?:rain|weather)\b|\b(?:parking|entrance|room|location) (?:is|will be|has changed)\b|\b(?:cancell?ed|postponed|rescheduled)\b/i;

const ACTIVITY_VERB = /\b(?:watch|watching|listen|listening|enjoy|join|explore|discover|create|build|make|making|play|sing|dance|read|learn|practice|taste|eat|drink|walk|hike|tour|meet|test|testing|paint|painting|decorate|decorating|design|designing|draw|drawing|sew|sewing|knit|knitting|crochet|crocheting|see|experience|ride|visit|try|participate)\b/i;
const EVENT_NOUN = /\b(?:story(?:time)?|songs?|rhymes?|crafts?|games?|workshop|class|concerts?|performances?|shows?|movies?|films?|screenings?|exhibit(?:ion)?s?|festival|parade|museum|science|art|music|opera|ballet|theat(?:er|re)|sports?|matches?)\b/i;
const EXPERIENCE_STRUCTURE = /\b(?:with|featur(?:e|es|ing)|includes?|offers?|offering|where|activities?|demonstrations?|performances?|stations?|zone|zones)\b/i;
const STRONG_ACTIVITY_DETAIL = /\b(?:make|making|build|building|create|creating|paint|painting|decorate|decorating|assemble|assembling|plant|planting|cook|cooking|bake|baking|craft|crafting|play|playing|watch|watching|read|reading|dance|dancing|sing|singing|taste|tasting|eat|eating|drink|drinking|tour|touring|hike|hiking|try|trying|practice|practicing|explore|exploring|learn|learning|design|designing|draw|drawing|sew|sewing|knit|knitting|crochet|crocheting|meet|meeting|listen|listening|perform|performing|compete|competing|solve|solving|experiment|experimenting|test|testing|launch|launching|fly|flying|throw|throwing|kick|kicking|jump|jumping|stamp|stamping|fold|folding|color|coloring|write|writing|ride|riding|walk|walking|follow|following|find|finding|collect|collecting|participate|participating|discuss|discussing|trick[- ]or[- ]treat(?:ing)?)\b/i;
const GENERIC_EXPERIENCE = /\b(?:family[- ]friendly|fun|exciting|interactive|immersive|magical|spectacular|unforgettable|special)\b[^.!?]{0,100}\bexperience\b/i;
const PROMOTIONAL_FLUFF = /\b(?:cherished|treasured|beloved|community favorite|unforgettable experience|something for everyone|perfect way to|experience the magic|make memories|memories that last|never forget|must[- ]see|can't miss|cannot miss|not to be missed)\b/i;
const SENSORY_OR_ACCESSIBILITY_DETAIL = /\b(?:visually busy|visual stimulation|sensory (?:need|needs|difference|differences|processing)|different textures?|unusual textures?|noise level|may become noisy|bright lights?|flashing lights?|loud sounds?|accessibility accommodations?)\b/i;
const ADMINISTRATIVE_COPY = /\b(?:confirm your membership|membership in a follow-up email|stops? to be announced|details? to be announced|schedule subject to change|regular library hours|library hours|organization is one of|one of the region'?s premier|now in its \d+(?:st|nd|rd|th) season|offering training and performance opportunities|experience this exhibit online or in person)\b/i;
const GENERIC_JOIN_INTRO = /^join\s+[^.!?]{1,80}\s+for\s+[^.!?]{3,140}[.!?]?$/i;
const ACTIVITY_CONTENT_NOUN = /\b(?:yoga|music|movement|food|shopping|storytelling|rhythms?|dance|dancing|stories|songs|rhymes|fingerplays?|crafts?|games?|movies?|films?|screenings?|trick[- ]or[- ]treat(?:ing)?|pumpkin decorating|face painting|magic show)\b/i;
const ABSTRACT_ACTIVITY_COPY = /\b(?:explore new ways to play and learn|engaging and fun activities|variety of activities|nurture curiosity and discover new things|designed to engage children through)\b/i;
const DIRECT_PARTICIPATION_ACTION = /(?:^(?:come\b[^.!?]{0,80}\band\s+)?(?:follow|find|collect|trick[- ]or[- ]treat(?:ing)?)\b|\b(?:you|families|kids|children|visitors|participants|attendees|guests?)\b[^.!?]{0,100}\b(?:can|will|are invited to|are welcome to)?\s*(?:follow|find|collect|trick[- ]or[- ]treat(?:ing)?)\b)/i;
const SUPPORT_ACTIVITY = /\b(?:homework help|tutoring|tutors?|study help|academic support)\b/i;

const CONTINUATION_START = /^(?:and|or|but|because|which|that|who|whose|where|when|while|until|with|without|from|by|including|such as)\b/i;
const DANGLING_INFINITIVE = /^to\s+[a-z]+\b/i;
const LOWERCASE_DEPENDENT_START = /^(?:at|in|on|for|of|into|onto|through|during|after|before|under|over|near|around|across|inside|outside|within|between|among)\b/;
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

export function splitSourceSentences(sourceText, { title = '' } = {}) {
  const text = normalizeText(sourceText);
  if (!text) return [];

  const raw = rawSentenceSegments(text);
  const normalizedTitle = normalizeText(title);
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
    const titlePunctuationContinuation = Boolean(
      normalizedTitle
      && /[.!?]$/.test(normalizedTitle)
      && previous.endsWith(normalizedTitle)
      && /^[a-z]/.test(segment)
    );

    // Sentence segmenters occasionally split after abbreviations. Merge a
    // dependent lower-case continuation after any abbreviation, and merge a
    // capitalized proper name after honorifics/initials. Time abbreviations
    // followed by a new capitalized sentence remain separate.
    if (titlePunctuationContinuation || (previousLooksAbbreviated && startsLikeContinuation) || honorificNeedsName || initialNeedsName) {
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
  return /^(?:free|by appointment|call(?:\s|\.|$)|contact\b|same day|offered in|registration|reserve\b|tickets?\b|admission\b|please\b|drop-?ins?\b|walk[- ]ins?\b|no registration|must\b|participants?\b)/i.test(value)
    || /^(?:children|kids?|adults?|teens?|famil(?:y|ies)|participants?|parents?|caregivers?|parents?\/caregivers?)\b[\s\S]{0,140}\b(?:welcome|must|should|need|able to|can comfortably|may participate|stay|remain)\b/i.test(value)
    || /^(?:designs?|prints?|library staff|color|file format|materials?)\b.*\b(?:must|are|will|may|if|criteria|available)\b/i.test(value)
    || /ada accommodation|for more information|please (?:call|email|visit)|click here|all minors under|parent\/guardian approval|release of liability|difficulty rating|terms (?:&|and) conditions|terms of use|privacy policy|refund policy|all rights reserved|rules (?:&|and) regulations|reserves the right to (?:cancel|refuse)|printable if|load and save|file format/i.test(value)
    || SENSORY_OR_ACCESSIBILITY_DETAIL.test(value)
    || ADMINISTRATIVE_COPY.test(value)
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

function isFeatureListOnly(text) {
  const value = normalizeText(text);
  const commaCount = (value.match(/,/g) || []).length;
  if (commaCount < 2 || DIRECT_PARTICIPATION_ACTION.test(value) || SUPPORT_ACTIVITY.test(value)) return false;
  // A short comma-separated inventory can still be useful fallback evidence,
  // but it should not outrank a sentence that tells families what they can do.
  // Avoid treating full clauses with an explicit subject/finite verb as lists.
  return !/\b(?:you|your|families|kids?|children|visitors?|participants?|attendees?|guests?|we|they|this|that|it|is|are|was|were|has|have|will|can|may|should|offers?|includes?|features?)\b/i.test(value);
}

export function hasActivitySignal(text) {
  const value = normalizeText(text);
  return ACTIVITY_VERB.test(value)
    || CONCRETE_ACTION.test(value)
    || DIRECT_PARTICIPATION_ACTION.test(value)
    || SUPPORT_ACTIVITY.test(value)
    || (EVENT_NOUN.test(value) && EXPERIENCE_STRUCTURE.test(value));
}

function isGenericJoinOnly(text) {
  const value = normalizeText(text);
  return GENERIC_JOIN_INTRO.test(value)
    && !CONCRETE_ACTION.test(value)
    && !DIRECT_PARTICIPATION_ACTION.test(value)
    && !SPECIFIC_OBJECT.test(value)
    && !ACTIVITY_CONTENT_NOUN.test(value);
}

function isAbstractActivityOnly(text) {
  const value = normalizeText(text);
  return ABSTRACT_ACTIVITY_COPY.test(value)
    && !SPECIFIC_OBJECT.test(value)
    && !DIRECT_PARTICIPATION_ACTION.test(value)
    && !ACTIVITY_CONTENT_NOUN.test(value);
}

export function isGenericExperienceOnly(text) {
  const value = normalizeText(text);
  return GENERIC_EXPERIENCE.test(value)
    && !STRONG_ACTIVITY_DETAIL.test(value)
    && !DIRECT_PARTICIPATION_ACTION.test(value)
    && !SUPPORT_ACTIVITY.test(value)
    && !SPECIFIC_OBJECT.test(value)
    && !EVENT_NOUN.test(value);
}

export function isPromotionalFluffOnly(text) {
  const value = normalizeText(text);
  return PROMOTIONAL_FLUFF.test(value)
    && !STRONG_ACTIVITY_DETAIL.test(value)
    && !DIRECT_PARTICIPATION_ACTION.test(value)
    && !SUPPORT_ACTIVITY.test(value)
    && !SPECIFIC_OBJECT.test(value)
    && !EVENT_NOUN.test(value);
}

export function isLikelyFragment(text) {
  const value = normalizeText(text);
  if (!value) return true;
  const words = value.match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  if (words.length < 3) return true;
  if (CONTINUATION_START.test(value)) return true;
  if (LOWERCASE_DEPENDENT_START.test(value)) return true;
  // "To make cards..." without a following independent clause is usually a
  // clause torn from the previous sentence. "To make cards, join us..." is
  // allowed because the comma introduces a complete main clause.
  if (DANGLING_INFINITIVE.test(value) && !/^[^,]{1,120},\s*[A-Z]?[a-z]+\b/.test(value)) return true;
  if (/[:;,–—-]\s*$/.test(value)) return true;
  if (/^(?:Q|A)\.\s*/.test(value)) return true;
  if (/\((?:e\.g|ex)\.\s*$/i.test(value)) return true;
  if (/^(?:also|then|however|therefore|instead|additionally)\b/i.test(value)) return true;
  return false;
}

export function isSummaryAcceptable(text, { title = '', format = '' } = {}) {
  const value = normalizeText(text);
  if (value.length < 20) return false;
  if (isLikelyFragment(value) || isLogisticsOnly(value) || isBiographyOrPromotion(value) || isOperationalNote(value) || isGenericExperienceOnly(value) || isPromotionalFluffOnly(value) || isGenericJoinOnly(value) || isAbstractActivityOnly(value)) return false;
  if (/\bpreview\b/i.test(title) && !/\b(?:preview|introduction|intro(?:duction)?|talk|discussion|guide)\b/i.test(value)) return false;
  return hasActivitySignal(value)
    || ['movie-screening', 'live-show', 'museum-exhibition', 'sports-game'].includes(format)
    || /\b(?:movies?|films?|concerts?|performances?|shows?|exhibit(?:ion)?s?|opera|ballet|musical|games?|matches?)\b/i.test(title);
}

export function hasUsableSourceContent(text) {
  const value = normalizeText(text);
  if (value.length < 20) return false;

  // Source capture is intentionally permissive. A full official description
  // can contain logistics, background, and several sentences; it should not be
  // judged by the same grammar rules as a one-sentence published summary.
  return splitSourceSentences(value).some(sentence => {
    const candidate = normalizeText(sentence);
    return candidate.length >= 20
      && !isLogisticsOnly(candidate)
      && !isBiographyOrPromotion(candidate)
      && !isOperationalNote(candidate);
  });
}

export function hasActivitySummary(text, options = {}) {
  return isSummaryAcceptable(text, options);
}

function scoreSentence(sentence, index) {
  let score = Math.min(sentence.length, 220) / 35;
  if (CONCRETE_ACTION.test(sentence)) score += 22;
  if (DIRECT_PARTICIPATION_ACTION.test(sentence)) score += 32;
  if (SUPPORT_ACTIVITY.test(sentence)) score += 14;
  if (PARTICIPATION_SIGNAL.test(sentence)) score += 8;
  if (SPECIFIC_OBJECT.test(sentence)) score += 8;
  if (/\b(?:by|while|then|and)\b/i.test(sentence) && CONCRETE_ACTION.test(sentence)) score += 3;
  if (sentence.length >= 35 && sentence.length <= 260) score += 4;
  if (sentence.length > 420) score -= 8;
  if (sentence.length < 22) score -= 8;
  if (BACKGROUND_ONLY.test(sentence)) score -= 22;
  if (PROMOTIONAL_FLUFF.test(sentence)) score -= 30;
  if (isGenericJoinOnly(sentence)) score -= 22;
  if (isAbstractActivityOnly(sentence)) score -= 28;
  if (isFeatureListOnly(sentence)) score -= 14;
  if (LOGISTICS.test(sentence)) score -= 20;
  if (isBiographyOrPromotion(sentence)) score -= 60;
  if (isOperationalNote(sentence)) score -= 24;
  if (isGenericExperienceOnly(sentence)) score -= 45;
  if (isPromotionalFluffOnly(sentence)) score -= 45;
  if (isLikelyFragment(sentence)) score -= 60;
  // Small tie-breaker toward earlier official text without allowing a generic
  // lead sentence to beat a later sentence that contains the actual activity.
  score -= index * 0.15;
  return score;
}

export function selectConcreteSourceSentence(sourceText, options = {}) {
  const sentences = splitSourceSentences(sourceText, options);
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
      && (CONCRETE_ACTION.test(item.body) || DIRECT_PARTICIPATION_ACTION.test(item.body) || SUPPORT_ACTIVITY.test(item.body) || SPECIFIC_OBJECT.test(item.body))
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

  const candidates = splitSourceSentences(text, options)
    .map((sentence, index) => ({ sentence, index, score: scoreSentence(sentence, index) }))
    .filter(item => isSummaryAcceptable(item.sentence, options))
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0]?.sentence || '';
  return selected
    ? { summary: selected, method: 'best_source_sentence', quality: 'acceptable', evidence: selected }
    : { summary: '', method: 'none', quality: 'needs_review', evidence: '' };
}

export function hasPublishableSummary(sourceText, { title = '', format = '' } = {}) {
  return Boolean(buildExtractiveSummary(sourceText, { title, format }).summary);
}

export function buildSummaryRecord({
  sourceText,
  title = '',
  format = '',
  status = 'extractive',
  verifiedAt = '',
  evidenceData = null
} = {}) {
  const sourceDescriptionRaw = normalizeText(sourceText);
  const extracted = status === 'extractive'
    ? buildExtractiveSummary(sourceDescriptionRaw, { title, format })
    : {
        summary: isSummaryAcceptable(sourceDescriptionRaw, { title, format }) ? sourceDescriptionRaw : '',
        method: status,
        quality: status === 'manual_verified' ? 'manual_verified' : 'structured',
        evidence: sourceDescriptionRaw
      };

  const parentSummary = extracted.summary || '';
  return {
    description: parentSummary,
    parentSummary,
    sourceDescriptionRaw,
    sourceDescriptionHash: sourceDescriptionRaw
      ? createHash('sha256').update(sourceDescriptionRaw).digest('hex')
      : '',
    summaryStatus: parentSummary ? status : 'needs_review',
    summaryMethod: extracted.method,
    summaryQuality: extracted.quality,
    summaryEvidence: extracted.evidence || '',
    summaryEvidenceData: evidenceData,
    summaryVersion: EVENT_SUMMARY_VERSION,
    summaryVerifiedAt: verifiedAt
  };
}

export function assessSummaryReadability(text) {
  const value = normalizeText(text);
  const issues = [];
  if (!value) issues.push('empty');
  if (value && isLikelyFragment(value)) issues.push('fragment');
  if (value && isLogisticsOnly(value)) issues.push('logistics_only');
  if (value && isBiographyOrPromotion(value)) issues.push('biography_or_promotion');
  if (value && isOperationalNote(value)) issues.push('operational_note');
  if (value && isGenericExperienceOnly(value)) issues.push('generic_experience');
  if (value && isPromotionalFluffOnly(value)) issues.push('promotional_fluff');
  if (value && isGenericJoinOnly(value)) issues.push('generic_join_intro');
  if (value && isAbstractActivityOnly(value)) issues.push('abstract_activity');
  return { ok: issues.length === 0, issues };
}

export function buildOfficialSportsSummary({ homeTeam, opponent, venue = '', gameWord = 'game', promotions = [] } = {}) {
  const cleanHome = normalizeText(homeTeam);
  const cleanOpponent = normalizeText(opponent);
  const cleanVenue = normalizeText(venue);
  const cleanGameWord = /^(?:game|match)$/i.test(String(gameWord || '')) ? String(gameWord).toLowerCase() : 'game';
  const cleanPromotions = (Array.isArray(promotions) ? promotions : [])
    .map(normalizeText)
    .filter(Boolean);

  if (!cleanHome || !cleanOpponent) {
    return { summary: '', evidenceData: null };
  }

  let summary = `Official ${cleanHome} home ${cleanGameWord} against ${cleanOpponent}${cleanVenue ? ` at ${cleanVenue}` : ''}.`;
  if (cleanPromotions.length) summary += ` Featured promotion: ${cleanPromotions.join('; ')}.`;

  return {
    summary,
    evidenceData: {
      kind: 'sports-game',
      homeTeam: cleanHome,
      opponent: cleanOpponent,
      venue: cleanVenue,
      gameWord: cleanGameWord,
      promotions: cleanPromotions
    }
  };
}

export function buildOfficialMovieScreeningSummary({ rating, theater = '' } = {}) {
  const cleanRating = normalizeText(rating);
  const cleanTheater = normalizeText(theater);
  if (!cleanRating) return { summary: '', evidenceData: null };

  return {
    summary: `${cleanRating}-rated movie screening${cleanTheater ? ` at ${cleanTheater}` : ''}.`,
    evidenceData: {
      kind: 'movie-screening',
      rating: cleanRating,
      theater: cleanTheater
    }
  };
}

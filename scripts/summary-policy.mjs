// Extractive event-summary policy for South Bay Family Finds.
//
// Trust rule: this module may select text that already exists in an official
// source description. It must never synthesize or infer new activity facts.

const CONCRETE_ACTION = /\b(?:make|making|build|building|create|creating|paint|painting|decorate|decorating|assemble|assembling|plant|planting|cook|cooking|bake|baking|craft|crafting|play|playing|watch|watching|read|reading|dance|dancing|sing|singing|taste|tasting|tour|touring|hike|hiking|try|trying|practice|practicing|explore|exploring|learn|learning|design|designing|draw|drawing|sew|sewing|knit|knitting|crochet|crocheting|meet|meeting|listen|listening|perform|performing|compete|competing|solve|solving|experiment|experimenting|test|testing|launch|launching|fly|flying|throw|throwing|kick|kicking|jump|jumping|stamp|stamping|fold|folding|coloring)\b/i;

const PARTICIPATION_SIGNAL = /\b(?:with us|hands-on|take (?:it|them) home|bring .* home|hang your|your own|kids?|children|families|participants|attendees|together)\b/i;
const SPECIFIC_OBJECT = /\b(?:feeder|kite|lantern|painting|paint|flower|keychain|cardholder|lego|legos|craft|project|experiment|game|games|story|stories|song|songs|instrument|bracelet|jewelry|robot|puzzle|moon(?:cake)?|collage|mask|puppet|book|books|seed|garden|cookie|cookies|cake|clay|pottery|origami|model|slime|rocket|birdhouse)\b/i;

const BACKGROUND_ONLY = /\b(?:our mission is|is designed to|aims? to|a great way to|fall migration season|there are lots of|celebrates? the history of|highlights? the participation of|inspires? curiosity|spark a love for|benefits? include|supports? .* development)\b/i;
const LOGISTICS_ONLY = /\b(?:parking|entrance|room|location|arrive early|first[- ]come|space is limited|registration required|register online|weather permitting|held indoors|held outdoors|cancell?ed|rescheduled)\b/i;

export function splitSourceSentences(sourceText) {
  return (String(sourceText || '').match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map(sentence => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function selectConcreteSourceSentence(sourceText) {
  const sentences = splitSourceSentences(sourceText);
  let best = null;

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    let score = 0;

    if (CONCRETE_ACTION.test(sentence)) score += 22;
    if (PARTICIPATION_SIGNAL.test(sentence)) score += 8;
    if (SPECIFIC_OBJECT.test(sentence)) score += 8;
    if (/\b(?:by|while|then|and)\b/i.test(sentence) && CONCRETE_ACTION.test(sentence)) score += 3;
    if (sentence.length >= 35 && sentence.length <= 260) score += 4;
    if (sentence.length < 22) score -= 8;
    if (BACKGROUND_ONLY.test(sentence)) score -= 22;
    if (LOGISTICS_ONLY.test(sentence)) score -= 20;

    // Small tie-breaker toward earlier source text without allowing a generic
    // first sentence to beat a later sentence that contains the real activity.
    score -= index * 0.15;

    if (!best || score > best.score) best = { sentence, score };
  }

  return best && best.score >= 22 ? best.sentence : '';
}

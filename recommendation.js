(function () {
  'use strict';

  // Recommendations optimize for a plan a family can realistically make:
  // soon, nearby when location is available, suitable, and well documented.
  // Special-event appeal helps discovery, but never overwhelms those basics.
  const CONFIG = {
    editorialBoost: 12,
    weekendSpotlightBoost: 32,
    experience: {
      festival: 16, seasonal: 16, animal: 17, performance: 17, ride: 16,
      concert: 16, nature: 15, museum: 15, cultural: 15, movie: 14,
      workshop: 13, stem: 13, sports: 12, craft: 11, storytime: 11,
      community: 9, library: 8, meetup: 7, homework: 6, default: 8
    },
    recurrence: {
      annual: 8, seasonal: 7, holiday: 7, 'one-time': 6,
      'limited-run': 5, monthly: 4, unknown: 3, biweekly: 2,
      weekly: 1, 'multiple-weekly': 0, daily: 0
    },
    topResults: 10,
    maximumDiversityPenalty: 12,
    incompleteTopResultPenalty: 18
  };

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const eventText = event => normalize([event.title, event.description, event.tag, event.format, ...(event.eventTags || [])].join(' '));
  const includesAny = (text, terms) => terms.some(term => text.includes(term));
  const dateKey = value => String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
  const daysFrom = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
  const hasAudienceEvidence = event => Boolean((event.ageRanges || []).length || event.familyFriendly || event.ageLabel || (event.ageBands || []).length);
  const hasActionableLocation = event => Boolean(String(event.address || event.meetingPoint || event.mapUrl || '').trim());

  function inferFrequency(event) {
    if (event.eventFrequency && CONFIG.recurrence[event.eventFrequency] !== undefined) return event.eventFrequency;
    const text = eventText(event);
    const source = normalize(event.source);
    if (includesAny(text, ['annual', 'anniversary', 'oktoberfest'])) return 'annual';
    if (includesAny(text, ['holiday', 'halloween', 'christmas', 'lunar new year', 'pumpkin', 'harvest'])) return 'seasonal';
    if (event.format === 'movie-screening') return 'daily';
    if (includesAny(text, ['storytime', 'story time', 'homework help', 'lego tuesday', 'lego friday'])) return 'weekly';
    if (source.includes('library') && includesAny(text, ['music movement', 'chess club', 'board game', 'crochet club', 'tai chi', 'meditation', 'reading to furry friends'])) return 'weekly';
    if (event.format === 'sports-game') return 'one-time';
    if (event.sessions?.length > 1) return 'limited-run';
    if (event.format === 'festival' || includesAny(text, ['festival', 'fair', 'carnival', 'fiesta', 'parade'])) return 'one-time';
    return 'unknown';
  }

  function getExperienceKind(event) {
    const text = eventText(event);
    const source = normalize(event.source);
    if (includesAny(text, ['storytime', 'story time', 'baby lapsit', 'bedtime story'])) return 'storytime';
    if (includesAny(text, ['homework help', 'reading buddy', 'college readiness'])) return 'homework';
    if (event.format === 'festival' || includesAny(text, ['festival', 'fair', 'carnival', 'fiesta', 'parade', 'oktoberfest'])) return 'festival';
    if (includesAny(text, ['seasonal', 'holiday', 'halloween', 'christmas', 'pumpkin', 'harvest'])) return 'seasonal';
    if (includesAny(text, ['animal encounter', 'animal ambassador', 'wildlife show', 'petting zoo'])) return 'animal';
    if (includesAny(text, ['special ride', 'train ride', 'monster jam', 'disney on ice'])) return 'ride';
    if (event.type === 'outdoor' || includesAny(text, ['bird walk', 'nature walk', 'nature program', 'ranger', 'wildlife', 'hike'])) return 'nature';
    if (includesAny(text, ['concert', 'orchestra', 'symphony', 'live music'])) return 'concert';
    if (event.format === 'live-show' || event.type === 'shows' || includesAny(text, ['performance', 'theater', 'theatre', 'dance show', 'magic show'])) return 'performance';
    if (event.format === 'museum-exhibition' || event.format === 'museum-program' || event.type === 'museums') return 'museum';
    if (includesAny(text, ['cultural', 'heritage', 'obon', 'dia de', 'community mural'])) return 'cultural';
    if (event.format === 'movie-screening' || event.type === 'movies') return 'movie';
    if (event.type === 'workshops' || includesAny(text, ['workshop', 'class', 'hands on', 'hands-on'])) return 'workshop';
    if (event.type === 'learning' || includesAny(text, ['stem', 'steam', 'science', 'engineering', 'robot', 'coding'])) return 'stem';
    if (event.format === 'sports-game' || event.type === 'sports') return 'sports';
    if (event.type === 'arts' || includesAny(text, ['craft', 'maker', 'paint', 'art activity'])) return 'craft';
    if (includesAny(text, ['meetup', 'meet up', 'club meeting'])) return 'meetup';
    if (source.includes('library')) return 'library';
    if (event.type === 'community' || event.type === 'play') return 'community';
    return 'default';
  }

  function getFamilyAppealScore(event) {
    const text = eventText(event);
    let score = 0;
    if (includesAny(text, ['animal', 'wildlife', 'petting zoo'])) score += 3;
    if (includesAny(text, ['ride', 'train', 'monster truck', 'ice show'])) score += 3;
    if (event.format === 'live-show' || includesAny(text, ['performance', 'concert', 'theater', 'theatre', 'show'])) score += 2;
    if (includesAny(text, ['hands on', 'hands-on', 'interactive', 'workshop'])) score += 2;
    if (includesAny(text, ['craft', 'make your own', 'maker'])) score += 2;
    if (event.type === 'outdoor' || includesAny(text, ['nature', 'hike', 'bird walk', 'ranger'])) score += 2;
    if (includesAny(text, ['water', 'splash', 'pool', 'playground', 'play area'])) score += 2;
    if (event.format === 'festival' || includesAny(text, ['festival', 'fair', 'carnival'])) score += 2;
    if (includesAny(text, ['character', 'costume', 'princess', 'superhero'])) score += 2;
    return Math.min(score, 10);
  }

  function getTimeScore(event, todayKey, getDateValue) {
    if (event.ongoing) return 8;
    const eventDate = dateKey(getDateValue(event));
    if (!eventDate) return 0;
    const days = daysFrom(todayKey, eventDate);
    if (days < 0) return -1000;
    if (days === 0) return 42;
    if (days === 1) return 38;
    if (days <= 3) return 32;
    if (days <= 7) {
      const weekday = new Date(`${eventDate}T12:00:00Z`).getUTCDay();
      return weekday === 0 || weekday === 6 ? 29 : 27;
    }
    if (days <= 14) return 19;
    if (days <= 30) return 12;
    if (days <= 60) return 4;
    if (days <= 90) return -2;
    return -12;
  }

  function getDistanceScore(event, getDistance) {
    if (typeof getDistance !== 'function') return 0;
    const miles = getDistance(event);
    if (!Number.isFinite(miles) || miles < 0) return 0;
    if (miles <= 2) return 16;
    if (miles <= 5) return 13;
    if (miles <= 10) return 9;
    if (miles <= 20) return 5;
    if (miles <= 35) return 2;
    return 0;
  }

  function getQualityScore(event, todayKey) {
    let score = 0;
    if (event.image) score += 1;
    if (String(event.description || '').trim().length >= 40) score += 4;
    if (hasAudienceEvidence(event)) score += 4;
    if (event.costSource || (event.costLabel && event.costLabel !== '费用未注明')) score += 1;
    if (/^https?:\/\//.test(event.url || '')) score += 3;
    if (hasActionableLocation(event)) score += 3;
    if (event.type) score += 1;
    const verifiedDate = dateKey(event.lastVerifiedAt);
    if (verifiedDate) {
      const age = daysFrom(verifiedDate, todayKey);
      if (age <= 14) score += 2;
      else if (age > 30) score -= 4;
    }
    return score;
  }

  function getReliabilityPenalty(event, todayKey, getDateValue) {
    let penalty = 0;
    const description = String(event.description || '').trim();
    const text = eventText(event);
    if (!/^https?:\/\//.test(event.url || '')) penalty -= 60;
    if (!event.ongoing && !dateKey(getDateValue(event))) penalty -= 35;
    if (!hasActionableLocation(event)) penalty -= 15;
    if (!hasAudienceEvidence(event)) penalty -= 8;
    if (description.length < 40) penalty -= 20;
    if (includesAny(text, ['cancelled', 'canceled', 'event closed', 'closure notice'])) penalty -= 1000;
    else if (includesAny(text, ['sold out', 'waitlist only', 'registration full'])) penalty -= 30;
    const verifiedDate = dateKey(event.lastVerifiedAt);
    if (verifiedDate) {
      const age = daysFrom(verifiedDate, todayKey);
      if (age > 30) penalty -= 8;
      else if (age > 14) penalty -= 4;
    }
    return penalty;
  }

  function isRecommendationReady(event, getDateValue = item => item.dateValue) {
    return /^https?:\/\//.test(event.url || '')
      && (event.ongoing || Boolean(dateKey(getDateValue(event))))
      && String(event.description || '').trim().length >= 40
      && hasActionableLocation(event)
      && hasAudienceEvidence(event);
  }

  function isActiveEditorPick(event, todayKey) {
    if (event.editorPick !== true) return false;
    const expiry = dateKey(event.editorPickUntil);
    return Boolean(expiry && String(event.editorPickReason || '').trim() && (!todayKey || expiry >= todayKey));
  }

  function getSeriesKey(event) {
    const explicit = event.seriesId || event.recurringId || event.eventGroupId;
    if (explicit) return `id:${normalize(explicit)}`;
    const frequency = inferFrequency(event);
    if (!['daily', 'multiple-weekly', 'weekly', 'biweekly', 'monthly'].includes(frequency)) return '';
    const title = normalize(event.title);
    const venue = normalize(event.venueId || event.place);
    return title && venue ? `fallback:${title}::${venue}` : '';
  }

  function calculateRecommendationScore(event, todayKey, getDateValue = item => item.dateValue, getDistance) {
    const weekendSpotlight = isWeekendSpotlight(event, todayKey, getDateValue);
    const breakdown = {
      experienceScore: CONFIG.experience[getExperienceKind(event)],
      specialnessScore: CONFIG.recurrence[inferFrequency(event)] ?? CONFIG.recurrence.unknown,
      familyAppealScore: getFamilyAppealScore(event),
      timeScore: getTimeScore(event, todayKey, getDateValue),
      distanceScore: getDistanceScore(event, getDistance),
      qualityScore: getQualityScore(event, todayKey),
      reliabilityPenalty: getReliabilityPenalty(event, todayKey, getDateValue),
      editorialBoost: isActiveEditorPick(event, todayKey) ? CONFIG.editorialBoost : 0,
      weekendSpotlightBoost: weekendSpotlight ? CONFIG.weekendSpotlightBoost : 0
    };
    return { totalScore: Object.values(breakdown).reduce((sum, value) => sum + value, 0), ...breakdown };
  }

  function isSpecialEvent(event) {
    const frequency = inferFrequency(event);
    const text = eventText(event);
    return ['annual', 'seasonal', 'holiday'].includes(frequency) || event.format === 'festival' || includesAny(text, ['festival', 'fair', 'carnival', 'parade']);
  }

  function isWeekendSpotlight(event, todayKey, getDateValue = item => item.dateValue) {
    const eventDate = dateKey(getDateValue(event));
    if (!eventDate) return false;
    const days = daysFrom(todayKey, eventDate);
    const weekday = new Date(`${eventDate}T12:00:00Z`).getUTCDay();
    // A Spotlight is an imminent, distinctive plan—not merely any event with
    // “festival” in its title. It may lack an organizer-supplied age range,
    // but must still have strong family experiences and decision-ready basics.
    return days >= 0 && days <= 3 && [5, 6, 0].includes(weekday)
      && isSpecialEvent(event)
      && getFamilyAppealScore(event) >= 4
      && /^https?:\/\//.test(event.url || '')
      && hasActionableLocation(event)
      && String(event.description || '').trim().length >= 40;
  }

  function diversifyEvents(scored) {
    const remaining = [...scored];
    const leading = [];
    const counts = { venue: new Map(), organizer: new Map(), category: new Map(), experience: new Map(), series: new Map() };
    const count = (map, key) => key ? (map.get(key) || 0) : 0;
    const increment = (map, key) => { if (key) map.set(key, count(map, key) + 1); };
    const keysFor = item => ({
      venue: normalize(item.event.venueId || item.event.place),
      organizer: normalize(item.event.organizer || item.event.source),
      category: normalize(item.event.primaryCategory || item.event.type),
      experience: getExperienceKind(item.event),
      series: getSeriesKey(item.event)
    });

    while (leading.length < CONFIG.topResults && remaining.length) {
      let selectedIndex = 0;
      let selectedAdjusted = -Infinity;
      remaining.forEach((item, index) => {
        const keys = keysFor(item);
        const rawPenalty = count(counts.venue, keys.venue) * 5
          + count(counts.organizer, keys.organizer) * 4
          + count(counts.category, keys.category) * 1.5
          + count(counts.experience, keys.experience) * 2
          + count(counts.series, keys.series) * 10;
        const diversityPenalty = Math.min(CONFIG.maximumDiversityPenalty, rawPenalty);
        const readinessPenalty = item.recommendationReady ? 0 : CONFIG.incompleteTopResultPenalty;
        const adjusted = item.totalScore - diversityPenalty - readinessPenalty;
        if (adjusted > selectedAdjusted || (adjusted === selectedAdjusted && item.totalScore > remaining[selectedIndex].totalScore)) {
          selectedIndex = index;
          selectedAdjusted = adjusted;
        }
      });
      const [selected] = remaining.splice(selectedIndex, 1);
      selected.diversityAdjustedScore = selectedAdjusted;
      leading.push(selected);
      const keys = keysFor(selected);
      Object.keys(keys).forEach(key => increment(counts[key], keys[key]));
    }
    // Diversity changes only the initial discovery viewport. It never removes
    // an activity, and the remainder keeps the transparent base-score order.
    return [...leading, ...remaining];
  }

  function rankRecommendedEvents(events, { todayKey, getDateValue = item => item.dateValue, getDistance } = {}) {
    const scored = events.map((event, originalIndex) => {
      const breakdown = calculateRecommendationScore(event, todayKey, getDateValue, getDistance);
      return { event, originalIndex, recommendationReady: isRecommendationReady(event, getDateValue), ...breakdown };
    }).sort((a, b) => b.totalScore - a.totalScore
      || String(getDateValue(a.event) || '9999').localeCompare(String(getDateValue(b.event) || '9999'))
      || String(a.event.title || '').localeCompare(String(b.event.title || ''))
      || a.originalIndex - b.originalIndex);
    return diversifyEvents(scored).map(item => {
      const editorPick = isActiveEditorPick(item.event, todayKey);
      const weekendSpotlight = isWeekendSpotlight(item.event, todayKey, getDateValue);
      return {
        ...item.event,
        recommendationScore: item.totalScore,
        recommendationReady: item.recommendationReady,
        recommendationBreakdown: {
          experienceScore: item.experienceScore,
          specialnessScore: item.specialnessScore,
          familyAppealScore: item.familyAppealScore,
          timeScore: item.timeScore,
          distanceScore: item.distanceScore,
          qualityScore: item.qualityScore,
          reliabilityPenalty: item.reliabilityPenalty,
          editorialBoost: item.editorialBoost,
          weekendSpotlightBoost: item.weekendSpotlightBoost
        },
        recommendationBadge: editorPick ? 'top-pick' : (weekendSpotlight ? 'weekend-spotlight' : (isSpecialEvent(item.event) ? 'special-event' : ''))
      };
    });
  }

  window.SouthBayRecommendation = {
    CONFIG,
    calculateRecommendationScore,
    diversifyEvents,
    getSeriesKey,
    isActiveEditorPick,
    isWeekendSpotlight,
    isRecommendationReady,
    rankRecommendedEvents
  };
}());

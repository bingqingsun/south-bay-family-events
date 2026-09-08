(function () {
  'use strict';

  const CONFIG = {
    editorialBoost: 30,
    experience: {
      festival: 35, seasonal: 32, animal: 30, ride: 30, nature: 28,
      performance: 28, concert: 27, museum: 26, cultural: 26, movie: 22,
      workshop: 22, stem: 21, sports: 18, craft: 14, community: 12,
      library: 10, storytime: 7, meetup: 5, homework: 4, default: 10
    },
    recurrence: {
      annual: 25, seasonal: 22, holiday: 22, 'one-time': 20,
      'limited-run': 18, monthly: 10, unknown: 10, biweekly: 7,
      weekly: 4, 'multiple-weekly': 2, daily: 1
    },
    topResults: 10,
    venueLimit: 2,
    organizerLimit: 2,
    categoryLimit: 3,
    experienceLimit: 3
  };

  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const eventText = event => normalize([event.title, event.description, event.tag, event.format, ...(event.eventTags || [])].join(' '));
  const includesAny = (text, terms) => terms.some(term => text.includes(term));
  const dateKey = value => String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
  const daysFrom = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

  function inferFrequency(event) {
    if (event.eventFrequency && CONFIG.recurrence[event.eventFrequency] !== undefined) return event.eventFrequency;
    const text = eventText(event);
    const source = normalize(event.source);
    if (includesAny(text, ['annual', 'festival', 'parade', 'oktoberfest'])) return 'annual';
    if (includesAny(text, ['holiday', 'halloween', 'christmas', 'lunar new year', 'pumpkin', 'fall festival'])) return 'seasonal';
    if (event.format === 'movie-screening') return 'daily';
    if (includesAny(text, ['storytime', 'story time', 'homework help', 'lego tuesday', 'lego friday'])) return 'weekly';
    if (source.includes('library') && includesAny(text, ['music movement', 'chess club', 'board game', 'crochet club', 'tai chi', 'meditation', 'reading to furry friends'])) return 'weekly';
    if (event.format === 'sports-game') return 'one-time';
    if (event.sessions?.length > 1) return 'limited-run';
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

  function getExperienceScore(event) { return CONFIG.experience[getExperienceKind(event)]; }

  function getSpecialnessScore(event) {
    return CONFIG.recurrence[inferFrequency(event)] ?? CONFIG.recurrence.unknown;
  }

  function getFamilyAppealScore(event) {
    const text = eventText(event);
    let score = 0;
    if (includesAny(text, ['animal', 'wildlife', 'petting zoo'])) score += 5;
    if (includesAny(text, ['ride', 'train', 'monster truck', 'ice show'])) score += 5;
    if (event.format === 'live-show' || includesAny(text, ['performance', 'concert', 'theater', 'theatre', 'show'])) score += 4;
    if (includesAny(text, ['hands on', 'hands-on', 'interactive', 'workshop'])) score += 4;
    if (includesAny(text, ['craft', 'make your own', 'maker'])) score += 3;
    if (event.type === 'outdoor' || includesAny(text, ['nature', 'hike', 'bird walk', 'ranger'])) score += 4;
    if (includesAny(text, ['water', 'splash', 'pool'])) score += 4;
    if (includesAny(text, ['playground', 'play area'])) score += 3;
    if (includesAny(text, ['interactive exhibit', 'hands on exhibit', 'hands-on exhibit'])) score += 4;
    if (event.format === 'festival' || includesAny(text, ['festival', 'fair', 'carnival', 'food'])) score += 2;
    if (includesAny(text, ['music', 'concert', 'sing along'])) score += 2;
    if (includesAny(text, ['competition', 'tournament', 'challenge'])) score += 3;
    if (includesAny(text, ['character', 'costume', 'princess', 'superhero'])) score += 3;
    return Math.min(score, 20);
  }

  function getTimeScore(event, todayKey, getDateValue) {
    if (event.ongoing) return 5;
    const eventDate = dateKey(getDateValue(event));
    if (!eventDate) return 0;
    const days = daysFrom(todayKey, eventDate);
    if (days < 0) return -1000;
    if (days === 0) return 15;
    if (days === 1) return 14;
    const weekday = new Date(`${eventDate}T12:00:00Z`).getUTCDay();
    if (days <= 7 && (weekday === 0 || weekday === 6)) return 13;
    if (days <= 7) return 11;
    if (days <= 14) return 8;
    if (days <= 30) return 5;
    return 2;
  }

  function getQualityScore(event) {
    let score = 0;
    if (event.image) score += 2;
    if (String(event.description || '').trim().length >= 30) score += 2;
    if ((event.ageRanges || []).length || event.familyFriendly || event.ageLabel) score += 2;
    if (event.costSource || (event.costLabel && event.costLabel !== '费用未注明')) score += 1;
    if (/^https?:\/\//.test(event.url || '')) score += 1;
    if (event.address || event.meetingPoint) score += 1;
    if (event.type) score += 1;
    return Math.min(score, 10);
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

  function calculateRecommendationScore(event, todayKey, getDateValue = item => item.dateValue) {
    const breakdown = {
      experienceScore: getExperienceScore(event),
      specialnessScore: getSpecialnessScore(event),
      familyAppealScore: getFamilyAppealScore(event),
      timeScore: getTimeScore(event, todayKey, getDateValue),
      qualityScore: getQualityScore(event),
      editorialBoost: event.editorPick === true ? CONFIG.editorialBoost : 0
    };
    return { totalScore: Object.values(breakdown).reduce((sum, value) => sum + value, 0), ...breakdown };
  }

  function isSpecialEvent(event) {
    const frequency = inferFrequency(event);
    const text = eventText(event);
    return ['annual', 'seasonal', 'holiday'].includes(frequency) || event.format === 'festival' || includesAny(text, ['festival', 'fair', 'carnival', 'parade']);
  }

  function diversifyEvents(scored) {
    const eligible = [];
    const seenSeries = new Set();
    scored.forEach(item => {
      const series = getSeriesKey(item.event);
      if (series && seenSeries.has(series)) return;
      eligible.push(item);
      if (series) seenSeries.add(series);
    });

    const leading = [];
    const venueCount = new Map();
    const organizerCount = new Map();
    const categoryCount = new Map();
    const experienceCount = new Map();
    const increment = (map, key) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
    // Keep the discovery viewport useful now: try events within the next
    // month before allowing a high-specialness event many months away into
    // the first ten. This does not change its score or its order afterward.
    const leadingOrder = [
      ...eligible.filter(item => item.timeScore >= 5),
      ...eligible.filter(item => item.timeScore < 5)
    ];
    leadingOrder.forEach(item => {
      if (leading.length >= CONFIG.topResults) return;
      const venue = normalize(item.event.venueId || item.event.place);
      const organizer = normalize(item.event.organizer || item.event.source);
      const category = normalize(item.event.primaryCategory || item.event.type);
      const experience = getExperienceKind(item.event);
      if ((venue && (venueCount.get(venue) || 0) >= CONFIG.venueLimit) ||
          (organizer && (organizerCount.get(organizer) || 0) >= CONFIG.organizerLimit) ||
          (category && (categoryCount.get(category) || 0) >= CONFIG.categoryLimit) ||
          (experience && (experienceCount.get(experience) || 0) >= CONFIG.experienceLimit)) {
        return;
      }
      leading.push(item);
      increment(venueCount, venue);
      increment(organizerCount, organizer);
      increment(categoryCount, category);
      increment(experienceCount, experience);
    });
    const selected = new Set(leading);
    return [...leading, ...eligible.filter(item => !selected.has(item))];
  }

  function rankRecommendedEvents(events, { todayKey, getDateValue = item => item.dateValue } = {}) {
    const scored = events.map((event, originalIndex) => {
      const breakdown = calculateRecommendationScore(event, todayKey, getDateValue);
      return { event, originalIndex, ...breakdown };
    }).sort((a, b) => b.totalScore - a.totalScore ||
      String(getDateValue(a.event) || '9999').localeCompare(String(getDateValue(b.event) || '9999')) ||
      String(a.event.title || '').localeCompare(String(b.event.title || '')) || a.originalIndex - b.originalIndex);
    return diversifyEvents(scored).map(item => ({
      ...item.event,
      recommendationScore: item.totalScore,
      recommendationBreakdown: {
        experienceScore: item.experienceScore,
        specialnessScore: item.specialnessScore,
        familyAppealScore: item.familyAppealScore,
        timeScore: item.timeScore,
        qualityScore: item.qualityScore,
        editorialBoost: item.editorialBoost
      },
      recommendationBadge: item.event.editorPick === true ? 'top-pick' : (isSpecialEvent(item.event) ? 'special-event' : '')
    }));
  }

  window.SouthBayRecommendation = {
    CONFIG,
    calculateRecommendationScore,
    diversifyEvents,
    getSeriesKey,
    rankRecommendedEvents
  };
}());

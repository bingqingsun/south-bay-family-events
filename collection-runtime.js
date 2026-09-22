/* Shared Collection Runtime v1
 *
 * Editorial metadata lives in data/collections.js. This module resolves that
 * metadata against the complete event database and produces the single
 * lifecycle/view-model used by both the homepage and collection landing pages.
 */
(function initCollectionRuntime(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SBFFCollectionRuntime = api;
})(typeof window !== 'undefined' ? window : globalThis, function createCollectionRuntime(root) {
  'use strict';

  const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
  const STATES = Object.freeze({
    DRAFT: 'DRAFT',
    FEATURED: 'FEATURED',
    LAST_CHANCE: 'LAST_CHANCE',
    ENDED: 'ENDED',
    DATA_ERROR: 'DATA_ERROR'
  });

  function dateKey(value) {
    return String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || '';
  }

  function localDateTime(value, { endOfDay = false } = {}) {
    const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!match) return '';
    if (!match[2]) return `${match[1]}T${endOfDay ? '23:59:59' : '00:00:00'}`;
    return `${match[1]}T${match[2]}:${match[3]}:${match[4] || '00'}`;
  }

  function pacificLocalFromInstant(value = new Date()) {
    const instant = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(instant.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PACIFIC_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(instant).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }

  function normalizePacificComparable(value, { endOfDay = false } = {}) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) return pacificLocalFromInstant(text);
    return localDateTime(text, { endOfDay });
  }

  function resolveNowPacific(now) {
    if (typeof now === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(now) && !/Z$|[+-]\d{2}:?\d{2}$/.test(now)) {
      return localDateTime(now);
    }
    return pacificLocalFromInstant(now || new Date());
  }

  function publishAtIsFuture(config, nowPacific) {
    if (!config.publishAt) return false;
    const publishAt = normalizePacificComparable(config.publishAt);
    return Boolean(publishAt && publishAt > nowPacific);
  }

  function standaloneEventIsCurrent(event, nowPacific) {
    if (!event) return false;
    if (event.ongoing === true && !event.endDateValue) return true;
    if (event.endDateValue) {
      const end = normalizePacificComparable(event.endDateValue, { endOfDay: !/[T ]\d{2}:\d{2}/.test(String(event.endDateValue)) });
      return Boolean(end && end >= nowPacific);
    }
    const startDate = dateKey(event.dateValue);
    if (!startDate) return false;
    return `${startDate}T23:59:59` >= nowPacific;
  }

  function sessionIsCurrent(session, event, nowPacific) {
    if (!session) return false;
    if (session.endDateValue) {
      const end = normalizePacificComparable(session.endDateValue, { endOfDay: !/[T ]\d{2}:\d{2}/.test(String(session.endDateValue)) });
      return Boolean(end && end >= nowPacific);
    }
    const sessionDate = dateKey(session.dateValue || event?.dateValue);
    if (!sessionDate) return false;
    return `${sessionDate}T23:59:59` >= nowPacific;
  }

  function getCurrentSessions(event, now = new Date()) {
    const nowPacific = resolveNowPacific(now);
    const sessions = Array.isArray(event?.sessions) && event.sessions.length ? event.sessions : null;
    if (!sessions) return standaloneEventIsCurrent(event, nowPacific) ? [event] : [];
    return sessions
      .filter((session) => sessionIsCurrent(session, event, nowPacific))
      .slice()
      .sort((a, b) => String(a.dateValue || '').localeCompare(String(b.dateValue || '')));
  }

  function eventIsCurrent(event, now = new Date()) {
    return getCurrentSessions(event, now).length > 0;
  }

  function buildEventIndex(events) {
    const byId = new Map();
    (events || []).forEach((event) => {
      if (!event?.id) return;
      byId.set(event.id, event);
      (event.legacyIds || []).forEach((legacyId) => {
        if (legacyId) byId.set(legacyId, event);
      });
    });
    return byId;
  }

  function resolveReference(reference, byId, events) {
    if (typeof reference === 'string') return byId.get(reference) || null;
    if (!reference || typeof reference !== 'object') return null;
    if (reference.id && byId.has(reference.id)) return byId.get(reference.id);
    if (!reference.url) return null;
    return (events || []).find((event) => event.url === reference.url
      || (event.sessions || []).some((session) => session.url === reference.url)) || null;
  }

  function uniqueCanonical(events) {
    const seen = new Set();
    return (events || []).filter((event) => {
      if (!event?.id || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }

  function firstCurrentDate(event, sessions) {
    const values = (sessions || []).map((session) => dateKey(session.dateValue || event.dateValue)).filter(Boolean);
    return values.sort()[0] || dateKey(event.dateValue) || '9999-12-31';
  }

  function currentDateRange(currentEvents, currentSessionsByEventId) {
    const starts = [];
    const ends = [];
    currentEvents.forEach((event) => {
      const sessions = currentSessionsByEventId[event.id] || [];
      sessions.forEach((session) => {
        const start = dateKey(session.dateValue || event.dateValue);
        const end = dateKey(session.endDateValue || session.dateValue || event.endDateValue || event.dateValue);
        if (start) starts.push(start);
        if (end) ends.push(end);
      });
    });
    if (!starts.length && !ends.length) return null;
    const sortedStarts = starts.slice().sort();
    const sortedEnds = ends.slice().sort();
    return {
      start: sortedStarts[0] || sortedEnds[0],
      end: sortedEnds.at(-1) || sortedStarts.at(-1)
    };
  }

  function stateFor(config, {
    nowPacific,
    resolvedEditorialCount,
    currentEventCount,
    expiredCount,
    selectedRefCount
  }) {
    if (config.published === false || publishAtIsFuture(config, nowPacific)) return STATES.DRAFT;
    if (selectedRefCount === 0 || resolvedEditorialCount === 0) return STATES.DATA_ERROR;
    if (currentEventCount === 0) return STATES.ENDED;
    const threshold = Number.isFinite(Number(config.lastChanceThreshold)) ? Number(config.lastChanceThreshold) : 2;
    if (expiredCount > 0 && resolvedEditorialCount > threshold && currentEventCount <= threshold) return STATES.LAST_CHANCE;
    return STATES.FEATURED;
  }

  function buildCollectionViewModel(config, events, { now } = {}) {
    if (!config || typeof config !== 'object') throw new Error('Collection config is required');
    const databaseEvents = Array.isArray(events) ? events : [];
    const nowPacific = resolveNowPacific(now || new Date());
    const byId = buildEventIndex(databaseEvents);
    const selectedRefs = Array.isArray(config.selectedEventRefs) ? config.selectedEventRefs : [];
    const unresolvedRefs = [];
    const resolvedRaw = [];

    selectedRefs.forEach((reference) => {
      const event = resolveReference(reference, byId, databaseEvents);
      if (event) resolvedRaw.push(event);
      else unresolvedRefs.push(reference);
    });

    const resolvedEvents = uniqueCanonical(resolvedRaw);
    const currentSessionsByEventId = {};
    const currentEvents = [];
    const expiredEvents = [];

    resolvedEvents.forEach((event) => {
      const sessions = getCurrentSessions(event, nowPacific);
      currentSessionsByEventId[event.id] = sessions;
      if (sessions.length) currentEvents.push(event);
      else expiredEvents.push(event);
    });

    currentEvents.sort((a, b) => firstCurrentDate(a, currentSessionsByEventId[a.id])
      .localeCompare(firstCurrentDate(b, currentSessionsByEventId[b.id])));

    const resolvedById = buildEventIndex(resolvedEvents);
    const currentIds = new Set(currentEvents.map((event) => event.id));
    const quickRefs = Array.isArray(config.quickPickIds) ? config.quickPickIds : [];
    const currentQuickPicks = uniqueCanonical(quickRefs
      .map((reference) => resolveReference(reference, resolvedById, resolvedEvents))
      .filter((event) => event && currentIds.has(event.id)));

    const cities = [];
    const seenCities = new Set();
    currentEvents.forEach((event) => {
      const city = String(event.city || '').trim();
      if (city && !seenCities.has(city)) {
        seenCities.add(city);
        cities.push(city);
      }
    });

    const collectionState = stateFor(config, {
      nowPacific,
      resolvedEditorialCount: resolvedEvents.length,
      currentEventCount: currentEvents.length,
      expiredCount: expiredEvents.length,
      selectedRefCount: selectedRefs.length
    });

    return Object.freeze({
      slug: config.slug,
      config,
      nowPacific,
      resolvedEvents,
      unresolvedRefs,
      resolvedEditorialCount: resolvedEvents.length,
      currentEvents,
      expiredEvents,
      currentEventCount: currentEvents.length,
      currentQuickPicks,
      currentDateRange: currentDateRange(currentEvents, currentSessionsByEventId),
      currentCities: cities,
      collectionState,
      dataIncomplete: unresolvedRefs.length > 0,
      currentSessionsByEventId
    });
  }

  function getCollectionConfig(slug, collections) {
    const source = Array.isArray(collections) ? collections : (root?.SBFF_COLLECTIONS || []);
    return source.find((collection) => collection.slug === slug) || null;
  }

  function getCollectionViewModel(slug, {
    collections,
    events,
    now
  } = {}) {
    const config = getCollectionConfig(slug, collections);
    if (!config) return null;
    const sourceEvents = Array.isArray(events) ? events : (Array.isArray(root?.SOUTH_BAY_EVENTS) ? root.SOUTH_BAY_EVENTS : []);
    return buildCollectionViewModel(config, sourceEvents, { now });
  }

  function analyticsState(state) {
    return ({
      [STATES.FEATURED]: 'featured',
      [STATES.LAST_CHANCE]: 'last_chance',
      [STATES.ENDED]: 'ended',
      [STATES.DATA_ERROR]: 'data_error',
      [STATES.DRAFT]: 'draft'
    })[state] || 'data_error';
  }

  return Object.freeze({
    PACIFIC_TIME_ZONE,
    STATES,
    analyticsState,
    buildCollectionViewModel,
    eventIsCurrent,
    getCollectionConfig,
    getCollectionViewModel,
    getCurrentSessions,
    pacificLocalFromInstant,
    resolveNowPacific
  });
});

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SBFFAgePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Age is a factual organizer claim, not a presentation guess.
  // The UI may display only the evidence-backed label produced by ingestion.
  // Internal ageRanges may support filtering, but must never be converted back
  // into a user-facing age claim.
  function displayLabel(event = {}) {
    if (!event.ageSource) return '';
    return String(event.ageLabel || '').trim();
  }

  return { displayLabel };
});

/* Shared Event Card v1
 *
 * This module is the sole owner of the event-card DOM structure. Page renderers
 * pass their page context and then populate the documented slots; they must not
 * maintain a second <template> copy.
 */
(() => {
  const template = document.createElement('template');
  template.innerHTML = `
    <article class="event-card" data-component="event-card">
      <div class="card-image">
        <span class="event-icon"></span>
        <span class="tag"></span>
        <span class="image-provenance-badge" hidden></span>
        <button class="heart" type="button" aria-label="Save activity">♡</button>
      </div>
      <div class="card-content">
        <h3></h3>
        <div class="card-facts" aria-label="Ages, rating, cost, and registration">
          <span class="fact fact-age"></span>
          <span class="fact fact-rating"></span>
          <span class="fact fact-cost"></span>
          <span class="fact fact-registration"></span>
        </div>
        <p class="distance" hidden></p>
        <p class="description"></p>
        <button class="description-toggle" type="button" hidden></button>
        <div class="details">
          <div class="detail-row time">
            <svg class="detail-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path></svg>
            <div class="time-content"><div class="time-primary"><span class="detail-text"></span><button class="sessions-inline-toggle" type="button" hidden></button></div><ul class="sessions-list" hidden></ul></div>
          </div>
          <div class="detail-row place">
            <svg class="detail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V4h12v16M3 20h18M10 8h1M10 12h1M14 8h1M14 12h1"></path></svg>
            <span class="detail-text"></span>
          </div>
          <div class="detail-row address" hidden>
            <svg class="detail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5.1-8 11-8 11S4 15.1 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>
            <span class="detail-text"></span>
            <button class="address-link" type="button" hidden><span class="directions"></span><svg class="directions-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 7l5 5-5 5"></path></svg></button>
          </div>
        </div>
        <a class="source-link" target="_blank" rel="noopener">View activity details <span>→</span></a>
      </div>
    </article>`;

  /**
   * EventCard.render({ eventId, entryPoint }) returns the canonical card
   * fragment. Required slots are: image, tag, title, facts, description,
   * time, place, address, save action, and details action.
   */
  function render({ eventId = '', entryPoint = '' } = {}) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.event-card');
    card.dataset.eventId = eventId;
    card.dataset.entryPoint = entryPoint;
    return node;
  }

  // Display a verified multi-day window instead of a misleading start-only date.
  // Series with separate sessions must use the chosen session's dates; the
  // parent event's broad window is not necessarily a continuous event.
  function formatMultiDayRange(event, session, locale = 'en') {
    const hasSessions = Array.isArray(event?.sessions) && event.sessions.length > 0;
    const item = hasSessions ? session : event;
    const parseDay = value => {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?=$|[T ])/);
      return match ? { key: match[0], year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
    };
    const start = parseDay(item?.dateValue);
    const end = parseDay(item?.endDateValue);
    if (!start || !end || end.key <= start.key) return '';

    const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }).format(new Date()));
    const showYear = start.year !== currentYear || end.year !== currentYear;
    if (locale === 'zh') {
      const first = `${showYear ? `${start.year}年` : ''}${start.month}月${start.day}日`;
      const last = `${start.year !== end.year ? `${end.year}年` : ''}${end.month}月${end.day}日`;
      return `${first} – ${last}`;
    }
    const month = value => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })
      .format(new Date(Date.UTC(value.year, value.month - 1, value.day, 12)));
    const first = `${month(start)} ${start.day}`;
    const last = start.year === end.year && start.month === end.month
      ? String(end.day) : `${month(end)} ${end.day}`;
    if (start.year !== end.year) return `${first}, ${start.year} – ${month(end)} ${end.day}, ${end.year}`;
    return `${first} – ${last}${showYear ? `, ${end.year}` : ''}`;
  }

  window.SBFFEventCard = Object.freeze({ render, formatMultiDayRange });
})();

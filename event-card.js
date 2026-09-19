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

  window.SBFFEventCard = Object.freeze({ render });
})();

/* Shared map-provider picker for every Event Card surface. */
(() => {
  let active = null;

  const cleanText = (value) => String(value || '').trim();
  const validCoordinates = (latitude, longitude) => Number.isFinite(latitude)
    && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  function coordinateValue(value) {
    if (!value) return '';
    if (typeof value === 'string') {
      const match = value.trim().match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if (match && validCoordinates(Number(match[1]), Number(match[2]))) return `${match[1]},${match[2]}`;
      return '';
    }
    if (Array.isArray(value) && validCoordinates(Number(value[0]), Number(value[1]))) return `${value[0]},${value[1]}`;
    if (typeof value === 'object') {
      const latitude = Number(value.latitude ?? value.lat);
      const longitude = Number(value.longitude ?? value.lng ?? value.lon);
      if (validCoordinates(latitude, longitude)) return `${latitude},${longitude}`;
    }
    return '';
  }

  function coordinatesFromMapUrl(value) {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return '';
      const fromPath = url.href.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
      if (fromPath && validCoordinates(Number(fromPath[1]), Number(fromPath[2]))) return `${fromPath[1]},${fromPath[2]}`;
      for (const key of ['destination', 'daddr', 'q', 'query']) {
        const coordinates = coordinateValue(url.searchParams.get(key));
        if (coordinates) return coordinates;
      }
    } catch { /* An organizer URL is not a safe provider-neutral destination. */ }
    return '';
  }

  function getNavigationTarget({ event = {}, session = {} } = {}) {
    const coordinateCandidates = [
      session.coordinates, session.coordinate, session.location, session.geo,
      event.coordinates, event.coordinate, event.location, event.geo
    ];
    for (const candidate of coordinateCandidates) {
      const coordinates = coordinateValue(candidate);
      if (coordinates) return { destination: coordinates, type: 'coordinates' };
    }
    const address = cleanText(session.address) || cleanText(event.address);
    if (address) return { destination: address, type: 'address' };
    const coordinates = coordinatesFromMapUrl(session.mapUrl || event.mapUrl);
    return coordinates ? { destination: coordinates, type: 'coordinates' } : null;
  }

  function providerUrl(provider, destination) {
    const encoded = encodeURIComponent(destination);
    return provider === 'apple_maps'
      ? `https://maps.apple.com/?daddr=${encoded}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  }

  function closePicker() {
    if (!active) return;
    const { root, trigger, cleanups } = active;
    cleanups.forEach((cleanup) => cleanup());
    root.remove();
    active = null;
    trigger?.focus?.();
  }

  function createPicker({ target, place, trigger, analyticsParameters }) {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const root = document.createElement('div');
    root.className = `map-picker-layer${mobile ? ' is-mobile' : ' is-desktop'}`;
    root.innerHTML = `
      <div class="map-picker-backdrop" aria-hidden="true"></div>
      <section class="map-picker" role="dialog" aria-modal="${mobile}" aria-labelledby="mapPickerTitle" aria-describedby="mapPickerDescription" tabindex="-1">
        <button class="map-picker-close" type="button" aria-label="Close map options">×</button>
        <p class="map-picker-eyebrow">GET DIRECTIONS</p>
        <h2 id="mapPickerTitle">Choose a map app</h2>
        <p id="mapPickerDescription">${place ? `Directions to ${place}` : 'Open directions in your preferred map app.'}</p>
        <div class="map-picker-options">
          <button type="button" data-map-provider="apple_maps"><span class="map-provider-icon" aria-hidden="true"></span><span><b>Apple Maps</b><small>Open in Maps</small></span><span aria-hidden="true">›</span></button>
          <button type="button" data-map-provider="google_maps"><span class="map-provider-icon google" aria-hidden="true">G</span><span><b>Google Maps</b><small>Open in Google Maps</small></span><span aria-hidden="true">›</span></button>
        </div>
      </section>`;
    document.body.append(root);
    return root;
  }

  function openMapPicker({ event, session, analyticsParameters = {}, triggerElement }) {
    const target = getNavigationTarget({ event, session });
    if (!target || !triggerElement) return false;
    if (active?.trigger === triggerElement) { closePicker(); return true; }
    closePicker();

    const place = cleanText(session?.place) || cleanText(event?.place) || cleanText(event?.city);
    const root = createPicker({ target, place, trigger: triggerElement, analyticsParameters });
    const panel = root.querySelector('.map-picker');
    const mobile = root.classList.contains('is-mobile');
    const cleanups = [];
    let navigating = false;

    const position = () => {
      if (mobile) return;
      const rect = triggerElement.getBoundingClientRect();
      const width = panel.offsetWidth || 310;
      const height = panel.offsetHeight || 240;
      panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - height - 12))}px`;
    };
    position();

    const close = () => closePicker();
    root.querySelector('.map-picker-close').addEventListener('click', close);
    root.querySelector('.map-picker-backdrop').addEventListener('click', close);
    const onKeydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('button:not([disabled])')];
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeydown);
    cleanups.push(() => document.removeEventListener('keydown', onKeydown));
    const onViewportChange = () => position();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    cleanups.push(() => window.removeEventListener('resize', onViewportChange));
    cleanups.push(() => window.removeEventListener('scroll', onViewportChange, true));

    let startY = null;
    const onPointerDown = (event) => { startY = event.clientY; };
    const onPointerUp = (event) => { if (mobile && startY !== null && event.clientY - startY > 60) close(); startY = null; };
    panel.addEventListener('pointerdown', onPointerDown);
    panel.addEventListener('pointerup', onPointerUp);
    cleanups.push(() => panel.removeEventListener('pointerdown', onPointerDown));
    cleanups.push(() => panel.removeEventListener('pointerup', onPointerUp));

    root.querySelectorAll('[data-map-provider]').forEach((button) => button.addEventListener('click', () => {
      if (navigating) return;
      navigating = true;
      const provider = button.dataset.mapProvider;
      window.trackAnalyticsEvent?.('directions_click', { ...analyticsParameters, map_provider: provider });
      const destinationUrl = providerUrl(provider, target.destination);
      const opened = window.open(destinationUrl, '_blank');
      if (opened) opened.opener = null;
      else window.location.assign(destinationUrl);
      closePicker();
    }));
    active = { root, trigger: triggerElement, cleanups };
    window.requestAnimationFrame(() => root.querySelector('[data-map-provider="apple_maps"]')?.focus());
    return true;
  }

  window.SBFFMapNavigation = Object.freeze({ getNavigationTarget, openMapPicker, providerUrl });
})();

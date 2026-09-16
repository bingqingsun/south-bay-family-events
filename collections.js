(() => {
  const collectionSlug = 'mid-autumn-festival';

  function track(name, parameters) {
    if (typeof window.trackAnalyticsEvent === 'function') {
      window.trackAnalyticsEvent(name, parameters);
    }
  }

  function formatEventDate(event) {
    if (!event.dateValue) return event.date || '';
    const value = new Date(event.dateValue);
    if (Number.isNaN(value.getTime())) return event.date || '';
    const hasTime = String(event.dateValue).includes('T');
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {})
    }).format(value);
  }

  function englishCost(event) {
    if (event.costStatus === 'free') return 'Free';
    if (event.costStatus === 'paid') return event.costLabel || 'Paid';
    return 'Check organizer';
  }

  function isCurrent(event) {
    const endValue = event.endDateValue || event.dateValue;
    if (!endValue) return true;
    const endDate = new Date(endValue);
    if (Number.isNaN(endDate.getTime())) return true;
    return endDate.getTime() >= Date.now();
  }

  function renderCollectionEvents() {
    const grid = document.getElementById('collectionEventGrid');
    if (!grid) return;

    const events = Array.isArray(window.SOUTH_BAY_EVENTS)
      ? window.SOUTH_BAY_EVENTS
          .filter((event) => event.seasonalTheme === 'mid-autumn' && isCurrent(event))
          .sort((a, b) => String(a.dateValue).localeCompare(String(b.dateValue)))
      : [];

    const empty = document.getElementById('collectionEmpty');
    if (!events.length) {
      if (empty) empty.hidden = false;
      return;
    }

    events.forEach((event, index) => {
      const article = document.createElement('article');
      article.className = 'collection-event-card';
      article.id = `event-${event.id}`;

      const image = document.createElement('div');
      image.className = 'collection-event-image';
      if (event.image) image.style.backgroundImage = `url("${String(event.image).replace(/"/g, '%22')}")`;

      const body = document.createElement('div');
      body.className = 'collection-event-body';

      const date = document.createElement('span');
      date.className = 'collection-event-date';
      date.textContent = `${formatEventDate(event)} · ${event.city || 'South Bay'}`;

      const title = document.createElement('h3');
      title.textContent = event.title;

      const facts = document.createElement('div');
      facts.className = 'collection-event-facts';
      facts.textContent = [event.ageLabel || 'Family-friendly', englishCost(event), event.place]
        .filter(Boolean)
        .join(' · ');

      const description = document.createElement('p');
      description.className = 'collection-event-description';
      description.textContent = event.description || 'See the organizer page for current activity details.';

      const link = document.createElement('a');
      link.className = 'collection-event-link';
      link.href = event.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.innerHTML = 'View activity details <span>→</span>';
      link.addEventListener('click', () => {
        const parameters = {
          collection_slug: collectionSlug,
          collection_position: index + 1,
          event_id: event.id,
          event_title: event.title,
          event_city: event.city || '',
          event_type: event.type || '',
          event_date: event.dateValue || '',
          source_name: event.source || ''
        };
        track('collection_event_click', parameters);
        track('view_event_details', {
          ...parameters,
          entry_point: 'collection',
          date_filter: 'collection',
          city_filter: event.city || 'all',
          age_filter: 'all',
          type_filter: event.type || 'all',
          sort_order: 'editorial',
          saved_only: false
        });
      });

      body.append(date, title, facts, description, link);
      article.append(image, body);
      grid.append(article);
    });

    track('collection_view', {
      collection_slug: collectionSlug,
      collection_title: '2026 South Bay Mid-Autumn Festival Guide',
      event_count: events.length
    });
  }

  function bindCollectionEntry() {
    document.querySelectorAll('[data-collection-slug]').forEach((entry, index) => {
      entry.addEventListener('click', () => {
        track('collection_card_click', {
          collection_slug: entry.dataset.collectionSlug,
          collection_position: index + 1,
          entry_point: 'homepage'
        });
      });
    });
  }

  function bindQuickPicks() {
    document.querySelectorAll('[data-quick-pick]').forEach((pick) => {
      pick.addEventListener('click', () => {
        track('collection_quick_pick_click', {
          collection_slug: collectionSlug,
          quick_pick: pick.dataset.quickPick
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindCollectionEntry();
    bindQuickPicks();
    renderCollectionEvents();
  });
})();

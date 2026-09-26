(() => {
  const measurementId = 'G-VV1LPH4DE9';
  const consentKey = 'southBayFamilyFindsAnalyticsConsent';
  const languagePreferenceKey = 'southBayFamilyFindsLanguage';
  const publishedHosts = new Set([
    'bingqingsun.github.io',
    'southbayfamilyfinds.com',
    'www.southbayfamilyfinds.com'
  ]);
  const isPublishedSite = publishedHosts.has(window.location.hostname);
  let enabled = false;

  window.trackAnalyticsEvent = () => {};

  function readLanguagePreference() {
    try {
      const value = localStorage.getItem(languagePreferenceKey);
      return value === 'zh' || value === 'en' ? value : '';
    } catch {
      return '';
    }
  }

  function saveLanguagePreference(language) {
    if (language !== 'zh' && language !== 'en') return;
    try {
      localStorage.setItem(languagePreferenceKey, language);
    } catch {
      // Browsing still works when storage is unavailable.
    }
  }

  function browserPrefersChinese() {
    const primaryLanguage = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages[0]
      : navigator.language || '';
    return String(primaryLanguage).toLowerCase().startsWith('zh');
  }

  function applyInitialLanguagePreference() {
    if (!document.body?.classList.contains('home-page')) return;
    const currentLanguage = window.SBFF_LOCALE === 'zh' || document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    if (currentLanguage !== 'en') return;

    const savedLanguage = readLanguagePreference();
    const shouldUseChinese = savedLanguage === 'zh' || (!savedLanguage && browserPrefersChinese());
    if (!shouldUseChinese) return;

    const chineseLink = document.querySelector('[data-language-switch="zh"]');
    if (!chineseLink) return;
    const target = new URL(chineseLink.href, window.location.href);
    target.search = window.location.search;
    target.hash = window.location.hash;
    if (target.href !== window.location.href) window.location.replace(target.href);
  }

  function enableAnalytics() {
    if (!isPublishedSite || enabled || localStorage.getItem(consentKey) === 'denied') return;
    enabled = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true
    });
    window.trackAnalyticsEvent = (name, parameters = {}) => {
      const language = window.SBFF_LOCALE === 'zh' || document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
      const contentType = document.body?.classList.contains('collection-page') ? 'collection' : document.body?.classList.contains('home-page') ? 'home' : 'page';
      window.gtag('event', name, { page_language: language, page_path: window.location.pathname, content_type: contentType, ...parameters });
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
  }

  function setAnalyticsChoice(choice) {
    if (choice === 'denied') {
      localStorage.setItem(consentKey, 'denied');
      window[`ga-disable-${measurementId}`] = true;
      window.trackAnalyticsEvent = () => {};
      return;
    }
    localStorage.removeItem(consentKey);
    window[`ga-disable-${measurementId}`] = false;
    enableAnalytics();
  }

  window.setSouthBayFamilyFindsAnalyticsConsent = setAnalyticsChoice;

  document.addEventListener('click', (event) => {
    const weekendPicksCard = event.target.closest('.collection-home-card[data-collection-slug="weekend-picks"]');
    if (weekendPicksCard) {
      const edition = window.SBFF_WEEKEND_PICKS || {};
      window.trackAnalyticsEvent?.('weekend_picks_card_click', {
        edition_id: edition.id || '',
        weekend_start: edition.weekendStart || '',
        weekend_end: edition.weekendEnd || '',
        pick_count: Array.isArray(edition.picks) ? edition.picks.length : 0,
        entry_point: 'homepage'
      });
    }

    const link = event.target.closest('[data-language-switch]');
    if (!link) return;
    const preferredLanguage = link.dataset.languageSwitch === 'zh' ? 'zh' : 'en';
    saveLanguagePreference(preferredLanguage);
    const fromLanguage = window.SBFF_LOCALE === 'zh' || document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
    const toLanguage = preferredLanguage === 'zh' ? 'zh-Hans' : 'en';
    window.trackAnalyticsEvent?.('language_switch', { from_language: fromLanguage, to_language: toLanguage });
  });

  applyInitialLanguagePreference();
  document.addEventListener('DOMContentLoaded', enableAnalytics);
})();

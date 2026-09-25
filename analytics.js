(() => {
  const measurementId = 'G-VV1LPH4DE9';
  const consentKey = 'southBayFamilyFindsAnalyticsConsent';
  const publishedHosts = new Set([
    'bingqingsun.github.io',
    'southbayfamilyfinds.com',
    'www.southbayfamilyfinds.com'
  ]);
  const isPublishedSite = publishedHosts.has(window.location.hostname);
  let enabled = false;

  window.trackAnalyticsEvent = () => {};

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
    const link = event.target.closest('[data-language-switch]');
    if (!link) return;
    const fromLanguage = window.SBFF_LOCALE === 'zh' || document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';
    const toLanguage = link.dataset.languageSwitch === 'zh' ? 'zh-Hans' : 'en';
    window.trackAnalyticsEvent?.('language_switch', { from_language: fromLanguage, to_language: toLanguage });
  });
  document.addEventListener('DOMContentLoaded', enableAnalytics);
})();

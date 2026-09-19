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
    window.trackAnalyticsEvent = (name, parameters = {}) => window.gtag('event', name, parameters);
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

  document.addEventListener('DOMContentLoaded', enableAnalytics);
})();

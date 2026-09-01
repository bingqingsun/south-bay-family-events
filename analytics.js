(() => {
  const measurementId = 'G-VV1LPH4DE9';
  const consentKey = 'southBayFamilyPlansAnalyticsConsent';
  const publishedHosts = new Set(['bingqingsun.github.io', 'southbayfamilyplans.com', 'www.southbayfamilyplans.com']);
  const isPublishedSite = publishedHosts.has(window.location.hostname);
  let enabled = false;

  window.trackAnalyticsEvent = () => {};

  function enableAnalytics() {
    if (!isPublishedSite || enabled) return;
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

  function saveChoice(choice) {
    localStorage.setItem(consentKey, choice);
    if (choice === 'granted') enableAnalytics();
    const banner = document.querySelector('#analyticsConsent');
    if (banner) banner.hidden = true;
  }

  window.setWeekendPlansAnalyticsConsent = saveChoice;

  document.addEventListener('DOMContentLoaded', () => {
    if (!isPublishedSite) return;
    const choice = localStorage.getItem(consentKey);
    if (choice === 'granted') { enableAnalytics(); return; }
    if (choice === 'denied') return;
    const banner = document.querySelector('#analyticsConsent');
    if (!banner) return;
    banner.hidden = false;
    banner.querySelector('[data-analytics-choice="granted"]')?.addEventListener('click', () => saveChoice('granted'));
    banner.querySelector('[data-analytics-choice="denied"]')?.addEventListener('click', () => saveChoice('denied'));
  });
})();

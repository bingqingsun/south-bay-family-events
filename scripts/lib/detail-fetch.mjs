function hostAllowed(value, allowedHosts = []) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return allowedHosts.some(item => host === item || host.endsWith('.' + item));
  } catch {
    return false;
  }
}

export async function fetchOfficialDetail(url, {
  allowedHosts = [],
  timeoutMs = 12000,
  userAgent = 'SouthBayFamilyEventsBot/1.0',
  fetchImpl = fetch
} = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': userAgent, 'accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs)
    });
    const contentType = response.headers?.get?.('content-type') || '';
    // Some municipal CMS/CDN responses are readable event pages but advertise
    // an unusual or missing MIME type. Identity validation happens after this
    // fetch, so reading the body is safer than treating MIME metadata as proof
    // that no detail page exists.
    const html = await response.text();
    let finalUrl = response.url || url;
    if (allowedHosts.length && !hostAllowed(finalUrl, allowedHosts)) finalUrl = url;
    return {
      ok: response.ok && Boolean(html),
      status: response.status,
      html,
      finalUrl,
      contentType,
      durationMs: Date.now() - startedAt,
      error: response.ok ? '' : 'HTTP ' + response.status
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: url,
      contentType: '',
      durationMs: Date.now() - startedAt,
      error: String(error?.message || error || 'detail fetch failed').slice(0, 240)
    };
  }
}

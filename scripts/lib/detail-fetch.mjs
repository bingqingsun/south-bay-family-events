export async function fetchOfficialDetail(url, {
  domain = '',
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
    const contentType = response.headers.get('content-type') || '';
    const html = /html|xhtml/i.test(contentType) || !contentType ? await response.text() : '';
    let finalUrl = response.url || url;
    const hosts = [...new Set([domain, ...allowedHosts].map(value => String(value || '').toLowerCase()).filter(Boolean))];
    if (hosts.length) {
      try {
        const host = new URL(finalUrl).hostname.toLowerCase();
        const approved = hosts.some(value => host === value || host.endsWith('.' + value));
        if (!approved) finalUrl = url;
      } catch {
        finalUrl = url;
      }
    }
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

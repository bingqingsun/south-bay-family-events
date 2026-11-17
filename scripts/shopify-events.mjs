import { plainText } from './special-event-pages.mjs';
import { officialDateWindowFromText } from './lib/event-lifecycle.mjs';

// Only dated visitor event pages qualify. Vendor applications and commerce
// products are deliberately outside the /pages feed.
export function shopifyEventSeeds(pages, source, today) {
  const horizon = new Date(today + 'T12:00:00Z');
  horizon.setUTCDate(horizon.getUTCDate() + (source.discoveryDays || 90));
  const lastDay = horizon.toISOString().slice(0, 10);
  return pages.flatMap(page => {
    const title = plainText(page.title);
    const year = title.match(/\b(20\d{2})\b/)?.[1];
    const text = plainText(page.body_html);
    const details = text.slice(text.indexOf('Event Details'));
    const schedule = (details.match(/(?:Event Dates & Times|Date\s*:)\s*(.+?)(?:Location\s*:|Time\s*:|Additional Info\s*:|$)/i)?.[1] || '').trim();
    // The year must occur in the official title, and a visible schedule must
    // precede any location/vendor text. Ambiguous pages await editorial review.
    if (!year || !schedule || !/holiday|market|fair|fest|village/i.test(title)) return [];
    const dates = officialDateWindowFromText(schedule, { referenceDateValue: '', maxSpanDays: 90 });
    // Ranges such as December 12–13 need their second day expanded explicitly.
    const range = schedule.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[–-]\s*(\d{1,2}),?\s*(20\d{2})/i);
    let start = dates.startDateValue;
    let end = dates.endDateValue;
    if (range) {
      const month = new Date(range[1] + ' 1, 2000').getMonth() + 1;
      start = `${range[4]}-${String(month).padStart(2,'0')}-${range[2].padStart(2,'0')}`;
      end = `${range[4]}-${String(month).padStart(2,'0')}-${range[3].padStart(2,'0')}`;
    }
    if (!start || !start.startsWith(year) || end < today || start > lastDay) return [];
    const location = details.match(/Location\s*:\s*(.+?)(?:\(\s*view|Event Details|Date\s*:|Additional Info|$)/i)?.[1]?.trim();
    if (!location) return [];
    const city = location.match(/,\s*([^,]+),\s*CA\b/i)?.[1] || '';
    const description = text.split('Event Details')[0].trim();
    return [{ title, dateValue: start, endDateValue: end, description,
      url: new URL('/pages/' + page.handle, source.feedUrl).href,
      place: location.split(',')[0], address: location, city,
      cost: /free admission|free to attend/i.test(details) ? 'Free' : '',
      format: 'festival' }];
  });
}

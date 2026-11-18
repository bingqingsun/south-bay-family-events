import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// These organizers are expected to have useful family listings throughout the
// season. Zero events is a review prompt, never evidence that an event exists.
export const PRIORITY_SOURCES = [
  'Santa Clara County Library District', 'San José Public Library', 'Palo Alto City Library',
  'City of Cupertino', 'City of Palo Alto', 'Palo Alto Children\'s Theatre',
  'The Tech Interactive', 'Happy Hollow Park & Zoo', 'Gilroy Gardens',
  'Filoli Historic House & Garden', 'Montalvo Arts Center', 'San José Made',
  'Hiller Aviation Museum', 'CuriOdyssey', 'San Jose Theaters',
  'Santa Clara County Parks', 'City of San José', 'City of Sunnyvale',
  'City of Mountain View', 'City of Santa Clara', 'Santa Clara Community Calendar'
];

export function buildDiscoveryAudit({ events, sources, health, translationManifest = null, today }) {
  const start = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(start.valueOf())) throw new Error('Invalid audit date');
  const horizon = days => new Date(start.valueOf() + days * 86400000).toISOString().slice(0, 10);
  const inRange = (event, days) => {
    const first = String(event.dateValue || '').slice(0, 10);
    const last = String(event.endDateValue || event.dateValue || '').slice(0, 10);
    return first <= horizon(days) && last >= today;
  };
  const configured = new Map(sources.map(s => [s.name, s]));
  const status = new Map((health.sources || []).map(s => [s.name, s]));
  const alerts = [];
  const coverage = PRIORITY_SOURCES.map(name => {
    const source = configured.get(name);
    const state = status.get(name);
    const records = events.filter(e => e.source === name);
    const window60 = records.filter(e => inRange(e, 60)).length;
    const window90 = records.filter(e => inRange(e, 90)).length;
    if (!source?.feedUrl || !source.method) {
      alerts.push({ kind: 'search-only', source: name, detail: 'No direct official feed; discovery depends on optional search or manual supplements.' });
    } else if (state?.status !== 'ok') {
      alerts.push({ kind: 'source-health', source: name, detail: state?.error || `Status: ${state?.status || 'not run'}` });
    }
    if (window60 === 0) alerts.push({ kind: 'coverage-review', source: name, detail: 'No published events in the next 60 days; check the official calendar.' });
    return { source: name, method: source?.method || 'search-only', feedUrl: source?.feedUrl || '', status: state?.status || 'not run', next60Days: window60, next90Days: window90 };
  });

  const onSale = events.flatMap(event => {
    const timestamp = Date.parse(event.ticketOnSaleAt || '');
    if (Number.isNaN(timestamp) || !inRange(event, 90)) return [];
    const daysUntil = Math.ceil((timestamp - start.valueOf()) / 86400000);
    if (daysUntil < -3 || daysUntil > 14) return [];
    return [{ id: event.id, title: event.title, dateValue: event.dateValue, ticketOnSaleAt: event.ticketOnSaleAt,
      registrationStatus: event.registrationStatus || 'unknown', url: event.url }];
  });
  for (const event of onSale) {
    alerts.push({ kind: 'ticket-review', source: event.title, detail: `Check current availability and registration on the official page: ${event.url}` });
  }
  const ticketed = events.filter(e => inRange(e, 90) && e.registrationStatus === 'required' && e.costStatus === 'paid');
  for (const event of ticketed) {
    const verified = Date.parse(event.lastVerifiedAt || event.summaryVerifiedAt || '');
    const ageDays = Number.isNaN(verified) ? Infinity : (start.valueOf() - verified) / 86400000;
    const startsSoon = String(event.dateValue || '').slice(0, 10) <= horizon(14);
    if (!onSale.some(e => e.id === event.id) && (ageDays >= 7 || startsSoon)) {
      alerts.push({ kind: 'ticket-review', source: event.title,
        detail: `Paid registration; confirm remaining tickets on the official page (${event.url || 'link missing'}). Last verified ${Number.isFinite(ageDays) ? Math.floor(ageDays) + ' days ago' : 'unknown'}.` });
    }
  }
  const translationGaps = translationManifest?.stats?.gaps ?? null;
  if (translationGaps > 0) alerts.push({ kind: 'translation-backlog', source: 'Chinese event copy', detail: `${translationGaps} current translations require review in data/translation-gaps/.` });
  return { version: 1, auditedForDate: today, horizonDays: 90, coverage, onSale,
    translationGaps, ticketed: ticketed.map(e => ({ title: e.title, dateValue: e.dateValue, registrationStatus: e.registrationStatus, url: e.url })), alerts };
}

export function discoveryAuditMarkdown(report) {
  const rows = report.coverage.map(c => `| ${c.source.replaceAll('|', '\\|')} | ${c.method} | ${c.status} | ${c.next60Days} | ${c.next90Days} |`).join('\n');
  const alerts = report.alerts.map(a => `- **${a.kind} · ${a.source}**: ${a.detail}`).join('\n') || '- No review alerts.';
  return `## Advance event discovery · ${report.auditedForDate}\n\nZero coverage is a prompt to inspect an official calendar, not proof of a missing event. Ticket availability must be verified on the organizer page.\n\n| Organizer | Discovery | Health | 60 days | 90 days |\n| --- | --- | --- | ---: | ---: |\n${rows}\n\n### Review queue\n\n${alerts}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = new URL('../data/', import.meta.url);
  const [events, sources, health, translationManifest] = await Promise.all(['events.json', 'sources.json', 'source-health.json', 'translation-gaps/manifest.json'].map(async file =>
    JSON.parse(await readFile(new URL(file, data), 'utf8'))
  ));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const report = buildDiscoveryAudit({ events, sources, health, translationManifest, today });
  if (process.argv.includes('--markdown')) process.stdout.write(discoveryAuditMarkdown(report));
  else {
    await writeFile(new URL('discovery-audit.json', data), JSON.stringify(report, null, 2) + '\n');
    console.log(`Advance discovery audit: ${report.coverage.length} priority sources, ${report.alerts.length} review alerts, ${report.onSale.length} upcoming ticket checks.`);
  }
}

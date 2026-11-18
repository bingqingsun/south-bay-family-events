import assert from 'node:assert/strict';
import { buildDiscoveryAudit, discoveryAuditMarkdown, PRIORITY_SOURCES } from './discovery-audit.mjs';

const sources = PRIORITY_SOURCES.filter(name => name !== 'Santa Clara County Parks').map(name => ({ name, method: 'rss', feedUrl: 'https://example.org/events' }));
const health = { sources: sources.map(s => ({ name: s.name, status: 'ok' })) };
const events = [{ id: 'e1', title: 'Holiday Fair', source: 'San José Made', dateValue: '2026-12-05',
  ticketOnSaleAt: '2026-11-20T08:00:00-08:00', registrationStatus: 'required', costStatus: 'paid', url: 'https://example.org/fair' }];
const report = buildDiscoveryAudit({ events, sources, health, today: '2026-11-17' });
assert.equal(report.coverage.find(s => s.source === 'San José Made').next60Days, 1);
assert.equal(report.onSale.length, 1);
assert.equal(report.ticketed.length, 1);
assert(report.alerts.some(a => a.kind === 'search-only' && a.source === 'Santa Clara County Parks'));
assert(report.alerts.some(a => a.kind === 'coverage-review' && a.source === 'The Tech Interactive'));
assert(discoveryAuditMarkdown(report).includes('Holiday Fair'));
assert.equal(buildDiscoveryAudit({ events, sources, health, today: '2026-12-01' }).onSale.length, 0);
assert(buildDiscoveryAudit({ events, sources, health, today: '2026-12-01' }).alerts.some(a => a.kind === 'ticket-review'));
assert(buildDiscoveryAudit({ events, sources, health, today: '2026-11-17', translationManifest: { stats: { gaps: 2 } } })
  .alerts.some(a => a.kind === 'translation-backlog'));
console.log('Advance discovery and ticket-review contract passed.');

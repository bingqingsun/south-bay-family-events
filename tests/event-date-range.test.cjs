'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'event-card.js'), 'utf8');
const sandbox = {
  window: {},
  document: { createElement: () => ({ innerHTML: '' }) }
};
vm.runInNewContext(source, sandbox, { filename: 'event-card.js' });
const format = sandbox.window.SBFFEventCard.formatMultiDayRange;
const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' }).format(new Date()));

test('Filoli autumn and Nightfall display their entire verified date window', () => {
  const event = { dateValue: `${year}-09-26`, endDateValue: `${year}-11-01T23:59:59`, sessions: [] };
  assert.equal(format(event, event, 'en'), 'Sep 26 – Nov 1');
  assert.equal(format(event, event, 'zh'), '9月26日 – 11月1日');
});

test('a one-day event preserves the existing date-and-time display', () => {
  const event = { dateValue: `${year}-10-28T13:00:00`, endDateValue: `${year}-10-28T17:00:00` };
  assert.equal(format(event, event, 'en'), '');
  assert.equal(format({ dateValue: `${year}-10-28` }, null, 'en'), '');
});

test('multi-day events in one month show a concise range', () => {
  const event = { dateValue: `${year}-10-30T16:00`, endDateValue: `${year}-10-31T22:00:00` };
  assert.equal(format(event, event, 'en'), 'Oct 30 – 31');
  assert.equal(format(event, event, 'zh'), '10月30日 – 10月31日');
});

test('a parent series end date never replaces an individual session date', () => {
  const session = { dateValue: `${year}-10-29T16:00` };
  const series = { dateValue: `${year}-09-01`, endDateValue: `${year}-11-01`, sessions: [session] };
  assert.equal(format(series, session, 'en'), '');
});

test('a multi-day individual session uses its own end date', () => {
  const session = { dateValue: `${year}-10-29`, endDateValue: `${year}-10-30` };
  const series = { dateValue: `${year}-09-01`, endDateValue: `${year}-11-01`, sessions: [session] };
  assert.equal(format(series, session, 'en'), 'Oct 29 – 30');
});

test('year-crossing ranges identify both years', () => {
  const event = { dateValue: '2026-12-31', endDateValue: '2027-01-02' };
  assert.equal(format(event, event, 'en'), 'Dec 31, 2026 – Jan 2, 2027');
  assert.equal(format(event, event, 'zh'), '2026年12月31日 – 2027年1月2日');
});

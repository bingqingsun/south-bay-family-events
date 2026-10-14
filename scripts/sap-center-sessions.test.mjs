import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./update-events.mjs', import.meta.url), 'utf8');
const isoStart = source.indexOf('function isoDateFromOfficialText');
const isoEnd = source.indexOf('function directEvent');
const sapStart = source.indexOf('function sapCenterDetailSessions');
const sapEnd = source.indexOf('async function readSapCenter');
assert.ok(isoStart >= 0 && isoEnd > isoStart && sapStart >= 0 && sapEnd > sapStart);

const context = {
  months: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 },
  plainText(value) {
    return String(value || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
};
vm.createContext(context);
vm.runInContext(source.slice(isoStart, isoEnd), context);
vm.runInContext(source.slice(sapStart, sapEnd), context);

const html = `
<div class="showings_date">
  <ul>
    <li>Thursday, <span class="m-date__month">October</span> <span class="m-date__day">22</span><span class="time cell">7:00 PM</span></li>
    <li>Friday, <span class="m-date__month">October</span> <span class="m-date__day">23</span><span class="time cell">7:00 PM</span></li>
    <li>Saturday, <span class="m-date__month">October</span> <span class="m-date__day">24</span><span class="time cell">11:00 AM</span></li>
    <li>Saturday, <span class="m-date__month">October</span> <span class="m-date__day">24</span><span class="time cell">3:00 PM</span></li>
    <li>Saturday, <span class="m-date__month">October</span> <span class="m-date__day">24</span><span class="time cell">7:00 PM</span></li>
    <li>Sunday, <span class="m-date__month">October</span> <span class="m-date__day">25</span><span class="time cell">1:00 PM</span></li>
    <li>Sunday, <span class="m-date__month">October</span> <span class="m-date__day">25</span><span class="time cell">5:00 PM</span></li>
  </ul>
</div>`;

const sessions = context.sapCenterDetailSessions(html, 2026);
assert.deepEqual(JSON.parse(JSON.stringify(sessions)), [
  '2026-10-22T19:00',
  '2026-10-23T19:00',
  '2026-10-24T11:00',
  '2026-10-24T15:00',
  '2026-10-24T19:00',
  '2026-10-25T13:00',
  '2026-10-25T17:00'
], 'SAP Center multi-show pages must preserve every published showing');

const textOnly = `
  Thursday, October 22 7:00 PM
  Friday, October 23 7:00 PM
  Saturday, October 24 11:00 AM
  Saturday, October 24 3:00 PM
`;
assert.deepEqual(JSON.parse(JSON.stringify(context.sapCenterDetailSessions(textOnly, 2026))), [
  '2026-10-22T19:00',
  '2026-10-23T19:00',
  '2026-10-24T11:00',
  '2026-10-24T15:00'
], 'rendered text fallback must also preserve all sessions');

assert.match(source, /dates\.filter\(dateValue => isUpcoming\(dateValue\)\)/,
  'SAP Center session filtering must not pass isUpcoming directly to Array.filter');
assert.doesNotMatch(source, /dates\.filter\(isUpcoming\)/,
  'Array.filter index must never be passed as an event end time');

console.log('SAP Center multi-session tests passed.');

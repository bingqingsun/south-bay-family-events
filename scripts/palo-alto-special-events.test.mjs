import assert from 'node:assert/strict';
import {
  paloAltoSpecialEventCalendarUrl,
  paloAltoSpecialEventDescription,
  paloAltoSpecialEventLinks,
  paloAltoSpecialEventOccurrences
} from './lib/palo-alto-special-events.mjs';

const landing = `
  <div class="list-item-container landing-3-col nav-item-seq-1"><a href="/special/Pumpkins"><h2>The Great Glass Pumpkin Patch</h2><p>A fall event for the entire family.</p></a></div></div>
  <nav><a href="/unrelated">Unrelated navigation</a></nav>`;
assert.deepEqual(paloAltoSpecialEventLinks(landing, 'https://www.paloalto.gov/special'), [{
  title: 'The Great Glass Pumpkin Patch',
  description: 'A fall event for the entire family.',
  url: 'https://www.paloalto.gov/special/Pumpkins'
}]);

const detail = `<h1>The Great Glass Pumpkin Patch</h1><img src="hero.jpg"><p>More than 10,000 glass pumpkins, demonstrations, food trucks, and family activities.</p>
  <p>View the <a href="/Events-Directory/Community-Services/Great-Glass-Pumpkin-Patch-2026">calendar listing</a>.</p>
  <p class="event-date">Saturday, September 26, 2026 | 10:00 AM - 05:00 PM</p>
  <p>Sunday, September 27, 2026 | 10:00 AM - 05:00 PM</p>`;
assert.equal(paloAltoSpecialEventDescription(detail), 'More than 10,000 glass pumpkins, demonstrations, food trucks, and family activities.');
assert.equal(paloAltoSpecialEventCalendarUrl(detail, 'https://www.paloalto.gov/special/Pumpkins'), 'https://www.paloalto.gov/Events-Directory/Community-Services/Great-Glass-Pumpkin-Patch-2026');
assert.deepEqual(paloAltoSpecialEventOccurrences(detail), [
  { dateText: 'September 26, 2026', startTime: '10:00 AM', endTime: '05:00 PM' },
  { dateText: 'September 27, 2026', startTime: '10:00 AM', endTime: '05:00 PM' }
]);

console.log('Palo Alto special event parsing tests passed.');

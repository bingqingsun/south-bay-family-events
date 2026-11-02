import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isRoutineSupportService } from './lib/routine-support-service.mjs';

for (const title of [
  '1 on 1 Tech Assistance',
  'One-On-One Tech Help',
  'One-On-One Tech Help (English or Tiếng Việt)',
  '1 on 1 Tech Assistance / Asistencia Tecnología',
  'OneinMath: Math Program for K-3rd at Edenvale Branch',
  'OneInMath: Math Program for K-3rd at Evergreen Library',
  'Homework Help for Grades K-6',
  'Homework Coaching with Delaney',
  'Math Buddies',
  'One-On-One Reading Coach for Kids',
  'Reading Partners One-on-One Reading Tutoring',
  'Reading Buddies',
  '3D Printing On Demand',
  '3D Printing One-on-One Appointment',
  'Virtual Library App Tour',
  '*Virtual* Resume Review',
  '*Virtual* Mock Interview',
  '*In Person* Interview & Networking Skills Workshop'
]) {
  assert.equal(isRoutineSupportService({ title }), true, `Routine service must not appear as an event: ${title}`);
}
assert.equal(isRoutineSupportService({
  title: 'Santa Teresa Junior Math Club', description: 'Students learn fractions and practice arithmetic skills with worksheets.'
}), true);
assert.equal(isRoutineSupportService({
  title: '(Virtual) Math Club', description: 'Tutoring for K-8 students.'
}), true);

for(const event of [
  {title:'Saturday STEM: Haunted House Engineering',description:'Kids design and build their own haunted house'},
  {title:'Math Games: A Family Festival', description:'Children play puzzles and math games together'},
  {title:'Everyone Can Code: Sphero Robot Maze'},
  {title:'Family Storytime & Stay and Play'},
  {title:'Reading to Children / 中文朗读故事時間',description:'A volunteer reads stories in Mandarin or English to families'},
  {title:'Reading Buddies at Cupertino Library', description:'Read aloud to a friendly therapy dog'},
  {title:'Reading Buddies for Grades K-6', description:'Practice reading aloud one on one with a friendly dog'},
  {title:'Furry Friends Reading Buddies', description:'Read to a dog or cat'},
  {title:'Maker Lab: 3D Printing & Cricut Workshop'},
  {title:'Computer History Museum: Robotics Workshop'},
  {title:'Coding Club for Kids'},
  {title:'Día de Muertos Community Celebration'},
  {title:'Green Halloween at Happy Hollow'}
]) {
  assert.equal(isRoutineSupportService(event), false, `Genuine family activity must be preserved: ${event.title}`);
}

// The smoke-refresh job regenerates this file before running policy tests.
// Prevent a future source import from silently bringing excluded cards back.
const events=JSON.parse(await readFile(new URL('../data/events.json',import.meta.url),'utf8'));
const leftovers=events.filter(isRoutineSupportService).map(e=>({id:e.id,title:e.title}));
assert.deepEqual(leftovers,[],`Routine services were published in the events feed: ${JSON.stringify(leftovers.slice(0,20))}`);
// The genuine-Halloween fixtures above already assert the classifier preserves
// these activities. The active feed intentionally prunes one-off October events
// after Halloween, so its contents cannot be used to assert historical presence.
const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
}).formatToParts(new Date());
const part = key => dateParts.find(item => item.type === key)?.value || '';
const today = [part('year'), part('month'), part('day')].join('-');
if (today <= '2026-11-01') {
  assert.ok(events.some(e => /Haunted House Engineering|Green Halloween/.test(e.title)),
    'Keep current Halloween STEM/family events while the season is active');
}
console.log('Routine support-service exclusion tests passed');

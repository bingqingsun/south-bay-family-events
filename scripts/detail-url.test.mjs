import assert from 'node:assert/strict';
import { eventDetailSlugCandidates } from './lib/detail-url.mjs';

const cases = [
  ['Nutcracker! Magical Christmas Ballet', 'nutcracker-magical-christmas-ballet'],
  ['The San Jose Nutcracker', 'san-jose-nutcracker'],
  ['The San Jose Nutcracker – New Ballet & Symphony San Jose', 'san-jose-nutcracker'],
  ['Family Magic Show | Hammer Theatre', 'family-magic-show'],
  ['The Original San Jose Nutcracker', 'original-san-jose-nutcracker'],
  ['A Magical Cirque Christmas', 'magical-cirque-christmas'],
  ['Derek Hough Dance For The Holidays', 'derek-hough-dance-holidays'],
  ['How to Train Your Dragon The Musical Jr.', 'how-train-your-dragon-musical-jr'],
  ['The Price Is Right Live!', 'price-right-live'],
  ['Matilda The Musical', 'matilda-musical']
];

for (const [title, expected] of cases) {
  assert.ok(
    eventDetailSlugCandidates(title).includes(expected),
    `Expected "${expected}" among candidates for "${title}"`
  );
}

console.log('detail URL tests passed');

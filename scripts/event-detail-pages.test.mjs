import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eventsRoot = path.join(ROOT, 'events');
assert.ok(fs.existsSync(eventsRoot), 'events/ must be generated');

const pages = fs.readdirSync(eventsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => path.join(eventsRoot, entry.name, 'index.html'))
  .filter(file => fs.existsSync(file));

assert.ok(pages.length >= 5, 'pilot should generate at least five event detail pages');

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const slug = path.basename(path.dirname(file));
  assert.match(html, new RegExp(`<link rel="canonical" href="https://southbayfamilyfinds\\\\.com/events/${slug}/" />`));
  assert.match(html, /<h1>[^<]+<\/h1>/, 'event page must have a static H1');
  assert.match(html, /application\/ld\+json/, 'event page must include Event JSON-LD');
  assert.match(html, /View official event source/, 'event page must preserve official source access');
  assert.doesNotMatch(html, /vercel\.app/i, 'production page must not reference preview domains');
}

console.log(`Event detail pilot checks passed (${pages.length} pages)`);

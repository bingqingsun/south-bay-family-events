import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://southbayfamilyfinds.com';
const OUTPUT = path.join(ROOT, 'sitemap.xml');
const CORE_PAGES = ['', 'about.html', 'privacy.html', 'terms.html'];
const CONTENT_ROOTS = ['collections', 'events', 'cities'];

function discoverIndexPages(rootName) {
  const root = path.join(ROOT, rootName);
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      if (entry.isFile() && entry.name === 'index.html') {
        const relativeDir = path.relative(ROOT, path.dirname(absolute)).split(path.sep).join('/');
        found.push(`${relativeDir}/`);
      }
    }
  };
  walk(root);
  return found;
}

function xmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const paths = [...new Set([
  ...CORE_PAGES,
  ...CONTENT_ROOTS.flatMap(discoverIndexPages)
])].sort((a, b) => {
  if (a === '') return -1;
  if (b === '') return 1;
  return a.localeCompare(b);
});

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map(relative => {
    const suffix = relative ? `/${relative}` : '/';
    return `  <url><loc>${xmlEscape(ORIGIN + suffix)}</loc></url>`;
  }),
  '</urlset>',
  ''
].join('\n');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== xml) {
    console.error('sitemap.xml is out of date. Run: node scripts/generate-sitemap.mjs');
    process.exit(1);
  }
  console.log(`sitemap.xml is current (${paths.length} URLs)`);
} else {
  fs.writeFileSync(OUTPUT, xml);
  console.log(`Wrote sitemap.xml with ${paths.length} URLs`);
}

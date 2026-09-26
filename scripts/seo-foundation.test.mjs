import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');
const about = fs.readFileSync(new URL('../about.html', import.meta.url), 'utf8');
const collection = fs.readFileSync(new URL('../collections/mid-autumn-festival/index.html', import.meta.url), 'utf8');
const zhHome = fs.readFileSync(new URL('../zh/index.html', import.meta.url), 'utf8');
const zhCollection = fs.readFileSync(new URL('../zh/collections/mid-autumn-festival/index.html', import.meta.url), 'utf8');
const vercel = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

assert.match(index, /"@id": "https:\/\/southbayfamilyfinds\.com\/#organization"/, 'Organization @id missing');
assert.match(index, /"@id": "https:\/\/southbayfamilyfinds\.com\/#website"/, 'WebSite @id missing');
assert.match(index, /"publisher": \{\s*"@id": "https:\/\/southbayfamilyfinds\.com\/#organization"/s, 'WebSite must reference Organization');
assert.match(sitemap, /https:\/\/southbayfamilyfinds\.com\/collections\/mid-autumn-festival\//, 'Published collection missing from sitemap');
assert.doesNotMatch(sitemap, /vercel\.app/i, 'Preview URL leaked into sitemap');
assert.match(about, /<link rel="canonical" href="https:\/\/southbayfamilyfinds\.com\/about\.html" \/>/, 'About canonical must use production domain');
assert.match(collection, /<link rel="canonical" href="https:\/\/southbayfamilyfinds\.com\/collections\/mid-autumn-festival\/" \/>/, 'Collection canonical must use production domain');
assert.match(vercel, /"X-Robots-Tag"/, 'Vercel preview noindex header missing');
assert.match(vercel, /"noindex, nofollow"/, 'Vercel preview must be excluded from search indexing');
assert.match(index, /hreflang="zh-Hans" href="https:\/\/southbayfamilyfinds\.com\/zh\//, 'English home missing Chinese hreflang');
assert.match(zhHome, /<html lang="zh-CN">/, 'Chinese home html lang missing');
assert.match(zhHome, /<link rel="canonical" href="https:\/\/southbayfamilyfinds\.com\/zh\/" \/>/, 'Chinese home canonical missing');
assert.match(zhHome, /hreflang="en" href="https:\/\/southbayfamilyfinds\.com\//, 'Chinese home missing English hreflang');
assert.match(zhCollection, /<link rel="canonical" href="https:\/\/southbayfamilyfinds\.com\/zh\/collections\/mid-autumn-festival\/" \/>/, 'Chinese collection canonical missing');
assert.match(sitemap, /https:\/\/southbayfamilyfinds\.com\/zh\//, 'Chinese home missing from sitemap');
assert.match(sitemap, /https:\/\/southbayfamilyfinds\.com\/zh\/collections\/mid-autumn-festival\//, 'Chinese collection missing from sitemap');

console.log('SEO foundation checks passed');

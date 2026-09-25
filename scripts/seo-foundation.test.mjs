import fs from 'node:fs';
import assert from 'node:assert/strict';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');

assert.match(index, /"@id": "https:\/\/southbayfamilyfinds\.com\/#organization"/, 'Organization @id missing');
assert.match(index, /"@id": "https:\/\/southbayfamilyfinds\.com\/#website"/, 'WebSite @id missing');
assert.match(index, /"publisher": \{\s*"@id": "https:\/\/southbayfamilyfinds\.com\/#organization"/s, 'WebSite must reference Organization');
assert.match(sitemap, /https:\/\/southbayfamilyfinds\.com\/collections\/mid-autumn-festival\//, 'Published collection missing from sitemap');
assert.doesNotMatch(sitemap, /vercel\.app/i, 'Preview URL leaked into sitemap');

console.log('SEO foundation checks passed');

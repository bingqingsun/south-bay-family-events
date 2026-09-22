const assert = require('node:assert/strict');
const fs = require('node:fs');

for (const file of ['app.js', 'collections.js']) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /function safeOutboundUrl\(value\)/, file + ' must guard outbound URLs');
  assert.doesNotMatch(source, /sessionLink\.href\s*=\s*item\.url\s*\|\|\s*event\.url/, file + ' must not create an empty session href');
  assert.match(source, /removeAttribute\(['"]href['"]\)/, file + ' must remove href when no safe official URL exists');
  assert.match(source, /url\.origin\s*===\s*window\.location\.origin/, file + ' must reject SBFF self-links for official CTA');
}
console.log('link UI safety tests passed');

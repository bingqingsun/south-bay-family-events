import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${path}: target snippet not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: target snippet is not unique`);
  fs.writeFileSync(path, source.replace(before, after));
}

const appSource = fs.readFileSync('app.js', 'utf8');
if (!appSource.includes("window.dispatchEvent(new CustomEvent('sbff:events-ready'")) {
  replaceOnce(
    'app.js',
    "  events = data;\n  window.SOUTH_BAY_EVENTS = events;\n}).catch(error => {",
    "  events = data;\n  window.SOUTH_BAY_EVENTS = events;\n  window.dispatchEvent(new CustomEvent('sbff:events-ready', { detail: { count: events.length } }));\n}).catch(error => {"
  );
}

const collectionsSource = fs.readFileSync('collections.js', 'utf8');
if (!collectionsSource.includes("window.addEventListener('sbff:events-ready'")) {
  replaceOnce(
    'collections.js',
    "  document.addEventListener('DOMContentLoaded', () => {\n    renderCollectionHome();\n    renderCollectionLanding();\n  });\n})();",
    "  document.addEventListener('DOMContentLoaded', () => {\n    renderCollectionHome();\n    renderCollectionLanding();\n  });\n  window.addEventListener('sbff:events-ready', () => {\n    renderCollectionHome();\n    renderCollectionLanding();\n  });\n})();"
  );
}

console.log('Applied mid-autumn entry async-render hotfix.');

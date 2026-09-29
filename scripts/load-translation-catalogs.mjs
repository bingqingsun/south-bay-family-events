import { readdir, readFile } from 'node:fs/promises';

export async function loadChineseTranslationCatalogs() {
  const dataDir = new URL('../data/', import.meta.url);
  const names = (await readdir(dataDir))
    .filter(name => /^translations\.zh(?:\.[^.]+(?:-[^.]+)*)?\.json$/i.test(name))
    .filter(name => name !== 'translations.zh.manifest.json')
    .sort((a, b) => a.localeCompare(b));

  const catalogs = await Promise.all(names.map(async name => ({
    name,
    data: JSON.parse(await readFile(new URL(name, dataDir), 'utf8'))
  })));

  const entries = [];
  const indexById = new Map();
  const conflicts = [];
  for (const catalog of catalogs) {
    for (const entry of Array.isArray(catalog.data?.entries) ? catalog.data.entries : []) {
      const id = entry?.id;
      if (!id || !indexById.has(id)) {
        if (id) indexById.set(id, entries.length);
        entries.push(entry);
        continue;
      }
      if (entry.override === true) {
        entries[indexById.get(id)] = entry;
        continue;
      }
      conflicts.push(`${id}@${catalog.name}`);
    }
  }

  if (conflicts.length) {
    throw new Error(`Duplicate translation catalog keys without override=true: ${conflicts.join(', ')}`);
  }

  return {
    version: 1,
    locale: 'zh-Hans',
    files: catalogs.map(item => item.name),
    entries
  };
}

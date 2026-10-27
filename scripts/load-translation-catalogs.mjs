import { readdir, readFile } from 'node:fs/promises';

// A later filename must not let a stale reviewed translation overwrite a
// newer explicit correction. If timestamps are absent, keep legacy ordering.
export function shouldAcceptCatalogOverride(existing, incoming) {
  if (incoming?.override !== true) return false;
  if (existing?.override !== true) return true;
  const existingAt = Date.parse(existing?.reviewedAt || existing?.generatedAt || '');
  const incomingAt = Date.parse(incoming?.reviewedAt || incoming?.generatedAt || '');
  if (Number.isFinite(existingAt) && Number.isFinite(incomingAt)) {
    return incomingAt >= existingAt;
  }
  return true;
}

export async function loadChineseTranslationCatalogs() {
  const dataDir = new URL('../data/', import.meta.url);
  const names = (await readdir(dataDir))
    .filter(name => /^translations\.zh(?:\.[^.]+(?:-[^.]+)*)?\.json$/i.test(name))
    .filter(name => name !== 'translations.zh.manifest.json')
    .sort((a, b) => {
      const automationCatalog = 'translations.zh.automation.json';
      if (a === automationCatalog) return b === automationCatalog ? 0 : 1;
      if (b === automationCatalog) return -1;
      return a.localeCompare(b);
    });

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

      const index = indexById.get(id);
      const existing = entries[index];
      if (entry.override === true) {
        if (shouldAcceptCatalogOverride(existing, entry)) entries[index] = entry;
        continue;
      }
      if (existing?.override === true) {
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

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

  return {
    version: 1,
    locale: 'zh-Hans',
    files: catalogs.map(item => item.name),
    entries: catalogs.flatMap(item => Array.isArray(item.data?.entries) ? item.data.entries : [])
  };
}

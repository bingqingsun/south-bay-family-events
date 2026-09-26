import { readFile, readdir, writeFile } from 'node:fs/promises';
import { translationFingerprint, auditChineseTranslation } from './event-translations.mjs';
import { translateTextSafely } from './translation-text.mjs';

const args = process.argv.slice(2);
const previousArg = args.indexOf('--previous');
const previousPath = previousArg >= 0 ? args[previousArg + 1] : '';
const dataDir = new URL('../data/', import.meta.url);
const eventsUrl = new URL('events.json', dataDir);
const autoCatalogUrl = new URL('translations.zh.auto.json', dataDir);
const model = process.env.SBFF_TRANSLATION_MODEL || 'Xenova/opus-mt-en-zh';
const maxDelta = Math.max(1, Number(process.env.SBFF_TRANSLATION_MAX_DELTA || 20));

function catalogNames(names) {
  return names
    .filter(name => /^translations\.zh(?:\.[^.]+(?:-[^.]+)*)?\.json$/i.test(name))
    .filter(name => name !== 'translations.zh.manifest.json')
    .sort((a, b) => a.localeCompare(b));
}

async function loadCatalogFiles() {
  const names = catalogNames(await readdir(dataDir));
  const files = [];
  for (const name of names) {
    files.push({
      name,
      url: new URL(name, dataDir),
      data: JSON.parse(await readFile(new URL(name, dataDir), 'utf8'))
    });
  }
  return files;
}

function eventChanged(current, previous) {
  if (!previous) return true;
  return translationFingerprint(current) !== translationFingerprint(previous);
}

async function createLocalTranslator() {
  // This model runs inside the GitHub Actions runner. It does not call a paid
  // translation or LLM API and requires no API key. The public SBFF repository
  // uses standard GitHub-hosted runners, so the translation path has no
  // incremental API cost. Hugging Face model files are cached by the workflow.
  const { pipeline, env } = await import('@huggingface/transformers');
  if (process.env.HF_HOME) env.cacheDir = process.env.HF_HOME;
  return pipeline('translation', model, { dtype: 'q8' });
}

const currentEvents = JSON.parse(await readFile(eventsUrl, 'utf8'));
if (!previousPath) {
  console.log('Translation refresh skipped: --previous snapshot is required so backlog is never translated accidentally.');
  process.exit(0);
}
const previousEvents = JSON.parse(await readFile(previousPath, 'utf8'));
const previousById = new Map(previousEvents.filter(event => event?.id).map(event => [event.id, event]));
const changedEvents = currentEvents.filter(event => event?.id && eventChanged(event, previousById.get(event.id)));

const files = await loadCatalogFiles();
const entryLocations = new Map();
for (const file of files) {
  for (const entry of file.data?.entries || []) {
    if (entry?.id) {
      if (entryLocations.has(entry.id)) throw new Error(`Duplicate translation id before generation: ${entry.id}`);
      entryLocations.set(entry.id, { file, entry });
    }
  }
}

const candidates = changedEvents.filter(event => {
  const existing = entryLocations.get(event.id)?.entry;
  return !existing || existing.status !== 'approved' || existing.sourceFingerprint !== translationFingerprint(event);
});

console.log(`Translation delta: changed=${changedEvents.length} candidates=${candidates.length}`);
if (!candidates.length) process.exit(0);
if (candidates.length > maxDelta) {
  console.log(`Translation generation skipped: candidates=${candidates.length} exceeds safety limit=${maxDelta}. English refresh remains publishable and Chinese falls back to English for delta items.`);
  process.exit(0);
}

let translator;
try {
  translator = await createLocalTranslator();
  console.log(`Local translation enabled: model=${model} candidates=${candidates.length}`);
} catch (error) {
  console.log(`Local translation unavailable: ${String(error?.message || error)}. English refresh remains publishable and Chinese falls back to English for delta items.`);
  process.exit(0);
}

let autoFile = files.find(file => file.name === 'translations.zh.auto.json');
if (!autoFile) {
  autoFile = {
    name: 'translations.zh.auto.json',
    url: autoCatalogUrl,
    data: { version: 1, locale: 'zh-Hans', entries: [] }
  };
  files.push(autoFile);
}
if (!Array.isArray(autoFile.data.entries)) autoFile.data.entries = [];

const approved = [];
const rejected = [];
for (const event of candidates) {
  try {
    const entry = {
      id: event.id,
      title: await translateTextSafely(translator, event.title || ''),
      description: await translateTextSafely(translator, event.description || ''),
      sourceFingerprint: translationFingerprint(event),
      status: 'approved',
      translationSource: 'auto-local-opus-mt-en-zh',
      qualityGate: 'automated-qa',
      generatedAt: new Date().toISOString()
    };
    const audit = auditChineseTranslation(event, entry);
    if (!audit.ok) {
      rejected.push({ id: event.id, issues: audit.issues });
      continue;
    }
    approved.push({ event, entry });
  } catch (error) {
    rejected.push({ id: event.id, issues: [`local-model-error:${String(error?.message || error)}`] });
  }
}

const touched = new Set();
for (const { event, entry } of approved) {
  const existing = entryLocations.get(event.id);
  if (existing) {
    const index = existing.file.data.entries.findIndex(item => item.id === event.id);
    existing.file.data.entries[index] = entry;
    touched.add(existing.file.name);
  } else {
    autoFile.data.entries.push(entry);
    entryLocations.set(event.id, { file: autoFile, entry });
    touched.add(autoFile.name);
  }
}

for (const file of files) {
  if (!touched.has(file.name)) continue;
  file.data.entries.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  await writeFile(file.url, `${JSON.stringify(file.data, null, 2)}\n`);
}

console.log(`Local translation result: approved=${approved.length} rejected=${rejected.length}`);
if (rejected.length) console.log(`TRANSLATION_REJECTED ${JSON.stringify(rejected.slice(0, 50))}`);

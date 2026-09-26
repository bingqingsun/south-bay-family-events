import { readFile, readdir, writeFile } from 'node:fs/promises';
import { translationFingerprint, auditChineseTranslation } from './event-translations.mjs';

const args = process.argv.slice(2);
const previousArg = args.indexOf('--previous');
const previousPath = previousArg >= 0 ? args[previousArg + 1] : '';
const dataDir = new URL('../data/', import.meta.url);
const eventsUrl = new URL('events.json', dataDir);
const autoCatalogUrl = new URL('translations.zh.auto.json', dataDir);
const apiKey = process.env.OPENAI_API_KEY || '';
const model = process.env.SBFF_TRANSLATION_MODEL || 'gpt-5-mini';
const batchSize = Math.max(1, Math.min(20, Number(process.env.SBFF_TRANSLATION_BATCH_SIZE || 8)));

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

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

async function translateBatch(events) {
  const schema = {
    type: 'object',
    properties: {
      translations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['id', 'title', 'description'],
          additionalProperties: false
        }
      }
    },
    required: ['translations'],
    additionalProperties: false
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: [
        'Translate South Bay family-event content from English to Simplified Chinese.',
        'The supplied English title and description are the only factual source.',
        'Do not add, infer, or improve facts. Never invent age suitability, price, parking, registration, free admission, all-ages claims, or no-registration claims.',
        'Keep organization, venue, brand, artist, official series, and other proper names in English unless a short Chinese explanation is clearly useful; never imply an unofficial translation is an official name.',
        'Translate title into a concise natural Chinese explanatory title; the product separately keeps the official English title visible.',
        'Preserve every Arabic numeral and numeric fact exactly. Do not add or remove numeric facts.',
        'If the English description is empty, return an empty Chinese description.',
        'Return exactly one translation for every supplied event id and no extra ids.'
      ].join('\n'),
      input: JSON.stringify(events.map(event => ({
        id: event.id,
        title: event.title || '',
        description: event.description || ''
      }))),
      text: {
        format: {
          type: 'json_schema',
          name: 'sbff_event_translations',
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const message = (await response.text()).slice(0, 800);
    throw new Error(`translation API ${response.status}: ${message}`);
  }
  const payload = await response.json();
  const text = extractOutputText(payload);
  if (!text) throw new Error('translation API returned no structured text');
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.translations) ? parsed.translations : [];
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
if (!apiKey) {
  console.log('Translation generation skipped: OPENAI_API_KEY is not configured. English refresh remains publishable; Chinese falls back to English for delta items.');
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
const failedBatches = [];
for (let offset = 0; offset < candidates.length; offset += batchSize) {
  const batch = candidates.slice(offset, offset + batchSize);
  try {
    const translations = await translateBatch(batch);
    const byId = new Map(translations.map(item => [item.id, item]));
    for (const event of batch) {
      const translated = byId.get(event.id);
      if (!translated) {
        rejected.push({ id: event.id, issues: ['missing-model-output'] });
        continue;
      }
      const entry = {
        id: event.id,
        title: String(translated.title || '').trim(),
        description: String(translated.description || '').trim(),
        sourceFingerprint: translationFingerprint(event),
        status: 'approved',
        translationSource: 'openai-auto',
        reviewedAt: new Date().toISOString()
      };
      const audit = auditChineseTranslation(event, entry);
      if (!audit.ok) {
        rejected.push({ id: event.id, issues: audit.issues });
        continue;
      }
      approved.push({ event, entry });
    }
  } catch (error) {
    failedBatches.push({ ids: batch.map(event => event.id), error: String(error?.message || error) });
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

console.log(`Translation generation result: approved=${approved.length} rejected=${rejected.length} failedBatches=${failedBatches.length}`);
if (rejected.length) console.log(`TRANSLATION_REJECTED ${JSON.stringify(rejected.slice(0, 50))}`);
if (failedBatches.length) console.log(`TRANSLATION_API_FAILURE ${JSON.stringify(failedBatches.slice(0, 10))}`);

import { readFile, writeFile } from 'node:fs/promises';
import { auditChineseTranslation, translationFingerprint } from './event-translations.mjs';
import { loadChineseTranslationCatalogs } from './load-translation-catalogs.mjs';

const eventsUrl = new URL('../data/events.json', import.meta.url);
const outputUrl = new URL('../data/translations.zh.autogen.json', import.meta.url);
const apiKey = process.env.OPENAI_API_KEY || '';
const model = process.env.TRANSLATION_MODEL || 'gpt-5.6-luna';
const batchSize = Math.max(1, Math.min(30, Number(process.env.TRANSLATION_BATCH_SIZE || 20)));

function currentTranslationGaps(events, catalog) {
  const byId = new Map((catalog.entries || []).filter(e => e?.id).map(e => [e.id, e]));
  return events.flatMap(event => {
    const entry = event?.id ? byId.get(event.id) : null;
    const fingerprint = translationFingerprint(event);
    if (!entry || entry.status !== 'approved') return [{ event, kind: 'missing', fingerprint }];
    if (entry.sourceFingerprint !== fingerprint) return [{ event, kind: 'stale', fingerprint }];
    return [];
  });
}

function responseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}

async function translateBatch(batch) {
  const source = batch.map(({ event }) => ({
    id: event.id,
    title: event.title || '',
    description: event.description || ''
  }));
  const body = {
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'Translate South Bay family-event titles and descriptions into concise Simplified Chinese for parents. Preserve all factual meaning, names, dates, ages, prices, grades, registration requirements, and quantities exactly. Do not add facts, recommendations, hype, or assumptions. Keep proper nouns recognizable. Return JSON only as {"translations":[{"id":"...","title":"...","description":"..."}]}.'
          }
        ]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify(source) }]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'event_translations',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['translations'],
          properties: {
            translations: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'title', 'description'],
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Translation API failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  const text = responseText(payload);
  if (!text) throw new Error('Translation API returned no text output.');
  return JSON.parse(text).translations || [];
}

async function readAutogen() {
  try {
    return JSON.parse(await readFile(outputUrl, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { version: 1, locale: 'zh-Hans', generatedBy: 'translation-autofill-v1', entries: [] };
  }
}

if (!apiKey) {
  console.log('OPENAI_API_KEY is not configured; translation generation skipped safely.');
  process.exit(0);
}

const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
const catalog = await loadChineseTranslationCatalogs();
const gaps = currentTranslationGaps(events, catalog);
if (!gaps.length) {
  console.log('Chinese translation coverage is already current.');
  process.exit(0);
}

const autogen = await readAutogen();
const autogenById = new Map((autogen.entries || []).filter(e => e?.id).map(e => [e.id, e]));
let approved = 0;
let rejected = 0;

for (let offset = 0; offset < gaps.length; offset += batchSize) {
  const batch = gaps.slice(offset, offset + batchSize);
  const translated = await translateBatch(batch);
  const translatedById = new Map(translated.map(item => [item.id, item]));

  for (const gap of batch) {
    const event = gap.event;
    const candidate = translatedById.get(event.id);
    if (!candidate) {
      console.warn(`::warning::No translation returned for ${event.id} ${event.title || ''}`);
      rejected += 1;
      continue;
    }
    const audit = auditChineseTranslation(event, candidate);
    if (!audit.ok) {
      console.warn(`::warning::Translation rejected for ${event.id}: ${audit.issues.join(', ')}`);
      rejected += 1;
      continue;
    }
    autogenById.set(event.id, {
      id: event.id,
      title: String(candidate.title || '').trim(),
      description: String(candidate.description || '').trim(),
      sourceFingerprint: gap.fingerprint,
      status: 'approved',
      override: gap.kind === 'stale',
      reviewedAt: new Date().toISOString(),
      translationSource: `openai:${model}:qa-gated`
    });
    approved += 1;
  }
}

autogen.entries = [...autogenById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
autogen.generatedAt = new Date().toISOString();
await writeFile(outputUrl, `${JSON.stringify(autogen, null, 2)}\n`);
console.log(`Chinese translation autofill: ${approved} approved, ${rejected} rejected, ${gaps.length} gap(s) inspected.`);

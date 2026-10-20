import { readFile, writeFile } from 'node:fs/promises';

const DEFAULT_INBOX = 'data/translation-inbox.json';
const DEFAULT_CATALOG = 'data/translations.zh.automation.json';
const FINGERPRINT_RE = /^[a-f0-9]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateInbox(payload) {
  assert(payload && typeof payload === 'object', 'Translation inbox must be a JSON object.');
  assert(payload.version === 1, 'Translation inbox version must be 1.');
  assert(payload.locale === 'zh-Hans', 'Translation inbox locale must be zh-Hans.');
  assert(Array.isArray(payload.entries), 'Translation inbox entries must be an array.');

  const seen = new Set();
  payload.entries.forEach((entry, index) => {
    const label = `entries[${index}]`;
    assert(entry && typeof entry === 'object', `${label} must be an object.`);
    assert(typeof entry.id === 'string' && entry.id.trim(), `${label}.id is required.`);
    assert(!seen.has(entry.id), `Duplicate translation inbox id: ${entry.id}`);
    seen.add(entry.id);
    assert(FINGERPRINT_RE.test(String(entry.sourceFingerprint || '')), `${label}.sourceFingerprint must be a 64-character lowercase SHA-256 hex string.`);
    assert(typeof entry.title === 'string' && entry.title.trim(), `${label}.title is required.`);
    assert(typeof entry.description === 'string', `${label}.description must be a string.`);
    assert(entry.status === 'approved', `${label}.status must be approved.`);
    assert(entry.translationSource === 'chatgpt-reviewed', `${label}.translationSource must be chatgpt-reviewed.`);
    assert(entry.override === true, `${label}.override must be true.`);
    assert(typeof entry.reviewedAt === 'string' && !Number.isNaN(Date.parse(entry.reviewedAt)), `${label}.reviewedAt must be an ISO timestamp.`);
  });

  return payload.entries;
}

export function mergeEntries(existingEntries, incomingEntries) {
  const merged = new Map();
  for (const entry of existingEntries || []) {
    if (entry?.id) merged.set(entry.id, entry);
  }
  for (const entry of incomingEntries || []) {
    merged.set(entry.id, { ...entry, override: true });
  }
  return [...merged.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export async function mergeTranslationInbox(inboxPath = DEFAULT_INBOX, catalogPath = DEFAULT_CATALOG) {
  const inbox = JSON.parse(await readFile(inboxPath, 'utf8'));
  const incoming = validateInbox(inbox);

  let catalog = { version: 1, locale: 'zh-Hans', entries: [] };
  try {
    catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  assert(catalog?.version === 1, 'Automation translation catalog version must be 1.');
  assert(catalog?.locale === 'zh-Hans', 'Automation translation catalog locale must be zh-Hans.');
  assert(Array.isArray(catalog?.entries), 'Automation translation catalog entries must be an array.');

  const mergedEntries = mergeEntries(catalog.entries, incoming);
  const output = {
    version: 1,
    locale: 'zh-Hans',
    entries: mergedEntries
  };
  await writeFile(catalogPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`translation inbox merged: ${JSON.stringify({ incoming: incoming.length, catalog: mergedEntries.length })}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await mergeTranslationInbox(process.argv[2] || DEFAULT_INBOX, process.argv[3] || DEFAULT_CATALOG);
}

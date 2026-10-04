import { readFile } from 'node:fs/promises';
import { buildImageUsage, editorialCoverReason, presetForEvent, visualTokensForEvent } from './editorial-cover.mjs';

const file = process.argv[2] || 'data/events.json';
const events = JSON.parse(await readFile(file, 'utf8'));
const usage = buildImageUsage(events);
const candidates = events.flatMap(event => {
  const reason = editorialCoverReason(event, usage);
  if (!reason) return [];
  const tokens = visualTokensForEvent(event);
  return [{ id:event.id, title:event.title, source:event.source || '', type:event.type || '', reason, preset:presetForEvent(event, tokens) }];
});
const countBy = key => Object.fromEntries(
  [...candidates.reduce((map, item) => map.set(item[key], (map.get(item[key]) || 0) + 1), new Map()).entries()]
    .sort((a,b) => b[1] - a[1])
);
process.stdout.write(JSON.stringify({
  checkedAt:new Date().toISOString(),
  totalEvents:events.length,
  editorialCoverCandidates:candidates.length,
  byReason:countBy('reason'),
  byPreset:countBy('preset'),
  bySource:countBy('source'),
  candidates
}, null, 2) + '\n');

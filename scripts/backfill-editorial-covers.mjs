import { readFile, writeFile } from 'node:fs/promises';
import { applyEditorialCovers } from './editorial-cover.mjs';

const eventJsonPath = 'data/events.json';
const eventJsPath = 'data/events.js';
const events = JSON.parse(await readFile(eventJsonPath, 'utf8'));
const generatedAt = new Date().toISOString();
const result = await applyEditorialCovers(events, {
  outputDir: new URL('../assets/generated/event-covers/', import.meta.url),
  publicBase: '/assets/generated/event-covers',
  generatedAt
});
await writeFile(eventJsonPath, JSON.stringify(result.events, null, 2) + '\n');
await writeFile(eventJsPath, 'window.SOUTH_BAY_EVENTS = ' + JSON.stringify(result.events) + ';\nwindow.SOUTH_BAY_EVENTS_META = ' + JSON.stringify({ generatedAt }) + ';\n');
console.log(JSON.stringify(result.stats, null, 2));

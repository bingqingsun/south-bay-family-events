import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { finalizeEventImages } from './finalize-event-images.mjs';

const directory = await mkdtemp(join(tmpdir(), 'sbff-image-test-'));
const imageUrl = 'https://organizer.example/event-photo.jpg';
const pages = new Map([
  ['https://organizer.example/event', `<script type="application/ld+json">{"@type":"Event","name":"Holiday Family Show","image":"${imageUrl}"}</script>`],
  ['https://organizer.example/blur', '<img alt="Holiday Crafts" src="https://organizer.example/w_49,h_25,blur_2.png">']
]);
const fetchImpl = async url => {
  if (pages.has(url)) return new Response(pages.get(url), { status: 200, headers: { 'content-type': 'text/html' } });
  if (url === imageUrl) return new Response(new Uint8Array(12000), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
};

try {
  const result = await finalizeEventImages([
    { id: 'official', title: 'Holiday Family Show', url: 'https://organizer.example/event', type: 'shows' },
    { id: 'blur', title: 'Holiday Crafts', url: 'https://organizer.example/blur', type: 'arts' },
    { id: 'blocked', title: 'Tree Lighting', url: 'https://organizer.example/blocked', type: 'community' },
    { id: 'pinned', title: 'Already Verified', url: 'https://organizer.example/blocked', image: 'https://organizer.example/pinned.jpg', imageStatus: 'official' }
  ], { fetchImpl, outputDir: pathToFileURL(directory + '/'), generatedAt: '2026-11-18T00:00:00Z' });
  assert.equal(result.events[0].image, imageUrl);
  assert.equal(result.events[0].imageProvenance.method, 'schema.org');
  assert.equal(result.events[1].imageStatus, 'generated-editorial');
  assert.equal(result.events[2].imageStatus, 'generated-editorial');
  assert.equal(result.events[3].image, 'https://organizer.example/pinned.jpg');
  assert.deepEqual([result.stats.officialOrSource, result.stats.illustration, result.stats.missing], [2, 2, 0]);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Final image coverage tests passed.');

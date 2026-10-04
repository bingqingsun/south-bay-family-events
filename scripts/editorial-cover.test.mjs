import assert from 'node:assert/strict';
import {
  EDITORIAL_COVER_VERSION,
  applyEditorialCovers,
  buildImageUsage,
  editorialCoverReason,
  renderEditorialCover,
  visualTokensForEvent
} from './editorial-cover.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const generic = 'https://sccl.bibliocommons.com/events/uploads/images/full/x/Early%20Learning%20&%20Storytime.jpg';
const events = [
  { id:'a', title:'Toddler Storytime', image:generic, type:'play' },
  { id:'b', title:'Baby Storytime', image:generic, type:'play' },
  { id:'c', title:'Bilingual Storytime', image:generic, type:'play' },
  { id:'d', title:'Official Art Event', image:'https://example.org/event.jpg', imageStatus:'official', imageProvenance:{method:'schema.org'}, type:'arts' }
];
const usage = buildImageUsage(events);
assert.equal(editorialCoverReason(events[0], usage), 'generic_source_placeholder');
assert.equal(editorialCoverReason(events[3], usage), '');
assert.equal(editorialCoverReason({ id:'x', title:'No image', image:'', imageStatus:'missing' }, usage), 'missing_image');
assert.equal(editorialCoverReason({
  id:'legacy', title:'Legacy', image:'https://example.org/hero.jpg', imageStatus:'official',
  imageProvenance:{source:'canonical-detail',method:'detail-main-hero'}
}, usage), 'weak_or_unverifiable_official_image');

const deer = {
  id:'deer', title:'Spooky Times at Deer Holloween Farm',
  description:'Family Halloween day with haunted barns, crafts, goats and chickens.',
  seasonalTheme:'halloween', type:'community', format:'festival'
};
assert.deepEqual(visualTokensForEvent(deer).slice(0,2), ['halloween','farm']);
const one = renderEditorialCover(deer);
const two = renderEditorialCover(deer);
assert.equal(one.svg, two.svg);
assert.equal(one.preset, 'farm-halloween');
assert.match(one.svg, /^<svg/);
assert.doesNotMatch(one.svg, /https?:\/\//);
assert.equal(EDITORIAL_COVER_VERSION, 'editorial-cover-v1');

const dir = await mkdtemp(join(tmpdir(), 'sbff-cover-'));
const result = await applyEditorialCovers([deer], {
  outputDir: pathToFileURL(dir + '/'),
  generatedAt:'2026-10-04T00:00:00Z'
});
assert.equal(result.stats.generated, 1);
assert.equal(result.events[0].imageStatus, 'generated-editorial');
assert.equal(result.events[0].imageProvenance.source, 'sbff-generated');
const svg = await readFile(join(dir, 'deer.svg'), 'utf8');
assert.match(svg, /farm/i);

console.log('Editorial cover tests passed');

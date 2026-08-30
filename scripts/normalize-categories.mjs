/*
 * Reapply the current public taxonomy to an already-published event list.
 * This is intentionally separate from the network refresh so a taxonomy fix
 * never depends on a third-party calendar being available.
 */
import { readFile, writeFile } from 'node:fs/promises';

const labels = { outdoor: '户外自然', arts: '艺术创作', learning: '学习与 STEM', play: '亲子玩乐', wellness: '运动与身心健康', community: '社区与支持' };
const icons = { outdoor: '🌿', arts: '🎨', learning: '🔭', play: '🎈', wellness: '☀️', community: '🤝' };
const colors = { outdoor: '#d8eee0', arts: '#ffd9bd', learning: '#dce7fa', play: '#ffe9a8', wellness: '#e7ddf6', community: '#dceeea' };

function typeFor(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(?:bike|bicycle)\b[^.!?]{0,48}\brepair\b|\b(?:community service|volunteer(?:ing)?|cleanup|donation|food drive|swap|mento(?:r|ring)|appointment|customer service|career help|tech help|free snacks)\b/.test(value)) return 'community';
  if (/\b(?:yoga|tai chi|meditation|mindfulness|wellness|breathwork|line dancing|movement class|fitness)\b/.test(value)) return 'wellness';
  if (/\b(?:hike|nature(?:\s+walk)?|trail|wildlife|marsh|forest|creek|pond|ranger|bird(?:s)?\b|habitat restoration|environmental education)\b/.test(value)) return 'outdoor';
  if (/\b(?:science|stem|robot(?:ics)?|technology|tech|learn(?:ing)?|engineering|coding|computer|3d print(?:ing)?|forensics|dna|astronomy|physics|math(?:ematics)?|tutor(?:ing)?|chess|planetarium|black holes?|solar|sun|moon|space|cosmic|earthquake|homeschool)\b/.test(value)) return 'learning';
  if (/\b(?:art(?:s)?|crafts?|paint(?:ing)?|music|theat(?:er|re)|museum|exhibit(?:ion)?|photography|knit(?:ting)?|crochet|tie-dye|dance|cooking|baking|design|laser)\b/.test(value)) return 'arts';
  if (/\b(?:story ?time|play(?:time)?|games?|lego|scavenger hunt|open mic|magic|festival|carnival|football|board games?|puzzle|party|celebration|show)\b/.test(value)) return 'play';
  return 'community';
}

function formatFor(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(?:vs\.?|versus|football|soccer|hockey|baseball|basketball|matchday|regular season|playoffs?)\b/.test(value)) return 'sports-game';
  if (/\b(?:museum|gallery|exhibit(?:ion)?|collection)\b/.test(value) && /\b(?:tour|family day|drawing|drop-in|workshop|program)\b/.test(value)) return 'museum-program';
  if (/\b(?:exhibit(?:ion)?|on view|gallery)\b/.test(value)) return 'museum-exhibition';
  if (/\b(?:show|theat(?:er|re)|concert|performance|musical|dance|magic|planetarium|laser|ice (?:show|skating))\b/.test(value)) return 'live-show';
  return 'program';
}

function isFamilyRelevant(event) {
  const value = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  return !/\b(?:primary care provider|healthcare professional|medical professional|continuing medical education|cme credits?|clinician training|physician training)\b/.test(value);
}

const dataUrl = new URL('../data/events.json', import.meta.url);
const browserUrl = new URL('../data/events.js', import.meta.url);
const events = JSON.parse(await readFile(dataUrl, 'utf8'))
  .filter(isFamilyRelevant)
  .map(event => {
    const type = typeFor(`${event.title || ''} ${event.description || ''}`);
    return { ...event, type, icon: icons[type], color: colors[type], tag: labels[type], format: formatFor(`${event.title || ''} ${event.description || ''}`), audienceStatus: event.ageSource ? 'organizer-confirmed' : 'not-confirmed' };
  });
const generatedAt = new Date().toISOString();

await writeFile(dataUrl, `${JSON.stringify(events, null, 2)}\n`);
await writeFile(browserUrl, `window.SOUTH_BAY_EVENTS = ${JSON.stringify(events)};\nwindow.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt })};\n`);
console.log(`Normalized ${events.length} family activities into the current taxonomy.`);

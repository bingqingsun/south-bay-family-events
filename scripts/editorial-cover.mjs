import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';

export const EDITORIAL_COVER_VERSION = 'editorial-cover-v1';

function plain(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value = '') {
  return plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function safeId(value = '') {
  return String(value || 'event').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function stableHash(value = '') {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildImageUsage(events = []) {
  const usage = new Map();
  for (const event of events) {
    const image = String(event?.image || '').trim();
    if (!image) continue;
    if (!usage.has(image)) usage.set(image, new Set());
    usage.get(image).add(normalizeTitle(event.title));
  }
  return usage;
}

function decodedUrl(value = '') {
  try { return decodeURIComponent(String(value)); } catch { return String(value); }
}

function isGenericBibliocommonsImage(event, imageUsage) {
  const image = String(event?.image || '');
  if (!/bibliocommons\.com\/events\/uploads\/images/i.test(image)) return false;
  const decoded = decodedUrl(image);
  const genericLabel = /(?:Early Learning\s*&\s*Storytime|Entertainment\s*&\s*Recreation|Crafts?,?\s*Maker,?\s*&\s*DIY|Arts?\s*(?:and|&)\s*Culture|Learn to Read|Homework Help|Health\s*(?:and|&)\s*Fitness|Author Visits?\s*(?:and|&)\s*Book Clubs?|Other Great Events|Used Book Sales|Event Types?\s*-\s*Arts?\s*&\s*Crafts)/i.test(decoded);
  const distinctTitles = imageUsage.get(image)?.size || 0;
  return genericLabel || distinctTitles >= 3;
}

function isLegacyWeakImage(event) {
  if (event?.imageProvenance?.method === 'detail-main-hero') return true;
  const image = String(event?.image || '');
  return event?.imageProvenance?.source === 'curated-manual'
    && event?.canonicalDetail?.status === 'fetch-blocked'
    && /\/home\/showpublishedimage\//i.test(image)
    && /\/Calendar\/Event\//i.test(String(event?.url || event?.canonicalUrl || ''));
}

export function editorialCoverReason(event, imageUsage = new Map()) {
  if (!event) return '';
  if (event.imageStatus === 'generated-editorial') return 'refresh-generated-editorial';
  if (!event.image) return event.imageFailureReason || 'missing_image';
  if (event.imageStatus === 'missing' || event.imageStatus === 'rejected') return event.imageFailureReason || event.imageStatus;
  if (isLegacyWeakImage(event)) return 'weak_or_unverifiable_official_image';
  const hasStrongProvenance = ['schema.org', 'event-image', 'card-dom-bound', 'manual_verified']
    .includes(event.imageProvenance?.method);
  if (!hasStrongProvenance && isGenericBibliocommonsImage(event, imageUsage)) return 'generic_source_placeholder';
  return '';
}

export function visualTokensForEvent(event = {}) {
  const text = plain([
    event.title, event.description, event.parentSummary, event.type, event.format,
    event.seasonalTheme, event.place
  ].filter(Boolean).join(' ')).toLowerCase();
  const tokens = [];
  const add = token => { if (!tokens.includes(token)) tokens.push(token); };
  if (/halloween|spooky|haunted|trick[- ]?or[- ]?treat|pumpkin/.test(text)) add('halloween');
  if (/farm|barn|goat|sheep|chicken|cow|pig|rabbit|hay/.test(text)) add('farm');
  if (/science|stem|space|planet|astronomy|laser|robot|coding|engineering|moon|solar/.test(text)) add('science');
  if (/art|craft|paint|draw|ceramic|maker|diy|sew|knit|crochet/.test(text)) add('arts');
  if (/show|performance|theat|concert|dance|music|marionette|puppet|planetarium/.test(text)) add('performance');
  if (/story|reading|book|baby|toddler|play|lego|movement/.test(text)) add('play');
  if (/hike|nature|trail|habitat|garden|outdoor|wildlife|forest|creek|park/.test(text)) add('outdoor');
  if (/festival|community|parade|celebration|fair|market/.test(text)) add('community');
  if (!tokens.length && event.type) add(event.type);
  if (!tokens.length) add('community');
  return tokens;
}

export function presetForEvent(event = {}, tokens = visualTokensForEvent(event)) {
  if (tokens.includes('halloween') && tokens.includes('farm')) return 'farm-halloween';
  if (tokens.includes('halloween')) return 'halloween';
  if (tokens.includes('science')) return 'science';
  if (tokens.includes('arts')) return 'arts';
  if (tokens.includes('performance')) return 'performance';
  if (tokens.includes('play')) return 'play';
  if (tokens.includes('outdoor')) return 'outdoor';
  return 'community';
}

function paletteFor(preset) {
  const palettes = {
    'farm-halloween': ['#2f2140','#7d4b72','#f49a45','#ffd58f','#d8e7c4'],
    halloween: ['#2f2140','#72436e','#f49a45','#ffd58f','#f4e5d6'],
    science: ['#17345f','#315f92','#81b8d9','#f4d76d','#f8fbff'],
    arts: ['#6a3b56','#c96f67','#f2b766','#f7dfb6','#f8f0e6'],
    performance: ['#392858','#76558a','#e59179','#f4c97b','#f9efe6'],
    play: ['#315a55','#76a88c','#f1c95d','#f4a487','#f8f1df'],
    outdoor: ['#315d4a','#6f9f70','#b8d79b','#f1d680','#eef2dc'],
    community: ['#315a55','#7aa99a','#f0c95d','#e8886b','#f7efe1']
  };
  return palettes[preset] || palettes.community;
}

function decor(seed, palette) {
  const circles = [];
  for (let i = 0; i < 7; i += 1) {
    const x = 80 + ((seed >>> (i % 16)) * (37 + i * 11)) % 1040;
    const y = 70 + ((seed >>> ((i + 5) % 16)) * (23 + i * 17)) % 520;
    const r = 10 + ((seed >>> ((i + 9) % 16)) % 24);
    circles.push('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + palette[(i + 2) % palette.length] + '" opacity=".22"/>');
  }
  return circles.join('');
}

function sceneSvg(preset, palette) {
  const [dark, mid, accent, light, pale] = palette;
  if (preset === 'farm-halloween') return `
    <circle cx="940" cy="130" r="76" fill="${light}" opacity=".9"/>
    <path d="M0 505 Q210 410 420 505 T840 505 T1200 505 V675 H0Z" fill="${mid}"/>
    <path d="M0 555 Q250 485 520 555 T1040 555 T1200 555 V675 H0Z" fill="${pale}"/>
    <rect x="470" y="286" width="260" height="220" rx="8" fill="${accent}"/>
    <path d="M430 310 L600 188 L770 310 Z" fill="${dark}"/>
    <rect x="565" y="382" width="74" height="124" fill="${light}" opacity=".9"/>
    <path d="M110 510 H390 M160 462 V555 M280 448 V555" stroke="${light}" stroke-width="18" stroke-linecap="round" opacity=".9"/>
    <g transform="translate(820 430)"><ellipse cx="0" cy="48" rx="62" ry="48" fill="${accent}"/><ellipse cx="-30" cy="48" rx="39" ry="50" fill="${accent}" opacity=".88"/><ellipse cx="30" cy="48" rx="39" ry="50" fill="${accent}" opacity=".88"/><path d="M0 0 C10-22 22-28 36-34" stroke="${mid}" stroke-width="12" fill="none" stroke-linecap="round"/></g>
    <g transform="translate(250 360)" stroke="${dark}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M0 36 C25 8 62 8 86 36 C62 26 54 28 43 48 C32 28 24 26 0 36Z"/><path d="M110 5 C132-17 160-15 180 8 C159 2 150 8 145 22 C136 9 128 4 110 5Z"/></g>
  `;
  if (preset === 'halloween') return `
    <circle cx="930" cy="132" r="82" fill="${light}"/>
    <path d="M0 520 Q250 420 500 520 T1000 520 T1200 520 V675 H0Z" fill="${mid}"/>
    <g transform="translate(510 405)"><ellipse cx="0" cy="50" rx="95" ry="72" fill="${accent}"/><ellipse cx="-48" cy="50" rx="60" ry="74" fill="${accent}" opacity=".9"/><ellipse cx="48" cy="50" rx="60" ry="74" fill="${accent}" opacity=".9"/><path d="M0-25 C10-50 25-62 42-70" stroke="${dark}" stroke-width="16" fill="none" stroke-linecap="round"/></g>
    <path d="M260 450 C220 390 235 300 310 280 C385 300 400 390 360 450 L335 420 L310 450 L285 420 Z" fill="${pale}"/>
    <circle cx="288" cy="350" r="9" fill="${dark}"/><circle cx="332" cy="350" r="9" fill="${dark}"/>
  `;
  if (preset === 'science') return `
    <circle cx="600" cy="335" r="118" fill="${accent}"/>
    <ellipse cx="600" cy="335" rx="250" ry="78" fill="none" stroke="${light}" stroke-width="18" transform="rotate(-12 600 335)"/>
    <circle cx="806" cy="278" r="30" fill="${pale}"/>
    <path d="M250 505 L365 280 L480 505 Z" fill="${mid}" opacity=".7"/>
    <circle cx="248" cy="160" r="10" fill="${light}"/><circle cx="940" cy="195" r="14" fill="${light}"/><circle cx="1000" cy="420" r="8" fill="${light}"/>
  `;
  if (preset === 'arts') return `
    <path d="M390 170 C250 230 235 440 385 505 C520 565 650 480 652 385 C655 305 595 275 625 218 C652 165 525 115 390 170Z" fill="${light}"/>
    <circle cx="392" cy="292" r="26" fill="${accent}"/><circle cx="460" cy="245" r="24" fill="${mid}"/><circle cx="522" cy="292" r="22" fill="${dark}"/><circle cx="435" cy="360" r="24" fill="${pale}"/>
    <g transform="translate(720 165) rotate(20)"><rect x="0" y="0" width="42" height="300" rx="20" fill="${accent}"/><path d="M0 0 L21-70 L42 0Z" fill="${light}"/></g>
    <rect x="760" y="430" width="220" height="38" rx="18" fill="${mid}" transform="rotate(-12 760 430)"/>
  `;
  if (preset === 'performance') return `
    <path d="M0 0 H330 C280 130 300 300 410 675 H0Z" fill="${mid}"/><path d="M1200 0 H870 C920 130 900 300 790 675 H1200Z" fill="${mid}"/>
    <path d="M520 80 L600 430 L680 80 Z" fill="${light}" opacity=".45"/>
    <ellipse cx="600" cy="530" rx="235" ry="48" fill="${accent}" opacity=".8"/>
    <path d="M602 280 V455 M602 280 C675 300 690 352 650 390" stroke="${pale}" stroke-width="24" fill="none" stroke-linecap="round"/>
    <circle cx="572" cy="470" r="34" fill="${pale}"/><circle cx="650" cy="400" r="30" fill="${pale}"/>
  `;
  if (preset === 'play') return `
    <path d="M250 240 Q430 190 585 265 V520 Q430 445 250 495Z" fill="${light}"/><path d="M950 240 Q770 190 615 265 V520 Q770 445 950 495Z" fill="${pale}"/>
    <path d="M600 270 V520" stroke="${dark}" stroke-width="14"/>
    <rect x="185" y="500" width="125" height="95" rx="16" fill="${accent}" transform="rotate(-8 185 500)"/>
    <rect x="915" y="485" width="98" height="110" rx="16" fill="${mid}" transform="rotate(8 915 485)"/>
    <circle cx="160" cy="160" r="30" fill="${accent}"/><circle cx="1010" cy="150" r="22" fill="${light}"/>
  `;
  if (preset === 'outdoor') return `
    <circle cx="930" cy="150" r="72" fill="${light}"/>
    <path d="M0 500 L260 260 L500 500 L705 315 L980 500 L1200 390 V675 H0Z" fill="${mid}"/>
    <path d="M0 565 Q250 490 500 565 T1000 565 T1200 565 V675 H0Z" fill="${pale}"/>
    <rect x="220" y="390" width="28" height="155" rx="14" fill="${dark}"/><circle cx="235" cy="350" r="74" fill="${accent}"/>
  `;
  return `
    <path d="M0 530 Q230 430 470 530 T930 530 T1200 530 V675 H0Z" fill="${pale}"/>
    <path d="M160 210 H1040" stroke="${light}" stroke-width="18" stroke-linecap="round"/>
    <path d="M220 210 L280 270 L340 210 L400 270 L460 210 L520 270 L580 210 L640 270 L700 210 L760 270 L820 210 L880 270 L940 210" fill="${accent}" opacity=".9"/>
    <g fill="${mid}"><circle cx="410" cy="420" r="48"/><circle cx="600" cy="385" r="55"/><circle cx="790" cy="425" r="46"/></g>
    <g fill="${dark}" opacity=".85"><rect x="370" y="468" width="80" height="115" rx="40"/><rect x="553" y="440" width="94" height="143" rx="47"/><rect x="752" y="470" width="76" height="113" rx="38"/></g>
  `;
}

export function renderEditorialCover(event = {}) {
  const tokens = visualTokensForEvent(event);
  const preset = presetForEvent(event, tokens);
  const palette = paletteFor(preset);
  const seed = stableHash([event.id, event.title, preset].join('|'));
  const [dark, mid] = palette;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-labelledby="title">
  <title id="title">SBFF editorial illustration for ${escapeXml(event.title || 'family activity')}</title>
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  ${decor(seed, palette)}
  ${sceneSvg(preset, palette)}
  <rect x="20" y="20" width="1160" height="635" rx="38" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="3"/>
</svg>`;
  const fileName = safeId(event.id) + '.svg';
  return { svg, fileName, preset, tokens };
}

export async function applyEditorialCovers(events = [], {
  outputDir,
  publicBase = '/assets/generated/event-covers',
  generatedAt = new Date().toISOString(),
  prune = true
} = {}) {
  if (!outputDir) throw new Error('outputDir is required');
  const imageUsage = buildImageUsage(events);
  await mkdir(outputDir, { recursive: true });
  const activeFiles = new Set();
  const byReason = {};
  const byPreset = {};
  let generated = 0;

  const nextEvents = [];
  for (const event of events) {
    const reason = editorialCoverReason(event, imageUsage);
    if (!reason) {
      nextEvents.push(event);
      continue;
    }
    const cover = renderEditorialCover(event);
    activeFiles.add(cover.fileName);
    await writeFile(new URL(cover.fileName, outputDir), cover.svg);
    generated += 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
    byPreset[cover.preset] = (byPreset[cover.preset] || 0) + 1;
    const publicPath = publicBase.replace(/\/$/, '') + '/' + cover.fileName;
    const patched = {
      ...event,
      image: publicPath + '?v=' + EDITORIAL_COVER_VERSION,
      imageStatus: 'generated-editorial',
      imageProvenance: {
        source: 'sbff-generated',
        method: 'generated-svg',
        sourceUrl: event.url || event.canonicalUrl || '',
        verifiedAt: generatedAt,
        score: 100,
        evidence: reason,
        generatorVersion: EDITORIAL_COVER_VERSION,
        visualTokens: cover.tokens
      },
      generatedImage: {
        preset: cover.preset,
        seed: safeId(event.id),
        assetPath: publicPath,
        generatorVersion: EDITORIAL_COVER_VERSION
      }
    };
    delete patched.imageFailureReason;
    nextEvents.push(patched);
  }

  if (prune) {
    const files = await readdir(outputDir).catch(() => []);
    await Promise.all(files
      .filter(name => name.endsWith('.svg') && !activeFiles.has(name))
      .map(name => unlink(new URL(name, outputDir)).catch(() => {})));
  }

  return {
    events: nextEvents,
    stats: {
      frameworkVersion: EDITORIAL_COVER_VERSION,
      checkedAt: generatedAt,
      generated,
      byReason,
      byPreset
    }
  };
}

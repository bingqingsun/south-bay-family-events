import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const eventsUrl = new URL('../data/events.json', import.meta.url);
const browserEventsUrl = new URL('../data/events.js', import.meta.url);
const sourcesUrl = new URL('../data/sources.json', import.meta.url);
const sourceHealthUrl = new URL('../data/source-health.json', import.meta.url);

const CONTENT_EXTENSIONS = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif']
]);

function isRemoteImage(value = '') {
  return /^https?:\/\//i.test(String(value || '')) && !/\/blank\.gif(?:$|\?)/i.test(String(value || ''));
}

function imageExtension(url, contentType = '') {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (CONTENT_EXTENSIONS.has(normalized)) return CONTENT_EXTENSIONS.get(normalized);
  try {
    const extension = extname(new URL(url).pathname).toLowerCase();
    if (/^\.(?:png|jpe?g|webp|gif|avif)$/.test(extension)) return extension === '.jpeg' ? '.jpg' : extension;
  } catch {}
  return '.img';
}

async function fetchImage(url, { timeoutMs = 20000, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'SouthBayFamilyFindsImageMirror/1.0',
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs)
  });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!contentType.startsWith('image/')) throw new Error(`unexpected content-type ${contentType || 'unknown'}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 128) throw new Error(`image response too small (${buffer.length} bytes)`);
  return { buffer, contentType, finalUrl: response.url || url };
}

export async function mirrorOfficialImages(events, sources, {
  mirroredAt = new Date().toISOString(),
  fetchImpl = fetch,
  timeoutMs = 20000
} = {}) {
  const output = Array.isArray(events) ? events.map(event => ({ ...event })) : [];
  const sourceByName = new Map((sources || []).filter(source => source.mirrorOfficialImages).map(source => [source.name, source]));
  const cache = new Map();
  const stats = { configuredSources: sourceByName.size, mirroredEvents: 0, mirroredAssets: 0, failures: [] };

  for (let index = 0; index < output.length; index += 1) {
    const event = output[index];
    const source = sourceByName.get(event.source);
    if (!source || !isRemoteImage(event.image)) continue;

    const remoteUrl = event.image;
    const mirrorDir = String(source.mirrorDir || `assets/official/${String(event.source || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`).replace(/^\/+|\/+$/g, '');
    let mirrored = cache.get(remoteUrl);

    if (!mirrored) {
      try {
        const fetched = await fetchImage(remoteUrl, { timeoutMs, fetchImpl });
        const extension = imageExtension(fetched.finalUrl || remoteUrl, fetched.contentType);
        const filename = createHash('sha256').update(remoteUrl).digest('hex').slice(0, 20) + extension;
        const directory = resolve(repoRoot, mirrorDir);
        await mkdir(directory, { recursive: true });
        const filesystemPath = resolve(directory, filename);
        await writeFile(filesystemPath, fetched.buffer);
        mirrored = {
          localPath: `/${mirrorDir}/${filename}`,
          originalUrl: remoteUrl,
          finalUrl: fetched.finalUrl || remoteUrl,
          bytes: fetched.buffer.length,
          contentType: fetched.contentType
        };
        cache.set(remoteUrl, mirrored);
        stats.mirroredAssets += 1;
      } catch (error) {
        const failure = { title: event.title, source: event.source, url: remoteUrl, error: String(error?.message || error) };
        stats.failures.push(failure);
        if (source.mirrorRequired) {
          throw new Error(`Required official image mirror failed for ${event.title}: ${failure.error}`);
        }
        continue;
      }
    }

    const imageProvenance = {
      ...(event.imageProvenance || {}),
      originalImageUrl: remoteUrl,
      mirroredImagePath: mirrored.localPath,
      mirroredAt
    };
    output[index] = {
      ...event,
      image: mirrored.localPath,
      imageOriginalUrl: remoteUrl,
      imageProvenance,
      imageMirror: {
        status: 'mirrored',
        originalUrl: remoteUrl,
        finalUrl: mirrored.finalUrl,
        localPath: mirrored.localPath,
        contentType: mirrored.contentType,
        bytes: mirrored.bytes,
        mirroredAt
      }
    };
    stats.mirroredEvents += 1;
  }

  return { events: output, stats };
}

async function run() {
  const events = JSON.parse(await readFile(eventsUrl, 'utf8'));
  const sources = JSON.parse(await readFile(sourcesUrl, 'utf8'));
  let sourceHealth = {};
  try { sourceHealth = JSON.parse(await readFile(sourceHealthUrl, 'utf8')); } catch {}

  const mirroredAt = new Date().toISOString();
  const result = await mirrorOfficialImages(events, sources, { mirroredAt });
  const generatedAt = sourceHealth.generatedAt || mirroredAt;

  await writeFile(eventsUrl, JSON.stringify(result.events, null, 2) + '\n');
  await writeFile(
    browserEventsUrl,
    `window.SOUTH_BAY_EVENTS = ${JSON.stringify(result.events)};\nwindow.SOUTH_BAY_EVENTS_META = ${JSON.stringify({ generatedAt })};\n`
  );

  sourceHealth.officialImageMirror = {
    frameworkVersion: 'official-image-mirror-v1',
    checkedAt: mirroredAt,
    ...result.stats
  };
  await writeFile(sourceHealthUrl, JSON.stringify(sourceHealth, null, 2) + '\n');

  console.log(`Official image mirror: ${result.stats.mirroredEvents} event(s), ${result.stats.mirroredAssets} asset(s), ${result.stats.failures.length} failure(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}

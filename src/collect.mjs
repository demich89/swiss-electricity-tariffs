import {mkdir, writeFile, rename} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {validateRegistry} from './providers/index.mjs';
import {createApiSnapshot} from './lib/api.mjs';
import {validateData} from '../public/tariffs.js';
import {validateSnapshotMetadata} from '../public/providers.js';
import {requestJson} from './lib/http.mjs';

// Collect every provider independently. A failed provider reuses its last deployed snapshot
// (unchanged, so its fetchedAt keeps it honestly stale) or is omitted when none exists.
// Registry errors, an unavailable default provider, or a run without any fresh collection still block publication.
export async function collectSnapshots(registry, defaultId, {
  now = Date.now(), request = requestJson, clock = () => Date.now(), previous = async () => null,
} = {}) {
  validateRegistry(registry, defaultId);
  const snapshots = new Map();
  const status = new Map();
  for (const provider of registry) {
    try {
      const intervals = await provider.collect({now, request});
      if (!intervals.length) throw Error(`${provider.id}: no intervals returned`);
      // One clock read per finished attempt keeps lastSuccessAt <= lastAttemptAt for fresh data.
      const fetchedAt = new Date(clock()).toISOString();
      snapshots.set(provider.id, createApiSnapshot({version: 1, fetchedAt, intervals}, provider));
      status.set(provider.id, {status: 'ok', lastAttemptAt: fetchedAt, lastSuccessAt: fetchedAt});
    } catch (error) {
      const reused = await previous(provider.id).catch(() => null);
      const lastAttemptAt = new Date(clock()).toISOString();
      if (reused) {
        snapshots.set(provider.id, reused);
        status.set(provider.id, {status: 'stale', lastAttemptAt, lastSuccessAt: reused.fetchedAt, error: error.message});
      } else {
        status.set(provider.id, {status: 'unavailable', lastAttemptAt, error: error.message});
      }
    }
  }
  if (!snapshots.has(defaultId)) {
    throw Error(`Default provider ${defaultId} unavailable: ${status.get(defaultId).error}`);
  }
  // Republishing only reused copies adds nothing; keep the current deployment instead.
  if (![...status.values()].some(entry => entry.status === 'ok')) {
    throw Error(`No provider refreshed: ${[...status.values()].map(entry => entry.error).join('; ')}`);
  }
  return {snapshots, status};
}

/** Load a provider's currently deployed snapshot; anything invalid or mismatched counts as absent. */
export async function loadPrevious(baseUrl, id, request = requestJson, now = Date.now()) {
  if (!baseUrl) return null;
  try {
    const snapshot = validateSnapshotMetadata(
      validateData(await request(new URL(`api/v1/providers/${id}/tariffs.json`, baseUrl).href)), id);
    return Date.parse(snapshot.fetchedAt) <= now + 300000 ? snapshot : null;
  } catch {
    return null;
  }
}

export async function writeSnapshots(root, registry, defaultId, {snapshots, status}) {
  validateRegistry(registry, defaultId);
  // Providers without fresh or reused data are left out of the catalog rather than faked.
  const available = registry.filter(provider => snapshots.has(provider.id));
  if (!available.some(provider => provider.id === defaultId)) throw Error(`Missing snapshot: ${defaultId}`);
  const catalog = {
    version: 1,
    defaultProviderId: defaultId,
    failedProviderIds: registry.map(({id}) => id).filter(id => status.get(id).status !== 'ok'),
    providers: available.map(({id, name, fullName, product, source, timezone, scheduleType, maxAgeSeconds}) => ({
      id, name, fullName, ...(product && {product}), source, timezone, scheduleType, maxAgeSeconds,
      tariffsUrl: `./providers/${id}/tariffs.json`,
      status: status.get(id).status,
      lastAttemptAt: status.get(id).lastAttemptAt,
      lastSuccessAt: status.get(id).lastSuccessAt,
    })),
  };
  const files = available.map(provider => [
    `api/v1/providers/${provider.id}/tariffs.json`, snapshots.get(provider.id),
  ]);
  files.push(['api/v1/providers.json', catalog]);
  // Preserve existing AMB endpoints for clients of the initial website.
  if (snapshots.has('amb')) {
    const amb = snapshots.get('amb');
    files.push(['api/v1/tariffs.json', amb]);
    files.push(['data/tariffs.json', {version: 1, fetchedAt: amb.fetchedAt, intervals: amb.intervals}]);
  }
  for (const [relativePath, data] of files) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
    await rename(`${path}.tmp`, path);
  }
}

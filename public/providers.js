import {isUtcTimestamp} from './tariffs.js';

/** Validate the public discovery catalog before building same-origin data URLs. */
export function validateCatalog(catalog) {
  if (catalog?.version !== 1 || !Array.isArray(catalog.providers) || !catalog.providers.length) {
    throw Error('Invalid provider catalog');
  }
  const ids = new Set();
  for (const provider of catalog.providers) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(provider.id) || ids.has(provider.id) ||
        typeof provider.name !== 'string' || !provider.name ||
        typeof provider.fullName !== 'string' || !provider.fullName ||
        (provider.product !== undefined && (typeof provider.product !== 'string' || !provider.product)) ||
        typeof provider.source !== 'string' || !provider.source.startsWith('https://') ||
        provider.timezone !== 'Europe/Zurich' || provider.scheduleType !== 'high-low' ||
        !Number.isFinite(provider.maxAgeSeconds) || provider.maxAgeSeconds <= 0 ||
        provider.tariffsUrl !== `./providers/${provider.id}/tariffs.json`) {
      throw Error('Invalid provider catalog entry');
    }
    const metadata = ['status', 'lastAttemptAt', 'lastSuccessAt'];
    if (metadata.some(key => provider[key] !== undefined)) {
      if (!['ok', 'stale'].includes(provider.status) ||
          !isUtcTimestamp(provider.lastAttemptAt) || !isUtcTimestamp(provider.lastSuccessAt) ||
          (provider.status === 'stale' && Date.parse(provider.lastSuccessAt) > Date.parse(provider.lastAttemptAt))) {
        throw Error('Invalid provider collection status');
      }
    }
    ids.add(provider.id);
  }
  if (!ids.has(catalog.defaultProviderId)) throw Error('Unknown default provider');
  return catalog;
}

/** Validate freshness metadata and identity in addition to the shared interval contract. */
export function validateSnapshotMetadata(snapshot, providerId) {
  if (snapshot.providerId !== providerId || !isUtcTimestamp(snapshot.staleAfter) ||
      Date.parse(snapshot.staleAfter) < Date.parse(snapshot.fetchedAt)) {
    throw Error('Invalid provider snapshot metadata');
  }
  return snapshot;
}

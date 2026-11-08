import {amb} from './amb.mjs';

// Add verified adapters here. Do not register placeholders or unsupported products.
export const providers = [amb];
export const defaultProviderId = 'amb';

export function validateRegistry(registry, defaultId) {
  const ids = new Set();
  for (const provider of registry) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(provider.id) || ids.has(provider.id)) {
      throw Error('Provider IDs must be unique URL-safe slugs');
    }
    if (!provider.name || !provider.fullName || !provider.source?.startsWith('https://') ||
        provider.scheduleType !== 'high-low' || typeof provider.collect !== 'function' ||
        !Number.isFinite(provider.maxAgeSeconds) || provider.maxAgeSeconds <= 0) {
      throw Error(`Invalid provider configuration: ${provider.id}`);
    }
    if (provider.product !== undefined && (typeof provider.product !== 'string' || !provider.product)) {
      throw Error(`Invalid product name: ${provider.id}`);
    }
    if (provider.timezone !== 'Europe/Zurich') throw Error('Only Swiss local schedules are supported');
    ids.add(provider.id);
  }
  if (!ids.has(defaultId)) throw Error('Default provider must be registered');
}

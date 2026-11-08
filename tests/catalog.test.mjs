import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSnapshotMetadata} from '../public/providers.js';

test('snapshot metadata requires matching identity and a valid expiry after collection', () => {
  const data = {providerId: 'amb', fetchedAt: '2026-11-08T00:00:00Z', staleAfter: '2026-11-08T06:00:00Z'};
  assert.equal(validateSnapshotMetadata(data, 'amb'), data);
  assert.throws(() => validateSnapshotMetadata(data, 'other'));
  for (const staleAfter of [undefined, null, 'bad', '2026-11-07T23:59:59Z']) {
    assert.throws(() => validateSnapshotMetadata({...data, staleAfter}, 'amb'));
  }
});

import {validateCatalog} from '../public/providers.js';
const provider = {
  id: 'amb', name: 'AMB', fullName: 'AMB full name', source: 'https://www.amb.ch/',
  timezone: 'Europe/Zurich', scheduleType: 'high-low', maxAgeSeconds: 21600,
  tariffsUrl: './providers/amb/tariffs.json',
};
const catalog = entry => ({version: 1, defaultProviderId: 'amb', providers: [entry]});

test('catalog accepts older entries and validates complete collection metadata', () => {
  assert.doesNotThrow(() => validateCatalog(catalog(provider)));
  const entry = {...provider, status: 'stale', lastAttemptAt: '2026-11-08T06:00:00Z', lastSuccessAt: '2026-11-08T00:00:00Z'};
  assert.doesNotThrow(() => validateCatalog(catalog(entry)));
  assert.doesNotThrow(() => validateCatalog(catalog({...entry, status: 'ok', lastSuccessAt: '2026-11-08T06:01:00Z'})));
  for (const mutation of [{status:'bad'}, {lastAttemptAt:'bad'}, {lastSuccessAt:undefined},
    {lastSuccessAt:'2026-11-08T07:00:00Z'}, {lastAttemptAt:123}]) {
    assert.throws(() => validateCatalog(catalog({...entry, ...mutation})));
  }
});

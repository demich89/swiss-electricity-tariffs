import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {amb} from '../src/providers/amb.mjs';
import {providers, defaultProviderId, validateRegistry} from '../src/providers/index.mjs';
import {pointsToIntervals} from '../src/lib/intervals.mjs';
import {collectSnapshots, loadPrevious, writeSnapshots} from '../src/collect.mjs';
import {validateCatalog} from '../public/providers.js';
import {requestJson} from '../src/lib/http.mjs';

const fixedNow = Date.parse('2026-11-07T12:00:00Z');
const provider = id => ({...amb, id, name: id.toUpperCase(), async collect() {
  return [{start: fixedNow, end: fixedNow + 900000, tariff: 'low'}];
}});

test('a second adapter produces discoverable separate snapshots without replacing AMB aliases', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tariff-test-'));
  const registry = [provider('amb'), provider('second')];
  try {
    const result = await collectSnapshots(registry, 'amb', {now: fixedNow, clock: () => fixedNow});
    await writeSnapshots(root, registry, 'amb', result);
    const load = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
    const catalog = validateCatalog(await load('api/v1/providers.json'));
    assert.equal(catalog.providers.length, 2);
    assert.equal(catalog.providers[1].tariffsUrl, './providers/second/tariffs.json');
    assert.equal((await load('api/v1/providers/second/tariffs.json')).providerId, 'second');
    assert.deepEqual(await load('api/v1/tariffs.json'), await load('api/v1/providers/amb/tariffs.json'));
    assert.equal((await load('data/tariffs.json')).fetchedAt, new Date(fixedNow).toISOString());
    assert.equal(result.snapshots.get('second').tariffs.low.label, 'Low tariff');
    assert.deepEqual(catalog.providers.map(({status}) => status), ['ok', 'ok']);
    assert.equal(catalog.providers[0].product, 'Tariffa dinamica');
    assert.equal(catalog.providers[0].lastSuccessAt, new Date(fixedNow).toISOString());
  } finally {await rm(root, {recursive: true, force: true});}
});

test('invalid registries block collection', () => {
  assert.throws(() => validateRegistry([provider('../escape')], '../escape'));
  assert.throws(() => validateRegistry([provider('amb'), provider('amb')], 'amb'));
  assert.throws(() => validateRegistry([provider('amb')], 'missing'));
  assert.throws(() => validateRegistry([{...provider('amb'), product: ''}], 'amb'));
});

test('a failed provider reuses its deployed snapshot or is omitted, without blocking others', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tariff-test-'));
  const failing = id => ({...provider(id), async collect() {throw Error('Unavailable');}});
  const invalid = {...provider('broken'), async collect() {return [{start: 0, end: 900001, tariff: 'low'}];}};
  const old = (await collectSnapshots([provider('second')], 'second', {now: fixedNow, clock: () => fixedNow - 7200000}))
    .snapshots.get('second');
  const registry = [provider('amb'), failing('second'), invalid, failing('new')];
  let tick = fixedNow;
  try {
    const result = await collectSnapshots(registry, 'amb', {
      now: fixedNow, clock: () => (tick += 1000), previous: async id => (id === 'second' ? old : null),
    });
    assert.equal(result.snapshots.get('second'), old);
    assert.deepEqual(result.status.get('second'), {
      status: 'stale', lastAttemptAt: new Date(fixedNow + 2000).toISOString(), lastSuccessAt: old.fetchedAt, error: 'Unavailable',
    });
    assert.equal(result.snapshots.has('broken'), false);
    assert.match(result.status.get('broken').error, /Invalid interval/);
    assert.equal(result.snapshots.has('new'), false);
    await writeSnapshots(root, registry, 'amb', result);
    const catalog = validateCatalog(JSON.parse(await readFile(join(root, 'api/v1/providers.json'), 'utf8')));
    assert.deepEqual(catalog.providers.map(({id, status}) => [id, status]), [['amb', 'ok'], ['second', 'stale']]);
    assert.deepEqual(catalog.failedProviderIds, ['second', 'broken', 'new']);
    // An advancing clock must still yield lastSuccessAt <= lastAttemptAt for fresh entries.
    assert.equal(catalog.providers[0].lastSuccessAt, catalog.providers[0].lastAttemptAt);
    assert.equal(JSON.parse(await readFile(join(root, 'api/v1/providers/second/tariffs.json'), 'utf8')).fetchedAt, old.fetchedAt);
    await assert.rejects(readFile(join(root, 'api/v1/providers/new/tariffs.json')));
  } finally {await rm(root, {recursive: true, force: true});}
});

test('an unavailable default provider blocks collection', async () => {
  const down = {...provider('amb'), async collect() {return [];}};
  await assert.rejects(collectSnapshots([down, provider('second')], 'amb'), /Default provider amb unavailable: amb: no intervals/);
  await assert.rejects(collectSnapshots([down], 'amb', {previous: async () => {throw Error('Offline');}}), /unavailable/);
});

test('a run without any fresh collection is not published, even with previous copies', async () => {
  const old = (await collectSnapshots([provider('amb')], 'amb', {now: fixedNow})).snapshots.get('amb');
  const down = id => ({...provider(id), async collect() {throw Error(`${id} down`);}});
  await assert.rejects(collectSnapshots([down('amb'), down('second')], 'amb', {previous: async () => old}),
    /No provider refreshed: amb down; second down/);
});

test('deployed snapshots are only reused when valid and matching', async () => {
  const good = (await collectSnapshots([provider('second')], 'second', {now: fixedNow, clock: () => fixedNow})).snapshots.get('second');
  const base = 'https://example.test/site/';
  const urls = [];
  const from = body => async url => {urls.push(url); return body;};
  assert.equal(await loadPrevious(base, 'second', from(good), fixedNow), good);
  assert.equal(urls[0], 'https://example.test/site/api/v1/providers/second/tariffs.json');
  assert.equal(await loadPrevious(base, 'amb', from(good)), null);
  assert.equal(await loadPrevious(base, 'second', from({...good, intervals: [{start: 0, end: 1, tariff: 'cheap'}]})), null);
  assert.equal(await loadPrevious(base, 'second', async () => {throw Error('404');}), null);
  assert.equal(await loadPrevious(base, 'second', from({...good, staleAfter: '2020-01-01T00:00:00Z'}), fixedNow), null);
  assert.equal(await loadPrevious(base, 'second', from({...good, staleAfter: undefined}), fixedNow), null);
  assert.equal(await loadPrevious(base, 'second', from(good), fixedNow - 600000), null);
  assert.equal(await loadPrevious(undefined, 'second', from(good)), null);
});

test('browser catalog rejects unsafe paths, duplicate IDs and unsupported schedule types', () => {
  const entry = {...provider('amb'), tariffsUrl: './providers/amb/tariffs.json'};
  const catalog = {version: 1, defaultProviderId: 'amb', providers: [entry]};
  assert.equal(validateCatalog(catalog), catalog);
  for (const mutation of [{tariffsUrl:'https://example.com/data.json'}, {id:'../escape'}, {scheduleType:'dynamic-price'}, {product: ''}, {product: 7}]) {
    assert.throws(() => validateCatalog({...catalog, providers:[{...entry, ...mutation}]}));
  }
  assert.throws(() => validateCatalog({...catalog, providers:[entry, entry]}));
});

test('AMB adapter requests four surrounding UTC days and validates empty responses', async () => {
  const calls = [];
  const intervals = await amb.collect({now: fixedNow, request: async (url, options) => {
    calls.push({url, options});
    return {labels:['2026-11-07T00:00:00Z'], bgColors:['#05DA3A']};
  }});
  assert.equal(calls.length, 4);
  assert.equal(intervals.length, 1);
  assert.deepEqual(calls.map(({options}) => JSON.parse(options.body).date), [
    '2026-11-06T12:00:00.000Z', '2026-11-07T12:00:00.000Z',
    '2026-11-08T12:00:00.000Z', '2026-11-09T12:00:00.000Z',
  ]);
  assert.ok(calls.every(({options}) => options.method === 'POST' && options.headers.Accept === 'application/json'));
  await assert.rejects(amb.collect({now: fixedNow, request: async () => ({labels:[], bgColors:[]})}), /no intervals/);
});

test('HTTP client retries network, HTTP and JSON failures and eventually rejects', async () => {
  let count = 0;
  const waits = [];
  const result = await requestJson('https://example.test', {}, {
    fetchImpl: async () => {
      count++;
      if (count === 1) throw Error('Network');
      if (count === 2) return {ok: false, status: 503};
      return {ok: true, json: async () => ({ok: true})};
    },
    sleep: async ms => waits.push(ms),
  });
  assert.deepEqual(result, {ok: true});
  assert.deepEqual(waits, [1000, 2000]);
  count = 0;
  await assert.rejects(requestJson('https://example.test', {}, {
    fetchImpl: async () => {count++; return {ok: true, json: async () => {throw Error('Invalid JSON');}};},
    sleep: async () => {},
  }), /Invalid JSON/);
  assert.equal(count, 3);
});

test('registered providers satisfy the contract', () => {
  validateRegistry(providers, defaultProviderId);
});

test('shared interval builder sorts, merges duplicates, rejects conflicts and caps at 15 minutes', () => {
  const t = Date.parse('2026-11-07T00:00:00Z');
  assert.deepEqual(pointsToIntervals([
    {time: t + 3600000, tariff: 'high'}, {time: t, tariff: 'low'}, {time: t, tariff: 'low'},
    {time: t + 300000, tariff: 'high'},
  ]), [
    {start: t, end: t + 300000, tariff: 'low'},
    {start: t + 300000, end: t + 1200000, tariff: 'high'},
    {start: t + 3600000, end: t + 4500000, tariff: 'high'},
  ]);
  assert.throws(() => pointsToIntervals([{time: t, tariff: 'low'}, {time: t, tariff: 'high'}]), /Conflicting/);
  assert.throws(() => pointsToIntervals([{time: t, tariff: 'cheap'}]));
  assert.throws(() => pointsToIntervals([{time: 1.5, tariff: 'low'}]));
});

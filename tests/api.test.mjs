import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiSnapshot} from '../src/lib/api.mjs';
import {amb} from '../src/providers/amb.mjs';
import {tariffAt} from '../public/tariffs.js';
const input=()=>({version:1,fetchedAt:'2026-11-07T12:00:00Z',intervals:[{start:1000,end:901000,tariff:'low'},{start:1801000,end:2701000,tariff:'high'}]});
test('API v1 exposes freshness, units and immutable interval copies',()=>{
 const data=input(), api=createApiSnapshot(data,amb);
 assert.equal(api.product,'Tariffa dinamica');
 assert.equal(api.version,1);assert.equal(api.timezone,'Europe/Zurich');
 assert.equal(api.staleAfter,'2026-11-07T18:00:00.000Z');
 assert.equal(api.timestampUnit,'milliseconds');assert.equal(api.maxIntervalSeconds,900);
 assert.equal(api.tariffs.low.color,'#05DA3A');assert.equal(api.tariffs.high.color,'#E3051B');
 assert.deepEqual(api.intervals,data.intervals);
 api.intervals[0].tariff='high';assert.equal(data.intervals[0].tariff,'low');
});
test('API refuses invalid source data and preserves gaps and end boundaries',()=>{
 const data=input();assert.equal(tariffAt(createApiSnapshot(data,amb).intervals,901000),'unknown');
 data.intervals[1].start=1000;assert.throws(()=>createApiSnapshot(data,amb));
 data.fetchedAt='bad';assert.throws(()=>createApiSnapshot(data,amb));
});

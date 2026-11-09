import test from 'node:test';
import assert from 'node:assert/strict';
import {tariffAt,nextSwitch,segments,dayBounds,utcDays,validateData} from '../public/tariffs.js';
import {normalize,zurichWallTime} from '../src/providers/amb.mjs';
const response=(labels,bgColors)=>({labels,bgColors});
const a='2026-11-07T00:00:00+00:00',b='2026-11-07T00:15:00Z',at=zurichWallTime;
test('validates arrays, dates, UTC timestamps and colors',()=>{
 for(const r of [response([a],[]),response(['bad'],['#05DA3A']),response(['2026-02-30T00:00:00Z'],['#05DA3A']),response(['2026-11-07T00:00:00+01:00'],['#05DA3A']),response([a],['red']),response([a],['toString'])]) assert.throws(()=>normalize([r]));
});
test('sorts and merges identical duplicates; rejects conflicts',()=>{
 const r=response([b,a,a],['#E3051B','#05DA3A','#05DA3A']);
 const xs=normalize([r,r]);assert.equal(xs.length,2);assert.equal(xs[0].tariff,'low');
 assert.throws(()=>normalize([r,response([a],['#E3051B'])]));
});
test('intervals expire after 15 minutes; gaps stay unknown; ends are exclusive',()=>{
 const xs=normalize([response([a,'2026-11-07T01:00:00Z'],['#05DA3A','#E3051B'])]);
 assert.equal(tariffAt(xs,at(a)),'low');
 assert.equal(tariffAt(xs,at(b)),'unknown');
 assert.equal(nextSwitch(xs,at(a)),null);
 assert.equal(segments(xs,'2026-11-07').filter(x=>x.tariff==='unknown').length,2);
});
test('predicts changes only within continuous coverage',()=>{
 const xs=normalize([response([a,b],['#05DA3A','#E3051B'])]);
 assert.equal(nextSwitch(xs,at(a)).start,at(b));
 assert.equal(nextSwitch(xs,at(b)),null);
});
test('reads labels as Zurich wall-clock time, as amb.ch displays them',()=>{
 const [winter]=normalize([response(['2026-11-09T06:45:00+00:00'],['#E3051B'])]);
 assert.equal(winter.start,Date.parse('2026-11-09T05:45:00Z'));
 const [summer]=normalize([response(['2026-07-01T06:45:00Z'],['#E3051B'])]);
 assert.equal(summer.start,Date.parse('2026-07-01T04:45:00Z'));
 assert.equal(segments([winter],'2026-11-09').find(x=>x.tariff==='high').start,Date.parse('2026-11-09T05:45:00Z'));
});
test('maps DST wall times: skipped spring times dropped, repeated autumn hour taken once',()=>{
 assert.equal(zurichWallTime('2026-03-29T02:30:00Z'),null);
 assert.equal(zurichWallTime('2026-03-29T03:00:00Z'),Date.parse('2026-03-29T01:00:00Z'));
 assert.equal(zurichWallTime('2026-10-25T02:30:00Z'),Date.parse('2026-10-25T00:30:00Z'));
 assert.equal(normalize([response(['2026-03-29T02:00:00Z','2026-03-29T03:00:00Z'],['#05DA3A','#E3051B'])]).length,1);
});
test('clips overlapping short intervals',()=>{
 const xs=normalize([response([a,'2026-11-07T00:05:00Z'],['#05DA3A','#E3051B'])]);
 assert.equal(xs[0].end-xs[0].start,300000);
});
test('Zurich DST days have 23 or 25 hours',()=>{
 for(const [key,hours] of [['2026-03-29',23],['2026-10-25',25],['2026-11-07',24]]){
  const [s,e]=dayBounds(key);assert.equal((e-s)/3600000,hours);
  assert.deepEqual(segments([],key),[{start:s,end:e,tariff:'unknown'}]);
 }
});
test('adjacent UTC dates cover today and tomorrow in Zurich',()=>{
 for(const now of ['2026-03-28T23:30:00Z','2026-10-25T23:30:00Z']) {
  const days=utcDays(Date.parse(now));assert.equal(days.length,4);
  assert.equal(Date.parse(days[3])-Date.parse(days[0]),3*86400000);
 }
});
test('browser rejects invalid intervals',()=>{
 const data={version:1,fetchedAt:a,intervals:[{start:0,end:900001,tariff:'low'}]};
 assert.throws(()=>validateData(data));data.intervals[0].end=900000;assert.equal(validateData(data),data);
});

test('invalid calendar keys fail instead of looping', () => {
  for (const key of ['bad', '2026-02-30', '2026-13-01']) assert.throws(() => dayBounds(key));
});

test('freshness timestamps must be real UTC ISO instants everywhere they are validated', async () => {
  const {isUtcTimestamp} = await import('../public/tariffs.js');
  const {validateCatalog, validateSnapshotMetadata} = await import('../public/providers.js');
  for (const value of ['2026-11-08T00:00:00Z', '2026-11-08T00:00:00.123Z', '2026-11-08T00:00:00+00:00', '2028-02-29T23:59:59Z']) {
    assert.ok(isUtcTimestamp(value), value);
  }
  const invalid = ['2026-02-30T00:00:00Z', '2026-02-29T00:00:00Z', '2026-11-08T24:00:00Z', '01/01/2099',
    '2026-11-08T00:00:00', '2026-11-08T01:00:00+01:00', '2026-11-08', 1794009600000, null];
  for (const value of invalid) assert.equal(isUtcTimestamp(value), false, String(value));
  const snapshot = {version: 1, providerId: 'amb', fetchedAt: '2026-02-01T00:00:00Z', staleAfter: '2026-02-01T06:00:00Z', intervals: []};
  assert.throws(() => validateData({...snapshot, fetchedAt: '2026-02-30T00:00:00Z'}));
  assert.throws(() => validateData({...snapshot, fetchedAt: '01/01/2026'}));
  assert.throws(() => validateSnapshotMetadata({...snapshot, staleAfter: '2026-02-30T00:00:00Z'}, 'amb'));
  assert.throws(() => validateSnapshotMetadata({...snapshot, staleAfter: '01/01/2099'}, 'amb'));
  const entry = {id: 'amb', name: 'A', fullName: 'A', source: 'https://a.example/', timezone: 'Europe/Zurich',
    scheduleType: 'high-low', maxAgeSeconds: 1, tariffsUrl: './providers/amb/tariffs.json', status: 'ok',
    lastAttemptAt: '2026-02-01T00:00:00Z', lastSuccessAt: '2026-02-01T00:00:00Z'};
  assert.doesNotThrow(() => validateCatalog({version: 1, defaultProviderId: 'amb', providers: [entry]}));
  assert.throws(() => validateCatalog({version: 1, defaultProviderId: 'amb',
    providers: [{...entry, lastAttemptAt: '2026-02-30T00:00:00Z', lastSuccessAt: '2026-02-30T00:00:00Z'}]}));
});

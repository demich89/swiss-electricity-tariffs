import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExamples} from '../public/api/examples.js';

const entry = id => ({id, name: id.toUpperCase(), fullName: `${id} utility`, source:'https://example.com/', timezone:'Europe/Zurich', scheduleType:'high-low', maxAgeSeconds:21600, tariffsUrl:`./providers/${id}/tariffs.json`});

test('API documentation handles one or multiple providers, copying, languages and fetch failures', async () => {
  const keys = ['document','localStorage','navigator','fetch'];
  const previous = Object.fromEntries(keys.map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const node = () => ({children:[], textContent:'', disabled:false,
    append(...items){this.children.push(...items);}, replaceChildren(...items){this.children=items;},
    addEventListener(event,callback){this[event]=callback;},setAttribute(key,value){this[key]=value;},
  });
  try {
    for (const count of [1,2,0]) {
      const ids = new Map(['copied','catalog-status','catalog-url','docs-provider','copy','provider-list','endpoint','curl','example','catalog-example','language-switch'].map(id=>[id,node()]));
      const providers = Array.from({length:count},(_,i)=>entry(i?'second':'amb'));
      if(count===2)Object.assign(providers[1],{status:'stale',lastAttemptAt:'2026-11-08T06:00:00Z',lastSuccessAt:'2026-11-08T00:00:00Z'});
      const copied = [];
      globalThis.document={documentElement:{lang:'en'},getElementById:id=>ids.get(id),createElement:node,querySelectorAll:()=>[]};
      globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
      Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copied.push(text)}}});
      globalThis.fetch=async()=>{if(!count)throw Error('Offline');return {ok:true,json:async()=>({version:1,defaultProviderId:'amb',providers})};};
      await import(`../public/api/docs.js?case=${count}`);
      if(!count){
        assert.equal(ids.get('docs-provider').disabled,true);
        assert.equal(ids.get('copy').disabled,true);
        assert.match(ids.get('catalog-status').textContent,/Could not load/);
        assert.equal(ids.get('provider-list').children.length,0);
        continue;
      }
      assert.equal(ids.get('provider-list').children.length,count);
      assert.match(ids.get('endpoint').href,/providers\/amb\/tariffs.json$/);
      assert.match(ids.get('example').textContent,/const catalogUrl/);
      if(count===2){
        const select=ids.get('docs-provider');select.value='second';select.change();
        assert.match(ids.get('endpoint').href,/providers\/second\/tariffs.json$/);
        assert.match(ids.get('curl').textContent,/providers\/second\/tariffs.json/);
        assert.match(ids.get('example').textContent,/providerId = "second"/);
        assert.match(ids.get('provider-list').children[1].children[2].textContent,/failed/);
        await ids.get('provider-list').children[1].children[4].click();
        assert.match(copied[0],/providers\/second\/tariffs.json$/);
        const language=ids.get('language-switch').children[1];language.value='it';language.change();
        assert.match(ids.get('provider-list').children[1].children[2].textContent,/fallito/);
        assert.match(ids.get('endpoint').href,/providers\/second\/tariffs.json$/);
      }
    }
  } finally {
    for(const [key,descriptor] of Object.entries(previous)){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  }
});

test('copied API example resolves project paths and accounts for collection failure and gaps', async () => {
  const url='https://example.com/repository/api/v1/providers.json';
  const example=buildExamples(url,'second').javascript;
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const execute=new AsyncFunction('fetch','console',example);
  const now=Date.now();
  const data={version:1,providerId:'second',fetchedAt:new Date(now-1000).toISOString(),staleAfter:new Date(now+3600000).toISOString(),intervals:[{start:now-1000,end:now+600000,tariff:'low'}]};
  for(const [intervals,tariff] of [[data.intervals,'low'],[[],'unknown']]){
    const calls=[],output=[];
    await execute(async path=>{
      calls.push(String(path));return {ok:true,json:async()=>calls.length===1?{version:1,providers:[{...entry('second'),status:'stale'}]}:{...data,intervals}};
    },{log:value=>output.push(value)});
    assert.deepEqual(calls,[url,'https://example.com/repository/api/v1/providers/second/tariffs.json']);
    assert.deepEqual(output,[{tariff,stale:true}]);
  }
  let calls=0;
  await assert.rejects(execute(async()=>({ok:true,json:async()=>++calls===1?{version:1,providers:[entry('second')]}:{...data,intervals:[null]}}),{log(){}}),/Invalid tariff interval/);
});


test('copied API example rejects impossible or non-ISO snapshot expiry', async () => {
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const execute=new AsyncFunction('fetch','console',buildExamples('https://example.com/api/v1/providers.json','amb').javascript);
  for(const staleAfter of ['2026-02-30T00:00:00Z','01/01/2099']) {
    let count=0;
    await assert.rejects(execute(async()=>({ok:true,json:async()=>++count===1
      ? {version:1,providers:[entry('amb')]}
      : {version:1,providerId:'amb',fetchedAt:'2026-01-01T00:00:00Z',staleAfter,intervals:[]}}),{log(){}}),/Invalid provider snapshot/);
  }
});

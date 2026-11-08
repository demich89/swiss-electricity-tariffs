import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {translations} from '../public/translations.js';
import {docsTranslations} from '../public/api/translations.js';
import {initLanguage,languages,resolveLanguage,t,locale} from '../public/i18n.js';

test('all four languages cover every static and dynamic translation',async()=>{
 assert.deepEqual(Object.keys(languages),['en','de','fr','it']);
 for(const dictionary of [translations,docsTranslations]) {
  const keys=Object.keys(dictionary.en).sort();
  for(const language of Object.keys(languages)) {
   assert.deepEqual(Object.keys(dictionary[language]).sort(),keys);
   for(const text of Object.values(dictionary[language]))assert.ok(typeof text==='string'&&text.trim());
  }
 }
 for(const [path,extra] of [['public/index.html',{}],['public/api/index.html',docsTranslations.en]]) {
  const html=await readFile(path,'utf8');
  for(const [,key] of html.matchAll(/data-i18n="([^"]+)"/g))assert.ok(key in translations.en||key in extra,`${path}: ${key}`);
 }
 assert.equal(resolveLanguage('unsupported'),'en');
 assert.equal(resolveLanguage('__proto__'),'en');
});

test('switch updates page, locale and stored choice; blocked storage is harmless',()=>{
 const previousDocument=globalThis.document, previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const makeNode=()=>({children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(event,callback){this[event]=callback;}});
 const host=makeNode(),text={dataset:{i18n:'low'}};
 const storage=new Map([['electricity-language','it']]);
 globalThis.document={documentElement:{lang:'en'},title:'',getElementById:()=>host,createElement:makeNode,querySelectorAll:()=>[text]};
 globalThis.localStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
 try {
  let changes=0;initLanguage(()=>changes++);
  assert.equal(document.documentElement.lang,'it');assert.equal(text.textContent,'Bassa tariffa');
  assert.equal(locale(),'it-CH');
  const select=host.children[1];select.value='fr';select.change();
  assert.equal(document.documentElement.lang,'fr');assert.equal(text.textContent,'Tarif bas');
  assert.equal(storage.get('electricity-language'),'fr');assert.equal(changes,2);
  assert.match(new Intl.DateTimeFormat(locale(),{timeZone:'Europe/Zurich',month:'long'}).format(new Date('2026-11-07T12:00:00Z')),/novembre/);
  globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  initLanguage();const second=host.children[1];second.value='en';assert.doesNotThrow(()=>second.change());
  assert.equal(t('unknown'),'Tariff unknown');assert.equal(locale(),'en-GB');
 } finally {globalThis.document=previousDocument;if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;}
});

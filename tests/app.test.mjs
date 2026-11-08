import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the real browser entry point with a minimal DOM and controlled fetches.
// Visual layout and browser-specific behavior still require a manual browser check.
test('website discovers providers, changes language, and discards late provider responses', async () => {
  const previous = Object.fromEntries(['document', 'fetch', 'setInterval', 'localStorage', 'location', 'history'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const node = () => ({children: [], textContent: '', value: '', dataset: {}, style: {}, setAttribute(name, value) {this[name] = value;},
    append(...items) {this.children.push(...items);},
    replaceChildren(...items) {this.children = items;},
    addEventListener(event, callback) {this[event] = callback;},
  });
  const ids = new Map(['provider', 'provider-name', 'source', 'current', 'tariff', 'clock', 'next', 'next-detail', 'warning', 'fetched', 'days', 'language-switch', 'until', 'product-note'].map(id => [id, node()]));
  const providers = ['amb', 'second'].map(id => ({id, name: id.toUpperCase(), fullName: `${id} full name`, source: `https://${id}.example/`, timezone: 'Europe/Zurich', scheduleType: 'high-low', maxAgeSeconds: 21600, tariffsUrl: `./providers/${id}/tariffs.json`}));
  const catalog = {version: 1, defaultProviderId: 'amb', providers};
  let staleSnapshot = false;
  const snapshot = (id, tariff) => ({version: 1, providerId: id, fetchedAt: new Date(Date.now() - 3600000).toISOString(), staleAfter: new Date(Date.now() + (staleSnapshot ? -1 : 21600000)).toISOString(), intervals:[{start: Date.now() - 1000, end: Date.now() + 600000, tariff}]});
  let resolveSecond;
  const timers = new Map();
  const events = new Map();
  const originalNow = Date.now;
  let fetchCount = 0;
  globalThis.document = {documentElement:{lang:'en'}, getElementById: id => ids.get(id), createElement: node, querySelectorAll: () => [], visibilityState: 'visible', addEventListener(event, callback) {events.set(event, callback);}};
  globalThis.localStorage = {getItem: () => null, setItem: () => {}};
  // An unknown provider in a shared link falls back to the default and is removed from the address.
  globalThis.location = {href: 'https://site.test/?provider=gone&lang=x', search: '?provider=gone&lang=x'};
  const addresses = [];
  globalThis.history = {replaceState(state, title, url) {
    addresses.push(String(url));
    location.href = String(url);
    location.search = new URL(url).search;
  }};
  globalThis.setInterval = (callback, delay) => {timers.set(delay, callback); return delay;};
  globalThis.fetch = async path => {
    fetchCount++;
    if (path.endsWith('providers.json')) return {ok: true, json: async () => catalog};
    if (path.includes('/second/')) return new Promise(resolve => {resolveSecond = () => resolve({ok: true, json: async () => snapshot('second', 'high')});});
    return {ok: true, json: async () => snapshot('amb', 'low')};
  };
  const settle = async () => {for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));};
  try {
    await import('../public/app.js');
    await settle();
    assert.equal(ids.get('provider').children.length, 2);
    assert.equal(ids.get('tariff').textContent, 'Low tariff');
    assert.equal(ids.get('product-note').hidden, true);
    // A product-specific schedule names its product in the selector, the provider line and a note.
    providers[0].product = 'Tariffa dinamica';
    timers.get(300000)();
    await settle();
    assert.equal(ids.get('provider-name').textContent, 'amb full name · Tariffa dinamica');
    assert.equal(ids.get('provider').children[0].textContent, 'AMB · Tariffa dinamica');
    assert.equal(ids.get('product-note').hidden, false);
    assert.match(ids.get('product-note').textContent, /only to customers on the “Tariffa dinamica” product/);
    delete providers[0].product;
    timers.get(300000)();
    await settle();
    assert.equal(ids.get('product-note').hidden, true);
    assert.deepEqual(addresses, ['https://site.test/?lang=x']);
    // The current low interval ends within ten minutes and nothing follows, so no change is known.
    assert.equal(ids.get('until').textContent, '');
    const day = ids.get('days').children[0];
    assert.equal(day.children[1].className, 'timeline');
    assert.match(day.children[0].textContent, /^Today · .* · GMT\+\d/);
    const language = ids.get('language-switch').children[1];
    language.value = 'it'; language.change();
    assert.equal(ids.get('tariff').textContent, 'Bassa tariffa');
    assert.equal(document.documentElement.lang, 'it');
    const select = ids.get('provider');
    select.value = 'second'; select.change();
    assert.equal(location.search, '?lang=x&provider=second');
    assert.equal(ids.get('tariff').textContent, 'Tariffa sconosciuta');
    await settle();
    select.value = 'amb'; select.change();
    await settle();
    resolveSecond();
    await settle();
    assert.equal(location.search, '?lang=x');
    assert.equal(ids.get('tariff').textContent, 'Bassa tariffa');
    assert.equal(ids.get('provider-name').textContent, 'amb full name');
    // Snapshot expiry takes precedence over the catalog's longer age allowance.
    staleSnapshot = true;
    timers.get(300000)();
    await settle();
    assert.equal(ids.get('warning').hidden, false);
    assert.match(ids.get('warning').textContent, /obsoleti/);
    staleSnapshot = false;
    timers.get(300000)();
    await settle();
    assert.equal(ids.get('warning').hidden, true);

    // A reused snapshot warns even when its timestamp is still within its age limit.
    providers[0].status = 'stale';
    providers[0].lastAttemptAt = new Date().toISOString();
    providers[0].lastSuccessAt = new Date(Date.now() - 3600000).toISOString();
    timers.get(300000)();
    await settle();
    assert.equal(ids.get('warning').hidden, false);
    // The server-side refresh failed, so the page names that rather than its own fetch.
    assert.match(ids.get('warning').textContent, /^Non è stato possibile aggiornare questo fornitore\. .* del \d+ \S+ \d{4} · \d{2}:\d{2} GMT[+-]\d+\.$/);
    delete providers[0].status;
    delete providers[0].lastAttemptAt;
    delete providers[0].lastSuccessAt;
    timers.get(300000)();
    await settle();
    assert.equal(ids.get('warning').hidden, true);

    // Hidden tabs must neither render stale status repeatedly nor poll the server.
    const callsBeforeHiding = fetchCount;
    document.visibilityState = 'hidden';
    Date.now = () => originalNow() + 3600000;
    events.get('visibilitychange')();
    timers.get(30000)();
    timers.get(300000)();
    await settle();
    assert.equal(fetchCount, callsBeforeHiding);
    assert.equal(ids.get('tariff').textContent, 'Bassa tariffa');

    // On return, expired intervals become unknown before the network responds.
    document.visibilityState = 'visible';
    events.get('visibilitychange')();
    assert.equal(ids.get('tariff').textContent, 'Tariffa sconosciuta');
    await settle();
    assert.equal(fetchCount, callsBeforeHiding + 2);
    assert.equal(ids.get('tariff').textContent, 'Bassa tariffa');

    // Visible timers continue normal updates and refreshes.
    const callsBeforeTimer = fetchCount;
    timers.get(30000)();
    assert.equal(fetchCount, callsBeforeTimer);
    timers.get(300000)();
    await settle();
    assert.equal(fetchCount, callsBeforeTimer + 2);
    globalThis.fetch = async () => {throw Error('Offline');};
    select.value = 'second'; select.change();
    await settle();
    assert.equal(ids.get('tariff').textContent, 'Tariffa sconosciuta');
    assert.equal(ids.get('warning').hidden, false);
    assert.match(ids.get('warning').textContent, /Impossibile/);
  } finally {
    Date.now = originalNow;
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

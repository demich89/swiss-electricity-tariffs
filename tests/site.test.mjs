import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

// A buildless site still needs valid nested markup and resolvable deployment assets.
// This checks our static documents, not arbitrary HTML or browser rendering.
test('static pages have balanced markup, unique IDs and existing relative assets', async () => {
  const voidTags = new Set(['meta', 'link', 'br', 'hr', 'input', 'img']);
  for (const path of ['public/index.html', 'public/api/index.html']) {
    const html = await readFile(path, 'utf8');
    assert.match(html, /<html lang="en">/);
    const stack = [], ids = new Set();
    for (const [, closing, name, attrs] of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/g)) {
      if (closing) {assert.equal(stack.pop(), name, `${path}: closing ${name}`); continue;}
      if (!voidTags.has(name)) stack.push(name);
      const id = attrs.match(/\bid="([^"]+)"/)?.[1];
      if (id) {assert.ok(!ids.has(id), `Duplicate ID ${id}`); ids.add(id);}
      for (const [, url] of attrs.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^(https?:|#)/.test(url)) continue;
        assert.ok(url.startsWith('./') || url.startsWith('../'), `Non-relative URL ${url}`);
        const target = resolve(dirname(path), url);
        const info = await stat(target);
        if (info.isDirectory()) assert.ok((await stat(resolve(target, 'index.html'))).isFile());
      }
    }
    assert.deepEqual(stack, []);
    assert.ok(ids.has('language-switch'));
    if (path.includes('/api/')) {
      assert.ok(ids.has('example'));
      assert.match(html, /<thead>/);
      assert.match(html, /<pre id="example"><\/pre>/);
    }
  }
});

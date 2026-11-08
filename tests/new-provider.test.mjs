import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {exportName, scaffoldProvider} from '../scripts/new-provider.mjs';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/new-provider.mjs', import.meta.url));

async function withRoot(callback) {
  const root = await mkdtemp(join(tmpdir(), 'scaffold-test-'));
  try {
    await mkdir(join(root, 'src/providers'), {recursive: true});
    await mkdir(join(root, 'tests'));
    await callback(root);
  } finally {await rm(root, {recursive: true, force: true});}
}

test('export names are valid identifiers for every accepted ID', () => {
  assert.equal(exportName('ewz'), 'ewz');
  assert.equal(exportName('sak-energie'), 'sakEnergie');
  assert.equal(exportName('123-energy'), 'provider123Energy');
  assert.equal(exportName('class'), 'providerClass');
  assert.equal(exportName('await'), 'providerAwait');
  assert.equal(exportName('normalize'), 'providerNormalize');
});

test('scaffolded files are valid JavaScript for awkward IDs', async () => {
  await withRoot(async root => {
    for (const id of ['ewz', '123-energy', 'class', 'normalize', 'await']) {
      const {files} = await scaffoldProvider(root, id);
      for (const file of files) await run(process.execPath, ['--check', join(root, file)]);
    }
  });
});

test('a scaffolded adapter fails collection until normalize() is written', async () => {
  await withRoot(async root => {
    await mkdir(join(root, 'src/lib'));
    await copyFile(fileURLToPath(new URL('../src/lib/intervals.mjs', import.meta.url)), join(root, 'src/lib/intervals.mjs'));
    await scaffoldProvider(root, 'demo');
    const {demo} = await import(pathToFileURL(join(root, 'src/providers/demo.mjs')).href);
    await assert.rejects(demo.collect({now: Date.now(), request: async () => ({})}), /demo: normalize\(\) is not implemented/);
  });
});

test('existing files block the scaffold without leaving partial output', async () => {
  await withRoot(async root => {
    await writeFile(join(root, 'tests/ewz.test.mjs'), 'keep');
    await assert.rejects(scaffoldProvider(root, 'ewz'), /tests\/ewz\.test\.mjs already exists/);
    assert.deepEqual(await readdir(join(root, 'src/providers')), []);
    await assert.rejects(scaffoldProvider(root, 'Bad_ID'), /slugs/);
  });
});

test('CLI rejects invalid IDs with a non-zero exit', async () => {
  await assert.rejects(run(process.execPath, [script, '../escape']), error => error.code === 1);
});


test('second-write failure rolls back the newly created adapter', async () => {
  await withRoot(async root => {
    // The preflight sees no target; writing the test then fails without its parent.
    await rm(join(root, 'tests'), {recursive: true});
    await assert.rejects(scaffoldProvider(root, 'ewz'), error => error.code === 'ENOENT');
    assert.deepEqual(await readdir(join(root, 'src/providers')), []);
  });
});

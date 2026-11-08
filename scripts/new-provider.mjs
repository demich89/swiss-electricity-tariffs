import {access, unlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Scaffold an adapter and its test file. Registration stays a deliberate manual step.
// Names already used by the generated files or the registry module.
// await is reserved in ES modules even though the Function syntax check allows it.
const taken = new Set(['amb', 'assert', 'await', 'defaultProviderId', 'normalize', 'pointsToIntervals',
  'providers', 'test', 'validateRegistry']);

/** Exported variable name for an ID; IDs like 123-energy or class get a provider prefix. */
export function exportName(id) {
  const name = id.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
  try {
    // The ID regex limits name to [A-Za-z0-9], so this only checks syntax and reserved words.
    new Function(`'use strict'; let ${name};`);
    if (!taken.has(name)) return name;
  } catch {}
  return `provider${name[0].toUpperCase()}${name.slice(1)}`;
}

/** Write both files under root, or neither. Returns the created relative paths and export name. */
export async function scaffoldProvider(root, id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? '')) {
    throw Error('Provider IDs must be lowercase URL-safe slugs, e.g. ewz or sak-energie');
  }
  const name = exportName(id);
  const adapter = `import {pointsToIntervals} from '../lib/intervals.mjs';

// Official source: TODO link the page documenting this schedule.
// TODO: describe the endpoint's timestamp timezone, interval length and product applicability.

/** Parse the raw source responses into {time, tariff} points; throw on anything unexpected. */
export function normalize(responses) {
  // TODO: validate each response's shape and replace this throw with something like:
  //   const points = [];
  //   for (const response of responses) points.push({time: <UTC milliseconds>, tariff: 'low' | 'high'});
  //   return pointsToIntervals(points);
  // Until then collect() fails, so a registered but unfinished adapter is never published.
  throw Error('${id}: normalize() is not implemented');
}

export const ${name} = {
  id: '${id}',
  name: 'TODO short official name',
  fullName: 'TODO full official name',
  source: 'https://TODO.example/',
  timezone: 'Europe/Zurich',
  scheduleType: 'high-low',
  maxAgeSeconds: 21600,
  async collect({now, request}) {
    // Fetch every source day needed to cover today and tomorrow in Zurich.
    // request(url, options) returns parsed JSON, with timeout and retries.
    const responses = [];
    // responses.push(await request('https://TODO.example/api', {headers: {Accept: 'application/json'}}));
    return normalize(responses);
  },
};
`;

  const tests = `import test from 'node:test';
import assert from 'node:assert/strict';
import {${name}, normalize} from '../src/providers/${id}.mjs';
import {validateRegistry} from '../src/providers/index.mjs';

test('${id} metadata satisfies the provider contract', () => {
  validateRegistry([${name}], '${id}');
  assert.ok(!/TODO/.test(${name}.name + ${name}.fullName + ${name}.source), 'Replace the TODO metadata');
});

// Replace each todo with a test against captured or synthetic source responses.
test.todo('${id} requests the source days that cover today and tomorrow in Zurich');
test.todo('${id} normalizes a captured response into sorted intervals');
test.todo('${id} rejects malformed timestamps and unknown tariff values');
test.todo('${id} keeps gaps unknown and handles duplicates');
test.todo('${id} covers 23-hour and 25-hour DST days');
`;

  const files = [[`src/providers/${id}.mjs`, adapter], [`tests/${id}.test.mjs`, tests]];
  for (const [file] of files) {
    try {
      await access(join(root, file));
    } catch {
      continue;
    }
    throw Error(`${file} already exists; nothing was written`);
  }
  const written = [];
  try {
    for (const [file, content] of files) {
      await writeFile(join(root, file), content, {flag: 'wx'});
      written.push(file);
    }
  } catch (error) {
    // Never leave half a scaffold behind.
    await Promise.all(written.map(file => unlink(join(root, file))));
    throw error;
  }
  return {files: written, name};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  try {
    const {files, name} = await scaffoldProvider(fileURLToPath(new URL('../', import.meta.url)), id);
    for (const file of files) console.log(`Created ${file}`);
    console.log(`
Next steps:
  1. Implement normalize() and collect() in src/providers/${id}.mjs.
  2. Replace the todo tests in tests/${id}.test.mjs and run npm test.
  3. Register it in src/providers/index.mjs:
       import {${name}} from './${id}.mjs';
       export const providers = [amb, ${name}];
  4. Run npm run fetch and npm start to check it live.`);
  } catch (error) {
    console.error(error.message);
    console.error('Usage: npm run new-provider -- <id>');
    process.exit(1);
  }
}

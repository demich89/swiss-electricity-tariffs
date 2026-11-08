import {fileURLToPath} from 'node:url';
import {providers, defaultProviderId} from '../src/providers/index.mjs';
import {collectSnapshots, loadPrevious, writeSnapshots} from '../src/collect.mjs';

// PREVIOUS_SITE_URL is the deployed site base; without it a failed provider has no fallback.
const base = process.env.PREVIOUS_SITE_URL;
const result = await collectSnapshots(providers, defaultProviderId, {previous: id => loadPrevious(base, id)});
await writeSnapshots(fileURLToPath(new URL('../public/', import.meta.url)), providers, defaultProviderId, result);
for (const [id, {status, error}] of result.status) {
  const count = result.snapshots.get(id)?.intervals.length;
  if (status === 'ok') console.log(`${id}: saved ${count} validated intervals`);
  else if (status === 'stale') console.warn(`${id}: collection failed (${error}); reused deployed snapshot with ${count} intervals`);
  else console.warn(`${id}: collection failed (${error}); no previous snapshot, omitted from catalog`);
}

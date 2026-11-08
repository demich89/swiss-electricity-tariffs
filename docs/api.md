# Public API v1

All paths are relative to the website base URL. For a project site, retain the repository name in the path. These are static JSON snapshots, not live query endpoints. No authentication is required.

## Discovery

`GET api/v1/providers.json`

The catalog contains `version: 1`, `defaultProviderId`, `providers` and `failedProviderIds` (IDs whose most recent collection failed, including providers omitted because no deployed snapshot was available). Older catalogs may omit failure metadata. Each provider contains:

| Field | Meaning |
| --- | --- |
| `id` | Stable URL-safe lowercase identifier |
| `name`, `fullName` | Official display names |
| `product` | Optional official product name when the schedule applies to one product only (AMB: `Tariffa dinamica`). Absent when not needed. Not translated. |
| `source` | Official provider website |
| `timezone` | `Europe/Zurich` |
| `scheduleType` | Currently `high-low` |
| `maxAgeSeconds` | Freshness threshold after a successful fetch |
| `tariffsUrl` | Snapshot location, relative to the catalog URL |
| `status` | `ok` for a successful fetch; `stale` for a reused deployed snapshot |
| `lastAttemptAt` | UTC ISO timestamp when this provider collection attempt completed |
| `lastSuccessAt` | Snapshot's original `fetchedAt`; unchanged on reuse |

For example:

```js
const catalogUrl = new URL('api/v1/providers.json', siteBaseUrl);
const response = await fetch(catalogUrl);
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const catalog = await response.json();
const provider = catalog.providers.find(item => item.id === 'amb');
if (!provider) throw new Error('Provider not supported');
const tariffsUrl = new URL(provider.tariffsUrl, catalogUrl);
```

Collection metadata is additive to v1; clients must tolerate older entries without it. For a fresh success, `lastAttemptAt` and `lastSuccessAt` both equal the snapshot fetch timestamp. A reused snapshot retains its original expiry. Treat `status: stale` as a refresh failure independently of its age.

Only verified, implemented providers with available data are listed. A listed provider can still have stale or missing coverage; discovery is not a live health check.

## Tariff snapshot

`GET api/v1/providers/<id>/tariffs.json`

| Field | Meaning |
| --- | --- |
| `version` | `1` |
| `providerId` | Provider catalog ID |
| `provider` | Provider display name |
| `product` | Optional official product name this schedule applies to (same as in the catalog) |
| `source` | Official provider website |
| `independent` | `true`; this is not an official provider API |
| `timezone` | Local timezone for presentation |
| `fetchedAt` | Last successful collection, UTC ISO 8601 |
| `staleAfter` | UTC ISO 8601 freshness threshold |
| `maxIntervalSeconds` | `900` |
| `timestampUnit` | `milliseconds` |
| `tariffs` | English labels and display colors for `low` and `high` |
| `intervals` | Sorted, non-overlapping `{start, end, tariff}` objects |

`start` is inclusive and `end` exclusive. Both are UTC Unix milliseconds. Each interval lasts at most 15 minutes. A gap means `unknown`; it is not represented by a synthetic low interval. Snapshots may include adjacent days in addition to today and tomorrow.

Calculate current status using `start <= now && now < end`. Check version, provider identity, timestamp validity, permitted codes, sorting and interval lengths before using external data. Warn or reject when `now > Date.parse(staleAfter)` or `fetchedAt` is implausibly in the future. Expired intervals remain unknown regardless of snapshot freshness.

Do not predict a change across missing coverage. Use Europe/Zurich calendar boundaries when selecting a day; do not assume 24 hours or 96 readings.

## Existing endpoints

`api/v1/tariffs.json` remains an alias of the **AMB** snapshot, regardless of the registry's default provider. `data/tariffs.json` retains the initial AMB website format (`version`, `fetchedAt`, `intervals`). Neither follows the browser's provider selection.

Human-readable API labels changed from Dutch to English during the English-first cleanup. Machine tariff codes remain `low` and `high`; code against those values. Future additive fields may appear in v1. Changes to interval units, tariff codes or field meanings require a new version path.

## Access and updates

Snapshots update after scheduled collection and deployment, approximately hourly. Providers collect independently. A failed provider can reuse only its validated, identity-matching deployed snapshot, retaining its original timestamps; checked-in snapshots are not used as fallback. A provider without any valid copy is omitted. An unavailable default provider or a run with no fresh provider collections blocks publication. Partial failures publish usable data first, then mark the workflow failed so the failure remains visible. If a deployment is blocked, the previous catalog cannot describe the new attempt; inspect Actions as well as metadata. Schedules and hosting caches can introduce delays. Check freshness and coverage on every use. Poll no more often than every five minutes and use a request timeout. Conditional requests may be used if the hosting response provides validators.

There are no query filters, writes, historical archives or availability guarantees. Query parameters do not filter the dataset. Unknown provider paths are missing static files; do not expect JSON error bodies. Always check HTTP status before parsing JSON. Browser requests from another origin depend on hosting CORS headers; this repository cannot configure GitHub Pages response headers. Server clients can fetch the public URLs directly.

No additional licence to upstream data is granted. Consult the provider for authoritative terms and tariff information.

## Interactive documentation

The served `api/` page loads discovery dynamically, lists each provider's collection status and UTC attempt/success timestamps, and offers a copy button for every endpoint. Its provider selector updates the endpoint, curl command and executable JavaScript example together. The example reads discovery first and combines provider collection status with snapshot expiry, so recently retained data is still identified as degraded. All URLs resolve relative to the actual catalog, including GitHub Pages repository prefixes.

If discovery cannot be loaded, the page shows an explicit error and keeps endpoint copying disabled. The catalog link remains available for manual inspection. The visible snapshot example is illustrative; the catalog response shown after loading is the real published catalog.

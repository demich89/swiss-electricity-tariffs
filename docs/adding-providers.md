# Adding a provider

The project currently supports Swiss high/low schedules. It does not yet model currency prices, annual tariff products or arbitrary price bands. Those need a deliberate schema and UI extension; do not map them approximately onto high/low categories.

## 1. Verify the source

Find an official public endpoint or documented source. Confirm its timestamp timezone, interval duration, product applicability, publication time and terms of use. Record those details alongside the adapter. Distinguish a household schedule from annual comparison averages. Never infer that another provider uses AMB's switching times or colors.

## 2. Scaffold and implement the adapter

```sh
npm run new-provider -- <id>
```

This creates `src/providers/<id>.mjs` and `tests/<id>.test.mjs` and prints the registration lines. Use a stable lowercase URL-safe ID. It writes both files or neither and never overwrites existing ones. IDs that are not valid JavaScript names, such as `123-energy` or `class`, get a `provider` prefix on the export (`provider123Energy`). The generated metadata test fails until the TODO name, full name and source are replaced, and `collect()` throws until `normalize()` is implemented, so an unfinished adapter cannot be published by accident.

An adapter only has to do two things:

- **`collect({now, request})`** fetches the raw source responses. `request(url, options)` returns parsed JSON, with timeout and retries. Fetch enough adjacent source dates to cover today and tomorrow in Zurich.
- **`normalize(responses)`** validates the source format and maps each reading to `{time, tariff}`, where `time` is UTC milliseconds and `tariff` is `low` or `high`. Throw on anything unexpected.

Pass the points to `pointsToIntervals()` from `src/lib/intervals.mjs`. It sorts the readings, merges identical duplicates and rejects conflicting ones, and ends each interval at the next reading or after 15 minutes, whichever comes first. Gaps stay unknown. Do not reimplement these rules in an adapter. `src/providers/amb.mjs` is a complete example.

Return only confirmed readings. Never synthesize prices or fetch times. If the official source publishes longer periods, emit one reading per 15 minutes only if the source guarantees that coverage.

The orchestrator supplies a single collection reference time and sets `fetchedAt` after each adapter succeeds. Use `utcDays()` only for sources whose day semantics match AMB's UTC-day API. The current browser supports Europe/Zurich only.

## 3. Register and test

Import the adapter in `src/providers/index.mjs` and append it to `providers`, as printed by the scaffold. A test checks every registered provider against the contract. Keep `amb` as the default unless intentionally changing the website's initial selection. Provider names are official proper names and need no translation.

Replace the generated todo tests with offline tests for request parameters, normalization, empty data, malformed timestamps, gaps, duplicates and DST boundaries. Test the source's actual edge cases. `tests/providers.test.mjs` demonstrates adding a second synthetic adapter and checking generated paths and AMB aliases. No test provider is registered in production.

Run:

```sh
npm test
npm run fetch
npm start
```

Check the catalog, provider JSON and selector locally. Verify fresh timestamps and actual coverage, not just an HTTP 200 response.

## 4. Publication and failure policy

Collection is sequential to avoid an uncontrolled burst of requests. Registry errors block the build. Individual upstream failures can reuse a validated, matching snapshot from the deployed Pages site using `PREVIOUS_SITE_URL` (include a trailing slash). Its fetch and expiry timestamps must stay unchanged; never refresh them during reuse. No checked-in fallback is allowed.

A failed provider with no valid deployed copy is omitted from the catalog. The default provider must remain available, and at least one provider must collect fresh data; otherwise publication is blocked even if older deployed copies exist. Catalog entries expose `status` (`ok` or `stale`), `lastAttemptAt` and `lastSuccessAt`; top-level `failedProviderIds` also includes omitted failures. Browser clients tolerate older catalogs without these additive fields and warn when a provider's status is stale.

Test both successful refresh and carry-forward behavior, absent or invalid prior data, provider identity mismatches and an unavailable default. The first deployment cannot reuse anything. Without `PREVIOUS_SITE_URL`, local runs have no fallback.

Files are individually replaced through temporary files; local writes are not a multi-file transaction. GitHub Pages publishes only after the build succeeds. For a publishable partial result, the workflow deploys before its reporting job marks upstream failures. This keeps other providers updating without hiding the outage. Dedicated alerting and a public health dashboard remain future work.

No provider-specific browser branch should be necessary for another high/low schedule. If one is required, review whether it needs a new capability or schema instead.

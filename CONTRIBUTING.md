# Contributing

Use English for code, comments, tests and documentation. English locale files are the source for German, French and Italian translations. Do not introduce Dutch defaults or hardcoded localized browser messages.

Start with the [README](README.md), [provider guide](docs/adding-providers.md) and [API contract](docs/api.md). Keep upstream requests inside provider adapters and browser-safe interval rules in the shared static modules. Do not add servers, databases or Home Assistant configuration.

Run `npm test` before submitting changes. Tests must be offline and deterministic. New provider adapters need evidence from an official source and tests for invalid and missing data. Use `npm run fetch` separately for an end-to-end live check. Never commit credentials or turn missing coverage into a low tariff.

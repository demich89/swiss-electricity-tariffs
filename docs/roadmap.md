# Roadmap

Swiss Electricity Tariffs grows in two directions: from **high/low schedules** to **prices**, and from **Bellinzona** to **Ticino** to **all of Switzerland**. Covering every Swiss provider is a long-term target, not a promise: some products have no public, usable data, and those stay listed as unsupported rather than guessed.

Facts below were checked on 2026-11-08. Re-check them before starting each phase.

## What we build on

- **Machine-readable tariffs are mandatory.** Since the 2026 tariffs, distribution network operators must publish their tariffs as one JSON file following the VSE API definition (binding OpenAPI 3.0.3 specification), and ElCom publishes the file links through the federal LINDAS platform. ElCom also reports quality problems with these publications, so a registered link is a candidate source, not a working integration. ([ElCom newsletter 02/2026](https://www.elcom.admin.ch/dam/de/sd-web/A6UYygEpPug3/Newsletter_02-2026_D.pdf), [VSE/strom.ch](https://www.strom.ch/de/media/15523/download))
- **ElCom open data** gives annual prices per operator, municipality and consumption category, with price components. ([ElCom tariff data](https://www.elcom.admin.ch/en/tariff-data-and-visualisations), [opendata.swiss](https://opendata.swiss/en/dataset/strompreis-per-stromnetzbetreiber))
- **Products differ.** AMB publishes a dynamic high/low schedule. AIL's dynamic tariff has four daily bands (06–10, 10–17, 17–22, 22–06) with prices published daily; it cannot be reduced to high/low without official semantics. ([AIL conditions](https://de.ail.ch/dam/jcr:5aa79d5a-1b44-4011-8efd-31b6f60d72d1/Condizioni%20applicabili%20alla%20Tariffa%20Dinamica.pdf))

## Positioning

Similar tools exist, mostly as Home Assistant integrations (for example [ha_swiss_electricity_price](https://github.com/prusuino/ha_swiss_electricity_price) and [ha-ch-energy](https://github.com/marcelloceschia/ha-ch-energy)) and commercial APIs such as [Strompreise Schweiz](https://www.strompreise-schweiz.ch/de/docs/api/tariffs). Our place: a simple multilingual public website showing the current tariff, the next change and today/tomorrow, plus an open, normalized static API, with no installation and no account. We do not claim to be the first or the only one, or to cover the whole country. We reuse official formats, and check licences before reusing anyone's code.

## Phase 0 — Launch AMB

The code is complete. Push, enable GitHub Pages, and watch the first scheduled run.

## Phase 1 — Inventory and source formats (before any new adapter type)

- Build the Ticino inventory from ElCom data: operators, municipalities served, products, and each operator's machine-readable tariff file link.
- Fetch and inspect the real Ticino tariff files. Assess whether one shared parser for the VSE format can produce high/low time windows (and later prices) reliably.
- Record per operator and product: schedule kind (published dynamic schedule, fixed time windows, multi-band, flat rate, none), source, terms of use, and data quality problems found.
- Model provider, product and service area separately; record separate energy and grid tariffs where they differ. Do not assume one holiday calendar fits every product; take holidays from the source where it defines them.
- Outcome: a written decision on the second provider kind (VSE-file parser, fixed-window rules, or both) and the order of the next providers.

## Phase 2 — Ticino, high/low

- Add Ticino providers whose products have official high/low semantics, ordered by source quality and applicability (not by unverified customer counts).
- Schedules computed from fixed rules are derived timetables, not observed readings. Their validity period and source-check date are stored separately from the reading-based expiry AMB uses.
- Website: choose by municipality or postcode, then operator and product, because most people do not know their operator. Where several apply, show the choice; never guess.
- A coverage page lists every Ticino operator as supported, in progress, or unsupported (with the reason). Missing data stays unknown and is never assumed to be low.

## Phase 3 — Prices

1. **Annual reference prices** from ElCom, always labelled with year, category, product and components. These are reference prices, not the unit rate a specific household pays.
2. **High and low unit prices** from official tariff files, shown as "now: low tariff, X Rp./kWh" with year, VAT treatment and source.
3. **Multi-band and dynamic products** such as AIL need a band-and-price model. An optional price field in v1 does not fix the missing band meaning, so this means new capabilities or an endpoint in API v2, designed before any AIL work. AIL is a research candidate, not a promised integration.

Bill estimates and consumption tracking stay out of scope for now; they may be considered later as separate scope.

## Phase 4 — Switzerland

- A national catalog of every operator from ElCom data, with annual reference prices and coverage status.
- Schedules and prices added through the shared format parser where publications are usable, then provider by provider for the rest, prioritized by source quality.
- Contributions through a pull-request template that requires official source links and tests.
- A public status page for stale and failed providers. Static GitHub Pages hosting stays until build time or size says otherwise.

## Throughout

- Every value carries its source, retrieval time and validity period.
- Yearly re-check in autumn, when new tariffs for 1 January are published.
- Check each operator's terms before automated collection; prefer official open data and official files.
- API v1 stays stable. Breaking changes go to v2, with v1 kept during a transition period.
- Validate the website with local users in Ticino before widening the scope.

## Open decisions

1. Website entry point for Phase 2: municipality/postcode search (recommended) or a provider list.
2. Whether annual reference prices are an acceptable first price feature.
3. Optional short brand name next to "Swiss Electricity Tariffs".

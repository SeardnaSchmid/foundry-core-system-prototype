---
type: guide
title: Build, test, and release
description: The npm scripts for building CSS, running tests, validating the wiki, and cutting a release.
tags: [build, test, release, ci]
---

# Build, test, and release

Command reference, CI wiring, and the full release procedure.

## Commands

| Command | Does |
| --- | --- |
| `npm run build` | Compiles `src/scss/tno.scss` → `css/tno.css` (Sass, expanded, no source map) |
| `npm run watch` | Same, with source maps and `--watch` |
| `npm test` | Runs the Vitest suite (`tests/helpers/*.test.js`) |
| `npm run test:coverage` | Same, with v8 coverage (text + HTML + JSON summary) |
| `npm run test:e2e` | Runs the Playwright suite against a disposable Foundry in Docker — see [e2e-testing.md](e2e-testing.md) |
| `npm run docs:check` | Validates `docs/wiki/**` — see below |
| `npm run css:check` | Fails if `css/tno.css` is not what `src/scss` currently compiles to — see below |
| `npm run release` | Runs `release-it`: bumps version, updates `CHANGELOG.md`, tags, pushes |

There is no bundler and no linter (`eslint`/`prettier`) in this repo —
`module/**/*.mjs` ships as-authored.

## Release procedure

When instructed to perform or prepare a release:

1. **Check compatibility.** If updating Foundry compatibility, explicitly
   confirm or update `compatibility.verified` (and optionally
   `compatibility.minimum`) in `system.json`.
2. **Run `npm run release`.** This runs `docs:check`, bumps the version in
   `package.json` and `system.json`, updates `CHANGELOG.md`, creates a
   `chore: release vX.Y.Z` commit, tags it, and pushes.
3. **Do not touch the `download` URL** in `system.json` by hand — the GitHub
   release workflow rewrites it on tag push.

## CI

Three GitHub Actions workflows:

- **`.github/workflows/release.yml`** — triggers only on `v*.*.*` tags. Its
  `release` job runs the Vitest suite, generates coverage, packages
  `system.zip` from an explicit file list, and publishes the GitHub release.
  It does not run Playwright e2e tests.
- **`.github/workflows/docs.yml`** — triggers on push/PR touching
  `docs/wiki/**`, `module/**`, `template.json`, or the validator itself.
  Runs `npm run docs:check`.
- **`.github/workflows/e2e.yml`** — triggers on push to `main` and on pull
  requests from branches in this repository, for fast feedback while
  developing. Runs the same Playwright suite against Foundry in Docker.

`npm run docs:check` is also wired into `.release-it.json`'s `before:init`
hook alongside `npm test`, so a release cannot ship with a stale wiki
pointer (`resource:`/`spec:` path that no longer exists, broken link, or
orphaned page).

## The compiled stylesheet is an artifact under review

`css/tno.css` is **committed**, because Foundry loads it straight from the
manifest and there is no bundler in front of it. Nothing else in the pipeline
looks at it: `npm test` covers the pure helpers and `docs:check` reads the
wiki, so a `.scss` edit committed without `npm run build` used to ship a
stylesheet that silently did not match its source.

`npm run css:check`
([`scripts/check-css-build.mjs`](../../../scripts/check-css-build.mjs))
closes that. It compiles `src/scss/tno.scss` to a temporary file with the exact
flags `npm run build` uses and compares byte for byte, so it can never disagree
with the real build. It runs as part of `npm run release:verify` alongside
`docs:check`.

**If it fails, run `npm run build` and commit the result** — the checked-in CSS
is out of date, not wrong.

## Wiki validation details

`scripts/validate-wiki.mjs` checks every page under `docs/wiki/`:
frontmatter parses and has the required keys (`type`, `title`,
`description`, `tags`; `resource` for `concept`/`architecture`/`reference`
pages), every `resource:`/`spec:` path exists on disk, every relative
Markdown link resolves, every `related:` slug resolves to a real page, no
duplicate titles, and every page is reachable from
[`docs/wiki/index.md`](../index.md) via links or `related:` (the orphan
check).

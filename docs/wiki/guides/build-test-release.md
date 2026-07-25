---
type: guide
title: Build, test, and release
description: The npm scripts for building CSS, running tests, validating the wiki, and cutting a release.
tags: [build, test, release, ci]
---

# Build, test, and release

Full release procedure: [`AGENTS.md`](../../../AGENTS.md). This page is
just the command reference.

## Commands

| Command | Does |
| --- | --- |
| `npm run build` | Compiles `src/scss/tno.scss` → `css/tno.css` (Sass, expanded, no source map) |
| `npm run watch` | Same, with source maps and `--watch` |
| `npm test` | Runs the Vitest suite (`tests/helpers/*.test.js`) |
| `npm run test:coverage` | Same, with v8 coverage (text + HTML + JSON summary) |
| `npm run test:e2e` | Runs the Playwright suite against a disposable Foundry in Docker — see [e2e-testing.md](e2e-testing.md) |
| `npm run docs:check` | Validates `docs/wiki/**` — see below |
| `npm run release` | Runs `release-it`: bumps version, updates `CHANGELOG.md`, tags, pushes |

There is no bundler and no linter (`eslint`/`prettier`) in this repo —
`module/**/*.mjs` ships as-authored.

## CI

Three GitHub Actions workflows:

- **`.github/workflows/release.yml`** — triggers only on `v*.*.*` tags.
  Runs the test suite, generates coverage, packages `system.zip` from an
  explicit file list, and publishes the GitHub release.
- **`.github/workflows/docs.yml`** — triggers on push/PR touching
  `docs/wiki/**`, `module/**`, `template.json`, or the validator itself.
  Runs `npm run docs:check`.
- **`.github/workflows/e2e.yml`** — triggers on push to `main` and on pull
  requests from branches in this repository. Runs the Playwright suite
  against Foundry in Docker. It is *not* part of the release gate, since it
  needs Docker and Foundry credentials — see
  [e2e-testing.md](e2e-testing.md).

`npm run docs:check` is also wired into `.release-it.json`'s `before:init`
hook alongside `npm test`, so a release cannot ship with a stale wiki
pointer (`resource:`/`spec:` path that no longer exists, broken link, or
orphaned page).

## Wiki validation details

`scripts/validate-wiki.mjs` checks every page under `docs/wiki/`:
frontmatter parses and has the required keys (`type`, `title`,
`description`, `tags`; `resource` for `concept`/`architecture`/`reference`
pages), every `resource:`/`spec:` path exists on disk, every relative
Markdown link resolves, every `related:` slug resolves to a real page, no
duplicate titles, and every page is reachable from
[`docs/wiki/index.md`](../index.md) via links or `related:` (the orphan
check).

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
| `npm run build:packs` | Compiles `src/packs/**` YAML → the LevelDB compendia in `packs/` — see [compendium-packs.md](compendium-packs.md) |
| `npm run packs:extract` | The reverse: writes an edited compendium back over its YAML source |
| `npm test` | Runs the Vitest suite (`tests/{helpers,documents,packs}/**/*.test.js`) |
| `npm run test:coverage` | Same, with v8 coverage (text + HTML + JSON summary) |
| `npm run test:e2e` | Runs the Playwright suite against a disposable Foundry in Docker — see [e2e-testing.md](e2e-testing.md) |
| `npm run docs:check` | Validates `docs/wiki/**` and the Proof citations in `docs/design/**` — see below |
| `npm run css:check` | Fails if `css/tno.css` is not what `src/scss` currently compiles to — see below |
| `npm run packs:check` | Fails if `src/packs/**` does not compile. Builds into a temp directory and discards it, so it never touches `packs/` and runs happily under a live Foundry — see below |
| `npm run docs:odds` | Regenerates `docs/design/dice-odds.md` from the shipped dice helpers — see [dice-resolution.md](../concepts/dice-resolution.md) |
| `npm run rules:fetch` | Refreshes the private rule mirror in the independent `rules/` Git repository |
| `npm run release` | Runs `release-it`: bumps version, updates `CHANGELOG.md`, tags, pushes |

There is no bundler and no linter (`eslint`/`prettier`) in this repo —
`module/**/*.mjs` ships as-authored.

## Refreshing the private rule mirror

`npm run rules:fetch` downloads the public Google Drive rule tree into a
temporary sibling directory first. Only a complete download replaces
`rules/wiki/`, so a network failure cannot leave a partial mirror behind.

The whole `rules/` directory remains ignored by the parent repository
intentionally; it is initialized as a separate Git repository so rule text and
its history are not published with the Foundry system. Every successful fetch
automatically creates a commit scoped to `wiki/`, including an empty commit
when the source did not change. Use `git -C rules diff HEAD^ HEAD -- wiki` to
review the exact delta. Unchanged documents retain their existing `scraped:`
value so the diff contains no daily timestamp churn. See `rules/README.md` for
the short workflow.

## Release procedure

When instructed to perform or prepare a release:

1. **Check compatibility.** If updating Foundry compatibility, explicitly
   confirm or update `compatibility.verified` (and optionally
   `compatibility.minimum`) in `system.json`.
2. **Run `npm run release`.** This runs `release:verify` (`docs:check`,
   `css:check`, `packs:check`), bumps the version in `package.json` and
   `system.json`, updates `CHANGELOG.md`, creates a `chore: release vX.Y.Z`
   commit, tags it, and pushes. **Foundry may stay running** — nothing in the
   release path writes to `packs/`.
3. **Do not touch the `download` URL** in `system.json` by hand — the GitHub
   release workflow rewrites it on tag push.

## CI

Three GitHub Actions workflows:

- **`.github/workflows/release.yml`** — triggers only on `v*.*.*` tags. Its
  `release` job runs the Vitest suite, generates coverage, builds the
  compendium packs, packages `system.zip` from an explicit file list, and
  publishes the GitHub release. It does not run Playwright e2e tests.
- **`.github/workflows/docs.yml`** — triggers on push/PR touching
  `docs/wiki/**`, `docs/design/**`, `module/**`, `template.json`, or either
  validator. Runs `npm run docs:check`.
- **`.github/workflows/e2e.yml`** — triggers on push to `main` and on pull
  requests from branches in this repository, for fast feedback while
  developing. Runs the same Playwright suite against Foundry in Docker, after
  building the compendium packs — Foundry logs an error for a registered pack
  whose directory does not exist.

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

## Validating the packs without rebuilding them

`release:verify` used to run `build:packs`, purely to prove the YAML compiles
before a tag was cut. That worked, but it validated by destructively rebuilding
`packs/` in place — and `packs/` is a LevelDB a running Foundry holds open. The
guard in `build-packs.mjs` would then refuse, so cutting a release meant first
shutting down the world you were developing against. The build output was never
the point; only the fact that it could be produced.

[`scripts/check-packs-build.mjs`](../../../scripts/check-packs-build.mjs)
compiles every source under `src/packs/` into a temporary directory and deletes
it, exactly as `check-css-build.mjs` does for the stylesheet. Same validation,
no lock, no live directory touched — so a release can be cut with Foundry open.

`build:packs` keeps its lock guard, because there it is still right: that
command really does rebuild the pack a live Foundry is reading.

## Proof citations in docs/design

`docs/design/**` carries no prose status field. Instead every rule row cites the
test that pins it down, as one code span holding a spec path, an `›`, and the
test title:

```
| rule row | … | `tests/helpers/items.test.js › grades a shortfall …` |
| rule row | … | —                                                   |
```

`scripts/validate-proofs.mjs` fails the build when a citation names a test that
does not exist, so a citation cannot rot silently the way a hand-written
"Status: implemented" can. An em dash means "specified, not proven" — which for
these documents is the same statement as "not implemented", because a rule the
suite does not exercise is a rule nothing is holding in place.

It matches `it(` and `test(` alike, so a Playwright spec satisfies a citation
whether or not the e2e suite has been run.

## Wiki validation details

`scripts/validate-wiki.mjs` checks every page under `docs/wiki/`:
frontmatter parses and has the required keys (`type`, `title`,
`description`, `tags`; `resource` for `concept`/`architecture`/`reference`
pages), every `resource:`/`spec:` path exists on disk, every relative
Markdown link resolves, every `related:` slug resolves to a real page, no
duplicate titles, and every page is reachable from
[`docs/wiki/index.md`](../index.md) via links or `related:` (the orphan
check).

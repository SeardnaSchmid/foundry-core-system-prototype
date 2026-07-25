---
type: guide
title: End-to-end testing
description: How the Playwright e2e suite drives a disposable Foundry instance in Docker, and how to run, write, and debug it.
tags: [test, e2e, playwright, docker, ci]
---

# End-to-end testing

The Vitest suite covers pure helpers only (see
[build-test-release.md](build-test-release.md)). Anything that needs a
prepared `Actor`, a rendered sheet, or a live `game` object cannot be
reached that way — `TnoActor#prepareDerivedData`, `TnoActorSheet`, the roll
dialogs and the chat-card edge actions all sit outside its reach.

The e2e suite closes that gap by running the system inside a real Foundry.

## How it works

`npm run test:e2e` starts a **disposable Foundry in Docker** and points
Playwright at it. It never touches your own Foundry install or worlds.

1. `tests/e2e/foundry-container.mjs` builds a host directory that becomes the
   container's `/data`, containing only a release zip, the licence, and a
   hand-written eight-line `world.json`. This repo is bind-mounted at
   `/data/Data/systems/tno`, so **the code under test is the working tree** —
   there is no build or packaging step.
2. Foundry does the rest on first launch: it creates the world's LevelDB
   stores and auto-creates a **passwordless Gamemaster**. That is why there is
   no world-creation UI to automate and no world fixture in the repository.
3. `tests/e2e/global-setup.mjs` joins as that Gamemaster and saves the session
   to `storageState`, so specs start already inside the world.
4. The world is wiped and rebuilt on every run, so specs can assume a clean
   slate instead of cleaning up after each other.

## Running it

| Command | Does |
| --- | --- |
| `npm run test:e2e` | Full suite: starts the container, runs the specs, tears it down |
| `npm run test:e2e:ui` | Playwright's interactive UI mode |
| `npm run test:e2e:report` | Opens the HTML report from the last run |

Useful environment variables:

| Variable | Effect |
| --- | --- |
| `TNO_E2E_KEEP=1` | Leaves the container running afterwards. The next run reuses it, which turns a ~40s startup into nothing — use this while iterating. |
| `TNO_E2E_PORT` | Host port (default `30001`, so it never collides with a local Foundry on `30000`) |
| `TNO_E2E_FOUNDRY_ZIP` | Path to a Foundry release zip to seed the container cache from |
| `FOUNDRY_VERSION` | Foundry version to run (default `14.364`) |

**Locally you need no credentials.** The harness reuses the signed licence
activation from an existing Foundry install and matches the container's
hostname to it. Nothing secret is read into the repository, and the
container's data directory lives outside it (`~/.cache/tno-e2e/data`).

## Writing specs

Specs drive Foundry through `page.evaluate()` rather than by clicking
through the UI to build state. `evaluate` runs inside the world with the
real `game`, `Actor`, `CONFIG` and system code, and returns the resolved
value straight back to Node — so a spec asserts on genuine derived data with
no mock layer and no in-world test-runner module. UI interaction is reserved
for the behaviour actually under test.

`tests/e2e/fixtures.mjs` provides:

- a `world` fixture — a page inside the world, actors cleared, collecting
  uncaught page errors so a spec can assert none occurred;
- `createCharacter(page, { abilities, system })` — creates a character and
  returns its id plus computed derived data;
- `openSheet(page, actorId)` — renders an actor sheet and waits for it.

Expected values are written as literals rather than recomputed from the
formula under test; a test that re-derives its own expectation passes even
when the formula is wrong. See `tests/e2e/specs/sheet-derived.spec.mjs`.

## Gotchas

- **Viewport.** Foundry refuses to start below 1366x768 and shows a blocking
  notice instead of the UI. Playwright's default is 1280x720, so
  `playwright.config.mjs` sets it explicitly.
- **Serial only.** Foundry is one shared world; parallel workers would race
  on the same documents and settings, so `workers: 1`.
- **`data-appid`, not the element id.** Sheet element ids are numeric
  (`appId`), and `#28` is not a valid CSS selector.
- **Stale lock.** A container killed mid-run leaves `Config/options.json.lock`
  behind and Foundry then refuses to start ("already locked by another
  process"). `provision()` clears it automatically.
- **`CONTAINER_PRESERVE_CONFIG`** must stay unset: it also suppresses the
  `options.json` update that applies `FOUNDRY_WORLD`, so the server starts but
  never launches the world.

## CI

`.github/workflows/e2e.yml` runs the suite on pushes to `main` and on pull
requests from branches in this repository.

A runner has no Foundry install to borrow an activation from, so CI supplies
`FOUNDRY_LICENSE_KEY`, `FOUNDRY_USERNAME` and `FOUNDRY_PASSWORD` as GitHub
secrets. The release zip is cached across runs; the credentials are still
required on a cache hit, because they are what fetches the signed *licence*,
not just the download.

This repository is public, so those secrets are not available to pull
requests from forks and the suite is skipped there. **Do not work around that
with `pull_request_target`** — it runs the pull request's own code with the
secrets in scope.

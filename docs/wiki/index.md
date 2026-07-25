---
type: index
title: TNO system wiki
description: Entry point and reading order for the code-map wiki over the tno Foundry VTT system.
tags: [index, overview]
---

# TNO system wiki

This is a **code map**, not a rulebook. Each page says what the code does,
where it lives, and which functions implement it, then links out to the
relevant PRD in [`docs/design/`](../design/) for the game-mechanics spec of
record. Pages don't restate rules — if a rule and this wiki ever disagree,
the PRD wins and this wiki is stale.

Every page's frontmatter carries a `resource:` (and often `spec:`) pointer
back to source. `npm run docs:check` fails the build if a pointer goes stale
— see [guides/build-test-release.md](guides/build-test-release.md).

## Reading order

New to the codebase? Read in this order:

1. [architecture/bootstrap.md](architecture/bootstrap.md) — how the system boots
2. [architecture/layering.md](architecture/layering.md) — the module dependency graph
3. [architecture/data-schema.md](architecture/data-schema.md) — where actor/item data lives
4. Pick a [concept](#concepts) matching what you're changing

## Architecture

- [architecture/bootstrap.md](architecture/bootstrap.md) — `module/tno.mjs` init → ready lifecycle
- [architecture/layering.md](architecture/layering.md) — dependency graph and layering rules
- [architecture/data-schema.md](architecture/data-schema.md) — `template.json` schema, derived-data location
- [architecture/datamodel-migration.md](architecture/datamodel-migration.md) — Foundry v14 `TypeDataModel` deprecation, and why there's no scaffold for it yet
- [architecture/hooks-and-settings.md](architecture/hooks-and-settings.md) — every Foundry hook, setting, menu, and Handlebars helper this system registers

## Concepts

- [concepts/dice-resolution.md](concepts/dice-resolution.md) — the 3d20 roll-under mechanic
- [concepts/edge-pool.md](concepts/edge-pool.md) — problem-solving edge actions (Trial & error / Retry / Post-mortem)
- [concepts/attributes.md](concepts/attributes.md) — the 12 attributes and their derived values
- [concepts/skills.md](concepts/skills.md) — built-in and custom skills
- [concepts/advancement.md](concepts/advancement.md) — spending XP to raise a rank
- [concepts/heatmap.md](concepts/heatmap.md) — the attribute-cell color gradient
- [concepts/active-effects.md](concepts/active-effects.md) — Foundry Active Effects in this system
- [concepts/migrations.md](concepts/migrations.md) — version-gated world data migrations

## Reference

- [reference/module-map.md](reference/module-map.md) — every file in `module/`, what it exports, what it's for
- [reference/ui-surfaces.md](reference/ui-surfaces.md) — Handlebars templates and SCSS components, mapped to the app/sheet that uses them
- [reference/localization.md](reference/localization.md) — `lang/en.json` / `lang/de.json` conventions

## Guides

- [guides/build-test-release.md](guides/build-test-release.md) — build, test, and release commands
- [guides/e2e-testing.md](guides/e2e-testing.md) — the Playwright suite that runs the system in a real Foundry

## Known tripwires

Things in this repo that look like real code paths but aren't, or vice
versa — read before you grep-and-edit blind:

- `src/datamodels/` **used to exist** as an unmodified, unreferenced Foundry
  DataModel boilerplate scaffold with the same file basenames as the live
  `module/` tree (`tno.mjs`, `sheets/actor-sheet.mjs`, `documents/actor.mjs`).
  It has been deleted — see
  [architecture/datamodel-migration.md](architecture/datamodel-migration.md)
  for why it existed and what a real migration should look like instead.

---
type: architecture
title: TypeDataModel migration status
description: Why template.json is still the live schema, what Foundry v14 changes, and why there's no scaffold for it.
tags: [datamodel, template-json, foundry-v14, migration, deprecation]
resource: [template.json, module/documents/actor.mjs]
related: [architecture/data-schema]
---

# TypeDataModel migration status

**Status: not started. No scaffold exists in this repo.**

## What's changing in Foundry

Foundry v14 (release 14.352) put the legacy `template.json` schema
specification into its deprecation period: "system types [must] either have
an unspecified schema or a schema defined via a `TypeDataModel`." This is a
**deprecation, not a removal** — `template.json` still works under v14 (this
system already declares `compatibility.verified: "14"` in
[`system.json`](../../../system.json)). Removal is expected in a later major
version (v15 or v16 based on Foundry's usual multi-version deprecation
window), not immediately.

## There used to be a `src/datamodels/` tree — it was not a real migration

A `src/datamodels/module/` directory existed with the same directory shape
and file basenames as the live `module/` tree (`tno.mjs`,
`documents/actor.mjs`, `sheets/actor-sheet.mjs`, `data/*.mjs`). It has been
**deleted** because it was unmodified Foundry scaffold boilerplate, never
adapted to this system, and never referenced by `system.json` or any file
under `module/`:

- Its schema defined only `biography` on the base actor — none of the real
  fields (`abilities`, `skills`, `problemSolving`).
- Where it did define fields (`data/actor-character.mjs`), the shape was
  wrong: `abilities.<key>` had `{base, value}` with no `xp`, which the live
  sheet's XP bars require.
- Its `prepareDerivedData()` computed `mod = floor((value - 10) / 2)` — a
  D&D ability-modifier formula. TNO is a 3d20 roll-under system (see
  [dice-resolution.md](../concepts/dice-resolution.md)); this value is
  meaningless here.
- Its `sheets/actor-sheet.mjs` was a ~256-line fork of the live 755-line
  sheet, missing the heatmap, skill filtering, edge pool UI, and
  advancement dialog entirely.
- Git history showed it was untouched since the initial commit, except for
  the two whole-repo rebrand find/replaces.

Keeping it around was an active hazard, not neutral dead weight: an agent
grepping for `TnoActorSheet` or `documents/actor.mjs` would get two hits,
one live and one stale, with no signal at the grep level about which is
real.

## What a real migration would look like

A `TypeDataModel` migration should be driven directly from the two sources
that are actually authoritative today —
[`template.json`](../../../template.json) for the shape, and
[`module/documents/actor.mjs`](../../../module/documents/actor.mjs)'s
`prepareDerivedData()` for the derived-value logic (see
[data-schema.md](data-schema.md) for both) — not from the deleted scaffold.
This is tracked as a known gap, not scheduled work; `template.json` remains
fully functional under the currently verified Foundry version.

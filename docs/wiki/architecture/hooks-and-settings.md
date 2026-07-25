---
type: architecture
title: Hooks, settings, and menus registry
description: Every Foundry hook, game.settings entry, settings menu, and Handlebars helper this system registers.
tags: [hooks, settings, registry, foundry-api]
resource: [module/tno.mjs, module/helpers/chat.mjs, module/helpers/migrations.mjs]
related: [architecture/bootstrap]
---

# Hooks, settings, and menus registry

## Hooks

| Hook | File:line | Purpose |
| --- | --- | --- |
| `Hooks.once('init')` | [`tno.mjs:23`](../../../module/tno.mjs) | Bootstrap — see [bootstrap.md](bootstrap.md) |
| `Hooks.once('ready')` | [`tno.mjs:180`](../../../module/tno.mjs) | Register `hotbarDrop`, run migrations |
| `Hooks.on('renderChatInput')` | [`tno.mjs:129`](../../../module/tno.mjs) | Inject "Basiswürfel" button (Foundry v14+ chat layout) |
| `Hooks.on('renderChatLog')` | [`tno.mjs:130`](../../../module/tno.mjs) | Same, for v12–v13's `#chat-controls` layout |
| `Hooks.on('hotbarDrop')` | [`tno.mjs:182`](../../../module/tno.mjs) | Create/reuse an item macro on hotbar drop |
| `Hooks.on('renderChatMessageHTML')` | [`chat.mjs:16`](../../../module/helpers/chat.mjs) | Rebuild the edge action UI on a roll card from `flags.tno` |
| `Hooks.on('updateActor')` | [`chat.mjs:22`](../../../module/helpers/chat.mjs) | Re-render every visible roll card for an actor whose edge pool changed |

## Settings

Registered in `init` ([`tno.mjs:78-84`](../../../module/tno.mjs)), all
client-scoped and hidden (`config: false` — edited only through the
`heatmapLabMenu` below):

`heatmapLow`, `heatmapMid`, `heatmapHigh`, `heatmapMidValue`,
`heatmapLowCurve`, `heatmapHighCurve`, `heatmapCritical` — see
[heatmap.md](../concepts/heatmap.md).

One world-scoped hidden setting, registered by
`registerMigrationSettings()` in
[`migrations.mjs:15`](../../../module/helpers/migrations.mjs):
`systemMigrationVersion` — see [migrations.md](../concepts/migrations.md).

## Settings menus

| Menu | File:line | Restricted to GM? |
| --- | --- | --- |
| `heatmapLabMenu` → `TnoHeatmapLab` | [`tno.mjs:86`](../../../module/tno.mjs) | No |
| `customSkillsOverviewMenu` → `TnoCustomSkillsOverview` | [`tno.mjs:102`](../../../module/tno.mjs) | Yes (`restricted: true`) |

## Handlebars helpers

Registered at [`tno.mjs:168-174`](../../../module/tno.mjs):
`toLowerCase`, `ifEquals`.

## Sheet registration

`init` unregisters Foundry's core sheets and makes TNO's the default for
both document types ([`tno.mjs:59-68`](../../../module/tno.mjs)):
`Actors.registerSheet('tno', TnoActorSheet, { makeDefault: true })`,
`Items.registerSheet('tno', TnoItemSheet, { makeDefault: true })`.

## Known tripwire: the combat initiative formula

`CONFIG.Combat.initiative` ([`tno.mjs:44-47`](../../../module/tno.mjs)) is
set to `'1d20 + @abilities.dex.mod'`. **No `mod` field is ever computed
anywhere in the live actor** — `system.abilities.<key>` only ever has
`base`, `value`, `xp` (see [data-schema.md](data-schema.md)). This is
leftover from Foundry's stock "Simple System" tutorial template (a
D&D-style ability modifier), never adapted when TNO's own attribute system
was built. `@abilities.dex.mod` currently evaluates to `undefined`/`0` in
any formula that uses it. The system's actual per-character initiative
value is `system.derived.initiative` (see
[data-schema.md](data-schema.md)), which this `CONFIG.Combat.initiative`
formula does not use. Treat this as a live bug, not a documented feature —
do not copy this pattern.

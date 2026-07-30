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

## The combat initiative formula

`CONFIG.Combat.initiative` ([`tno.mjs`](../../../module/tno.mjs)) takes its
formula from `TNO.initiativeFormula`
([`config.mjs`](../../../module/helpers/config.mjs)), currently
`'1d10 + @derived.initiative'` — the rules' "Initiativegrundwert + 1d10".
The character sheet's Initiative lozenge renders the same constant into its
`data-roll` attribute (via `context.config` in
[`actor-character-sheet.hbs`](../../../templates/actor/actor-character-sheet.hbs)),
so rolling from the sheet and rolling from the combat tracker are the same
roll by construction. Change the formula in `config.mjs` only; do not
hard-code it in either place.

`decimals` is `0`: the formula yields integers and ties are resolved by the
tracker's own ordering rather than a fractional tie-break term.

Only `character` actors compute `system.derived`, so
[`TnoActor#getRollData`](../../../module/documents/actor.mjs) defaults
`derived.initiative` to `0`; without it an NPC's initiative roll would fail
on the unresolved term.

Historical note: this used to be Foundry's stock Simple System template
value, `'1d20 + @abilities.dex.mod'`, referencing a `mod` field TNO never
computes (`system.abilities.<key>` only has `base`, `value`, `xp` — see
[data-schema.md](data-schema.md)). That was a live bug; it is now fixed.

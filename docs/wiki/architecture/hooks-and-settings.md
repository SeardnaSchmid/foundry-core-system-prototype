---
type: architecture
title: Hooks, settings, and menus registry
description: Every Foundry hook, game.settings entry, settings menu, and Handlebars helper this system registers.
tags: [hooks, settings, registry, foundry-api]
resource: [module/tno.mjs, module/helpers/chat.mjs, module/helpers/item-transfer.mjs, module/helpers/migrations.mjs, module/helpers/combat-socket.mjs]
related: [architecture/bootstrap, concepts/combat-turn-order]
---

# Hooks, settings, and menus registry

## Hooks

| Hook | File:line | Purpose |
| --- | --- | --- |
| `Hooks.once('init')` | [`tno.mjs:30`](../../../module/tno.mjs) | Bootstrap — see [bootstrap.md](bootstrap.md) |
| `Hooks.once('setup')` | [`tno.mjs:263`](../../../module/tno.mjs) | Default a fresh client's `core.uiConfig` colour scheme to light |
| `Hooks.once('ready')` | [`tno.mjs:285`](../../../module/tno.mjs) | Register `hotbarDrop`, start the combat socket, run migrations |
| `Hooks.on('updateActor')` | [`tno.mjs:204`](../../../module/tno.mjs) | Re-render the combat tracker when a combatant's `system.combat.stance` changes. Nothing in core re-renders it on an actor update, so a row's Haltung would otherwise stay on whatever it was when the row was last drawn — see [combat-turn-order.md](../concepts/combat-turn-order.md) |
| `Hooks.on('renderChatInput')` | [`tno.mjs:214`](../../../module/tno.mjs) | Inject "Basiswürfel" button into the chat controls |
| `Hooks.on('hotbarDrop')` | [`tno.mjs:282`](../../../module/tno.mjs) | Create/reuse an item macro on hotbar drop |
| `Hooks.on('renderChatMessageHTML')` | [`chat.mjs:21`](../../../module/helpers/chat.mjs) | Rebuild the per-viewer UI a card carries in `flags.tno`: the edge actions on a roll card, the take action on a posted item card |
| `Hooks.on('updateActor')` | [`chat.mjs:33`](../../../module/helpers/chat.mjs) | Re-render every visible roll card for an actor whose edge pool changed |

## Settings

Registered in `init` ([`tno.mjs:103-108`](../../../module/tno.mjs)), all
client-scoped and hidden (`config: false` — edited only through the
`heatmapLabMenu` below):

`heatmapLow`, `heatmapMid`, `heatmapHigh`, `heatmapMidValue`,
`heatmapLowCurve`, `heatmapHighCurve` — see
[heatmap.md](../concepts/heatmap.md).

`basicsLayout` — how the character sheet's Basics tab divides each of its two
rows, as one share per column keyed by row. Its default and bounds live with
the sheet (`BASICS_LAYOUT_DEFAULT` in
[`actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs)), which is also the
only thing that writes it: the value is dragged on the sheet itself, never
typed into a form. Client-scoped so a player's layout follows them across every
character sheet they open rather than living on the actor.

One world-scoped setting is visible in Foundry's settings list — the only one
this system shows a player at all:

`combatTrackerOrder` ([`tno.mjs:138`](../../../module/tno.mjs)) —
`ascending` (default) or `descending`, changing which end of the initiative list
the sidebar draws first and re-rendering `ui.combat` on change. **Presentation
only.** The activation rule is slowest-first in either direction, and the setting
never reaches the Combat document; see
[combat-turn-order.md](../concepts/combat-turn-order.md).

### The core colour scheme

The system does not register a theme setting of its own; it only nudges
Foundry's `core.uiConfig`. Every sheet, chat card and dialog here is painted
for a light background, so the `setup` hook writes `colorScheme.applications`
and `colorScheme.interface` to `light` — but only while nothing is stored under
`core.uiConfig` for that client, so a chosen scheme (dark included) is never
overwritten. `core.uiConfig` is registered by core *after* the `init` hook,
hence `setup`.

One world-scoped hidden setting, registered by
`registerMigrationSettings()` in
[`migrations.mjs:15`](../../../module/helpers/migrations.mjs):
`systemMigrationVersion` — see [migrations.md](../concepts/migrations.md).

## Settings menus

| Menu | File:line | Restricted to GM? |
| --- | --- | --- |
| `heatmapLabMenu` → `TnoHeatmapLab` | [`tno.mjs:152`](../../../module/tno.mjs) | No |
| `customSkillsOverviewMenu` → `TnoCustomSkillsOverview` | [`tno.mjs:168`](../../../module/tno.mjs) | Yes (`restricted: true`) |
| `itemOverviewMenu` → `TnoItemOverview` | [`tno.mjs:180`](../../../module/tno.mjs) | Yes (`restricted: true`) |

## Sockets

One, and only one: `system.tno`, registered on `ready` by
`registerCombatSocket()` in
[`combat-socket.mjs`](../../../module/helpers/combat-socket.mjs). It carries a
single message — a player asking the GM's client to pull their own combatant's
activation forward, because a player may not write the Combat document. The
message carries no authority: the sender, their ownership of the combatant's
actor, and the combat's state are all re-derived on receipt, and only
`game.users.activeGM` acts on it. See
[combat-turn-order.md](../concepts/combat-turn-order.md#the-one-socket) for why
this is the one place the system couples two clients.

## Handlebars helpers

Registered at [`tno.mjs:277`](../../../module/tno.mjs): `ifEquals`, and nothing
else. (This page used to list a `toLowerCase` helper as well; it no longer
exists.)

## Sheet registration

`init` unregisters Foundry's core sheets and makes TNO's the default for
both document types ([`tno.mjs:75-93`](../../../module/tno.mjs)):
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

`decimals` is `0`: the formula yields integers and ties are resolved by
`TnoCombat#_sortCombatants` — name, then combatant id — rather than by a
fractional tie-break term. That sort runs **ascending**, so the slowest
combatant activates first; see
[combat-turn-order.md](../concepts/combat-turn-order.md).

Only `character` actors compute `system.derived`, so
[`TnoActor#getRollData`](../../../module/documents/actor.mjs) defaults
`derived.initiative` to `0`; without it an NPC's initiative roll would fail
on the unresolved term.

Historical note: this used to be Foundry's stock Simple System template
value, `'1d20 + @abilities.dex.mod'`, referencing a `mod` field TNO never
computes (`system.abilities.<key>` only has `base` and `xp` — see
[data-schema.md](data-schema.md)). That was a live bug; it is now fixed.

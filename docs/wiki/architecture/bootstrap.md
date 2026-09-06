---
type: architecture
title: Bootstrap lifecycle
description: How module/tno.mjs wires up the system on Foundry's init and ready hooks.
tags: [bootstrap, hooks, init, lifecycle]
resource: module/tno.mjs
related: [architecture/layering, architecture/hooks-and-settings, concepts/combat-turn-order]
---

# Bootstrap lifecycle

[`module/tno.mjs`](../../../module/tno.mjs) is the system's only entry
point — it's the sole file listed under `esmodules` in
[`system.json`](../../../system.json). Every other file in `module/` is
reachable only by import from here (see
[layering.md](layering.md)).

## `init` (line 30)

Runs once, before any world data loads. In order:

1. Exposes `game.tno` with the document classes, roll dialogs, and roll
   functions, for macros and the console.
2. Registers `CONFIG.TNO` (see [data-schema.md](data-schema.md)) and the
   combat initiative formula.
3. Sets `CONFIG.Actor.documentClass` / `CONFIG.Item.documentClass` /
   `CONFIG.Combat.documentClass` to `TnoActor` / `TnoItem` / `TnoCombat`
   (lines 57-64), then `CONFIG.ui.combat` to `TnoCombatTracker` (line 67).
   Both combat entries are one feature: the slowest combatant acts first, and
   the tracker has to say which Haltung each combatant is holding — see
   [combat-turn-order.md](../concepts/combat-turn-order.md).
4. Sets `CONFIG.ActiveEffect.legacyTransferral = false` — see
   [active-effects.md](../concepts/active-effects.md).
5. Unregisters Foundry's core actor/item sheets and registers
   `TnoActorSheet` / `TnoItemSheet` as the default.
6. Preloads Handlebars templates via
   [`helpers/templates.mjs`](../../../module/helpers/templates.mjs).
7. Registers 7 client-scoped heatmap settings (hidden, `config: false`) plus
   the `heatmapLabMenu` settings menu that edits them — see
   [heatmap.md](../concepts/heatmap.md).
   Then the one world-scoped, player-visible setting this system has:
   `combatTrackerOrder` (line 138), which flips the tracker's *display*
   direction and nothing else.
8. Calls `registerMigrationSettings()` — see
   [migrations.md](../concepts/migrations.md).
9. Registers the GM-only `customSkillsOverviewMenu`.
10. Seeds the active heatmap config from the settings just registered.
11. Calls `registerChatListeners()` — see
    [edge-pool.md](../concepts/edge-pool.md).
    Then registers the `updateActor` hook (line 204) that re-renders the combat
    tracker when a combatant's Haltung changes; nothing in core does.
12. Wires the "Basiswürfel" quick-roll button into the chat log via the
    `renderChatInput` hook. The `renderChatLog` fallback for v12–v13 that used
    to sit beside it is gone: `compatibility.minimum` is now `14`, and v14 does
    not fire that hook at all.

Full detail on hooks/settings/menus: see
[hooks-and-settings.md](hooks-and-settings.md).

## `ready` (line 285)

Runs once, after world data is loaded. Registers the `hotbarDrop` hook
(deliberately deferred to `ready` so other modules can register their own
handler first), calls `registerCombatSocket()` (line 291) to start listening
for interrupt requests — see
[combat-turn-order.md](../concepts/combat-turn-order.md#the-one-socket) — and
calls `migrateWorld()` — see [migrations.md](../concepts/migrations.md).

## Hotbar macros

`createItemMacro` / `rollItemMacro` (bottom of the file) implement dragging
an owned item onto the hotbar: it creates (or reuses) a script macro that
calls `game.tno.rollItemMacro(uuid)`, which re-resolves the item and calls
`item.roll()` — see [`module/documents/item.mjs`](../../../module/documents/item.mjs).

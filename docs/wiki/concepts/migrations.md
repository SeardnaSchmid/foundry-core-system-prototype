---
type: concept
title: World data migrations
description: How version-gated migration steps are declared and run, and how to add a new one.
tags: [migrations, versioning]
resource: module/helpers/migrations.mjs
related: [architecture/bootstrap]
---

# World data migrations

[`module/helpers/migrations.mjs`](../../../module/helpers/migrations.mjs)
runs one-time data-shape fixups against existing worlds when the installed
system version has advanced past what a world last recorded.

## Mechanism

- `MIGRATIONS`: an ordered array of `{ version, migrate }`. Each step
  **must be idempotent** — it may run again on a world that already applied
  it, if a later step is added and both end up pending in the same batch.
- `registerMigrationSettings()` registers the hidden, world-scoped
  `systemMigrationVersion` setting (default `'0.0.0'`) — called once from
  `init` (see [hooks-and-settings.md](../architecture/hooks-and-settings.md)).
- `migrateWorld()` — called from `ready` (see
  [bootstrap.md](../architecture/bootstrap.md)). **GM-only**
  (`if (!game.user.isGM) return`), since a world-scoped setting must only
  ever be written by one client and only the GM is guaranteed present. Runs
  every migration step newer than the stored version
  (`foundry.utils.isNewerVersion`), then pins the stored version to
  `game.system.version` regardless of whether anything ran. Safe to call on
  every `ready` — a world with nothing pending does one settings read and,
  if versions already match, no write.

## Current migrations

- **`0.16.0` — `migrateNormalizeCustomSkills`**: for every `character`
  actor's custom skill entries, falls back to `general`/`wil` if the
  stored `category`/`attribute` no longer exists in `CONFIG.TNO`, and
  coerces `value`/`xp` back to numbers. Only writes actors that actually
  need a change; only ever touches `.custom` skill entries, never built-ins.
- **`0.25.0` — `migrateWeightToSlots`**: renames `system.weight` to
  `system.slots` on every `item`, world-wide and on every actor. The field
  always held Inventarslots rather than a mass — the rules never weigh
  anything — so the value carries over untouched. Idempotent: an item with
  no `weight` key is skipped, and where both keys exist the already-migrated
  `slots` wins. See [inventory.md](inventory.md).
- **`0.27.0` — `migrateItemTypesToRoles`**: writes `system.roles` on every
  piece of gear from the type it used to be and drops `formula`. The weapon
  free-text trio (`dice`, `damage`,
  `range`) is **appended to the description** rather than parsed — there is
  no reliable reading of "2W6+3" as an SS count, a die and an RD, and
  guessing wrong would silently mis-state a weapon at the table. Idempotent
  by checking `item._source.system.roles`: the *source*, not the prepared
  data, because `template.json` hands every item a default `roles` object
  and the prepared copy would claim everything had already been done. See
  [item-roles.md](item-roles.md).

## Adding a new step

Append `{ version, migrate }` to the end of `MIGRATIONS`, in ascending
version order. Never edit or remove a step that's already published — a
world that already ran it must not run it again with different logic.

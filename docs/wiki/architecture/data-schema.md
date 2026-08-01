---
type: architecture
title: Data schema
description: How actor/item data is shaped by template.json and computed in prepareDerivedData.
tags: [schema, template-json, derived-data, actor, item]
resource: [template.json, module/documents/actor.mjs, module/documents/item.mjs]
related: [architecture/datamodel-migration, concepts/attributes]
---

# Data schema

TNO uses Foundry's **legacy `template.json`** schema, not the newer
`TypeDataModel` API — see
[datamodel-migration.md](datamodel-migration.md) for why, and what changes
in Foundry v14+.

## `template.json`

- **Actor types:** `character`, `npc`. Both extend the shared `base`
  template (`biography` and `role`, both free text). Only the character sheet
  surfaces `role`, in its banner subtitle. Both are **flavour fields with no
  mechanical role** — the system models no class or profession, and nothing
  reads either one when resolving a roll or computing a derived value.
  - `character.abilities.<key>` — `{ base, value, xp }` for each of the 12
    keys in `CONFIG.TNO.abilities` (see
    [attributes.md](../concepts/attributes.md)).
  - `character.skills.<key>` — `{ value, xp, lastAttribute }` for the
    starter skills only (14 entries); every other built-in skill and any
    custom skill is added lazily when first touched, not pre-seeded here.
    See [skills.md](../concepts/skills.md).
  - `character.problemSolving.spent` — how many edge points have been used
    since the pool last refilled. See
    [edge-pool.md](../concepts/edge-pool.md).
  - `character.equipment.<zone>` — the worn-gear store: `suit`, `head`,
    `torso`, `arms`, `legs`, each holding an owned item id or `null`. See
    [inventory.md](../concepts/inventory.md).
  - `character.hasContainer` — whether the character carries a bag or
    backpack. Without one there is no slot economy at all.
  - `npc.cr` — challenge rating; XP is derived from it (`cr² × 100`).
- **Item types:** `item`, `feature`, `spell`, `armor`, `weapon`. All extend
  `base` (`description`).
  - `item` additionally has `quantity`, `slots`, `formula` (an optional
    roll formula evaluated by `Item#roll()`).
  - `armor` has `quantity`, `slots`, `zone` (which Stelle it is authored
    for, `suit` included), `sv`, `rh`, `rw`, `ra`.
  - `weapon` has `quantity`, `slots`, and `dice`, `damage`, `range` — the
    three columns the Waffen block reserves, all **free-text strings**. The
    weapon rules are not written yet, so nothing here is rolled or computed;
    the type exists so a weapon can be owned, carried and priced in slots
    like the object it is. See [inventory.md](../concepts/inventory.md).

Item types are declared in `template.json`, which Foundry reads **at
startup** — adding a type needs a server restart, not just a reload, or
creating one fails validation with `"<type>" is not a valid type for the
Item Document class`.

## Derived data

`template.json` intentionally does **not** contain computed values.
[`module/documents/actor.mjs`](../../../module/documents/actor.mjs)
computes them in `TnoActor.prepareDerivedData()`, writing to
`system.derived.*`:

| Field | Formula | Notes |
| --- | --- | --- |
| `initiative` | `ceil((2·base(dex) + base(per)) / 3)` | |
| `movementWalk` / `movementSprint` / `movementCrawl` | `base(dex)`, `3·base(dex)`, `1` | |
| `canSprint` | `value(dex) >= base(dex)` **and** the load is under half capacity | the one derived value compared against damaged `value`, not `base` — detects Beweglichkeit damage. Either blocker alone rules sprinting out |
| `carrySlots` / `carrySlotsUsed` | `2·base(str) + base(dex)` / sum of carried `slots × quantity` | worn gear is excluded; `used` is never clamped to capacity — see [inventory.md](../concepts/inventory.md) |
| `carryState` | `ok` \| `noSprint` \| `crawlOnly` \| `noContainer` | the movement consequence of the current load |
| `armor.<zone>` | `{ equipped, rh, rw, ra }` per hit location | RH from the addon alone, RW/RA summed with the Unterkleidung, RA capped at 10 |
| `armorSv` / `armorSvPenalty` | max `sv` of all worn pieces / `armorSv > 0 && base(str) < armorSv` | the Stärkevorraussetzung malus is one penalty from the most demanding piece, never a sum |
| `sixthSense` | `round((base(per) + base(emp) + base(inv)) / 3)` | |
| `insight` | `ceil((base(int) + base(wis)) / 2)` | edge-pool "Idee haben" bonus, see [edge-pool.md](../concepts/edge-pool.md) |
| `trialErrorMax` | `ceil((base(int) + base(wil)) / 2)` | |
| `edgePoolMax` / `edgePool` | `ceil((base(wil) + base(wis)) / 2)`, minus `problemSolving.spent` | refills every `prepareDerivedData()` call — spend tracking is the only persisted state |
| `postMortem` | `2·base(inv)` | |

All derived values are computed from `base`, never damaged `value` (per the
rulebook's "Abgeleitete Werte bleiben gleich, auch mit temporären
Attributen") — `canSprint` is the deliberate exception noted above.

`getRollData()` additionally flattens `system.abilities.*` to the top level
of the roll data object so formulas like `@str.mod + 4` resolve — used by
[`Item#roll()`](../../../module/documents/item.mjs).

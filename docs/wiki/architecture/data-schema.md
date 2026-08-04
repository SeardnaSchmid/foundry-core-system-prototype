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
  - `character.money.<currency>` — non-negative whole-unit balances for
    OR (`templeOr`), `imperialQian`, `orNior`, `orOdur` and `orForseti`. The
    euro comparison value is calculated for display rather than persisted. See
    [inventory.md](../concepts/inventory.md#money).
  - `character.hasContainer` — whether the character carries a bag or
    backpack. Without one there is no slot economy at all.
  - `npc.cr` — challenge rating; XP is derived from it (`cr² × 100`).
- **Item types:** `item`, `feature`, `spell`, `armor`, `weapon`. All extend
  `base` (`description`).
  - `item`, `armor` and `weapon` additionally extend **`gear`**, the shared
    template holding every field a physical object can have — so all three
    are identical in schema. `armor` and `weapon` are legacy: nothing
    creates them any more and nothing reads the type for meaning. What an
    item *is* lives in `system.roles` — one role or none, pickable and
    correctable on the sheet rather than fixed at creation the way a type
    is. They stay registered only because
    a document's type is immutable after creation, and un-registering them
    would stop every such document in a published world from loading. The
    field table and the reasoning are in
    [item-roles.md](../concepts/item-roles.md).
  - `feature` has nothing beyond `base`; `spell` adds `spellLevel`.

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
of the roll data object so formulas like `@str.mod + 4` resolve — for
inline rolls enriched out of item descriptions. `Item#roll()` itself no
longer evaluates anything: the `system.formula` it used to run defaulted to
`d20 + @str.value`, which contradicted the 3d20-roll-under mechanic, and it
is gone.

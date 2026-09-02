---
type: architecture
title: Data schema
description: How actor/item data is shaped by template.json and computed in prepareDerivedData.
tags: [schema, template-json, derived-data, actor, item]
resource: [template.json, module/documents/actor.mjs, module/documents/item.mjs, module/helpers/damage.mjs, module/helpers/conditions.mjs]
related: [architecture/datamodel-migration, concepts/attributes, concepts/damage]
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
  - `character.abilities.<key>` — `{ base, xp }` for each of the 12
    keys in `CONFIG.TNO.abilities` (see
    [attributes.md](../concepts/attributes.md)).
  - `character.skills.<key>` — `{ value, xp, lastAttribute }` for **every**
    built-in skill in `CONFIG.TNO.skills` (98 entries), in the same source
    order. Custom skills are still added lazily when first defined, since only
    the actor knows about those. The block used to declare the 14 starter
    skills alone and let the rest materialise on first write; that worked only
    by way of the sheet's `?? 0` fallbacks and Foundry accepting writes to
    undeclared paths, and it left `lastAttribute` undeclared for the rest.
    Keep it in step with `config.mjs` when a skill is added — and retire a key
    with a migration step, since nothing else can reach an actor's stored
    rank and XP under it.
    See [skills.md](../concepts/skills.md).
  - `character.problemSolving.spent` — how many edge points have been used
    since the pool last refilled. See
    [edge-pool.md](../concepts/edge-pool.md).
  - `character.equipment.<zone>` — the worn-gear store: `suit`, `head`,
    `torso`, `arms`, `legs`, each holding an owned item id or `null`. See
    [inventory.md](../concepts/inventory.md).
  - `character.damage.{sharp,blunt}` — the two raw non-negative damage counters,
    Schaden and Wuchtschaden; the keys predate that naming. Their conversion,
    global malus and incapacitation state are derived; old actors without the
    block read as undamaged. See [damage.md](../concepts/damage.md).
  - `character.conditionOverrides.<key>` — nullable booleans for the six fixed
    damage-condition lights. `null` (and a missing key on an older actor) means
    follow the derived threshold; `true` and `false` force the warning on or
    off without changing damage or its malus. The three derived conditions
    have no entry here and cannot get one: they are arithmetic on the slot
    budget, the summed SV and the Haltung. See
    [damage.md](../concepts/damage.md#damage-derived-conditions).
  - `character.money.<currency>` — non-negative whole-unit balances for
    OR (`templeOr`), `imperialQian`, `orNior`, `orOdur` and `orForseti`. The
    euro comparison value is calculated for display rather than persisted. See
    [inventory.md](../concepts/inventory.md#money).
  - `character.hasContainer` — whether the character carries a bag or
    backpack. Without one only worn gear participates in the slot economy.
  - `character.combat.stance` — the Haltung, announced on activation and held
    until the next one. It alone decides which defence the character may make.
  - `character.combat.defenses.{parry,dodge}` — how many of each have been made
    since that Haltung was taken. Counted apart, and cleared whenever a Haltung
    is taken — including the same one again. See
    [combat-roll-workflows.md](../concepts/combat-roll-workflows.md).
    Written by the defender's own click, cleared once a defence has used it, and
    never a precondition: the field it fills is typed by hand otherwise.
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
| `movementWalk` / `movementSprint` / `movementCrawl` | `base(dex)`, `3·base(dex)`, `ceil(base(dex) / 3)` | the crawl is *aufgerundet* like `initiative` and `insight`, not rounded to nearest like `sixthSense` — rounding down would leave a low Beweglichkeit with no crawl at all |
| `canSprint` | the load is under half capacity | the inventory state alone rules sprinting out |
| `carrySlots` / `carrySlotsUsed` | `2·base(str) + base(dex)` / `carryWorn + carryCarried` | worn gear always counts; carried gear counts only with a container; `used` is never clamped — see [inventory.md](../concepts/inventory.md) |
| `carryWorn` / `carryCarried` | sum of each slot band | the carried subtotal is 0 without a container |
| `carryState` / `carryNoContainer` | `ok` \| `noSprint` \| `crawlOnly` / boolean | movement consequence and missing-container fact are independent |
| `damage` | `resolveDamage(system.damage, base(str))` | raw pools, blunt split/conversion, total, `−1` per-point malus, and strict `effectiveSharp > capacity` incapacitation — see [damage.md](../concepts/damage.md) |
| `conditions` | `resolveConditions(derived.damage, abilities, conditionOverrides, {carry, armor, defense})` | fixed Wucht/Schaden × core/legs/arms warnings, their negative classification, manual override state, raster rows and active chip order, plus the three derived conditions (load, armour weight, a Haltung without Ausweichen) — which join `items`/`active` but not the raster `rows` and take no override — see [damage.md](../concepts/damage.md#the-condition-collection) |
| `armor.<zone>` | `{ equipped, rh, rw, ra }` per hit location | RH and RA from the addon alone — a suit is RH 0 with no hit location to cover — while RW is summed with the Unterkleidung |
| `armorSv` / `armorSvPenalty` | sum of `sv` over all worn pieces, snapped to `ARMOR_SV_STEP` (0.25) / `armorSv > 0 && base(str) < armorSv` | the requirements of all worn clothing and armour add up; falling short is a single Malusstufe however far short, and Stärke being whole means a quarter-step total is only met at the next whole value |
| `sixthSense` | `round((base(per) + base(emp) + base(inv)) / 3)` | |
| `insight` | `ceil((base(int) + base(wis)) / 2)` | edge-pool "Idee haben" bonus, see [edge-pool.md](../concepts/edge-pool.md) |
| `trialErrorMax` | `ceil((base(int) + base(wil)) / 2)` | |
| `edgePoolMax` / `edgePool` | `ceil((base(wil) + base(wis)) / 2)`, minus `problemSolving.spent` | refills every `prepareDerivedData()` call — spend tracking is the only persisted state |
| `postMortem` | `2·base(inv)` | |
| `stance` | `combat.stance`, or `open` when unset or unknown | falls back to the Haltung that permits nothing, never to one that permits everything |
| `defenses.<kind>.available` | whether `CONFIG.TNO.stances[stance].defenses` lists it | the value that lets the defence side of an exchange answer itself |
| `defenses.<kind>.malus` | `0` for the first and while `used <= rank`, else `−3 × used` | a Malusstufe per repeat, summing up. The rank *skips* that many repeats rather than shifting the ladder, which is the one reading matching the rulebook's own three-parry examples (rank 1 gives full / full / −6). The skill is Defensiver Kampf, Deckung nutzen or Haken schlagen, decided by the Haltung — see [combat-roll-workflows.md](../concepts/combat-roll-workflows.md) |

All attribute-backed derived values and rolls use the sole persisted `base`
rating. Temporary attribute values are not part of the schema; short-lived
conditions belong in their own domain state rather than a second rating axis.

`getRollData()` additionally flattens `system.abilities.*` to the top level
of the roll data object so formulas like `@str.mod + 4` resolve — for
inline rolls enriched out of item descriptions. `Item#roll()` itself no
longer evaluates anything: the `system.formula` it used to run defaulted to
`d20 + @str.value`, which contradicted the 3d20-roll-under mechanic, and it
is gone.

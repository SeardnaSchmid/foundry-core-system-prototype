---
type: concept
title: Inventory (carrying and wearing)
description: The two independent equipment axes — the Trageslots budget for carried gear, and the armour paper doll for worn gear.
tags: [inventory, armor, slots, equipment, derived-data]
resource: [module/helpers/inventory.mjs, module/documents/actor.mjs, module/sheets/actor-sheet.mjs]
spec: docs/design/character-sheet-prd.md
related: [concepts/attributes, reference/ui-surfaces, architecture/data-schema]
---

# Inventory (carrying and wearing)

The rules model **two axes that must not be conflated**:

- **Carrying** — a slot economy that only exists while the character has a
  bag or backpack.
- **Wearing** — one Unterkleidung (the spacesuit base layer) plus four zone
  addons, contributing RH/RW/RA and a Stärke requirement.

Worn clothing and armour are exempt from the slot economy entirely ("Von
den Inventarregeln ausgenommen sind Kleidung und Rüstung welche der
Charakter am Leib trägt"), which is why the same item can be invisible to
one axis and decisive on the other.

## Where each axis is stored

The two axes persist in **different places, for a reason**:

| State | Stored as | Why there |
| --- | --- | --- |
| Worn | `actor.system.equipment` — zone key -> item id | The *zone* is what makes it unique. Only an actor-side map can stop two chest pieces from both claiming `torso` |
| Carried | `item.system.carried` — boolean | Travels with the item when it moves between actors, and needs no per-actor bookkeeping |

Between them they give three states, not two: **worn**, **carried**, and
**stowed** — owned but not on the character (in a locker, back on the ship),
costing no slots while still appearing on their list. Stowed gear is the state
the sheet previously could not express at all: every item an actor owned
pressed on the budget forever.

`carried` is read as "not explicitly `false`", so items authored before the
flag existed keep costing exactly what they did and **no migration step is
needed** — see [migrations.md](migrations.md) for when one would be.

## Where the maths lives

[`module/helpers/inventory.mjs`](../../../module/helpers/inventory.mjs) is
deliberately free of Foundry globals — everything takes plain objects
shaped like `item.system` and returns plain objects, so it is unit-tested
without a game world (`tests/helpers/inventory.test.js`).

| Export | Responsibility |
| --- | --- |
| `ARMOR_ADDON_ZONES` | The four hit locations (`head`, `torso`, `arms`, `legs`). `suit` is deliberately absent — it is not a hit location, it applies in all four at once |
| `CARRY_THRESHOLDS` | The fractions of capacity at which movement degrades |
| `wornItemIds(equipment)` | The id set currently on the body, used to exclude worn gear from the carry sum |
| `isStowed(item)` | Whether an item is off the character entirely — `system.carried === false` |
| `itemSlotCost(item)` | `slots × quantity` for one stack, floored at 1 slot per piece for armour |
| `computeCarry(items, equipment, hasContainer, capacity)` | `{ used, capacity, state }` |
| `buildSlotGrid(items, equipment, capacity)` | `{ blocks, overflow, trinkets, empty }` — the view layout |
| `resolveArmor(equipment, items)` | `{ zones, sv }` — effective per-zone values |

[`TnoActor.prepareDerivedData()`](../../../module/documents/actor.mjs)
calls `computeCarry` and `resolveArmor` and writes `carrySlots`,
`carrySlotsUsed`, `carryState`, `armor`, `armorSv` and `armorSvPenalty`
into `system.derived` — see
[data-schema.md](../architecture/data-schema.md).

## Carrying

`carrySlots = 2·base(str) + base(dex)`. Each stack costs `slots ×
quantity`, where `slots` runs 0–4 (0 = Geld/Papiere/Krimskrams, 4 =
rucksackgroß; the per-value hints are `TNO.Inventory.SlotHint.*`).

**Armour is floored at one slot per piece** (`MIN_ARMOR_SLOTS`). Off the body,
a piece is either carried and visibly taking up room or not there at all —
there is no third way for a breastplate to be free, and the zero-slot tier is
explicitly Krimskrams, which armour is not. The floor sits in `itemSlotCost`
rather than only in the schema default so armour authored at 0 under the old
default still costs its slot instead of slipping into the trinket chips.

Two consequences are worth knowing before changing anything here:

- **Without a container there is no slot economy at all.** `hasContainer`
  false reports `used: 0` and the state `noContainer`, which the sheet
  renders as its own badge — the character carries what fits in their
  hands, which the rules describe qualitatively rather than as a number.
- **`used` is never clamped to `capacity`.** Going over is legal and simply
  degrades movement, so the UI shows 12/10 rather than refusing the item.

Load states come from `CARRY_THRESHOLDS`: at half capacity or more,
`noSprint`; once the budget is full, `crawlOnly`. `derived.canSprint`
therefore has two independent blockers — a damaged Beweglichkeit *or* a
load at/over half.

> **Open rules question:** the half-capacity rule is the one bit still in
> question — Ojster said he removed the "halbieren" clause as confusing,
> but the published Inventarregeln page still lists it. It lives as a lone
> constant so dropping it is a one-line change.

## Wearing

`system.equipment` maps a zone key to an item id (`suit`, `head`, `torso`,
`arms`, `legs`). `resolveArmor` layers the Unterkleidung under each zone:

- **RH comes from the addon alone.** Per Ojster, the Unterkleidung never
  contributes Rüstungshärte, so a bare zone under a suit is still RH 0 —
  the suit closes coverage, it does not harden the zone.
- **RW and RA are summed**, RA clamped to the 1–10 band the Rüstungen table
  documents. (Summing RA is an inference — the "alle Werte addiert" answer
  was given about RW — so the clamp keeps an unconfirmed reading from
  producing out-of-band coverage.)
- **SV is the maximum, not the sum.** The Stärkevorraussetzung malus is a
  single penalty on all Beweglichkeit rolls, so what matters is the most
  demanding piece worn. Falling short sets `armorSvPenalty`.

`resolveArmor` returns only plain numbers, never the Item documents: the
result lands in `system.derived`, and embedding live documents there would
make derived data circular. Callers that need the item look it up from
`equipment` themselves — which is exactly what `_prepareEquipment()` in the
actor sheet does.

## The two views

Both are **derived on every render, never stored** — see
[ui-surfaces.md](../reference/ui-surfaces.md) for the templates and
[character-sheet-prd.md](../../design/character-sheet-prd.md#inventory-tab)
for the UX spec.

The slot grid packs blocks in the items' existing `sort` order, so
reordering is purely a view concern and a player's arrangement never needs
persisting.

**The grid holds exactly as many cells as the character has slots.** There is
no padding out to the raster width — a capacity of 6 in a five-wide grid simply
leaves a short second row. Gear that does not fit is split off into `overflow`
and rendered on past the budget in the warning colour, so the run of normal
cells *is* the capacity and the colour break marks where it ended.

A block only stays inside the budget if it fits there **whole**: an item
straddling the boundary has overflowed, because a slot the character does not
have cannot hold half of it. Once one item overflows every later item follows
it out, even where a gap remains — otherwise a small item would jump ahead of
a large one it was sorted behind and the grid would silently reorder the
player's list.

The paper doll's silhouette has three per-zone paint states
(`bare` / `suited` / `filled`), decided in the sheet rather than branched
four times in the template.

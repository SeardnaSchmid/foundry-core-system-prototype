---
type: concept
title: Inventory (carrying and wearing)
description: Carrying, wearing, and the character wallet on the Basics sheet.
tags: [inventory, armor, slots, equipment, money, currency, derived-data]
resource: [module/helpers/inventory.mjs, module/helpers/money.mjs, module/documents/actor.mjs, module/sheets/actor-sheet.mjs]
spec: docs/design/character-sheet-prd.md
related: [concepts/attributes, concepts/item-roles, reference/ui-surfaces, architecture/data-schema]
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

## Where the state is stored

Worn armour lives in `actor.system.equipment` as zone key → item id. Every
other owned physical item is carried and participates in the slot budget; the
rules define no persisted “stowed” state. Removing an item from the character
therefore means deleting or transferring the embedded item.

Money is separate actor state under `actor.system.money`: one whole-unit
balance per supported currency. It is not represented by zero-slot Items, so
the wallet and Kleinkram cannot show the same balance twice.

## Where the maths lives

[`module/helpers/inventory.mjs`](../../../module/helpers/inventory.mjs) is
deliberately free of Foundry globals — everything takes plain objects
shaped like `item.system` and returns plain objects, so it is unit-tested
without a game world (`tests/helpers/inventory.test.js`).

| Export | Responsibility |
| --- | --- |
| `ARMOR_ADDON_ZONES` | The four hit locations (`head`, `torso`, `arms`, `legs`). `suit` is deliberately absent — it is not a hit location, it applies in all four at once |
| `CARRIED_ITEM_TYPES` | The types the slot economy applies to — an alias of `GEAR_TYPES`. `feature` and `spell` are not objects and never appear in the grid or the sum. Which *roles* a piece has took over from its type everywhere else, but not here: the budget applies to anything that is an object at all — see [item-roles.md](item-roles.md) |
| `CARRY_THRESHOLDS` | The fractions of capacity at which movement degrades |
| `ARMOR_SV_STEP` | The quarter step the Rüstungen table writes SV increments in, and the granularity the summed SV is snapped to |
| `wornItemIds(equipment)` | The id set currently on the body, used to exclude worn gear from the carry sum |
| `itemSlotCost(item)` | `slots × quantity` for one stack, floored at 1 slot per piece for anything carrying the armour role |
| `computeCarry(items, equipment, hasContainer, capacity)` | `{ used, capacity, state }` |
| `buildSlotGrid(items, equipment, capacity)` | `{ blocks, overflow, trinkets, empty }` — the view layout |
| `resolveArmor(equipment, items)` | `{ zones, sv }` — effective per-zone values |

[`TnoActor.prepareDerivedData()`](../../../module/documents/actor.mjs)
calls `computeCarry` and `resolveArmor` and writes `carrySlots`,
`carrySlotsUsed`, `carryState`, `armor`, `armorSv` and `armorSvPenalty`
into `system.derived` — see
[data-schema.md](../architecture/data-schema.md).

[`module/helpers/money.mjs`](../../../module/helpers/money.mjs) is the matching
pure helper for the wallet. `MONEY_CURRENCIES` defines display order, integer
euro-cent rates; `prepareWallet()` normalises the five balances, builds the
visible non-zero rows and computes the total.

## Money

The Basics sheet places a compact Geldbörse at the bottom of the Kleinkram
column. The column stretches to the top row's height and an automatic flex gap
holds the wallet against its bottom edge; a growing Kleinkram list instead
extends the complete row and pushes the wallet down naturally. Its thin rows
are summaries rather than balances: both express the complete combined wallet
value, once in OR and once in Imperial Qian, regardless of the actual currency
mix. The euro total stays secondary in the header. Owners can open a body-level
native popover with all five actual balances. Every row states its money form
and exchange rate; typing updates every euro conversion and the secondary
total immediately, while saving writes all balances in one actor update. That
editor carries both
`item-popover` and `money-popover`: the former supplies the established popup
frame/components, while the latter only specializes the currency form grid.
Read-only sheets render no edit affordance.

Conversions stay in integer cents: OR = 100, Imperialer Qian = 1, Or Nior =
50, Or Odur = 20 and Or Forseti = 10 cents per native unit. Odur and Forseti
are approximate; a non-zero balance in either prefixes its conversion and the
combined total with `≈`.

## Carrying

`carrySlots = 2·base(str) + base(dex)`. Each stack costs `slots ×
quantity`, where `slots` runs 0–4 (0 = Geld/Papiere/Krimskrams, 4 =
rucksackgroß; the per-value hints are `TNO.Inventory.SlotHint.*`).

New gear is authored at **1 slot**, not 0: an ordinary object takes up room,
and the zero-slot tier is the narrow exception for loose change and paperwork.
Defaulting to 0 meant every item a GM created was free until someone
remembered to type a number, which quietly emptied the budget.

**Armour is floored at one slot per piece** (`MIN_ARMOR_SLOTS`). Off the body,
a piece is either carried and visibly taking up room or not there at all —
there is no third way for a breastplate to be free, and the zero-slot tier is
explicitly Krimskrams, which armour is not. The floor sits in `itemSlotCost`
rather than only in the schema default so armour authored at 0 under the old
default still costs its slot instead of slipping into the zero-slot band.

Two consequences are worth knowing before changing anything here:

- **Without a container there is no slot economy at all.** `hasContainer`
  false reports `used: 0` and the state `noContainer`, which the sheet
  renders as its own badge — the character carries what fits in their
  hands, which the rules describe qualitatively rather than as a number.
- **`used` is never clamped to `capacity`.** Going over is legal and simply
  degrades movement, so the UI shows 12/10 rather than refusing the item.

**A weapon is gear like any other here.** The Richtwert table prices weapons by
size alongside everything else, so a carried weapon costs its slots. Whether one
is *readied* is a separate question the rules have not answered yet, and it is
deliberately not modelled by exempting weapons from the budget.

The Basics tab used to reserve an empty Waffen block for the answer. It no
longer does: a block that lists nothing is a promise, not a layout, and holding
a column open for two years taught a reader only that weapons were missing.
Readiness will need its own view when it exists, and what shape that view takes
is not decided by leaving a gap for it now.

Load states come from `CARRY_THRESHOLDS`: at half capacity or more,
`noSprint`; once the budget is full, `crawlOnly`. `derived.canSprint`
therefore has two independent blockers — a damaged Beweglichkeit *or* a
load at/over half.

**Where the load state is shown is the banner, not the bag.** The movement chip
strikes through the tier the load takes away (sprint for `noSprint`, walk as
well for `crawlOnly`), because the question a player is asking is "how far can I
move" and the answer belongs on the figure that changes. The carry grid's header
keeps only `noContainer`, which is not a movement state but the reason the whole
budget reads 0.

> **Open rules question:** the half-capacity rule is the one bit still in
> question — Ojster said he removed the "halbieren" clause as confusing,
> but the published Inventarregeln page still lists it. It lives as a lone
> constant so dropping it is a one-line change.

## Wearing

`system.equipment` maps a zone key to an item id (`suit`, `head`, `torso`,
`arms`, `legs`). `resolveArmor` layers the Unterkleidung under each zone:

- **RH and RA come from the addon alone.** The Rüstungstabelle writes every
  Unterkleidung row as RH 0 and RA `–`: the base layer is padding without a hit
  location, and Rüstungsabdeckung is what the "Rüstung umgehen" manoeuvre pays
  to bypass one location. A bare zone under a suit is therefore RH 0 and RA 0.
- **RW is summed** with the Unterkleidung, per Ojster's "alle Werte addiert"
  ruling. The table's own combined rows (Handschuhe + Ellenbogenschoner) add SV
  and RA but leave RH and RW at the single piece's value, which reads the other
  way; the ruling was confirmed against that and governs.
- **SV is the sum of every worn piece**, suit included:
  "Stärkevorraussetzungen aller Kleidung und Rüstung wird aufaddiert um die
  finale SV zu erhalten". The Rüstungen table writes Unterkleidung rows as
  whole values and every addon as an increment (+0,25 / +0,5 / +1 / +1,5), and
  its own "kombiniert" rows pre-add them, so the total runs in quarter steps
  (`ARMOR_SV_STEP`) and is snapped onto that step. Falling short sets
  `armorSvPenalty` — **one** Malusstufe on all Beweglichkeitswürfe however far
  short, which is what makes a single body-wide total the right shape. Stärke
  is a whole number, so a total of 2.25 is met only at Stärke 3.

  The **weapon** SV rule is a different one and must not be folded in here: it
  is per weapon and graded ("eine Malusstufe für jeden Angriff und eine weitere
  für je 2 weitere Punkte darunter"). It lives with the weapon requirements in
  `weaponRequirementStatus`
  ([`module/helpers/items.mjs`](../../../module/helpers/items.mjs)), which
  currently resolves it as one flat −3 modifier shared with FV rather than the
  graded ladder. The armour total therefore stays whole-body and single-step,
  and the weapon field on the gear sheet stays in whole steps.

  Because a piece's SV is only an addend, the item card shows an armour piece's
  SV without a met/short note: comparing one glove's +0,25 against Strength
  would report "met" while the body's total is out of reach. The comparison
  belongs on the paper doll, against `derived.armorSv`.

`resolveArmor` returns only plain numbers, never the Item documents: the
result lands in `system.derived`, and embedding live documents there would
make derived data circular. Callers that need the item look it up from
`equipment` themselves — which is exactly what `_prepareEquipment()` in the
actor sheet does.

Armour is put on by dragging it onto its zone and taken off by dragging the row
back into the carry grid, or with the row's `x` — see
[Moving things between the two views](#moving-things-between-the-two-views).

## The two views

Both are **derived on every render, never stored** — see
[ui-surfaces.md](../reference/ui-surfaces.md) for the templates and
[character-sheet-prd.md](../../design/character-sheet-prd.md#inventory-tab)
for the UX spec.

The slot grid packs blocks in the items' existing `sort` order, so
reordering is purely a view concern and a player's arrangement never needs
persisting.

**Three columns, not two, and they sit in different rows.** The paper doll is in
the Basics tab's top row and the carry raster in its bottom one, because the
raster is a long list and belongs beside the other long list on the sheet. The
wallet and zero-slot items share the third: `buildSlotGrid` splits those items
off as `trinkets`, and they render as Kleinkram above the wallet
(`parts/actor-money-wallet.hbs` and `parts/actor-trinkets.hbs`) rather than as
a pocket inside the armour card, where reading them off the doll implied they
were worn.

**The Kleinkram column has no create control and no drop target.** Nothing there
is a state a piece can be put *into*: an item is Kleinkram exactly when its
`slots` is 0, which is authored on the item's own sheet. A drop that moved a
piece into the column would have to rewrite that number, which is a change to
what the thing *is*, made by a gesture that looks like tidying.

### Moving things between the two views

Both views are drag surfaces, and between them **drag is the only way gear
changes state**:

- **Cell onto cell** re-sorts the list. Core's `ActorSheetV2#_onSortItem` does
  the whole job — it sorts a dropped item against whichever `[data-item-id]`
  element it landed on — so the grid and zero-slot band are re-orderable
  without a sort handler of this system's own. What the cells need from us is
  the `draggable` **class**: that is the selector core's
  `DragDrop` binds, and without it a cell drags as an empty ghost.
- **Cell onto a free cell** sorts the item past everything else
  (`_sortItemToEnd`) — dropping into the tail of the grid has no neighbour to
  sort against, and "after the last one" is the only reading that leaves the
  rest of the arrangement alone.
- **Cell onto a paper doll zone** wears the piece. A zone only takes armour
  authored for that Stelle; a mismatch says which Stellen the piece does belong
  to rather than failing silently. A piece has one authored `system.zone`, so
  putting it on fills that target and taking it off empties it. While
  a piece is in flight its zone lights up — the row as
  `armor-drop-target` and the silhouette's shapes as `zone-drop-target`, both
  set in `_onDragStart` — so the targets are visible before the player lets go,
  and the shape under the pointer goes solid (`drop-onto`).
- **A worn row back onto the carry grid** takes the piece off: the mirror of the
  gesture that put it on, so the way back is not a different kind of act. The
  unequip lands before any sort, since a worn piece is not in the carry list to
  sort against; dropped on the free tail it also sorts to the end, dropped
  anywhere else in the grid it simply rejoins the list where it already sat.
  While a worn piece is in flight the whole grid block lights up
  (`carry-drop-target`) rather than a cell — coming off the body is not a drop
  at a position.

**An empty zone is a drop target and nothing else.** Clicking one used to offer
to author a piece on the spot, which conjured armour out of an empty doll —
wearing something is a state change on gear already in hand.

Clicking a cell, a trinket or a worn row opens that item's own sheet — the doll
row is the only place a worn piece appears, so without it equipping something
would make it uneditable. The row hands the click over when it landed on the
`x`, so taking a piece off does not also open the sheet behind it. With the doll
gone drag-only, clicking is the only path left to a carried item's data from
this view, so the cells are promoted into the keyboard tab order along with the
sheet's other custom chips (`_makeKeyboardAccessible`).

New gear is authored through one dialog (`_promptCreateItem`, opened by the
`+` in the grid header), and it asks only for a name. The Inventar tab is
currently a WIP placeholder rather than a second administrative table.
Everything is created as type `item`, and what the thing *does* is roles it
takes on afterwards, on its own sheet — see [item-roles.md](item-roles.md).

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

The paper doll's silhouette renders each zone as two possible layers. The
full-size base uses the sheet-derived `baseState` (`bare` / `suited`), and a
worn addon adds a smaller green plate above it. The exposed base rim therefore
continues to show whether Unterkleidung is present even when that zone also has
armour on top.

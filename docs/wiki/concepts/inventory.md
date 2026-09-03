---
type: concept
title: Inventory (carrying and wearing)
description: Carrying, wearing, and the character wallet on the Basics sheet.
tags: [inventory, armor, slots, equipment, money, currency, derived-data]
resource: [module/helpers/inventory.mjs, module/helpers/item-table.mjs, module/helpers/money.mjs, module/documents/actor.mjs, module/sheets/actor-sheet.mjs]
spec: docs/design/character-sheet-prd.md
related: [concepts/attributes, concepts/item-roles, reference/ui-surfaces, architecture/data-schema]
---

# Inventory (carrying and wearing)

The rules model **two related axes that must not be conflated**:

- **Slot load** — worn and carried gear share one budget. A bag or backpack
  decides whether the carried half participates; worn gear always does.
- **Wearing** — one Unterkleidung (the spacesuit base layer) plus four zone
  addons, contributing RH/RW/RA and a Stärke requirement.

## Where the state is stored

Worn armour lives in `actor.system.equipment` as zone key → item id. That map
decides the item's band in the shared budget as well as the paper-doll layer;
it no longer exempts the item from slots. Every other owned physical item is
carried, and the rules define no persisted “stowed” state. Removing an item
from the character therefore means deleting or transferring the embedded item.

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
| `wornItemIds(equipment)` | The id set currently on the body, used to partition the worn and carried slot bands |
| `itemSlotCost(item)` | `slots × quantity` for one stack, floored at 1 slot per piece for anything carrying the armour role |
| `computeCarry(items, equipment, hasContainer, capacity)` | `{ used, worn, carried, capacity, state, noContainer }` |
| `buildSlotGrid(items, equipment, capacity, hasContainer)` | `{ blocks, overflow, trinkets, empty }` — worn first, then carried; every entry carries `worn` |
| `resolveArmor(equipment, items)` | `{ zones, sv }` — effective per-zone values |

[`TnoActor.prepareDerivedData()`](../../../module/documents/actor.mjs)
calls `computeCarry` and `resolveArmor` and writes `carrySlots`,
`carrySlotsUsed`, `carryWorn`, `carryCarried`, `carryState`,
`carryNoContainer`, `armor`, `armorSv` and `armorSvPenalty`
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

**Armour is floored at one slot per piece** (`MIN_ARMOR_SLOTS`) whether worn or
carried. Armour is never weightless, and the zero-slot tier is explicitly
Krimskrams. The floor sits in `itemSlotCost` rather than only in the schema
default so armour authored at 0 under the old default still costs its slot
instead of slipping into the zero-slot band.

Two consequences are worth knowing before changing anything here:

- **Without a container only the worn band participates.** `hasContainer`
  false reports `carried: 0`, keeps the worn subtotal in `used`, and sets
  `noContainer: true` beside the ordinary movement state. The badge and the
  load consequence can therefore appear at the same time.
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
is false exactly when the load reaches the `noSprint` or `crawlOnly` state.

**Where the load state is shown is on the tier it takes away.**
[`actor-movement.hbs`](../../../templates/actor/parts/actor-movement.hbs)
strikes through that tier (sprint for `noSprint`, walk as well for
`crawlOnly`), because the question a player is asking is "how far can I move"
and the answer belongs on the figure that changes. That line closes the worn-gear
column, under the summed Stärkevoraussetzung and the `armor-warning` that the
same load produces — cause and consequence in one column. `.cell-gear` takes
`align-self: stretch` so the column fills the row's height, and the line's own
`margin-top: auto` then collects the slack and settles it on the bottom edge —
the same pairing the wallet uses under Kleinkram in `.cell-loose`. The tiers
left the banner with the other derived values, and the strike-through went with
them. The slot grid's header keeps only
`noContainer`, which is not a movement state but explains why the carried band
is outside the calculation.

The same state is **also** a condition. `resolveCarryCondition()` in
[`conditions.mjs`](../../../module/helpers/conditions.mjs) turns `carryState`
into the single `overloaded` entry of the Zustände collection — mild and named
*Schwer beladen* at `noSprint`, severe and named *Überlastet* at `crawlOnly` —
so the collection can be the one place every active condition is listed, and so
the *loss* stays visible in the banner even though the tiers themselves no
longer are. That is a read-out of the same number, not a second rule: the
movement line stays the surface that answers how far the character moves, and
the condition entry only names the tier it costs. See
[damage.md](damage.md#the-condition-collection), which holds the same
arrangement for the armour and Haltung conditions.

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

  Because it is a sum, RW is the one number on the doll that does not match what
  the worn item's own sheet says, so each zone also carries `rwSuit` and
  `rwAddon` — the two summands. The doll marks a zone where both are non-zero
  with a superscript `+` (`.armor-value-stacked`) and puts the breakdown in the
  value's tooltip; a zone the suit contributes nothing to is left unmarked, so
  the mark means "differs from the item" and nothing else.
- **SV is the sum of every worn piece**, suit included:
  "Stärkevorraussetzungen aller Kleidung und Rüstung wird aufaddiert um die
  finale SV zu erhalten". The Rüstungen table writes Unterkleidung rows as
  whole values and every addon as an increment (+0,25 / +0,5 / +1 / +1,5), and
  its own "kombiniert" rows pre-add them, so the total runs in quarter steps
  (`ARMOR_SV_STEP`) and is snapped onto that step. Falling short sets
  `armorSvPenalty` — **one** Malusstufe on all Beweglichkeitswürfe however far
  short, which is what makes a single body-wide total the right shape. Stärke
  is a whole number, so a total of 2.25 is met only at Stärke 3. The same flag
  raises the `armorTooHeavy` condition in the Zustände collection
  ([damage.md](damage.md#the-condition-collection)); the doll keeps the warning
  line, because that is where the shortfall is read while dressing.

  The doll closes its rows with that total (`.armor-total`), in the SV column
  the rows above it fill and pushed onto the block's bottom edge by the spare
  height the silhouette leaves. It shows whenever anything is worn, because the
  sum is a fact about the load rather than a verdict on it; falling short only
  recolours the figure and keeps the warning line under it, which is where the
  shortfall is still said in words.

  The **weapon** SV rule is a different one and must not be folded in here: it
  is per weapon and graded ("eine Malusstufe für jeden Angriff und eine weitere
  für je 2 weitere Punkte darunter"), and it lands on attacks and parries rather
  than on Beweglichkeit. It lives with the weapon requirements in
  `weaponRequirementStatus` / `requirementMalusSteps`
  ([`module/helpers/items.mjs`](../../../module/helpers/items.mjs)). The armour
  total therefore stays whole-body and single-step, and the weapon field on the
  gear sheet stays in whole steps.

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
back into the slot grid, or with the row's `x` — see
[Moving things between the two views](#moving-things-between-the-two-views).

## The two views

Both are **derived on every render, never stored** — see
[ui-surfaces.md](../reference/ui-surfaces.md) for the templates and
[character-sheet-prd.md](../../design/character-sheet-prd.md#inventory-tab)
for the UX spec.

The slot grid packs the worn band first, sorted within that band by the items'
existing `sort`, then the carried band in its own `sort` order. Reordering is
purely a view concern and a player's arrangement never needs extra persisted
state.

**Three columns, not two, and they sit in different rows.** The paper doll is in
the Basics tab's top row and the slot raster in its bottom one, because the
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
- **A worn row back onto the slot grid** takes the piece off: the mirror of the
  gesture that put it on, so the way back is not a different kind of act. The
  unequip lands before any sort; dropped on the free tail it also sorts to the
  end, dropped anywhere else it keeps its existing document order.
  While a worn piece is in flight the whole grid block lights up
  (`carry-drop-target`) rather than a cell — coming off the body is not a drop
  at a position.

**An empty zone is a drop target and nothing else.** Clicking one used to offer
to author a piece on the spot, which conjured armour out of an empty doll —
wearing something is a state change on gear already in hand.

Clicking a cell, a trinket or a worn row opens that item's own sheet. A worn
piece deliberately appears both on the paper doll (its armour state) and in the
first slot band (its budget cost). The row hands the click over when it landed
on the `x`, so taking a piece off does not also open the sheet behind it. Cells
are promoted into the keyboard tab order along with the sheet's other custom
chips (`_makeKeyboardAccessible`).

New gear is authored through one dialog (`_promptCreateItem`, opened by the
`+` in the grid header or by the same control on the Inventar tab): a name, and
a card for what the thing is. Everything is created as type `item` whatever card
is picked — the cards set `system.roles`, which the item's own sheet can change
again — see [item-roles.md](item-roles.md).

**The grid holds exactly as many cells as the character has slots.** There is
no padding out to the raster width — a capacity of 6 in a five-wide grid simply
leaves a short second row. Gear that does not fit is split off into `overflow`
and rendered on past the budget in the warning colour, so the run of normal
cells *is* the capacity and the colour break marks where it ended.

A block may straddle the boundary: the cells that still fit remain in the
normal run and the rest turn into overload. Once a block straddles, every later
item follows it into overflow — otherwise a small item would jump ahead of a
large one it was sorted behind and silently reorder the player's list.

**A multi-slot item is a run of adjacent cells welded by CSS, not one spanning
element**, so a run may be broken by the raster's right edge and continue on the
next row. Where that break falls is a measurement, not data: the raster
auto-fills its columns, so the wrap moves with every drag of the Basics
splitter. `TnoActorSheet##markSlotWraps` compares the cells' offsets after each
render and marks the pair either side of a break (`slot-continues` /
`slot-resumes`), which `_inventory.scss` paints as matching hatched bands. A
`ResizeObserver` on `.slot-grid` re-measures on every width change.

The paper doll's silhouette renders each zone as two possible layers. The
full-size base uses the sheet-derived `baseState` (`bare` / `suited`), and a
worn addon adds a smaller green plate above it. The exposed base rim therefore
continues to show whether Unterkleidung is present even when that zone also has
armour on top. The silhouette column closes with the character's compact Dodge
action; the icon and value sit directly beneath the figure because Dodge belongs
to no hit location. That column carries `min-height: 0`: the silhouette is sized
`height: 100%`, and as a stretched grid item it otherwise feeds its resolved
height back into the row that sized it, leaving the grid row taller than the
block containing it and both columns spilling past the doll's bottom edge. When the current Haltung makes Dodge unavailable,
`paperdoll-dodge.is-unavailable` uses the shared warning-red fill and a strike
across the action; read-only disabling alone keeps its neutral treatment. The
silhouette and the resistance icon in each zone row remain the location-specific
Resistance entry points.

## The ledger

The paper doll shows only worn state; the slot raster shows the complete numeric
load, including its worn band. The Inventar tab is the ledger behind them:
every object the character owns appears there **exactly once**, whatever state
it is in.

[`module/helpers/item-table.mjs`](../../../module/helpers/item-table.mjs) holds
it, composed from `items.mjs` and `inventory.mjs` and free of Foundry globals
for the same reason they are: it returns raw values and an ordering, and the
sheet turns those into words. That split is what keeps `game.i18n` out of the
table's rules and the rules out of the template.

| Export | Responsibility |
| --- | --- |
| `ITEM_TABLE_COLUMNS` | The column catalogue: every gear field the picker offers, with the section it is listed under, its caption and hint keys, and the role a row must carry for it to mean anything |
| `ITEM_TABLE_GROUPS` | `weapon`, `armor`, `consumable`, `plain` — the group order |
| `DEFAULT_ITEM_TABLE_CONFIG` / `normalizeItemTableConfig` | What a sheet shows before anyone picks, and how a stored layout is brought back to something renderable |
| `toggleItemTableColumn` / `nextItemTableSort` | The picker's and the header's one-step transitions |
| `columnCell(item, key, {worn})` | `{applies, value, sort}` for one cell |
| `buildItemGroups(items, {worn, columns, sort, collator})` | The whole table: groups, rows, and the two totals worth summing |

**Grouped by role, and only by role.** Roles are mutually exclusive
([item-roles.md](item-roles.md)), so the groups are a reading of the one list
rather than four lists that could disagree — an item cannot appear twice, and
none can fall out. Every group renders even when it holds nothing: that a
character owns no armour is an answer, and a heading that vanishes would have
to be read as "that group is gone" instead.

**Three kinds of silence, and keeping them apart is the whole job.**

- A column the row cannot be *asked* is `applies: false`, painted as a hatched
  `n/a`. Three rules produce it: the column belongs to a role the piece has not
  taken on; DK and RB are melee questions and RD a ranged one, so only the use
  the weapon has answers them; the Unterkleidung has no Rüstungshärte and covers
  no single location, so RH and RA are values a suit cannot have (the same
  exception `missingRequired` makes).
- A column it could answer that nobody filled in is `value: null`, painted as a
  dash. `isAuthoredNumber` guards every read, because `Number(null)` is 0 and
  the nullable fields exist precisely so that blank and the lowest step stay
  different answers.
- Everything else is a figure.

Nothing is hidden per row — the grid keeps its shape down the list, which is
also why the whole table is a single CSS grid with `subgrid` rows rather than
one grid per group.

**Sorting is a view concern and never writes `item.sort`.** That field is the
order the slot bands pack from, so a header click here would otherwise
silently repack a raster the player arranged by hand in the other tab. The same
reasoning disables in-table drop-sorting (`_onSortItem` bails inside
`.item-table`): a row in a role-grouped, column-sorted table has no position to
be dropped into. Rows stay draggable so a piece can still be dragged out onto
the hotbar or another actor.

Values the column cannot answer sort **last in both directions**. Sorting by RH
to find the hardest armour and sorting to find the softest are the same act of
pulling the pieces that have an RH to the top, and a descending sort that opened
with a screenful of `n/a` would answer neither question.

**The layout is a per-user client setting**, `tno.itemTableLayout`, registered
beside `basicsLayout` in [`tno.mjs`](../../../module/tno.mjs). Which columns
someone reads is a property of the reader rather than of the character, so it
follows them to every sheet they open. Nothing in it is game state.

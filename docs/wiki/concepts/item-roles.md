---
type: concept
title: Item roles and the gear dialog
description: Why a physical item has roles instead of a Foundry item type, and how the row-editor sheet is built from them.
tags: [items, roles, weapons, armor, sheets, schema]
resource: [module/helpers/items.mjs, module/helpers/item-presentation.mjs, module/sheets/item-gear-sheet.mjs, templates/item/item-gear-sheet.hbs, templates/item/parts/item-gear-overview.hbs]
spec: docs/design/character-sheet-prd.md
related: [concepts/inventory, concepts/migrations, reference/ui-surfaces, architecture/data-schema]
---

# Item roles and the gear dialog

## There is one kind of object

Every physical item is the same kind of object. It optionally **takes on a
role** — weapon, armour, or consumable — which decides which extra block of
values it carries.

Exactly one role, or none. A brand-new item has no role at all, because a plain
object is the common case and classifying a thing before it has a name is the
wrong order. So the role chips are a radiogroup, and clicking the chosen one
clears it.

That is the same cardinality a Foundry item type has, and it is still not a
type, for two reasons: a type is fixed at creation, so an object entered as a
plain item could never later become a weapon; and choosing it is a modal step in
front of the sheet rather than a field on it.

So `system.roles` is the truth:

```js
system.roles = { weapon: false, armor: false, consumable: false }
```

[`helpers/items.mjs`](../../../module/helpers/items.mjs) is the only place that
reads it. `itemRoles(item)` returns the flat `{weapon, armor, consumable}` that
templates branch on; `hasRole(item, role)` is the one-role shorthand;
`selectRole(roles, role)` returns the whole object with the pick applied, so a
sheet writes `system.roles` in one update and cannot leave two on by setting one
before clearing the other.

`roles` stays an object of three booleans rather than becoming a single
`system.role` string. It is what every template already branches on, what the
migration writes, and the shape that survives if a piece ever does need two —
whereas a string would have to be migrated twice to find out.

## The types are still registered, and mean nothing

`item`, `armor` and `weapon` are all still in `template.json`, all sharing the
same `gear` template. They stay for one reason: a document's type is immutable
after creation, so un-registering `armor` would make every such document in a
published world fail to load. Nothing reads the type for meaning any more.

Two consequences worth knowing:

- **New gear is always created as `item`.** The actor sheet's add dialog asks
  only for a name — what the thing *does* is chips on its own sheet, not a
  choice that has to be made before it exists.
- **`itemRoles` falls back to the type** when `system.roles` is absent
  entirely, so a pre-role-model document behaves correctly before the
  migration reaches it. Once the key exists it is authoritative *even when
  every role in it is false* — that is a player who turned the last chip off,
  not an unmigrated document.

`GEAR_TYPES` is the list of the three, and `inventory.mjs` re-exports it as
`CARRIED_ITEM_TYPES`: the slot economy never cared which of them an object was.

## The field set

All of it is flat on `system`, not nested per role — the names do not collide,
and flat keeps `resolveArmor` and the carry maths reading the same paths they
always did.

| Group | Fields |
| --- | --- |
| Every item | `quantity`, `slots`, `sv`, `price`, `availability`, `fv: {skill, rank}`, `description` |
| Weapon role | `use` (`melee`/`ranged`), `dk`, `range: {sn, near, mid, far, sf}`, `ammo: {count, type}`, `rd`, `ss: {count}`, `ws: {count}`, `hh: {active, passive}`, `rb` |
| Armour role | `zone`, `rh`, `rw`, `ra` |
| Consumable role | `consumableEffects: [{id, text}]`; its remaining stock is the shared `quantity` |

`dk`, `rd`, `rh`, `rw` and every `range` band are **nullable**, and that is
load-bearing: not filled in and set to the lowest step are different answers.
`scaleCells()` has to check for blank before coercing, because `Number(null)`
is 0.

`availability` is an optional, nullable **1–10 base value** and is not counted
as a missing required property. The sheet deliberately does
not store commercial-density, seller, legality or negotiation modifiers on the
item: those belong to the situation in which the item is being sought. The
posted rule text still has an unresolved sign-versus-roll-direction issue, but
that affects resolution, not the authored base value.

`price` is an optional **euro base price**. The currency section explicitly compares
all currencies against euros (with one Tempel Or equal to one euro), so a
currency-specific item price would bake an exchange choice into the catalog.
In the edit view, quantity, base price and availability form the separate
**Trade** group; the calculated slot footprint stays beside quantity because
it changes with the stack size.

## Armour has one location

`zone` is one of Unterkleidung, head, torso, arms or legs. The edit chips are
an exclusive, clearable selection and the paper doll fills that one target
when the piece is worn. Unterkleidung remains a special base-layer location
which contributes beneath every hit zone during armour resolution.

## The dialog: overview and edit

[`TnoGearSheet`](../../../module/sheets/item-gear-sheet.mjs) — ApplicationV2,
registered for `GEAR_TYPES`. `TnoItemSheet` (V1) keeps `feature` and `spell`.
The sheet has two local views which never alter the document: **Übersicht** is
the play-facing summary and action surface, while **Bearbeiten** is the full
row editor. An incomplete badge in the overview returns directly to editing.

[`item-presentation.mjs`](../../../module/helpers/item-presentation.mjs) builds
the pure view model shared by the overview components: range profile, neutral
RD/RH threshold, slot footprint and owner capacity, SV comparison, and
carried/worn state. It imports both `items.mjs` and `inventory.mjs` so
templates never duplicate their coercion or arithmetic.

Three properties of the layout are deliberate and easy to undo by accident:

**No tabs inside editing.** The edit view remains one scrolling column of
`label | control` rows. Its overview/edit switch separates two tasks rather
than dividing related authoring fields across hidden pages.

**Nothing is hidden, only disabled.** A field the current role or use does not
apply to — the Distanzklasse of a rifle, the Fertigkeitswert of a breastplate —
stays in place as a hatched `n/a` cell. Collapsing the row would move every row
below it, so switching a weapon from melee to ranged would make the dialog jump
under the cursor. Whole role blocks are the exception: a role that is off is a
section the item does not have, not a field it cannot fill.

**No save button.** The sheet edits a live document that the paper doll and the
carry grid render at the same time; a local draft would desync them, and
Foundry has no rollback to hang a Cancel off. Every change writes through, and
the footer *counts what is still missing* (`missingRequired()`) instead of
gating a save.

The missing-field count expands into controls which focus the corresponding
row. Numeric fields with structural bounds are clamped through
`GEAR_NUMBER_BOUNDS`; custom scales, chips, segments and steppers use native
buttons so Enter/Space and disabled/focus semantics come from the browser.

The overview offers only actions backed by stored state: post to chat, adjust
loaded ammunition, consume one item from a stack, and delete the item through
the same confirmation used by the inventory list. Worn armour must be taken
off before deletion.
An actor-owned weapon with FV can open the normal roll builder as a
**Waffenprobe**. That is not a full attack: it neither chooses SS/WS nor spends
ammunition, and it does not imply a readied state.

Controls, and when each is right:

| Control | Used for | Why |
| --- | --- | --- |
| Click-scale | slots, availability, DK, RB/RD, RH, RW, RA | A closed set of steps a rules table enumerates. Clicking the selected cell again clears it — the only way back to "not set" |
| Stepper | quantity, loaded ammunition | Counts with no table behind them, nudged far more often than typed |
| Chips | role, armour location | Both are exclusive and clearable selections |
| Segments | weapon use | Single-select melee/ranged category, joined into one bar |
| Range bands | Five independently cycled `—`, `−3`, `0`, `+3` values. New ranged profiles start neutral at `0`; a horizontal line moves down/red for a penalty and up/green for a bonus, with a dashed center line for no attack |
| Split | SS, WS, HH | Parts of a single figure, hairline-separated inside one box. SS/WS store a count of standard damage dice (`W`), not a selectable die type |
| Repeatable text | consumable effects | Each effect is a complete free-text rule including any value or duration it needs |

The general/trade fields and the selected role's fields are separated by a
labelled horizontal rule. The divider is structural orientation only; it does
not hide either group or create another tab.

The keyboard model is part of the design, not an accessibility afterthought:
`↑`/`↓` walk the rows, `←`/`→` change the value in the focused scale, and a
digit sets it directly (`0` means 10 on a ten-step scale). Arrows are only
intercepted where a native control does not already own them.

## Deliberately not implemented

- **`stapelbarMit`** from the handoff's data model. It is a second layering
  model, and the one that governs is already settled: the suit never gives RH,
  everything else adds. Two would contradict.
- **Ammunition dropdowns.** The rules provide no ammunition catalog. The sheet
  stores the loaded magazine count plus a free-text ammunition type; spare
  ammunition remains a separate inventory item.
- **Einhändig/zweihändig, holsters, vacuum sealing, clothing category.** Real
  properties in the rules, but nothing reads them — adding fields nothing reads
  is how the old `roll.diceNum` boxes got there.
- **Weapon readiness and automatic attack resolution.** Ranged weapons may be
  used as improvised melee weapons under the combat rules, but that does not
  create a second authored profile; the removed `both` value could not store
  separate SS/WS/HH values truthfully. The item overview can
  open its FV check, but the PRD still defines no readied-weapon state or
  complete RD/RH → SS/WS workflow. The penetration graphic therefore shows the
  threshold neutrally instead of assigning an outcome the model cannot prove.

## What went away

`system.formula` and its `Item#roll()` branch. It defaulted to
`d20 + @str.value`, which was Foundry boilerplate flatly contradicting a
3d20-roll-under system, and the attack chain is not one roll to begin with.
`roll()` now posts the item to chat and the player picks the Probe. The
inventory list's "Roll Formula" column became the Rollen column.

The migration that moves an existing world across is
`migrateItemTypesToRoles` — see [migrations.md](migrations.md).

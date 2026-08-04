---
type: concept
title: Item roles and the gear dialog
description: Why a physical item has roles instead of a Foundry item type, and how the row-editor sheet is built from them.
tags: [items, roles, weapons, armor, sheets, schema]
resource: [module/apps/roll-dialog.mjs, module/documents/item.mjs, module/helpers/items.mjs, module/helpers/item-presentation.mjs, module/helpers/item-summary.mjs, module/sheets/actor-sheet.mjs, module/sheets/item-gear-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/apps/roll-dialog.hbs, templates/item/item-gear-sheet.hbs, templates/item/parts/item-gear-summary.hbs, templates/item/parts/item-role-weapon.hbs]
spec: docs/design/character-sheet-prd.md
related: [concepts/combat-roll-workflows, concepts/inventory, concepts/migrations, reference/ui-surfaces, architecture/data-schema]
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

The inventory views use `inventoryIcon(item)` from the same helper, so the
carry grid, Kleinkram list and flat inventory list all show the same quick
read: ranged weapon, melee weapon, armour, consumable or a generic object.
The item image remains available on the item's own sheet.

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
| Every item | `quantity`, `slots`, `sv`, `price`, `availability`, `description` |
| Weapon role | `use` (`melee`/`ranged`), `fv: {skill, rank}`, `wa` (one primary-attribute key), `dk`, `range: {sn, near, mid, far, sf}`, `rd`, `ss: {count}`, `ws: {count}`, `hh: {active, passive}`, `rb` |
| Armour role | `zone`, `rh`, `rw`, `ra` |
| Consumable role | `consumableEffects: [{id, text}]`; its remaining stock is the shared `quantity` |

`normalizeConsumableEffects()` is the compatibility boundary for the effects
list. The current shape is the array above, but the reader also accepts an
indexed object left by an early live-editor form and a legacy single string.
Every validation and editor path consumes the normalized array; the next
add/edit/remove action writes that canonical shape back to the item.

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
all currencies against euros (with one OR equal to one euro), so a
currency-specific item price would bake an exchange choice into the catalog.
In the edit view, quantity, base price and availability form the separate
**Trade** group; the calculated slot footprint stays beside quantity because
it changes with the stack size.

## Armour has one location

`zone` is one of Unterkleidung, head, torso, arms or legs. The edit chips are
an exclusive, clearable selection and the paper doll fills that one target
when the piece is worn. Unterkleidung remains a special base-layer location
which contributes beneath every hit zone during armour resolution.

## The editor and compact summary

[`TnoGearSheet`](../../../module/sheets/item-gear-sheet.mjs) — ApplicationV2,
registered for `GEAR_TYPES` — is the full row editor. `TnoItemSheet` (V1)
keeps `feature` and `spell`. The play-facing compact summary lives instead in
the actor sheet's item popover and in chat; it is rendered from the shared
`item-gear-summary.hbs` partial.

[`item-presentation.mjs`](../../../module/helpers/item-presentation.mjs) builds
the pure presentation data, while
[`item-summary.mjs`](../../../module/helpers/item-summary.mjs) adds
localization and the live actor context for the compact summary. Together they
keep slot footprint, FV, armour values and carried/worn state out of templates.

Three properties of the layout are deliberate and easy to undo by accident:

**No tabs inside editing.** The editor remains one scrolling column of
`label | control` rows. The compact play summary is a separate surface rather
than a second editor view, so related authoring fields are never divided across
hidden pages.

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

## The view-mode card

The compact summary is one card, built once in `buildGearSummary` and rendered
by both the actor-sheet popover and the chat item card. It is read top to
bottom in four passes, and the shape is per role:

| Band | What it holds |
| --- | --- |
| Badges | The role chip (filled), the weapon's use joined into it, the armour location, and the carried/worn state |
| Probe band | A weapon's Waffenattribut and Fertigkeitsvoraussetzung, hairline-split in one box because neither half is an answer alone |
| Tiles | The numbers with a rules table behind them — DK/RB/SS/WS for a melee weapon, RD/SS/WS/HH for a ranged one, RH/RW/RA for armour, Bestand + Trageslots for a consumable, Trageslots + Menge for a plain object |
| Warning | Which required values are still blank, sitting between the numbers and the button that fixes them |
| Rows | Everything needing a sentence: Handhabung, the stack's carry cost, and the SV against its owner's Strength |

Three properties of that card matter:

**A tile never collapses.** The tile count is fixed within a role, so a value
the item has not got stays as a hatched `na` box or, when the role requires it,
a `missing` box in the warning colour. This is the same reason the editor
hatches instead of hiding, and it is what keeps a shelf of cards aligned.

**One list decides both the tile and the banner.** A `missing` tile and the
warning banner both read `missingRequired`, so they cannot disagree. The one
place that list encodes a rule is the Unterkleidung: a suit never grants RH, so
a blank RH on a suit is not a missing value — the tile is `na` and the piece is
complete.

**No price, no availability.** Those are facts about acquiring the thing. The
card is what is on the table.

The popover offers only actions backed by stored state: open the editor, post
to chat, change a consumable's remaining stock with the `−` / `+` controls in
its primary tile, and delete the item through the same confirmation used by the
inventory list. Stock never drops below zero. Worn armour must be taken off
before deletion. The chat card renders the same partial without any of these
live controls.
An owned weapon with a valid profile exposes its independent Attack workflow as
the full-width primary action. A melee profile also exposes Parry in the
secondary row. The actor sheet owns the separate Dodge action. Their entry
points, context dialog, and mechanics-spec link are mapped in
[combat-roll-workflows.md](combat-roll-workflows.md); the popover still does
not resolve an attack chain, readiness, or ammunition.

The carry-cell tooltips flatten the same card into one line, dropping the `na`
tiles — a box holding the layout together says nothing in a sentence.

Controls, and when each is right:

| Control | Used for | Why |
| --- | --- | --- |
| Click-scale | slots, availability, DK, RB/RD, RH, RW, RA | A closed set of steps a rules table enumerates. Clicking the selected cell again clears it — the only way back to "not set". The slots label has a keyboard-focusable info-icon tooltip containing the complete size guideline table |
| Stepper | quantity | A count with no table behind it, nudged far more often than typed |
| Chips | role, armour location | Both are exclusive and clearable selections |
| Segments | weapon use | Single-select melee/ranged category, joined into one bar |
| Range bands | Five independently cycled `—`, `−3`, `0`, `+3` values. New ranged profiles start neutral at `0`; a horizontal line moves down/red for a penalty and up/green for a bonus, with a dashed center line for no attack |
| Split | SS, WS, HH | Related values in equal caption/value boxes: SS beside WS and Angriff beside Parade. A ranged weapon keeps Parade visible but disables its input. SS/WS are plain damage values from 0 upward — no unit, no die type, and nothing to append to the number |
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
- **Einhändig/zweihändig, holsters, vacuum sealing, clothing category.** Real
  properties in the rules, but nothing reads them — adding fields nothing reads
  is how the old `roll.diceNum` boxes got there.
- **Weapon readiness and automatic attack resolution.** Ranged weapons may be
  used as improvised melee weapons under the combat rules, but that does not
  create a second authored profile; the removed `both` value could not store
  separate SS/WS/HH values truthfully. The item popover can
  open its FV check, but the PRD still defines no readied-weapon state or
  complete RD/RH → SS/WS workflow. The compact summary therefore shows the
  threshold neutrally instead of assigning an outcome the model cannot prove.

## What went away

`system.formula` and its `Item#roll()` branch. It defaulted to
`d20 + @str.value`, which was Foundry boilerplate flatly contradicting a
3d20-roll-under system, and the attack chain is not one roll to begin with.
`roll()` now posts the item to chat and the player picks the Probe. The
inventory list's "Roll Formula" column became the Rollen column.

The migration that moves an existing world across is
`migrateItemTypesToRoles` — see [migrations.md](migrations.md).

---
type: concept
title: Item roles and the gear dialog
description: Why a physical item has roles instead of a Foundry item type, and how the row-editor sheet is built from them.
tags: [items, roles, weapons, armor, sheets, schema]
resource: [module/apps/item-overview.mjs, module/helpers/item-audit.mjs, module/apps/roll-dialog.mjs, module/documents/item.mjs, module/helpers/items.mjs, module/helpers/item-presentation.mjs, module/helpers/item-summary.mjs, module/helpers/item-transfer.mjs, module/sheets/actor-sheet.mjs, module/sheets/item-gear-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/apps/create-item-dialog.hbs, templates/apps/take-item-dialog.hbs, templates/apps/roll-dialog.hbs, templates/chat/item-summary.hbs, templates/chat/item-use.hbs, templates/item/item-gear-sheet.hbs, templates/item/parts/item-gear-summary.hbs, templates/item/parts/item-role-weapon.hbs, templates/item/parts/item-section-head.hbs]
spec: docs/design/character-sheet-prd.md
related: [concepts/combat-roll-workflows, concepts/inventory, concepts/migrations, reference/ui-surfaces, architecture/data-schema]
---

# Item roles and the gear dialog

## There is one kind of object

Every physical item is the same kind of object. It optionally **takes on a
role** — weapon, armour, or consumable — which decides which extra block of
values it carries.

Exactly one role, or none. None is what an item defaults to everywhere it can —
a bare `Item.create` leaves it, and the add dialog preselects it — because a
plain object is the common case. So the role chips are a radiogroup, and
clicking the chosen one clears it.

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

The inventory views ask the same helper what to draw, through
`inventoryArt(item)`: **the piece's own picture when it has one, the role icon
when it has not**. So the slot grid, Kleinkram list and the Inventar tab's
ledger agree on what an item looks like, and an item with no art still reads as
ranged weapon, melee weapon, armour, consumable or generic object.

Which of the two applies is decided by `isPlaceholderArt`, and the rule is one
line: everything under `icons/svg/` is Foundry's own silhouette set — art a
document is *given* on creation, not art anybody chose — so it counts as
absent. Real art, core or system, lives anywhere else.

The role icon was unconditional until the shipped gear compendium gave every
entry a distinct picture (see
[guides/compendium-packs.md](../guides/compendium-packs.md)). A repeated
silhouette is the faster scan only while items have no art of their own: four
identical `fa-shield-halved` cells say "armour" four times, where the art says
helmet, boots, gauntlets, vest.

The ledger goes one step further and **groups by role** — which is only sound
because a piece carries at most one. See
[inventory.md](inventory.md#the-ledger) for how the columns key off the role,
and why a column a row cannot be asked reads as `n/a` rather than as a blank.

## The types are still registered, and mean nothing

`item`, `armor` and `weapon` are all still in `template.json`, all sharing the
same `gear` template. They stay for one reason: a document's type is immutable
after creation, so un-registering `armor` would make every such document in a
published world fail to load. Nothing reads the type for meaning any more.

Two consequences worth knowing:

- **New gear is always created as `item`.** The actor sheet's add dialog asks
  for a name and offers four cards — Gegenstand, Waffe, Rüstung, Verbrauch —
  and what they write is `system.roles`, never the type. Picking one is an
  offer, not a step: "Gegenstand" (no role) is preselected because it is the
  common case, and every card is the same chip the item's own sheet can change
  or clear a second later. That is the difference from a type picker, which
  would make the least reversible answer the first one.
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
| Every item | `quantity`, `slots`, `sv`, `twoHanded`, `price`, `availability`, `description` |
| Weapon role | `use` (`melee`/`ranged`), `wa` (one primary-attribute key), `wf` (one skill key), `dk`, `range: {sn, near, mid, far, sf}`, `ss: {count}`, `ws: {count}`, `hh: {active, passive}`, `rb` |
| Armour role | `zone`, `rh`, `rw`, `ra` |
| Consumable role | `consumableEffects: [{id, text}]`; its remaining stock is the shared `quantity` |

`normalizeConsumableEffects()` is the compatibility boundary for the effects
list. The current shape is the array above, but the reader also accepts an
indexed object left by an early live-editor form and a legacy single string.
Every validation and editor path consumes the normalized array; the next
add/edit/remove action writes that canonical shape back to the item.

`dk`, `rb`, `rh`, `rw` and every `range` band are **nullable**, and that is
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
In the edit view, quantity, base price and availability form the folded
**Handel** section; its summary line reads them back while it is shut.

## Armour has one location

`zone` is one of Unterkleidung, head, torso, arms or legs. The edit segments are
an exclusive, clearable selection and the paper doll fills that one target
when the piece is worn. Unterkleidung remains a special base-layer location
which contributes beneath every hit zone during armour resolution — padding
only, since it has no hit location to harden or cover. The editor leaves its
RH and RA rows out and says why in a note; both are authorable on every other
location.

## The editor and compact summary

[`TnoGearSheet`](../../../module/sheets/item-gear-sheet.mjs) — ApplicationV2,
registered for `GEAR_TYPES` — is the full row editor. `TnoItemSheet` (also ApplicationV2)
keeps `feature` and `spell`. The play-facing compact summary lives instead in
the actor sheet's item popover and in chat; it is rendered from the shared
`item-gear-summary.hbs` partial.

[`item-presentation.mjs`](../../../module/helpers/item-presentation.mjs) builds
the pure presentation data, while
[`item-summary.mjs`](../../../module/helpers/item-summary.mjs) adds
localization and the live actor context for the compact summary. Together they
keep slot footprint, weapon skill, armour values and carried/worn state out of templates.

The editor follows the 2026-10 "Item-Editor" mockup. Its shape is deliberate:

**One column, in authoring order.** Identity first — picture, name and the role
as a four-way radiogroup (*Gegenstand* is the explicit "no role") — then the
role's values, then *Inventar* (slots; *Zweihändig* and SV for a weapon, SV for
armour), then *Handel* and *Beschreibung* as folds, and a foot with the status
and the two whole-item acts, posting to chat and deleting. Every value row is
`label | control` with a 130px label column, so values start at one x down the
whole sheet. `position.width` is 720: RB's eleven cells beside that column.

**No tabs; folds instead.** Tabs would hide fields a player is comparing.
Handel and Beschreibung are filled once and then only read, so they fold, and
the summary line on a shut fold says what is in it ("Menge 1 · Preis – ·
Verfügbarkeit –", or the start of the description). Which folds are open is kept
on the sheet instance (`#openFolds`), because every change re-renders the form.

**Only what applies is shown.** A ranged weapon is asked for its five range
bands — the wiki's ranged DK — where a melee one is asked for DK; a ranged one
has one HH, a melee one HH-A and HH-P; the Unterkleidung has RW alone. The
earlier sheet hatched such rows as `n/a` so nothing moved; the redesign trades
that for a shorter form, and the rows that change swap one for one or sit at a
section's end.

**Required fields say so where they are.** A field `missingRequired` reports is
drawn in amber in its row; each section's head counts its own
(`SECTION_FIELDS`: "2 Pflichtfelder offen" / "✓ vollständig"), and the foot lists
them all ("Offen: …"), each a button that focuses its control via `data-field`
or `data-row`.

## The GM's provenance window

`tno.gear` is a starting point a GM drags from, not a live reference — an item
copied onto an actor is a separate document from the moment it lands, and one
typed in by hand is indistinguishable from a copied one on the sheet itself.
[`apps/item-overview.mjs`](../../../module/apps/item-overview.mjs) is the surface
that tells them apart, registered GM-only as `itemOverviewMenu` beside the custom
skills overview it is modelled on.

It walks `game.items` **and** every actor's embedded items, because in this system
gear lives on actors: a window reading only the world directory would show almost
nothing of what is in play.

**It is the Inventar ledger's table, not a second one.** Grouping by role, the
column catalogue, the three cell outcomes and the sort all come from
[`helpers/item-table.mjs`](../../../module/helpers/item-table.mjs) — the same
component the character sheet builds its ledger from — and the styling follows,
since `_item-table.scss` is imported inside `.tno` and so reaches this app for
free. A column therefore means the same thing in both places and the two cannot
drift apart. What the window adds is the two columns that only mean something
across actors: who holds the piece, and where it came from. It fixes its columns
rather than offering the sheet's picker, which is a per-character layout with no
reading across a whole world.

The column that earns it is origin, and it is read off `_stats.compendiumSource`
rather than guessed. Core stamps that field in both the directions that matter —
`WorldCollection#fromCompendium` on import, and `ClientDocument.fromDropData`
when a pack entry is dragged onto an actor — so an item with none was made in
this world.
[`helpers/item-audit.mjs`](../../../module/helpers/item-audit.mjs) is the pure
half, and provenance is all it does: it parses the pack out of the source UUID
rather than looking it up against installed packs, so an item outlives the module
it came from and still says where it came from
(`tests/helpers/item-audit.test.js › still names the pack of an item whose module is no longer installed`).

The three outcomes are *made here* (no source), *other pack* (a source outside
`tno.gear`) and *catalogue*. Only the first two are coloured; catalogue gear is
the expected case and stays quiet.

**The footer carries one action besides delete.** "Im Chat zeigen" posts the
piece through the same `TnoItem#roll()` the inventory popover uses, and it is
the one control on the sheet that is *not* gated on editability — an item opened
out of the locked gear compendium is read-only, and showing the table what a
piece is should not require unlocking a pack. Feature and spell sheets offer the
same action from their window title bar, because their footer sits inside a tab.

**No save button.** The sheet edits a live document that the paper doll and the
slot grid render at the same time; a local draft would desync them, and
Foundry has no rollback to hang a Cancel off. Every change writes through, and
the footer *counts what is still missing* (`missingRequired()`) instead of
gating a save.

The missing-field count expands into controls which focus the corresponding
row. Numeric fields with structural bounds are clamped through
`GEAR_NUMBER_BOUNDS`; custom scales, chips, segments and steppers use native
buttons so Enter/Space and disabled/focus semantics come from the browser.

## The view-mode card

The compact summary is one card, built once in `buildGearSummary` and rendered
by both the actor-sheet popover and the chat item card. Its layout is the
2026-10 "Item-Popups" design and is read top to bottom; the shape is per role:

| Band | What it holds |
| --- | --- |
| Header | Art, name, the kind line (`Waffe / Nah · 4 Slots`, a stack's `×n` appended for non-consumables) and the carried / worn / left-behind pill |
| Tiles | The numbers with a rules table behind them, long name in the tooltip — DK/RB/S/WS/HH (attack / parry, wide) for a melee weapon, RB/S/WS/HH for a ranged one, SV/RH/RW/RA for armour (no RA on an Unterkleidung). Consumables and plain items have none |
| Stock | A consumable's Bestand, as a row with its `−` / `+` stepper |
| Warning | Which required values are still blank, with an "Im Editor ergänzen" link in the popover |
| Rows | A weapon's Attribut and Fertigkeit, and an SV requirement against its owner's Strength |
| Description | Every item's enriched description; only a plain item, which has nothing else to show, says when it has none |

Three properties of that card matter:

**One list decides both the tile and the banner.** A `missing` tile (dashed
amber, `–`) and the warning banner both read `missingRequired`, so they cannot
disagree. The one place that list encodes a rule is the Unterkleidung: the
Rüstungstabelle writes every suit row as RH 0 and RA `–`, so neither is a value
a suit is missing. The RH tile reads the fixed `0`, there is no RA tile, and
the piece is complete.

**One main action per role, the rest quiet.** Under the values sits the role's
action: Angriff würfeln (filled) and Parade for a weapon, Benutzen (−1) for a
consumable — `TnoItem#useConsumable()` takes one off the stock and posts the
written effects (`chat/item-use.hbs`); nothing is applied automatically.
Armour has none, since it is worn by dragging it onto the paper doll, and a
plain item has none either. Everything done *to* the item —
Im Chat zeigen, Bearbeiten, Zurücklassen / Mitnehmen, delete — is a bar of bare
text buttons at the foot. A left-behind piece offers no main action.

**No price, no availability.** Those are facts about acquiring the thing. The
card is what is on the table.

The popover offers only actions backed by stored state. Stock never drops below
zero. Worn armour must be taken off before deletion. The chat card renders the
same partial without any live controls, and adds the one action of its own
described below. Attack and Parry entry points, context dialog, and
mechanics-spec link are mapped in
[combat-roll-workflows.md](combat-roll-workflows.md); the popover still does
not resolve an attack chain, readiness, or ammunition.

Controls, and when each is right:

| Control | Used for | Why |
| --- | --- | --- |
| Click-scale | slots, availability, DK, RB, RH, RW, RA | A closed set of steps a rules table enumerates. Clicking the selected cell again clears it — the only way back to "not set". The slots label carries the complete size guideline table as its tooltip |
| Stepper | quantity | A count with no table behind it, nudged far more often than typed |
| Segments | role, weapon use, armour location | Exclusive selections, joined into one bar with the chosen one filled. The location is clearable by clicking it again; the role is a radiogroup with *Gegenstand* for none |
| Select pair | WA, WF | The two fixed components a weapon check starts from, side by side in one row |
| Range bands | ranged distance | Five independently cycled `—`, `−3`, `0`, `+3` values. A horizontal line moves down/red for a penalty and up/blue for a bonus, with a dashed center line for no attack |
| Value boxes | SS, WS, HH-A, HH-P; SV; price | Caption left, figure right. SS/WS are plain damage values from 0 upward — no unit, no die type |
| Repeatable text | consumable effects | Each effect is a complete free-text rule. A consumable without one shows one empty box; typing into it creates the first entry |

The keyboard model is part of the design, not an accessibility afterthought:
`↑`/`↓` walk the rows, `←`/`→` change the value in the focused scale, and a
digit sets it directly (`0` means 10 on a ten-step scale). Arrows are only
intercepted where a native control does not already own them.

## Taking a posted item

A posted gear card can be copied onto a sheet the reader owns
([`item-transfer.mjs`](../../../module/helpers/item-transfer.mjs)). Four
properties of that path are decisions, not incidentals:

**The card carries the item, not a pointer to it.** `TnoItem#roll()` writes the
item's own data into `flags.tno.item`, minus the fields that describe the
original rather than the thing — `_id`, `_stats`, `folder`, `sort`, `ownership`.
So the copy still works after the original has been sold, edited or deleted, and
the chat log stays a truthful record of what was posted rather than a link that
re-reads whatever the item has since become.

**It is a copy, never a hand-over.** The poster keeps their piece and two
readers clicking the same card both get one. Moving an object between characters
is a table decision, and the poster's own sheet is where they take theirs out.

**The whole stack travels.** `quantity` is an authored property of the posted
thing — twenty Bolzen are one item — not a separate statement about how many are
being offered.

**The receiving actor is always asked for.** Never the selected token, never the
assigned character silently: a GM with a shelf of NPCs would otherwise have to
remember what was selected before clicking. Ownership is the only filter on the
list, since an NPC holds gear exactly as a character does. The action is
rendered per viewer, so a reader who owns no actor sees the card without a
button rather than one that can only fail.

Feature and spell get no button. They are not objects — they cost no slots and
are created from their own lists — so their chat card stays the plain
description it has always been.

## Deliberately not implemented

- **`stapelbarMit`** from the handoff's data model. It is a second layering
  model, and the one that governs is already settled: the suit gives neither RH
  nor RA, and its RW adds. Two would contradict.
- **Holsters, vacuum sealing, clothing category.** Real properties in the
  rules, but nothing reads them — adding fields nothing reads is how the old
  `roll.diceNum` boxes got there. *Zweihändig* is the exception, because the
  hands read it: `twoHanded` is a checkbox in a weapon's Inventar section (the
  flag is read on any piece that has it), and the popover's subtitle names it — see
  [inventory.md](inventory.md#holding).
- **Readiness as a rule and automatic attack resolution.** Ranged weapons may be
  used as improvised melee weapons under the combat rules, but that does not
  create a second authored profile; the removed `both` value could not store
  separate SS/WS/HH values truthfully. The item popover can
  open its weapon check whether the weapon is held or not — the hands are
  bookkeeping only — and the PRD defines no complete RB/RH → SS/WS workflow. The compact summary therefore shows the
  threshold neutrally instead of assigning an outcome the model cannot prove.

## What went away

`system.formula` and its `Item#roll()` branch. It defaulted to
`d20 + @str.value`, which was Foundry boilerplate flatly contradicting a
3d20-roll-under system, and the attack chain is not one roll to begin with.
`roll()` now posts the item to chat and the player picks the Probe. The
inventory list's "Roll Formula" column became the Rollen column.

The migration that moves an existing world across is
`migrateItemTypesToRoles` — see [migrations.md](migrations.md).

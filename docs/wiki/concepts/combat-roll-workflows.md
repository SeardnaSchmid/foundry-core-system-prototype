---
type: concept
title: Standalone combat roll workflows
description: Code map for the uncoupled Attack, Parry, Dodge and Resistance rolls, the Haltung that gates the defences, and the free Ansage declared inside an attack.
tags: [combat, weapons, defence, rolls, maneuvers]
resource: [module/helpers/combat-actions.mjs, module/helpers/maneuvers.mjs, module/helpers/items.mjs, module/documents/item.mjs, module/documents/actor.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/actor/parts/actor-paperdoll.hbs, templates/actor/actor-character-sheet.hbs, templates/apps/roll-dialog.hbs, templates/chat/roll-card.hbs]
spec: docs/design/workflows/combat-workflow-prd.md
related: [concepts/dice-resolution, concepts/item-roles, concepts/skills, concepts/damage]
---

# Standalone combat roll workflows

The mechanics of record are in
[`docs/design/workflows/combat-workflow-prd.md`](../../design/workflows/combat-workflow-prd.md).
This page maps those workflows to their implementation.

**The rule the whole layout follows: no sheet ever reads another sheet.** A
workflow either computes a value from its own actor, asks the player to pick a
fact both sides can see, or asks them to type a number the other side announced.
Nothing anywhere in this path takes a target, opens a second document, or checks
another user's permissions.

- [`helpers/combat-actions.mjs`](../../../module/helpers/combat-actions.mjs) is
  the entry layer: one builder per Handlung — `angriffOptions`, `paradeOptions`,
  `ausweichenOptions`, `widerstandOptions` — each returning the
  `TnoRollDialog` options for that roll, or `null` when the actor cannot form it.
  Everything that used to be assembled inline at four call sites lives here, so
  an Ansage can reach the same option object an ordinary attack builds. It also
  owns the Haltung rules: `actorStance`, `canDefend`, `defenseMalus`,
  `countDefense` and `takeStance`. `defenseMalus` charges a Malusstufe per
  repeat, summing up, and reads the relief rank out of `DEFENSE_RELIEF` — keyed
  by the (defence, Haltung) pair, because Ausweichen has two relief skills and
  the Haltung decides which one applies.
- [`helpers/maneuvers.mjs`](../../../module/helpers/maneuvers.mjs) is pure and
  global-free, and holds everything a Stelle is: `ZONE_CHOICES` / `DEFAULT_ZONE`
  (the Stellen an attack can name, Torso first), `ZONE_COSTS` / `zoneCost(zone)`
  (what aiming there costs, from Gezielte Angriffe), `DAMAGE_RULES` (the pool
  multiplier for that Stelle) and `ansageEnvelope(ansage, zone)` (what crosses to
  the defender). It models no *other* Manöver at all — the table of nine, their
  governing Fertigkeiten and the `ansageKosten` ladder are gone, because every
  other Ansage is one free magnitude the players agree on before typing it. The
  Trefferzonen stayed because the rulebook prices them itself.
- [`helpers/items.mjs`](../../../module/helpers/items.mjs) contains the pure
  weapon-profile, requirement, handling, range-band, and DK-choice helpers.
  `requirementMalusSteps` grades an **SV** shortfall into Malusstufen;
  `weaponRequirementStatus` reports it alongside the flat one-step FV shortfall.
  The SV malus reaches every attack and parry; the FV one is a Manöver rule and
  is handed to the dialog as `maneuverMalus`, which applies it only once
  something has been declared — an Ansage typed, or a Stelle named other than the
  Torso. `armorSvMalus` answers the third, differently shaped
  requirement — the armour SV — for a given set of attributes, and
  `armorPenetrationChoices` returns the damage table's three outcomes.
- [`documents/item.mjs`](../../../module/documents/item.mjs) and
  [`documents/actor.mjs`](../../../module/documents/actor.mjs) are now thin:
  `openWeaponCheck`, `openWeaponParry` and `openResistanceCheck(zone)` call a
  builder and render what comes back. Both reach the dialog through
  `game.tno.TnoRollDialog` rather than by importing it, which keeps
  `documents/` from depending on `apps/`. `prepareDerivedData` publishes
  `derived.stance` and `derived.defenses.{parry,dodge}.{available,malus}`, and
  feeds the pair to the `noDodge` condition — a Haltung without Ausweichen is
  chosen rather than suffered, so it is worth saying out loud in the Zustände
  collection. See [damage.md](damage.md#the-condition-collection).
  [`sheets/actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs) exposes
  Dodge and the Haltung picker, including the explicit repeat action needed to
  take the current Haltung again, routes paper-doll clicks to the resistance
  roll, and gates the popover's Parry action on `canDefend`. The compact Dodge
  action below the silhouette and an available Parry action show the next
  repeated-defence malus before the player opens its dialog.
- [`apps/roll-dialog.mjs`](../../../module/apps/roll-dialog.mjs) owns every
  optional input a combat roll can carry, all of them feeding one component list
  that the threshold, the live breakdown, the chat card and the message flags
  are all derived from:
  - `preRollContext` — one required pick: a two-option `toggle` for binary
    observations such as the reach advantage, a compact radio-tile grid (1, 2,
    3, 5 or 7 columns) for real ladders, or a select. The field label asks the
    question; each choice's `componentLabel` remains the noun recorded in the
    threshold breakdown and chat card. **Every tile is read in the same three
    slots** — the answer's name, its Δ, and what it does to you — and which of
    them a choice fills is *derived*, never declared: a choice supplying a
    `headline` is one whose `label` is an effect rather than a name, so it is
    named by the headline and captioned by the label; a choice supplying none is
    named by its label and has no caption. The old `tileLabels` flag is gone
    with that derivation, and so is the range picker's inversion, which led with
    the modifier and captioned it with the band — answering *at what distance?*
    with `−3`
    (`tests/documents/roll-dialog.test.js › names a tile by its answer and captions it only where there is an effect to state`).
    A tile is sized by the slots it actually has, with no height floor; the
    middle slot (`.tno-context-tile-value`, shared with the Stelle's price) is
    the only part carrying the sign's colour, so a grid reads as answers with
    prices rather than a row of coloured words. One column is a *ladder* rather
    than a grid of one: each rung reads across in those same three slots,
    comparison first, then its Δ, then the consequence. It may additionally carry an `anchor` — `{label, value}` — the
    reader's own half of a comparison, rendered as a readout beside the
    choices and never as one of them
    (`tests/documents/roll-dialog.test.js › carries a readout the choices are measured against`).
    A zero anchor is a real answer and is stated, not dropped
    (`tests/documents/roll-dialog.test.js › keeps a zero`).
  - `requiredValue` — one typed number, e.g. the announced Schadenswert. It
    opens at 0 and does **not** gate the roll: the field is edited, not filled
    from empty. Optionally `labels` (one per `preRollContext` choice key) and
    `hint`. The
    resistance roll uses both: the attacker's card prints a Schaden *and* a
    Wucht value, and the penetration comparison is precisely what decides which
    of them landed — so the field renames itself to `Angreifer Schaden (S)`
    or `Angreifer Wucht (WS)` as the tile above is picked — every one of those
    names leads with the Angreifer the way the comparison line above it does
    (`Angreifer RB/RD`), because this is the one row in the ledger asking for a
    figure the defender does not own, sitting between two that are theirs, the breakdown carries the neutral
    `Schadenswert`, and the `hint` says both numbers are on the attacker's
    card — carried by a `.tno-ledger-info` marker beside the field's own label
    rather than a line of prose under the row, since it is read once and the
    ledger is a column of rows a paragraph would interrupt. The labels stay short because they are a ledger line's
    name, sharing the row with its stepper and its Δ: whose numbers these are is
    said once by the comparison line above (`Deine RH`) and once by that hint.
    Without it the player had to hold that mapping in their head
    (`tests/documents/actor-resistance-roll.test.js › names the damage field after the comparison that was picked`).
    `_refresh` repaints the label through the field's own `input[name]` and its
    `labels` collection, so it is independent of where the field sits — the
    field's own class is shared with the opposing-Ansage row. A horizontal
    `−` · value · `+` stepper frames the input: `.tno-ledger-stepper`, the one
    control **every** integer field in the ledger wears — this, the Ansage
    against you, the Ansage you declare — and it shares its look with the
    Modifikation `±3`, so the dialog teaches the gesture once.
    `_stepValue` clamps it to the `min`/`max` **the input itself carries**
    rather than to any one workflow's spec, which is what lets a single handler
    serve them all; the reached bound is shown as a disabled button rather than
    enforced silently
    (`tests/documents/actor-resistance-roll.test.js › steps the announced damage inside the bounds the workflow set`).
    A cleared field reads as 0 everywhere — `_requiredValueEntry` no longer
    distinguishes blank from zero, because with the field opening on a value
    there is no longer an "untouched" state to tell apart. Emptying the box is
    emptying it, not withdrawing the answer.
  - `ansage` — one optional integer that worsens this roll by what it declares,
    unpriced and ungated. `_ansageValue` reads it, `_ansageComponent` signs it,
    and nothing else touches it.
  - `zonePicker` — the Stelle, as tiles carrying both the pool multiplier and the
    price Gezielte Angriffe puts on aiming there (`ZONE_COSTS`, Torso free,
    limbs `−3`, head `−6`). `_zoneComponent` turns the pick into its own
    threshold component, deliberately never merged with the Ansage beside it
    (`tests/documents/roll-dialog.test.js › charges the Stelle what Gezielte Angriffe prices it at`).
    The price and the location travel separately and that split is load-bearing:
    the price worsens the attacker's own roll, while only the location crosses in
    the envelope
    (`tests/documents/roll-dialog.test.js › keeps the Stelle price on the attacker and out of the envelope entirely`).
  - `opposingAnsage` — the receiving end of the envelope: one optional integer,
    never gating, and carrying no announced number unless a workflow passes one.
    It opens at 0 rather than empty — 0 is what "nothing was announced against
    you" is worth, and a grey placeholder sat oddly beside steppers that all show
    a real figure. The defender reads the number off the attacker's card and
    types it. There is deliberately no shortcut that
    writes it onto their sheet for them — the card publishes, nothing pushes.
  - `toggleModifier` — a rule the player confirms rather than computes, today
    only `Rüstung umgehen` cancelling a Stelle's RW. Offered on every padded
    location and never pre-ticked: the attack card carries an amount, not a
    reason, so it cannot say a bypass was bought.
  - `envelope` — the attacker's half of an exchange, merged with
    `ansageEnvelope(ansage, zone)` at roll time into `flags.tno.envelope`. No
    per-Manöver list rides along beside it any more.
  - `consequence` — what a failure costs, worded by the builder rather than the
    dialog: a function of the answers, whose result `rollTno` keeps only when the
    dice actually failed. The resistance roll is the only caller, and what it
    returns is the applied damage — `appliedDamage(value, zone)` from
    `maneuvers.mjs` cashing in the Stelle multiplier the rest of the system only
    ever names
    (`tests/documents/actor-resistance-roll.test.js › cashes in the Stelle multiplier and shows the arithmetic it did`).
    It reads the same two answers the threshold does, so the card and the
    breakdown cannot disagree, and it writes nothing: damage entry stays manual.
  - `afterRoll` — runs only once the dice are cast, which is what lets the
    repeated-defence counter count rolls rather than intentions.

  It also owns an independent actor-state bucket: `_actorModifiers` reads the
  damage malus for every roll, regardless of workflow or form state, and
  `_fixedModifierComponents` merges it first. It then owns two *conditional*
  components: `_conditionalModifiers` adds the
  armour SV step to whatever roll is currently built on Beweglichkeit, and the
  FV step to whatever roll has declared anything at all. Two things declare: a
  non-zero Ansage, and a Stelle other than the Torso — the zone prices *are*
  Ansagen ("normale Ansageregeln gelten hier auf alles"), so an aimed attack is a
  Manöver. The Torso is not, being where an unannounced blow lands
  (`tests/documents/roll-dialog.test.js › makes an aimed attack a Manöver, and the Torso not`).
- [`roll-card.hbs`](../../../templates/chat/roll-card.hbs) renders the envelope
  as plain text under the outcome — always visible, never inside the collapsible
  tooltip, because the card is the only record of what was announced. Above it
  sits the `consequence` box, on failed rolls only: the one thing on a card that
  still asks something of the player, so it is stated in the unit the damage
  widget takes rather than as the arithmetic that produced it.
  `envelopeLines` in [`helpers/dice.mjs`](../../../module/helpers/dice.mjs)
  builds those lines: one Ansage figure rather than a penalty per defence,
  because which roll it was aimed at is what the two players said out loud.
- The item popover keeps Attack primary and places Parry alongside it in the
  combat row.
  [`actor-paperdoll.hbs`](../../../templates/actor/parts/actor-paperdoll.hbs)
  places the location-independent Dodge action beneath the silhouette and
  carries each location's resistance trigger twice: the silhouette's four
  `data-zone` shapes, and an `.armor-resist` anchor on every zone row — filled
  or empty, never on the Unterkleidung, which is not a hit location.

## The dialog as a ledger

[`roll-dialog.hbs`](../../../templates/apps/roll-dialog.hbs) is a bookkeeping
sheet: `.tno-ledger` is two columns — the line item on the left, its signed
contribution to the Schwelle in a rigid `Δ SCHW.` column on the right — and the
total at the foot is that column's sum. Every value that moves the
threshold is one row; the rows are grouped by **who owns the answer**, and the
space between the groups is all that marks them.

| Group | Rows | `data-row` | Renders when |
| --- | --- | --- | --- |
| *(head)* `POSTEN` / `Δ SCHW.` | column heads | — | always |
| ① what you bring | attribute · skill rank / free skill / 2nd attribute · `damageMalus` · `fixedModifiers` · `armorMalus` · `maneuverMalus` | `attributeA`, `skill`, `freeSkill`, `attributeB`, `damageMalus`, `fixed-<i>`, `armorMalus`, `maneuverMalus` | always |
| ② what you are handed | the comparison line · `requiredValue` · `opposingAnsage` · `toggleModifier` | `context`, `requiredValue`, `opposingAnsage`, `toggleModifier` | `hasGivenGroup` |
| ③ what you decide | `zonePicker` · `ansage` · the `±3` stepper · Idee | `zone`, `ansage`, `bonus`, `idea` | `hasChosenGroup` |
| footer | Wurftyp · total (`SCHWELLE`) · odds · Würfeln | — | always |

Properties of that layout that are load-bearing:

**Every line signs the same way: `+` helps the roller, `−` hurts.** So the Δ
column reads top-to-bottom as "who is on my side". `_deltaCell(value, state)` is
the single formatter — `is-positive` / `is-negative` / `is-neutral` for a set
amount, `is-pending` (a blue `?`) for a line still awaiting its answer, and
`is-provisional` (parenthesised, muted) for a line set up but not armed: an
unticked `Rüstung umgehen`, an unspent Idee. A provisional line is not in the
sum until armed (`tests/documents/roll-dialog.test.js › reads a line still
awaiting its answer as pending, and an unarmed one as provisional`).

**One line inside the ledger, and it is the column head.** `.tno-ledger-head`
keeps its rule because it names the two columns every row aligns to; nothing
below it carries one. Rows used to be hairlined off each other and the three
groups introduced by a labelled rule each (*was dir gegeben wird*, *was du
entscheidest*, since removed along with their `TNO.Roll.Divider.*` keys) — about
a dozen horizontals in a 340px column, read as stripes. A row is tracked across
by the tabular, right-aligned Δ it ends in; a group is marked by 9px of space
above it. The rule that decides such a case: **a rule has to do work no gap
could do.**

**`getData` and `_refresh` paint the Δ column off the same helpers.** `getData`
seeds each dynamic cell; `_repaintLedgerDeltas` re-runs the identical
`_contextComponent` / `_requiredValueComponent` / `_zoneComponent` /
`_ansageComponent` / … calls on every change and rewrites the `[data-role]` cell
plus the picker summary labels beside it. It repaints values, never rebuilds
rows, so typed contents and focus survive — the same discipline the old
questionnaire used. Static lines (a locked attribute, the skill rank, the gear
requirements) carry no `data-role` and are painted once by the template.
`_breakdownParts` is now read by the **chat card and the message flags only**.
The footer used to paint the same list as a strip of signed chips under the
total, which restated the Δ column standing directly above it; that strip, its
`_renderSignedReadouts` painter and the `renderSignedChips` helper it called are
gone. `keeps breakdown parts, text and threshold arithmetic in lockstep` still
guards the sum.

**Every ± control in the dialog wears one look**, and the two that exist share
their rules outright rather than being kept in step by hand:
`.tno-bonus-stepper-group, .tno-ledger-stepper` and
`.tno-bonus-stepper, .tno-ledger-step` are single selector groups in
[`_dice-dialog.scss`](../../../src/scss/components/_dice-dialog.scss). Three
separate slabs with air between them — 34×28 buttons around a 44×26 middle —
rather than a bordered block with a field sunk into it, which is what the
announced-value field used to be.

What differs is only the middle's payload, and only where it must. The
Modifikation moves in Malusstufen and its middle is a **button**: it shows the
value, and clicking it resets to `±0`. A ledger value moves by one and its
middle is the **input** you type the announced number into — transparent at rest
so the two read alike, with a faint well on hover and focus, because a field you
can type into has to say so and a button that resets does not.

Both middles are pinned to `$c-dark` rather than left to inherit: a `<button>`
takes the UA's pure black and an `<input>` the sheet's ink, which put the two at
different darknesses side by side. Every stepped field also opens on a **value**
rather than a placeholder, so nothing in the row renders grey where its
neighbours render solid. The one glyph that still differs is deliberate — the
Modifikation shows `±0` because it is a signed modifier that can go either way,
while a value field shows `0` because it is a magnitude with a floor of 0.

**One type size, and one checkbox, for a row.** Every line's *name* is set at
13px/normal, whatever control the line carries — a `<label>` in front of a
stepper used to come out bold and the Idee toggle brought its own 11px, so the
same kind of thing was set three ways down one column. The Δ column matches it,
including the comparison's resolved Δ, which was set larger and therefore was
not really in the column it belonged to. Checkboxes are the plain browser
control at the left of their row, aligned with each other rather than with the
text beside them: the Idee toggle used to visually replace its checkbox with a
12px square of its own, which put two different checkboxes at two different
sizes in one column. Its `padding` survives — that inset is what gives the armed
row a tinted chip to sit in — but the label is pulled back by exactly that inset
so the box still starts where its neighbour's does.

**An input line keeps its name and its control on one row**
(`.tno-ledger-row--input`): label left, a compact control pushed right. Stacking
the label above the control made the announced-value line ~3.5x the height of a
plain one (89px against 23px), and in a column whose whole purpose is to be
scanned top to bottom that single row broke the scan. It is 34px now, and the
placeholder went with it: a 3rem field only ever clipped it, and the row's
`.tno-ledger-info` marker already carries that sentence in full on hover.

**Every question is one line.** `preRollContext` and `zonePicker` each render a
`.tno-ledger-row--picker`: the question is the line's own `<legend>`, its answers
sit in the left cell, and the resolved Δ sits in the ledger's own column beside
them. A workflow that supplies an `anchor` — the reader's own number — gets it as
a second column inside that cell (`.tno-comparison-anchor`, a faint chip, never a
tile), which is what makes the resistance roll's penetration ladder a comparison
rather than a list.

This used to be two units per question: a full-width `.tno-ledger-control` block
followed by a `data-row` summary line naming the pick. It printed the **same
sentence twice** until something was picked — the summary fell back to the
question — and it gave a picker no Δ of its own until answered. Only the
resistance comparison had the one-line treatment; the attack's reach toggle and
Stelle tiles did not, so the two dialogs did not look like the same dialog.
The tiles themselves were the last part of that to be squared up: the Stelle was
the only picker wearing all three slots, the range bands wore two of them in the
wrong order, and the penetration ladder never printed what a rung was worth.
`_isComparison`, `hasComparisonRow` and the two summary-label repaints went with
it (`tests/documents/roll-dialog.test.js › gives the Stelle, the Ansage and the
scene ±3 one ledger line each`).

The Stelle at the Torso contributes nothing and yields no component, so its Δ
reads `±0` rather than being blank. The announced Schadenswert stays an ordinary
input row under the comparison, renamed by the pick above it (`Schaden (S)` /
`Wucht (WS)`).

**Attack, Parry and Resistance all ask for a `width` of 400** rather than the
class default of 340, which was picked when a picker still had the full dialog
width to itself and now has to share the row with the Δ column. Below 320px the
container query stacks a picker and its anchor.

The attribute chip grid, the free-skill field and the second-attribute select
keep the `.tno-ledger-control` + summary-line shape. Their summary is not a
restatement of the question but the base component itself — `Stärke +3` — and
the 3×4 heatmap grid is too tall to sit in a row's left cell.

**The one blocking line leads its group.** Only `preRollContext` gates submit
(`_canSubmit`), and it sits at the top of group ②. Until it is answered the
total shows `—`, the odds are empty, the Würfeln button is disabled and names
the missing field, and its Δ cell shows the blue `?`.

`requiredValue` used to gate alongside it, on the rule that an untouched field
and a typed zero were different answers. That was dropped deliberately: the
announced Schadenswert now opens at 0 and is edited. The comparison keeps its
gate because nothing could default it — it decides *which* of the attacker's two
damage values applies and whether the roll earns its `+3`, so a default would be
picking one of those for the player. The cost of the trade is real and worth
naming: a resistance roll can now be made carrying a damage value nobody
confirmed, and the consequence line on a failed card will say `0` when that
happens
(`tests/documents/actor-resistance-roll.test.js › states nothing until the comparison names a pool`).

**A weapon's own maluses are facts about the character, so they lead in group
①** — collected under `.tno-roll-gear-modifiers` (a `display: contents` wrapper,
so they keep the ledger's rhythm) as the half that was arrived at rather than
chosen. The GM's `±3` sits in group ③ with the Ansagen, since it is
one more number being decided rather than a fixed part of the roll. The locked
combat attribute shows its heatmap-coloured value chip; an unlocked roll shows
the chip grid as a `.tno-ledger-control` and names the pick on the line below.

**The footer runs last input → total → trigger.** The Wurftyp picker leads it:
it carries **no Δ column** — it leaves the Schwelle untouched, so folding it
into the ledger would break the "every row sums" contract — but it *does* move
the odds printed inside the box, and an input that sat below its own readout,
wedged between the total and the button, was in the wrong place twice over. The
total then closes the page as the answer to every line above it, with the
`Würfeln` button directly under the number it acts on. It is a plain block: the
footer was `position: sticky` with an opaque, blurred backing — the occlusion a
pinned strip needs so the ledger cannot scroll through it — and that was dropped
along with the pinning. A hairline is the whole separation now.
`_thresholdReadout()` stays the sole read-side for readiness, threshold and
odds.

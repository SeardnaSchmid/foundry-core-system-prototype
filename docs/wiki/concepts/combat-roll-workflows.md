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
    threshold breakdown and chat card. One column is a *ladder* rather than a
    grid of one: each rung reads across, comparison first and consequence
    beside it. It may additionally carry an `anchor` — `{label, value}` — the
    reader's own half of a comparison, rendered as a readout beside the
    choices and never as one of them
    (`tests/documents/roll-dialog.test.js › carries a readout the choices are measured against`).
    A zero anchor is a real answer and is stated, not dropped
    (`tests/documents/roll-dialog.test.js › keeps a zero`).
  - `requiredValue` — one required typed number, e.g. the announced Schadenswert.
    Optionally `labels` (one per `preRollContext` choice key) and `hint`. The
    resistance roll uses both: the attacker's card prints a Schaden *and* a
    Wucht value, and the penetration comparison is precisely what decides which
    of them landed — so the field renames itself to `Schaden (S)` or
    `Wucht (WS)` as the tile above is picked, the breakdown carries the neutral
    `Schadenswert`, and the hint below the row says both numbers are on the
    attacker's card. The labels stay short because they are column heads in a
    three-column row: whose numbers these are is said once by the row's own
    middle column (`Deine RH`) and once by that hint.
    Without it the player had to hold that mapping in their head
    (`tests/documents/actor-resistance-roll.test.js › names the damage field after the comparison that was picked`).
    `_refresh` repaints the label through the field's own `input[name]` and its
    `labels` collection, so it is independent of where the field sits — the
    field's own class is shared with the opposing-Ansage row. A vertical `+`/`−`
    stepper frames the input, clamped by `_stepRequiredValue` to the same
    `min`/`max` the field carries, with the reached bound shown as a disabled
    button rather than enforced silently
    (`tests/documents/actor-resistance-roll.test.js › steps the announced damage inside the bounds the workflow set`).
    A blank field counts as zero for an explicit click, and still counts as
    "nothing announced yet" everywhere else.
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
    never gating, and always offered blank. The defender reads the number off
    the attacker's card and types it. There is deliberately no shortcut that
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

## The dialog's six questions

[`roll-dialog.hbs`](../../../templates/apps/roll-dialog.hbs) is one scrolling
page of headed questions, not a form of fields. The order is **who owns the
answer**, and two labelled dividers make that split visible rather than implied.

| # | Question | Holds | Renders when |
| --- | --- | --- | --- |
| 1 | Womit würfelst du? | attribute · skill rank · `damageMalus` · `fixedModifiers` · `armorMalus` | always |
| — | *was dir gegeben wird* | divider | anything in 2–3 does |
| 2 | Wie steht ihr zueinander? | `preRollContext` · its `anchor` · `requiredValue` | `hasSituationSection` |
| 3 | Was wurde gegen dich angesagt? | `opposingAnsage` · `toggleModifier` | `hasAgainstSection` — defences only |
| — | *was du entscheidest* | divider | anything in 4–6 does |
| 4 | Sagst du etwas an oder passt du etwas an? / Passt du etwas an? | `zonePicker` · `ansage` · the `±3` stepper | `hasAttemptSection`; the shorter question is used when only the stepper renders |
| 5 | Setzt du etwas ein? | Idee / edge pool | `hasIdeaOption` |
| 6 | Wie würfelst du? | the advantage picker | not fixed-value mode |
| — | sticky footer | threshold · odds · Würfeln | always |

Four properties of that layout are deliberate:

**A divider needs a section on its far side.** `hasGivenDivider` is exactly
question 2 or 3, and `hasChosenDivider` is exactly question 4, 5 or 6. A plain
skill roll therefore has only the second divider; a fixed roll with no later
question has neither.

**Question 2 becomes a table when a comparison is being made.** `anchor` plus
`requiredValue` turns the situation section into three columns — the choices as
a one-column ladder, the reader's own number as a readout beside it, and the
number they were told last. It reads as a table, which is a claim about
alignment and has to be paid for in three places: the radiogroup's legend, the
readout's caption and the number field's label all wear one header treatment,
so the three names sit on one line; the cells are stretched to a single row
height rather than each ending where its own content does; and the ladder's
rungs are `1fr` rows, so a consequence needing a second line does not make one
answer taller than the other two. The given number and the typed one are set at
the same size — they are the same kind of thing, and that is most of what makes
the row read as a comparison instead of a readout beside a form field.

The resistance roll is the only workflow that asks for all three, and the only
one that asks for a `width` — 400 rather than the class default of 340, which
was picked for a column of questions and leaves a three-column row clipping its
own placeholder. It used to be prose ("Deine RH ist 8 — wie hoch war die
Durchdringung?") with the damage field a paragraph below, which asked the
reader to hold their own RH in their head while choosing against it and then
separated the pick from the number that pick names. Below 320px the ladder
takes the full row and the two fields share the one beneath it — the same
reading order, and the reason the form declares a `roll-dialog` size container
at all.

**The question that can block the roll leads.** Only `preRollContext` and
`requiredValue` gate submit, so they come first among the inputs. They used to
sit *below* the zone tiles, which put the optional pick in front of the
mandatory one.

**A weapon's own maluses are not situational modifiers.** The global damage
malus, HH, the SV step and the repeated-defence malus sit in question 1 because
they are facts about the character. The GM's `±3` sits in question 4
with the Ansagen — sharing one "Modifikatoren" box with the weapon's own
requirements made a rule the player cannot change look like a number the GM
improvised, and standing alone in a box that was always open made it look like a
fixed part of the roll instead of one more thing being decided.
The locked combat attribute is shown beside its heatmap-coloured value in the
same row form as the skill rank. Unlocked skill, attribute and free rolls all
use the same attribute radiogroup; only the optional second attribute remains a
select, with each current value in its option label. Immutable gear rows expose
their rule consequence through the shared rich-tooltip treatment.

**Question 4 is a native `<details>`, closed by default.** Closed *is* the
Standardangriff: no Ansage, no modification, and the Torso. It renders `open`
whenever the roll already carries any of the three, so a re-render can never fold
a set value out of sight, and its `<summary>` carries a live signed-chip badge
(`Kopf −6 · Ansage −4 · Modifikation +3`) so a shut block never hides a cost.
`_refresh` repaints values rather than rebuilding rows, so that badge is the one
thing the restructure needed new JS for. The badge only reports — the threshold
reads each figure from the form data itself, so nothing in it is charged twice
(`tests/documents/roll-dialog.test.js › names the scene modification in the badge without charging it twice`).

The disclosure chrome itself is the `dialog-disclosure` mixin in
[`utils/_mixins.scss`](../../../src/scss/utils/_mixins.scss), shared with the
advance dialog's correction block so every expander in the system reads the
same. The gear sheet's `.gear-validation` deliberately does not use it: that one
is a status line popping a floating panel, a different gesture wearing the same
element.

**The threshold is pinned, not scrolled.** It is last in document order because
it is the answer to everything above it, and `position: sticky` because watching
it move while answering is the reason this is one page rather than a wizard. The
advantage picker sits *above* it: the roll type leaves the threshold alone but
changes the odds printed inside that box. `_thresholdReadout()` is the sole
read-side for submit readiness, threshold and odds: until every required answer
exists the box shows `—`, the odds are empty and the button names the missing
field. Once ready, the threshold's components render as a compact wrapping chip
row built with DOM nodes and `textContent`, never caller-provided HTML.

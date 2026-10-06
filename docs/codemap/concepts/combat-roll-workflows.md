---
type: concept
title: Standalone combat roll workflows
description: Code map for the uncoupled Attack, Parry, Dodge and Resistance rolls, the Haltung that gates the defences, and the free Ansage declared inside an attack.
tags: [combat, weapons, defence, rolls, maneuvers]
resource: [module/helpers/combat-actions.mjs, module/helpers/maneuvers.mjs, module/helpers/items.mjs, module/documents/item.mjs, module/documents/actor.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/actor/parts/actor-paperdoll.hbs, templates/actor/actor-character-sheet.hbs, templates/apps/roll-dialog.hbs, templates/chat/roll-card.hbs]
spec: docs/design/workflows/combat-workflow-prd.md
related: [concepts/dice-resolution, concepts/item-roles, concepts/skills, concepts/damage, concepts/combat-turn-order]
---

# Standalone combat roll workflows

The mechanics of record are in
[`docs/design/workflows/combat-workflow-prd.md`](../../design/workflows/combat-workflow-prd.md).
This page maps those workflows to their implementation.

**The rule the whole layout follows: no sheet ever reads another sheet.** A
workflow either computes a value from its own actor, asks the player to pick a
fact both sides can see, or asks them to type a number the other side announced.
Nothing anywhere in *this* path takes a target, opens a second document, or
checks another user's permissions.

The scope of that sentence is the **roll** workflows on this page, and it is
scoped deliberately rather than by omission. A roll belongs to the person making
it, so nothing about it needs another client. The turn order does not: the
activation history is one object every participant shares, and a player may not
write it — so the interrupt is the one place in this system where a client asks
another client to act. See
[combat-turn-order.md](combat-turn-order.md#the-one-socket) for why the two sit
on opposite sides of that line.

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
  global-free. `DAMAGE_RULES` and `DEFAULT_ZONE` resolve whether the
  location selected on the defender's paper doll adds Wuchtschaden (only the Kopf); attacks do not choose or
  transmit a location. `ansageEnvelope(ansage)` carries only the attacker's own
  announced magnitude. It models no other Manöver: an Ansage is one free number
  the table agrees on before typing it.
- [`helpers/items.mjs`](../../../module/helpers/items.mjs) contains the pure
  weapon-profile, requirement, handling, range-band, and DK-choice helpers.
  `requirementMalusSteps` grades an **SV** shortfall into Malusstufen;
  `weaponRequirementStatus` reports it for a weapon, and the SV malus reaches
  every attack and parry. `armorSvMalus` answers the second, differently shaped
  requirement — the armour SV — for a given set of attributes, and
  `armorPenetrationChoices` returns the damage table's three outcomes with the
  pool and whether RW survives. A separately confirmed `Rüstung umgehen`
  chooses Schaden and removes only the outer armour's `rwAddon`; the
  Unterkleidung's `rwSuit` continues to protect the location.
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
  that the threshold, the Beleg, the chat card and the message flags are all
  derived from. How the inputs are laid out is described under
  [the dialog](#the-dialog-questions-and-beleg) below; what each one is:
  - `preRollContext` — one required answer. A two-option `toggle` (the reach
    advantage), a radio-tile grid of 1, 2, 3, 5 or 7 columns (range bands), a
    select, or a `compare`: a typed number that `compare.derive(value)` turns
    into one of the choices. The resistance roll uses `compare` — the defender
    types the attacker's RB and the dialog compares it against the struck
    location's RH (`tests/documents/actor-resistance-roll.test.js › derives the penetration outcome from the RB typed against the RH of the struck location`).
    Each choice's `componentLabel` is the noun recorded in the breakdown; a
    choice supplying a `headline` is one whose `label` is an effect, so the
    headline names it and the label captions it
    (`tests/documents/roll-dialog.test.js › names a tile by its answer and captions it only where there is an effect to state`).
    Optional `note` (shown beside the question — the weapon's own DK via
    `dkNote`), `ask` ("Frag den Angreifer"), `hint` (the ⓘ tooltip), `origin`
    (its Beleg group) and `anchor` (the reader's own number, kept for callers;
    `tests/documents/roll-dialog.test.js › carries a readout the choices are measured against`,
    `tests/documents/roll-dialog.test.js › keeps a zero`).
  - `requiredValue` — one typed number, e.g. the announced Schadenswert.
    Optionally `labels` (one per context choice), `toggleLabel`, `hint`, `ask`,
    `origin`, and two flags the resistance roll sets: `required` (opens blank
    and holds the roll until typed) and `lockedUntilContext` (closed until the
    context, or a waiving toggle, has said which value applies —
    `tests/documents/actor-resistance-roll.test.js › keeps the damage question closed until the comparison or a bypass names it`).
    Without `required` it opens at 0 and never gates
    (`tests/documents/roll-dialog.test.js › opens the announced value at zero and never blocks the roll on it`).
    The field renames itself with the pick above it
    (`tests/documents/actor-resistance-roll.test.js › names the damage field after the comparison that was picked`).
  - `ansage` — one optional integer that worsens this roll by what it declares,
    unpriced and ungated; negative eases it without counting as a Manöver.
    `_ansageValue` reads it, `_ansageComponent` signs it.
  - `toggleModifier` — a rule the player confirms rather than computes, today
    only `Rüstung umgehen`, asked as a yes/no question against the private RA of
    the struck outer armour. It is offered only when such an outer piece exists:
    yes means the announced value was at least RA, skips the RB/RH comparison,
    chooses Schaden and subtracts exactly `rwAddon`; no (including every lower
    announcement) leaves the normal comparison in place. `rwSuit` remains.
  - `phase` (`{label, detail}`) and `sources` (`{weapon, armor}`) — display
    only: the strip at the top and the names that complete a Beleg heading.
  - `envelope` — the attacker's half of an exchange, merged with
    `ansageEnvelope(ansage)` at roll time into `flags.tno.envelope`.
  - `consequence` — what a failure costs, worded by the builder: a function of
    the answers, kept by `rollTno` only when the dice fail. The resistance roll
    returns the applied damage via `appliedDamage(value, zone, sharp)`
    (`tests/documents/actor-resistance-roll.test.js › adds the WS once more as Wuchtschaden on a head hit`,
    `tests/documents/actor-resistance-roll.test.js › states nothing until the comparison names a pool`).
  - `afterRoll` — runs only once the dice are cast, which is what lets the
    repeated-defence counter count rolls rather than intentions.

  Each fixed modifier may carry an `origin` (`character`, `weapon`, `armor`,
  `attack`, `situation`, `choice`), which only the Beleg reads; the builders in
  `combat-actions.mjs` tag theirs. The dialog also owns an actor-state bucket:
  `_actorModifiers` reads the damage malus for every roll, and
  `_conditionalModifiers` adds the armour SV step to any roll built on
  Beweglichkeit.
- [`roll-card.hbs`](../../../templates/chat/roll-card.hbs) renders the envelope
  as plain text under the outcome — always visible, never inside the collapsible
  tooltip, because the card is the only record of what was announced. Above it
  sits the `consequence` box, on failed rolls only: the one thing on a card that
  still asks something of the player, so it is stated in the unit the damage
  widget takes rather than as the arithmetic that produced it.
  `envelopeLines` in [`helpers/dice.mjs`](../../../module/helpers/dice.mjs)
  builds those lines. A location is deliberately absent: the defender selects
  the actual hit location on their own paper doll when opening resistance.
- **The card shows what the roll was made with.** `angriffOptions` and
  `paradeOptions` put the weapon's own `img` in the roll options;
  `widerstandOptions` puts the armour's, through `wornArmorArt` — the piece at
  the struck location first, the Unterkleidung second, nothing third. That is
  the order `resolveArmor` sums the RW in, so the picture and the RW line are
  never about different pieces, and it is a chain of *icons*: a helmet with no
  art of its own falls through to the suit, which is padding that location too.
  The dialog hands whichever it got to `rollTno`, which renders it beside the
  flavor heading and keeps it in `flags.tno`. It is decoration and nothing else — no workflow reads it,
  and a roll with no object behind it (a bare attribute, an Ausweichen) renders
  no picture rather than a placeholder that would mean nothing. Rerolls do not
  disturb it: the edge actions patch sub-containers of a persisted card, never
  its heading.
- The item popover keeps Attack primary (filled) and places Parry alongside it
  in the main-action row.
  [`actor-paperdoll.hbs`](../../../templates/actor/parts/actor-paperdoll.hbs)
  places the location-independent Dodge action beneath the silhouette and
  carries each location's resistance trigger twice: the silhouette's four
  `data-zone` shapes, and an `.armor-resist` anchor on every zone row — filled
  or empty, never on the Unterkleidung, which is not a hit location.

## The dialog: questions and Beleg

[`roll-dialog.hbs`](../../../templates/apps/roll-dialog.hbs), styled in
[`_dice-dialog.scss`](../../../src/scss/components/_dice-dialog.scss) under
`.tno-roll-dialog.tno-wurf`, has three parts top to bottom:

1. **The phase strip** — `_phase()`: the workflow's `phase`, or one derived
   from the mode (skill, ability, free, fixed).
2. **"Zu klären"** — only what the roller answers. `_questions(data)` is the one
  ordered list: `toggle`, `ansage`, `context`, `required`, `attribute`,
   `attributeB`, `free`, `bonus`
   (`−3 −1 value +1 +3`; the value resets), `idea` (pips + a `+N` toggle). Each
   carries its number, its `pending` and `locked` state; the form, the Beleg's
   marks (①②…), the "Noch offen" line and `_canSubmit` all read it
   (`tests/documents/roll-dialog.test.js › asks only what the roller answers, numbered in one order`).
   Attack and parry have no toggle, so their visible order starts with Ansage,
   then weapon context, then situational modifier.
   A pending question is `.is-open` (dashed blue); a locked one `.is-locked`.
   A locked combat attribute is not asked at all — it is a fact.
3. **The card** — the Beleg toggle with one chip per group, the Schwelle,
   the odds with the five roll-type buttons, the open-questions line and
   Würfeln. While a question is open the Schwelle and odds stand in
   parentheses (`_thresholdReadout`), the button is `aria-disabled` +
   `.is-blocked` but still pressable, and `_onSubmit` routes the press to
   `_rejectSubmit`, which names the missing answer and flashes its question
   (`tests/documents/roll-dialog.test.js › refuses an unanswered roll instead of making it, and marks the control`).

**The Beleg** is the breakdown: `_belegGroups(data)` lists every component
under its origin (Charakter, Waffe, Rüstung, Angriff gegen dich, Lage, Deine
Wahl) with a state — `fact`, `active`, `pending` (`?`), `provisional`
(an unspent Idee, in parentheses) or `struck` (a waived comparison). It is
built from the same component helpers as `_computeThreshold`, and its counted
rows sum to the threshold
(`tests/documents/roll-dialog.test.js › sums the Beleg to the Schwelle, grouped by where each line comes from`).
`_belegModifiers` tags the modifiers with their origin and their `hint`
without putting either on the components that go to the chat card; a row with
a hint gets an ⓘ tooltip in the drawer. The drawer opens upward over the
questions so the Schwelle never moves; `_paintBeleg` rebuilds it (and the
chips) on every `_refresh`, and its open state is kept for the session.

**`_refresh` repaints, never re-renders**: question states, the bypass and Idee
buttons, the verdict a typed RB selects, the lock on the damage field, the
Ansage deltas, stepper bounds (read off each input's own `min`/`max` via
`_stepValue`), the Beleg, the Schwelle, the odds and the button. Typed contents
and focus survive. `_components` is the one list behind both the Schwelle and
the chat card's breakdown
(`tests/documents/roll-dialog.test.js › keeps the components the card lists and the threshold in lockstep`).

The default width is 500; a workflow may still pass `width`.

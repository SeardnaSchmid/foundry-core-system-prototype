---
type: concept
title: Standalone combat roll workflows
description: Code map for the uncoupled Attack, Parry, Dodge and Resistance rolls, the Haltung that gates the defences, and the Ansagen declared inside an attack.
tags: [combat, weapons, defence, rolls, maneuvers]
resource: [module/helpers/combat-actions.mjs, module/helpers/maneuvers.mjs, module/helpers/items.mjs, module/documents/item.mjs, module/documents/actor.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/actor/parts/actor-paperdoll.hbs, templates/actor/actor-character-sheet.hbs, templates/chat/roll-card.hbs]
spec: docs/design/workflows/combat-workflow-prd.md
related: [concepts/dice-resolution, concepts/item-roles, concepts/skills]
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
  `countDefense` and `takeStance`.
- [`helpers/maneuvers.mjs`](../../../module/helpers/maneuvers.mjs) is pure and
  global-free: `ansageKosten` (1:1 to the rank, 2:1 past it), the `MANEUVERS`
  table of the nine declarable Manöver, `declarableManeuvers`, `ansageEnvelope`
  (what crosses to the defender) and `DAMAGE_RULES` / `damageDistribution`
  (where a hit lands, given the Stelle).
- [`helpers/items.mjs`](../../../module/helpers/items.mjs) contains the pure
  weapon-profile, requirement, handling, range-band, and DK-choice helpers.
  `requirementMalusSteps` grades an **SV** shortfall into Malusstufen;
  `weaponRequirementStatus` reports it alongside the flat one-step FV shortfall.
  The SV malus reaches every attack and parry; the FV one is a Manöver rule and
  is handed to the dialog as `maneuverMalus`, which applies it only once an
  Ansage is declared. `armorSvMalus` answers the third, differently shaped
  requirement — the armour SV — for a given set of attributes, and
  `armorPenetrationChoices` returns the damage table's three outcomes.
- [`documents/item.mjs`](../../../module/documents/item.mjs) and
  [`documents/actor.mjs`](../../../module/documents/actor.mjs) are now thin:
  `openWeaponCheck`, `openWeaponParry` and `openResistanceCheck(zone)` call a
  builder and render what comes back. Both reach the dialog through
  `game.tno.TnoRollDialog` rather than by importing it, which keeps
  `documents/` from depending on `apps/`. `prepareDerivedData` publishes
  `derived.stance` and `derived.defenses.{parry,dodge}.{available,malus}`.
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
  - `preRollContext` — one required pick, as a compact radio-tile grid (2, 3, 5
    or 7 columns) or a select.
  - `requiredValue` — one required typed number, e.g. the announced Schadenswert.
  - `ansagen` — the repeatable Manöver block, folded shut by default because
    most attacks declare nothing. Optional and combinable; each row prices itself
    live and the summed cost enters as a single component. Entries carrying a
    `group` (today only the three Trefferzonen) render as one exclusive picker
    instead of a row each — an attack has one Stelle, and a Betrag the rule fixes
    has no zero to mean "not declared" with
    (`tests/documents/roll-dialog.test.js › declares nothing until something is chosen`).
  - `opposingAnsage` — the receiving end of the envelope: one optional integer,
    never gating.
  - `toggleModifier` — a rule the other side announced and this player confirms,
    today only `Rüstung umgehen` cancelling a Stelle's RW.
  - `envelope` — the attacker's half of an exchange, merged with
    `ansageEnvelope()` at roll time into `flags.tno.envelope`.
  - `afterRoll` — runs only once the dice are cast, which is what lets the
    repeated-defence counter count rolls rather than intentions.

  It also owns two *conditional* components: `_conditionalModifiers` adds the
  armour SV step to whatever roll is currently built on Beweglichkeit, and the
  FV step to whatever roll currently has an Ansage on it.
- [`roll-card.hbs`](../../../templates/chat/roll-card.hbs) renders the envelope
  as plain text under the outcome — always visible, never inside the collapsible
  tooltip, because the card is the only record of what was announced.
- The item popover keeps Attack primary and places Parry alongside it in the
  combat row.
  [`actor-paperdoll.hbs`](../../../templates/actor/parts/actor-paperdoll.hbs)
  places the location-independent Dodge action beneath the silhouette and
  carries each location's resistance trigger twice: the silhouette's four
  `data-zone` shapes, and an `.armor-resist` anchor on every zone row — filled
  or empty, never on the Unterkleidung, which is not a hit location.

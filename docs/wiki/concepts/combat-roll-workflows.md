---
type: concept
title: Standalone combat roll workflows
description: Code map for independent weapon Attack and Parry checks plus the character Dodge, Resistance and Manöver actions.
tags: [combat, weapons, defence, rolls]
resource: [module/helpers/items.mjs, module/documents/item.mjs, module/documents/actor.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/actor/parts/actor-paperdoll.hbs, templates/actor/actor-character-sheet.hbs]
spec: docs/design/combat-workflow-prd.md
related: [concepts/dice-resolution, concepts/item-roles, concepts/skills]
---

# Standalone combat roll workflows

The mechanics of record are in
[`docs/design/combat-workflow-prd.md`](../../design/combat-workflow-prd.md).
This page maps those workflows to their implementation.

- [`helpers/items.mjs`](../../../module/helpers/items.mjs) contains the pure
  weapon-profile, requirement, handling, range-band, and DK-choice helpers.
  `requirementMalusSteps` grades an **SV** shortfall into Malusstufen;
  `weaponRequirementStatus` reports it alongside the flat one-step FV shortfall.
  Only the SV malus reaches an attack or parry — the FV one is a Manöver rule —
  so `#weaponFixedModifiers` in `item.mjs` emits exactly one requirement
  component. The FV shortfall reaches a roll through `maneuverWeaponChoices`
  instead, which prices every declarable weapon. `armorSvMalus` answers the
  third, differently shaped requirement — the armour SV — for a given set of
  attributes, and `armorPenetrationChoices` returns the damage table's three
  outcomes.
- [`documents/item.mjs`](../../../module/documents/item.mjs) opens owned weapon
  Attack and Parry dialogs;
  [`documents/actor.mjs`](../../../module/documents/actor.mjs) owns the two
  workflows that belong to the character rather than to a piece of gear —
  `openResistanceCheck(zone)` and `maneuverPreRollContext()`. Both reach the
  dialog through `game.tno.TnoRollDialog` rather than by importing it, which
  keeps `documents/` from depending on `apps/`.
  [`sheets/actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs) exposes
  Dodge, routes paper-doll clicks to the resistance roll, adds the weapon
  context to any skill in the `maneuvers` category, and supplies the popover
  action state.
- [`apps/roll-dialog.mjs`](../../../module/apps/roll-dialog.mjs) owns the
  optional required pre-roll context and the optional required typed value
  (`requiredValue`). Both selected components are passed to `rollTno()` with the
  normal component list and stored in the message flags. The weapon contexts and
  the penetration comparison use its compact radio-tile picker (3, 5 or 7
  columns); the Manöver weapon list uses the plain select, being name-first and
  unbounded rather than a fixed set of signed numbers.
  The dialog also owns one *conditional* component: `_conditionalModifiers`
  adds the armour SV step to whatever roll is currently built on Beweglichkeit,
  which is why no workflow passes that malus in itself.
- The item popover keeps Attack primary and places Parry alongside it in the
  combat row.
  The character-sheet template places Dodge directly after Acrobatics in the
  normal Basics skill list; it is a roll action, not an advanceable rank.
  [`actor-paperdoll.hbs`](../../../templates/actor/parts/actor-paperdoll.hbs)
  carries the resistance trigger twice: the silhouette's four `data-zone`
  shapes, and an `.armor-resist` anchor on every zone row — filled or empty,
  never on the Unterkleidung, which is not a hit location.

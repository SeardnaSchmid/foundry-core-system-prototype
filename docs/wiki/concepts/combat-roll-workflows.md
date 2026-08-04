---
type: concept
title: Standalone combat roll workflows
description: Code map for independent weapon Attack and Parry checks plus the character Dodge action.
tags: [combat, weapons, defence, rolls]
resource: [module/helpers/items.mjs, module/documents/item.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/item-popover.hbs, templates/actor/actor-character-sheet.hbs]
spec: docs/design/combat-workflow-prd.md
related: [concepts/dice-resolution, concepts/item-roles, concepts/skills]
---

# Standalone combat roll workflows

The mechanics of record are in
[`docs/design/combat-workflow-prd.md`](../../design/combat-workflow-prd.md).
This page maps those workflows to their implementation.

- [`helpers/items.mjs`](../../../module/helpers/items.mjs) contains the pure
  weapon-profile, requirement, handling, range-band, and DK-choice helpers.
- [`documents/item.mjs`](../../../module/documents/item.mjs) opens owned weapon
  Attack and Parry dialogs, while
  [`sheets/actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs) exposes
  Dodge and supplies the popover action state.
- [`apps/roll-dialog.mjs`](../../../module/apps/roll-dialog.mjs) owns the
  optional required pre-roll context. Its selected component is passed to
  `rollTno()` with the normal component list and stored in the message flags.
- The item popover keeps Attack primary and places Parry in its secondary row.
  The character-sheet template places Dodge directly after Acrobatics in the
  normal Basics skill list; it is a roll action, not an advanceable rank.

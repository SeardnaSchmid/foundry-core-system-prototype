---
type: concept
title: Damage pools
description: The persisted sharp/blunt health counters, derived damage state, global roll modifier, and character-sheet controls.
tags: [damage, health, derived-data, rolls, character-sheet]
resource: [module/helpers/damage.mjs, module/documents/actor.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/actor-damage.hbs]
spec: docs/design/workflows/combat-workflow-prd.md
related: [concepts/attributes, concepts/combat-roll-workflows, architecture/data-schema, reference/ui-surfaces]
---

# Damage pools

The mechanics of record are in
[`docs/design/workflows/combat-workflow-prd.md`](../../design/workflows/combat-workflow-prd.md#damage-pools-and-stelle).
This page maps them to the implementation.

## Stored and derived state

`template.json` persists only `system.damage.{sharp,blunt}`. Old actors need no
migration: every read treats a missing field as 0.

[`resolveDamage()`](../../../module/helpers/damage.mjs) is the global-free pure
read side. It normalizes the two counters and trained-Strength capacity, derives
the blunt carried/converted split, effective sharp total, raw total, global
malus, full-track flag and `downed` flag. It never writes converted damage back
to either pool.

The capacity is the budget of **each pool separately**, not of both together:
`bluntCarried` clamps against the whole capacity, so a filling sharp pool never
pushes blunt into conversion. Only blunt past its own track converts, and that
spill is the sole coupling between the two.

`damageTrackRows()` in the same module is the display side, equally pure: it
lays a resolved result out as the banner's two counted box rows — Wucht above
Scharf — on two equally long but independent rulers, and clamps how many boxes
either row draws (`DAMAGE_TRACK_MAX_BOXES`) since neither pool has an upper
bound. The blunt row carries what still lies on its own track and, past the
mark, what has spilled off it; the sharp row carries the raw pool followed by
exactly that spill, so a box past the sharp row's mark *is* the `downed`
condition rather than a second read-out of it.

[`TnoActor.prepareDerivedData()`](../../../module/documents/actor.mjs) calls it
with `abilities.str.base` and publishes the complete result at
`system.derived.damage`.

## Consumers

- [`TnoRollDialog._actorModifiers()`](../../../module/apps/roll-dialog.mjs)
  reads the derived malus as its own always-on modifier bucket. It is merged
  first by `_fixedModifierComponents()`, the shared source for the threshold,
  breakdown, roll components and message flags.
- [`TnoActorSheet`](../../../module/sheets/actor-sheet.mjs) publishes the
  derived result plus its `rows` to the sheet context and handles the two manual
  steppers plus the clear-all action. All writes target the raw `system.damage.*`
  fields and clamp only at zero.
- [`actor-damage.hbs`](../../../templates/actor/parts/actor-damage.hbs) renders
  the block in the sheet banner's `.banner-meta` lane, under the value chips:
  two box rows with a two-letter tag (`tagKey`) and a stepper pair each, the
  global malus as the tall cell that binds them, and a clear button only while
  there is damage — absolutely positioned as a corner tab in the malus cell, so
  a block with damage is exactly as wide as one without. The full pool names,
  capacity, free remainder and conversion stay in the per-row tooltips; the
  German labels are too long to stand in the lane. Its styling sits with the
  banner in `src/scss/components/_forms.scss`.

Damage application after a resistance roll remains manual. No combat workflow
updates another actor or chooses a target.

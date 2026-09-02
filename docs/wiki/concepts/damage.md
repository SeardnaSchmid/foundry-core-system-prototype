---
type: concept
title: Damage pools
description: The persisted Schaden/Wuchtschaden health counters, derived damage state, global roll modifier, and character-sheet controls.
tags: [damage, health, derived-data, rolls, character-sheet]
resource: [module/helpers/damage.mjs, module/helpers/conditions.mjs, module/documents/actor.mjs, module/apps/roll-dialog.mjs, module/sheets/actor-sheet.mjs, templates/actor/parts/actor-malus.hbs, templates/actor/parts/actor-damage.hbs, templates/actor/parts/actor-status.hbs, templates/actor/parts/condition-panel.hbs]
spec: docs/design/header-banner-prd.md
related: [concepts/attributes, concepts/combat-roll-workflows, architecture/data-schema, reference/ui-surfaces]
---

# Damage pools

The mechanics of record are in
[`docs/design/workflows/combat-workflow-prd.md`](../../design/workflows/combat-workflow-prd.md#damage-pools-and-stelle).
This page maps them to the implementation.

## Stored and derived state

`template.json` persists only `system.damage.{sharp,blunt}`. Old actors need no
migration: every read treats a missing field as 0.

The rules name the two kinds **Schaden** and **Wuchtschaden**; the stored keys
are still `sharp` and `blunt`, which predate that naming. Read `sharp` as
Schaden everywhere below — the divergence is deliberate, since renaming a
persisted field would cost a migration and say nothing a label does not.

[`resolveDamage()`](../../../module/helpers/damage.mjs) is the global-free pure
read side. It normalizes the two counters and trained-Strength capacity, derives
the Wucht carried/converted split, effective Schaden total, raw total, global
malus, full-track flag and `downed` flag. It never writes converted damage back
to either pool.

The capacity is the budget of **each pool separately**, not of both together:
`bluntCarried` clamps against the whole capacity, so a filling Schaden pool
never pushes Wuchtschaden into conversion. Only Wuchtschaden past its own track
converts, and that spill is the sole coupling between the two.

`damageTrackRows()` in the same module is the display side, equally pure: it
lays a resolved result out as the banner's two counted box rows — Wucht above
Schaden — on two equally long but independent rulers, and clamps how many boxes
either row draws (`DAMAGE_TRACK_MAX_BOXES`) since neither pool has an upper
bound. The Wucht row carries what still lies on its own track and, past the
mark, what has spilled off it; the Schaden row carries the raw pool followed by
exactly that spill, so a box past the Schaden row's mark *is* the `downed`
condition rather than a second read-out of it.

[`TnoActor.prepareDerivedData()`](../../../module/documents/actor.mjs) calls it
with `abilities.str.base` and publishes the complete result at
`system.derived.damage`.

## Damage-derived conditions

[`resolveDamageConditions()`](../../../module/helpers/conditions.mjs) turns the
resolved pools into the status component's six fixed entries. Wuchtschaden and
effective Schaden form its two rows; core, legs and arms compare strictly
greater than trained Stärke, Beweglichkeit and Fingerfertigkeit respectively.
Converted Wuchtschaden is already part of effective Schaden, so it participates
in the severe row without being persisted or counted twice.

`system.conditionOverrides.<key>` stores `true`, `false` or `null` for each
entry. A missing or null value follows the comparison, while booleans force the
warning on or off. `resolveDamageConditions()` publishes both the full raster
and a severe-first active list. Suppressed entries remain in the former and are
absent from the latter. Every damage condition carries the `negative`
classification in addition to its mild/severe tone; the status collection uses
that metadata only on the inner condition box, while its surrounding pill stays
neutral. These warnings never alter the raw pools, roll malus or another rule
result.

Each light also names what it costs, as a static `effectKey` into
`TNO.Status.Effect.*`. The wording of record is the Zustände table in
[combat-workflow-prd.md](../../design/workflows/combat-workflow-prd.md#damage-pools-and-stelle);
nothing in the code acts on it, so adding a light's effect there and here is a
copy change, never a rules change.

## The condition collection

`resolveConditions()` is what the actor actually calls: the six damage warnings
plus **three derived conditions**, each a rule the system has already applied,
read back as a state.

| Resolver | Key | Reads | Tone | Effect |
| --- | --- | --- | --- | --- |
| `resolveDefenseCondition()` | `noDodge` | `defenses.dodge.available`, `defenses.parry.available` | severe | no Ausweichen — with or without a parry left |
| `resolveCarryCondition()` | `overloaded` | `carryState` — see [inventory.md](inventory.md#carrying) | mild at `noSprint`, severe at `crawlOnly` | the movement tier the load costs |
| `resolveArmorCondition()` | `armorTooHeavy` | `armorSvPenalty`, `armorSv`, base Stärke | mild | one Malusstufe on every Beweglichkeitswurf |

It is the collection the Zustände component renders, so **the collection and
the raster are not the same list**:

- The three join `items` and the severity-sorted `active` list, never `rows`.
  The raster is the damage surface and its geometry is the six fixed positions;
  a seventh light there could not be cycled like the others.
- None carries an override and none is persisted, so
  `_cycleConditionOverride()` refuses anything with a `source` — only the six
  damage warnings have none. Those are readings an owner may disagree with;
  these three are arithmetic on the budget, on the summed SV and on the
  Haltung's defence list.
- Both degraded load states are one condition at two severities rather than two
  conditions, and the label follows the severity: half a budget is
  `TNO.Status.Loaded`, a full one `TNO.Status.Overloaded`.
- Every condition carries an `effectKey`, but only these three describe
  something the system did: `carryState` has already removed the movement
  tiers, `armorSvMalus()` already charges the step, and the Haltung already
  withholds the defence. The six damage effects are the table's to apply — the
  sheet states them and changes nothing. Theirs are fixed per light and
  therefore readable while the light is off, which the raster tooltip wants;
  the derived three pick theirs from the state, so an inactive one has none.
- `noDodge` picks its effect from the pair rather than fixing it: today every
  Haltung that drops Ausweichen drops the Parade too, but that is a fact about
  `CONFIG.TNO.stances` and not a rule.
- Within one severity the derived entries read defence → movement → attribute
  step, which is the order of how much of the character they take away.

`carryNoContainer` is deliberately not a condition — it explains why the
carried band is outside the sum, which is a fact about the calculation rather
than a state the character is in.

Each source compares a different pair, so the panel's reason line is built per
`source` in `TnoActorSheet#conditionReason()` rather than from one sentence
that would have to fit all four badly. The armour reason runs its two numbers
through the sheet's `#formatNumber`, because a summed SV is in quarter steps
and wants the reader's own decimal separator.

## Consumers

- [`TnoRollDialog._actorModifiers()`](../../../module/apps/roll-dialog.mjs)
  reads the derived malus as its own always-on modifier bucket. It is merged
  first by `_fixedModifierComponents()`, the shared source for the threshold,
  breakdown, roll components and message flags.
- [`TnoActorSheet`](../../../module/sheets/actor-sheet.mjs) publishes the
  derived result plus its `rows` to the sheet context and to the condition
  panel's own context, and handles the two manual steppers plus the clear-all
  action from the panel element rather than from the sheet's delegation — the
  panel is a child of the host document's body and never of `this.element`. All
  writes target the raw `system.damage.*` fields and clamp only at zero.
- [`actor-malus.hbs`](../../../templates/actor/parts/actor-malus.hbs) is the
  malus on the name's baseline: the band's largest figure, because it is
  announced at every roll. The sheet supplies `hasMalus` and a signed
  `malusLabel`, so the cell is drawn only from `−1` down (or `+1` up) and is
  absent entirely at zero — the tracks beneath it already say the character is
  unhurt. It takes the warning fill plus a glyph when Kampfunfähig — a warning,
  never an enforcement.
- [`actor-damage.hbs`](../../../templates/actor/parts/actor-damage.hbs) renders
  the two box rows under the banner's subtitle, each with a two-letter tag
  (`tagKey`), always stacked with Wucht above Schaden. It is
  read-only: the steppers, the clear action and the raster all moved into the
  panel. The full pool names, capacity, free remainder and conversion stay in
  the per-row tooltips; the German labels are too long to stand in the lane.
- [`condition-panel.hbs`](../../../templates/actor/parts/condition-panel.hbs) is
  the one surface on which the character's condition is edited, opened from the
  Zustände pill or from either half of the vitals row. Section 1 repeats the two
  tracks with their stepper pair, the clear action while there is damage, and
  the figures the band can only fit in a tooltip. Section 2 is the 3×2 raster
  directly beneath them, so a stepper and the light it lit are adjacent; owners
  cycle a light through derived, forced on and forced off, while read-only
  viewers receive non-interactive lights with the same explanations. Section 3
  writes every active condition out as condition → effect → threshold.

  This is the one duplication the design accepts, and it is a summary/detail
  pair: the band answers *how hurt am I* and *am I down*, the panel *by how much
  and from what*. Damage is read far more often than it is entered — once per
  resistance roll — so the editor is the half that earns a click.
- [`actor-status.hbs`](../../../templates/actor/parts/actor-status.hbs) is the
  Zustände pill: one two-letter tag per active entry (`tagKey`, localized under
  `TNO.Status.Tag.*`), severity-sorted, replacing the raster's hand glyph with a
  plain item-action-blue corner point. The pill
  keeps the band's neutral glass at all times — only the boxes inside the panel
  take the classification fill. Inactive and manually negated entries appear
  exclusively in the panel's raster. Styling for the pill sits with the banner
  in `src/scss/components/_forms.scss`; the panel's own frame is a variant in
  `_item-popover.scss`.

Damage application after a resistance roll remains manual. No combat workflow
updates another actor or chooses a target. What changed is that the failed
roll's chat card now *names* the amount and the pool — `appliedDamage` in
[`maneuvers.mjs`](../../../module/helpers/maneuvers.mjs) times the Stelle
multiplier, worded by `widerstandOptions` — so the player steps the same number
they were shown instead of deriving it from a negated breakdown component. See
[concepts/combat-roll-workflows.md](combat-roll-workflows.md).

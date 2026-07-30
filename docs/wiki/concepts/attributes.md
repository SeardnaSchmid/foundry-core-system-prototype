---
type: concept
title: Attributes
description: The 12 primary attributes, their layout, and the derived values computed from them.
tags: [attributes, abilities, derived-values]
resource: [module/helpers/config.mjs, module/helpers/attributes.mjs, module/documents/actor.mjs]
spec: docs/design/character-sheet-prd.md
related: [architecture/data-schema, concepts/heatmap, concepts/advancement]
---

# Attributes

## The 12 attributes

Defined in `CONFIG.TNO.abilities`
([`module/helpers/config.mjs`](../../../module/helpers/config.mjs)), grouped
into three categories (`CONFIG.TNO.attributeCategories`):

| Category | Attributes |
| --- | --- |
| physical | `str`, `dex`, `fin`, `per` |
| social | `aut`, `cha`, `man`, `emp` |
| mental | `wil`, `int`, `wis`, `inv` |

`CONFIG.TNO.attributeRows` lays them out as four rows of one attribute per
category (`[str,aut,wil]`, `[dex,cha,int]`, `[fin,man,wis]`,
`[per,emp,inv]`), each row themed by `CONFIG.TNO.attributeRowLabels`
("Assert" / "Adapt" / "Influence" / "Perceive") — this is the 4×3 grid
rendered on the character sheet.

## Value shape

Each attribute is `{ base, value, xp }` in
`system.abilities.<key>` (see
[data-schema.md](../architecture/data-schema.md)). `base` is the trained
rating; `value` is the current, damage-adjusted rating actual rolls use.
Range is 1–10 per the rulebook's "Bedeutung der Werte" (values pushed above
10 by cyberware/drugs are clamped visually by the heatmap, not by the data
itself — see [heatmap.md](heatmap.md)).

## Derived values

All computed in `TnoActor._prepareCharacterData()` from `base`, not damaged
`value` — see the full table in
[data-schema.md](../architecture/data-schema.md#derived-data). The one
exception, `canSprint`, deliberately compares `value` against `base` to
detect Beweglichkeit (mobility) damage.

## Where they're edited

- **Sheet steppers**: `.heatmap-stepper` on
  [`actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs) adjusts
  `base` (Shift-click) or `value` (default) by ±1; `.heatmap-delta` resets
  `value` back to `base`.
- **Advancement**: raising `base` costs XP — see
  [advancement.md](advancement.md).

## Moving `base` without losing the temp modifier

A temporary modifier lives as the gap between `value` and `base`, so every
write that changes `base` routes the new `value` through
`tempValueForBase()`
([`module/helpers/attributes.mjs`](../../../module/helpers/attributes.mjs)),
which carries that gap along and clamps to the temp range (`TEMP_MIN` 0 –
`TEMP_MAX` 20; base range `BASE_MIN` 1 – `BASE_MAX` 10, all exported from
the same module). A character at base 4 lowered to 2 who advances to base 5
ends up at temp 3 — advancement no longer heals the penalty. Only the
explicit `.heatmap-delta` reset clears the gap.

---
type: concept
title: Attributes
description: The 12 primary attributes, their layout, and the derived values computed from them.
tags: [attributes, abilities, derived-values]
resource: [module/helpers/config.mjs, module/helpers/attributes.mjs, module/documents/actor.mjs]
spec: docs/design/character-sheet-prd.md
related: [architecture/data-schema, concepts/heatmap, concepts/advancement, concepts/damage]
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

Each attribute is `{ base, xp }` in
`system.abilities.<key>` (see
[data-schema.md](../architecture/data-schema.md)). `base` is the sole rating:
it is displayed, rolled, and used by derived values. Range is 1–10 per the
rulebook's "Bedeutung der Werte".

## Derived values

All computed in `TnoActor._prepareCharacterData()` from `base` — see the full
table in [data-schema.md](../architecture/data-schema.md#derived-data). Damage
lives in the separate pools described in [damage.md](damage.md) and never
rewrites attributes.

## Where they're edited

- **Advancement**: click the cell's XP bar to open `TnoAdvanceDialog`; raising
  `base` costs XP, while its correction block permits an explicit rank repair
  — see [advancement.md](advancement.md).

The heatmap has no quick rank steppers. Character development remains a
deliberate dialog action rather than an easy-to-hit sheet control.

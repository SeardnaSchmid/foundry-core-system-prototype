---
type: concept
title: Advancement
description: How XP is spent to raise an attribute's or skill's rank, and the cost formulas involved.
tags: [advancement, xp, ranks]
resource: module/apps/advance-dialog.mjs
related: [concepts/attributes, concepts/skills]
---

# Advancement

[`TnoAdvanceDialog`](../../../module/apps/advance-dialog.mjs) is the single
dialog for raising either an attribute or a skill by one rank at a time,
opened from the sheet's advance buttons / XP bars.

## Cost formulas

The XP cost to advance **to** rank N (`_nextRankCost`):

| Type | Cost to reach rank N | Example (rank 3) |
| --- | --- | --- |
| Attribute | N² | 9 XP |
| Skill | 3·N | 9 XP |

The dialog only ever computes the *next* single step, not a cumulative
total. Rank range: attributes 1–10 (`ATTRIBUTE_MIN = 1`, since 0 isn't a
valid attribute), skills 0–10 (`SKILL_MIN = 0`). `RANK_MAX = 10` for both.

## Guided actions vs. manual correction

Three guided buttons apply an XP/rank change immediately (persisted before
re-render, so closing the dialog never silently drops it): `xp-inc` /
`xp-dec` (±1, or ±5 with Shift), and `buy` — only enabled when
`xp >= cost(nextRank)`, consumes exactly the rank's cost and lets any
surplus XP carry over toward the following rank. A `<details>`-collapsed
correction block additionally exposes the raw rank/XP fields for direct
editing (native HTML5 min/max validation via `checkValidity()`/
`reportValidity()` on submit).

## Persisting

`_persist()` writes to the actor. For attributes, advancing raises
`system.abilities.<key>.base` **and** mirrors it to `.value` (matching the
sheet's base stepper — see [attributes.md](attributes.md)); for skills, it
writes only `system.skills.<key>.value` (skills have no separate
base/value split — see [skills.md](skills.md)). Both also write the
remaining `.xp`.

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

The dialog follows the *Steigern-Dialog* artboard of the redesign mockup:
rank step on top, a progress bar with the XP invested and still missing, a
`− 1 XP +` stepper beside one buy button that names rank and price. Unlike
the mockup, the correction is not behind a link but always shown.

The stepper and the buy button apply immediately (persisted before
re-render, so closing the dialog never silently drops a change): `xp-inc` /
`xp-dec` (±1, or ±5 with Shift), and `buy`, enabled only when
`xp >= cost(nextRank)`. There is **no free XP pool** — XP only ever exist on
their attribute or skill (wiki: *Charakterentwicklung › Erfahrungspunkte
ausgeben*), so the mockup's "Frei: … XP" was left out.

**Deliberate deviation:** `buy` consumes exactly the rank's cost and lets any
surplus carry over toward the following rank, where the wiki has the XP fall
to zero. Kept on the user's decision (2026-10-04).

The correction panel is always open under them: rank and XP fields, each
with its own `−`/`+` steppers (native `stepUp`/`stepDown`, so min/max hold;
Shift steps by 5), booked without XP. The steppers only change the fields;
*Übernehmen* saves them (native `checkValidity()`/`reportValidity()` on
submit) and keeps the dialog open. The guided actions above read the fields
first, so they build on a correction typed but not yet saved.

## Persisting

`_persist()` writes the selected rank and remaining XP to the actor. Attributes
use `system.abilities.<key>.base`; skills use
`system.skills.<key>.value` — see [skills.md](skills.md). Both also write the
remaining `.xp`.

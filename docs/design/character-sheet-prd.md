# Character Sheet - Product Requirements Document

**Version:** 1.0
**Last Updated:** 2026-07-21
**Status:** Implementation Complete (v1) — open for iteration

---

## Table of Contents

1. [Overview](#overview)
2. [Layout](#layout)
3. [Sidebar](#sidebar)
4. [Basics Tab: Attributes](#basics-tab-attributes)
5. [Basics Tab: Skills](#basics-tab-skills)
6. [Biography Tab](#biography-tab)
7. [Items Tab](#items-tab)
8. [Accessibility](#accessibility)
9. [Implementation Notes](#implementation-notes)
10. [Localization](#localization)
11. [Open Questions / Variants to Explore](#open-questions--variants-to-explore)

---

## Overview

The character sheet (`TnoActorSheet`, actor type `character`) is the single-window hub for playing a Trans-Neptunian Objects (`tno`) character: attributes, skills, derived combat/movement stats, the [Problem-Solving Reserve](problem-solving-prd.md), biography, and inventory. It does not itself roll dice — every rollable element opens the shared [`TnoRollDialog`](../../module/apps/roll-dialog.mjs) or, for a few fixed derived rolls (Initiative, Sixth Sense, Fehler Analysieren), calls `rollTno` directly — but it is the primary surface a player spends time on between rolls.

### Design Philosophy

- **Mirror a familiar reference layout:** left-docked portrait sidebar with meta stats, tabbed main body, right-docked vertical tab rail — deliberately modeled on the reference dnd5e character sheet so players coming from other Foundry systems have a head start.
- **Everything important lives above the fold:** attributes, skills, and the problem-solving pool all sit in one "Basics" tab reachable by default, so the two things a player checks most during a session (what can I roll, what can I spend) never require a tab switch.
- **Read-at-a-glance over drill-down:** the attribute heatmap and skill XP bars encode information (relative value, advancement readiness) in color and layout, not just numbers, so a glance answers "what's strong" and "what's about to level" without hovering.

---

## Layout

- **Fixed window size:** 1000×640 (`TnoActorSheet.defaultOptions`) — sized to fit the compact attribute matrix plus three skill columns without forcing a wider window than the reference sheet needed.
- **Two-column shell:** `.sheet-columns` holds a fixed-width `<aside class="sidebar">` (portrait + derived stats, visible across every tab) and a `.sheet-main` column carrying the header band and tabbed body.
- **Tab rail:** `<nav class="sheet-tabs tabs-right">` is docked as a vertical icon rail along the right edge (mirroring the reference sheet), each item showing an icon plus a text label that's hidden by default and revealed on hover/focus so the rail's purpose is discoverable without waiting on the native tooltip delay. It is re-parented out of `.window-content` directly onto the app window element (`_dockTabsRail`) so it can dock past the sheet's own scroll bounds.
- **Header band:** spans only the main columns (not the sidebar), holds the editable name field and a total-XP badge (`totalXpSpent` = attribute XP + skill XP combined) — the badge's home after being an orphaned footer line under the sidebar in an earlier layout.

---

## Sidebar

Docked left, visible on every tab.

- **Portrait:** `actor.img`, click-to-edit via Foundry's native `data-edit="img"`.
- **Lozenges (portrait overlay):** two roll chips overlaid on the portrait's bottom edge, opaque so they stay legible on any uploaded portrait:
  - **Initiative:** `1d10 + @derived.initiative`, rolled via the generic `data-roll` formula path.
  - **Sixth Sense (6. Sinn):** a plain standard 3d20 roll against `system.derived.sixthSense`, no modifiers/advantage, no Problem-Solving pre-edge (`edgeExempt: true`) — it's an instinctive reaction, not a deliberate check.
- **Movement/carry tile row:** four display-only tiles (crawl/walk/sprint speed, carry slots used/max) styled as `movement-tile` — no roll, no interaction.
- **Problem-Solving group:** the reserve pool (directly editable, clamped 0..max) plus three tiles — see [problem-solving-prd.md](problem-solving-prd.md) for full mechanics. Only "Fehler Analysieren" is clickable from here; "Idee haben" lives in the roll dialog and "Fehler finden"/"Neuer Versuch" live on a failed roll's chat card, so their sidebar tiles are display-only, shown for at-a-glance reference.

---

## Basics Tab: Attributes

- **Heatmap grid:** one row per `CONFIG.TNO.attributeRows` entry, one column per category (physical/social/mental), reproducing the rulebook's "Attribute" table. Ported from the standalone "Attribut-Heatmap" prototype.
- **Per-cell display:**
  - Base→Temp value pair (`heatmap-value-pair`): when a temporary modifier is in play, shows `base → effective` (e.g. `6→4`) so the direction of change is explicit and isn't misread as an x/y ratio the way the sidebar's reserve/carry tiles are; effective (temp) stays the visually emphasized number.
  - `±` steppers adjust the temp value by default, or the base value while holding Shift (base changes are the rarer, more deliberate edit).
  - A reset control (`heatmap-delta`) snaps temp back to base, shown only when they differ.
  - Cell background/text color are graded per-cell against a fixed absolute 1–10 scale (`colorForValue`), independent of every other cell on the sheet — not a relative heatmap across the grid.
  - **Zero-value cells** (`isCritical`, temp = 0) get a distinct red-tinted treatment and a warning badge, and their tooltip swaps the generic ability hint for the attribute's specific in-fiction consequence (e.g. "FIN 0: keine Handaktionen").
  - **XP progress bar:** cumulative cost to advance to the next base rank is `(base+1)²`; the bar fills as XP accrues and turns "ready" (green) once affordable, unless already at the rank cap (`BASE_MAX = 10`). Clicking the bar opens `TnoAdvanceDialog` for that attribute — the exact xp/cost figures live in its tooltip rather than as a separate on-cell badge, since the bar's fill/color already communicate progress at a glance.
- **Header badge:** total attribute points and total attribute XP spent across the whole grid.
- **GM-only heatmap lab button:** opens `TnoHeatmapLab`, a client-side gradient-tuning tool — gated to GMs since it's a tuning tool, not player-facing data.
- **Value ranges:** base 1–10, temp (effective) 0–20 (`BASE_MIN/MAX`, `TEMP_MIN/MAX` in `actor-sheet.mjs`).

---

## Basics Tab: Skills

- **Grouping:** skills are grouped by `CONFIG.TNO.skillCategories`, rendered in a balanced CSS multi-column flow (`.skill-groups`) inside a scroll wrapper that owns vertical overflow independently of the rest of the sheet, so a long "All" list fills all three columns evenly instead of scrolling the whole sheet. Categories with zero skills defined still render, with an empty-state hint.
- **Custom skills:** actor-defined skills (via `TnoCustomSkillDialog`) are merged into the same list as built-ins by `getSkillDefinitions()` and behave identically — same roll flow, same advancement, own badge, always counted as "trained" regardless of rank so a freshly added rank-0 custom skill doesn't disappear from the default filter.
- **Per-row display:** name (with subgroup badge, e.g. "Medicine — First Aid" compacted to a badge, and custom badge where applicable), rank (level chip, color-graded like the attribute cells once rank > 0), and an XP fraction (`xp`/`xpCost`, cost = `3 × (rank+1)`), highlighted "ready" once advancement is affordable.
- **Roll:** clicking a skill row opens `TnoRollDialog` preselecting the skill's suggested attribute (or whichever attribute the actor last rolled that skill against — `lastAttribute` sticks per-skill) and the skill's rank as a threshold component. Shift-clicking a *custom* skill opens its edit dialog instead of rolling.
- **Advancement:** the arrow button opens `TnoAdvanceDialog` for that skill.
- **Filter bar:** three mutually exclusive filters — **Trained** (rank > 0, has any XP banked, or custom), **Starter** (character-creation-selectable only), **All** — persisted on the sheet instance (`this._skillFilter`) so it survives re-renders while the sheet stays open. Purely client-side (`_applySkillFilter`, no document re-render), so it also works on read-only/non-editable sheets.
- **Fuzzy search:** a search box does a diacritic/case-insensitive subsequence match against skill names (`fuzzyMatch` — every character of the query must appear in order, gaps allowed) and, while non-empty, overrides the category filter entirely so any matching skill surfaces regardless of trained/starter state. A group with zero visible rows under the current filter/search hides itself entirely (unless it has no skills defined at all, which keeps its empty-state placeholder).
- **Header badge:** total skill points (summed ranks) and total skill XP spent (`Σ skillRankXpCost(rank)`, cumulative cost to rank N = `3·N·(N+1)/2`) across all groups.

---

## Biography Tab

Plain `<textarea name="system.biography">`, not Foundry's ProseMirror rich-text editor — deliberately, since the editor requires an explicit click into an edit mode before typing, which is unnecessary friction for a simple free-text notes field.

---

## Items Tab

Renders `templates/actor/parts/actor-items.hbs`, populated by `_prepareItems()`: owned items are bucketed into `gear` (type `item`), `features` (type `feature`), and `spells` (type `spell`, sub-bucketed 0–9 by `system.spellLevel`). Standard Foundry item-sheet affordances apply (create/edit/delete, drag-to-macro for owners).

---

## Accessibility

Every custom clickable chip that isn't a native `<a href>`/`<button>`/form control (bare `<a>` anchors, `.skill-info` rows) is invisible to keyboard/screen-reader tab order by default. `_makeKeyboardAccessible()` promotes all such elements on render: adds `tabindex="0"` and `role="button"` where missing, and binds an Enter/Space keydown handler that forwards to whatever `click` listener is already bound — without needing every template or handler touched individually.

---

## Implementation Notes

- Sheet class: [`TnoActorSheet`](../../module/sheets/actor-sheet.mjs), extends Foundry's `ActorSheet`. Template resolved dynamically per actor type: `systems/tno/templates/actor/actor-${actor.type}-sheet.hbs` (character sheet: [actor-character-sheet.hbs](../../templates/actor/actor-character-sheet.hbs)).
- `getData()` builds `context.attributeGrid` and `context.skillGroups` only for `actor.type === 'character'` (`_prepareCharacterData`); NPCs get `_prepareItems()` only, no heatmap/skill grid.
- Attribute and skill XP cost formulas are pure functions at module scope (`attributeRankXpCost`, `skillRankXpCost`) — cumulative "total cost to reach rank N", not per-step cost, matching the rulebook's "Charakterentwicklung" level-cost tables (attributes: N², triangular-summed; skills: 3N, triangular-summed).
- Attribute stepper and reset actions (`_stepAttribute`, `_resetTemp`) write directly via `actor.update()`; no confirmation dialog, since these are meant to be quick, low-friction adjustments (unlike the Problem-Solving actions, which are point-costly and gated behind confirms).
- The heatmap's color grading (`colorForValue`, `colorForCritical`, both in [helpers/heatmap.mjs](../../module/helpers/heatmap.mjs)) is shared with the GM-only `TnoHeatmapLab` tuning tool, so any palette change there is reflected on every player's sheet.
- Skill roll dispatch, the Problem-Solving actions, and their gating (`analyzeFlawDisabled`, `edgeExempt` flags) are documented separately in [problem-solving-prd.md](problem-solving-prd.md) and [dice-system-prd.md](dice-system-prd.md) — this document covers the sheet's *display and layout* of those values, not their mechanics.
- `context.isGM` gates the heatmap-lab launch button in the template; everything else on the sheet is available to any owner.

---

## Localization

Key prefixes used throughout the sheet (see `lang/de.json` / `lang/en.json`):

- `TNO.Attribute*` — attribute labels, hints, zero-value consequences (`TNO.AttributeZero.<suffix>`), current/base tooltips, advance/increase/decrease action labels.
- `TNO.Skill*` — skills tab title, search placeholder/hint, filter labels/hints, category-empty hint, advance action label.
- `TNO.CustomSkill.*` — add button, badge, shift-click hint for custom skills.
- `TNO.Derived.*` / `TNO.DerivedShort.*` / `TNO.DerivedHint.*` — sidebar meta stat labels (Initiative, Sixth Sense, movement tiers, carry slots) in long/short/tooltip variants.
- `TNO.TabBasics` / `TabDescription` / `TabItems` — tab rail labels.
- `TNO.XpTotalAllHint` / `XpTotalAttributesHint` / `XpTotalSkillsHint` / `XpMaxBadge` — the three XP badge tooltips and the at-cap badge text.
- `TNO.BiographyPlaceholder` — biography textarea placeholder.
- Problem-Solving keys are documented in full in [problem-solving-prd.md](problem-solving-prd.md#localization).

---

## Open Questions / Variants to Explore

1. **NPC sheet parity** — the character sheet's heatmap/skill-grid treatment doesn't extend to NPC actors (`actor-npc-sheet.hbs` uses a simpler layout); worth deciding whether NPCs ever need the same depth or should stay minimal by design.
2. **Skill subgroup badges** — currently a compact glyph/abbreviation replacing what used to be spelled out in the skill name itself; worth checking these remain legible without hover once more subgroups are added.
3. **Attribute stepper discoverability** — the Shift-to-edit-base modifier has no on-screen affordance beyond the tooltip; consider a visible toggle if new players consistently miss it.
4. **Mobile/narrow-width layout** — a container query already shrinks header labels on narrow widths (per the heatmap comment in the template); no PRD-level pass has been done on how far this degrades below the fixed 1000px default width.

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-07-21 | Initial PRD creation, documenting existing implementation | System |

---

**End of Document**

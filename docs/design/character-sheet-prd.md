# Character Sheet - Product Requirements Document

**Version:** 1.2
**Last Updated:** 2026-08-29
**Status:** Implementation Complete (v1.2) — open for iteration

---

## Table of Contents

1. [Overview](#overview)
2. [Layout](#layout)
3. [Banner](#banner)
4. [Basics Tab: Attributes](#basics-tab-attributes)
5. [Basics Tab: Skills](#basics-tab-skills)
6. [Biography Tab](#biography-tab)
7. [Inventory Tab](#inventory-tab)
8. [Accessibility](#accessibility)
9. [Implementation Notes](#implementation-notes)
10. [Localization](#localization)
11. [Open Questions / Variants to Explore](#open-questions--variants-to-explore)

---

## Overview

The character sheet (`TnoActorSheet`, actor type `character`) is the single-window hub for playing a Trans-Neptunian Objects (`tno`) character: attributes, skills, derived combat/movement stats, the [Problem-Solving Reserve](problem-solving-prd.md), biography, and inventory. It does not itself roll dice — every rollable element opens the shared [`TnoRollDialog`](../../module/apps/roll-dialog.mjs) or, for a few fixed derived rolls (Initiative, Sixth Sense, Fehler Analysieren), calls `rollTno` directly — but it is the primary surface a player spends time on between rolls.

### Design Philosophy

- **Mirror a familiar reference layout:** a horizontal character-profile banner with portrait, identity and meta stats above a tabbed body, plus a right-docked vertical tab rail — deliberately modeled on familiar Foundry character sheets so players have a head start.
- **Everything important lives above the fold:** attributes, skills, and the problem-solving pool all sit in one "Basics" tab reachable by default, so the two things a player checks most during a session (what can I roll, what can I spend) never require a tab switch.
- **Read-at-a-glance over drill-down:** the attribute heatmap and skill XP bars encode information (relative value, advancement readiness) in color and layout, not just numbers, so a glance answers "what's strong" and "what's about to level" without hovering.

---

## Layout

- **Default window size:** 1270×720 (`TnoActorSheet.DEFAULT_OPTIONS`), resizable. The width gives the Basics rows enough room for their attribute, skill and equipment columns; the entire character sheet shares one `.window-content` scroll surface.
- **Banner:** `.sheet-banner` is a full-width grid above the tab body with three areas: square portrait, protected identity lane, and wrapping meta-chip block. The portrait remains in normal grid flow and only visually overhangs the band's bottom edge, so extra chip rows can increase banner height without manual clearance calculations. A decorative copy of `actor.img` supplies a cinematic image field beneath the content; the original gradient remains the load-failure fallback.
- **Tab rail:** `<nav class="sheet-tabs tabs-right">` is docked as a vertical icon rail along the right edge, each item showing an icon plus a text label that's hidden by default and revealed on hover/focus. It remains inside `.window-content`, where ApplicationV2 resolves the tab actions, while CSS positions it outside the visible sheet edge.
- **Responsive banner:** `.window-content` is the named `character-sheet` inline-size container. At 980px and below the chips move beneath the identity while the portrait stays left; only below 520px may the protected 280px name lane yield, with both portrait and headline scaling down.

---

## Banner

Visible above every tab as a compact character profile.

- **Portrait:** `actor.img` in a responsive 150–170px square, cropped with `object-fit: cover` and a face-friendly `center 20%` focus. Owners can activate it by pointer or keyboard to use Foundry's native image picker; hover/focus reveals a quiet edit pill. Read-only viewers receive an ordinary image without edit action or false affordance.
- **Backdrop:** one unmasked `aria-hidden` decorative copy of `actor.img` sits behind the banner, using the upper golden-ratio focal point (`center 38%`). A single warm-charcoal-to-transparent gradient protects the identity and replaces the former parchment wash, alpha mask and vignette. The same gradient is angled slightly as an editorial cut and carries a faint advancement-gold warmth at its trailing edge—this is the banner's one decorative motif, not an additional layer. Name text is off-white and slightly tightened, its subtitle muted beige, and the gold repeats on the accent rule and portrait rim; the image remains recognizable through a restrained darker, desaturated wash without background blur. The chips use a light translucent surface with a small local blur. The backdrop has no interaction or separate actor data.
- **Identity:** the editable character name is the dominant headline. The free-text profession/role and the computed spent/acquired XP read-out form its subtitle. The name retains a 280px lane at normal sheet widths; chips wrap before they may squeeze it.
- **Banner chips:**
  - **Haltung:** a persisted combat-stance picker. Choosing a different stance
    takes it immediately; the adjacent repeat action takes the current stance
    again, because that is a meaningful rules action that clears both repeated
    defence counters. The selected stance gates Dodge below the silhouette and
    Parry in a weapon popover.
  - **Initiative:** `1d10 + @derived.initiative`, rolled via the generic `data-roll` formula path. It replaces the former portrait overlay, so the portrait stays unobstructed.
  - **Sixth Sense (6. Sinn):** a plain standard 3d20 roll against `system.derived.sixthSense`, no modifiers/advantage, no Problem-Solving pre-edge (`edgeExempt: true`) — it's an instinctive reaction, not a deliberate check.
- **Movement chip:** crawl (`Beweglichkeit/3`, aufgerundet) | walk (`Beweglichkeit`) | sprint (`3×Beweglichkeit`) as one display-only chip, each figure with its own tooltip — no roll, no interaction. A tier the character has lost is **struck through in the warning red**: sprint whenever the load reaches half the carry budget, and walk as well once the load is `crawlOnly`. This is where the slot grid's `Kein Sprint` / `Nur Kriechen` badges went: the consequence belongs on the figure it takes away, since the question being asked is "how far can I move".
- **Problem-Solving chip:** the reserve pool is directly editable and clamped to 0..max. Its pips and tooltip keep the derived thresholds available at a glance; the actual Problem-Solving actions remain in the roll dialog or chat card — see [problem-solving-prd.md](problem-solving-prd.md).
- **Damage block:** health sits in the banner rather than in the Basics column, because the figure it produces — the global `−1` per raw point — is announced on every roll, next to the other values that get said out loud. It occupies a second row of the chip lane, below the pills, since it is two rows tall.
  - **Two counted box rows** against one shared capacity mark: Wuchtschaden above, Scharfer Schaden below, one box per point of capacity (trained Stärke). Boxes, not a proportional bar: at this capacity counting is faster than reading a length, and the mark can stay put while damage grows past it instead of the track rescaling itself.
  - **What a box says:** on the blunt row, filled = Wucht still on the track and boxes past the mark = Wucht that has spilled off it. On the sharp row, filled = the raw pool followed by exactly that spill, because converted Wucht counts as Scharf — so a box past the sharp row's mark *is* Kampfunfähig, not a second read-out of it.
  - **Steppers** sit one pair per row, behind the mark; each writes its raw pool, unclamped upward and clamped at zero. The clear-both action appears only while there is damage to clear.
  - **The malus** is the largest figure in the block, a tall cell binding both rows, and stays in place as a dimmed `0` on an unhurt character. Kampfunfähig recolours the whole block and prefixes the figure with a warning glyph, still without enforcing any state.
  - **No labels in the lane:** `Scharfer Schaden` and `Wuchtschaden` do not fit beside the boxes at any sheet width, so the row tooltip carries the pool name, its raw value, the free remainder, the capacity and the converted count. Read-only viewers see the same rows without steppers or clear button.

---

## Basics Tab: Attributes

- **Heatmap grid:** one row per `CONFIG.TNO.attributeRows` entry, one column per category (physical/social/mental), reproducing the rulebook's "Attribute" table. Ported from the standalone "Attribut-Heatmap" prototype.
- **Per-cell display:**
  - One attribute rating (`system.abilities.<key>.base`), used consistently for display, rolls and derived values. There is no temporary/effective value axis.
  - Cell background/text color are graded per-cell against a fixed absolute 1–10 scale (`colorForValue`), independent of every other cell on the sheet — not a relative heatmap across the grid.
  - **XP progress bar:** cumulative cost to advance to the next base rank is `(base+1)²`; the bar fills as XP accrues and turns "ready" (green) once affordable, unless already at the rank cap (`BASE_MAX = 10`). Clicking the bar opens `TnoAdvanceDialog` for that attribute — the exact xp/cost figures live in its tooltip rather than as a separate on-cell badge, since the bar's fill/color already communicate progress at a glance.
- **Header badge:** total attribute points and total attribute XP spent across the whole grid.
- **GM-only heatmap lab button:** opens `TnoHeatmapLab`, a client-side gradient-tuning tool — gated to GMs since it's a tuning tool, not player-facing data.
- **Value range:** 1–10 (`BASE_MIN/MAX` in `helpers/attributes.mjs`). The heatmap itself has no quick rank steppers; advancement and explicit correction stay in `TnoAdvanceDialog`.

Health is not part of this column — the damage block sits in the banner, see
[Banner](#banner).

---

## Basics Tab: Skills

- **Grouping:** skills are grouped by `CONFIG.TNO.skillCategories`, rendered in a balanced CSS multi-column flow (`.skill-groups`). A long "All" list fills all three columns evenly and extends the character sheet's single vertical scroll surface. Categories with zero skills defined still render, with an empty-state hint.
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

## Inventory Tab

Renders `templates/actor/parts/actor-items.hbs`: the **ledger**, where every object the character owns appears exactly once whatever state it is in. Every owned physical item is either worn or carried, there is no carry/stow toggle, and both states now answer the footprint column. Gear is created here or through the `+` in the slot grid; both open the same dialog.

The ledger is a **table grouped by role** — Waffe, Rüstung, Verbrauch, Gegenstand — with a column set the reader picks. Roles are mutually exclusive, so the groups are a reading of the one list rather than four lists that could disagree, and an item still appears once. Every group renders even when empty, so a missing heading never has to be read as "that group is gone" rather than "none of those"; each carries a badge with its item count, its complete slot total, and its money value where any price is authored.

- **Columns.** The name heads every row and can neither be switched off nor picked — it is the row's identity rather than one of its values. Everything else comes from a picker (`parts/columns-popover.hbs`) listing the whole gear schema in the item sheet's own sections: Allgemein (SLT, Menge, Platz, SV, Status, offene Pflichtwerte), Handel (Grundpreis, Wert, Verfügbarkeit), Waffe (Einsatz, WA, FV, DK, RD, RB, SS, WS, HH) and Rüstung (Stelle, RH, RW, RA). The default is SLT · Menge · SV. Price and availability are deliberately absent from the compact play card, which is read mid-roll; a ledger is exactly where they belong.
- **Three kinds of silence, kept apart.** A column the row cannot be asked — an armour value on a weapon, DK on a ranged profile, or RH/RA on an Unterkleidung — is hatched `n/a`, the same convention the item card uses. A column it *could* answer that nobody has filled in is a dash, per the null-versus-zero rule. Only an authored value is a figure. Worn and carried rows both answer the footprint column. Nothing is hidden per row: the grid keeps its shape down the list.
- **Sorting is view-only.** A header click orders the rows inside each group and never writes `item.sort`, which is the order each Basics slot band packs from — a click here must not repack a raster the player arranged by hand in another tab. Values the column cannot answer sort last in *both* directions: sorting by RH to find the hardest armour and sorting to find the softest are the same act of pulling the pieces that have an RH to the top. For the same reason, dropping a row back onto the table sorts nothing.
- **Search** filters rows by name across every group, client-side like the skill search, so typing costs no re-render.
- **The layout is a per-user client setting** (`tno.itemTableLayout`, `scope: 'client'`, `config: false`), like `basicsLayout`. Which columns someone reads is a property of the reader, not of the character, so it follows them to every sheet they open. Nothing in it is game state.

The maths and the ordering live in [`helpers/item-table.mjs`](../../module/helpers/item-table.mjs) as pure functions; the sheet turns the raw values into words.

The visual views used to sit above that flat list and now live in the Basics tab as columns of its own — they answer "what am I wearing / hauling right now?", which is asked mid-roll rather than while bookkeeping. The paper doll and the stacked Kleinkram/Geldbörse column sit in the top row beside the attribute matrix; the slot raster sits in the bottom row beside the skill list, because the raster is a long list and belongs next to the other long list on the sheet. All are character-only. The equipment arrangements are derived on every render from `_prepareEquipment()`; the wallet instead reads its five persisted native-currency balances from `system.money`:

- **Paper doll** (`parts/actor-paperdoll.hbs`) — the Unterkleidung as a separated base-layer row beneath the four hit locations (Kopf, Torso, Arme, Beine), each with its effective RH/RW/RA. Every silhouette zone keeps a full-size base shape, painted from `z.baseState` as `bare` (grey — no Unterkleidung) or `suited` (pale green — covered by Unterkleidung, which closes coverage but grants no hardness). A worn zone addon is a smaller green plate drawn above that base, so its exposed rim still shows whether Unterkleidung is present underneath. **An empty zone is a drop target and nothing else:** a piece is worn by dragging it out of the slot grid onto the zone it was authored for, and while one is in flight that zone lights up. Clicking an empty zone used to offer to author a piece on the spot, which conjured armour out of an empty doll — wearing something is a state change on gear already in hand, so the click path is gone. A filled row is itself draggable, and dropping it back into the slot grid takes the piece off: the row's `x` is the same act. Clicking a filled row opens the piece's own sheet; its duplicate slot-band entry provides the same access from the budget view. The compact **Dodge (Ausweichen)** icon/value button sits directly beneath the silhouette: it rolls Beweglichkeit + Akrobatik when the current Haltung permits it and carries the next-defence malus as a small badge after the first dodge in that stance — a Malusstufe per repeat, summing up, less whatever Deckung nutzen or Haken schlagen buys back in the current Haltung. It is deliberately separate from the four zone interactions beside it, which continue to start Resistance for their specific hit location.
- **Geldbörse** (`parts/actor-money-wallet.hbs`) — a compact, borderless section pinned to the bottom of the Kleinkram column. The empty space between both surfaces is flexible; when the Kleinkram list grows, it extends the complete top row and naturally pushes the wallet downward rather than introducing an inner scrollbar. The sheet never exposes the individual holdings: its two thin summary rows express the complete combined value once in OR and once in Imperial Qian, regardless of which five currencies compose it. The euro total remains secondary in the header. Owners click the section to open a top-layer editor for the actual five balances, with their money forms, individual exchange rates, live euro conversions and a live total. Or Odur and Or Forseti are approximate and prefix every combined summary and total containing them with `≈`. The editor is an `item-popover` variant and reuses that surface's head, fact rows and action bar rather than introducing parallel popup chrome. Read-only viewers get the same compact summaries without a dead edit affordance.
- **Trageslots** (`parts/actor-slot-grid.hbs`) — worn gear and carried gear share one budget. Worn pieces form the first, cool-tinted band (sorted among themselves), followed by carried pieces in their own `sort` order; both cost their authored footprint. Cells can be opened, re-sorted, or dragged onto the paper doll to wear armour. Without a container only the worn band counts and positive-cost carried gear leaves the raster. The grid contains exactly the character's capacity and renders excess gear as overload rather than refusing it.
- **Kleinkram** (`parts/actor-trinkets.hbs`) — Papiere und Krimskrams: carried gear the rules price at 0 slots, so it never takes a cell in the raster and sits above the wallet. Same interactions as a cell (open, sort, wear), but **no create control and no drop target**: an item is Kleinkram exactly when its `slots` is 0, which is authored on the item's own sheet, and there is no state here to put a piece into. Currency balances are not Items and appear only in the wallet.

**Weapons have no view of their own.** Gear with the weapon role carries its mandatory FV/SV, a mandatory Waffenattribut (one of the twelve primary attributes), a melee or ranged profile, DK or five range-band modifiers, HH, RB or RD, and SS/WS damage values (plain numbers from 0 upward, not counts of dice). Clicking an owned weapon opens its compact overview, which offers an Angriff würfeln action using that weapon's FV and Waffenattribut as fixed components: the roll dialog does not permit another attribute. But **how a weapon is readied remains an open rules question**, and a carried weapon is a carried item like any other — it appears in the Trageslots raster. The Basics tab used to reserve an empty Waffen block against the day that question is answered; it no longer does, because a block that lists nothing is a promise rather than a layout, and what shape that view takes is not decided by leaving a gap for it.

The rules behind these views live in [`helpers/inventory.mjs`](../../module/helpers/inventory.mjs) and [`helpers/money.mjs`](../../module/helpers/money.mjs) as pure functions — see the wiki's [inventory concept page](../wiki/concepts/inventory.md).

---

## Accessibility

Every custom clickable chip that isn't a native `<a href>`/`<button>`/form control (bare `<a>` anchors, `.skill-info` rows, and the editable portrait image) is invisible to keyboard/screen-reader tab order by default. `_makeKeyboardAccessible()` promotes all such elements on render: adds `tabindex="0"` and `role="button"` where missing, and binds an Enter/Space keydown handler that forwards to whatever `click` listener is already bound. The portrait additionally carries an action-specific accessible label; its visible edit pill is decorative and hidden from assistive technology.

---

## Implementation Notes

- Sheet class: [`TnoActorSheet`](../../module/sheets/actor-sheet.mjs), extends Foundry's `ActorSheetV2` through `HandlebarsApplicationMixin`. Template resolved dynamically per actor type: `systems/tno/templates/actor/actor-${actor.type}-sheet.hbs` (character sheet: [actor-character-sheet.hbs](../../templates/actor/actor-character-sheet.hbs)).
- `getData()` builds `context.attributeGrid` and `context.skillGroups` only for `actor.type === 'character'` (`_prepareCharacterData`); NPCs get `_prepareItems()` only, no heatmap/skill grid.
- Attribute and skill XP cost formulas are pure functions at module scope (`attributeRankXpCost`, `skillRankXpCost`) — cumulative "total cost to reach rank N", not per-step cost, matching the rulebook's "Charakterentwicklung" level-cost tables (attributes: N², triangular-summed; skills: 3N, triangular-summed).
- The heatmap's color grading (`colorForValue` in [helpers/heatmap.mjs](../../module/helpers/heatmap.mjs)) is shared with the GM-only `TnoHeatmapLab` tuning tool, so any palette change there is reflected on every player's sheet.
- Skill roll dispatch, the Problem-Solving actions, and their gating (`analyzeFlawDisabled`, `edgeExempt` flags) are documented separately in [problem-solving-prd.md](problem-solving-prd.md) and [dice-system-prd.md](dice-system-prd.md) — this document covers the sheet's *display and layout* of those values, not their mechanics.
- `context.isGM` gates the heatmap-lab launch button in the template; everything else on the sheet is available to any owner.

---

## Localization

Key prefixes used throughout the sheet (see `lang/de.json` / `lang/en.json`):

- `TNO.Attribute*` — attribute labels and hints; advancement copy lives under `TNO.SkillAdvance*` because the dialog is shared with skills.
- `TNO.Skill*` — skills tab title, search placeholder/hint, filter labels/hints, category-empty hint, advance action label.
- `TNO.CustomSkill.*` — add button, badge, shift-click hint for custom skills.
- `TNO.Derived.*` / `TNO.DerivedShort.*` / `TNO.DerivedHint.*` — banner meta-stat labels (Initiative, Sixth Sense, movement tiers, carry slots) in long/short/tooltip variants.
- `TNO.TabBasics` / `TabDescription` / `TabItems` — tab rail labels (`TabItems` reads "Inventar" / "Inventory": the tab covers the inventory rules as a whole, not just a list of things).
- `TNO.Inventory.*` — Trageslots view: title, slot-cost hints, the `Keine Tasche` badge, the add-dialog's labels, the cell/free-cell hints, and the Kleinkram column's title, `0 Slots` caption, explanation and empty state (`Trinkets*`). The two load-state hints moved to `TNO.DerivedHint.NoSprint` / `CrawlOnly`, where the movement chip reads them.
- `TNO.Damage.*` — damage-pool labels, stepper actions, the banner block's row/malus tooltips (free remainder, capacity, conversion, malus breakdown) and the Kampfunfähig warning.
- `TNO.Armor.*` — paper doll: its column caption (`WornTitle`), zone labels (`TNO.Armor.Zone.*`), the RH/RW/RA long/short/hint triples, the unequip action, the drop hint on an empty zone, the wrong-zone warning, and the Stärkevorraussetzung warning.
- `TNO.Weapons.*` — the weapon item sheet's value labels. On the actor sheet only the Inventar table's weapon columns read them; weapons still have no view of their own there.
- `TNO.ItemTable.*` — the Inventar table's own chrome: search placeholder/hint, the column picker's button, title and hint, the sort hint and its two sorted states, the empty-group and no-match lines, the group badge tooltip, the `n/a — keine Rüstung` reason, and the three column captions no other surface already had (`Cap.State`, `Cap.Incomplete`, `Cap.Hh`). Every *data* label is reused from `TNO.Item.Cap.*`, `TNO.Weapons.*` and `TNO.Armor.*` rather than duplicated.
- `TNO.BasicsSplitterHint` — the Basics tab's column handles.
- `TNO.PortraitEdit` — accessible label and visible edit hint for an owner's portrait.
- `TNO.XpTotalAllHint` / `XpTotalAttributesHint` / `XpTotalSkillsHint` / `XpMaxBadge` — the three XP badge tooltips and the at-cap badge text.
- `TNO.BiographyPlaceholder` — biography textarea placeholder.
- Problem-Solving keys are documented in full in [problem-solving-prd.md](problem-solving-prd.md#localization).

---

## Open Questions / Variants to Explore

1. **NPC sheet parity** — the character sheet's heatmap/skill-grid treatment doesn't extend to NPC actors (`actor-npc-sheet.hbs` uses a simpler layout); worth deciding whether NPCs ever need the same depth or should stay minimal by design.
2. **Skill subgroup badges** — currently a compact glyph/abbreviation replacing what used to be spelled out in the skill name itself; worth checking these remain legible without hover once more subgroups are added.
3. **Attribute stepper discoverability** — the Shift-to-edit-base modifier has no on-screen affordance beyond the tooltip; consider a visible toggle if new players consistently miss it.
4. **Mobile/narrow-width layout** — the banner and attribute matrix now have container-query fallbacks, but no PRD-level pass has been done on the complete sheet below its 1270px default width.

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.2 | 2026-08-26 | Moved Dodge from the banner to the paper-doll defence surface | System |
| 1.1 | 2026-08-03 | Replaced stale sidebar description with responsive profile-banner and portrait contract | System |
| 1.0 | 2026-07-21 | Initial PRD creation, documenting existing implementation | System |

---

**End of Document**

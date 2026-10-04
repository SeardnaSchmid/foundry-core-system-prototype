# Character Sheet - Product Requirements Document

**Version:** 1.8
**Last Updated:** 2026-10-04
**Status:** Implementation Complete (v1.2) — open for iteration; the banner is specified separately, see [header-banner-prd.md](header-banner-prd.md)

---

## Table of Contents

1. [Overview](#overview)
2. [Layout](#layout)
3. [Banner](#banner) — see [header-banner-prd.md](header-banner-prd.md)
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

- **Default window size:** 1280×900 (`TnoActorSheet.DEFAULT_OPTIONS`), resizable. The width gives the Basics rows enough room for their attribute, skill and equipment columns; the entire character sheet shares one `.window-content` scroll surface.
- **Banner:** `.sheet-banner` is a full-width grid above the tab body with three areas: square portrait, protected identity lane, and the meta lane. The portrait remains in normal grid flow and only visually overhangs the band's bottom edge. Its layout, contents and responsive behaviour are specified in [header-banner-prd.md](header-banner-prd.md).
- **Tab rail:** `<nav class="sheet-tabs tabs-right">` is docked as a vertical icon rail along the right edge, each item showing an icon plus a text label that's hidden by default and revealed on hover/focus. It remains inside `.window-content`, where ApplicationV2 resolves the tab actions, while CSS positions it outside the visible sheet edge.
- **Visual style (2026-10 redesign, Basics tab and windows; the banner keeps its earlier design):** every TNO window stands on one flat warm-grey ground instead of Foundry's parchment texture; panels (lists, cards, the skill groups) are a lighter surface on it with a soft hairline; section headers are an uppercase title over a hairline with quiet figures beside it. Type is IBM Plex Sans throughout, one step smaller than Foundry's default scale, with its Condensed cut for the skill-group titles, bundled with the system rather than loaded from the web. Worn gear is one cool blue wherever it is drawn — zone rows, the silhouette, the worn band of the slot raster.
- **Basics grid ("Kompakt · Matrix E"):** one row of two columns, 1:1 by default with a draggable handle between them. Left is what the character can roll: the attribute matrix and the skill list (Initiative and 6. Sinn are roll pills in the banner). Right is what the character has: the worn gear, then Inventar · Kleinkram · Geld as three tabs of one panel, with the create `+` closing the tab bar.
- **Responsive banner:** `.window-content` is the named `character-sheet` inline-size container. At 980px and below the meta lane moves beneath the identity while the portrait stays left; only below 520px may the protected 280px name lane yield. See [header-banner-prd.md](header-banner-prd.md#responsive-behaviour).

---

## Banner

The band above the tab body — portrait, identity and the meta read-outs — has its
own spec of record: **[header-banner-prd.md](header-banner-prd.md)**. It covers
the portrait and backdrop contract, the identity lane, and every meta feature the
header holds, keeps or hands off.

Read it before touching `.sheet-banner`, [actor-status.hbs](../../templates/actor/parts/actor-status.hbs)
or [actor-damage.hbs](../../templates/actor/parts/actor-damage.hbs). What used to
be described here — the chip rows, the damage block, the condition surfaces — is
specified there, together with the two roll pills for Initiative and 6. Sinn
in its state lane and the movement tiers beside the damage tracks.

---

## Basics Tab: Attributes

- **Heatmap grid:** a compact matrix — one column per category (physical/social/mental) under its heading, one row per `CONFIG.TNO.attributeRows` entry, in the order of the rulebook's "Attribute" table. Row themes are not shown; each cell's tooltip names its row and column. Ported from the standalone "Attribut-Heatmap" prototype.
- **Per-cell display:** one line — name left, value right — with the XP bar along the cell's foot.
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

- **Grouping:** skills are grouped by `CONFIG.TNO.skillCategories`, rendered in a balanced CSS multi-column flow (`.skill-groups`). The flow states a minimum column width and no column count, so it holds as many columns as the cell can fit at any window size; a long "All" list fills them evenly and extends the character sheet's single vertical scroll surface. Categories with zero skills defined still render, with an empty-state hint.
- **Custom skills:** actor-defined skills (via `TnoCustomSkillDialog`) are merged into the same list as built-ins by `getSkillDefinitions()` and behave identically — same roll flow, same advancement, own badge, always counted as "trained" regardless of rank so a freshly added rank-0 custom skill doesn't disappear from the default filter.
- **Per-row display:** name (with subgroup badge, e.g. "Medicine — First Aid" and "Berührte Asteroiden - Cubewanos" compacted to a `MED` / `BER` badge, and custom badge where applicable), rank (level chip, color-graded like the attribute cells once rank > 0), and an XP fraction (`xp`/`xpCost`, cost = `3 × (rank+1)`), highlighted "ready" once advancement is affordable.
- **Roll:** clicking a skill row opens `TnoRollDialog` preselecting the skill's suggested attribute (or whichever attribute the actor last rolled that skill against — `lastAttribute` sticks per-skill) and the skill's rank as a threshold component. Shift-clicking a *custom* skill opens its edit dialog instead of rolling.
- **Advancement:** the arrow button opens `TnoAdvanceDialog` for that skill.
- **Grouping, visually:** each category is a card with its name in the condensed cut, its points and XP beside it and the add-custom-skill `+` at the far end; rows are name · rank · XP bar.
- **Filter bar:** a segmented control of four mutually exclusive filters — **Trained** (rank > 0, has any XP banked, or custom), **Starter** (character-creation-selectable only), **Kampf** (the Kampf and Manöver categories in full, every other category hidden), **All** — persisted on the sheet instance (`this._skillFilter`) so it survives re-renders while the sheet stays open. Purely client-side (`_applySkillFilter`, no document re-render), so it also works on read-only/non-editable sheets.
- **Fuzzy search:** a search box, with a clear button while it holds text, does a diacritic/case-insensitive subsequence match against a row's skill name plus its subgroup label (`fuzzyMatch` — every character of the query must appear in order, gaps allowed; the subgroup label is part of the haystack because a badged family's shared prefix is no longer in the name it was factored out of, so "Asteroiden" must still find the four Berührte ones) and, while non-empty, overrides the category filter entirely so any matching skill surfaces regardless of trained/starter state. A group with zero visible rows under the current filter/search hides itself entirely (unless it has no skills defined at all, which keeps its empty-state placeholder).
- **Header badge:** total skill points (summed ranks) and total skill XP spent (`Σ skillRankXpCost(rank)`, cumulative cost to rank N = `3·N·(N+1)/2`) across all groups.

---

## Biography Tab

Plain `<textarea name="system.biography">`, not Foundry's ProseMirror rich-text editor — deliberately, since the editor requires an explicit click into an edit mode before typing, which is unnecessary friction for a simple free-text notes field.

---

## Inventory Tab

Renders `templates/actor/parts/actor-items.hbs`: the **ledger**, where every object the character owns appears exactly once whatever state it is in. Every owned physical item is either worn or carried, there is no carry/stow toggle, and both states now answer the footprint column. Gear is created here or through the `+` in the slot grid; both open the same dialog.

The ledger is a **table grouped by role** — Waffe, Rüstung, Verbrauch, Gegenstand — with a column set the reader picks. Roles are mutually exclusive, so the groups are a reading of the one list rather than four lists that could disagree, and an item still appears once. Every group renders even when empty, so a missing heading never has to be read as "that group is gone" rather than "none of those"; each carries a badge with its item count, its complete slot total, and its money value where any price is authored.

- **Columns.** The name heads every row and can neither be switched off nor picked — it is the row's identity rather than one of its values. Everything else comes from a picker (`parts/columns-popover.hbs`) listing the whole gear schema in the item sheet's own sections: Allgemein (SLT, Menge, Platz, SV, Status, offene Pflichtwerte), Handel (Grundpreis, Wert, Verfügbarkeit), Waffe (Einsatz, WA, WF, DK, RB, SS, WS, HH) and Rüstung (Stelle, RH, RW, RA). The default is SLT · Menge · SV. Price and availability are deliberately absent from the compact play card, which is read mid-roll; a ledger is exactly where they belong.
- **Three kinds of silence, kept apart.** A column the row cannot be asked — an armour value on a weapon, DK on a ranged profile, or RH/RA on an Unterkleidung — is hatched `n/a`, the same convention the item card uses. A column it *could* answer that nobody has filled in is a dash, per the null-versus-zero rule. Only an authored value is a figure. Worn and carried rows both answer the footprint column. Nothing is hidden per row: the grid keeps its shape down the list.
- **Sorting is view-only.** A header click orders the rows inside each group and never writes `item.sort`, which is the order each Basics slot band packs from — a click here must not repack a raster the player arranged by hand in another tab. Values the column cannot answer sort last in *both* directions: sorting by RH to find the hardest armour and sorting to find the softest are the same act of pulling the pieces that have an RH to the top. For the same reason, dropping a row back onto the table sorts nothing.
- **Search** filters rows by name across every group, client-side like the skill search, so typing costs no re-render.
- **The layout is a per-user client setting** (`tno.itemTableLayout`, `scope: 'client'`, `config: false`), like `basicsLayout`. Which columns someone reads is a property of the reader, not of the character, so it follows them to every sheet they open. Nothing in it is game state.

The maths and the ordering live in [`helpers/item-table.mjs`](../../module/helpers/item-table.mjs) as pure functions; the sheet turns the raw values into words.

The visual views used to sit above that flat list and now live in the Basics tab as columns of its own — they answer "what am I wearing / hauling right now?", which is asked mid-roll rather than while bookkeeping. All of them sit in the Basics tab's right-hand column: the paper doll on top, then the slot raster, Kleinkram and the wallet as the three tabs of one panel. All are character-only. The equipment arrangements are derived on every render from `_prepareEquipment()`; the wallet instead reads its five persisted native-currency balances from `system.money`:

- **Paper doll** (`parts/actor-paperdoll.hbs`) — the Unterkleidung as a separated base-layer row beneath the four hit locations (Kopf, Torso, Arme, Beine), each with its effective SV/RH/RW/RA; the rows take the column's width and a small silhouette stands to their right. The summed SV of everything worn is the column header's figure ("Summe SV"), in the warning colour when Strength falls short; the shortfall itself is still said in words under the rows. Every silhouette zone keeps a full-size base shape, painted from `z.baseState` as `bare` (grey — no Unterkleidung) or `suited` (pale green — covered by Unterkleidung, which closes coverage but grants no hardness). A worn zone addon is a smaller green plate drawn above that base, so its exposed rim still shows whether Unterkleidung is present underneath. **An empty zone is a drop target and nothing else:** a piece is worn by dragging it out of the slot grid onto the doll, and it lands in the zone it was authored for wherever on the block it is dropped. While one is in flight the whole worn block lights up as the drop area — the same wash the slot grid shows for the way back — and the piece's own zone, row and silhouette shape, is marked stronger inside it. Clicking an empty zone used to offer to author a piece on the spot, which conjured armour out of an empty doll — wearing something is a state change on gear already in hand, so the click path is gone. A filled row is itself draggable, and dropping it back into the slot grid takes the piece off: the row's `x` is the same act. Clicking a filled row opens the piece's own sheet; its duplicate slot-band entry provides the same access from the budget view. The compact **Dodge (Ausweichen)** icon/value button sits directly beneath the silhouette: it rolls Beweglichkeit + Akrobatik when the current Haltung permits it and carries the next-defence malus as a small badge after the first dodge in that stance — a Malusstufe per repeat, summing up, less whatever Deckung nutzen or Haken schlagen buys back in the current Haltung. When the current Haltung forbids Dodge, the control uses the shared 35% warning-red fill and is struck through; a control disabled only because the sheet is read-only stays neutral. It is deliberately separate from the four zone interactions beside it, which continue to start Resistance for their specific hit location.
- **In der Hand** (`parts/actor-paperdoll.hbs`, under the armour rows) — two slots, R. Hand and L. Hand, mirroring the 2026-10 "Kompakt · Matrix + Hände" mockup; the silhouette shows each hand as a dot under its arm, filled while it holds something. Any physical item (not only weapons) is taken in hand by dragging it onto a slot; an item marked *Zweihändig* (a checkbox in a weapon's Inventar section of the item editor) fills both and shows as one slot across them, and taking anything into a hand that holds a two-handed piece puts that piece down whole. The slot's `x`, or dragging it back into the raster, puts it down; dragging it to the other slot moves it. Taking a piece in hand picks it up from Zurückgelassen and takes it off the body; leaving it behind or wearing it lets go. **It has no rule effect**: a held item stays carried — same slots, same band in the raster, though its cell takes the worn blue and the label *In der Hand* — and every weapon keeps its Angriff/Parade held or not. The rules' Bereit machen and Schnellziehen stay at the table.
- **Geldbörse** (`parts/actor-money-wallet.hbs`) — the third tab of the carried-things panel ("Inventar" · "Kleinkram" · "Geld"); the tab label carries the combined euro value, the Kleinkram tab its item count, the Inventar tab used/capacity. Which tab shows is view state on the open sheet. The thin rows are the actual holdings, one per currency with a non-zero balance and in its own units: a purse holding nothing but 10.000 Imperialer Qian lists that one row and no other coin, because a balance the character does not have is not a holding. The sheet used to express the same combined value twice, once in OR and once in Qian, which read as two kinds of money in a purse that held one. The combined euro value remains secondary in the tab label and is unaffected — those 10.000 Qian are still 100,00 €. An empty purse says so in one italic line rather than showing a headed but rowless block. Owners click the section to open a top-layer editor for all five balances, with their money forms, individual exchange rates, live euro conversions and a live total. Or Odur and Or Forseti are approximate and prefix every total containing them with `≈`; a row's own amount is a count of notes and chips and never approximate. The editor is an `item-popover` variant and reuses that surface's head, fact rows and action bar rather than introducing parallel popup chrome. Read-only viewers get the same compact holdings without a dead edit affordance.
- **Trageslots** (`parts/actor-slot-grid.hbs`) — worn gear and carried gear share one budget. A segmented meter above the raster shows it slot by slot: worn, carried, free, and past the budget in warning red. Worn pieces form the first, worn-blue band (sorted among themselves), followed by carried pieces in their own `sort` order; both cost their authored footprint. Each item is a card — its art (or role icon) with the role as a corner badge, its name, and its type line — and the free room is one dashed summary cell ("9 frei"), which is both the drop target that moves a piece to the end and, for an owner, the create action. Cells can be opened, re-sorted, or dragged onto the paper doll to wear armour. Without a container only the worn band counts and positive-cost carried gear leaves the raster. The grid contains exactly the character's capacity and renders excess gear as overload rather than refusing it.
- **Zurückgelassen** (`parts/actor-slot-grid.hbs`, under the raster) — what the character still owns but does not have on them: put down, handed over, taken away. A dashed block listing those pieces dimmed, one thin row each; nothing in it costs a slot, can be worn or offers a combat action. Dragging any physical item onto the block leaves it behind (a worn piece comes off first); dragging it back into the raster or onto the doll picks it up. The item popover offers the same toggle as *Zurücklassen* / *Mitnehmen*, which is also the path for Kleinkram. The Inventar ledger keeps listing such a piece, marked and dimmed, outside its group's slot total. The rules have no such state — it is table bookkeeping, stored as `system.stashed` on the item.
- **Kleinkram** (`parts/actor-trinkets.hbs`) — Papiere und Krimskrams: carried gear the rules price at 0 slots, so it never takes a cell in the raster and gets the Kleinkram tab: a client-side name filter over a list of name-and-count rows. Same interactions as a cell (open, sort, wear), but **no create control and no drop target**: an item is Kleinkram exactly when its `slots` is 0, which is authored on the item's own sheet, and there is no state here to put a piece into. Currency balances are not Items and appear only in the wallet.

**Weapons have no view of their own.** Gear with the weapon role carries its SV, a mandatory Waffenattribut (one of the twelve primary attributes) and Waffenfertigkeit, a melee or ranged profile, DK or five range-band modifiers, HH, RB, and SS/WS damage values (plain numbers from 0 upward, not counts of dice). Clicking an owned weapon opens its compact overview, which offers an Angriff würfeln action using that weapon's Waffenattribut and Waffenfertigkeit as fixed components: the roll dialog does not permit another attribute. A carried weapon is a carried item like any other — it appears in the Trageslots raster — and what is in hand is recorded under the paper doll (*In der Hand*, below), as bookkeeping that changes no roll.

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
- `TNO.Skill*` — skills tab title, search placeholder/hint/clear, filter labels/hints (including `SkillFilterCombat`), category-empty hint, advance action label.
- `TNO.CustomSkill.*` — add button, badge, shift-click hint for custom skills.
- `TNO.Derived.*` / `TNO.DerivedShort.*` / `TNO.DerivedHint.*` — derived-value labels (the banner's Initiative and 6. Sinn pills, the movement line, carry slots) in long/short/tooltip variants.
- `TNO.Money.Tab` — the Geld tab's label; the wallet's other keys are under `TNO.Money.*`.
- `TNO.TabBasics` / `TabDescription` / `TabItems` — tab rail labels (`TabItems` reads "Inventar" / "Inventory": the tab covers the inventory rules as a whole, not just a list of things).
- `TNO.Inventory.*` — Trageslots view: title, slot-cost hints, the `Keine Tasche` badge, the add-dialog's labels, the cell/free-cell hints, the free-slot summary (`FreeSlots`) and the meter's accessible label (`MeterLabel`), the Kleinkram tab's title, explanation, empty state, filter and no-match line (`Trinkets*`), and the Zurückgelassen block's title, hint, empty state and the popover toggle (`Stashed*`, `Stash*`, `Unstash*`). The two load-state hints moved to `TNO.DerivedHint.NoSprint` / `CrawlOnly`, where the movement chip reads them.
- `TNO.Damage.*` — damage-pool labels, stepper actions, the banner block's row/malus tooltips (free remainder, capacity, conversion, malus breakdown) and the Kampfunfähig warning.
- `TNO.Status.*` — the six condition names, threshold/state wording, chip summary and raster interaction hint, plus the three derived conditions: their names (`Loaded` / `Overloaded`, `ArmorTooHeavy`, `NoDodge`), one reason each, written as why the condition is on (`CarryHalf` / `CarryFull`, `ArmorSvShort`, `StanceBlocksDodge`); the damage lights' reason names a manual override as such (`ThresholdForced`, `ThresholdSuppressed`) and their consequences (`OverloadEffect.*`, `ArmorEffect`, `DodgeEffect.*`).
- `TNO.Armor.*` — paper doll: its column caption (`WornTitle`), zone labels (`TNO.Armor.Zone.*`), the RH/RW/RA long/short/hint triples, the unequip action, the drop hint on an empty zone, and the Stärkevorraussetzung warning.
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
4. **Mobile/narrow-width layout** — the banner and attribute matrix now have container-query fallbacks, but no PRD-level pass has been done on the complete sheet below its 1280px default width.

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.5 | 2026-10-04 | "Kompakt · Matrix E": Basics as two columns, compact attribute matrix with category headings, Inventar/Kleinkram/Geld as one tabbed panel | System |
| 1.8 | 2026-10-04 | Zurückgelassen: gear can be left behind under the slot raster — owned, outside the budget, not wearable or usable | System |
| 1.7 | 2026-10-04 | The whole paper doll takes an armour drop and lights up as an area while one is in flight, the piece's zone marked stronger inside it; the wrong-zone warning is gone | System |
| 1.6 | 2026-10-04 | The movement tiers moved from the worn-gear column into the banner, beside the damage tracks | System |
| 1.4 | 2026-10-04 | 2026-10 redesign: flat ground and IBM Plex, attribute tiles without axis headers, Kleinkram/Geld tabs, paper doll rows left of a small silhouette with the SV total in the header, slot cards with a meter and one free-slot cell, Kampf skill filter | System |
| 1.3 | 2026-09-02 | Extracted the Banner section into [header-banner-prd.md](header-banner-prd.md) | System |
| 1.2 | 2026-08-26 | Moved Dodge from the banner to the paper-doll defence surface | System |
| 1.1 | 2026-08-03 | Replaced stale sidebar description with responsive profile-banner and portrait contract | System |
| 1.0 | 2026-07-21 | Initial PRD creation, documenting existing implementation | System |

---

**End of Document**

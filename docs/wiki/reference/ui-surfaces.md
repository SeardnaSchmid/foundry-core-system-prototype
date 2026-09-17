---
type: reference
title: UI surfaces
description: Handlebars templates and SCSS components, mapped to the app or sheet that consumes them.
tags: [templates, handlebars, scss, reference]
resource: [templates, src/scss]
related: [reference/module-map, concepts/combat-turn-order]
---

# UI surfaces

## Templates → consumer

| Template | Consumer |
| --- | --- |
| `actor/actor-character-sheet.hbs` | `TnoActorSheet` (type `character`) |
| `actor/actor-npc-sheet.hbs` | `TnoActorSheet` (type `npc`) |
| `actor/parts/actor-items.hbs` | The actor sheet's Inventar tab, on both actor types: the gear ledger as a role-grouped table, then Merkmale, then Active Effects. Not a second carry view — see the note below |
| `actor/parts/actor-effects.hbs` | Included by `actor-items.hbs`, once, under its own heading |
| `actor/parts/actor-features.hbs` | Included by `actor-items.hbs`, once, under its own heading |
| `actor/parts/actor-malus.hbs` | Character-only malus cell, on the name's baseline in the banner's identity lane: the band's largest figure, drawn only when it is one (from `−1` down or `+1` up, sign explicit) and absent at zero, with the warning fill and a glyph when Kampfunfähig. One of the condition panel's two doors — see [damage.md](../concepts/damage.md) |
| `actor/parts/actor-damage.hbs` | Character-only damage tracks under the banner's subtitle: two counted box rows (Wucht, Schaden) against each pool's own capacity mark, always stacked with Wucht on the upper line — the fixed-width tags align both runs of boxes into one comparable column. Read-only — steppers, the clear action and the raster moved to `condition-panel.hbs`. The condition panel's second door — see [damage.md](../concepts/damage.md) |
| `actor/parts/actor-status.hbs` | The Zustände row, in the banner's identity lane directly under the damage tracks it is derived from: one named chip per active condition, severity-sorted, with a blue corner point on a manually forced one. Names rather than codes because the row is normally empty or short; past `BANNER_CONDITION_LIMIT` (3) the remainder becomes a `+n` counter and the panel carries the full list. Absent entirely when nothing is active. A borderless `<button>` shaped like `.banner-tracks` that opens `condition-panel.hbs` — see [damage.md](../concepts/damage.md#the-condition-collection) |
| `actor/parts/actor-edge.hbs` | The Edge pill, third of the banner's state controls: the reserve as pips only, one per point of `derived.edgePoolMax`. Opens `edge-popover.hbs`, which carries the thresholds and the manual correction — see [edge-pool.md](../concepts/edge-pool.md) |
| `actor/parts/actor-derived.hbs` | The derived-values strip under the attribute matrix in the Basics tab: Initiative and 6. Sinn as two roll buttons sharing one row half and half, each with its full name above the value and the dice notation it rolls. Both left the banner because each is a pure function of base attributes |
| `actor/parts/actor-movement.hbs` | The three Bewegung tiers as one read-only dashed line, a tier the load has taken away struck through. It closes the worn-gear column rather than the derived strip: the summed Stärkevoraussetzung that strikes a tier through is totalled one line above it, so cause and consequence share a column |
| `actor/parts/actor-paperdoll.hbs`, `actor-money-wallet.hbs`, `actor-trinkets.hbs`, `actor-slot-grid.hbs` | The equipment/money surfaces of the character sheet's Basics tab — see [inventory.md](../concepts/inventory.md). The paper doll, including its compact Dodge control beneath the silhouette, and the stacked Kleinkram/wallet column sit in the top row; the slot raster sits in the bottom one |
| `actor/parts/item-popover.hbs` | The actor-sheet item popover: the shared view-mode card plus the live item actions. Its footer runs two button sizes and no more, and the size is a property of the **row**: `.item-popover-actions-row` is 26px/11px, `--lead` is 30px/13px, carried as three custom properties so every surface reusing this bar inherits the pair instead of restating padding and font-size. Every labelled button takes an equal share of its row and never wraps. Delete is the one action carrying no label: a square glyph pushed off the labelled pair by its own margin, named in its tooltip the way every other delete affordance in the system is |
| `actor/parts/money-popover.hbs` | Body-level five-currency wallet editor with money forms, rates and live euro conversions; reuses the item-popover component structure |
| `actor/parts/columns-popover.hbs` | The Inventar table's column picker, the third body-level popover; reuses the item-popover frame and specializes only the checkbox sections |
| `actor/parts/stance-popover.hbs` | The Haltung picker, the fourth body-level popover: all nine Haltungen as buttons in the bands `CONFIG.TNO.stanceGroups` names, beside a detail panel that reads out the hovered one and the defence it permits. Two columns (`auto-fill`, so a lone option in a band keeps the others' width and the picker folds to one column when the viewport is narrow) — at three the longer names wrapped, German worst. Opened from the banner's Haltung chip |
| `actor/parts/condition-panel.hbs` | The condition panel, the fifth body-level popover, opened from the Zustände row or from either half of the vitals row. Three sections: the two damage tracks with their stepper pair, the clear action and the figures written out; the 3×2 override raster directly beneath them, each position a pill carrying its own condition name beside its tag; then every active condition as condition → effect → threshold. Read-only viewers get the same panel without steppers, clear action or clickable lights — see [damage.md](../concepts/damage.md#the-condition-collection) |
| `actor/parts/edge-popover.hbs` | The Edge popover, the sixth body-level popover: the three derived thresholds the pips cannot show, plus the GM correction that replaced the banner's number field, whose every step is announced in chat in either direction — see [edge-pool.md](../concepts/edge-pool.md) |
| `apps/roll-dialog.hbs` | `TnoRollDialog`, a two-column `.tno-ledger` (line item · `Δ SCHW.`) grouped by who owns the answer, with attribute/range radiogroups as full-width `.tno-ledger-control` pickers and a truthful pending-or-ready total closing the page — see [the dialog as a ledger](../concepts/combat-roll-workflows.md#the-dialog-as-a-ledger) |
| `apps/base-roll-dialog.hbs` | `TnoBaseRollDialog`; shares the full dialog's footer and radiogroup control styles |
| `apps/parts/advantage-picker.hbs` | Included by both roll dialogs; its button radiogroup and the attribute heatmap are wired by `bindRadioGroup` in `roll-dialog-shared.mjs` |
| `apps/create-item-dialog.hbs` | The add-to-inventory `DialogV2` opened by `_promptCreateItem` — name plus the four role cards, see [item-roles.md](../concepts/item-roles.md) |
| `apps/take-item-dialog.hbs` | The take-from-chat `DialogV2` opened by `item-transfer.mjs` — which of the reader's actors receives the copy, see [item-roles.md](../concepts/item-roles.md#taking-a-posted-item) |
| `apps/advance-dialog.hbs` | `TnoAdvanceDialog` |
| `apps/heatmap-lab.hbs` | `TnoHeatmapLab` |
| `apps/campaign-briefing.hbs` | `TnoCampaignBriefing`: a frameless, full-canvas player board with the star map as its visual anchor and previous-session recaps newest first; `TnoCampaignBriefingEditor` renders the GM-only editable variant from the same template |
| `apps/custom-skill-dialog.hbs` | `TnoCustomSkillDialog` |
| `apps/custom-skills-overview.hbs` | `TnoCustomSkillsOverview` |
| `chat/roll-card.hbs` | `rollTno()` / `rollTnoBase()` in `dice.mjs` — see [dice-resolution.md](../concepts/dice-resolution.md) |
| `chat/edge-panel.hbs`, `chat/parts/trial-error-tracker.hbs` | `chat.mjs`'s `renderEdgeSection()` — see [edge-pool.md](../concepts/edge-pool.md) |
| `chat/item-summary.hbs` | `TnoItem#roll()`; wraps the shared view-mode card. `item-transfer.mjs`'s `renderItemTakeAction()` appends the take action to it per viewer — see [item-roles.md](../concepts/item-roles.md#taking-a-posted-item) |
| `item/item-gear-sheet.hbs` | `TnoGearSheet` — the row editor for every physical item, see [item-roles.md](../concepts/item-roles.md) |
| `item/parts/item-gear-summary.hbs` | The shared view-mode card — badges, probe band, value tiles, warning banner, detail rows — used by the actor-sheet popover and chat item cards |
| `item/parts/item-role-weapon.hbs`, `item-role-armor.hbs`, `item-role-consumable.hbs` | Included by `item-gear-sheet.hbs`, one per role the item has switched on |
| `item/parts/item-scale.hbs` | The click-scale control (DK, RD, RH, RW). Called with `{{> item-scale cells=scales.dk key='dk'}}` |
| `item/item-sheet.hbs`, `item-feature-sheet.hbs`, `item-spell-sheet.hbs` | `TnoItemSheet`, resolved per item type — only `feature` and `spell` reach it now |
| `item/parts/item-delete.hbs` | Delete action included by all item sheet templates; item sheets intentionally expose no Foundry Active Effect UI |
| `item/parts/item-post.hbs` | "Show in chat" action in the gear dialog's footer, beside delete. The V1 feature/spell sheets get the same action from `TnoItemSheet#_getHeaderButtons` instead, since their footer is inside a tab |
| `sidebar/combat-tracker.hbs` | `TnoCombatTracker`'s `tracker` part. **A copy of a core template** — `templates/sidebar/tabs/combat/tracker.hbs` from Foundry 14.364 — with four marked TNO changes: the Haltung chip under each name, the interrupt button as the last left-aligned control in the control row (not beside the initiative — core's `.token-initiative` is a one-child flex column and a second child there changed the row height; and last in its group so nothing shifts when a row is spent), an initiative field an owner may edit rather than only the GM, and the spent-this-round marker on the row. The `header` and `footer` parts stay on core's own templates. Diff it against the core file before every Foundry upgrade; `tests/e2e/specs/combat-tracker-stance.spec.mjs` guards the core parts in the meantime — see [combat-turn-order.md](../concepts/combat-turn-order.md) |

All of the above are preloaded by
[`helpers/templates.mjs`](../../../module/helpers/templates.mjs) — if you
add a new one, register it there too or Foundry falls back to a
render-time fetch (works, but loses the preload benefit).

## The Basics tab's grid

Two full-width rows, each a flex row of `.basics-cell` columns with a
`.basics-splitter` at every boundary:

| Row (`data-split-row`) | Columns |
| --- | --- |
| `top` | attribute matrix + damage widget · paper doll · Kleinkram |
| `bottom` | skill list · Trageslots raster |

Both rows size to their own content. Long skill and inventory lists extend the
character sheet's single `.window-content` scroll surface. The tab rail stays
there too: ApplicationV2 resolves its tab actions from that container.

A column's width is a **grow factor off a zero basis**, not a width: the
handles' own strips come off the row first and the columns divide the rest, so
a resized window keeps the proportions. The shares live in the `basicsLayout`
client setting, one array per row, normalised to sum to 1 on read.

**A handle only ever redistributes the pair it sits between.** That is what
makes a three-column row with two handles behave the way a reader expects, and
it is why the row rather than one boundary is what a double-click resets: with
two handles, restoring only the pair under the pointer would leave the row in a
state the defaults never had. The template is the single place a row's column
count is declared — `_applyColumnSplit()` and the pointer/keyboard handlers in
[`actor-sheet.mjs`](../../../module/sheets/actor-sheet.mjs) read it off the DOM.

The stylesheet carries the same defaults per column class, which is what the
tab is laid out with until the sheet's first render writes `flex-grow`. Keep
them in step with `BASICS_LAYOUT_DEFAULT`.

## SCSS components

`src/scss/tno.scss` is the single entry point compiled to `css/tno.css`
(see [build-test-release.md](../guides/build-test-release.md)).

| Partial | Covers |
| --- | --- |
| `components/_dice-dialog.scss`, `_dice-card.scss` | Roll dialogs and the chat roll card / edge panel |
| `components/_forms.scss` | Shared form controls plus actor-sheet layout, including the dark-fade portrait banner, its `portrait identity state` grid, the identity lane's headline/subtitle/tracks stack, the three glass pill buttons of the `.banner-state` lane, the condition raster and stepper atoms the panel reuses, the Basics tab's derived strip, portrait edit affordance and the responsive banner/Basics split rows. The header reuses `$c-primary` blue only as a semantic fill, `$c-warning` red for negative and `$c-ready` green for positive/resource state; borders remain neutral grey/charcoal and icons monochrome black/white. It carries no `z-index` override for an open panel — both panels the band opens are top-layer popovers. Its banner breakpoints consume the named `character-sheet` inline-size container declared on `.window-content` in `global/_window.scss` |
| `components/_resource.scss` | Largest component partial — attribute heatmap grid, skill groups, edge pool display |
| `components/_campaign-briefing.scss` | The full-canvas player briefing's masthead, chart framing, star map and scrollable recap archive, plus the conventional GM editor layout |
| `components/_items.scss` | The two plain lists left on the Inventar tab — Merkmale and Active Effects — plus the tab's own spacing |
| `components/_item-table.scss` | The Inventar tab's gear ledger: toolbar, the single CSS grid the header band, group bands and `subgrid` rows all share, the hatched n/a cell, and the column picker's popover body |
| `components/_item-dialog.scss` | Both gear views: overview cards/profiles/actions plus the editor's label column, scales, cycleable range bands, repeatable consumable effects, resizable description editor, chips, segments, splits and steppers. Also the add-to-inventory dialog (`&.create-item-dialog`), which reuses the same name-as-title input and selected-chip colours, and the deliberately plainer take-from-chat dialog (`&.take-item-dialog`), which asks only where a finished item goes and so stays a native select. Nested with `&.gear-dialog` / `&.create-item-dialog` because those classes sit on the window root alongside `tno`, not inside it |
| `components/_item-popover.scss` | The view-mode card in both its homes — the actor sheet's top-layer popover (`&.item-popover`) and the chat card (`&.item-chat-summary`) — plus the wallet editor (`&.item-popover.money-popover`), Haltung picker (`&.item-popover.stance-popover`), condition panel (`&.item-popover.condition-popover`) and Edge popover (`&.item-popover.edge-popover`) variants. Header, value tiles, detail rows and action bar are shared, and every surface that reuses the bar marks its principal row `--lead` rather than sizing its own buttons: the chat card's take action (`.item-chat-actions`, built in `item-transfer.mjs`), the wallet editor's Cancel/Save pair, the item card's combat row. None of them is the roll blue — `.wide` alone carries that, and it now carries colour only. The condition panel's clear action is not in a bar but wears the same secondary numbers |
| `components/_inventory.scss` | The paper doll and its Dodge action, compact borderless wallet, Kleinkram column and Trageslots grid including the worn band — see [inventory.md](../concepts/inventory.md). The narrower padding they take inside a Basics column is set on `.basics-cell` in `_forms.scss`, not here |
| `components/_effects.scss` | Active effect list rendering |
| `components/_tooltip.scss` | Both halves of the rich `data-tooltip-html` tooltip: the `.tno-tooltip` card itself, declared at the top level of `tno.scss` because Foundry mounts `#tooltip` on `<body>` outside any `.tno` element, and `.tno-tooltip-hint`, the dotted underline marking a plain-text trigger. Icon and chip triggers are left unmarked — they already carry their own affordance |
| `components/_base-roll-button.scss` | The chat-log "Basiswürfel" quick-roll button |
| `components/_combat-tracker.scss` | The sidebar tracker's Haltung chip, spent-round dimming, interrupt button and drag drop-target. Imported **outside** the `.tno` block, like `_base-roll-button` above it: the sidebar is painted by Foundry's own light/dark theme, and pulling it into `.tno` would drag the sheets' parchment palette and every sheet component with it into a surface none of them were written for. It therefore declares its own four band colours plus the interrupt blue as tokens on `.combat-tracker`, with a `.theme-dark` set beside them — the sheets' `utils/_colors.scss` is tuned for parchment and unreadable here. The chip picks its band off `data-stance-group`, so adding a Haltung to an existing band needs no CSS |
| `global/_flex.scss`, `_grid.scss`, `_window.scss` | Layout primitives |
| `utils/_colors.scss`, `_mixins.scss`, `_typography.scss`, `_variables.scss` | Shared tokens |

Note: heatmap gradient **colors** are computed in JS
([`heatmap.mjs`](../../../module/helpers/heatmap.mjs)) and applied as
inline styles, not SCSS — the SCSS only styles the grid/cell chrome around
them. The attribute tile itself is a corner-badge layout: the name owns the
tile's width over two reserved lines, the value sits opposite it as a small
ink-washed badge, and the XP track is inset along the bottom edge. The tile
measurements the container tiers re-scale (`--heat-pad`, `--heat-gap`,
`--heat-bar`, `--heat-name-size`, `--heat-badge-size`) are custom properties
on `.heatmap-cell`, so each tier overrides those rather than restating the
padding and the absolutely-positioned bar's inset separately.

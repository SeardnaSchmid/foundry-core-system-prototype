---
type: reference
title: UI surfaces
description: Handlebars templates and SCSS components, mapped to the app or sheet that consumes them.
tags: [templates, handlebars, scss, reference]
resource: [templates, src/scss]
related: [reference/module-map]
---

# UI surfaces

## Templates → consumer

| Template | Consumer |
| --- | --- |
| `actor/actor-character-sheet.hbs` | `TnoActorSheet` (type `character`) |
| `actor/actor-npc-sheet.hbs` | `TnoActorSheet` (type `npc`) |
| `actor/parts/actor-items.hbs`, `actor-features.hbs`, `actor-spells.hbs`, `actor-effects.hbs` | Included by the actor sheet templates above |
| `actor/parts/actor-paperdoll.hbs`, `actor-trinkets.hbs`, `actor-slot-grid.hbs` | Three of the five columns of the character sheet's Basics tab — see [inventory.md](../concepts/inventory.md). The paper doll and the Kleinkram column sit in the top row, the carry raster in the bottom one |
| `apps/roll-dialog.hbs` | `TnoRollDialog` |
| `apps/base-roll-dialog.hbs` | `TnoBaseRollDialog` |
| `apps/parts/advantage-picker.hbs` | Included by both roll dialogs, via `roll-dialog-shared.mjs` |
| `apps/advance-dialog.hbs` | `TnoAdvanceDialog` |
| `apps/heatmap-lab.hbs` | `TnoHeatmapLab` |
| `apps/custom-skill-dialog.hbs` | `TnoCustomSkillDialog` |
| `apps/custom-skills-overview.hbs` | `TnoCustomSkillsOverview` |
| `chat/roll-card.hbs` | `rollTno()` / `rollTnoBase()` in `dice.mjs` — see [dice-resolution.md](../concepts/dice-resolution.md) |
| `chat/edge-panel.hbs`, `chat/parts/trial-error-tracker.hbs` | `chat.mjs`'s `renderEdgeSection()` — see [edge-pool.md](../concepts/edge-pool.md) |
| `item/item-gear-sheet.hbs` | `TnoGearSheet` — the Overview/Edit shell for every physical item, see [item-roles.md](../concepts/item-roles.md) |
| `item/parts/item-gear-overview.hbs` | The play-facing gear summary: role-shaped visualizations, actor context, and safe item actions |
| `item/parts/item-role-weapon.hbs`, `item-role-armor.hbs`, `item-role-consumable.hbs` | Included by `item-gear-sheet.hbs`, one per role the item has switched on |
| `item/parts/item-scale.hbs` | The click-scale control (DK, RD, RH, RW). Called with `{{> item-scale cells=scales.dk key='dk'}}` |
| `item/item-sheet.hbs`, `item-feature-sheet.hbs`, `item-spell-sheet.hbs` | `TnoItemSheet`, resolved per item type — only `feature` and `spell` reach it now |
| `item/parts/item-delete.hbs` | Delete action included by all item sheet templates; item sheets intentionally expose no Foundry Active Effect UI |

All of the above are preloaded by
[`helpers/templates.mjs`](../../../module/helpers/templates.mjs) — if you
add a new one, register it there too or Foundry falls back to a
render-time fetch (works, but loses the preload benefit).

## The Basics tab's grid

Two full-width rows, each a flex row of `.basics-cell` columns with a
`.basics-splitter` at every boundary:

| Row (`data-split-row`) | Columns |
| --- | --- |
| `top` | attribute matrix · paper doll · Kleinkram |
| `bottom` | skill list · Trageslots raster |

The top row sizes to its own content and the bottom row takes what is left —
the blocks above have a natural height, the two lists below are the ones that
can always use more.

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
| `components/_resource.scss` | Largest component partial — attribute heatmap grid, skill groups, edge pool display |
| `components/_forms.scss` | Shared form controls across dialogs and sheets |
| `components/_items.scss` | Inventory list rendering, including the Rollen column's tags |
| `components/_item-dialog.scss` | Both gear views: overview cards/profiles/actions plus the editor's label column, scales, cycleable range bands, repeatable consumable effects, resizable description editor, chips, segments, splits and steppers. Nested with `&.gear-dialog` because the class sits on the sheet root alongside `tno`, not inside it |
| `components/_inventory.scss` | The paper doll, the Kleinkram column and the Trageslots grid — see [inventory.md](../concepts/inventory.md). The narrower padding they take inside a Basics column is set on `.basics-cell` in `_forms.scss`, not here |
| `components/_effects.scss` | Active effect list rendering |
| `components/_base-roll-button.scss` | The chat-log "Basiswürfel" quick-roll button |
| `global/_flex.scss`, `_grid.scss`, `_window.scss` | Layout primitives |
| `utils/_colors.scss`, `_mixins.scss`, `_typography.scss`, `_variables.scss` | Shared tokens |

Note: heatmap gradient **colors** are computed in JS
([`heatmap.mjs`](../../../module/helpers/heatmap.mjs)) and applied as
inline styles, not SCSS — the SCSS only styles the grid/cell chrome around
them.

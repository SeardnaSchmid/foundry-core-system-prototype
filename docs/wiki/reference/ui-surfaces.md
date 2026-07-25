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
| `apps/roll-dialog.hbs` | `TnoRollDialog` |
| `apps/base-roll-dialog.hbs` | `TnoBaseRollDialog` |
| `apps/parts/advantage-picker.hbs` | Included by both roll dialogs, via `roll-dialog-shared.mjs` |
| `apps/advance-dialog.hbs` | `TnoAdvanceDialog` |
| `apps/heatmap-lab.hbs` | `TnoHeatmapLab` |
| `apps/custom-skill-dialog.hbs` | `TnoCustomSkillDialog` |
| `apps/custom-skills-overview.hbs` | `TnoCustomSkillsOverview` |
| `chat/roll-card.hbs` | `rollTno()` / `rollTnoBase()` in `dice.mjs` — see [dice-resolution.md](../concepts/dice-resolution.md) |
| `chat/edge-panel.hbs`, `chat/parts/trial-error-tracker.hbs` | `chat.mjs`'s `renderEdgeSection()` — see [edge-pool.md](../concepts/edge-pool.md) |
| `item/item-sheet.hbs`, `item-item-sheet.hbs`, `item-feature-sheet.hbs`, `item-spell-sheet.hbs` | `TnoItemSheet`, resolved per item type |
| `item/parts/item-effects.hbs` | Included by all item sheet templates |

All of the above are preloaded by
[`helpers/templates.mjs`](../../../module/helpers/templates.mjs) — if you
add a new one, register it there too or Foundry falls back to a
render-time fetch (works, but loses the preload benefit).

## SCSS components

`src/scss/tno.scss` is the single entry point compiled to `css/tno.css`
(see [build-test-release.md](../guides/build-test-release.md)).

| Partial | Covers |
| --- | --- |
| `components/_dice-dialog.scss`, `_dice-card.scss` | Roll dialogs and the chat roll card / edge panel |
| `components/_resource.scss` | Largest component partial — attribute heatmap grid, skill groups, edge pool display |
| `components/_forms.scss` | Shared form controls across dialogs and sheets |
| `components/_items.scss` | Inventory list rendering |
| `components/_effects.scss` | Active effect list rendering |
| `components/_base-roll-button.scss` | The chat-log "Basiswürfel" quick-roll button |
| `global/_flex.scss`, `_grid.scss`, `_window.scss` | Layout primitives |
| `utils/_colors.scss`, `_mixins.scss`, `_typography.scss`, `_variables.scss` | Shared tokens |

Note: heatmap gradient **colors** are computed in JS
([`heatmap.mjs`](../../../module/helpers/heatmap.mjs)) and applied as
inline styles, not SCSS — the SCSS only styles the grid/cell chrome around
them.

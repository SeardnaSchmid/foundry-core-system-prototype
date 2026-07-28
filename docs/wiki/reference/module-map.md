---
type: reference
title: Module map
description: Every file in module/, its export, and its responsibility, organized by layer.
tags: [reference, module-map, files]
resource: [module/documents, module/sheets, module/helpers, module/apps]
related: [architecture/layering]
---

# Module map

See [architecture/layering.md](../architecture/layering.md) for how these
layers depend on each other.

## `module/tno.mjs`

Entry point, no exports (side-effecting init). See
[bootstrap.md](../architecture/bootstrap.md).

## `documents/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `actor.mjs` | `TnoActor extends Actor` | Derived-data computation — see [data-schema.md](../architecture/data-schema.md) |
| `item.mjs` | `TnoItem extends Item` | `getRollData()`, `roll()` (formula eval or flavor-only chat message) |

## `sheets/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `actor-sheet.mjs` | `TnoActorSheet extends ActorSheetV2` | Character/NPC sheet: attribute heatmap grid, skill groups with filter/search, inventory, effects, edge pool display |
| `item-sheet.mjs` | `TnoItemSheet extends ItemSheet` | Generic sheet for `item`/`feature`/`spell`/`armor`, template resolved per type |

## `helpers/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `config.mjs` | `TNO` | All game constants (`CONFIG.TNO`) — see [attributes.md](../concepts/attributes.md), [skills.md](../concepts/skills.md) |
| `attributes.mjs` | `BASE_MIN`, `BASE_MAX`, `TEMP_MIN`, `TEMP_MAX`, `tempValueForBase` | Attribute base/temp value ranges and temp-modifier-preserving base changes — see [attributes.md](../concepts/attributes.md) |
| `dice.mjs` | `TNO_ADVANTAGE*`, `describeAdvantage`, `dieCountFor`, `pickCountingDie`, `criticalResultFor`, `rollTno`, `rollTnoBase`, `startTrialError`, `rerollTrialError`, `retry`, `postMortem`, `claimXp` | Roll mechanic + edge actions — see [dice-resolution.md](../concepts/dice-resolution.md), [edge-pool.md](../concepts/edge-pool.md) |
| `chat.mjs` | `registerChatListeners` | Post-roll edge action UI — see [edge-pool.md](../concepts/edge-pool.md) |
| `heatmap.mjs` | gradient constants, `HEATMAP_QUICK_PRESETS`, `DEFAULT_HEATMAP_CONFIG`, `setActiveHeatmapConfig`, `getActiveHeatmapConfig`, `colorForValue`, `colorForCritical` | See [heatmap.md](../concepts/heatmap.md) |
| `skills.mjs` | `slugifySkillName`, `generateCustomSkillKey`, `getSkillDefinitions`, `getSkillDefinition` | See [skills.md](../concepts/skills.md) |
| `effects.mjs` | `onManageActiveEffect`, `prepareActiveEffectCategories` | See [active-effects.md](../concepts/active-effects.md) |
| `inventory.mjs` | `ARMOR_ADDON_ZONES`, `CARRY_THRESHOLDS`, `wornItemIds`, `itemSlotCost`, `computeCarry`, `buildSlotGrid`, `resolveArmor` | Pure carry/armour maths, no Foundry globals — see [inventory.md](../concepts/inventory.md) |
| `migrations.mjs` | `MIGRATIONS`, `registerMigrationSettings`, `migrateWorld` | See [migrations.md](../concepts/migrations.md) |
| `templates.mjs` | `preloadHandlebarsTemplates` | Preloads every `.hbs` used by apps/sheets — see [ui-surfaces.md](ui-surfaces.md) |

## `apps/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `roll-dialog.mjs` | `TnoRollDialog extends FormApplication` | Skill/ability/free/fixed roll builder |
| `base-roll-dialog.mjs` | `TnoBaseRollDialog extends FormApplication` | Bare 3d20 dialog, no actor/threshold required |
| `roll-dialog-shared.mjs` | `advantageOptions`, `bindAdvantagePicker` | Advantage picker UI shared by the two roll dialogs above |
| `advance-dialog.mjs` | `TnoAdvanceDialog extends FormApplication` | See [advancement.md](../concepts/advancement.md) |
| `heatmap-lab.mjs` | `TnoHeatmapLab extends FormApplication` | See [heatmap.md](../concepts/heatmap.md) |
| `custom-skill-dialog.mjs` | `TnoCustomSkillDialog extends FormApplication` | Add/edit a custom skill — see [skills.md](../concepts/skills.md) |
| `custom-skills-overview.mjs` | `TnoCustomSkillsOverview extends FormApplication` | GM-only world-wide custom skill listing |

`TnoActorSheet` is on **ApplicationV2** (`HandlebarsApplicationMixin(ActorSheetV2)`);
that is what earns it Foundry v14's native pop-out, since the "Detach" window
control ships in `ApplicationV2.DEFAULT_OPTIONS.window.controls` and V1 windows
never receive it. Consequences worth knowing when editing the sheet:

* `.window-content` **is** the sheet's `<form>`, so the actor templates have no
  `<form>` wrapper of their own and the root flex layout lives in
  `global/_window.scss`.
* Tabs are declared as `static TABS`; the nav anchors need
  `data-action="tab"` and must stay inside `.window-content`, because
  `ApplicationV2#changeTab` only searches there.
* A detached sheet still runs in the **main** window's JS context, so `window`
  and `document` refer to the parent window — DOM lookups go through
  `this.element`.

`TnoItemSheet` and every app under `module/apps/` are still **V1**
(`FormApplication`/`ItemSheet`) and therefore cannot be detached — a known
forward-compat item, tracked but out of scope for this wiki (see
[datamodel-migration.md](../architecture/datamodel-migration.md) for the
sibling schema-side deprecation).

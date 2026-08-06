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
| `item.mjs` | `TnoItem extends Item` | `isWorn`, `confirmDelete()`, `getRollData()`, `roll()` (posts to chat), weapon-check and consumable-stock helpers |

## `sheets/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `actor-sheet.mjs` | `TnoActorSheet extends ActorSheetV2` | Character/NPC sheet: attribute heatmap grid, skill groups with filter/search, inventory, effects, edge pool display |
| `item-gear-sheet.mjs` | `TnoGearSheet extends ItemSheetV2` | Overview/Edit sheet for every physical item, including bounded authoring and rule-backed actions — see [item-roles.md](../concepts/item-roles.md) |
| `item-sheet.mjs` | `TnoItemSheet extends ItemSheet` | What is left of the V1 sheet: `feature` and `spell`, template resolved per type |

## `helpers/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `config.mjs` | `TNO` | All game constants (`CONFIG.TNO`) — see [attributes.md](../concepts/attributes.md), [skills.md](../concepts/skills.md) |
| `attributes.mjs` | `BASE_MIN`, `BASE_MAX`, `TEMP_MIN`, `TEMP_MAX`, `tempValueForBase` | Attribute base/temp value ranges and temp-modifier-preserving base changes — see [attributes.md](../concepts/attributes.md) |
| `dice.mjs` | `TNO_ADVANTAGE*`, `describeAdvantage`, `dieCountFor`, `pickCountingDie`, `criticalResultFor`, `rollTno`, `rollTnoBase`, `startTrialError`, `rerollTrialError`, `retry`, `postMortem`, `claimXp` | Roll mechanic + edge actions — see [dice-resolution.md](../concepts/dice-resolution.md), [edge-pool.md](../concepts/edge-pool.md) |
| `dice-odds.mjs` | `successChanceFor`, `formatChance`, `oddsTooltipHtml` | Read side over the generated odds table — see [dice-resolution.md](../concepts/dice-resolution.md) |
| `dice-odds-table.mjs` | `TNO_ODDS` | **Generated** by `npm run docs:odds` — never hand-edit |
| `chat.mjs` | `registerChatListeners` | Post-roll edge action UI — see [edge-pool.md](../concepts/edge-pool.md) |
| `heatmap.mjs` | gradient constants, `HEATMAP_QUICK_PRESETS`, `DEFAULT_HEATMAP_CONFIG`, `setActiveHeatmapConfig`, `getActiveHeatmapConfig`, `colorForValue`, `colorForCritical` | See [heatmap.md](../concepts/heatmap.md) |
| `skills.mjs` | `slugifySkillName`, `generateCustomSkillKey`, `getSkillDefinitions`, `getSkillDefinition` | See [skills.md](../concepts/skills.md) |
| `effects.mjs` | `onManageActiveEffect`, `prepareActiveEffectCategories` | See [active-effects.md](../concepts/active-effects.md) |
| `inventory.mjs` | `ARMOR_ADDON_ZONES`, `ARMOR_SV_STEP`, `CARRIED_ITEM_TYPES`, `CARRY_THRESHOLDS`, `wornItemIds`, `itemSlotCost`, `computeCarry`, `buildSlotGrid`, `resolveArmor` | Pure carry/armour maths, no Foundry globals — see [inventory.md](../concepts/inventory.md) |
| `money.mjs` | `MONEY_CURRENCIES`, `normalizeMoneyAmount`, `prepareWallet` | Pure native-currency normalisation and euro-cent conversion for the character wallet — see [inventory.md](../concepts/inventory.md#money) |
| `items.mjs` | item constants/role helpers, `GEAR_NUMBER_BOUNDS`, `MISSING_FIELD_LABELS`, `clampGearNumber`, `missingRequired` | What an item *is* and bounded authoring rules. Pure, no Foundry globals; imported by `inventory.mjs`, so it may not import back — see [item-roles.md](../concepts/item-roles.md) |
| `item-presentation.mjs` | `damagePresentation`, `buildRangeProfile`, `buildPenetrationProfile`, `buildSlotPresentation`, `buildStrengthPresentation`, `buildOwnershipPresentation`, `buildGearPresentation`, `buildGearSummary` | Pure overview view models composed from `items.mjs` and `inventory.mjs`; deliberately outcome-neutral where combat rules are unresolved |
| `item-summary.mjs` | `localizeGearSummary`, `prepareGearSummaryContext` | Adds localization and the live actor context to `buildGearSummary`; the one context builder behind the popover, the chat card and the carry-cell tooltips |
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

`TnoItemSheet` and every app under `module/apps/` are still **V1** and
therefore cannot be detached — a known forward-compat item (see
[datamodel-migration.md](../architecture/datamodel-migration.md) for the
sibling schema-side deprecation).

They no longer reach for the bare `FormApplication` / `ItemSheet` globals,
which are deprecated: each takes its base class off `foundry.appv1` at the top
of its own file. That is a namespacing change only — the classes are still
ApplicationV1 and still use `getData()`, jQuery `activateListeners(html)` and
`_updateObject()`. Converting them to ApplicationV2 is roughly 1100 lines
across seven classes with no e2e coverage on any of them, so it wants to be
its own change with tests in front of it, not a side effect of another one.

Because `foundry.appv1`, `foundry.documents.collections`,
`foundry.applications.handlebars` and `foundry.applications.ux` are all **v13+**
namespaces, `system.json` declares `compatibility.minimum: "13"`. It previously
said `"12"`, which the code could not honour.

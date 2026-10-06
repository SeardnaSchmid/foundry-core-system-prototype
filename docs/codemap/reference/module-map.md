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
| `item.mjs` | `TnoItem extends Item` | `isWorn`, `confirmDelete()`, `getRollData()`, `roll()` (posts to chat), weapon-check and consumable-stock helpers, `useConsumable()` (stock −1 plus a chat card) |
| `combat.mjs` | `TnoCombat extends Combat`, `ROUND_STATE_FLAG`, `BASE_INITIATIVES_FLAG` | Slowest-first activation and the round's activation history: `_sortCombatants` (ascending, and never reading `this`), `startCombat`/`nextTurn`/`previousTurn`/`nextRound`, `activateEarly`, `activatedIds` — see [combat-turn-order.md](../concepts/combat-turn-order.md) |

## `sheets/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `actor-sheet.mjs` | `TnoActorSheet extends ActorSheetV2` | Character/NPC sheet: the attribute matrix, the banner's vitals, state pills and two roll pills, skill groups with filter/search, the Kleinkram/Geld tabs, inventory, effects. Owns six body-level popovers — item, wallet, column picker, Haltung picker, condition panel and Edge — each mounted on the host document and re-homed when the sheet is detached |
| `connection-graph-view.mjs` | `GRAPH_WIDTH`, `GRAPH_HEIGHT`, `startGraph`, `dragGraphNode`, `lightGraphNode`, `showGraphCard` | The Beziehungen graph on screen: the animation loop that runs the spring embedder into the rendered SVG, node dragging, hover lighting and the hover card. DOM only — what the graph holds comes from `helpers/connection-graph.mjs` |
| `item-gear-sheet.mjs` | `TnoGearSheet extends ItemSheetV2` | Overview/Edit sheet for every physical item, including bounded authoring and rule-backed actions — see [item-roles.md](../concepts/item-roles.md) |
| `item-sheet.mjs` | `TnoItemSheet extends ItemSheet` | What is left of the V1 sheet: `feature` and `spell`, template resolved per type |

## `helpers/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `config.mjs` | `TNO` | All game constants (`CONFIG.TNO`) — see [attributes.md](../concepts/attributes.md), [skills.md](../concepts/skills.md) |
| `advancement.mjs` | `RANK_MAX`, `nextRankXpCost`, `rankXpTotal`, `xpProgress`, `xpSummary` | XP and rank arithmetic for attributes and skills, shared by the sheet and the advancement dialog — see [advancement.md](../concepts/advancement.md). Imports nothing, no Foundry globals |
| `attributes.mjs` | `BASE_MIN`, `BASE_MAX` | Bounds for the sole persisted attribute rating — see [attributes.md](../concepts/attributes.md) |
| `dice.mjs` | `TNO_ADVANTAGE*`, `describeAdvantage`, `dieCountFor`, `pickCountingDie`, `criticalResultFor`, `resolveDice`, `rollTno`, `rollTnoBase`, `startTrialError`, `rerollTrialError`, `retry`, `postMortem`, `claimXp` | Roll mechanic + edge actions — see [dice-resolution.md](../concepts/dice-resolution.md), [edge-pool.md](../concepts/edge-pool.md) |
| `dice-odds.mjs` | `successChanceFor`, `formatChance`, `oddsTooltipHtml` | Read side over the generated odds table — see [dice-resolution.md](../concepts/dice-resolution.md) |
| `dice-odds-table.mjs` | `TNO_ODDS` | **Generated** by `npm run docs:odds` — never hand-edit |
| `chat.mjs` | `registerChatListeners`, `xpClaimEligible`, `buildEdgeGroups` | Everything a chat card gains after it is posted: the post-roll edge action UI (see [edge-pool.md](../concepts/edge-pool.md)) and the take action on a posted item card |
| `item-transfer.mjs` | `travellingItemData`, `receivingActors`, `postedItemFlag`, `takeItemFromMessage`, `renderItemTakeAction` | Copying a posted gear card onto a sheet the reader owns: what the card carries, who may receive it, and the action itself — see [item-roles.md](../concepts/item-roles.md#taking-a-posted-item) |
| `heatmap.mjs` | gradient constants, `HEATMAP_QUICK_PRESETS`, `DEFAULT_HEATMAP_CONFIG`, `INK_DARK`, `INK_LIGHT`, `setActiveHeatmapConfig`, `getActiveHeatmapConfig`, `colorForValue` | See [heatmap.md](../concepts/heatmap.md) |
| `campaign-briefing.mjs` | `DEFAULT_CAMPAIGN_BRIEFING`, `normalizeCampaignBriefing`, `newBriefingLocation`, `newBriefingSession` | Normalises the world-owned player briefing: an editable star map and previous-session recaps, with no game-rule data or Foundry globals |
| `skills.mjs` | `slugifySkillName`, `generateCustomSkillKey`, `getSkillDefinitions`, `getSkillDefinition` | See [skills.md](../concepts/skills.md) |
| `effects.mjs` | `onManageActiveEffect`, `prepareActiveEffectCategories` | See [active-effects.md](../concepts/active-effects.md) |
| `inventory.mjs` | `ARMOR_ADDON_ZONES`, `ARMOR_SV_STEP`, `CARRIED_ITEM_TYPES`, `CARRY_THRESHOLDS`, `wornItemIds`, `wornZone`, `itemSlotCost`, `computeCarry`, `buildSlotGrid`, `slotMeter`, `resolveArmor`, `armorEquipUpdate`, `dragTargets` | Pure carry/armour maths, no Foundry globals — see [inventory.md](../concepts/inventory.md) |
| `damage.mjs` | `DAMAGE_MALUS_PER_POINT`, `DAMAGE_TRACK_MAX_BOXES`, `resolveDamage`, `damageTrackRows` | Pure two-pool health maths and track layout, read by both the banner's read-only rows and the condition panel's editable ones, no Foundry globals — see [damage.md](../concepts/damage.md) |
| `conditions.mjs` | `DAMAGE_CONDITION_DEFINITIONS`, `resolveDamageConditions`, `resolveConditions`, `resolveCarryCondition`, `resolveArmorCondition`, `resolveDefenseCondition` | Pure six-light condition derivation and manual-override resolution over damage and attributes, plus the three derived conditions the collection adds to it — see [damage.md](../concepts/damage.md#the-condition-collection) |
| `money.mjs` | `MONEY_CURRENCIES`, `normalizeMoneyAmount`, `prepareWallet` | Pure native-currency normalisation and euro-cent conversion for the character wallet — see [inventory.md](../concepts/inventory.md#money) |
| `popover.mjs` | `SheetPopover`, `popoverPosition` | The actor sheet's body-level native popovers: building, opening, re-anchoring after a re-render, moving into a detached window, and the viewport-clamped placement. Reads no Foundry globals; `popoverPosition` is unit-tested |
| `items.mjs` | item constants/role helpers, `GEAR_NUMBER_BOUNDS`, `MISSING_FIELD_LABELS`, `clampGearNumber`, `missingRequired` | What an item *is* and bounded authoring rules. Pure, no Foundry globals; imported by `inventory.mjs`, so it may not import back — see [item-roles.md](../concepts/item-roles.md) |
| `item-presentation.mjs` | `itemTypeLine`, `damagePresentation`, `buildRangeProfile`, `buildPenetrationProfile`, `buildSlotPresentation`, `buildStrengthPresentation`, `buildOwnershipPresentation`, `buildGearPresentation`, `buildGearSummary` | Pure overview view models composed from `items.mjs` and `inventory.mjs`; deliberately outcome-neutral where combat rules are unresolved |
| `item-audit.mjs` | `CATALOGUE_PACK`, `ORIGINS`, `compendiumPackOf`, `itemOrigin`, `auditTally` | Pure provenance: reads `_stats.compendiumSource` and says whether a piece came from the shipped catalogue, another pack, or this world. Grouping, columns and sorting are `item-table.mjs`, which the overview shares with the sheet |
| `item-summary.mjs` | `localizeGearSummary`, `prepareGearSummaryContext` | Adds localization and the live actor context to `buildGearSummary`; the one context builder behind the popover and the chat card |
| `connection-graph.mjs` | `GRAPH_NODE_KINDS`, `GRAPH_HIDEABLE_KINDS`, `SPRING_PARAMS`, `SPRING_DEFAULTS`, `normalizeSpringParams`, `buildConnectionGraph`, `layoutGraph`, `createSpringEmbedder`, `graphViewModel`, `graphNodeDetails` | The Beziehungen graph view: nodes and edges from the connections list (character, people — marked when reachable through Neuralink — and shared Fraktion/Herkunft labels), a deterministic force layout for the start, and the live spring embedder (springs, repulsion, gravity, damping) the sheet animates and drags. Also the SVG view model and the hover card's rows. Pure; `sheets/connection-graph-view.mjs` animates it; its forces are tunable live (`params`, client setting `tno.graphPhysics`) |
| `connections.mjs` | `CONNECTION_FIELDS`, `LABEL_FIELDS`, `CONNECTION_FLAGS`, `normalizeLabels`, `normalizeConnections`, `addConnection`, `editConnection`, `addLabel`, `removeLabel`, `labelSuggestions`, `personSuggestions`, `adoptPerson`, `removeConnection`, `hasConnectionTo`, `connectionSearchText` | The Beziehungen tab's list: canonical entries, whole-list edits, the label columns and the people suggested for a Name, both widened by other characters' lists (`shared`) and Actors. Pure, no Foundry globals; the sheet supplies ids. Its header says how the same data becomes a relationship graph |
| `item-table.mjs` | `ITEM_TABLE_COLUMNS`, `ITEM_TABLE_GROUPS`, `ITEM_TABLE_SECTIONS`, `CELL_KINDS`, `DEFAULT_ITEM_TABLE_CONFIG`, `normalizeItemTableConfig`, `toggleItemTableColumn`, `nextItemTableSort`, `itemGroupKey`, `columnCell`, `buildItemGroups` | The Inventar tab's ledger: the column catalogue, the role grouping and the view-only ordering. Returns raw values and an ordering — the sheet turns those into words — so it stays free of Foundry globals like the two helpers it composes. See [inventory.md](../concepts/inventory.md#the-ledger) |
| `maneuvers.mjs` | `ansageEnvelope`, `DAMAGE_RULES`, `DEFAULT_ZONE` | The resistance location's extra Wuchtschaden (Kopf) and the attacker's Ansage envelope. Models no Manöver: an Ansage is one free number the table agrees on. Pure, no Foundry globals — see [combat-roll-workflows.md](../concepts/combat-roll-workflows.md) |
| `round-state.mjs` | `createRoundState`, `normalizeRoundState`, `getActivatedIds`, `advanceActivation`, `rewindActivation`, `activateEarly`, `startNextRound` | One combat round as an ordered activation *history* plus a cursor, which is what lets a rewind retrace the round that was played rather than the one the initiative list describes. Imports nothing and holds itself free of Foundry globals — see [combat-turn-order.md](../concepts/combat-turn-order.md) |
| `stances.mjs` | `stanceEntry`, `stancePopoverGroups` | The read side of a Haltung — label, icon, effect, permitted defences, and the fallback for a key `CONFIG.TNO` no longer has. Shared by the sheet's banner, its picker and the combat tracker, so all three fall back the same way |
| `combat-socket.mjs` | `TNO_SOCKET`, `emitInterrupt`, `registerCombatSocket`, `handleCombatSocketMessage` | The system's only socket: a player asking the GM's client to pull their own combatant's activation forward. Carries no authority — ownership, the combat's state and the sender are all re-derived on receipt |
| `combat-actions.mjs` | `angriffOptions`, `paradeOptions`, `ausweichenOptions`, `widerstandOptions`, `actorStance`, `canDefend`, `defenseMalus`, `countDefense`, `takeStance` | One builder per Handlung, plus the Haltung rules. Every combat roll is assembled here and nowhere else, so an Ansage can reach the same options an ordinary attack builds |
| `migrations.mjs` | `MIGRATIONS`, `registerMigrationSettings`, `migrateWorld` | See [migrations.md](../concepts/migrations.md) |
| `templates.mjs` | `preloadHandlebarsTemplates` | Preloads every `.hbs` used by apps/sheets — see [ui-surfaces.md](ui-surfaces.md) |

## `apps/`

| File | Exports | Responsibility |
| --- | --- | --- |
| `roll-dialog.mjs` | `TnoRollDialog extends FormApplication` | Skill/ability/free/fixed roll builder |
| `base-roll-dialog.mjs` | `TnoBaseRollDialog extends HandlebarsApplicationMixin(ApplicationV2)` | Bare 3d20 dialog, no actor/threshold required |
| `roll-dialog-shared.mjs` | `advantageOptions`, `bindRadioGroup` | Shared button-radiogroup behaviour for roll type and attribute choice, used by both dialogs |
| `advance-dialog.mjs` | `TnoAdvanceDialog extends HandlebarsApplicationMixin(ApplicationV2)` | See [advancement.md](../concepts/advancement.md) |
| `heatmap-lab.mjs` | `TnoHeatmapLab extends FormApplication` | See [heatmap.md](../concepts/heatmap.md) |
| `custom-skill-dialog.mjs` | `TnoCustomSkillDialog extends HandlebarsApplicationMixin(ApplicationV2)` | Add/edit a custom skill — see [skills.md](../concepts/skills.md) |
| `custom-skills-overview.mjs` | `TnoCustomSkillsOverview extends FormApplication` | GM-only world-wide custom skill listing |
| `item-overview.mjs` | `TnoItemOverview extends FormApplication` | GM-only listing of every item in the world, on actors and loose, with where each came from — see [item-roles.md](../concepts/item-roles.md) |
| `campaign-briefing.mjs` | `TnoCampaignBriefing extends FormApplication`, `TnoCampaignBriefingEditor`, `openCampaignBriefing` | The read-only player board, automatically opened for joining players when enabled; the settings-menu subclass edits the world-owned star map and recap data |
| `combat-tracker.mjs` | `TnoCombatTracker extends CombatTracker` | The sidebar tracker, registered as `CONFIG.ui.combat`: the Haltung chip on each row, the spent-this-round marker, the interrupt button, pre-combat drag reordering, and the display-order setting — see [combat-turn-order.md](../concepts/combat-turn-order.md) |

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
* The tab rail hangs outside the sheet's right edge. Where there is no room —
  a detached window (`body.detached`), or the sheet against the screen edge,
  measured in `_onPosition` and on render — the sheet gets `tabs-inside` and
  `global/_window.scss` turns the rail into a strip across its top.
* A detached sheet still runs in the **main** window's JS context, so `window`
  and `document` refer to the parent window — DOM lookups go through
  `this.element`.

`TnoBaseRollDialog`, `TnoCustomSkillDialog` and `TnoAdvanceDialog` are on
ApplicationV2 too, and set the pattern for the rest: `tag: 'form'`, a
`form.handler` in place of `_updateObject()`, `_prepareContext()`, buttons
wired through `actions` and `data-action` instead of jQuery, and part templates
without a `<form>` of their own. A V2 id is unique: the base-dice dialog keeps
its fixed id and its caller reuses an open instance from
`foundry.applications.instances`; the per-actor dialogs take no fixed id.

`TnoItemSheet` and every other app under `module/apps/` are still **V1** and
therefore cannot be detached — a known forward-compat item (see
[datamodel-migration.md](../architecture/datamodel-migration.md) for the
sibling schema-side deprecation).

They no longer reach for the bare `FormApplication` / `ItemSheet` globals,
which are deprecated: each takes its base class off `foundry.appv1` at the top
of its own file. That is a namespacing change only — the classes are still
ApplicationV1 and still use `getData()`, jQuery `activateListeners(html)` and
`_updateObject()`. Converting them to ApplicationV2 is roughly 750 lines
across the remaining classes with no e2e coverage on any of them, so it wants to be
its own change with tests in front of it, not a side effect of another one.

`system.json` declares `compatibility.minimum: "14"`. It has walked up twice:
`"12"` was a floor the code could not honour once it moved onto the **v13+**
namespaces `foundry.appv1`, `foundry.documents.collections`,
`foundry.applications.handlebars` and `foundry.applications.ux`; `"13"` fell
when the combat tracker started drawing Haltung icons from Font Awesome 7,
which Foundry only bundles from v14 (`fa-person-meditating` is the one that
does not exist in the v13 build) — see
[combat-turn-order.md](../concepts/combat-turn-order.md).

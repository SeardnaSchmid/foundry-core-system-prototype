// Import document classes.
import { EdgefallActor } from './documents/actor.mjs';
import { EdgefallItem } from './documents/item.mjs';
// Import sheet classes.
import { EdgefallActorSheet } from './sheets/actor-sheet.mjs';
import { EdgefallItemSheet } from './sheets/item-sheet.mjs';
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { EDGEFALL } from './helpers/config.mjs';
import { rollEdgefall, rollEdgefallBase } from './helpers/dice.mjs';
import { registerChatListeners } from './helpers/chat.mjs';
import { EdgefallRollDialog } from './apps/roll-dialog.mjs';
import { EdgefallBaseRollDialog } from './apps/base-roll-dialog.mjs';
import { EdgefallHeatmapLab } from './apps/heatmap-lab.mjs';
import { DEFAULT_HEATMAP_CONFIG, setActiveHeatmapConfig } from './helpers/heatmap.mjs';
import { EdgefallCustomSkillsOverview } from './apps/custom-skills-overview.mjs';
import { registerMigrationSettings, migrateWorld } from './helpers/migrations.mjs';

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function () {
  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.edgefall = {
    EdgefallActor,
    EdgefallItem,
    EdgefallRollDialog,
    EdgefallBaseRollDialog,
    rollEdgefall,
    rollEdgefallBase,
    rollItemMacro,
    rollBaseDice,
  };

  // Add custom constants for configuration.
  CONFIG.EDGEFALL = EDGEFALL;

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: '1d20 + @abilities.dex.mod',
    decimals: 2,
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = EdgefallActor;
  CONFIG.Item.documentClass = EdgefallItem;

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  Actors.unregisterSheet('core', ActorSheet);
  Actors.registerSheet('edgefall', EdgefallActorSheet, {
    makeDefault: true,
    label: 'EDGEFALL.SheetLabels.Actor',
  });
  Items.unregisterSheet('core', ItemSheet);
  Items.registerSheet('edgefall', EdgefallItemSheet, {
    makeDefault: true,
    label: 'EDGEFALL.SheetLabels.Item',
  });

  // Preload Handlebars templates.
  preloadHandlebarsTemplates();

  // Client-scoped so each person at the table can dial in their own heatmap
  // gradient without affecting anyone else's view. The raw settings are
  // hidden (config: false); they're only ever edited through the
  // EdgefallHeatmapLab menu below, which keeps color-picker/slider UI out of
  // Foundry's plain settings list.
  game.settings.register('edgefall', 'heatmapLow', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.low });
  game.settings.register('edgefall', 'heatmapMid', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.mid });
  game.settings.register('edgefall', 'heatmapHigh', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.high });
  game.settings.register('edgefall', 'heatmapMidValue', { scope: 'client', config: false, type: Number, default: DEFAULT_HEATMAP_CONFIG.midValue });
  game.settings.register('edgefall', 'heatmapLowCurve', { scope: 'client', config: false, type: Number, default: DEFAULT_HEATMAP_CONFIG.lowCurve });
  game.settings.register('edgefall', 'heatmapHighCurve', { scope: 'client', config: false, type: Number, default: DEFAULT_HEATMAP_CONFIG.highCurve });
  game.settings.register('edgefall', 'heatmapCritical', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.critical });

  game.settings.registerMenu('edgefall', 'heatmapLabMenu', {
    name: 'EDGEFALL.Settings.HeatmapPreset.Name',
    hint: 'EDGEFALL.Settings.HeatmapPreset.Hint',
    label: 'EDGEFALL.Settings.HeatmapPreset.Name',
    icon: 'fa-solid fa-palette',
    type: EdgefallHeatmapLab,
    restricted: false,
  });

  // Tracks which migration steps have already run for this world; see
  // helpers/migrations.mjs. Applied on ready, below.
  registerMigrationSettings();

  // GM-only overview of every custom skill defined across the world's
  // character actors, since custom skills otherwise live invisibly inside
  // each actor's own data.
  game.settings.registerMenu('edgefall', 'customSkillsOverviewMenu', {
    name: 'EDGEFALL.Settings.CustomSkillsOverview.Name',
    hint: 'EDGEFALL.Settings.CustomSkillsOverview.Hint',
    label: 'EDGEFALL.Settings.CustomSkillsOverview.Name',
    icon: 'fa-solid fa-list-check',
    type: EdgefallCustomSkillsOverview,
    restricted: true,
  });

  setActiveHeatmapConfig({
    low: game.settings.get('edgefall', 'heatmapLow'),
    mid: game.settings.get('edgefall', 'heatmapMid'),
    high: game.settings.get('edgefall', 'heatmapHigh'),
    midValue: game.settings.get('edgefall', 'heatmapMidValue'),
    lowCurve: game.settings.get('edgefall', 'heatmapLowCurve'),
    highCurve: game.settings.get('edgefall', 'heatmapHighCurve'),
    critical: game.settings.get('edgefall', 'heatmapCritical'),
  });

  // Wire up the "Fehler finden" reroll tracker on failed roll cards.
  registerChatListeners();

  // A quick-access button for the "Basiswürfel" roll (bare 3d20 mechanic,
  // no threshold), reachable from the chat log without opening any actor
  // sheet. Foundry v14 restructured the chat log's controls into the
  // `renderChatInput` hook; older versions still render `#chat-controls`
  // as part of `renderChatLog`, so both are handled here.
  Hooks.on('renderChatInput', (app, elements) => injectBaseRollButton(elements?.['#chat-controls']));
  Hooks.on('renderChatLog', (app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    injectBaseRollButton(root?.querySelector('#chat-controls'));
  });
});

/**
 * Open the "Basiswürfel" quick-roll dialog (bare dice mechanic, no threshold).
 */
function rollBaseDice() {
  new EdgefallBaseRollDialog().render(true);
}

/**
 * Add the "Basiswürfel" button to the chat log's controls, once per element.
 * @param {HTMLElement} [controls]
 */
function injectBaseRollButton(controls) {
  if (!controls || controls.querySelector('.edgefall-base-roll-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('edgefall-base-roll-button', 'ui-control', 'icon', 'fa-solid', 'fa-dice-d20');
  const label = game.i18n.localize('EDGEFALL.Roll.BaseDiceButton');
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    rollBaseDice();
  });
  controls.prepend(button);
}

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper('toLowerCase', function (str) {
  return str.toLowerCase();
});

Handlebars.registerHelper('ifEquals', function (a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));

  migrateWorld();
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.edgefall.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'edgefall.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}

// Import document classes.
import { TnoActor } from './documents/actor.mjs';
import { TnoItem } from './documents/item.mjs';
// Import sheet classes.
import { TnoActorSheet } from './sheets/actor-sheet.mjs';
import { TnoItemSheet } from './sheets/item-sheet.mjs';
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { TNO } from './helpers/config.mjs';
import { rollTno, rollTnoBase } from './helpers/dice.mjs';
import { registerChatListeners } from './helpers/chat.mjs';
import { TnoRollDialog } from './apps/roll-dialog.mjs';
import { TnoBaseRollDialog } from './apps/base-roll-dialog.mjs';
import { TnoHeatmapLab } from './apps/heatmap-lab.mjs';
import { DEFAULT_HEATMAP_CONFIG, setActiveHeatmapConfig } from './helpers/heatmap.mjs';
import { TnoCustomSkillsOverview } from './apps/custom-skills-overview.mjs';
import { registerMigrationSettings, migrateWorld } from './helpers/migrations.mjs';

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function () {
  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.tno = {
    TnoActor,
    TnoItem,
    TnoRollDialog,
    TnoBaseRollDialog,
    rollTno,
    rollTnoBase,
    rollItemMacro,
    rollBaseDice,
  };

  // Add custom constants for configuration.
  CONFIG.TNO = TNO;

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: '1d20 + @abilities.dex.mod',
    decimals: 2,
  };

  // Define custom Document classes
  CONFIG.Actor.documentClass = TnoActor;
  CONFIG.Item.documentClass = TnoItem;

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // Register sheet application classes
  Actors.unregisterSheet('core', ActorSheet);
  Actors.registerSheet('tno', TnoActorSheet, {
    makeDefault: true,
    label: 'TNO.SheetLabels.Actor',
  });
  Items.unregisterSheet('core', ItemSheet);
  Items.registerSheet('tno', TnoItemSheet, {
    makeDefault: true,
    label: 'TNO.SheetLabels.Item',
  });

  // Preload Handlebars templates.
  preloadHandlebarsTemplates();

  // Client-scoped so each person at the table can dial in their own heatmap
  // gradient without affecting anyone else's view. The raw settings are
  // hidden (config: false); they're only ever edited through the
  // TnoHeatmapLab menu below, which keeps color-picker/slider UI out of
  // Foundry's plain settings list.
  game.settings.register('tno', 'heatmapLow', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.low });
  game.settings.register('tno', 'heatmapMid', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.mid });
  game.settings.register('tno', 'heatmapHigh', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.high });
  game.settings.register('tno', 'heatmapMidValue', { scope: 'client', config: false, type: Number, default: DEFAULT_HEATMAP_CONFIG.midValue });
  game.settings.register('tno', 'heatmapLowCurve', { scope: 'client', config: false, type: Number, default: DEFAULT_HEATMAP_CONFIG.lowCurve });
  game.settings.register('tno', 'heatmapHighCurve', { scope: 'client', config: false, type: Number, default: DEFAULT_HEATMAP_CONFIG.highCurve });
  game.settings.register('tno', 'heatmapCritical', { scope: 'client', config: false, type: String, default: DEFAULT_HEATMAP_CONFIG.critical });

  game.settings.registerMenu('tno', 'heatmapLabMenu', {
    name: 'TNO.Settings.HeatmapPreset.Name',
    hint: 'TNO.Settings.HeatmapPreset.Hint',
    label: 'TNO.Settings.HeatmapPreset.Name',
    icon: 'fa-solid fa-palette',
    type: TnoHeatmapLab,
    restricted: false,
  });

  // Tracks which migration steps have already run for this world; see
  // helpers/migrations.mjs. Applied on ready, below.
  registerMigrationSettings();

  // GM-only overview of every custom skill defined across the world's
  // character actors, since custom skills otherwise live invisibly inside
  // each actor's own data.
  game.settings.registerMenu('tno', 'customSkillsOverviewMenu', {
    name: 'TNO.Settings.CustomSkillsOverview.Name',
    hint: 'TNO.Settings.CustomSkillsOverview.Hint',
    label: 'TNO.Settings.CustomSkillsOverview.Name',
    icon: 'fa-solid fa-list-check',
    type: TnoCustomSkillsOverview,
    restricted: true,
  });

  setActiveHeatmapConfig({
    low: game.settings.get('tno', 'heatmapLow'),
    mid: game.settings.get('tno', 'heatmapMid'),
    high: game.settings.get('tno', 'heatmapHigh'),
    midValue: game.settings.get('tno', 'heatmapMidValue'),
    lowCurve: game.settings.get('tno', 'heatmapLowCurve'),
    highCurve: game.settings.get('tno', 'heatmapHighCurve'),
    critical: game.settings.get('tno', 'heatmapCritical'),
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
  new TnoBaseRollDialog().render(true);
}

/**
 * Add the "Basiswürfel" button to the chat log's controls, once per element.
 * @param {HTMLElement} [controls]
 */
function injectBaseRollButton(controls) {
  if (!controls || controls.querySelector('.tno-base-roll-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('tno-base-roll-button', 'ui-control', 'icon', 'fa-solid', 'fa-dice-d20');
  const label = game.i18n.localize('TNO.Roll.BaseDiceButton');
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
  const command = `game.tno.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'tno.itemMacro': true },
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

/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  // Namespaced rather than the bare `loadTemplates` global, which is
  // deprecated — the rest of the system already calls
  // `foundry.applications.handlebars.renderTemplate`.
  return foundry.applications.handlebars.loadTemplates([
    // Actor partials.
    'systems/tno/templates/actor/parts/actor-features.hbs',
    'systems/tno/templates/actor/parts/actor-items.hbs',
    'systems/tno/templates/actor/parts/actor-effects.hbs',
    'systems/tno/templates/actor/parts/actor-paperdoll.hbs',
    'systems/tno/templates/actor/parts/actor-slot-grid.hbs',
    'systems/tno/templates/actor/parts/actor-trinkets.hbs',
    'systems/tno/templates/actor/parts/actor-money-wallet.hbs',
    'systems/tno/templates/actor/parts/item-popover.hbs',
    'systems/tno/templates/actor/parts/money-popover.hbs',
    // Item partials
    'systems/tno/templates/item/parts/item-delete.hbs',
    'systems/tno/templates/item/parts/item-scale.hbs',
    'systems/tno/templates/item/parts/item-role-weapon.hbs',
    'systems/tno/templates/item/parts/item-role-armor.hbs',
    'systems/tno/templates/item/parts/item-role-consumable.hbs',
    'systems/tno/templates/item/parts/item-gear-summary.hbs',
    // Apps
    'systems/tno/templates/apps/roll-dialog.hbs',
    'systems/tno/templates/apps/parts/advantage-picker.hbs',
    'systems/tno/templates/apps/advance-dialog.hbs',
    'systems/tno/templates/apps/base-roll-dialog.hbs',
    'systems/tno/templates/apps/heatmap-lab.hbs',
    'systems/tno/templates/apps/custom-skill-dialog.hbs',
    'systems/tno/templates/apps/custom-skills-overview.hbs',
    // Chat
    'systems/tno/templates/chat/roll-card.hbs',
    'systems/tno/templates/chat/edge-panel.hbs',
    'systems/tno/templates/chat/item-summary.hbs',
    'systems/tno/templates/chat/parts/trial-error-tracker.hbs',
  ]);
};

/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return loadTemplates([
    // Actor partials.
    'systems/tno/templates/actor/parts/actor-features.hbs',
    'systems/tno/templates/actor/parts/actor-items.hbs',
    'systems/tno/templates/actor/parts/actor-spells.hbs',
    'systems/tno/templates/actor/parts/actor-effects.hbs',
    // Item partials
    'systems/tno/templates/item/parts/item-effects.hbs',
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
    'systems/tno/templates/chat/find-flaw-tracker.hbs',
  ]);
};

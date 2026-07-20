/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return loadTemplates([
    // Actor partials.
    'systems/edgefall/templates/actor/parts/actor-features.hbs',
    'systems/edgefall/templates/actor/parts/actor-items.hbs',
    'systems/edgefall/templates/actor/parts/actor-spells.hbs',
    'systems/edgefall/templates/actor/parts/actor-effects.hbs',
    // Item partials
    'systems/edgefall/templates/item/parts/item-effects.hbs',
    // Apps
    'systems/edgefall/templates/apps/roll-dialog.hbs',
    'systems/edgefall/templates/apps/advance-dialog.hbs',
    'systems/edgefall/templates/apps/base-roll-dialog.hbs',
    'systems/edgefall/templates/apps/heatmap-lab.hbs',
    'systems/edgefall/templates/apps/custom-skill-dialog.hbs',
    'systems/edgefall/templates/apps/custom-skills-overview.hbs',
    // Chat
    'systems/edgefall/templates/chat/roll-card.hbs',
    'systems/edgefall/templates/chat/find-flaw-tracker.hbs',
  ]);
};

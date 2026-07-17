/**
 * Define a set of template paths to pre-load
 * Pre-loaded templates are compiled and cached for fast access when rendering
 * @return {Promise}
 */
export const preloadHandlebarsTemplates = async function () {
  return loadTemplates([
    // Actor partials.
    'systems/joster/templates/actor/parts/actor-features.hbs',
    'systems/joster/templates/actor/parts/actor-items.hbs',
    'systems/joster/templates/actor/parts/actor-spells.hbs',
    'systems/joster/templates/actor/parts/actor-effects.hbs',
    // Item partials
    'systems/joster/templates/item/parts/item-effects.hbs',
    // Apps
    'systems/joster/templates/apps/roll-dialog.hbs',
    'systems/joster/templates/apps/skill-advance-dialog.hbs',
    // Chat
    'systems/joster/templates/chat/roll-card.hbs',
    'systems/joster/templates/chat/find-flaw-tracker.hbs',
  ]);
};

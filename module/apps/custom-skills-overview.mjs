import { getSkillDefinition } from '../helpers/skills.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only read-only overview of every custom skill defined across the
 * world's character actors. Custom skills live inline inside each actor's
 * own data (by design, so they travel with exports/duplicates), which
 * otherwise makes them invisible to anyone but that actor's owner; this
 * window is the GM's window into that data.
 *
 * Opened from `game.settings.registerMenu`. Read-only, so no form.
 * @extends {ApplicationV2}
 */
export class TnoCustomSkillsOverview extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'tno-custom-skills-overview',
    classes: ['tno', 'sheet', 'tno-custom-skills-overview'],
    window: { title: 'TNO.Settings.CustomSkillsOverview.Name' },
    position: { width: 480 },
    actions: {
      refresh: TnoCustomSkillsOverview.#onRefresh,
      openActor: TnoCustomSkillsOverview.#onOpenActor,
    },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/apps/custom-skills-overview.hbs' },
  };

  /** @override */
  async _prepareContext() {
    const rows = [];
    for (const actor of game.actors) {
      if (actor.type !== 'character') continue;
      for (const [key, entry] of Object.entries(actor.system.skills ?? {})) {
        if (!entry?.custom) continue;
        const def = getSkillDefinition(actor, key);
        rows.push({
          actorId: actor.id,
          actorName: actor.name,
          label: def?.label ?? entry.custom.label ?? key,
          category: game.i18n.localize(CONFIG.TNO.skillCategories[def?.category] ?? def?.category ?? ''),
          attribute: game.i18n.localize(CONFIG.TNO.abilities[def?.attribute] ?? def?.attribute ?? ''),
          rank: entry.value ?? 0,
          xp: entry.xp ?? 0,
        });
      }
    }
    rows.sort((a, b) => a.actorName.localeCompare(b.actorName) || a.label.localeCompare(b.label));

    return { rows, isEmpty: !rows.length };
  }

  /** @this {TnoCustomSkillsOverview} */
  static #onRefresh() {
    this.render();
  }

  static #onOpenActor(event, target) {
    game.actors.get(target.dataset.actorId)?.sheet.render(true);
  }
}

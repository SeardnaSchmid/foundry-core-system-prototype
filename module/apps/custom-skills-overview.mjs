import { getSkillDefinition } from '../helpers/skills.mjs';

/**
 * GM-only read-only overview of every custom skill defined across the
 * world's character actors. Custom skills live inline inside each actor's
 * own data (by design, so they travel with exports/duplicates), which
 * otherwise makes them invisible to anyone but that actor's owner; this
 * window is the GM's window into that data.
 *
 * Registered via `game.settings.registerMenu`, which requires a
 * FormApplication (or ApplicationV2) subclass even though this dialog never
 * submits a form of its own — `_updateObject` is a no-op.
 * @extends {FormApplication}
 */
export class TnoCustomSkillsOverview extends FormApplication {
  constructor() {
    super({});
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-custom-skills-overview',
      classes: ['tno', 'sheet', 'tno-custom-skills-overview'],
      template: 'systems/tno/templates/apps/custom-skills-overview.hbs',
      width: 480,
      height: 'auto',
      closeOnSubmit: false,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('TNO.Settings.CustomSkillsOverview.Name');
  }

  /** @override */
  getData() {
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

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.overview-open-actor').on('click', (ev) => {
      ev.preventDefault();
      game.actors.get(ev.currentTarget.dataset.actorId)?.sheet.render(true);
    });

    html.find('.overview-refresh').on('click', (ev) => {
      ev.preventDefault();
      this.render();
    });
  }

  /** @override */
  async _updateObject() {
    // Read-only overview; nothing to persist.
  }
}

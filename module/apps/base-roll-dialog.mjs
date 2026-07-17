import { JOSTER_ADVANTAGE, JOSTER_ADVANTAGE_ABBR, rollJosterBase } from '../helpers/dice.mjs';

/**
 * A minimal dialog for rolling the bare Joster dice mechanic ("Basiswürfel")
 * outside of any actor/skill context: pick an advantage/disadvantage level
 * and roll, with no threshold to check against. Meant to be reachable from
 * outside the character sheet (chat controls button, hotbar macro).
 * @extends {FormApplication}
 */
export class JosterBaseRollDialog extends FormApplication {
  constructor(options = {}) {
    super({ advantage: JOSTER_ADVANTAGE.none });
    this.actor = options.actor ?? null;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'joster-base-roll-dialog',
      classes: ['joster', 'sheet'],
      template: 'systems/joster/templates/apps/base-roll-dialog.hbs',
      width: 280,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('JOSTER.Roll.BaseDiceTitle');
  }

  /** @override */
  getData() {
    const advantageOptions = Object.entries(JOSTER_ADVANTAGE).map(([key, value]) => ({
      value,
      label: game.i18n.localize(`JOSTER.Advantage.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
      abbr: JOSTER_ADVANTAGE_ABBR[value],
    }));

    return {
      ...this.object,
      advantageOptions,
      subject: game.i18n.localize('JOSTER.Roll.BaseDiceTitle'),
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.joster-advantage-option', (ev) => {
      const value = ev.currentTarget.dataset.value;
      html.find('input[name="advantage"]').val(value);
      html.find('.joster-advantage-option').removeClass('active');
      html.find(`.joster-advantage-option[data-value="${value}"]`).addClass('active');
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    await rollJosterBase({
      advantage: Number(formData.advantage),
      actor: this.actor,
    });
  }
}

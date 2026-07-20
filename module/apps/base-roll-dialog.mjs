import { TNO_ADVANTAGE, TNO_ADVANTAGE_ABBR, rollTnoBase } from '../helpers/dice.mjs';

/**
 * A minimal dialog for rolling the bare Tno dice mechanic ("Basiswürfel")
 * outside of any actor/skill context: pick an advantage/disadvantage level
 * and roll, with no threshold to check against. Meant to be reachable from
 * outside the character sheet (chat controls button, hotbar macro).
 * @extends {FormApplication}
 */
export class TnoBaseRollDialog extends FormApplication {
  constructor(options = {}) {
    super({ advantage: TNO_ADVANTAGE.none });
    this.actor = options.actor ?? null;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-base-roll-dialog',
      classes: ['tno', 'sheet'],
      template: 'systems/tno/templates/apps/base-roll-dialog.hbs',
      width: 280,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('TNO.Roll.BaseDiceTitle');
  }

  /** @override */
  getData() {
    const advantageOptions = Object.entries(TNO_ADVANTAGE).map(([key, value]) => ({
      value,
      label: game.i18n.localize(`TNO.Advantage.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
      abbr: TNO_ADVANTAGE_ABBR[value],
      isDefault: value === TNO_ADVANTAGE.none,
    }));

    return {
      ...this.object,
      advantageOptions,
      subject: game.i18n.localize('TNO.Roll.BaseDiceTitle'),
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.tno-advantage-option', (ev) => {
      const value = ev.currentTarget.dataset.value;
      html.find('input[name="advantage"]').val(value);
      html.find('.tno-advantage-option').removeClass('active');
      html.find(`.tno-advantage-option[data-value="${value}"]`).addClass('active');
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    await rollTnoBase({
      advantage: Number(formData.advantage),
      actor: this.actor,
    });
  }
}

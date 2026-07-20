import { EDGEFALL_ADVANTAGE, EDGEFALL_ADVANTAGE_ABBR, rollEdgefallBase } from '../helpers/dice.mjs';

/**
 * A minimal dialog for rolling the bare Edgefall dice mechanic ("Basiswürfel")
 * outside of any actor/skill context: pick an advantage/disadvantage level
 * and roll, with no threshold to check against. Meant to be reachable from
 * outside the character sheet (chat controls button, hotbar macro).
 * @extends {FormApplication}
 */
export class EdgefallBaseRollDialog extends FormApplication {
  constructor(options = {}) {
    super({ advantage: EDGEFALL_ADVANTAGE.none });
    this.actor = options.actor ?? null;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'edgefall-base-roll-dialog',
      classes: ['edgefall', 'sheet'],
      template: 'systems/edgefall/templates/apps/base-roll-dialog.hbs',
      width: 280,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('EDGEFALL.Roll.BaseDiceTitle');
  }

  /** @override */
  getData() {
    const advantageOptions = Object.entries(EDGEFALL_ADVANTAGE).map(([key, value]) => ({
      value,
      label: game.i18n.localize(`EDGEFALL.Advantage.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
      abbr: EDGEFALL_ADVANTAGE_ABBR[value],
      isDefault: value === EDGEFALL_ADVANTAGE.none,
    }));

    return {
      ...this.object,
      advantageOptions,
      subject: game.i18n.localize('EDGEFALL.Roll.BaseDiceTitle'),
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', '.edgefall-advantage-option', (ev) => {
      const value = ev.currentTarget.dataset.value;
      html.find('input[name="advantage"]').val(value);
      html.find('.edgefall-advantage-option').removeClass('active');
      html.find(`.edgefall-advantage-option[data-value="${value}"]`).addClass('active');
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    await rollEdgefallBase({
      advantage: Number(formData.advantage),
      actor: this.actor,
    });
  }
}

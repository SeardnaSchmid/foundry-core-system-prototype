import { TNO_ADVANTAGE, describeAdvantage, rollTnoBase } from '../helpers/dice.mjs';
import { advantageOptions, bindAdvantagePicker } from './roll-dialog-shared.mjs';

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
      width: 320,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('TNO.Roll.BaseDiceTitle');
  }

  /** @override */
  getData() {
    return {
      ...this.object,
      advantageOptions: advantageOptions(),
      advantageConsequence: describeAdvantage(this.object.advantage),
      subject: game.i18n.localize('TNO.Roll.BaseDiceTitle'),
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    bindAdvantagePicker(html);
  }

  /** @override */
  async _updateObject(event, formData) {
    await rollTnoBase({
      advantage: Number(formData.advantage),
      actor: this.actor,
    });
  }
}

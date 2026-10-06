import { TNO_ADVANTAGE, describeAdvantage, rollTnoBase } from '../helpers/dice.mjs';
import { advantageOptions, bindRadioGroup } from './roll-dialog-shared.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * A minimal dialog for rolling the bare Tno dice mechanic ("Basiswürfel")
 * outside of any actor/skill context: pick an advantage/disadvantage level
 * and roll, with no threshold to check against. Meant to be reachable from
 * outside the character sheet (chat controls button, hotbar macro).
 * @extends {ApplicationV2}
 */
export class TnoBaseRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'tno-base-roll-dialog',
    tag: 'form',
    classes: ['tno', 'sheet'],
    window: { title: 'TNO.Roll.BaseDiceTitle', resizable: true },
    position: { width: 320 },
    form: { handler: TnoBaseRollDialog.#onSubmit, closeOnSubmit: true },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/apps/base-roll-dialog.hbs' },
  };

  /** @override */
  async _prepareContext() {
    return {
      advantage: TNO_ADVANTAGE.none,
      advantageOptions: advantageOptions(),
      advantageConsequence: describeAdvantage(TNO_ADVANTAGE.none),
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const consequence = this.element.querySelector('.tno-advantage-effect');
    bindRadioGroup({
      group: this.element.querySelector('.tno-advantage-group'),
      input: this.element.querySelector('input[name="advantage"]'),
      onSelect: (value) => {
        if (consequence) consequence.textContent = describeAdvantage(Number(value));
      },
    });
  }

  /** @this {TnoBaseRollDialog} */
  static async #onSubmit(event, form, formData) {
    await rollTnoBase({
      advantage: Number(formData.object.advantage),
      actor: this.actor,
    });
  }
}

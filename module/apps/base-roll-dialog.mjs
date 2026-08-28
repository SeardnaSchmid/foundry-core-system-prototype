import { TNO_ADVANTAGE, describeAdvantage, rollTnoBase } from '../helpers/dice.mjs';
import { advantageOptions, bindRadioGroup } from './roll-dialog-shared.mjs';

// Namespaced rather than the bare `FormApplication` global, which is
// deprecated. Still ApplicationV1 — see the V1 apps note in
// docs/wiki/reference/module-map.md.
const { FormApplication } = foundry.appv1.api;

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
      resizable: true,
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
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];
    const consequence = root.querySelector('.tno-advantage-effect');
    bindRadioGroup({
      group: root.querySelector('.tno-advantage-group'),
      input: root.querySelector('input[name="advantage"]'),
      onSelect: (value) => {
        if (consequence) consequence.textContent = describeAdvantage(Number(value));
      },
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

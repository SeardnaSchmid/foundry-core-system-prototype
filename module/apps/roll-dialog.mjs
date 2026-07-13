import { JOSTER_ADVANTAGE, rollJoster } from '../helpers/dice.mjs';

/**
 * A small dialog for building a Joster roll: pick one or two attributes to
 * sum into a threshold, add a +/-3-stepped difficulty bonus/malus, choose an
 * advantage/disadvantage level, then roll.
 * @extends {FormApplication}
 */
export class JosterRollDialog extends FormApplication {
  /**
   * @param {Actor} actor              The rolling actor.
   * @param {object} [options]
   * @param {string} [options.attributeA]  Ability key to preselect as the first component.
   * @param {string} [options.flavor]      Label shown as the dialog title and chat flavor.
   */
  constructor(actor, { attributeA = '', flavor = '' } = {}) {
    super({ attributeA, attributeB: '', bonus: 0, advantage: JOSTER_ADVANTAGE.none });
    this.actor = actor;
    this.flavor = flavor || game.i18n.localize('JOSTER.Roll.DialogTitle');
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'joster-roll-dialog',
      classes: ['joster', 'sheet'],
      template: 'systems/joster/templates/apps/roll-dialog.hbs',
      width: 320,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return this.flavor;
  }

  /** @override */
  getData() {
    const abilities = {};
    for (const [key, labelKey] of Object.entries(CONFIG.JOSTER.abilities)) {
      abilities[key] = game.i18n.localize(labelKey);
    }

    const advantageOptions = Object.entries(JOSTER_ADVANTAGE).map(([key, value]) => ({
      value,
      label: game.i18n.localize(`JOSTER.Advantage.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
    }));

    return {
      ...this.object,
      abilities,
      advantageOptions,
      threshold: this._computeThreshold(this.object),
    };
  }

  /**
   * Sum the selected attributes' current values plus the bonus/malus.
   * @param {object} data  Form data with attributeA/attributeB/bonus.
   * @returns {number}
   */
  _computeThreshold(data) {
    const abilities = this.actor.system.abilities ?? {};
    const valueOf = (key) => abilities[key]?.value ?? 0;
    const a = data.attributeA ? valueOf(data.attributeA) : 0;
    const b = data.attributeB ? valueOf(data.attributeB) : 0;
    return a + b + (Number(data.bonus) || 0);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.on('change', 'select[name="attributeA"], select[name="attributeB"], input[name="bonus"]', (ev) => {
      const data = new FormDataExtended(ev.currentTarget.form).object;
      html.find('.joster-threshold-value').text(this._computeThreshold(data));
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    const threshold = this._computeThreshold(formData);
    await rollJoster({
      threshold,
      advantage: Number(formData.advantage),
      flavor: this.flavor,
      actor: this.actor,
    });
  }
}

import { JOSTER_ADVANTAGE, rollJoster } from '../helpers/dice.mjs';

/** Bounds and step for the situational modification value. */
const BONUS_MIN = -30;
const BONUS_MAX = 30;
const BONUS_STEP = 3;

/**
 * A small dialog for building a Joster roll. In "skill" mode the attribute
 * and skill rank are fixed threshold components (set by whatever opened the
 * dialog) and the player only dials in a situational modifier; in "ability"
 * mode the player picks one or two attributes themselves. Either way, the
 * player also picks an advantage/disadvantage level, then rolls.
 * @extends {FormApplication}
 */
export class JosterRollDialog extends FormApplication {
  /**
   * @param {Actor} actor              The rolling actor.
   * @param {object} [options]
   * @param {string} [options.attributeA]  Ability key to preselect as the first component.
   * @param {object} [options.skill]       Fixed skill component: { key, label, value }.
   *   When set, the dialog switches to "skill" mode: attributeA is fixed
   *   (not user-selectable) and its value plus the skill's value form the
   *   threshold base, with the bonus field layered on top as a modifier.
   * @param {string} [options.flavor]      Label shown as the dialog title and chat flavor.
   */
  constructor(actor, { attributeA = '', skill = null, flavor = '' } = {}) {
    super({ attributeA, attributeB: '', bonus: 0, advantage: JOSTER_ADVANTAGE.none });
    this.actor = actor;
    this.skill = skill;
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
      abbr: key
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .split(' ')
        .map((word) => word[0].toUpperCase())
        .join(''),
    }));

    const data = {
      ...this.object,
      abilities,
      advantageOptions,
      isSkillMode: !!this.skill,
      threshold: this._computeThreshold(this.object),
    };

    if (this.skill) {
      const actorAbilities = this.actor.system.abilities ?? {};
      data.attributeLabel = abilities[this.object.attributeA] ?? this.object.attributeA;
      data.attributeValue = actorAbilities[this.object.attributeA]?.value ?? 0;
      data.skillLabel = this.skill.label;
      data.skillValue = this.skill.value;
    }

    return data;
  }

  /**
   * Sum the fixed base (attribute, plus skill rank in skill mode, or a
   * second attribute in ability mode) with the bonus/malus.
   * @param {object} data  Form data with attributeA/attributeB/bonus.
   * @returns {number}
   */
  _computeThreshold(data) {
    const abilities = this.actor.system.abilities ?? {};
    const valueOf = (key) => abilities[key]?.value ?? 0;
    const a = data.attributeA ? valueOf(data.attributeA) : 0;
    const b = this.skill ? this.skill.value : data.attributeB ? valueOf(data.attributeB) : 0;
    return a + b + (Number(data.bonus) || 0);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.on('change', 'select[name="attributeA"], select[name="attributeB"]', (ev) => {
      const data = new FormDataExtended(ev.currentTarget.form).object;
      html.find('.joster-threshold-value').text(this._computeThreshold(data));
    });

    html.on('click', '.joster-bonus-stepper', (ev) => {
      ev.preventDefault();
      const form = $(ev.currentTarget).closest('form')[0];
      const input = form.querySelector('input[name="bonus"]');
      const delta = ev.currentTarget.dataset.action === 'increment' ? BONUS_STEP : -BONUS_STEP;
      const next = Math.clamp(Number(input.value) + delta, BONUS_MIN, BONUS_MAX);
      input.value = next;
      form.querySelector('.joster-bonus-value').textContent = next;
      const data = new FormDataExtended(form).object;
      data.bonus = next;
      form.querySelector('.joster-threshold-value').textContent = this._computeThreshold(data);
    });

    html.on('click', '.joster-advantage-option', (ev) => {
      const value = ev.currentTarget.dataset.value;
      html.find('input[name="advantage"]').val(value);
      html.find('.joster-advantage-option').removeClass('active');
      html.find(`.joster-advantage-option[data-value="${value}"]`).addClass('active');
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

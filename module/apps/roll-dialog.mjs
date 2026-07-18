import { JOSTER_ADVANTAGE, JOSTER_ADVANTAGE_ABBR, rollJoster } from '../helpers/dice.mjs';
import { colorForValue } from '../helpers/heatmap.mjs';

/** Bounds and step for the situational modification value. */
const BONUS_MIN = -30;
const BONUS_MAX = 30;
const BONUS_STEP = 3;

/** Bounds for the free skill value, matching regular skill ranks. */
const FREE_SKILL_MIN = 0;
const FREE_SKILL_MAX = 10;

/**
 * A small dialog for building a Joster roll. In "skill" mode the skill rank
 * is a fixed threshold component (set by whatever opened the dialog) while
 * its suggested attribute is preselected but can be swapped via a chip
 * picker, since a skill is never bound to one fixed attribute; in "ability"
 * mode the player picks one or two attributes themselves; in "free" mode
 * the player picks one attribute and types in an arbitrary skill value not
 * tied to any defined skill; in "fixed" mode the threshold is a single
 * fixed value (e.g. a derived value) with no attribute or skill involved at
 * all. Either way, the player also picks an advantage/disadvantage level,
 * then rolls.
 * @extends {FormApplication}
 */
export class JosterRollDialog extends FormApplication {
  /**
   * @param {Actor} actor              The rolling actor.
   * @param {object} [options]
   * @param {string} [options.attributeA]  Ability key to preselect as the first component.
   * @param {object} [options.skill]       Fixed skill component: { key, label, value }.
   *   When set, the dialog switches to "skill" mode: attributeA starts
   *   preselected but is picked via an attribute chip grid, and its value
   *   plus the skill's value form the threshold base, with the bonus field
   *   layered on top as a modifier.
   * @param {boolean} [options.freeSkill]  When true, the dialog switches to
   *   "free" mode: the player picks an attribute and enters a free skill
   *   value which together form the threshold base.
   * @param {object} [options.fixedValue]  Fixed threshold component: { label, value }.
   *   When set, the dialog switches to "fixed" mode: no attribute or skill
   *   is linked at all, the fixed value alone (plus the bonus field) forms
   *   the threshold.
   * @param {string} [options.flavor]      Label shown as the roll's subject heading and chat flavor.
   */
  constructor(actor, { attributeA = '', skill = null, freeSkill = false, fixedValue = null, flavor = '' } = {}) {
    super({ attributeA, attributeB: '', skillValue: 0, bonus: 0, advantage: JOSTER_ADVANTAGE.none, useIdea: false });
    this.actor = actor;
    this.skill = skill;
    this.freeSkill = freeSkill;
    this.fixedValue = fixedValue;
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
    return game.i18n.localize('JOSTER.Roll.DialogTitle');
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
      abbr: JOSTER_ADVANTAGE_ABBR[value],
    }));

    const data = {
      ...this.object,
      abilities,
      advantageOptions,
      isSkillMode: !!this.skill,
      isFreeMode: this.freeSkill,
      isFixedMode: !!this.fixedValue,
      threshold: this._computeThreshold(this.object),
      subject: game.i18n.format('JOSTER.Roll.Subject', { name: this.flavor }),
      // "Idee haben" is a pre-edge: only offered here, in the roll dialog,
      // before the dice are cast. There is deliberately no way to apply it
      // retroactively to a roll already made (see problem-solving-prd.md).
      hasIdeaOption: this.actor.type === 'character',
      solveIdeaValue: this.actor.system.derived?.solveIdea ?? 0,
      ideaDisabled: (this.actor.system.derived?.solveReserve ?? 0) <= 0,
    };

    if (this.skill) {
      const actorAbilities = this.actor.system.abilities ?? {};
      // Same 3-column (physical/social/mental) x 4-row grid and heatmap
      // color grading as the character sheet's attribute table, minus its
      // headers and base/temp stepper controls — here it's a pure picker.
      data.attributeGrid = CONFIG.JOSTER.attributeRows.map((row) =>
        row.map((key) => {
          const labelKey = CONFIG.JOSTER.abilities[key];
          const value = actorAbilities[key]?.value ?? 0;
          const dc = colorForValue(value);
          return {
            key,
            label: abilities[key],
            abbr: game.i18n.localize(labelKey.replace(/\.long$/, '.abbr')).toUpperCase(),
            value,
            cellBg: dc.bg,
            textColor: dc.textColor,
            active: key === this.object.attributeA,
          };
        }),
      );
      data.skillLabel = this.skill.label;
      data.skillValue = this.skill.value;
    } else if (this.fixedValue) {
      data.fixedLabel = this.fixedValue.label;
      data.fixedValueDisplay = this.fixedValue.value;
    }

    return data;
  }

  /**
   * Clamp the free-mode skill value from form data to valid skill ranks.
   * @param {object} data  Form data with skillValue.
   * @returns {number}
   */
  _freeSkillValue(data) {
    return Math.clamp(Number(data.skillValue) || 0, FREE_SKILL_MIN, FREE_SKILL_MAX);
  }

  /**
   * The "Idee haben" bonus to add on top of the threshold, if the player has
   * toggled it on and the actor still has a reserve point to spend on it.
   * @param {object} data  Form data with useIdea.
   * @returns {number}
   */
  _ideaBonus(data) {
    if (this.actor.type !== 'character' || !data.useIdea) return 0;
    if ((this.actor.system.derived?.solveReserve ?? 0) <= 0) return 0;
    return this.actor.system.derived?.solveIdea ?? 0;
  }

  /**
   * Sum the fixed base (attribute, plus skill rank in skill mode, a free
   * skill value in free mode, or a second attribute in ability mode) with
   * the bonus/malus and, if toggled, the "Idee haben" bonus. In fixed mode,
   * the fixed value itself is the base.
   * @param {object} data  Form data with attributeA/attributeB/skillValue/bonus/useIdea.
   * @returns {number}
   */
  _computeThreshold(data) {
    if (this.fixedValue) {
      return this.fixedValue.value + (Number(data.bonus) || 0) + this._ideaBonus(data);
    }
    const abilities = this.actor.system.abilities ?? {};
    const valueOf = (key) => abilities[key]?.value ?? 0;
    const a = data.attributeA ? valueOf(data.attributeA) : 0;
    const b = this.skill
      ? this.skill.value
      : this.freeSkill
        ? this._freeSkillValue(data)
        : data.attributeB
          ? valueOf(data.attributeB)
          : 0;
    return a + b + (Number(data.bonus) || 0) + this._ideaBonus(data);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.on('change', 'select[name="attributeA"], select[name="attributeB"]', (ev) => {
      const data = new FormDataExtended(ev.currentTarget.form).object;
      html.find('.joster-threshold-value').text(this._computeThreshold(data));
    });

    // Skill mode: the suggested attribute is picked from a chip grid instead
    // of a select, so the player sees every attribute's value at once and
    // can freely swap to any other one.
    html.on('click', '.joster-attribute-chip', (ev) => {
      ev.preventDefault();
      const chip = ev.currentTarget;
      const key = chip.dataset.key;
      const group = $(chip).closest('.joster-attribute-chip-grid');
      group.find('.joster-attribute-chip').removeClass('active');
      $(chip).addClass('active');

      const form = $(chip).closest('form')[0];
      form.querySelector('input[name="attributeA"]').value = key;
      const data = new FormDataExtended(form).object;
      html.find('.joster-threshold-value').text(this._computeThreshold(data));
    });

    // Free mode: recompute the threshold as the skill value is typed.
    html.on('change input', 'input[name="skillValue"]', (ev) => {
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

    // "Idee haben" toggle: recompute the threshold preview live, same as
    // any other component.
    html.on('change', 'input[name="useIdea"]', (ev) => {
      const data = new FormDataExtended(ev.currentTarget.form).object;
      html.find('.joster-threshold-value').text(this._computeThreshold(data));
    });
  }

  /** @override */
  async _updateObject(event, formData) {
    const abilities = this.actor.system.abilities ?? {};
    const abilityLabel = (key) => (key && CONFIG.JOSTER.abilities[key] ? game.i18n.localize(CONFIG.JOSTER.abilities[key]) : '');

    const components = [];
    if (this.fixedValue) {
      components.push({ label: this.fixedValue.label, value: this.fixedValue.value });
    } else {
      if (formData.attributeA) {
        components.push({ label: abilityLabel(formData.attributeA), value: abilities[formData.attributeA]?.value ?? 0 });
      }
      if (this.skill) {
        components.push({ label: this.skill.label, value: this.skill.value });
      } else if (this.freeSkill) {
        components.push({ label: game.i18n.localize('JOSTER.Roll.FreeSkillValue'), value: this._freeSkillValue(formData) });
      } else if (formData.attributeB) {
        components.push({ label: abilityLabel(formData.attributeB), value: abilities[formData.attributeB]?.value ?? 0 });
      }
    }

    // "Idee haben" (pre-edge): compute the threshold and bonus off the
    // actor's state *before* spending the point — spending updates
    // system.derived.solveReserve, and re-deriving after that point would
    // make the just-spent point look unavailable again. There is no
    // post-roll path to apply this; if the reserve ran out before this
    // dialog was submitted, the roll proceeds without the bonus.
    const threshold = this._computeThreshold(formData);
    const ideaBonus = this._ideaBonus(formData);
    if (ideaBonus !== 0) {
      const spent = this.actor.system.problemSolving?.spent ?? 0;
      await this.actor.update({ 'system.problemSolving.spent': spent + 1 });
      components.push({ label: game.i18n.localize('JOSTER.Roll.IdeaComponent'), value: ideaBonus });
    } else if (formData.useIdea) {
      ui.notifications.warn(game.i18n.localize('JOSTER.Notify.NoReserve'));
    }

    // Remember the attribute this skill was rolled against, per actor, so
    // the next time this skill's roll dialog opens (on this sheet) it
    // preselects it instead of the skill's configured default.
    if (this.skill && formData.attributeA) {
      await this.actor.update({ [`system.skills.${this.skill.key}.lastAttribute`]: formData.attributeA });
    }

    await rollJoster({
      threshold,
      advantage: Number(formData.advantage),
      flavor: this.flavor,
      actor: this.actor,
      components,
      bonus: Number(formData.bonus) || 0,
    });
  }
}

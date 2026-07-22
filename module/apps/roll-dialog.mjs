import { TNO_ADVANTAGE, describeAdvantage, rollTno } from '../helpers/dice.mjs';
import { colorForValue } from '../helpers/heatmap.mjs';
import { advantageOptions, bindAdvantagePicker } from './roll-dialog-shared.mjs';

/** Bounds and step for the situational modification value. */
const BONUS_MIN = -30;
const BONUS_MAX = 30;
const BONUS_STEP = 3;

/** Bounds for the free skill value, matching regular skill ranks. */
const FREE_SKILL_MIN = 0;
const FREE_SKILL_MAX = 10;

/**
 * A small dialog for building a Tno roll. In "skill" mode the skill rank
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
export class TnoRollDialog extends FormApplication {
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
    super({ attributeA, attributeB: '', skillValue: 0, bonus: 0, advantage: TNO_ADVANTAGE.none, useIdea: false });
    this.actor = actor;
    this.skill = skill;
    this.freeSkill = freeSkill;
    this.fixedValue = fixedValue;
    this.flavor = flavor || game.i18n.localize('TNO.Roll.DialogTitle');
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-roll-dialog',
      classes: ['tno', 'sheet'],
      template: 'systems/tno/templates/apps/roll-dialog.hbs',
      width: 340,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.format('TNO.Roll.DialogTitleWithSubject', { name: this.flavor });
  }

  /** @override */
  getData() {
    const abilities = {};
    for (const [key, labelKey] of Object.entries(CONFIG.TNO.abilities)) {
      abilities[key] = game.i18n.localize(labelKey);
    }

    const hasIdeaOption = this.actor.type === 'character';
    const bonus = Number(this.object.bonus) || 0;

    const data = {
      ...this.object,
      abilities,
      advantageOptions: advantageOptions(),
      advantageConsequence: describeAdvantage(this.object.advantage),
      isSkillMode: !!this.skill,
      isFreeMode: this.freeSkill,
      isFixedMode: !!this.fixedValue,
      threshold: this._computeThreshold(this.object),
      breakdown: this._breakdownText(this.object),
      targetLabel: game.i18n.localize('TNO.Roll.SubmitTargetLabel'),
      subject: game.i18n.format('TNO.Roll.Subject', { name: this.flavor }),
      // The bonus stepper (fixed mode aside) and the "Idee haben" toggle both
      // live in the modifiers section; show it whenever either applies.
      hasModifiers: !this.fixedValue || hasIdeaOption,
      bonusDisplay: this._formatBonus(bonus),
      bonusSignClass: this._bonusSignClass(bonus),
      bonusAtMin: bonus <= BONUS_MIN,
      bonusAtMax: bonus >= BONUS_MAX,
      // "Idee haben" is a pre-edge: only offered here, in the roll dialog,
      // before the dice are cast. There is deliberately no way to apply it
      // retroactively to a roll already made (see problem-solving-prd.md).
      hasIdeaOption,
      solveIdeaValue: this.actor.system.derived?.solveIdea ?? 0,
      solveReserve: this.actor.system.derived?.solveReserve ?? 0,
      solveReserveMax: this.actor.system.derived?.solveReserveMax ?? 0,
      ideaDisabled: (this.actor.system.derived?.solveReserve ?? 0) <= 0,
    };

    if (hasIdeaOption) {
      // A row of filled/empty pips makes the reserve read as "N charges
      // left" at a glance instead of a bare fraction the player has to parse.
      data.hasIdeaPips = data.solveReserveMax > 0;
      data.ideaPips = Array.from({ length: data.solveReserveMax }, (_, i) => ({ filled: i < data.solveReserve }));
    }

    if (this.skill) {
      data.selectedAttributeLabel = this.object.attributeA ? abilities[this.object.attributeA] : '';
      const actorAbilities = this.actor.system.abilities ?? {};
      // Same 3-column (physical/social/mental) x 4-row grid and heatmap
      // color grading as the character sheet's attribute table, minus its
      // base/temp stepper controls — here it's a pure picker with category
      // column headers.
      data.attributeGrid = CONFIG.TNO.attributeRows.map((row) =>
        row.map((key) => {
          const labelKey = CONFIG.TNO.abilities[key];
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
      const skillColor = colorForValue(this.skill.value);
      data.skillLabel = this.skill.label;
      data.skillValue = this.skill.value;
      data.skillCellBg = skillColor.bg;
      data.skillTextColor = skillColor.textColor;
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
   * The fixed base components — the attribute plus the skill rank (skill
   * mode), a free skill value (free mode), or a second attribute (ability
   * mode); or the fixed value alone (fixed mode) — as { label, value } pairs.
   * Shared by the threshold sum, the live breakdown preview, and the chat
   * card's component list so all three can never disagree.
   * @param {object} data  Form data with attributeA/attributeB/skillValue.
   * @returns {Array<{label: string, value: number}>}
   */
  _baseComponents(data) {
    if (this.fixedValue) {
      return [{ label: this.fixedValue.label, value: this.fixedValue.value }];
    }
    const abilities = this.actor.system.abilities ?? {};
    const abilityLabel = (key) => (key && CONFIG.TNO.abilities[key] ? game.i18n.localize(CONFIG.TNO.abilities[key]) : '');
    const valueOf = (key) => abilities[key]?.value ?? 0;
    const components = [];
    if (data.attributeA) {
      components.push({ label: abilityLabel(data.attributeA), value: valueOf(data.attributeA) });
    }
    if (this.skill) {
      components.push({ label: this.skill.label, value: this.skill.value });
    } else if (this.freeSkill) {
      components.push({ label: game.i18n.localize('TNO.Roll.FreeSkillValue'), value: this._freeSkillValue(data) });
    } else if (data.attributeB) {
      components.push({ label: abilityLabel(data.attributeB), value: valueOf(data.attributeB) });
    }
    return components;
  }

  /**
   * Sum the fixed base with the bonus/malus and, if toggled, the "Idee haben"
   * bonus.
   * @param {object} data  Form data with attributeA/attributeB/skillValue/bonus/useIdea.
   * @returns {number}
   */
  _computeThreshold(data) {
    const base = this._baseComponents(data).reduce((sum, c) => sum + c.value, 0);
    return base + (Number(data.bonus) || 0) + this._ideaBonus(data);
  }

  /**
   * Format a bonus/malus with an explicit sign so 0, +9 and −9 always read
   * differently. Uses a real minus sign to match the stepper buttons.
   * @param {number} n
   * @returns {string}
   */
  _formatBonus(n) {
    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;
    return '±0';
  }

  /**
   * The sign-colour class for a bonus/malus value.
   * @param {number} n
   * @returns {string}
   */
  _bonusSignClass(n) {
    if (n > 0) return 'tno-bonus-positive';
    if (n < 0) return 'tno-bonus-negative';
    return '';
  }

  /**
   * A one-line, human-readable breakdown of the parts that produce the
   * threshold, e.g. "Stärke 5 + Klettern 4 + Modifikation −3 + Idee +2".
   * Joined with "+" (not "·", which reads as multiplication) since every
   * part is summed into the threshold.
   * @param {object} data  Form data.
   * @returns {string}
   */
  _breakdownText(data) {
    const parts = this._baseComponents(data).map((c) => `${c.label} ${c.value}`);
    const bonus = Number(data.bonus) || 0;
    if (bonus !== 0) parts.push(`${game.i18n.localize('TNO.Roll.Bonus')} ${this._formatBonus(bonus)}`);
    const idea = this._ideaBonus(data);
    if (idea !== 0) parts.push(`${game.i18n.localize('TNO.Roll.IdeaComponent')} +${idea}`);
    return parts.join(' + ');
  }

  /**
   * Recompute and repaint everything downstream of a threshold-affecting
   * change: the threshold number, its breakdown line, the roll button's
   * echo, and a brief highlight so the change is noticed.
   * @param {HTMLFormElement} form
   */
  _refresh(form) {
    const data = new FormDataExtended(form).object;
    const threshold = this._computeThreshold(data);
    form.querySelector('.tno-threshold-value').textContent = threshold;
    const breakdown = form.querySelector('.tno-roll-breakdown');
    if (breakdown) breakdown.textContent = this._breakdownText(data);
    const echo = form.querySelector('.tno-roll-submit-echo');
    if (echo) echo.textContent = `${game.i18n.localize('TNO.Roll.SubmitTargetLabel')} ≤ ${threshold}`;
    const box = form.querySelector('.tno-threshold-box');
    if (box) {
      box.classList.remove('tno-threshold-flash');
      void box.offsetWidth; // reflow so the animation restarts on rapid changes
      box.classList.add('tno-threshold-flash');
    }
  }

  /**
   * Set the bonus/malus to a clamped value and sync its display, sign colour,
   * cap-disabled buttons, and the threshold preview.
   * @param {HTMLFormElement} form
   * @param {number} next  The desired (pre-clamp) bonus value.
   */
  _setBonus(form, next) {
    const value = Math.clamp(next, BONUS_MIN, BONUS_MAX);
    form.querySelector('input[name="bonus"]').value = value;
    const display = form.querySelector('.tno-bonus-value');
    display.textContent = this._formatBonus(value);
    display.classList.toggle('tno-bonus-positive', value > 0);
    display.classList.toggle('tno-bonus-negative', value < 0);
    form.querySelector('.tno-bonus-stepper[data-action="decrement"]').disabled = value <= BONUS_MIN;
    form.querySelector('.tno-bonus-stepper[data-action="increment"]').disabled = value >= BONUS_MAX;
    this._refresh(form);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Any threshold-affecting input (attribute selects, free skill value, the
    // "Idee haben" toggle) repaints the preview.
    html.on('change', 'select[name="attributeA"], select[name="attributeB"]', (ev) => this._refresh(ev.currentTarget.closest('form')));
    html.on('change input', 'input[name="skillValue"]', (ev) => this._refresh(ev.currentTarget.closest('form')));
    html.on('change', 'input[name="useIdea"]', (ev) => {
      ev.currentTarget.closest('.tno-idea-toggle')?.classList.toggle('active', ev.currentTarget.checked);
      this._refresh(ev.currentTarget.closest('form'));
    });

    // Skill mode: the attribute is picked from a heatmap chip grid instead of
    // a select, so the player sees every attribute's value at once and can
    // freely swap to any other one.
    html.on('click', '.tno-attribute-chip', (ev) => {
      ev.preventDefault();
      const chip = ev.currentTarget;
      const form = chip.closest('form');
      form.querySelectorAll('.tno-attribute-chip').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      form.querySelector('input[name="attributeA"]').value = chip.dataset.key;
      const name = form.querySelector('.tno-attribute-selected-name');
      if (name) name.textContent = chip.title;
      this._refresh(form);
    });

    // Bonus stepper: ± in steps of 3, clamped, caps shown as disabled buttons.
    html.on('click', '.tno-bonus-stepper', (ev) => {
      ev.preventDefault();
      if (ev.currentTarget.disabled) return;
      const form = ev.currentTarget.closest('form');
      const current = Number(form.querySelector('input[name="bonus"]').value) || 0;
      const delta = ev.currentTarget.dataset.action === 'increment' ? BONUS_STEP : -BONUS_STEP;
      this._setBonus(form, current + delta);
    });

    // The bonus value doubles as a control: click resets it to zero, arrow
    // keys step it, so it's usable without the mouse.
    html.on('click', '.tno-bonus-value', (ev) => this._setBonus(ev.currentTarget.closest('form'), 0));
    html.on('keydown', '.tno-bonus-value', (ev) => {
      const form = ev.currentTarget.closest('form');
      const current = Number(form.querySelector('input[name="bonus"]').value) || 0;
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        this._setBonus(form, current + BONUS_STEP);
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        this._setBonus(form, current - BONUS_STEP);
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this._setBonus(form, 0);
      }
    });

    // Roll-type picker, shared with the base-dice dialog. It changes which
    // dice are rolled, not the threshold, so it needs no refresh callback.
    bindAdvantagePicker(html);

    // Land focus on the roll button so the common path — accept the defaults
    // and roll — is a single Enter press.
    html.find('button[type="submit"]').trigger('focus');
  }

  /** @override */
  async _updateObject(event, formData) {
    const components = this._baseComponents(formData);

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
      components.push({ label: game.i18n.localize('TNO.Roll.IdeaComponent'), value: ideaBonus });
    } else if (formData.useIdea) {
      ui.notifications.warn(game.i18n.localize('TNO.Notify.NoReserve'));
    }

    // Remember the attribute this skill was rolled against, per actor, so
    // the next time this skill's roll dialog opens (on this sheet) it
    // preselects it instead of the skill's configured default.
    if (this.skill && formData.attributeA) {
      await this.actor.update({ [`system.skills.${this.skill.key}.lastAttribute`]: formData.attributeA });
    }

    await rollTno({
      threshold,
      advantage: Number(formData.advantage),
      flavor: this.flavor,
      actor: this.actor,
      components,
      bonus: Number(formData.bonus) || 0,
      // The "Problem lösen" edge pool may only be spent on a regular
      // skill+attribute check — not on a bare attribute roll, a free-typed
      // skill value, or a fixed-value roll (see problem-solving-prd.md).
      extraFlags: { edgeExempt: !this.skill },
    });
  }
}

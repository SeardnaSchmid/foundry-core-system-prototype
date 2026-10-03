import { TNO_ADVANTAGE, describeAdvantage, rollTno } from '../helpers/dice.mjs';
import { formatChance, oddsTooltipHtml, successChanceFor } from '../helpers/dice-odds.mjs';
import { armorSvMalus, isAuthoredNumber } from '../helpers/items.mjs';
import { ansageEnvelope } from '../helpers/maneuvers.mjs';
import { advantageOptions, bindRadioGroup } from './roll-dialog-shared.mjs';

// Namespaced rather than the bare `FormApplication` global, which is
// deprecated. Still ApplicationV1 — see the V1 apps note in
// docs/codemap/reference/module-map.md.
const { FormApplication } = foundry.appv1.api;

/** Bounds and steps for the situational modification value. */
const BONUS_MIN = -30;
const BONUS_MAX = 30;
const BONUS_STEP = 3;
const BONUS_FINE_STEP = 1;

/** Bounds for the free skill value, matching regular skill ranks. */
const FREE_SKILL_MIN = 0;
const FREE_SKILL_MAX = 10;

/**
 * Where a threshold component comes from, in the order the Beleg lists them.
 * The key is also the i18n suffix (`TNO.Roll.Origin.<Key>`) and the icon.
 */
const ORIGINS = [
  { key: 'character', label: 'Character', icon: 'fa-user' },
  { key: 'weapon', label: 'Weapon', icon: 'fa-sword' },
  { key: 'armor', label: 'Armor', icon: 'fa-shield-halved' },
  { key: 'attack', label: 'Attack', icon: 'fa-burst' },
  { key: 'situation', label: 'Situation', icon: 'fa-eye' },
  { key: 'choice', label: 'Choice', icon: 'fa-sliders' },
];
const ORIGIN_KEYS = ORIGINS.map((origin) => origin.key);

/** The question numbers as the Beleg and the open-questions line print them. */
const MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

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
 *
 * The form is laid out as numbered questions ("Zu klären") above a footer
 * that holds the Schwelle. Facts the roller cannot change are not asked; they
 * live in the Beleg, a drawer above the Schwelle that lists every component
 * grouped by where it comes from.
 * @extends {FormApplication}
 */
export class TnoRollDialog extends FormApplication {
  /**
   * @param {Actor} actor              The rolling actor.
   * @param {object} [options]
   * @param {string} [options.attributeA]  Ability key to preselect as the first component.
   * @param {boolean} [options.lockAttribute]  Keep `attributeA` fixed rather
   *   than offering the normal skill-roll attribute picker.
   * @param {object} [options.skill]       Fixed skill component: { key, label, value }.
   *   When set, the dialog switches to "skill" mode: attributeA starts
   *   preselected but is picked via an attribute grid, and its value plus the
   *   skill's value form the threshold base, with the bonus field layered on
   *   top as a modifier.
   * @param {boolean} [options.freeSkill]  When true, the dialog switches to
   *   "free" mode: the player picks an attribute and enters a free skill
   *   value which together form the threshold base.
   * @param {object} [options.fixedValue]  Fixed threshold component: { label, value }.
   *   When set, the dialog switches to "fixed" mode: no attribute or skill
   *   is linked at all, the fixed value alone (plus the bonus field) forms
   *   the threshold.
   * @param {{label: string, value: number, hint?: string, origin?: string}[]} [options.fixedModifiers]
   *   Immutable rule modifiers added to the threshold and shown in the Beleg
   *   under their `origin` (default `character`).
   * @param {object} [options.preRollContext]
   *   One required answer that must be given before rolling. Its selected
   *   value becomes an immutable threshold component. `{label, placeholder,
   *   control: 'select'|'tiles'|'toggle'|'compare', tileColumns, note, ask,
   *   hint, origin, choices}`. A `compare` control asks for a number instead
   *   of a pick — `compare: {label, anchorLabel, anchor, derive(value) → key}`
   *   — and derives the choice from it.
   * @param {object} [options.requiredValue]
   *   One number the player types — a value only the table knows, such as the
   *   Schadenswert an attacker announced. `{label, componentLabel, labels,
   *   toggleLabel, hint, ask, sign, min, max, required, lockedUntilContext,
   *   origin}`. A `required` value starts blank and holds the roll back until
   *   typed; `lockedUntilContext` keeps it closed until the context above it
   *   is answered.
   * @param {object} [options.phase]  `{label, detail}` for the strip at the top.
   * @param {{weapon?: string, armor?: string}} [options.sources]
   *   Names that complete a Beleg group heading ("Waffe · Kettensäge").
   * @param {string} [options.flavor]      Label shown as the roll's subject heading and chat flavor.
   * @param {string} [options.img]         Picture shown beside that heading on the chat card, e.g. the weapon's own art.
   * @param {{label: string, hint?: string}} [options.ansage]
   *   Offer the Ansage field: one optional, free magnitude that worsens this roll
   *   by what it declares. Deliberately unpriced and ungated — the player and the
   *   GM agree the number out loud, and which Manöver it stands for is table talk
   *   the form has no business re-deriving.
   * @param {{from: string, penetration: number|null, sharp: number|null, blunt: number|null}} [options.envelope]
   *   The attacker's half of an exchange: who is attacking and what their weapon
   *   brings, to which the declared Ansage is added. Rendered on
   *   the chat card as plain text — there is no targeting and no second document
   *   — so the defender reads it and enters what applies.
   * @param {{label: string, value: number, hint?: string}} [options.maneuverMalus]
   *   A modifier that applies only while an Ansage is declared — the weapon's FV
   *   shortfall, which lands on "alle Manöver" and never on a Standardangriff.
   * @param {object} [options.toggleModifier]
   *   A modifier this player confirms rather than computes — today only
   *   'Rüstung umgehen', asked as a yes/no question. `{label, value, hint,
   *   question, yesLabel, noLabel, waivesContext, origin}`. With
   *   `waivesContext`, a yes makes the context question moot.
   * @param {(answers: {contextKey: string, value: number|null, toggleModifier: boolean}) => {label: string, text: string, note?: string, hint?: string}|null} [options.consequence]
   *   What this roll costs the roller if it fails, phrased by the workflow that
   *   opened the dialog. Rendered on the chat card only once the dice have
   *   actually failed. It states; nothing here applies it.
   * @param {() => Promise<void>} [options.afterRoll]
   *   Run once the dice have actually been cast, never when the dialog is
   *   cancelled — the repeated-defence counter must count rolls, not intentions.
   */
  constructor(actor, { attributeA = '', lockAttribute = false, skill = null, freeSkill = false, fixedValue = null, fixedModifiers = [], preRollContext = null, requiredValue = null, ansage = null, maneuverMalus = null, envelope = null, toggleModifier = null, consequence = null, afterRoll = null, phase = null, sources = null, flavor = '', img = '', width = null } = {}) {
    super(
      { attributeA, attributeB: '', skillValue: 0, bonus: 0, advantage: TNO_ADVANTAGE.none, useIdea: false, contextChoice: '', compareValue: '', requiredValue: 0, ansage: 0, toggleModifier: false },
      Number.isFinite(Number(width)) && Number(width) > 0 ? { width: Number(width) } : {}
    );
    this.actor = actor;
    this.lockAttribute = !!(lockAttribute && attributeA);
    this.skill = skill;
    this.freeSkill = freeSkill;
    this.fixedValue = fixedValue;
    this.fixedModifiers = fixedModifiers
      .filter((modifier) => modifier?.label && Number.isFinite(Number(modifier.value)))
      .map((modifier) => ({
        label: String(modifier.label),
        value: Number(modifier.value),
        ...(modifier.hint ? { hint: String(modifier.hint) } : {}),
        origin: TnoRollDialog._origin(modifier.origin, 'character'),
      }));
    this.preRollContext = this._normalizePreRollContext(preRollContext);
    this.requiredValue = this._normalizeRequiredValue(requiredValue);
    // A required number has no answer until one is typed; any other one opens
    // on 0, the value most announcements start from.
    if (this.requiredValue?.required) this.object.requiredValue = '';
    this.ansage = ansage?.label ? { label: String(ansage.label), hint: String(ansage.hint ?? '') } : null;
    this.maneuverMalus = maneuverMalus?.label && Number.isFinite(Number(maneuverMalus.value))
      ? {
          label: String(maneuverMalus.label),
          value: Number(maneuverMalus.value),
          ...(maneuverMalus.hint ? { hint: String(maneuverMalus.hint) } : {}),
        }
      : null;
    this.envelope = envelope?.from ? envelope : null;
    this.toggleModifier = toggleModifier?.label && Number.isFinite(Number(toggleModifier.value))
      ? {
          label: String(toggleModifier.label),
          hint: String(toggleModifier.hint ?? ''),
          value: Number(toggleModifier.value),
          question: String(toggleModifier.question || toggleModifier.label),
          yesLabel: String(toggleModifier.yesLabel || game.i18n.localize('TNO.Roll.Yes')),
          noLabel: String(toggleModifier.noLabel || game.i18n.localize('TNO.Roll.No')),
          waivesContext: !!toggleModifier.waivesContext,
          origin: TnoRollDialog._origin(toggleModifier.origin, 'armor'),
        }
      : null;
    if (this.toggleModifier && toggleModifier.checked === true) this.object.toggleModifier = true;
    this.consequence = typeof consequence === 'function' ? consequence : null;
    this.afterRoll = typeof afterRoll === 'function' ? afterRoll : null;
    this.phase = phase?.label ? { label: String(phase.label), detail: String(phase.detail ?? '') } : null;
    this.sources = { weapon: sources?.weapon ? String(sources.weapon) : '', armor: sources?.armor ? String(sources.armor) : '' };
    this.flavor = flavor || game.i18n.localize('TNO.Roll.DialogTitle');
    // Decoration for the chat card only: which weapon this roll was made with,
    // read at a glance in a scrolling log. Nothing computes with it.
    this.img = img;
  }

  /**
   * One of the Beleg origins, or the fallback for anything else.
   * @param {*} origin
   * @param {string} fallback
   * @returns {string}
   */
  static _origin(origin, fallback) {
    return ORIGIN_KEYS.includes(origin) ? origin : fallback;
  }

  /**
   * Keep the optional context interface safe for all existing roll callers:
   * malformed or empty contexts simply behave as though no context was given.
   * @param {*} context
   * @returns {object|null}
   */
  _normalizePreRollContext(context) {
    if (!context?.label || !Array.isArray(context.choices)) return null;
    const choices = context.choices
      .filter((choice) => choice?.key !== undefined && choice?.label && Number.isFinite(Number(choice.value)))
      .map((choice) => ({
        key: String(choice.key),
        label: String(choice.label),
        value: Number(choice.value),
        ...(choice.componentLabel ? { componentLabel: String(choice.componentLabel) } : {}),
        // The name of the answer, where the `label` is its *effect* rather
        // than its name — the penetration comparison names its rungs "> RH"
        // and captions them with what follows. Must be carried through this
        // whitelist explicitly: without it that picker would be captioned by
        // its outcomes and named by nothing.
        ...(choice.headline ? { headline: String(choice.headline) } : {}),
        // A context may already provide the same outcome as the workflow's
        // separate confirmation toggle. Preserve that relationship so the
        // generic dialog never counts its modifier twice.
        ...(choice.suppressesToggleModifier ? { suppressesToggleModifier: true } : {}),
      }));
    if (!choices.length) return null;
    const compare = context.control === 'compare' && typeof context.compare?.derive === 'function'
      ? {
          label: String(context.compare.label ?? context.label),
          anchorLabel: String(context.compare.anchorLabel ?? ''),
          anchor: context.compare.anchor === undefined ? '' : String(context.compare.anchor),
          derive: context.compare.derive,
        }
      : null;
    const control = compare
      ? 'compare'
      : context.control === 'toggle'
        ? choices.length === 2 ? 'toggle' : 'tiles'
        : context.control === 'tiles' ? 'tiles' : 'select';
    return {
      label: String(context.label),
      placeholder: String(context.placeholder || game.i18n.localize('TNO.Roll.ContextPlaceholder')),
      control,
      tileColumns: [1, 2, 3, 5, 7].includes(Number(context.tileColumns)) ? Number(context.tileColumns) : 7,
      // The reader's own half of a comparison: a number their sheet already
      // knows, shown beside the choices rather than folded into the question.
      anchor: context.anchor?.label && context.anchor?.value !== undefined
        ? { label: String(context.anchor.label), value: String(context.anchor.value) }
        : null,
      // What the reader needs to answer the question, said beside it — the
      // weapon's own DK for the reach question.
      note: context.note ? String(context.note) : '',
      // Who to ask, where the answer is the other side's ("Frag den Angreifer").
      ask: context.ask ? String(context.ask) : '',
      hint: context.hint ? String(context.hint) : '',
      origin: TnoRollDialog._origin(context.origin, 'situation'),
      compare,
      choices,
    };
  }

  /**
   * Keep the optional required-number interface safe the same way: anything
   * without a label behaves as though no value was asked for.
   *
   * `sign` is what makes one field serve both directions — an announced
   * Schadenswert is subtracted, and nothing yet adds one, but a number the
   * player states is a number either way.
   * @param {*} spec
   * @returns {object|null}
   */
  _normalizeRequiredValue(spec) {
    if (!spec?.label) return null;
    return {
      label: String(spec.label),
      placeholder: spec.placeholder ? String(spec.placeholder) : '',
      componentLabel: String(spec.componentLabel || spec.label),
      hint: spec.hint ? String(spec.hint) : '',
      ask: spec.ask ? String(spec.ask) : '',
      // Which of the context choices renames this field, keyed by choice.
      labels: spec.labels && typeof spec.labels === 'object' ? { ...spec.labels } : null,
      // The name while the confirmed toggle decides it instead of the context.
      toggleLabel: spec.toggleLabel ? String(spec.toggleLabel) : '',
      sign: Number(spec.sign) === -1 ? -1 : 1,
      min: isAuthoredNumber(spec.min) ? Number(spec.min) : null,
      max: isAuthoredNumber(spec.max) ? Number(spec.max) : null,
      required: !!spec.required,
      lockedUntilContext: !!spec.lockedUntilContext,
      origin: TnoRollDialog._origin(spec.origin, 'attack'),
    };
  }

  /**
   * What the required-value field is called right now: the label the selected
   * context choice asks for, or the neutral one while nothing is selected.
   * @param {object} data  Form data with contextChoice.
   * @returns {string}
   */
  _requiredValueLabel(data) {
    if (!this.requiredValue) return '';
    if (this.requiredValue.toggleLabel && this._toggleModifierActive(data)) {
      return this.requiredValue.toggleLabel;
    }
    const key = this._contextChoice(data)?.key;
    return this.requiredValue.labels?.[key] || this.requiredValue.label;
  }

  /**
   * Whether a confirmed toggle has made the context question moot — a bypassed
   * armour has no penetration to compare.
   * @param {object} data  Form data with toggleModifier.
   * @returns {boolean}
   */
  _contextWaived(data) {
    return !!(this.toggleModifier?.waivesContext && data?.toggleModifier);
  }

  /**
   * Whether the selected context has already supplied the toggle's complete
   * effect. This is a relationship declared by the workflow, not armour logic
   * embedded in the generic dialog.
   * @param {object} data  Form data with contextChoice.
   * @returns {boolean}
   */
  _toggleModifierSuppressed(data) {
    return !!(this.toggleModifier && this._contextChoice(data)?.suppressesToggleModifier);
  }

  /**
   * Whether the separate toggle contributes to the resolved roll.
   * @param {object} data  Form data with contextChoice/toggleModifier.
   * @returns {boolean}
   */
  _toggleModifierActive(data) {
    return !!(this.toggleModifier && data?.toggleModifier && !this._toggleModifierSuppressed(data));
  }

  /**
   * One bound off a number input, or null where the field does not carry it.
   * Read from the element rather than from any one workflow's spec, which is
   * what lets a single stepper serve every stepped field.
   * @param {*} raw  An input's `min` or `max`.
   * @returns {number|null}
   */
  static _inputBound(raw) {
    if (raw === '' || raw === null || raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * Nudge a stepped field by one, inside whatever bounds its own input carries.
   * A blank field counts as zero here: the stepper is an explicit click, and
   * refusing to act on it would look broken.
   * @param {HTMLFormElement} form
   * @param {HTMLInputElement} input  The field this stepper frames.
   * @param {number} delta
   * @private
   */
  _stepValue(form, input, delta) {
    if (!input || input.disabled) return;
    const min = TnoRollDialog._inputBound(input.min);
    const max = TnoRollDialog._inputBound(input.max);
    let next = (Number(input.value) || 0) + delta;
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);
    input.value = String(next);
    this._refresh(form);
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['tno', 'sheet'],
      template: 'systems/tno/templates/apps/roll-dialog.hbs',
      width: 500,
      resizable: true,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get id() {
    return `tno-roll-dialog-${this.appId}`;
  }

  /** @override */
  get title() {
    return game.i18n.format('TNO.Roll.DialogTitleWithSubject', { name: this.flavor });
  }

  /**
   * The strip under the title: what is happening in the fiction. A workflow
   * names it; an ordinary roll is named by its mode.
   * @returns {{label: string, detail: string}}
   */
  _phase() {
    if (this.phase) return this.phase;
    const L = (key) => game.i18n.localize(key);
    if (this.fixedValue) return { label: L('TNO.Roll.Phase.Fixed'), detail: this.fixedValue.label };
    if (this.skill) {
      return {
        label: L('TNO.Roll.Phase.Skill'),
        detail: game.i18n.format('TNO.Roll.Phase.SkillDetail', { skill: this.skill.label }),
      };
    }
    if (this.freeSkill) return { label: L('TNO.Roll.Phase.Free'), detail: L('TNO.Roll.Phase.FreeDetail') };
    return { label: L('TNO.Roll.Phase.Ability'), detail: L('TNO.Roll.Phase.AbilityDetail') };
  }

  /**
   * One delta readout: the signed contribution a line makes to the Schwelle.
   *
   * `pending` is a line whose answer is still missing — it shows `?` and the
   * roll is blocked. `provisional` is a line set up but not armed (an unspent
   * Idee) — its amount in parentheses, not summed. `struck` is a line that no
   * longer applies (a comparison a bypass made moot).
   * @param {number|null} value
   * @param {{pending?: boolean, provisional?: boolean, struck?: boolean}} [state]
   * @returns {{display: string, cls: string}}
   */
  _deltaCell(value, { pending = false, provisional = false, struck = false } = {}) {
    if (pending) return { display: '?', cls: 'is-pending' };
    if (struck) return { display: value === null || value === undefined ? '—' : `(${this._formatBonus(Number(value) || 0)})`, cls: 'is-struck' };
    const n = Number(value) || 0;
    const formatted = this._formatBonus(n);
    return {
      display: provisional ? `(${formatted})` : formatted,
      cls: provisional ? 'is-provisional' : n > 0 ? 'is-positive' : n < 0 ? 'is-negative' : 'is-neutral',
    };
  }

  /** The Idee bonus magnitude, whether or not it is currently armed. */
  _ideaInsight() {
    return this.actor.type === 'character' ? this.actor.system.derived?.insight ?? 0 : 0;
  }

  /** Whether the Idee bonus is actually being spent on this roll. */
  _ideaArmed(data) {
    return !!data?.useIdea && (this.actor.system.derived?.edgePool ?? 0) > 0;
  }

  /**
   * One ability as a pickable tile.
   * @param {string} key
   * @returns {object|null}
   */
  _abilityCell(key) {
    const labelKey = CONFIG.TNO.abilities[key];
    if (!labelKey) return null;
    return {
      key,
      label: game.i18n.localize(labelKey),
      abbr: game.i18n.localize(labelKey.replace(/\.long$/, '.abbr')).toUpperCase(),
      value: this.actor.system.abilities?.[key]?.base ?? 0,
      active: key === this.object.attributeA,
    };
  }

  /**
   * The attribute picker as three columns — körperlich, sozial, geistig —
   * read off `attributeRows`, whose rows hold one attribute of each.
   * @returns {Array<{label: string, items: Array<object>}>}
   */
  _attributeColumns() {
    const rows = CONFIG.TNO.attributeRows ?? [];
    return ['Physical', 'Social', 'Mental'].map((category, index) => ({
      label: game.i18n.localize(`TNO.AttributeCategory.${category}`),
      items: rows.map((row) => this._abilityCell(row[index])).filter(Boolean),
    }));
  }

  /** @param {number} value @returns {string} */
  _bonusResetLabel(value) {
    return game.i18n.format('TNO.Roll.BonusResetLabel', { value: this._formatBonus(value) });
  }

  /**
   * The questions this roll asks, in the order they are numbered. The single
   * list behind the form, the Beleg's numbering, the open-questions line and
   * the submit gate, so none of them can disagree about what is still open.
   *
   * A question is `pending` while it still needs an answer before the roll
   * can be made, and `locked` while it cannot be answered yet or no longer
   * applies.
   * @param {object} data  Form data.
   * @returns {Array<{key: string, title: string, num: number, mark: string, pending: boolean, locked: boolean}>}
   */
  _questions(data) {
    const L = (key) => game.i18n.localize(key);
    const list = [];
    const push = (key, title, { pending = false, locked = false } = {}) => list.push({ key, title, pending, locked });

    if (this.toggleModifier) push('toggle', this.toggleModifier.question);
    if (this.ansage) push('ansage', this.ansage.label);
    if (this.preRollContext) {
      const waived = this._contextWaived(data);
      push('context', this.preRollContext.label, { pending: !waived && !this._contextChoice(data), locked: waived });
    }
    if (this.requiredValue) {
      push('required', this._requiredValueLabel(data), {
        pending: this._requiredValueEntry(data) === null,
        locked: this._requiredValueLocked(data),
      });
    }
    if (!this.fixedValue && !this.lockAttribute) {
      push('attribute', this.skill
        ? game.i18n.format('TNO.Roll.Question.Attribute', { skill: this.skill.label })
        : L('TNO.Roll.ChooseAttribute'), { pending: !CONFIG.TNO.abilities[data?.attributeA] });
      if (!this.skill && !this.freeSkill) push('attributeB', L('TNO.Roll.AttributeB'));
      if (this.freeSkill) push('free', L('TNO.Roll.FreeSkillValue'));
    }
    if (!this.fixedValue) push('bonus', L('TNO.Roll.Bonus'));
    if (this.actor.type === 'character') push('idea', L('TNO.Roll.Question.Idea'));

    return list.map((question, index) => ({ ...question, num: index + 1, mark: MARKS[index] ?? `${index + 1}.` }));
  }

  /**
   * Whether the required number cannot be answered yet: its name, and which of
   * the attacker's values it is, depend on the context above it.
   * @param {object} data
   * @returns {boolean}
   */
  _requiredValueLocked(data) {
    return !!(this.requiredValue?.lockedUntilContext && this.preRollContext
      && !this._contextChoice(data) && !this._contextWaived(data));
  }

  /** @override */
  getData() {
    const data = this.object;
    const L = (key) => game.i18n.localize(key);
    const questions = this._questions(data);
    const contextMark = questions.find((question) => question.key === 'context')?.mark ?? '';
    const bonus = Number(data.bonus) || 0;
    const edgePool = this.actor.system.derived?.edgePool ?? 0;
    const edgePoolMax = this.actor.system.derived?.edgePoolMax ?? 0;
    const insight = this._ideaInsight();

    const view = questions.map((question) => {
      const base = {
        ...question,
        open: question.pending && !question.locked,
        ask: '',
        info: '',
        sub: '',
        meta: '',
      };
      switch (question.key) {
        case 'toggle':
          return {
            ...base,
            isToggle: true,
            info: this.toggleModifier.hint,
            checked: !!data.toggleModifier,
            yesLabel: this.toggleModifier.yesLabel,
            noLabel: this.toggleModifier.noLabel,
          };
        case 'context': {
          const context = this.preRollContext;
          const chosen = this._contextChoice(data)?.key;
          const choices = context.choices.map((choice) => ({
            ...choice,
            selected: choice.key === chosen,
            // Every tile is read in the same three slots: what you are picking,
            // what it is worth, and what it does to you. A choice that supplies
            // its own name (`headline`) is one whose `label` is an effect, so
            // that label drops to the third slot.
            name: choice.headline || choice.label,
            caption: choice.headline ? choice.label : '',
            display: this._formatBonus(choice.value),
            state: choice.value > 0 ? 'positive' : choice.value < 0 ? 'negative' : 'neutral',
          }));
          return {
            ...base,
            ask: context.ask,
            info: context.hint,
            meta: context.note,
            sub: question.locked ? L('TNO.Roll.Waived') : '',
            isCompare: context.control === 'compare',
            isSelect: context.control === 'select',
            isTiles: context.control === 'tiles' || context.control === 'toggle',
            columns: context.control === 'toggle' ? 2 : context.tileColumns,
            placeholder: context.placeholder,
            anchor: context.anchor,
            compare: context.compare && { ...context.compare, value: data.compareValue },
            choices,
          };
        }
        case 'required': {
          const spec = this.requiredValue;
          return {
            ...base,
            isRequired: true,
            ask: spec.ask,
            info: spec.hint,
            sub: question.locked ? game.i18n.format('TNO.Roll.Locked', { mark: contextMark }) : '',
            value: data.requiredValue,
            min: spec.min,
            max: spec.max,
            hasMin: spec.min !== null,
            hasMax: spec.max !== null,
          };
        }
        case 'attribute':
          return {
            ...base,
            isAttribute: true,
            info: L('TNO.Roll.Info.Attribute'),
            columns: this._attributeColumns(),
            value: data.attributeA,
          };
        case 'attributeB':
          return {
            ...base,
            isAttributeB: true,
            options: Object.keys(CONFIG.TNO.abilities).map((key) => ({
              ...this._abilityCell(key),
              selected: key === data.attributeB,
            })),
          };
        case 'free':
          return { ...base, isFree: true, value: this._freeSkillValue(data), min: FREE_SKILL_MIN, max: FREE_SKILL_MAX };
        case 'ansage':
          return {
            ...base,
            isAnsage: true,
            info: this.ansage.hint,
            value: data.ansage,
            delta: this._deltaCell(this._ansageComponent(data)?.value ?? 0),
          };
        case 'bonus':
          return {
            ...base,
            isBonus: true,
            info: L('TNO.Roll.Info.Bonus'),
            display: this._formatBonus(bonus),
            signClass: this._bonusSignClass(bonus),
            resetLabel: this._bonusResetLabel(bonus),
            steps: [-BONUS_STEP, -BONUS_FINE_STEP, BONUS_FINE_STEP, BONUS_STEP].map((step) => ({
              step,
              label: this._formatBonus(step),
              aria: game.i18n.format('TNO.Roll.BonusStepLabel', { value: this._formatBonus(step) }),
              fine: Math.abs(step) === BONUS_FINE_STEP,
              disabled: step < 0 ? bonus <= BONUS_MIN : bonus >= BONUS_MAX,
              left: step < 0,
            })),
          };
        case 'idea': {
          const armed = this._ideaArmed(data);
          // "Idee haben" is a pre-edge: only offered here, before the dice are
          // cast. There is deliberately no way to apply it retroactively.
          return {
            ...base,
            isIdea: true,
            info: edgePool > 0
              ? `${L('TNO.DerivedHint.Insight')} ${L('TNO.Notify.ProblemSolvingGate')}`
              : L('TNO.Notify.NoReserve'),
            checked: armed,
            disabled: edgePool <= 0,
            insight: this._formatBonus(insight),
            ...this._ideaPips(edgePool, edgePoolMax, armed),
          };
        }
        default:
          return base;
      }
    });

    const readout = this._thresholdReadout(data);
    const options = advantageOptions().map((option) => ({ ...option, active: option.value === Number(data.advantage) }));
    return {
      ...data,
      dialogId: this.id,
      phase: this._phase(),
      questions: view,
      hasQuestions: view.length > 0,
      isFixedMode: !!this.fixedValue,
      isLockedAttribute: this.lockAttribute,
      advantageOptions: options,
      modeLabel: this._modeLabel(data.advantage),
      ...readout,
    };
  }

  /**
   * The Idee pool as pips: what is left once this roll's spend is counted.
   * @param {number} pool
   * @param {number} max
   * @param {boolean} armed
   * @returns {{pips: Array<{filled: boolean}>, chargesText: string}}
   */
  _ideaPips(pool, max, armed) {
    const left = Math.max(0, pool - (armed ? 1 : 0));
    return {
      pips: Array.from({ length: Math.max(0, max) }, (_, i) => ({ filled: i < left })),
      chargesText: game.i18n.format('TNO.Roll.IdeaCharges', { left, max }),
    };
  }

  /**
   * The roll type in words: its name and which die counts.
   * @param {number|string} advantage
   * @returns {string}
   */
  _modeLabel(advantage) {
    const value = Number(advantage) || 0;
    const option = advantageOptions().find((entry) => entry.value === value);
    return `${option?.label ?? ''} · ${describeAdvantage(value)}`;
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
    if ((this.actor.system.derived?.edgePool ?? 0) <= 0) return 0;
    return this.actor.system.derived?.insight ?? 0;
  }

  /**
   * The fixed base components — the attribute plus the skill rank (skill
   * mode), a free skill value (free mode), or a second attribute (ability
   * mode); or the fixed value alone (fixed mode) — as { label, value } pairs.
   * Shared by the threshold sum, the Beleg, and the chat card's component list
   * so all three can never disagree.
   * @param {object} data  Form data with attributeA/attributeB/skillValue.
   * @returns {Array<{label: string, value: number}>}
   */
  _baseComponents(data) {
    if (this.fixedValue) {
      return [{ label: this.fixedValue.label, value: this.fixedValue.value }];
    }
    const abilities = this.actor.system.abilities ?? {};
    const abilityLabel = (key) => (key && CONFIG.TNO.abilities[key] ? game.i18n.localize(CONFIG.TNO.abilities[key]) : '');
    const valueOf = (key) => abilities[key]?.base ?? 0;
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
   * Resolve the selected optional pre-roll context from form data. A compare
   * control derives it from the typed number; a waived context has none.
   * @param {object} data Form data with contextChoice / compareValue.
   * @returns {{key: string, label: string, value: number, componentLabel?: string}|null}
   */
  _contextChoice(data) {
    if (!this.preRollContext || this._contextWaived(data)) return null;
    const { choices, compare } = this.preRollContext;
    if (compare) {
      if (!isAuthoredNumber(data?.compareValue)) return null;
      const key = String(compare.derive(Number(data.compareValue)));
      return choices.find((choice) => choice.key === key) ?? null;
    }
    const key = String(data?.contextChoice ?? '');
    return choices.find((choice) => choice.key === key) ?? null;
  }

  /**
   * The selected context as a signed, immutable threshold component.
   * @param {object} data Form data with contextChoice.
   * @returns {{key: string, choiceLabel: string, label: string, value: number, display: string}|null}
   */
  _contextComponent(data) {
    const choice = this._contextChoice(data);
    if (!choice) return null;
    return {
      key: choice.key,
      choiceLabel: choice.label,
      label: choice.componentLabel || `${this.preRollContext.label}: ${choice.label}`,
      value: choice.value,
      display: this._formatBonus(choice.value),
    };
  }

  /**
   * What a failed roll costs, as the workflow that opened this dialog words it.
   *
   * Read off the same answers the threshold used, so the card cannot state one
   * thing and the breakdown another. Whether it is shown at all is decided
   * after the dice, in `rollTno` — this only says what the cost would be.
   * @param {object} data  Form data with contextChoice and requiredValue.
   * @returns {{label: string, text: string, note?: string, hint?: string}|null}
   */
  _consequence(data) {
    if (!this.consequence) return null;
    return this.consequence({
      contextKey: this._contextChoice(data)?.key ?? '',
      value: this._requiredValueEntry(data),
      toggleModifier: this._toggleModifierActive(data),
    }) ?? null;
  }

  /**
   * Rule modifiers supplied by the workflow that opened this dialog. They
   * remain distinct from the user's situational bonus so authored weapon
   * handling cannot be reset or overwritten in the UI.
   * @returns {Array<{label: string, value: number, display: string, origin: string}>}
   */
  _staticModifierComponents() {
    return this.fixedModifiers.map(({ origin, ...modifier }) => ({
      ...modifier,
      display: this._formatBonus(modifier.value),
    }));
  }

  /**
   * Rule modifiers the *form state* decides, rather than the workflow that
   * opened the dialog.
   *
   * The armour SV malus is one: "eine Malusstufe auf alle
   * Beweglichkeitswürfe" is a statement about the attribute, so it belongs
   * to whichever roll is currently built on Beweglichkeit and not to any one
   * workflow. `attributeB` counts too — in ability mode the two slots are
   * peers. Filling both slots with it still costs one step; the flatness lives
   * in `armorSvMalus`.
   *
   * @param {object} data  Form data with attributeA/attributeB.
   * @returns {Array<{label: string, value: number}>}
   */
  _conditionalModifiers(data) {
    const value = armorSvMalus(this.actor, [data?.attributeA, data?.attributeB].filter(Boolean));
    const armor = value ? [{ label: game.i18n.localize('TNO.Combat.ArmorSvMalus'), value }] : [];
    // The FV shortfall is the other rule the form state decides: it lands on
    // "alle Manöver" and on nothing else, so it appears the moment something is
    // declared and vanishes again when it is cleared. A positive typed Ansage
    // declares a Manöver; a negative Ansage eases the roll but does not create
    // one by itself.
    // It stays its own component next to the armour step, never folded into it —
    // three requirements, three shapes.
    const declared = this._ansageValue(data) > 0;
    const fv = this.maneuverMalus && declared ? [this.maneuverMalus] : [];
    // A state the *other* side announced, which the player confirms rather than
    // computes — today only 'Rüstung umgehen'.
    const toggled = this._toggleModifierActive(data)
      ? [{ label: this.toggleModifier.label, value: this.toggleModifier.value }]
      : [];
    return [...armor, ...fv, ...toggled];
  }

  /**
   * Immutable modifiers from the actor's own current state. Unlike conditional
   * modifiers, these do not depend on any workflow or form choice.
   *
   * Labelled with the banner's own `Damage.Malus` — the same words the sheet
   * puts on the same number one surface away.
   * @returns {Array<{label: string, value: number}>}
   */
  _actorModifiers() {
    const value = Number(this.actor.system.derived?.damage?.malus) || 0;
    return value
      ? [{ label: game.i18n.localize('TNO.Damage.Malus'), value }]
      : [];
  }

  /**
   * The same modifiers `_fixedModifierComponents` sums, each tagged with the
   * Beleg group it belongs to. Kept off the components themselves, which go to
   * the chat card and the flags as they are.
   * @param {object} data  Form data.
   * @returns {Array<{label: string, value: number, origin: string, toggled: boolean}>}
   */
  _belegModifiers(data) {
    const toggleLabel = this.toggleModifier?.label;
    return [
      ...this._actorModifiers().map((modifier) => ({ ...modifier, origin: 'character', toggled: false })),
      ...this.fixedModifiers.map((modifier) => ({ label: modifier.label, value: modifier.value, origin: modifier.origin, toggled: false })),
      ...this._conditionalModifiers(data).map((modifier) => {
        const toggled = !!toggleLabel && modifier.label === toggleLabel && modifier.value === this.toggleModifier.value;
        const origin = modifier === this.maneuverMalus ? 'weapon' : toggled ? this.toggleModifier.origin : 'character';
        return { label: modifier.label, value: modifier.value, origin, toggled };
      }),
    ];
  }

  /**
   * Every immutable modifier on this roll — actor state first, then the
   * workflow's own and the ones the form state brings in. The single list
   * behind the threshold sum, the Beleg, the chat card's components and the
   * message flags, so none of the four can disagree with the others.
   * @param {object} data  Form data.
   * @returns {Array<{label: string, value: number, display: string}>}
   */
  _fixedModifierComponents(data) {
    return [
      ...this._actorModifiers().map((modifier) => ({
        ...modifier,
        display: this._formatBonus(modifier.value),
      })),
      ...this._staticModifierComponents(),
      ...this._conditionalModifiers(data).map((modifier) => ({
        ...modifier,
        display: this._formatBonus(modifier.value),
      })),
    ];
  }

  /**
   * The number in the field. A cleared field reads as 0 — unless the value is
   * `required`, where blank is the unanswered state and reads as null.
   * @param {object} data  Form data with requiredValue.
   * @returns {number|null}  null where no value was asked for or none was typed.
   */
  _requiredValueEntry(data) {
    if (!this.requiredValue) return null;
    if (!isAuthoredNumber(data?.requiredValue)) return this.requiredValue.required ? null : 0;
    const raw = Number(data.requiredValue);
    const { min, max } = this.requiredValue;
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, raw));
  }

  /**
   * That number as a signed, immutable threshold component.
   *
   * Deliberately outside the `BONUS_MIN`/`BONUS_MAX` clamp: that clamp bounds
   * what a GM hands out as a situational modifier, while this is a value the
   * attacker announced and the table has already agreed on.
   * @param {object} data  Form data with requiredValue.
   * @returns {{label: string, value: number, display: string}|null}
   */
  _requiredValueComponent(data) {
    const entry = this._requiredValueEntry(data);
    if (entry === null) return null;
    // Guarded against -0, which formats as "−0" the moment an announced zero
    // reaches a signed read-out.
    const value = entry === 0 ? 0 : this.requiredValue.sign * entry;
    // Named the same way the field that took it was named, so a breakdown says
    // which of the attacker's two damage values this roll was resisting.
    const label = this.requiredValue.labels
      ? this._requiredValueLabel(data)
      : this.requiredValue.componentLabel;
    return { label, value, display: this._formatBonus(value) };
  }

  /**
   * The Ansage as typed: a signed whole number, or 0 for a roll that declares
   * nothing. Positive worsens this roll; negative eases it — the other half of
   * "erschwert einen deiner Würfe um einen anderen zu erleichtern".
   *
   * Nothing converts it: the declaration is agreed at the table before the
   * number is typed, so this figure is already the answer.
   * @param {object} data  Form data with ansage.
   * @returns {number}
   */
  _ansageValue(data) {
    if (!this.ansage) return 0;
    return Math.trunc(Number(data?.ansage) || 0);
  }

  /**
   * The declared Ansage as a signed threshold component, outside the `±30`
   * clamp like the announced Schadenswert.
   * @param {object} data  Form data with ansage.
   * @returns {{label: string, value: number, display: string}|null}
   */
  _ansageComponent(data) {
    const declared = this._ansageValue(data);
    if (!declared) return null;
    return {
      label: this.ansage.label,
      value: -declared,
      display: this._formatBonus(-declared),
    };
  }

  /**
   * Whether the roll has everything it needs: no question still pending.
   * @param {object} data  Form data.
   * @returns {boolean}
   */
  _canSubmit(data) {
    return !this._questions(data).some((question) => question.pending);
  }

  /**
   * Sum the fixed base with the bonus/malus and, if toggled, the "Idee haben"
   * bonus. Answers still missing count as nothing.
   * @param {object} data  Form data.
   * @returns {number}
   */
  _computeThreshold(data) {
    const base = this._baseComponents(data).reduce((sum, c) => sum + c.value, 0);
    const fixedModifiers = this._fixedModifierComponents(data).reduce((sum, modifier) => sum + modifier.value, 0);
    const context = this._contextComponent(data)?.value ?? 0;
    const required = this._requiredValueComponent(data)?.value ?? 0;
    const ansage = this._ansageComponent(data)?.value ?? 0;
    return base + fixedModifiers + context + required + ansage
      + (Number(data.bonus) || 0) + this._ideaBonus(data);
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
    if (n > 0) return 'is-positive';
    if (n < 0) return 'is-negative';
    return '';
  }

  /**
   * The signed parts that produce the threshold, in display order, for the
   * chat card and the message flags.
   * @param {object} data  Form data.
   * @returns {Array<{label: string, display: string, value: number}>}
   */
  _breakdownParts(data) {
    const parts = this._baseComponents(data).map((component) => ({
      ...component,
      display: String(component.value),
    }));
    parts.push(...this._fixedModifierComponents(data));
    const context = this._contextComponent(data);
    if (context) parts.push(context);
    const required = this._requiredValueComponent(data);
    if (required) parts.push(required);
    const ansage = this._ansageComponent(data);
    if (ansage) parts.push(ansage);
    const bonus = Number(data.bonus) || 0;
    if (bonus !== 0) {
      parts.push({
        label: game.i18n.localize('TNO.Roll.Bonus'),
        value: bonus,
        display: this._formatBonus(bonus),
      });
    }
    const idea = this._ideaBonus(data);
    if (idea !== 0) {
      parts.push({
        label: game.i18n.localize('TNO.Roll.IdeaComponent'),
        value: idea,
        display: this._formatBonus(idea),
      });
    }
    return parts;
  }

  /**
   * Text form, for the chat card and the message flags.
   * @param {object} data  Form data.
   * @returns {string}
   */
  _breakdownText(data) {
    return this._breakdownParts(data).map((part) => `${part.label} ${part.display}`).join(' + ');
  }

  /**
   * The Beleg: every line that moves the Schwelle, grouped by where it comes
   * from, each in the state the questions above leave it in. Built from the
   * same component helpers as `_computeThreshold`, so the counted rows always
   * sum to the threshold.
   * @param {object} data  Form data.
   * @returns {Array<{key: string, label: string, short: string, icon: string, sum: number, pending: boolean, sumDisplay: string, rows: Array<object>}>}
   */
  _belegGroups(data) {
    const L = (key) => game.i18n.localize(key);
    const questions = Object.fromEntries(this._questions(data).map((question) => [question.key, question]));
    const rows = [];
    const row = (origin, label, value, state = 'fact', { mark = '', note = '' } = {}) => {
      rows.push({ origin, label, value, state, mark, note });
    };

    // What the character brings.
    const base = this._baseComponents(data);
    if (this.fixedValue) {
      row('character', base[0].label, base[0].value);
    } else {
      const attribute = questions.attribute;
      let rest = base;
      if (data.attributeA && CONFIG.TNO.abilities[data.attributeA]) {
        row('character', base[0].label, base[0].value, attribute ? 'active' : 'fact', {
          mark: attribute?.mark ?? '',
          note: L('TNO.Roll.Note.Attribute'),
        });
        rest = base.slice(1);
      } else if (attribute) {
        row('character', attribute.title, null, 'pending', { mark: attribute.mark });
      }
      for (const component of rest) {
        const chosen = this.freeSkill ? questions.free : !this.skill ? questions.attributeB : null;
        row('character', component.label, component.value, chosen ? 'active' : 'fact', {
          mark: chosen?.mark ?? '',
          note: this.skill ? L('TNO.Roll.Note.Skill') : '',
        });
      }
    }
    for (const modifier of this._belegModifiers(data)) {
      row(modifier.origin, modifier.label, modifier.value, modifier.toggled ? 'active' : 'fact', {
        mark: modifier.toggled ? questions.toggle?.mark ?? '' : '',
      });
    }

    // The answers to the questions.
    if (this.preRollContext) {
      const question = questions.context;
      const component = this._contextComponent(data);
      if (question.locked) row(this.preRollContext.origin, question.title, null, 'struck', { mark: question.mark, note: L('TNO.Roll.Waived') });
      else if (!component) row(this.preRollContext.origin, question.title, null, 'pending', { mark: question.mark });
      else row(this.preRollContext.origin, component.label, component.value, 'active', { mark: question.mark });
    }
    if (this.requiredValue) {
      const question = questions.required;
      const component = this._requiredValueComponent(data);
      if (!component) row(this.requiredValue.origin, question.title, null, 'pending', { mark: question.mark });
      else row(this.requiredValue.origin, component.label, component.value, 'active', { mark: question.mark });
    }
    if (!this.fixedValue) {
      row('situation', L('TNO.Roll.Bonus'), Number(data.bonus) || 0, 'active', { mark: questions.bonus.mark });
    }
    if (this.ansage) {
      row('choice', this.ansage.label, this._ansageComponent(data)?.value ?? 0, 'active', { mark: questions.ansage.mark });
    }
    if (questions.idea) {
      row('choice', L('TNO.Roll.IdeaComponent'), this._ideaInsight(), this._ideaArmed(data) ? 'active' : 'provisional', {
        mark: questions.idea.mark,
      });
    }

    const counts = (entry) => entry.state === 'fact' || entry.state === 'active';
    return ORIGINS
      .map((origin) => {
        const members = rows.filter((entry) => entry.origin === origin.key);
        if (!members.length) return null;
        const sum = members.reduce((total, entry) => total + (counts(entry) ? Number(entry.value) || 0 : 0), 0);
        const pending = members.some((entry) => entry.state === 'pending');
        const short = L(`TNO.Roll.Origin.${origin.label}`);
        const source = origin.key === 'weapon' ? this.sources.weapon : origin.key === 'armor' ? this.sources.armor : '';
        return {
          key: origin.key,
          icon: origin.icon,
          short,
          label: source ? game.i18n.format('TNO.Roll.Origin.Named', { origin: short, name: source }) : short,
          sum,
          pending,
          sumDisplay: `${this._formatBonus(sum)}${pending ? ' + ?' : ''}`,
          rows: members.map((entry) => ({
            ...entry,
            ...this._deltaCell(entry.value, {
              pending: entry.state === 'pending',
              provisional: entry.state === 'provisional',
              struck: entry.state === 'struck',
            }),
          })),
        };
      })
      .filter(Boolean);
  }

  /**
   * The odds readout for the roll as currently built: the chance itself, the
   * meter's fill width, and the hover breakdown.
   * @param {object} data  Form data.
   * @returns {{oddsLabel: string, oddsPercent: number, oddsTooltip: string}}
   */
  _oddsData(data) {
    const threshold = this._computeThreshold(data);
    const advantage = Number(data.advantage) || 0;
    const { success } = successChanceFor(threshold, advantage);
    return {
      oddsLabel: formatChance(success),
      // Rounded, since it only drives a bar's width.
      oddsPercent: Math.round(success * 100),
      oddsTooltip: oddsTooltipHtml(threshold, advantage),
    };
  }

  /**
   * The questions still open, each as its mark and title.
   * @param {object} data
   * @returns {Array<string>}
   */
  _missingLabels(data) {
    return this._questions(data)
      .filter((question) => question.pending)
      .map((question) => `${question.mark} ${question.title}`);
  }

  /**
   * The complete footer truth. While anything is open the Schwelle and the odds
   * are still shown, but in parentheses: a figure that will move once the open
   * answers are in, never one to roll against.
   * @param {object} data
   * @returns {{ready: boolean, threshold: number, thresholdDisplay: string, oddsLabel: string, oddsPercent: number, oddsTooltip: string, missingLabel: string, missingLabels: Array<string>, todo: string}}
   */
  _thresholdReadout(data) {
    const ready = this._canSubmit(data);
    const threshold = this._computeThreshold(data);
    const odds = this._oddsData(data);
    const missingLabels = ready ? [] : this._missingLabels(data);
    const value = threshold < 0 ? `−${Math.abs(threshold)}` : String(threshold);
    return {
      ready,
      threshold,
      thresholdDisplay: ready ? `≤ ${value}` : `(≤ ${value})`,
      oddsLabel: ready ? odds.oddsLabel : `(${odds.oddsLabel})`,
      oddsPercent: odds.oddsPercent,
      oddsTooltip: ready ? odds.oddsTooltip : '',
      missingLabel: missingLabels[0] ?? '',
      missingLabels,
      todo: ready
        ? game.i18n.localize('TNO.Roll.AllAnswered')
        : game.i18n.format('TNO.Roll.Open', { list: missingLabels.join(' · ') }),
    };
  }

  /**
   * Rebuild the Beleg drawer and the group chips on the toggle that opens it.
   * Built in script rather than template because it is repainted on every
   * change; text only ever goes in through `textContent`.
   * @param {HTMLFormElement} form
   * @param {Array<object>} groups
   */
  _paintBeleg(form, groups) {
    const node = (tag, cls, text) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const list = form.querySelector('[data-role="beleg-groups"]');
    if (list) {
      list.replaceChildren(...groups.map((group) => {
        const wrap = node('div', 'tno-beleg-group');
        const head = node('div', 'tno-beleg-group-head');
        const icon = node('i', `fa-solid ${group.icon}`);
        icon.setAttribute('aria-hidden', 'true');
        head.append(icon, node('strong', '', group.label), node('span', `tno-beleg-group-sum${group.pending ? ' is-pending' : ''}`, `(${group.sumDisplay})`));
        wrap.append(head);
        for (const entry of group.rows) {
          const line = node('div', `tno-beleg-row is-${entry.state}`);
          const label = node('span', 'tno-beleg-label', entry.mark ? `${entry.mark} ${entry.label}` : entry.label);
          if (entry.note) label.append(' ', node('small', '', entry.note));
          line.append(label, node('span', `tno-beleg-delta ${entry.cls}`, entry.display));
          wrap.append(line);
        }
        return wrap;
      }));
    }
    const chips = form.querySelector('[data-role="beleg-chips"]');
    if (chips) {
      chips.replaceChildren(...groups.map((group) => {
        const chip = node('span', `tno-beleg-chip${group.pending ? ' is-pending' : ''}`, `${group.short} `);
        chip.append(node('b', '', group.sumDisplay));
        return chip;
      }));
    }
  }

  /**
   * Recompute and repaint everything downstream of a change: which questions
   * are open or locked, the values inside them, the Beleg, the Schwelle, the
   * odds, the open-questions line and the button.
   * @param {HTMLFormElement} form
   */
  _refresh(form) {
    if (!form) return;
    const data = new FormDataExtended(form).object;
    const questions = this._questions(data);
    const contextMark = questions.find((question) => question.key === 'context')?.mark ?? '';

    for (const question of questions) {
      const el = form.querySelector(`.tno-q[data-q="${question.key}"]`);
      if (!el) continue;
      el.classList.toggle('is-open', question.pending && !question.locked);
      el.classList.toggle('is-locked', question.locked);
      if (!question.pending) el.classList.remove('is-rejected');
      const title = el.querySelector('[data-role="q-title"]');
      if (title) title.textContent = `${question.num} · ${question.title}`;
    }

    // The bypass question: yes/no buttons over a checkbox the form reads.
    const toggle = form.querySelector('input[name="toggleModifier"]');
    for (const button of form.querySelectorAll('.tno-q-bool')) {
      button.setAttribute('aria-pressed', String((button.dataset.value === '1') === !!toggle?.checked));
    }

    // The context: a waived comparison is closed, and a typed one marks the
    // verdict it derives.
    const contextQ = questions.find((question) => question.key === 'context');
    if (contextQ) {
      const el = form.querySelector('.tno-q[data-q="context"]');
      const chosen = this._contextChoice(data)?.key;
      for (const verdict of el?.querySelectorAll('.tno-verdict') ?? []) {
        verdict.classList.toggle('is-selected', verdict.dataset.key === chosen);
      }
      const compare = el?.querySelector('input[name="compareValue"]');
      if (compare) compare.disabled = contextQ.locked;
      const sub = el?.querySelector('[data-role="q-sub"]');
      if (sub) sub.textContent = contextQ.locked ? game.i18n.localize('TNO.Roll.Waived') : '';
    }

    // The required number: closed until its context is answered.
    const requiredQ = questions.find((question) => question.key === 'required');
    if (requiredQ) {
      const el = form.querySelector('.tno-q[data-q="required"]');
      const input = el?.querySelector('input[name="requiredValue"]');
      if (input) input.disabled = requiredQ.locked;
      const sub = el?.querySelector('[data-role="q-sub"]');
      if (sub) sub.textContent = requiredQ.locked ? game.i18n.format('TNO.Roll.Locked', { mark: contextMark }) : '';
      const ask = el?.querySelector('[data-role="q-ask"]');
      if (ask) ask.hidden = requiredQ.locked;
    }

    // The roll's own Ansage.
    const paintDelta = (role, cell) => {
      const el = form.querySelector(`[data-role="${role}"]`);
      if (!el) return;
      el.textContent = cell.display;
      el.className = `tno-ansage-delta ${cell.cls}`;
    };
    if (this.ansage) paintDelta('ansage-delta', this._deltaCell(this._ansageComponent(data)?.value ?? 0));

    // The Idee: pressed state and what is left of the pool.
    const idea = form.querySelector('.tno-q-idea-toggle');
    if (idea) {
      const armed = this._ideaArmed(data);
      idea.setAttribute('aria-pressed', String(armed));
      const { pips, chargesText } = this._ideaPips(this.actor.system.derived?.edgePool ?? 0, this.actor.system.derived?.edgePoolMax ?? 0, armed);
      form.querySelectorAll('.tno-idea-pip').forEach((pip, i) => pip.classList.toggle('filled', !!pips[i]?.filled));
      const text = form.querySelector('[data-role="idea-charges"]');
      if (text) text.textContent = chargesText;
    }

    // A stepper that can be clicked past its own bound would write a value the
    // field's own `min` rejects, so the caps are shown rather than enforced
    // silently. Each reads its bounds off its own input.
    for (const group of form.querySelectorAll('.tno-stepper')) {
      const stepped = group.querySelector('input[type="number"]');
      if (!stepped) continue;
      const current = stepped.value === '' ? null : Number(stepped.value);
      for (const button of group.querySelectorAll('.tno-step')) {
        const step = Number(button.dataset.step);
        const bound = TnoRollDialog._inputBound(step > 0 ? stepped.max : stepped.min);
        button.disabled = stepped.disabled || (current !== null && bound !== null
          && (step > 0 ? current >= bound : current <= bound));
      }
    }

    this._paintBeleg(form, this._belegGroups(data));

    const readout = this._thresholdReadout(data);
    const set = (role, text) => {
      const el = form.querySelector(`[data-role="${role}"]`);
      if (el) el.textContent = text;
    };
    set('threshold', readout.thresholdDisplay);
    set('odds', readout.oddsLabel);
    set('mode-label', this._modeLabel(data.advantage));
    set('todo', readout.todo);
    const result = form.querySelector('.tno-wurf-result');
    result?.classList.toggle('is-pending', !readout.ready);
    const odds = form.querySelector('[data-role="odds"]');
    if (odds) {
      if (readout.ready) {
        odds.tabIndex = 0;
        odds.dataset.tooltipHtml = readout.oddsTooltip;
      } else {
        odds.removeAttribute('tabindex');
        odds.removeAttribute('data-tooltip-html');
      }
    }
    const fill = form.querySelector('.tno-odds-fill');
    if (fill) fill.style.width = `${Math.max(readout.oddsPercent, 1)}%`;
    form.querySelector('[data-role="todo"]')?.classList.toggle('is-open', !readout.ready);

    // Not `disabled`: a disabled button swallows its own click, so the refusal
    // naming the missing answer would be a dead end. It stays clickable and
    // refuses out loud — see {@link _rejectSubmit}.
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.classList.toggle('is-blocked', !readout.ready);
      if (readout.ready) {
        submit.removeAttribute('aria-disabled');
        set('submit-echo', '');
      } else {
        submit.setAttribute('aria-disabled', 'true');
      }
    }
  }

  /**
   * Set the bonus/malus to a clamped value and sync its display, sign colour,
   * cap-disabled buttons, and the readout.
   * @param {HTMLFormElement} form
   * @param {number} next  The desired (pre-clamp) bonus value.
   */
  _setBonus(form, next) {
    const value = Math.clamp(next, BONUS_MIN, BONUS_MAX);
    form.querySelector('input[name="bonus"]').value = value;
    const display = form.querySelector('.tno-bonus-value');
    display.textContent = this._formatBonus(value);
    display.setAttribute('aria-label', this._bonusResetLabel(value));
    display.classList.toggle('is-positive', value > 0);
    display.classList.toggle('is-negative', value < 0);
    for (const button of form.querySelectorAll('.tno-bonus-step')) {
      button.disabled = Number(button.dataset.delta) < 0 ? value <= BONUS_MIN : value >= BONUS_MAX;
    }
    this._refresh(form);
  }

  /**
   * Refuse a roll that still has an open question, and say so at the question
   * rather than only at the button. Red is honest here: it answers an action
   * instead of describing an opening state, and it is momentary.
   * @param {HTMLFormElement} form
   */
  _rejectSubmit(form) {
    const data = new FormDataExtended(form).object;
    const open = this._questions(data).find((question) => question.pending);
    if (!open) return;
    const echo = form.querySelector('[data-role="submit-echo"]');
    if (echo) echo.textContent = game.i18n.format('TNO.Roll.Blocked.Missing', { label: `${open.mark} ${open.title}` });
    // A locked question cannot be answered yet; the one that unlocks it can.
    const target = open.locked
      ? form.querySelector('.tno-q.is-open') ?? form.querySelector(`.tno-q[data-q="${open.key}"]`)
      : form.querySelector(`.tno-q[data-q="${open.key}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    target.classList.remove('is-rejected');
    void target.offsetWidth; // reflow, so a second refused click replays the flash
    target.classList.add('is-rejected');
    target.addEventListener('animationend', () => target.classList.remove('is-rejected'), { once: true });
    target.querySelector('input:not([type="hidden"]):not(:disabled), button:not(:disabled), select')?.focus();
  }

  /**
   * @override
   * The gate is here rather than on the button's `disabled` attribute so that
   * both ways of committing — the click and the implicit Enter — land on the
   * same refusal. The form is `novalidate` for the same reason.
   */
  async _onSubmit(event, options = {}) {
    const form = this.form ?? event?.currentTarget;
    if (form && !this._canSubmit(new FormDataExtended(form).object)) {
      event?.preventDefault();
      this._rejectSubmit(form);
      return null;
    }
    return super._onSubmit(event, options);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];
    const form = root.closest('form') ?? root.querySelector('form');
    if (!form) return;
    const refresh = () => this._refresh(form);

    html.on('change', 'select[name="attributeB"], select[name="contextChoice"], input[name="contextChoice"]', refresh);
    html.on('change input', 'input[name="skillValue"], input[name="requiredValue"], input[name="ansage"], input[name="compareValue"]', refresh);

    // Yes/no: two buttons over the checkbox the form reads.
    html.on('click', '.tno-q-bool', (ev) => {
      ev.preventDefault();
      const checkbox = form.querySelector('input[name="toggleModifier"]');
      if (checkbox) checkbox.checked = ev.currentTarget.dataset.value === '1';
      refresh();
    });

    // The Idee: one pressed button over the checkbox the form reads.
    html.on('click', '.tno-q-idea-toggle', (ev) => {
      ev.preventDefault();
      if (ev.currentTarget.disabled) return;
      const checkbox = form.querySelector('input[name="useIdea"]');
      if (checkbox) checkbox.checked = !checkbox.checked;
      refresh();
    });

    // Every selectable first attribute uses the same radiogroup behaviour as
    // the roll-type picker. Locked combat attributes are not asked at all.
    bindRadioGroup({
      group: form.querySelector('.tno-attribute-grid'),
      input: form.querySelector('input[name="attributeA"]'),
      onSelect: refresh,
    });

    // The situational modification: ±3 in Malusstufen, ±1 to fine-tune.
    html.on('click', '.tno-bonus-step', (ev) => {
      ev.preventDefault();
      if (ev.currentTarget.disabled) return;
      const current = Number(form.querySelector('input[name="bonus"]').value) || 0;
      this._setBonus(form, current + Number(ev.currentTarget.dataset.delta));
    });
    // The value doubles as a control: click resets it to zero, arrow keys step it.
    html.on('click', '.tno-bonus-value', (ev) => {
      ev.preventDefault();
      this._setBonus(form, 0);
    });
    html.on('keydown', '.tno-bonus-value', (ev) => {
      const current = Number(form.querySelector('input[name="bonus"]').value) || 0;
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        this._setBonus(form, current + BONUS_STEP);
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        this._setBonus(form, current - BONUS_STEP);
      }
    });

    // Every stepped field shares one gesture: ±1 around its own input, bounded
    // by that input's own min/max.
    html.on('click', '.tno-step', (ev) => {
      ev.preventDefault();
      if (ev.currentTarget.disabled) return;
      this._stepValue(form, ev.currentTarget.closest('.tno-stepper')?.querySelector('input[type="number"]'), Number(ev.currentTarget.dataset.step));
    });

    // The roll type moves the odds, not the Schwelle.
    bindRadioGroup({
      group: form.querySelector('.tno-advantage-group'),
      input: form.querySelector('input[name="advantage"]'),
      onSelect: refresh,
    });

    // The Beleg drawer: opens on the toggle, closes once a click or the focus
    // lands anywhere outside it.
    const beleg = form.querySelector('.tno-beleg');
    const setBeleg = (open) => {
      if (!beleg || beleg.classList.contains('is-open') === open) return;
      beleg.classList.toggle('is-open', open);
      beleg.querySelector('.tno-beleg-toggle')?.setAttribute('aria-expanded', String(open));
      const label = beleg.querySelector('[data-role="beleg-toggle-label"]');
      if (label) label.textContent = game.i18n.localize(open ? 'TNO.Roll.Beleg.Close' : 'TNO.Roll.Beleg.Open');
    };
    html.on('click', '.tno-beleg-toggle', (ev) => {
      ev.preventDefault();
      setBeleg(!beleg?.classList.contains('is-open'));
    });
    html.on('focusout', '.tno-beleg', (ev) => {
      if (ev.relatedTarget && !beleg?.contains(ev.relatedTarget)) setBeleg(false);
    });
    this._unbindBelegOutside();
    this._onBelegOutside = (ev) => {
      if (!beleg?.contains(ev.target)) setBeleg(false);
    };
    document.addEventListener('pointerdown', this._onBelegOutside, true);

    refresh();

    // Focus the first question still waiting for an answer, else the button.
    const open = form.querySelector('.tno-q.is-open');
    const target = open?.querySelector('input:not([type="hidden"]):not(:disabled), button:not(:disabled), select')
      ?? form.querySelector('button[type="submit"]');
    target?.focus();
  }

  /** Drop the document listener that closes the Beleg on an outside click. */
  _unbindBelegOutside() {
    if (this._onBelegOutside) document.removeEventListener('pointerdown', this._onBelegOutside, true);
    this._onBelegOutside = null;
  }

  /** @override */
  async close(options) {
    this._unbindBelegOutside();
    return super.close(options);
  }

  /** @override */
  async _updateObject(event, formData) {
    if (this.lockAttribute) formData.attributeA = this.object.attributeA;
    if (!this._canSubmit(formData)) {
      ui.notifications.warn(game.i18n.localize('TNO.Roll.ContextRequired'));
      return;
    }
    const context = this._contextComponent(formData);
    const required = this._requiredValueComponent(formData);
    const consequence = this._consequence(formData);
    const ansageComponent = this._ansageComponent(formData);
    const components = [
      ...this._baseComponents(formData),
      ...this._fixedModifierComponents(formData),
      ...(context ? [context] : []),
      ...(required ? [required] : []),
      ...(ansageComponent ? [ansageComponent] : []),
    ];

    // "Insight" (pre-edge): compute the threshold and bonus off the
    // actor's state *before* spending the point — spending updates
    // system.derived.edgePool, and re-deriving after that point would
    // make the just-spent point look unavailable again. There is no
    // post-roll path to apply this; if the edge pool ran out before this
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
    if (this.skill && formData.attributeA && !this.lockAttribute) {
      await this.actor.update({ [`system.skills.${this.skill.key}.lastAttribute`]: formData.attributeA });
    }

    await rollTno({
      threshold,
      advantage: Number(formData.advantage),
      flavor: this.flavor,
      img: this.img,
      actor: this.actor,
      components,
      bonus: Number(formData.bonus) || 0,
      // The "Problem lösen" edge pool may only be spent on a regular
      // skill+attribute check — not on a bare attribute roll, a free-typed
      // skill value, or a fixed-value roll (see problem-solving-prd.md).
      // Skill/attribute identity is only meaningful (and only stored) in
      // that same skill mode — it's what the post-failure XP claim credits.
      extraFlags: {
        edgeExempt: !this.skill,
        ...(context
          ? {
              preRollContext: {
                key: context.key,
                label: context.choiceLabel,
                value: context.value,
              },
            }
          : {}),
        // Signed the way it entered the threshold, so the flag and the
        // component list say the same thing about the same number.
        ...(required ? { requiredValue: { label: required.label, value: required.value } } : {}),
        // What a failure would cost, handed over unconditionally: only the dice
        // decide whether it happened, and they have not been rolled yet.
        ...(consequence ? { consequence } : {}),
        // The A→B channel, as numbers the defender can act on without ever
        // reading this sheet.
        ...(this.envelope
          ? {
              envelope: {
                ...this.envelope,
                ...ansageEnvelope(this._ansageValue(formData)),
              },
            }
          : {}),
        ...(this.skill
          ? {
              skillKey: this.skill.key,
              skillLabel: this.skill.label,
              attributeKey: formData.attributeA,
              attributeLabel: game.i18n.localize(CONFIG.TNO.abilities[formData.attributeA]),
            }
          : {}),
      },
    });

    // Only now, with the dice cast: a defence that was dialled up and cancelled
    // has not been made and must not count against the next one.
    if (this.afterRoll) await this.afterRoll();
  }
}

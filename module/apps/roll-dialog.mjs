import { TNO_ADVANTAGE, describeAdvantage, rollTno } from '../helpers/dice.mjs';
import { formatChance, oddsTooltipHtml, successChanceFor } from '../helpers/dice-odds.mjs';
import { colorForValue } from '../helpers/heatmap.mjs';
import { MALUS_STEP, armorSvMalus, isAuthoredNumber } from '../helpers/items.mjs';
import { DEFAULT_ZONE, ansageEnvelope } from '../helpers/maneuvers.mjs';
import { advantageOptions, bindRadioGroup, renderSignedChips } from './roll-dialog-shared.mjs';

// Namespaced rather than the bare `FormApplication` global, which is
// deprecated. Still ApplicationV1 — see the V1 apps note in
// docs/wiki/reference/module-map.md.
const { FormApplication } = foundry.appv1.api;

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
   * @param {boolean} [options.lockAttribute]  Keep `attributeA` fixed rather
   *   than offering the normal skill-roll attribute picker.
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
   * @param {{label: string, value: number, hint?: string}[]} [options.fixedModifiers]
   *   Immutable rule modifiers added to the threshold and shown separately
   *   from the editable situational bonus.
   * @param {{label: string, placeholder: string, control?: 'select'|'tiles'|'toggle', tileLabels?: boolean, tileColumns?: 1|2|3|5|7, anchor?: {label: string, value: number|string}, choices: Array<{key: string, label: string, value: number, componentLabel?: string}>}} [options.preRollContext]
   *   One optional required choice that must be made before rolling. Its
   *   selected value becomes an immutable threshold component.
   * @param {{label: string, placeholder?: string, componentLabel?: string, sign?: 1|-1, min?: number, max?: number}} [options.requiredValue]
   *   One mandatory number the player types before rolling — a value only the
   *   table knows, such as the Schadenswert an attacker announced. Orthogonal
   *   to `preRollContext`, which is structurally "pick one of an authored list".
   * @param {string} [options.flavor]      Label shown as the roll's subject heading and chat flavor.
   * @param {{label: string, hint?: string}} [options.ansage]
   *   Offer the Ansage field: one optional, free magnitude that worsens this roll
   *   by what it declares. Deliberately unpriced and ungated — the player and the
   *   GM agree the number out loud, and which Manöver it stands for is table talk
   *   the form has no business re-deriving.
   * @param {{label: string, choices: Array<{key: string, label: string, caption?: string}>}} [options.zonePicker]
   *   The Stelle this attack names. A pick rather than part of the Ansage number
   *   because it is a location, not an amount: it decides the multiplier of a
   *   failed resistance roll. Costs the threshold nothing on its own.
   * @param {{from: string, penetration: number|null, sharp: number|null, blunt: number|null}} [options.envelope]
   *   The attacker's half of an exchange: who is attacking and what their weapon
   *   brings, to which the declared Ansage and the Stelle are added. Rendered on
   *   the chat card as plain text — there is no targeting and no second document
   *   — so the defender reads it and enters what applies.
   * @param {{label: string, value: number, hint?: string}} [options.maneuverMalus]
   *   A modifier that applies only while an Ansage is declared — the weapon's FV
   *   shortfall, which lands on "alle Manöver" and never on a Standardangriff.
   * @param {boolean|number} [options.opposingAnsage]
   *   Offer a field for the Ansage the attacker announced against this roll. One
   *   optional integer, taken as given: from this side a Finte and a Starker
   *   Schwung are the same statement. Pass a number to start it filled in — but
   *   the field is offered either way, so a defender who never touched a chat
   *   card can always type what they were told.
   * @param {{label: string, hint?: string, value: number}} [options.toggleModifier]
   *   A modifier this player confirms rather than computes — today only
   *   'Rüstung umgehen' cancelling the padding of the Stelle being resisted at.
   *   Never pre-set from anything the other side sent: an attack card carries an
   *   amount, not a reason.
   * @param {(answers: {contextKey: string, value: number|null}) => {label: string, text: string, note?: string, hint?: string}|null} [options.consequence]
   *   What this roll costs the roller if it fails, phrased by the workflow that
   *   opened the dialog — the resistance roll's applied damage is the first.
   *   Called with the answers that decide it, and rendered on the chat card only
   *   once the dice have actually failed. It states; nothing here applies it.
   * @param {() => Promise<void>} [options.afterRoll]
   *   Run once the dice have actually been cast, never when the dialog is
   *   cancelled. For state a workflow owes its own sheet — the repeated-defence
   *   counter is the first — which must count rolls and not intentions.
   */
  constructor(actor, { attributeA = '', lockAttribute = false, skill = null, freeSkill = false, fixedValue = null, fixedModifiers = [], preRollContext = null, requiredValue = null, ansage = null, zonePicker = null, maneuverMalus = null, envelope = null, opposingAnsage = false, toggleModifier = null, consequence = null, afterRoll = null, flavor = '', width = null } = {}) {
    // `requiredValue` starts empty rather than at 0: an untouched field and a
    // typed zero are different answers, and only one of them may roll.
    // The default width fits every roll that is a column of questions. A
    // workflow whose section is laid out as a table says so here rather than
    // being squeezed into a width picked for a different shape.
    super(
      { attributeA, attributeB: '', skillValue: 0, bonus: 0, advantage: TNO_ADVANTAGE.none, useIdea: false, contextChoice: '', requiredValue: '', ansage: '', zoneChoice: DEFAULT_ZONE, opposingAnsage: '', toggleModifier: false },
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
      }));
    this.preRollContext = this._normalizePreRollContext(preRollContext);
    this.requiredValue = this._normalizeRequiredValue(requiredValue);
    this.ansage = ansage?.label ? { label: String(ansage.label), hint: String(ansage.hint ?? '') } : null;
    this.zonePicker = this._normalizeZonePicker(zonePicker);
    this.maneuverMalus = maneuverMalus?.label && Number.isFinite(Number(maneuverMalus.value))
      ? {
          label: String(maneuverMalus.label),
          value: Number(maneuverMalus.value),
          ...(maneuverMalus.hint ? { hint: String(maneuverMalus.hint) } : {}),
        }
      : null;
    this.envelope = envelope?.from ? envelope : null;
    // `true` offers an empty field; a number offers it pre-filled. Both are only
    // ever a head start — nothing about a defence depends on it.
    //
    // Typed, not coerced: `Number(false)` is 0 and 0 is finite, so testing the
    // default through `Number()` put the field on every roll in the system,
    // attacks and plain skill checks included. `Number(true)` is 1, which would
    // then have pre-filled it with a 1 nobody announced.
    const announced = typeof opposingAnsage === 'number' && Number.isFinite(opposingAnsage)
      ? Math.trunc(opposingAnsage)
      : null;
    this.opposingAnsage = opposingAnsage === true || announced !== null;
    if (announced > 0) this.object.opposingAnsage = announced;
    this.toggleModifier = toggleModifier?.label && Number.isFinite(Number(toggleModifier.value))
      ? { label: String(toggleModifier.label), hint: String(toggleModifier.hint ?? ''), value: Number(toggleModifier.value) }
      : null;
    if (this.toggleModifier && toggleModifier.checked === true) this.object.toggleModifier = true;
    this.consequence = typeof consequence === 'function' ? consequence : null;
    this.afterRoll = typeof afterRoll === 'function' ? afterRoll : null;
    this.flavor = flavor || game.i18n.localize('TNO.Roll.DialogTitle');
  }

  /**
   * Keep the optional context interface safe for all existing roll callers:
   * malformed or empty contexts simply behave as though no context was given.
   * @param {*} context
   * @returns {{label: string, placeholder: string, control: 'select'|'tiles'|'toggle', tileLabels: boolean, tileColumns: 1|2|3|5|7, anchor: ?{label: string, value: string}, choices: Array<{key: string, label: string, value: number, componentLabel?: string}>}|null}
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
        // What the tile leads with, where the modifier is not the useful thing
        // to compare. Must be carried through this whitelist explicitly: a
        // dropped headline falls back to the signed number, and a tile showing
        // "±0" under the question "how high was the penetration?" reads as an
        // answer to that question rather than as a modifier.
        ...(choice.headline ? { headline: String(choice.headline) } : {}),
      }));
    if (!choices.length) return null;
    const control = context.control === 'toggle'
      ? choices.length === 2 ? 'toggle' : 'tiles'
      : context.control === 'tiles' ? 'tiles' : 'select';
    return {
      label: String(context.label),
      placeholder: String(context.placeholder || game.i18n.localize('TNO.Roll.ContextPlaceholder')),
      control,
      tileLabels: context.tileLabels === true,
      tileColumns: [1, 2, 3, 5, 7].includes(Number(context.tileColumns)) ? Number(context.tileColumns) : 7,
      // The reader's own half of a comparison: a number their sheet already
      // knows, shown beside the choices rather than folded into the question.
      // It is a readout and never a choice, which is the whole reason it is a
      // separate field instead of a fourth tile.
      anchor: context.anchor?.label && context.anchor?.value !== undefined
        ? { label: String(context.anchor.label), value: String(context.anchor.value) }
        : null,
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
   * @returns {{label: string, placeholder: string, componentLabel: string, sign: 1|-1, min: number|null, max: number|null}|null}
   */
  _normalizeRequiredValue(spec) {
    if (!spec?.label) return null;
    return {
      label: String(spec.label),
      placeholder: spec.placeholder ? String(spec.placeholder) : '',
      componentLabel: String(spec.componentLabel || spec.label),
      // Where the number is to be read off, stated under the field. A player
      // asked for a figure they cannot compute needs to be told where it is,
      // and "on the attacker's card" is not something the form can imply.
      hint: spec.hint ? String(spec.hint) : '',
      // Which of the context choices renames this field, keyed by choice.
      // The penetration comparison decides *which* of the two Schadenswerte on
      // the attacker's card applies, so the field it feeds says which one to
      // read rather than leaving that to the rulebook.
      labels: spec.labels && typeof spec.labels === 'object' ? { ...spec.labels } : null,
      sign: Number(spec.sign) === -1 ? -1 : 1,
      min: isAuthoredNumber(spec.min) ? Number(spec.min) : null,
      max: isAuthoredNumber(spec.max) ? Number(spec.max) : null,
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
    const key = this._contextChoice(data)?.key;
    return this.requiredValue.labels?.[key] || this.requiredValue.label;
  }

  /**
   * Nudge the announced number by one, inside whatever bounds the workflow set.
   *
   * A blank field counts as zero here rather than staying blank: the stepper is
   * an explicit click, and refusing to act on it would look broken. Everything
   * else about blank-is-not-zero still holds — {@link _requiredValue} keeps
   * reading an untouched field as "nothing announced yet".
   * @param {HTMLFormElement} form
   * @param {number} delta
   * @private
   */
  _stepRequiredValue(form, delta) {
    const input = form.querySelector('input[name="requiredValue"]');
    if (!input) return;
    const min = this.requiredValue?.min;
    const max = this.requiredValue?.max;
    let next = (Number(input.value) || 0) + delta;
    if (min !== null && min !== undefined) next = Math.max(min, next);
    if (max !== null && max !== undefined) next = Math.min(max, next);
    input.value = String(next);
    this._refresh(form);
  }

  /**
   * Keep the optional Stelle picker safe the same way the other optional inputs
   * are: anything malformed behaves as though no location was offered, and the
   * attack then lands where an unannounced one always does.
   * @param {*} picker
   * @returns {{label: string, componentLabel?: string, choices: Array<{key: string, label: string, caption: string}>}|null}
   */
  _normalizeZonePicker(picker) {
    if (!picker?.label || !Array.isArray(picker.choices)) return null;
    const choices = picker.choices
      .filter((choice) => choice?.key && choice?.label)
      .map((choice) => ({
        key: String(choice.key),
        label: String(choice.label),
        caption: String(choice.caption ?? ''),
        // Coerced here rather than trusted, since this normalizer is the only
        // thing standing between a caller's object and the threshold sum. A
        // location with no price authored is free, which is what the Torso is.
        cost: Number(choice.cost) || 0,
      }));
    if (!choices.length) return null;
    return {
      label: String(picker.label),
      ...(picker.componentLabel ? { componentLabel: String(picker.componentLabel) } : {}),
      choices,
    };
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['tno', 'sheet'],
      template: 'systems/tno/templates/apps/roll-dialog.hbs',
      width: 340,
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
   * Derive the six-question layout from the sections that actually render.
   * Keeping this pure prevents the divider rules from drifting away from the
   * section conditions they are meant to separate.
   * @returns {object}
   */
  _sectionFlags() {
    const hasIdeaOption = this.actor.type === 'character';
    const isFixedMode = !!this.fixedValue;
    const hasSituationSection = !!this.preRollContext || !!this.requiredValue;
    const hasAgainstSection = this.opposingAnsage || !!this.toggleModifier;
    const hasAttemptSection = !!this.ansage || !!this.zonePicker || !isFixedMode;
    return {
      hasIdeaOption,
      hasSituationSection,
      hasAgainstSection,
      hasAttemptSection,
      hasGivenDivider: hasSituationSection || hasAgainstSection,
      hasChosenDivider: hasAttemptSection || hasIdeaOption || !isFixedMode,
    };
  }

  /**
   * The declaration question becomes a plain adjustment question when the
   * section contains only the situational modifier stepper.
   * @returns {string} Localization key.
   */
  _attemptQuestionKey() {
    return this.ansage || this.zonePicker ? 'TNO.Roll.Question.Attempt' : 'TNO.Roll.Question.Adjust';
  }

  /**
   * One ability as the shared heatmap readout used by selectable chips and by
   * a workflow-locked combat attribute.
   * @param {string} key
   * @returns {object|null}
   */
  _abilityCell(key) {
    const labelKey = CONFIG.TNO.abilities[key];
    if (!labelKey) return null;
    const value = this.actor.system.abilities?.[key]?.base ?? 0;
    const color = colorForValue(value);
    return {
      key,
      label: game.i18n.localize(labelKey),
      abbr: game.i18n.localize(labelKey.replace(/\.long$/, '.abbr')).toUpperCase(),
      value,
      cellBg: color.bg,
      textColor: color.textColor,
      active: key === this.object.attributeA,
    };
  }

  /** @returns {Array<Array<object>>} */
  _attributeGrid() {
    return (CONFIG.TNO.attributeRows ?? []).map((row) => row.map((key) => this._abilityCell(key)).filter(Boolean));
  }

  /** @param {number} value @returns {string} */
  _bonusResetLabel(value) {
    return game.i18n.format('TNO.Roll.BonusResetLabel', { value: this._formatBonus(value) });
  }

  /** @override */
  getData() {
    const sectionFlags = this._sectionFlags();
    const { hasIdeaOption } = sectionFlags;
    const bonus = Number(this.object.bonus) || 0;
    const contextChoice = this._contextChoice(this.object);
    const thresholdReadout = this._thresholdReadout(this.object);
    // The armour step is data-dependent — the chosen attribute decides whether
    // it applies — so its row is rendered once, up front, and only toggled
    // afterwards; `_refresh` repaints values, never rows. A character who is
    // not penalised at all gets no row and therefore never sees it.
    const armorMalusLabel = game.i18n.localize('TNO.Combat.ArmorSvMalus');
    const armorMalus = this.actor.system.derived?.armorSvPenalty
      ? {
          label: armorMalusLabel,
          display: this._formatBonus(MALUS_STEP),
          hint: game.i18n.localize('TNO.Combat.ArmorSvMalusHint'),
          active: this._conditionalModifiers(this.object).some((modifier) => modifier.label === armorMalusLabel),
        }
      : null;
    const actorModifier = this._actorModifiers()[0];
    const damageMalus = actorModifier
      ? {
          ...actorModifier,
          display: this._formatBonus(actorModifier.value),
          hint: game.i18n.localize('TNO.Damage.RollMalusHint'),
        }
      : null;

    const ansageComponent = this._ansageComponent(this.object);
    const zoneChoice = this._zoneChoice(this.object);
    const selectedAttribute = this._abilityCell(this.object.attributeA);

    const data = {
      ...this.object,
      dialogId: this.id,
      abilityOptions: Object.keys(CONFIG.TNO.abilities).map((key) => ({
        ...this._abilityCell(key),
        selected: key === this.object.attributeB,
      })),
      attributeGrid: this._attributeGrid(),
      advantageOptions: advantageOptions(),
      advantageConsequence: describeAdvantage(this.object.advantage),
      isSkillMode: !!this.skill,
      isLockedAttribute: this.lockAttribute,
      isFreeMode: this.freeSkill,
      isFixedMode: !!this.fixedValue,
      fixedModifiers: this._staticModifierComponents(),
      hasGearModifiers: this.fixedModifiers.length > 0 || !!damageMalus || !!armorMalus || !!this.maneuverMalus,
      damageMalus,
      armorMalus,
      maneuverMalus: this.maneuverMalus && {
        ...this.maneuverMalus,
        display: this._formatBonus(this.maneuverMalus.value),
        active: this._conditionalModifiers(this.object).includes(this.maneuverMalus),
      },
      hasPreRollContext: !!this.preRollContext,
      // The three-column comparison: choices, the reader's own number, and the
      // one they were told. Only laid out as a table when all three exist —
      // with no anchor there is nothing to compare against, and with no typed
      // number the row would be two columns of which one is a readout.
      hasComparisonRow: !!this.preRollContext?.anchor && !!this.requiredValue,
      hasRequiredValue: !!this.requiredValue,
      ...sectionFlags,
      requiredValue: this.requiredValue && {
        ...this.requiredValue,
        label: this._requiredValueLabel(this.object),
        // Signed bounds of 0 are real bounds, so the template asks these rather
        // than the numbers themselves, which would fail a truthiness test.
        hasMin: this.requiredValue.min !== null,
        hasMax: this.requiredValue.max !== null,
        value: this.object.requiredValue,
      },
      preRollContext: this.preRollContext && {
        ...this.preRollContext,
        choices: this.preRollContext.choices.map((choice) => ({
          ...choice,
          selected: choice.key === contextChoice?.key,
          display: this._formatBonus(choice.value),
          // A tile normally leads with what it costs, which is the useful thing
          // to compare when the choices differ only by amount. A workflow whose
          // choices differ by *meaning* — the penetration comparison, where two
          // of the three are worth the same ±0 — supplies its own headline, and
          // the amount steps back to being one more thing the caption says.
          headline: choice.headline || this._formatBonus(choice.value),
          state: choice.value > 0 ? 'positive' : choice.value < 0 ? 'negative' : 'neutral',
        })),
        isTilePicker: this.preRollContext.control === 'tiles',
        isToggle: this.preRollContext.control === 'toggle',
      },
      contextSelected: !!contextChoice,
      hasAnsage: !!this.ansage,
      ansage: this.ansage && {
        ...this.ansage,
        value: this.object.ansage,
        // Blank until something is declared: "±0" beside an empty box would read
        // as a value the roll is carrying.
        display: ansageComponent?.display ?? '',
      },
      zonePicker: this.zonePicker && {
        ...this.zonePicker,
        choices: this.zonePicker.choices.map((choice) => ({
          ...choice,
          selected: choice.key === zoneChoice,
          // The free Stelle reads "±0" rather than being left blank: a tile
          // with no price beside three that have one looks like an oversight,
          // and "the Torso is free" is the fact worth stating.
          costDisplay: this._formatBonus(Number(choice.cost) || 0),
        })),
      },
      hasOpposingAnsage: this.opposingAnsage,
      toggleModifier: this.toggleModifier && {
        ...this.toggleModifier,
        display: this._formatBonus(this.toggleModifier.value),
        checked: !!this.object.toggleModifier,
      },
      ...thresholdReadout,
      missingMessage: thresholdReadout.ready
        ? ''
        : game.i18n.format('TNO.Roll.Blocked.Missing', { label: thresholdReadout.missingLabel }),
      attemptQuestion: game.i18n.localize(this._attemptQuestionKey()),
      // Open whenever the roll already carries something. A re-render must not
      // fold a declared Ansage or a named Stelle back out of sight.
      attemptOpen: !!this._attemptComponents(this.object).length,
      bonusDisplay: this._formatBonus(bonus),
      bonusSignClass: this._bonusSignClass(bonus),
      bonusAtMin: bonus <= BONUS_MIN,
      bonusAtMax: bonus >= BONUS_MAX,
      bonusResetLabel: this._bonusResetLabel(bonus),
      bonusDecrementLabel: game.i18n.format('TNO.Roll.BonusStepLabel', { value: '−3' }),
      bonusIncrementLabel: game.i18n.format('TNO.Roll.BonusStepLabel', { value: '+3' }),
      // "Idee haben" is a pre-edge: only offered here, in the roll dialog,
      // before the dice are cast. There is deliberately no way to apply it
      // retroactively to a roll already made (see problem-solving-prd.md).
      hasIdeaOption,
      insightValue: this.actor.system.derived?.insight ?? 0,
      edgePool: this.actor.system.derived?.edgePool ?? 0,
      edgePoolMax: this.actor.system.derived?.edgePoolMax ?? 0,
      ideaDisabled: (this.actor.system.derived?.edgePool ?? 0) <= 0,
    };

    if (hasIdeaOption) {
      // A row of filled/empty pips makes the edge pool read as "N charges
      // left" at a glance instead of a bare fraction the player has to parse.
      data.hasIdeaPips = data.edgePoolMax > 0;
      data.ideaPips = Array.from({ length: data.edgePoolMax }, (_, i) => ({ filled: i < data.edgePool }));
    }

    // Named in every mode, not just skill mode: a locked attribute is shown as
    // a read-out wherever it occurs, and ability mode can lock one too.
    data.selectedAttribute = selectedAttribute;
    data.selectedAttributeLabel = selectedAttribute?.label ?? '';

    if (this.skill) {
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
    if ((this.actor.system.derived?.edgePool ?? 0) <= 0) return 0;
    return this.actor.system.derived?.insight ?? 0;
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
   * Resolve the selected optional pre-roll context from form data.
   * @param {object} data Form data with contextChoice.
   * @returns {{key: string, label: string, value: number, componentLabel?: string}|null}
   */
  _contextChoice(data) {
    if (!this.preRollContext) return null;
    const key = String(data?.contextChoice ?? '');
    return this.preRollContext.choices.find((choice) => choice.key === key) ?? null;
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
   * Read off the same two answers the threshold used, so the card cannot state
   * one thing and the breakdown another. Whether it is shown at all is decided
   * after the dice, in `rollTno` — this only says what the cost would be.
   * @param {object} data  Form data with contextChoice and requiredValue.
   * @returns {{label: string, text: string, note?: string, hint?: string}|null}
   */
  _consequence(data) {
    if (!this.consequence) return null;
    return this.consequence({
      contextKey: this._contextChoice(data)?.key ?? '',
      value: this._requiredValueEntry(data),
    }) ?? null;
  }

  /**
   * Rule modifiers supplied by the workflow that opened this dialog. They
   * remain distinct from the user's situational bonus so authored weapon
   * handling cannot be reset or overwritten in the UI.
   * @returns {Array<{label: string, value: number, display: string}>}
   */
  _staticModifierComponents() {
    return this.fixedModifiers.map((modifier) => ({
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
   * peers, and Stärke + Beweglichkeit is a Beweglichkeitswurf. Filling both
   * slots with it still costs one step; the flatness lives in `armorSvMalus`.
   *
   * @param {object} data  Form data with attributeA/attributeB.
   * @returns {Array<{label: string, value: number}>}
   */
  _conditionalModifiers(data) {
    const value = armorSvMalus(this.actor, [data?.attributeA, data?.attributeB].filter(Boolean));
    const armor = value ? [{ label: game.i18n.localize('TNO.Combat.ArmorSvMalus'), value }] : [];
    // The FV shortfall is the other rule the form state decides: it lands on
    // "alle Manöver" and on nothing else, so it appears the moment something is
    // declared and vanishes again when it is all cleared. Two things declare:
    // a typed Ansage, and naming a Stelle other than the Torso — "Ansagen auf
    // Trefferzonen im Nahkampf, normale Ansageregeln gelten hier auf alles", so
    // an aimed attack is a Manöver as surely as a Finte is. The Torso alone is
    // not, because that is where an attack that announced nothing lands.
    // It stays its own component next to the armour step, never folded into it —
    // three requirements, three shapes.
    const declared = this._ansageValue(data) || this._zoneComponent(data);
    const fv = this.maneuverMalus && declared ? [this.maneuverMalus] : [];
    // A rule the *other* side announced, which the player confirms rather than
    // computes — today only 'Rüstung umgehen', which cancels the padding of the
    // Stelle it was declared on.
    const toggled = this.toggleModifier && data?.toggleModifier ? [this.toggleModifier] : [];
    return [...armor, ...fv, ...toggled];
  }

  /**
   * Immutable modifiers from the actor's own current state. Unlike conditional
   * modifiers, these do not depend on any workflow or form choice.
   *
   * Labelled with the banner's own `Damage.Malus` — the same words the sheet
   * puts on the same number one surface away. It used to say "Schaden" here,
   * which in the resistance roll sat three rows above the *attacker's*
   * Schadenswert and meant something else entirely.
   * @returns {Array<{label: string, value: number}>}
   */
  _actorModifiers() {
    const value = Number(this.actor.system.derived?.damage?.malus) || 0;
    return value
      ? [{ label: game.i18n.localize('TNO.Damage.Malus'), value }]
      : [];
  }

  /**
   * Every immutable modifier on this roll — actor state first, then the
   * workflow's own and the ones the form state brings in. The single list
   * behind the threshold sum, the live breakdown, the chat card's components
   * and the message flags, so none of the four can disagree with the others.
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
   * The number the player typed, or null while the field is untouched.
   *
   * Blank is not zero: `FormDataExtended` yields `null` for an empty
   * `type=number`, and `Number(null)` is 0 — so "nothing announced yet" and
   * "announced as 0" would otherwise roll the same threshold.
   * @param {object} data  Form data with requiredValue.
   * @returns {number|null}
   */
  _requiredValueEntry(data) {
    if (!this.requiredValue) return null;
    if (!isAuthoredNumber(data?.requiredValue)) return null;
    const { min, max } = this.requiredValue;
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Number(data.requiredValue)));
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
    // Named the same way the field that took it was named, so a breakdown
    // reading "Schadenswert −4" says which of the attacker's two
    // damage values this roll was resisting.
    const label = this.requiredValue.labels
      ? this._requiredValueLabel(data)
      : this.requiredValue.componentLabel;
    return { label, value, display: this._formatBonus(value) };
  }

  /**
   * The Ansage the attacker announced against this roll, as a signed component.
   *
   * Optional and never gating: an attack with nothing declared on it is the
   * common case, and a defender who was told nothing types nothing. Deliberately
   * outside the `±30` clamp for the same reason the announced Schadenswert is —
   * that clamp bounds what a GM hands out, while this is a number the table has
   * already agreed on.
   *
   * This is the entire receiving end of the A→B channel. It takes an integer
   * and asks nothing about where it came from: from here a Finte, a Starker
   * Schwung and a Weiter Schwung are the same statement.
   * @param {object} data  Form data with opposingAnsage.
   * @returns {{label: string, value: number, display: string}|null}
   */
  _opposingAnsageComponent(data) {
    if (!this.opposingAnsage) return null;
    if (!isAuthoredNumber(data?.opposingAnsage)) return null;
    const declared = Math.max(0, Math.trunc(Number(data.opposingAnsage)));
    if (!declared) return null;
    return {
      label: game.i18n.localize('TNO.Combat.OpposingAnsage'),
      value: -declared,
      display: this._formatBonus(-declared),
    };
  }

  /**
   * The Ansage as typed: a plain magnitude, or 0 for a roll that declares
   * nothing.
   *
   * Nothing converts it. The rulebook's 1:1-up-to-the-rank / 2:1-past-it ladder
   * used to be applied here, and it isn't any more — not because the rule
   * changed, but because the declaration is now agreed at the table before the
   * number is typed, so this figure is already the answer rather than an input
   * to one.
   * @param {object} data  Form data with ansage.
   * @returns {number}
   */
  _ansageValue(data) {
    if (!this.ansage) return 0;
    return Math.max(0, Math.trunc(Number(data?.ansage) || 0));
  }

  /**
   * The declared Ansage as a signed threshold component.
   *
   * Outside the `±30` clamp, like the announced Schadenswert and for the same
   * reason: that clamp bounds what a GM hands out unilaterally, and this is a
   * number the table has already agreed on.
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
   * The Stelle this attack names, defaulting to the one an unannounced hit
   * lands on.
   * @param {object} data  Form data with zoneChoice.
   * @returns {string}
   */
  _zoneChoice(data) {
    if (!this.zonePicker) return DEFAULT_ZONE;
    const key = String(data?.zoneChoice ?? '');
    return this.zonePicker.choices.some((choice) => choice.key === key) ? key : DEFAULT_ZONE;
  }

  /**
   * What that Stelle costs, as a signed threshold component.
   *
   * Gezielte Angriffe prices every location — Arme and Beine "um eine Stufe,
   * also -3", Kopf "um zwei Stufen, also -6" — so aiming is paid for on the
   * attacker's own roll. The Torso yields no component at all rather than a
   * component worth zero: a standard attack should not carry a line saying it
   * was charged nothing.
   *
   * **Kept separate from the Ansage rather than folded into it.** Both are
   * Ansagen and both worsen this roll, but they are two decisions the player
   * made, and a breakdown reading "Kopf −6 + Ansage −4" says where each figure
   * came from where a single "Ansage −10" would not.
   *
   * It is also the reason the two must not be summed anywhere near the envelope:
   * the −6 buys doubled damage, not a harder defence, so the Stelle crosses to
   * the defender as a location and never as an amount aimed at their roll.
   * @param {object} data  Form data with zoneChoice.
   * @returns {{label: string, value: number, display: string}|null}
   */
  _zoneComponent(data) {
    if (!this.zonePicker) return null;
    const key = this._zoneChoice(data);
    const choice = this.zonePicker.choices.find((entry) => entry.key === key);
    const value = Number(choice?.cost) || 0;
    if (!value) return null;
    const label = this.zonePicker.componentLabel
      ? `${this.zonePicker.componentLabel}: ${choice.label}`
      : choice.label;
    return { label, value, display: this._formatBonus(value) };
  }

  /**
   * Everything the block is currently contributing, in the order it is read:
   * the Stelle's price, whatever was declared freely on top of it, then the
   * scene's modification.
   *
   * Display only — `_computeThreshold` reads each of these from the form data
   * itself, so nothing here is ever added to a roll twice.
   * @param {object} data  Form data.
   * @returns {Array<{label: string, value: number, display: string}>}
   */
  _attemptComponents(data) {
    const bonus = Number(data?.bonus) || 0;
    return [
      this._zoneComponent(data),
      this._ansageComponent(data),
      bonus
        ? {
            label: game.i18n.localize('TNO.Roll.Bonus'),
            value: bonus,
            display: this._formatBonus(bonus),
          }
        : null,
    ].filter(Boolean);
  }

  /**
   * That block summarised for its own `<summary>`, so a collapsed section still
   * says what it costs. An em dash rather than "±0" when nothing is declared:
   * the block is closed *because* there is nothing in it, and a zero would
   * suggest something was set to nothing.
   * @param {object} data  Form data.
   * @returns {string}
   */
  _attemptBadge(data) {
    const parts = this._attemptComponents(data).map((c) => `${c.label} ${c.display}`);
    return parts.length ? parts.join(' · ') : '—';
  }

  /**
   * Whether the roll has everything it needs. Both required inputs gate it,
   * and both gate it the same way: the button is disabled until answered.
   * @param {object} data  Form data.
   * @returns {boolean}
   */
  _canSubmit(data) {
    if (this.preRollContext && !this._contextChoice(data)) return false;
    if (this.requiredValue && this._requiredValueEntry(data) === null) return false;
    return true;
  }

  /**
   * Sum the fixed base with the bonus/malus and, if toggled, the "Idee haben"
   * bonus.
   * @param {object} data  Form data with attributeA/attributeB/skillValue/bonus/useIdea.
   * @returns {number}
   */
  _computeThreshold(data) {
    const base = this._baseComponents(data).reduce((sum, c) => sum + c.value, 0);
    const fixedModifiers = this._fixedModifierComponents(data).reduce((sum, modifier) => sum + modifier.value, 0);
    const context = this._contextComponent(data)?.value ?? 0;
    const required = this._requiredValueComponent(data)?.value ?? 0;
    const zone = this._zoneComponent(data)?.value ?? 0;
    const ansage = this._ansageComponent(data)?.value ?? 0;
    const opposing = this._opposingAnsageComponent(data)?.value ?? 0;
    return base + fixedModifiers + context + required + zone + ansage + opposing
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
    if (n > 0) return 'tno-bonus-positive';
    if (n < 0) return 'tno-bonus-negative';
    return '';
  }

  /**
   * The signed parts that produce the threshold, in display order. This one
   * list feeds both the compact chip row and the legacy text used by tests and
   * chat-adjacent paths.
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
    const zone = this._zoneComponent(data);
    if (zone) parts.push(zone);
    const ansage = this._ansageComponent(data);
    if (ansage) parts.push(ansage);
    const opposing = this._opposingAnsageComponent(data);
    if (opposing) parts.push(opposing);
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
   * Text form kept for the chat/tests path. The dialog itself renders the same
   * parts as safe DOM chips through `renderSignedChips`.
   * @param {object} data  Form data.
   * @returns {string}
   */
  _breakdownText(data) {
    return this._breakdownParts(data).map((part) => `${part.label} ${part.display}`).join(' + ');
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
      // Rounded, since it only drives a bar's width — the exact figure is the
      // label beside it.
      oddsPercent: Math.round(success * 100),
      oddsTooltip: oddsTooltipHtml(threshold, advantage),
    };
  }

  /**
   * The first unanswered required input, phrased with the label already visible
   * in the form. The announced number leads when both are blank because it is
   * the fact the player was just told and the dialog focuses it first.
   * @param {object} data
   * @returns {string}
   */
  _missingRequiredLabel(data) {
    if (this.requiredValue && this._requiredValueEntry(data) === null) return this._requiredValueLabel(data);
    if (this.preRollContext && !this._contextChoice(data)) return this.preRollContext.label;
    return '';
  }

  /**
   * The complete footer truth. No caller may independently combine readiness,
   * threshold and odds, because doing so is how a partial resistance roll used
   * to display a plausible but false target.
   * @param {object} data
   * @returns {{ready: boolean, threshold: number|null, thresholdDisplay: string, oddsLabel: string, oddsPercent: number, oddsTooltip: string, missingLabel: string}}
   */
  _thresholdReadout(data) {
    const ready = this._canSubmit(data);
    if (!ready) {
      return {
        ready: false,
        threshold: null,
        thresholdDisplay: '—',
        oddsLabel: '',
        oddsPercent: 0,
        oddsTooltip: '',
        missingLabel: this._missingRequiredLabel(data),
      };
    }
    const threshold = this._computeThreshold(data);
    return {
      ready: true,
      threshold,
      thresholdDisplay: String(threshold),
      ...this._oddsData(data),
      missingLabel: '',
    };
  }

  /**
   * Repaint the odds readout. Split out of {@link _refresh} because the
   * roll-type picker also has to call it: the roll type leaves the threshold
   * untouched but changes which dice are rolled, so the odds move while the
   * number above them does not — and flashing that number would be a lie.
   * @param {HTMLElement} root  The form, or any element containing it — the
   *   roll-type picker hands over the dialog root rather than the form.
   */
  _refreshOdds(root) {
    const form = root instanceof HTMLFormElement ? root : root.querySelector('form');
    const odds = form?.querySelector('.tno-odds');
    if (!odds) return;
    const readout = this._thresholdReadout(new FormDataExtended(form).object);
    odds.textContent = readout.oddsLabel;
    form.querySelector('.tno-odds-fill').style.width = `${readout.oddsPercent}%`;
    if (readout.ready) {
      odds.tabIndex = 0;
      odds.setAttribute('role', 'img');
      odds.dataset.tooltipHtml = readout.oddsTooltip;
      odds.setAttribute('aria-label', `${game.i18n.localize('TNO.Roll.Odds.InfoLabel')}: ${readout.oddsLabel}`);
    } else {
      odds.removeAttribute('tabindex');
      odds.removeAttribute('role');
      odds.removeAttribute('data-tooltip-html');
      odds.removeAttribute('aria-label');
    }
  }

  /**
   * Paint both signed component surfaces from safe DOM nodes.
   * @param {HTMLFormElement} form
   * @param {object} data
   */
  _renderSignedReadouts(form, data) {
    renderSignedChips(form.querySelector('.tno-roll-breakdown'), this._breakdownParts(data));
    const badge = form.querySelector('.tno-attempt-badge');
    if (!badge) return;
    const parts = this._attemptComponents(data);
    renderSignedChips(badge, parts);
    if (!parts.length) badge.textContent = '—';
  }

  /**
   * Recompute and repaint everything downstream of a threshold-affecting
   * change: the threshold number, its breakdown line, the roll button's
   * echo, the odds readout, and a brief highlight so the change is noticed.
   * @param {HTMLFormElement} form
   */
  _refresh(form) {
    const data = new FormDataExtended(form).object;
    const readout = this._thresholdReadout(data);
    form.querySelector('.tno-threshold-value').textContent = readout.thresholdDisplay;
    const comparator = form.querySelector('.tno-threshold-comparator');
    if (comparator) comparator.textContent = readout.ready ? '≤ ' : '';
    this._renderSignedReadouts(form, data);
    const echo = form.querySelector('.tno-roll-submit-echo');
    if (echo) {
      echo.textContent = readout.ready
        ? ''
        : game.i18n.format('TNO.Roll.Blocked.Missing', { label: readout.missingLabel });
    }
    this._refreshOdds(form);
    // The one row that comes and goes with the form state. It is rendered up
    // front and only shown or hidden here — injecting it would put a row into
    // a section this method otherwise never touches.
    const armorRow = form.querySelector('.tno-armor-malus');
    if (armorRow) armorRow.hidden = !this._conditionalModifiers(data).some((modifier) => modifier.label === armorRow.dataset.modifierLabel);
    const maneuverRow = form.querySelector('.tno-maneuver-malus');
    if (maneuverRow) maneuverRow.hidden = !this._conditionalModifiers(data).some((modifier) => modifier.label === maneuverRow.dataset.modifierLabel);
    // The Ansage read-out, which is the only thing in that section that moves.
    const ansage = form.querySelector('.tno-ansage-readout');
    if (ansage) ansage.textContent = this._ansageComponent(data)?.display ?? '';
    // The required-value field renames itself when the context choice above it
    // decides which number is being asked for. Scoped through the field's own
    // input name so the opposing-Ansage row beside it is never renamed.
    const requiredInput = form.querySelector('input[name="requiredValue"]');
    const requiredLabel = requiredInput?.labels?.[0];
    if (requiredLabel && this.requiredValue) requiredLabel.textContent = this._requiredValueLabel(data);
    // A stepper that can be clicked past its own floor would write a value the
    // field's own `min` rejects, so the caps are shown rather than enforced
    // silently. A blank field is at no bound yet — it holds no number to be at
    // one — so both buttons stay live until something has been typed.
    if (requiredInput) {
      const current = requiredInput.value === '' ? null : Number(requiredInput.value);
      for (const button of form.querySelectorAll('.tno-required-value-stepper')) {
        const step = Number(button.dataset.requiredStep);
        const bound = step > 0 ? this.requiredValue?.max : this.requiredValue?.min;
        button.disabled = current !== null && bound !== null && bound !== undefined
          && (step > 0 ? current >= bound : current <= bound);
      }
    }
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !readout.ready;
    const box = form.querySelector('.tno-threshold-box');
    if (box) {
      box.classList.toggle('is-pending', !readout.ready);
      box.classList.remove('tno-threshold-flash');
      if (readout.ready) {
        void box.offsetWidth; // reflow so the animation restarts on rapid changes
        box.classList.add('tno-threshold-flash');
      }
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
    display.setAttribute('aria-label', this._bonusResetLabel(value));
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
    html.on('change', 'select[name="attributeA"], select[name="attributeB"], select[name="contextChoice"], input[name="contextChoice"], input[name="zoneChoice"]', (ev) => this._refresh(ev.currentTarget.closest('form')));
    html.on('change input', 'input[name="skillValue"], input[name="requiredValue"], input[name="opposingAnsage"], input[name="ansage"]', (ev) => this._refresh(ev.currentTarget.closest('form')));
    html.on('change', 'input[name="toggleModifier"]', (ev) => this._refresh(ev.currentTarget.closest('form')));

    html.on('change', 'input[name="useIdea"]', (ev) => {
      ev.currentTarget.closest('.tno-idea-toggle')?.classList.toggle('active', ev.currentTarget.checked);
      this._refresh(ev.currentTarget.closest('form'));
    });

    // Every selectable first attribute uses the same radiogroup behaviour as
    // the roll-type picker. Locked combat attributes remain read-only rows.
    const root = html[0];
    const form = root.closest('form') ?? root.querySelector('form');
    if (!form) return;
    bindRadioGroup({
      group: form.querySelector('.tno-attribute-chip-grid'),
      input: form.querySelector('input[name="attributeA"]'),
      onSelect: (value) => {
        const chip = [...form.querySelectorAll('.tno-attribute-chip')]
          .find((option) => option.dataset.value === value);
        const name = form.querySelector('.tno-attribute-selected-name');
        if (name) name.textContent = chip?.title ?? '';
        this._refresh(form);
      },
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

    // The announced number's own stepper. Same gesture as the bonus one, but
    // in single steps and around the field rather than beside it.
    html.on('click', '.tno-required-value-stepper', (ev) => {
      ev.preventDefault();
      if (ev.currentTarget.disabled) return;
      this._stepRequiredValue(ev.currentTarget.closest('form'), Number(ev.currentTarget.dataset.requiredStep));
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
      }
    });

    // Roll-type picker, shared with the base-dice dialog. It changes which
    // dice are rolled, not the threshold — so the threshold preview stays put
    // (no flash on a number that did not move) and only the odds are rebuilt.
    const consequence = root.querySelector('.tno-advantage-effect');
    bindRadioGroup({
      group: root.querySelector('.tno-advantage-group'),
      input: root.querySelector('input[name="advantage"]'),
      onSelect: (value) => {
        if (consequence) consequence.textContent = describeAdvantage(Number(value));
        this._refreshOdds(root);
      },
    });

    // The two chip surfaces are deliberately built only from DOM nodes and
    // textContent; populate their initial state after the template renders.
    this._renderSignedReadouts(form, new FormDataExtended(form).object);

    // A required combat context must be answered before the commit button is
    // useful; every other roll keeps the existing one-Enter default path. The
    // typed value comes first where both are asked: it is the fact the player
    // was just told, while the comparison is one they can work out themselves.
    const contextFocus = this.preRollContext?.control !== 'select'
      ? 'input[name="contextChoice"]:first'
      : 'select[name="contextChoice"]';
    const focus = this.requiredValue
      ? 'input[name="requiredValue"]'
      : this.preRollContext
        ? contextFocus
        : 'button[type="submit"]';
    html.find(focus).trigger('focus');
  }

  /** @override */
  async _updateObject(event, formData) {
    if (this.lockAttribute) formData.attributeA = this.object.attributeA;
    const context = this._contextComponent(formData);
    if (this.preRollContext && !context) {
      ui.notifications.warn(game.i18n.localize('TNO.Roll.ContextRequired'));
      return;
    }
    const required = this._requiredValueComponent(formData);
    if (this.requiredValue && !required) {
      ui.notifications.warn(game.i18n.localize('TNO.Roll.ValueRequired'));
      return;
    }
    const zoneComponent = this._zoneComponent(formData);
    const consequence = this._consequence(formData);
    const ansageComponent = this._ansageComponent(formData);
    const opposing = this._opposingAnsageComponent(formData);
    const components = [
      ...this._baseComponents(formData),
      ...this._fixedModifierComponents(formData),
      ...(context ? [context] : []),
      ...(required ? [required] : []),
      ...(zoneComponent ? [zoneComponent] : []),
      ...(ansageComponent ? [ansageComponent] : []),
      ...(opposing ? [opposing] : []),
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
        // reading this sheet: the amount that was declared and where the blow
        // was aimed.
        ...(this.envelope
          ? {
              envelope: {
                ...this.envelope,
                ...ansageEnvelope(this._ansageValue(formData), this._zoneChoice(formData)),
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

import { TNO_ADVANTAGE, describeAdvantage, rollTno } from '../helpers/dice.mjs';
import { formatChance, oddsTooltipHtml, successChanceFor } from '../helpers/dice-odds.mjs';
import { colorForValue } from '../helpers/heatmap.mjs';
import { MALUS_STEP, armorSvMalus, isAuthoredNumber } from '../helpers/items.mjs';
import { DEFAULT_ZONE, ansageEnvelope } from '../helpers/maneuvers.mjs';
import { advantageOptions, bindRadioGroup } from './roll-dialog-shared.mjs';

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
   * @param {{label: string, placeholder: string, control?: 'select'|'tiles'|'toggle', tileColumns?: 1|2|3|5|7, anchor?: {label: string, value: number|string}, choices: Array<{key: string, label: string, value: number, componentLabel?: string}>}} [options.preRollContext]
   *   One optional required choice that must be made before rolling. Its
   *   selected value becomes an immutable threshold component.
   * @param {{label: string, placeholder?: string, componentLabel?: string, sign?: 1|-1, min?: number, max?: number}} [options.requiredValue]
   *   One mandatory number the player types before rolling — a value only the
   *   table knows, such as the Schadenswert an attacker announced. Orthogonal
   *   to `preRollContext`, which is structurally "pick one of an authored list".
   * @param {string} [options.flavor]      Label shown as the roll's subject heading and chat flavor.
   * @param {string} [options.img]         Picture shown beside that heading on the chat card, e.g. the weapon's own art.
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
   *   'Rüstung umgehen'. Its numeric part cancels the Stelle's padding; the
   *   workflow separately resolves which damage value the confirmation selects.
   *   Never pre-set from anything the other side sent: an attack card carries an
   *   amount, not a reason.
   * @param {(answers: {contextKey: string, value: number|null, toggleModifier: boolean}) => {label: string, text: string, note?: string, hint?: string}|null} [options.consequence]
   *   What this roll costs the roller if it fails, phrased by the workflow that
   *   opened the dialog — the resistance roll's applied damage is the first.
   *   Called with the answers that decide it, and rendered on the chat card only
   *   once the dice have actually failed. It states; nothing here applies it.
   * @param {() => Promise<void>} [options.afterRoll]
   *   Run once the dice have actually been cast, never when the dialog is
   *   cancelled. For state a workflow owes its own sheet — the repeated-defence
   *   counter is the first — which must count rolls and not intentions.
   */
  constructor(actor, { attributeA = '', lockAttribute = false, skill = null, freeSkill = false, fixedValue = null, fixedModifiers = [], preRollContext = null, requiredValue = null, ansage = null, zonePicker = null, maneuverMalus = null, envelope = null, opposingAnsage = false, toggleModifier = null, consequence = null, afterRoll = null, flavor = '', img = '', width = null } = {}) {
    // `requiredValue` starts at 0. It used to start empty so that an untouched
    // field and a typed zero could be told apart and only the latter could roll;
    // that gate was dropped deliberately — the field opens on the value most
    // announcements start from and the player edits it, and the penetration
    // comparison is the one answer still holding the roll back.
    //
    // The two Ansage fields open at 0 for the look rather than the logic: both
    // already read a blank field as 0 and neither ever gated, so this only stops
    // them rendering a grey placeholder where every other stepper shows a real
    // figure in the same weight.
    // The default width fits every roll that is a column of questions. A
    // workflow whose section is laid out as a table says so here rather than
    // being squeezed into a width picked for a different shape.
    super(
      { attributeA, attributeB: '', skillValue: 0, bonus: 0, advantage: TNO_ADVANTAGE.none, useIdea: false, contextChoice: '', requiredValue: 0, ansage: 0, zoneChoice: DEFAULT_ZONE, opposingAnsage: 0, toggleModifier: false },
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
    // Decoration for the chat card only: which weapon this roll was made with,
    // read at a glance in a scrolling log. Nothing computes with it, and a roll
    // that has no object behind it — a bare attribute, a Ausweichen — leaves it
    // empty rather than reaching for a placeholder.
    this.img = img;
  }

  /**
   * Keep the optional context interface safe for all existing roll callers:
   * malformed or empty contexts simply behave as though no context was given.
   * @param {*} context
   * @returns {{label: string, placeholder: string, control: 'select'|'tiles'|'toggle', tileColumns: 1|2|3|5|7, anchor: ?{label: string, value: string}, choices: Array<{key: string, label: string, value: number, componentLabel?: string}>}|null}
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
        // and captions them "hält · Wuchtschaden". Must be carried through this
        // whitelist explicitly: without it that picker would be captioned by
        // its outcomes and named by nothing.
        ...(choice.headline ? { headline: String(choice.headline) } : {}),
        // A context may already provide the same outcome as the workflow's
        // separate confirmation toggle. Preserve that relationship so the
        // generic dialog can disable the redundant control and, critically,
        // never count its modifier twice.
        ...(choice.suppressesToggleModifier ? { suppressesToggleModifier: true } : {}),
      }));
    if (!choices.length) return null;
    const control = context.control === 'toggle'
      ? choices.length === 2 ? 'toggle' : 'tiles'
      : context.control === 'tiles' ? 'tiles' : 'select';
    return {
      label: String(context.label),
      placeholder: String(context.placeholder || game.i18n.localize('TNO.Roll.ContextPlaceholder')),
      control,
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
      // Some announced states replace the context's ordinary value rather than
      // merely modifying it. Rüstung umgehen is the first: it always asks for
      // Schaden, whatever the penetration comparison would otherwise select.
      toggleLabel: spec.toggleLabel ? String(spec.toggleLabel) : '',
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
    if (this.requiredValue.toggleLabel && this._toggleModifierActive(data)) {
      return this.requiredValue.toggleLabel;
    }
    const key = this._contextChoice(data)?.key;
    return this.requiredValue.labels?.[key] || this.requiredValue.label;
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
   * what lets a single stepper serve every stepped field in the ledger.
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
   *
   * A blank field counts as zero here rather than staying blank: the stepper is
   * an explicit click, and refusing to act on it would look broken. Everything
   * else about blank-is-not-zero still holds — {@link _requiredValueEntry} keeps
   * reading an untouched field as "nothing announced yet".
   * @param {HTMLFormElement} form
   * @param {HTMLInputElement} input  The field this stepper frames.
   * @param {number} delta
   * @private
   */
  _stepValue(form, input, delta) {
    if (!input) return;
    const min = TnoRollDialog._inputBound(input.min);
    const max = TnoRollDialog._inputBound(input.max);
    let next = (Number(input.value) || 0) + delta;
    if (min !== null) next = Math.max(min, next);
    if (max !== null) next = Math.min(max, next);
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
   * Derive the three ledger groups from the sections that actually render.
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
      hasGivenGroup: hasSituationSection || hasAgainstSection,
      hasChosenGroup: hasAttemptSection || hasIdeaOption || !isFixedMode,
    };
  }

  /**
   * One Δ-column cell: the signed contribution a line makes to the Schwelle.
   *
   * `pending` is a line whose answer is still missing — it shows `?` and the
   * roll is blocked. `provisional` is a line that is set up but not armed (a
   * bypass unticked, an unspent Idee) — it shows its amount in parentheses and
   * is not summed until armed.
   * @param {number} value
   * @param {{pending?: boolean, provisional?: boolean}} [state]
   * @returns {{display: string, cls: string}}
   */
  _deltaCell(value, { pending = false, provisional = false } = {}) {
    if (pending) return { display: '?', cls: 'is-pending' };
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
    const toggleModifierSuppressed = this._toggleModifierSuppressed(this.object);
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

    // Every dynamic Δ-column cell, precomputed here and repainted by
    // `_repaintLedgerDeltas` on the same helpers. A line that is set up but
    // not yet armed reads as provisional; one whose answer is missing reads
    // as pending and blocks the roll.
    const contextComponent = this._contextComponent(this.object);
    const contextDelta = this.preRollContext
      ? this._deltaCell(contextComponent?.value ?? 0, { pending: !contextChoice })
      : null;
    const requiredValueDelta = this.requiredValue
      ? this._deltaCell(this._requiredValueComponent(this.object)?.value ?? 0)
      : null;
    const opposingAnsageDelta = this.opposingAnsage
      ? this._deltaCell(this._opposingAnsageComponent(this.object)?.value ?? 0)
      : null;
    const toggleModifierDelta = this.toggleModifier
      ? this._deltaCell(toggleModifierSuppressed ? 0 : this.toggleModifier.value, {
          provisional: toggleModifierSuppressed || !this.object.toggleModifier,
        })
      : null;
    const zoneDelta = this.zonePicker
      ? this._deltaCell(this._zoneComponent(this.object)?.value ?? 0)
      : null;
    const ansageDelta = this.ansage
      ? this._deltaCell(ansageComponent?.value ?? 0)
      : null;
    const bonusDelta = this._deltaCell(bonus);
    const ideaDelta = this._deltaCell(this._ideaInsight(), { provisional: !this._ideaArmed(this.object) });
    const attributeBKey = this.object.attributeB;
    const attributeBRow = !this.skill && !this.freeSkill && attributeBKey && CONFIG.TNO.abilities[attributeBKey]
      ? {
          label: game.i18n.localize(CONFIG.TNO.abilities[attributeBKey]),
          display: this._formatBonus(this.actor.system.abilities?.[attributeBKey]?.base ?? 0),
        }
      : null;
    const freeSkillDelta = this.freeSkill
      ? this._deltaCell(this._freeSkillValue(this.object))
      : null;

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
      fixedModifiers: this._staticModifierComponents().map((modifier) => ({
        ...modifier,
        deltaClass: modifier.value > 0 ? 'is-positive' : modifier.value < 0 ? 'is-negative' : 'is-neutral',
      })),
      hasGearModifiers: this.fixedModifiers.length > 0 || !!damageMalus || !!armorMalus || !!this.maneuverMalus,
      damageMalus,
      armorMalus,
      maneuverMalus: this.maneuverMalus && {
        ...this.maneuverMalus,
        display: this._formatBonus(this.maneuverMalus.value),
        active: this._conditionalModifiers(this.object).includes(this.maneuverMalus),
      },
      hasPreRollContext: !!this.preRollContext,
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
        // The field opens *on* a value now, so it can open already sitting at a
        // bound. `_refresh` keeps these in step afterwards, but it has not run
        // yet on the first paint — and a live `−` under a field at its floor is
        // a button that promises something it will not do.
        atMin: this.requiredValue.min !== null && Number(this.object.requiredValue) <= this.requiredValue.min,
        atMax: this.requiredValue.max !== null && Number(this.object.requiredValue) >= this.requiredValue.max,
      },
      preRollContext: this.preRollContext && {
        ...this.preRollContext,
        choices: this.preRollContext.choices.map((choice) => ({
          ...choice,
          selected: choice.key === contextChoice?.key,
          // Every tile in this dialog is read in the same three slots: what you
          // are picking, what it is worth, and what it does to you. The middle
          // slot is always the signed Δ, so the name on top can be the answer
          // itself. A picker used to lead with the modifier and caption it with
          // the answer, which meant "at what distance?" was answered by "−3".
          //
          // A choice that supplies its own name (`headline`) is one whose
          // `label` is an effect rather than a name, so that label drops to the
          // third slot; a choice that supplies none is named by its label and
          // has no third slot to fill. Nothing else has to be declared.
          name: choice.headline || choice.label,
          caption: choice.headline ? choice.label : '',
          display: this._formatBonus(choice.value),
          state: choice.value > 0 ? 'positive' : choice.value < 0 ? 'negative' : 'neutral',
        })),
        isTilePicker: this.preRollContext.control === 'tiles',
        isToggle: this.preRollContext.control === 'toggle',
      },
      contextSelected: !!contextChoice,
      // Every picker resolves to one Δ on its own line; the question itself is
      // the line's name, so there is nothing else to label.
      contextDelta: contextDelta || { display: '', cls: 'is-neutral' },
      hasAnsage: !!this.ansage,
      ansage: this.ansage && {
        ...this.ansage,
        value: this.object.ansage,
      },
      ansageDelta: ansageDelta || { display: '', cls: 'is-neutral' },
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
      zoneDelta: zoneDelta || { display: '', cls: 'is-neutral' },
      hasOpposingAnsage: this.opposingAnsage,
      opposingAnsageDelta: opposingAnsageDelta || { display: '', cls: 'is-neutral' },
      toggleModifier: this.toggleModifier && {
        ...this.toggleModifier,
        display: this._formatBonus(toggleModifierSuppressed ? 0 : this.toggleModifier.value),
        checked: this._toggleModifierActive(this.object),
        disabled: toggleModifierSuppressed,
      },
      toggleModifierDelta: toggleModifierDelta || { display: '', cls: 'is-neutral' },
      requiredValueDelta: requiredValueDelta || { display: '', cls: 'is-neutral' },
      attributeBRow,
      freeSkillDelta: freeSkillDelta || { display: '', cls: 'is-neutral' },
      bonusDelta,
      ideaDelta,
      ...thresholdReadout,
      missingMessage: thresholdReadout.ready
        ? ''
        : game.i18n.format('TNO.Roll.Blocked.Missing', { label: thresholdReadout.missingLabel }),
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
    const selectedAttributeDelta = this._deltaCell(selectedAttribute?.value ?? 0);
    data.selectedAttribute = selectedAttribute && {
      ...selectedAttribute,
      deltaDisplay: selectedAttributeDelta.display,
      deltaClass: selectedAttributeDelta.cls,
    };
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
      toggleModifier: this._toggleModifierActive(data),
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
    // A state the *other* side announced, which the player confirms rather than
    // computes — today only 'Rüstung umgehen'.
    const toggled = this._toggleModifierActive(data) ? [this.toggleModifier] : [];
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
   * The number in the field, with a cleared field reading as 0.
   *
   * Blank and zero were once different answers — only the typed one could roll —
   * and are now the same one. The field opens at 0, so a player who clears it is
   * emptying a box rather than declining to answer, and the roll is gated on the
   * penetration comparison alone.
   * @param {object} data  Form data with requiredValue.
   * @returns {number|null}  null only where no value was ever asked for.
   */
  _requiredValueEntry(data) {
    if (!this.requiredValue) return null;
    const raw = isAuthoredNumber(data?.requiredValue) ? Number(data.requiredValue) : 0;
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
   * Whether the roll has everything it needs.
   *
   * The required *pick* is the only thing that gates: it decides which of the
   * attacker's two damage values applies and whether the location's RW applies,
   * and no default could stand in for it. The required *number* no longer gates —
   * it opens at 0 and the player edits it.
   * @param {object} data  Form data.
   * @returns {boolean}
   */
  _canSubmit(data) {
    if (this.preRollContext && !this._contextChoice(data)) return false;
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
   * Text form, for the chat card and the message flags. The dialog itself never
   * prints this: the ledger *is* the breakdown, one line per part with its own
   * signed Δ, so a recap strip under the total said the same list twice.
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
   * The unanswered required input, phrased with the label already visible in the
   * form. Only the pick can be unanswered now.
   * @param {object} data
   * @returns {string}
   */
  _missingRequiredLabel(data) {
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
   * Repaint every dynamic Δ-column cell and the picker summary lines beside
   * them, keyed by `data-role`. Values only — the controls in the left column
   * keep their typed contents and focus. Static lines (the attribute in a
   * locked roll, the skill rank, the gear requirements) carry no `data-role`
   * and are painted once by the template.
   * @param {HTMLFormElement} form
   * @param {object} data
   */
  _repaintLedgerDeltas(form, data) {
    const paint = (role, cell) => {
      const el = form.querySelector(`.tno-ledger-delta[data-role="${role}"]`);
      if (!el || !cell) return;
      el.textContent = cell.display;
      el.classList.remove('is-positive', 'is-negative', 'is-neutral', 'is-provisional', 'is-pending');
      el.classList.add(cell.cls);
    };
    const relabel = (role, text) => {
      const el = form.querySelector(`[data-role="${role}"]`);
      if (el && text != null) el.textContent = text;
    };

    // ① base — only the picked-attribute lines move; a locked or fixed base does not.
    if (!this.lockAttribute && !this.fixedValue && !this.skill && !this.freeSkill) {
      paint('attributeA-delta', this._deltaCell(this._abilityCell(data.attributeA)?.value ?? 0));
      const key = data.attributeB;
      const known = key && CONFIG.TNO.abilities[key];
      const row = form.querySelector('[data-row="attributeB"]');
      if (row) row.hidden = !known;
      if (known) {
        relabel('attributeB-label', game.i18n.localize(CONFIG.TNO.abilities[key]));
        paint('attributeB-delta', this._deltaCell(this.actor.system.abilities?.[key]?.base ?? 0));
      }
    }
    if (this.freeSkill) paint('freeSkill-delta', this._deltaCell(this._freeSkillValue(data)));

    // ② given
    if (this.preRollContext) {
      const picked = this._contextChoice(data);
      paint('context-delta', this._deltaCell(this._contextComponent(data)?.value ?? 0, { pending: !picked }));
    }
    if (this.requiredValue) {
      paint('requiredValue-delta', this._deltaCell(this._requiredValueComponent(data)?.value ?? 0));
    }
    if (this.opposingAnsage) {
      paint('opposingAnsage-delta', this._deltaCell(this._opposingAnsageComponent(data)?.value ?? 0));
    }
    if (this.toggleModifier) {
      const suppressed = this._toggleModifierSuppressed(data);
      const checkbox = form.querySelector('input[name="toggleModifier"]');
      if (checkbox) {
        checkbox.disabled = suppressed;
        if (suppressed) checkbox.checked = false;
      }
      if (suppressed) data.toggleModifier = false;
      paint('toggleModifier-delta', this._deltaCell(suppressed ? 0 : this.toggleModifier.value, {
        provisional: suppressed || !data.toggleModifier,
      }));
    }

    // ③ chosen
    if (this.zonePicker) paint('zone-delta', this._deltaCell(this._zoneComponent(data)?.value ?? 0));
    if (this.ansage) paint('ansage-delta', this._deltaCell(this._ansageComponent(data)?.value ?? 0));
    if (!this.fixedValue) paint('bonus-delta', this._deltaCell(Number(data.bonus) || 0));
    if (this.actor.type === 'character') {
      paint('idea-delta', this._deltaCell(this._ideaInsight(), { provisional: !this._ideaArmed(data) }));
    }
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
    const echo = form.querySelector('.tno-roll-submit-echo');
    if (echo) {
      echo.textContent = readout.ready
        ? ''
        : game.i18n.format('TNO.Roll.Blocked.Missing', { label: readout.missingLabel });
    }
    this._refreshOdds(form);
    // Every line's Δ cell, and the picker summary labels beside them.
    this._repaintLedgerDeltas(form, data);
    // The two conditional gear lines that come and go with the form state. They
    // are rendered up front and only shown or hidden here.
    const armorRow = form.querySelector('.tno-armor-malus');
    if (armorRow) armorRow.hidden = !this._conditionalModifiers(data).some((modifier) => modifier.label === armorRow.dataset.modifierLabel);
    const maneuverRow = form.querySelector('.tno-maneuver-malus');
    if (maneuverRow) maneuverRow.hidden = !this._conditionalModifiers(data).some((modifier) => modifier.label === maneuverRow.dataset.modifierLabel);
    // The required-value field renames itself when the context choice above it
    // decides which number is being asked for. Scoped through the field's own
    // input name so the opposing-Ansage row beside it is never renamed.
    const requiredInput = form.querySelector('input[name="requiredValue"]');
    const requiredLabel = requiredInput?.labels?.[0];
    if (requiredLabel && this.requiredValue) requiredLabel.textContent = this._requiredValueLabel(data);
    // A stepper that can be clicked past its own floor would write a value the
    // field's own `min` rejects, so the caps are shown rather than enforced
    // silently. Every stepped field is walked, and each reads its bounds off its
    // own input — the announced Schadenswert is no longer the only one. A blank
    // field is at no bound yet, so both its buttons stay live until something
    // has been typed.
    for (const group of form.querySelectorAll('.tno-ledger-stepper')) {
      const stepped = group.querySelector('input[type="number"]');
      if (!stepped) continue;
      const current = stepped.value === '' ? null : Number(stepped.value);
      for (const button of group.querySelectorAll('.tno-ledger-step')) {
        const step = Number(button.dataset.step);
        const bound = TnoRollDialog._inputBound(step > 0 ? stepped.max : stepped.min);
        button.disabled = current !== null && bound !== null
          && (step > 0 ? current >= bound : current <= bound);
      }
    }
    // The question that blocks the roll is marked where the answer goes, not
    // only by the `?` in its Δ column and the sentence on the button. Blue
    // rather than red: nothing is wrong yet, and red already means "this Δ
    // costs you" three rows above. The two blues never coexist — this state
    // exists only while nothing is checked, the chosen-tile blue only after.
    const pickerRow = form.querySelector('.tno-ledger-row--picker[data-row="context"]');
    if (pickerRow) {
      const unanswered = !this._contextChoice(data);
      pickerRow.classList.toggle('is-unanswered', unanswered);
      // Answering clears a refusal outright. `animationend` does that too, but
      // it never fires under `prefers-reduced-motion`, where the flash is a
      // static red the pick has to be able to switch off.
      if (!unanswered) pickerRow.classList.remove('tno-picker-reject');
    }
    // Not `disabled`: a disabled button swallows its own click, so the sentence
    // naming the missing field would be a dead end. It stays clickable and
    // refuses out loud — see {@link _rejectSubmit}.
    const submit = form.querySelector('button[type="submit"]');
    if (submit) {
      submit.classList.toggle('is-blocked', !readout.ready);
      if (readout.ready) submit.removeAttribute('aria-disabled');
      else submit.setAttribute('aria-disabled', 'true');
    }
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

  /**
   * Refuse a roll that is still missing its required pick, and say so at the
   * control rather than only at the button.
   *
   * This is the one moment red is honest here: it answers an action instead of
   * describing an opening state, so it cannot be read as one more malus in a
   * ledger whose maluses are also red. It is momentary, and the resting mark
   * stays blue.
   * @param {HTMLFormElement} form
   */
  _rejectSubmit(form) {
    const row = form.querySelector('.tno-ledger-row--picker[data-row="context"]');
    if (!row) return;
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    row.classList.remove('tno-picker-reject');
    void row.offsetWidth; // reflow, so a second refused click replays the flash
    row.classList.add('tno-picker-reject');
    row.addEventListener('animationend', () => row.classList.remove('tno-picker-reject'), { once: true });
    form.querySelector('[name="contextChoice"]')?.focus();
  }

  /**
   * @override
   * The gate is here rather than on the button's `disabled` attribute so that
   * both ways of committing — the click and the implicit Enter — land on the
   * same refusal. The form is `novalidate` for the same reason: the radios keep
   * their `required` for assistive tech, but the browser's own bubble would
   * pre-empt the message this dialog already writes.
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
        for (const name of form.querySelectorAll('.tno-attribute-selected-name, .tno-attribute-row-name')) {
          name.textContent = chip?.title ?? '';
        }
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

    // Every stepped field in the ledger shares one gesture: ±1 around its own
    // input, bounded by that input's own min/max. The button finds its field
    // through the wrapper it sits in, so nothing here knows a field by name.
    html.on('click', '.tno-ledger-step', (ev) => {
      ev.preventDefault();
      if (ev.currentTarget.disabled) return;
      const group = ev.currentTarget.closest('.tno-ledger-stepper');
      this._stepValue(
        ev.currentTarget.closest('form'),
        group?.querySelector('input[type="number"]'),
        Number(ev.currentTarget.dataset.step)
      );
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

    // A required combat context must be answered before the commit button is
    // useful; every other roll keeps the existing one-Enter default path. The
    // typed value comes first where both are asked: it is the fact the player
    // was just told, while the comparison is one they can work out themselves.
    const contextFocus = this.preRollContext?.control !== 'select'
      ? 'input[name="contextChoice"]:first'
      : 'select[name="contextChoice"]';
    // The pick leads: it is the only answer that can still block the roll, and
    // the number beside it already carries a usable default.
    const focus = this.preRollContext
      ? contextFocus
      : this.requiredValue
        ? 'input[name="requiredValue"]'
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

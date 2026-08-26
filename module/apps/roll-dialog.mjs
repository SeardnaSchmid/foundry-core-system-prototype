import { TNO_ADVANTAGE, describeAdvantage, rollTno } from '../helpers/dice.mjs';
import { formatChance, oddsTooltipHtml, successChanceFor } from '../helpers/dice-odds.mjs';
import { colorForValue } from '../helpers/heatmap.mjs';
import { MALUS_STEP, armorSvMalus, isAuthoredNumber } from '../helpers/items.mjs';
import { ANSAGE_GROUPS, ansageEnvelope, ansageKosten } from '../helpers/maneuvers.mjs';
import { advantageOptions, bindAdvantagePicker } from './roll-dialog-shared.mjs';

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
   * @param {{label: string, value: number}[]} [options.fixedModifiers]
   *   Immutable rule modifiers added to the threshold and shown separately
   *   from the editable situational bonus.
   * @param {{label: string, placeholder: string, control?: 'select'|'tiles', tileLabels?: boolean, tileColumns?: 2|3|5|7, choices: Array<{key: string, label: string, value: number, componentLabel?: string}>}} [options.preRollContext]
   *   One optional required choice that must be made before rolling. Its
   *   selected value becomes an immutable threshold component.
   * @param {{label: string, placeholder?: string, componentLabel?: string, sign?: 1|-1, min?: number, max?: number}} [options.requiredValue]
   *   One mandatory number the player types before rolling — a value only the
   *   table knows, such as the Schadenswert an attacker announced. Orthogonal
   *   to `preRollContext`, which is structurally "pick one of an authored list".
   * @param {string} [options.flavor]      Label shown as the roll's subject heading and chat flavor.
   * @param {Array<{key: string, label: string, effect: string, mode: 'free'|'fixed'|'typed', betrag: number, rank: number, rankLabel: string, requiresReach: boolean}>} [options.ansagen]
   *   The Manöver declarable on this roll. Unlike `preRollContext` and
   *   `requiredValue` these are optional *and* repeatable: any number of them
   *   may be declared at once ("im Prinzip sind sie alle kombinierbar"), and
   *   each costs the declaring roll `ansageKosten(betrag, rank)`.
   * @param {{from: string, penetration: number|null, sharp: number|null, blunt: number|null}} [options.envelope]
   *   The attacker's half of an exchange: who is attacking and what their weapon
   *   brings, to which the declared Ansagen add a penalty per defence and a
   *   Stelle. Rendered on the chat card as plain text — there is no targeting and
   *   no second document — so the defender reads it and enters what applies.
   * @param {{label: string, value: number}} [options.maneuverMalus]
   *   A modifier that applies only while at least one Ansage is declared — the
   *   weapon's FV shortfall, which lands on "alle Manöver" and never on a
   *   Standardangriff.
   * @param {boolean|number} [options.opposingAnsage]
   *   Offer a field for the Ansage the attacker announced against this roll. One
   *   optional integer, taken as given: from this side a Finte and a Starker
   *   Schwung are the same statement. Pass a number to start it filled in — but
   *   the field is offered either way, so a defender who never touched a chat
   *   card can always type what they were told.
   * @param {{label: string, hint?: string, value: number}} [options.toggleModifier]
   *   A modifier the *other* side announced, which this player confirms rather
   *   than computes — today only 'Rüstung umgehen' cancelling the padding of the
   *   Stelle it was declared on.
   * @param {() => Promise<void>} [options.afterRoll]
   *   Run once the dice have actually been cast, never when the dialog is
   *   cancelled. For state a workflow owes its own sheet — the repeated-defence
   *   counter is the first — which must count rolls and not intentions.
   */
  constructor(actor, { attributeA = '', lockAttribute = false, skill = null, freeSkill = false, fixedValue = null, fixedModifiers = [], preRollContext = null, requiredValue = null, ansagen = [], maneuverMalus = null, envelope = null, opposingAnsage = false, toggleModifier = null, afterRoll = null, flavor = '' } = {}) {
    // `requiredValue` starts empty rather than at 0: an untouched field and a
    // typed zero are different answers, and only one of them may roll.
    super({ attributeA, attributeB: '', skillValue: 0, bonus: 0, advantage: TNO_ADVANTAGE.none, useIdea: false, contextChoice: '', requiredValue: '', ansagen: {}, ansageGroups: {}, opposingAnsage: '', toggleModifier: false });
    this.actor = actor;
    this.lockAttribute = !!(lockAttribute && attributeA);
    this.skill = skill;
    this.freeSkill = freeSkill;
    this.fixedValue = fixedValue;
    this.fixedModifiers = fixedModifiers
      .filter((modifier) => modifier?.label && Number.isFinite(Number(modifier.value)))
      .map((modifier) => ({ label: modifier.label, value: Number(modifier.value) }));
    this.preRollContext = this._normalizePreRollContext(preRollContext);
    this.requiredValue = this._normalizeRequiredValue(requiredValue);
    this.ansagen = Array.isArray(ansagen) ? ansagen.filter((entry) => entry?.key && entry?.label) : [];
    this.maneuverMalus = maneuverMalus?.label && Number.isFinite(Number(maneuverMalus.value))
      ? { label: String(maneuverMalus.label), value: Number(maneuverMalus.value) }
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
    this.afterRoll = typeof afterRoll === 'function' ? afterRoll : null;
    this.flavor = flavor || game.i18n.localize('TNO.Roll.DialogTitle');
  }

  /**
   * Keep the optional context interface safe for all existing roll callers:
   * malformed or empty contexts simply behave as though no context was given.
   * @param {*} context
   * @returns {{label: string, placeholder: string, control: 'select'|'tiles', tileLabels: boolean, tileColumns: 2|3|5|7, choices: Array<{key: string, label: string, value: number, componentLabel?: string}>}|null}
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
      }));
    if (!choices.length) return null;
    return {
      label: String(context.label),
      placeholder: String(context.placeholder || game.i18n.localize('TNO.Roll.ContextPlaceholder')),
      control: context.control === 'tiles' ? 'tiles' : 'select',
      tileLabels: context.tileLabels === true,
      tileColumns: [2, 3, 5, 7].includes(Number(context.tileColumns)) ? Number(context.tileColumns) : 7,
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
      sign: Number(spec.sign) === -1 ? -1 : 1,
      min: isAuthoredNumber(spec.min) ? Number(spec.min) : null,
      max: isAuthoredNumber(spec.max) ? Number(spec.max) : null,
    };
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
    const contextChoice = this._contextChoice(this.object);
    // The armour step is data-dependent — the chosen attribute decides whether
    // it applies — so its row is rendered once, up front, and only toggled
    // afterwards; `_refresh` repaints values, never rows. A character who is
    // not penalised at all gets no row and therefore never sees it.
    const armorMalus = this.actor.system.derived?.armorSvPenalty
      ? {
          label: game.i18n.localize('TNO.Combat.ArmorSvMalus'),
          display: this._formatBonus(MALUS_STEP),
          active: this._conditionalModifiers(this.object).length > 0,
        }
      : null;

    const ansageRows = this._ansageRows(this.object);
    const ansageGroups = this._ansageGroupRows(this.object);

    const data = {
      ...this.object,
      abilities,
      advantageOptions: advantageOptions(),
      advantageConsequence: describeAdvantage(this.object.advantage),
      isSkillMode: !!this.skill,
      isLockedAttribute: this.lockAttribute,
      isFreeMode: this.freeSkill,
      isFixedMode: !!this.fixedValue,
      fixedModifiers: this._staticModifierComponents(),
      hasFixedModifiers: this.fixedModifiers.length > 0,
      armorMalus,
      hasPreRollContext: !!this.preRollContext,
      hasRequiredValue: !!this.requiredValue,
      // Both required inputs share one section, so it opens for either.
      hasContextSection: !!this.preRollContext || !!this.requiredValue || this.opposingAnsage || !!this.toggleModifier,
      requiredValue: this.requiredValue && {
        ...this.requiredValue,
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
          state: choice.value > 0 ? 'positive' : choice.value < 0 ? 'negative' : 'neutral',
        })),
        isTilePicker: this.preRollContext.control === 'tiles',
      },
      contextSelected: !!contextChoice,
      hasAnsagen: this.ansagen.length > 0,
      // Counted over the rendered rows, not the table: a group is one row
      // however many members it folds together.
      untrainedAnsagen: [...ansageGroups, ...ansageRows].filter((row) => row.untrained).length,
      ansageSummary: this._ansageSummary(this.object),
      hasOpposingAnsage: this.opposingAnsage,
      toggleModifier: this.toggleModifier && {
        ...this.toggleModifier,
        display: this._formatBonus(this.toggleModifier.value),
        checked: !!this.object.toggleModifier,
      },
      ansagen: ansageRows,
      ansageGroups,
      canSubmit: this._canSubmit(this.object),
      threshold: this._computeThreshold(this.object),
      ...this._oddsData(this.object),
      breakdown: this._breakdownText(this.object),
      targetLabel: game.i18n.localize('TNO.Roll.SubmitTargetLabel'),
      subject: game.i18n.format('TNO.Roll.Subject', { name: this.flavor }),
      // The bonus stepper (fixed mode aside), the rule modifiers and the "Idee
      // haben" toggle all live in the modifiers section; show it whenever any
      // of them applies.
      hasModifiers: !this.fixedValue || hasIdeaOption || this.fixedModifiers.length > 0 || !!armorMalus,
      bonusDisplay: this._formatBonus(bonus),
      bonusSignClass: this._bonusSignClass(bonus),
      bonusAtMin: bonus <= BONUS_MIN,
      bonusAtMax: bonus >= BONUS_MAX,
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
    data.selectedAttributeLabel = this.object.attributeA ? abilities[this.object.attributeA] : '';

    if (this.skill) {
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
    // "alle Manöver" and on nothing else, so it appears the moment an Ansage is
    // declared and vanishes again when the last one is cleared. It stays its own
    // component next to the armour step, never folded into it — three
    // requirements, three shapes.
    const fv = this.maneuverMalus && this._declaredAnsagen(data).length ? [this.maneuverMalus] : [];
    // A rule the *other* side announced, which the player confirms rather than
    // computes — today only 'Rüstung umgehen', which cancels the padding of the
    // Stelle it was declared on.
    const toggled = this.toggleModifier && data?.toggleModifier ? [this.toggleModifier] : [];
    return [...armor, ...fv, ...toggled];
  }

  /**
   * Every immutable modifier on this roll — the workflow's own and the ones
   * the form state brings in. The single list behind the threshold sum, the
   * live breakdown, the chat card's components and the message flags, so none
   * of the four can disagree with the others.
   * @param {object} data  Form data.
   * @returns {Array<{label: string, value: number, display: string}>}
   */
  _fixedModifierComponents(data) {
    return [
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
    return { label: this.requiredValue.componentLabel, value, display: this._formatBonus(value) };
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
   * Whether the reach advantage is currently declared, which is what the Starke
   * Angriffe need: "können nur verwendet werden, wenn der Angreifer den
   * Reichweitenvorteil hat".
   * @param {object} data  Form data with contextChoice.
   * @returns {boolean}
   */
  _hasReachAdvantage(data) {
    const choice = this._contextChoice(data);
    return !!choice && choice.value > 0;
  }

  /**
   * Whether this Manöver has actually been declared, and at what Betrag.
   *
   * Nothing is declared by default. An ungrouped Manöver says so with a Betrag
   * above zero; a grouped one says so by being the group's selection, because a
   * Betrag the rule names has no zero to mean "no" with.
   * @param {Object} entry  A row from `this.ansagen`.
   * @param {object} data   Form data.
   * @returns {number} The declared Betrag; 0 for anything not declared.
   */
  _ansageBetrag(entry, data) {
    if (entry.group) return data?.ansageGroups?.[entry.group] === entry.key ? entry.betrag : 0;
    return Math.max(0, Math.trunc(Number(data?.ansagen?.[entry.key]) || 0));
  }

  /**
   * The declared Ansagen, each priced against the rank that governs it.
   *
   * A Manöver whose precondition is unmet contributes nothing however large a
   * Betrag sits in its box, so an unusable declaration can never quietly cost
   * the roll anything.
   * @param {object} data  Form data with an `ansagen` map and an `ansageGroups` map.
   * @returns {Array<{key: string, label: string, effect: string, betrag: number, rank: number, cost: number}>}
   */
  _declaredAnsagen(data) {
    return this.ansagen
      .filter((entry) => !entry.requiresReach || this._hasReachAdvantage(data))
      .map((entry) => {
        const betrag = this._ansageBetrag(entry, data);
        return { ...entry, betrag, cost: ansageKosten(betrag, entry.rank) };
      })
      .filter((entry) => entry.cost > 0);
  }

  /**
   * One template row per independently declarable Manöver: what it is, what it
   * would cost the declarer, and what the other side is told.
   *
   * The read-out is the whole reason the block exists as its own control rather
   * than as more situational modifier: 1:1 up to the rank and 2:1 past it is
   * arithmetic nobody should have to do at the table, and the asymmetry between
   * what you pay and what they take is the part that surprises people.
   *
   * Grouped Manöver are not here — {@link _ansageGroupRows} renders them as the
   * single choice they are.
   * @param {object} data  Form data.
   * @returns {Array<Object>}
   */
  _ansageRows(data) {
    const reach = this._hasReachAdvantage(data);
    return this.ansagen.filter((entry) => !entry.group).map((entry) => {
      const blocked = entry.requiresReach && !reach;
      const betrag = this._ansageBetrag(entry, data);
      const cost = blocked ? 0 : ansageKosten(betrag, entry.rank);
      return {
        ...entry,
        betrag,
        blocked,
        // A Betrag beyond the rank costs double past it; saying so on the row
        // is what stops the surcharge from looking like a bug.
        overRank: !blocked && betrag > entry.rank,
        readout: blocked
          ? game.i18n.localize('TNO.Combat.AnsageNeedsReach')
          : cost > 0
            ? game.i18n.format('TNO.Combat.AnsageReadout', {
                cost: this._formatBonus(-cost),
                effect: game.i18n.format(entry.effect, { betrag }),
              })
            : '',
      };
    });
  }

  /**
   * One row per group of mutually exclusive Ansagen, as a picker whose empty
   * option is the default.
   *
   * Each option carries its own price because a grouped Betrag is fixed by the
   * rule and the rank never changes mid-dialog — so the cost of choosing is
   * knowable before choosing, which is the whole point of showing it.
   * @param {object} data  Form data.
   * @returns {Array<Object>}
   */
  _ansageGroupRows(data) {
    const rows = [];
    for (const [key, group] of Object.entries(ANSAGE_GROUPS)) {
      const members = this.ansagen.filter((entry) => entry.group === key);
      if (!members.length) continue;
      const chosen = data?.ansageGroups?.[key] ?? '';
      const selected = members.find((entry) => entry.key === chosen) ?? null;
      rows.push({
        key,
        label: game.i18n.localize(group.label),
        none: game.i18n.localize(group.none),
        // Folded away only when not one member is trained: a group with a single
        // usable option is still the option someone is looking for.
        untrained: members.every((entry) => entry.untrained),
        choices: members.map((entry) => ({
          key: entry.key,
          selected: entry === selected,
          label: game.i18n.format('TNO.Combat.AnsageOption', {
            label: entry.label,
            cost: this._formatBonus(-ansageKosten(entry.betrag, entry.rank)),
          }),
        })),
        readout: selected
          ? game.i18n.format('TNO.Combat.AnsageReadout', {
              cost: this._formatBonus(-ansageKosten(selected.betrag, selected.rank)),
              effect: game.i18n.format(selected.effect, { betrag: selected.betrag }),
            })
          : '',
      });
    }
    return rows;
  }

  /**
   * What the folded-up Ansagen block says about itself.
   *
   * A collapsed section that hides a −12 would be worse than no section at all,
   * so the header carries the count and the cost whenever anything is declared.
   * @param {object} data  Form data.
   * @returns {string}
   */
  _ansageSummary(data) {
    const component = this._ansageComponent(data);
    if (!component) return game.i18n.localize('TNO.Combat.AnsageNone');
    return game.i18n.format('TNO.Combat.AnsageSummary', {
      count: this._declaredAnsagen(data).length,
      cost: component.display,
    });
  }

  /**
   * The summed cost of every declared Ansage, as one signed component.
   *
   * One row rather than one per Manöver: what the threshold loses is a single
   * number the player is trading away, and the per-Manöver arithmetic is
   * already spelled out beside each box.
   * @param {object} data  Form data.
   * @returns {{label: string, value: number, display: string}|null}
   */
  _ansageComponent(data) {
    const declared = this._declaredAnsagen(data);
    if (!declared.length) return null;
    const value = -declared.reduce((sum, entry) => sum + entry.cost, 0);
    return {
      label: game.i18n.format('TNO.Combat.AnsageCost', { count: declared.length }),
      value,
      display: this._formatBonus(value),
    };
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
    const ansagen = this._ansageComponent(data)?.value ?? 0;
    const opposing = this._opposingAnsageComponent(data)?.value ?? 0;
    return base + fixedModifiers + context + required + ansagen + opposing + (Number(data.bonus) || 0) + this._ideaBonus(data);
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
    parts.push(...this._fixedModifierComponents(data).map((modifier) => `${modifier.label} ${modifier.display}`));
    const context = this._contextComponent(data);
    if (context) parts.push(`${context.label} ${context.display}`);
    const required = this._requiredValueComponent(data);
    if (required) parts.push(`${required.label} ${required.display}`);
    const ansagen = this._ansageComponent(data);
    if (ansagen) parts.push(`${ansagen.label} ${ansagen.display}`);
    const opposing = this._opposingAnsageComponent(data);
    if (opposing) parts.push(`${opposing.label} ${opposing.display}`);
    const bonus = Number(data.bonus) || 0;
    if (bonus !== 0) parts.push(`${game.i18n.localize('TNO.Roll.Bonus')} ${this._formatBonus(bonus)}`);
    const idea = this._ideaBonus(data);
    if (idea !== 0) parts.push(`${game.i18n.localize('TNO.Roll.IdeaComponent')} +${idea}`);
    return parts.join(' + ');
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
    const { oddsLabel, oddsPercent, oddsTooltip } = this._oddsData(new FormDataExtended(form).object);
    odds.textContent = oddsLabel;
    odds.dataset.tooltipHtml = oddsTooltip;
    odds.setAttribute('aria-label', `${game.i18n.localize('TNO.Roll.Odds.InfoLabel')}: ${oddsLabel}`);
    form.querySelector('.tno-odds-fill').style.width = `${oddsPercent}%`;
  }

  /**
   * Recompute and repaint everything downstream of a threshold-affecting
   * change: the threshold number, its breakdown line, the roll button's
   * echo, the odds readout, and a brief highlight so the change is noticed.
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
    this._refreshOdds(form);
    // The one row that comes and goes with the form state. It is rendered up
    // front and only shown or hidden here — injecting it would put a row into
    // a section this method otherwise never touches.
    const armorRow = form.querySelector('.tno-armor-malus');
    if (armorRow) armorRow.hidden = this._conditionalModifiers(data).length === 0;
    this._refreshAnsagen(form, data);
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !this._canSubmit(data);
    const box = form.querySelector('.tno-threshold-box');
    if (box) {
      box.classList.remove('tno-threshold-flash');
      void box.offsetWidth; // reflow so the animation restarts on rapid changes
      box.classList.add('tno-threshold-flash');
    }
  }

  /**
   * Repaint each Ansage row's read-out and its reach gate.
   *
   * Rows are rendered once and only updated here, the same way the armour malus
   * row is: which Manöver exist on a roll never changes while the dialog is
   * open, only what they cost and whether their precondition is met.
   * @param {HTMLFormElement} form
   * @param {object} data  Form data.
   */
  _refreshAnsagen(form, data) {
    if (!this.ansagen.length) return;
    for (const row of this._ansageRows(data)) {
      const element = form.querySelector(`.tno-ansage-row[data-ansage="${row.key}"]`);
      if (!element) continue;
      element.classList.toggle('tno-ansage-blocked', row.blocked);
      const input = element.querySelector('.tno-ansage-input');
      if (input) input.disabled = row.blocked;
      const readout = element.querySelector('.tno-ansage-readout');
      if (readout) {
        readout.textContent = row.readout;
        readout.classList.toggle('tno-ansage-over-rank', row.overRank);
      }
    }

    for (const row of this._ansageGroupRows(data)) {
      const readout = form.querySelector(`.tno-ansage-row[data-ansage-group="${row.key}"] .tno-ansage-readout`);
      if (readout) readout.textContent = row.readout;
    }

    // The header has to stay true while the block is folded shut, which is the
    // state it spends most of its life in.
    const summary = form.querySelector('.tno-ansagen-summary');
    if (summary) summary.textContent = this._ansageSummary(data);
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
    html.on('change', 'select[name="attributeA"], select[name="attributeB"], select[name="contextChoice"], input[name="contextChoice"], .tno-ansage-select', (ev) => this._refresh(ev.currentTarget.closest('form')));
    html.on('change input', 'input[name="skillValue"], input[name="requiredValue"], input[name="opposingAnsage"], .tno-ansage-input', (ev) => this._refresh(ev.currentTarget.closest('form')));
    html.on('change', 'input[name="toggleModifier"]', (ev) => this._refresh(ev.currentTarget.closest('form')));

    // Ansagen open and shut. Shut is the default because the Standardangriff is
    // the common case and it declares nothing — but the header keeps saying what
    // is inside, so folding it away never hides a cost.
    html.on('click', '.tno-ansagen-toggle', (ev) => {
      const section = ev.currentTarget.closest('.tno-roll-ansagen');
      const open = section?.classList.toggle('tno-ansagen-open');
      ev.currentTarget.setAttribute('aria-expanded', String(!!open));
      this.setPosition({ height: 'auto' });
    });

    // Reveal the Manöver whose Fertigkeit sits at rank 0. A class on the section
    // rather than form state: `_refresh` repaints values and never rows, so an
    // unfolded block stays unfolded while the player types in it.
    html.on('click', '.tno-ansage-more', (ev) => {
      ev.currentTarget.closest('.tno-roll-ansagen')?.classList.add('tno-ansagen-show-all');
      ev.currentTarget.remove();
    });
    html.on('change', 'input[name="useIdea"]', (ev) => {
      ev.currentTarget.closest('.tno-idea-toggle')?.classList.toggle('active', ev.currentTarget.checked);
      this._refresh(ev.currentTarget.closest('form'));
    });

    // Skill mode: the attribute is picked from a heatmap chip grid instead of
    // a select, so the player sees every attribute's value at once and can
    // freely swap to any other one. Weapon attacks lock this choice to their
    // authored WA and therefore omit the grid altogether.
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
    // dice are rolled, not the threshold — so the threshold preview stays put
    // (no flash on a number that did not move) and only the odds are rebuilt.
    bindAdvantagePicker(html, () => this._refreshOdds(html[0]));

    // A required combat context must be answered before the commit button is
    // useful; every other roll keeps the existing one-Enter default path. The
    // typed value comes first where both are asked: it is the fact the player
    // was just told, while the comparison is one they can work out themselves.
    const contextFocus = this.preRollContext?.control === 'tiles'
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
    const ansagen = this._ansageComponent(formData);
    const opposing = this._opposingAnsageComponent(formData);
    const declared = this._declaredAnsagen(formData);
    const components = [
      ...this._baseComponents(formData),
      ...this._fixedModifierComponents(formData),
      ...(context ? [context] : []),
      ...(required ? [required] : []),
      ...(ansagen ? [ansagen] : []),
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
        // What was declared, at the Betrag the *other* side is told — never the
        // cost, which is the declarer's own surcharge for out-declaring their
        // rank and no business of the defender's.
        ...(declared.length
          ? {
              ansagen: declared.map((entry) => ({
                key: entry.key,
                label: entry.label,
                effect: entry.effect,
                betrag: entry.betrag,
                cost: entry.cost,
                ...(entry.zone ? { zone: entry.zone } : {}),
              })),
            }
          : {}),
        // The A→B channel, as numbers the defender can act on without ever
        // reading this sheet.
        ...(this.envelope ? { envelope: { ...this.envelope, ...ansageEnvelope(declared) } } : {}),
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

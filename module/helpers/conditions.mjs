/**
 * The six damage-derived condition lights in their fixed 3x2 raster order.
 * Rows are damage kinds (Wuchtschaden, Schaden); columns are the affected
 * body/function area (core, legs, arms).
 *
 * Each carries a two-letter `tagKey` rather than a pictogram: the collection
 * mixes all nine conditions in one strip, where a shape has no row to be read
 * against and a zone's mild/severe pair would need two shapes a reader has to
 * learn first. An abbreviation of the condition's own name is read rather than
 * decoded, and it is localized because the words it abbreviates are.
 *
 * Each names what it costs (`effectKey`) without the system enforcing any of
 * it: the table applies these, the sheet only says them. The wording of record
 * is the Zustände table in the combat PRD.
 */
export const DAMAGE_CONDITION_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'bluntCore',
    kind: 'blunt',
    zone: 'core',
    ability: 'str',
    tagKey: 'TNO.Status.Tag.BluntCore',
    classification: 'negative',
    tone: 'mild',
    labelKey: 'TNO.Status.BluntCore',
    effectKey: 'TNO.Status.Effect.BluntCore',
  }),
  Object.freeze({
    key: 'bluntLegs',
    kind: 'blunt',
    zone: 'legs',
    ability: 'dex',
    tagKey: 'TNO.Status.Tag.BluntLegs',
    classification: 'negative',
    tone: 'mild',
    labelKey: 'TNO.Status.BluntLegs',
    effectKey: 'TNO.Status.Effect.BluntLegs',
  }),
  Object.freeze({
    key: 'bluntArms',
    kind: 'blunt',
    zone: 'arms',
    ability: 'fin',
    tagKey: 'TNO.Status.Tag.BluntArms',
    classification: 'negative',
    tone: 'mild',
    labelKey: 'TNO.Status.BluntArms',
    effectKey: 'TNO.Status.Effect.BluntArms',
  }),
  Object.freeze({
    key: 'sharpCore',
    kind: 'sharp',
    zone: 'core',
    ability: 'str',
    tagKey: 'TNO.Status.Tag.SharpCore',
    classification: 'negative',
    tone: 'severe',
    labelKey: 'TNO.Status.SharpCore',
    effectKey: 'TNO.Status.Effect.SharpCore',
  }),
  Object.freeze({
    key: 'sharpLegs',
    kind: 'sharp',
    zone: 'legs',
    ability: 'dex',
    tagKey: 'TNO.Status.Tag.SharpLegs',
    classification: 'negative',
    tone: 'severe',
    labelKey: 'TNO.Status.SharpLegs',
    effectKey: 'TNO.Status.Effect.SharpLegs',
  }),
  Object.freeze({
    key: 'sharpArms',
    kind: 'sharp',
    zone: 'arms',
    ability: 'fin',
    tagKey: 'TNO.Status.Tag.SharpArms',
    classification: 'negative',
    tone: 'severe',
    labelKey: 'TNO.Status.SharpArms',
    effectKey: 'TNO.Status.Effect.SharpArms',
  }),
]);

/**
 * The conditions outside the 3x2 raster, and what they have in common: each is
 * a consequence the system itself already applies, read back as a state.
 *
 * None of them takes an override. The raster's six lights are damage warnings
 * an owner may disagree with; these three are arithmetic — on the slot budget,
 * on the summed Stärkevoraussetzung, on the Haltung's defence list — and
 * forcing one on or off would only be forcing a wrong number.
 *
 * Their `effectKey` is picked from the state rather than fixed the way a
 * damage light's is, which is why an inactive one carries none: there is no
 * single answer to what a load that is not there would cost.
 */
export const CARRY_CONDITION_DEFINITION = Object.freeze({
  key: 'overloaded',
  source: 'carry',
  classification: 'negative',
  reasonKey: 'TNO.Status.CarryLoad',
});

const CARRY_STATE_PRESENTATION = Object.freeze({
  noSprint: Object.freeze({
    tone: 'mild',
    tagKey: 'TNO.Status.Tag.Loaded',
    labelKey: 'TNO.Status.Loaded',
    effectKey: 'TNO.Status.Effect.Loaded',
  }),
  crawlOnly: Object.freeze({
    tone: 'severe',
    tagKey: 'TNO.Status.Tag.Overloaded',
    labelKey: 'TNO.Status.Overloaded',
    effectKey: 'TNO.Status.Effect.Overloaded',
  }),
});

/**
 * Worn armour whose summed Stärkevoraussetzung the character does not meet.
 * One Malusstufe on every Beweglichkeitswurf, however far short — the graded
 * weapon SV rule is a different one and stays with the weapon.
 */
export const ARMOR_CONDITION_DEFINITION = Object.freeze({
  key: 'armorTooHeavy',
  source: 'armor',
  tagKey: 'TNO.Status.Tag.ArmorTooHeavy',
  classification: 'negative',
  // Mild: it is a step on one attribute, not a lost capability.
  tone: 'mild',
  labelKey: 'TNO.Status.ArmorTooHeavy',
  reasonKey: 'TNO.Status.ArmorSvShort',
  effectKey: 'TNO.Status.Effect.ArmorTooHeavy',
});

/**
 * A Haltung that does not permit Ausweichen. Severe, because a lost defence is
 * a lost capability rather than a price on one.
 *
 * The Haltung is chosen and can be changed on the spot, which is exactly why
 * the state is worth showing: unlike damage, it is on until someone notices.
 */
export const DEFENSE_CONDITION_DEFINITION = Object.freeze({
  key: 'noDodge',
  source: 'defense',
  tagKey: 'TNO.Status.Tag.NoDodge',
  classification: 'negative',
  tone: 'severe',
  labelKey: 'TNO.Status.NoDodge',
  reasonKey: 'TNO.Status.StanceBlocksDodge',
});

const ABILITY_LABEL_KEYS = Object.freeze({
  str: 'TNO.Ability.Str.long',
  dex: 'TNO.Ability.Dex.long',
  fin: 'TNO.Ability.Fin.long',
});

const POOL_LABEL_KEYS = Object.freeze({
  blunt: 'TNO.Damage.Blunt',
  sharp: 'TNO.Damage.Sharp',
});

function nonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function abilityValue(abilities, key) {
  const ability = abilities?.[key];
  return nonNegative(typeof ability === 'object' ? ability?.base : ability);
}

/**
 * Resolve the fixed damage-condition raster. Damage determines the default,
 * while a persisted boolean override can force one light on or off. Missing or
 * null overrides keep following the damage threshold.
 *
 * Conditions are warnings/read-outs only. They neither add to the damage malus
 * nor enforce their named consequence; the raw pools remain the sole source of
 * the global roll modifier.
 *
 * @param {object} damage A resolved damage result from `resolveDamage()`.
 * @param {object} abilities Actor abilities keyed by `str`, `dex`, and `fin`.
 * @param {object} overrides Persisted `system.conditionOverrides` booleans.
 * @returns {{items: object[], rows: object[][], active: object[], hasActive: boolean}}
 */
export function resolveDamageConditions(damage, abilities = {}, overrides = {}) {
  const poolValues = {
    blunt: nonNegative(damage?.blunt),
    // Converted Wuchtschaden has already become effective Schaden and must
    // therefore cross the same severe-condition thresholds as raw Schaden.
    sharp: nonNegative(damage?.effectiveSharp),
  };

  const items = DAMAGE_CONDITION_DEFINITIONS.map((definition) => {
    const value = poolValues[definition.kind];
    const threshold = abilityValue(abilities, definition.ability);
    const derivedActive = value > threshold;
    const rawOverride = overrides?.[definition.key];
    const override = typeof rawOverride === 'boolean' ? rawOverride : null;
    const active = override ?? derivedActive;

    return {
      ...definition,
      abilityLabelKey: ABILITY_LABEL_KEYS[definition.ability],
      poolLabelKey: POOL_LABEL_KEYS[definition.kind],
      value,
      threshold,
      derivedActive,
      override,
      manual: override !== null,
      active,
      suppressed: override === false,
      state: override === true
        ? 'manualActive'
        : override === false
          ? 'suppressed'
          : derivedActive
            ? 'derivedActive'
            : 'inactive',
    };
  });

  // The raster keeps Wucht above Schaden. The chip instead announces the
  // severe row first, then the mild row, while retaining core/legs/arms order.
  const rows = ['blunt', 'sharp'].map((kind) => items.filter((item) => item.kind === kind));
  const active = [
    ...items.filter((item) => item.kind === 'sharp' && item.active),
    ...items.filter((item) => item.kind === 'blunt' && item.active),
  ];

  return {
    items,
    rows,
    active,
    hasActive: active.length > 0,
  };
}

/**
 * Resolve the load condition from a `computeCarry()` result.
 *
 * Both degraded load states are the same condition at two severities rather
 * than two conditions: it is one fact about the budget, and carrying it as one
 * entry rather than two is what keeps the collection short.
 * The label follows the severity because "überlastet" is not what half a
 * budget means — at that point the character is merely loaded.
 *
 * `noContainer` is deliberately not a condition: it explains why the carried
 * band is outside the sum, which is a fact about the calculation rather than a
 * state the character is in.
 *
 * @param {object} carry A `computeCarry()` result.
 * @returns {object} One condition entry, shaped like the damage entries.
 */
export function resolveCarryCondition(carry = {}) {
  const presentation = CARRY_STATE_PRESENTATION[carry?.state] ?? null;
  const active = presentation !== null;

  return {
    ...CARRY_CONDITION_DEFINITION,
    tone: presentation?.tone ?? 'mild',
    // The tag abbreviates the label, so it follows the same severity switch:
    // half a budget is "beladen", not "überlastet".
    tagKey: presentation?.tagKey ?? 'TNO.Status.Tag.Overloaded',
    labelKey: presentation?.labelKey ?? 'TNO.Status.Overloaded',
    // Only an active load takes something away, so only an active one names a
    // consequence. An inactive entry with an effect would read as a threat.
    effectKey: presentation?.effectKey ?? null,
    carryState: carry?.state ?? 'ok',
    value: nonNegative(carry?.used),
    threshold: nonNegative(carry?.capacity),
    derivedActive: active,
    override: null,
    manual: false,
    active,
    suppressed: false,
    state: active ? 'derivedActive' : 'inactive',
  };
}

/**
 * Resolve the armour condition from the summed Stärkevoraussetzung.
 *
 * `penalty` is passed in rather than recomputed here: the comparison is already
 * the rule behind `derived.armorSvPenalty`, which the roll dialog and
 * `armorSvMalus()` read, and a second copy of it could drift from the first.
 * The two numbers travel along only so the panel can say what it compared.
 *
 * @param {{penalty?: boolean, sv?: number, strength?: number}} armor
 * @returns {object} One condition entry, shaped like the damage entries.
 */
export function resolveArmorCondition(armor = {}) {
  const active = armor?.penalty === true;

  return {
    ...ARMOR_CONDITION_DEFINITION,
    effectKey: active ? ARMOR_CONDITION_DEFINITION.effectKey : null,
    value: nonNegative(armor?.strength),
    threshold: nonNegative(armor?.sv),
    derivedActive: active,
    override: null,
    manual: false,
    active,
    suppressed: false,
    state: active ? 'derivedActive' : 'inactive',
  };
}

/**
 * Resolve the defence condition from what the current Haltung permits.
 *
 * What it costs depends on whether a parry is left, so the effect is picked
 * from the pair rather than fixed: in today's Haltungen every one that drops
 * Ausweichen drops the Parade with it, but that is a fact about the table and
 * not a rule, and a collection that said "only the parry remains" when none
 * did would be worse than saying nothing.
 *
 * @param {{dodge?: boolean, parry?: boolean, stanceLabelKey?: string}} defense
 * @returns {object} One condition entry, shaped like the damage entries.
 */
export function resolveDefenseCondition(defense = {}) {
  const active = defense?.dodge === false;

  return {
    ...DEFENSE_CONDITION_DEFINITION,
    effectKey: active
      ? defense?.parry
        ? 'TNO.Status.Effect.NoDodgeParryLeft'
        : 'TNO.Status.Effect.NoDodge'
      : null,
    stanceLabelKey: defense?.stanceLabelKey ?? null,
    derivedActive: active,
    override: null,
    manual: false,
    active,
    suppressed: false,
    state: active ? 'derivedActive' : 'inactive',
  };
}

const TONE_ORDER = Object.freeze(['severe', 'mild']);

/**
 * The complete condition collection behind the Zustände component: the six
 * damage warnings plus the three the rules apply on their own — load, armour
 * weight and a Haltung without Ausweichen.
 *
 * Those three join `items` and the severity-sorted `active` list but never
 * `rows` — the raster is the damage surface and its geometry is the six fixed
 * positions. Keeping them out is what lets the collection be the one place
 * every active condition is listed without the raster growing lights that
 * could not be clicked like the others.
 *
 * @param {object} damage A resolved damage result from `resolveDamage()`.
 * @param {object} abilities Actor abilities keyed by `str`, `dex`, and `fin`.
 * @param {object} overrides Persisted `system.conditionOverrides` booleans.
 * @param {{carry?: object, armor?: object, defense?: object}} state The derived
 *   state the non-damage conditions read.
 * @returns {{items: object[], rows: object[][], active: object[], hasActive: boolean}}
 */
export function resolveConditions(damage, abilities = {}, overrides = {}, state = {}) {
  const damageConditions = resolveDamageConditions(damage, abilities, overrides);
  // Ordered by how much of the character they take away: a lost defence, then
  // lost movement, then a step on one attribute. Within a severity that is the
  // order they are read in.
  const derived = [
    resolveDefenseCondition(state?.defense),
    resolveCarryCondition(state?.carry),
    resolveArmorCondition(state?.armor),
  ];

  // Severe before mild, as in the damage list. The sort is stable, so within a
  // severity the damage warnings keep their raster order and the derived ones
  // follow in the order above.
  const active = [...damageConditions.active, ...derived.filter((item) => item.active)].sort(
    (a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone)
  );

  return {
    ...damageConditions,
    items: [...damageConditions.items, ...derived],
    active,
    hasActive: active.length > 0,
  };
}

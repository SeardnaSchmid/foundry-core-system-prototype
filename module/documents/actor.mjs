import { computeCarry, resolveArmor } from '../helpers/inventory.mjs';

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class TnoActor extends Actor {
  /** @override */
  prepareData() {
    // Prepare data for the actor. Calling the super version of this executes
    // the following, in order: data reset (to clear active effects),
    // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
    // prepareDerivedData().
    super.prepareData();
  }

  /** @override */
  prepareBaseData() {
    // Must call super: core's Actor#prepareBaseData runs _clearData(), which
    // initializes `overrides`, `statuses`, `tokenActiveEffectChanges` and
    // `_completedActiveEffectPhases`. Without it, applyActiveEffects("initial")
    // throws during prepareEmbeddedDocuments ("Cannot set properties of
    // undefined (setting 'initial')"), which aborts preparation before
    // prepareDerivedData ever runs — leaving every actor with no derived data
    // and no active effects applied.
    super.prepareBaseData();

    // Data modifications in this step occur before processing embedded
    // documents or derived data.
  }

  /**
   * @override
   * Augment the actor source data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as ability modifiers rather than ability scores) and should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {
    const actorData = this;

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    this._prepareCharacterData(actorData);
    this._prepareNpcData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== 'character') return;

    const systemData = actorData.system;
    // Fall back to 0 for any key missing on actors created under an older
    // version of the schema, so a half-migrated actor degrades gracefully
    // instead of crashing prepareDerivedData (and the whole sheet) outright.
    // `value` is the current, damage-adjusted rating (what rolls use);
    // `base` is the trained/leveled rating, unaffected by damage.
    const value = (key) => systemData.abilities[key]?.value ?? 0;
    const base = (key) => systemData.abilities[key]?.base ?? 0;

    // Derived attributes, per the "Attribute" rules, are all computed from
    // the undamaged base rating so they stay stable regardless of temporary
    // attribute changes (damage, buffs, etc.) — "Abgeleitete Werte bleiben
    // gleich, auch mit temporären Attributen". `canSprint` is the one
    // deliberate exception: it compares value against base to detect
    // Beweglichkeit damage and block sprinting entirely.
    // The edge pool refills to its max (Willenskraft+Wissen)/2 whenever
    // derived data is recomputed; `problemSolving.spent` (the persisted key,
    // kept under its old name so existing actors need no migration) tracks how
    // many of those points have been used since the last refill/reset.
    const edgePoolMax = Math.ceil((base('wil') + base('wis')) / 2);
    const edgePoolSpent = Math.min(systemData.problemSolving?.spent ?? 0, edgePoolMax);

    // The two equipment axes. Worn armour resolves zone-by-zone against the
    // paper doll and is invisible to the slot sum; carried gear hits the slot
    // sum only while a container is present. See helpers/inventory.mjs.
    const carrySlots = 2 * base('str') + base('dex');
    const carry = computeCarry(
      actorData.items,
      systemData.equipment,
      systemData.hasContainer ?? true,
      carrySlots
    );
    const armor = resolveArmor(systemData.equipment, actorData.items);

    systemData.derived = {
      initiative: Math.ceil((2 * base('dex') + base('per')) / 3),
      movementWalk: base('dex'),
      movementSprint: 3 * base('dex'),
      movementCrawl: 1,
      // Sprinting needs both an undamaged Beweglichkeit and a load under half
      // the slot budget — either one alone is enough to rule it out.
      canSprint: value('dex') >= base('dex') && (carry.state === 'ok' || carry.state === 'noContainer'),
      carrySlots,
      carrySlotsUsed: carry.used,
      carryState: carry.state,
      armor: armor.zones,
      // The summed requirement of everything worn, in quarter steps.
      armorSv: armor.sv,
      // Falling short of the Stärkevorraussetzung costs one Malusstufe on
      // every Beweglichkeit roll — a single step however far short it is,
      // unlike the graded weapon SV rule. The sheet surfaces it as a warning
      // line. Stärke is a whole number, so a quarter-step SV is met only by
      // reaching the next whole value: SV 2.25 needs Stärke 3.
      armorSvPenalty: armor.sv > 0 && base('str') < armor.sv,
      sixthSense: Math.round((base('per') + base('emp') + base('inv')) / 3),
      // Unlike the other derived probes, dodge uses the damage-adjusted
      // Beweglichkeit (value, not base): a character with a hobbled leg
      // dodges worse right now, not just once the damage is healed.
      dodge: value('dex') + (systemData.skills?.acrobatics?.value ?? 0),
      insight: Math.ceil((base('int') + base('wis')) / 2),
      trialErrorMax: Math.ceil((base('int') + base('wil')) / 2),
      edgePoolMax: edgePoolMax,
      edgePool: Math.max(0, edgePoolMax - edgePoolSpent),
      postMortem: 2 * base('inv'),
    };
  }

  /**
   * Prepare NPC type specific data.
   */
  _prepareNpcData(actorData) {
    if (actorData.type !== 'npc') return;

    // Make modifications to data here. For example:
    const systemData = actorData.system;
    systemData.xp = systemData.cr * systemData.cr * 100;
  }

  /**
   * Override getRollData() that's supplied to rolls.
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const data = { ...this.system };

    // The combat tracker rolls TNO.initiativeFormula ("1d10 + @derived.initiative")
    // for *every* combatant, but only characters compute `derived` — an NPC (or a
    // character whose preparation was cut short) would leave the term unresolved
    // and the initiative roll would throw. Fall back to a flat 0 bonus instead.
    data.derived = { initiative: 0, ...data.derived };

    // Prepare character roll data.
    this._getCharacterRollData(data);
    this._getNpcRollData(data);

    return data;
  }

  /**
   * Prepare character roll data.
   */
  _getCharacterRollData(data) {
    if (this.type !== 'character') return;

    // Copy the ability scores to the top level, so that rolls can use
    // formulas like `@str.mod + 4`.
    if (data.abilities) {
      for (let [k, v] of Object.entries(data.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
  }

  /**
   * Prepare NPC roll data.
   */
  _getNpcRollData(data) {
    if (this.type !== 'npc') return;

    // Process additional NPC data here.
  }
}

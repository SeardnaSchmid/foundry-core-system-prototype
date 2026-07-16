/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class JosterActor extends Actor {
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
    const systemData = actorData.system;
    const flags = actorData.flags.joster || {};

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

    // Derived attributes, per the "Attribute" rules. Movement ranges use the
    // undamaged base Beweglichkeit ("Bewegungsreichweiten ändern sich nie");
    // any Beweglichkeit damage instead blocks sprinting entirely.
    // The reserve pool refills to its max (Willenskraft+Wissen)/2 whenever
    // derived data is recomputed; `problemSolving.spent` tracks how many of
    // those points have been used since the last refill/reset.
    const solveReserveMax = Math.ceil((value('wil') + value('wis')) / 2);
    const solveReserveSpent = Math.min(systemData.problemSolving?.spent ?? 0, solveReserveMax);

    // Carried slots used so far: each carried item (type "item") occupies
    // its `weight` field times how many are carried.
    const carrySlotsUsed = actorData.items
      .filter((item) => item.type === 'item')
      .reduce((sum, item) => sum + (item.system.weight ?? 0) * (item.system.quantity ?? 1), 0);

    systemData.derived = {
      initiative: Math.ceil((2 * value('dex') + value('per')) / 3),
      movementWalk: base('dex'),
      movementSprint: 3 * base('dex'),
      movementCrawl: 1,
      canSprint: value('dex') >= base('dex'),
      carrySlots: 2 * value('str') + value('dex'),
      carrySlotsUsed,
      sixthSense: Math.round((value('per') + value('emp') + value('inv')) / 3),
      solveIdea: Math.ceil((value('int') + value('wis')) / 2),
      solveFindFlaw: Math.ceil((value('int') + value('wil')) / 2),
      solveReserveMax: solveReserveMax,
      solveReserve: Math.max(0, solveReserveMax - solveReserveSpent),
      solveAnalyzeFlaw: 2 * value('inv'),
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

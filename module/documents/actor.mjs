import { ARMOR_ADDON_ZONES, computeCarry, resolveArmor } from '../helpers/inventory.mjs';
import {
  MANEUVER_UNARMED_KEY,
  armorPenetrationChoices,
  maneuverWeaponChoices,
} from '../helpers/items.mjs';
import { getSkillDefinitions } from '../helpers/skills.mjs';

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
   * Open the resistance roll of one hit location: Stärke + RW(Stelle) − the
   * damage value the attacker announced, plus a Bonusstufe when the armour is
   * harder than what the weapon brings through it.
   *
   * The defender's sheet knows no attacker, and this method deliberately does
   * not try to become one: it neither determines the hit location — the player
   * states it by clicking one — nor applies any damage. Both numbers it cannot
   * know are asked for: the Schadenswert as a typed value, the RH-versus-RB/RD
   * comparison as a choice.
   *
   * Stärke enters at its damage-adjusted `value`, not its trained `base`. The
   * `base` axis is for requirements ("did you train up to what this gear
   * demands"); resisting a blow is a statement about performance right now, the
   * same reading `derived.dodge` already takes.
   *
   * The dialog is reached through `game.tno.TnoRollDialog` rather than by
   * importing it, which keeps `documents/` from reaching up into `apps/`.
   *
   * @param {string} zone  One of the four addon zones. The Unterkleidung is not
   *   a hit location — it applies in all four at once — and is refused.
   * @returns {TnoRollDialog|void}
   */
  openResistanceCheck(zone) {
    if (!this.isOwner || !ARMOR_ADDON_ZONES.includes(zone)) return;
    const armor = this.system.derived?.armor?.[zone];
    if (!armor) return;

    const zoneLabel = game.i18n.localize(CONFIG.TNO.armorZones[zone]);
    return new game.tno.TnoRollDialog(this, {
      attributeA: 'str',
      lockAttribute: true,
      // Already summed over the Unterkleidung and this zone's addon by
      // `resolveArmor`, which is the value the paper doll shows.
      fixedModifiers: [
        { label: game.i18n.format('TNO.Combat.ResistanceRw', { zone: zoneLabel }), value: armor.rw },
      ],
      requiredValue: {
        label: game.i18n.localize('TNO.Combat.DamageValue'),
        componentLabel: game.i18n.localize('TNO.Combat.DamageValue'),
        sign: -1,
        min: 0,
      },
      preRollContext: {
        label: game.i18n.localize('TNO.Combat.Penetration.Label'),
        placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
        control: 'tiles',
        tileLabels: true,
        tileColumns: 3,
        choices: armorPenetrationChoices().map((choice) => ({
          ...choice,
          label: game.i18n.localize(`TNO.Combat.Penetration.${choice.key.charAt(0).toUpperCase()}${choice.key.slice(1)}`),
          componentLabel: game.i18n.localize('TNO.Combat.Penetration.Label'),
        })),
      },
      flavor: game.i18n.format('TNO.Combat.ResistanceFlavor', { zone: zoneLabel }),
    }).render(true);
  }

  /**
   * The required choice every Manöver opens with: which weapon it is declared
   * with, and what that weapon's FV shortfall costs it.
   *
   * A `select`, not the tile picker the two weapon workflows use. Those are
   * fixed-arity, value-first pickers where the signed number is the content;
   * a weapon list is name-first and unbounded, and the select already reads
   * "Langschwert (−3)", which is exactly the right way round.
   *
   * @returns {{label: string, placeholder: string, control: 'select', choices: Array<{key: string, label: string, value: number, componentLabel: string}>}}
   */
  maneuverPreRollContext() {
    const definitions = getSkillDefinitions(this);
    const choices = maneuverWeaponChoices(this, this.items, (key) => !!definitions[key]);
    return {
      label: game.i18n.localize('TNO.Combat.ManeuverWeapon'),
      placeholder: game.i18n.localize('TNO.Combat.ManeuverWeaponPlaceholder'),
      control: 'select',
      choices: choices.map((choice) => {
        // Only the unarmed entry carries an i18n key as its name; every other
        // one carries what the player called the weapon.
        const label = choice.key === MANEUVER_UNARMED_KEY ? game.i18n.localize(choice.name) : choice.name;
        return {
          key: choice.key,
          label,
          value: choice.value,
          componentLabel: game.i18n.format('TNO.Combat.FvMalusFor', { weapon: label }),
        };
      }),
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

import { describe, it, expect } from 'vitest';
import {
  armorPenetrationChoices,
  armorSvMalus,
  armorZones,
  maneuverWeaponChoices,
  canWeaponAttack,
  canWeaponParry,
  clampGearNumber,
  cycleRangeModifier,
  hasRole,
  inventoryIcon,
  isGear,
  itemRoles,
  missingRequired,
  normalizeConsumableEffects,
  scaleCells,
  selectRole,
  toggleZone,
  usesMelee,
  usesRanged,
  weaponAttribute,
  weaponBaseStrength,
  weaponDkDifferenceChoices,
  weaponHandlingModifier,
  weaponRangeChoices,
  requirementMalusSteps,
  weaponRequirementStatus,
  weaponSkillRank,
  weaponUse,
} from '../../module/helpers/items.mjs';

/** An item on the role model, i.e. one the migration has already touched. */
const item = (roles = {}, system = {}) => ({
  name: 'Ding',
  type: 'item',
  system: {
    roles: { weapon: false, armor: false, consumable: false, ...roles },
    ...system,
  },
});

/** A piece of gear as it was stored before roles existed. */
const legacy = (type, system = {}) => ({ name: 'Altbestand', type, system });

describe('itemRoles', () => {
  it('reads the stored roles', () => {
    expect(itemRoles(item({ armor: true }))).toEqual({
      weapon: false,
      armor: true,
      consumable: false,
    });
  });

  it('falls back to the legacy type when nothing is stored', () => {
    expect(itemRoles(legacy('armor')).armor).toBe(true);
    expect(itemRoles(legacy('weapon')).weapon).toBe(true);
    expect(itemRoles(legacy('item'))).toEqual({ weapon: false, armor: false, consumable: false });
  });

  // The distinction the fallback turns on: a player who switched the last chip
  // off must not have it switched back on for them.
  it('does not fall back once roles are stored, even when all are false', () => {
    expect(itemRoles({ type: 'armor', system: { roles: {} } }).armor).toBe(false);
  });

  it('answers for a feature without inventing a role', () => {
    expect(hasRole(legacy('feature'), 'weapon')).toBe(false);
    expect(isGear(legacy('feature'))).toBe(false);
    expect(isGear(legacy('weapon'))).toBe(true);
  });
});

describe('selectRole', () => {
  const none = { weapon: false, armor: false, consumable: false };

  it('picks a role when nothing is chosen yet', () => {
    expect(selectRole(none, 'armor')).toEqual({ ...none, armor: true });
  });

  it('replaces the role rather than adding to it', () => {
    expect(selectRole({ ...none, weapon: true }, 'consumable')).toEqual({
      ...none,
      consumable: true,
    });
  });

  // The way back to a plain object with no role, which is what an item starts
  // as and therefore has to stay reachable.
  it('clears the selection when the chosen role is picked again', () => {
    expect(selectRole({ ...none, armor: true }, 'armor')).toEqual(none);
  });

  // Only reachable from data written before the roles became exclusive. Either
  // click resolves it: an off chip claims the item outright, an on chip clears
  // the lot — which is the same rule as everywhere else, and leaves the piece
  // one click from correct rather than in a state no chip can undo.
  it('resolves a piece that somehow holds two roles', () => {
    const both = { weapon: true, armor: true, consumable: false };
    expect(selectRole(both, 'consumable')).toEqual({ ...none, consumable: true });
    expect(selectRole(both, 'armor')).toEqual(none);
  });

  it('leaves the roles alone when handed something that is not one', () => {
    expect(selectRole({ ...none, weapon: true }, 'vehicle')).toEqual({ ...none, weapon: true });
  });
});

describe('armorZones', () => {
  it('lists the location a piece covers', () => {
    expect(armorZones(item({ armor: true }, { zone: 'torso' }))).toEqual(['torso']);
  });

  it('is empty for anything without the armour role', () => {
    expect(armorZones(item({ weapon: true }, { zone: 'torso' }))).toEqual([]);
  });

  it('drops zones that are not hit locations', () => {
    expect(armorZones(item({ armor: true }, { zone: 'tail' }))).toEqual([]);
  });
});

describe('toggleZone', () => {
  it('adds and removes a location', () => {
    expect(toggleZone(null, 'torso')).toBe('torso');
    expect(toggleZone('torso', 'torso')).toBe(null);
  });

  it('replaces the previous location', () => {
    expect(toggleZone('head', 'torso')).toBe('torso');
  });

  it('ignores a zone that does not exist', () => {
    expect(toggleZone('torso', 'tail')).toBe('torso');
  });
});

describe('weaponUse', () => {
  it('defaults to melee for anything unset or unrecognised', () => {
    expect(weaponUse({})).toBe('melee');
    expect(weaponUse({ use: 'thrown' })).toBe('melee');
  });

  it('keeps melee and ranged authoring profiles exclusive', () => {
    expect(usesRanged({ use: 'melee' })).toBe(false);
    expect(usesMelee({ use: 'ranged' })).toBe(false);
    expect(usesRanged({ use: 'ranged' })).toBe(true);
    expect(usesMelee({ use: 'melee' })).toBe(true);
  });
});

describe('weaponAttribute', () => {
  it('accepts every primary attribute, defaulting legacy weapons to Strength', () => {
    expect(weaponAttribute({ wa: 'str' })).toBe('str');
    expect(weaponAttribute({ wa: 'fin' })).toBe('fin');
    expect(weaponAttribute({ wa: 'dex' })).toBe('dex');
    expect(weaponAttribute({ wa: 'inv' })).toBe('inv');
    expect(weaponAttribute({ wa: 'tail' })).toBe('str');
    expect(weaponAttribute({})).toBe('str');
  });
});

describe('weapon roll helpers', () => {
  const actor = ({ skill = 0, strengthBase = 4, strengthCurrent = strengthBase } = {}) => ({
    system: {
      abilities: { str: { base: strengthBase, value: strengthCurrent } },
      skills: { swords: { value: skill } },
    },
  });
  const system = (overrides = {}) => ({
    use: 'melee',
    fv: { skill: 'swords', rank: 2 },
    wa: 'fin',
    sv: 4,
    dk: 3,
    hh: { active: 2, passive: -1 },
    range: { sn: null, near: null, mid: null, far: null, sf: null },
    ...overrides,
  });

  it('uses the actor skill rank, not the item FV requirement', () => {
    expect(weaponSkillRank(actor({ skill: 5 }), system({ fv: { skill: 'swords', rank: 1 } }))).toBe(5);
  });

  // "eine Malusstufe … und eine weitere für je 2 weitere Punkte darunter": the
  // further points are counted from the one that already cost the first step,
  // so the ladder is the rounded-up half of the shortfall.
  it('grades a shortfall one step per two points, rounded up', () => {
    expect(requirementMalusSteps(2, 2)).toBe(0);
    expect(requirementMalusSteps(3, 2)).toBe(0);
    expect(requirementMalusSteps(1, 2)).toBe(1);
    expect(requirementMalusSteps(0, 2)).toBe(1);
    expect(requirementMalusSteps(-1, 2)).toBe(2);
    expect(requirementMalusSteps(-2, 2)).toBe(2);
    expect(requirementMalusSteps(-3, 2)).toBe(3);
    // The table's own worst case: SV 10 met with Strength 1.
    expect(requirementMalusSteps(1, 10)).toBe(5);
  });

  it('reports FV and SV separately, and never grades FV', () => {
    // FV 2 / SV 4. Rank 0 is 2 short and Strength 0 is 4 short, but only SV
    // climbs: "alle Manöver mit einem Malus" is one step however far under.
    expect(weaponRequirementStatus(actor({ skill: 0, strengthBase: 0 }), system()))
      .toMatchObject({ fvSteps: 1, svSteps: 2, fvMalus: -3, svMalus: -6 });

    // Each requirement stands alone: missing one says nothing about the other.
    expect(weaponRequirementStatus(actor({ skill: 1, strengthBase: 5 }), system()))
      .toMatchObject({ fvSteps: 1, svSteps: 0, svMalus: 0 });
    expect(weaponRequirementStatus(actor({ skill: 2, strengthBase: 3 }), system()))
      .toMatchObject({ fvSteps: 0, svSteps: 1, fvMalus: 0 });
    expect(weaponRequirementStatus(actor({ skill: 2, strengthBase: 4 }), system()))
      .toMatchObject({ fvSteps: 0, svSteps: 0, fvMalus: 0, svMalus: 0 });
  });

  it('checks weapon SV against base Strength, not its current temporary value', () => {
    const status = weaponRequirementStatus(actor({ skill: 2, strengthBase: 3, strengthCurrent: 8 }), system({ sv: 4 }));
    expect(weaponBaseStrength(actor({ strengthBase: 3, strengthCurrent: 8 }))).toBe(3);
    expect(status.svMet).toBe(false);
    expect(status.svMalus).toBe(-3);
  });

  it('selects active versus passive handling without changing either value', () => {
    const profile = system({ hh: { active: 3, passive: -2 } });
    expect(weaponHandlingModifier(profile, 'active')).toBe(3);
    expect(weaponHandlingModifier(profile, 'passive')).toBe(-2);
  });

  it('offers only authored ranged bands and preserves their modifiers', () => {
    expect(weaponRangeChoices(system({
      use: 'ranged',
      range: { sn: -3, near: null, mid: 0, far: 3, sf: null },
    }))).toEqual([
      { key: 'sn', value: -3 },
      { key: 'mid', value: 0 },
      { key: 'far', value: 3 },
    ]);
  });

  // Reach is a comparison, not a scale: "+3 erleichtert wenn man den längeren
  // hat". A DK gap of four is worth exactly what a gap of one is worth, so the
  // picker must not offer a number the rule cannot produce.
  it('offers the reach advantage as three outcomes, not a range', () => {
    expect(weaponDkDifferenceChoices().map((choice) => choice.value)).toEqual([-3, 0, 3]);
  });

  it('requires attack context while keeping Parry melee-only', () => {
    expect(canWeaponAttack(system())).toBe(true);
    expect(canWeaponAttack(system({ dk: null }))).toBe(false);
    expect(canWeaponParry(system({ dk: null }))).toBe(true);
    expect(canWeaponParry(system({ use: 'ranged', range: { near: 0 } }))).toBe(false);
    expect(canWeaponAttack(system({ use: 'ranged', range: { near: null } }))).toBe(false);
    expect(canWeaponAttack(system({ use: 'ranged', range: { near: 0 } }))).toBe(true);
    expect(canWeaponAttack(system(), { skillDefined: false })).toBe(false);
  });
});

describe('armour SV malus', () => {
  const actor = (penalised) => ({ system: { derived: { armorSvPenalty: penalised } } });

  // "Eine Malusstufe auf alle Beweglichkeitswürfe": the rule names the
  // attribute, not the workflow, so the attribute is what decides.
  it('costs one flat step on a Beweglichkeit roll and nothing on any other attribute', () => {
    expect(armorSvMalus(actor(true), ['dex'])).toBe(-3);
    expect(armorSvMalus(actor(true), ['str'])).toBe(0);
    expect(armorSvMalus(actor(true), [])).toBe(0);
  });

  // Ability mode's two slots are peers, so Stärke + Beweglichkeit is a
  // Beweglichkeitswurf — but filling both slots with it is still one roll.
  it('costs the same one step however many Beweglichkeit slots a roll fills', () => {
    expect(armorSvMalus(actor(true), ['str', 'dex'])).toBe(-3);
    expect(armorSvMalus(actor(true), ['dex', 'dex'])).toBe(-3);
  });

  it('costs nothing while the summed requirement is met', () => {
    expect(armorSvMalus(actor(false), ['dex'])).toBe(0);
    expect(armorSvMalus({ system: {} }, ['dex'])).toBe(0);
  });
});

describe('armour penetration outcomes', () => {
  // "Rüstung härter als RB/RD: Widerstandswurf +3". The other two rows of the
  // damage table change which Schadenswert is taken, not the threshold.
  it('offers the penetration comparison as three outcomes, only the hardest worth a bonus step', () => {
    expect(armorPenetrationChoices().map((choice) => [choice.key, choice.value])).toEqual([
      ['softer', 0],
      ['equal', 0],
      ['harder', 3],
    ]);
  });

  it('names the damage value each penetration outcome calls for', () => {
    expect(armorPenetrationChoices().map((choice) => choice.damage)).toEqual(['ss', 'ws', 'ws']);
  });
});

describe('Manöver weapon choices', () => {
  const actor = ({ skill = 5, strength = 4 } = {}) => ({
    system: {
      abilities: { str: { base: strength, value: strength } },
      skills: { swords: { value: skill } },
    },
  });

  const weapon = (id, name, overrides = {}) => ({
    id,
    name,
    system: {
      roles: { weapon: true },
      use: 'melee',
      wa: 'fin',
      fv: { skill: 'swords', rank: 0 },
      sv: 0,
      dk: 3,
      hh: { active: 0, passive: 0 },
      ...overrides,
    },
  });

  it('leads the Manöver weapon list with the unarmed option, which costs nothing', () => {
    expect(maneuverWeaponChoices(actor(), [])).toEqual([
      { key: 'unarmed', name: 'TNO.Combat.ManeuverUnarmed', value: 0 },
    ]);
  });

  it('prices a weapon whose FV rank the character misses at one flat step', () => {
    // Rank 5 against FV 9 is four short, and still one step: the FV rule is a
    // flat "alle Manöver mit einem Malus", never a ladder.
    const choices = maneuverWeaponChoices(actor({ skill: 5 }), [
      weapon('blade', 'Langschwert', { fv: { skill: 'swords', rank: 9 } }),
    ]);
    expect(choices.at(-1)).toEqual({ key: 'blade', name: 'Langschwert', value: -3 });
  });

  it('keeps a weapon whose FV is met on the list at no cost', () => {
    // Unlike a weapon roll's own modifiers, which omit a met requirement: here
    // naming the weapon is the answer to a mandatory question.
    const choices = maneuverWeaponChoices(actor({ skill: 5 }), [
      weapon('blade', 'Langschwert', { fv: { skill: 'swords', rank: 2 } }),
    ]);
    expect(choices.at(-1)).toEqual({ key: 'blade', name: 'Langschwert', value: 0 });
  });

  it('leaves half-authored gear off the Manöver weapon list', () => {
    const choices = maneuverWeaponChoices(actor(), [
      // No Distanzklasse and no parry-capable profile at all: nothing to declare.
      weapon('draft', 'Rohentwurf', { dk: null, use: 'ranged', range: {} }),
      // Armour is not a weapon, whatever else it is authored with.
      { id: 'plate', name: 'Brustpanzer', system: { roles: { armor: true }, zone: 'torso', rh: 4, ra: 5 } },
      // The FV skill exists on the item but not on this actor.
      weapon('exotic', 'Fremdwaffe', { fv: { skill: 'gunKata', rank: 1 } }),
    ], (key) => key === 'swords');
    expect(choices.map((choice) => choice.key)).toEqual(['unarmed']);
  });
});

describe('inventoryIcon', () => {
  it('distinguishes every physical inventory role', () => {
    expect(inventoryIcon(item({ weapon: true }, { use: 'ranged' }))).toBe('fa-crosshairs');
    expect(inventoryIcon(item({ weapon: true }, { use: 'melee' }))).toBe('fa-sword');
    expect(inventoryIcon(item({ armor: true }))).toBe('fa-shield-halved');
    expect(inventoryIcon(item({ consumable: true }))).toBe('fa-flask');
    expect(inventoryIcon(item())).toBe('fa-cube');
  });
});

describe('cycleRangeModifier', () => {
  it('cycles through the four rule-backed range states in both directions', () => {
    expect(cycleRangeModifier(null)).toBe(-3);
    expect(cycleRangeModifier(-3)).toBe(0);
    expect(cycleRangeModifier(0)).toBe(3);
    expect(cycleRangeModifier(3)).toBe(null);
    expect(cycleRangeModifier(null, -1)).toBe(3);
  });
});

describe('scaleCells', () => {
  it('spans the band the rules table documents', () => {
    expect(scaleCells('dk', 2).map((cell) => cell.value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(scaleCells('rd', 1)).toHaveLength(10);
  });

  it('selects the cell holding the value', () => {
    expect(scaleCells('dk', 2).filter((cell) => cell.selected)).toEqual([
      { value: 2, selected: true },
    ]);
  });

  // The whole reason the bands are nullable: not filled in and set to the
  // lowest step are different answers, and `Number(null)` is 0.
  it('selects nothing when the value is unset', () => {
    expect(scaleCells('rw', null).some((cell) => cell.selected)).toBe(false);
    expect(scaleCells('rw', 0).some((cell) => cell.selected)).toBe(true);
  });
});

describe('clampGearNumber', () => {
  it('enforces structural authoring bounds', () => {
    expect(clampGearNumber('system.quantity', -2)).toBe(0);
    expect(clampGearNumber('system.slots', 9)).toBe(4);
    expect(clampGearNumber('system.hh.active', -8)).toBe(-3);
    expect(clampGearNumber('system.hh.passive', 8)).toBe(3);
  });

  it('preserves empty and intentionally unbounded fields', () => {
    expect(clampGearNumber('system.price', '')).toBe('');
    expect(clampGearNumber('system.range.near', 99)).toBe(99);
  });
});

describe('missingRequired', () => {
  const complete = { slots: 2, price: 40 };

  it('is satisfied by a plain object with its required basics', () => {
    expect(missingRequired(item({}, complete))).toEqual([]);
  });

  it('names each basic that is blank', () => {
    expect(missingRequired({ name: '  ', type: 'item', system: { roles: {} } }).sort()).toEqual(
      ['name', 'slots'].sort()
    );
  });

  it('does not require a base price or availability', () => {
    expect(missingRequired(item({}, { ...complete, price: null, availability: null }))).toEqual([]);
  });

  it('asks a weapon only for the values its use has', () => {
    const melee = missingRequired(
      item({ weapon: true }, { ...complete, use: 'melee', fv: { skill: 'brawling', rank: 0 }, wa: 'str', rb: 3, ss: { count: 2 }, dk: 2 })
    );
    expect(melee).toEqual([]);

    const ranged = missingRequired(
      item({ weapon: true }, { ...complete, use: 'ranged', fv: { skill: 'shooting', rank: 0 }, wa: 'per', rd: 3, ss: { count: 2 } })
    );
    // No DK is asked of a rifle; a band is.
    expect(ranged).toEqual(['range']);
  });

  it('accepts a ranged weapon with a single band filled in', () => {
    const system = {
      ...complete,
      use: 'ranged',
      fv: { skill: 'shooting', rank: 0 },
      wa: 'per',
      rd: 3,
      ss: { count: 2 },
      range: { sn: null, near: 0, mid: null, far: null, sf: null },
    };
    expect(missingRequired(item({ weapon: true }, system))).toEqual([]);
  });

  it('requires both FV and WA for a weapon', () => {
    const profile = { ...complete, use: 'melee', rb: 3, ss: { count: 2 }, dk: 2 };
    expect(missingRequired(item({ weapon: true }, profile)).sort()).toEqual(['fv', 'wa']);
    expect(missingRequired(item({ weapon: true }, { ...profile, fv: { skill: 'brawling', rank: 0 }, wa: 'str' }))).toEqual([]);
  });

  it('asks armour for a location, hardness and coverage', () => {
    expect(missingRequired(item({ armor: true }, complete)).sort()).toEqual(['ra', 'rh', 'zone']);
    expect(
      missingRequired(item({ armor: true }, { ...complete, zone: 'torso', rh: 4, ra: 5 }))
    ).toEqual([]);
  });

  it('asks the Unterkleidung for neither, having a fixed RH 0 and no location to cover', () => {
    expect(missingRequired(item({ armor: true }, { ...complete, zone: 'suit' }))).toEqual([]);
  });

  it('asks a consumable for at least one described effect', () => {
    expect(missingRequired(item({ consumable: true }, complete))).toEqual(['effects']);
    expect(missingRequired(item({ consumable: true }, { ...complete, consumableEffects: [{ text: 'Heilt 2W.' }] }))).toEqual([]);
    expect(missingRequired(item({ consumable: true }, {
      ...complete,
      consumableEffects: { 0: { text: 'Legacy effect' } },
    }))).toEqual([]);
  });
});

describe('normalizeConsumableEffects', () => {
  it('normalizes indexed objects and old single-text values', () => {
    expect(normalizeConsumableEffects({
      consumableEffects: { 0: { id: 'kept', text: 'First' }, 1: { text: 'Second' } },
    })).toEqual([
      { id: 'kept', text: 'First' },
      { id: 'legacy-1', text: 'Second' },
    ]);
    expect(normalizeConsumableEffects({ consumableEffects: 'Old effect' }))
      .toEqual([{ id: 'legacy-0', text: 'Old effect' }]);
    expect(normalizeConsumableEffects({ consumableEffects: 4 })).toEqual([]);
  });
});

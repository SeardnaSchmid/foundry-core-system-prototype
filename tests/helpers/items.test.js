import { describe, it, expect } from 'vitest';
import {
  armorZones,
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

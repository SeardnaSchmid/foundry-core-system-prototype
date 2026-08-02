import { describe, expect, it } from 'vitest';
import {
  buildGearPresentation,
  buildGearSummary,
  buildPenetrationProfile,
  buildRangeProfile,
  buildSlotPresentation,
  buildStrengthPresentation,
  damagePresentation,
} from '../../module/helpers/item-presentation.mjs';

const weapon = (system = {}) => ({
  id: 'weapon-1',
  type: 'item',
  system: { roles: { weapon: true, armor: false, consumable: false }, quantity: 1, slots: 2, ...system },
});

describe('item presentation', () => {
  it('formats damage as a count of standard damage dice', () => {
    expect(damagePresentation({ count: 2, die: 'd8' })).toEqual({ count: 2, label: '2W' });
  });

  it('preserves unavailable, negative, neutral, and positive range bands', () => {
    expect(buildRangeProfile({ range: { sn: null, near: -2, mid: 0, far: 3, sf: 1 } }))
      .toMatchObject([
        { band: 'sn', state: 'unavailable', available: false },
        { band: 'near', state: 'negative', value: -2 },
        { band: 'mid', state: 'neutral', value: 0 },
        { band: 'far', state: 'positive', value: 3, height: 32 },
        { band: 'sf', state: 'positive', value: 1 },
      ]);
  });

  it('splits RH around RD without assigning an unresolved damage outcome', () => {
    expect(buildPenetrationProfile({ use: 'ranged', rd: 5, ss: { count: 4, die: 'd6' }, ws: { count: 2, die: 'd6' } }))
      .toEqual({
        key: 'rd',
        value: 5,
        segments: [
          { key: 'below', from: 0, to: 4, size: 5, single: false },
          { key: 'equal', from: 5, to: 5, size: 1, single: true },
          { key: 'above', from: 6, to: 10, size: 5, single: false },
        ],
        ss: { count: 4, label: '4W' },
        ws: { count: 2, label: '2W' },
      });
  });

  it('adds owner context to slot and Strength presentations', () => {
    const actor = {
      system: {
        abilities: { str: { base: 3 } },
        derived: { carrySlots: 14, carrySlotsUsed: 6, carryState: 'ok' },
        equipment: {},
      },
    };
    expect(buildSlotPresentation(weapon({ quantity: 2, slots: 3 }), actor))
      .toMatchObject({ cost: 6, used: 6, capacity: 14, remaining: 8, contextual: true });
    expect(buildStrengthPresentation(weapon({ sv: 6 }), actor))
      .toEqual({ required: 6, actual: 3, contextual: true, met: false });
  });

  it('builds one role-aware presentation object', () => {
    expect(buildGearPresentation(weapon({ use: 'ranged', zone: 'head' }), null))
      .toMatchObject({ roles: { weapon: true }, use: 'ranged', zones: [], ownership: { embedded: false } });
  });

  it('builds compact melee and ranged summaries without localization globals', () => {
    expect(buildGearSummary(weapon({
      use: 'melee',
      quantity: 2,
      fv: { skill: 'brawling', rank: 4 },
      dk: 3,
      rb: 2,
      ss: { count: 3 },
      ws: { count: 1 },
      hh: { active: 1, passive: -1 },
      sv: 5,
    }))).toEqual({
      badges: ['TNO.Item.Role.Weapon', 'TNO.Weapons.Use.Melee'],
      stats: [
        { labelKey: 'TNO.Inventory.Slots', value: 4 },
        { labelKey: 'TNO.Inventory.Quantity', value: '×2' },
        { labelKey: 'TNO.Weapons.Attribute', value: ['TNO.Ability.Str.long'] },
        { labelKey: 'TNO.Item.Cap.Fv', value: { skillKey: 'brawling', rank: 4 } },
        { labelKey: 'TNO.Item.Summary.Dk', value: 3 },
        { labelKey: 'TNO.Weapons.Rb', value: 2 },
        { labelKey: 'TNO.Weapons.Ss', value: '3W' },
        { labelKey: 'TNO.Weapons.Ws', value: '1W' },
        { labelKey: 'TNO.Item.Summary.Hh', value: '1 / -1' },
        { labelKey: 'TNO.Item.Cap.Sv', value: 5 },
      ],
    });

    expect(buildGearSummary(weapon({
      use: 'ranged', rd: 4, ammo: { count: 0, type: 'cells' }, hh: { active: 0 },
    })).stats).toEqual([
      { labelKey: 'TNO.Inventory.Slots', value: 2 },
      { labelKey: 'TNO.Weapons.Attribute', value: ['TNO.Ability.Str.long'] },
      { labelKey: 'TNO.Weapons.RdShort', value: 4 },
      { labelKey: 'TNO.Item.Summary.Hh', value: '0' },
      { labelKey: 'TNO.Weapons.Magazine', value: '0 cells' },
    ]);
  });

  it('summarizes armour, consumables, plain stacks, and incomplete gear', () => {
    const armor = {
      type: 'item',
      isWorn: true,
      system: {
        roles: { armor: true }, zone: 'suit', slots: 3, quantity: 1, rh: 8, rw: 2, ra: 6, sv: 3,
      },
    };
    expect(buildGearSummary(armor)).toEqual({
      badges: ['TNO.Item.Role.Armor'],
      stats: [
        { labelKey: 'TNO.Armor.Zone.Label', value: ['TNO.Armor.Zone.Suit'] },
        { labelKey: 'TNO.Armor.RhShort', value: '—' },
        { labelKey: 'TNO.Armor.RwShort', value: 2 },
        { labelKey: 'TNO.Armor.RaShort', value: '6 / 10' },
        { labelKey: 'TNO.Item.Cap.Sv', value: 3 },
      ],
    });

    expect(buildGearSummary({
      type: 'item', system: { roles: { consumable: true }, slots: 1, quantity: 0 },
    })).toEqual({
      badges: ['TNO.Item.Role.Consumable'],
      stats: [
        { labelKey: 'TNO.Inventory.Slots', value: 0 },
        { labelKey: 'TNO.Item.Summary.Stock', value: '×0' },
      ],
    });

    expect(buildGearSummary({
      type: 'item', system: { roles: {}, slots: 1, quantity: 3 },
    })).toEqual({
      badges: ['TNO.Item.Role.Plain'],
      stats: [
        { labelKey: 'TNO.Inventory.Slots', value: 3 },
        { labelKey: 'TNO.Inventory.Quantity', value: '×3' },
      ],
    });
  });
});

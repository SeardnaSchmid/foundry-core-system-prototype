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
  name: 'Machete',
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

  it('builds a melee weapon card: probe band, four tiles, handling and carry rows', () => {
    const summary = buildGearSummary(weapon({
      use: 'melee',
      quantity: 2,
      wa: 'dex',
      fv: { skill: 'brawling', rank: 4 },
      dk: 3,
      rb: 2,
      ss: { count: 3 },
      ws: { count: 1 },
      hh: { active: 1, passive: -1 },
      sv: 5,
    }));

    expect(summary.badges).toEqual([
      { key: 'role', state: 'role', join: ' · ', labelKeys: ['TNO.Item.Role.Weapon', 'TNO.Weapons.Use.Melee'] },
    ]);
    expect(summary.probe).toEqual({
      attribute: { labelKey: 'TNO.Item.Summary.WeaponAttribute', valueKey: 'TNO.Ability.Dex.long' },
      fv: { labelKey: 'TNO.Item.Summary.SkillRequirement', value: { skillKey: 'brawling', rank: 4 } },
    });
    expect(summary.tiles).toEqual([
      { key: 'dk', labelKey: 'TNO.Item.Summary.Dk', value: '3', state: 'value' },
      { key: 'rb', labelKey: 'TNO.Weapons.Rb', value: '2', state: 'value' },
      { key: 'ss', labelKey: 'TNO.Weapons.Ss', value: '3W', state: 'value' },
      { key: 'ws', labelKey: 'TNO.Weapons.Ws', value: '1W', state: 'value' },
    ]);
    expect(summary.rows).toEqual([
      {
        key: 'hh',
        labelKey: 'TNO.Weapons.Hh',
        parts: [
          { labelKey: 'TNO.Item.Summary.HhAttack', value: '+1' },
          { labelKey: 'TNO.Item.Summary.HhParry', value: '-1' },
        ],
      },
      { key: 'quantity', labelKey: 'TNO.Inventory.Quantity', value: '×2' },
      { key: 'slots', labelKey: 'TNO.Inventory.Slots', value: 4 },
      { key: 'sv', labelKey: 'TNO.Item.Cap.Sv', value: 5, note: null },
    ]);
  });

  it('swaps two tiles for a ranged profile and keeps the magazine as a row', () => {
    const summary = buildGearSummary(weapon({
      use: 'ranged',
      rd: 4,
      range: { near: 0 },
      ss: { count: 2 },
      ws: { count: 1 },
      ammo: { count: 6, type: 'cells' },
      hh: { active: 0 },
      fv: { skill: 'rifles', rank: 3 },
    }));

    expect(summary.tiles).toEqual([
      { key: 'rd', labelKey: 'TNO.Weapons.RdShort', value: '4', state: 'value' },
      { key: 'ss', labelKey: 'TNO.Weapons.Ss', value: '2W', state: 'value' },
      { key: 'ws', labelKey: 'TNO.Weapons.Ws', value: '1W', state: 'value' },
      { key: 'hh', labelKey: 'TNO.Item.Summary.HhActive', value: '0', state: 'value' },
    ]);
    expect(summary.rows).toEqual([
      { key: 'ammo', labelKey: 'TNO.Weapons.Magazine', value: 6, suffix: 'cells' },
      { key: 'slots', labelKey: 'TNO.Inventory.Slots', value: 2 },
    ]);
  });

  it('marks a required value the item has not got, and one a rule forbids', () => {
    const suit = {
      name: 'Armour',
      type: 'item',
      isWorn: true,
      system: { roles: { armor: true }, zone: 'suit', slots: 3, quantity: 1, rw: 2, ra: 6, sv: 3 },
    };
    const summary = buildGearSummary(suit);

    // Underclothing never grants RH, so the tile is hatched and the piece is
    // not counted as incomplete.
    expect(summary.tiles).toEqual([
      { key: 'rh', labelKey: 'TNO.Armor.RhShort', value: null, state: 'na' },
      { key: 'rw', labelKey: 'TNO.Armor.RwShort', value: '2', state: 'value' },
      { key: 'ra', labelKey: 'TNO.Armor.RaShort', value: '6', state: 'value' },
    ]);
    expect(summary.missing).toEqual([]);
    expect(summary.badges[1]).toEqual({
      key: 'zone', state: 'zone', join: ': ', labelKeys: ['TNO.Armor.Zone.Label', 'TNO.Armor.Zone.Suit'],
    });
    // Worn armour is exempt from the slot economy, so no carry row.
    expect(summary.rows).toEqual([{ key: 'sv', labelKey: 'TNO.Item.Cap.Sv', value: 3, note: null }]);

    const plate = buildGearSummary({
      name: 'Armour',
      type: 'item',
      system: { roles: { armor: true }, zone: 'torso', slots: 2, quantity: 1, rh: 4, rw: 3 },
    });
    expect(plate.tiles[2]).toEqual({ key: 'ra', labelKey: 'TNO.Armor.RaShort', value: null, state: 'missing' });
    expect(plate.missing).toEqual(['ra']);
  });

  it('gives a consumable its stock and a plain item its carry pair', () => {
    expect(buildGearSummary({
      name: 'Ampoule', type: 'item', system: { roles: { consumable: true }, slots: 1, quantity: 3, consumableEffects: [{ text: 'Heals' }] },
    })).toMatchObject({
      badges: [{ key: 'role', labelKeys: ['TNO.Item.Role.Consumable'] }],
      probe: null,
      tiles: [
        { key: 'stock', labelKey: 'TNO.Item.Summary.Stock', value: '3', state: 'primary' },
        { key: 'slots', labelKey: 'TNO.Inventory.Slots', value: '3', state: 'value' },
      ],
      rows: [],
    });

    // A stack of one has nothing to say about quantity, but the tile stays so
    // every plain card is the same height.
    expect(buildGearSummary({ type: 'item', system: { roles: {}, slots: 1, quantity: 1 } }).tiles).toEqual([
      { key: 'slots', labelKey: 'TNO.Inventory.Slots', value: '1', state: 'value' },
      { key: 'quantity', labelKey: 'TNO.Item.Summary.QuantityFrom2', value: null, state: 'na' },
    ]);
    expect(buildGearSummary({ type: 'item', system: { roles: {}, slots: 1, quantity: 3 } }).tiles[1])
      .toEqual({ key: 'quantity', labelKey: 'TNO.Inventory.Quantity', value: '×3', state: 'value' });
  });

  it('reads the Strength shortfall off the owning character', () => {
    const actor = { system: { abilities: { str: { base: 4 } }, derived: {}, equipment: {} } };
    const short = buildGearSummary({ ...weapon({ sv: 5, dk: 1, rb: 0, ss: { count: 1 }, fv: { skill: 'blades' } }), actor });
    const met = buildGearSummary({ ...weapon({ sv: 4, dk: 1, rb: 0, ss: { count: 1 }, fv: { skill: 'blades' } }), actor });

    expect(short.rows.at(-1).note)
      .toEqual({ labelKey: 'TNO.Item.Summary.RequirementShort', params: { delta: -1 }, state: 'warning' });
    expect(met.rows.at(-1).note).toEqual({ labelKey: 'TNO.Item.Overview.RequirementMet', state: 'ok' });
  });
});

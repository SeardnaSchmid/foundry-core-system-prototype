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
  it('presents damage as a plain value, with no die unit to append', () => {
    expect(damagePresentation({ count: 2 })).toEqual({ count: 2, label: '2' });
    expect(damagePresentation({})).toEqual({ count: 0, label: '0' });
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
    expect(buildPenetrationProfile({ use: 'ranged', rb: 5, ss: { count: 4, die: 'd6' }, ws: { count: 2, die: 'd6' } }))
      .toEqual({
        key: 'rb',
        value: 5,
        segments: [
          { key: 'below', from: 0, to: 4, size: 5, single: false },
          { key: 'equal', from: 5, to: 5, size: 1, single: true },
          { key: 'above', from: 6, to: 10, size: 5, single: false },
        ],
        ss: { count: 4, label: '4' },
        ws: { count: 2, label: '2' },
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

  it('builds a melee weapon card: type line, five tiles, probe and requirement row', () => {
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

    expect(summary.typeLine).toEqual({ roleKey: 'TNO.Item.Role.Weapon', detailKey: 'TNO.Weapons.Use.Melee' });
    expect(summary.slots).toBe(4);
    expect(summary.quantity).toBe(2);
    expect(summary.probe).toEqual({
      attribute: { labelKey: 'TNO.Item.Summary.Attribute', valueKey: 'TNO.Ability.Dex.long' },
      fv: { labelKey: 'TNO.Item.Summary.Skill', value: { skillKey: 'brawling', rank: 4 } },
    });
    expect(summary.tiles).toEqual([
      { key: 'dk', labelKey: 'TNO.Item.Summary.Dk', titleKey: 'TNO.Weapons.Dk', value: '3', state: 'value' },
      { key: 'rb', labelKey: 'TNO.Weapons.Rb', titleKey: 'TNO.Weapons.RbHint', value: '2', state: 'value' },
      { key: 'ss', labelKey: 'TNO.Weapons.Ss', titleKey: 'TNO.Weapons.SsHint', value: '3', state: 'value' },
      { key: 'ws', labelKey: 'TNO.Weapons.Ws', titleKey: 'TNO.Weapons.WsHint', value: '1', state: 'value' },
      { key: 'hh', labelKey: 'TNO.Item.Summary.Hh', titleKey: 'TNO.Weapons.HhHint', value: '+1 / -1', state: 'value', wide: true },
    ]);
    expect(summary.rows).toEqual([
      { key: 'sv', labelKey: 'TNO.Item.Overview.Requirement', prefixKey: 'TNO.Item.Cap.Sv', value: 5, note: null },
    ]);
  });

  it('drops DK and the parry half of handling for a ranged profile', () => {
    const summary = buildGearSummary(weapon({
      use: 'ranged',
      rb: 4,
      range: { near: 0 },
      ss: { count: 2 },
      ws: { count: 1 },
      hh: { active: 0 },
      fv: { skill: 'rifles', rank: 3 },
    }));

    expect(summary.tiles.map((tile) => [tile.key, tile.value])).toEqual([
      ['rb', '4'], ['ss', '2'], ['ws', '1'], ['hh', '0'],
    ]);
    expect(summary.rows).toEqual([]);
  });

  it('marks a required value the item has not got, and drops one a rule forbids', () => {
    const suit = {
      name: 'Armour',
      type: 'item',
      isWorn: true,
      system: { roles: { armor: true }, zone: 'suit', slots: 3, quantity: 1, rw: 2, sv: 3 },
    };
    const summary = buildGearSummary(suit);

    // Underclothing is RH 0 and has no coverage at all, so the hardness tile
    // reads zero, there is no coverage tile, and the piece is complete.
    expect(summary.tiles).toEqual([
      { key: 'sv', labelKey: 'TNO.Item.Cap.Sv', titleKey: 'TNO.Armor.Sv', value: 3, state: 'value', decimal: true },
      { key: 'rh', labelKey: 'TNO.Armor.RhShort', titleKey: 'TNO.Armor.Rh', value: '0', state: 'value' },
      { key: 'rw', labelKey: 'TNO.Armor.RwShort', titleKey: 'TNO.Armor.Rw', value: '2', state: 'value' },
    ]);
    expect(summary.missing).toEqual([]);
    expect(summary.typeLine).toEqual({ roleKey: 'TNO.Item.Role.Armor', detailKey: 'TNO.Armor.Zone.Suit' });
    expect(summary.rows).toEqual([]);

    const plate = buildGearSummary({
      name: 'Armour',
      type: 'item',
      system: { roles: { armor: true }, zone: 'torso', slots: 2, quantity: 1, rh: 4, rw: 3, sv: 0.25 },
    });
    // The one value written in quarter steps, kept as a number so the
    // localizer can apply the reader's decimal separator to it.
    expect(plate.tiles[0]).toMatchObject({ key: 'sv', value: 0.25, state: 'value', decimal: true });
    expect(plate.tiles[3]).toEqual({ key: 'ra', labelKey: 'TNO.Armor.RaShort', titleKey: 'TNO.Armor.Ra', value: null, state: 'missing' });
    expect(plate.missing).toEqual(['ra']);
  });

  it('gives consumables and plain items no tiles, only their carry facts', () => {
    expect(buildGearSummary({
      name: 'Ampoule', type: 'item', system: { roles: { consumable: true }, slots: 1, quantity: 3, consumableEffects: [{ text: 'Heals' }] },
    })).toMatchObject({
      typeLine: { roleKey: 'TNO.Item.Role.Consumable', detailKey: null },
      slots: 3,
      quantity: 3,
      probe: null,
      tiles: [],
      rows: [],
    });

    expect(buildGearSummary({ type: 'item', system: { roles: {}, slots: 1, quantity: 1 } }))
      .toMatchObject({ typeLine: { roleKey: 'TNO.Item.Role.Plain' }, slots: 1, tiles: [], rows: [] });
  });

  it('reports a stashed piece as stashed, a worn one as worn', () => {
    const actor = { system: { equipment: { head: 'helmet' } } };
    expect(buildGearPresentation({ id: 'helmet', type: 'item', system: {} }, actor).ownership.state).toBe('worn');
    expect(buildGearPresentation({ id: 'rope', type: 'item', system: { stashed: true } }, actor).ownership.state).toBe('stashed');
    expect(buildGearPresentation({ id: 'rope', type: 'item', system: {} }, actor).ownership.state).toBe('carried');
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

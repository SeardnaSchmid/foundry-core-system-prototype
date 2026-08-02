import { describe, expect, it } from 'vitest';
import {
  buildGearPresentation,
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
});

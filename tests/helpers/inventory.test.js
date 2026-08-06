import { describe, it, expect } from 'vitest';
import {
  computeCarry,
  resolveArmor,
  itemSlotCost,
  buildSlotGrid,
  CARRY_THRESHOLDS,
} from '../../module/helpers/inventory.mjs';

/** Shorthand for a carried item stack. */
const gear = (_id, slots, quantity = 1) => ({ _id, type: 'item', system: { slots, quantity } });

/** Shorthand for an armour piece. */
const armor = (_id, system) => ({ _id, type: 'armor', system: { quantity: 1, ...system } });

describe('itemSlotCost', () => {
  it('multiplies slots by quantity', () => {
    expect(itemSlotCost(gear('a', 3, 2))).toBe(6);
  });

  it('treats a missing quantity as one', () => {
    expect(itemSlotCost({ system: { slots: 4 } })).toBe(4);
  });

  it('degrades a non-numeric field to zero rather than NaN', () => {
    expect(itemSlotCost({ system: { slots: 'heavy', quantity: 2 } })).toBe(0);
  });

  it('never lets armour cost nothing, however it was authored', () => {
    // Armour is not Krimskrams: off the body it is either carried and taking
    // up room, or not there at all. A piece saved at 0 still costs its slot.
    expect(itemSlotCost(armor('helm', { slots: 0 }))).toBe(1);
    expect(itemSlotCost(armor('plates', { slots: 0, quantity: 3 }))).toBe(3);
  });

  it('leaves armour above the floor at its authored cost', () => {
    expect(itemSlotCost(armor('suit', { slots: 3 }))).toBe(3);
  });

  it('still lets ordinary gear be a zero-slot trinket', () => {
    expect(itemSlotCost(gear('coin', 0))).toBe(0);
  });

  // The floor follows the armour *role*, not the legacy item type, so a plain
  // item that has taken the role on is held to it too.
  it('applies the floor to anything wearing the armour role', () => {
    const bracer = { _id: 'bracer', type: 'item', system: { roles: { armor: true }, slots: 0 } };
    expect(itemSlotCost(bracer)).toBe(1);
  });

  it('still recognises armour authored before roles existed', () => {
    expect(itemSlotCost({ _id: 'old', type: 'armor', system: { slots: 0 } })).toBe(1);
  });
});

describe('computeCarry', () => {
  const capacity = 10;

  it('sums slots times quantity across carried gear', () => {
    const { used, state } = computeCarry([gear('a', 3, 2), gear('b', 1)], {}, true, capacity);
    expect(used).toBe(7);
    expect(state).toBe('noSprint');
  });

  it('ignores item types that are not gear', () => {
    const items = [gear('a', 2), { _id: 'f', type: 'feature', system: {} }];
    expect(computeCarry(items, {}, true, capacity).used).toBe(2);
  });

  it('counts a weapon like any other piece of gear', () => {
    // Readiness is a separate, still-undesigned question; being carried is not.
    const items = [{ _id: 'rifle', type: 'weapon', system: { slots: 2, quantity: 1 } }];
    expect(computeCarry(items, {}, true, capacity).used).toBe(2);
  });

  it('exempts worn armour from the slot budget', () => {
    const items = [armor('helm', { slots: 2, rh: 5 }), gear('a', 1)];
    const equipment = { head: 'helm' };
    expect(computeCarry(items, equipment, true, capacity).used).toBe(1);
  });

  it('counts armour that is carried rather than worn', () => {
    const items = [armor('helm', { slots: 2, rh: 5 }), gear('a', 1)];
    expect(computeCarry(items, {}, true, capacity).used).toBe(3);
  });

  it('reports no slot economy at all without a container', () => {
    const { used, state } = computeCarry([gear('a', 9)], {}, false, capacity);
    expect(used).toBe(0);
    expect(state).toBe('noContainer');
  });

  it('stays ok below the half-capacity threshold', () => {
    expect(computeCarry([gear('a', 4)], {}, true, capacity).state).toBe('ok');
  });

  it('blocks sprinting at exactly half capacity', () => {
    expect(computeCarry([gear('a', 5)], {}, true, capacity).state).toBe('noSprint');
  });

  it('drops to crawling once the budget is full', () => {
    expect(computeCarry([gear('a', 10)], {}, true, capacity).state).toBe('crawlOnly');
  });

  it('keeps counting past capacity instead of clamping or refusing', () => {
    const { used, state } = computeCarry([gear('a', 12)], {}, true, capacity);
    expect(used).toBe(12);
    expect(state).toBe('crawlOnly');
  });

  it('does not divide by zero when capacity is zero', () => {
    expect(computeCarry([gear('a', 1)], {}, true, 0).state).toBe('crawlOnly');
    expect(computeCarry([], {}, true, 0).state).toBe('ok');
  });

  it('exposes the thresholds as a single tunable constant', () => {
    expect(CARRY_THRESHOLDS).toEqual({ noSprint: 0.5, crawlOnly: 1 });
  });
});

describe('buildSlotGrid', () => {
  const sorted = (_id, slots, sort) => ({ ...gear(_id, slots), sort });

  it('packs blocks in sort order, one cell per slot consumed', () => {
    const { blocks } = buildSlotGrid([sorted('b', 2, 20), sorted('a', 3, 10)], {}, 10);
    expect(blocks.map((b) => [b.item._id, b.span])).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });

  it('pads the remainder of the budget with empty cells', () => {
    expect(buildSlotGrid([gear('a', 4)], {}, 10).empty).toBe(6);
  });

  it('separates zero-slot trinkets out of the grid entirely', () => {
    const { blocks, trinkets } = buildSlotGrid([gear('coin', 0), gear('a', 1)], {}, 10);
    expect(blocks).toHaveLength(1);
    expect(trinkets.map((t) => t._id)).toEqual(['coin']);
  });

  it('moves a block with no slot left to start on into the overflow', () => {
    const { blocks, overflow, empty } = buildSlotGrid([sorted('a', 4, 10), sorted('b', 2, 20)], {}, 4);
    expect(blocks.map((b) => b.item._id)).toEqual(['a']);
    expect(overflow.map((b) => b.item._id)).toEqual(['b']);
    expect(empty).toBe(0);
  });

  it('lets a block straddle the boundary rather than holding its slot open', () => {
    // 5 of 6 slots are spoken for. The 2-slot block starts on the one slot that
    // is left, so it is packed there and only its second cell reads as overload
    // — pushing it out whole would strand slot 6 empty for good.
    const { blocks, overflow, empty } = buildSlotGrid([sorted('a', 5, 10), sorted('b', 2, 20)], {}, 6);
    expect(blocks.map((b) => b.item._id)).toEqual(['a', 'b']);
    expect(overflow).toEqual([]);
    expect(empty).toBe(0);
  });

  it('says in cells where a straddling block is cut', () => {
    const { blocks } = buildSlotGrid([sorted('a', 5, 10), sorted('b', 2, 20)], {}, 6);
    expect(blocks.map((b) => [b.item._id, b.inside, b.outside])).toEqual([
      ['a', 5, 0],
      ['b', 1, 1],
    ]);
  });

  it('reports no free cells once a block straddles the boundary', () => {
    // The budget is spoken for even though only part of 'b' sits inside it, so
    // the grid must not offer a free cell that no longer exists.
    expect(buildSlotGrid([sorted('a', 5, 10), sorted('b', 3, 20)], {}, 6).empty).toBe(0);
  });

  it('keeps later gear behind a straddling block even when a gap remains', () => {
    // 'b' straddles, so it is packed and cut. 'c' would fit in the slots 'b'
    // spills past, but letting it jump the queue would silently reorder the
    // player's list against its sort order.
    const items = [sorted('a', 4, 10), sorted('b', 4, 20), sorted('c', 2, 30)];
    const { blocks, overflow } = buildSlotGrid(items, {}, 6);
    expect(blocks.map((b) => [b.item._id, b.inside, b.outside])).toEqual([
      ['a', 4, 0],
      ['b', 2, 2],
    ]);
    expect(overflow.map((b) => b.item._id)).toEqual(['c']);
  });

  it('reports no overflow while everything fits', () => {
    expect(buildSlotGrid([gear('a', 4)], {}, 10).overflow).toEqual([]);
  });

  it('omits worn armour from the carry grid', () => {
    const items = [armor('helm', { slots: 2 }), gear('a', 1)];
    const { blocks } = buildSlotGrid(items, { head: 'helm' }, 10);
    expect(blocks.map((b) => b.item._id)).toEqual(['a']);
  });

  it('gives unworn armour a cell instead of dropping it among the trinkets', () => {
    const items = [armor('helm', { slots: 0 }), gear('coin', 0)];
    const { blocks, trinkets } = buildSlotGrid(items, {}, 10);
    expect(blocks.map((b) => [b.item._id, b.span])).toEqual([['helm', 1]]);
    expect(trinkets.map((t) => t._id)).toEqual(['coin']);
  });

});

describe('resolveArmor', () => {
  // A suit as the Rüstungstabelle writes it: RH 0, RW authored, no RA at all.
  const suit = armor('suit', { zone: 'suit', rh: null, rw: 1, ra: null, sv: 1 });
  const helm = armor('helm', { zone: 'head', rh: 5, rw: 3, ra: 8, sv: 2 });

  it('gives an unarmoured zone no hardness even under a suit', () => {
    const { zones } = resolveArmor({ suit: 'suit' }, [suit]);
    expect(zones.torso.rh).toBe(0);
  });

  it('takes hardness from the addon alone, never the Unterkleidung', () => {
    const stray = armor('stray', { zone: 'suit', rh: 2, rw: 1, ra: 10, sv: 1 });
    const { zones } = resolveArmor({ suit: 'stray', head: 'helm' }, [stray, helm]);
    expect(zones.head.rh).toBe(5);
  });

  it('adds suit and addon for armour value', () => {
    const { zones } = resolveArmor({ suit: 'suit', head: 'helm' }, [suit, helm]);
    expect(zones.head.rw).toBe(4);
  });

  it('applies the suit in every zone, not just the one it is worn in', () => {
    const { zones } = resolveArmor({ suit: 'suit' }, [suit]);
    expect(zones.legs.rw).toBe(1);
  });

  it('takes coverage from the addon alone — a suit covers no single location', () => {
    const stray = armor('stray', { zone: 'suit', rh: 2, rw: 1, ra: 10, sv: 1 });
    const { zones } = resolveArmor({ suit: 'stray', head: 'helm' }, [stray, helm]);
    expect(zones.head.ra).toBe(8);
    expect(zones.legs.ra).toBe(0);
  });

  it('sums the strength requirement over every worn piece', () => {
    const { sv } = resolveArmor({ suit: 'suit', head: 'helm' }, [suit, helm]);
    expect(sv).toBe(3);
  });

  it('adds the addons quarter-step increments onto the Unterkleidung', () => {
    // Gummischutzanzug SV 2 with Gummischutzhandschuhe +0,25 on the arms and
    // Gummischutzstiefel +0,5 on the legs: the table's own "kombiniert" rows
    // pre-add exactly this way.
    const rubber = armor('rubber', { zone: 'suit', sv: 2 });
    const gloves = armor('gloves', { zone: 'arms', sv: 0.25 });
    const boots = armor('boots', { zone: 'legs', sv: 0.5 });
    const { sv } = resolveArmor(
      { suit: 'rubber', arms: 'gloves', legs: 'boots' },
      [rubber, gloves, boots]
    );
    expect(sv).toBe(2.75);
  });

  it('snaps a total onto the quarter step the table is written in', () => {
    const odd = armor('odd', { zone: 'head', sv: 0.3 });
    const { sv } = resolveArmor({ suit: 'suit', head: 'odd' }, [suit, odd]);
    expect(sv).toBe(1.25);
  });

  it('reports no strength requirement when nothing is worn', () => {
    expect(resolveArmor({}, []).sv).toBe(0);
  });

  it('resolves all four addon zones even when empty', () => {
    const { zones } = resolveArmor({}, []);
    expect(Object.keys(zones)).toEqual(['head', 'torso', 'arms', 'legs']);
    expect(zones.arms.equipped).toBe(false);
  });

  it('returns plain numbers only, so derived data stays serializable', () => {
    const { zones } = resolveArmor({ suit: 'suit', head: 'helm' }, [suit, helm]);
    expect(() => JSON.stringify(zones)).not.toThrow();
  });
});

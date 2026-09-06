import { beforeEach, describe, expect, it } from 'vitest';

import { createRoundState } from '../../module/helpers/round-state.mjs';
import { TnoCombat, hookCalls, makeCombat, resetHookCalls } from './fake-combat.mjs';

const THREE = [
  { id: 'fast', name: 'Fast', initiative: 14 },
  { id: 'slow', name: 'Slow', initiative: 6 },
  { id: 'medium', name: 'Medium', initiative: 9 },
];

/** A combat already in round 1 with the slowest combatant activating. */
const started = (overrides = {}) =>
  makeCombat({
    combatants: THREE,
    round: 1,
    turn: 0,
    flags: { tno: { roundState: createRoundState(1, 'slow'), baseInitiatives: { fast: 14, slow: 6, medium: 9 } } },
    ...overrides,
  });

const order = (combat) => combat.turns.map((c) => c.id);
const sort = (a, b) => TnoCombat.prototype._sortCombatants(a, b);

beforeEach(resetHookCalls);

describe('_sortCombatants', () => {
  it('puts the slowest combatant first', () => {
    expect(order(makeCombat({ combatants: THREE }))).toEqual(['slow', 'medium', 'fast']);
  });

  it('sorts a combatant who has not rolled yet to the end', () => {
    const combat = makeCombat({
      combatants: [{ id: 'unrolled', initiative: null }, { id: 'slow', initiative: 6 }],
    });
    expect(order(combat)).toEqual(['slow', 'unrolled']);
  });

  it('breaks a tie by name and then by id, never by locale', () => {
    // Turn indices are shared state, so the comparison has to land the same way
    // on every client — which is what rules out localeCompare.
    expect(sort({ id: 'b', name: 'Anna', initiative: 5 }, { id: 'a', name: 'Bert', initiative: 5 })).toBeLessThan(0);
    expect(sort({ id: 'b', name: 'Same', initiative: 5 }, { id: 'a', name: 'Same', initiative: 5 })).toBeGreaterThan(0);
  });

  it('never reads `this`, because core calls it unbound', () => {
    const unbound = TnoCombat.prototype._sortCombatants;
    expect(() => [...THREE].sort(unbound)).not.toThrow();
  });
});

describe('startCombat', () => {
  it('opens the round on the slowest combatant and snapshots the initiatives', async () => {
    const combat = makeCombat({ combatants: THREE });
    await combat.startCombat();

    expect(combat.flags.tno.baseInitiatives).toEqual({ slow: 6, medium: 9, fast: 14 });
    expect(combat.flags.tno.roundState).toEqual(createRoundState(1, 'slow'));
    // Core's own `{round: 1, turn: 0}` already names the slowest combatant,
    // because the sort is ascending.
    expect(combat.turn).toBe(0);
    expect(combat.turns[combat.turn].id).toBe('slow');
  });
});

describe('nextTurn', () => {
  it('walks from the slowest to the fastest combatant', async () => {
    const combat = started();

    await combat.nextTurn();
    expect(combat.turns[combat.turn].id).toBe('medium');
    await combat.nextTurn();
    expect(combat.turns[combat.turn].id).toBe('fast');
    expect(combat.activatedIds).toEqual(['slow', 'medium', 'fast']);
  });

  it('starts the next round once everyone has activated', async () => {
    const combat = started();
    await combat.nextTurn();
    await combat.nextTurn();
    await combat.nextTurn();

    expect(combat.round).toBe(2);
    expect(combat.activatedIds).toEqual(['slow']);
    expect(combat.flags.tno.roundState.previousRoundState.activationHistory).toEqual([
      'slow', 'medium', 'fast',
    ]);
  });

  it('skips a defeated combatant when the setting says to', async () => {
    const combat = started({
      combatants: [
        { id: 'slow', initiative: 6 },
        { id: 'medium', initiative: 9, isDefeated: true },
        { id: 'fast', initiative: 14 },
      ],
      skipDefeated: true,
    });

    await combat.nextTurn();
    expect(combat.turns[combat.turn].id).toBe('fast');
  });

  it('writes the turn and the round state in a single update', async () => {
    // Two writes would leave a render in between showing a round nobody has
    // activated in yet.
    const combat = started();
    await combat.nextTurn();

    expect(combat.updates).toHaveLength(1);
    expect(Object.keys(combat.updates[0])).toEqual(['round', 'turn', 'flags.tno.roundState']);
    expect(hookCalls.map((c) => c.hook)).toEqual(['combatTurn']);
  });
});

describe('previousTurn', () => {
  it('retraces the activation history', async () => {
    const combat = started();
    await combat.nextTurn();
    await combat.nextTurn();

    await combat.previousTurn();
    expect(combat.turns[combat.turn].id).toBe('medium');
    await combat.previousTurn();
    expect(combat.turns[combat.turn].id).toBe('slow');
    expect(combat.activatedIds).toEqual(['slow']);
  });

  it('steps back across the round boundary into the round that was played', async () => {
    const combat = started();
    await combat.nextTurn();
    await combat.nextTurn();
    await combat.nextTurn(); // rolls over into round 2

    await combat.previousTurn();
    expect(combat.round).toBe(1);
    expect(combat.turns[combat.turn].id).toBe('fast');
    expect(combat.activatedIds).toEqual(['slow', 'medium', 'fast']);
  });

  it('falls back to core at the very first activation of the combat', async () => {
    const combat = started();
    await combat.previousTurn();

    expect(combat.superPreviousTurns).toBe(1);
    expect(combat.updates).toHaveLength(0);
  });
});

describe('nextRound', () => {
  it('restores the initiative values from combat start', async () => {
    const combat = started();
    combat.combatants.get('medium').initiative = 99;

    await combat.nextRound();

    expect(combat.combatants.get('medium').initiative).toBe(9);
    expect(combat.combatantUpdates).toEqual([{ type: 'Combatant', updates: [{ _id: 'medium', initiative: 9 }] }]);
  });

  it('never restores a combatant to no initiative at all', async () => {
    // A combat may legitimately be started before anybody rolls. Snapshotting
    // those nulls and restoring them turned the round change into an initiative
    // reset: everything rolled during round 1 was thrown away at round 2.
    const combat = makeCombat({
      combatants: [
        { id: 'slow', initiative: null },
        { id: 'fast', initiative: null },
      ],
    });
    await combat.startCombat();
    expect(combat.flags.tno.baseInitiatives).toEqual({});

    combat.combatants.get('slow').initiative = 6;
    combat.combatants.get('fast').initiative = 14;
    await combat.nextRound();

    expect(combat.combatants.get('slow').initiative).toBe(6);
    expect(combat.combatants.get('fast').initiative).toBe(14);
    // And the values they rolled are the baseline from here on.
    expect(combat.flags.tno.baseInitiatives).toEqual({ slow: 6, fast: 14 });
  });

  it('adopts a baseline for a combatant who joined mid-fight', async () => {
    const combat = started();
    combat.combatants.contents.push({ id: 'latecomer', name: 'Latecomer', initiative: 7, isDefeated: false });

    await combat.nextRound();

    expect(combat.combatants.get('latecomer').initiative).toBe(7);
    expect(combat.flags.tno.baseInitiatives.latecomer).toBe(7);
  });

  it('opens the new round on the slowest combatant', async () => {
    const combat = started();
    await combat.nextRound();

    expect(combat.round).toBe(2);
    expect(combat.flags.tno.roundState.activationHistory).toEqual(['slow']);
    expect(combat.turns[combat.turn].id).toBe('slow');
  });
});

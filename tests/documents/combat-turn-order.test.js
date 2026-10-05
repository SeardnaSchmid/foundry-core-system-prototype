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
    flags: { tno: { roundState: createRoundState(1, 'slow')} },
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

  it('breaks a tie by Beweglichkeit, the more agile activating later, then by id', () => {
    const agile = (id, dex) => ({ id, initiative: 5, actor: { system: { abilities: { dex: { base: dex } } } } });
    expect(sort(agile('a', 6), agile('b', 4))).toBeGreaterThan(0);
    expect(sort(agile('b', 4), agile('a', 6))).toBeLessThan(0);
    // Turn indices are shared state, so the last resort is the id, never a locale.
    expect(sort(agile('b', 4), agile('a', 4))).toBeGreaterThan(0);
  });

  it('never reads `this`, because core calls it unbound', () => {
    const unbound = TnoCombat.prototype._sortCombatants;
    expect(() => [...THREE].sort(unbound)).not.toThrow();
  });
});

describe('startCombat', () => {
  it('opens the round on the slowest combatant', async () => {
    const combat = makeCombat({ combatants: THREE });
    await combat.startCombat();

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
  it('carries the initiative values over untouched', async () => {
    // An Orientieren re-roll or a GM's edit lasts the rest of the fight.
    const combat = started();
    combat.combatants.get('medium').initiative = 12;

    await combat.nextRound();

    expect(combat.combatants.get('medium').initiative).toBe(12);
    expect(combat.combatantUpdates).toEqual([]);
  });

  it('opens the new round on the slowest combatant', async () => {
    const combat = started();
    await combat.nextRound();

    expect(combat.round).toBe(2);
    expect(combat.flags.tno.roundState.activationHistory).toEqual(['slow']);
    expect(combat.turns[combat.turn].id).toBe('slow');
  });
});

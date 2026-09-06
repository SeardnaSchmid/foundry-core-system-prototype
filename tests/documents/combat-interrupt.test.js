import { beforeEach, describe, expect, it } from 'vitest';

import { createRoundState } from '../../module/helpers/round-state.mjs';
import { makeCombat, resetWarnings, warnings } from './fake-combat.mjs';

const THREE = [
  { id: 'slow', name: 'Slow', initiative: 6 },
  { id: 'medium', name: 'Medium', initiative: 9 },
  { id: 'fast', name: 'Fast', initiative: 14 },
];

/** A combat in round 1, with the slowest combatant activating. */
const started = () =>
  makeCombat({
    combatants: THREE,
    round: 1,
    turn: 0,
    flags: { tno: { roundState: createRoundState(1, 'slow') } },
  });

beforeEach(resetWarnings);

describe('activateEarly', () => {
  it('pulls a combatant forward, out of the initiative order', async () => {
    const combat = started();
    await combat.activateEarly('fast');

    expect(combat.turns[combat.turn].id).toBe('fast');
    expect(combat.activatedIds).toEqual(['slow', 'fast']);
  });

  it('leaves the combatants who were skipped over still owed a turn', async () => {
    // Interrupting is not the same as ending the round early: the order still
    // owes everyone it has not reached.
    const combat = started();
    await combat.activateEarly('fast');
    await combat.nextTurn();

    expect(combat.turns[combat.turn].id).toBe('medium');
    expect(combat.round).toBe(1);
  });

  it('refuses a combatant who has already activated this round', async () => {
    const combat = started();
    await combat.activateEarly('fast');
    combat.updates.length = 0;

    await combat.activateEarly('fast');

    expect(combat.updates).toEqual([]);
    expect(combat.activatedIds).toEqual(['slow', 'fast']);
    expect(warnings).toEqual(['TNO.Combat.Tracker.AlreadyActivated(Fast)']);
  });

  it('refuses the combatant who is activating right now', async () => {
    const combat = started();
    await combat.activateEarly('slow');

    expect(combat.updates).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('replaces a rewound future rather than resuming it', async () => {
    // The round stepped forward, back, and then somewhere else. What it did the
    // first time is no longer what happened, so it must not be replayed.
    const combat = started();
    await combat.nextTurn(); // medium
    await combat.previousTurn(); // back to slow
    await combat.activateEarly('fast');

    expect(combat.turns[combat.turn].id).toBe('fast');
    expect(combat.flags.tno.roundState.activationHistory).toEqual(['slow', 'fast']);

    await combat.nextTurn();
    expect(combat.turns[combat.turn].id).toBe('medium');
  });

  it('does nothing before the combat has started', async () => {
    const combat = makeCombat({ combatants: THREE });
    await combat.activateEarly('fast');

    expect(combat.updates).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('does nothing for a combatant this combat does not hold', async () => {
    const combat = started();
    await combat.activateEarly('nobody');

    expect(combat.updates).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

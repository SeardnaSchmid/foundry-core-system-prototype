import { describe, expect, it } from 'vitest';

// The round state is the only part of the turn model that has no Foundry in it:
// ids in, ids out, a cursor in between. Everything the combat document does with
// it — which turn index that id sits at, who is allowed to ask — is checked one
// layer up, in tests/documents/combat-turn-order.test.js.
import {
  activateEarly,
  advanceActivation,
  createRoundState,
  getActivatedIds,
  normalizeRoundState,
  rewindActivation,
  startNextRound,
} from '../../module/helpers/round-state.mjs';

const ORDER = ['slow', 'medium', 'fast'];

describe('round state', () => {
  it('activates combatants from lowest to highest initiative', () => {
    let state = createRoundState(1, 'slow');
    expect(getActivatedIds(state)).toEqual(['slow']);

    const medium = advanceActivation(state, ORDER);
    state = medium.state;
    expect(medium.combatantId).toBe('medium');

    const fast = advanceActivation(state, ORDER);
    expect(fast.combatantId).toBe('fast');
    expect(getActivatedIds(fast.state)).toEqual(ORDER);
    expect(advanceActivation(fast.state, ORDER)).toBeUndefined();
  });

  it('preserves an interrupt activation in both directions', () => {
    let state = createRoundState(1, 'slow');
    state = activateEarly(state, 'fast');

    const previous = rewindActivation(state);
    expect(previous.combatantId).toBe('slow');
    expect(getActivatedIds(previous.state)).toEqual(['slow']);

    // Forward again lands on the same combatant the round actually played, not
    // on the one the initiative order would have named.
    const next = advanceActivation(previous.state, ORDER);
    expect(next.combatantId).toBe('fast');
    expect(getActivatedIds(next.state)).toEqual(['slow', 'fast']);
  });

  it('refuses a second early activation in the same round', () => {
    const state = activateEarly(createRoundState(1, 'slow'), 'fast');
    expect(activateEarly(state, 'fast')).toBeUndefined();
    expect(activateEarly(state, 'slow')).toBeUndefined();
  });

  it('replaces only the rewound future when a new early activation arrives', () => {
    let state = createRoundState(1, 'slow');
    state = activateEarly(state, 'fast');
    state = rewindActivation(state).state;
    state = activateEarly(state, 'medium');

    expect(state.activationHistory).toEqual(['slow', 'medium']);
    expect(getActivatedIds(state)).toEqual(['slow', 'medium']);
  });

  it('skips a rewound future entry that is no longer available', () => {
    // A combatant who left the encounter mid-round: replaying the history must
    // step over them rather than name an id the order no longer holds.
    let state = createRoundState(1, 'slow');
    state = advanceActivation(state, ORDER).state;
    state = advanceActivation(state, ORDER).state;
    state = rewindActivation(rewindActivation(state).state).state;

    const next = advanceActivation(state, ['slow', 'fast']);
    expect(next.combatantId).toBe('fast');
  });

  it('does not rewind past the first activation of a round', () => {
    expect(rewindActivation(createRoundState(2, 'slow'))).toBeUndefined();
  });

  it('keeps the completed round available when the next one starts', () => {
    const completed = {
      round: 1,
      activationHistory: ['slow', 'fast', 'medium'],
      activationIndex: 2,
    };
    const state = startNextRound(completed, 2, 'slow');

    expect(state.round).toBe(2);
    expect(getActivatedIds(state)).toEqual(['slow']);
    expect(state.previousRoundState).toEqual(completed);
  });
});

describe('normalizeRoundState', () => {
  it('empties a state that belongs to another round', () => {
    const state = normalizeRoundState({ round: 1, activationHistory: ['slow'], activationIndex: 0 }, 2);
    expect(state).toEqual({ round: 2, activationHistory: [], activationIndex: -1 });
  });

  it('reads a combat that has no stored state at all', () => {
    expect(normalizeRoundState(undefined, 1)).toEqual({
      round: 1,
      activationHistory: [],
      activationIndex: -1,
    });
  });

  it('clamps a cursor that points past the history', () => {
    const state = normalizeRoundState({ round: 1, activationHistory: ['slow'], activationIndex: 7 }, 1);
    expect(state.activationIndex).toBe(0);
  });

  it('carries the previous round through unchanged', () => {
    const previousRoundState = { round: 1, activationHistory: ['slow'], activationIndex: 0 };
    const state = normalizeRoundState(
      { round: 2, activationHistory: ['fast'], activationIndex: 0, previousRoundState },
      2
    );
    expect(state.previousRoundState).toEqual(previousRoundState);
  });
});

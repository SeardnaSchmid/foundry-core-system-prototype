/**
 * The activation bookkeeping of one combat round, as plain data.
 *
 * A round is not a list of who is still owed a turn — it is an ordered *history*
 * of who has already gone, plus a cursor into it. That shape is what makes
 * "Vorheriger Zug" honest: rewinding moves the cursor rather than recomputing an
 * order, so a round in which somebody pulled their activation forward retraces
 * exactly the way it was played rather than the way the initiative list says it
 * should have gone.
 *
 * Everything past the cursor is a *future* the round already walked and then
 * stepped back out of. Advancing replays it while it still matches the combat;
 * activating early throws it away, because the round has just taken a different
 * turn than the one it took last time.
 *
 * This module holds itself free of Foundry globals so it can be unit-tested
 * without a game world.
 */

/**
 * @typedef {object} RoundState
 * @property {number} round                    The round this state describes
 * @property {Array<string>} activationHistory Combatant ids in the order they activated
 * @property {number} activationIndex          Cursor into `activationHistory`; everything past it is a rewound future
 * @property {RoundState} [previousRoundState] How the round before this one ended, so a rewind can cross the boundary
 */

/**
 * A fresh state for a round whose first combatant is already activating.
 * @param {number} round
 * @param {string} [firstCombatantId]        Omitted when the round starts on nobody
 * @param {RoundState} [previousRoundState]
 * @returns {RoundState}
 */
export function createRoundState(round, firstCombatantId, previousRoundState = undefined) {
  const activationHistory = firstCombatantId ? [firstCombatantId] : [];
  return {
    round,
    activationHistory,
    activationIndex: activationHistory.length - 1,
    ...(previousRoundState ? { previousRoundState } : {}),
  };
}

/**
 * The stored state, or an empty one when it belongs to a different round.
 *
 * Reading through here is what lets every other caller treat the flag as always
 * present and always current: a combat that has never been started, and one
 * whose round was moved by something other than this state machine, both come
 * back as a round nobody has activated in yet.
 * @param {RoundState} [state]
 * @param {number} round
 * @returns {RoundState}
 */
export function normalizeRoundState(state, round) {
  if (state?.round !== round) return createRoundState(round);

  const activationHistory = Array.isArray(state.activationHistory) ? [...state.activationHistory] : [];
  const activationIndex = Math.min(
    Number.isInteger(state.activationIndex) ? state.activationIndex : activationHistory.length - 1,
    activationHistory.length - 1
  );
  return {
    round,
    activationHistory,
    activationIndex,
    ...(state.previousRoundState ? { previousRoundState: state.previousRoundState } : {}),
  };
}

/**
 * Who has activated this round — the history up to and including the cursor.
 * @param {RoundState} state
 * @returns {Array<string>}
 */
export function getActivatedIds(state) {
  return state.activationHistory.slice(0, state.activationIndex + 1);
}

/**
 * Step forward: replay the rewound future while it still holds, otherwise take
 * the first combatant the order still owes a turn.
 * @param {RoundState} state
 * @param {Array<string>} forcedOrderIds  Every id eligible to activate, in activation order
 * @returns {{combatantId: string, state: RoundState}|undefined} Undefined when the round is over
 */
export function advanceActivation(state, forcedOrderIds) {
  const availableIds = new Set(forcedOrderIds);
  for (let index = state.activationIndex + 1; index < state.activationHistory.length; index++) {
    const combatantId = state.activationHistory[index];
    if (!availableIds.has(combatantId)) continue;
    return {
      combatantId,
      state: { ...state, activationIndex: index },
    };
  }

  const activatedIds = new Set(getActivatedIds(state));
  const combatantId = forcedOrderIds.find((id) => !activatedIds.has(id));
  if (!combatantId) return undefined;

  const activationHistory = state.activationHistory.slice(0, state.activationIndex + 1);
  activationHistory.push(combatantId);
  return {
    combatantId,
    state: { ...state, activationHistory, activationIndex: activationHistory.length - 1 },
  };
}

/**
 * Step back one activation, keeping the future intact so it can be replayed.
 * @param {RoundState} state
 * @returns {{combatantId: string, state: RoundState}|undefined} Undefined at the round's first activation
 */
export function rewindActivation(state) {
  if (state.activationIndex <= 0) return undefined;
  const activationIndex = state.activationIndex - 1;
  return {
    combatantId: state.activationHistory[activationIndex],
    state: { ...state, activationIndex },
  };
}

/**
 * Pull a combatant's activation forward, discarding any rewound future.
 * @param {RoundState} state
 * @param {string} combatantId
 * @returns {RoundState|undefined} Undefined when that combatant has already activated this round
 */
export function activateEarly(state, combatantId) {
  if (getActivatedIds(state).includes(combatantId)) return undefined;
  const activationHistory = state.activationHistory.slice(0, state.activationIndex + 1);
  activationHistory.push(combatantId);
  return { ...state, activationHistory, activationIndex: activationHistory.length - 1 };
}

/**
 * Close this round and open the next one, keeping the completed round so a
 * rewind can step back across the boundary.
 * @param {RoundState} state
 * @param {number} round
 * @param {string} [firstCombatantId]
 * @returns {RoundState}
 */
export function startNextRound(state, round, firstCombatantId) {
  const previousRoundState = {
    round: state.round,
    activationHistory: [...state.activationHistory],
    activationIndex: state.activationIndex,
  };
  return createRoundState(round, firstCombatantId, previousRoundState);
}

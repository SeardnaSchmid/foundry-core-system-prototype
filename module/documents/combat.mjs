import {
  activateEarly as activateEarlyState,
  advanceActivation,
  createRoundState,
  getActivatedIds,
  normalizeRoundState,
  rewindActivation,
  startNextRound,
} from '../helpers/round-state.mjs';

/** Where the round's activation bookkeeping lives on the Combat document. */
export const ROUND_STATE_FLAG = 'flags.tno.roundState';

/**
 * Combat as this system plays it: the slowest combatant acts first.
 *
 * Two things follow from that, and only the first is a rule. Sorting ascending
 * makes `turns[0]` the slowest, so Foundry's own turn cursor already walks
 * slow → fast and no order has to be reversed anywhere. What this class adds on
 * top is the *activation history* — see
 * [`helpers/round-state.mjs`](../helpers/round-state.mjs) — which is what lets a
 * combatant pull their turn forward and still have "Vorheriger Zug" retrace the
 * round the way it was actually played.
 *
 * The visible order in the sidebar is a separate question with a separate
 * answer: the `combatTrackerOrder` setting flips the *display* only, and never
 * reaches this class.
 * @extends {Combat}
 */
export class TnoCombat extends Combat {
  /**
   * Slowest first. A tie goes to the higher Beweglichkeit, which therefore
   * activates later; past that the id decides, standing in for the wiki's chance.
   *
   * **Deliberately an instance method that never touches `this`.** Core calls it
   * unbound (`this.combatants.contents.sort(this._sortCombatants)` in
   * `Combat#setupTurns`), so `this` is `undefined` inside — and moving it to
   * `static` would take it off the prototype entirely, leaving `sort()` with
   * `undefined` and a lexicographic fallback.
   *
   * No `localeCompare` anywhere: turn indices are shared state, so every client
   * has to reach the same order regardless of its own locale.
   * @param {Combatant} a
   * @param {Combatant} b
   * @returns {number}
   * @override
   */
  _sortCombatants(a, b) {
    const ia = Number.isFinite(a.initiative) ? a.initiative : Infinity;
    const ib = Number.isFinite(b.initiative) ? b.initiative : Infinity;
    if (ia !== ib) return ia - ib;
    const da = a.actor?.system?.abilities?.dex?.base ?? 0;
    const db = b.actor?.system?.abilities?.dex?.base ?? 0;
    if (da !== db) return da - db;
    return a.id > b.id ? 1 : -1;
  }

  /* -------------------------------------------- */
  /*  Round state                                 */
  /* -------------------------------------------- */

  /** The activation bookkeeping for the round in progress. @type {object} */
  get #state() {
    return normalizeRoundState(this.getFlag('tno', 'roundState'), this.round);
  }

  /**
   * Everyone who has already activated this round. The tracker greys these out
   * and refuses them an interrupt; nothing else reads the state.
   * @type {Array<string>}
   */
  get activatedIds() {
    return getActivatedIds(this.#state);
  }

  /**
   * The ids eligible to activate this round, in activation order.
   *
   * `skipDefeated` is honoured here rather than ignored, so the setting means
   * the same thing in this tracker as it does everywhere else in Foundry.
   * @type {Array<string>}
   */
  get #activationOrder() {
    const turns = this.settings.skipDefeated ? this.turns.filter((c) => !c.isDefeated) : this.turns;
    return turns.map((c) => c.id);
  }

  /**
   * Whether that combatant may interrupt now: the combat runs, they have not
   * activated this round, and they are faster than whoever is activating —
   * "faster" meaning later in the sorted order, so a tie goes by Beweglichkeit.
   * @param {string} combatantId
   * @returns {boolean}
   */
  canActivateEarly(combatantId) {
    if (!this.started || this.activatedIds.includes(combatantId)) return false;
    const current = this.#currentCombatantId;
    return current === undefined || this.#turnIndexOf(combatantId) > this.#turnIndexOf(current);
  }

  /** Whoever the turn cursor currently points at. @type {string|undefined} */
  get #currentCombatantId() {
    return this.turn === null ? undefined : this.turns[this.turn]?.id;
  }

  /**
   * @param {string} combatantId
   * @returns {number} The turn index of that combatant, or -1
   */
  #turnIndexOf(combatantId) {
    return this.turns.findIndex((combatant) => combatant.id === combatantId);
  }

  /**
   * Move the cursor and the round state in one update.
   *
   * One write rather than two on purpose: `turn` and the activation history
   * describe the same fact, and a render that caught them apart would draw a
   * round nobody has activated in. The hook and the world-time delta mirror what
   * core's own `nextTurn`/`nextRound` send, so anything listening for a turn
   * change still hears one.
   * @param {number} round
   * @param {number} turn
   * @param {object} state          The round state to store alongside it
   * @param {1|-1} direction
   * @returns {Promise<this>}
   */
  async #goTo(round, turn, state, direction) {
    const updateData = { round, turn, [ROUND_STATE_FLAG]: state };
    const updateOptions = {
      direction,
      worldTime: { delta: this.getTimeDelta(this.round, this.turn, round, turn) },
    };
    Hooks.callAll(round === this.round ? 'combatTurn' : 'combatRound', this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
  }

  /* -------------------------------------------- */
  /*  Turn order                                  */
  /* -------------------------------------------- */

  /**
   * Let core start the encounter — its own `{round: 1, turn: 0}` already names
   * the slowest combatant, because the sort is ascending — then open the round
   * state on whoever it made current.
   *
   * The state is written *after* rather than before: it then describes a round
   * that exists, and a `combatStart` handler that cancels the update leaves no
   * stale round behind.
   * @returns {Promise<this>}
   * @override
   */
  async startCombat() {
    await super.startCombat();
    await this.update({ [ROUND_STATE_FLAG]: createRoundState(this.round, this.#currentCombatantId) });
    return this;
  }

  /**
   * Activate the next combatant the round still owes a turn, or start the next
   * round when it owes none.
   * @returns {Promise<this>}
   * @override
   */
  async nextTurn() {
    if (this.round === 0) return this.nextRound();

    const next = advanceActivation(this.#state, this.#activationOrder);
    if (!next) return this.nextRound();

    const turn = this.#turnIndexOf(next.combatantId);
    if (turn < 0) return this;
    return this.#goTo(this.round, turn, next.state, 1);
  }

  /**
   * Retrace the activation history one step, crossing back into the previous
   * round when this one has not started yet.
   * @returns {Promise<this>}
   * @override
   */
  async previousTurn() {
    if (this.round === 0) return this;

    const state = this.#state;
    const previous = rewindActivation(state);
    if (previous) {
      const turn = this.#turnIndexOf(previous.combatantId);
      if (turn < 0) return this;
      return this.#goTo(this.round, turn, previous.state, -1);
    }

    // At the round's first activation there is nothing left to rewind, so the
    // step goes back into the round before it — but only if this combat still
    // remembers how that round ended. Otherwise core's plain rewind applies.
    const completed = state.previousRoundState;
    if (completed?.round !== this.round - 1) return super.previousTurn();

    const restored = normalizeRoundState(completed, completed.round);
    const combatantId = restored.activationHistory[restored.activationIndex];
    const turn = this.#turnIndexOf(combatantId);
    if (turn < 0) return super.previousTurn();
    return this.#goTo(completed.round, turn, restored, -1);
  }

  /**
   * Open the next round. Initiative values carry over untouched, so an
   * Orientieren re-roll or a GM's edit lasts the rest of the fight.
   * @returns {Promise<this>}
   * @override
   */
  async nextRound() {
    // Read the finished round before core moves the cursor, and write the new
    // one only once core has — so the round state always names a turn that
    // exists, and whichever combatant core chose to open on is the one recorded.
    const completed = this.#state;
    await super.nextRound();
    await this.update({ [ROUND_STATE_FLAG]: startNextRound(completed, this.round, this.#currentCombatantId) });
    return this;
  }

  /**
   * Pull a combatant's activation forward, interrupting whoever is activating —
   * who then stays owed a turn. Only a faster combatant may (see
   * {@link canActivateEarly}); anyone else is refused. Public and GM-side:
   * the tracker button calls it directly, a player's request reaches it through
   * [`helpers/combat-socket.mjs`](../helpers/combat-socket.mjs).
   * @param {string} combatantId
   * @returns {Promise<this>}
   */
  async activateEarly(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant || !this.started) return this;
    if (!this.activatedIds.includes(combatantId) && !this.canActivateEarly(combatantId)) {
      globalThis.ui?.notifications?.warn(game.i18n.format('TNO.Combat.Tracker.NotFaster', { name: combatant.name }));
      return this;
    }

    const state = activateEarlyState(this.#state, combatantId);
    if (!state) {
      globalThis.ui?.notifications?.warn(
        game.i18n.format('TNO.Combat.Tracker.AlreadyActivated', { name: combatant.name })
      );
      return this;
    }

    const turn = this.#turnIndexOf(combatantId);
    if (turn < 0) return this;
    return this.#goTo(this.round, turn, state, 1);
  }
}

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

/** Where the initiative values as of combat start live on the Combat document. */
export const BASE_INITIATIVES_FLAG = 'flags.tno.baseInitiatives';

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
   * Slowest first, ties broken by name and then id.
   *
   * **Deliberately an instance method that never touches `this`.** Core calls it
   * unbound (`this.combatants.contents.sort(this._sortCombatants)` in
   * `Combat#setupTurns`), so `this` is `undefined` inside — and moving it to
   * `static` would take it off the prototype entirely, leaving `sort()` with
   * `undefined` and a lexicographic fallback.
   *
   * The name comparison is a plain `<`/`>` rather than `localeCompare`: turn
   * indices are shared state, so every client has to reach the same order
   * regardless of its own locale. `id` closes the tie the way core does.
   * @param {Combatant} a
   * @param {Combatant} b
   * @returns {number}
   * @override
   */
  _sortCombatants(a, b) {
    const ia = Number.isFinite(a.initiative) ? a.initiative : Infinity;
    const ib = Number.isFinite(b.initiative) ? b.initiative : Infinity;
    if (ia !== ib) return ia - ib;
    const na = a.name ?? '';
    const nb = b.name ?? '';
    if (na !== nb) return na > nb ? 1 : -1;
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
   * the slowest combatant, because the sort is ascending — then snapshot the
   * initiative values and open the round state on whoever it made current.
   *
   * The state is written *after* rather than before: it then describes a round
   * that exists, and a `combatStart` handler that cancels the update leaves no
   * stale round behind.
   * @returns {Promise<this>}
   * @override
   */
  async startCombat() {
    await super.startCombat();
    await this.update({
      [BASE_INITIATIVES_FLAG]: this.#snapshotInitiatives(),
      [ROUND_STATE_FLAG]: createRoundState(this.round, this.#currentCombatantId),
    });
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
   * Restore the initiative values from combat start, then open the next round.
   *
   * The restore is what makes an interrupt cost nothing permanently: pulling a
   * turn forward moves the cursor, and any hand-editing of initiative during the
   * round is undone when the round turns over.
   * @returns {Promise<this>}
   * @override
   */
  async nextRound() {
    const learned = await this.#restoreBaseInitiatives();

    // Read the finished round before core moves the cursor, and write the new
    // one only once core has — so the round state always names a turn that
    // exists, and whichever combatant core chose to open on is the one recorded.
    const completed = this.#state;
    await super.nextRound();
    await this.update({
      [ROUND_STATE_FLAG]: startNextRound(completed, this.round, this.#currentCombatantId),
      ...(learned ? { [BASE_INITIATIVES_FLAG]: learned } : {}),
    });
    return this;
  }

  /**
   * Pull a combatant's activation forward, out of order. Public and GM-side:
   * the tracker button calls it directly, a player's request reaches it through
   * [`helpers/combat-socket.mjs`](../helpers/combat-socket.mjs).
   * @param {string} combatantId
   * @returns {Promise<this>}
   */
  async activateEarly(combatantId) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant || !this.started) return this;

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

  /* -------------------------------------------- */
  /*  Internals                                   */
  /* -------------------------------------------- */

  /**
   * The initiative values worth remembering as this round's baseline.
   *
   * Only the numbers: a combatant who has not rolled has no baseline to restore
   * to, and recording their `null` would turn the round change into an
   * initiative reset.
   * @returns {Object<string, number>}
   */
  #snapshotInitiatives() {
    return Object.fromEntries(
      this.combatants
        .filter((c) => Number.isFinite(c.initiative))
        .map((c) => [c.id, c.initiative])
    );
  }

  /**
   * Put every combatant back on the initiative it started the combat with, and
   * adopt a baseline for anyone who did not have one yet.
   *
   * The second half is what stops the restore from destroying work. A combat can
   * legitimately be started before anybody rolls, and combatants join mid-fight;
   * both leave the snapshot with no entry for them. Their *first* value is then
   * their baseline, rather than the round change wiping it back to nothing.
   * @returns {Promise<Object<string, number>|undefined>} the grown snapshot, if it grew
   */
  async #restoreBaseInitiatives() {
    const stored = this.getFlag('tno', 'baseInitiatives');
    if (!stored) return undefined;

    const base = { ...stored };
    const updates = [];
    let learned = false;

    for (const combatant of this.combatants) {
      const remembered = base[combatant.id];
      if (Number.isFinite(remembered)) {
        if (combatant.initiative !== remembered) {
          updates.push({ _id: combatant.id, initiative: remembered });
        }
      } else if (Number.isFinite(combatant.initiative)) {
        base[combatant.id] = combatant.initiative;
        learned = true;
      }
    }

    if (updates.length) await this.updateEmbeddedDocuments('Combatant', updates);
    return learned ? base : undefined;
  }
}

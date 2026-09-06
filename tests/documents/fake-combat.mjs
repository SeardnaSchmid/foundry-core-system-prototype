/**
 * A Combat document stripped down to what `TnoCombat` actually reaches for.
 *
 * `TnoCombat extends Combat`, and `Combat` is a Foundry global resolved when the
 * class body is evaluated — so the base class has to exist *before* the module
 * is imported. Hence the prolog below and the dynamic import at the bottom, the
 * same shape `tests/helpers/combat-actions.test.js` uses.
 *
 * The stubbed base implements only the three methods `TnoCombat` calls through
 * to, and it implements them the way core does, so a test that reaches `super`
 * is still asserting against Foundry's documented behaviour rather than a
 * placeholder.
 */

/** Every hook `TnoCombat` fired since the last {@link resetHookCalls}. */
export const hookCalls = [];

/** Every notification `TnoCombat` raised since the last {@link resetWarnings}. */
export const warnings = [];

export function resetHookCalls() {
  hookCalls.length = 0;
}

export function resetWarnings() {
  warnings.length = 0;
}

globalThis.Hooks = {
  callAll(hook, combat, updateData, updateOptions) {
    hookCalls.push({ hook, updateData, updateOptions });
  },
};

globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
  },
};

globalThis.ui = {
  notifications: { warn: (message) => warnings.push(message) },
};

globalThis.Combat = class {
  /** Core's `Combat#startCombat`, minus the sound and the effect refresh. */
  async startCombat() {
    await this.update({ round: 1, turn: 0 });
    return this;
  }

  /** Core's `Combat#nextRound`. */
  async nextRound() {
    let turn = this.turn === null || this.turns.length === 0 ? null : 0;
    if (this.settings.skipDefeated && turn !== null) {
      turn = this.turns.findIndex((t) => !t.isDefeated);
      if (turn === -1) turn = 0;
    }
    await this.update({ round: this.round + 1, turn });
    return this;
  }

  /** Core's `Combat#previousTurn`, recorded so a test can see it was reached. */
  async previousTurn() {
    this.superPreviousTurns += 1;
    return this;
  }
};

const { TnoCombat, BASE_INITIATIVES_FLAG, ROUND_STATE_FLAG } =
  await import('../../module/documents/combat.mjs');

export { TnoCombat, BASE_INITIATIVES_FLAG, ROUND_STATE_FLAG };

/**
 * @param {object} [spec]
 * @param {Array<{id: string, name?: string, initiative?: number|null, isDefeated?: boolean}>} [spec.combatants]
 * @param {number} [spec.round]
 * @param {number|null} [spec.turn]
 * @param {boolean} [spec.skipDefeated]
 * @param {object} [spec.flags]
 * @returns {TnoCombat}
 */
export function makeCombat({ combatants = [], round = 0, turn = null, skipDefeated = false, flags = {} } = {}) {
  const combat = new TnoCombat();
  const docs = combatants.map((c) => ({ name: c.id, initiative: null, isDefeated: false, ...c }));

  combat.id = 'combat';
  combat.round = round;
  combat.turn = turn;
  combat.flags = foundryClone(flags);
  combat.settings = { skipDefeated };
  combat.updates = [];
  combat.combatantUpdates = [];
  combat.superPreviousTurns = 0;

  // Core's EmbeddedCollection is iterable and carries the Array read methods;
  // TnoCombat uses `get`, `filter` and `for…of`, so the fake supplies all three.
  combat.combatants = {
    get: (id) => docs.find((c) => c.id === id),
    filter: (fn) => docs.filter(fn),
    contents: docs,
    get size() {
      return docs.length;
    },
    [Symbol.iterator]: () => docs[Symbol.iterator](),
  };
  // Core keeps `turns` as the sorted view of the combatants; the sort under test
  // is the one that builds it.
  combat.turns = [...docs].sort((a, b) => TnoCombat.prototype._sortCombatants(a, b));

  combat.getFlag = (scope, key) => combat.flags?.[scope]?.[key];
  combat.getTimeDelta = () => 0;

  combat.update = async (changes) => {
    combat.updates.push(changes);
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'round' || key === 'turn') combat[key] = value;
      else if (key.startsWith('flags.')) setFlagPath(combat.flags, key.slice('flags.'.length), value);
    }
    return combat;
  };

  combat.updateEmbeddedDocuments = async (type, updates) => {
    combat.combatantUpdates.push({ type, updates });
    for (const update of updates) {
      const doc = docs.find((c) => c.id === update._id);
      if (doc) Object.assign(doc, update);
    }
    return updates;
  };

  Object.defineProperty(combat, 'started', {
    get: () => combat.round > 0 && combat.turns.length > 0,
  });

  return combat;
}

function setFlagPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  while (parts.length > 1) {
    const part = parts.shift();
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts[0]] = value;
}

function foundryClone(value) {
  return JSON.parse(JSON.stringify(value));
}

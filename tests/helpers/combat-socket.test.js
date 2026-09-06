// The interrupt socket is the one place in this system where one client asks
// another to write, so what matters is not that the happy path works but that
// everything else is refused: the request carries a user id and a combatant id,
// and both are re-checked on the GM's client rather than trusted.
import { beforeEach, describe, expect, it } from 'vitest';

globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };

const { handleCombatSocketMessage, TNO_SOCKET } = await import('../../module/helpers/combat-socket.mjs');

/** Every combatant this fixture activated early, in order. */
let activated;

/**
 * @param {object} [spec]
 * @param {boolean} [spec.isGM]        Whether the receiving client is a GM
 * @param {boolean} [spec.isActiveGM]  Whether it is *the* GM who acts on requests
 * @param {boolean} [spec.started]
 * @param {Array<string>} [spec.owners] User ids owning the combatant's actor
 */
function stubGame({ isGM = true, isActiveGM = true, started = true, owners = ['player'] } = {}) {
  const self = { id: 'gm', isGM };
  const player = { id: 'player', isGM: false };
  const stranger = { id: 'stranger', isGM: false };

  const combatant = {
    id: 'combatant',
    actor: {
      testUserPermission: (user, level) =>
        level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && owners.includes(user.id),
    },
  };
  const combat = {
    id: 'combat',
    started,
    combatants: { get: (id) => (id === combatant.id ? combatant : undefined) },
    activateEarly: async (id) => activated.push(id),
  };

  globalThis.game = {
    user: self,
    users: {
      activeGM: isActiveGM ? self : { id: 'other-gm', isGM: true },
      get: (id) => [self, player, stranger].find((u) => u.id === id),
    },
    combats: { get: (id) => (id === combat.id ? combat : undefined) },
  };
  return { combat, combatant };
}

/** A well-formed request from the player who owns the combatant. */
const request = (overrides = {}) => ({
  type: 'activateEarly',
  combatId: 'combat',
  combatantId: 'combatant',
  userId: 'player',
  ...overrides,
});

beforeEach(() => {
  activated = [];
});

describe('the interrupt socket', () => {
  it('uses the system socket namespace, so no module id can collide with it', () => {
    expect(TNO_SOCKET).toBe('system.tno');
  });

  it('grants an owner their own combatant', async () => {
    stubGame();
    await expect(handleCombatSocketMessage(request())).resolves.toBe(true);
    expect(activated).toEqual(['combatant']);
  });

  it('ignores a message that is not an interrupt request', async () => {
    stubGame();
    await expect(handleCombatSocketMessage({ type: 'somethingElse' })).resolves.toBe(false);
    await expect(handleCombatSocketMessage(undefined)).resolves.toBe(false);
    expect(activated).toEqual([]);
  });

  it('is ignored entirely on a player client', async () => {
    // Every client receives the message; only a GM may act on it.
    stubGame({ isGM: false, isActiveGM: false });
    await expect(handleCombatSocketMessage(request())).resolves.toBe(false);
    expect(activated).toEqual([]);
  });

  it('is answered by one GM only, when several are connected', async () => {
    stubGame({ isActiveGM: false });
    await expect(handleCombatSocketMessage(request())).resolves.toBe(false);
    expect(activated).toEqual([]);
  });

  it('refuses a combatant the requesting user does not own', async () => {
    stubGame();
    await expect(handleCombatSocketMessage(request({ userId: 'stranger' }))).resolves.toBe(false);
    expect(activated).toEqual([]);
  });

  it('refuses a request from a user this world does not know', async () => {
    stubGame();
    await expect(handleCombatSocketMessage(request({ userId: 'ghost' }))).resolves.toBe(false);
    expect(activated).toEqual([]);
  });

  it('refuses a combat that has not started', async () => {
    stubGame({ started: false });
    await expect(handleCombatSocketMessage(request())).resolves.toBe(false);
    expect(activated).toEqual([]);
  });

  it('refuses a combat or combatant that does not exist', async () => {
    stubGame();
    await expect(handleCombatSocketMessage(request({ combatId: 'gone' }))).resolves.toBe(false);
    await expect(handleCombatSocketMessage(request({ combatantId: 'gone' }))).resolves.toBe(false);
    expect(activated).toEqual([]);
  });
});

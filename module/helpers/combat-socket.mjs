/**
 * The one place in this system where a client asks another client to write.
 *
 * Everything on the roll side is deliberately decoupled — no sheet reads another
 * sheet, no workflow checks another user's permissions (see
 * [`combat-roll-workflows.md`](../../docs/wiki/concepts/combat-roll-workflows.md)).
 * The turn order is the exception, and it is one for a structural reason rather
 * than a convenient one: a roll belongs to the person making it, while the
 * activation history is a single object every participant shares. A player may
 * not write the Combat document, so pulling their own activation forward has to
 * be a *request* to whoever may.
 *
 * The request carries no rule with it. Everything it asks for is re-derived and
 * re-checked on the GM's client — who sent it, whether they own that combatant,
 * whether the combat is even running — so a hand-crafted socket message can do
 * nothing the button could not.
 */

/** Foundry routes `system.<id>` messages to every connected client. */
export const TNO_SOCKET = 'system.tno';

/**
 * Ask the GM to pull one of this user's combatants forward.
 * @param {string} combatId
 * @param {string} combatantId
 */
export function emitInterrupt(combatId, combatantId) {
  game.socket.emit(TNO_SOCKET, {
    type: 'activateEarly',
    combatId,
    combatantId,
    userId: game.user.id,
  });
}

/** Listen for interrupt requests. Called from `tno.mjs` on `ready`. */
export function registerCombatSocket() {
  game.socket.on(TNO_SOCKET, (message) => handleCombatSocketMessage(message));
}

/**
 * Grant or refuse one interrupt request.
 *
 * Exported for its own test: the refusals are the part worth pinning down, and
 * a socket round trip cannot be driven from a single e2e client.
 * @param {object} message
 * @returns {Promise<boolean>} whether the request was carried out
 */
export async function handleCombatSocketMessage(message) {
  if (message?.type !== 'activateEarly') return false;

  // Every GM client receives the message; only one may act on it, or the second
  // one refuses an activation the first has just granted.
  if (!game.user.isGM || game.users.activeGM !== game.user) return false;

  const combat = game.combats.get(message.combatId);
  if (!combat?.started) return false;

  const combatant = combat.combatants.get(message.combatantId);
  const user = game.users.get(message.userId);
  if (!combatant || !user || !ownsCombatant(user, combatant)) return false;

  await combat.activateEarly(combatant.id);
  return true;
}

/**
 * Whether that user may act for that combatant. Asked of the actor rather than
 * of the combatant, because ownership of the character is what the table means
 * by "mine".
 * @param {User} user
 * @param {Combatant} combatant
 * @returns {boolean}
 */
function ownsCombatant(user, combatant) {
  if (user.isGM) return true;
  return combatant.actor?.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) ?? false;
}

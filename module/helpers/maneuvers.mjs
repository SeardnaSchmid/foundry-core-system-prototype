/**
 * Manöver and hit-location damage rules.
 *
 * "Manöver sind alles, was Kampfhandlungen wie Angriffe, Paraden, Ausweichen,
 * Bewegung und so weiter modifiziert" — and every declarable one modifies a roll
 * that already exists: "alles das läuft aber unter Angriff". None of them is a
 * roll of its own, which is why nothing here opens one.
 *
 * **Which** Manöver was declared is deliberately not modelled. An Ansage is one
 * free magnitude the player and the GM agree on out loud, and the reason behind
 * it — a Finte, a Starker Schwung, something the rulebook never named — is table
 * talk that no field can hold and no arithmetic needs. What the system carries is
 * the number.
 *
 * The attack dialog does not model a separate aimed-location choice. The
 * defender opens the resistance roll directly on the struck paper-doll zone;
 * that zone still decides the damage multiplier here.
 *
 * This module holds itself free of Foundry globals so it can be unit-tested
 * without a game world.
 */

/**
 * The Stelle a standard attack hits when nothing was announced.
 * @type {string}
 */
export const DEFAULT_ZONE = 'torso';

/**
 * The damage multiplier of a hit, given its Stelle. Attribute routing is gone:
 * the multiplier applies to whichever pool the penetration comparison selected.
 * @type {Object<string, {multiplier: number}>}
 */
export const DAMAGE_RULES = {
  torso: { multiplier: 1 },
  head: { multiplier: 2 },
  arms: { multiplier: 1 },
  legs: { multiplier: 1 },
};

/**
 * What a failed resistance roll puts into the pool, given the Schadenswert that
 * was announced and the Stelle it landed on.
 *
 * The multiplier is the only thing the Stelle still contributes, and this is
 * where it is finally cashed in: every earlier consumer of {@link DAMAGE_RULES}
 * only *names* it ("Schadenspool ×2"), because until the resistance roll has
 * failed there is no amount to multiply.
 *
 * The rule reads "Schaden in Höhe des verwendeten Schadenswert als Würfel", and
 * which dice those would be is written nowhere — so this takes the announced
 * value at face value. See the combat PRD's Open section.
 *
 * @param {number} value  The Schadenswert the defender was told, as typed.
 * @param {string} zone   The Stelle that was resisted at.
 * @returns {{base: number, multiplier: number, total: number}}
 */
export function appliedDamage(value, zone) {
  const base = Math.max(0, Math.trunc(Number(value) || 0));
  const { multiplier } = DAMAGE_RULES[zone] ?? DAMAGE_RULES[DEFAULT_ZONE];
  return { base, multiplier, total: base * multiplier };
}

/**
 * What the attacker has to tell the defender, reduced to numbers.
 *
 * This is the whole declaration portion of the A→B channel: one announced
 * amount. The defender needs none of the attacker's stats to use it, and the
 * attacker needed none of the defender's to produce it.
 *
 * The Ansage arrives as a single figure rather than one per defence. Which of
 * the defender's rolls it lands on is exactly the part the two players said out
 * loud when they agreed the number, and a card that split it three ways would be
 * claiming knowledge the system no longer has.
 *
 * @param {number} ansage  The declared Betrag, as typed.
 * @returns {{ansage: number}}
 */
export function ansageEnvelope(ansage) {
  return {
    ansage: Math.max(0, Math.trunc(Number(ansage) || 0)),
  };
}

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
 * that zone still decides here whether the hit brings extra Wuchtschaden.
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
 * What a hit on each Stelle adds to its regular damage. Only the Kopf adds
 * anything: the wiki's Kopf Manöver deals, "zusätzlich zu dem regulären Schaden
 * deines Angriffs, einmal den Wuchtschaden" — the weapon's WS once more, as
 * Wuchtschaden.
 * @type {Object<string, {extraBlunt: boolean}>}
 */
export const DAMAGE_RULES = {
  torso: { extraBlunt: false },
  head: { extraBlunt: true },
  arms: { extraBlunt: false },
  legs: { extraBlunt: false },
};

/**
 * What a failed resistance roll puts into the pool, given the Schadenswert that
 * was announced, the pool it lands in and the Stelle it landed on.
 *
 * On the Kopf the WS comes once more as Wuchtschaden. When the regular damage
 * already is the WS, that is the announced value twice; when it is the SS, the
 * WS is a second figure the defender reads off the attack card, so the result
 * only says it is owed (`plusAttackerWs`).
 *
 * The rule reads "Schaden in Höhe des verwendeten Schadenswert als Würfel", and
 * which dice those would be is written nowhere — so this takes the announced
 * value at face value. See the combat PRD's Open section.
 *
 * @param {number} value   The Schadenswert the defender was told, as typed.
 * @param {string} zone    The Stelle that was resisted at.
 * @param {boolean} sharp  Whether the regular damage is SS (else WS).
 * @returns {{base: number, total: number, extraBlunt: boolean, plusAttackerWs: boolean}}
 */
export function appliedDamage(value, zone, sharp = false) {
  const base = Math.max(0, Math.trunc(Number(value) || 0));
  const { extraBlunt } = DAMAGE_RULES[zone] ?? DAMAGE_RULES[DEFAULT_ZONE];
  return {
    base,
    total: extraBlunt && !sharp ? base * 2 : base,
    extraBlunt,
    plusAttackerWs: extraBlunt && sharp,
  };
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

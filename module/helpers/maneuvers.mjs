/**
 * Manöver, as the two things a roll has to carry: how much was announced, and
 * where the blow is aimed.
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
 * The Stelle is the exception, because it is two things at once. It is a
 * location — it decides which attributes a failed resistance roll lands on, and
 * the defender opens that roll by clicking it on the paper doll, so it has to be
 * a discrete pick or the damage rule has nothing to read. And it is an Ansage
 * with a price the rulebook writes down, which is what {@link ZONE_COSTS} holds.
 * The pick and the price travel separately on purpose: the price worsens the
 * attacker's own roll, while only the location crosses to the defender.
 *
 * This module holds itself free of Foundry globals so it can be unit-tested
 * without a game world.
 */

import { MALUS_STEP } from './items.mjs';

/**
 * The Stelle a standard attack hits when nothing was announced.
 * @type {string}
 */
export const DEFAULT_ZONE = 'torso';

/**
 * Every Stelle an attack can name, the default first.
 *
 * There is no "keine Ansage" entry: an attack always lands somewhere, and where
 * it lands when nobody said otherwise is the Torso. Offering an empty option
 * beside a Torso option would be two names for one outcome.
 * @type {Array<string>}
 */
export const ZONE_CHOICES = [DEFAULT_ZONE, 'arms', 'legs', 'head'];

/**
 * Where the damage of a hit lands, and at what multiple, given the Stelle.
 *
 * "Schaden wird direkt auf körperliche Attribute angerechnet." The Trefferzonen
 * Manöver are what redirect it: Arme splits it "auf Fingerfertigkeit und
 * Stärke", Beine "auf Beweglichkeit und Stärke", and Kopf doubles it "nach der
 * Wiederstandsprobe". Torso — the Stelle of every attack that announced
 * nothing — takes it on Stärke, and Stärke at zero is death, which is why a
 * Standardangriff kills and the Ansage is the way *not* to: "jemandem in die
 * Brust zu schießen ist zwar gut um ihn zu töten, aber was, wenn du jemanden
 * nur entwaffnen oder an der Flucht hindern willst".
 *
 * `split` marks the two zones whose damage is shared — "die (aufgerundete)
 * Hälfte … und die (abgerundete) Hälfte" — though nothing halves anything yet:
 * a failed resistance roll costs "Schaden in Höhe des verwendeten Schadenswert
 * **als Würfel**", and which dice those are is not written anywhere in the
 * rules. Until it is, the Stelle can say where damage lands and at what
 * multiple, but not how much.
 *
 * The rule is fully determined by the Stelle, which is why an attack announces
 * the location and never the rule.
 * @type {Object<string, {attributes: Array<string>, split: boolean, multiplier: number}>}
 */
export const DAMAGE_RULES = {
  torso: { attributes: ['str'], split: false, multiplier: 1 },
  head: { attributes: ['str'], split: false, multiplier: 2 },
  arms: { attributes: ['fin', 'str'], split: true, multiplier: 1 },
  legs: { attributes: ['dex', 'str'], split: true, multiplier: 1 },
};

/**
 * What naming a Stelle costs the attack that names it.
 *
 * Straight out of Gezielte Angriffe, which prices each location in Stufen and
 * then spells the number out: Arme and Beine "um eine Stufe, also -3", Kopf "um
 * zwei Stufen, also -6". Written as multiples of {@link MALUS_STEP} rather than
 * as bare numbers, because that is what the rule says — the −3 and the −6 are
 * the step, restated.
 *
 * The Torso is free and has to be: it is where an attack that announced nothing
 * lands, so charging for it would price the standard attack.
 *
 * These are **Ansagen**, not a modifier of their own — "Ansagen auf Trefferzonen
 * im Nahkampf, normale Ansageregeln gelten hier auf alles". Two consequences the
 * dialog depends on: an aimed attack is a Manöver and takes the weapon's FV
 * step, and the amount is subject to whatever the table does with the Ansage
 * ladder, which is why nothing here caps or gates it.
 *
 * Kopf carries one more clause — "maximal um die Höhe deiner 'Gezielte Angriffe'
 * Fertigkeit" — that is deliberately not enforced; see the combat PRD's Open
 * section for why it is still unsettled.
 * @type {Object<string, number>}
 */
export const ZONE_COSTS = {
  torso: 0,
  arms: MALUS_STEP,
  legs: MALUS_STEP,
  head: 2 * MALUS_STEP,
};

/**
 * What this Stelle costs, or nothing for a location that is not one.
 * @param {string} zone
 * @returns {number}  A signed addend to the threshold, 0 or negative.
 */
export function zoneCost(zone) {
  return ZONE_COSTS[zone] ?? 0;
}

/**
 * What the attacker has to tell the defender, reduced to numbers.
 *
 * This is the whole of the A→B channel, and it is deliberately tiny: one
 * announced amount and one Stelle. The defender needs none of the attacker's
 * stats to use it, and the attacker needed none of the defender's to produce it.
 *
 * The Ansage arrives as a single figure rather than one per defence. Which of
 * the defender's rolls it lands on is exactly the part the two players said out
 * loud when they agreed the number, and a card that split it three ways would be
 * claiming knowledge the system no longer has.
 *
 * @param {number} ansage  The declared Betrag, as typed.
 * @param {string} zone    The Stelle the attack named.
 * @returns {{ansage: number, zone: string}}
 */
export function ansageEnvelope(ansage, zone) {
  return {
    ansage: Math.max(0, Math.trunc(Number(ansage) || 0)),
    zone: ZONE_CHOICES.includes(zone) ? zone : DEFAULT_ZONE,
  };
}

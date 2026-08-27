import { describe, expect, it } from 'vitest';

import {
  DAMAGE_RULES,
  DEFAULT_ZONE,
  ZONE_CHOICES,
  ZONE_COSTS,
  ansageEnvelope,
  zoneCost,
} from '../../module/helpers/maneuvers.mjs';

// Everything that crosses from the attacker to the defender. The defender is
// never told which Manöver was declared — from their side a Finte, a Starker
// Schwung and something the rulebook never named are the same sentence: your
// roll is worse by n.
describe('ansageEnvelope', () => {
  it('hits Torso with nothing announced', () => {
    expect(ansageEnvelope(0, undefined)).toEqual({ ansage: 0, zone: 'torso' });
  });

  it('carries the declared amount as one figure, not one per defence', () => {
    // Which of the defender's rolls it lands on was settled out loud when the
    // two players agreed the number. Splitting it here would be claiming
    // knowledge nothing in the system has any more.
    expect(ansageEnvelope(3, 'torso')).toEqual({ ansage: 3, zone: 'torso' });
  });

  it('names the Stelle the attack chose', () => {
    expect(ansageEnvelope(0, 'head')).toEqual({ ansage: 0, zone: 'head' });
    expect(ansageEnvelope(4, 'legs')).toEqual({ ansage: 4, zone: 'legs' });
  });

  it('falls back to Torso for a Stelle that is not one', () => {
    // The Unterkleidung is not a hit location, and neither is anything a stale
    // flag might carry.
    expect(ansageEnvelope(2, 'suit').zone).toBe(DEFAULT_ZONE);
    expect(ansageEnvelope(2, '').zone).toBe(DEFAULT_ZONE);
  });

  it('reads a missing, negative or fractional amount as nothing declared', () => {
    expect(ansageEnvelope(undefined, 'torso').ansage).toBe(0);
    expect(ansageEnvelope(-4, 'torso').ansage).toBe(0);
    expect(ansageEnvelope(2.9, 'torso').ansage).toBe(2);
  });
});

// The damage rule follows from the Stelle alone, which is why an attack
// announces the location and never the rule. Only the table is asserted: a
// failed resistance roll costs "Schaden … als Würfel" and the rules never say
// which dice, so nothing can yet turn a Stelle into an amount.
describe('DAMAGE_RULES', () => {
  it('puts an unannounced hit on Stärke, which is the attribute that kills', () => {
    // Torso is the Stelle of every attack that declared nothing, and Stärke at
    // zero is death — so a Standardangriff kills and the Ansage is the way not
    // to.
    expect(DAMAGE_RULES.torso).toEqual({ attributes: ['str'], split: false, multiplier: 1 });
  });

  it('doubles a head hit, and only a head hit', () => {
    expect(DAMAGE_RULES.head.multiplier).toBe(2);
    for (const zone of ['torso', 'arms', 'legs']) expect(DAMAGE_RULES[zone].multiplier).toBe(1);
  });

  it('splits an arm hit over Fingerfertigkeit and Stärke, in that order', () => {
    // "Die (aufgerundete) Hälfte des Schadens auf Fingerfertigkeit und die
    // (abgerundete) Hälfte auf Stärke" — the order is the rounding, so it is
    // load-bearing. Fingerfertigkeit at zero is what disarms, which is what the
    // Manöver is for; Beweglichkeit at zero is what stops the escape.
    expect(DAMAGE_RULES.arms).toEqual({ attributes: ['fin', 'str'], split: true, multiplier: 1 });
    expect(DAMAGE_RULES.legs).toEqual({ attributes: ['dex', 'str'], split: true, multiplier: 1 });
  });

  it('covers every Stelle an attack can announce, and the default first', () => {
    // A Stelle with no rule would silently drop damage, so the picker and the
    // table have to stay in step. Torso leads because it is what an attack that
    // announces nothing hits, which makes it the honest default selection.
    expect(ZONE_CHOICES[0]).toBe(DEFAULT_ZONE);
    for (const zone of ZONE_CHOICES) expect(DAMAGE_RULES[zone]).toBeDefined();
    // And there is no empty "keine Ansage" entry beside Torso: that would be two
    // names for one outcome.
    expect(ZONE_CHOICES).not.toContain('');
  });

  it('prices every Stelle it offers, and leaves the Torso free', () => {
    // A location the picker offers but the price table does not know would be
    // silently free, which is the same class of bug as a missing damage rule.
    for (const zone of ZONE_CHOICES) expect(ZONE_COSTS[zone]).toBeDefined();
    // "Arme/Beine: um eine Stufe, also -3" · "Kopf: um zwei Stufen, also -6".
    expect(zoneCost('arms')).toBe(-3);
    expect(zoneCost('legs')).toBe(-3);
    expect(zoneCost('head')).toBe(-6);
    // The Torso is where an attack that announced nothing lands, so a price on
    // it would be a price on the Standardangriff.
    expect(zoneCost(DEFAULT_ZONE)).toBe(0);
    // Anything that is not a Stelle costs nothing rather than NaN.
    expect(zoneCost('suit')).toBe(0);
    expect(zoneCost(undefined)).toBe(0);
  });
});

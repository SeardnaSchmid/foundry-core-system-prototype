import { describe, expect, it } from 'vitest';

import {
  DAMAGE_RULES,
  DEFAULT_ZONE,
  ZONE_CHOICES,
  ZONE_COSTS,
  ansageEnvelope,
  appliedDamage,
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

// The Stelle now changes only the multiplier applied to the selected pool.
describe('DAMAGE_RULES', () => {
  it('leaves an unannounced torso hit at the normal multiplier', () => {
    expect(DAMAGE_RULES.torso).toEqual({ multiplier: 1 });
  });

  it('doubles a head hit, and only a head hit', () => {
    expect(DAMAGE_RULES.head.multiplier).toBe(2);
    for (const zone of ['torso', 'arms', 'legs']) expect(DAMAGE_RULES[zone].multiplier).toBe(1);
  });

  it('does not route arm or leg hits into attributes', () => {
    expect(DAMAGE_RULES.arms).toEqual({ multiplier: 1 });
    expect(DAMAGE_RULES.legs).toEqual({ multiplier: 1 });
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

// The multiplier is named everywhere and cashed in exactly once: here, on the
// Schadenswert a failed resistance roll let through.
describe('appliedDamage', () => {
  it('applies the announced value unchanged everywhere but the head', () => {
    for (const zone of ['torso', 'arms', 'legs']) {
      expect(appliedDamage(4, zone)).toEqual({ base: 4, multiplier: 1, total: 4 });
    }
  });

  it('doubles what reaches the head', () => {
    expect(appliedDamage(4, 'head')).toEqual({ base: 4, multiplier: 2, total: 8 });
  });

  it('reads an unannounced Stelle as the Torso rather than dropping the damage', () => {
    expect(appliedDamage(3, 'suit').total).toBe(3);
    expect(appliedDamage(3, undefined).total).toBe(3);
  });

  it('takes no damage from a blank, negative or fractional value', () => {
    expect(appliedDamage('', 'head').total).toBe(0);
    expect(appliedDamage(-5, 'head').total).toBe(0);
    expect(appliedDamage(2.8, 'head')).toEqual({ base: 2, multiplier: 2, total: 4 });
  });
});

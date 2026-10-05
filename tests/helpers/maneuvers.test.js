import { describe, expect, it } from 'vitest';

import {
  DAMAGE_RULES,
  ansageEnvelope,
  appliedDamage,
} from '../../module/helpers/maneuvers.mjs';

// Everything that crosses from the attacker to the defender. The defender is
// never told which Manöver was declared — from their side a Finte, a Starker
// Schwung and something the rulebook never named are the same sentence: your
// roll is worse by n.
describe('ansageEnvelope', () => {
  it('carries the declared amount as one figure, not one per defence', () => {
    // Which of the defender's rolls it lands on was settled out loud when the
    // two players agreed the number. Splitting it here would be claiming
    // knowledge nothing in the system has any more.
    expect(ansageEnvelope(3)).toEqual({ ansage: 3 });
  });

  it('reads a missing, negative or fractional amount as nothing declared', () => {
    expect(ansageEnvelope(undefined).ansage).toBe(0);
    expect(ansageEnvelope(-4).ansage).toBe(0);
    expect(ansageEnvelope(2.9).ansage).toBe(2);
  });
});

// The Stelle adds nothing but the Kopf's extra Wuchtschaden.
describe('DAMAGE_RULES', () => {
  it('adds Wuchtschaden to a head hit, and only a head hit', () => {
    expect(DAMAGE_RULES.head).toEqual({ extraBlunt: true });
    for (const zone of ['torso', 'arms', 'legs']) expect(DAMAGE_RULES[zone]).toEqual({ extraBlunt: false });
  });
});

// The Kopf's extra WS is cashed in here, on the Schadenswert a failed
// resistance roll let through.
describe('appliedDamage', () => {
  it('applies the announced value unchanged everywhere but the head', () => {
    for (const zone of ['torso', 'arms', 'legs']) {
      expect(appliedDamage(4, zone, true)).toEqual({ base: 4, total: 4, extraBlunt: false, plusAttackerWs: false });
      expect(appliedDamage(4, zone, false).total).toBe(4);
    }
  });

  it('gives a held head hit its WS twice as Wuchtschaden', () => {
    expect(appliedDamage(4, 'head', false)).toEqual({ base: 4, total: 8, extraBlunt: true, plusAttackerWs: false });
  });

  it('keeps a penetrating head hit at its SS and owes the attacker WS on top', () => {
    expect(appliedDamage(4, 'head', true)).toEqual({ base: 4, total: 4, extraBlunt: true, plusAttackerWs: true });
  });

  it('reads an unannounced Stelle as the Torso rather than dropping the damage', () => {
    expect(appliedDamage(3, 'suit').total).toBe(3);
    expect(appliedDamage(3, undefined).total).toBe(3);
  });

  it('takes no damage from a blank, negative or fractional value', () => {
    expect(appliedDamage('', 'head').total).toBe(0);
    expect(appliedDamage(-5, 'head').total).toBe(0);
    expect(appliedDamage(2.8, 'head').total).toBe(4);
  });
});

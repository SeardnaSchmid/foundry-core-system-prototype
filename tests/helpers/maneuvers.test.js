import { describe, expect, it } from 'vitest';

import {
  ANSAGE_GROUPS,
  DAMAGE_RULES,
  DEFAULT_ZONE,
  MANEUVERS,
  ansageEnvelope,
  ansageKosten,
  declarableManeuvers,
  maneuverSkill,
} from '../../module/helpers/maneuvers.mjs';

describe('ansageKosten', () => {
  // The rulebook works this exact case: "Wenn du beispielsweise Geschickte
  // Angriffe 2 hast und eine 3er Finte ansagst, ist dein Angriffswurf um 4
  // erschwert und die gegnerische Parade um 3. Hättest du Geschickte Angriffe 4,
  // wäre dein Angriff nur um 3 erschwert und hättest du gar keinen Punkt in
  // Geschickte Angriffe um 6."
  it('matches all three of the rulebook worked examples', () => {
    expect(ansageKosten(3, 2)).toBe(4);
    expect(ansageKosten(3, 4)).toBe(3);
    expect(ansageKosten(3, 0)).toBe(6);
  });

  it('charges one for one up to the rank and two for one past it', () => {
    expect(ansageKosten(0, 5)).toBe(0);
    expect(ansageKosten(5, 5)).toBe(5);
    // The first point past the rank is where the surcharge starts, and it is a
    // surcharge on the declarer only — the effect stays the declared Betrag.
    expect(ansageKosten(6, 5)).toBe(7);
    expect(ansageKosten(8, 5)).toBe(11);
  });

  it('reads a missing, negative or fractional entry as nothing declared', () => {
    expect(ansageKosten(undefined, 3)).toBe(0);
    expect(ansageKosten(-4, 3)).toBe(0);
    expect(ansageKosten(2.9, 3)).toBe(2);
    expect(ansageKosten(3, undefined)).toBe(6);
  });
});

describe('the Manöver table', () => {
  // Three of the Kampfregeln's section headings are not skill names. The table
  // has to follow the Fertigkeiten page, because the rank a character actually
  // buys — and therefore the 1:1 limit — hangs off the skill key.
  it('names the skill that governs each Manöver, not its rulebook section', () => {
    expect(MANEUVERS.feint.skill).toBe('cunningAttacks');
    // "Starke Angriffe" is the section; the Fertigkeit is Distanzkontrolle.
    expect(MANEUVERS.strongSwing.skill).toBe('rangeControl');
    // "Gezielte Angriffe" is the section; the Fertigkeit is Gezielter Stich in
    // melee and Angesagter Schuss at range.
    expect(maneuverSkill(MANEUVERS.head, 'melee')).toBe('preciseStrike');
    expect(maneuverSkill(MANEUVERS.head, 'ranged')).toBe('calledShot');
  });

  it('offers a melee attack its Ansagen and a parry only the one it has', () => {
    const melee = declarableManeuvers('attack', 'melee').map((entry) => entry.key);
    expect(melee).toContain('feint');
    expect(melee).toContain('head');
    expect(melee).toContain('strongSwing');
    // Riposte is declared on a parry, so it is not an attack option.
    expect(melee).not.toContain('riposte');
    expect(declarableManeuvers('parry', 'melee').map((entry) => entry.key)).toEqual(['riposte']);
  });

  it('keeps the melee-only Manöver off a ranged attack', () => {
    const ranged = declarableManeuvers('attack', 'ranged').map((entry) => entry.key);
    // Trefferzonen are announced at range too — "Gezielte Schüsse" — but a feint
    // and the two Schwünge are melee.
    expect(ranged).toEqual(['arms', 'legs', 'head', 'bypassArmor', 'weakSpot']);
  });

  it('marks the Manöver that need the reach advantage', () => {
    expect(MANEUVERS.strongSwing.requiresReach).toBe(true);
    expect(MANEUVERS.wideSwing.requiresReach).toBe(true);
    expect(MANEUVERS.feint.requiresReach).toBeUndefined();
  });

  it('names the Stelle for every Trefferzonen-Manöver and for no other', () => {
    expect(MANEUVERS.arms.zone).toBe('arms');
    expect(MANEUVERS.legs.zone).toBe('legs');
    expect(MANEUVERS.head.zone).toBe('head');
    expect(MANEUVERS.feint.zone).toBeUndefined();
  });

  // An attack has one Stelle, so the three that name one are a choice rather
  // than three independent declarations — and a Betrag the rule fixes has no
  // zero to mean "not declared" with, which is why every `fixed` Manöver is in
  // a group and nothing else is.
  it('groups exactly the Manöver that exclude one another', () => {
    const grouped = Object.entries(MANEUVERS).filter(([, m]) => m.group).map(([key]) => key);
    expect(grouped).toEqual(['arms', 'legs', 'head']);
    for (const key of grouped) expect(MANEUVERS[key].group).toBe('zone');
    expect(ANSAGE_GROUPS.zone).toBeDefined();

    const fixed = Object.entries(MANEUVERS).filter(([, m]) => typeof m.betrag === 'number').map(([key]) => key);
    expect(fixed).toEqual(grouped);
  });
});

// Everything that crosses from the attacker to the defender. The defender is
// never told which Manöver was declared, because from their side a Finte, a
// Starker Schwung and a Weiter Schwung are the same sentence.
describe('ansageEnvelope', () => {
  it('hits Torso with nothing announced', () => {
    expect(ansageEnvelope([])).toEqual({
      parry: 0,
      dodge: 0,
      resistance: 0,
      zone: 'torso',
      bypassArmor: false,
    });
  });

  it('carries the declared Betrag, never the cost', () => {
    // Geschickte Angriffe 2, 3er Finte: the attack paid 4, the defence takes 3.
    expect(ansageEnvelope([{ key: 'feint', betrag: 3, cost: 4 }])).toMatchObject({ parry: 3, dodge: 3 });
  });

  it('sends each Schwung only to the roll its rule names', () => {
    // "Starker Schwung … um den Wiederstandswurf und den Paradewurf deines
    // Gegners zu erschweren" — the dodge is untouched.
    expect(ansageEnvelope([{ key: 'strongSwing', betrag: 2 }])).toMatchObject({
      parry: 2,
      resistance: 2,
      dodge: 0,
    });
    // "Weiter Schwung … um den Ausweichenwurf deines Gegners zu erschweren".
    expect(ansageEnvelope([{ key: 'wideSwing', betrag: 2 }])).toMatchObject({
      dodge: 2,
      parry: 0,
      resistance: 0,
    });
  });

  it('sums what lands on the same roll and names the Stelle', () => {
    const envelope = ansageEnvelope([
      { key: 'feint', betrag: 3 },
      { key: 'strongSwing', betrag: 2 },
      { key: 'head', betrag: 6 },
      { key: 'bypassArmor', betrag: 4 },
    ]);
    expect(envelope).toEqual({
      parry: 5,
      dodge: 3,
      resistance: 2,
      zone: 'head',
      bypassArmor: true,
    });
  });

  it('says nothing about a Riposte, whose effect is the declarer\'s own', () => {
    // It eases your *next* attack rather than worsening anything of theirs, so
    // there is nothing for the other side to enter.
    expect(ansageEnvelope([{ key: 'riposte', betrag: 4 }])).toMatchObject({
      parry: 0,
      dodge: 0,
      resistance: 0,
    });
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

  it('covers every Stelle a Manöver can announce, and the default', () => {
    // A Stelle with no rule would silently drop damage, so the table and the
    // Manöver that name locations have to stay in step.
    const announced = Object.values(MANEUVERS).map((m) => m.zone).filter(Boolean);
    for (const zone of [...announced, DEFAULT_ZONE]) expect(DAMAGE_RULES[zone]).toBeDefined();
  });
});

import { describe, expect, it } from 'vitest';

// TnoItem is a Foundry document, but the path from a weapon profile to the
// fixed components of its Attack/Parry roll is deterministic. A minimal shell
// of the globals it reads lets the unit suite verify that path — which is what
// actually reaches the player — without a browser or a Foundry world.
//
// Only the pieces `openWeaponCheck`/`openWeaponParry` touch are stubbed: the
// document base class, the skill catalogue, i18n, and the roll dialog, which
// stands in as a recorder for the options it would have been constructed with.
globalThis.Item = class {};
globalThis.CONFIG = {
  TNO: {
    skills: { swords: { label: 'Swords', category: 'combat', attribute: 'str' } },
    skillCategories: { combat: 'Combat' },
    abilities: { str: {}, dex: {}, fin: {} },
    // An attack names a Stelle, so the builder reads the zone labels even when
    // the roll under test is about something else entirely.
    armorZones: {
      head: 'TNO.Armor.Zone.Head',
      torso: 'TNO.Armor.Zone.Torso',
      arms: 'TNO.Armor.Zone.Arms',
      legs: 'TNO.Armor.Zone.Legs',
    },
  },
};

/** The options of the most recent dialog the item tried to open. */
let opened = null;

globalThis.game = {
  i18n: {
    localize: (key) => key,
    // Enough of `format` to keep the interpolated step count visible: the
    // label is the only place a component says how many Malusstufen it is.
    format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
  },
  tno: {
    TnoRollDialog: class {
      constructor(actor, options) {
        opened = options;
      }

      render() {
        return this;
      }
    },
  },
};

const { TnoItem } = await import('../../module/documents/item.mjs');

describe('weapon roll requirement components', () => {
  const actor = ({ skill = 5, strength = 2 } = {}) => ({
    isOwner: true,
    system: {
      abilities: { str: { base: strength } },
      skills: { swords: { value: skill } },
    },
  });

  // A melee weapon that clears every gate on `canWeaponAttack`, so the only
  // thing varying between cases is the pair of requirements under test.
  const weapon = (actorData, { fvRank = 0, sv = 0 } = {}) => {
    // Constructed, not `Object.create`d: `#weaponFixedModifiers` is a private
    // method, and only a real construction installs the brand it checks for.
    const item = Object.assign(new TnoItem(), {
      name: 'waffen',
      type: 'item',
      actor: actorData,
      system: {
        roles: { weapon: true },
        use: 'melee',
        wa: 'str',
        fv: { skill: 'swords', rank: fvRank },
        sv,
        dk: 3,
        hh: { active: 1, passive: -1 },
      },
    });
    return item;
  };

  /** The requirement components of an attack, in the order they are shown. */
  const attackRequirements = (actorData, profile) => {
    opened = null;
    weapon(actorData, profile).openWeaponCheck();
    return opened.fixedModifiers.filter((modifier) => modifier.label.includes('Malus'));
  };

  it('shows no requirement component at all when SV is met', () => {
    // Strength 2 against SV 2: meeting a requirement exactly is meeting it, and
    // a met requirement must not reach the roll as a ±0 line either.
    expect(attackRequirements(actor(), { sv: 2 })).toEqual([]);
  });

  it('keeps the FV shortfall out of a standard attack', () => {
    // Rank 5 against FV 8 is three short, and costs nothing here: the FV malus
    // is a Manöver rule, and a Standardangriff is not a Manöver.
    expect(attackRequirements(actor(), { fvRank: 8 })).toEqual([]);
  });

  it('sends the SV shortfall as one graded component', () => {
    // SV 6 against Strength 2 is 4 short: two steps.
    expect(attackRequirements(actor(), { fvRank: 8, sv: 6 })).toEqual([
      { label: 'TNO.Combat.SvMalus(2)', value: -6, hint: 'TNO.Combat.SvMalusHint' },
    ]);
  });

  it('rounds a shortfall up rather than counting every point twice', () => {
    // SV 4 against Strength 2 is exactly 2 short — one step, not two. This is
    // the case that separates the ladder from the reading where the "weitere
    // Punkte" are counted from the requirement itself.
    expect(attackRequirements(actor(), { sv: 4 })).toEqual([
      { label: 'TNO.Combat.SvMalus(1)', value: -3, hint: 'TNO.Combat.SvMalusHint' },
    ]);
  });

  it('gives a parry passive handling, the same SV malus, and a reach choice', () => {
    opened = null;
    weapon(actor(), { fvRank: 8, sv: 6 }).openWeaponParry();
    expect(opened.fixedModifiers).toEqual([
      { label: 'TNO.Combat.PassiveHandling', value: -1, hint: 'TNO.Combat.PassiveHandlingHint' },
      { label: 'TNO.Combat.SvMalus(2)', value: -6, hint: 'TNO.Combat.SvMalusHint' },
    ]);
    // "Angriffe und Paraden sind um +3 erleichtert wenn man den längeren hat":
    // the parry asks for the same reach comparison an attack does.
    expect(opened.preRollContext.choices.map((choice) => choice.value)).toEqual([0, 3]);
  });

  it('offers a melee attack the two reach outcomes as its required context', () => {
    opened = null;
    weapon(actor()).openWeaponCheck();
    expect(opened.preRollContext.control).toBe('toggle');
    expect(opened.preRollContext.choices.map((choice) => choice.value)).toEqual([0, 3]);
  });

  // With `0` as a real outcome the number alone stops being an answer, so both
  // segments carry a textual answer beside their modifier.
  it('labels both reach-toggle answers rather than showing bare numbers', () => {
    opened = null;
    weapon(actor()).openWeaponCheck();
    expect(opened.preRollContext.tileLabels).toBe(true);
    expect(opened.preRollContext.tileColumns).toBe(2);
    expect(opened.preRollContext.choices.map((choice) => choice.label)).toEqual([
      'TNO.Combat.Reach.NotLonger',
      'TNO.Combat.Reach.Longer',
    ]);
  });
});

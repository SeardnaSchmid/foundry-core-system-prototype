import { describe, expect, it } from 'vitest';

// The Handlung builders are pure: actor and item data in, a roll-dialog options
// object out. That is the whole point of having lifted them out of the four
// documents and sheets that used to assemble them inline, and it is what lets
// the unit tier check the paths a Foundry world would otherwise be needed for.
//
// The four workflows' *contents* are pinned by their own suites
// (item-weapon-roll, actor-resistance-roll, roll-dialog). What is checked here
// is the surface those suites cannot reach: that a builder answers `null`
// instead of throwing when the roll cannot be formed at all.
globalThis.CONFIG = {
  TNO: {
    skills: {
      swords: { label: 'Swords', category: 'combat', attribute: 'str' },
      acrobatics: { label: 'Acrobatics', category: 'physical', attribute: 'dex' },
      defensiveCombat: { label: 'Defensive Combat', category: 'maneuvers', attribute: 'dex' },
      useCover: { label: 'Use Cover', category: 'maneuvers', attribute: 'per' },
      evasiveMove: { label: 'Evasive Movement', category: 'maneuvers', attribute: 'dex' },
    },
    skillCategories: { combat: 'Combat', physical: 'Physical', maneuvers: 'Manoeuvres' },
    abilities: {
      str: 'TNO.Ability.Str.long',
      dex: 'TNO.Ability.Dex.long',
      fin: 'TNO.Ability.Fin.long',
    },
    armorZones: {
      suit: 'TNO.Armor.Zone.Suit',
      head: 'TNO.Armor.Zone.Head',
      torso: 'TNO.Armor.Zone.Torso',
      arms: 'TNO.Armor.Zone.Arms',
      legs: 'TNO.Armor.Zone.Legs',
    },
    stances: {
      open: { label: 'TNO.Combat.Stance.Open', defenses: [] },
      simpleMove: { label: 'TNO.Combat.Stance.SimpleMove', defenses: ['parry', 'dodge'] },
      carefulMove: { label: 'TNO.Combat.Stance.CarefulMove', defenses: ['dodge'] },
      fastMove: { label: 'TNO.Combat.Stance.FastMove', defenses: ['dodge'] },
      inCover: { label: 'TNO.Combat.Stance.InCover', defenses: ['dodge'] },
      enGarde: { label: 'TNO.Combat.Stance.EnGarde', defenses: ['parry', 'dodge'] },
    },
    defaultStance: 'open',
  },
};
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
  },
};

const {
  angriffOptions,
  ausweichenOptions,
  canDefend,
  defenseMalus,
  paradeOptions,
  takeStance,
  widerstandOptions,
} = await import('../../module/helpers/combat-actions.mjs');

describe('combat action builders', () => {
  const actor = ({
    isOwner = true,
    skills = { swords: { value: 5 }, acrobatics: { value: 3 } },
    stance = 'enGarde',
    defenses = { parry: 0, dodge: 0 },
  } = {}) => ({
    isOwner,
    updates: [],
    async update(changes) {
      this.updates.push(changes);
    },
    system: {
      abilities: { str: { base: 4 }, dex: { base: 4 } },
      skills,
      combat: { stance, defenses },
      derived: { armor: { torso: { rh: 1, rw: 2, ra: 3 } } },
    },
  });

  /** A melee weapon that clears every gate on `canWeaponAttack`. */
  const weapon = (overrides = {}) => ({
    name: 'Langschwert',
    system: {
      roles: { weapon: true },
      use: 'melee',
      fv: { skill: 'swords', rank: 0 },
      sv: 0,
      wa: 'str',
      dk: 4,
      hh: { active: 0, passive: 0 },
      rb: 3,
      ss: { count: 2 },
      ...overrides,
    },
  });

  it('builds an attack from the weapon the actor is holding', () => {
    const options = angriffOptions(actor(), weapon());
    expect(options).toMatchObject({
      attributeA: 'str',
      lockAttribute: true,
      skill: { key: 'swords', value: 5 },
      flavor: 'TNO.Combat.AttackFlavor(Langschwert)',
    });
    expect(options.preRollContext).toMatchObject({ label: 'TNO.Combat.DkQuestion', control: 'toggle' });
    expect(options.preRollContext.choices.map((choice) => choice.value)).toEqual([0, 3]);
    expect(options.zonePicker).toMatchObject({
      label: 'TNO.Combat.ZoneQuestion',
      componentLabel: 'TNO.Combat.Zone',
    });
  });

  // A ranged weapon answers a different question — which band it is fired at —
  // and only the bands its profile actually authors.
  it('asks a ranged attack for its band instead of the reach comparison', () => {
    const options = angriffOptions(
      actor(),
      weapon({ use: 'ranged', dk: null, rd: 3, range: { near: 0, mid: -3 } })
    );
    expect(options.preRollContext.label).toBe('TNO.Combat.RangeQuestion');
    expect(options.preRollContext.choices.map((choice) => [choice.key, choice.value])).toEqual([
      ['near', 0],
      ['mid', -3],
    ]);
  });

  it('gives a parry the passive handling and the same reach question', () => {
    const options = paradeOptions(actor(), weapon({ hh: { active: 0, passive: -1 } }));
    expect(options.fixedModifiers).toEqual([{
      label: 'TNO.Combat.PassiveHandling',
      value: -1,
      hint: 'TNO.Combat.PassiveHandlingHint',
    }]);
    expect(options.preRollContext).toMatchObject({ label: 'TNO.Combat.DkQuestion', control: 'toggle' });
    expect(options.preRollContext.choices.map((choice) => choice.value)).toEqual([0, 3]);
  });

  it('builds a dodge from Beweglichkeit and Akrobatik alone', () => {
    // No armour SV component here on purpose: "eine Malusstufe auf alle
    // Beweglichkeitswürfe" is a statement about the attribute, so the dialog
    // adds it to whatever roll is built on Beweglichkeit.
    expect(ausweichenOptions(actor())).toMatchObject({
      attributeA: 'dex',
      lockAttribute: true,
      skill: { key: 'acrobatics', label: 'Acrobatics', value: 3 },
      // Nothing but the skill: this is the first defence of the Haltung.
      fixedModifiers: [],
      flavor: 'TNO.Combat.Dodge',
    });
  });

  // Every builder answers the same way when the roll cannot be formed, so a
  // caller renders a dialog or nothing and never has to catch anything.
  it('answers null rather than throwing when a roll cannot be formed', () => {
    expect(angriffOptions(actor({ isOwner: false }), weapon())).toBeNull();
    expect(angriffOptions(actor(), weapon({ roles: { weapon: false } }))).toBeNull();
    // A melee profile with no DK cannot state a reach comparison, so it cannot
    // attack — but it can still parry.
    expect(angriffOptions(actor(), weapon({ dk: null }))).toBeNull();
    expect(paradeOptions(actor(), weapon({ dk: null }))).not.toBeNull();
    // Parry is melee-only.
    expect(paradeOptions(actor(), weapon({ use: 'ranged', range: { near: 0 } }))).toBeNull();
    expect(angriffOptions(null, weapon())).toBeNull();

    // The Unterkleidung is no hit location: it applies in all four zones at
    // once, so there is no single one to resist at.
    expect(widerstandOptions(actor(), 'suit')).toBeNull();
    expect(widerstandOptions(actor(), 'torso')).not.toBeNull();
    expect(widerstandOptions(actor({ isOwner: false }), 'torso')).toBeNull();
  });

  // The Ansage is one free magnitude and nothing else. It carries no rank, no
  // price and no Manöver name, because all of that is agreed between the player
  // and the GM before the number is typed — a form that re-derived it could only
  // disagree with the table.
  it('offers the Ansage as a bare field, with nothing to price it against', () => {
    const options = angriffOptions(actor({ skills: { swords: { value: 5 } } }), weapon());
    expect(options.ansage).toEqual({ label: 'TNO.Combat.Ansage', hint: 'TNO.Combat.AnsageHint' });
    // Whatever the character's Manöverfertigkeiten stand at, the field is the
    // same field: an untrained declarer is a table conversation, not a malus.
    expect(angriffOptions(actor({ skills: { swords: { value: 5 }, cunningAttacks: { value: 7 } } }), weapon()).ansage)
      .toEqual(options.ansage);
  });

  // The Stelle stayed a pick when everything else collapsed into the number,
  // because it is a location rather than an amount: it decides the multiplier,
  // and the defender opens that roll from the same location on their paper doll.
  it('offers every Stelle as a tile captioned with what a hit there costs', () => {
    const { zonePicker } = angriffOptions(actor({ skills: { swords: { value: 5 } } }), weapon());
    expect(zonePicker.choices.map((choice) => choice.key)).toEqual(['torso', 'arms', 'legs', 'head']);
    // The caption is the damage rule, which is the one thing about a Trefferzone
    // worth saying in the dialog.
    expect(zonePicker.choices.find((choice) => choice.key === 'head').caption)
      .toBe('TNO.Damage.Pool ×2');
    expect(zonePicker.choices.find((choice) => choice.key === 'arms').caption)
      .toBe('TNO.Damage.Pool');
    // Torso is the plain one, which is exactly why it is the default.
    expect(zonePicker.choices.find((choice) => choice.key === 'torso').caption)
      .toBe('TNO.Damage.Pool');
  });

  it('prices every tile the way Gezielte Angriffe does', () => {
    const { zonePicker } = angriffOptions(actor({ skills: { swords: { value: 5 } } }), weapon());
    const cost = (key) => zonePicker.choices.find((choice) => choice.key === key).cost;
    // The tile carries the price as well as the damage rule: what aiming costs
    // and what it buys are the same decision seen from two ends.
    expect(cost('torso')).toBe(0);
    expect(cost('arms')).toBe(-3);
    expect(cost('legs')).toBe(-3);
    expect(cost('head')).toBe(-6);
  });

  // A parry announces an amount but never a location: the Stelle is the
  // attacker's to name, and a Riposte lands on your own next attack.
  it('gives a parry the Ansage field and no Stelle', () => {
    const options = paradeOptions(actor({ skills: { swords: { value: 5 } } }), weapon());
    expect(options.ansage).toEqual({ label: 'TNO.Combat.Ansage', hint: 'TNO.Combat.AnsageHint' });
    expect(options.zonePicker).toBeUndefined();
  });

  it('refuses a dodge from an actor with no Akrobatik definition', () => {
    const skills = globalThis.CONFIG.TNO.skills;
    globalThis.CONFIG.TNO.skills = { swords: skills.swords };
    expect(ausweichenOptions(actor())).toBeNull();
    globalThis.CONFIG.TNO.skills = skills;
  });
});

// "Je nach Haltung hat der Charakter eine Parade, ein Ausweichen oder beides."
// The whole point of these is that the defender answers them from their own
// sheet: nothing here takes an attacker, an attack, or a second actor.
describe('Haltung and repeated defences', () => {
  const actor = ({ stance = 'enGarde', defenses = { parry: 0, dodge: 0 }, skills = {} } = {}) => ({
    isOwner: true,
    updates: [],
    async update(changes) {
      this.updates.push(changes);
    },
    system: {
      abilities: { dex: { base: 4 } },
      skills: { acrobatics: { value: 3 }, ...skills },
      combat: { stance, defenses },
    },
  });

  it('lets the Haltung decide which defence is possible at all', () => {
    expect(canDefend(actor({ stance: 'enGarde' }), 'parry')).toBe(true);
    expect(canDefend(actor({ stance: 'enGarde' }), 'dodge')).toBe(true);
    // In Deckung is only a dodge, and Offen — "rumstehen wie ein Trottel" —
    // is neither.
    expect(canDefend(actor({ stance: 'inCover' }), 'parry')).toBe(false);
    expect(canDefend(actor({ stance: 'inCover' }), 'dodge')).toBe(true);
    expect(canDefend(actor({ stance: 'open' }), 'parry')).toBe(false);
    expect(canDefend(actor({ stance: 'open' }), 'dodge')).toBe(false);
    // An unknown or absent Haltung falls back to the one that allows nothing,
    // rather than quietly permitting everything.
    expect(canDefend(actor({ stance: 'nonsense' }), 'dodge')).toBe(false);
  });

  it('leaves the first defence unmodified and sums a step onto every one after', () => {
    expect(defenseMalus(actor({ defenses: { parry: 0, dodge: 0 } }), 'parry')).toBe(0);
    expect(defenseMalus(actor({ defenses: { parry: 1, dodge: 0 } }), 'parry')).toBe(-3);
    // "Eine, sich aufsummierende, Stufe": the third parry costs two steps.
    expect(defenseMalus(actor({ defenses: { parry: 2, dodge: 0 } }), 'parry')).toBe(-6);
    expect(defenseMalus(actor({ defenses: { parry: 3, dodge: 0 } }), 'parry')).toBe(-9);
    // Counted apart — "Ausweichen und Parieren werden hierfür immer unabhängig
    // verwendet" — so parries spent do not price a dodge.
    expect(defenseMalus(actor({ defenses: { parry: 2, dodge: 0 } }), 'dodge')).toBe(0);
  });

  // The relief skips repeats rather than shifting the ladder, which is the one
  // reading that matches the rulebook's own three-parry examples: rank 1 gives
  // full / full / −6, not full / full / −3.
  it('lets a rank skip that many repeats, leaving the rest at their own price', () => {
    const parries = (rank) =>
      [0, 1, 2].map((used) =>
        defenseMalus(
          actor({ stance: 'enGarde', defenses: { parry: used, dodge: 0 }, skills: { defensiveCombat: { value: rank } } }),
          'parry'
        )
      );
    expect(parries(0)).toEqual([0, -3, -6]);
    expect(parries(1)).toEqual([0, 0, -6]);
    expect(parries(3)).toEqual([0, 0, 0]);
  });

  it('picks the relief skill the Haltung calls for, and none outside it', () => {
    const skilled = (stance) => actor({ stance, defenses: { parry: 1, dodge: 1 }, skills: {
      defensiveCombat: { value: 4 },
      useCover: { value: 4 },
      evasiveMove: { value: 4 },
    } });
    // Defensiver Kampf is gated on Einfache Bewegung and En Garde, so the same
    // rank buys nothing while In Deckung.
    expect(defenseMalus(skilled('enGarde'), 'parry')).toBe(0);
    expect(defenseMalus(skilled('inCover'), 'parry')).toBe(-3);
    // Deckung nutzen covers Vorsichtige Bewegung and In Deckung; Haken schlagen
    // covers Einfache and Schnelle Bewegung. En Garde has neither.
    expect(defenseMalus(skilled('inCover'), 'dodge')).toBe(0);
    expect(defenseMalus(skilled('fastMove'), 'dodge')).toBe(0);
    expect(defenseMalus(skilled('enGarde'), 'dodge')).toBe(-3);
    // Einfache Bewegung is the one Haltung with a relief for each defence, and
    // they are different skills.
    const simple = actor({ stance: 'simpleMove', defenses: { parry: 1, dodge: 1 }, skills: {
      evasiveMove: { value: 4 },
    } });
    expect(defenseMalus(simple, 'dodge')).toBe(0);
    expect(defenseMalus(simple, 'parry')).toBe(-3);
  });

  it('clears both counters on taking a Haltung, including the same one again', async () => {
    const character = actor({ stance: 'enGarde', defenses: { parry: 3, dodge: 1 } });
    await takeStance(character, 'enGarde');
    expect(character.updates).toEqual([
      { 'system.combat.stance': 'enGarde', 'system.combat.defenses': { parry: 0, dodge: 0 } },
    ]);

    // A Haltung that is not in the table is not a Haltung.
    await takeStance(character, 'nonsense');
    expect(character.updates).toHaveLength(1);
  });

  // Nobody may be forced onto the chat card. Every defence has to be openable
  // from the defender's own sheet, with the announced number typed in by hand —
  // the card is a convenience for passing that number along, never a
  // precondition for defending at all.
  it('offers the typed announcement field on every defence, with no card involved', () => {
    const character = () => ({
      isOwner: true,
      system: {
        abilities: { str: { base: 4 }, dex: { base: 4 } },
        skills: { swords: { value: 5 }, acrobatics: { value: 3 } },
        combat: { stance: 'enGarde', defenses: { parry: 0, dodge: 0 } },
        derived: { armor: { torso: { rh: 1, rw: 2, ra: 3 } } },
      },
    });
    const parryWeapon = {
      name: 'Langschwert',
      system: {
        roles: { weapon: true },
        use: 'melee',
        fv: { skill: 'swords', rank: 0 },
        sv: 0,
        wa: 'str',
        dk: 4,
        hh: { active: 0, passive: 0 },
        rb: 3,
        ss: { count: 2 },
      },
    };

    for (const options of [
      paradeOptions(character(), parryWeapon),
      ausweichenOptions(character()),
      widerstandOptions(character(), 'torso'),
    ]) {
      expect(options.opposingAnsage).toBe(true);
      // And none of them takes an envelope: a defence is built from the
      // defender's own sheet and one number they were told.
      expect(options.envelope).toBeUndefined();
    }
  });

  it('prices the parry and the dodge it hands to the dialog', () => {
    const worn = actor({ stance: 'enGarde', defenses: { parry: 0, dodge: 2 } });
    expect(ausweichenOptions(worn).fixedModifiers).toEqual([
      {
        label: 'TNO.Combat.RepeatedDefense(3)',
        value: -6,
        hint: 'TNO.Combat.RepeatedDefenseHint',
      },
    ]);
    // And it refuses outright where the Haltung allows no dodge at all.
    expect(ausweichenOptions(actor({ stance: 'open' }))).toBeNull();
  });
});

// The defence side is self-contained: everything a defence needs is either on
// the defender's own sheet or typed in by the player. There is no path by which
// an attacker's card writes anything onto a defender.
describe('what a defence takes from the other side', () => {
  const defender = () => ({
    isOwner: true,
    updates: [],
    async update(changes) {
      this.updates.push(changes);
    },
    system: {
      abilities: { dex: { base: 4 } },
      skills: { acrobatics: { value: 3 } },
      combat: { stance: 'enGarde', defenses: { parry: 0, dodge: 0 } },
      derived: { armor: { torso: { rh: 1, rw: 2, ra: 3 } } },
    },
  });

  it('offers the announcement field blank, on every defence, always', () => {
    expect(ausweichenOptions(defender()).opposingAnsage).toBe(true);
    expect(widerstandOptions(defender(), 'torso').opposingAnsage).toBe(true);
  });

  // The bypass is the defender's own control and is never pre-ticked. The card
  // carries an amount, not a reason, so it cannot say a bypass was bought — the
  // defender ticks it on being told, which is how the rule reads anyway: they
  // name the RA, the attacker pays it.
  it('never pre-ticks the armour bypass', () => {
    expect(widerstandOptions(defender(), 'torso').toggleModifier).toEqual({
      label: 'TNO.Combat.Envelope.BypassArmor',
      hint: 'TNO.Combat.BypassArmorHint',
      value: -2,
    });
  });

  it('writes nothing but the defence count when the roll is made', async () => {
    const actor = defender();
    await ausweichenOptions(actor).afterRoll();
    expect(actor.updates).toEqual([{ 'system.combat.defenses.dodge': 1 }]);
  });
});

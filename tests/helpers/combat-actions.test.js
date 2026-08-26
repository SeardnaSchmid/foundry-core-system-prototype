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
    },
    skillCategories: { combat: 'Combat', physical: 'Physical', maneuvers: 'Manoeuvres' },
    abilities: { str: 'TNO.Ability.Str.long', dex: 'TNO.Ability.Dex.long' },
    armorZones: { suit: 'TNO.Armor.Zone.Suit', torso: 'TNO.Armor.Zone.Torso' },
    stances: {
      open: { label: 'TNO.Combat.Stance.Open', defenses: [] },
      simpleMove: { label: 'TNO.Combat.Stance.SimpleMove', defenses: ['parry', 'dodge'] },
      carefulMove: { label: 'TNO.Combat.Stance.CarefulMove', defenses: ['dodge'] },
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
  clearAnsage,
  defenseMalus,
  paradeOptions,
  takeAnsage,
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
      abilities: { str: { base: 4, value: 4 }, dex: { base: 4, value: 4 } },
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
    expect(options.preRollContext.choices.map((choice) => choice.value)).toEqual([0, 3]);
  });

  // A ranged weapon answers a different question — which band it is fired at —
  // and only the bands its profile actually authors.
  it('asks a ranged attack for its band instead of the reach comparison', () => {
    const options = angriffOptions(
      actor(),
      weapon({ use: 'ranged', dk: null, rd: 3, range: { near: 0, mid: -3 } })
    );
    expect(options.preRollContext.label).toBe('TNO.Combat.RangeBand');
    expect(options.preRollContext.choices.map((choice) => [choice.key, choice.value])).toEqual([
      ['near', 0],
      ['mid', -3],
    ]);
  });

  it('gives a parry the passive handling and the same reach question', () => {
    const options = paradeOptions(actor(), weapon({ hh: { active: 0, passive: -1 } }));
    expect(options.fixedModifiers).toEqual([{ label: 'TNO.Combat.PassiveHandling', value: -1 }]);
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

  // Eight Ansage rows on every melee attack would make the Standardangriff —
  // most rolls — the loudest thing in the dialog. Rows whose Fertigkeit sits at
  // rank 0 are marked so the template can fold them behind one line; nothing is
  // removed, because declaring above your rank is legal and merely expensive.
  it('marks the Manöver whose Fertigkeit the character has never bought', () => {
    const trained = actor({ skills: { swords: { value: 5 }, cunningAttacks: { value: 2 } } });
    const rows = angriffOptions(trained, weapon()).ansagen;
    const open = rows.filter((row) => !row.untrained).map((row) => row.key);
    expect(open).toEqual(['feint']);
    // The rest are still there, priced and declarable — just folded away.
    expect(rows.length).toBeGreaterThan(open.length);
    expect(rows.find((row) => row.key === 'head')).toMatchObject({ untrained: true, rank: 0, betrag: 6 });
  });

  // The Stellen rule one another out and everything else combines freely, so the
  // row has to say which it is — the dialog renders a group as one picker whose
  // default is "nothing announced".
  it('marks the three Trefferzonen as one group and leaves the rest ungrouped', () => {
    const rows = angriffOptions(actor({ skills: { swords: { value: 5 } } }), weapon()).ansagen;
    const grouped = rows.filter((row) => row.group === 'zone').map((row) => row.key);
    expect(grouped).toEqual(['arms', 'legs', 'head']);
    // Rüstung umgehen and Schwachstelle share the same Fertigkeit but not the
    // exclusion: either can be declared alongside a Stelle.
    expect(rows.filter((row) => row.group).length).toBe(3);
    expect(rows.find((row) => row.key === 'bypassArmor').group).toBe('');
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
      abilities: { dex: { base: 4, value: 4 } },
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

  it('leaves the first defence unmodified and charges ten for every one after', () => {
    expect(defenseMalus(actor({ defenses: { parry: 0, dodge: 0 } }), 'parry')).toBe(0);
    expect(defenseMalus(actor({ defenses: { parry: 1, dodge: 0 } }), 'parry')).toBe(-10);
    // Flat, not cumulative: the third parry costs what the second one did.
    expect(defenseMalus(actor({ defenses: { parry: 2, dodge: 0 } }), 'parry')).toBe(-10);
    // Counted apart — "Ausweichen und Parieren werden hierfür immer unabhängig
    // verwendet" — so parries spent do not price a dodge.
    expect(defenseMalus(actor({ defenses: { parry: 2, dodge: 0 } }), 'dodge')).toBe(0);
  });

  it('buys the malus back a point at a time, but only in the right Haltung', () => {
    const skilled = (stance) => actor({ stance, defenses: { parry: 1, dodge: 1 }, skills: {
      defensiveCombat: { value: 4 },
      useCover: { value: 10 },
    } });
    expect(defenseMalus(skilled('enGarde'), 'parry')).toBe(-6);
    // Defensiver Kampf is gated on Einfache Bewegung and En Garde, so the same
    // rank buys nothing while In Deckung.
    expect(defenseMalus(skilled('inCover'), 'parry')).toBe(-10);
    // At rank 10, "kann der Charakter beliebig oft ausweichen" — never positive.
    expect(defenseMalus(skilled('inCover'), 'dodge')).toBe(0);
    expect(defenseMalus(skilled('enGarde'), 'dodge')).toBe(-10);
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
        abilities: { str: { base: 4, value: 4 }, dex: { base: 4, value: 4 } },
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
      { label: 'TNO.Combat.RepeatedDefense(3)', value: -10 },
    ]);
    // And it refuses outright where the Haltung allows no dodge at all.
    expect(ausweichenOptions(actor({ stance: 'open' }))).toBeNull();
  });
});

// The chat-card shortcut. It writes onto the defender's *own* sheet and is only
// ever a head start: the numbers are printed on the card either way, and the
// typed field stays exactly where it was.
describe('taking an announced Ansage', () => {
  const defender = (pending = null) => ({
    isOwner: true,
    updates: [],
    async update(changes) {
      this.updates.push(changes);
      if (changes['system.combat.pending']) this.system.combat.pending = changes['system.combat.pending'];
    },
    system: {
      abilities: { dex: { base: 4, value: 4 } },
      skills: { acrobatics: { value: 3 } },
      combat: {
        stance: 'enGarde',
        defenses: { parry: 0, dodge: 0 },
        pending: pending ?? { from: '', parry: 0, dodge: 0, resistance: 0, zone: '', bypassArmor: false },
      },
      derived: { armor: { torso: { rh: 1, rw: 2, ra: 3 } } },
    },
  });

  const envelope = {
    from: 'Anton',
    parry: 3,
    dodge: 5,
    resistance: 2,
    zone: 'head',
    bypassArmor: true,
    sharp: 4,
    blunt: 2,
  };

  it('stores only what a defence needs, on the defender\'s own sheet', async () => {
    const actor = defender();
    await takeAnsage(actor, envelope);
    // The attacker's weapon values are not copied over: the defender reads those
    // off the card when they come to the penetration comparison.
    expect(actor.updates).toEqual([
      {
        'system.combat.pending': {
          from: 'Anton',
          parry: 3,
          dodge: 5,
          resistance: 2,
          zone: 'head',
          bypassArmor: true,
        },
      },
    ]);
  });

  it('fills each defence in with the number meant for it', () => {
    const stored = { from: 'Anton', parry: 3, dodge: 5, resistance: 2, zone: 'head', bypassArmor: true };
    // A dodge takes the dodge number, not the parry's — a Weiter Schwung
    // worsens only one of them.
    expect(ausweichenOptions(defender(stored)).opposingAnsage).toBe(5);
    expect(widerstandOptions(defender(stored), 'torso').opposingAnsage).toBe(2);
    // And the bypass the attacker announced arrives pre-ticked.
    expect(widerstandOptions(defender(stored), 'torso').toggleModifier.checked).toBe(true);
  });

  it('still offers the empty field when nothing was taken', () => {
    // Ü1 unchanged: the card is a convenience, never a precondition.
    expect(ausweichenOptions(defender()).opposingAnsage).toBe(true);
    expect(widerstandOptions(defender(), 'torso').opposingAnsage).toBe(true);
    // A stored zero is nothing announced against *that* roll, so the field is
    // offered blank rather than pre-filled with a meaningless 0.
    const partial = { from: 'Anton', parry: 3, dodge: 0, resistance: 0, zone: '', bypassArmor: false };
    expect(ausweichenOptions(defender(partial)).opposingAnsage).toBe(true);
  });

  it('forgets the announcement once a defence has used it', async () => {
    const actor = defender({ from: 'Anton', parry: 3, dodge: 5, resistance: 2, zone: 'head', bypassArmor: true });
    await ausweichenOptions(actor).afterRoll();
    // Counted the dodge, then cleared — so it cannot silently apply to the next
    // defence as well.
    expect(actor.updates.at(-1)).toEqual({
      'system.combat.pending': { from: '', parry: 0, dodge: 0, resistance: 0, zone: '', bypassArmor: false },
    });
    expect(ausweichenOptions(actor).opposingAnsage).toBe(true);

    // Clearing an already-empty store writes nothing at all.
    const untouched = defender();
    await clearAnsage(untouched);
    expect(untouched.updates).toEqual([]);
  });
});

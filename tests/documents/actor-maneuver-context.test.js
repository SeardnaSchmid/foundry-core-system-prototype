import { describe, expect, it } from 'vitest';

// `maneuverPreRollContext` is an Actor method whose whole job is to turn the
// character's carried weapons into the one question a Manöver must answer. The
// same minimal shell the other document suites use — the base class, the skill
// catalogue and i18n — is everything it touches.
globalThis.Actor = class {};
globalThis.CONFIG = {
  TNO: {
    skills: {
      swords: { label: 'TNO.Skill.Swords', category: 'combat', attribute: 'fin' },
      footwork: { label: 'TNO.Skill.Footwork', category: 'maneuvers', attribute: 'dex' },
    },
    skillCategories: { combat: 'TNO.SkillCategory.Combat', maneuvers: 'TNO.SkillCategory.Maneuvers' },
  },
};
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
  },
};

const { TnoActor } = await import('../../module/documents/actor.mjs');

describe('Manöver weapon context', () => {
  const weapon = (id, name, fvRank) => ({
    id,
    name,
    system: {
      roles: { weapon: true },
      use: 'melee',
      wa: 'fin',
      fv: { skill: 'swords', rank: fvRank },
      sv: 0,
      dk: 3,
      hh: { active: 0, passive: 0 },
    },
  });

  const actor = (items) =>
    Object.assign(new TnoActor(), {
      type: 'character',
      isOwner: true,
      items,
      system: {
        abilities: { str: { base: 4, value: 4 }, dex: { base: 4, value: 4 } },
        skills: { swords: { value: 5 }, footwork: { value: 2 } },
      },
    });

  it('requires a Manöver to name the weapon it is declared with', () => {
    const context = actor([weapon('blade', 'Langschwert', 9), weapon('club', 'Knüppel', 1)]).maneuverPreRollContext();
    // A name-first list, so the select's "Langschwert (−3)" reads the right way
    // round; the tile pickers are for signed numbers with a band name attached.
    expect(context.control).toBe('select');
    expect(context.choices.map((choice) => [choice.label, choice.value])).toEqual([
      ['TNO.Combat.ManeuverUnarmed', 0],
      // FV 9 against rank 5 is one flat step, however far short it is.
      ['Langschwert', -3],
      // A met requirement stays on the list: which weapon is the answer to a
      // mandatory question, whether or not it costs anything.
      ['Knüppel', 0],
    ]);
    expect(context.choices[1].componentLabel).toBe('TNO.Combat.FvMalusFor(Langschwert)');
  });

  it('keeps the weapon choice answerable by a character carrying nothing', () => {
    // An empty list would make the dialog drop the requirement silently, so
    // the unarmed option is always there and always free.
    const context = actor([]).maneuverPreRollContext();
    expect(context.choices).toEqual([
      { key: 'unarmed', label: 'TNO.Combat.ManeuverUnarmed', value: 0, componentLabel: 'TNO.Combat.FvMalusFor(TNO.Combat.ManeuverUnarmed)' },
    ]);
  });
});

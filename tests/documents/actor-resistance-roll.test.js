import { describe, expect, it } from 'vitest';

// `openResistanceCheck` is an Actor method, but everything between a clicked
// hit location and the threshold it produces is deterministic. A minimal shell
// of the globals both documents touch lets the unit tier verify that path
// without a browser or a Foundry world.
//
// The dialog here is the *real* one, subclassed only to record itself and to
// skip rendering: what the actor owes the player is a threshold, and only the
// dialog can say what its options add up to.
globalThis.Actor = class {};
globalThis.foundry = {
  appv1: {
    api: {
      FormApplication: class {
        constructor(object) {
          this.object = object;
        }
      },
    },
  },
};
globalThis.CONFIG = {
  TNO: {
    abilities: { str: 'TNO.Ability.Str.long', dex: 'TNO.Ability.Dex.long' },
    armorZones: {
      suit: 'TNO.Armor.Zone.Suit',
      head: 'TNO.Armor.Zone.Head',
      torso: 'TNO.Armor.Zone.Torso',
      arms: 'TNO.Armor.Zone.Arms',
      legs: 'TNO.Armor.Zone.Legs',
    },
  },
};
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
  },
};

const { TnoRollDialog } = await import('../../module/apps/roll-dialog.mjs');
const { TnoActor } = await import('../../module/documents/actor.mjs');

/** The dialog the actor most recently opened. */
let opened = null;

game.tno = {
  TnoRollDialog: class extends TnoRollDialog {
    constructor(actor, options) {
      super(actor, options);
      opened = this;
    }

    render() {
      return this;
    }
  },
};

describe('resistance roll', () => {
  /**
   * A character with armour already resolved onto the paper doll. Stärke's
   * `base` and `value` differ so the two readings can never be confused, and
   * the worn armour outweighs the Strength so the Beweglichkeit malus is live.
   */
  const actor = ({ strengthBase = 5, strengthCurrent = 2 } = {}) =>
    Object.assign(new TnoActor(), {
      type: 'character',
      isOwner: true,
      system: {
        abilities: { str: { base: strengthBase, value: strengthCurrent } },
        derived: {
          armor: {
            head: { rh: 3, rw: 4, ra: 6 },
            torso: { rh: 0, rw: 1, ra: 0 },
            arms: { rh: 0, rw: 1, ra: 0 },
            legs: { rh: 0, rw: 1, ra: 0 },
          },
          armorSvPenalty: true,
        },
      },
    });

  const resist = (zone, spec) => {
    opened = null;
    actor(spec).openResistanceCheck(zone);
    return opened;
  };

  /** Form data for a resistance roll as the dialog receives it. */
  const answered = (overrides = {}) => ({
    attributeA: 'str',
    attributeB: '',
    bonus: 0,
    useIdea: false,
    contextChoice: '',
    requiredValue: '',
    ...overrides,
  });

  it('opens the resistance roll of the location that was clicked, with its armour value', () => {
    expect(resist('head').fixedModifiers).toEqual([
      { label: 'TNO.Combat.ResistanceRw(TNO.Armor.Zone.Head)', value: 4 },
    ]);
    expect(resist('head').flavor).toBe('TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Head)');
    // A different location answers with its own padding, not the head's.
    expect(resist('legs').fixedModifiers).toEqual([
      { label: 'TNO.Combat.ResistanceRw(TNO.Armor.Zone.Legs)', value: 1 },
    ]);
  });

  it('reads Stärke at its damage-adjusted value, not its trained base', () => {
    const dialog = resist('head');
    expect(dialog.lockAttribute).toBe(true);
    // Stärke 2 (not the trained 5) + RW 4 − the announced 7, plus the bonus
    // step the harder armour earns.
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'harder' }))).toBe(2);
    // And the armour SV malus stays away without being special-cased: this is
    // a Stärkewurf, and the rule names Beweglichkeit.
    expect(dialog._conditionalModifiers(answered())).toEqual([]);
  });

  it('refuses a resistance roll on the Unterkleidung, which is no hit location', () => {
    // The base layer applies in all four zones at once, so there is no single
    // location for it to be resisted at.
    expect(resist('suit')).toBeNull();
    expect(resist('nowhere')).toBeNull();
  });

  it('requires both the announced damage and the penetration comparison', () => {
    const dialog = resist('head');
    expect(dialog._canSubmit(answered())).toBe(false);
    expect(dialog._canSubmit(answered({ requiredValue: 7 }))).toBe(false);
    expect(dialog._canSubmit(answered({ contextChoice: 'equal' }))).toBe(false);
    expect(dialog._canSubmit(answered({ requiredValue: 7, contextChoice: 'equal' }))).toBe(true);

    // Three outcomes, only the hardest worth a Bonusstufe, as three captioned
    // tiles — the damage table's rows and nothing else.
    expect(dialog.preRollContext.choices.map((choice) => [choice.key, choice.value])).toEqual([
      ['softer', 0],
      ['equal', 0],
      ['harder', 3],
    ]);
    expect(dialog.preRollContext).toMatchObject({ control: 'tiles', tileColumns: 3, tileLabels: true });
  });
});

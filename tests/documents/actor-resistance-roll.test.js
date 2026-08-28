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
      {
        label: 'TNO.Combat.ResistanceRw(TNO.Armor.Zone.Head)',
        value: 4,
        hint: 'TNO.Combat.ResistanceRwHint(TNO.Armor.Zone.Head)',
      },
    ]);
    // The Stelle also says where a failed roll lands: Kopf doubles onto Stärke.
    expect(resist('head').flavor).toBe('TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Head,TNO.Ability.Str.long ×2)');
    // A different location answers with its own padding, not the head's.
    expect(resist('legs').fixedModifiers).toEqual([
      {
        label: 'TNO.Combat.ResistanceRw(TNO.Armor.Zone.Legs)',
        value: 1,
        hint: 'TNO.Combat.ResistanceRwHint(TNO.Armor.Zone.Legs)',
      },
    ]);
  });

  // "Schaden wird direkt auf körperliche Attribute angerechnet", and which ones
  // is decided by the Stelle alone — so the roll that resists a hit is also the
  // roll that can say what the hit costs if it lands.
  it('names the attributes a failed roll lands on, per Stelle', () => {
    // Torso, the Stelle of every attack that announced nothing: Stärke, undoubled.
    expect(resist('torso').flavor).toBe('TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Torso,TNO.Ability.Str.long)');
    // Arme splits, and the order is the rounding: Fingerfertigkeit first.
    expect(resist('arms').flavor).toBe(
      'TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Arms,TNO.Ability.Fin.long / TNO.Ability.Str.long)'
    );
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

  // "Erschwere deinen Angriff um die Rüstungsabdeckung der jeweiligen Stelle und
  // ignoriere sie dafür" — the attacker paid this location's RA, and what they
  // bought is that its armour does not apply.
  it('cancels the location padding when the attacker bypassed its armour', () => {
    const dialog = resist('head');
    expect(dialog.toggleModifier).toEqual({
      label: 'TNO.Combat.Envelope.BypassArmor',
      hint: 'TNO.Combat.BypassArmorHint',
      // Exactly the RW it takes back out, so a bypassed location resists on
      // Stärke alone.
      value: -4,
    });
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'softer' }))).toBe(-1);
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'softer', toggleModifier: true }))).toBe(-5);
    // Confirming it is the defender's move, not a default: unbypassed armour
    // must never quietly vanish.
    expect(dialog._conditionalModifiers(answered())).toEqual([]);
  });

  it('offers no bypass on a location with no padding to cancel', () => {
    // Nothing to ignore, so nothing to confirm: an unarmoured location resists
    // on Stärke either way.
    const bare = Object.assign(new TnoActor(), {
      type: 'character',
      isOwner: true,
      system: {
        abilities: { str: { base: 5, value: 2 } },
        derived: { armor: { torso: { rh: 0, rw: 0, ra: 0 } } },
      },
    });
    opened = null;
    bare.openResistanceCheck('torso');
    expect(opened.toggleModifier).toBeNull();
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

  // The regression this guards: the normalizer whitelists what a choice may
  // carry, and a dropped headline falls back to the signed modifier — leaving
  // "±0" as the answer to "how high was the penetration?", which is a different
  // number entirely and reads as though the penetration were nil.
  it('leads each tile with the comparison against this location\'s own RH', () => {
    const headlines = resist('head').preRollContext.choices.map((choice) => choice.headline);
    expect(headlines).toEqual([
      'TNO.Combat.Penetration.Softer(3)',
      'TNO.Combat.Penetration.Equal(3)',
      'TNO.Combat.Penetration.Harder(3)',
    ]);
    // Each location answers with its own hardness, not the character's.
    expect(resist('torso').preRollContext.choices[0].headline)
      .toBe('TNO.Combat.Penetration.Softer(0)');
  });

  // The attacker's card prints two damage values. Which of them landed is
  // exactly what the comparison above decides, so the field that takes the
  // number says which column to read — that mapping lived only in the rulebook
  // before, and the player had to carry it in their head every time.
  it('names the damage field after the comparison that was picked', () => {
    const dialog = resist('head');
    // Nothing picked yet: the neutral name, because neither value applies yet.
    expect(dialog._requiredValueLabel(answered())).toBe('TNO.Combat.DamageValue');
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'softer' })))
      .toBe('TNO.Combat.DamageSharp');
    // Both "hält" outcomes take the blunt value; only the Bonusstufe differs.
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'equal' })))
      .toBe('TNO.Combat.DamageBlunt');
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'harder' })))
      .toBe('TNO.Combat.DamageBlunt');
    // And the breakdown says the same thing the field did, rather than falling
    // back to a bare "Schadenswert" that names neither column.
    expect(dialog._breakdownText(answered({ requiredValue: 7, contextChoice: 'softer' })))
      .toContain('TNO.Combat.DamageSharp −7');
    // Where the numbers come from is stated, not left to the rulebook.
    expect(dialog.requiredValue.hint).toBe('TNO.Combat.DamageValueHint');
  });
});

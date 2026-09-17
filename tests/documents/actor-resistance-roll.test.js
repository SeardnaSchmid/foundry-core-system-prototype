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
        // Foundry merges the second argument over `defaultOptions`; the shell
        // only has to keep it, so a workflow asking for its own width can be
        // read back off the instance.
        constructor(object, options = {}) {
          this.object = object;
          this.options = { ...options };
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
   * A character with armour already resolved onto the paper doll. The worn
   * armour outweighs Strength so the Beweglichkeit malus is live.
   */
  const actor = ({ strength = 5, damageMalus = 0 } = {}) =>
    Object.assign(new TnoActor(), {
      type: 'character',
      isOwner: true,
      system: {
        abilities: { str: { base: strength } },
        derived: {
          armor: {
            head: { rh: 3, rw: 4, ra: 6 },
            torso: { rh: 0, rw: 1, ra: 0 },
            arms: { rh: 0, rw: 1, ra: 0 },
            legs: { rh: 0, rw: 1, ra: 0 },
          },
          armorSvPenalty: true,
          damage: { malus: damageMalus },
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
    expect(resist('head').flavor).toBe('TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Head,TNO.Damage.Pool ×2)');
    // A different location answers with its own padding, not the head's.
    expect(resist('legs').fixedModifiers).toEqual([
      {
        label: 'TNO.Combat.ResistanceRw(TNO.Armor.Zone.Legs)',
        value: 1,
        hint: 'TNO.Combat.ResistanceRwHint(TNO.Armor.Zone.Legs)',
      },
    ]);
  });

  it('names the damage pool and the Stelle multiplier instead of attributes', () => {
    expect(resist('torso').flavor).toBe('TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Torso,TNO.Damage.Pool)');
    expect(resist('arms').flavor).toBe('TNO.Combat.ResistanceFlavor(TNO.Armor.Zone.Arms,TNO.Damage.Pool)');
  });

  it('reads the sole Stärke rating', () => {
    const dialog = resist('head');
    expect(dialog.lockAttribute).toBe(true);
    // Stärke 5 + RW 4 − the announced 7. Harder armour no longer adds a bonus
    // step of its own.
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'harder' }))).toBe(2);
    // And the armour SV malus stays away without being special-cased: this is
    // a Stärkewurf, and the rule names Beweglichkeit.
    expect(dialog._conditionalModifiers(answered())).toEqual([]);
  });

  it('includes the always-on damage malus on the resistance roll', () => {
    const dialog = resist('head', { damageMalus: -3 });
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'harder' }))).toBe(-1);
    expect(dialog._actorModifiers()).toEqual([{ label: 'TNO.Damage.Malus', value: -3 }]);
  });

  // "Erschwere deinen Angriff um die Rüstungsabdeckung der jeweiligen Stelle und
  // ignoriere sie dafür" — the attacker paid this location's RA, and what they
  // bought is that its armour does not apply.
  it('cancels the location padding exactly once when penetration or a maneuver bypasses it', () => {
    const dialog = resist('head');
    expect(dialog.toggleModifier).toEqual({
      label: 'TNO.Combat.Envelope.BypassArmor',
      hint: 'TNO.Combat.BypassArmorHint',
      // Exactly the RW it takes back out, so a bypassed location resists on
      // Stärke alone.
      value: -4,
    });
    // Penetration itself ignores RW: Stärke 5 − Schaden 7.
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'softer' }))).toBe(-2);
    // The redundant maneuver is suppressed rather than subtracting RW twice.
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'softer', toggleModifier: true }))).toBe(-2);
    expect(dialog._toggleModifierSuppressed(answered({ contextChoice: 'softer' }))).toBe(true);
    expect(dialog._conditionalModifiers(answered({ contextChoice: 'softer', toggleModifier: true }))).toEqual([]);

    // At equality RW ordinarily applies, but an announced bypass cancels it.
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'equal' }))).toBe(2);
    expect(dialog._computeThreshold(answered({ requiredValue: 7, contextChoice: 'equal', toggleModifier: true }))).toBe(-2);
    expect(dialog._toggleModifierSuppressed(answered({ contextChoice: 'equal' }))).toBe(false);
  });

  it('offers no bypass on a location with no padding to cancel', () => {
    // Nothing to ignore, so nothing to confirm: an unarmoured location resists
    // on Stärke either way.
    const bare = Object.assign(new TnoActor(), {
      type: 'character',
      isOwner: true,
      system: {
        abilities: { str: { base: 5 } },
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

  it('requires the penetration comparison, and defaults the announced damage', () => {
    const dialog = resist('head');
    // The comparison decides which of the attacker's two damage values applies
    // and whether RW applies, so no default could stand in for it.
    expect(dialog._canSubmit(answered())).toBe(false);
    expect(dialog._canSubmit(answered({ requiredValue: 7 }))).toBe(false);
    // The announced number opens at 0 and never holds the roll back.
    expect(dialog.object.requiredValue).toBe(0);
    expect(dialog._canSubmit(answered({ contextChoice: 'equal' }))).toBe(true);
    expect(dialog._canSubmit(answered({ requiredValue: 7, contextChoice: 'equal' }))).toBe(true);

    // Three captioned outcomes: penetration cancels this location's RW, while
    // equality and harder armour retain it. One column, because the three are a
    // ladder read against the anchor beside them rather than options weighed
    // against each other.
    expect(dialog.preRollContext.choices.map((choice) => [choice.key, choice.value])).toEqual([
      ['softer', -4],
      ['equal', 0],
      ['harder', 0],
    ]);
    expect(dialog.preRollContext).toMatchObject({ control: 'tiles', tileColumns: 1 });
  });

  // The situation section is a three-column table here and nowhere else, and
  // the width every other roll uses has no room for it.
  it('asks for the width its comparison table needs', () => {
    expect(resist('head').options.width).toBe(400);
  });

  // The defender's own RH is the column the three choices are measured against,
  // so it is a readout beside them and never a fourth choice. Leaving it in the
  // question's prose made the reader hold it in their head while picking.
  it('shows this location\'s own RH as the comparison anchor', () => {
    expect(resist('head').preRollContext.anchor).toEqual({
      label: 'TNO.Combat.Penetration.Anchor',
      value: '3',
    });
  });

  // The announced number is typed off the attacker's card and then corrected by
  // one as the exchange is talked through, which is what the stepper is for.
  // Its floor is the field's own `min`, so it can never write a value the input
  // itself would reject.
  it('steps the announced damage inside the bounds the workflow set', () => {
    const dialog = resist('head');
    // The bounds are read off the field itself, the way the rendered input
    // carries them — so one stepper serves every stepped field in the ledger.
    const input = { value: '', min: '0', max: '' };
    const form = {};
    dialog._refresh = () => {};

    // Blank counts as zero for an explicit click; reading a blank field as
    // "nothing announced" is a separate question and stays that way.
    dialog._stepValue(form, input, 1);
    expect(input.value).toBe('1');
    dialog._stepValue(form, input, 1);
    expect(input.value).toBe('2');
    dialog._stepValue(form, input, -1);
    expect(input.value).toBe('1');

    // An announced Schadenswert has a floor of 0 and no ceiling.
    dialog._stepValue(form, input, -1);
    dialog._stepValue(form, input, -1);
    expect(input.value).toBe('0');
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
    // Nothing picked yet: the un-narrowed name, which still says whose number
    // this is — it is the one figure in the ledger the defender does not own.
    expect(dialog._requiredValueLabel(answered())).toBe('TNO.Combat.DamageValueField');
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'softer' })))
      .toBe('TNO.Combat.DamageSharp');
    // Equality now penetrates too, but retains RW. Only harder armour takes the
    // Wucht value.
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'equal' })))
      .toBe('TNO.Combat.DamageSharp');
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'harder' })))
      .toBe('TNO.Combat.DamageBlunt');
    // Rüstung umgehen makes even the harder-armour branch ask for Schaden.
    expect(dialog._requiredValueLabel(answered({ contextChoice: 'harder', toggleModifier: true })))
      .toBe('TNO.Combat.DamageSharp');
    // And the breakdown says the same thing the field did, rather than falling
    // back to a bare "Schadenswert" that names neither column.
    expect(dialog._breakdownText(answered({ requiredValue: 7, contextChoice: 'softer' })))
      .toContain('TNO.Combat.DamageSharp −7');
    // Where the numbers come from is stated, not left to the rulebook.
    expect(dialog.requiredValue.hint).toBe('TNO.Combat.DamageValueHint');
  });

  // The card is where the two answers finally add up to something the player
  // acts on. Before this they were a tile ("hält · Wuchtschaden"), a negated
  // threshold component and a multiplier printed as a rule with no number.
  it('states how much of which pool a failed resistance roll costs', () => {
    const torso = resist('torso');
    expect(torso._consequence(answered({ requiredValue: 4, contextChoice: 'softer' }))).toMatchObject({
      label: 'TNO.Combat.Applied',
      // The Schaden pool, at the announced value: the Torso multiplies nothing.
      text: 'TNO.Combat.AppliedAmount(4,TNO.Damage.Sharp,TNO.Damage.TagSharp)',
      note: '',
    });
    // Equality now lands in Schaden; only harder armour lands in Wucht.
    expect(torso._consequence(answered({ requiredValue: 4, contextChoice: 'equal' })).text)
      .toBe('TNO.Combat.AppliedAmount(4,TNO.Damage.Sharp,TNO.Damage.TagSharp)');
    expect(torso._consequence(answered({ requiredValue: 4, contextChoice: 'harder' })).text)
      .toBe('TNO.Combat.AppliedAmount(4,TNO.Damage.Blunt,TNO.Damage.TagBlunt)');
    expect(torso._consequence(answered({
      requiredValue: 4,
      contextChoice: 'harder',
      toggleModifier: true,
    })).text).toBe('TNO.Combat.AppliedAmount(4,TNO.Damage.Sharp,TNO.Damage.TagSharp)');
  });

  it('cashes in the Stelle multiplier and shows the arithmetic it did', () => {
    const dialog = resist('head');
    expect(dialog._consequence(answered({ requiredValue: 4, contextChoice: 'softer' }))).toMatchObject({
      text: 'TNO.Combat.AppliedAmount(8,TNO.Damage.Sharp,TNO.Damage.TagSharp)',
      note: 'TNO.Combat.AppliedMultiplier(4,2,TNO.Armor.Zone.Head)',
    });
  });

  it('states nothing until the comparison names a pool', () => {
    const dialog = resist('head');
    // The comparison is the half that cannot be defaulted: without it there is
    // no pool to name, so there is no sentence to write.
    expect(dialog._consequence(answered())).toBeNull();
    expect(dialog._consequence(answered({ requiredValue: 4 }))).toBeNull();

    // The amount can be defaulted, and is. A comparison picked over an untouched
    // field states a real cost of zero rather than staying silent — which is how
    // a card says out loud that nobody entered the damage.
    expect(dialog._consequence(answered({ contextChoice: 'softer' }))).toMatchObject({
      text: 'TNO.Combat.AppliedAmount(0,TNO.Damage.Sharp,TNO.Damage.TagSharp)',
    });
  });

  it('leaves a roll with no consequence to declare without one', () => {
    // Every other workflow: the dialog only carries what its builder handed it.
    expect(resist('head').consequence).toBeInstanceOf(Function);
    expect(new TnoRollDialog(actor(), {})._consequence(answered())).toBeNull();
  });
});

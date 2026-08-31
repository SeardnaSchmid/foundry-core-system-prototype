import { beforeEach, describe, expect, it, vi } from 'vitest';

// TnoRollDialog is a Foundry application, but its context-to-threshold path is
// deterministic. A minimal shell lets the unit suite verify that path without
// a browser or a Foundry world.
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
globalThis.game = {
  i18n: {
    localize: (key) => key,
    format: (key, values) => `${key}(${Object.values(values ?? {}).join(',')})`,
  },
};
globalThis.CONFIG = {
  TNO: {
    abilities: { str: 'TNO.Ability.Str.long', dex: 'TNO.Ability.Dex.long' },
  },
};

/** What the dialog told the dice helper to roll, and what it warned about. */
const { rolled, warnings } = vi.hoisted(() => ({ rolled: { payload: null }, warnings: [] }));

// The roll itself needs a chat log, a template renderer and real dice. None of
// that is what a dialog is responsible for: what it owes the player is the
// payload — the threshold, the components, the flags — so the helper stands in
// as a recorder for exactly that.
vi.mock('../../module/helpers/dice.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  rollTno: async (payload) => {
    rolled.payload = payload;
  },
}));

globalThis.ui = { notifications: { warn: (message) => warnings.push(message) } };

const { TnoRollDialog } = await import('../../module/apps/roll-dialog.mjs');

describe('TnoRollDialog pre-roll context', () => {
  const actor = { type: 'npc', system: { abilities: {}, skills: {} } };
  const dialog = new TnoRollDialog(actor, {
    fixedValue: { label: 'Base', value: 8 },
    fixedModifiers: [{ label: 'Handling', value: 2 }],
    preRollContext: {
      label: 'Range',
      placeholder: 'Choose range',
      choices: [{ key: 'near', label: 'Near', value: -3, componentLabel: 'Range: Near' }],
    },
    flavor: 'Attack',
  });

  it('requires a valid choice before adding a context modifier', () => {
    expect(dialog._contextComponent({ contextChoice: '' })).toBeNull();
    expect(dialog._computeThreshold({ contextChoice: '', bonus: 0, useIdea: false })).toBe(10);
  });

  it('uses one signed component for the preview, chat breakdown, and flag payload', () => {
    const data = { contextChoice: 'near', bonus: 0, useIdea: false };
    const component = dialog._contextComponent(data);
    expect(component).toMatchObject({ key: 'near', label: 'Range: Near', value: -3, display: '−3' });
    expect(dialog._computeThreshold(data)).toBe(7);
    expect(dialog._breakdownText(data)).toContain('Range: Near −3');
  });

  it('keeps the native select by default and configures compact context tile pickers', () => {
    expect(dialog.preRollContext.control).toBe('select');
    const dkDialog = new TnoRollDialog(actor, {
      fixedValue: { label: 'Base', value: 8 },
      preRollContext: {
        label: 'DK difference',
        control: 'tiles',
        choices: [{ key: '-2', label: '−2', value: -2 }],
      },
    });
    expect(dkDialog.preRollContext.control).toBe('tiles');
    expect(dkDialog._contextComponent({ contextChoice: '-2' })).toMatchObject({ value: -2, display: '−2' });

    const rangeDialog = new TnoRollDialog(actor, {
      fixedValue: { label: 'Base', value: 8 },
      preRollContext: {
        label: 'Range',
        control: 'tiles',
        tileLabels: true,
        tileColumns: 5,
        choices: [{ key: 'near', label: 'Near', value: -3 }],
      },
    });
    expect(rangeDialog.preRollContext).toMatchObject({ control: 'tiles', tileLabels: true, tileColumns: 5 });
  });

  it('accepts a binary toggle only for exactly two choices', () => {
    const context = (choices, control = 'toggle') => new TnoRollDialog(actor, {
      fixedValue: { label: 'Base', value: 8 },
      preRollContext: { label: 'Longer weapon?', control, choices },
    }).preRollContext.control;
    const choices = [
      { key: 'no', label: 'No', value: 0 },
      { key: 'yes', label: 'Yes', value: 3 },
    ];

    expect(context(choices)).toBe('toggle');
    expect(context([...choices, { key: 'maybe', label: 'Maybe', value: 0 }])).toBe('tiles');
    expect(context(choices, 'select')).toBe('select');
  });
});

/** An actor whose worn armour may or may not outweigh its Strength. */
const armoured = (penalised, damageMalus = 0) => ({
  type: 'npc',
  system: {
    abilities: { str: { base: 5 }, dex: { base: 4 } },
    skills: {},
    derived: { armorSvPenalty: penalised, damage: { malus: damageMalus } },
  },
  update: async () => {},
});

/** Form data as the dialog receives it, with only the fields under test set. */
const form = (overrides = {}) => ({
  attributeA: '',
  attributeB: '',
  bonus: 0,
  advantage: 0,
  useIdea: false,
  contextChoice: '',
  requiredValue: '',
  ...overrides,
});

beforeEach(() => {
  rolled.payload = null;
  warnings.length = 0;
});

describe('TnoRollDialog armour SV step', () => {
  // The rule attaches to Beweglichkeit, not to any one workflow, so the dialog
  // owns it and the attribute currently chosen decides whether it applies.
  it('adds the armour step the moment the chosen attribute becomes Beweglichkeit', () => {
    const dialog = new TnoRollDialog(armoured(true), { attributeA: 'dex' });
    expect(dialog._computeThreshold(form({ attributeA: 'dex' }))).toBe(1);
    // Stärke + Beweglichkeit is a Beweglichkeitswurf, and two slots are still
    // one roll and still one step: 5 + 4 − 3.
    expect(dialog._computeThreshold(form({ attributeA: 'str', attributeB: 'dex' }))).toBe(6);
    expect(dialog._computeThreshold(form({ attributeA: 'dex', attributeB: 'dex' }))).toBe(5);
  });

  it('drops the armour step again when the attribute is swapped away', () => {
    const dialog = new TnoRollDialog(armoured(true), { attributeA: 'dex' });
    expect(dialog._computeThreshold(form({ attributeA: 'str' }))).toBe(5);
    expect(dialog._conditionalModifiers(form({ attributeA: 'str' }))).toEqual([]);
    // And a character who meets the requirement never sees it at all.
    const unencumbered = new TnoRollDialog(armoured(false), { attributeA: 'dex' });
    expect(unencumbered._computeThreshold(form({ attributeA: 'dex' }))).toBe(4);
  });

  it('sends the armour step into the breakdown, the roll components and the message flags', async () => {
    const dialog = new TnoRollDialog(armoured(true), { attributeA: 'dex', flavor: 'Ausweichen' });
    const data = form({ attributeA: 'dex' });
    expect(dialog._breakdownText(data)).toContain('TNO.Combat.ArmorSvMalus −3');

    await dialog._updateObject(null, data);
    expect(rolled.payload.threshold).toBe(1);
    expect(rolled.payload.components).toContainEqual({
      label: 'TNO.Combat.ArmorSvMalus',
      value: -3,
      display: '−3',
    });
    // The parts must add up to the number that was rolled against.
    expect(rolled.payload.components.reduce((sum, part) => sum + part.value, 0)).toBe(1);
  });

  // Two independent requirements, two labels, two components: "SV and FV are
  // separate requirements and their maluses add".
  it('adds the armour step and the weapon FV step separately, never as one', async () => {
    const dialog = new TnoRollDialog(armoured(true), {
      attributeA: 'dex',
      skill: { key: 'acrobatics', label: 'Akrobatik', value: 2 },
      maneuverMalus: { label: 'TNO.Combat.FvMalus', value: -3 },
      ansage: { label: 'Ansage' },
    });
    const data = form({ attributeA: 'dex', ansage: 2 });
    // 4 (Bew) + 2 (Akrobatik) − 3 (armour) − 3 (FV) − 2 (the Ansage).
    expect(dialog._computeThreshold(data)).toBe(-2);

    await dialog._updateObject(null, data);
    expect(rolled.payload.components).toEqual(expect.arrayContaining([
      { label: 'TNO.Combat.ArmorSvMalus', value: -3, display: '−3' },
      { label: 'TNO.Combat.FvMalus', value: -3, display: '−3' },
    ]));
  });
});

describe('TnoRollDialog global damage malus', () => {
  it('keeps actor state separate from form-dependent modifiers', () => {
    const dialog = new TnoRollDialog(armoured(true, -4), { attributeA: 'dex' });
    expect(dialog._actorModifiers()).toEqual([{ label: 'TNO.Damage.RollMalus', value: -4 }]);
    expect(dialog._conditionalModifiers(form({ attributeA: 'dex' }))).toEqual([
      { label: 'TNO.Combat.ArmorSvMalus', value: -3 },
    ]);
    expect(dialog._fixedModifierComponents(form({ attributeA: 'dex' })).map((part) => part.label)).toEqual([
      'TNO.Damage.RollMalus',
      'TNO.Combat.ArmorSvMalus',
    ]);
  });

  it('applies to every roll and reaches the breakdown, components and flags', async () => {
    const dialog = new TnoRollDialog(armoured(false, -3), {
      attributeA: 'str',
      flavor: 'Widerstand',
    });
    const data = form({ attributeA: 'str' });
    expect(dialog._computeThreshold(data)).toBe(2);
    expect(dialog._breakdownText(data)).toContain('TNO.Damage.RollMalus −3');

    await dialog._updateObject(null, data);
    expect(rolled.payload.threshold).toBe(2);
    expect(rolled.payload.components[0]).toEqual({
      label: 'TNO.Ability.Str.long',
      value: 5,
    });
    expect(rolled.payload.components[1]).toEqual({
      label: 'TNO.Damage.RollMalus',
      value: -3,
      display: '−3',
    });
    expect(rolled.payload.components.reduce((sum, part) => sum + part.value, 0)).toBe(2);
  });

  it('adds no component for an undamaged actor', () => {
    expect(new TnoRollDialog(armoured(false), { attributeA: 'str' })._actorModifiers()).toEqual([]);
  });
});

// "Würfelt er alle Manöver mit einem Malus" — and a Standardangriff is not a
// Manöver, so what makes this roll one is whether anything was declared on it.
//
// The Ansage is one free magnitude with no rank behind it: the player and the GM
// agree the number out loud, including what it is *for*, and only the figure
// reaches the form. Nothing here prices, caps or gates it.
describe('TnoRollDialog Ansagen', () => {
  const attack = (extra = {}) => new TnoRollDialog(armoured(false), {
    attributeA: 'str',
    lockAttribute: true,
    skill: { key: 'swords', label: 'Schwerter', value: 4 },
    maneuverMalus: { label: 'TNO.Combat.FvMalus', value: -3 },
    preRollContext: {
      label: 'Reichweite',
      control: 'tiles',
      tileColumns: 2,
      choices: [
        { key: '0', label: 'Nicht länger', value: 0 },
        { key: '3', label: 'Längere Waffe', value: 3 },
      ],
    },
    ansage: { label: 'Ansage' },
    ...extra,
  });

  // Shaped like what `zonePicker()` in combat-actions builds, costs included —
  // a fixture without them would let the dialog pass while charging nothing.
  const zonePicker = {
    label: 'Trefferzone',
    choices: [
      { key: 'torso', label: 'Torso', caption: 'Schadenspool', cost: 0 },
      { key: 'arms', label: 'Arme', caption: 'Schadenspool', cost: -3 },
      { key: 'legs', label: 'Beine', caption: 'Schadenspool', cost: -3 },
      { key: 'head', label: 'Kopf', caption: 'Schadenspool ×2', cost: -6 },
    ],
  };

  it('takes the declared amount at face value, with nothing to price it against', () => {
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._computeThreshold(base)).toBe(9);
    // A 3er Ansage costs this roll 3, whatever any Manöverfertigkeit stands at:
    // the 1:1/2:1 conversion is arithmetic the table did before typing. The
    // extra −3 is the FV step a declaration brings with it.
    expect(dialog._computeThreshold({ ...base, ansage: 3 })).toBe(9 - 3 - 3);
    expect(dialog._ansageComponent({ ...base, ansage: 3 }))
      .toEqual({ label: 'Ansage', value: -3, display: '−3' });
  });

  it('leaves a standard attack free of the FV malus and charges a declared one', () => {
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._conditionalModifiers(base)).toEqual([]);
    expect(dialog._conditionalModifiers({ ...base, ansage: 1 })).toEqual([
      { label: 'TNO.Combat.FvMalus', value: -3 },
    ]);
    // Zero is not a declaration, so it does not make the attack a Manöver.
    expect(dialog._conditionalModifiers({ ...base, ansage: 0 })).toEqual([]);
  });

  it('reads a blank, negative or fractional field as nothing declared', () => {
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    for (const ansage of ['', null, -4]) {
      expect(dialog._ansageComponent({ ...base, ansage })).toBeNull();
    }
    expect(dialog._ansageValue({ ...base, ansage: 2.9 })).toBe(2);
  });

  it('leaves the declared amount outside the situational modifier clamp', () => {
    // Same reason the announced Schadenswert is outside it: that clamp bounds
    // what a GM hands out unilaterally, and this is a number the table agreed on.
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._computeThreshold({ ...base, ansage: 40 })).toBe(9 - 40 - 3);
  });

  // The Stelle stayed a pick when everything else collapsed into the number,
  // because it is a location and not an amount.
  it('charges the Stelle what Gezielte Angriffe prices it at', () => {
    // No FV shortfall on this one, so the figures are the Stelle's price alone.
    const dialog = attack({ zonePicker, maneuverMalus: null });
    const base = form({ attributeA: 'str', contextChoice: '0' });
    // The Torso is free, and has to be: it is where an attack that announced
    // nothing lands, so charging it would price the standard attack.
    expect(dialog._computeThreshold({ ...base, zoneChoice: 'torso' })).toBe(9);
    // "Arme/Beine: um eine Stufe, also -3" · "Kopf: um zwei Stufen, also -6".
    expect(dialog._computeThreshold({ ...base, zoneChoice: 'arms' })).toBe(6);
    expect(dialog._computeThreshold({ ...base, zoneChoice: 'legs' })).toBe(6);
    expect(dialog._computeThreshold({ ...base, zoneChoice: 'head' })).toBe(3);
  });

  it('names the Stelle in the breakdown rather than folding it into the Ansage', () => {
    const dialog = attack({ zonePicker, maneuverMalus: null });
    const data = form({ attributeA: 'str', contextChoice: '0', zoneChoice: 'head', ansage: 4 });
    // Two decisions, two lines. One combined "Ansage −10" would be the same
    // arithmetic and a worse answer to "where did that come from".
    expect(dialog._breakdownText(data)).toContain('Kopf −6');
    expect(dialog._breakdownText(data)).toContain('Ansage −4');
    expect(dialog._computeThreshold(data)).toBe(-1);
  });

  it('compounds the Stelle price with the FV step it triggers', () => {
    // A weapon whose Fertigkeitsvoraussetzung is missed, aimed at the head:
    // −6 for the Stelle, and −3 because aiming made this a Manöver. Two rules,
    // two separate components, never merged into one figure.
    const dialog = attack({ zonePicker });
    const data = form({ attributeA: 'str', contextChoice: '0', zoneChoice: 'head' });
    expect(dialog._computeThreshold(data)).toBe(0);
    expect(dialog._breakdownText(data)).toContain('Kopf −6');
    expect(dialog._breakdownText(data)).toContain('TNO.Combat.FvMalus −3');
  });

  it('makes an aimed attack a Manöver, and the Torso not', () => {
    const dialog = attack({ zonePicker, maneuverMalus: { label: 'FV', value: -3 } });
    const base = form({ attributeA: 'str', contextChoice: '0' });
    // "Ansagen auf Trefferzonen im Nahkampf, normale Ansageregeln gelten hier
    // auf alles" — so aiming declares, and a declaration takes the FV step.
    expect(dialog._conditionalModifiers({ ...base, zoneChoice: 'head' }))
      .toEqual([{ label: 'FV', value: -3 }]);
    // The Torso announces nothing, so it is still a Standardangriff.
    expect(dialog._conditionalModifiers({ ...base, zoneChoice: 'torso' })).toEqual([]);
  });

  it('reports what a collapsed declaration block is carrying', () => {
    const dialog = attack({ zonePicker });
    const base = form({ attributeA: 'str', contextChoice: '0' });
    // Closed over nothing is an em dash, not "±0": the block is shut because
    // there is nothing in it, not because something was set to zero.
    expect(dialog._attemptBadge({ ...base, zoneChoice: 'torso' })).toBe('—');
    expect(dialog._attemptBadge({ ...base, zoneChoice: 'head', ansage: 4 })).toBe('Kopf −6 · Ansage −4');
  });

  // The GM's free ±3 moved into that block, so a shut block would otherwise be
  // able to hide it — the one thing the badge exists to prevent.
  it('names the scene modification in the badge without charging it twice', () => {
    const dialog = attack({ zonePicker });
    const base = form({ attributeA: 'str', contextChoice: '0', zoneChoice: 'torso' });

    expect(dialog._attemptBadge({ ...base, bonus: -3 })).toBe('TNO.Roll.Bonus −3');
    expect(dialog._attemptBadge({ ...base, zoneChoice: 'head', ansage: 4, bonus: 3 }))
      .toBe('Kopf −6 · Ansage −4 · TNO.Roll.Bonus +3');

    // The badge only reports; the threshold reads the bonus from the form data
    // itself, so listing it here adds nothing to the roll.
    expect(dialog._computeThreshold({ ...base, bonus: 3 }))
      .toBe(dialog._computeThreshold({ ...base, bonus: 0 }) + 3);
  });

  it('falls back to Torso for an unpicked or unknown Stelle', () => {
    const dialog = attack({ zonePicker });
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._zoneChoice(base)).toBe('torso');
    expect(dialog._zoneChoice({ ...base, zoneChoice: 'suit' })).toBe('torso');
    expect(dialog._zoneChoice({ ...base, zoneChoice: 'legs' })).toBe('legs');
    // A roll with no picker at all still answers where a hit lands.
    expect(attack()._zoneChoice({ ...base, zoneChoice: 'head' })).toBe('torso');
  });

  it('emits the envelope with the amount and the Stelle, and no attacker stats', async () => {
    const dialog = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      lockAttribute: true,
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      ansage: { label: 'Ansage' },
      zonePicker,
      envelope: { from: 'Anton', penetration: 5, sharp: 4, blunt: 2 },
    });

    await dialog._updateObject(null, form({ attributeA: 'str', ansage: 3, zoneChoice: 'head' }));
    expect(rolled.payload.extraFlags.envelope).toEqual({
      from: 'Anton',
      penetration: 5,
      sharp: 4,
      blunt: 2,
      // One figure, and it is the typed one — **not** 3 + the Kopf's 6. The
      // zone price buys doubled damage, not a harder defence, so adding it here
      // would tell the defender that 9 was aimed at their dodge. What the Kopf
      // does to them travels as the Stelle below and nowhere else.
      ansage: 3,
      zone: 'head',
    });
    // And no per-Manöver list rides along beside it any more.
    expect(rolled.payload.extraFlags.ansagen).toBeUndefined();
  });

  it('keeps the Stelle price on the attacker and out of the envelope entirely', async () => {
    const dialog = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      lockAttribute: true,
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      ansage: { label: 'Ansage' },
      zonePicker,
      envelope: { from: 'Anton', penetration: 5, sharp: 4, blunt: 2 },
    });

    // Aimed at the head, nothing else declared: the attacker pays 6 and the
    // defender is told of no declaration at all.
    await dialog._updateObject(null, form({ attributeA: 'str', zoneChoice: 'head' }));
    expect(rolled.payload.extraFlags.envelope.ansage).toBe(0);
    expect(rolled.payload.extraFlags.envelope.zone).toBe('head');
    expect(rolled.payload.components).toContainEqual(
      expect.objectContaining({ label: 'Kopf', value: -6 })
    );
  });

  it('puts the declared amount on the breakdown as one component', async () => {
    const dialog = attack({ zonePicker });
    const data = form({ attributeA: 'str', contextChoice: '0', ansage: 3, zoneChoice: 'head' });
    expect(dialog._breakdownText(data)).toContain('Ansage −3');

    await dialog._updateObject(null, data);
    expect(rolled.payload.components).toEqual(expect.arrayContaining([
      { label: 'Ansage', value: -3, display: '−3' },
    ]));
    // The Stelle is not a component: it modifies nothing, it only says where the
    // blow lands.
    expect(rolled.payload.components.some((part) => part.label === 'Trefferzone')).toBe(false);
  });
});

// The receiving end of the A→B channel: one optional integer, taken as given.
// From this side a Finte, a Starker Schwung and something the rulebook never
// named are the same statement — your roll is worse by n — which is exactly why
// nothing here asks where the number came from.
describe('TnoRollDialog opposing Ansage', () => {
  it('offers the field only where a workflow asked for it', () => {
    expect(new TnoRollDialog(armoured(false), { attributeA: 'str' }).opposingAnsage).toBe(false);
    // An attack declares Ansagen but never receives one.
    expect(new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      ansage: { label: 'Ansage' },
    }).opposingAnsage).toBe(false);
  });

  it('offers it empty when nothing was announced, and pre-filled when something was', () => {
    const dialog = new TnoRollDialog(armoured(false), { attributeA: 'dex', opposingAnsage: true });
    expect(dialog.opposingAnsage).toBe(true);
    expect(dialog.object.opposingAnsage).toBe('');

    const announced = new TnoRollDialog(armoured(false), { attributeA: 'dex', opposingAnsage: 3 });
    expect(announced.opposingAnsage).toBe(true);
    expect(announced.object.opposingAnsage).toBe(3);
    // A zero is an attack that declared nothing, so the field stays blank rather
    // than pre-filled with a meaningless 0.
    expect(new TnoRollDialog(armoured(false), { attributeA: 'dex', opposingAnsage: 0 }).object.opposingAnsage).toBe('');
  });

  it('subtracts an announced Ansage from a defence without ever gating it', () => {
    const dodge = new TnoRollDialog(armoured(false), {
      attributeA: 'dex',
      lockAttribute: true,
      skill: { key: 'acrobatics', label: 'Akrobatik', value: 3 },
      opposingAnsage: true,
    });
    const base = form({ attributeA: 'dex' });
    // 4 (Bew) + 3 (Akrobatik) = 7, less what was announced against it.
    expect(dodge._computeThreshold(base)).toBe(7);
    expect(dodge._computeThreshold({ ...base, opposingAnsage: 3 })).toBe(4);
    // Never a precondition: a defender who was told nothing simply rolls.
    expect(dodge._opposingAnsageComponent({ ...base, opposingAnsage: '' })).toBeNull();
    expect(dodge._opposingAnsageComponent({ ...base, opposingAnsage: 0 })).toBeNull();
    expect(dodge._computeThreshold({ ...base, opposingAnsage: -5 })).toBe(7);
    // Outside the ±30 clamp, like every other number the table agreed on.
    expect(dodge._computeThreshold({ ...base, opposingAnsage: 40 })).toBe(-33);
  });
});

describe('TnoRollDialog required value', () => {
  /** A resistance-shaped roll: Stärke locked, RW fixed, damage announced. */
  const resistance = () => new TnoRollDialog(armoured(false), {
    attributeA: 'str',
    lockAttribute: true,
    fixedModifiers: [{ label: 'RW (Kopf)', value: 3 }],
    requiredValue: { label: 'Schadenswert', sign: -1, min: 0 },
  });

  it('refuses to roll until the announced value is entered', async () => {
    const dialog = resistance();
    expect(dialog._canSubmit(form({ attributeA: 'str' }))).toBe(false);
    await dialog._updateObject(null, form({ attributeA: 'str' }));
    expect(rolled.payload).toBeNull();
    expect(warnings).toEqual(['TNO.Roll.ValueRequired']);

    // A blank field is not a typed zero: `FormDataExtended` yields null for an
    // empty number input, and an announced 0 is a real answer that rolls.
    expect(dialog._canSubmit(form({ attributeA: 'str', requiredValue: null }))).toBe(false);
    expect(dialog._canSubmit(form({ attributeA: 'str', requiredValue: 0 }))).toBe(true);
  });

  it('subtracts the announced value from the threshold', () => {
    const dialog = resistance();
    expect(dialog._computeThreshold(form({ attributeA: 'str', requiredValue: 7 }))).toBe(1);
    expect(dialog._breakdownText(form({ attributeA: 'str', requiredValue: 7 })))
      .toBe('TNO.Ability.Str.long 5 + RW (Kopf) +3 + Schadenswert −7');
  });

  // The ±30 clamp bounds what a GM hands out as a situational modifier. This is
  // a number the attacker announced, and the table has already agreed on it.
  it('leaves the announced value outside the situational modifier clamp', () => {
    expect(resistance()._computeThreshold(form({ attributeA: 'str', requiredValue: 40 }))).toBe(-32);
  });

  it('shows no threshold or odds until every required answer is present', () => {
    const dialog = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      lockAttribute: true,
      fixedModifiers: [{ label: 'RW (Kopf)', value: 3 }],
      preRollContext: {
        label: 'Durchdringung?',
        control: 'tiles',
        choices: [
          { key: 'equal', label: 'Gleich', value: 0 },
          { key: 'harder', label: 'Härter', value: 3 },
        ],
      },
      requiredValue: {
        label: 'Schadenswert',
        labels: { equal: 'Wucht-Schadenswert', harder: 'Wucht-Schadenswert' },
        sign: -1,
        min: 0,
      },
    });

    expect(dialog._thresholdReadout(form({ attributeA: 'str' }))).toEqual({
      ready: false,
      threshold: null,
      thresholdDisplay: '—',
      oddsLabel: '',
      oddsPercent: 0,
      oddsTooltip: '',
      missingLabel: 'Schadenswert',
    });
    expect(dialog._thresholdReadout(form({ attributeA: 'str', requiredValue: 7 })))
      .toMatchObject({ ready: false, thresholdDisplay: '—', missingLabel: 'Durchdringung?' });
    expect(dialog._thresholdReadout(form({ attributeA: 'str', contextChoice: 'harder' })))
      .toMatchObject({ ready: false, thresholdDisplay: '—', missingLabel: 'Wucht-Schadenswert' });

    const ready = dialog._thresholdReadout(form({
      attributeA: 'str',
      contextChoice: 'harder',
      requiredValue: 7,
    }));
    expect(ready).toMatchObject({ ready: true, threshold: 4, thresholdDisplay: '4', missingLabel: '' });
    expect(ready.oddsLabel).not.toBe('');
    expect(ready.oddsPercent).toBeGreaterThan(0);
  });
});

describe('TnoRollDialog presentation helpers', () => {
  it('keeps breakdown parts, text and threshold arithmetic in lockstep', () => {
    const dialog = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      fixedModifiers: [{ label: 'Handhabung', value: 1 }],
      ansage: { label: 'Ansage' },
    });
    const data = form({ attributeA: 'str', ansage: 2, bonus: 3 });
    const parts = dialog._breakdownParts(data);

    expect(parts.reduce((sum, part) => sum + part.value, 0)).toBe(dialog._computeThreshold(data));
    expect(dialog._breakdownText(data)).toBe(parts.map((part) => `${part.label} ${part.display}`).join(' + '));
  });

  it('derives dividers only from sections on their far side', () => {
    const combat = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      preRollContext: {
        label: 'Distanz?',
        choices: [{ key: 'near', label: 'Nah', value: 0 }],
      },
      ansage: { label: 'Ansage' },
    });
    const skill = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
    });
    const fixed = new TnoRollDialog(armoured(false), { fixedValue: { label: 'Fest', value: 8 } });

    expect(combat._sectionFlags()).toMatchObject({ hasGivenDivider: true, hasChosenDivider: true });
    expect(skill._sectionFlags()).toMatchObject({ hasGivenDivider: false, hasChosenDivider: true });
    expect(fixed._sectionFlags()).toMatchObject({ hasGivenDivider: false, hasChosenDivider: false });
  });

  it('uses the adjustment question when the section only contains the stepper', () => {
    const simple = new TnoRollDialog(armoured(false), { attributeA: 'str' });
    const declared = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      ansage: { label: 'Ansage' },
    });
    expect(simple._attemptQuestionKey()).toBe('TNO.Roll.Question.Adjust');
    expect(declared._attemptQuestionKey()).toBe('TNO.Roll.Question.Attempt');
  });
});

describe('TnoRollDialog tile columns', () => {
  it('lays the two reach tiles out in two columns rather than seven', () => {
    const tiles = (tileColumns) => new TnoRollDialog(armoured(false), {
      preRollContext: { label: 'Reach', control: 'tiles', tileColumns, choices: [{ key: '0', label: '0', value: 0 }] },
    }).preRollContext.tileColumns;
    expect(tiles(2)).toBe(2);
    expect(tiles(3)).toBe(3);
    expect(tiles(5)).toBe(5);
    // Anything the stylesheet has no grid for still falls back to the widest.
    expect(tiles(4)).toBe(7);
  });
});

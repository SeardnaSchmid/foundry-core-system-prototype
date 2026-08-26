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
const { ansageEnvelope } = await import('../../module/helpers/maneuvers.mjs');

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
});

/** An actor whose worn armour may or may not outweigh its Strength. */
const armoured = (penalised) => ({
  type: 'npc',
  system: {
    abilities: { str: { value: 5 }, dex: { value: 4 } },
    skills: {},
    derived: { armorSvPenalty: penalised },
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
      ansagen: [{ key: 'feint', label: 'Finte', effect: 'Effect', mode: 'free', betrag: 0, rank: 4 }],
    });
    const data = form({ attributeA: 'dex', ansagen: { feint: 2 } });
    // 4 (Bew) + 2 (Akrobatik) − 3 (armour) − 3 (FV) − 2 (the Ansage).
    expect(dialog._computeThreshold(data)).toBe(-2);

    await dialog._updateObject(null, data);
    expect(rolled.payload.components).toEqual(expect.arrayContaining([
      { label: 'TNO.Combat.ArmorSvMalus', value: -3, display: '−3' },
      { label: 'TNO.Combat.FvMalus', value: -3, display: '−3' },
    ]));
  });
});

// "Würfelt er alle Manöver mit einem Malus" — and a Standardangriff is not a
// Manöver, so what makes this roll one is whether anything was declared on it.
describe('TnoRollDialog Ansagen', () => {
  const attack = (ansagen) => new TnoRollDialog(armoured(false), {
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
    ansagen,
  });

  const feint = [{ key: 'feint', label: 'Finte', effect: 'Effect', mode: 'free', betrag: 0, rank: 2 }];

  it('charges the declaring roll one for one up to the rank and two past it', () => {
    const dialog = attack(feint);
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._computeThreshold(base)).toBe(9);
    // A 3er Finte at Geschickte Angriffe 2 costs 4, not 3 — the rulebook's own
    // example, and the surcharge is the declarer's alone.
    expect(dialog._computeThreshold({ ...base, ansagen: { feint: 3 } })).toBe(9 - 4 - 3);
    expect(dialog._declaredAnsagen({ ...base, ansagen: { feint: 3 } })[0]).toMatchObject({ betrag: 3, cost: 4 });
  });

  it('leaves a standard attack free of the FV malus and charges a declared one', () => {
    const dialog = attack(feint);
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._conditionalModifiers(base)).toEqual([]);
    expect(dialog._conditionalModifiers({ ...base, ansagen: { feint: 1 } })).toEqual([
      { label: 'TNO.Combat.FvMalus', value: -3 },
    ]);
    // A Betrag of zero is not a declaration, so it does not make the attack a
    // Manöver either.
    expect(dialog._conditionalModifiers({ ...base, ansagen: { feint: 0 } })).toEqual([]);
  });

  it('refuses to charge for a Manöver whose reach precondition is unmet', () => {
    const dialog = attack([
      { key: 'strongSwing', label: 'Starker Schwung', effect: 'Effect', mode: 'free', betrag: 0, rank: 3, requiresReach: true },
    ]);
    const declared = { ansagen: { strongSwing: 3 } };
    // "Können nur verwendet werden, wenn der Angreifer den Reichweitenvorteil
    // hat" — without the longer weapon the box costs nothing however it is set.
    expect(dialog._declaredAnsagen(form({ attributeA: 'str', contextChoice: '0', ...declared }))).toEqual([]);
    expect(dialog._declaredAnsagen(form({ attributeA: 'str', contextChoice: '3', ...declared }))).toHaveLength(1);
    expect(dialog._ansageRows(form({ attributeA: 'str', contextChoice: '0', ...declared }))[0].blocked).toBe(true);
  });

  // The field belongs to a defence and to nothing else. An attack has no
  // opponent's announcement to enter, and neither does a plain skill check.
  it('keeps the announcement field off every roll that did not ask for one', () => {
    expect(new TnoRollDialog(armoured(false), { attributeA: 'str' }).opposingAnsage).toBe(false);
    // The attack builder does not pass it, and the default must not turn itself
    // on: `Number(false)` is 0, and 0 is a finite number.
    expect(new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      ansagen: [{ key: 'feint', label: 'Finte', effect: 'Effect', mode: 'free', betrag: 0, rank: 2 }],
    }).opposingAnsage).toBe(false);
  });

  it('offers the field empty when a defence was told nothing', () => {
    // `true` means "ask, but nothing is announced yet" — not "announced 1",
    // which is what coercing the boolean to a number would have produced.
    const dialog = new TnoRollDialog(armoured(false), { attributeA: 'dex', opposingAnsage: true });
    expect(dialog.opposingAnsage).toBe(true);
    expect(dialog.object.opposingAnsage).toBe('');
  });

  it('fills the field in when a defence was handed a number', () => {
    const dialog = new TnoRollDialog(armoured(false), { attributeA: 'dex', opposingAnsage: 3 });
    expect(dialog.opposingAnsage).toBe(true);
    expect(dialog.object.opposingAnsage).toBe(3);
    // A stored zero is "nothing announced against this roll", not a value.
    expect(new TnoRollDialog(armoured(false), { attributeA: 'dex', opposingAnsage: 0 }).object.opposingAnsage).toBe('');
  });

  // The receiving end of the same channel: one integer, and no question about
  // where it came from.
  it('subtracts an announced Ansage from a defence without ever gating it', () => {
    const dodge = new TnoRollDialog(armoured(false), {
      attributeA: 'dex',
      lockAttribute: true,
      skill: { key: 'acrobatics', label: 'Akrobatik', value: 3 },
      opposingAnsage: true,
    });
    const base = form({ attributeA: 'dex' });
    // Nothing announced is the common case and must roll exactly as before.
    expect(dodge._computeThreshold(base)).toBe(7);
    expect(dodge._canSubmit(base)).toBe(true);
    expect(dodge._computeThreshold({ ...base, opposingAnsage: 3 })).toBe(4);
    // A blank field, a zero and a negative are all "nothing was announced".
    expect(dodge._opposingAnsageComponent({ ...base, opposingAnsage: '' })).toBeNull();
    expect(dodge._opposingAnsageComponent({ ...base, opposingAnsage: 0 })).toBeNull();
    expect(dodge._computeThreshold({ ...base, opposingAnsage: -5 })).toBe(7);
    // Outside the ±30 clamp, like every other number the table agreed on.
    expect(dodge._computeThreshold({ ...base, opposingAnsage: 40 })).toBe(-33);
  });

  /** The three Trefferzonen as the attack builder hands them over. */
  const zones = [
    { key: 'arms', label: 'Arme', effect: 'Effect', mode: 'fixed', betrag: 3, rank: 8, zone: 'arms', group: 'zone' },
    { key: 'legs', label: 'Beine', effect: 'Effect', mode: 'fixed', betrag: 3, rank: 8, zone: 'legs', group: 'zone' },
    { key: 'head', label: 'Kopf', effect: 'Effect', mode: 'fixed', betrag: 6, rank: 8, zone: 'head', group: 'zone' },
  ];

  // The regression the screenshot caught: `mode: 'fixed'` says the *rule* names
  // the Betrag, and the dialog read it as "is declared". Every attack silently
  // announced arms, legs and head at once — a Standardangriff cost 12 points and
  // hit three places.
  it('declares nothing until something is chosen', () => {
    const dialog = attack([...feint, ...zones]);
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._declaredAnsagen(base)).toEqual([]);
    expect(dialog._ansageComponent(base)).toBeNull();
    // Which is the same as saying the Standardangriff rolls at its plain
    // threshold, and carries no FV malus because it is not a Manöver.
    expect(dialog._computeThreshold(base)).toBe(9);
    expect(dialog._conditionalModifiers(base)).toEqual([]);
  });

  it('lets one Stelle be announced, and only one', () => {
    const dialog = attack([...feint, ...zones]);
    const base = form({ attributeA: 'str', contextChoice: '0' });
    const declared = dialog._declaredAnsagen({ ...base, ansageGroups: { zone: 'legs' } });
    // An attack has one Stelle. Picking the legs is picking *not* the head, so
    // there is no combination of two locations to price or to send.
    expect(declared.map((entry) => entry.key)).toEqual(['legs']);
    expect(declared[0]).toMatchObject({ betrag: 3, cost: 3 });
    expect(ansageEnvelope(declared).zone).toBe('legs');
  });

  it('offers the Stellen as one row with an empty default', () => {
    const dialog = attack([...feint, ...zones]);
    const base = form({ attributeA: 'str', contextChoice: '0' });
    // The Finte keeps its own row; the three Stellen collapse into one control.
    expect(dialog._ansageRows(base).map((row) => row.key)).toEqual(['feint']);

    const [group] = dialog._ansageGroupRows(base);
    expect(group.key).toBe('zone');
    expect(group.choices.map((choice) => choice.key)).toEqual(['arms', 'legs', 'head']);
    // Nothing preselected, and each option priced before it is picked: at rank 8
    // the arms cost 3 and the head 6, both still 1:1.
    expect(group.choices.some((choice) => choice.selected)).toBe(false);
    expect(group.choices.map((choice) => choice.label)).toEqual([
      'TNO.Combat.AnsageOption(Arme,−3)',
      'TNO.Combat.AnsageOption(Beine,−3)',
      'TNO.Combat.AnsageOption(Kopf,−6)',
    ]);
    expect(group.readout).toBe('');
  });

  it('says in its own header what a folded-up block is hiding', () => {
    const dialog = attack([...feint, ...zones]);
    const base = form({ attributeA: 'str', contextChoice: '0' });
    // Shut and empty is the common case, and it has to read as empty.
    expect(dialog._ansageSummary(base)).toBe('TNO.Combat.AnsageNone');
    expect(dialog._ansageSummary({ ...base, ansagen: { feint: 3 }, ansageGroups: { zone: 'head' } }))
      .toBe('TNO.Combat.AnsageSummary(2,−10)');
  });

  it('emits the envelope with the Betrag and the Stelle, and no attacker stats', async () => {
    const dialog = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      lockAttribute: true,
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      ansagen: [
        { key: 'feint', label: 'Finte', effect: 'Effect', mode: 'free', betrag: 0, rank: 2 },
        { key: 'head', label: 'Kopf', effect: 'Effect', mode: 'fixed', betrag: 6, rank: 6, zone: 'head', group: 'zone' },
      ],
      envelope: { from: 'Anton', penetration: 5, sharp: 4, blunt: 2 },
    });

    await dialog._updateObject(null, form({
      attributeA: 'str',
      ansagen: { feint: 3 },
      ansageGroups: { zone: 'head' },
    }));
    expect(rolled.payload.extraFlags.envelope).toEqual({
      from: 'Anton',
      penetration: 5,
      sharp: 4,
      blunt: 2,
      // The Finte reaches both defences at the declared 3, never at the 4 it cost.
      parry: 3,
      dodge: 3,
      resistance: 0,
      zone: 'head',
      bypassArmor: false,
    });
  });

  it('sums several declarations into one component and tells the card the Betrag', async () => {
    const dialog = attack([
      ...feint,
      { key: 'head', label: 'Kopf', effect: 'Effect', mode: 'fixed', betrag: 6, rank: 6, zone: 'head', group: 'zone' },
    ]);
    const data = form({
      attributeA: 'str',
      contextChoice: '0',
      ansagen: { feint: 3 },
      ansageGroups: { zone: 'head' },
    });
    // 4 for the Finte + 6 for the Kopf, as a single row on the breakdown.
    expect(dialog._ansageComponent(data)).toMatchObject({ value: -10 });

    await dialog._updateObject(null, data);
    // What crosses to the defender is the declared Betrag, never the cost.
    expect(rolled.payload.extraFlags.ansagen).toEqual([
      { key: 'feint', label: 'Finte', effect: 'Effect', betrag: 3, cost: 4 },
      { key: 'head', label: 'Kopf', effect: 'Effect', betrag: 6, cost: 6, zone: 'head' },
    ]);
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

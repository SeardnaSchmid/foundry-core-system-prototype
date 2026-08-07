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
    format: (key, values) => `${key}:${values?.name ?? ''}`,
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
      skill: { key: 'footwork', label: 'Beinarbeit', value: 2 },
      preRollContext: {
        label: 'Manöver mit',
        choices: [
          { key: 'unarmed', label: 'Unbewaffnet', value: 0 },
          { key: 'blade', label: 'Langschwert', value: -3, componentLabel: 'FV: Langschwert' },
        ],
      },
    });
    const data = form({ attributeA: 'dex', contextChoice: 'blade' });
    expect(dialog._computeThreshold(data)).toBe(0);

    await dialog._updateObject(null, data);
    expect(rolled.payload.components).toEqual(expect.arrayContaining([
      { label: 'TNO.Combat.ArmorSvMalus', value: -3, display: '−3' },
      expect.objectContaining({ label: 'FV: Langschwert', value: -3 }),
    ]));
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
  it('lays three reach tiles out in three columns rather than seven', () => {
    const tiles = (tileColumns) => new TnoRollDialog(armoured(false), {
      preRollContext: { label: 'Reach', control: 'tiles', tileColumns, choices: [{ key: '0', label: '0', value: 0 }] },
    }).preRollContext.tileColumns;
    expect(tiles(3)).toBe(3);
    expect(tiles(5)).toBe(5);
    // Anything the stylesheet has no grid for still falls back to the widest.
    expect(tiles(4)).toBe(7);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// TnoRollDialog is a Foundry application, but its context-to-threshold path is
// deterministic. A minimal shell lets the unit suite verify that path without
// a browser or a Foundry world.
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

        // What core's `_onSubmit` does, reduced to the part the override cares
        // about: read the form and hand it to `_updateObject`. The override's
        // job is to not get here while a required answer is missing.
        async _onSubmit(event) {
          const data = new FormDataExtended(this.form ?? event?.currentTarget).object;
          await this._updateObject(event, data);
          return data;
        }
      },
    },
  },
};
// Core reads a live form; the suite has no DOM, so a stub form carries the
// same shape — the values keyed by input name.
globalThis.FormDataExtended = class {
  constructor(form) {
    this.object = form?.values ?? {};
  }
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

  it('suppresses a confirmation toggle when the selected context already provides its effect', () => {
    const compared = new TnoRollDialog(actor, {
      fixedValue: { label: 'Base', value: 8 },
      preRollContext: {
        label: 'Comparison',
        choices: [
          { key: 'through', label: 'Through', value: -4, suppressesToggleModifier: true },
          { key: 'held', label: 'Held', value: 0 },
        ],
      },
      toggleModifier: { label: 'Bypass', value: -4 },
    });

    const redundant = { contextChoice: 'through', toggleModifier: true };
    expect(compared._toggleModifierSuppressed(redundant)).toBe(true);
    expect(compared._conditionalModifiers(redundant)).toEqual([]);
    expect(compared._computeThreshold(redundant)).toBe(4);

    const additional = { contextChoice: 'held', toggleModifier: true };
    expect(compared._toggleModifierSuppressed(additional)).toBe(false);
    expect(compared._conditionalModifiers(additional)).toContainEqual(
      expect.objectContaining({ label: 'Bypass', value: -4 })
    );
    expect(compared._computeThreshold(additional)).toBe(4);
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
        tileColumns: 5,
        choices: [{ key: 'near', label: 'Near', value: -3 }],
      },
    });
    expect(rangeDialog.preRollContext).toMatchObject({ control: 'tiles', tileColumns: 5 });
  });

  // Every tile reads in the same three slots — what you are picking, what it is
  // worth, what it does — and which of them a choice fills is derived, not
  // declared. A choice naming itself (`headline`) is one whose `label` is an
  // effect, so that label drops to the caption; a choice without one is named
  // by its label and has no caption at all. The range picker used to lead with
  // the modifier and caption it with the band, which answered "at what
  // distance?" with "−3".
  it('names a tile by its answer and captions it only where there is an effect to state', () => {
    const tiles = (choices) => new TnoRollDialog(actor, {
      fixedValue: { label: 'Base', value: 8 },
      preRollContext: { label: 'Range', control: 'tiles', tileColumns: 5, choices },
    }).getData().questions.find((question) => question.key === 'context').choices;

    const [band] = tiles([{ key: 'near', label: 'Near', value: -3 }]);
    expect(band).toMatchObject({ name: 'Near', display: '−3', caption: '', state: 'negative' });

    const [rung] = tiles([{ key: 'holds', label: 'holds · blunt damage', headline: '= 8', value: 0 }]);
    expect(rung).toMatchObject({ name: '= 8', display: '±0', caption: 'holds · blunt damage', state: 'neutral' });
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
});

describe('TnoRollDialog global damage malus', () => {
  it('keeps actor state separate from form-dependent modifiers', () => {
    const dialog = new TnoRollDialog(armoured(true, -4), { attributeA: 'dex' });
    expect(dialog._actorModifiers()).toEqual([{ label: 'TNO.Damage.Malus', value: -4 }]);
    expect(dialog._conditionalModifiers(form({ attributeA: 'dex' }))).toEqual([
      { label: 'TNO.Combat.ArmorSvMalus', value: -3 },
    ]);
    expect(dialog._fixedModifierComponents(form({ attributeA: 'dex' })).map((part) => part.label)).toEqual([
      'TNO.Damage.Malus',
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
    expect(dialog._breakdownText(data)).toContain('TNO.Damage.Malus −3');

    await dialog._updateObject(null, data);
    expect(rolled.payload.threshold).toBe(2);
    expect(rolled.payload.components[0]).toEqual({
      label: 'TNO.Ability.Str.long',
      value: 5,
    });
    expect(rolled.payload.components[1]).toEqual({
      label: 'TNO.Damage.Malus',
      value: -3,
      display: '−3',
    });
    expect(rolled.payload.components.reduce((sum, part) => sum + part.value, 0)).toBe(2);
  });

  it('adds no component for an undamaged actor', () => {
    expect(new TnoRollDialog(armoured(false), { attributeA: 'str' })._actorModifiers()).toEqual([]);
  });
});

// The Ansage is one free magnitude with no rank behind it: the player and the GM
// agree the number out loud, including what it is *for*, and only the figure
// reaches the form. Nothing here prices, caps or gates it.
describe('TnoRollDialog Ansagen', () => {
  const attack = (extra = {}) => new TnoRollDialog(armoured(false), {
    attributeA: 'str',
    lockAttribute: true,
    skill: { key: 'swords', label: 'Schwerter', value: 4 },
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

  it('takes the declared amount at face value, with nothing to price it against', () => {
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._computeThreshold(base)).toBe(9);
    // A 3er Ansage costs this roll 3, whatever any Manöverfertigkeit stands at:
    // the 1:1/2:1 conversion is arithmetic the table did before typing.
    expect(dialog._computeThreshold({ ...base, ansage: 3 })).toBe(9 - 3);
    expect(dialog._ansageComponent({ ...base, ansage: 3 }))
      .toEqual({ label: 'Ansage', value: -3, display: '−3' });
  });

  it('reads a blank field as nothing declared and a fraction as its whole part', () => {
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    for (const ansage of ['', null, 0]) {
      expect(dialog._ansageComponent({ ...base, ansage })).toBeNull();
    }
    expect(dialog._ansageValue({ ...base, ansage: 2.9 })).toBe(2);
  });

  it('eases the roll by a negative Ansage', () => {
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._ansageComponent({ ...base, ansage: -2 }))
      .toEqual({ label: 'Ansage', value: 2, display: '+2' });
    expect(dialog._computeThreshold({ ...base, ansage: -2 }) - dialog._computeThreshold(base)).toBe(2);
  });

  it('leaves the declared amount outside the situational modifier clamp', () => {
    // Same reason the announced Schadenswert is outside it: that clamp bounds
    // what a GM hands out unilaterally, and this is a number the table agreed on.
    const dialog = attack();
    const base = form({ attributeA: 'str', contextChoice: '0' });
    expect(dialog._computeThreshold({ ...base, ansage: 40 })).toBe(9 - 40);
  });

  it('emits the envelope with the amount and no target location', async () => {
    const dialog = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      lockAttribute: true,
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      ansage: { label: 'Ansage' },
      envelope: { from: 'Anton', penetration: 5, sharp: 4, blunt: 2 },
    });

    await dialog._updateObject(null, form({ attributeA: 'str', ansage: 3 }));
    expect(rolled.payload.extraFlags.envelope).toEqual({
      from: 'Anton',
      penetration: 5,
      sharp: 4,
      blunt: 2,
      ansage: 3,
    });
    // And no per-Manöver list rides along beside it any more.
    expect(rolled.payload.extraFlags.ansagen).toBeUndefined();
  });

  it('puts the declared amount on the breakdown as one component', async () => {
    const dialog = attack();
    const data = form({ attributeA: 'str', contextChoice: '0', ansage: 3 });
    expect(dialog._breakdownText(data)).toContain('Ansage −3');

    await dialog._updateObject(null, data);
    expect(rolled.payload.components).toEqual(expect.arrayContaining([
      { label: 'Ansage', value: -3, display: '−3' },
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

  it('opens the announced value at zero and never blocks the roll on it', async () => {
    const dialog = resistance();
    // The field opens on a value rather than empty, and a roll carrying only
    // that default is a roll the dialog will make.
    expect(dialog.object.requiredValue).toBe(0);
    expect(dialog._canSubmit(form({ attributeA: 'str' }))).toBe(true);

    // Blank and zero are the same answer now: clearing the box empties it, it
    // does not withdraw the answer.
    expect(dialog._requiredValueEntry(form({ attributeA: 'str', requiredValue: null }))).toBe(0);
    expect(dialog._requiredValueEntry(form({ attributeA: 'str', requiredValue: 0 }))).toBe(0);
    expect(dialog._canSubmit(form({ attributeA: 'str', requiredValue: null }))).toBe(true);

    await dialog._updateObject(null, form({ attributeA: 'str' }));
    expect(warnings).toEqual([]);
    expect(rolled.payload).not.toBeNull();
    expect(rolled.payload.threshold).toBe(dialog._computeThreshold(form({ attributeA: 'str' })));
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

  it('shows the Schwelle in parentheses until every required answer is present', () => {
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

    // The pick is the only answer that can hold this roll back. Until it is in,
    // the figure stands in parentheses — it will still move — and the open
    // question is named by its number.
    const pending = dialog._thresholdReadout(form({ attributeA: 'str' }));
    expect(pending).toMatchObject({
      ready: false,
      threshold: 8,
      thresholdDisplay: '(≤ 8)',
      oddsTooltip: '',
      missingLabel: '① Durchdringung?',
      missingLabels: ['① Durchdringung?'],
    });
    expect(pending.oddsLabel).toMatch(/^\(.*\)$/);
    expect(dialog._thresholdReadout(form({ attributeA: 'str', requiredValue: 7 })))
      .toMatchObject({ ready: false, thresholdDisplay: '(≤ 1)', missingLabel: '① Durchdringung?' });
    expect(dialog._thresholdReadout(form({ attributeA: 'str', contextChoice: 'harder' })))
      .toMatchObject({ ready: true, missingLabel: '' });

    const ready = dialog._thresholdReadout(form({
      attributeA: 'str',
      contextChoice: 'harder',
      requiredValue: 7,
    }));
    expect(ready).toMatchObject({ ready: true, threshold: 4, thresholdDisplay: '≤ 4', missingLabel: '' });
    expect(ready.oddsLabel).not.toBe('');
    expect(ready.oddsPercent).toBeGreaterThan(0);
  });
});

describe('TnoRollDialog blocked submit', () => {
  /** A roll that cannot resolve until its comparison is picked. */
  const gated = () => new TnoRollDialog(armoured(false), {
    attributeA: 'str',
    lockAttribute: true,
    preRollContext: {
      label: 'Durchdringung?',
      control: 'tiles',
      choices: [
        { key: 'equal', label: 'Gleich', value: 0 },
        { key: 'harder', label: 'Härter', value: 3 },
      ],
    },
  });

  // The commit button is no longer `disabled` — a disabled button swallows its
  // own click, and this one's second line names the field that is missing, so
  // pressing it has to lead somewhere. That moves the gate off the attribute
  // and onto `_onSubmit`, which makes this the only thing standing between an
  // unanswered comparison and a roll that quietly invents one.
  it('refuses an unanswered roll instead of making it, and marks the control', async () => {
    const dialog = gated();
    const refused = [];
    dialog._rejectSubmit = (form) => refused.push(form);

    const prevented = [];
    const blocked = { values: { attributeA: 'str' } };
    const outcome = await dialog._onSubmit({
      currentTarget: blocked,
      preventDefault: () => prevented.push(true),
    });

    expect(outcome).toBeNull();
    expect(rolled.payload).toBeNull();
    expect(prevented).toEqual([true]);
    // The refusal is shown at the control the answer goes into, not only on the
    // button that was pressed.
    expect(refused).toEqual([blocked]);
  });

  it('makes the roll once the pick is answered', async () => {
    const dialog = gated();
    const refused = [];
    dialog._rejectSubmit = (form) => refused.push(form);

    await dialog._onSubmit({
      currentTarget: { values: { attributeA: 'str', contextChoice: 'harder' } },
      preventDefault: () => {},
    });

    expect(refused).toEqual([]);
    expect(rolled.payload).not.toBeNull();
    expect(warnings).toEqual([]);
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

  // Only what the roller has to answer is asked; the rest is a fact in the
  // Beleg. The numbering is shared by the form, the Beleg and the open line.
  it('asks only what the roller answers, numbered in one order', () => {
    const attack = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      lockAttribute: true,
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      preRollContext: { label: 'Länger?', control: 'toggle', choices: [{ key: 'no', label: 'Nein', value: 0 }, { key: 'yes', label: 'Ja', value: 3 }] },
      ansage: { label: 'Ansage' },
    });
    const skill = new TnoRollDialog(armoured(false), {
      attributeA: 'str',
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
    });
    const fixed = new TnoRollDialog(armoured(false), { fixedValue: { label: 'Fest', value: 8 } });
    const keys = (dialog, data) => dialog._questions(form(data)).map((question) => `${question.mark} ${question.key}`);

    expect(keys(attack, { attributeA: 'str' })).toEqual(['① ansage', '② context', '③ bonus']);
    // A preselected attribute is an answer, not an open question.
    expect(keys(skill, { attributeA: 'str' })).toEqual(['① attribute', '② bonus']);
    expect(skill._canSubmit(form({ attributeA: 'str' }))).toBe(true);
    expect(skill._canSubmit(form({ attributeA: '' }))).toBe(false);
    expect(keys(fixed, {})).toEqual([]);
  });

  // The Beleg is the breakdown the dialog shows, so what it counts must be the
  // Schwelle — pending and provisional lines included as nothing.
  it('sums the Beleg to the Schwelle, grouped by where each line comes from', () => {
    const dialog = new TnoRollDialog(armoured(true, -3), {
      attributeA: 'dex',
      lockAttribute: true,
      skill: { key: 'swords', label: 'Schwerter', value: 4 },
      fixedModifiers: [{ label: 'Handhabung', value: -1, origin: 'weapon' }],
      preRollContext: { label: 'Länger?', control: 'toggle', origin: 'weapon', choices: [{ key: 'no', label: 'Nein', value: 0 }, { key: 'yes', label: 'Ja', value: 3 }] },
      ansage: { label: 'Ansage' },
      sources: { weapon: 'Säbel' },
    });
    for (const data of [
      form({ attributeA: 'dex' }),
      form({ attributeA: 'dex', contextChoice: 'yes', ansage: 2, bonus: -3 }),
    ]) {
      const groups = dialog._belegGroups(data);
      expect(groups.reduce((sum, group) => sum + group.sum, 0)).toBe(dialog._computeThreshold(data));
    }
    const groups = dialog._belegGroups(form({ attributeA: 'dex' }));
    expect(groups.map((group) => group.key)).toEqual(['character', 'weapon', 'situation', 'choice']);
    expect(groups.find((group) => group.key === 'weapon')).toMatchObject({ label: 'TNO.Roll.Origin.Named(TNO.Roll.Origin.Weapon,Säbel)', pending: true });
    // The armour step and the damage malus are the character's own.
    expect(groups[0].rows.map((row) => row.label)).toEqual(['TNO.Ability.Dex.long', 'Schwerter', 'TNO.Damage.Malus', 'TNO.Combat.ArmorSvMalus']);
  });

  it('reads a line still awaiting its answer as pending, and an unarmed one as provisional', () => {
    const dialog = new TnoRollDialog(armoured(false), { attributeA: 'str' });
    expect(dialog._deltaCell(0, { pending: true })).toEqual({ display: '?', cls: 'is-pending' });
    expect(dialog._deltaCell(-3, { provisional: true })).toEqual({ display: '(−3)', cls: 'is-provisional' });
    expect(dialog._deltaCell(-3)).toEqual({ display: '−3', cls: 'is-negative' });
    expect(dialog._deltaCell(2)).toEqual({ display: '+2', cls: 'is-positive' });
    expect(dialog._deltaCell(0)).toEqual({ display: '±0', cls: 'is-neutral' });
  });
});

describe('TnoRollDialog tile columns', () => {
  it('lays the two reach tiles out in two columns rather than seven', () => {
    const tiles = (tileColumns) => new TnoRollDialog(armoured(false), {
      preRollContext: { label: 'Reach', control: 'tiles', tileColumns, choices: [{ key: '0', label: '0', value: 0 }] },
    }).preRollContext.tileColumns;
    expect(tiles(1)).toBe(1);
    expect(tiles(2)).toBe(2);
    expect(tiles(3)).toBe(3);
    expect(tiles(5)).toBe(5);
    // Anything the stylesheet has no grid for still falls back to the widest.
    expect(tiles(4)).toBe(7);
  });
});

describe('TnoRollDialog width', () => {
  const width = (value) => new TnoRollDialog(armoured(false), { width: value }).options.width;

  it('takes the width a workflow asks for', () => {
    expect(width(400)).toBe(400);
  });

  // Anything unusable leaves `defaultOptions` alone rather than overriding it
  // with a width no window can be drawn at.
  it('falls back to the class default for anything else', () => {
    expect(width(null)).toBeUndefined();
    expect(width(0)).toBeUndefined();
    expect(width(-100)).toBeUndefined();
    expect(width('wide')).toBeUndefined();
  });
});

describe('TnoRollDialog comparison anchor', () => {
  const withAnchor = (anchor) => new TnoRollDialog(armoured(false), {
    preRollContext: {
      label: 'Penetration',
      control: 'tiles',
      tileColumns: 1,
      anchor,
      choices: [{ key: '0', label: '0', value: 0 }],
    },
  }).preRollContext.anchor;

  it('carries a readout the choices are measured against', () => {
    expect(withAnchor({ label: 'Your RH', value: 8 })).toEqual({ label: 'Your RH', value: '8' });
  });

  // A zero RH is a real answer — unarmoured — and the layout has to state it
  // rather than fall back to no anchor at all.
  it('keeps a zero', () => {
    expect(withAnchor({ label: 'Your RH', value: 0 })).toEqual({ label: 'Your RH', value: '0' });
  });

  it('ignores a half-specified anchor', () => {
    expect(withAnchor({ value: 8 })).toBeNull();
    expect(withAnchor({ label: 'Your RH' })).toBeNull();
    expect(withAnchor(undefined)).toBeNull();
  });
});

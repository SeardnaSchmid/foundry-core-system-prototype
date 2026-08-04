import { describe, expect, it } from 'vitest';

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
});

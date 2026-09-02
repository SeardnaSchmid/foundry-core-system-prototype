import { describe, expect, it } from 'vitest';

import {
  resolveArmorCondition,
  resolveCarryCondition,
  resolveConditions,
  resolveDamageConditions,
  resolveDefenseCondition,
} from '../../module/helpers/conditions.mjs';
import { resolveDamage } from '../../module/helpers/damage.mjs';

const abilities = {
  str: { base: 3 },
  dex: { base: 2 },
  fin: { base: 1 },
};

const conditions = (damage, overrides = {}) =>
  resolveDamageConditions(resolveDamage(damage, abilities.str.base), abilities, overrides);

describe('resolveDamageConditions', () => {
  it('uses a strict greater-than threshold for all six fixed lights', () => {
    const atThreshold = conditions({ blunt: 3, sharp: 3 });
    expect(atThreshold.items.find((item) => item.key === 'bluntCore').active).toBe(false);
    expect(atThreshold.items.find((item) => item.key === 'sharpCore').active).toBe(false);

    const overThreshold = conditions({ blunt: 4, sharp: 4 });
    expect(overThreshold.items.find((item) => item.key === 'bluntCore').active).toBe(true);
    expect(overThreshold.items.find((item) => item.key === 'sharpCore').active).toBe(true);
  });

  it('keeps the raster in Wucht/Schaden rows and core/legs/arms columns', () => {
    const resolved = conditions({ blunt: 0, sharp: 0 });
    expect(resolved.rows.map((row) => row.map((item) => item.key))).toEqual([
      ['bluntCore', 'bluntLegs', 'bluntArms'],
      ['sharpCore', 'sharpLegs', 'sharpArms'],
    ]);
  });

  it('lets converted Wuchtschaden cross severe Schaden thresholds', () => {
    // Strength 3 carries the first three Wucht points. The next three convert,
    // so effective Schaden is 3: over FIN 1 and BEW 2, but not over STR 3.
    const resolved = conditions({ blunt: 6, sharp: 0 });
    expect(resolved.items.find((item) => item.key === 'sharpCore').active).toBe(false);
    expect(resolved.items.find((item) => item.key === 'sharpLegs').active).toBe(true);
    expect(resolved.items.find((item) => item.key === 'sharpArms').active).toBe(true);
  });

  it('forces a pending condition on and marks it as manual', () => {
    const item = conditions({ blunt: 0, sharp: 0 }, { bluntArms: true })
      .items.find((entry) => entry.key === 'bluntArms');

    expect(item).toMatchObject({
      derivedActive: false,
      active: true,
      manual: true,
      suppressed: false,
      state: 'manualActive',
    });
  });

  it('keeps a forced-off condition in the raster but out of the chip', () => {
    const resolved = conditions({ blunt: 4, sharp: 4 }, { sharpCore: false });
    const item = resolved.items.find((entry) => entry.key === 'sharpCore');

    expect(item).toMatchObject({
      derivedActive: true,
      active: false,
      manual: true,
      suppressed: true,
      state: 'suppressed',
    });
    expect(resolved.active.map((entry) => entry.key)).not.toContain('sharpCore');
  });

  it('orders active chip points severe before mild', () => {
    const resolved = conditions({ blunt: 4, sharp: 4 });
    const tones = resolved.active.map((item) => item.tone);
    const firstMild = tones.indexOf('mild');

    expect(firstMild).toBeGreaterThan(0);
    expect(tones.slice(0, firstMild)).toEqual(tones.slice(0, firstMild).map(() => 'severe'));
    expect(tones.slice(firstMild)).toEqual(tones.slice(firstMild).map(() => 'mild'));
    expect(resolved.active.every((item) => item.classification === 'negative')).toBe(true);
  });

  it('degrades missing abilities and invalid overrides safely', () => {
    const resolved = resolveDamageConditions(
      resolveDamage({ blunt: 1, sharp: 0 }, 0),
      {},
      { bluntCore: 'yes' }
    );
    expect(resolved.items.find((item) => item.key === 'bluntCore')).toMatchObject({
      threshold: 0,
      override: null,
      active: true,
    });
  });
});

describe('resolveCarryCondition', () => {
  it('stays inactive while the load leaves every movement tier intact', () => {
    expect(resolveCarryCondition({ state: 'ok', used: 3, capacity: 10 })).toMatchObject({
      key: 'overloaded',
      active: false,
      effectKey: null,
      state: 'inactive',
    });
  });

  it('reports half the budget as the mild tier and names the lost tier', () => {
    expect(resolveCarryCondition({ state: 'noSprint', used: 5, capacity: 10 })).toMatchObject({
      tone: 'mild',
      labelKey: 'TNO.Status.Loaded',
      effectKey: 'TNO.Status.Effect.Loaded',
      value: 5,
      threshold: 10,
      active: true,
      state: 'derivedActive',
    });
  });

  it('reports a full budget as the severe tier', () => {
    expect(resolveCarryCondition({ state: 'crawlOnly', used: 12, capacity: 10 })).toMatchObject({
      tone: 'severe',
      labelKey: 'TNO.Status.Overloaded',
      effectKey: 'TNO.Status.Effect.Overloaded',
      value: 12,
      active: true,
    });
  });

  it('is never overridable', () => {
    const entry = resolveCarryCondition({ state: 'crawlOnly', used: 12, capacity: 10 });
    expect(entry).toMatchObject({ override: null, manual: false, suppressed: false });
  });
});

describe('resolveArmorCondition', () => {
  it('stays inactive while the Stärkevoraussetzung is met', () => {
    expect(resolveArmorCondition({ penalty: false, sv: 2, strength: 3 })).toMatchObject({
      key: 'armorTooHeavy',
      active: false,
      effectKey: null,
    });
  });

  it('carries both compared numbers and the Beweglichkeit step when short', () => {
    expect(resolveArmorCondition({ penalty: true, sv: 11.5, strength: 2 })).toMatchObject({
      tone: 'mild',
      labelKey: 'TNO.Status.ArmorTooHeavy',
      effectKey: 'TNO.Status.Effect.ArmorTooHeavy',
      value: 2,
      threshold: 11.5,
      active: true,
      override: null,
      manual: false,
    });
  });
});

describe('resolveDefenseCondition', () => {
  it('stays inactive while the Haltung permits Ausweichen', () => {
    expect(
      resolveDefenseCondition({ dodge: true, parry: false, stanceLabelKey: 'x' })
    ).toMatchObject({ key: 'noDodge', active: false, effectKey: null });
  });

  it('names the remaining parry when the Haltung keeps one', () => {
    expect(resolveDefenseCondition({ dodge: false, parry: true })).toMatchObject({
      tone: 'severe',
      active: true,
      effectKey: 'TNO.Status.Effect.NoDodgeParryLeft',
    });
  });

  it('reports no defence at all when the Haltung drops both', () => {
    expect(
      resolveDefenseCondition({ dodge: false, parry: false, stanceLabelKey: 'TNO.Combat.Stance.Open' })
    ).toMatchObject({
      active: true,
      effectKey: 'TNO.Status.Effect.NoDodge',
      stanceLabelKey: 'TNO.Combat.Stance.Open',
      override: null,
      manual: false,
    });
  });

  it('treats a missing defence state as permitted rather than blocked', () => {
    expect(resolveDefenseCondition()).toMatchObject({ active: false });
  });
});

describe('resolveConditions', () => {
  const all = (damage, state) =>
    resolveConditions(resolveDamage(damage, abilities.str.base), abilities, {}, state);
  const unencumbered = { state: 'ok', used: 0, capacity: 10 };

  it('keeps the derived conditions out of the damage raster', () => {
    const resolved = all(
      { blunt: 0, sharp: 0 },
      {
        carry: { state: 'crawlOnly', used: 12, capacity: 10 },
        armor: { penalty: true, sv: 11.5, strength: 2 },
        defense: { dodge: false, parry: false },
      }
    );

    expect(resolved.items.map((item) => item.key)).toEqual(
      expect.arrayContaining(['overloaded', 'armorTooHeavy', 'noDodge'])
    );
    expect(resolved.rows.flat().map((item) => item.key)).toEqual([
      'bluntCore',
      'bluntLegs',
      'bluntArms',
      'sharpCore',
      'sharpLegs',
      'sharpArms',
    ]);
  });

  it('lists an active load among the active conditions, severe before mild', () => {
    const resolved = all(
      { blunt: 4, sharp: 4 },
      { carry: { state: 'crawlOnly', used: 12, capacity: 10 } }
    );
    const tones = resolved.active.map((item) => item.tone);

    expect(resolved.active.map((item) => item.key)).toContain('overloaded');
    expect(tones.indexOf('mild')).toBeGreaterThan(tones.lastIndexOf('severe'));
    expect(resolved.active.find((item) => item.key === 'overloaded').tone).toBe('severe');
  });

  it('appends a mild load behind the damage warnings', () => {
    const resolved = all(
      { blunt: 4, sharp: 4 },
      { carry: { state: 'noSprint', used: 5, capacity: 10 } }
    );
    expect(resolved.active.at(-1).key).toBe('overloaded');
  });

  it('sorts a blocked Ausweichen with the severe entries and armour with the mild', () => {
    const resolved = all(
      { blunt: 4, sharp: 4 },
      {
        carry: unencumbered,
        armor: { penalty: true, sv: 11.5, strength: 2 },
        defense: { dodge: false, parry: false },
      }
    );
    const keys = resolved.active.map((item) => item.key);

    expect(keys.indexOf('noDodge')).toBeLessThan(keys.indexOf('bluntCore'));
    expect(keys.indexOf('armorTooHeavy')).toBeGreaterThan(keys.indexOf('bluntCore'));
    expect(resolved.active.map((item) => item.tone)).toEqual([
      ...Array(4).fill('severe'),
      ...Array(4).fill('mild'),
    ]);
  });

  it('names a consequence for every active condition', () => {
    const resolved = all(
      { blunt: 4, sharp: 4 },
      {
        carry: { state: 'crawlOnly', used: 12, capacity: 10 },
        armor: { penalty: true, sv: 11.5, strength: 2 },
        defense: { dodge: false, parry: false },
      }
    );

    expect(resolved.active).toHaveLength(9);
    expect(resolved.active.every((item) => item.effectKey)).toBe(true);
  });

  it('keeps a damage light\'s consequence readable while it is off, unlike a derived one', () => {
    const resolved = all(
      { blunt: 0, sharp: 0 },
      { carry: unencumbered, armor: { penalty: false }, defense: { dodge: true } }
    );
    const byKey = new Map(resolved.items.map((item) => [item.key, item]));

    // The raster shows all six lights whether lit or not, so an unlit one still
    // has to answer "what would this do to me".
    expect(byKey.get('sharpCore').effectKey).toBe('TNO.Status.Effect.SharpCore');
    // A load that is not there has no single answer to the same question.
    expect(byKey.get('overloaded').effectKey).toBe(null);
  });

  it('leaves the collection empty when every derived state is fine', () => {
    const resolved = all(
      { blunt: 0, sharp: 0 },
      {
        carry: unencumbered,
        armor: { penalty: false, sv: 2, strength: 3 },
        defense: { dodge: true, parry: true },
      }
    );
    expect(resolved.hasActive).toBe(false);
    expect(resolved.active).toEqual([]);
  });
});

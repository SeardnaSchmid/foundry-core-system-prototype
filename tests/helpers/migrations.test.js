import { describe, it, expect, beforeEach } from 'vitest';
import { MIGRATIONS, migrateWorld } from '../../module/helpers/migrations.mjs';

/**
 * The migration steps are the only code in this system that can permanently
 * damage a published world: each runs once, rewrites documents in place, and
 * has no undo. They also reach for Foundry globals, which is why they went
 * untested — so the globals are stubbed here rather than the steps refactored,
 * keeping what ships identical to what is covered.
 *
 * The fakes implement only what the steps actually use, but they implement it
 * faithfully: dotted update paths, `-=key` deletion, and the `_source` /
 * prepared-data split that `migrateItemTypesToRoles` explicitly depends on.
 */

/** Apply one Foundry-style update object: dotted paths, `-=key` deletes. */
function applyUpdate(target, changes) {
  for (const [path, value] of Object.entries(changes)) {
    const parts = path.split('.');
    const last = parts.pop();
    let node = target;
    for (const part of parts) {
      node[part] ??= {};
      node = node[part];
    }
    if (last.startsWith('-=')) delete node[last.slice(2)];
    else node[last] = value;
  }
}

/**
 * A stand-in for an embedded Item.
 *
 * `prepared` is what `template.json` would have layered on top of the stored
 * source — the distinction the role migration turns on, since a schema default
 * makes every item look already-migrated in prepared data.
 */
function makeItem({ type = 'item', name = 'Ding', system = {}, prepared = null }) {
  const source = { system: structuredClone(system) };
  const item = {
    name,
    type,
    _source: source,
    system: prepared ? { ...structuredClone(system), ...structuredClone(prepared) } : source.system,
    updates: [],
    async update(changes) {
      this.updates.push(changes);
      applyUpdate(this, changes);
      if (this._source.system !== this.system) applyUpdate(this._source, changes);
    },
  };
  return item;
}

function makeActor({ type = 'character', system = {}, items = [] }) {
  return {
    type,
    system,
    items,
    updates: [],
    async update(changes) {
      this.updates.push(changes);
      applyUpdate(this, changes);
    },
  };
}

/** Install the Foundry globals the steps reach for. */
function stubFoundry({ actors = [], items = [], version = '0.31.0', isGM = true, stored = '0.0.0' } = {}) {
  const settings = new Map([['tno.systemMigrationVersion', stored]]);
  const notifications = [];

  globalThis.foundry = {
    utils: {
      isEmpty: (value) => !value || Object.keys(value).length === 0,
      objectsEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      escapeHTML: (value) =>
        String(value).replace(/[&<>"']/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        ),
      isNewerVersion: (a, b) => {
        const parse = (v) => String(v).split('.').map(Number);
        const [x, y] = [parse(a), parse(b)];
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
          const diff = (x[i] ?? 0) - (y[i] ?? 0);
          if (diff !== 0) return diff > 0;
        }
        return false;
      },
    },
  };

  globalThis.game = {
    actors,
    items,
    system: { version },
    user: { isGM },
    i18n: { localize: (k) => k, format: (k) => k },
    settings: {
      get: (scope, key) => settings.get(`${scope}.${key}`),
      set: async (scope, key, value) => settings.set(`${scope}.${key}`, value),
    },
  };

  globalThis.ui = { notifications: { info: (m) => notifications.push(m) } };

  globalThis.CONFIG = {
    TNO: {
      skillCategories: { combat: 'x', general: 'x' },
      abilities: { str: 'x', wil: 'x' },
    },
  };

  return { settings, notifications };
}

/** Look a step up by the version it is scheduled under. */
const step = (version, index = 0) =>
  MIGRATIONS.filter((m) => m.version === version)[index].migrate;

beforeEach(() => {
  delete globalThis.game;
  delete globalThis.ui;
  delete globalThis.foundry;
  delete globalThis.CONFIG;
});

/* -------------------------------------------------------------------------- */

describe('migrateWeightToSlots (0.25.0)', () => {
  it('renames weight to slots, carrying the value over untouched', async () => {
    const item = makeItem({ system: { weight: 3 } });
    stubFoundry({ items: [item] });

    await step('0.25.0')();

    expect(item.system.slots).toBe(3);
    expect(item.system.weight).toBeUndefined();
  });

  it('leaves an already-migrated slots value alone and drops the stale weight', async () => {
    const item = makeItem({ system: { weight: 3, slots: 1 } });
    stubFoundry({ items: [item] });

    await step('0.25.0')();

    expect(item.system.slots).toBe(1);
    expect(item.system.weight).toBeUndefined();
  });

  it('is idempotent — a second pass writes nothing', async () => {
    const item = makeItem({ system: { weight: 2 } });
    stubFoundry({ items: [item] });

    await step('0.25.0')();
    await step('0.25.0')();

    expect(item.updates).toHaveLength(1);
  });

  it('reaches items embedded on actors, not just the world directory', async () => {
    const embedded = makeItem({ system: { weight: 4 } });
    stubFoundry({ actors: [makeActor({ items: [embedded] })] });

    await step('0.25.0')();

    expect(embedded.system.slots).toBe(4);
  });

  it('still touches only plain items, preserving what 0.25.0 published', async () => {
    // Worlds that already ran this step must not see it behave differently on
    // a re-run; the wider sweep is a separate, later step.
    const legacy = makeItem({ type: 'armor', system: { weight: 2 } });
    stubFoundry({ items: [legacy] });

    await step('0.25.0')();

    expect(legacy.updates).toHaveLength(0);
    expect(legacy.system.weight).toBe(2);
  });
});

describe('migrateWeightToSlotsLegacyTypes (0.31.0)', () => {
  it('finishes the rename for the armor and weapon types 0.25.0 skipped', async () => {
    const armour = makeItem({ type: 'armor', system: { weight: 2 } });
    const weapon = makeItem({ type: 'weapon', system: { weight: 1 } });
    stubFoundry({ items: [armour, weapon] });

    await step('0.31.0', 0)();

    expect(armour.system.slots).toBe(2);
    expect(weapon.system.slots).toBe(1);
    expect(armour.system.weight).toBeUndefined();
  });

  it('leaves types that are not gear alone', async () => {
    const feature = makeItem({ type: 'feature', system: { weight: 9 } });
    stubFoundry({ items: [feature] });

    await step('0.31.0', 0)();

    expect(feature.updates).toHaveLength(0);
  });

  it('is idempotent', async () => {
    const armour = makeItem({ type: 'armor', system: { weight: 2 } });
    stubFoundry({ items: [armour] });

    await step('0.31.0', 0)();
    await step('0.31.0', 0)();

    expect(armour.updates).toHaveLength(1);
  });
});

describe('migrateItemTypesToRoles (0.27.0)', () => {
  it('writes the role the old type stood for', async () => {
    const weapon = makeItem({ type: 'weapon', system: {} });
    const armour = makeItem({ type: 'armor', system: {} });
    const plain = makeItem({ type: 'item', system: {} });
    stubFoundry({ items: [weapon, armour, plain] });

    await step('0.27.0')();

    expect(weapon.system.roles).toEqual({ weapon: true, armor: false, consumable: false });
    expect(armour.system.roles).toEqual({ weapon: false, armor: true, consumable: false });
    expect(plain.system.roles).toEqual({ weapon: false, armor: false, consumable: false });
  });

  it('reads the stored source, so a schema default cannot fake a migration', async () => {
    // template.json supplies `roles` to everything it builds; only `_source`
    // can say whether this document was actually migrated.
    const item = makeItem({
      type: 'weapon',
      system: {},
      prepared: { roles: { weapon: false, armor: false, consumable: false } },
    });
    stubFoundry({ items: [item] });

    await step('0.27.0')();

    expect(item._source.system.roles).toEqual({ weapon: true, armor: false, consumable: false });
  });

  it('skips a document that genuinely carries stored roles', async () => {
    const item = makeItem({ type: 'weapon', system: { roles: { weapon: true, armor: false, consumable: false } } });
    stubFoundry({ items: [item] });

    await step('0.27.0')();

    expect(item.updates).toHaveLength(0);
  });

  it('drops the boilerplate formula field', async () => {
    const item = makeItem({ type: 'item', system: { formula: 'd20 + @str.value' } });
    stubFoundry({ items: [item] });

    await step('0.27.0')();

    expect(item.system.formula).toBeUndefined();
  });

  it('preserves the legacy weapon trio as prose instead of guessing at it', async () => {
    const item = makeItem({
      type: 'weapon',
      system: { dice: '2W6+3', damage: 'schwer', range: 'kurz', description: '<p>alt</p>' },
    });
    stubFoundry({ items: [item] });

    await step('0.27.0')();

    expect(item.system.description).toContain('alt');
    expect(item.system.description).toContain('2W6+3');
    expect(item.system.description).toContain('schwer');
    expect(item.system.dice).toBeUndefined();
    expect(item.system.damage).toBeUndefined();
  });

  it('escapes the carried-over text rather than injecting it raw', async () => {
    const item = makeItem({ type: 'weapon', system: { damage: '<script>x</script>' } });
    stubFoundry({ items: [item] });

    await step('0.27.0')();

    expect(item.system.description).not.toContain('<script>');
    expect(item.system.description).toContain('&lt;script&gt;');
  });

  it('cannot append the same note twice', async () => {
    const item = makeItem({ type: 'weapon', system: { damage: '2W6' } });
    stubFoundry({ items: [item] });

    await step('0.27.0')();
    const after = item.system.description;
    await step('0.27.0')();

    expect(item.system.description).toBe(after);
  });
});

describe('migrateZeroedNullableBands (0.31.0)', () => {
  it('clears zeroed range bands, which the schema default wrongly supplied', async () => {
    const weapon = makeItem({
      type: 'item',
      system: { roles: { weapon: true, armor: false, consumable: false }, range: { sn: 0, near: 0, mid: 0, far: 0, sf: 0 } },
    });
    stubFoundry({ items: [weapon] });

    await step('0.31.0', 1)();

    expect(weapon.system.range).toEqual({ sn: null, near: null, mid: null, far: null, sf: null });
  });

  it('leaves an authored band alone, whatever its sign', async () => {
    const weapon = makeItem({
      type: 'item',
      system: { roles: { weapon: true, armor: false, consumable: false }, range: { sn: -3, near: 0, mid: 3, far: 0, sf: 0 } },
    });
    stubFoundry({ items: [weapon] });

    await step('0.31.0', 1)();

    expect(weapon.system.range.sn).toBe(-3);
    expect(weapon.system.range.mid).toBe(3);
    expect(weapon.system.range.near).toBeNull();
  });

  it('clears a zeroed recoil', async () => {
    const weapon = makeItem({
      type: 'item',
      system: { roles: { weapon: true, armor: false, consumable: false }, rb: 0 },
    });
    stubFoundry({ items: [weapon] });

    await step('0.31.0', 1)();

    expect(weapon.system.rb).toBeNull();
  });

  it('leaves items without the weapon role untouched', async () => {
    const armour = makeItem({
      type: 'item',
      system: { roles: { weapon: false, armor: true, consumable: false }, rb: 0, range: { sn: 0 } },
    });
    stubFoundry({ items: [armour] });

    await step('0.31.0', 1)();

    expect(armour.updates).toHaveLength(0);
  });

  it('is idempotent', async () => {
    const weapon = makeItem({
      type: 'item',
      system: { roles: { weapon: true, armor: false, consumable: false }, rb: 0 },
    });
    stubFoundry({ items: [weapon] });

    await step('0.31.0', 1)();
    await step('0.31.0', 1)();

    expect(weapon.updates).toHaveLength(1);
  });
});

describe('migrateNormalizeCustomSkills (0.16.0)', () => {
  it('falls back to safe defaults for a category and attribute that no longer exist', async () => {
    const actor = makeActor({
      system: { skills: { 'custom-x': { value: 2, xp: 1, custom: { label: 'X', category: 'gone', attribute: 'gone' } } } },
    });
    stubFoundry({ actors: [actor] });

    await step('0.16.0')();

    expect(actor.system.skills['custom-x'].custom.category).toBe('general');
    expect(actor.system.skills['custom-x'].custom.attribute).toBe('wil');
  });

  it('coerces a stringified rank and xp back to numbers', async () => {
    const actor = makeActor({
      system: { skills: { 'custom-x': { value: '3', xp: '4', custom: { label: 'X', category: 'combat', attribute: 'str' } } } },
    });
    stubFoundry({ actors: [actor] });

    await step('0.16.0')();

    expect(actor.system.skills['custom-x'].value).toBe(3);
    expect(actor.system.skills['custom-x'].xp).toBe(4);
  });

  it('never touches a built-in skill', async () => {
    const actor = makeActor({ system: { skills: { brawling: { value: '2', xp: 0 } } } });
    stubFoundry({ actors: [actor] });

    await step('0.16.0')();

    expect(actor.updates).toHaveLength(0);
  });

  it('writes nothing when every custom skill is already well-formed', async () => {
    const actor = makeActor({
      system: { skills: { 'custom-x': { value: 1, xp: 0, custom: { label: 'X', category: 'combat', attribute: 'str' } } } },
    });
    stubFoundry({ actors: [actor] });

    await step('0.16.0')();

    expect(actor.updates).toHaveLength(0);
  });

  it('leaves non-character actors alone', async () => {
    const npc = makeActor({ type: 'npc', system: { skills: { 'custom-x': { value: '1', custom: {} } } } });
    stubFoundry({ actors: [npc] });

    await step('0.16.0')();

    expect(npc.updates).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe('migrateWorld', () => {
  it('does nothing at all for a non-GM', async () => {
    const item = makeItem({ system: { weight: 2 } });
    const { settings } = stubFoundry({ items: [item], isGM: false, stored: '0.0.0' });

    await migrateWorld();

    expect(item.updates).toHaveLength(0);
    expect(settings.get('tno.systemMigrationVersion')).toBe('0.0.0');
  });

  it('runs only the steps newer than the stored version', async () => {
    // Stored at 0.30.0, so the two 0.31.0 steps are pending and everything
    // older is not. A legacy weapon discriminates between them: the 0.31.0
    // sweep must give it `slots`, while the 0.27.0 role step must leave it
    // without `roles` entirely.
    const item = makeItem({ type: 'weapon', system: { weight: 2 } });
    stubFoundry({ items: [item], stored: '0.30.0' });

    await migrateWorld();

    expect(item.system.slots).toBe(2);
    expect(item.system.roles).toBeUndefined();
  });

  it('runs nothing once the stored version covers every step', async () => {
    const item = makeItem({ type: 'weapon', system: { weight: 2 } });
    stubFoundry({ items: [item], stored: '0.31.0' });

    await migrateWorld();

    expect(item.updates).toHaveLength(0);
  });

  it('pins past the highest migration version, not merely the system version', async () => {
    // The regression this guards: a step scheduled for a release ahead of the
    // installed system stayed permanently pending, so it — and its
    // notification — re-ran on every single load.
    const { settings, notifications } = stubFoundry({ version: '0.30.0', stored: '0.0.0' });

    await migrateWorld();
    const pinned = settings.get('tno.systemMigrationVersion');
    notifications.length = 0;

    await migrateWorld();

    expect(pinned).toBe('0.31.0');
    expect(notifications).toHaveLength(0);
  });

  it('announces a run only when something was actually pending', async () => {
    const { notifications } = stubFoundry({ stored: '99.0.0' });

    await migrateWorld();

    expect(notifications).toHaveLength(0);
  });
});

describe('MIGRATIONS ordering', () => {
  it('is in ascending version order, which is what makes the gate correct', async () => {
    const parse = (v) => v.split('.').map(Number);
    const versions = MIGRATIONS.map((m) => parse(m.version));
    for (let i = 1; i < versions.length; i++) {
      const [prev, next] = [versions[i - 1], versions[i]];
      const ascending =
        next[0] > prev[0] ||
        (next[0] === prev[0] && next[1] > prev[1]) ||
        (next[0] === prev[0] && next[1] === prev[1] && next[2] >= prev[2]);
      expect(ascending, `${MIGRATIONS[i - 1].version} -> ${MIGRATIONS[i].version}`).toBe(true);
    }
  });
});

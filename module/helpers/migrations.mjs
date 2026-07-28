/**
 * Ordered, version-gated migration steps. Each step must be idempotent,
 * since it may run again on a world that already applied it (e.g. if a
 * later step is added and both run in the same batch). Append new steps to
 * the end, in ascending version order, and never edit or remove executed
 * steps that are already published.
 * @type {Array<{version: string, migrate: () => Promise<void>}>}
 */
export const MIGRATIONS = [
  { version: '0.16.0', migrate: migrateNormalizeCustomSkills },
  { version: '0.25.0', migrate: migrateWeightToSlots },
];

/**
 * Register the hidden world setting that tracks which migrations have
 * already run. Call once from the init hook.
 */
export function registerMigrationSettings() {
  game.settings.register('tno', 'systemMigrationVersion', {
    scope: 'world',
    config: false,
    type: String,
    default: '0.0.0',
  });
}

/**
 * Run any migration steps newer than the world's stored migration version,
 * then pin the stored version to the current system version. GM-only: a
 * world-scoped setting must only ever be written by one client, and only
 * the GM is guaranteed to be present. Safe to call on every `ready` — a
 * world with nothing pending does no work beyond a settings read/write.
 */
export async function migrateWorld() {
  if (!game.user.isGM) return;

  const stored = game.settings.get('tno', 'systemMigrationVersion');
  const pending = MIGRATIONS.filter((m) => foundry.utils.isNewerVersion(m.version, stored));

  if (pending.length) {
    ui.notifications.info(game.i18n.format('TNO.Migration.Started', { version: game.system.version }));
    for (const migration of pending) await migration.migrate();
    ui.notifications.info(game.i18n.localize('TNO.Migration.Completed'));
  }

  if (stored !== game.system.version) {
    await game.settings.set('tno', 'systemMigrationVersion', game.system.version);
  }
}

/**
 * Normalize every actor's custom skill entries: fall back to safe defaults
 * for a category/attribute that no longer exists in CONFIG.TNO, and
 * coerce rank/xp back to numbers. Only writes actors that actually need a
 * change, and only ever touches `.custom` skill entries.
 */
async function migrateNormalizeCustomSkills() {
  for (const actor of game.actors) {
    if (actor.type !== 'character') continue;

    const update = {};
    for (const [key, entry] of Object.entries(actor.system.skills ?? {})) {
      if (!entry?.custom) continue;

      const custom = entry.custom;
      const fixed = {
        label: typeof custom.label === 'string' && custom.label.trim() ? custom.label : key,
        category: custom.category in CONFIG.TNO.skillCategories ? custom.category : 'general',
        attribute: custom.attribute in CONFIG.TNO.abilities ? custom.attribute : 'wil',
      };
      const value = Number(entry.value) || 0;
      const xp = Number(entry.xp) || 0;

      const changed =
        !foundry.utils.objectsEqual(fixed, {
          label: custom.label,
          category: custom.category,
          attribute: custom.attribute,
        }) ||
        value !== entry.value ||
        xp !== entry.xp;

      if (changed) {
        update[`system.skills.${key}.custom`] = fixed;
        update[`system.skills.${key}.value`] = value;
        update[`system.skills.${key}.xp`] = xp;
      }
    }

    if (!foundry.utils.isEmpty(update)) await actor.update(update);
  }
}

/**
 * Rename `system.weight` to `system.slots` on every gear item. The field
 * always held Inventarslots rather than a mass — the rules never weigh
 * anything — so this is a rename, not a conversion, and the value carries
 * over untouched.
 *
 * Idempotent by construction: an item that no longer has a `weight` key is
 * skipped, and re-running after the unset therefore does nothing. Where both
 * keys somehow exist, the already-migrated `slots` wins and the stale
 * `weight` is simply dropped.
 */
async function migrateWeightToSlots() {
  const migrate = async (item) => {
    if (item.type !== 'item') return;
    const weight = item.system?.weight;
    if (weight === undefined) return;

    const update = { 'system.-=weight': null };
    if (item.system.slots === undefined) update['system.slots'] = Number(weight) || 0;
    await item.update(update);
  };

  for (const item of game.items) await migrate(item);
  for (const actor of game.actors) {
    for (const item of actor.items) await migrate(item);
  }
}

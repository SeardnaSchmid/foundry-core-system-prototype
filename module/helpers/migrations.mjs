/**
 * Ordered, version-gated migration steps. Each step must be idempotent,
 * since it may run again on a world that already applied it (e.g. if a
 * later step is added and both run in the same batch). Append new steps to
 * the end, in ascending version order, and never edit or remove executed
 * steps that are already published.
 * @type {Array<{version: string, migrate: () => Promise<void>}>}
 */
export const MIGRATIONS = [{ version: '0.16.0', migrate: migrateNormalizeCustomSkills }];

/**
 * Register the hidden world setting that tracks which migrations have
 * already run. Call once from the init hook.
 */
export function registerMigrationSettings() {
  game.settings.register('joster', 'systemMigrationVersion', {
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

  const stored = game.settings.get('joster', 'systemMigrationVersion');
  const pending = MIGRATIONS.filter((m) => foundry.utils.isNewerVersion(m.version, stored));

  if (pending.length) {
    ui.notifications.info(game.i18n.format('JOSTER.Migration.Started', { version: game.system.version }));
    for (const migration of pending) await migration.migrate();
    ui.notifications.info(game.i18n.localize('JOSTER.Migration.Completed'));
  }

  if (stored !== game.system.version) {
    await game.settings.set('joster', 'systemMigrationVersion', game.system.version);
  }
}

/**
 * Normalize every actor's custom skill entries: fall back to safe defaults
 * for a category/attribute that no longer exists in CONFIG.JOSTER, and
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
        category: custom.category in CONFIG.JOSTER.skillCategories ? custom.category : 'general',
        attribute: custom.attribute in CONFIG.JOSTER.abilities ? custom.attribute : 'wil',
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

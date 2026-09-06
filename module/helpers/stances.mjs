/**
 * One Haltung, as any surface displays it.
 *
 * `CONFIG.TNO.stances` holds the raw definition — an i18n key, an icon, a band
 * and the defences it permits. Turning that into something readable is the same
 * job on the character sheet's banner, in its picker, and in the combat
 * tracker's row, so it lives here rather than in whichever of them needed it
 * first. `helpers/` may not reach into `sheets/` or `apps/`, but both may reach
 * in here, which is what lets the three share one fallback rule.
 *
 * The Haltung *rules* — which one an actor is in, and what it permits — stay in
 * [`combat-actions.mjs`](combat-actions.mjs). This module only reads.
 */

/**
 * One Haltung as the banner, the picker and the tracker display it.
 *
 * Falls back to the default Haltung for an unknown key, so a sheet whose stored
 * stance predates a config change still shows something rather than an empty
 * pill.
 * @param {string} key
 * @returns {{key: string, group: string, label: string, icon: string, effect: string, defenses: string}}
 */
export function stanceEntry(key) {
  const stances = CONFIG.TNO.stances;
  const resolved = key in stances ? key : CONFIG.TNO.defaultStance;
  const stance = stances[resolved];
  const defenses = stance.defenses.map((defense) => game.i18n.localize(
    defense === 'parry' ? 'TNO.Combat.Parry' : 'TNO.Combat.Dodge'
  ));
  return {
    key: resolved,
    // The band the Haltung belongs to. Carried on the entry rather than looked
    // up beside it because it is what the tracker colours a row by: four bands
    // are scannable down a list where nine names are not.
    group: stance.group,
    label: game.i18n.localize(stance.label),
    icon: stance.icon,
    effect: game.i18n.localize(stance.effect),
    // The single question the defence side of an exchange asks the Haltung.
    defenses: defenses.length
      ? defenses.join(' · ')
      : game.i18n.localize('TNO.Combat.StanceDefenseNone'),
  };
}

/**
 * The nine Haltungen in their bands, with the one in force marked.
 * @param {string} current  The Haltung in force; resolved through {@link stanceEntry}
 * @returns {Array<{label: string, stances: Array<object>}>}
 */
export function stancePopoverGroups(current) {
  const currentKey = stanceEntry(current).key;
  const entries = Object.keys(CONFIG.TNO.stances).map((key) => ({
    ...stanceEntry(key),
    selected: key === currentKey,
  }));
  return CONFIG.TNO.stanceGroups
    .map((group) => ({
      label: game.i18n.localize(group.label),
      stances: entries.filter((entry) => entry.group === group.key),
    }))
    .filter((group) => group.stances.length);
}

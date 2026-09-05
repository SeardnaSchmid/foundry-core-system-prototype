/**
 * Where the gear in a world actually came from.
 *
 * The GM question this answers is "what is in play that I did not ship?" — a
 * homebrew weapon someone typed in by hand looks exactly like a catalogue one
 * on an actor sheet, and there is otherwise no surface that tells them apart.
 *
 * Provenance only. Grouping items by role, choosing columns, building cells and
 * sorting are all `helpers/item-table.mjs` — the same component the character
 * sheet's Inventar ledger is built from, so the overview is that table with two
 * columns added rather than a second table that could disagree with it.
 *
 * Everything here is pure and global-free, like the rest of `helpers/`, so the
 * audit can be tested without a world. `apps/item-overview.mjs` is what walks
 * `game.actors`/`game.items` and localizes what comes back.
 */

/** The compendium this system ships, as `<scope>.<name>`. */
export const CATALOGUE_PACK = 'tno.gear';

/**
 * Origin kinds and the labels that name them.
 * @type {Record<string, string>}
 */
export const ORIGINS = {
  homebrew: 'TNO.ItemOverview.Origin.Homebrew',
  foreign: 'TNO.ItemOverview.Origin.Foreign',
  catalogue: 'TNO.ItemOverview.Origin.Catalogue',
};

/**
 * The pack half of a compendium UUID, or null for anything else.
 *
 * A compendium UUID is `Compendium.<scope>.<pack>.<DocumentName>.<id>`, so the
 * pack is the two segments after the prefix. Parsed rather than matched against
 * a list of installed packs on purpose: an item whose source module has since
 * been uninstalled still knows where it came from, and saying so is more useful
 * to a GM than calling it homebrew.
 * @param {string|null|undefined} uuid
 * @returns {string|null}
 */
export function compendiumPackOf(uuid) {
  if (typeof uuid !== 'string') return null;
  const parts = uuid.split('.');
  if (parts.length < 5 || parts[0] !== 'Compendium') return null;
  return `${parts[1]}.${parts[2]}`;
}

/**
 * How an item got into this world.
 *
 * Reads `_stats.compendiumSource`, which core stamps in both directions that
 * matter: `WorldCollection#fromCompendium` on import, and
 * `ClientDocument.fromDropData` when a pack entry is dragged onto an actor. An
 * item with none was made in this world — typed in by hand, or duplicated from
 * one that was, which core records separately as `duplicateSource`.
 * @param {object} stats  A document's `_stats`.
 * @param {{cataloguePack?: string}} [options]
 * @returns {{kind: string, labelKey: string, pack: string|null}}
 */
export function itemOrigin(stats, { cataloguePack = CATALOGUE_PACK } = {}) {
  const pack = compendiumPackOf(stats?.compendiumSource);
  if (!pack) return { kind: 'homebrew', labelKey: ORIGINS.homebrew, pack: null };
  if (pack === cataloguePack) return { kind: 'catalogue', labelKey: ORIGINS.catalogue, pack };
  return { kind: 'foreign', labelKey: ORIGINS.foreign, pack };
}

/**
 * How many items fall in each origin, for the toolbar's counts.
 * @param {Array<object>} stats  One `_stats` per item.
 * @param {{cataloguePack?: string}} [options]
 * @returns {{total: number, homebrew: number, foreign: number, catalogue: number}}
 */
export function auditTally(stats, options = {}) {
  const tally = { total: 0, homebrew: 0, foreign: 0, catalogue: 0 };
  for (const entry of stats ?? []) {
    tally.total += 1;
    tally[itemOrigin(entry, options).kind] += 1;
  }
  return tally;
}

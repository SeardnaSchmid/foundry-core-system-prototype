/**
 * The Inventar tab's ledger, as a grouped and sortable table.
 *
 * The tab lists every object the character owns exactly once, whatever state it
 * is in — it is the complete ledger rather than another carry-state view.
 * What this file adds is a way to *read* that list: rows
 * grouped by the role each piece has taken on, and a column set the player
 * picks from the whole gear schema instead of the four fields the flat list
 * used to show.
 *
 * Two rules the rest of the system already lives by, restated because a table
 * is where they are easiest to break:
 *
 *  - **Blank is not zero.** `dk`, `rd`, `rh`, `rw`, `ra`, `price` and the range
 *    bands are nullable on purpose — "not filled in yet" and "the lowest step"
 *    are different answers. Every read goes through `isAuthoredNumber`, and a
 *    blank cell reports `value: null` rather than 0.
 *  - **A column that cannot apply is not the same as an empty one.** An armour
 *    column on a weapon row reports `applies: false`, which the sheet paints as
 *    n/a. Nothing is hidden per row: the grid keeps its shape down the list.
 *
 * Sorting here is a **view** concern and never writes `item.sort`. That field
 * is the order the Basics slot bands pack from, so letting a header click
 * rewrite it would silently repack a raster the player arranged by hand in a
 * different tab.
 *
 * Deliberately free of Foundry globals, like `items.mjs` and `inventory.mjs`
 * which it composes: it returns raw values and an ordering, and the sheet turns
 * those into words. A locale collator is therefore injected rather than built
 * from `game.i18n` here.
 */

import {
  ITEM_ROLES,
  armorZones,
  hasRole,
  isAuthoredNumber,
  itemRoles,
  missingRequired,
  usesMelee,
  usesRanged,
  weaponAttribute,
  weaponUse,
  ARMOR_SUIT_ZONE,
} from './items.mjs';
import { itemSlotCost } from './inventory.mjs';

/**
 * The group a row falls into when it carries no role at all. Roles are
 * mutually exclusive, so every item lands in exactly one group and "no role"
 * has to be a group of its own rather than a residue swept out of the table.
 * @type {string}
 */
export const PLAIN_ROLE = 'plain';

/**
 * Group order: the roles first, in the order the item sheet's chips show them,
 * and the plain objects last. A player scanning this tab is looking for their
 * weapons or their armour; the unclassified rest is what is left when they are
 * not.
 * @type {Array<string>}
 */
export const ITEM_TABLE_GROUPS = [...ITEM_ROLES, PLAIN_ROLE];

/**
 * How a cell's value is shaped, so the sheet knows what to write without
 * having to re-derive it from the column key.
 *
 *  - `number` — a plain figure.
 *  - `signed` — a figure whose sign carries the meaning (HH), so 0 reads as +0.
 *  - `choice` — a key into one of the CONFIG.TNO label maps.
 *  - `pair`   — two figures shown together (HH active / passive).
 *  - `fields` — a list of field keys (the missing-values warning).
 * @type {Object<string, string>}
 */
export const CELL_KINDS = {
  NUMBER: 'number',
  SIGNED: 'signed',
  CHOICE: 'choice',
  PAIR: 'pair',
  FIELDS: 'fields',
};

/**
 * Every column the picker offers, in catalogue order.
 *
 * `section` groups them in the picker; `appliesTo` is the role a row must carry
 * for the column to mean anything, `null` meaning "every object". `labelKey` is
 * the short caption in the header, `hintKey` the long name behind it — both are
 * localization keys the sheet resolves, and nearly all of them already existed
 * for the item sheet and the compact card.
 *
 * The name column is not in here: it is the row's identity rather than one of
 * its values, so it can never be switched off and never needs picking.
 * @type {Array<{key: string, section: string, labelKey: string, hintKey: string,
 *   kind: string, appliesTo: string|null, numeric: boolean}>}
 */
export const ITEM_TABLE_COLUMNS = [
  // What every object has, whatever it is.
  { key: 'slots', section: 'general', labelKey: 'TNO.Item.Cap.Slots', hintKey: 'TNO.Inventory.Slots', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },
  { key: 'quantity', section: 'general', labelKey: 'TNO.Item.Cap.Quantity', hintKey: 'TNO.Inventory.Quantity', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },
  { key: 'footprint', section: 'general', labelKey: 'TNO.Item.Cap.Footprint', hintKey: 'TNO.Item.Overview.Footprint', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },
  { key: 'sv', section: 'general', labelKey: 'TNO.Item.Cap.Sv', hintKey: 'TNO.Armor.Sv', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },
  { key: 'state', section: 'general', labelKey: 'TNO.ItemTable.Cap.State', hintKey: 'TNO.ItemTable.Hint.State', kind: CELL_KINDS.CHOICE, appliesTo: null, numeric: false },
  { key: 'incomplete', section: 'general', labelKey: 'TNO.ItemTable.Cap.Incomplete', hintKey: 'TNO.ItemTable.Hint.Incomplete', kind: CELL_KINDS.FIELDS, appliesTo: null, numeric: true },

  // Acquisition facts. Deliberately absent from the compact play card, which is
  // read mid-roll; the ledger is exactly where they do belong.
  { key: 'price', section: 'trade', labelKey: 'TNO.Item.Cap.Price', hintKey: 'TNO.Item.Price', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },
  { key: 'value', section: 'trade', labelKey: 'TNO.Item.Cap.Value', hintKey: 'TNO.ItemTable.Hint.Value', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },
  { key: 'availability', section: 'trade', labelKey: 'TNO.Item.Cap.Availability', hintKey: 'TNO.Item.Availability', kind: CELL_KINDS.NUMBER, appliesTo: null, numeric: true },

  { key: 'use', section: 'weapon', labelKey: 'TNO.Weapons.Use.Label', hintKey: 'TNO.Weapons.Use.Label', kind: CELL_KINDS.CHOICE, appliesTo: 'weapon', numeric: false },
  { key: 'wa', section: 'weapon', labelKey: 'TNO.Weapons.AttributeShort', hintKey: 'TNO.Weapons.Attribute', kind: CELL_KINDS.CHOICE, appliesTo: 'weapon', numeric: false },
  { key: 'fv', section: 'weapon', labelKey: 'TNO.Item.Cap.Fv', hintKey: 'TNO.Item.Summary.SkillRequirement', kind: CELL_KINDS.NUMBER, appliesTo: 'weapon', numeric: true },
  { key: 'dk', section: 'weapon', labelKey: 'TNO.Item.Summary.Dk', hintKey: 'TNO.Weapons.Dk', kind: CELL_KINDS.NUMBER, appliesTo: 'weapon', numeric: true },
  { key: 'rd', section: 'weapon', labelKey: 'TNO.Weapons.RdShort', hintKey: 'TNO.Weapons.Rd', kind: CELL_KINDS.NUMBER, appliesTo: 'weapon', numeric: true },
  { key: 'rb', section: 'weapon', labelKey: 'TNO.Weapons.Rb', hintKey: 'TNO.Weapons.RbHint', kind: CELL_KINDS.NUMBER, appliesTo: 'weapon', numeric: true },
  { key: 'ss', section: 'weapon', labelKey: 'TNO.Weapons.Ss', hintKey: 'TNO.Weapons.SsHint', kind: CELL_KINDS.NUMBER, appliesTo: 'weapon', numeric: true },
  { key: 'ws', section: 'weapon', labelKey: 'TNO.Weapons.Ws', hintKey: 'TNO.Weapons.WsHint', kind: CELL_KINDS.NUMBER, appliesTo: 'weapon', numeric: true },
  { key: 'hh', section: 'weapon', labelKey: 'TNO.ItemTable.Cap.Hh', hintKey: 'TNO.Weapons.HhHint', kind: CELL_KINDS.PAIR, appliesTo: 'weapon', numeric: true },

  { key: 'zone', section: 'armor', labelKey: 'TNO.Armor.Zone.Label', hintKey: 'TNO.Armor.Zones', kind: CELL_KINDS.CHOICE, appliesTo: 'armor', numeric: false },
  { key: 'rh', section: 'armor', labelKey: 'TNO.Armor.RhShort', hintKey: 'TNO.Armor.Rh', kind: CELL_KINDS.NUMBER, appliesTo: 'armor', numeric: true },
  { key: 'rw', section: 'armor', labelKey: 'TNO.Armor.RwShort', hintKey: 'TNO.Armor.Rw', kind: CELL_KINDS.NUMBER, appliesTo: 'armor', numeric: true },
  { key: 'ra', section: 'armor', labelKey: 'TNO.Armor.RaShort', hintKey: 'TNO.Armor.Ra', kind: CELL_KINDS.NUMBER, appliesTo: 'armor', numeric: true },
];

/**
 * The picker's sections, in the order it lists them.
 * @type {Array<string>}
 */
export const ITEM_TABLE_SECTIONS = ['general', 'trade', 'weapon', 'armor'];

/**
 * The column the table falls back to when nothing else is asked for. It is not
 * one of the pickable columns — the name is always there — so it needs naming
 * separately for the sort key to be able to point at it.
 * @type {string}
 */
export const NAME_SORT_KEY = 'name';

/**
 * What a sheet shows before anyone has picked anything: what the piece costs,
 * how many of it there are, and what it takes to use — the three questions the
 * old flat list answered, minus the role column that grouping made redundant.
 * @type {{columns: Array<string>, sort: {key: string, dir: string}}}
 */
export const DEFAULT_ITEM_TABLE_CONFIG = {
  columns: ['slots', 'quantity', 'sv'],
  sort: { key: NAME_SORT_KEY, dir: 'asc' },
};

/** Column keys, for membership tests. */
const COLUMN_KEYS = new Set(ITEM_TABLE_COLUMNS.map((column) => column.key));

/**
 * Bring a stored layout back to something the table can render.
 *
 * The setting is client-scoped and hand-editable, and it outlives any column
 * this file might rename or drop, so an unknown key is dropped rather than
 * carried into a header the sheet cannot label. An empty selection falls back
 * to the default: a table of nothing but names is not a choice anyone makes on
 * purpose, and leaving it empty would hide the picker's own effect.
 *
 * The order is the catalogue's, not the order the boxes were ticked in — a
 * column set that reshuffles itself as it is edited is unreadable.
 *
 * @param {object} [stored]  Whatever was in the setting.
 * @returns {{columns: Array<string>, sort: {key: string, dir: string}}}
 */
export function normalizeItemTableConfig(stored) {
  const wanted = new Set(Array.isArray(stored?.columns) ? stored.columns : []);
  const columns = ITEM_TABLE_COLUMNS.filter((column) => wanted.has(column.key)).map((c) => c.key);

  const key = stored?.sort?.key;
  const sortKey = key === NAME_SORT_KEY || COLUMN_KEYS.has(key) ? key : NAME_SORT_KEY;
  const dir = stored?.sort?.dir === 'desc' ? 'desc' : 'asc';

  return {
    columns: columns.length ? columns : [...DEFAULT_ITEM_TABLE_CONFIG.columns],
    sort: { key: sortKey, dir },
  };
}

/**
 * Toggle one column in a stored selection, returning the normalized result.
 * Turning the last column off would leave a nameplate rather than a table, so
 * normalization puts the defaults back — which is also what the picker's boxes
 * then show.
 * @param {object} config
 * @param {string} key
 * @returns {{columns: Array<string>, sort: {key: string, dir: string}}}
 */
export function toggleItemTableColumn(config, key) {
  const current = normalizeItemTableConfig(config);
  if (!COLUMN_KEYS.has(key)) return current;
  const columns = current.columns.includes(key)
    ? current.columns.filter((column) => column !== key)
    : [...current.columns, key];
  return normalizeItemTableConfig({ ...current, columns });
}

/**
 * Which way a header click leaves the sort: a new column starts ascending, the
 * column already sorted flips. There is no third click back to "unsorted" —
 * the table is always in some order, and an order nobody chose is the one thing
 * a sort control should not be able to produce.
 * @param {object} config
 * @param {string} key
 * @returns {{key: string, dir: string}}
 */
export function nextItemTableSort(config, key) {
  const current = normalizeItemTableConfig(config).sort;
  if (key !== NAME_SORT_KEY && !COLUMN_KEYS.has(key)) return current;
  if (current.key !== key) return { key, dir: 'asc' };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

/** A finite number, or null when the field was never filled in. */
function authored(value) {
  return isAuthoredNumber(value) ? Number(value) : null;
}

/**
 * Which group a piece belongs to. Roles are mutually exclusive, so the first
 * one it carries is the only one it carries.
 * @param {object} item
 * @returns {string}
 */
export function itemGroupKey(item) {
  const roles = itemRoles(item);
  return ITEM_ROLES.find((role) => roles[role]) ?? PLAIN_ROLE;
}

/**
 * Whether a column says anything about this row.
 *
 * Three separate reasons a column can be n/a rather than blank, and they are
 * all rules rather than presentation:
 *
 *  - the column belongs to a role the piece has not taken on;
 *  - DK and RB are melee questions, RD is a ranged one, so only the use the
 *    weapon actually has answers them;
 *  - the Unterkleidung has no Rüstungshärte and covers no single location, so
 *    RH and RA are values a suit cannot have at all (see `missingRequired`,
 *    which makes the same exception).
 *
 * @param {object} column  One entry of ITEM_TABLE_COLUMNS.
 * @param {object} item
 * @returns {boolean}
 */
function columnApplies(column, item) {
  if (!column.appliesTo) return true;
  if (!hasRole(item, column.appliesTo)) return false;

  const system = item?.system ?? {};
  if (column.key === 'dk' || column.key === 'rb') return usesMelee(system);
  if (column.key === 'rd') return usesRanged(system);
  if (column.key === 'rh' || column.key === 'ra') {
    return !armorZones(item).includes(ARMOR_SUIT_ZONE);
  }
  return true;
}

/**
 * The raw value behind one column of one row, plus what it sorts by.
 *
 * `value` stays raw — a number, a key into a CONFIG label map, a pair, or a
 * list of field keys — because turning it into words needs `game.i18n`, which
 * this file deliberately cannot reach.
 *
 * @param {object} item  An item document (or plain object).
 * @param {string} key   A column key.
 * @param {{worn?: boolean}} [options]
 * @returns {{key: string, applies: boolean, value: *, sort: number|string|null}}
 */
export function columnCell(item, key, { worn = false } = {}) {
  const column = ITEM_TABLE_COLUMNS.find((entry) => entry.key === key);
  if (!column) return { key, applies: false, value: null, sort: null };
  if (!columnApplies(column, item)) return { key, applies: false, value: null, sort: null };

  const system = item?.system ?? {};
  const value = readValue(item, system, key, worn);
  return { key, applies: true, value, sort: sortValue(key, value) };
}

/** The raw reading for one applicable column. */
function readValue(item, system, key, worn) {
  switch (key) {
    case 'footprint':
      return itemSlotCost(item);
    case 'value': {
      const price = authored(system.price);
      if (price === null) return null;
      return price * (authored(system.quantity) ?? 1);
    }
    case 'state':
      return worn ? 'worn' : 'carried';
    case 'incomplete':
      return missingRequired(item);
    case 'use':
      return weaponUse(system);
    case 'wa':
      return weaponAttribute(system);
    case 'fv':
      // The rank is the requirement; which skill it is asked of goes into the
      // cell's tooltip, where a machine key can be localized without needing a
      // column of its own.
      return system.fv?.skill ? { rank: authored(system.fv?.rank) ?? 0, skill: system.fv.skill } : null;
    case 'zone':
      return armorZones(item)[0] ?? null;
    case 'ss':
      return authored(system.ss?.count);
    case 'ws':
      return authored(system.ws?.count);
    case 'hh':
      return { active: authored(system.hh?.active) ?? 0, passive: authored(system.hh?.passive) ?? 0 };
    case 'quantity':
      return authored(system.quantity) ?? 1;
    default:
      return authored(system[key]);
  }
}

/** What a raw value compares as. Compound values sort by their leading part. */
function sortValue(key, value) {
  if (value === null || value === undefined) return null;
  if (key === 'incomplete') return value.length;
  if (key === 'fv') return value.rank;
  if (key === 'hh') return value.active;
  return value;
}

/**
 * Order two rows by one column, with everything the column cannot answer at the
 * bottom **in both directions**.
 *
 * Nulls-last rather than nulls-first-when-descending: sorting by RH to find the
 * hardest armour and sorting to find the softest are the same act of pulling
 * the pieces that *have* an RH to the top, and a descending sort that opened
 * with a screenful of n/a would answer neither question.
 */
function compareRows(a, b, key, dir, collator) {
  if (key === NAME_SORT_KEY) {
    const order = collator(a.name, b.name);
    return dir === 'desc' ? -order : order;
  }

  const left = a.cells[key]?.sort ?? null;
  const right = b.cells[key]?.sort ?? null;
  if (left === null && right === null) return collator(a.name, b.name);
  if (left === null) return 1;
  if (right === null) return -1;

  const order = typeof left === 'string' || typeof right === 'string'
    ? collator(String(left), String(right))
    : left - right;
  if (order === 0) return collator(a.name, b.name);
  return dir === 'desc' ? -order : order;
}

/**
 * The whole table: one group per role, each holding its rows and the totals
 * worth summing over them.
 *
 * Group totals are the two figures that mean something added up. Slots because
 * the budget is the rule the tab exists to serve, and money because "what are
 * my weapons worth" is a question a ledger should be able to answer. Neither
 * counts what it may not: every slotted piece contributes its footprint, and a
 * piece with no authored price contributes nothing rather than a zero.
 *
 * Every group renders even when empty, so the table keeps its shape as items
 * come and go and the reader never has to work out whether a missing heading
 * means "none of those" or "that group is gone".
 *
 * @param {Array<object>} items  The actor's physical items.
 * @param {object} options
 * @param {Set<string>} [options.worn]  Item ids currently on the body.
 * @param {Array<string>} [options.columns]  Visible column keys.
 * @param {{key: string, dir: string}} [options.sort]
 * @param {(a: string, b: string) => number} [options.collator]  Locale name compare.
 * @returns {Array<{role: string, rows: Array<object>, count: number,
 *   footprint: number, value: number, hasValue: boolean}>}
 */
export function buildItemGroups(items, { worn, columns, sort, collator } = {}) {
  const config = normalizeItemTableConfig({ columns, sort });
  const wornIds = worn ?? new Set();
  const compare = collator ?? ((a, b) => String(a).localeCompare(String(b)));

  const groups = new Map(
    ITEM_TABLE_GROUPS.map((role) => [
      role,
      { role, rows: [], count: 0, footprint: 0, value: 0, hasValue: false },
    ])
  );

  for (const item of items ?? []) {
    const isWorn = wornIds.has(item._id ?? item.id);
    const cells = {};
    for (const key of config.columns) cells[key] = columnCell(item, key, { worn: isWorn });
    // The sort column has to be readable even while it is switched off, or
    // sorting by a column and then hiding it would silently reorder the table.
    if (config.sort.key !== NAME_SORT_KEY && !cells[config.sort.key]) {
      cells[config.sort.key] = columnCell(item, config.sort.key, { worn: isWorn });
    }

    const group = groups.get(itemGroupKey(item));
    group.rows.push({ item, id: item._id ?? item.id, name: item.name ?? '', worn: isWorn, cells });
    group.count += 1;
    group.footprint += itemSlotCost(item);

    const price = authored(item?.system?.price);
    if (price !== null) {
      group.value += price * (authored(item?.system?.quantity) ?? 1);
      group.hasValue = true;
    }
  }

  for (const group of groups.values()) {
    group.rows.sort((a, b) => compareRows(a, b, config.sort.key, config.sort.dir, compare));
  }

  return ITEM_TABLE_GROUPS.map((role) => groups.get(role));
}

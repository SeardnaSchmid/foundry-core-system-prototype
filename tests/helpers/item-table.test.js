import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ITEM_TABLE_CONFIG,
  ITEM_TABLE_COLUMNS,
  ITEM_TABLE_GROUPS,
  NAME_SORT_KEY,
  PLAIN_ROLE,
  buildItemGroups,
  columnCell,
  itemGroupKey,
  nextItemTableSort,
  normalizeItemTableConfig,
  toggleItemTableColumn,
} from '../../module/helpers/item-table.mjs';

/** Shorthand for a plain owned object. */
const item = (_id, name, system = {}) => ({
  _id,
  name,
  type: 'item',
  system: { slots: 1, quantity: 1, ...system },
});

/** Shorthand for a piece carrying one role. */
const roled = (_id, name, role, system = {}) =>
  item(_id, name, { roles: { weapon: false, armor: false, consumable: false, [role]: true }, ...system });

describe('normalizeItemTableConfig', () => {
  it('drops column keys the catalogue no longer has', () => {
    const config = normalizeItemTableConfig({ columns: ['slots', 'weight', 'sv'] });
    expect(config.columns).toEqual(['slots', 'sv']);
  });

  it('returns columns in catalogue order, not the order they were ticked', () => {
    const config = normalizeItemTableConfig({ columns: ['ra', 'slots', 'price'] });
    expect(config.columns).toEqual(['slots', 'price', 'ra']);
  });

  it('falls back to the defaults when nothing is selected', () => {
    expect(normalizeItemTableConfig({ columns: [] }).columns).toEqual(DEFAULT_ITEM_TABLE_CONFIG.columns);
    expect(normalizeItemTableConfig(undefined).columns).toEqual(DEFAULT_ITEM_TABLE_CONFIG.columns);
  });

  it('clamps an unknown sort key back to the name', () => {
    expect(normalizeItemTableConfig({ sort: { key: 'weight', dir: 'desc' } }).sort).toEqual({
      key: NAME_SORT_KEY,
      dir: 'desc',
    });
  });

  it('treats anything but "desc" as ascending', () => {
    expect(normalizeItemTableConfig({ sort: { key: 'sv', dir: 'sideways' } }).sort.dir).toBe('asc');
  });
});

describe('toggleItemTableColumn', () => {
  it('adds a column that was off and keeps catalogue order', () => {
    const config = toggleItemTableColumn({ columns: ['sv'] }, 'slots');
    expect(config.columns).toEqual(['slots', 'sv']);
  });

  it('removes a column that was on', () => {
    expect(toggleItemTableColumn({ columns: ['slots', 'sv'] }, 'sv').columns).toEqual(['slots']);
  });

  it('puts the defaults back rather than leaving a table of names only', () => {
    expect(toggleItemTableColumn({ columns: ['sv'] }, 'sv').columns).toEqual(
      DEFAULT_ITEM_TABLE_CONFIG.columns
    );
  });

  it('ignores a key the catalogue does not have', () => {
    const before = normalizeItemTableConfig({ columns: ['slots'] });
    expect(toggleItemTableColumn(before, 'weight')).toEqual(before);
  });
});

describe('nextItemTableSort', () => {
  it('starts a newly picked column ascending', () => {
    expect(nextItemTableSort({ sort: { key: NAME_SORT_KEY, dir: 'desc' } }, 'sv')).toEqual({
      key: 'sv',
      dir: 'asc',
    });
  });

  it('flips the column already sorted', () => {
    expect(nextItemTableSort({ sort: { key: 'sv', dir: 'asc' } }, 'sv')).toEqual({ key: 'sv', dir: 'desc' });
    expect(nextItemTableSort({ sort: { key: 'sv', dir: 'desc' } }, 'sv')).toEqual({ key: 'sv', dir: 'asc' });
  });

  it('leaves the sort alone for a key it does not know', () => {
    expect(nextItemTableSort({ sort: { key: 'sv', dir: 'asc' } }, 'weight')).toEqual({
      key: 'sv',
      dir: 'asc',
    });
  });
});

describe('columnCell', () => {
  it('keeps a blank nullable field distinct from a real zero', () => {
    // The null-versus-zero rule: "not filled in yet" and "the lowest step" are
    // different answers, and Number(null) is 0.
    const blank = columnCell(roled('a', 'Helm', 'armor', { zone: 'head', rh: null }), 'rh');
    expect(blank).toMatchObject({ applies: true, value: null });

    const zero = columnCell(roled('b', 'Padding', 'armor', { zone: 'head', rw: 0 }), 'rw');
    expect(zero).toMatchObject({ applies: true, value: 0 });
  });

  it('reports the footprint with the armour floor applied', () => {
    const plates = roled('p', 'Plates', 'armor', { zone: 'torso', slots: 0, quantity: 3 });
    expect(columnCell(plates, 'footprint').value).toBe(3);
  });

  it('has no footprint to report for a worn piece', () => {
    // Worn gear is exempt from the slot economy, so the cell is n/a rather than
    // a zero that would read as "this costs nothing to carry".
    const worn = roled('w', 'Vest', 'armor', { zone: 'torso', slots: 2 });
    expect(columnCell(worn, 'footprint', { worn: true })).toMatchObject({ applies: false, value: null });
  });

  it('multiplies the base price by the stack for the value column', () => {
    expect(columnCell(item('c', 'Rations', { price: 12, quantity: 4 }), 'value').value).toBe(48);
  });

  it('leaves the value blank when no price was ever authored', () => {
    expect(columnCell(item('c', 'Rations', { quantity: 4 }), 'value').value).toBeNull();
  });

  it('says whether the piece is on the body', () => {
    expect(columnCell(item('s', 'Coat'), 'state', { worn: true }).value).toBe('worn');
    expect(columnCell(item('s', 'Coat'), 'state').value).toBe('carried');
  });

  it('reports a weapon column as n/a on a row that is not a weapon', () => {
    expect(columnCell(roled('a', 'Helm', 'armor', { zone: 'head' }), 'dk')).toMatchObject({
      applies: false,
      value: null,
    });
  });

  it('reports an armour column as n/a on a weapon row', () => {
    expect(columnCell(roled('w', 'Knife', 'weapon', { dk: 1 }), 'rh')).toMatchObject({ applies: false });
  });

  it('asks a melee weapon for its DK and a ranged one for its RD', () => {
    const knife = roled('k', 'Knife', 'weapon', { use: 'melee', dk: 2, rd: 4 });
    expect(columnCell(knife, 'dk')).toMatchObject({ applies: true, value: 2 });
    expect(columnCell(knife, 'rd')).toMatchObject({ applies: false });

    const rifle = roled('r', 'Rifle', 'weapon', { use: 'ranged', dk: 2, rd: 4 });
    expect(columnCell(rifle, 'rd')).toMatchObject({ applies: true, value: 4 });
    expect(columnCell(rifle, 'dk')).toMatchObject({ applies: false });
  });

  it('grants the Unterkleidung no hardness and no coverage at all', () => {
    // The Rüstungstabelle writes every suit row as RH 0 and RA "–": neither is
    // a blank waiting to be filled in, they are values a suit cannot have.
    const suit = roled('s', 'Anzug', 'armor', { zone: 'suit', rw: 2 });
    expect(columnCell(suit, 'rh')).toMatchObject({ applies: false });
    expect(columnCell(suit, 'ra')).toMatchObject({ applies: false });
    expect(columnCell(suit, 'rw')).toMatchObject({ applies: true, value: 2 });
  });

  it('lists the required fields still open', () => {
    const bare = roled('b', '', 'weapon', { slots: null });
    expect(columnCell(bare, 'incomplete').value).toEqual(expect.arrayContaining(['name', 'slots']));
    expect(columnCell(item('ok', 'Rope'), 'incomplete').value).toEqual([]);
  });

  it('reports nothing for a key the catalogue does not have', () => {
    expect(columnCell(item('a', 'Rope'), 'weight')).toMatchObject({ applies: false, value: null });
  });
});

describe('itemGroupKey', () => {
  it('puts a piece in the group of the one role it carries', () => {
    expect(itemGroupKey(roled('w', 'Knife', 'weapon'))).toBe('weapon');
    expect(itemGroupKey(roled('a', 'Helm', 'armor'))).toBe('armor');
    expect(itemGroupKey(roled('c', 'Medkit', 'consumable'))).toBe('consumable');
  });

  it('puts an object with no role at all in its own group', () => {
    expect(itemGroupKey(item('r', 'Rope'))).toBe(PLAIN_ROLE);
  });
});

describe('buildItemGroups', () => {
  const items = [
    roled('knife', 'Messer', 'weapon', { use: 'melee', dk: 2, slots: 1, price: 30 }),
    roled('rifle', 'Gewehr', 'weapon', { use: 'ranged', rd: 5, slots: 2, quantity: 1, price: 400 }),
    roled('helm', 'Helm', 'armor', { zone: 'head', rh: 4, slots: 1 }),
    roled('kit', 'Verbandskasten', 'consumable', { slots: 1, quantity: 2 }),
    item('rope', 'Seil', { slots: 2 }),
    item('coin', 'Münzen', { slots: 0, quantity: 20 }),
  ];

  const build = (options = {}) => buildItemGroups(items, { columns: ['slots', 'dk', 'rh'], ...options });

  it('renders every group, in role order with the plain objects last', () => {
    expect(build().map((group) => group.role)).toEqual(ITEM_TABLE_GROUPS);
    expect(ITEM_TABLE_GROUPS.at(-1)).toBe(PLAIN_ROLE);
  });

  it('lists every item exactly once, across all groups', () => {
    const ids = build().flatMap((group) => group.rows.map((row) => row.id));
    expect(ids).toHaveLength(items.length);
    expect(new Set(ids).size).toBe(items.length);
  });

  it('keeps an empty group rather than dropping its heading', () => {
    const groups = buildItemGroups([item('rope', 'Seil')], { columns: ['slots'] });
    expect(groups).toHaveLength(ITEM_TABLE_GROUPS.length);
    expect(groups.find((group) => group.role === 'weapon').rows).toEqual([]);
  });

  it('sums the carried slots per group', () => {
    const weapons = build().find((group) => group.role === 'weapon');
    expect(weapons.footprint).toBe(3);
    const plain = build().find((group) => group.role === PLAIN_ROLE);
    expect(plain.footprint).toBe(2);
  });

  it('leaves worn gear out of the slot total', () => {
    const groups = build({ worn: new Set(['helm']) });
    expect(groups.find((group) => group.role === 'armor').footprint).toBe(0);
    expect(groups.find((group) => group.role === 'armor').rows[0].worn).toBe(true);
  });

  it('sums money only where a price was authored', () => {
    const weapons = build().find((group) => group.role === 'weapon');
    expect(weapons).toMatchObject({ value: 430, hasValue: true });
    const plain = build().find((group) => group.role === PLAIN_ROLE);
    expect(plain).toMatchObject({ value: 0, hasValue: false });
  });

  it('sorts by name through the injected collator', () => {
    const plain = build({ sort: { key: NAME_SORT_KEY, dir: 'asc' } }).find((g) => g.role === PLAIN_ROLE);
    expect(plain.rows.map((row) => row.name)).toEqual(['Münzen', 'Seil']);

    const desc = build({ sort: { key: NAME_SORT_KEY, dir: 'desc' } }).find((g) => g.role === PLAIN_ROLE);
    expect(desc.rows.map((row) => row.name)).toEqual(['Seil', 'Münzen']);
  });

  it('sorts by a value column within each group', () => {
    const weapons = build({ sort: { key: 'slots', dir: 'desc' } }).find((g) => g.role === 'weapon');
    expect(weapons.rows.map((row) => row.id)).toEqual(['rifle', 'knife']);
  });

  it('keeps cells the column cannot answer at the bottom in both directions', () => {
    // Sorting by DK to find the longest weapon and sorting to find the shortest
    // are the same act of pulling the pieces that *have* a DK to the top.
    const asc = build({ sort: { key: 'dk', dir: 'asc' } }).find((g) => g.role === 'weapon');
    expect(asc.rows.map((row) => row.id)).toEqual(['knife', 'rifle']);

    const desc = build({ sort: { key: 'dk', dir: 'desc' } }).find((g) => g.role === 'weapon');
    expect(desc.rows.map((row) => row.id)).toEqual(['knife', 'rifle']);
  });

  it('can still sort by a column that is switched off', () => {
    const groups = buildItemGroups(items, {
      columns: ['slots'],
      sort: { key: 'rh', dir: 'asc' },
    });
    const armor = groups.find((group) => group.role === 'armor');
    expect(armor.rows[0].cells.rh).toMatchObject({ applies: true, value: 4 });
    expect(armor.rows[0].cells.slots).toBeDefined();
  });

  it('builds a cell for every visible column and no others', () => {
    const row = build().find((group) => group.role === 'weapon').rows[0];
    expect(Object.keys(row.cells).sort()).toEqual(['dk', 'rh', 'slots']);
  });

  it('survives an actor with nothing at all', () => {
    const groups = buildItemGroups(undefined, {});
    expect(groups.map((group) => group.count)).toEqual(ITEM_TABLE_GROUPS.map(() => 0));
  });
});

describe('ITEM_TABLE_COLUMNS', () => {
  it('has a unique key per column', () => {
    const keys = ITEM_TABLE_COLUMNS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never uses the name as a pickable column key', () => {
    // The name is the row's identity, so it can neither be switched off nor
    // collide with a value column of the same key.
    expect(ITEM_TABLE_COLUMNS.some((column) => column.key === NAME_SORT_KEY)).toBe(false);
  });

  it('offers only defaults the catalogue actually has', () => {
    for (const key of DEFAULT_ITEM_TABLE_CONFIG.columns) {
      expect(ITEM_TABLE_COLUMNS.some((column) => column.key === key)).toBe(true);
    }
  });
});

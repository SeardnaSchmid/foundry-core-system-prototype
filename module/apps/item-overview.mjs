import {
  ITEM_TABLE_COLUMNS,
  ITEM_TABLE_SECTIONS,
  NAME_SORT_KEY,
  PLAIN_ROLE,
  buildItemGroups,
  nextItemTableSort,
  normalizeItemTableConfig,
  toggleItemTableColumn,
} from '../helpers/item-table.mjs';
import { auditTally, itemOrigin } from '../helpers/item-audit.mjs';
import { inventoryArt } from '../helpers/items.mjs';

// Namespaced rather than the bare `FormApplication` global, which is
// deprecated. Still ApplicationV1, like the custom-skills overview it is
// modelled on — see the V1 apps note in docs/wiki/reference/module-map.md.
const { FormApplication } = foundry.appv1.api;

/**
 * What the window opens with: what a piece costs to carry, how many there are,
 * what it takes to wear, and what it is worth. `tno.mjs` registers the
 * `itemOverviewLayout` client setting with this as its default.
 * @type {{columns: Array<string>, sort: {key: string, dir: string}}}
 */
export const ITEM_OVERVIEW_DEFAULT_CONFIG = {
  columns: ['slots', 'quantity', 'sv', 'price'],
  sort: { key: 'name', dir: 'asc' },
};

/**
 * GM-only read-only overview of every item in the world, wherever it lives, and
 * where each one came from.
 *
 * The sibling of {@link TnoCustomSkillsOverview} and it exists for the same
 * reason: something that matters to the GM is spread across documents only the
 * owners can see. Gear in this system lives on actors, so `game.items` alone
 * shows almost nothing of what is actually in play — this walks every actor's
 * embedded items as well as the world directory.
 *
 * **It is the Inventar ledger's table, not a second one.** Grouping by role,
 * the column catalogue, the three cell outcomes (n/a, unfilled, value) and the
 * sort all come from `helpers/item-table.mjs`, so a column means the same thing
 * here as it does on a character sheet and the two cannot drift apart. What
 * this window adds is the two columns that only make sense across actors:
 * **held by**, and **origin**.
 *
 * Origin is the column that earns the window. A hand-typed weapon and one
 * dragged out of `tno.gear` are indistinguishable on an actor sheet, and only
 * the first is the GM's problem to check — see `helpers/item-audit.mjs`.
 *
 * Registered via `game.settings.registerMenu`, which requires a
 * FormApplication (or ApplicationV2) subclass even though this dialog never
 * submits a form of its own — `_updateObject` is a no-op.
 * @extends {FormApplication}
 */
export class TnoItemOverview extends FormApplication {
  constructor() {
    super({});
    /**
     * Show only what did not come from the shipped catalogue. Off by default:
     * the window answers "what is in play" first and "what is unaccounted for"
     * second, and a filter that hides most rows before the reader has seen any
     * of them is a worse first impression than a long list.
     * @type {boolean}
     */
    this._unlistedOnly = false;

    /**
     * Whether the column picker is open. View state only — which columns are
     * picked is persisted, but a panel standing open across sessions is not
     * something anyone chose.
     * @type {boolean}
     */
    this._pickerOpen = false;
  }

  /** The stored layout, always in a shape the table can use. */
  #config() {
    return normalizeItemTableConfig(game.settings.get('tno', 'itemOverviewLayout'));
  }

  /** Persist a layout and redraw, since the columns come from context. */
  async #store(config) {
    await game.settings.set('tno', 'itemOverviewLayout', config);
    this.render();
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-item-overview',
      classes: ['tno', 'sheet', 'tno-item-overview'],
      template: 'systems/tno/templates/apps/item-overview.hbs',
      // Wider than the skills overview: this carries the ledger's own columns
      // plus a holder and an origin.
      width: 860,
      // A figure rather than `auto`: this list is as long as the world is, and
      // `auto` grew the window to the height of every row in it.
      height: 680,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('TNO.Settings.ItemOverview.Name');
  }

  /**
   * Every item in the world, tagged with the actor holding it.
   *
   * `inventoryArt` is applied the same way the actor sheet applies it before
   * handing items to the table, so a row here draws the picture a row there
   * draws.
   * @returns {Array<object>}
   */
  #collect() {
    const entries = [];
    const take = (item, holderId, holderName) => {
      const plain = item.toObject ? item.toObject(false) : { ...item };
      plain.uuid = item.uuid;
      plain.inventoryArt = inventoryArt(plain);
      plain.holderId = holderId;
      plain.holderName = holderName;
      plain.origin = itemOrigin(item._stats);
      entries.push(plain);
    };

    for (const item of game.items ?? []) take(item, null, null);
    for (const actor of game.actors ?? []) {
      for (const item of actor.items ?? []) take(item, actor.id, actor.name);
    }
    return entries;
  }

  /** @override */
  getData() {
    const all = this.#collect();
    const tally = auditTally(all.map((item) => item._stats));
    const items = this._unlistedOnly
      ? all.filter((item) => item.origin.kind !== 'catalogue')
      : all;

    const config = this.#config();
    const collator = new Intl.Collator(game.i18n.lang, { sensitivity: 'base', numeric: true });
    const groups = buildItemGroups(items, {
      // Nothing is "worn" from out here: worn-ness is a fact about one actor's
      // paper doll, and this window spans all of them.
      worn: new Set(),
      columns: config.columns,
      sort: config.sort,
      collator: (a, b) => collator.compare(a, b),
    });

    const visible = config.columns
      .map((key) => ITEM_TABLE_COLUMNS.find((column) => column.key === key))
      .filter(Boolean);

    return {
      tally,
      unlistedOnly: this._unlistedOnly,
      unlisted: tally.homebrew + tally.foreign,
      headers: [
        this.#header({ key: NAME_SORT_KEY, labelKey: 'TNO.Inventory.AddName' }, config.sort),
        this.#header({ key: 'holder', labelKey: 'TNO.ItemOverview.Holder', sortable: false }, config.sort),
        this.#header({ key: 'origin', labelKey: 'TNO.ItemOverview.Origin.Label', sortable: false }, config.sort),
        ...visible.map((column) => this.#header(column, config.sort)),
      ],
      // Name, holder, origin, then the value columns, then the open control.
      gridTemplate: [
        'minmax(8rem, 3fr)',
        'minmax(6rem, 1.5fr)',
        'minmax(5rem, 1fr)',
        ...visible.map(() => 'minmax(3.25rem, 1fr)'),
        '2.5rem',
      ].join(' '),
      groups: groups.filter((group) => group.count).map((group) => this.#group(group, visible)),
      isEmpty: !items.length,
      isFiltered: this._unlistedOnly && !!all.length,
      pickerOpen: this._pickerOpen,
      sections: this.#pickerSections(config),
    };
  }

  /**
   * The picker's checkboxes, grouped the way the column catalogue is.
   *
   * Inline rather than the sheet's top-layer popover: that one is mounted and
   * positioned by machinery belonging to the ActorSheetV2, and a panel that
   * pushes the table down costs nothing in a window this size.
   */
  #pickerSections(config) {
    const labels = {
      general: 'TNO.Item.General',
      trade: 'TNO.Item.Trade',
      weapon: 'TNO.Item.Role.Weapon',
      armor: 'TNO.Item.Role.Armor',
    };
    return ITEM_TABLE_SECTIONS.map((section) => ({
      key: section,
      label: game.i18n.localize(labels[section]),
      columns: ITEM_TABLE_COLUMNS.filter((column) => column.section === section).map((column) => ({
        key: column.key,
        label: game.i18n.localize(column.labelKey),
        hint: game.i18n.localize(column.hintKey),
        checked: config.columns.includes(column.key),
      })),
    }));
  }

  /** One header cell, sortable only where the table can actually sort by it. */
  #header({ key, labelKey, sortable = true }, sort) {
    const sorted = sortable && sort.key === key;
    return {
      key,
      label: game.i18n.localize(labelKey),
      sortable,
      sorted,
      dir: sorted ? sort.dir : null,
    };
  }

  /** One role group, with its rows already sorted by the shared component. */
  #group(group, columns) {
    const label = group.role === PLAIN_ROLE ? 'TNO.Item.Role.Plain' : CONFIG.TNO.itemRoles[group.role];
    return {
      role: group.role,
      label: game.i18n.localize(label),
      count: group.count,
      rows: group.rows.map((row) => ({
        uuid: row.item.uuid,
        name: row.name,
        icon: row.item.inventoryArt?.icon,
        img: row.item.inventoryArt?.img,
        holderId: row.item.holderId,
        holderLabel: row.item.holderName ?? game.i18n.localize('TNO.ItemOverview.World'),
        inWorld: !row.item.holderId,
        origin: row.item.origin.kind,
        originLabel: game.i18n.localize(row.item.origin.labelKey),
        originPack: row.item.origin.pack,
        cells: columns.map((column) => this.#cell(column, row.cells[column.key])),
      })),
    };
  }

  /**
   * One body cell, keeping the ledger's three outcomes apart: a column the row
   * cannot answer is `n/a`, one nobody filled in is a dash, and only an authored
   * value is a figure.
   */
  #cell(column, cell) {
    if (!cell?.applies) {
      return { key: column.key, na: true, text: game.i18n.localize('TNO.Item.Summary.Na'), numeric: column.numeric };
    }
    if (cell.value === null || cell.value === undefined) {
      return { key: column.key, blank: true, text: '—', numeric: column.numeric };
    }
    const value = cell.value;
    const text = typeof value === 'object' && value !== null
      ? [value.active, value.passive].filter((part) => part !== undefined).join(' / ')
      : String(value);
    return { key: column.key, text, numeric: column.numeric };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('.overview-refresh').on('click', (ev) => {
      ev.preventDefault();
      this.render();
    });

    html.find('.overview-filter').on('click', (ev) => {
      ev.preventDefault();
      this._unlistedOnly = !this._unlistedOnly;
      this.render();
    });

    // The same gesture the ledger's own headers answer, through the same
    // helper, so a click sorts the two tables identically.
    html.find('.item-table-sort').on('click', (ev) => {
      ev.preventDefault();
      const config = this.#config();
      this.#store({ ...config, sort: nextItemTableSort(config, ev.currentTarget.dataset.sortKey) });
    });

    html.find('.item-columns-toggle').on('click', (ev) => {
      ev.preventDefault();
      this._pickerOpen = !this._pickerOpen;
      this.render();
    });

    // The same toggle the sheet's picker uses, so turning the last column off
    // restores the defaults here exactly as it does there.
    html.find('.item-column-option input').on('change', (ev) => {
      this.#store(toggleItemTableColumn(this.#config(), ev.currentTarget.dataset.column));
    });

    // The item, not the actor: an item on an actor is a different document from
    // the catalogue entry it was copied from, so the sheet worth opening is the
    // copy in front of the reader.
    html.find('.overview-open-item').on('click', async (ev) => {
      ev.preventDefault();
      const { uuid } = ev.currentTarget.dataset;
      const document = uuid ? await fromUuid(uuid) : null;
      document?.sheet?.render(true);
    });

    html.find('.overview-open-actor').on('click', (ev) => {
      ev.preventDefault();
      game.actors.get(ev.currentTarget.dataset.actorId)?.sheet.render(true);
    });
  }

  /** @override */
  async _updateObject() {
    // Read-only overview; nothing to persist.
  }
}

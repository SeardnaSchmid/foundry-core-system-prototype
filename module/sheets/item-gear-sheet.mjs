import { getSkillDefinitions } from '../helpers/skills.mjs';
import {
  ARMOR_SUIT_ZONE,
  ARMOR_ZONES,
  GEAR_NUMBER_BOUNDS,
  ITEM_ROLES,
  MISSING_FIELD_LABELS,
  RANGE_BANDS,
  SCALES,
  WEAPON_ATTRIBUTES,
  WEAPON_USES,
  clampGearNumber,
  cycleRangeModifier,
  itemRoles,
  missingRequired,
  normalizeConsumableEffects,
  scaleCells,
  selectRole,
  toggleZone,
  usesMelee,
  usesRanged,
} from '../helpers/items.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Which required fields each section's head counts. The keys are those of
 * `missingRequired`; `name` is the identity's own and counted only in the foot.
 */
const SECTION_FIELDS = {
  weapon: ['wa', 'wf', 'dk', 'range', 'rb', 'ss'],
  armor: ['zone', 'rh', 'ra'],
  consumable: ['effects'],
  inventory: ['slots'],
};
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * The item editor: one column for every physical item, whatever role it has,
 * laid out after the 2026-10 "Item-Editor" mockup.
 *
 * **No tabs.** Everything is on one page, top to bottom in authoring order:
 * identity, the role's values, Inventar, then Handel and Beschreibung folded
 * away. Tabbing would hide exactly the fields a player is comparing; folding
 * hides only what is filled once and then read, and its summary line still
 * says what is in it. Which folds are open is remembered for the life of the
 * window (`#openFolds`), since every change re-renders the form.
 *
 * **Only what applies is shown.** A ranged weapon is asked for its range bands
 * where a melee one is asked for DK, and the Unterkleidung for RW alone. The
 * earlier sheet hatched such rows as `n/a` so nothing moved; the redesign
 * trades that for a shorter form, and the rows that change sit at the end of
 * their section or swap one for one, so a switch moves little.
 *
 * @extends {ItemSheetV2}
 */
export class TnoGearSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['tno', 'sheet', 'item', 'gear-dialog'],
    // The mockup's 720: RB's eleven cells beside the 130px label column, with
    // the section padding either side, and the four role segments in the head.
    // Height follows the role and the folds that are open.
    position: { width: 720, height: 'auto' },
    window: { resizable: true },
    // The sheet edits a live document that the paper doll and the slot grid
    // render at the same time, and Foundry has no rollback to hang a Cancel
    // button off. So every change writes through, exactly as on the actor
    // sheet, and the footer counts what is still missing instead of gating a
    // save.
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/item/item-gear-sheet.hbs', root: true },
  };

  /**
   * The folds the reader has opened in this window. Every change re-renders
   * the whole form, so the `<details>` state has to outlive the DOM it is in.
   * @type {Set<string>}
   */
  #openFolds = new Set();

  /** @override */
  get title() {
    return game.i18n.format('TNO.Item.Editor.Title', { name: this.document.name });
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const system = this.document.toObject(false).system;
    const roles = itemRoles(item);

    context.item = item;
    context.system = system;
    context.config = CONFIG.TNO;
    context.roles = roles;
    context.canEdit = this.isEditable;

    // Three segment rows of the same shape: the role (with "Gegenstand" for
    // none), the armour location and the weapon use, each one exclusive.
    context.roleChips = [
      { key: 'plain', label: 'TNO.Item.Role.Plain', on: !ITEM_ROLES.some((key) => roles[key]) },
      ...ITEM_ROLES.map((key) => ({
        key,
        label: CONFIG.TNO.itemRoles[key],
        on: roles[key],
      })),
    ];
    const selectedArmorZone = item.system.zone ?? item.system.zones?.[0] ?? null;
    context.zoneChips = ARMOR_ZONES.map((zone) => ({
      zone,
      label: CONFIG.TNO.armorZones[zone],
      on: selectedArmorZone === zone,
    }));
    // The base layer has no hit location, so its RH is the fixed 0 the table
    // gives it and its RA does not exist. Both rows are left out, and a note
    // says why.
    context.armorSuit = selectedArmorZone === ARMOR_SUIT_ZONE;
    context.useSegments = WEAPON_USES.map((use) => ({
      use,
      label: CONFIG.TNO.weaponUses[use],
      on: (system.use ?? 'melee') === use,
    }));
    const selectedWeaponAttribute = WEAPON_ATTRIBUTES.includes(system.wa) ? system.wa : '';
    context.weaponAttributeOptions = WEAPON_ATTRIBUTES.map((attribute) => ({
      key: attribute,
      label: CONFIG.TNO.abilities[attribute],
      on: selectedWeaponAttribute === attribute,
    }));

    context.melee = usesMelee(system);
    context.ranged = usesRanged(system);

    // The four click-scales. Prebuilt here rather than by a Handlebars helper
    // because "which cell is selected" has to distinguish an unset band from
    // one set to its lowest step, and that is a decision, not a loop.
    context.scales = Object.fromEntries(
      Object.keys(SCALES).map((key) => [key, scaleCells(key, system[key])])
    );

    context.rangeFields = RANGE_BANDS.map((band) => ({
      band,
      label: CONFIG.TNO.rangeBands[band],
      value: system.range?.[band] ?? null,
      display: system.range?.[band] == null ? '—' : `${Number(system.range[band]) > 0 ? '+' : ''}${system.range[band]}`,
      state: system.range?.[band] == null ? 'unavailable' : Number(system.range[band]) > 0 ? 'positive' : Number(system.range[band]) < 0 ? 'negative' : 'neutral',
    }));
    context.consumableEffects = normalizeConsumableEffects(system).map((effect, index) => ({ ...effect, index }));

    // Every skill the world knows, including the owning character's custom
    // ones — an item on a character should be able to name a Fertigkeit that
    // only that character has.
    const definitions = getSkillDefinitions(this.item.actor);
    // Each option carries its category, because the closed select shows one
    // line and a bare skill name does not say what kind of skill it is — least
    // of all a custom one, where "Kuiper Forset" could be a milieu or a biome.
    // The category is part of the option text rather than an <optgroup> label
    // for that reason: a group heading is only there while the list is open.
    const categoryOrder = Object.keys(CONFIG.TNO.skillCategories);
    context.skills = Object.entries(definitions)
      .map(([key, definition]) => ({
        key,
        name: definition.label,
        category: definition.category,
        label: `${game.i18n.localize(CONFIG.TNO.skillCategories[definition.category])} · ${definition.label}`,
      }))
      // Grouped in the categories' own order, then alphabetically inside each,
      // so the list reads like the skill tab rather than like a flat index.
      .sort((a, b) =>
        categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
        || a.name.localeCompare(b.name, game.i18n.lang));
    // What is still blank, both as a count for the footer and as a lookup the
    // rows mark themselves with.
    const missing = missingRequired(item);
    context.missing = Object.fromEntries(missing.map((field) => [field, true]));
    context.missingCount = missing.length;
    context.missingFields = missing.map((field) => ({
      field,
      label: MISSING_FIELD_LABELS[field] ?? field,
    }));
    // Each section with required fields says in its head whether they are set.
    context.sections = Object.fromEntries(
      Object.entries(SECTION_FIELDS).map(([section, fields]) => {
        const count = missing.filter((field) => fields.includes(field)).length;
        const label = count === 0
          ? game.i18n.localize('TNO.Item.Editor.SectionDone')
          : game.i18n.format(count === 1 ? 'TNO.Item.Editor.SectionOpenOne' : 'TNO.Item.Editor.SectionOpenMany', { count });
        return [section, { count, label }];
      })
    );
    // Inventar has one required field, and it is rarely blank — only say so
    // when it is.
    if (!context.sections.inventory.count) context.sections.inventory = null;

    context.folds = { trade: this.#openFolds.has('trade'), description: this.#openFolds.has('description') };
    const dash = '–';
    context.tradeSummary = game.i18n.format('TNO.Item.Editor.TradeSummary', {
      quantity: system.quantity ?? 1,
      price: system.price == null || system.price === '' ? dash : `${system.price} €`,
      availability: system.availability ?? dash,
    });
    const text = String(system.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    context.descriptionSummary = text
      ? (text.length > 60 ? `${text.slice(0, 60)}…` : text)
      : game.i18n.localize('TNO.Item.Editor.DescriptionEmpty');

    // Worn gear holds back its own delete button: the actor's
    // `system.equipment` addresses the piece by id, and deleting it out from
    // under the paper doll would leave a zone pointing at nothing.
    context.isWorn = this.item.isWorn;
    context.canDelete = this.isEditable && !context.isWorn;

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._listenerAbort?.abort();
    this._listenerAbort = new AbortController();

    // Posting to chat is registered before the read-only gate, because it is
    // the one action a sheet the viewer cannot edit still has: an item opened
    // out of the locked gear compendium is exactly what a GM wants to show the
    // table. It reads the document and writes a chat message; it never touches
    // the item.
    this.#delegate('click', '.item-post-chat', () => this.item.roll());

    if (!this.isEditable) {
      // Scoped to the content, not to `this.element`. The application root is
      // the <form> and the window frame lives *inside* it, so disabling every
      // button under the root took the frame's own controls with it — a locked
      // compendium item opened with a close button that would not close it.
      // Core draws the same line in `DocumentSheetV2#_toggleDisabled`, which
      // only touches what is inside `.window-content` while the sheet is framed.
      const content = this.element.querySelector('.window-content') ?? this.element;
      for (const control of content.querySelectorAll('input, select, textarea, button, prose-mirror')) {
        if (control.matches('.item-post-chat')) continue;
        control.setAttribute('disabled', '');
      }
      this.#trackFolds();
      return;
    }

    this.#trackFolds();

    this.#delegate('click', '.role-chip', (event, target) => {
      this.#pickRole(target.dataset.role);
    });

    this.#delegate('click', '.zone-chip', (event, target) => {
      this.item.update({ 'system.zone': toggleZone(this.item.system.zone, target.dataset.zone) });
    });

    this.#delegate('click', '.use-segment[data-use]', (event, target) => {
      this.item.update({ 'system.use': target.dataset.use });
    });

    this.#delegate('click', '.scale-cell', (event, target) => {
      this.#setScale(target.dataset.scale, Number(target.dataset.value));
    });

    this.#delegate('click', '.stepper-button', (event, target) => {
      this.#step(target.dataset.field, Number(target.dataset.by));
    });

    this.#delegate('click', '.range-band', (event, target) => {
      const band = target.dataset.band;
      if (!RANGE_BANDS.includes(band)) return;
      const next = cycleRangeModifier(this.item.system.range?.[band], event.shiftKey ? -1 : 1);
      this.item.update({ [`system.range.${band}`]: next });
    });

    this.#delegate('click', '.consumable-effect-add', () => {
      const effects = normalizeConsumableEffects(this.item.system);
      effects.push({ id: foundry.utils.randomID(), text: '' });
      this.item.update({ 'system.consumableEffects': effects });
    });

    this.#delegate('click', '.consumable-effect-remove', (event, target) => {
      const effects = normalizeConsumableEffects(this.item.system).filter((effect) => effect.id !== target.dataset.effectId);
      this.item.update({ 'system.consumableEffects': effects });
    });

    this.#delegate('click', '.item-self-delete', () => this.item.confirmDelete());

    this.#delegate('click', '[data-missing-field]', (event, target) => {
      this.#focusMissing(target.dataset.missingField);
    });

    // Clamp only invalid values here. Valid changes continue to Foundry's
    // submit-on-change handler; an invalid one is corrected and written once.
    this.element.addEventListener('change', (event) => {
      const effectInput = event.target.closest('.consumable-effect textarea');
      if (effectInput) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const id = effectInput.closest('.consumable-effect')?.dataset.effectId;
        // The empty box of a consumable without effects has no entry behind
        // it yet; typing into it is what creates the first one.
        const effects = id
          ? normalizeConsumableEffects(this.item.system).map((effect) =>
            effect.id === id ? { ...effect, text: effectInput.value } : effect
          )
          : [{ id: foundry.utils.randomID(), text: effectInput.value }];
        this.item.update({ 'system.consumableEffects': effects });
        return;
      }

      const input = event.target.closest('input[type="number"][name]');
      if (!input || !(input.name in GEAR_NUMBER_BOUNDS)) return;
      const clamped = clampGearNumber(input.name, input.value);
      if (String(clamped) === input.value) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = clamped;
      this.item.update({ [input.name]: clamped });
    }, { capture: true, signal: this._listenerAbort.signal });

    // The picture is a button that ApplicationV2 opens on click through its own
    // `editImage` action. An <img> takes no focus and answers no key, so
    // Enter/Space are forwarded to that same click — the actor sheet promotes
    // its portrait the same way. Bound directly rather than through `#delegate`,
    // which preventDefaults every event it matches and would swallow Tab.
    this.element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const picture = event.target.closest?.('.profile-img[data-action="editImage"]');
      if (!picture) return;
      event.preventDefault();
      picture.click();
    }, { signal: this._listenerAbort.signal });

    this.element.addEventListener('keydown', (event) => this.#onKeyDown(event), {
      signal: this._listenerAbort.signal,
    });
  }

  /**
   * Bind one delegated listener on the sheet root. The rows are re-rendered
   * wholesale on every change, so listeners have to live on the root rather
   * than on the controls themselves.
   * @param {string} type  DOM event name.
   * @param {string} selector  What the event must have originated inside.
   * @param {(event: Event, target: Element) => void} handler
   * @private
   */
  #delegate(type, selector, handler) {
    this.element.addEventListener(type, (event) => {
      const target = event.target.closest(selector);
      if (!target || !this.element.contains(target)) return;
      event.preventDefault();
      handler(event, target);
    }, { signal: this._listenerAbort.signal });
  }

  /* -------------------------------------------- */

  /**
   * Remember which folds are open across re-renders. `toggle` does not bubble,
   * so it is caught on the way down.
   * @private
   */
  #trackFolds() {
    this.element.addEventListener('toggle', (event) => {
      const fold = event.target?.dataset?.fold;
      if (!fold) return;
      if (event.target.open) this.#openFolds.add(fold);
      else this.#openFolds.delete(fold);
    }, { capture: true, signal: this._listenerAbort.signal });
  }

  /**
   * Pick the item's role. A radiogroup: clicking the one already on changes
   * nothing, and "Gegenstand" (`plain`) is the explicit way to have none.
   *
   * Switching roles keeps the values of the one being left behind: the fields
   * are all still in the schema, the block simply stops rendering, so a player
   * who mis-clicks a chip gets everything back by clicking the old one again.
   * Discarding on the way out would make that undo impossible — and because the
   * roles are exclusive, a mis-click now costs a whole block rather than
   * flipping one extra section on.
   * @param {string} role  One of ITEM_ROLES, or `plain`.
   * @private
   */
  #pickRole(role) {
    const roles = itemRoles(this.item);
    if (role === 'plain') {
      if (!ITEM_ROLES.some((key) => roles[key])) return;
      return this.item.update({ 'system.roles': Object.fromEntries(ITEM_ROLES.map((key) => [key, false])) });
    }
    if (!ITEM_ROLES.includes(role) || roles[role]) return;
    return this.item.update({ 'system.roles': selectRole(itemRoles(this.item), role) });
  }

  /**
   * Set one click-scale, or clear it when the cell that is already selected is
   * clicked again. Clearing has to be reachable: an unset band and a band set
   * to its lowest step are different answers, and without this there would be
   * no way back to "not filled in yet".
   * @param {string} key  A key of SCALES.
   * @param {number} value
   * @private
   */
  #setScale(key, value) {
    if (!(key in SCALES) || !Number.isFinite(value)) return;
    const current = this.item.system[key];
    return this.item.update({ [`system.${key}`]: current === value ? null : value });
  }

  /**
   * Nudge a numeric field, clamped at zero. Used by the stepper controls,
   * which exist for the counts the rules leave open-ended (RA, RB and
   * applications) — anything with a table-bounded range is a scale instead.
   * @param {string} field  A `system.…` path.
   * @param {number} by
   * @private
   */
  #step(field, by) {
    if (!field?.startsWith('system.') || !Number.isFinite(by)) return;
    const current = Number(foundry.utils.getProperty(this.item, field)) || 0;
    const next = clampGearNumber(field, current + by);
    return this.item.update({ [field]: next });
  }

  /** Focus the first control belonging to one missing-field marker. */
  #focusMissing(field) {
    const key = CSS.escape(field);
    const container = this.element.querySelector(`[data-field="${key}"]`)
      ?? this.element.querySelector(`[data-row="${key}"]`);
    const focusable = container?.matches?.('input, select, button, [tabindex="0"]')
      ? container
      : container?.querySelector?.('input, select, button, [tabindex="0"]');
    focusable?.focus();
  }

  /**
   * The row-editor keyboard model: up and down walk the rows, left and right
   * change the value in the row you are on, and a digit sets a scale directly.
   *
   * Only the gestures native controls do not already own are intercepted —
   * inside a text field or a select, the arrow keys keep meaning what the
   * browser says they mean, and inside the description they have to.
   * @param {KeyboardEvent} event
   * @private
   */
  #onKeyDown(event) {
    const target = event.target;
    const row = target?.closest?.('.gear-row');
    if (!row) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // A textarea and the description editor use the arrows for their own
      // cursor; everything else in a row is a single line.
      if (target.matches('textarea, prose-mirror, prose-mirror *')) return;
      event.preventDefault();
      return this.#focusRow(row, event.key === 'ArrowDown' ? 1 : -1);
    }

    const cell = target.closest?.('.scale-cell');
    if (!cell) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = Number(cell.dataset.value) + (event.key === 'ArrowRight' ? 1 : -1);
      const { min, max } = SCALES[cell.dataset.scale] ?? {};
      if (next < min || next > max) return;
      return this.#setScale(cell.dataset.scale, next);
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      // A single keystroke can only reach 0-9, and the one scale that goes to
      // 10 is reached with 0 — the tenth cell, in the position a keypad puts it.
      const { max } = SCALES[cell.dataset.scale] ?? {};
      const typed = Number(event.key);
      return this.#setScale(cell.dataset.scale, typed === 0 && max === 10 ? 10 : typed);
    }
  }

  /**
   * Move the focus to the first control of the next or previous row that has
   * one. Rows whose controls are all `n/a` are stepped over rather than
   * focused: they are visible on purpose, but there is nothing to do in them.
   * @param {Element} row  The row the focus is in now.
   * @param {number} direction  +1 down, -1 up.
   * @private
   */
  #focusRow(row, direction) {
    const rows = [...this.element.querySelectorAll('.gear-row')];
    const focusable = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

    for (let index = rows.indexOf(row) + direction; index >= 0 && index < rows.length; index += direction) {
      const control = rows[index].querySelector(focusable);
      if (control) return control.focus();
    }
  }
}

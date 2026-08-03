import { getSkillDefinitions } from '../helpers/skills.mjs';
import { itemSlotCost } from '../helpers/inventory.mjs';
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
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * The gear dialog: one row editor for every physical item, whatever roles it
 * has taken on.
 *
 * Two things about it are deliberate and easy to undo by accident.
 *
 * **No tabs.** Everything is one scrolling column of `label | control` rows,
 * because the dialog is a data-entry form and tabbing hides exactly the fields
 * a player is comparing. The rows are always in the same order and always the
 * same height, so muscle memory survives a change of role.
 *
 * **Nothing is hidden, only disabled.** A field that does not apply to the
 * current role or use — the Distanzklasse of a rifle, the Fertigkeitswert of a
 * breastplate — stays in place as a struck-through `n/a` cell rather than
 * disappearing. Collapsing the row would move every row below it, so switching
 * a weapon from melee to ranged would make the dialog jump under the cursor.
 * Whole role blocks are the one exception: a role that is off is not an
 * inapplicable field, it is a section the item does not have.
 *
 * @extends {ItemSheetV2}
 */
export class TnoGearSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['tno', 'sheet', 'item', 'gear-dialog'],
    // Wide enough for the ten-cell RD/RH scales to stay legible at the label
    // column's fixed 96px; height follows the roles that are switched on,
    // which is anywhere between four rows and twenty.
    position: { width: 620, height: 'auto' },
    window: { resizable: true },
    // The sheet edits a live document that the paper doll and the carry grid
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

    // Three chip/segment rows of the same shape, differing only in how many
    // cells may be on at once: the role is exclusive and clearable; armour
    // location and weapon use are exclusive selections.
    context.roleChips = ITEM_ROLES.map((key) => ({
      key,
      label: CONFIG.TNO.itemRoles[key],
      on: roles[key],
    }));
    const selectedArmorZone = item.system.zone ?? item.system.zones?.[0] ?? null;
    context.zoneChips = ARMOR_ZONES.map((zone) => ({
      zone,
      label: CONFIG.TNO.armorZones[zone],
      on: selectedArmorZone === zone,
    }));
    // The base layer has no Rüstungshärte by rule, so its RH row is n/a rather
    // than an authorable scale — the same treatment a ranged weapon's DK gets.
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

    // The Richtwert tier the authored slot count falls into, so the header can
    // say "mittel" next to the number the player typed.
    const cost = itemSlotCost(item);
    const tier = CONFIG.TNO.slotCostHints.find((hint) => hint.slots === Number(system.slots));
    context.slotTier = tier?.hint ?? null;
    context.slotCost = cost;

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

    if (!this.isEditable) {
      for (const control of this.element.querySelectorAll('input, select, textarea, button, prose-mirror')) {
        control.setAttribute('disabled', '');
      }
      return;
    }

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
        const effects = normalizeConsumableEffects(this.item.system).map((effect) =>
          effect.id === id ? { ...effect, text: effectInput.value } : effect
        );
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
   * Pick the item's role, or clear it by clicking the one that is already on.
   *
   * Switching roles keeps the values of the one being left behind: the fields
   * are all still in the schema, the block simply stops rendering, so a player
   * who mis-clicks a chip gets everything back by clicking the old one again.
   * Discarding on the way out would make that undo impossible — and because the
   * roles are exclusive, a mis-click now costs a whole block rather than
   * flipping one extra section on.
   * @param {string} role  One of ITEM_ROLES.
   * @private
   */
  #pickRole(role) {
    if (!ITEM_ROLES.includes(role)) return;
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
    if (field === 'rd' || field === 'rb') field = 'penetration';
    const container = field === 'name'
      ? this.element.querySelector('.gear-name')
      : this.element.querySelector(`[data-row="${CSS.escape(field)}"]`);
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

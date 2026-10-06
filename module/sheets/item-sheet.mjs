const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * The sheet for items that are not objects: features and spells.
 *
 * Physical gear has the row editor in
 * [`item-gear-sheet.mjs`](./item-gear-sheet.mjs), which knows about roles.
 * What is left here is the plain description sheet: name, picture, the
 * description and, on a spell, its level. Every change writes through.
 * @extends {ItemSheetV2}
 */
export class TnoItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['tno', 'sheet', 'item', 'item-plain'],
    position: { width: 520, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { postChat: TnoItemSheet.#onPostChat },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/item/item-sheet.hbs', root: true },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.document.toObject(false).system;
    context.isSpell = this.item.type === 'spell';

    // Enrichment turns text like `[[/r 1d20]]` into buttons.
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description,
      {
        secrets: this.document.isOwner,
        rollData: this.item.getRollData(),
        relativeTo: this.item,
      }
    );

    // Whether this sheet may offer to delete its own item. Worn gear is held
    // back: the actor's `system.equipment` addresses the piece by id, and
    // deleting it out from under the paper doll would leave a zone pointing at
    // nothing. Features and spells are never worn; the partial is shared with
    // the gear sheet, which is why the check stays.
    context.isWorn = this.item.isWorn;
    context.canDelete = this.isEditable && !context.isWorn;
    return context;
  }

  /**
   * "Show in chat" in the window's menu. It is offered on a sheet the viewer
   * cannot edit too — posting reads the document and writes a chat message,
   * and a locked compendium is the case the control is for.
   * @override
   */
  _getHeaderControls() {
    return [
      { action: 'postChat', icon: 'fa-solid fa-message', label: 'TNO.Item.Overview.Post' },
      ...super._getHeaderControls(),
    ];
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // The delete partial is shared with the gear sheet, which binds it by
    // class too. Foundry closes the sheet once the document is gone.
    this.element.querySelector('.item-self-delete')
      ?.addEventListener('click', () => this.item.confirmDelete());
  }

  /** @this {TnoItemSheet} */
  static #onPostChat() {
    this.item.roll();
  }
}

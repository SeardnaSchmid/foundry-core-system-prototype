/**
 * The sheet for items that are not objects: features and spells.
 *
 * Physical gear left here for the row editor in
 * [`item-gear-sheet.mjs`](./item-gear-sheet.mjs), which is built on
 * ApplicationV2 and knows about roles. What is left is the plain
 * description sheet those two types have always had, and it stays
 * on V1 because rewriting it would change nothing a player can see.
 * @extends {ItemSheet}
 */
export class TnoItemSheet extends ItemSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['tno', 'sheet', 'item'],
      width: 520,
      height: 480,
      tabs: [
        {
          navSelector: '.sheet-tabs',
          contentSelector: '.sheet-body',
          initial: 'description',
        },
      ],
    });
  }

  /** @override */
  get template() {
    const path = 'systems/tno/templates/item';
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.hbs`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.hbs`.
    return `${path}/item-${this.item.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve base data structure.
    const context = super.getData();

    // Use a safe clone of the item data for further operations.
    const itemData = this.document.toObject(false);

    // Enrich description info for display
    // Enrichment turns text like `[[/r 1d20]]` into buttons
    context.enrichedDescription = await TextEditor.enrichHTML(
      this.item.system.description,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Necessary in v11, can be removed in v12
        async: true,
        // Data to fill in for inline rolls
        rollData: this.item.getRollData(),
        // Relative UUID resolution
        relativeTo: this.item,
      }
    );

    // Add the item's data to context.data for easier access, as well as flags.
    context.system = itemData.system;
    context.flags = itemData.flags;

    // Adding a pointer to CONFIG.TNO
    context.config = CONFIG.TNO;

    // Whether this sheet may offer to delete its own item. Worn gear is held
    // back: the actor's `system.equipment` addresses the piece by id, and
    // deleting it out from under the paper doll would leave a zone pointing at
    // nothing. Taking it off is one click and hands it back to the carry grid,
    // so the sheet says that rather than showing a control that would refuse.
    context.isWorn = this.item.isWorn;
    context.canDelete = this.isEditable && !context.isWorn;

    return context;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Roll handlers, click handlers, etc. would go here.

    // Delete this item, with the same confirmation the actor's inventory list
    // uses. Foundry closes the sheet once the document is gone, so there is
    // nothing to tear down here.
    html.on('click', '.item-self-delete', () => this.item.confirmDelete());
  }
}

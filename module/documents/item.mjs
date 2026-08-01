import { wornItemIds } from '../helpers/inventory.mjs';

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class TnoItem extends Item {
  /**
   * Whether the character this item belongs to is currently wearing it. Worn
   * gear is the one state the item itself cannot speak for: the zone map lives
   * on the actor, because only a single map can stop two chest pieces from both
   * claiming `torso`.
   * @returns {boolean}
   * @see wornItemIds
   */
  get isWorn() {
    return wornItemIds(this.parent?.system?.equipment).has(this.id);
  }

  /**
   * Ask before deleting, then delete. Lives on the document rather than in
   * either sheet because both the actor's inventory list and the item's own
   * sheet offer the same irreversible action and must phrase it identically —
   * and because the name has to be escaped before it goes into the dialog's
   * HTML body, which is easy to forget at one of two call sites.
   * @returns {Promise<TnoItem|void>} The deleted item, or nothing if cancelled.
   */
  async confirmDelete() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('TNO.Item.DeleteTitle') },
      content: game.i18n.format('TNO.Item.DeleteConfirm', {
        name: foundry.utils.escapeHTML(this.name),
      }),
    });
    if (!confirmed) return;
    return this.delete();
  }

  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? '',
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }
}

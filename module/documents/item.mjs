import { wornItemIds } from '../helpers/inventory.mjs';
import { hasRole } from '../helpers/items.mjs';

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
   * Post the item to chat. Nothing here rolls dice.
   *
   * An item used to carry a `system.formula`, defaulting to `d20 + @str.value`.
   * That was Foundry boilerplate and it contradicted the system it shipped in:
   * TNO rolls 3d20, discards the highest and the lowest, and asks you to come
   * in *under* Attribut plus Fertigkeit. No single formula an object can hold
   * resolves that, and the attack chain — RD against RH to pick the
   * Schadenswert, then that against RW — is not one roll to begin with.
   *
   * So the item says what it is and the player picks the Probe. When the
   * Kampfregeln are implemented this is where their entry point goes.
   */
  async roll() {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor: this.name,
      content: this.system.description ?? '',
    });
  }

  /**
   * Spend one item from the stack and announce its authored effects in chat.
   * This does not apply a mechanical effect—the effect texts are free authoring—but it
   * makes the one rule-backed state change the item can perform explicit.
   */
  async consume() {
    if (!hasRole(this, 'consumable')) return;
    const remaining = Math.max(0, Number(this.system.quantity) || 0);
    if (remaining <= 0) {
      ui.notifications.warn(game.i18n.localize('TNO.Item.Overview.NoUses'));
      return;
    }

    await this.update({ 'system.quantity': remaining - 1 });
    const authored = (this.system.consumableEffects ?? [])
      .map((effect) => String(effect?.text ?? '').trim())
      .filter(Boolean)
      .map((effect) => `<li>${foundry.utils.escapeHTML(effect)}</li>`)
      .join('');
    const summary = authored ? `<ul>${authored}</ul>` : '';
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor: game.i18n.format('TNO.Item.Overview.UsedFlavor', { name: this.name }),
      content: `${summary}${this.system.description ?? ''}`,
    });
  }
}

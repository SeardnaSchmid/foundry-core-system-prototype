/**
 * Copying a piece of gear off a chat card and onto a character sheet.
 *
 * A posted item card is a record of the thing, not a link to it: the card
 * carries the item's own data in `flags.tno.item`, so the copy still works
 * after the original has been sold, edited or deleted, and a card posted from
 * a compendium browser needs no pack to still be there. That is also why this
 * is a *copy* and never a hand-over — the poster keeps their piece, and two
 * players clicking the same card both get one. Passing an object from one
 * character to another is a table decision, and the sheet the poster owns is
 * where they take theirs out of the inventory.
 *
 * The receiving actor is always asked for, never inferred. A player with one
 * character answers a one-line dialog; a GM with thirty NPCs would otherwise
 * have to notice, before clicking, which token happened to be selected.
 */
import { isGear } from './items.mjs';

/**
 * Document fields that describe the posted item's *original* rather than the
 * thing itself, and so must not travel with a copy: its identity, where it sat
 * in someone's list, and who could see it.
 */
const NON_TRAVELLING_FIELDS = ['_id', '_stats', 'folder', 'sort', 'ownership'];

/**
 * The subset of an item's data a chat card carries, and the exact object the
 * copy is created from. Everything else about the item travels — name, image,
 * roles, every authored value, its effects and its stack size. The stack is
 * deliberate: `quantity` is an authored property of the posted thing ("20
 * Bolzen"), not a separate offer of how many are on the table.
 *
 * @param {object} data  A fresh `item.toObject()`; not mutated.
 * @returns {object} Creation data for `createEmbeddedDocuments('Item', …)`.
 */
export function travellingItemData(data) {
  const copy = { ...data };
  for (const field of NON_TRAVELLING_FIELDS) delete copy[field];
  return copy;
}

/**
 * The actors a user may copy an item onto, in the order the picker offers
 * them: their own character first, then everything else they own by name.
 *
 * Ownership is the only filter. An NPC holds gear the same way a character
 * does, and a GM stocking a merchant is the second reason this feature exists.
 *
 * @param {Actor[]} actors  Every actor in the world.
 * @param {?string} preferredId  The user's assigned character, if they have one.
 * @returns {Actor[]}
 */
export function receivingActors(actors, preferredId = null) {
  const owned = actors.filter((actor) => actor.isOwner);
  // Partitioned rather than sorted with a "mine wins" comparator: that
  // comparator contradicts itself when asked about two elements neither of
  // which is the preferred one in the same pass, and the result then depends on
  // the engine's sort order.
  return [
    ...owned.filter((actor) => actor.id === preferredId),
    ...owned
      .filter((actor) => actor.id !== preferredId)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

/**
 * The flag payload for a posted item, or nothing for the item types that have
 * no inventory to be copied into. Feature and spell are not objects — they
 * cost no slots and are created from their own lists — so their chat card
 * stays the plain description it has always been.
 *
 * @param {Item} item
 * @returns {?object}
 */
export function postedItemFlag(item) {
  return isGear(item) ? { item: travellingItemData(item.toObject()) } : null;
}

/**
 * Ask which actor should receive the copy. Always asked, even for a user who
 * owns exactly one actor — see the module docblock.
 *
 * @param {Actor[]} actors  Candidates, already in offer order.
 * @param {string} itemName
 * @returns {Promise<?Actor>}
 * @private
 */
async function promptReceivingActor(actors, itemName) {
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/tno/templates/apps/take-item-dialog.hbs',
    {
      prompt: game.i18n.format('TNO.Item.Chat.TakePrompt', { item: itemName }),
      actors: actors.map((actor, index) => ({
        id: actor.id,
        name: actor.name,
        selected: index === 0,
      })),
    }
  );

  const chosen = await foundry.applications.api.DialogV2.prompt({
    // `dialog` is DialogV2's own class and has to be passed back: the options
    // array replaces the default rather than extending it. `tno` is what puts
    // the content inside this system's stylesheet.
    classes: ['dialog', 'tno', 'take-item-dialog'],
    window: { title: game.i18n.localize('TNO.Item.Chat.TakeTitle') },
    position: { width: 320 },
    content,
    ok: {
      icon: 'fa-solid fa-hand-holding',
      label: game.i18n.localize('TNO.Item.Chat.Take'),
      callback: (event, button) => button.form.elements.actor.value,
    },
    rejectClose: false,
  });
  if (!chosen) return null;
  return game.actors.get(chosen) ?? null;
}

/**
 * Copy the item a chat card carries onto an actor the clicking user owns.
 *
 * @param {ChatMessage} message
 * @returns {Promise<?Item>} The created item, or nothing if there was nowhere
 *   to put it or the user cancelled.
 */
export async function takeItemFromMessage(message) {
  const source = message?.flags?.tno?.item;
  if (!source) return null;

  const candidates = receivingActors([...game.actors], game.user.character?.id ?? null);
  if (!candidates.length) {
    ui.notifications.warn(game.i18n.localize('TNO.Item.Chat.NoActor'));
    return null;
  }

  const actor = await promptReceivingActor(candidates, source.name);
  if (!actor) return null;

  const [created] = await actor.createEmbeddedDocuments('Item', [
    foundry.utils.deepClone(source),
  ]);
  if (!created) return null;

  ui.notifications.info(
    game.i18n.format('TNO.Item.Chat.Taken', { item: created.name, actor: actor.name })
  );
  return created;
}

/**
 * Append the "take this" action to a posted item card.
 *
 * Rendered per viewer off the flag rather than baked into the message content,
 * for the same reason the edge panel is: the card is a record every client
 * renders for itself, and whether there is anywhere to put the item is a fact
 * about the reader, not about the message. A viewer who owns no actor at all
 * gets the card without the button instead of one that can only fail.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} html  The rendered message element.
 */
export function renderItemTakeAction(message, html) {
  if (!message?.flags?.tno?.item) return;

  const card = html.querySelector('.item-chat-summary');
  if (!card || card.querySelector('.item-chat-actions')) return;
  if (!receivingActors([...game.actors]).length) return;

  const footer = document.createElement('footer');
  footer.className = 'item-popover-actions item-chat-actions';
  footer.innerHTML = `
    <div class="item-popover-actions-row item-popover-actions-row--lead">
      <button type="button" class="primary">
        <i class="fa-solid fa-hand-holding" aria-hidden="true"></i>${game.i18n.localize('TNO.Item.Chat.Take')}
      </button>
    </div>`;

  const button = footer.querySelector('button');
  // Set as a property, not interpolated into the markup above: the item name is
  // authored text and would have to be escaped on its way into HTML.
  button.title = game.i18n.format('TNO.Item.Chat.TakeHint', { item: message.flags.tno.item.name });
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await takeItemFromMessage(message);
  });

  card.appendChild(footer);
}

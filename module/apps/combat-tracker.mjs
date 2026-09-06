import { actorStance } from '../helpers/combat-actions.mjs';
import { emitInterrupt } from '../helpers/combat-socket.mjs';
import { stanceEntry } from '../helpers/stances.mjs';

/** The drag payload type used to reorder combatants before a combat starts. */
const DRAG_TYPE = 'application/x-tno-combatant';

/**
 * The sidebar combat tracker, with the two things this system's combat model
 * needs it to say.
 *
 * **Haltung.** A combatant's Haltung decides which defence they may make, so it
 * is the one piece of state everyone at the table needs to see without opening a
 * sheet. It is read through the same `helpers/stances.mjs` the character sheet
 * uses, so an unknown key falls back the same way in both places.
 *
 * **Who has already gone.** The turn order is a history rather than a list (see
 * [`documents/combat.mjs`](../documents/combat.mjs)), so a row is either spent
 * or still owed a turn, and only the latter may interrupt.
 *
 * The display *order* is settled here and nowhere else: `combatTrackerOrder`
 * reverses the rendered rows and leaves `combat.turns` untouched, which is what
 * lets the setting be presentation without becoming a second rule.
 *
 * @extends {foundry.applications.sidebar.tabs.CombatTracker}
 */
export class TnoCombatTracker extends foundry.applications.sidebar.tabs.CombatTracker {
  /**
   * @override
   * Action maps rather than this system's usual `#delegate` pattern: the parent
   * class already routes its own controls through `actions`, and adding a second
   * dispatch mechanism beside it would mean two places to look for one click.
   */
  static DEFAULT_OPTIONS = {
    actions: {
      interruptCombatant: TnoCombatTracker.#onInterruptCombatant,
    },
  };

  /**
   * @override
   * `PARTS` is read off the concrete class rather than merged along the
   * inheritance chain, so the two unchanged core parts have to be restated here.
   */
  static PARTS = {
    header: {
      template: 'templates/sidebar/tabs/combat/header.hbs',
    },
    tracker: {
      template: 'systems/tno/templates/sidebar/combat-tracker.hbs',
      scrollable: [''],
    },
    footer: {
      template: 'templates/sidebar/tabs/combat/footer.hbs',
    },
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareTurnContext(combat, combatant, index) {
    const turn = await super._prepareTurnContext(combat, combatant, index);
    turn.stance = stanceEntry(actorStance(combatant.actor));
    turn.activated = (combat.activatedIds ?? []).includes(combatant.id);
    turn.canInterrupt = combat.started && combatant.isOwner && !turn.activated;
    return turn;
  }

  /** @inheritDoc */
  async _prepareTrackerContext(context, options) {
    await super._prepareTrackerContext(context, options);
    // Presentation only. The rule is fixed at slowest-first in either direction,
    // so this reverses the rows and never the turn order behind them.
    if (context.turns && this.#trackerOrder === 'descending') context.turns.reverse();
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#bindReordering();
  }

  /* -------------------------------------------- */
  /*  Reordering before the combat starts         */
  /* -------------------------------------------- */

  /** The combatant being dragged, while a drag is in flight. @type {Combatant|null} */
  #dragged = null;

  /** @returns {'ascending'|'descending'} */
  get #trackerOrder() {
    return game.settings.get('tno', 'combatTrackerOrder');
  }

  /**
   * Let the GM settle the order by hand before the first activation.
   *
   * Dragging writes an initiative value rather than a sort key: the order *is*
   * the initiative, and inventing a second ordering field beside it would give
   * the tracker two answers to the same question.
   */
  #bindReordering() {
    const combat = this.viewed;
    const tracker = this.element.querySelector('ol.combat-tracker');
    if (!combat || !tracker || !game.user.isGM || combat.started) return;

    tracker.addEventListener('dragover', (event) => {
      if (!this.#isCombatantDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    tracker.addEventListener('drop', (event) => this.#onDrop(event, tracker, combat));

    for (const li of tracker.querySelectorAll('li.combatant')) {
      const combatant = combat.combatants.get(li.dataset.combatantId);
      if (combatant) this.#enableDrag(li, combatant, combat);
    }
  }

  /**
   * @param {HTMLElement} li
   * @param {Combatant} combatant
   * @param {Combat} combat
   */
  #enableDrag(li, combatant, combat) {
    li.draggable = true;
    li.addEventListener('dragstart', (event) => {
      this.#dragged = combatant;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(DRAG_TYPE, combatant.id);
      event.dataTransfer.setData('text/plain', combatant.id);
    });
    li.addEventListener('dragend', () => {
      this.#dragged = null;
      li.classList.remove('tno-drop-target');
    });
    li.addEventListener('dragover', (event) => {
      if (!this.#isCombatantDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      li.classList.add('tno-drop-target');
    });
    li.addEventListener('dragleave', () => li.classList.remove('tno-drop-target'));
    li.addEventListener('drop', (event) => this.#onDrop(event, li, combat));
  }

  /**
   * @param {DragEvent} event
   * @returns {boolean}
   */
  #isCombatantDrag(event) {
    return !!this.#dragged || !!event.dataTransfer?.types.includes(DRAG_TYPE);
  }

  /**
   * Drop a combatant between its two new neighbours and give it an initiative
   * value that keeps it there.
   * @param {DragEvent} event
   * @param {HTMLElement} target  The row dropped on, or the list itself
   * @param {Combat} combat
   */
  #onDrop(event, target, combat) {
    if (!this.#isCombatantDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const draggedId = event.dataTransfer?.getData(DRAG_TYPE);
    const dragged = this.#dragged ?? combat.combatants.get(draggedId);
    this.#dragged = null;
    if (!dragged) return;

    const tracker = target.tagName === 'OL' ? target : target.closest('ol.combat-tracker');
    const targetCombatant = target.tagName === 'LI'
      ? combat.combatants.get(target.dataset.combatantId)
      : undefined;
    if (!tracker || targetCombatant === dragged) return;

    // The rendered order, which is the display order — so the arithmetic below
    // has to know which way the list is pointing.
    const ordered = [...tracker.querySelectorAll('li.combatant')]
      .map((li) => combat.combatants.get(li.dataset.combatantId))
      .filter((combatant) => combatant && combatant !== dragged);

    let insertAt = ordered.length;
    if (targetCombatant) {
      const rect = target.getBoundingClientRect();
      const dropAfter = event.clientY >= rect.top + rect.height / 2;
      insertAt = ordered.indexOf(targetCombatant) + (dropAfter ? 1 : 0);
    }

    const ascending = this.#trackerOrder === 'ascending';
    const above = ordered[insertAt - 1]?.initiative;
    const below = ordered[insertAt]?.initiative;
    let initiative;
    if (Number.isFinite(above) && Number.isFinite(below)) initiative = (above + below) / 2;
    else if (Number.isFinite(above)) initiative = above + (ascending ? 1 : -1);
    else if (Number.isFinite(below)) initiative = below + (ascending ? -1 : 1);
    else initiative = 0;

    combat.setInitiative(dragged.id, initiative);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Pull a combatant's activation forward.
   *
   * The GM writes the Combat directly; anyone else asks them to, because the
   * turn order is shared state and a player may not write it — see
   * [`helpers/combat-socket.mjs`](../helpers/combat-socket.mjs).
   * @this {TnoCombatTracker}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onInterruptCombatant(event, target) {
    event.preventDefault();
    event.stopPropagation();

    const combat = this.viewed;
    const combatantId = target.closest('[data-combatant-id]')?.dataset.combatantId;
    if (!combat?.started || !combatantId) return;

    if (game.user.isGM) combat.activateEarly(combatantId);
    else emitInterrupt(combat.id, combatantId);
  }
}

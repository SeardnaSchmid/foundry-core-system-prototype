import { wornItemIds } from '../helpers/inventory.mjs';
import { prepareGearSummaryContext } from '../helpers/item-summary.mjs';
import { getSkillDefinitions } from '../helpers/skills.mjs';
import {
  canWeaponAttack,
  canWeaponParry,
  clampGearNumber,
  hasRole,
  isGear,
  usesMelee,
  weaponAttribute,
  weaponDkDifferenceChoices,
  weaponHandlingModifier,
  weaponRangeChoices,
  weaponRequirementMalus,
  weaponSkillRank,
} from '../helpers/items.mjs';

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
    const content = isGear(this)
      ? await foundry.applications.handlebars.renderTemplate(
          'systems/tno/templates/chat/item-summary.hbs',
          prepareGearSummaryContext(this)
        )
      : this.system.description ?? '';
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      rollMode: game.settings.get('core', 'rollMode'),
      flavor: this.name,
      content,
    });
  }

  /** Open a weapon attack with its authored WA and FV locked in place. */
  openWeaponCheck() {
    const actor = this.actor;
    const key = this.system.fv?.skill;
    const definition = getSkillDefinitions(actor)[key];
    if (!actor?.isOwner || !hasRole(this, 'weapon') || !canWeaponAttack(this.system, { skillDefined: !!definition })) return;
    const contextChoices = usesMelee(this.system)
      ? weaponDkDifferenceChoices().map((choice) => ({
          ...choice,
          label: this.#signedValue(choice.value),
          componentLabel: game.i18n.localize('TNO.Combat.DkDifference'),
        }))
      : weaponRangeChoices(this.system).map((choice) => {
          const band = game.i18n.localize(`TNO.Weapons.Band.${choice.key.charAt(0).toUpperCase()}${choice.key.slice(1)}`);
          return {
            ...choice,
            label: band,
            componentLabel: game.i18n.format('TNO.Combat.RangeComponent', { band }),
          };
        });
    return new game.tno.TnoRollDialog(actor, {
      attributeA: weaponAttribute(this.system),
      lockAttribute: true,
      skill: { key, label: definition.label, value: weaponSkillRank(actor, this.system) },
      fixedModifiers: this.#weaponFixedModifiers(actor, 'active'),
      preRollContext: {
        label: game.i18n.localize(usesMelee(this.system) ? 'TNO.Combat.DkDifference' : 'TNO.Combat.RangeBand'),
        placeholder: game.i18n.localize('TNO.Combat.ContextPlaceholder'),
        choices: contextChoices,
      },
      flavor: game.i18n.format('TNO.Combat.AttackFlavor', { weapon: this.name }),
    }).render(true);
  }

  /** Open an independent melee parry with its authored WA and FV locked. */
  openWeaponParry() {
    const actor = this.actor;
    const key = this.system.fv?.skill;
    const definition = getSkillDefinitions(actor)[key];
    if (!actor?.isOwner || !hasRole(this, 'weapon') || !canWeaponParry(this.system, { skillDefined: !!definition })) return;
    return new game.tno.TnoRollDialog(actor, {
      attributeA: weaponAttribute(this.system),
      lockAttribute: true,
      skill: { key, label: definition.label, value: weaponSkillRank(actor, this.system) },
      fixedModifiers: this.#weaponFixedModifiers(actor, 'passive'),
      flavor: game.i18n.format('TNO.Combat.ParryFlavor', { weapon: this.name }),
    }).render(true);
  }

  /** Shared immutable handling and requirement components for weapon rolls. */
  #weaponFixedModifiers(actor, handling) {
    const requirementMalus = weaponRequirementMalus(actor, this.system);
    return [
      {
        label: game.i18n.localize(handling === 'active' ? 'TNO.Combat.ActiveHandling' : 'TNO.Combat.PassiveHandling'),
        value: weaponHandlingModifier(this.system, handling),
      },
      ...(requirementMalus ? [{
        label: game.i18n.localize('TNO.Combat.RequirementMalus'),
        value: requirementMalus,
      }] : []),
    ];
  }

  /** A localized signed integer for a direct DK-difference choice. */
  #signedValue(value) {
    if (value > 0) return `+${value}`;
    if (value < 0) return `−${Math.abs(value)}`;
    return '0';
  }

  /** Nudge a consumable stack's remaining stock without going below zero. */
  adjustStock(by) {
    if (!hasRole(this, 'consumable') || !Number.isFinite(by)) return;
    const field = 'system.quantity';
    const current = Number(this.system.quantity) || 0;
    const next = clampGearNumber(field, current + by);
    if (!Number.isFinite(next)) return;
    return this.update({ [field]: next });
  }

}

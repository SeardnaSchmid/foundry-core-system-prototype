import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { colorForValue } from '../helpers/heatmap.mjs';
import { JosterRollDialog } from '../apps/roll-dialog.mjs';
import { JosterSkillAdvanceDialog } from '../apps/skill-advance-dialog.mjs';
import { JOSTER_ADVANTAGE, rollJoster } from '../helpers/dice.mjs';

// Value ranges from the "Attribut-Heatmap" spec: Basiswert (base) is the
// trained/leveled rating, Temp-Wert (value) is the current, independently
// adjustable play value shown large in "temp" mode.
const BASE_MIN = 1;
const BASE_MAX = 10;
const TEMP_MIN = 0;
const TEMP_MAX = 20;

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class JosterActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['joster', 'sheet', 'actor'],
      width: 600,
      height: 600,
      tabs: [
        {
          navSelector: '.sheet-tabs',
          contentSelector: '.sheet-body',
          initial: 'basics',
        },
      ],
    });
  }

  /** @override */
  get template() {
    return `systems/joster/templates/actor/actor-${this.actor.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.document.toObject(false);

    // Add the actor's data to context.data for easier access, as well as flags.
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Adding a pointer to CONFIG.JOSTER
    context.config = CONFIG.JOSTER;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actorData.type == 'npc') {
      this._prepareItems(context);
    }

    // Enrich biography info for display
    // Enrichment turns text like `[[/r 1d20]]` into buttons
    context.enrichedBiography = await TextEditor.enrichHTML(
      this.actor.system.biography,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Necessary in v11, can be removed in v12
        async: true,
        // Data to fill in for inline rolls
        rollData: this.actor.getRollData(),
        // Relative UUID resolution
        relativeTo: this.actor,
      }
    );

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(
      // A generator that returns all effects stored on the actor
      // as well as any items
      this.actor.allApplicableEffects()
    );

    return context;
  }

  /**
   * Character-specific context modifications
   *
   * @param {object} context The context object to mutate
   */
  _prepareCharacterData(context) {
    // Build the primary attribute grid (one row per CONFIG.JOSTER.attributeRows
    // entry, one column per physical/social/mental category), mirroring the
    // layout of the "Attribute" table in the rulebook. Cells and row/column
    // sum badges are all color-graded using the "Attribut-Heatmap" prototype's
    // logic: each is graded against its own fixed absolute 1-10-per-attribute
    // scale, independently of every other cell/badge on the sheet.
    const abilities = context.system.abilities;
    const rows = CONFIG.JOSTER.attributeRows;
    const categoryKeys = Object.keys(CONFIG.JOSTER.attributeCategories);

    context.attributeGrid = {
      colHeaders: categoryKeys.map((catKey) => ({
        label: game.i18n.localize(CONFIG.JOSTER.attributeCategories[catKey]),
      })),
      rows: rows.map((row, ri) => ({
        label: game.i18n.localize(CONFIG.JOSTER.attributeRowLabels[ri]),
        cells: row.map((key) => {
          const labelKey = CONFIG.JOSTER.abilities[key];
          const ability = abilities[key];
          const baseValue = ability?.base ?? 0;
          const tempValue = ability?.value ?? 0;
          const delta = tempValue - baseValue;
          const isCritical = tempValue === 0;
          const dc = colorForValue(baseValue);

          // Zero cells swap their tooltip for the attribute's specific
          // in-fiction consequence (e.g. "FIN 0: keine Handaktionen")
          // instead of the generic ability description.
          const abilitySuffix = labelKey.split('.')[2];
          const abbr = game.i18n.localize(labelKey.replace('.long', '.abbr')).toUpperCase();
          const zeroConsequence = game.i18n.localize(`JOSTER.AttributeZero.${abilitySuffix}`);
          const zeroHint = `${abbr} 0: ${zeroConsequence}`;

          return {
            key,
            label: game.i18n.localize(labelKey),
            hint: isCritical ? zeroHint : game.i18n.localize(labelKey.replace('.long', '.hint')),
            tempValue,
            baseValue,
            tempHint: game.i18n.localize('JOSTER.AttributeCurrent'),
            baseHint: game.i18n.localize('JOSTER.AttributeBase'),
            cellBg: isCritical ? '#3D1418' : dc.bg,
            textColor: isCritical ? '#FFD9DC' : dc.textColor,
            critBorder: isCritical ? 'rgba(255,90,100,0.7)' : 'transparent',
            isPeak: dc.isPeak && !isCritical,
            isCritical,
            isZero: isCritical,
            hasDelta: delta !== 0,
            deltaLabel: (delta > 0 ? '+' : '') + delta,
            deltaBg: delta > 0 ? '#1F6B3A' : '#7A2028',
            deltaText: delta > 0 ? '#E9FFEA' : '#FFE1E4',
            stepperBorder: isCritical ? 'rgba(255,217,220,0.5)' : 'rgba(60,50,20,0.3)',
            stepperBg: isCritical ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
            stepperColor: isCritical ? '#FFD9DC' : '#332D22',
          };
        }),
      })),
    };

    // Build the skill list, grouped by category, in JOSTER.skillCategories order.
    // Categories without any skills yet (WIP groups) still render, empty.
    const skills = context.system.skills ?? {};
    context.skillGroups = Object.entries(CONFIG.JOSTER.skillCategories).map(([catKey, catLabelKey]) => ({
      key: catKey,
      label: game.i18n.localize(catLabelKey),
      skills: Object.entries(CONFIG.JOSTER.skills)
        .filter(([, skill]) => skill.category === catKey)
        .map(([key, skill]) => ({
          key,
          label: game.i18n.localize(skill.label),
          // Kept only to preselect the roll dialog's attribute; the system
          // doesn't bind a skill to one fixed attribute, so it's no longer
          // shown in the row itself (see JosterRollDialog's attribute chips).
          attribute: skill.attribute,
          rank: skills[key]?.value ?? 0,
          xp: skills[key]?.xp ?? 0,
        })),
    }));
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const features = [];
    const spells = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
    };

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      // Append to gear.
      if (i.type === 'item') {
        gear.push(i);
      }
      // Append to features.
      else if (i.type === 'feature') {
        features.push(i);
      }
      // Append to spells.
      else if (i.type === 'spell') {
        if (i.system.spellLevel != undefined) {
          spells[i.system.spellLevel].push(i);
        }
      }
    }

    // Assign and return
    context.gear = gear;
    context.features = features;
    context.spells = spells;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.on('click', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Heatmap +/- steppers: adjust temp (value) by default, or base while
    // holding Shift, since base is the rarer, more deliberate change.
    html.on('click', '.heatmap-stepper', (ev) => {
      const { key, action } = ev.currentTarget.dataset;
      const field = ev.shiftKey ? 'base' : 'value';
      this._stepAttribute(key, action === 'increment' ? 1 : -1, field);
    });

    // Reset an attribute's temp value back to its base value.
    html.on('click', '.heatmap-delta', (ev) => {
      this._resetTemp(ev.currentTarget.dataset.key);
    });

    // Open the skill advancement dialog.
    html.on('click', '.skill-advance-button', (ev) => {
      ev.preventDefault();
      const key = ev.currentTarget.dataset.skill;
      const skillConfig = CONFIG.JOSTER.skills[key];
      const skill = this.actor.system.skills?.[key] ?? {};
      new JosterSkillAdvanceDialog(this.actor, {
        key,
        label: game.i18n.localize(skillConfig?.label ?? key),
        rank: skill.value ?? 0,
        xp: skill.xp ?? 0,
      }).render(true);
    });

    // Problem-solving reserve pool: editable directly, clamped to
    // 0..max. Stored as "spent" (max minus the edited value) since the
    // pool itself is derived, recomputed from problemSolving.spent. A
    // manual decrease is a point spent outside the dedicated actions
    // (Idee haben, Fehler Analysieren), so it's announced in chat too.
    html.on('change', '.reserve-value-input', (ev) => {
      const input = ev.currentTarget;
      const max = this.actor.system.derived?.solveReserveMax ?? 0;
      const current = this.actor.system.derived?.solveReserve ?? 0;
      const value = Math.clamp(Number(input.value) || 0, 0, max);
      input.value = value;
      this.actor.update({ 'system.problemSolving.spent': max - value });

      if (value < current) {
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format('JOSTER.Chat.SolveReserveSpent', {
            name: this.actor.name,
            count: current - value,
            current: value,
            max,
          }),
        });
      }
    });

    // Add Inventory Item
    html.on('click', '.item-create', this._onItemCreate.bind(this));

    // Delete Inventory Item
    html.on('click', '.item-delete', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Active Effect management
    html.on('click', '.effect-control', (ev) => {
      const row = ev.currentTarget.closest('li');
      const document =
        row.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(ev, document);
    });

    // Rollable abilities. "Fehler Analysieren" goes through this handler
    // via its data-roll-type. The other three problem-solving actions
    // don't: "Idee haben" is a pre-edge, offered as a toggle inside the
    // roll dialog itself (see JosterRollDialog); "Fehler finden" and
    // "Neuer Versuch" are post-edges, triggered from a failed roll's own
    // chat card (see chat.mjs), not from the sheet.
    html.on('click', '.rollable', this._onRoll.bind(this));

    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system['type'];

    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Adjust an ability's temp value or base rating by +/-1. Adjusting the
   * base (field "base") syncs the temp value to match, per the
   * "Attribut-Heatmap" spec: changing the base clears any temp deviation.
   *
   * @param {string} key    Ability key, e.g. "str"
   * @param {number} delta  +1 or -1
   * @param {"value"|"base"} field  Which number to adjust
   * @private
   */
  async _stepAttribute(key, delta, field = 'value') {
    const ability = this.actor.system.abilities[key];
    if (!ability) return;

    if (field === 'value') {
      const next = Math.clamp(ability.value + delta, TEMP_MIN, TEMP_MAX);
      await this.actor.update({ [`system.abilities.${key}.value`]: next });
    } else {
      const next = Math.clamp(ability.base + delta, BASE_MIN, BASE_MAX);
      await this.actor.update({
        [`system.abilities.${key}.base`]: next,
        [`system.abilities.${key}.value`]: next,
      });
    }
  }

  /**
   * Reset an ability's temp value back to its base value.
   * @param {string} key  Ability key, e.g. "str"
   * @private
   */
  async _resetTemp(key) {
    const ability = this.actor.system.abilities[key];
    if (!ability) return;
    await this.actor.update({ [`system.abilities.${key}.value`]: ability.base });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }

      // Open the Joster dice mechanic dialog, preselecting the clicked ability.
      if (dataset.rollType == 'ability') {
        return new JosterRollDialog(this.actor, {
          attributeA: dataset.ability,
          flavor: dataset.label,
        }).render(true);
      }

      // Open the roll dialog in free mode: the player picks any attribute
      // and types in a free skill value not tied to a defined skill.
      if (dataset.rollType == 'free') {
        return new JosterRollDialog(this.actor, {
          freeSkill: true,
          flavor: game.i18n.localize('JOSTER.Roll.FreeTitle'),
        }).render(true);
      }

      // Open the roll dialog for a skill. The linked attribute and skill
      // rank are fixed threshold components; the dialog's bonus field is
      // left at 0 for the player to dial in a situational modifier.
      if (dataset.rollType == 'skill') {
        const rank = this.actor.system.skills?.[dataset.skill]?.value ?? 0;
        return new JosterRollDialog(this.actor, {
          attributeA: dataset.ability,
          skill: { key: dataset.skill, label: dataset.label, value: rank },
          flavor: dataset.label,
        }).render(true);
      }

      // Sixth Sense: a standard 3d20 roll against the derived value itself,
      // via the regular roll dialog in "fixed" mode, since it's not linked
      // to any attribute or skill.
      if (dataset.rollType == 'sixthSense') {
        return new JosterRollDialog(this.actor, {
          fixedValue: { label: dataset.label, value: this.actor.system.derived?.sixthSense ?? 0 },
          flavor: dataset.label,
        }).render(true);
      }

      // Fehler Analysieren: a standard 3d20 roll against the derived value,
      // same as any other check, after a confirmation dialog and a short
      // chat message announcing the attempt. On success, regains one
      // reserve point (up to the pool's max).
      if (dataset.rollType == 'analyzeFlaw') {
        const confirmedAnalyze = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('JOSTER.Dialog.SolveAnalyzeFlawTitle') },
          content: game.i18n.localize('JOSTER.Dialog.SolveAnalyzeFlawContent'),
        });
        if (!confirmedAnalyze) return;

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format('JOSTER.Chat.SolveAnalyzeFlawAttempt', { name: this.actor.name }),
        });

        const { success } = await rollJoster({
          threshold: this.actor.system.derived?.solveAnalyzeFlaw ?? 0,
          advantage: JOSTER_ADVANTAGE.none,
          flavor: dataset.label,
          actor: this.actor,
        });
        if (success) {
          const spent = this.actor.system.problemSolving?.spent ?? 0;
          if (spent > 0) {
            await this.actor.update({ 'system.problemSolving.spent': spent - 1 });
            const max = this.actor.system.derived?.solveReserveMax ?? 0;
            const current = this.actor.system.derived?.solveReserve ?? 0;
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: game.i18n.format('JOSTER.Chat.SolveAnalyzeFlawSuccess', { name: this.actor.name, current, max }),
            });
          }
        }
        return;
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }
}

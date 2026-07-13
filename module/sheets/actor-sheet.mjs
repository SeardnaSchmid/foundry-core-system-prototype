import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { colorForValue, colorForRelativeToMax } from '../helpers/heatmap.mjs';
import { JosterRollDialog } from '../apps/roll-dialog.mjs';

// Value ranges from the "Attribut-Heatmap" spec: Basiswert (base) is the
// trained/leveled rating, Temp-Wert (value) is the current, independently
// adjustable play value shown large in "temp" mode.
const BASE_MIN = 1;
const BASE_MAX = 10;
const TEMP_MIN = 0;
const TEMP_MAX = 20;
const SKILL_MIN = 0;
const SKILL_MAX = 10;

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class JosterActorSheet extends ActorSheet {
  /**
   * Which of an ability's two numbers ("temp" = value, "base" = base) is
   * shown large and driven by the +/- steppers. Sheet-instance UI state,
   * not persisted to the actor.
   */
  _attributeMode = 'temp';

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
    // layout of the "Attribute" table in the rulebook. Cells are color-graded
    // using the "Attribut-Heatmap" prototype's logic: each cell is normalized
    // against the character's own min/max base value, while the row/column
    // sum badges are graded relative to the group's max so close sums render
    // as close colors instead of being stretched across the whole scale.
    const abilities = context.system.abilities;
    const rows = CONFIG.JOSTER.attributeRows;
    const categoryKeys = Object.keys(CONFIG.JOSTER.attributeCategories);
    const mode = this._attributeMode;

    const baseValues = rows.flat().map((key) => abilities[key]?.base ?? 0);
    const localMin = Math.min(...baseValues);
    const localMax = Math.max(...baseValues);
    const total = baseValues.reduce((a, b) => a + b, 0);

    const rowSums = rows.map((row) => row.reduce((sum, key) => sum + (abilities[key]?.base ?? 0), 0));
    const colSums = categoryKeys.map((_, ci) => rows.reduce((sum, row) => sum + (abilities[row[ci]]?.base ?? 0), 0));
    const rowMax = Math.max(...rowSums);
    const colMax = Math.max(...colSums);

    context.attributeModeLabel = game.i18n.localize(`JOSTER.AttributeMode.${mode === 'temp' ? 'Temp' : 'Base'}`);
    context.attributeModeColor = mode === 'temp' ? '#332D22' : '#8A7F65';

    context.attributeGrid = {
      total,
      colHeaders: categoryKeys.map((catKey, ci) => ({
        label: game.i18n.localize(CONFIG.JOSTER.attributeCategories[catKey]),
        value: colSums[ci],
        ...colorForRelativeToMax(colSums[ci], colMax),
      })),
      rows: rows.map((row, ri) => ({
        label: game.i18n.localize(CONFIG.JOSTER.attributeRowLabels[ri]),
        sum: rowSums[ri],
        ...colorForRelativeToMax(rowSums[ri], rowMax),
        cells: row.map((key) => {
          const labelKey = CONFIG.JOSTER.abilities[key];
          const ability = abilities[key];
          const baseValue = ability?.base ?? 0;
          const tempValue = ability?.value ?? 0;
          const delta = tempValue - baseValue;
          const isCritical = tempValue === 0;
          const dc = colorForValue(baseValue, localMin, localMax);

          return {
            key,
            label: game.i18n.localize(labelKey),
            hint: game.i18n.localize(labelKey.replace('.long', '.hint')),
            tempValue,
            baseValue,
            tempActive: mode === 'temp',
            baseActive: mode === 'base',
            cellBg: isCritical ? '#3D1418' : dc.bg,
            textColor: isCritical ? '#FFD9DC' : dc.textColor,
            critBorder: isCritical ? 'rgba(255,90,100,0.7)' : 'transparent',
            isPeak: dc.isPeak && !isCritical,
            isCritical,
            hasDelta: delta !== 0,
            deltaLabel: (delta > 0 ? '+' : '') + delta,
            deltaBg: delta > 0 ? 'rgba(140,233,138,0.18)' : 'rgba(255,120,130,0.2)',
            deltaText: delta > 0 ? '#8CE98A' : '#FF7A82',
            stepperBorder: isCritical ? 'rgba(255,217,220,0.5)' : 'rgba(60,50,20,0.3)',
            stepperBg: isCritical ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
            stepperColor: isCritical ? '#FFD9DC' : '#332D22',
          };
        }),
      })),
    };

    // Build the "Abgeleitete Attribute" table from the values computed in
    // JosterActor#_prepareCharacterData (system.derived.*).
    context.derivedAttributes = CONFIG.JOSTER.derivedAttributes.map(({ key, i18n }) => ({
      key,
      value: context.system.derived?.[key],
      label: game.i18n.localize(`JOSTER.DerivedShort.${i18n}`),
      hint: `${game.i18n.localize(`JOSTER.Derived.${i18n}`)}: ${game.i18n.localize(`JOSTER.DerivedHint.${i18n}`)}`,
    }));

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
          attribute: skill.attribute,
          attributeLabel: game.i18n.localize(CONFIG.JOSTER.abilities[skill.attribute]),
          // Always the first 3 letters of the attribute's long name, e.g.
          // "Dexterity" -> "Dex", so it stays correct across localizations
          // without needing a separate translated abbreviation.
          attributeAbbr: game.i18n
            .localize(CONFIG.JOSTER.abilities[skill.attribute])
            .slice(0, 3)
            .replace(/^./, (c) => c.toUpperCase()),
          rank: skills[key]?.value ?? 0,
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

    // Toggle which attribute value (temp/base) the heatmap displays large
    // and the steppers drive. Pure display state, so it works read-only too.
    html.on('click', '.heatmap-mode-toggle', () => {
      this._attributeMode = this._attributeMode === 'temp' ? 'base' : 'temp';
      this.render(false);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Heatmap +/- steppers: adjust temp (value) or base depending on mode.
    html.on('click', '.heatmap-stepper', (ev) => {
      const { key, action } = ev.currentTarget.dataset;
      this._stepAttribute(key, action === 'increment' ? 1 : -1);
    });

    // Reset an attribute's temp value back to its base value.
    html.on('click', '.heatmap-delta', (ev) => {
      this._resetTemp(ev.currentTarget.dataset.key);
    });

    // Skill rank input: validate on change and input
    html.on('change input', '.skill-rank-input', (ev) => {
      const input = ev.currentTarget;
      const value = Math.clamp(Number(input.value) || 0, SKILL_MIN, SKILL_MAX);
      if (value !== Number(input.value)) {
        input.value = value;
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

    // Rollable abilities.
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
   * Handle a heatmap +/- stepper click. In "temp" mode this adjusts the
   * ability's current value (0-20) only. In "base" mode it adjusts the
   * trained base rating (1-10) and syncs the temp value to match, per the
   * "Attribut-Heatmap" spec: changing the base clears any temp deviation.
   *
   * @param {string} key    Ability key, e.g. "str"
   * @param {number} delta  +1 or -1
   * @private
   */
  async _stepAttribute(key, delta) {
    const ability = this.actor.system.abilities[key];
    if (!ability) return;

    if (this._attributeMode === 'temp') {
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
   * Handle a skill rank +/- stepper click.
   * @param {string} key    Skill key, e.g. "brawling"
   * @param {number} delta  +1 or -1
   * @private
   */
  async _stepSkill(key, delta) {
    const skill = this.actor.system.skills?.[key];
    if (!skill) return;
    const next = Math.clamp(skill.value + delta, SKILL_MIN, SKILL_MAX);
    await this.actor.update({ [`system.skills.${key}.value`]: next });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
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

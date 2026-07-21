import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { colorForValue, colorForCritical } from '../helpers/heatmap.mjs';
import { TnoRollDialog } from '../apps/roll-dialog.mjs';
import { TnoAdvanceDialog } from '../apps/advance-dialog.mjs';
import { TnoHeatmapLab } from '../apps/heatmap-lab.mjs';
import { TnoCustomSkillDialog } from '../apps/custom-skill-dialog.mjs';
import { TNO_ADVANTAGE, rollTno } from '../helpers/dice.mjs';
import { getSkillDefinitions, getSkillDefinition } from '../helpers/skills.mjs';

// Value ranges from the "Attribut-Heatmap" spec: Basiswert (base) is the
// trained/leveled rating, Temp-Wert (value) is the current, independently
// adjustable play value shown large in "temp" mode.
const BASE_MIN = 1;
const BASE_MAX = 10;
const TEMP_MIN = 0;
const TEMP_MAX = 20;

/**
 * Case/diacritic-insensitive subsequence fuzzy match: true if every
 * character of `query` appears in `text`, in order, possibly with gaps
 * (e.g. "schl" matches "Schleichen", "sch" matches "Scharfschütze").
 * @param {string} query
 * @param {string} text
 * @returns {boolean}
 */
function fuzzyMatch(query, text) {
  const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = normalize(query);
  const t = normalize(text);
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/**
 * Cumulative XP cost to reach a given skill rank, per the "Charakterentwicklung"
 * level cost table (advancing to level N costs 3*N XP, e.g. rank 3 costs
 * 3+6+9=18 XP in total).
 * @param {number} rank
 * @returns {number}
 */
function skillRankXpCost(rank) {
  return (3 * rank * (rank + 1)) / 2;
}

/**
 * Cumulative XP cost to reach a given attribute rank, per the level cost
 * table (advancing to level N costs N*N XP, e.g. rank 3 costs 1+4+9=14 XP
 * in total).
 * @param {number} rank
 * @returns {number}
 */
function attributeRankXpCost(rank) {
  return (rank * (rank + 1) * (2 * rank + 1)) / 6;
}

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class TnoActorSheet extends ActorSheet {
  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['tno', 'sheet', 'actor'],
      // The slimmed attribute matrix no longer forces a 1200px sheet; 1000px
      // fits the compact matrix plus the three skill columns comfortably.
      width: 1000,
      height: 640,
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
    return `systems/tno/templates/actor/actor-${this.actor.type}-sheet.hbs`;
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

    // Adding a pointer to CONFIG.TNO
    context.config = CONFIG.TNO;

    // The heatmap gradient editor is a GM-facing tuning tool, so its launch
    // button is only rendered for GMs (see the template) rather than sitting
    // in every player's sheet chrome.
    context.isGM = game.user.isGM;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actorData.type == 'npc') {
      this._prepareItems(context);
    }

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
    // Build the primary attribute grid (one row per CONFIG.TNO.attributeRows
    // entry, one column per physical/social/mental category), mirroring the
    // layout of the "Attribute" table in the rulebook. Cells and row/column
    // sum badges are all color-graded using the "Attribut-Heatmap" prototype's
    // logic: each is graded against its own fixed absolute 1-10-per-attribute
    // scale, independently of every other cell/badge on the sheet.
    const abilities = context.system.abilities;
    const rows = CONFIG.TNO.attributeRows;
    const categoryKeys = Object.keys(CONFIG.TNO.attributeCategories);

    context.attributeGrid = {
      colHeaders: categoryKeys.map((catKey) => ({
        label: game.i18n.localize(CONFIG.TNO.attributeCategories[catKey]),
      })),
      rows: rows.map((row, ri) => {
        const rowLabel = game.i18n.localize(CONFIG.TNO.attributeRowLabels[ri]);
        return {
        label: rowLabel,
        cells: row.map((key, ci) => {
          const labelKey = CONFIG.TNO.abilities[key];
          // The row verb (Assert/Adapt/…) and column category (Physical/…)
          // are prefixed onto every cell tooltip so the grid's two semantic
          // axes survive even when the header labels are compacted away on a
          // narrow sheet (see the container query in _resource.scss).
          const colLabel = game.i18n.localize(
            CONFIG.TNO.attributeCategories[categoryKeys[ci]]
          );
          const axisPrefix = `${rowLabel} · ${colLabel} — `;
          const ability = abilities[key];
          const baseValue = ability?.base ?? 0;
          const tempValue = ability?.value ?? 0;
          const xp = ability?.xp ?? 0;
          const delta = tempValue - baseValue;
          const isCritical = tempValue === 0;
          const dc = colorForValue(baseValue);
          const cc = isCritical ? colorForCritical() : null;

          // XP progress toward the next base rank: advancing to rank N costs
          // N*N XP; the bar fills as XP accrues and turns "ready" once enough
          // is banked (and the attribute isn't already at the cap).
          const xpAtMax = baseValue >= BASE_MAX;
          const xpCost = (baseValue + 1) ** 2;
          const xpReady = !xpAtMax && xp >= xpCost;
          const xpPercent = xpAtMax ? 100 : Math.min(100, Math.round((xp / xpCost) * 100));

          // Zero cells swap their tooltip for the attribute's specific
          // in-fiction consequence (e.g. "FIN 0: keine Handaktionen")
          // instead of the generic ability description.
          const abilitySuffix = labelKey.split('.')[2];
          const abbr = game.i18n.localize(labelKey.replace('.long', '.abbr')).toUpperCase();
          const zeroConsequence = game.i18n.localize(`TNO.AttributeZero.${abilitySuffix}`);
          const zeroHint = `${abbr} 0: ${zeroConsequence}`;

          return {
            key,
            label: game.i18n.localize(labelKey),
            hint: axisPrefix + (isCritical ? zeroHint : game.i18n.localize(labelKey.replace('.long', '.hint'))),
            tempValue,
            baseValue,
            xp,
            xpCost,
            xpReady,
            xpAtMax,
            xpPercent,
            // The XP bar reuses the stepper chip's adaptive colors so it stays
            // legible whether the cell is a light/dark heatmap tone or the
            // critical (temp = 0) red state.
            xpBarTrack: isCritical ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
            xpBarFill: isCritical ? 'rgba(255,217,220,0.6)' : 'rgba(51,45,34,0.45)',
            tempHint: game.i18n.localize('TNO.AttributeCurrent'),
            baseHint: game.i18n.localize('TNO.AttributeBase'),
            cellBg: isCritical ? cc.bg : dc.bg,
            textColor: isCritical ? cc.textColor : dc.textColor,
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
        };
      }),
    };
    context.attributeGrid.totalXp = rows
      .flat()
      .reduce((sum, key) => sum + attributeRankXpCost(abilities[key]?.base ?? 0), 0);
    context.attributeGrid.totalValue = rows
      .flat()
      .reduce((sum, key) => sum + (abilities[key]?.base ?? 0), 0);

    // Skill list filter (All / Trained / Starter), persisted on the sheet
    // instance so it survives re-renders while the sheet stays open.
    this._skillFilter ??= 'trained';
    context.skillFilter = this._skillFilter;

    // Skill list fuzzy search, persisted the same way as the category filter.
    // While a search term is active, it overrides the category filter so a
    // skill can always be found regardless of trained/starter state.
    this._skillSearch ??= '';
    context.skillSearch = this._skillSearch;

    // Build the skill list, grouped by category, in TNO.skillCategories order.
    // Categories without any skills yet (WIP groups) still render, empty.
    // Custom, actor-defined skills are merged in alongside the built-ins by
    // getSkillDefinitions() and behave identically from here on.
    const skills = context.system.skills ?? {};
    const definitions = getSkillDefinitions(this.actor);
    context.skillGroups = Object.entries(CONFIG.TNO.skillCategories).map(([catKey, catLabelKey]) => {
      const groupSkills = Object.entries(definitions)
        .filter(([, skill]) => skill.category === catKey)
        .map(([key, skill]) => {
          const rank = skills[key]?.value ?? 0;
          const xp = skills[key]?.xp ?? 0;
          // XP progress toward the next rank: advancing to rank N costs 3*N XP;
          // "ready" flags the advance arrow green once the step is affordable.
          const xpCost = 3 * (rank + 1);
          // Untrained skills (rank 0) stay in the neutral default badge
          // color rather than the heatmap's lowest tone, so a group full of
          // untrained skills doesn't drown out the ones actually worth
          // reading at a glance.
          const dc = rank > 0 ? colorForValue(rank) : null;
          return {
            key,
            label: skill.label,
            // Kept only to preselect the roll dialog's attribute; a skill is
            // never bound to one fixed attribute, so it's no longer shown in
            // the row itself (see TnoRollDialog's attribute chips).
            // Prefers whatever attribute this actor last rolled this skill
            // against, falling back to the skill's suggested attribute until
            // it's ever been rolled.
            attribute: skills[key]?.lastAttribute || skill.attribute,
            rank,
            xp,
            xpCost,
            xpReady: rank < 10 && xp >= xpCost,
            starter: skill.starter ?? false,
            custom: skill.custom,
            levelBg: dc?.bg ?? null,
            levelColor: dc?.textColor ?? null,
          };
        });
      return {
        key: catKey,
        label: game.i18n.localize(catLabelKey),
        skills: groupSkills,
        totalRank: groupSkills.reduce((sum, skill) => sum + skill.rank, 0),
        totalXp: groupSkills.reduce((sum, skill) => sum + skillRankXpCost(skill.rank), 0),
      };
    });

    // XP invested so far, broken down by skills vs. attributes plus their
    // combined grand total, shown as a chip in the sheet header. The grand
    // total only ever sums XP: adding up attribute points and skill ranks
    // together wouldn't mean anything, since they're on different scales.
    context.skillXpTotal = context.skillGroups.reduce((sum, group) => sum + group.totalXp, 0);
    context.skillRankTotal = context.skillGroups.reduce((sum, group) => sum + group.totalRank, 0);
    context.totalXpSpent = context.attributeGrid.totalXp + context.skillXpTotal;

    // "Fehler Analysieren" only makes sense to attempt while the reserve
    // has room to regain a point; a full pool has nothing to refill.
    const reserve = context.system.derived?.solveReserve ?? 0;
    const reserveMax = context.system.derived?.solveReserveMax ?? 0;
    context.analyzeFlawDisabled = reserve >= reserveMax;
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

  /**
   * Move the tab rail nav out of `.window-content` and re-parent it directly
   * onto the app window element, so it can be positioned outside the sheet's
   * visible bounds (`.tabs-right` docks to the right, past the window edge)
   * without being clipped by the window-content scroll container.
   */
  _dockTabsRail() {
    const nav = this.element.find('> .window-content .tabs-right');
    if (nav.length && !nav.parent().is(this.element)) this.element.append(nav);
  }

  /**
   * The sheet is full of custom clickable chips (anchors without `href`,
   * plus `.skill-info`) that read fine visually but are invisible to
   * keyboard/screen-reader users: browsers only put `<a href>`, `<button>`,
   * and native form controls in the tab order. This promotes every such
   * element to a real keyboard target — `tabindex="0"` and `role="button"`
   * so it's reachable and announced, plus an Enter/Space handler that
   * forwards to the same `click` listeners already bound elsewhere — without
   * having to touch every template or click handler individually.
   * @param {JQuery} html
   * @private
   */
  _makeKeyboardAccessible(html) {
    const targets = html[0].querySelectorAll('a:not([href]), .skill-info');
    for (const el of targets) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    }

    html.on('keydown', 'a:not([href]), .skill-info', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.currentTarget.click();
    });
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    this._dockTabsRail();
    this._makeKeyboardAccessible(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.on('click', '.item-edit', (ev) => {
      const li = $(ev.currentTarget).parents('.item');
      const item = this.actor.items.get(li.data('itemId'));
      item.sheet.render(true);
    });

    // Open the heatmap gradient editor (see apps/heatmap-lab.mjs) for quick
    // in-app experimentation, without leaving the sheet. This only touches a
    // client display setting, not actor data, so it works on read-only
    // sheets too.
    html.on('click', '.heatmap-lab-btn', (ev) => {
      ev.preventDefault();
      new TnoHeatmapLab().render(true);
    });

    // Skill list filter: toggles which rows are shown, purely client-side
    // (no re-render), so it also works on read-only sheets.
    html.on('click', '.skill-filter-btn', (ev) => {
      ev.preventDefault();
      this._skillFilter = ev.currentTarget.dataset.filter;
      html.find('.skill-filter-btn').removeClass('active');
      $(ev.currentTarget).addClass('active');
      this._applySkillFilter(html);
    });

    // Skill list search: fuzzy-matches the skill name and, while active,
    // overrides the category filter so any matching skill is shown.
    html.on('input', '.skill-search-input', (ev) => {
      this._skillSearch = ev.currentTarget.value;
      this._applySkillFilter(html);
    });
    this._applySkillFilter(html);

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
      const skill = this.actor.system.skills?.[key] ?? {};
      new TnoAdvanceDialog(this.actor, {
        type: 'skill',
        key,
        label: getSkillDefinition(this.actor, key)?.label ?? key,
        rank: skill.value ?? 0,
        xp: skill.xp ?? 0,
      }).render(true);
    });

    // Add a new custom skill to the group whose "+" was clicked.
    html.on('click', '.skill-create-button', (ev) => {
      ev.preventDefault();
      new TnoCustomSkillDialog(this.actor, { category: ev.currentTarget.dataset.category }).render(true);
    });

    // Open the attribute advancement dialog from the heatmap cell's XP badge.
    html.on('click', '.heatmap-xp-badge', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const key = ev.currentTarget.dataset.key;
      const ability = this.actor.system.abilities?.[key] ?? {};
      new TnoAdvanceDialog(this.actor, {
        type: 'attribute',
        key,
        label: game.i18n.localize(CONFIG.TNO.abilities[key] ?? key),
        rank: ability.base ?? 0,
        xp: ability.xp ?? 0,
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
          content: game.i18n.format('TNO.Chat.SolveReserveSpent', {
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
    // roll dialog itself (see TnoRollDialog); "Fehler finden" and
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
   * Show/hide skill rows per the current skill list filter ("trained" shows
   * only rank > 0 or with xp already banked toward the next rank, "starter"
   * shows only skills selectable at character creation, "all" shows
   * everything) and the fuzzy search box. While a search term is entered, it
   * takes priority over the category filter so any matching skill can be
   * found regardless of trained/starter state. Custom skills always count as
   * "trained" regardless of rank, so a freshly added rank-0 custom skill
   * doesn't immediately vanish from view.
   * Groups with no visible rows are hidden too, unless they have no skills
   * defined at all (those keep their "SkillCategoryEmptyHint" placeholder
   * regardless of filter).
   * @param {JQuery} html
   * @private
   */
  _applySkillFilter(html) {
    const filter = this._skillFilter ?? 'trained';
    const search = (this._skillSearch ?? '').trim();
    html.find('.skill-group').each((_i, groupEl) => {
      const $group = $(groupEl);
      const $rows = $group.find('.skill-row');
      let anyVisible = false;
      $rows.each((_j, rowEl) => {
        const rank = Number(rowEl.dataset.rank) || 0;
        const xp = Number(rowEl.dataset.xp) || 0;
        const starter = rowEl.dataset.starter === 'true';
        const custom = rowEl.dataset.custom === 'true';
        const visible = search
          ? fuzzyMatch(search, rowEl.querySelector('.skill-name-text')?.textContent ?? '')
          : filter === 'all' ||
            (filter === 'trained' && (rank !== 0 || custom || xp !== 0)) ||
            (filter === 'starter' && starter);
        rowEl.style.display = visible ? '' : 'none';
        if (visible) anyVisible = true;
      });
      $group.toggle((filter === 'all' && !search) || $rows.length === 0 || anyVisible);
    });
  }

  /**
   * Step an ability's temp or base value up/down by one, clamped to its
   * valid range.
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

      // Open the Tno dice mechanic dialog, preselecting the clicked ability.
      if (dataset.rollType == 'ability') {
        return new TnoRollDialog(this.actor, {
          attributeA: dataset.ability,
          flavor: dataset.label,
        }).render(true);
      }

      // Open the roll dialog in free mode: the player picks any attribute
      // and types in a free skill value not tied to a defined skill.
      if (dataset.rollType == 'free') {
        return new TnoRollDialog(this.actor, {
          freeSkill: true,
          flavor: game.i18n.localize('TNO.Roll.FreeTitle'),
        }).render(true);
      }

      // Open the roll dialog for a skill. The suggested attribute (or
      // whichever the player last swapped to) and the skill rank are fixed
      // threshold components; the dialog's bonus field is left at 0 for the
      // player to dial in a situational modifier.
      //
      // Shift-clicking a custom skill opens its edit dialog instead of
      // rolling, so the row doesn't need a dedicated edit button (which
      // would force every row's rank/xp/advance-button column to align to
      // the same width regardless of whether it's custom).
      if (dataset.rollType == 'skill') {
        if (event.shiftKey && this.actor.system.skills?.[dataset.skill]?.custom) {
          return new TnoCustomSkillDialog(this.actor, { key: dataset.skill }).render(true);
        }
        const rank = this.actor.system.skills?.[dataset.skill]?.value ?? 0;
        return new TnoRollDialog(this.actor, {
          attributeA: dataset.ability,
          skill: { key: dataset.skill, label: dataset.label, value: rank },
          flavor: dataset.label,
        }).render(true);
      }

      // Sixth Sense: a plain standard 3d20 roll against the derived value
      // itself, with no dialog — no modifier, no advantage/disadvantage,
      // and no "Idee haben" pre-edge, since it's an instinctive reaction
      // rather than a deliberate check.
      if (dataset.rollType == 'sixthSense') {
        return rollTno({
          threshold: this.actor.system.derived?.sixthSense ?? 0,
          advantage: TNO_ADVANTAGE.none,
          flavor: dataset.label,
          actor: this.actor,
          // Not a skill+attribute check, so the "Problem lösen" edge pool
          // can't be spent on it (see problem-solving-prd.md).
          extraFlags: { edgeExempt: true },
        });
      }

      // Fehler Analysieren: a standard 3d20 roll against the derived value,
      // same as any other check, after a confirmation dialog and a short
      // chat message announcing the attempt. On success, regains one
      // reserve point (up to the pool's max).
      if (dataset.rollType == 'analyzeFlaw') {
        const reserve = this.actor.system.derived?.solveReserve ?? 0;
        const reserveMax = this.actor.system.derived?.solveReserveMax ?? 0;
        if (reserve >= reserveMax) {
          ui.notifications.warn(game.i18n.localize('TNO.Notify.ReserveFull'));
          return;
        }

        const confirmedAnalyze = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize('TNO.Dialog.SolveAnalyzeFlawTitle') },
          content: game.i18n.localize('TNO.Dialog.SolveAnalyzeFlawContent'),
        });
        if (!confirmedAnalyze) return;

        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this.actor }),
          content: game.i18n.format('TNO.Chat.SolveAnalyzeFlawAttempt', { name: this.actor.name }),
        });

        const { success } = await rollTno({
          threshold: this.actor.system.derived?.solveAnalyzeFlaw ?? 0,
          advantage: TNO_ADVANTAGE.none,
          flavor: dataset.label,
          actor: this.actor,
          // A failed "Fehler Analysieren" roll must not itself be offered the
          // "Problem lösen" edge panel: spending reserve to reroll the very
          // roll that refills that reserve would be circular.
          extraFlags: { edgeExempt: true },
        });
        if (success) {
          const spent = this.actor.system.problemSolving?.spent ?? 0;
          if (spent > 0) {
            await this.actor.update({ 'system.problemSolving.spent': spent - 1 });
            const max = this.actor.system.derived?.solveReserveMax ?? 0;
            const current = this.actor.system.derived?.solveReserve ?? 0;
            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              content: game.i18n.format('TNO.Chat.SolveAnalyzeFlawSuccess', { name: this.actor.name, current, max }),
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

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
import {
  BASE_MIN,
  BASE_MAX,
  TEMP_MIN,
  TEMP_MAX,
  tempValueForBase,
} from '../helpers/attributes.mjs';
import { buildSlotGrid, ARMOR_ADDON_ZONES, wornItemIds } from '../helpers/inventory.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * The Basics tab's column split, as the left (attributes/skills) column's share
 * of the row. The bounds stop either side from being dragged shut, which would
 * leave no handle wide enough to drag back out. Exported because
 * `tno.mjs` registers the `basicsSplit` client setting with this default.
 */
export const BASICS_SPLIT_DEFAULT = 0.4;
const BASICS_SPLIT_MIN = 0.2;
const BASICS_SPLIT_MAX = 0.8;

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
 * Character/NPC sheet, built on ApplicationV2. The V2 framework is what
 * carries Foundry v14's native pop-out support, so the sheet gains the
 * "Detach" window control for free — V1 `ActorSheet` windows never get it.
 *
 * A detached application still executes in the *main* workspace's JS context,
 * so `window` and `document` keep pointing at the parent window: every DOM
 * lookup below therefore goes through `this.element`, never a bare `document`.
 * @extends {ActorSheetV2}
 */
export class TnoActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ['tno', 'sheet', 'actor'],
    // The Basics tab is two columns wide now: the attribute matrix plus three
    // skill columns on the left (which together want ~620px before the matrix
    // drops its row-header column and the skill flow drops to two columns),
    // and the equipment column on the right. The height covers the banner plus
    // that right column's three stacked blocks without an immediate scroll.
    position: { width: 1270, height: 720 },
    window: { resizable: true },
    // V1 sheets submitted on every field change; keep that, since the sheet has
    // no save button.
    form: { submitOnChange: true },
  };

  /**
   * ApplicationV2 owns the form element, so the actor-type class the template's
   * own <form> used to carry has to come from the options instead. The SCSS
   * keys the sheet's root flex direction off it (see `_forms.scss`).
   * @override
   */
  _initializeApplicationOptions(options) {
    const applied = super._initializeApplicationOptions(options);
    applied.classes.push(options.document.type);
    return applied;
  }

  /**
   * One full-sheet part. `root` splices the template's own children directly
   * into `.window-content` instead of nesting them under a generated wrapper,
   * which keeps the DOM — and therefore the SCSS — flat.
   * @override
   */
  static PARTS = {
    body: { template: '', root: true },
  };

  /** @override */
  static TABS = {
    primary: {
      initial: 'basics',
      tabs: [
        { id: 'basics', icon: 'fa-solid fa-chart-simple', label: 'TNO.TabBasics' },
        { id: 'description', icon: 'fa-solid fa-feather', label: 'TNO.TabDescription' },
        { id: 'items', icon: 'fa-solid fa-suitcase', label: 'TNO.TabItems' },
      ],
    },
  };

  /* -------------------------------------------- */

  /**
   * The template is picked per actor type, which `static PARTS` cannot express
   * because it is resolved before any instance exists.
   * @override
   */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.body.template = `systems/tno/templates/actor/actor-${this.actor.type}-sheet.hbs`;
    return parts;
  }

  /**
   * NPCs have no attribute matrix or skill list, so they drop the "basics" tab
   * and open on the biography instead.
   * @override
   */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (!config || this.actor.type !== 'npc') return config;
    return {
      ...config,
      tabs: config.tabs.filter((tab) => tab.id !== 'basics'),
      initial: 'description',
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    // Supplies the V2 basics the templates rely on: `tabs`, `editable`, and
    // the document itself.
    const context = await super._prepareContext(options);

    // Use a safe clone of the actor data for further operations.
    const actorData = this.document.toObject(false);

    context.actor = this.actor;
    context.system = actorData.system;
    context.flags = actorData.flags;

    // V1's getData() handed the templates a sorted array of plain item data;
    // ApplicationV2 does not, so build it here.
    context.items = this.actor.items.map((item) => item.toObject(false));
    context.items.sort((a, b) => (a.sort || 0) - (b.sort || 0));

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
          // Mirrors the attribute heatmap's XP bar (same rank cap, same
          // ready/at-max semantics) so both grids read the same way.
          const xpCost = 3 * (rank + 1);
          const xpAtMax = rank >= 10;
          const xpPercent = xpAtMax ? 100 : Math.min(100, Math.round((xp / xpCost) * 100));
          // Untrained skills (rank 0) stay in the neutral default badge
          // color rather than the heatmap's lowest tone, so a group full of
          // untrained skills doesn't drown out the ones actually worth
          // reading at a glance.
          const dc = rank > 0 ? colorForValue(rank) : null;
          // Some categories (Technology, Knowledge) bundle sibling domains
          // that used to be spelled out in the label itself ("Medicine -
          // First Aid"); that's now a compact badge instead, keyed by the
          // skill's subgroup (see TNO.skillSubgroups).
          const subgroup = skill.subgroup ? CONFIG.TNO.skillSubgroups[skill.subgroup] : null;
          return {
            key,
            label: skill.label,
            subgroupBadge: subgroup ? game.i18n.localize(subgroup.badge) : null,
            subgroupLabel: subgroup ? game.i18n.localize(subgroup.label) : null,
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
            xpAtMax,
            xpPercent,
            starter: skill.starter ?? false,
            custom: skill.custom,
            levelBg: dc?.bg ?? null,
            levelColor: dc?.textColor ?? null,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
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

    // The edge reserve as a pip row for the banner chip: one pip per point of
    // the maximum, filled up to the current pool. Built here rather than in the
    // template because Handlebars has no "repeat n times".
    const edgeMax = this.actor.system.derived?.edgePoolMax ?? 0;
    const edgeNow = this.actor.system.derived?.edgePool ?? 0;
    context.edgePips = Array.from({ length: edgeMax }, (_, i) => ({
      value: i + 1,
      filled: i < edgeNow,
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

    const armory = [];

    // Which items are on the body. Worn gear is exempt from the slot economy
    // and its state belongs to the paper doll, so those rows show a static
    // marker instead of a carry/stow toggle. NPCs have no equipment store, so
    // this is simply empty for them.
    const worn = wornItemIds(this.actor.system.equipment);

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      // The two flags the inventory list rows branch on. `carried` is only
      // ever meaningful while the item is not worn.
      i.isWorn = worn.has(i._id);
      i.isStowed = i.system?.carried === false;
      // Append to gear.
      if (i.type === 'item') {
        gear.push(i);
      }
      // Append to features.
      else if (i.type === 'feature') {
        features.push(i);
      }
      // Append to armour, whether it is currently worn or just hauled along.
      else if (i.type === 'armor') {
        armory.push(i);
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
    context.armory = armory;

    // The flat administrative list covers everything the inventory rules touch,
    // armour included: a piece that is neither worn nor carried appears in no
    // other view, so leaving it out of the list would strand it entirely. Both
    // buckets are already in `sort` order, so a single merge keeps them so.
    context.inventory = [...gear, ...armory].sort((a, b) => (a.sort || 0) - (b.sort || 0));

    if (context.actor.type === 'character') this._prepareEquipment(context);
  }

  /**
   * Build the view models the paper doll and Trageslots grid render from.
   * Both are derived on every render rather than stored: the paper doll reads
   * `system.equipment`, and the grid packs carried gear in its existing sort
   * order, so a player's arrangement never needs persisting.
   *
   * @param {object} context The context object to mutate
   */
  _prepareEquipment(context) {
    const derived = this.actor.system.derived ?? {};
    const equipment = this.actor.system.equipment ?? {};

    // The suit is a layer under everything rather than a hit location, so it
    // gets its own row above the four zones instead of sitting among them.
    const suit = this.actor.items.get(equipment.suit) ?? null;
    context.paperdoll = {
      suit,
      svPenalty: derived.armorSvPenalty ?? false,
      sv: derived.armorSv ?? 0,
      zones: ARMOR_ADDON_ZONES.map((zone) => {
        const item = this.actor.items.get(equipment[zone]) ?? null;
        return {
          zone,
          label: CONFIG.TNO.armorZones[zone],
          item,
          // How the silhouette paints this location. A bare zone under the
          // suit is neither unprotected nor armoured — the suit closes the
          // coverage without hardening it — so it gets a state of its own
          // rather than being lumped in with either extreme.
          state: item ? 'filled' : suit ? 'suited' : 'bare',
          ...(derived.armor?.[zone] ?? { rh: 0, rw: 0, ra: 0 }),
        };
      }),
    };

    const capacity = derived.carrySlots ?? 0;
    const grid = buildSlotGrid(this.actor.items.contents, equipment, capacity);
    const used = derived.carrySlotsUsed ?? 0;

    // A stack's multiplier is only worth the pixels when there is more than
    // one of it; Handlebars can't compare inline, so decide it here.
    const withQty = (block) => ({ ...block, showQty: block.quantity > 1 });

    context.slotGrid = {
      ...grid,
      blocks: grid.blocks.map(withQty),
      overflow: grid.overflow.map(withQty),
      // Zero-slot items get no cell, but they still stack — loose change is the
      // likeliest thing on the sheet to be counted — so they are reshaped into
      // the same {item, quantity} block the cells use and carry the same
      // multiplier. `buildSlotGrid` stays free of view concerns and hands back
      // the bare items.
      trinkets: grid.trinkets.map((item) => withQty({ item, quantity: Number(item.system?.quantity) || 1 })),
      // Handlebars has no "repeat n times", so the free-cell count becomes a
      // list the template can simply iterate.
      emptyCells: Array.from({ length: grid.empty }, (_, i) => i),
      used,
      capacity,
      over: used > capacity,
      // How far past the budget the load runs, for the over-capacity read-out.
      excess: Math.max(0, used - capacity),
      state: derived.carryState ?? 'ok',
    };
  }

  /* -------------------------------------------- */

  /**
   * Delegate an event from the persistent sheet root down to whichever
   * descendant matches `selector`. ApplicationV2 replaces the sheet's contents
   * on every re-render but keeps the root element, so binding here once (from
   * `_onFirstRender`) survives re-renders without stacking up duplicate
   * listeners the way binding per-render would.
   * @param {string} type                              DOM event name
   * @param {string} selector                          Selector the target must match
   * @param {(event: Event, target: Element) => void} handler
   * @param {object} [options]
   * @param {boolean} [options.requireEditable=false]  Skip the handler on read-only sheets
   * @private
   */
  #delegate(type, selector, handler, { requireEditable = false } = {}) {
    this.element.addEventListener(type, (event) => {
      const target = event.target.closest(selector);
      if (!target || !this.element.contains(target)) return;
      if (requireEditable && !this.isEditable) return;
      handler(event, target);
    });
  }

  /**
   * Set the problem-solving edge reserve, clamped to 0..max. Stored as "spent"
   * (max minus the wanted value) since the pool itself is derived, recomputed
   * from `problemSolving.spent`. Any manual change — up or down — happens
   * outside the dedicated actions (Insight, Post-mortem), so it is announced in
   * chat too.
   * @param {number} value  The reserve the character should be left with
   * @private
   */
  #setEdgePool(value) {
    const max = this.actor.system.derived?.edgePoolMax ?? 0;
    const current = this.actor.system.derived?.edgePool ?? 0;
    const next = Math.clamp(value, 0, max);
    if (next === current) return;

    this.actor.update({ 'system.problemSolving.spent': max - next });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: game.i18n.format('TNO.Chat.EdgeSpent', {
        name: this.actor.name,
        from: current,
        to: next,
        max,
      }),
    });
  }

  /**
   * Paint the Basics tab's column split. The ratio goes into a CSS custom
   * property rather than inline widths, so the two columns keep the grow
   * factors the stylesheet gives them (see `.basics-columns`) and the split
   * survives a window resize as a proportion.
   * @param {number} [ratio]  Left column's share; defaults to the stored one
   * @private
   */
  _applyColumnSplit(ratio = game.settings.get('tno', 'basicsSplit')) {
    const columns = this.element.querySelector('.basics-columns');
    if (!columns) return;
    const clamped = Math.clamp(ratio, BASICS_SPLIT_MIN, BASICS_SPLIT_MAX);
    columns.style.setProperty('--basics-split', String(clamped));
  }

  /**
   * Apply a split and remember it. Client-scoped, so it follows the player
   * across every character sheet they open rather than living on the actor.
   * @param {number} ratio
   * @private
   */
  #storeColumnSplit(ratio) {
    const clamped = Math.clamp(ratio, BASICS_SPLIT_MIN, BASICS_SPLIT_MAX);
    this._applyColumnSplit(clamped);
    game.settings.set('tno', 'basicsSplit', clamped);
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);

    // Custom clickable chips (anchors without `href`, plus `.skill-info`) are
    // promoted to real keyboard targets in _onRender; this forwards their
    // Enter/Space to the same click listeners bound below.
    this.#delegate('keydown', 'a:not([href]), .skill-info', (event, target) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      target.click();
    });

    // Render the item sheet for viewing/editing prior to the editable check.
    this.#delegate('click', '.item-edit', (event, target) => {
      const li = target.closest('.item');
      const item = this.actor.items.get(li.dataset.itemId);
      item.sheet.render(true);
    });

    // Open the heatmap gradient editor (see apps/heatmap-lab.mjs) for quick
    // in-app experimentation, without leaving the sheet. This only touches a
    // client display setting, not actor data, so it works on read-only
    // sheets too.
    this.#delegate('click', '.heatmap-lab-btn', (event) => {
      event.preventDefault();
      new TnoHeatmapLab().render(true);
    });

    // Skill list filter: toggles which rows are shown, purely client-side
    // (no re-render), so it also works on read-only sheets.
    this.#delegate('click', '.skill-filter-btn', (event, target) => {
      event.preventDefault();
      this._skillFilter = target.dataset.filter;
      for (const btn of this.element.querySelectorAll('.skill-filter-btn')) {
        btn.classList.toggle('active', btn === target);
      }
      this._applySkillFilter();
    });

    // Skill list search: fuzzy-matches the skill name and, while active,
    // overrides the category filter so any matching skill is shown.
    this.#delegate('input', '.skill-search-input', (event, target) => {
      this._skillSearch = target.value;
      this._applySkillFilter();
    });

    // Drag the Basics tab's column divider. Pointer capture keeps the move and
    // release events on the handle itself, so the drag needs no listeners on
    // `document` — which a detached sheet would bind to the wrong window.
    // Purely a display preference, so read-only sheets can drag it too.
    this.#delegate('pointerdown', '.basics-splitter', (event, target) => {
      event.preventDefault();
      const columns = target.parentElement;
      // Everything the two columns can actually share: the handle's own strip
      // is not up for grabs, so the ratio is measured against the rest.
      const track = columns.clientWidth - target.offsetWidth;
      if (track <= 0) return;

      // Measured from where inside the handle the pointer went down, so the
      // divider does not jump to centre itself under the cursor.
      const origin = columns.getBoundingClientRect().left;
      const grab = event.clientX - target.getBoundingClientRect().left;
      const ratioAt = (clientX) => Math.clamp(
        (clientX - grab - origin) / track, BASICS_SPLIT_MIN, BASICS_SPLIT_MAX
      );

      const onMove = (moveEvent) => this._applyColumnSplit(ratioAt(moveEvent.clientX));
      const onEnd = (endEvent) => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onEnd);
        target.removeEventListener('pointercancel', onEnd);
        target.classList.remove('dragging');
        this.#storeColumnSplit(ratioAt(endEvent.clientX));
      };

      target.classList.add('dragging');
      target.setPointerCapture(event.pointerId);
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onEnd);
      target.addEventListener('pointercancel', onEnd);
    });

    // Double-click resets the split, which is the only way back once a column
    // has been dragged to one of its bounds and lost its proportions.
    this.#delegate('dblclick', '.basics-splitter', (event) => {
      event.preventDefault();
      this.#storeColumnSplit(BASICS_SPLIT_DEFAULT);
    });

    // The keyboard equivalents, since the handle is a focusable separator.
    this.#delegate('keydown', '.basics-splitter', (event) => {
      const step = { ArrowLeft: -0.02, ArrowRight: 0.02 }[event.key];
      if (step === undefined && event.key !== 'Home') return;
      event.preventDefault();
      const current = game.settings.get('tno', 'basicsSplit');
      this.#storeColumnSplit(step === undefined
        ? BASICS_SPLIT_DEFAULT
        : Math.clamp(current + step, BASICS_SPLIT_MIN, BASICS_SPLIT_MAX));
    });

    // -------------------------------------------------------------
    // Everything below here only acts on an editable sheet.
    const editable = { requireEditable: true };

    // Heatmap +/- steppers: adjust temp (value) by default, or base while
    // holding Shift, since base is the rarer, more deliberate change.
    this.#delegate('click', '.heatmap-stepper', (event, target) => {
      const { key, action } = target.dataset;
      const field = event.shiftKey ? 'base' : 'value';
      this._stepAttribute(key, action === 'increment' ? 1 : -1, field);
    }, editable);

    // Reset an attribute's temp value back to its base value.
    this.#delegate('click', '.heatmap-delta', (event, target) => {
      this._resetTemp(target.dataset.key);
    }, editable);

    // Open the skill advancement dialog, either from the dedicated arrow
    // button or by clicking the skill's XP bar directly (mirroring the
    // attribute heatmap, where the XP bar itself is the advance click target).
    this.#delegate('click', '.skill-advance-button, .skill-xp-bar', (event, target) => {
      event.preventDefault();
      const key = target.dataset.skill;
      const skill = this.actor.system.skills?.[key] ?? {};
      new TnoAdvanceDialog(this.actor, {
        type: 'skill',
        key,
        label: getSkillDefinition(this.actor, key)?.label ?? key,
        rank: skill.value ?? 0,
        xp: skill.xp ?? 0,
      }).render(true);
    }, editable);

    // Add a new custom skill to the group whose "+" was clicked.
    this.#delegate('click', '.skill-create-button', (event, target) => {
      event.preventDefault();
      new TnoCustomSkillDialog(this.actor, { category: target.dataset.category }).render(true);
    }, editable);

    // Open the attribute advancement dialog from the heatmap cell's XP bar.
    this.#delegate('click', '.heatmap-xp-bar', (event, target) => {
      event.preventDefault();
      event.stopPropagation();
      const key = target.dataset.key;
      const ability = this.actor.system.abilities?.[key] ?? {};
      new TnoAdvanceDialog(this.actor, {
        type: 'attribute',
        key,
        label: game.i18n.localize(CONFIG.TNO.abilities[key] ?? key),
        rank: ability.base ?? 0,
        xp: ability.xp ?? 0,
      }).render(true);
    }, editable);

    // Edge pool, set from the banner chip's pip row. Clicking a pip sets the
    // reserve to it; clicking the last *filled* one empties that pip instead,
    // which is the only way the row can reach 0 — otherwise the lowest
    // reachable value would be 1.
    this.#delegate('click', '.edge-pip', (event, target) => {
      event.preventDefault();
      const value = Number(target.dataset.value) || 0;
      const current = this.actor.system.derived?.edgePool ?? 0;
      this.#setEdgePool(value === current ? value - 1 : value);
    }, editable);

    // Add Inventory Item
    this.#delegate('click', '.item-create', (event, target) => {
      this._onItemCreate(event, target);
    }, editable);

    // Delete Inventory Item. Deleting the embedded document re-renders the
    // sheet on its own, so the row does not need to be removed by hand.
    this.#delegate('click', '.item-delete', (event, target) => {
      const li = target.closest('.item');
      this.actor.items.get(li.dataset.itemId)?.delete();
    }, editable);

    // Carry or stow an item. Stowed gear stays on the character's list but is
    // not on them, so it leaves the Trageslots grid and costs no slots. Worn
    // gear has no toggle at all — the paper doll owns that state.
    this.#delegate('click', '.item-carry-toggle', (event, target) => {
      event.preventDefault();
      const item = this.actor.items.get(target.closest('.item')?.dataset.itemId);
      if (!item) return;
      item.update({ 'system.carried': item.system.carried === false });
    }, editable);

    // Equipment: click an empty paper doll zone to pick armour for it, click
    // the x on a filled one to take it off. Drag-and-drop onto the doll is
    // supported too (see _onDrop), but a click path has to exist as well —
    // dragging is unreliable in Firefox and impossible on touch.
    this.#delegate('click', '.armor-unequip', (event, target) => {
      event.preventDefault();
      this._setEquippedArmor(target.dataset.zone, null);
    }, editable);
    this.#delegate('click', '.armor-row.armor-empty', (event, target) => {
      this._promptEquipArmor(target.dataset.zone);
    }, editable);

    // Active Effect management
    this.#delegate('click', '.effect-control', (event, target) => {
      const row = target.closest('li');
      const owner =
        row.dataset.parentId === this.actor.id
          ? this.actor
          : this.actor.items.get(row.dataset.parentId);
      onManageActiveEffect(event, owner);
    }, editable);

    // Rollable abilities. None of the four problem-solving actions go
    // through this handler anymore: "Idee haben" is a pre-edge, offered as
    // a toggle inside the roll dialog itself (see TnoRollDialog); "Fehler
    // finden", "Neuer Versuch" and "Fehler Analysieren" are post-edges,
    // triggered from a failed roll's own chat card (see chat.mjs), not
    // from the sheet.
    this.#delegate('click', '.rollable', (event, target) => {
      this._onRoll(event, target);
    }, editable);
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    // Binds the inherited DragDrop instance, which makes `.draggable` item
    // rows draggable onto the hotbar.
    await super._onRender(context, options);

    this._makeKeyboardAccessible();
    this._applySkillFilter();
    this._applyColumnSplit();
  }

  /**
   * The sheet is full of custom clickable chips (anchors without `href`,
   * plus `.skill-info`) that read fine visually but are invisible to
   * keyboard/screen-reader users: browsers only put `<a href>`, `<button>`,
   * and native form controls in the tab order. This promotes every such
   * element to a real keyboard target — `tabindex="0"` and `role="button"`
   * so it's reachable and announced — without having to touch every
   * template individually. The matching Enter/Space handler is delegated
   * once in `_onFirstRender`.
   * @private
   */
  _makeKeyboardAccessible() {
    const targets = this.element.querySelectorAll('a:not([href]), .skill-info');
    for (const el of targets) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    }
  }

  /**
   * Put an armour item into a paper doll zone, or clear the zone when
   * `itemId` is null. A piece can only occupy one zone at a time, so any
   * other zone already holding it is cleared in the same update.
   *
   * @param {string} zone  A key of CONFIG.TNO.armorZones.
   * @param {string|null} itemId
   * @private
   */
  async _setEquippedArmor(zone, itemId) {
    if (!(zone in CONFIG.TNO.armorZones)) return;

    const update = { [`system.equipment.${zone}`]: itemId };
    if (itemId) {
      for (const [other, worn] of Object.entries(this.actor.system.equipment ?? {})) {
        if (other !== zone && worn === itemId) update[`system.equipment.${other}`] = null;
      }
    }
    return this.actor.update(update);
  }

  /**
   * Ask which piece of armour to put in a zone. Only armour the actor already
   * carries is offered — equipping is a state change on gear in hand, not a
   * way to conjure it — and only pieces authored for this zone, since the
   * Rüstungen table binds each piece to a Stelle.
   *
   * With nothing to offer, the click becomes an explicit offer to author a
   * piece for this zone instead of a dead end: an empty doll would otherwise
   * send the player off to the items list to create armour and set its zone by
   * hand before the doll could do anything at all.
   *
   * @param {string} zone  A key of CONFIG.TNO.armorZones.
   * @private
   */
  async _promptEquipArmor(zone) {
    const worn = wornItemIds(this.actor.system.equipment);
    const zoneLabel = game.i18n.localize(CONFIG.TNO.armorZones[zone]);
    const candidates = this.actor.items.filter(
      (item) => item.type === 'armor' && item.system.zone === zone && !worn.has(item.id)
    );

    if (!candidates.length) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('TNO.Armor.EquipTitle') },
        content: `<p>${game.i18n.format('TNO.Armor.CreateForZone', { zone: zoneLabel })}</p>`,
        rejectClose: false,
      });
      if (!confirmed) return;

      // Authored for this zone from the start, so it lands in the slot the
      // player clicked rather than the schema's default one.
      const [created] = await this.actor.createEmbeddedDocuments('Item', [
        {
          name: game.i18n.format('TNO.Armor.NewForZone', { zone: zoneLabel }),
          type: 'armor',
          system: { zone },
        },
      ]);
      await this._setEquippedArmor(zone, created.id);
      // Straight into the values — a piece with RH/RW/RA all 0 is the one
      // thing the player certainly still has to fill in.
      return created.sheet.render(true);
    }

    // A single candidate has no decision to make, so skip the dialog.
    if (candidates.length === 1) return this._setEquippedArmor(zone, candidates[0].id);

    const options = candidates
      .map((item) => `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)}</option>`)
      .join('');

    const itemId = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('TNO.Armor.EquipTitle') },
      content: `<div class="form-group"><label>${zoneLabel}</label><select name="itemId">${options}</select></div>`,
      ok: {
        label: game.i18n.localize('TNO.Armor.Equip'),
        callback: (event, button) => button.form.elements.itemId.value,
      },
      rejectClose: false,
    });

    if (itemId) return this._setEquippedArmor(zone, itemId);
  }

  /**
   * @override
   * Intercept drops onto a paper doll zone so armour can be equipped by
   * dragging. Anything else — and any drop that is not armour authored for
   * the zone it landed on — falls through to core's handling, which is what
   * still creates the item when it comes from a compendium or another actor.
   */
  async _onDrop(event) {
    const zoneEl = event.target?.closest?.('[data-zone]');
    if (!zoneEl) return super._onDrop(event);

    const data = TextEditor.getDragEventData(event);
    if (data?.type !== 'Item') return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
    const zone = zoneEl.dataset.zone;
    if (item?.type !== 'armor' || item.system.zone !== zone) return super._onDrop(event);

    // Dropping armour the actor does not own yet has to create it first;
    // `parent` being this actor is what distinguishes the two cases.
    const owned =
      item.parent === this.actor
        ? item
        : (await this.actor.createEmbeddedDocuments('Item', [item.toObject()]))[0];

    return this._setEquippedArmor(zone, owned.id);
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event    The originating click event
   * @param {Element} target The clicked create control
   * @private
   */
  async _onItemCreate(event, target) {
    event.preventDefault();
    // Get the type of item to create.
    const type = target.dataset.type;
    // Grab any data associated with this control.
    const data = { ...target.dataset };
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
   * @private
   */
  _applySkillFilter() {
    const filter = this._skillFilter ?? 'trained';
    const search = (this._skillSearch ?? '').trim();
    for (const groupEl of this.element.querySelectorAll('.skill-group')) {
      const rows = groupEl.querySelectorAll('.skill-row');
      let anyVisible = false;
      for (const rowEl of rows) {
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
      }
      const groupVisible = (filter === 'all' && !search) || rows.length === 0 || anyVisible;
      groupEl.style.display = groupVisible ? '' : 'none';
    }
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
        // Keep any temporary modifier instead of snapping the temp value onto
        // the new base.
        [`system.abilities.${key}.value`]: tempValueForBase(ability, next),
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
   * @param {Event} event     The originating click event
   * @param {Element} element The clicked rollable element
   * @private
   */
  async _onRoll(event, element) {
    event.preventDefault();
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

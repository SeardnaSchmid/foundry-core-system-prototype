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
import {
  buildSlotGrid,
  ARMOR_ADDON_ZONES,
  wornItemIds,
} from '../helpers/inventory.mjs';
import { prepareGearSummaryContext } from '../helpers/item-summary.mjs';
import { ITEM_ROLES, WEAPON_ATTRIBUTES, armorZones, inventoryIcon, itemRoles, weaponUse } from '../helpers/items.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * How the Basics tab divides each of its two rows: one share per column, in
 * document order, per row key. The keys are the rows' `data-split-row` values.
 * Exported because `tno.mjs` registers the `basicsLayout` client setting with
 * this default.
 *
 * Shares are grow factors, not widths — the splitters' own strips come off the
 * row first and the columns divide what is left, so a resized window keeps the
 * proportions. They are normalised to sum to 1 on read, which is what lets a
 * single drag move one boundary while every other column stays put.
 */
export const BASICS_LAYOUT_DEFAULT = Object.freeze({
  top: [0.25, 0.5, 0.25],
  bottom: [0.4, 0.6],
});

/**
 * The narrowest a column may be dragged, as its share of the row. Below this a
 * column has no width left to grab its own handle back out by.
 */
const BASICS_CELL_MIN = 0.12;

/**
 * Bring a stored row of shares into a usable state: the right length, nothing
 * below the minimum, summing to 1. A stored row that is the wrong length is a
 * layout from before this row had that many columns, so it is discarded rather
 * than padded — the default proportions are a better guess than a stale array
 * stretched to fit.
 *
 * @param {unknown} shares    Whatever was stored for this row.
 * @param {number[]} fallback The row's default shares, and its column count.
 * @returns {number[]}
 */
function normalizeShares(shares, fallback) {
  const raw = Array.isArray(shares) && shares.length === fallback.length
    ? shares.map((n) => (Number.isFinite(Number(n)) ? Math.max(Number(n), BASICS_CELL_MIN) : null))
    : null;
  if (!raw || raw.includes(null)) return [...fallback];

  const total = raw.reduce((sum, n) => sum + n, 0);
  return total > 0 ? raw.map((n) => n / total) : [...fallback];
}

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
   * The item currently being dragged, or null. `dragover` cannot read the drag
   * payload — the DataTransfer is in protected mode until the drop — so the
   * item is stashed at `dragstart` and read back to decide which side of a
   * hovered target the drop indicator belongs on.
   * @type {Item|null}
   */
  #dragging = null;

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

    // What the character has earned, as opposed to what they have committed.
    // Every attribute and skill carries XP banked toward its *next* rank; that
    // XP is earned but not yet converted, so the rank-cost sums above miss it
    // entirely — a rank-0 skill holding 2 XP costs 0 spent but is still 2 XP
    // the character earned. Acquired is therefore spent plus everything still
    // banked, and it only ever rises: spending banked XP on a rank moves the
    // same points from one side of the sum to the other.
    //
    // Summed from the same view models the totals above use, so a skill counts
    // here exactly when it counts there. The category filter is applied to the
    // DOM, not to `skillGroups`, so this sees every skill regardless of it.
    context.attributeXpBanked = rows
      .flat()
      .reduce((sum, key) => sum + (abilities[key]?.xp ?? 0), 0);
    context.skillXpBanked = context.skillGroups.reduce(
      (sum, group) => sum + group.skills.reduce((s, skill) => s + (skill.xp ?? 0), 0),
      0
    );
    context.totalXpUnspent = context.attributeXpBanked + context.skillXpBanked;
    context.totalXpAcquired = context.totalXpSpent + context.totalXpUnspent;

    // The edge reserve as a pip row for the banner chip: one pip per point of
    // the maximum, filled up to the current pool. Built here rather than in the
    // template because Handlebars has no "repeat n times".
    const edgeMax = this.actor.system.derived?.edgePoolMax ?? 0;
    const edgeNow = this.actor.system.derived?.edgePool ?? 0;
    context.edgePips = Array.from({ length: edgeMax }, (_, i) => ({
      filled: i < edgeNow,
    }));

    // Which movement tiers the character has lost, for the banner's movement
    // chip. The load's consequence is shown on the number it takes away rather
    // than as a badge over the carry grid: what a player wants to know is
    // "how far can I move", and a struck-through figure answers that where the
    // figure already is. Sprinting has two independent blockers — a damaged
    // Beweglichkeit or a load at half the budget — and `canSprint` already
    // folds both together.
    const derived = this.actor.system.derived ?? {};
    context.movement = {
      sprintBlocked: derived.canSprint === false,
      walkBlocked: derived.carryState === 'crawlOnly',
    };
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

    // Gear the item's role singles out. Disjoint from each other, since a piece
    // has at most one role — but *not* from `gear`, which holds every object
    // whatever it does. Only `gear` may be counted.
    const armory = [];
    const weapons = [];

    // Which items are on the body. Worn gear is exempt from the slot economy
    // and its state belongs to the paper doll, so those rows show a static
    // marker. NPCs have no equipment store, so
    // this is simply empty for them.
    const worn = wornItemIds(this.actor.system.equipment);

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      i.isWorn = worn.has(i._id);

      if (i.type === 'feature') {
        features.push(i);
        continue;
      }
      if (i.type === 'spell') {
        if (i.system.spellLevel != undefined) spells[i.system.spellLevel].push(i);
        continue;
      }

      // Everything else is an object, and every object is inventory. What it
      // *does* is a matter of the roles it carries, which is a second question
      // asked of the same item rather than a different bucket to put it in.
      gear.push(i);
      const roles = itemRoles(i);
      // The flat list labels each row with what it is; the tooltip in the carry
      // grid says the same thing at more length.
      i.roleLabels = ITEM_ROLES.filter((role) => roles[role]).map(
        (role) => CONFIG.TNO.itemRoles[role]
      );
      i.inventoryIcon = inventoryIcon(i);
      if (roles.armor) armory.push(i);
      // Weapons are gear the slot economy already accounts for; the Waffen
      // block that will list them by readiness is not designed yet, so for now
      // this bucket only feeds the flat list and the carry grid.
      if (roles.weapon) weapons.push(i);
    }

    // Assign and return
    context.gear = gear;
    context.features = features;
    context.spells = spells;
    context.armory = armory;
    context.weapons = weapons;

    // The flat administrative list covers everything the inventory rules touch,
    // armour and weapons included: a piece that is neither worn nor carried
    // appears in no other view, so leaving it out of the list would strand it
    // entirely. That is just `gear` now — the role buckets are views onto it,
    // and merging them in would list a piece once per role it has.
    context.inventory = gear;

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
    // gets its own separate row instead of sitting among the four zones.
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
          // How the silhouette paints the body beneath a possible addon. The
          // addon is a smaller plate of its own, so the remaining rim can keep
          // showing whether Unterkleidung is present underneath it.
          baseState: suit ? 'suited' : 'bare',
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
      // One cell per slot consumed, rather than one element spanning several
      // columns. A spanning block cannot wrap, so in the four-column sidebar a
      // wide item jumped to the next row and held the columns behind it open —
      // the very gap the packing rule exists to avoid. Expanded into siblings
      // it wraps like anything else, and the split through a straddling block
      // falls cleanly between two cells instead of having to be painted across
      // one. Blocks and overflow are one list because they never coexist with
      // free cells: anything straddling pushes the cursor past capacity, so
      // `empty` is 0 exactly when `overflow` is non-empty.
      cells: [
        ...grid.blocks.flatMap((block) => this.#slotCells(block, block.inside)),
        ...grid.overflow.flatMap((block) => this.#slotCells(block, 0)),
      ],
      // Zero-slot items get no cell, but they still stack — loose change is the
      // likeliest thing on the sheet to be counted — so they are reshaped into
      // the same {item, quantity} block the cells use and carry the same
      // multiplier. `buildSlotGrid` stays free of view concerns and hands back
      // the bare items.
      trinkets: grid.trinkets.map((item) => {
        const quantity = Number(item.system?.quantity) || 1;
        return withQty({
          item,
          icon: inventoryIcon(item),
          quantity,
        });
      }),
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

  /**
   * Expand one packed block into the individual cells it occupies, so the grid
   * is a flat run of single-slot cells the raster can wrap freely.
   *
   * `inside` is how many of them still fall within the budget; everything from
   * there on reads as overload. An overflow block passes 0, which marks the
   * whole run.
   *
   * Only the first cell carries the item's label — the rest are the same item
   * continuing — but every cell carries the item id, so a wide block can be
   * grabbed or dropped onto anywhere along its length. `_onSortItem` is
   * overridden to cope with the repeated id that implies.
   *
   * @param {{item: Item, span: number, quantity: number}} block
   * @param {number} inside  Cells of this block that fit the budget.
   * @returns {Array<object>}
   * @private
   */
  #slotCells(block, inside) {
    return Array.from({ length: block.span }, (_, index) => {
      const over = index >= inside;
      return {
        item: block.item,
        icon: inventoryIcon(block.item),
        over,
        first: index === 0,
        last: index === block.span - 1,
        // Only the first cell renders the label, so it has to know how many
        // cells it may run across before it is clipped.
        span: block.span,
        subcategory: this.#slotSubcategory(block.item),
        quantity: block.quantity,
        showQty: block.quantity > 1,
      };
    });
  }

  /** The one role-specific detail that belongs directly below an item name. */
  #slotSubcategory(item) {
    const roles = itemRoles(item);
    if (roles.armor) {
      const [zone] = armorZones(item);
      return zone ? game.i18n.localize(CONFIG.TNO.armorZones[zone]) : null;
    }
    if (roles.weapon) return game.i18n.localize(CONFIG.TNO.weaponUses[weaponUse(item.system)]);
    return null;
  }

  /** Build the popover's template context from the live embedded item. */
  #itemPopoverContext(item) {
    const base = prepareGearSummaryContext(item);
    const { roles } = base;
    const skill = getSkillDefinitions(item.actor)[item.system.fv?.skill];
    const canEdit = this.isEditable;
    const stock = Math.max(0, Number(item.system.quantity) || 0);
    return {
      ...base,
      canEdit,
      canWeaponCheck: !!(canEdit && item.actor?.isOwner && roles.weapon && skill && WEAPON_ATTRIBUTES.includes(item.system.wa)),
      canAdjustStock: canEdit && roles.consumable,
      canDecreaseStock: canEdit && roles.consumable && stock > 0,
      canDelete: canEdit && !item.isWorn,
    };
  }

  /** Rebuild an open popover after the actor sheet has re-rendered. */
  async #refreshItemPopover() {
    const popover = this._itemPopover;
    const itemId = this._itemPopoverItemId;
    if (!popover || !itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) {
      if (popover.matches(':popover-open')) popover.hidePopover();
      return;
    }

    const focused = popover.contains(document.activeElement)
      ? {
          action: document.activeElement.dataset.popoverAction,
          by: document.activeElement.dataset.by,
        }
      : null;
    const html = await foundry.applications.handlebars.renderTemplate(
      'systems/tno/templates/actor/parts/item-popover.hbs',
      this.#itemPopoverContext(item)
    );
    if (this._itemPopover !== popover || this._itemPopoverItemId !== itemId) return;
    popover.innerHTML = html;
    popover.setAttribute('aria-label', item.name);
    if (focused?.action) {
      const controls = [...popover.querySelectorAll(`[data-popover-action="${focused.action}"]`)];
      controls.find((control) => focused.by === undefined || control.dataset.by === focused.by)?.focus();
    }
  }

  /** Open and place the compact item popover beside the clicked sheet cell. */
  async #openItemPopover(item, anchor) {
    if (!this._itemPopover || !item) return;
    this._itemPopoverItemId = item.id;
    this._itemPopoverAnchor = anchor;
    await this.#refreshItemPopover();
    if (!this._itemPopover.matches(':popover-open')) this._itemPopover.showPopover();
    if (!this._itemPopover.contains(document.activeElement)) {
      this._itemPopover.querySelector('[autofocus]')?.focus();
    }
    this.#positionItemPopover();
  }

  /** Keep the body-level top-layer element within the current viewport. */
  #positionItemPopover() {
    const popover = this._itemPopover;
    if (!popover?.matches(':popover-open')) return;
    let anchor = this._itemPopoverAnchor;
    if (!anchor?.isConnected) {
      const id = CSS.escape(this._itemPopoverItemId ?? '');
      anchor = this.element.querySelector(`.slot-first[data-item-id="${id}"], .slot-trinket[data-item-id="${id}"], .armor-row[data-item-id="${id}"]`);
      this._itemPopoverAnchor = anchor;
    }
    if (!anchor) return;

    const gap = 6;
    const edge = 8;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const left = Math.min(
      Math.max(edge, anchorRect.left),
      Math.max(edge, window.innerWidth - popoverRect.width - edge)
    );
    const below = anchorRect.bottom + gap;
    const above = anchorRect.top - popoverRect.height - gap;
    const top = below + popoverRect.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, above);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  /** Dispatch actions from the body-level popover to its live item document. */
  async #onItemPopoverClick(event) {
    const control = event.target.closest('[data-popover-action]');
    if (!control || control.disabled) return;
    event.preventDefault();
    const item = this.actor.items.get(this._itemPopoverItemId);
    if (!item && control.dataset.popoverAction !== 'close') return;

    switch (control.dataset.popoverAction) {
      case 'close':
        return this._itemPopover.hidePopover();
      case 'edit':
        this._itemPopover.hidePopover();
        return item.sheet.render({ force: true });
      case 'post':
        return item.roll();
      case 'weapon-check':
        return item.openWeaponCheck();
      case 'stock':
        return item.adjustStock(Number(control.dataset.by));
      case 'delete':
        return item.confirmDelete();
    }
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

  /** Grow the biography to its content, up to its stylesheet-defined limit. */
  #resizeBiography() {
    const textarea = this.element.querySelector('.biography-textarea');
    if (!textarea || !textarea.offsetParent) return;

    textarea.style.height = 'auto';
    const style = getComputedStyle(textarea);
    const minHeight = Number.parseFloat(style.minHeight) || 0;
    const maxHeight = Number.parseFloat(style.maxHeight) || Infinity;
    const naturalHeight = Math.max(minHeight, textarea.scrollHeight);
    const height = Math.min(naturalHeight, maxHeight);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = naturalHeight > maxHeight ? 'auto' : 'hidden';
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
   * The columns and handles of one Basics row, in document order. Read off the
   * DOM rather than kept in a field so the template stays the single place a
   * row's column count is declared.
   * @param {HTMLElement} row
   * @returns {{cells: HTMLElement[], handles: HTMLElement[], key: string}}
   * @private
   */
  #rowParts(row) {
    return {
      key: row.dataset.splitRow,
      cells: [...row.querySelectorAll(':scope > .basics-cell')],
      handles: [...row.querySelectorAll(':scope > .basics-splitter')],
    };
  }

  /**
   * The stored shares for one row, normalised against its defaults.
   * @param {string} key
   * @returns {number[]}
   * @private
   */
  #rowShares(key) {
    const stored = game.settings.get('tno', 'basicsLayout') ?? {};
    return normalizeShares(stored[key], BASICS_LAYOUT_DEFAULT[key] ?? [1]);
  }

  /**
   * Paint the Basics tab's column splits. Each share becomes a column's
   * `flex-grow` off a zero basis, so the handles' own strips are subtracted
   * before the proportions are applied and a window resize keeps them. The
   * stylesheet carries the same defaults, which is what the tab is laid out
   * with until this runs.
   * @param {Record<string, number[]>} [layout]  Per-row shares; defaults to stored
   * @private
   */
  _applyColumnSplit(layout = null) {
    for (const row of this.element.querySelectorAll('.basics-row')) {
      const { key, cells } = this.#rowParts(row);
      const shares = layout?.[key]
        ? normalizeShares(layout[key], BASICS_LAYOUT_DEFAULT[key] ?? [1])
        : this.#rowShares(key);
      cells.forEach((cell, index) => { cell.style.flexGrow = String(shares[index]); });
    }
  }

  /**
   * Apply one row's shares and remember them. Client-scoped, so the layout
   * follows the player across every character sheet they open rather than
   * living on the actor.
   * @param {string} key
   * @param {number[]} shares
   * @private
   */
  #storeColumnSplit(key, shares) {
    const layout = { ...(game.settings.get('tno', 'basicsLayout') ?? {}), [key]: shares };
    this._applyColumnSplit(layout);
    game.settings.set('tno', 'basicsLayout', layout);
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);

    // The sheet body is replaced on every render, so the native popover lives
    // at document.body and delegates its own stable listeners there.
    this._itemPopover = document.createElement('div');
    this._itemPopover.className = 'tno item-popover';
    this._itemPopover.setAttribute('popover', 'auto');
    document.body.append(this._itemPopover);
    this._itemPopover.addEventListener('click', (event) => this.#onItemPopoverClick(event));
    this._itemPopover.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this._itemPopover.matches(':popover-open')) {
        // Native light-dismiss still handles Escape; only stop Foundry's
        // document keybind from closing the actor sheet at the same time.
        event.stopPropagation();
      }
    });
    this._itemPopover.addEventListener('toggle', (event) => {
      if (event.newState !== 'closed') return;
      this._itemPopoverItemId = null;
      this._itemPopoverAnchor = null;
    });

    // Custom clickable chips (anchors without `href`, plus `.skill-info` and
    // the carry grid's cells) are promoted to real keyboard targets in
    // _onRender; this forwards their Enter/Space to the same click listeners
    // bound below.
    this.#delegate('keydown', 'a:not([href]), .skill-info, .slot-cell, .slot-trinket, .armor-row[data-item-id], .banner-portrait .profile-img[data-action="editImage"]', (event, target) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      target.click();
    });

    // The description tab is hidden during the character sheet's initial
    // render, so size its textarea after Foundry has made that tab visible.
    this.#delegate('click', '.sheet-tabs [data-tab="description"]', () => {
      requestAnimationFrame(() => this.#resizeBiography());
    });

    this.#delegate('input', '.biography-textarea', () => this.#resizeBiography());

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

    // Drag one of the Basics tab's column dividers. Pointer capture keeps the
    // move and release events on the handle itself, so the drag needs no
    // listeners on `document` — which a detached sheet would bind to the wrong
    // window. Purely a display preference, so read-only sheets can drag too.
    //
    // A handle only ever redistributes the pair it sits between: the columns
    // past it keep the width they had, which is what makes a three-column row
    // with two handles behave the way a reader expects.
    this.#delegate('pointerdown', '.basics-splitter', (event, target) => {
      event.preventDefault();
      const row = target.parentElement;
      const { key, cells, handles } = this.#rowParts(row);
      const index = handles.indexOf(target);
      const [left, right] = [cells[index], cells[index + 1]];
      if (!left || !right) return;

      const shares = this.#rowShares(key);
      const pairShare = shares[index] + shares[index + 1];
      // Both columns' widths together are the only pixels this drag can move,
      // and they stand for `pairShare` of the row — so pixels and shares
      // convert into each other without needing the row's origin at all.
      const pairPx = left.offsetWidth + right.offsetWidth;
      if (pairPx <= 0 || pairShare <= 0) return;

      const minPx = (BASICS_CELL_MIN / pairShare) * pairPx;
      const startX = event.clientX;
      const startPx = left.offsetWidth;
      const sharesAt = (clientX) => {
        const leftPx = Math.clamp(startPx + (clientX - startX), minPx, pairPx - minPx);
        const next = [...shares];
        next[index] = (pairShare * leftPx) / pairPx;
        next[index + 1] = pairShare - next[index];
        return next;
      };

      const onMove = (moveEvent) => {
        this._applyColumnSplit({ [key]: sharesAt(moveEvent.clientX) });
      };
      const onEnd = (endEvent) => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onEnd);
        target.removeEventListener('pointercancel', onEnd);
        target.classList.remove('dragging');
        this.#storeColumnSplit(key, sharesAt(endEvent.clientX));
      };

      target.classList.add('dragging');
      target.setPointerCapture(event.pointerId);
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onEnd);
      target.addEventListener('pointercancel', onEnd);
    });

    // Double-click resets the whole row, which is the only way back once a
    // column has been dragged to its bound and lost its proportions. The row
    // rather than the one boundary: with two handles, restoring only the pair
    // under the pointer would leave the row in a state the defaults never had.
    this.#delegate('dblclick', '.basics-splitter', (event, target) => {
      event.preventDefault();
      const { key } = this.#rowParts(target.parentElement);
      this.#storeColumnSplit(key, [...(BASICS_LAYOUT_DEFAULT[key] ?? [1])]);
    });

    // The keyboard equivalents, since the handle is a focusable separator.
    this.#delegate('keydown', '.basics-splitter', (event, target) => {
      const step = { ArrowLeft: -0.02, ArrowRight: 0.02 }[event.key];
      if (step === undefined && event.key !== 'Home') return;
      event.preventDefault();

      const { key, handles } = this.#rowParts(target.parentElement);
      if (step === undefined) return this.#storeColumnSplit(key, [...(BASICS_LAYOUT_DEFAULT[key] ?? [1])]);

      const index = handles.indexOf(target);
      const shares = this.#rowShares(key);
      const pairShare = shares[index] + shares[index + 1];
      const next = [...shares];
      next[index] = Math.clamp(shares[index] + step, BASICS_CELL_MIN, pairShare - BASICS_CELL_MIN);
      next[index + 1] = pairShare - next[index];
      this.#storeColumnSplit(key, next);
    });

    // -------------------------------------------------------------
    // Everything below here only acts on an editable sheet.
    const editable = { requireEditable: true };

    // The banner's edge-reserve field. It carries no `name`, so the form never
    // submits it — the pool is derived and would be recomputed away. This
    // inverts the typed reserve back into the stored `spent` instead. A blank
    // or non-numeric entry means "no change", so the render restores the old
    // number rather than reading as a zero the player never asked for.
    this.#delegate('change', '.chip-value-input', (event, target) => {
      const typed = Number(target.value);
      if (target.value.trim() === '' || !Number.isFinite(typed)) {
        this.render();
        return;
      }
      this.#setEdgePool(typed);
      // #setEdgePool no-ops when the clamped value matches the current pool, in
      // which case no update fires and nothing re-renders — so an out-of-range
      // entry would otherwise sit in the box looking accepted.
      this.render();
    }, editable);

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

    // Edge pool is now set via the input field instead of clicking pips.
    // The pips are read-only display, input goes through .edge-pool-input.

    // Add Inventory Item
    this.#delegate('click', '.item-create', (event, target) => {
      this._onItemCreate(event, target);
    }, editable);

    // Delete Inventory Item. Deleting the embedded document re-renders the
    // sheet on its own, so the row does not need to be removed by hand. The
    // confirmation is the item's own, shared with the delete control on its
    // sheet: the same irreversible act should not be one click here and two
    // there.
    this.#delegate('click', '.item-delete', (event, target) => {
      const li = target.closest('.item');
      this.actor.items.get(li.dataset.itemId)?.confirmDelete();
    }, editable);

    // Author a new item from the carry grid (or the Inventar tab's list). One
    // dialog for all three physical types rather than a create control per
    // type: the type is a choice inside the act of adding something, not three
    // separate acts.
    this.#delegate('click', '.inventory-add', (event, target) => {
      event.preventDefault();
      this._promptCreateItem();
    }, editable);

    // Carry cells, loose trinkets and worn armour open a compact action
    // popover. The full editor remains one level below its Edit action. The
    // unequip x belongs to the row but keeps its dedicated state-change action.
    this.#delegate(
      'click',
      '.slot-cell[data-item-id], .slot-trinket, .armor-row[data-item-id]',
      (event, target) => {
        if (event.target.closest('.armor-unequip')) return;
        event.preventDefault();
        const item = this.actor.items.get(target.dataset.itemId);
        if (item) this.#openItemPopover(item, target);
      }
    );

    // Equipment: the x on a filled paper doll zone takes the piece off, which
    // hands it back to the carry budget. Putting a piece *on* is drag-only
    // (see _onDrop) — a zone is a drop target, never a create button.
    this.#delegate('click', '.armor-unequip', (event, target) => {
      event.preventDefault();
      this._setEquippedArmor(target.dataset.zone, null);
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

    // Say where a dragged item will land before it is dropped. The side is not
    // a matter of where in the cell the pointer is: core sorts by *direction of
    // travel* — backwards through the list drops before, forwards drops after —
    // so the marker reads the same `#sortsBefore` the sort itself does.
    this.#delegate(
      'dragover',
      '.slot-grid [data-item-id], .slot-trinkets [data-item-id], .items-list [data-item-id], .slot-empty',
      (event, target) => {
        event.preventDefault();
        this.#clearDropMarkers();
        const source = this.#dragging;
        if (!source) return;

        // The free tail sorts to the end rather than against a neighbour, so it
        // marks itself as a container instead of taking a side.
        if (target.classList.contains('slot-empty')) return target.classList.add('drop-into');

        const targetItem = this.actor.items.get(target.dataset.itemId);
        if (!targetItem || targetItem.id === source.id) return;

        // A multi-slot item is a run of cells, but it sorts as one thing, so
        // the marker belongs on the edge of the run — not on whichever cell the
        // pointer happens to be over.
        const before = this.#sortsBefore(source, targetItem);
        const run = this.element.querySelectorAll(`.slot-grid [data-item-id="${targetItem.id}"]`);
        const edge = run.length ? run[before ? 0 : run.length - 1] : target;
        edge.classList.add(before ? 'drop-before' : 'drop-after');
      },
      editable
    );

    // The doll's half of the same question. `armor-drop-target` from dragstart
    // says which zone *could* take the piece; this says the pointer is on it
    // now, so releasing here does something. Both halves of the doll answer —
    // the shapes carry `data-zone` as well as the rows, and `closest` walks a
    // limb's rect up to the group that holds the zone.
    this.#delegate(
      'dragover',
      '.paperdoll [data-zone]',
      (event, target) => {
        event.preventDefault();
        this.#clearDropMarkers();
        const source = this.#dragging;
        if (!armorZones(source).includes(target.dataset.zone)) return;
        target.classList.add('drop-onto');
      },
      editable
    );

    // Leaving the grid entirely has to clear the marker; moving between cells
    // does not, since the next `dragover` clears and re-marks anyway.
    this.#delegate('dragleave', '.slot-grid, .slot-trinkets, .items-list, .paperdoll', (event, target) => {
      if (target.contains(event.relatedTarget)) return;
      this.#clearDropMarkers();
    });
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    // Binds the inherited DragDrop instance, which makes `.draggable` item
    // rows draggable onto the hotbar.
    await super._onRender(context, options);

    this._makeKeyboardAccessible();
    this._applySkillFilter();
    this._applyColumnSplit();
    this.#resizeBiography();

    if (this._itemPopover?.matches(':popover-open')) {
      await this.#refreshItemPopover();
      this.#positionItemPopover();
    }
  }

  /** @inheritDoc */
  async _onClose(options) {
    if (this._itemPopover?.matches(':popover-open')) this._itemPopover.hidePopover();
    this._itemPopover?.remove();
    this._itemPopover = null;
    return super._onClose(options);
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
    // The carry grid's cells are divs, and with equipping gone drag-only they
    // are the only way left to reach a carried item's own sheet — so they have
    // to be reachable without a mouse. Only the first cell of a run takes the
    // stop: the others are the same item continuing, and tabbing through a
    // four-slot item four times to reach the next one is worse than not
    // reaching its tail at all.
    const targets = this.element.querySelectorAll(
      'a:not([href]), .skill-info, .slot-cell.slot-first, .slot-trinket, .armor-row[data-item-id], .banner-portrait .profile-img[data-action="editImage"]'
    );
    for (const el of targets) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    }
  }

  /**
   * Put an armour item on, or take off whatever is in a paper doll zone when
   * `itemId` is null.
   *
   * A piece covers whatever locations it was authored for, not just the one it
   * was dropped on: a coverall is one garment over torso, arms and legs, so
   * putting it on fills all three and taking it off by any one of them empties
   * all three. Anything less would leave a zone pointing at a sleeve nobody is
   * wearing.
   *
   * @param {string} zone  A key of CONFIG.TNO.armorZones.
   * @param {string|null} itemId
   * @private
   */
  async _setEquippedArmor(zone, itemId) {
    if (!(zone in CONFIG.TNO.armorZones)) return;

    const equipment = this.actor.system.equipment ?? {};
    const update = {};

    if (!itemId) {
      const worn = equipment[zone];
      if (!worn) return;
      for (const [key, value] of Object.entries(equipment)) {
        if (value === worn) update[`system.equipment.${key}`] = null;
      }
      return this.actor.update(update);
    }

    // Clear wherever the piece already sits before placing it, so a re-drop
    // onto a different zone moves the whole garment rather than cloning it.
    for (const [key, value] of Object.entries(equipment)) {
      if (value === itemId) update[`system.equipment.${key}`] = null;
    }

    const covered = armorZones(this.actor.items.get(itemId));
    for (const key of covered.length ? covered : [zone]) {
      update[`system.equipment.${key}`] = itemId;
    }

    return this.actor.update(update);
  }

  /**
   * Ask what to add to the inventory. Only the name, now: there is one kind of
   * physical item and what it *does* is the role it takes on, a chip on its own
   * sheet rather than a choice that has to be made before the thing exists.
   * Asking for a type up front got that backwards — it made the least
   * reversible answer the first one, and most objects have no role at all.
   *
   * Feature and spell are still absent: they are not objects, cost no slots,
   * and are created from their own lists.
   * @private
   */
  async _promptCreateItem() {
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('TNO.Inventory.AddTitle') },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize('TNO.Inventory.AddName')}</label>
          <input type="text" name="name" autofocus/>
        </div>`,
      ok: {
        label: game.i18n.localize('TNO.Inventory.Add'),
        callback: (event, button) => button.form.elements.name.value.trim(),
      },
      rejectClose: false,
    });
    if (name === null || name === undefined) return;

    const created = await Item.create(
      {
        // An empty field is a player who means "just add one" — a generic name
        // is better than an empty item nobody can find again.
        name: name || game.i18n.localize('TYPES.Item.item'),
        type: 'item',
      },
      { parent: this.actor }
    );

    // Straight into the item's own values: a fresh item is all zeroes and
    // blanks, which is exactly what still has to be filled in.
    return created?.sheet.render(true);
  }

  /**
   * @override
   * Route drops that land on one of the sheet's own equipment surfaces:
   *
   *  - **A paper doll zone** equips armour authored for that Stelle. This is
   *    the only way to put a piece on — a zone is a drop target, never a
   *    create button — so a piece the actor does not own yet is created first,
   *    which is what makes dragging from a compendium work.
   *  - **A free carry cell** moves an item to the end of the list, so gear can
   *    be dragged into the gap at the end of the grid and not just onto
   *    another block.
   *
   * Everything else falls through to core, whose `_onDropItem` sorts an item
   * the actor already owns against whichever `[data-item-id]` element it landed
   * on — which is what makes the grid, the zero-slot band and the flat list
   * re-orderable without a sort handler of our own.
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== 'Item') return super._onDrop(event);

    // Both the zone rows and the silhouette's shapes carry `data-zone`, so
    // either half of the doll takes the drop.
    const zoneEl = event.target?.closest?.('[data-zone]');
    const carryArea = event.target?.closest?.('.slot-grid, .slot-trinkets, .items-list');
    const emptyCell = event.target?.closest?.('.slot-empty');
    if (!zoneEl && !carryArea) return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    // Dropped back among the carried gear. Taking a piece off by dragging it
    // there is the mirror of putting it on by dragging it to the doll — the x
    // on the row is the same act, but a player who learned to equip by dragging
    // has no reason to expect the way back to be a different gesture. The
    // unequip has to land before any sort: while the piece is worn it is not in
    // the carry list at all, so sorting it against that list first would order
    // something that is not yet there.
    if (!zoneEl) {
      if (item.parent !== this.actor) return super._onDrop(event);
      const wornZone = this.#wornZone(item.id);
      if (wornZone) await this._setEquippedArmor(wornZone, null);
      // The free tail has no neighbour to sort against, so it means "put this
      // last" — for a piece just taken off as much as for anything else.
      if (emptyCell) return this._sortItemToEnd(item);
      // A piece that was worn has no place in the old list to sort against, so
      // it simply rejoins it; anything already carried sorts as before.
      return wornZone ? undefined : super._onDrop(event);
    }

    const zone = zoneEl.dataset.zone;
    const covered = armorZones(item);
    if (!covered.length) return;
    // The Rüstungen table binds each piece to the Stellen it was made for, so a
    // zone only takes what covers it. Silently ignoring the drop would read as
    // the doll being broken, so say where the piece does belong instead.
    if (!covered.includes(zone)) {
      return ui.notifications.warn(
        game.i18n.format('TNO.Armor.WrongZone', {
          item: item.name,
          zone: covered
            .map((key) => game.i18n.localize(CONFIG.TNO.armorZones[key] ?? key))
            .join(', '),
        })
      );
    }

    // Dropping armour the actor does not own yet has to create it first;
    // `parent` being this actor is what distinguishes the two cases.
    const owned =
      item.parent === this.actor
        ? item
        : (await this.actor.createEmbeddedDocuments('Item', [item.toObject()]))[0];

    return this._setEquippedArmor(zone, owned.id);
  }

  /**
   * Which paper doll zone is currently holding this item, if any. The map is
   * keyed by zone rather than by item, so the way back is a search — but it is
   * a search over five entries, and keeping the single zone→id direction is
   * what stops two pieces from both claiming one location.
   * @param {string} itemId
   * @returns {string|null}
   * @private
   */
  #wornZone(itemId) {
    const equipment = this.actor.system.equipment ?? {};
    return Object.keys(equipment).find((zone) => equipment[zone] === itemId) ?? null;
  }

  /**
   * Move an item past everything else the actor owns. Dropping into the free
   * tail of the grid has no neighbour to sort against, and "after the last
   * one" is the only reading that leaves the rest of the arrangement alone.
   * @param {Item} item
   * @private
   */
  async _sortItemToEnd(item) {
    const last = Math.max(0, ...this.actor.items.map((i) => i.sort ?? 0));
    if (item.sort === last) return;
    return item.update({ sort: last + CONST.SORT_INTEGER_DENSITY });
  }

  /**
   * @override
   * Sort a carried item against its neighbours.
   *
   * Core's version is almost right, but it collects siblings by reading
   * `data-item-id` off every child of the drop target's parent — and the carry
   * grid renders one cell *per slot*, so a multi-slot item answers to that id
   * several times over. Handing core the same document three times makes it
   * compare that item's sort against itself, find no gap, and fall through to
   * reindexing everything, which emits several updates for one id: the last
   * one silently wins and the item lands on the wrong side of the drop. Folding
   * the repeats back into one entry is the whole of the fix.
   *
   * `sortBefore` is passed explicitly rather than left to core's inference so
   * the drop indicator can be drawn from the same call (see `#sortsBefore`) —
   * a marker promising one side over a handler that picks the other is worse
   * than no marker at all.
   */
  _onSortItem(event, item) {
    const source = this.actor.items.get(item.id);
    const dropTarget = event.target?.closest?.('[data-item-id]');
    if (!source || !dropTarget) return;

    const target = this.actor.items.get(dropTarget.dataset.itemId);
    if (!target || source.id === target.id) return;

    const seen = new Set([source.id]);
    const siblings = [];
    for (const element of dropTarget.parentElement.children) {
      const id = element.dataset.itemId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const sibling = this.actor.items.get(id);
      if (sibling) siblings.push(sibling);
    }

    const sortUpdates = foundry.utils.performIntegerSort(source, {
      target,
      siblings,
      sortBefore: this.#sortsBefore(source, target),
    });
    const updateData = sortUpdates.map((u) => ({ ...u.update, _id: u.target.id }));

    return this.actor.updateEmbeddedDocuments('Item', updateData);
  }

  /**
   * Which side of `target` a dropped `source` lands on. Mirrors the rule core
   * infers when `sortBefore` is left out: dragging an item backwards through
   * the list puts it before what it was dropped on, dragging it forwards puts
   * it after. Named so the drop indicator and the sort itself read from one
   * place and cannot drift apart.
   * @param {Item} source
   * @param {Item} target
   * @returns {boolean}
   * @private
   */
  #sortsBefore(source, target) {
    return (source.sort || 0) > (target.sort || 0);
  }

  /**
   * @inheritDoc
   * Mark up the sheet for the duration of a drag: the piece being moved dims,
   * the sheet root says a drag is in flight so drop targets can light up only
   * while one is, and armour additionally marks the paper doll zone it belongs
   * to. With equipping drag-only, an empty zone has to say that it is a target
   * before the player lets go — otherwise the only way to discover the
   * interaction is to try it.
   */
  async _onDragStart(event) {
    // Read before awaiting: `currentTarget` is only valid while the event is
    // being dispatched, and the await hands control back after that.
    const dragged = event.currentTarget;
    await super._onDragStart(event);

    const item = this.actor.items.get(dragged?.dataset?.itemId);
    if (!item) return;

    this.#dragging = item;
    // Every cell of a multi-slot item is the same item, so the whole run dims
    // rather than just the cell that happened to be grabbed.
    for (const el of this.element.querySelectorAll(`[data-item-id="${item.id}"]`)) {
      el.classList.add('slot-dragging');
    }
    this.element.classList.add('dragging-item');

    // Which way this drag can go decides what lights up. A piece still in the
    // carry slots is on its way onto the body, so the doll answers; a piece
    // already worn is on its way off, so the carry grid does. Marking both at
    // once would offer the player a move they cannot make in that direction.
    const worn = this.#wornZone(item.id);
    const zones = worn ? [] : armorZones(item);
    const rows = zones.flatMap((zone) => [
      ...this.element.querySelectorAll(`.armor-row[data-zone="${zone}"]`),
    ]);
    for (const row of rows) row.classList.add('armor-drop-target');

    const grid = worn ? this.element.querySelector('.slot-grid-block') : null;
    grid?.classList.add('carry-drop-target');

    // The same invitation on the silhouette. The row says which zone in words;
    // the figure says where it is on the body, and the piece is dragged towards
    // the picture as often as towards the row. The Unterkleidung is not a hit
    // location — it covers all four at once — so it lights every shape rather
    // than looking for a `suit` shape that does not exist.
    const shapes = zones.flatMap((zone) => [
      ...this.element.querySelectorAll(
        zone === 'suit'
          ? '.paperdoll-figure .zone'
          : `.paperdoll-figure .zone[data-zone="${zone}"]`
      ),
    ]);
    for (const shape of shapes) shape.classList.add('zone-drop-target');

    dragged.addEventListener(
      'dragend',
      () => {
        this.#dragging = null;
        for (const row of rows) row.classList.remove('armor-drop-target');
        grid?.classList.remove('carry-drop-target');
        for (const shape of shapes) shape.classList.remove('zone-drop-target');
        this.element.classList.remove('dragging-item');
        this.#clearDropMarkers();
        for (const el of this.element.querySelectorAll('.slot-dragging')) {
          el.classList.remove('slot-dragging');
        }
      },
      { once: true }
    );
  }

  /**
   * Take every drop marker back off. Called on each `dragover` before the
   * current target is marked, and once more when the drag ends — a `dragleave`
   * alone cannot be trusted to fire for the element the pointer left.
   * @private
   */
  #clearDropMarkers() {
    for (const el of this.element.querySelectorAll(
      '.drop-before, .drop-after, .drop-into, .drop-onto'
    )) {
      el.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-onto');
    }
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

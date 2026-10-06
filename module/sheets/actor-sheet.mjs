import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { ausweichenOptions, canDefend, takeStance } from '../helpers/combat-actions.mjs';
import { stanceEntry, stancePopoverGroups } from '../helpers/stances.mjs';
import { colorForValue, INK_DARK } from '../helpers/heatmap.mjs';
import { damageTrackRows } from '../helpers/damage.mjs';
import { TnoRollDialog } from '../apps/roll-dialog.mjs';
import { TnoAdvanceDialog } from '../apps/advance-dialog.mjs';
import { TnoHeatmapLab } from '../apps/heatmap-lab.mjs';
import { TnoCustomSkillDialog } from '../apps/custom-skill-dialog.mjs';
import { TNO_ADVANTAGE, rollTno } from '../helpers/dice.mjs';
import { getSkillDefinitions, getSkillDefinition } from '../helpers/skills.mjs';
import { rankXpTotal, xpProgress, xpSummary } from '../helpers/advancement.mjs';
import {
  armorEquipUpdate,
  buildSlotGrid,
  dragTargets,
  slotMeter,
  ARMOR_ADDON_ZONES,
  HANDS,
  heldItemIds,
  holdInHand,
  isStashed,
  releaseHand,
  releaseItem,
  wornItemIds,
  wornZone,
} from '../helpers/inventory.mjs';
import { MONEY_CURRENCIES, normalizeMoneyAmount, prepareWallet } from '../helpers/money.mjs';
import { prepareGearSummaryContext } from '../helpers/item-summary.mjs';
import { SheetPopover } from '../helpers/popover.mjs';
import {
  ITEM_ROLES,
  MISSING_FIELD_LABELS,
  ROLE_ICONS,
  armorZones,
  canWeaponAttack,
  canWeaponParry,
  inventoryArt,
  isGear,
  itemRoles,
  selectRole,
  weaponUse,
} from '../helpers/items.mjs';
import {
  CELL_KINDS,
  ITEM_TABLE_COLUMNS,
  ITEM_TABLE_SECTIONS,
  NAME_SORT_KEY,
  PLAIN_ROLE,
  buildItemGroups,
  nextItemTableSort,
  normalizeItemTableConfig,
  toggleItemTableColumn,
} from '../helpers/item-table.mjs';
import { itemTypeLine } from '../helpers/item-presentation.mjs';
import {
  addConnection,
  addLabel,
  connectionSearchText,
  labelSuggestions,
  LABEL_FIELDS,
  removeLabel,
  personSuggestions,
  adoptPerson,
  editConnection,
  hasConnectionTo,
  normalizeConnections,
  removeConnection,
} from '../helpers/connections.mjs';
import {
  GRAPH_HIDEABLE_KINDS,
  GRAPH_NODE_KINDS,
  SPRING_DEFAULTS,
  SPRING_PARAMS,
  buildConnectionGraph,
  graphNodeDetails,
  graphViewModel,
  layoutGraph,
  normalizeSpringParams,
} from '../helpers/connection-graph.mjs';
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  dragGraphNode,
  lightGraphNode,
  showGraphCard,
  startGraph,
} from './connection-graph-view.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * How much room the tab rail needs right of the sheet. With less than that —
 * the sheet pushed against the screen edge, or detached into a window of its
 * own — the rail moves inside the sheet (see `#placeTabRail`).
 */
const TAB_RAIL_WIDTH = 44;

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
  // One row of two columns. Its own key, so shares stored for the earlier
  // two-row layouts cannot size these columns.
  main: [0.5, 0.5],
});

/**
 * The skill categories the "Kampf" filter shows: fighting and the manoeuvres
 * fought with.
 */
const COMBAT_SKILL_CATEGORIES = Object.freeze(['combat', 'maneuvers']);

/**
 * The narrowest a column may be dragged, as its share of the row. Below this a
 * column has no width left to grab its own handle back out by.
 */
const BASICS_CELL_MIN = 0.12;

/**
 * How many conditions the band names before it starts counting the rest. Three
 * fits the identity lane at its protected width even with the longest German
 * names ("Beine verkrüppelt") and still leaves the role line its own edge.
 */
const BANNER_CONDITION_LIMIT = 3;

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
    // Wide enough for the Basics tab's three upper columns and two lower ones,
    // and still leaves the scene and Foundry's sidebar room on a 1920px screen.
    // The height shows the banner, the whole upper row and the start of the
    // skill list and slot raster, and fits a 1080p screen with browser chrome;
    // the long lists below scroll.
    position: { width: 1280, height: 900 },
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
   * The Beziehungen graph's running spring embedder and its animation frame,
   * or null while the graph is not shown or has come to rest.
   * `held` keeps it running while a node is dragged, at rest or not.
   * @type {{sim: object, frame: number|null, held: boolean, wake: () => void}|null}
   */
  #graphRun = null;

  /**
   * Watches the carry raster's width so the wrap marks can be re-measured. The
   * grid element is replaced on every render, so the observer is re-pointed in
   * `_onRender` rather than bound once.
   * @type {ResizeObserver|null}
   */
  #slotGridObserver = null;

  /**
   * The body-level popovers, built in `_onFirstRender` and removed in
   * `_onClose`: item, money, columns, stance, condition, edge.
   * @type {Record<string, SheetPopover>|null}
   */
  #popovers = null;

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
        { id: 'basics', icon: 'fa-solid fa-dice-d20', label: 'TNO.TabBasics' },
        { id: 'biography', icon: 'fa-solid fa-book-user', label: 'TNO.TabBiography' },
        { id: 'connections', icon: 'fa-solid fa-circle-nodes', label: 'TNO.TabConnections' },
        { id: 'items', icon: 'fa-solid fa-backpack', label: 'TNO.TabItems' },
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
   * NPCs have no attribute matrix, skill list or Beziehungen, so they drop
   * those tabs and open on the biography instead.
   * @override
   */
  _getTabsConfig(group) {
    const config = super._getTabsConfig(group);
    if (!config || this.actor.type !== 'npc') return config;
    return {
      ...config,
      tabs: config.tabs.filter((tab) => !['basics', 'connections'].includes(tab.id)),
      initial: 'biography',
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
    context.money = this.#moneyContext(context.system.money);

    // The Haltung picker. Rendered as its own control rather than folded into
    // a defence action because it is announced *before* anything is rolled —
    // "kündigt er zuerst seine beabsichtigte Handlung und Haltung an" — and it
    // is the one value the defence side of an exchange cannot do without. The
    // banner only carries the Haltung in force; the nine to choose from live in
    // the popover, which is built on demand from `helpers/stances.mjs`.
    context.stance = stanceEntry(context.system.derived?.stance);
    const dodgeAvailable = context.system.derived?.defenses?.dodge?.available === true;
    const dodgeMalus = Number(context.system.derived?.defenses?.dodge?.malus) || 0;
    context.dodgeDefense = {
      available: dodgeAvailable,
      disabled: !dodgeAvailable || !context.editable,
      malus: dodgeMalus,
      hint: dodgeMalus < 0
        ? game.i18n.format('TNO.Combat.NextDefenseMalus', { value: dodgeMalus })
        : game.i18n.localize('TNO.Combat.DodgeHint'),
    };

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
          // are prefixed onto every cell tooltip: the matrix heads its columns
          // but not its rows, so the tooltip carries both axes.
          const colLabel = game.i18n.localize(
            CONFIG.TNO.attributeCategories[categoryKeys[ci]]
          );
          const axisPrefix = `${rowLabel} · ${colLabel} — `;
          const ability = abilities[key];
          const value = ability?.base ?? 0;
          const xp = ability?.xp ?? 0;
          const dc = colorForValue(value);
          // The tile hairline is a wash of the cell's own ink, so it holds
          // whether the graded tile came out pale or nearly black.
          // colorForValue only ever picks one of two ink tones, so a
          // two-branch wash covers the whole ramp.
          const onLightInk = dc.textColor !== INK_DARK;

          return {
            key,
            label: game.i18n.localize(labelKey),
            hint: axisPrefix + game.i18n.localize(labelKey.replace('.long', '.hint')),
            value,
            xp,
            ...xpProgress('attribute', value, xp),
            xpBarTrack: 'rgba(0,0,0,0.12)',
            xpBarFill: 'rgba(51,45,34,0.45)',
            cellBg: dc.bg,
            textColor: dc.textColor,
            tileBorder: onLightInk ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)',
            isPeak: dc.isPeak,
          };
        }),
        };
      }),
    };
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

    // Which of the three carried-things tabs (Inventar / Kleinkram / Geld) is
    // showing, and the Kleinkram filter text. View state only, kept on the
    // sheet instance like the skill filter.
    this._looseTab ??= 'inventory';
    context.looseTab = this._looseTab;
    this._trinketFilter ??= '';
    context.trinketFilter = this._trinketFilter;

    // The Beziehungen table. Rows carry their search text so the filter can
    // stay client-side, like the Inventar search.
    this._connectionSearch ??= '';
    // The graph is the tab's face; an empty list opens on the table, where
    // the first row is typed.
    this._connectionView ??= normalizeConnections(this.actor.system.connections).length ? 'graph' : 'table';
    context.connections = {
      search: this._connectionSearch,
      view: this._connectionView,
      // Laid out only while it is shown — graph view on the Beziehungen tab
      // in front: the force layout is the one costly thing on this tab, and
      // every change to the actor renders the whole sheet. Opening the tab
      // later renders it then (see the tab click).
      graph: this._connectionView === 'graph' && this.tabGroups?.primary === 'connections'
        ? this.#connectionGraphContext()
        : null,
      rows: normalizeConnections(this.actor.system.connections).map((entry) => ({
        ...entry,
        searchText: connectionSearchText(entry),
        // The three label columns stand side by side and work alike, so the
        // template draws them from one loop.
        labelCells: Object.keys(LABEL_FIELDS).map((field) => ({
          field,
          labels: entry[field],
          label: `TNO.Connections.Field.${field}`,
          placeholder: `TNO.Connections.Placeholder.${field}`,
        })),
      })),
    };

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
            ...xpProgress('skill', rank, xp),
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
        totalXp: groupSkills.reduce((sum, skill) => sum + rankXpTotal('skill', skill.rank), 0),
      };
    });

    // XP invested so far, by attributes and skills, and what the character has
    // earned in all — see `xpSummary`. Attribute points and skill ranks are
    // never added together: they are on different scales. Summed from every
    // skill: the category filter is applied to the DOM, not to `skillGroups`.
    const xp = xpSummary(
      rows.flat().map((key) => ({ rank: abilities[key]?.base ?? 0, xp: abilities[key]?.xp ?? 0 })),
      context.skillGroups.flatMap((group) => group.skills)
    );
    context.attributeGrid.totalXp = xp.attributeXpSpent;
    context.skillXpTotal = xp.skillXpSpent;
    context.skillRankTotal = context.skillGroups.reduce((sum, group) => sum + group.totalRank, 0);
    context.totalXpSpent = xp.spent;
    context.totalXpUnspent = xp.unspent;
    context.totalXpAcquired = xp.acquired;

    // The edge reserve as a pip row for the banner pill: one pip per point of
    // the maximum, filled up to the current pool. Built here rather than in the
    // template because Handlebars has no "repeat n times".
    const edgeMax = this.actor.system.derived?.edgePoolMax ?? 0;
    const edgeNow = this.actor.system.derived?.edgePool ?? 0;
    context.edgePips = Array.from({ length: edgeMax }, (_, i) => ({
      filled: i < edgeNow,
    }));

    const derived = this.actor.system.derived ?? {};
    context.damage = this.#damageContext();
    context.conditions = this.#conditionsContext();

    // Which movement tiers the character has lost, for the derived strip under
    // the attribute matrix. The load's consequence is shown on the number it
    // takes away rather than as a badge over the slot grid: what a player wants
    // to know is "how far can I move", and a struck-through figure answers that
    // where the figure already is — wherever that figure lives. Sprinting is
    // blocked once the load reaches half the budget; `canSprint` carries that
    // result into the sheet context.
    context.movement = {
      sprintBlocked: derived.canSprint === false,
      walkBlocked: derived.carryState === 'crawlOnly',
    };
  }

  /**
   * The two damage tracks as the band and the condition panel both draw them:
   * counted boxes rather than a scaled bar. At a capacity of trained Stärke
   * there are only ever a handful of them, and a box past the capacity mark
   * says "over the line" without the mark having to move as a percentage track
   * would make it.
   *
   * Built here rather than in `_prepareCharacterData` because the panel is
   * rendered on its own, outside a sheet render, and has to draw the same rows
   * the band does.
   * @returns {object}
   * @private
   */
  #damageContext() {
    const damage = this.actor.system.derived?.damage ?? {
      sharp: 0,
      blunt: 0,
      capacity: 0,
      bluntCarried: 0,
      bluntConverted: 0,
      effectiveSharp: 0,
      total: 0,
      malus: 0,
      downed: false,
      full: false,
    };
    // The malus is only drawn when it is a figure worth announcing — from −1
    // down, or from +1 up should anything ever add to a roll instead. At zero
    // the cell is left out entirely rather than held open as a dimmed `0`: it
    // sits on the name's baseline, so nothing collapses when it goes, and the
    // tracks under it already say the character is unhurt.
    const malus = Number(damage.malus) || 0;
    return {
      ...damage,
      rows: damageTrackRows(damage),
      hasMalus: malus !== 0,
      // A true minus sign rather than a hyphen: at this size the difference
      // between the two is the difference between a figure and a stray dash.
      malusLabel: `${malus < 0 ? '\u2212' : '+'}${Math.abs(malus)}`,
    };
  }

  /**
   * The condition collection with its presentation strings added. The rule
   * layer supplies the plain list; nothing here decides what is active.
   *
   * `active` is what the Zustände pill draws — every active condition,
   * severity-sorted by `resolveConditions()` and including the three derived
   * entries (load, armour weight, a Haltung without Ausweichen). `rows` is the
   * panel's 3x2 raster, which keeps Wucht above Schaden and holds the six
   * damage warnings only. `items` is the whole list.
   * @returns {object}
   * @private
   */
  #conditionsContext() {
    const conditions = this.actor.system.derived?.conditions ?? {
      items: [],
      rows: [[], []],
      active: [],
      hasActive: false,
    };
    const statusItems = conditions.items.map((condition) => {
      return {
        ...condition,
        label: game.i18n.localize(condition.labelKey),
        // Two letters off the label's own words. The collection surfaces have
        // room for a mark, not a name, and an abbreviation of the name is one
        // fewer vocabulary than a pictogram would be.
        tag: game.i18n.localize(condition.tagKey),
        reason: this.#conditionReason(condition),
        // Every condition names what it costs. Only the three derived ones are
        // enforced by the system; the six damage effects are the table's, and
        // the sheet states them without acting on them.
        effect: condition.effectKey ? game.i18n.localize(condition.effectKey) : '',
        stateLabel: game.i18n.localize(`TNO.Status.State.${condition.state}`),
      };
    });
    const byKey = new Map(statusItems.map((condition) => [condition.key, condition]));
    const active = conditions.active.map((condition) => byKey.get(condition.key));
    return {
      ...conditions,
      items: statusItems,
      rows: conditions.rows.map((row) => row.map((condition) => byKey.get(condition.key))),
      active,
      // The band names the worst few and counts the rest. Nine at once is the
      // arithmetic maximum, not the case worth designing for: a character
      // normally carries none or one or two, and spelling those out costs less
      // width than a code the reader has to learn. The overflow is what keeps
      // the rare crowded case from taking the lane — the panel behind it lists
      // every entry in full, which is the point of a summary having a detail.
      shown: active.slice(0, BANNER_CONDITION_LIMIT),
      hiddenCount: Math.max(0, active.length - BANNER_CONDITION_LIMIT),
    };
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    // Initialize containers. There are only two, because there are only two
    // lists: everything physical, and the features that are not objects.
    //
    // Per-role buckets (`armory`, `weapons`) are still not built here. The
    // Inventar tab groups by role, but it groups *rows of one list* — an item
    // put into a bucket would have to be taken back out of it the moment its
    // role changed, and the grouping is a reading of the list rather than a
    // second place the item lives.
    const gear = [];
    const features = [];

    // Which items are on the body. Wearing remains its own state even though
    // those pieces now share the slot budget, so ledger rows keep their marker.
    // NPCs have no equipment store, so this is simply empty for them.
    const worn = wornItemIds(this.actor.system.equipment);

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || Item.DEFAULT_ICON;
      i.isWorn = worn.has(i._id);

      if (i.type === 'feature') {
        features.push(i);
        continue;
      }
      // The `spell` type stays registered — a document's type cannot change
      // after creation, so unregistering it would break any world holding one —
      // but the system has no magic and no sheet surface lists spells. Skipped
      // so it cannot fall through into the inventory.
      if (i.type === 'spell') continue;

      // Everything else is an object, and every object is inventory. What it
      // *does* is a matter of the roles it carries, which is a second question
      // asked of the same item rather than a different bucket to put it in.
      i.inventoryArt = inventoryArt(i);
      gear.push(i);
    }

    context.features = features;

    // The ledger covers everything the inventory rules touch, armour and
    // weapons included. It is the complete owned-item view, independent of
    // whether a piece is currently worn or packed.
    context.itemTable = this.#itemTableContext(gear, worn);

    if (context.actor.type === 'character') this._prepareEquipment(context);
  }

  /* -------------------------------------------- */
  /*  Inventar tab: the item table                */
  /* -------------------------------------------- */

  /** The stored per-user table layout, always in a shape the table can use. */
  #itemTableConfig() {
    return normalizeItemTableConfig(game.settings.get('tno', 'itemTableLayout'));
  }

  /** Persist a table layout and redraw, since the columns come from context. */
  async #storeItemTableConfig(config) {
    await game.settings.set('tno', 'itemTableLayout', config);
    this.render();
  }

  /**
   * The Inventar tab's whole view model: the header row, the four role groups
   * with their rows already sorted, and the column picker's checkboxes.
   *
   * Everything localized happens here rather than in the helper or the
   * template. `item-table.mjs` stays free of Foundry globals so it can be
   * tested without a world, and the template holds no formatting decisions —
   * the same split the compact item card already uses.
   *
   * @param {Array<object>} items  The actor's physical items, as plain objects.
   * @param {Set<string>} worn     Item ids currently on the body.
   * @returns {object}
   */
  #itemTableContext(items, worn) {
    const config = this.#itemTableConfig();
    // `numeric` so a name ending in a figure sorts 2 before 10, and `base` so
    // case and accents do not split otherwise identical names apart.
    const collator = new Intl.Collator(game.i18n.lang, { sensitivity: 'base', numeric: true });
    const groups = buildItemGroups(items, {
      worn,
      columns: config.columns,
      sort: config.sort,
      collator: (a, b) => collator.compare(a, b),
    });

    const visible = config.columns
      .map((key) => ITEM_TABLE_COLUMNS.find((column) => column.key === key))
      .filter(Boolean);

    // The name is the row's identity rather than one of its values, so it heads
    // the table without being one of the pickable columns — and it is still a
    // sort target, since "alphabetical" is the order most lists want.
    const headers = [
      this.#columnHeader({ key: NAME_SORT_KEY, labelKey: 'TNO.Inventory.AddName', hintKey: 'TNO.Inventory.AddName', numeric: false }, config.sort),
      ...visible.map((column) => this.#columnHeader(column, config.sort)),
    ];

    return {
      headers,
      // The name column takes what is left after the value columns and the
      // controls, which are the parts with a fixed appetite. Value columns are
      // equal-width so the header and every group line up in one grid — which
      // is also why the whole table is a single grid rather than one per group.
      gridTemplate: ['minmax(8rem, 3fr)', ...visible.map(() => 'minmax(3.25rem, 1fr)'), '4.5rem'].join(' '),
      groups: groups.map((group) => this.#groupContext(group, visible)),
      empty: !items.length,
      sections: this.#columnPickerSections(config),
      search: this._itemSearch ?? '',
    };
  }

  /** One header cell: its caption, its long name, and how it is sorted now. */
  #columnHeader(column, sort) {
    const sorted = sort.key === column.key;
    return {
      key: column.key,
      label: game.i18n.localize(column.labelKey),
      hint: game.i18n.localize(column.hintKey),
      numeric: !!column.numeric,
      sorted,
      dir: sorted ? sort.dir : null,
      sortHint: sorted
        ? game.i18n.localize(sort.dir === 'desc' ? 'TNO.ItemTable.SortedDesc' : 'TNO.ItemTable.SortedAsc')
        : game.i18n.localize('TNO.ItemTable.SortHint'),
    };
  }

  /** One role group: its title, its badge of totals, and its finished rows. */
  #groupContext(group, columns) {
    const label = group.role === PLAIN_ROLE
      ? 'TNO.Item.Role.Plain'
      : CONFIG.TNO.itemRoles[group.role];

    // Two figures worth adding up. Slots because the budget is the rule this
    // tab serves, money because "what is all this worth" is a ledger question.
    const badge = [`${group.count}`, `${group.footprint} ${game.i18n.localize('TNO.Item.Cap.Slots')}`];
    if (group.hasValue) badge.push(`${this.#formatNumber(group.value)} €`);

    return {
      role: group.role,
      label: game.i18n.localize(label),
      count: group.count,
      badge: badge.join(' · '),
      badgeHint: game.i18n.format('TNO.ItemTable.GroupBadgeHint', {
        count: group.count,
        slots: group.footprint,
      }),
      rows: group.rows.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.item.inventoryArt.icon,
        img: row.item.inventoryArt.img,
        worn: row.worn,
        stashed: row.stashed,
        cells: columns.map((column) => this.#cellContext(column, row.cells[column.key], row.item)),
      })),
    };
  }

  /**
   * One body cell, as the two things a reader needs: what it says, and why.
   *
   * Three outcomes, and keeping them apart is the whole job. A column the row
   * cannot answer is `na` — hatched, the same convention the item card uses for
   * a forbidden field. A column it *could* answer but nobody has filled in is a
   * dash. Only a real authored value is a figure, which is why `null` may never
   * be coerced through `Number()` on its way here.
   */
  #cellContext(column, cell, item) {
    if (!cell?.applies) {
      return { key: column.key, na: true, text: game.i18n.localize('TNO.Item.Summary.Na'), title: this.#naReason(column, item), numeric: column.numeric };
    }
    if (cell.value === null || cell.value === undefined) {
      return { key: column.key, blank: true, text: '—', title: game.i18n.localize('TNO.Item.Summary.Missing'), numeric: column.numeric };
    }

    const { text, title, warn } = this.#cellValue(column, cell.value);
    return {
      key: column.key,
      text,
      title: title ?? game.i18n.localize(column.hintKey),
      warn,
      numeric: column.numeric,
    };
  }

  /** Why a cell is n/a, in the words the item sheet already uses for it. */
  #naReason(column, item) {
    if (column.appliesTo === 'weapon') {
      if (!itemRoles(item).weapon) return game.i18n.localize('TNO.Item.NaNoWeapon');
      return game.i18n.localize(weaponUse(item.system) === 'melee' ? 'TNO.Item.NaMelee' : 'TNO.Item.NaRanged');
    }
    if (column.appliesTo === 'armor') {
      // A suit is the other reason an armour column can be n/a, and it is a
      // rule rather than a missing role: the Rüstungstabelle gives the
      // Unterkleidung no hardness and no single location to cover.
      if (!itemRoles(item).armor) return game.i18n.localize('TNO.ItemTable.NaNoArmor');
      return game.i18n.localize('TNO.Armor.NaSuit');
    }
    return game.i18n.localize('TNO.Item.Summary.Na');
  }

  /** Turn one raw cell value into the words for it. */
  #cellValue(column, value) {
    switch (column.kind) {
      case CELL_KINDS.CHOICE:
        return { text: this.#choiceLabel(column.key, value) };
      case CELL_KINDS.PAIR: {
        // HH is two signed modifiers, and the sign is the meaning: +0 and −0
        // are the same handling, so a bare 0 would read as "unset" beside the
        // dash that genuinely means that.
        const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');
        return {
          text: `${signed(value.active)} / ${signed(value.passive)}`,
          title: `${game.i18n.localize('TNO.Item.Summary.HhAttack')} ${signed(value.active)} · ${game.i18n.localize('TNO.Item.Summary.HhParry')} ${signed(value.passive)}`,
        };
      }
      case CELL_KINDS.FIELDS: {
        // No open fields is the good outcome, so it reads as a quiet tick
        // rather than a zero the eye has to stop on.
        if (!value.length) return { text: '✓', title: game.i18n.localize('TNO.Item.AllRequiredSet') };
        const fields = value.map((key) => game.i18n.localize(MISSING_FIELD_LABELS[key] ?? key)).join(', ');
        return {
          text: String(value.length),
          title: game.i18n.format('TNO.Item.Summary.MissingBanner', { fields }),
          warn: true,
        };
      }
      default:
        return { text: this.#formatNumber(value) };
    }
  }

  /**
   * Quarter-step SVs and euro prices both want the reader's own decimal
   * separator — the Rüstungen table writes +0,25 in German. Whole numbers come
   * out unchanged.
   */
  #formatNumber(value) {
    return new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 2 }).format(value);
  }

  /**
   * Why one condition is on, in its own terms. Each source compares a different
   * pair, so the panel's second line is built per source rather than from one
   * generic sentence that would have to fit all of them badly.
   */
  #conditionReason(condition) {
    switch (condition.source) {
      // Only an active load has a line it crossed, so only it has a reason.
      case 'carry':
        if (!condition.reasonKey) return '';
        return game.i18n.format(condition.reasonKey, {
          used: this.#formatNumber(condition.value),
          capacity: this.#formatNumber(condition.threshold),
          limit: this.#formatNumber(condition.limit),
        });
      // The summed SV runs in quarter steps, so it needs the reader's own
      // decimal separator exactly as the paper doll's warning line does.
      case 'armor':
        return game.i18n.format(condition.reasonKey, {
          str: this.#formatNumber(condition.value),
          sv: this.#formatNumber(condition.threshold),
        });
      case 'defense':
        return game.i18n.format(condition.reasonKey, {
          stance: condition.stanceLabelKey
            ? game.i18n.localize(condition.stanceLabelKey)
            : '—',
        });
      // A manual light says why it disagrees with the threshold, not only what
      // the threshold reads — otherwise a forced-on light explains itself with
      // a comparison that says it should be off.
      default:
        return game.i18n.format(
          condition.state === 'manualActive' && !condition.derivedActive
            ? 'TNO.Status.ThresholdForced'
            : condition.state === 'suppressed' && condition.derivedActive
              ? 'TNO.Status.ThresholdSuppressed'
              : condition.derivedActive
                ? 'TNO.Status.ThresholdReached'
                : 'TNO.Status.ThresholdPending',
          {
            pool: game.i18n.localize(condition.poolLabelKey),
            value: condition.value,
            attribute: game.i18n.localize(condition.abilityLabelKey),
            threshold: condition.threshold,
          }
        );
    }
  }

  /** Localize a value that is a key into one of the CONFIG.TNO label maps. */
  #choiceLabel(key, value) {
    if (key === 'state') {
      const label = { worn: 'TNO.Inventory.Worn', stashed: 'TNO.Inventory.Stashed' }[value] ?? 'TNO.Inventory.Carried';
      return game.i18n.localize(label);
    }
    if (key === 'use') return game.i18n.localize(CONFIG.TNO.weaponUses[value] ?? value);
    if (key === 'zone') return game.i18n.localize(CONFIG.TNO.armorZones[value] ?? value);
    if (key === 'wf') return getSkillDefinition(this.actor, value)?.label ?? String(value);
    if (key === 'wa') {
      // The attribute map holds the long names; the short form is the same key
      // with a different leaf, so the abbreviation needs no second table.
      const long = CONFIG.TNO.abilities[value];
      return long ? game.i18n.localize(long.replace(/\.long$/, '.abbr')).toUpperCase() : String(value);
    }
    return String(value);
  }

  /** The column picker's checkboxes, grouped the way the catalogue is. */
  #columnPickerSections(config) {
    const labels = {
      general: 'TNO.Item.General',
      trade: 'TNO.Item.Trade',
      weapon: 'TNO.Item.Role.Weapon',
      armor: 'TNO.Item.Role.Armor',
    };
    return ITEM_TABLE_SECTIONS.map((section) => ({
      key: section,
      label: game.i18n.localize(labels[section]),
      columns: ITEM_TABLE_COLUMNS.filter((column) => column.section === section).map((column) => ({
        key: column.key,
        label: game.i18n.localize(column.labelKey),
        hint: game.i18n.localize(column.hintKey),
        checked: config.columns.includes(column.key),
      })),
    }));
  }

  /**
   * Show/hide item rows per the Inventar tab's search box, and hide a group
   * left with nothing in it.
   *
   * DOM-level like the skill filter, and for the same reason: the table's
   * columns come from context, so filtering through a re-render would rebuild
   * every row on every keystroke and take the caret with it. An empty search
   * puts everything back, groups included.
   * @private
   */
  _applyItemFilter() {
    const table = this.element.querySelector('.item-table');
    if (!table) return;

    const search = (this._itemSearch ?? '').trim();
    let anyVisible = false;
    for (const groupEl of table.querySelectorAll('.item-group')) {
      const key = groupEl.dataset.group;
      const rows = table.querySelectorAll(`.item-row[data-group="${key}"]`);
      let visible = 0;
      for (const rowEl of rows) {
        const match = !search || fuzzyMatch(search, rowEl.dataset.name ?? '');
        rowEl.style.display = match ? '' : 'none';
        if (match) visible++;
      }
      // While a search is running, a group that matched nothing is out of the
      // way entirely — including its "nothing here" line, which would otherwise
      // answer a question nobody asked. With the box empty every group is back,
      // empty ones included: that they are empty is itself an answer.
      const hide = !!search && !visible;
      groupEl.style.display = hide ? 'none' : '';
      const emptyEl = table.querySelector(`.item-group-empty[data-group="${key}"]`);
      if (emptyEl) emptyEl.style.display = hide || (search && rows.length) ? 'none' : '';
      anyVisible ||= visible > 0;
    }

    const none = table.parentElement.querySelector('.item-table-nomatch');
    if (none) none.hidden = !search || anyVisible;
  }

  /**
   * Build the view models the paper doll and Trageslots grid render from.
   * Both are derived on every render rather than stored: the paper doll reads
   * `system.equipment`, and the grid packs worn gear first, then packed gear,
   * while preserving each band's existing sort order.
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
      // The summed SV lands on quarter steps, so it needs a decimal separator
      // the reader's locale actually uses — the table writes +0,25 in German.
      svLabel: this.#formatNumber(derived.armorSv ?? 0),
      // The base layer's own share of that sum, on its own row like every
      // addon's. Whole values here, quarter steps up there.
      suitSvLabel: suit ? this.#formatNumber(Number(suit.system?.sv) || 0) : null,
      zones: ARMOR_ADDON_ZONES.map((zone) => {
        const item = this.actor.items.get(equipment[zone]) ?? null;
        const armor = derived.armor?.[zone] ?? { rh: 0, rw: 0, ra: 0, rwSuit: 0, rwAddon: 0 };
        return {
          zone,
          label: CONFIG.TNO.armorZones[zone],
          item,
          // How the silhouette paints the body beneath a possible addon. The
          // addon is a smaller plate of its own, so the remaining rim can keep
          // showing whether Unterkleidung is present underneath it.
          baseState: suit ? 'suited' : 'bare',
          ...armor,
          // Whether the RW shown is a sum rather than one piece's own value.
          // Marked only when both layers actually contribute: a suit worn at
          // RW 0 leaves the addon's number untouched, and flagging that as
          // "added up" would send the reader looking for a second summand that
          // changes nothing.
          rwStacked: !!item && armor.rwSuit > 0 && armor.rwAddon > 0,
          // What this location costs to wear. Unlike RH/RW/RA it is not a
          // resolved zone value: SV is summed for the whole body, so the row
          // shows the addon's own share and `svLabel` above closes the column
          // with the total. An empty zone has nothing to charge for — the
          // suit's share is on the suit's own row, not spread over four.
          svLabel: item ? this.#formatNumber(Number(item.system?.sv) || 0) : null,
        };
      }),
      hands: this.#handsContext(),
    };

    const capacity = derived.carrySlots ?? 0;
    const grid = buildSlotGrid(
      this.actor.items.contents,
      equipment,
      capacity,
      !(derived.carryNoContainer ?? false)
    );
    const used = derived.carrySlotsUsed ?? 0;
    const held = heldItemIds(this.actor.system.hands);

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
        ...grid.blocks.flatMap((block) => this.#slotCells(block, block.inside, held)),
        ...grid.overflow.flatMap((block) => this.#slotCells(block, 0, held)),
      ],
      // Zero-slot items get no cell, but they still stack — loose change is the
      // likeliest thing on the sheet to be counted — so each row carries its
      // quantity. `buildSlotGrid` stays free of view concerns and hands back
      // the bare items.
      trinkets: grid.trinkets.map(({ item, worn }) => ({
        item,
        ...inventoryArt(item),
        quantity: Number(item.system?.quantity) || 1,
        worn,
      })),
      // What the character owns but does not have on them, under the raster:
      // costs no slot, so it is a list rather than cells.
      stashed: grid.stashed.map((item) => ({
        item,
        ...inventoryArt(item),
        typeLine: this.#slotTypeLine(item),
        quantity: Number(item.system?.quantity) || 1,
      })),
      // The free slots are one summary cell rather than one cell each: the
      // meter above the raster is where the remaining room is counted.
      free: grid.empty,
      // One meter segment per slot of the budget, plus one per slot the load
      // runs past it: the worn band first, then carried load, then free room.
      meter: slotMeter(capacity, used, derived.carryWorn ?? 0).map((tone) => ({ tone })),
      used,
      capacity,
      over: used > capacity,
      // A load that exactly fills the budget already costs every movement tier
      // but the crawl, so the figure has to warn from there — not only once it
      // spills. `over` stays strict, because the overflow note below the grid
      // counts cells the character has no slot for and there are none at 7/7.
      atCapacity: capacity > 0 && used >= capacity,
      // How far past the budget the load runs, for the over-capacity read-out.
      excess: Math.max(0, used - capacity),
      state: derived.carryState ?? 'ok',
      noContainer: derived.carryNoContainer ?? false,
      worn: derived.carryWorn ?? 0,
      carried: derived.carryCarried ?? 0,
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
   * @param {{item: Item, span: number, quantity: number, worn: boolean}} block
   * @param {number} inside  Cells of this block that fit the budget.
   * @param {Set<string>} held  Item ids in either hand.
   * @returns {Array<object>}
   * @private
   */
  #slotCells(block, inside, held) {
    return Array.from({ length: block.span }, (_, index) => {
      const over = index >= inside;
      return {
        item: block.item,
        ...inventoryArt(block.item),
        over,
        first: index === 0,
        last: index === block.span - 1,
        // Only the first cell renders the label, so it has to know how many
        // cells it may run across before it is clipped.
        span: block.span,
        typeLine: this.#slotTypeLine(block.item),
        quantity: block.quantity,
        showQty: block.quantity > 1,
        worn: block.worn,
        // Still carried and still in the carried band: holding changes nothing
        // the budget counts, so the cell only takes the "on the body" colour.
        held: held.has(block.item.id),
      };
    });
  }

  /**
   * The two hands under the paper doll. A two-handed piece is stored in both
   * hands, so it renders as one slot across both rather than as the same item
   * twice; its `hand` is the right one, which is what the slot's `x` and drag
   * hand back to `_setHeld`.
   *
   * `figure` is the silhouette's view of the same state, one entry per hand.
   * @returns {{slots: Array<object>, figure: Object<string, string>}}
   * @private
   */
  #handsContext() {
    const hands = this.actor.system.hands ?? {};
    const itemIn = (hand) => this.actor.items.get(hands[hand]) ?? null;
    const figure = Object.fromEntries(HANDS.map((hand) => [hand, itemIn(hand) ? 'held' : 'empty']));
    const both = itemIn('right') && hands.right === hands.left;
    const slots = both
      ? [{ hand: 'right', label: 'TNO.Hands.Both', item: itemIn('right'), both: true }]
      : HANDS.map((hand) => ({
        hand,
        label: hand === 'right' ? 'TNO.Hands.Right' : 'TNO.Hands.Left',
        item: itemIn(hand),
        both: false,
      }));
    return { slots, figure };
  }

  /**
   * What kind of thing this is, on the line under an item's name.
   *
   * It leads with the role and qualifies it after — `Waffe · Nah`, not `Nah` —
   * because the qualifier alone never said what it was qualifying: a cell
   * reading only `Kopf` or `Nah` names a detail of a category it leaves the
   * reader to infer. Every item gets a line now, including the ones with no
   * role at all, so the column reads as one kind of statement rather than a
   * label that appears on some cells and not others.
   *
   * Role first is also the only order that survives translation. German cannot
   * put it the other way — `Nah Waffe` and `Kopf Rüstung` are not phrases — and
   * the join lives in `TNO.Item.TypeLine` so a language that wants a different
   * word order or separator can have one without touching this.
   *
   * The role precedence matches the rest of the sheet: `setItemRole` writes one
   * role at a time, so an item carrying two is a hand-edited document rather
   * than something the UI can produce, and armour wins as it does elsewhere.
   * @param {Item} item
   * @returns {string}
   */
  #slotTypeLine(item) {
    const { roleKey, detailKey } = itemTypeLine(item);
    const role = game.i18n.localize(roleKey);
    return detailKey
      ? game.i18n.format('TNO.Item.TypeLine', { role, detail: game.i18n.localize(detailKey) })
      : role;
  }

  /** Format integer cents as the sheet user's localized euro amount. */
  #formatEuro(cents) {
    return new Intl.NumberFormat(game.i18n.lang, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  }

  /** Build the wallet's localized read/editor context from stored balances. */
  #moneyContext(money = this.actor.system.money) {
    const wallet = prepareWallet(money);
    const amountFormatter = new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 0 });
    const rows = wallet.rows.map((row) => ({
      ...row,
      label: game.i18n.localize(row.label),
      medium: game.i18n.localize(row.medium),
      inputId: `money-${this.actor.id}-${row.key}`,
      amountDisplay: amountFormatter.format(row.amount),
      euroDisplay: this.#formatEuro(row.euroCents),
      rateDisplay: this.#formatEuro(row.cents),
    }));
    return {
      ...wallet,
      rows,
      // The wallet lists the balances actually held, so the localized rows are
      // filtered here rather than re-localizing the helper's own selection.
      presentRows: rows.filter((row) => row.amount > 0),
      totalDisplay: this.#formatEuro(wallet.totalCents),
    };
  }

  /** Open the complete wallet editor beside its compact Basics component. */
  async #openMoneyPopover(anchor) {
    const popover = this.#popovers?.money;
    if (!popover || !this.isEditable) return;
    this.#mountPopovers();
    await popover.open(anchor);
    popover.element.querySelector('[autofocus]')?.focus();
  }

  /** Recalculate row conversions and the total while wallet fields are typed. */
  #updateMoneyPreview() {
    const popover = this.#popovers?.money.element;
    if (!popover) return;
    let totalCents = 0;
    let approximate = false;
    for (const input of popover.querySelectorAll('[data-money-key]')) {
      const amount = normalizeMoneyAmount(input.value);
      const cents = amount * normalizeMoneyAmount(input.dataset.rateCents);
      const isApproximate = input.dataset.approximate === 'true';
      totalCents += cents;
      approximate ||= isApproximate && amount > 0;
      const output = popover.querySelector(`[data-money-euro="${input.dataset.moneyKey}"]`);
      if (output) output.textContent = `${isApproximate ? '≈' : ''}${this.#formatEuro(cents)}`;
    }
    const total = popover.querySelector('[data-money-total]');
    if (total) total.textContent = `${approximate ? '≈' : ''}${this.#formatEuro(totalCents)}`;
  }

  /** Persist the complete wallet in one actor update. */
  async #saveMoney(event) {
    event.preventDefault();
    if (!this.isEditable) return;
    const form = event.target.closest('.money-editor-form');
    if (!form) return;
    const data = new FormData(form);
    const update = Object.fromEntries(
      MONEY_CURRENCIES.map(({ key }) => [
        `system.money.${key}`,
        normalizeMoneyAmount(data.get(key)),
      ])
    );
    this.#popovers?.money.hide();
    await this.actor.update(update);
  }

  /**
   * The document the sheet is currently living in. Not necessarily the one this
   * code is *running* in: a detached ApplicationV2 window moves `this.element`
   * into a second browser window while its JS keeps executing in the parent, so
   * the bare `document` global still points at the workspace. Anything that has
   * to appear beside the sheet has to be built in, and measured against, this
   * document instead.
   * @returns {Document}
   * @private
   */
  #hostDocument() {
    return this.element?.ownerDocument ?? document;
  }

  /**
   * Move every popover into whichever document the sheet is in now — see
   * `SheetPopover#mount`. Called on every render rather than once at mount:
   * detaching and re-attaching are things the player does whenever they like.
   * @private
   */
  #mountPopovers() {
    const host = this.#hostDocument();
    for (const popover of Object.values(this.#popovers ?? {})) popover.mount(host);
  }

  /**
   * Draw one of the sheet's template-backed popovers.
   * @param {HTMLElement} element
   * @param {string} part       Template under `templates/actor/parts/`
   * @param {object} context
   * @param {string} labelKey   Localization key of its accessible name
   * @private
   */
  async #renderPopover(element, part, context, labelKey) {
    element.innerHTML = await foundry.applications.handlebars.renderTemplate(
      `systems/tno/templates/actor/parts/${part}.hbs`,
      context
    );
    element.setAttribute('aria-label', game.i18n.localize(labelKey));
  }

  /**
   * Open the column picker beside the toolbar button. A display preference
   * rather than actor data, so it is offered on read-only sheets too — reading
   * someone else's inventory is exactly when a different column set helps.
   * @private
   */
  async #openColumnsPopover(anchor) {
    if (!this.#popovers) return;
    this.#mountPopovers();
    await this.#popovers.columns.open(anchor);
  }

  /**
   * The nine Haltungen in their bands, plus whichever one the panel reads out.
   * Both halves come from [`helpers/stances.mjs`](../helpers/stances.mjs), which
   * the combat tracker reads too — the fallback for an unknown key has to be the
   * same wherever a Haltung is drawn.
   */
  #stancePopoverContext() {
    const current = this.actor.system.derived?.stance;
    return {
      detail: stanceEntry(current),
      groups: stancePopoverGroups(current),
    };
  }

  /** Open the picker beneath the banner's Haltung chip. */
  async #openStancePopover(anchor) {
    const popover = this.#popovers?.stance;
    if (!popover) return;
    this.#mountPopovers();
    await popover.open(anchor);
    popover.element.querySelector('.stance-option.selected')?.focus();
  }

  /**
   * Mirror the picker's state onto the banner chip: `aria-expanded`, and the
   * chip's tooltip, which is taken off the chip while the picker is open. The
   * tooltip explains what a Haltung is, which is the question the open picker
   * is already answering — in a panel that hangs directly below the chip, where
   * the tooltip would sit on top of it. Deactivating the shown one is not
   * enough: Foundry re-arms it on every pointerenter, so it would come back the
   * next time the cursor crossed the chip on its way into the picker.
   * @private
   */
  #syncStanceChip() {
    const chip = this.element?.querySelector('.chip-stance');
    if (!chip) return;
    const open = !!this.#popovers?.stance.isOpen;
    chip.setAttribute('aria-expanded', String(open));
    if (open) {
      if (chip.dataset.tooltipHtml !== undefined) {
        chip.dataset.stanceTooltip = chip.dataset.tooltipHtml;
        delete chip.dataset.tooltipHtml;
      }
      game.tooltip?.deactivate();
    } else if (chip.dataset.stanceTooltip !== undefined) {
      chip.dataset.tooltipHtml = chip.dataset.stanceTooltip;
      delete chip.dataset.stanceTooltip;
    }
  }

  /**
   * The condition panel's own context. It draws the same two damage tracks the
   * band does and the same six-light raster the band used to carry, so both are
   * built from the shared helpers rather than from a second reading of the
   * actor.
   *
   * `editable` decides whether the steppers, the clear action and the clickable
   * lights are rendered at all — a read-only viewer gets the same panel with
   * the same tooltips on non-interactive elements.
   * @returns {object}
   * @private
   */
  #conditionPanelContext() {
    return {
      damage: this.#damageContext(),
      conditions: this.#conditionsContext(),
      editable: this.isEditable,
    };
  }

  /**
   * Open the condition panel beside whichever of its doors was used. Stepping a
   * pool or cycling a light re-renders the sheet, and `_onRender` redraws the
   * panel from what the click just changed.
   */
  async #openConditionPopover(anchor) {
    if (!this.#popovers) return;
    this.#mountPopovers();
    // Which door, not just which element: a stepper press re-renders the sheet
    // and replaces the anchor, and a panel that re-anchored to a different door
    // would jump across the band under the cursor that opened it.
    // The tracks are the fallback because they are the one door always drawn:
    // the condition row is absent while nothing is active, and the malus cell
    // is absent at zero.
    this._conditionPopoverDoor = ['chip-status', 'banner-malus', 'banner-tracks']
      .find((door) => anchor.classList.contains(door)) ?? 'banner-tracks';
    await this.#popovers.condition.open(anchor);
  }

  /**
   * Mirror an open panel's state onto every door that opens it. All of them
   * carry `aria-expanded`, so a reader is told the panel is open whichever one
   * they are on.
   * @param {string} selector
   * @param {SheetPopover|null} popover
   * @private
   */
  #syncPopoverDoors(selector, popover) {
    const open = !!popover?.isOpen;
    for (const door of this.element?.querySelectorAll(selector) ?? []) {
      door.setAttribute('aria-expanded', String(open));
    }
  }

  /**
   * The Edge popover's context: the reserve, its three derived thresholds and
   * whether the correction may be used at all.
   * @returns {object}
   * @private
   */
  #edgePopoverContext() {
    const derived = this.actor.system.derived ?? {};
    const pool = derived.edgePool ?? 0;
    const max = derived.edgePoolMax ?? 0;
    return {
      pool,
      max,
      atMax: pool >= max,
      insight: derived.insight ?? 0,
      postMortem: derived.postMortem ?? 0,
      trialErrorMax: derived.trialErrorMax ?? 0,
      editable: this.isEditable,
    };
  }

  /** Open the Edge popover beneath its pill. */
  async #openEdgePopover(anchor) {
    if (!this.#popovers) return;
    this.#mountPopovers();
    await this.#popovers.edge.open(anchor);
  }

  /**
   * Preview a Haltung in the detail panel without committing to it. Written
   * straight into the DOM rather than through a re-render: the panel changes on
   * every pointer move across the grid, and re-rendering the popover under the
   * cursor would fight the hover it is reacting to.
   * @param {HTMLElement|null} option
   * @private
   */
  #previewStance(option) {
    const popover = this.#popovers?.stance.element;
    if (!popover) return;
    const source = option ?? popover.querySelector('.stance-option.selected');
    if (!source) return;
    const { stanceIcon, stanceName, stanceEffect, stanceDefenses } = source.dataset;
    const icon = popover.querySelector('.stance-detail-icon i');
    if (icon) icon.className = `fa-solid ${stanceIcon}`;
    popover.querySelector('.stance-detail-name').textContent = stanceName;
    popover.querySelector('.stance-detail-effect').textContent = stanceEffect;
    popover.querySelector('.stance-detail-defenses span').textContent = stanceDefenses;
  }

  /** Build the popover's template context from the live embedded item. */
  async #itemPopoverContext(item) {
    const base = await prepareGearSummaryContext(item);
    const { roles, stock } = base;
    const skill = getSkillDefinitions(item.actor)[item.system.wf];
    const canEdit = this.isEditable;
    const parryMalus = Number(item.actor?.system?.derived?.defenses?.parry?.malus) || 0;
    // A piece left behind is not in hand: it keeps its card but offers no
    // combat action and no use until it is picked up again.
    const stashed = isStashed(item);
    return {
      ...base,
      canEdit,
      stashed,
      canStash: canEdit && isGear(item),
      canWeaponCheck: !!(canEdit && !stashed && item.actor?.isOwner && roles.weapon && canWeaponAttack(item.system, { skillDefined: !!skill })),
      // A parry additionally needs a Haltung that allows one at all — "je nach
      // Haltung hat der Charakter eine Parade, ein Ausweichen oder beides".
      canWeaponParry: !!(canEdit && !stashed && item.actor?.isOwner && roles.weapon
        && canWeaponParry(item.system, { skillDefined: !!skill })
        && canDefend(item.actor, 'parry')),
      parryMalus,
      parryHint: parryMalus < 0
        ? game.i18n.format('TNO.Combat.NextDefenseMalus', { value: parryMalus })
        : game.i18n.localize('TNO.Combat.ParryHint'),
      canAdjustStock: canEdit && roles.consumable,
      canDecreaseStock: canEdit && roles.consumable && stock > 0,
      canUse: canEdit && roles.consumable && !stashed,
      canDelete: canEdit && !item.isWorn,
    };
  }

  /**
   * Draw the item popover for the item it was opened on, or close it once that
   * item is gone. The keyboard goes back to the control it was on.
   * @param {HTMLElement} element
   * @private
   */
  async #renderItemPopover(element) {
    const itemId = this._itemPopoverItemId;
    if (!itemId) return;
    const item = this.actor.items.get(itemId);
    if (!item) return this.#popovers?.item.hide();

    const active = element.ownerDocument.activeElement;
    const focused = element.contains(active)
      ? { action: active.dataset.popoverAction, by: active.dataset.by }
      : null;
    const html = await foundry.applications.handlebars.renderTemplate(
      'systems/tno/templates/actor/parts/item-popover.hbs',
      await this.#itemPopoverContext(item)
    );
    // The sheet closed or another item was opened while this one rendered.
    if (this.#popovers?.item.element !== element || this._itemPopoverItemId !== itemId) return;
    element.innerHTML = html;
    element.setAttribute('aria-label', item.name);
    if (focused?.action) {
      const controls = [...element.querySelectorAll(`[data-popover-action="${focused.action}"]`)];
      controls.find((control) => focused.by === undefined || control.dataset.by === focused.by)?.focus();
    }
  }

  /** Open and place the compact item popover beside the clicked sheet cell. */
  async #openItemPopover(item, anchor) {
    const popover = this.#popovers?.item;
    if (!popover || !item) return;
    this.#mountPopovers();
    this._itemPopoverItemId = item.id;
    await popover.open(anchor);
    if (!popover.element.contains(popover.element.ownerDocument.activeElement)) {
      popover.element.querySelector('[autofocus]')?.focus();
    }
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
        return this.#popovers.item.hide();
      case 'edit':
        this.#popovers.item.hide();
        return item.sheet.render({ force: true });
      // Everything that opens a window or posts a card takes the focus with it,
      // so the popover goes the way it already does for `edit`: it is a
      // transient read of one item, not a panel to work from. `stock` is the
      // exception below — those controls edit the card you are looking at.
      case 'post':
        this.#popovers.item.hide();
        return item.roll();
      case 'weapon-check':
        this.#popovers.item.hide();
        return item.openWeaponCheck();
      case 'weapon-parry':
        this.#popovers.item.hide();
        return item.openWeaponParry();
      case 'stock':
        return item.adjustStock(Number(control.dataset.by));
      // Stays open: the card is still the one being looked at, and the
      // re-render refreshes its stock in place.
      case 'use':
        return item.useConsumable();
      // Stays open like `stock`: the card is still the one being looked at,
      // and the re-render refreshes it in place.
      case 'stash':
        return this._setStashed(item, !isStashed(item));
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

  /**
   * Open a new Beziehungen row and put the caret in it once the sheet has
   * redrawn.
   * @param {unknown} [base]   The list to append to; the stored one by default.
   * @param {string} [field]   The column the caret lands in.
   * @param {object} [init]    Field values for the new entry.
   */
  #addConnection(base = this.actor.system.connections, field = 'name', init = {}) {
    const id = foundry.utils.randomID();
    this._focusConnection = { id, field };
    return this.actor.update({ 'system.connections': addConnection(base, id, init) });
  }

  /**
   * Move the caret from one Beziehungen cell to another, Excel-style. Rows
   * hidden by the search are skipped. Above the first row there is nowhere to
   * go; below the last one a new row is opened, and the cell being left goes
   * out in the same write — committing it separately would race the add,
   * each writing back a list that lacks the other's change.
   *
   * @param {HTMLElement} cell  The cell being left.
   * @param {object} move
   * @param {number} [move.cols]   +1 / -1: next / previous cell, wrapping rows.
   * @param {number} [move.rows]   +1 / -1: the row below / above.
   * @param {string} [move.field]  The column to land in on a row move.
   */
  #navigateConnections(cell, { cols = 0, rows = 0, field = cell.dataset.connectionField }) {
    const table = cell.closest('.connections-table');
    const rowEls = [...table.querySelectorAll('.connection-row:not([hidden])')];
    const cellsOf = (row) => [...row.querySelectorAll('[data-connection-field]')];
    let r = rowEls.indexOf(cell.closest('.connection-row'));
    let target = null;

    if (cols) {
      const cells = cellsOf(rowEls[r]);
      const c = cells.indexOf(cell) + cols;
      if (c >= cells.length) {
        r += 1;
        target = rowEls[r] && cellsOf(rowEls[r])[0];
        field = 'name';
      } else if (c < 0) {
        r -= 1;
        target = rowEls[r] && cellsOf(rowEls[r]).at(-1);
      } else {
        target = cells[c];
      }
    } else {
      r += rows;
      target = rowEls[r]?.querySelector(`[data-connection-field="${field}"]`);
    }

    if (r < 0) return;
    if (r >= rowEls.length) return this.#addConnection(this.#withPendingCell(cell), field);
    // Text still typed into a label field becomes a label before the caret
    // goes; plain cells commit themselves on `change` as it leaves.
    if (cell.matches('.connection-tag-input') && cell.value.trim()) {
      this.#takeLabel(cell, this.#pickedLabel(cell));
    }
    target?.focus();
    if (target?.select && target.type !== 'checkbox') target.select();
  }

  /** The label a label field would take now: the picked suggestion, else the typed text. */
  #pickedLabel(input) {
    const list = input.nextElementSibling;
    const active = list.matches(':popover-open') && list.querySelector('.connection-tag-option.active');
    return active?.dataset.value ?? input.value.trim();
  }

  /**
   * The stored list with `cell`'s not yet committed value applied — the base
   * for a write that also adds a row. Empties a label field it takes from.
   */
  #withPendingCell(cell) {
    const list = this.actor.system.connections;
    const id = cell.closest('[data-connection-id]').dataset.connectionId;
    const field = cell.dataset.connectionField;
    if (cell.matches('.connection-tag-input')) {
      const label = this.#pickedLabel(cell);
      cell.value = '';
      return label ? addLabel(list, id, field, label) : list;
    }
    return editConnection(list, id, field, cell.type === 'checkbox' ? cell.checked : cell.value);
  }

  /**
   * Fill and open the label list under `input` (a Beziehung, Kennt, Fraktion
   * or Herkunft field) from the labels in use in that column, narrowed by
   * what has been typed; the first match is picked, so Enter takes it. Typed
   * text that is not a label yet closes the list as the label it would
   * create. DOM only: typing must not re-render the sheet.
   * @param {HTMLInputElement} input
   */
  #suggestLabels(input) {
    const id = input.closest('[data-connection-id]').dataset.connectionId;
    const typed = input.value.trim();
    const field = input.dataset.connectionField;
    const labels = labelSuggestions(this.actor.system.connections, field, typed, id, {
      shared: this.#sharedConnections(),
      people: field === 'knows' ? this.#knownActors().map((actor) => actor.name) : [],
    });
    const own = normalizeConnections(this.actor.system.connections).find((entry) => entry.id === id)?.[field] ?? [];
    const known = [...labels, ...own].some((label) => label.toLocaleLowerCase() === typed.toLocaleLowerCase());
    const options = labels.map((label) => ({ value: label, text: label }));
    if (typed && !known) {
      options.push({ value: typed, text: game.i18n.format('TNO.Connections.TagNew', { label: typed }) });
    }
    this.#showSuggestions(input, options, { pickFirst: !!typed });
  }

  /**
   * Fill and open the list of people under a Name field: the table's own
   * rows, everyone the other characters list and every Actor the user may see, by the name typed so
   * far. Nothing is picked until the arrows or the mouse pick it, so Enter
   * on a new name still just moves on. DOM only, like the label list.
   * @param {HTMLInputElement} input
   */
  #suggestPeople(input) {
    const id = input.closest('[data-connection-id]').dataset.connectionId;
    const people = personSuggestions(this.actor.system.connections, input.value, id, {
      shared: this.#sharedConnections(),
      actors: this.#knownActors(),
    }).slice(0, 30);
    this._personSuggestions = people;
    const listed = game.i18n.localize('TNO.Connections.Listed');
    this.#showSuggestions(input, people.map((person, index) => ({
      value: String(index),
      text: person.name,
      hint: person.connectionId ? listed : [...person.factions, ...person.origins].join(' · '),
    })), { pickFirst: false });
  }

  /**
   * Show `options` in the list that follows `input`, under its cell. A
   * top-layer popover, so the tab's scroll box cannot clip it under the last
   * rows; placed by hand, since it no longer flows there.
   * @param {HTMLInputElement} input
   * @param {Array<{value: string, text: string, hint?: string}>} options
   * @param {{pickFirst: boolean}} mode
   */
  #showSuggestions(input, options, { pickFirst }) {
    const list = input.nextElementSibling;
    list.replaceChildren(...options.map(({ value, text, hint }, index) => {
      const li = input.ownerDocument.createElement('li');
      li.className = `connection-tag-option${index === 0 && pickFirst ? ' active' : ''}`;
      li.setAttribute('role', 'option');
      li.dataset.value = value;
      li.textContent = text;
      if (hint) {
        const small = input.ownerDocument.createElement('span');
        small.className = 'connection-tag-hint';
        small.textContent = hint;
        li.append(small);
      }
      return li;
    }));
    if (!options.length) return this.#closeSuggestions(input);
    const cell = (input.closest('.connection-tags') ?? input).getBoundingClientRect();
    list.style.top = `${cell.bottom + 2}px`;
    list.style.left = `${cell.left}px`;
    list.style.minWidth = `${cell.width}px`;
    if (!list.matches(':popover-open')) list.showPopover();
    input.setAttribute('aria-expanded', 'true');
  }

  /** Close the suggestion list that follows `input`. */
  #closeSuggestions(input) {
    const list = input.nextElementSibling;
    if (list?.matches(':popover-open')) list.hidePopover();
    input.setAttribute('aria-expanded', 'false');
  }

  /**
   * Arrow keys and Escape in a field with a suggestion list. Returns whether
   * the key was handled.
   */
  #steerSuggestions(event, input) {
    const list = input.nextElementSibling;
    const options = [...list.querySelectorAll('.connection-tag-option')];
    const open = list.matches(':popover-open') && options.length > 0;
    if (!open) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const active = options.findIndex((option) => option.classList.contains('active'));
      const step = event.key === 'ArrowDown' ? 1 : -1;
      options[active]?.classList.remove('active');
      const next = options[active < 0 && step < 0 ? options.length - 1 : (active + step + options.length) % options.length];
      next.classList.add('active');
      next.scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.#closeSuggestions(input);
      return true;
    }
    return false;
  }

  /**
   * Make the row of the Name field `input` the person at `index` of the last
   * people list: name, known Fraktion and Herkunft, Actor link — one write.
   * A person the table already has is a row to go to instead.
   * Until it is saved, the field's own `change` stands aside, or it would
   * write the name over the stored list it was read from.
   */
  #takePerson(input, index) {
    const person = this._personSuggestions?.[index];
    if (!person) return;
    const id = input.closest('[data-connection-id]').dataset.connectionId;
    this.#closeSuggestions(input);
    // Already a row: go there rather than list the person twice. This row's
    // Name goes back to what it was, so leaving it writes nothing.
    if (person.connectionId) {
      input.value = normalizeConnections(this.actor.system.connections).find((entry) => entry.id === id)?.name ?? '';
      const name = this.element.querySelector(`.connection-row[data-connection-id="${person.connectionId}"] .connection-name`);
      name?.focus();
      name?.select();
      return;
    }
    input.value = person.name;
    this._adoptingConnection = id;
    return this.actor.update({ 'system.connections': adoptPerson(this.actor.system.connections, id, person) })
      .finally(() => {
        if (this._adoptingConnection === id) this._adoptingConnection = null;
      });
  }

  /**
   * The Beziehungen lists of the other characters this user may observe, for
   * the suggestions: the GM gets everyone's, a player those shared with them.
   * Only names and labels are read from them, never notes or Neuralink.
   * @returns {unknown[]}
   */
  #sharedConnections() {
    return game.actors
      .filter((actor) => actor.type === 'character' && actor.id !== this.actor.id
        && actor.testUserPermission(game.user, 'OBSERVER'))
      .map((actor) => actor.system.connections);
  }

  /**
   * The Actors to offer as people, by name: characters and NPCs other than
   * this one that the user may at least see the name of.
   * @returns {Array<{name: string, uuid: string}>}
   */
  #knownActors() {
    return game.actors
      .filter((actor) => ['character', 'npc'].includes(actor.type) && actor.id !== this.actor.id
        && actor.testUserPermission(game.user, 'LIMITED'))
      .map((actor) => ({ name: actor.name, uuid: actor.uuid }));
  }

  /**
   * Add `label` to the row of `input` and empty the field. The caret comes
   * back to the same field after the redraw (see `_preRender`), ready for
   * the next label.
   */
  #takeLabel(input, label) {
    const id = input.closest('[data-connection-id]').dataset.connectionId;
    input.value = '';
    this.#closeSuggestions(input);
    return this.actor.update({ 'system.connections': addLabel(this.actor.system.connections, id, input.dataset.connectionField, label) });
  }

  /** Remove the label at `index` from the row of `input`. */
  #removeLabelAt(input, index) {
    const id = input.closest('[data-connection-id]').dataset.connectionId;
    return this.actor.update({ 'system.connections': removeLabel(this.actor.system.connections, id, input.dataset.connectionField, index) });
  }

  /**
   * The graph view's model: laid-out nodes and edges with what the SVG
   * needs to draw them, plus the legend and the physics panel.
   */
  #connectionGraphContext() {
    // Which kinds the legend has switched off: view state on the open sheet.
    this._graphHidden ??= new Set();
    const graph = buildConnectionGraph({ name: this.actor.name, img: this.actor.img }, this.actor.system.connections, {
      hidden: this._graphHidden,
    });
    const laid = layoutGraph(graph, { width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
    // Where the spring embedder left a node last time it is drawn again, so a
    // redraw — any change to the actor — does not throw the picture back to
    // the start layout. New nodes start where the layout puts them.
    this._graphPositions ??= new Map();
    const nodes = laid.nodes.map((node) => ({ ...node, ...this._graphPositions.get(node.id) }));
    const at = new Map(nodes.map((node) => [node.id, node]));
    const edges = laid.edges.map((edge) => ({
      ...edge,
      x1: at.get(edge.from).x,
      y1: at.get(edge.from).y,
      x2: at.get(edge.to).x,
      y2: at.get(edge.to).y,
    }));
    this._graphModel = { nodes, edges };
    this._graphDetails = graphNodeDetails(nodes, this.actor.system.connections, (key) => game.i18n.localize(key));
    const physics = this.#graphPhysics();
    return {
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
      empty: nodes.length === 1,
      ...graphViewModel(nodes, edges, {
        unnamed: game.i18n.localize('TNO.Connections.Graph.Unnamed'),
        portrait: (connectionId) => this.#connectionPortrait(connectionId),
      }),
      legend: GRAPH_NODE_KINDS.map((kind) => ({
        kind,
        label: `TNO.Connections.Graph.Kind.${kind}`,
        toggle: GRAPH_HIDEABLE_KINDS.includes(kind),
        off: this._graphHidden.has(kind),
      })),
      tuningOpen: !!this._graphTuningOpen,
      tuning: Object.entries(SPRING_PARAMS).map(([key, range]) => ({
        key,
        ...range,
        value: physics[key],
        label: `TNO.Connections.Graph.Tuning.${key}`,
      })),
    };
  }

  /**
   * The portrait of the Actor a row is linked to (dropped on the tab or
   * picked from the people list), or nothing — no link, an Actor gone, or
   * one still showing Foundry's placeholder silhouette.
   * @param {string} [connectionId]
   * @returns {string|undefined}
   */
  #connectionPortrait(connectionId) {
    if (!connectionId) return undefined;
    const entry = normalizeConnections(this.actor.system.connections).find((e) => e.id === connectionId);
    const img = entry?.actorUuid ? fromUuidSync(entry.actorUuid, { strict: false })?.img : null;
    return img && img !== CONST.DEFAULT_TOKEN && img !== Actor.implementation.DEFAULT_ICON ? img : undefined;
  }

  /** Start the graph just rendered — see `startGraph`. */
  #runGraph() {
    this.#stopGraph();
    const svg = this.element.querySelector('.connections-graph svg');
    if (!svg || !this._graphModel || !svg.isConnected || !svg.clientWidth) return;
    this.#graphRun = startGraph(svg, this.element.querySelector('.window-content'), {
      model: this._graphModel,
      positions: this._graphPositions,
      physics: this.#graphPhysics(),
      onResize: () => this.#runGraph(),
    });
  }

  /** Light a graph node and what it touches, or clear the lighting. */
  #lightGraphNode(node) {
    lightGraphNode(this.element.querySelector('.connections-graph svg'), node);
  }

  /** Show the hover card for a graph node beside it, or hide it with `null`. */
  #showGraphCard(el) {
    showGraphCard(this.element.querySelector('.graph-card'), el && this._graphDetails?.get(el.dataset.nodeId), el);
  }

  /** The graph's forces as this client's sliders set them. */
  #graphPhysics() {
    return normalizeSpringParams(game.settings.get('tno', 'graphPhysics'));
  }

  /** Stop the graph's animation, if one is running. */
  #stopGraph() {
    this.#graphRun?.stop();
    this.#graphRun = null;
  }

  /**
   * Show/hide Beziehungen rows per the tab's search box, across all of a
   * row's text. DOM-level like the Inventar search, so typing keeps the caret.
   * @private
   */
  _applyConnectionFilter() {
    const table = this.element.querySelector('.connections-table');
    if (!table) return;
    const search = (this._connectionSearch ?? '').trim();
    let visible = 0;
    for (const row of table.querySelectorAll('.connection-row')) {
      // A row with nothing in it yet is one being filled in: it stays, or a
      // row opened while searching would vanish under the caret.
      const match = !search || !row.dataset.search || fuzzyMatch(search, row.dataset.search);
      row.hidden = !match;
      if (match) visible++;
    }
    const none = table.querySelector('.connections-nomatch');
    if (none) none.hidden = !search || visible > 0;
  }

  /**
   * Dock the tab rail outside the sheet's right edge where there is room for
   * it, and inside the sheet — as a strip across its top — where there is not:
   * a sheet dragged against the screen edge, or one detached into a browser
   * window of its own, which is exactly as wide as the sheet. Measured against
   * the window the sheet is in, which after detaching is not `window`.
   */
  #placeTabRail() {
    const el = this.element;
    if (!el?.isConnected) return;
    const view = el.ownerDocument.defaultView;
    const room = view.innerWidth - el.getBoundingClientRect().right;
    el.classList.toggle('tabs-inside', room < TAB_RAIL_WIDTH);
  }

  /**
   * Remember which Beziehungen cell has the caret before the sheet redraws.
   * Every edit commits on `change` and re-renders, and the commonest way to
   * fire one is Tab into the next cell — whose element the redraw replaces.
   * Without this the caret would land nowhere after each Tab.
   * @override
   */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if (this._focusConnection) return;
    const cell = this.element?.ownerDocument.activeElement?.closest?.('.connection-row [data-connection-field]');
    if (!cell || !this.element.contains(cell)) return;
    this._focusConnection = {
      id: cell.closest('[data-connection-id]').dataset.connectionId,
      field: cell.dataset.connectionField,
      start: cell.selectionStart,
      end: cell.selectionEnd,
      // Typed after the Tab but not yet committed: the redraw would drop it.
      value: cell.type === 'checkbox' ? null : cell.value,
    };
  }

  /** @override */
  _onPosition(position) {
    super._onPosition(position);
    this.#placeTabRail();
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
   * Mark the cells a multi-slot run is cut between by the raster's right edge.
   *
   * Which cells those are cannot be derived from the data: `.slot-grid` fills
   * as many columns as the column's current width allows, so the wrap moves
   * whenever the splitter is dragged or the window resized. It is measured
   * instead — a joined cell whose successor starts on a lower row is the last
   * one before the break, and that successor is where the item resumes.
   * @private
   */
  #markSlotWraps() {
    const grid = this.element.querySelector('.slot-grid');
    if (!grid) return;

    const cells = [...grid.querySelectorAll('.slot-cell.slot-filled')];
    for (const cell of cells) cell.classList.remove('slot-continues', 'slot-resumes');

    for (let i = 0; i < cells.length - 1; i++) {
      const cell = cells[i];
      const next = cells[i + 1];
      // `slot-joined` is exactly "this cell is not the last of its run", so a
      // row break after it is a break inside one item rather than between two.
      if (!cell.classList.contains('slot-joined')) continue;
      // All cells share one offset parent — the grid itself is unpositioned —
      // so the raw offsets compare directly.
      if (next.offsetTop <= cell.offsetTop) continue;
      cell.classList.add('slot-continues');
      next.classList.add('slot-resumes');
    }
  }

  /**
   * Re-point the wrap observer at the current render's raster. `observe` fires
   * once immediately, which is also what paints the marks after a render — so
   * this is the only place `#markSlotWraps` needs calling from.
   * @private
   */
  #observeSlotGrid() {
    this.#slotGridObserver?.disconnect();
    const grid = this.element.querySelector('.slot-grid');
    if (!grid) return;
    this.#slotGridObserver ??= new ResizeObserver(() => this.#markSlotWraps());
    this.#slotGridObserver.observe(grid);
  }

  /**
   * Set the problem-solving edge reserve, clamped to 0..max. Stored as "spent"
   * (max minus the wanted value) since the pool itself is derived, recomputed
   * from `problemSolving.spent`.
   *
   * Every correction is announced in chat, in both directions. A step down
   * happens outside the dedicated actions (Insight, Post-mortem), so the table
   * has to know a point left the reserve; a step up is bookkeeping the table
   * has just as much reason to see, because the reserve it was told about a
   * moment ago no longer holds. The message names the edit as manual and shows
   * both ends of it, so neither direction reads as a spend or a refund the
   * mechanics granted.
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
      content: game.i18n.format('TNO.Chat.EdgeAdjusted', {
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

    // The sheet body is replaced on every render, so the native popovers live
    // on the host document's body and delegate their own stable listeners
    // there. Built in whichever document the sheet is in now and re-homed by
    // `#mountPopovers` if that ever changes — see `#hostDocument`.
    const host = this.#hostDocument();
    const slotSelector = (id) => ['.slot-first', '.slot-trinket', '.stash-item', '.armor-row', '.hand-slot']
      .map((cell) => `${cell}[data-item-id="${CSS.escape(id ?? '')}"]`).join(', ');
    this.#popovers = {
      item: new SheetPopover(host, '', {
        render: (element) => this.#renderItemPopover(element),
        findAnchor: () => this.element.querySelector(slotSelector(this._itemPopoverItemId)),
      }),
      money: new SheetPopover(host, 'money-popover', {
        render: (element) => this.#renderPopover(element, 'money-popover', { money: this.#moneyContext() }, 'TNO.Money.Edit'),
        findAnchor: () => this.element.querySelector('.money-wallet-block.editable'),
      }),
      // The Inventar table's column picker. Its own popover rather than a
      // section of the tab: the list is long, it is consulted rather than read,
      // and a permanently visible panel of twenty-two checkboxes would cost the
      // table the width it exists to spend on data. Drawn from the setting it
      // edits, so the boxes always show what the table is actually rendering —
      // including the case where unticking the last one puts the defaults back.
      columns: new SheetPopover(host, 'columns-popover', {
        render: (element) => this.#renderPopover(element, 'columns-popover',
          { sections: this.#columnPickerSections(this.#itemTableConfig()) }, 'TNO.ItemTable.ColumnsTitle'),
        findAnchor: () => this.element.querySelector('.item-columns-toggle'),
      }),
      // The Haltung picker. All nine at once, because the choice is made under
      // time pressure and a collapsed list shows one of them at a time.
      stance: new SheetPopover(host, 'stance-popover', {
        render: (element) => this.#renderPopover(element, 'stance-popover', this.#stancePopoverContext(), 'TNO.Combat.StancePick'),
        findAnchor: () => this.element.querySelector('.chip-stance'),
      }),
      // The condition panel. An anchored popover sharing the Haltung picker's
      // chrome rather than an inline <details> in the band: painting the panel
      // inside the banner is what forced the banner's whole stacking context up
      // with a z-index override, and that override is gone with this.
      condition: new SheetPopover(host, 'condition-popover', {
        render: (element) => this.#renderPopover(element, 'condition-panel', this.#conditionPanelContext(), 'TNO.Status.PanelTitle'),
        // Clearing both tracks from inside the panel removes the condition row
        // that opened it, so the door itself can go while the panel stays up.
        // Re-anchor to the tracks rather than letting the panel lose its place.
        findAnchor: () => this.element.querySelector(`.${this._conditionPopoverDoor}`)
          ?? this.element.querySelector('.banner-tracks'),
      }),
      // The Edge popover: the three derived thresholds, and the manual
      // correction that replaced the band's number field. A GM/admin correction
      // does not need a permanently visible input.
      edge: new SheetPopover(host, 'edge-popover', {
        render: (element) => this.#renderPopover(element, 'edge-popover', this.#edgePopoverContext(), 'TNO.Derived.EdgePool'),
        findAnchor: () => this.element.querySelector('.chip-edge'),
      }),
    };

    // Each popover's controls are bound on the popover itself rather than in
    // the sheet's own delegation, because it is a child of the host document's
    // body and never of `this.element`.
    const { item, money, columns, stance, condition, edge } = this.#popovers;

    item.element.addEventListener('click', (event) => this.#onItemPopoverClick(event));
    item.element.addEventListener('toggle', (event) => {
      if (event.newState === 'closed') this._itemPopoverItemId = null;
    });

    money.element.addEventListener('submit', (event) => this.#saveMoney(event));
    money.element.addEventListener('input', () => this.#updateMoneyPreview());
    money.element.addEventListener('click', (event) => {
      const action = event.target.closest('[data-money-action]')?.dataset.moneyAction;
      if (action === 'close' || action === 'cancel') money.hide();
    });

    columns.element.addEventListener('change', async (event) => {
      const key = event.target.closest('[data-column]')?.dataset.column;
      if (!key) return;
      await this.#storeItemTableConfig(toggleItemTableColumn(this.#itemTableConfig(), key));
    });
    columns.element.addEventListener('click', (event) => {
      if (event.target.closest('[data-columns-action="close"]')) columns.hide();
    });

    stance.element.addEventListener('click', async (event) => {
      const picked = event.target.closest('[data-stance]')?.dataset.stance;
      if (!picked) return;
      event.preventDefault();
      // Picking the Haltung already in force is not a no-op: the rules make
      // taking one — "auch dieselbe noch einmal" — clear both repeated-defence
      // counters, which is why every option here is a button.
      stance.hide();
      await takeStance(this.actor, picked);
    });
    stance.element.addEventListener('pointerover', (event) => {
      this.#previewStance(event.target.closest('[data-stance]'));
    });
    stance.element.addEventListener('focusin', (event) => {
      this.#previewStance(event.target.closest('[data-stance]'));
    });
    // Leaving the grid puts the Haltung in force back in the panel, so the
    // popover never sits there describing an option nobody is pointing at.
    stance.element.addEventListener('pointerleave', () => this.#previewStance(null));
    stance.element.addEventListener('toggle', () => this.#syncStanceChip());

    condition.element.addEventListener('click', async (event) => {
      if (!this.isEditable) return;
      const stepper = event.target.closest('.damage-stepper');
      if (stepper) {
        event.preventDefault();
        const { kind, action } = stepper.dataset;
        // Damage is its own persisted health track. It is deliberately allowed
        // to overfill; only the lower bound is clamped.
        return this._stepDamage(kind, action === 'increment' ? 1 : -1);
      }
      if (event.target.closest('.damage-clear')) {
        event.preventDefault();
        return this._clearDamage();
      }
      // A condition light cycles through the three persisted override choices:
      // follow the threshold -> force on -> force off -> follow the threshold.
      // Lights are only rendered as buttons for owners, so read-only viewers
      // retain the same tooltips without a dead click target.
      const light = event.target.closest('.status-light-button');
      if (light) {
        event.preventDefault();
        return this._cycleConditionOverride(light.dataset.conditionKey);
      }
    });
    condition.element.addEventListener('toggle', () => {
      this.#syncPopoverDoors('.chip-status, .vitals-door', condition);
    });

    edge.element.addEventListener('click', (event) => {
      if (!this.isEditable) return;
      const step = event.target.closest('.edge-step');
      if (!step) return;
      event.preventDefault();
      const pool = this.actor.system.derived?.edgePool ?? 0;
      this.#setEdgePool(pool + (step.dataset.action === 'increment' ? 1 : -1));
    });
    edge.element.addEventListener('toggle', () => this.#syncPopoverDoors('.chip-edge', edge));

    // Custom clickable chips (anchors without `href`, plus `.skill-info`, the
    // attribute tiles and the slot grid's cells) are promoted to keyboard
    // targets in
    // _onRender; this forwards their Enter/Space to the same click listeners
    // bound below.
    this.#delegate('keydown', 'a:not([href]), .skill-info, .heatmap-cell, .slot-cell, .slot-trinket, .stash-item, .armor-row[data-item-id], .hand-slot[data-item-id], .money-wallet-block.editable, .banner-portrait .profile-img[data-action="editImage"]', (event, target) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      target.click();
    });

    // The biography tab is hidden during the character sheet's initial
    // render, so size its textarea after Foundry has made that tab visible.
    this.#delegate('click', '.sheet-tabs [data-tab="biography"]', () => {
      requestAnimationFrame(() => this.#resizeBiography());
    });

    this.#delegate('input', '.biography-textarea', () => this.#resizeBiography());

    // Likewise the graph: a hidden tab has no size to lay it out in, so it
    // starts once the Beziehungen tab is showing.
    this.#delegate('click', '.sheet-tabs [data-tab="connections"]', () => {
      // Rendered while another tab was in front: the graph was left out.
      if (this.element.querySelector('.connections-graph-pending')) return this.render();
      requestAnimationFrame(() => {
        // Never started (the tab was hidden at render), or stopped while
        // out of sight: pick up where it was.
        if (!this.#graphRun) this.#runGraph();
        else this.#graphRun.wake();
      });
    });

    // Render the item sheet for viewing/editing prior to the editable check.
    // Keyed off `data-item-id` rather than a row class: the Merkmale list, the
    // Active Effects list and the Inventar table are three different shapes of
    // row, and the id is the one thing all three carry.
    this.#delegate('click', '.item-edit', (event, target) => {
      const row = target.closest('[data-item-id]');
      const item = this.actor.items.get(row?.dataset.itemId);
      item?.sheet.render(true);
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
      this.element.querySelector('.skill-search-clear')?.toggleAttribute('hidden', !target.value);
      this._applySkillFilter();
    });

    this.#delegate('click', '.skill-search-clear', (event, target) => {
      event.preventDefault();
      const input = this.element.querySelector('.skill-search-input');
      if (input) input.value = '';
      this._skillSearch = '';
      target.hidden = true;
      this._applySkillFilter();
      input?.focus();
    });

    // Inventar / Kleinkram / Geld: three tabs sharing one panel. Client-side like the
    // skill filter, so switching costs no re-render and works read-only.
    this.#delegate('click', '.loose-tab', (event, target) => {
      event.preventDefault();
      this._looseTab = target.dataset.looseTab;
      for (const tab of this.element.querySelectorAll('.loose-tab')) {
        const selected = tab === target;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      }
      for (const panel of this.element.querySelectorAll('.loose-panel')) {
        panel.hidden = panel.dataset.loosePanel !== this._looseTab;
      }
      // Where a run wraps is a measurement, and a hidden raster measures as
      // nothing.
      if (this._looseTab === 'inventory') this.#markSlotWraps();
    });

    this.#delegate('input', '.trinket-filter-input', (event, target) => {
      this._trinketFilter = target.value;
      this._applyTrinketFilter();
    });

    // The Inventar table's own search, filtering rows by name across every
    // group. Client-side like the skill search, so typing costs no re-render
    // and the caret stays where it is.
    this.#delegate('input', '.item-search-input', (event, target) => {
      this._itemSearch = target.value;
      this._applyItemFilter();
    });

    // Beziehungen: the search, and the table's own editing. The cells carry no
    // `name`, so the sheet's submit-on-change never sees them; each edit writes
    // the whole list back instead, like the consumable effects in the item
    // editor.
    this.#delegate('input', '.connections-search', (event, target) => {
      this._connectionSearch = target.value;
      this._applyConnectionFilter();
    });

    this.#delegate('click', '.connection-add', () => {
      // A new row is typed into in the table, whichever view was showing.
      this._connectionView = 'table';
      this.#addConnection();
    }, { requireEditable: true });

    // Table or graph: view state on the open sheet, like the carry tabs.
    this.#delegate('click', '.connections-view', (event, target) => {
      if (this._connectionView === target.dataset.view) return;
      this._connectionView = target.dataset.view;
      this.render();
    });

    // Graph: hovering a node lights it, its edges and its neighbours, and
    // dims the rest.
    // Graph: hovering a node stops the physics, lights the node and what it
    // touches, and shows what is known about it in a card beside it — hidden
    // while a node is dragged. Leaving it lets the graph run on.
    this.#delegate('pointerover', '.graph-node', (event, target) => {
      if (this.#graphRun) this.#graphRun.paused = true;
      this.#lightGraphNode(target);
      if (!this.#graphRun?.held) this.#showGraphCard(target);
    });
    this.#delegate('pointerout', '.graph-node', (event, target) => {
      if (target.contains(event.relatedTarget)) return;
      this.#lightGraphNode(null);
      this.#showGraphCard(null);
      const run = this.#graphRun;
      if (run?.paused) {
        run.paused = false;
        run.wake();
      }
    });

    // Graph: a node follows the pointer while dragged. View only — the next
    // render lays the graph out afresh.
    this.#delegate('pointerdown', '.graph-node', (event, target) => {
      this.#showGraphCard(null);
      dragGraphNode(this.#graphRun, event, target);
    });

    // Graph: a legend entry for Fraktion or Herkunft switches that kind of
    // node off and on. Redrawn, so the springs settle without them.
    this.#delegate('click', '.graph-legend-toggle', (event, target) => {
      const kind = target.dataset.kind;
      if (this._graphHidden.has(kind)) this._graphHidden.delete(kind);
      else this._graphHidden.add(kind);
      this.render();
    });

    // The physics panel over the graph. A slider moves the running graph at
    // once and is stored for this client when let go; it is no actor data,
    // so it never reaches the sheet's own form submit. Read-only sheets get
    // it too: it changes how the graph is drawn, not what it shows.
    this.element.addEventListener('toggle', (event) => {
      if (event.target.matches?.('.graph-tuning')) this._graphTuningOpen = event.target.open;
    }, { capture: true });
    this.#delegate('input', '[data-graph-param]', (event, target) => {
      const key = target.dataset.graphParam;
      const run = this.#graphRun;
      if (run) {
        run.sim.params[key] = Number(target.value);
        run.wake();
      }
      const output = target.parentElement.querySelector('output');
      if (output) output.textContent = target.value;
    });
    this.element.addEventListener('change', (event) => {
      const slider = event.target.closest?.('[data-graph-param]');
      if (!slider) return;
      event.stopImmediatePropagation();
      game.settings.set('tno', 'graphPhysics', { ...this.#graphPhysics(), [slider.dataset.graphParam]: Number(slider.value) });
    }, { capture: true });
    this.#delegate('click', '.graph-tuning-reset', async () => {
      await game.settings.set('tno', 'graphPhysics', SPRING_DEFAULTS);
      this.render();
    });
    // Start the picture over from the deterministic layout, dropping where
    // the springs and any drags had left the nodes.
    this.#delegate('click', '.graph-relayout', () => {
      this._graphPositions = new Map();
      this.render();
    });

    // Graph: a double-click on a person opens their row in the table.
    this.#delegate('dblclick', '.graph-node-person', (event, target) => {
      // Someone known only by hearsay has no row to open.
      if (!target.dataset.connectionId) return;
      this._connectionView = 'table';
      this._focusConnection = { id: target.dataset.connectionId, field: 'name' };
      this.render();
    });

    // Label columns (Beziehung, Kennt, Fraktion, Herkunft), Jira-style: focusing or typing opens the list of
    // labels already in use; arrows pick, Enter or a comma takes the picked
    // one (or the typed text), Backspace in the empty field drops the last
    // label, Escape closes the list. Registered before the row navigation
    // below, which steps aside once a key here has been handled.
    this.#delegate('focusin', '.connection-tag-input', (event, target) => this.#suggestLabels(target), { requireEditable: true });
    this.#delegate('input', '.connection-tag-input', (event, target) => this.#suggestLabels(target), { requireEditable: true });
    this.#delegate('focusout', '.connection-tag-input', (event, target) => this.#closeSuggestions(target));

    this.#delegate('keydown', '.connection-tag-input', (event, target) => {
      if (event.isComposing || this.#steerSuggestions(event, target)) return;
      const list = target.nextElementSibling;
      const options = [...list.querySelectorAll('.connection-tag-option')];
      const active = options.findIndex((option) => option.classList.contains('active'));
      const open = list.matches(':popover-open') && options.length > 0;

      if (event.key === 'Backspace' && !target.value) {
        const index = target.parentElement.querySelectorAll('.connection-tag').length - 1;
        if (index < 0) return;
        event.preventDefault();
        this.#removeLabelAt(target, index);
        return;
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === ',') {
        const label = open && active >= 0 ? options[active].dataset.value : target.value.trim();
        // Nothing to take: Enter falls through to the row navigation.
        if (!label) {
          if (event.key === ',') event.preventDefault();
          return;
        }
        event.preventDefault();
        this.#takeLabel(target, label);
      }
    }, { requireEditable: true });

    // `mousedown`, not `click`: it lands before the field loses focus, so the
    // list is still there to be clicked.
    // Anywhere in the list — an option or its scrollbar — the press must not
    // take the focus from the field, whose blur would close the list.
    this.#delegate('mousedown', '.connection-tag-suggest', (event, target) => {
      event.preventDefault();
      const option = event.target.closest('.connection-tag-option');
      if (!option) return;
      const input = target.previousElementSibling;
      if (input.matches('.connection-name')) this.#takePerson(input, Number(option.dataset.value));
      else this.#takeLabel(input, option.dataset.value);
    }, { requireEditable: true });

    this.#delegate('click', '.connection-tag-remove', (event, target) => {
      const input = target.closest('.connection-tags').querySelector('.connection-tag-input');
      this.#removeLabelAt(input, Number(target.dataset.index));
    }, { requireEditable: true });

    // A click on the cell's empty space is a click into the field.
    this.#delegate('click', '.connection-tags', (event, target) => {
      if (event.target === target) target.querySelector('.connection-tag-input')?.focus();
    });

    // The Name offers people the other characters list and Actors of the
    // world as it is typed. The arrows or the mouse pick one, Enter takes
    // the picked one — name, Fraktion, Herkunft and Actor link at once — and
    // stays; with nothing picked, Enter and Tab move on as everywhere.
    this.#delegate('input', '.connection-name', (event, target) => this.#suggestPeople(target), { requireEditable: true });
    this.#delegate('focusout', '.connection-name', (event, target) => this.#closeSuggestions(target));
    this.#delegate('keydown', '.connection-name', (event, target) => {
      if (event.isComposing || this.#steerSuggestions(event, target)) return;
      const list = target.nextElementSibling;
      const picked = list.matches(':popover-open') && list.querySelector('.connection-tag-option.active');
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey && picked) {
        event.preventDefault();
        this.#takePerson(target, Number(picked.dataset.value));
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') this.#closeSuggestions(target);
    }, { requireEditable: true });

    this.#delegate('click', '.connection-remove', (event, target) => {
      const id = target.closest('[data-connection-id]')?.dataset.connectionId;
      this.actor.update({ 'system.connections': removeConnection(this.actor.system.connections, id) });
    }, { requireEditable: true });

    this.#delegate('click', '.connection-open', async (event, target) => {
      const actor = await fromUuid(target.dataset.actorUuid);
      actor?.sheet?.render(true);
    });

    this.element.addEventListener('change', (event) => {
      const cell = event.target.closest?.('.connection-row [data-connection-field]');
      if (!cell) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // Text left in the label field when it is left — Tab, or a click
      // elsewhere — becomes a label, as Enter would have made it.
      if (cell.matches('.connection-tag-input')) {
        if (cell.value.trim()) this.#takeLabel(cell, cell.value.trim());
        return;
      }
      const id = cell.closest('[data-connection-id]').dataset.connectionId;
      const field = cell.dataset.connectionField;
      // A picked person is being written with the name in it.
      if (field === 'name' && this._adoptingConnection === id) return;
      const value = cell.type === 'checkbox' ? cell.checked : cell.value;
      const entry = normalizeConnections(this.actor.system.connections).find((e) => e.id === id);
      if (!entry || entry[field] === value) return;
      this.actor.update({
        'system.connections': editConnection(this.actor.system.connections, id, field, value),
      });
    }, { capture: true });

    // Moving through the table the way Excel does:
    //  - Tab / Shift+Tab: the next / previous cell, wrapping into the next /
    //    previous row; Tab past the last cell opens a new row.
    //  - Enter / Shift+Enter: the row below / above, in the column a run of
    //    Tabs started from (or this one); Enter on the last row opens a new
    //    row.
    //  - Alt+Enter: a line break in the notes.
    // Leaving a cell commits it — on its own `change`, or, for text still in
    // a label field, by taking it as a label first.
    this.#delegate('keydown', '.connection-row [data-connection-field]', (event, target) => {
      if (event.defaultPrevented || event.isComposing) return;

      if (event.key === 'Tab') {
        event.preventDefault();
        this._connectionTabAnchor ??= target.dataset.connectionField;
        this.#navigateConnections(target, { cols: event.shiftKey ? -1 : 1 });
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();

      if (event.altKey) {
        if (target.tagName === 'TEXTAREA') {
          target.setRangeText('\n', target.selectionStart, target.selectionEnd, 'end');
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
      const field = this._connectionTabAnchor ?? target.dataset.connectionField;
      this._connectionTabAnchor = null;
      this.#navigateConnections(target, { rows: event.shiftKey ? -1 : 1, field });
    }, { requireEditable: true });

    // A label list is placed once, under its cell; when the table scrolls it
    // would be left behind, so it closes instead.
    this.element.addEventListener('scroll', (event) => {
      if (!event.target.closest?.('.tab.connections, .window-content')) return;
      // The list scrolling its own options is no reason to close it.
      if (event.target.matches?.('.connection-tag-suggest')) return;
      for (const list of this.element.querySelectorAll('.connection-tag-suggest:popover-open')) {
        this.#closeSuggestions(list.previousElementSibling);
      }
    }, { capture: true });

    // A click puts the caret somewhere new; Enter no longer returns to where
    // a run of Tabs began.
    this.#delegate('pointerdown', '.connections-table', () => {
      this._connectionTabAnchor = null;
    });

    // Sort the table by a column. Deliberately **view-only**: `item.sort` is
    // the order the Basics slot bands pack from, and a header click here
    // must not repack a raster the player arranged by hand in another tab.
    this.#delegate('click', '.item-table-sort', (event, target) => {
      event.preventDefault();
      const config = this.#itemTableConfig();
      this.#storeItemTableConfig({ ...config, sort: nextItemTableSort(config, target.dataset.sortKey) });
    });

    // Which values the table shows. A reading preference, not actor data, so
    // read-only sheets get it too.
    this.#delegate('click', '.item-columns-toggle', (event, target) => {
      event.preventDefault();
      if (this.#popovers?.columns.isOpen) return this.#popovers.columns.hide();
      this.#openColumnsPopover(target);
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

    // The condition panel's two doors: the Zustände pill and the vitals row,
    // which 4b splits into the malus cell and the tracks beneath it. One panel,
    // because a stepper and the light it lights belong next to each other; two
    // doors, because both surfaces ask the same question of the same model.
    //
    // Not gated on `editable`: the panel is where someone reading another
    // player's sheet finds out what is wrong with that character. What an owner
    // gets on top of that is the steppers and the clickable lights, and those
    // are gated inside the panel.
    this.#delegate('click', '.chip-status, .vitals-door', (event, target) => {
      event.preventDefault();
      if (this.#popovers?.condition.isOpen) this.#popovers.condition.hide();
      else this.#openConditionPopover(target);
    });

    // The Edge pill. The pips are the read-out; the thresholds and the manual
    // correction are behind this click.
    this.#delegate('click', '.chip-edge', (event, target) => {
      event.preventDefault();
      if (this.#popovers?.edge.isOpen) this.#popovers.edge.hide();
      else this.#openEdgePopover(target);
    });

    // -------------------------------------------------------------
    // Everything below here only acts on an editable sheet.
    const editable = { requireEditable: true };

    // The banner chip only opens the picker; taking the Haltung happens in the
    // popover and is immediate. Deliberately not form-bound: the Haltung is
    // combat state, not an edit waiting for submit.
    this.#delegate('click', '.chip-stance', (event, target) => {
      event.preventDefault();
      if (this.#popovers?.stance.isOpen) this.#popovers.stance.hide();
      else this.#openStancePopover(target);
    }, editable);

    // Open the skill advancement dialog, either from the dedicated arrow
    // button or by clicking the skill's XP bar directly (the attribute heatmap
    // goes further and makes the whole tile the target — a skill row has other
    // things on it to click, a tile does not).
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

    // Open the attribute advancement dialog from anywhere on the heatmap cell.
    // The XP bar used to be the sole target; the tile is one subject end to
    // end, so the whole of it opens the dialog for that attribute.
    this.#delegate('click', '.heatmap-cell', (event, target) => {
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
      const row = target.closest('[data-item-id]');
      this.actor.items.get(row?.dataset.itemId)?.confirmDelete();
    }, editable);

    // Author a new item from the slot grid (or the Inventar tab's list). One
    // dialog for all three physical types rather than a create control per
    // type: the type is a choice inside the act of adding something, not three
    // separate acts.
    this.#delegate('click', '.inventory-add', (event, target) => {
      event.preventDefault();
      this._promptCreateItem();
    }, editable);

    this.#delegate('click', '.money-wallet-block.editable', (event, target) => {
      event.preventDefault();
      this.#openMoneyPopover(target);
    }, editable);

    // Carry cells, loose trinkets, left-behind gear, worn armour and held gear
    // open a compact action popover. The full editor remains one level below
    // its Edit action. The unequip and put-down x belong to the row but keep
    // their dedicated state-change action.
    this.#delegate(
      'click',
      '.slot-cell[data-item-id], .slot-trinket, .stash-item, .armor-row[data-item-id], .hand-slot[data-item-id]',
      (event, target) => {
        if (event.target.closest('.armor-unequip, .armor-resist, .hand-release')) return;
        event.preventDefault();
        const item = this.actor.items.get(target.dataset.itemId);
        if (item) this.#openItemPopover(item, target);
      }
    );

    // A hit location rolls its own resistance. The silhouette is the primary
    // way in — clicking where you were hit — and does not disturb drag-to-equip,
    // since a click does not follow a drag. The row's anchor is the same action
    // for anyone not using a mouse, and sits on empty zones too: a bare
    // location still carries whatever the Unterkleidung pads it with.
    this.#delegate('click', '.paperdoll-figure .zone[data-zone], .armor-resist', (event, target) => {
      event.preventDefault();
      this.actor.openResistanceCheck(target.dataset.zone);
    });

    // Equipment: the x on a filled paper doll zone takes the piece off, which
    // hands it back to the carry budget. Putting a piece *on* is drag-only
    // (see _onDrop) — a zone is a drop target, never a create button.
    this.#delegate('click', '.armor-unequip', (event, target) => {
      event.preventDefault();
      this._setEquippedArmor(target.dataset.zone, null);
    }, editable);

    // The x on a held slot puts the piece down; it stays carried. Taking a
    // piece *into* a hand is drag-only, like wearing (see _onDrop).
    this.#delegate('click', '.hand-release', (event, target) => {
      event.preventDefault();
      this._setHeld(target.dataset.hand, null);
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
      '.slot-grid [data-item-id], .slot-trinkets [data-item-id], .stash-list [data-item-id], .items-list [data-item-id], .slot-empty',
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

    // The doll's half of the same question. The whole block takes the drop
    // (see `_onDrop`), so wherever the pointer is on it, the zone the piece
    // will land in goes solid — row and shape together — as "let go and it
    // lands here". A piece already worn has nowhere new to go on the body.
    this.#delegate(
      'dragover',
      '.paperdoll',
      (event, target) => {
        event.preventDefault();
        this.#clearDropMarkers();
        const source = this.#dragging;
        // The hands sit inside the doll block but take a drop of their own:
        // the slot under the pointer goes solid, or both for a two-handed
        // piece, since that is what it will fill.
        const hand = event.target.closest?.('.hand-slot');
        if (hand) {
          if (!isGear(source)) return;
          const slots = source.system?.twoHanded ? target.querySelectorAll('.hand-slot') : [hand];
          for (const el of slots) el.classList.add('drop-onto');
          return;
        }
        const [zone] = armorZones(source);
        if (!zone || this.#wornZone(source.id)) return;
        for (const el of target.querySelectorAll(this.#zoneSelector(zone))) {
          el.classList.add('drop-onto');
        }
      },
      editable
    );

    // The left-behind pile takes a drop anywhere on it, not just on a piece
    // already there. Its gaps clear a sort marker a piece left behind; the
    // pieces themselves are marked by the handler above.
    this.#delegate(
      'dragover',
      '.stash-block',
      (event) => {
        event.preventDefault();
        if (!event.target.closest('[data-item-id]')) this.#clearDropMarkers();
      },
      editable
    );

    // Leaving the grid entirely has to clear the marker; moving between cells
    // does not, since the next `dragover` clears and re-marks anyway.
    this.#delegate('dragleave', '.slot-grid, .slot-trinkets, .stash-block, .items-list, .paperdoll', (event, target) => {
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
    this._applyTrinketFilter();
    this._applyItemFilter();
    this._applyConnectionFilter();
    this.#runGraph();
    this.#placeTabRail();
    this._applyColumnSplit();
    this.#resizeBiography();
    this.#observeSlotGrid();
    // Detaching moves the sheet into a second window; the popovers have to
    // follow it there before either is opened again.
    this.#mountPopovers();

    // Back into the Beziehungen cell the caret was in before the redraw — or
    // into the name of a row just opened.
    if (this._focusConnection) {
      const { id, field, start, end, value } = this._focusConnection;
      const cell = this.element.querySelector(`.connection-row[data-connection-id="${id}"] [data-connection-field="${field}"]`);
      if (cell && value != null && value !== cell.value) {
        // Put the uncommitted text back, and commit it on leaving: a value set
        // by script never fires `change` by itself.
        cell.value = value;
        cell.addEventListener('blur', () => cell.dispatchEvent(new Event('change', { bubbles: true })), { once: true });
      }
      cell?.focus();
      if (cell && start != null) cell.setSelectionRange(start, end);
      this._focusConnection = null;
    }

    // Most re-renders were caused by a popover — ticking a column, a stepper
    // press, a cycled light, a stock change — so an open one is redrawn from
    // what it just changed, or it would keep showing the state the click left
    // behind. A Haltung picker open across a render the actor caused elsewhere
    // is redrawn from the Haltung now in force. The wallet editor is the
    // exception: redrawing it would throw away what is being typed.
    const { item, money, columns, stance, condition, edge } = this.#popovers ?? {};
    for (const popover of [item, columns, stance, condition, edge]) {
      if (!popover?.isOpen) continue;
      await popover.refresh();
      popover.position();
    }
    money?.position();
    // The chip and the doors are fresh elements after a render, carrying the
    // template's tooltip and `aria-expanded="false"` again.
    if (stance?.isOpen) this.#syncStanceChip();
    if (condition?.isOpen) this.#syncPopoverDoors('.chip-status, .vitals-door', condition);
    if (edge?.isOpen) this.#syncPopoverDoors('.chip-edge', edge);
  }

  /** @inheritDoc */
  async _onClose(options) {
    this.#stopGraph();
    this.#slotGridObserver?.disconnect();
    this.#slotGridObserver = null;
    for (const popover of Object.values(this.#popovers ?? {})) popover.destroy();
    this.#popovers = null;
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
    // The slot grid's cells are divs, and with equipping gone drag-only they
    // are the only way left to reach a carried item's own sheet — so they have
    // to be reachable without a mouse. Only the first cell of a run takes the
    // stop: the others are the same item continuing, and tabbing through a
    // four-slot item four times to reach the next one is worse than not
    // reaching its tail at all.
    const targets = this.element.querySelectorAll(
      'a:not([href]), .skill-info, .heatmap-cell, .slot-cell.slot-first, .slot-trinket, .stash-item, .armor-row[data-item-id], .hand-slot[data-item-id], .money-wallet-block.editable, .banner-portrait .profile-img[data-action="editImage"]'
    );
    for (const el of targets) {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    }
  }

  /**
   * Leave a piece behind, or pick it back up. A worn piece comes off first:
   * what is not on the character cannot be on their body either, and leaving
   * the zone pointing at it would keep counting armour nobody wears.
   * @param {Item} item
   * @param {boolean} stashed
   */
  async _setStashed(item, stashed) {
    if (stashed) {
      const zone = this.#wornZone(item.id);
      if (zone) await this._setEquippedArmor(zone, null);
      // Nor can it be in hand.
      if (heldItemIds(this.actor.system.hands).has(item.id)) {
        await this.actor.update({ 'system.hands': releaseItem(this.actor.system.hands, item.id) });
      }
    }
    return item.update({ 'system.stashed': stashed });
  }

  /**
   * Take a piece into a hand, or empty that hand when `itemId` is null.
   * `holdInHand` decides what a two-handed piece does to the other hand.
   * Holding is bookkeeping only: nothing about slots or actions changes.
   * @param {string} hand  A key of HANDS.
   * @param {string|null} itemId
   * @private
   */
  async _setHeld(hand, itemId) {
    if (!HANDS.includes(hand)) return;
    const hands = this.actor.system.hands ?? {};
    const next = itemId
      ? holdInHand(hands, itemId, hand, !!this.actor.items.get(itemId)?.system?.twoHanded)
      : releaseHand(hands, hand);
    return this.actor.update({ 'system.hands': next });
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
    const update = armorEquipUpdate(
      this.actor.system.equipment,
      this.actor.system.hands,
      zone,
      itemId,
      itemId ? armorZones(this.actor.items.get(itemId)) : []
    );
    if (update) return this.actor.update(update);
  }


  /**
   * Ask what to add to the inventory: a name, and one card for what the thing
   * is. There is still only one kind of physical item — the cards write
   * `system.roles`, the same exclusive, clearable choice the item's own sheet
   * offers, and never the document type, which is fixed at creation and means
   * nothing here anyway.
   *
   * That distinction is the whole reason the picker is allowed to be here.
   * Nothing chosen in this dialog is harder to undo than the chip that will be
   * sitting on the sheet a second later, so the offer costs the player no
   * commitment; "Gegenstand" — no role — is preselected because it is both the
   * common case and the answer that asks for nothing.
   *
   * Feature and spell are still absent: they are not objects, cost no slots,
   * and are created from their own lists.
   * @private
   */
  async _promptCreateItem() {
    const roleCards = [
      { key: 'plain', label: 'TNO.Item.Role.Plain', icon: ROLE_ICONS.plain, selected: true },
      ...ITEM_ROLES.map((key) => ({
        key,
        label: CONFIG.TNO.itemRoles[key],
        icon: ROLE_ICONS[key],
        selected: false,
      })),
    ];

    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/tno/templates/apps/create-item-dialog.hbs',
      { roleCards }
    );

    const choice = await foundry.applications.api.DialogV2.prompt({
      // `dialog` is DialogV2's own class and is passed back deliberately: the
      // options array replaces the default rather than extending it, and
      // without it the window loses core's dialog chrome. `tno` is what puts
      // the content inside this system's stylesheet.
      classes: ['dialog', 'tno', 'create-item-dialog'],
      window: { title: game.i18n.localize('TNO.Inventory.AddTitle') },
      position: { width: 340 },
      content,
      ok: {
        icon: 'fa-solid fa-check',
        label: game.i18n.localize('TNO.Inventory.Add'),
        callback: (event, button) => ({
          name: button.form.elements.name.value.trim(),
          role: button.form.elements.role.value,
        }),
      },
      rejectClose: false,
    });
    if (!choice) return;

    const card = roleCards.find((entry) => entry.key === choice.role) ?? roleCards[0];

    const created = await Item.create(
      {
        // An empty field is a player who means "just add one" — a generic name
        // is better than an empty item nobody can find again. Now that the
        // dialog knows what kind of thing it is, that name can say so.
        name: choice.name || game.i18n.localize(card.label),
        type: 'item',
        system: { roles: selectRole(itemRoles({}), card.key) },
      },
      { parent: this.actor }
    );

    // Straight into the item's own values: a fresh item is all zeroes and
    // blanks, which is exactly what still has to be filled in — and a card
    // picked here decides which block of them is waiting.
    return created?.sheet.render(true);
  }

  /**
   * An Actor dropped on the Beziehungen tab becomes a row named after it and
   * linked to it — once: the same Actor dropped again is already listed.
   */
  async #dropConnection(data) {
    if (!this.isEditable) return;
    const actor = await Actor.implementation.fromDropData(data);
    if (!actor || actor === this.actor) return;
    if (hasConnectionTo(this.actor.system.connections, actor.uuid)) {
      ui.notifications.info(game.i18n.format('TNO.Connections.AlreadyListed', { name: actor.name }));
      return;
    }
    return this.actor.update({
      'system.connections': addConnection(this.actor.system.connections, foundry.utils.randomID(), {
        name: actor.name,
        actorUuid: actor.uuid,
      }),
    });
  }

  /**
   * @override
   * Route drops that land on one of the sheet's own equipment surfaces:
   *
   *  - **The paper doll** equips armour into the Stelle it was authored for,
   *    wherever on the block it lands. This is the only way to put a piece
   *    on — a zone is a drop target, never a create button — so a piece the actor does not own yet is created first,
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
    if (data?.type === 'Actor' && event.target?.closest?.('.tab.connections')) return this.#dropConnection(data);
    if (data?.type !== 'Item') return super._onDrop(event);

    // The whole doll takes the drop, not just the row: a piece has exactly one
    // authored Stelle, so where on the block it lands cannot change where it
    // goes — and the block is what lights up while it is in flight.
    const doll = event.target?.closest?.('.paperdoll');
    const stash = event.target?.closest?.('.stash-block');
    const carryArea = event.target?.closest?.('.slot-grid, .slot-trinkets, .items-list');
    const emptyCell = event.target?.closest?.('.slot-empty');
    if (!doll && !stash && !carryArea) return super._onDrop(event);

    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    // Into a hand. Any physical piece can be held; taking one in hand means
    // having it on you, so it is picked up from the pile and taken off the
    // body first, and gear from elsewhere is created on the way.
    const hand = event.target?.closest?.('.hand-slot');
    if (hand) {
      if (!isGear(item)) return;
      const owned =
        item.parent === this.actor
          ? item
          : (await this.actor.createEmbeddedDocuments('Item', [item.toObject()]))[0];
      if (isStashed(owned)) await this._setStashed(owned, false);
      const zone = this.#wornZone(owned.id);
      if (zone) await this._setEquippedArmor(zone, null);
      return this._setHeld(hand.dataset.hand, owned.id);
    }

    // Onto the left-behind pile. Gear from elsewhere arrives there directly —
    // owned, but not on the character. A piece already in the pile was
    // dropped on a neighbour to re-sort it, which core does.
    if (stash) {
      if (!isGear(item)) return;
      if (item.parent !== this.actor) {
        const source = item.toObject();
        source.system.stashed = true;
        return this.actor.createEmbeddedDocuments('Item', [source]);
      }
      if (!isStashed(item)) return this._setStashed(item, true);
      return super._onDrop(event);
    }

    // Dropped back into the slot grid. Taking a piece off by dragging it
    // there is the mirror of putting it on by dragging it to the doll — the x
    // on the row is the same act, but a player who learned to equip by dragging
    // has no reason to expect the way back to be a different gesture. The
    // unequip has to land before sorting so the body assignment and slot-band
    // assignment describe the same state.
    if (!doll) {
      if (item.parent !== this.actor) return super._onDrop(event);
      // Picked back up: it rejoins the carried band before anything sorts it.
      if (isStashed(item)) await this._setStashed(item, false);
      const wornZone = this.#wornZone(item.id);
      if (wornZone) await this._setEquippedArmor(wornZone, null);
      // Out of the hand: it was carried all along, so it only sorts.
      if (heldItemIds(this.actor.system.hands).has(item.id)) {
        await this.actor.update({ 'system.hands': releaseItem(this.actor.system.hands, item.id) });
      }
      // The free tail has no neighbour to sort against, so it means "put this
      // last" — for a piece just taken off as much as for anything else.
      if (emptyCell) return this._sortItemToEnd(item);
      // A piece just taken off keeps its stored order as it moves into the
      // packed band; anything already packed sorts as before.
      return wornZone ? undefined : super._onDrop(event);
    }

    const [zone] = armorZones(item);
    if (!zone) return;

    // Dropping armour the actor does not own yet has to create it first;
    // `parent` being this actor is what distinguishes the two cases.
    const owned =
      item.parent === this.actor
        ? item
        : (await this.actor.createEmbeddedDocuments('Item', [item.toObject()]))[0];
    // Worn straight out of the pile: putting it on means having it again.
    if (isStashed(owned)) await this._setStashed(owned, false);

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
    return wornZone(this.actor.system.equipment, itemId);
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

    // The Inventar table is grouped by role and ordered by whichever column the
    // reader sorted it on, so a row has no position to be dropped *into*: the
    // place a piece would appear to land is decided by its role and its values,
    // not by the list. Writing `item.sort` from a drop there would silently
    // repack the Basics slot bands to match an order nobody arranged.
    if (dropTarget.closest('.item-table')) return;

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

    // Only the moves this drag can make light up — see `dragTargets`. The
    // whole worn block lights up the way the grid block does for the way back,
    // so the target reads as an area; inside it, the one zone the piece belongs
    // to — row and silhouette shape — is marked stronger, since that is where
    // it will actually land.
    const light = dragTargets({
      worn: !!this.#wornZone(item.id),
      zones: armorZones(item),
      stashed: isStashed(item),
      held: heldItemIds(this.actor.system.hands).has(item.id),
      gear: isGear(item),
    });
    const doll = light.zones.length ? this.element.querySelector('.paperdoll') : null;
    doll?.classList.add('worn-drop-target');
    const targets = light.zones.flatMap((zone) => [
      ...this.element.querySelectorAll(this.#zoneSelector(zone)),
    ]);
    for (const el of targets) el.classList.add('zone-drop-target');
    const grid = light.grid ? this.element.querySelector('.slot-grid-block') : null;
    grid?.classList.add('carry-drop-target');
    const stash = light.stash ? this.element.querySelector('.stash-block') : null;
    stash?.classList.add('stash-drop-target');
    const hands = light.hands ? this.element.querySelector('.paperdoll-hands') : null;
    hands?.classList.add('hands-drop-target');

    dragged.addEventListener(
      'dragend',
      () => {
        this.#dragging = null;
        doll?.classList.remove('worn-drop-target');
        grid?.classList.remove('carry-drop-target');
        stash?.classList.remove('stash-drop-target');
        hands?.classList.remove('hands-drop-target');
        for (const el of targets) el.classList.remove('zone-drop-target');
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
   * The row and the silhouette shapes that stand for one zone. The
   * Unterkleidung is not a hit location — it covers all four at once — so it
   * answers with every shape rather than looking for a `suit` shape that does
   * not exist.
   * @param {string} zone
   * @returns {string}
   * @private
   */
  #zoneSelector(zone) {
    const shapes = zone === 'suit' ? '.paperdoll-figure .zone' : `.paperdoll-figure .zone[data-zone="${zone}"]`;
    return `.armor-row[data-zone="${zone}"], ${shapes}`;
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
    // Get the type of item to create. A control without one is a template bug,
    // but it used to reach `type.capitalize()` and throw there instead of
    // saying so.
    const type = target.dataset.type;
    if (!type) return;
    // Grab any data associated with this control.
    const data = { ...target.dataset };
    // Initialize a default name.
    const name = game.i18n.format('DOCUMENT.New', {
      type: game.i18n.localize(`TYPES.Item.${type}`),
    });
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
      // "combat" is a filter on categories rather than on rows: the two
      // fighting categories show in full, every other group hides.
      if (filter === 'combat' && !search) {
        groupEl.style.display = COMBAT_SKILL_CATEGORIES.includes(groupEl.dataset.category) ? '' : 'none';
        for (const rowEl of groupEl.querySelectorAll('.skill-row')) rowEl.style.display = '';
        continue;
      }
      const rows = groupEl.querySelectorAll('.skill-row');
      let anyVisible = false;
      for (const rowEl of rows) {
        const rank = Number(rowEl.dataset.rank) || 0;
        const xp = Number(rowEl.dataset.xp) || 0;
        const starter = rowEl.dataset.starter === 'true';
        const custom = rowEl.dataset.custom === 'true';
        const alwaysVisible = rowEl.dataset.alwaysVisible === 'true';
        // The searchable text is the name plus the subgroup label, because a
        // badged family's shared prefix ("Berührte Asteroiden") is no longer
        // part of the name it was factored out of — searching for it must
        // still find the four skills that wear the badge.
        const haystack = [
          rowEl.querySelector('.skill-name-text')?.textContent ?? '',
          rowEl.dataset.subgroupLabel ?? '',
        ].join(' ');
        const visible = search
          ? fuzzyMatch(search, haystack)
          : filter === 'all' ||
            alwaysVisible ||
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
   * Show/hide Kleinkram rows by the filter box: the same diacritic- and
   * case-insensitive subsequence match the skill search uses, on the name.
   * @private
   */
  _applyTrinketFilter() {
    const search = (this._trinketFilter ?? '').trim();
    const list = this.element.querySelector('.slot-trinkets-list');
    if (!list) return;
    let anyVisible = false;
    for (const rowEl of list.querySelectorAll('.slot-trinket')) {
      const visible = !search || fuzzyMatch(search, rowEl.querySelector('.slot-trinket-name')?.textContent ?? '');
      rowEl.hidden = !visible;
      if (visible) anyVisible = true;
    }
    list.querySelector('.slot-trinkets-nomatch')?.toggleAttribute('hidden', anyVisible);
  }

  /** Adjust one raw damage pool by one point, clamped only at zero. */
  async _stepDamage(kind, delta) {
    if (!['sharp', 'blunt'].includes(kind)) return;
    const current = Number(this.actor.system.damage?.[kind]);
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, safeCurrent + delta);
    await this.actor.update({ [`system.damage.${kind}`]: next });
  }

  /** Clear both damage pools in one actor update. */
  async _clearDamage() {
    await this.actor.update({ 'system.damage.sharp': 0, 'system.damage.blunt': 0 });
  }

  /** Cycle one damage condition's manual override without changing damage. */
  async _cycleConditionOverride(key) {
    const condition = this.actor.system.derived?.conditions?.items
      ?.find((entry) => entry.key === key);
    // The derived entries live in the same list but have no raster light and
    // no override slot in the schema, so they must never be cycled from here.
    // Only the six damage warnings carry no `source`.
    if (!condition || condition.source) return;

    const next = condition.override === null
      ? true
      : condition.override === true
        ? false
        : null;
    await this.actor.update({ [`system.conditionOverrides.${key}`]: next });
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

      // Dodge stays a self-contained defence probe: it needs neither an
      // attacker nor an attack result.
      if (dataset.rollType == 'dodge') {
        const options = ausweichenOptions(this.actor);
        if (!options) return;
        return new TnoRollDialog(this.actor, options).render(true);
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
        // Manöverfertigkeiten deliberately roll like any other skill here. A
        // Manöver is not a roll of its own — "alles das läuft aber unter
        // Angriff" — so it is declared inside the attack or parry it modifies,
        // where the weapon supplies WA, HH, DK and the SV malus and this rank
        // only sets what the Ansage costs.
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

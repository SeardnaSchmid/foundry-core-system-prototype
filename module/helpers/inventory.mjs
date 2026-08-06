/**
 * Pure inventory/armour maths, deliberately free of any Foundry globals so
 * it can be unit-tested without a game world. Everything here takes plain
 * objects shaped like `item.system` and returns plain objects.
 *
 * The rules model two independent axes that must not be conflated:
 *
 *  - **Carrying** — a slot economy that only exists while the character has
 *    a bag/backpack. Worn clothing and armour are exempt from it entirely.
 *  - **Wearing** — one Unterkleidung (the spacesuit base layer) plus four
 *    zone addons, contributing RH/RW/RA and a Stärke requirement.
 *
 * Where each axis is persisted, and why the two stores differ:
 *
 *  - **Worn** lives on the actor as `system.equipment` (zone key -> item id).
 *    It has to be actor-side because the *zone* is what makes it unique —
 *    only a single map can stop two chest pieces from both claiming `torso`.
 * Every owned physical item is carried unless it is currently worn. The rules
 * define no third "stowed but still owned by this actor" state.
 */

import { ARMOR_ZONES, ARMOR_SUIT_ZONE, GEAR_TYPES, hasRole } from './items.mjs';

/**
 * The four armour addon zones, i.e. the hit locations from the Rüstungen
 * table. The Unterkleidung (`suit`) is deliberately absent: it is not a hit
 * location, it applies in all four at once.
 *
 * Derived from the full list rather than written out again, so the paperdoll's
 * order and the maths here cannot drift apart.
 * @type {Array<string>}
 */
export const ARMOR_ADDON_ZONES = ARMOR_ZONES.filter((zone) => zone !== ARMOR_SUIT_ZONE);

/**
 * Fractions of the carry capacity at which movement degrades, per the
 * Inventarregeln: at half or more you can no longer sprint, once the budget
 * is full you can only crawl.
 *
 * NOTE: the half-capacity rule is the one bit of this that is still in
 * question — Ojster said he removed the "halbieren" clause as confusing, but
 * the published Inventarregeln page still lists it. It lives here as a lone
 * constant so dropping it is a one-line change rather than a hunt through
 * the derived-data code.
 * @type {{noSprint: number, crawlOnly: number}}
 */
export const CARRY_THRESHOLDS = { noSprint: 0.5, crawlOnly: 1 };

/**
 * The granularity the Rüstungen table writes Stärkevorraussetzungen in: whole
 * values for Unterkleidung, quarter-point increments for the addons. The summed
 * SV is snapped to this step so a total stays a value the table can express and
 * float arithmetic can never leak 2.4499999999999997 into the sheet.
 * @type {number}
 */
export const ARMOR_SV_STEP = 0.25;

/**
 * Coerce a possibly-missing numeric system field to a number. Actors and
 * items created under an older schema (or hand-edited) can hold strings or
 * nulls where a number is expected; every read here goes through this so a
 * bad field degrades to 0 instead of poisoning the sum with NaN.
 * @param {*} n
 * @returns {number}
 */
function num(n) {
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The set of item ids the actor is currently wearing, derived from the
 * actor's `system.equipment` store. Used to exclude worn gear from the carry
 * sum — "Von den Inventarregeln ausgenommen sind Kleidung und Rüstung welche
 * der Charakter am Leib trägt".
 * @param {Object} equipment  actor.system.equipment — zone key -> item id.
 * @returns {Set<string>}
 */
export function wornItemIds(equipment) {
  return new Set(Object.values(equipment ?? {}).filter(Boolean));
}

/**
 * The item types the slot economy applies to: physical things a character can
 * pick up. `feature` and `spell` are not objects at all, so they never appear
 * in the grid or the sum.
 *
 * A weapon is gear like any other here — the Inventarregeln's Richtwert table
 * prices weapons by size along with everything else ("einhändige Waffen",
 * "zweihändige Waffen", "schwere Waffen"). Whether a weapon is *readied* is a
 * separate, still-undesigned question, and deliberately not modelled by
 * exempting it from the budget.
 *
 * Kept as an alias of GEAR_TYPES: which *roles* a piece of gear has took over
 * from its type everywhere else, but the slot economy never cared about the
 * distinction — it applies to everything that is an object at all.
 * @type {Array<string>}
 */
export const CARRIED_ITEM_TYPES = GEAR_TYPES;

/**
 * The gear that actually presses on the slot budget: everything the character
 * owns, minus what they are wearing (exempt by rule).
 * @param {Array<Object>} items  All of the actor's items.
 * @param {Object} equipment  actor.system.equipment.
 * @returns {Array<Object>}
 */
function carriedGear(items, equipment) {
  const worn = wornItemIds(equipment);
  return (items ?? []).filter(
    (item) =>
      CARRIED_ITEM_TYPES.includes(item.type) &&
      !worn.has(item._id ?? item.id),
  );
}

/**
 * The least a piece of armour can cost while it is being hauled rather than
 * worn. Armour is never weightless: a helmet in a bag still takes up room, and
 * the zero-slot tier is explicitly Geld, Papiere and Krimskrams, which armour
 * is not. Anything off the body is either worn, carried, or not there at all —
 * there is no third way for a breastplate to be free.
 *
 * The floor lives here rather than only in the schema default so armour
 * authored before this rule (or hand-edited to 0) still costs its slot instead
 * of quietly slipping into the trinket row.
 * @type {number}
 */
const MIN_ARMOR_SLOTS = 1;

/**
 * How many Inventarslots a single stack of gear occupies.
 * @param {Object} item  An item document (or plain object) with `.system`.
 * @returns {number}
 */
export function itemSlotCost(item) {
  const floor = hasRole(item, 'armor') ? MIN_ARMOR_SLOTS : 0;
  return Math.max(num(item?.system?.slots), floor) * num(item?.system?.quantity ?? 1);
}

/**
 * Total Inventarslots consumed, and the movement state that follows from it.
 *
 * Without a container there is no slot economy at all: the character carries
 * what fits in their hands, which the rules describe qualitatively rather
 * than as a number, so `used` is reported as 0 and the state is `noContainer`
 * for the UI to render as its own badge.
 *
 * `used` is never clamped to `capacity` — going over is legal and simply
 * degrades movement, so the UI can show 12/10 rather than refusing the item.
 *
 * @param {Array<Object>} items  All of the actor's items.
 * @param {Object} equipment  actor.system.equipment.
 * @param {boolean} hasContainer  Whether the character carries a bag/backpack.
 * @param {number} capacity  carrySlots, i.e. 2*Stärke + Beweglichkeit.
 * @returns {{used: number, capacity: number, state: 'ok'|'noSprint'|'crawlOnly'|'noContainer'}}
 */
export function computeCarry(items, equipment, hasContainer, capacity) {
  if (!hasContainer) return { used: 0, capacity, state: 'noContainer' };

  const used = carriedGear(items, equipment).reduce((sum, item) => sum + itemSlotCost(item), 0);

  // A capacity of 0 would make every ratio infinite; treat any load at all as
  // maxed out and no load as fine, rather than dividing by zero.
  const ratio = capacity > 0 ? used / capacity : used > 0 ? Infinity : 0;

  let state = 'ok';
  if (ratio >= CARRY_THRESHOLDS.crawlOnly) state = 'crawlOnly';
  else if (ratio >= CARRY_THRESHOLDS.noSprint) state = 'noSprint';

  return { used, capacity, state };
}

/**
 * Lay out carried gear as a run of grid cells for the Trageslots view.
 *
 * The layout is *derived*, never stored: items are packed in their existing
 * `sort` order, each occupying as many cells as it costs, so nothing about a
 * player's arrangement needs persisting beyond the ordering Foundry already
 * keeps. Reordering is therefore a pure view concern.
 *
 * Zero-slot items (Geld, Papiere, Krimskrams) get no cell at all — they would
 * otherwise render as a zero-width block — and are returned separately for the
 * template to show as its own band. Armour can never land there: `MIN_ARMOR_SLOTS`
 * floors it at one cell, so a piece that is not worn is always visibly taking
 * up room rather than riding along free among the loose change.
 *
 * Gear is split into what fits and what does not, and a block is allowed to
 * *straddle* the boundary: as long as its first cell lands on a slot the
 * character has, it is packed, and only the cells past the budget read as
 * overload. Holding the whole block back would leave the slots before it
 * standing empty — a gap the player cannot fill and did not ask for — so the
 * split is drawn through the item instead. `inside` and `outside` say where
 * that cut falls, in cells.
 *
 * A straddling block still pushes the cursor past `capacity`, so every later
 * item lands in `overflow` on its own: nothing is ever pulled forward into a
 * leftover slot, because doing so would jump a small item ahead of a large one
 * it was sorted behind and silently reorder the player's list.
 *
 * The two arrays are meant to render as one continuous grid: `blocks`, then
 * `empty` free cells, then `overflow` styled as over capacity. So the cells up
 * to the budget are exactly the slots the character has, and everything past
 * them reads as load they cannot actually stow.
 *
 * @param {Array<Object>} items  All of the actor's items.
 * @param {Object} equipment  actor.system.equipment.
 * @param {number} capacity  carrySlots.
 * @returns {{blocks: Array<Object>, overflow: Array<Object>, trinkets: Array<Object>, empty: number}}
 *   `blocks` entries carry `{item, span, quantity, inside, outside}`; `overflow`
 *   entries `{item, span, quantity}`, being wholly past the budget.
 */
export function buildSlotGrid(items, equipment, capacity) {
  const carried = carriedGear(items, equipment).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const blocks = [];
  const overflow = [];
  const trinkets = [];
  let cursor = 0;

  for (const item of carried) {
    const span = itemSlotCost(item);
    if (span <= 0) {
      trinkets.push(item);
      continue;
    }

    const quantity = num(item.system?.quantity ?? 1);

    // No slot left to start on: the block is wholly out. Once anything has
    // straddled, `cursor` is already past `capacity`, which is what keeps the
    // rest of the list out here behind it.
    if (cursor >= capacity) {
      overflow.push({ item, span, quantity });
      continue;
    }

    const inside = Math.min(span, capacity - cursor);
    blocks.push({ item, span, quantity, inside, outside: span - inside });
    cursor += span;
  }

  return { blocks, overflow, trinkets, empty: Math.max(0, capacity - cursor) };
}

/**
 * Resolve the effective armour values for each of the four hit locations,
 * layering the Unterkleidung under each zone's addon.
 *
 * The Rüstungstabelle writes every Unterkleidung row as RH 0 and RA "–", so the
 * base layer is padding alone: it contributes its RW to every zone and neither
 * hardness nor coverage anywhere. RH and RA therefore come from the zone's
 * addon by itself.
 *
 * Suit and addon RW are summed, per Ojster's "alle Werte addiert" ruling. The
 * table's own combined rows (Handschuhe + Ellenbogenschoner) add SV and RA but
 * leave RH and RW untouched, which reads the other way — the ruling governs.
 *
 * SV is the sum of every worn piece, suit included, and comes in quarter
 * steps — see ARMOR_SV_STEP. It is one number for the whole body rather than
 * per zone, because the malus it may cost lands on all Beweglichkeitswürfe.
 *
 * Only plain numbers are returned, never the Item documents themselves:
 * this lands in `system.derived`, and embedding live documents there would
 * make derived data circular and break anything that serializes it. Callers
 * that need the item look it up from `equipment` themselves.
 *
 * @param {Object} equipment  actor.system.equipment — zone key -> item id.
 * @param {Array<Object>} items  All of the actor's items.
 * @returns {{zones: Object, sv: number}}  Each zone carries the effective
 *   `rh`/`rw`/`ra` plus `rwSuit`/`rwAddon`, the two contributions the `rw` sum
 *   is made of.
 */
export function resolveArmor(equipment, items) {
  const byId = new Map((items ?? []).map((item) => [item._id ?? item.id, item]));
  const get = (zone) => byId.get(equipment?.[zone] ?? null) ?? null;

  const suit = get('suit');
  const suitRw = num(suit?.system?.rw);

  const zones = {};
  for (const zone of ARMOR_ADDON_ZONES) {
    const addon = get(zone);
    zones[zone] = {
      equipped: !!addon,
      // A zone with no addon is RH 0 and RA 0 even under a suit: the base layer
      // pads the location, it neither hardens nor covers it. RA 0 is what
      // "Rüstung umgehen" reads, so a bare zone costs nothing to shoot around.
      rh: num(addon?.system?.rh),
      rw: suitRw + num(addon?.system?.rw),
      ra: num(addon?.system?.ra),
      // The two halves of that sum, kept apart so the sheet can say where the
      // padding came from. RW is the only layered number on the doll, and a
      // bare "4" on a zone whose helmet reads 3 is exactly the kind of value a
      // player checks against the item — the breakdown is what answers it.
      rwSuit: suitRw,
      rwAddon: num(addon?.system?.rw),
    };
  }

  // "Stärkevorraussetzungen aller Kleidung und Rüstung wird aufaddiert um die
  // finale SV zu erhalten": every worn piece contributes. The Unterkleidung
  // rows carry whole values, the addons quarter-point increments, so the total
  // is snapped back onto ARMOR_SV_STEP. What the single Malusstufe costs is
  // decided against this one total, not per piece.
  const svTotal = [suit, ...ARMOR_ADDON_ZONES.map(get)]
    .reduce((sum, item) => sum + num(item?.system?.sv), 0);
  const sv = Math.max(0, Math.round(svTotal / ARMOR_SV_STEP) * ARMOR_SV_STEP);

  return { zones, sv };
}

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
 */

/**
 * The four armour addon zones, i.e. the hit locations from the Rüstungen
 * table. The Unterkleidung (`suit`) is deliberately absent: it is not a hit
 * location, it applies in all four at once.
 * @type {Array<string>}
 */
export const ARMOR_ADDON_ZONES = ['head', 'torso', 'arms', 'legs'];

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
 * How many Inventarslots a single stack of gear occupies.
 * @param {Object} item  An item document (or plain object) with `.system`.
 * @returns {number}
 */
export function itemSlotCost(item) {
  return num(item?.system?.slots) * num(item?.system?.quantity ?? 1);
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

  const worn = wornItemIds(equipment);
  const used = (items ?? [])
    .filter((item) => (item.type === 'item' || item.type === 'armor') && !worn.has(item._id ?? item.id))
    .reduce((sum, item) => sum + itemSlotCost(item), 0);

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
 * template to show as chips.
 *
 * @param {Array<Object>} items  All of the actor's items.
 * @param {Object} equipment  actor.system.equipment.
 * @param {number} capacity  carrySlots.
 * @returns {{blocks: Array<Object>, trinkets: Array<Object>, empty: number}}
 */
export function buildSlotGrid(items, equipment, capacity) {
  const worn = wornItemIds(equipment);
  const carried = (items ?? [])
    .filter((item) => (item.type === 'item' || item.type === 'armor') && !worn.has(item._id ?? item.id))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const blocks = [];
  const trinkets = [];
  let cursor = 0;

  for (const item of carried) {
    const span = itemSlotCost(item);
    if (span <= 0) {
      trinkets.push(item);
      continue;
    }
    // A block counts as over capacity once it *starts* past the budget; one
    // straddling the boundary is still the item that used up the last slot.
    blocks.push({ item, span, over: cursor >= capacity, quantity: num(item.system?.quantity ?? 1) });
    cursor += span;
  }

  return { blocks, trinkets, empty: Math.max(0, capacity - cursor) };
}

/**
 * Resolve the effective armour values for each of the four hit locations,
 * layering the Unterkleidung under each zone's addon.
 *
 * Per Ojster: the Unterkleidung never contributes Rüstungshärte, but
 * otherwise counts in every zone with all values added. So RH comes from the
 * addon alone, while RW and RA are the sum of suit and addon.
 *
 * RA is clamped to the 1-10 band the Rüstungen table documents. Summing RA is
 * an inference — the "alle Werte addiert" answer was given about RW — so the
 * clamp keeps an unconfirmed reading from producing out-of-band coverage.
 *
 * Only plain numbers are returned, never the Item documents themselves:
 * this lands in `system.derived`, and embedding live documents there would
 * make derived data circular and break anything that serializes it. Callers
 * that need the item look it up from `equipment` themselves.
 *
 * @param {Object} equipment  actor.system.equipment — zone key -> item id.
 * @param {Array<Object>} items  All of the actor's items.
 * @returns {{zones: Object, sv: number}}
 */
export function resolveArmor(equipment, items) {
  const byId = new Map((items ?? []).map((item) => [item._id ?? item.id, item]));
  const get = (zone) => byId.get(equipment?.[zone] ?? null) ?? null;

  const suit = get('suit');
  const suitRw = num(suit?.system?.rw);
  const suitRa = num(suit?.system?.ra);

  const zones = {};
  for (const zone of ARMOR_ADDON_ZONES) {
    const addon = get(zone);
    zones[zone] = {
      equipped: !!addon,
      // The Unterkleidung gives no RH, so an unarmoured zone under a suit is
      // still RH 0 — the suit closes coverage, it does not harden the zone.
      rh: num(addon?.system?.rh),
      rw: suitRw + num(addon?.system?.rw),
      ra: Math.min(10, suitRa + num(addon?.system?.ra)),
    };
  }

  // The Stärkevorraussetzung malus is a single penalty on all Beweglichkeit
  // rolls, so what matters is the most demanding piece worn, not the sum.
  const sv = Math.max(0, ...[suit, ...ARMOR_ADDON_ZONES.map(get)].map((item) => num(item?.system?.sv)));

  return { zones, sv };
}

/**
 * World fixtures for the e2e suite: the example characters, items and combats
 * a spec needs before it can test anything.
 *
 * **Why this file exists.** A spec's setup used to be a `page.evaluate` block
 * of its own, holding a hand-written `system` object with every field
 * `template.json` defines — including the ones the spec did not care about. Six
 * specs carried a copy of the same item boilerplate, three built a combat three
 * different ways, and the domain knowledge ("armour needs a `zone`, a weapon
 * needs `roles.weapon`") was spread across all of them.
 *
 * So the shaping happens **here, in Node**, as plain objects: `weapon()` and
 * `armor()` are pure functions that fill in what every piece of gear has and
 * leave the spec naming only what it is about. Applying them is one
 * `page.evaluate` for the whole actor rather than one per document.
 *
 * The rule for a spec: **state the numbers under test, inherit the rest.** An
 * arithmetic assertion is only readable if the values it adds up are visible in
 * the spec, so nothing here hides an `sv` or an `rw` behind a preset. What it
 * hides is `quantity: 1` and `roles: {weapon: false, armor: true, …}`.
 */

/**
 * The twelve attributes, chosen so every derived formula lands on a distinct,
 * non-obvious number — the averages are deliberately not whole, so a
 * ceil/round/floor mix-up changes the answer instead of going unnoticed.
 *
 * This is the example character of the suite: use it wherever the attributes
 * are scenery rather than the subject, so a spec that *does* turn on one value
 * is visibly different from one that does not.
 */
export const ABILITIES = Object.freeze({
  str: 5, dex: 7, fin: 3, per: 5, aut: 2, cha: 3,
  man: 4, emp: 6, wil: 9, int: 8, wis: 4, inv: 3,
});

/* -------------------------------------------- */
/*  Pure builders                               */
/* -------------------------------------------- */

/**
 * A weapon's document data.
 *
 * Everything a weapon always has is defaulted; everything a spec is testing is
 * named by the spec. Unknown keys pass through to `system`, so a field this
 * builder has never heard of needs no change here.
 *
 * `wa` is deliberately **not** defaulted: which attribute an attack rolls on is
 * a choice, and a silent `str` would put a Fingerfertigkeit blade on the wrong
 * one without the spec ever saying so.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {'melee'|'ranged'} [spec.use]  Defaults to melee.
 * @returns {object} Item creation data.
 */
export function weapon({ name, use = 'melee', slots = 1, quantity = 1, ...rest }) {
  return {
    name,
    type: 'item',
    system: {
      roles: { weapon: true, armor: false, consumable: false },
      use,
      slots,
      quantity,
      sv: 0,
      dk: 0,
      hh: { active: 0, passive: 0 },
      ...rest,
    },
  };
}

/**
 * A piece of plain carried gear — no role, just bulk.
 *
 * What the slot economy is made of: a crate has no weapon profile and no zone,
 * and a spec about the carry budget should not have to say so twice.
 * @returns {object} Item creation data.
 */
export function gear({ name, slots = 1, quantity = 1, ...rest }) {
  return { name, type: 'item', system: { slots, quantity, ...rest } };
}

/**
 * A piece of armour's document data.
 *
 * `zone` is required rather than defaulted: which location a piece covers is
 * the whole of what makes it that piece, and a silent `torso` would let a spec
 * about the Unterkleidung quietly test something else.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {'suit'|'head'|'torso'|'arms'|'legs'} spec.zone
 * @param {boolean} [spec.equipped]  Wear it — see {@link createCharacter}.
 * @returns {object} Item creation data.
 */
export function armor({ name, zone, slots = 1, quantity = 1, equipped = false, ...rest }) {
  return {
    name,
    type: 'item',
    // Carried on the data rather than in `system`, and stripped before create:
    // wearing a piece is an actor-side fact (`system.equipment.<zone>`), but a
    // spec reads far better when it says so beside the piece it is wearing.
    equipped,
    zone,
    system: {
      roles: { weapon: false, armor: true, consumable: false },
      zone,
      slots,
      quantity,
      sv: 0,
      ...rest,
    },
  };
}

/**
 * Expand a `{skill: rank}` shorthand into the stored `{value, xp}` shape.
 * @param {Object<string, number|object>} skills
 * @returns {object}
 */
function expandSkills(skills = {}) {
  return Object.fromEntries(Object.entries(skills).map(([key, value]) => [
    key,
    typeof value === 'number' ? { value, xp: 0 } : { xp: 0, ...value },
  ]));
}

/**
 * Expand a `{ability: base}` shorthand into the stored `{base, xp}` shape.
 * @param {Object<string, number|object>} abilities
 * @returns {object}
 */
function expandAbilities(abilities = {}) {
  return Object.fromEntries(Object.entries(abilities).map(([key, value]) => [
    key,
    typeof value === 'number' ? { base: value, xp: 0 } : { xp: 0, ...value },
  ]));
}

/* -------------------------------------------- */
/*  Applying them to a world                    */
/* -------------------------------------------- */

/**
 * Create a character, its gear, and whatever it is wearing — in one round trip.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [spec]
 * @param {string} [spec.name]
 * @param {Object<string, number>} [spec.abilities]  Bases; `{base, xp}` also accepted.
 * @param {Object<string, number>} [spec.skills]     Ranks; `{value, xp}` also accepted.
 * @param {string} [spec.stance]                     A Haltung, as `CONFIG.TNO.stances` keys it.
 * @param {Array<object>} [spec.items]               From {@link weapon} / {@link armor}.
 * @param {object} [spec.system]                     Escape hatch, merged last.
 * @returns {Promise<{id: string, derived: object, items: Object<string, string>}>}
 *   `items` maps each item's name to its id, which is what a sheet selector needs.
 */
export async function createCharacter(page, spec = {}) {
  const payload = {
    name: spec.name ?? 'E2E Character',
    abilities: expandAbilities(spec.abilities),
    skills: expandSkills(spec.skills),
    stance: spec.stance ?? null,
    system: spec.system ?? {},
    items: (spec.items ?? []).map(({ equipped, zone, ...data }) => ({
      data,
      // Only armour carries these two, and only armour can be worn.
      wear: equipped ? zone : null,
    })),
  };

  return page.evaluate(async (spec) => {
    const system = { ...spec.system, abilities: spec.abilities };
    if (Object.keys(spec.skills).length) system.skills = { ...spec.system.skills, ...spec.skills };
    if (spec.stance) system.combat = { stance: spec.stance, ...spec.system.combat };

    const actor = await Actor.create({ name: spec.name, type: 'character', system });

    const items = {};
    if (spec.items.length) {
      const created = await actor.createEmbeddedDocuments('Item', spec.items.map((i) => i.data));
      const worn = {};
      created.forEach((item, index) => {
        items[item.name] = item.id;
        const wear = spec.items[index].wear;
        if (wear) worn[`system.equipment.${wear}`] = item.id;
      });
      if (Object.keys(worn).length) await actor.update(worn);
    }

    return { id: actor.id, derived: foundry.utils.deepClone(actor.system.derived), items };
  }, payload);
}

/**
 * Create an NPC. They have no `system.combat` at all — see `template.json` —
 * which is exactly why a spec reaches for one: it is the actor whose Haltung
 * and derived data simply do not exist.
 * @returns {Promise<string>} the actor id
 */
export async function createNpc(page, name = 'E2E NPC') {
  return page.evaluate(
    (n) => Actor.create({ name: n, type: 'npc' }).then((actor) => actor.id),
    name
  );
}

/**
 * Put actors into a fresh combat.
 *
 * Initiative is set in a second pass rather than at creation, because the sort
 * under test is the system's and a spec must be free to create the combatants
 * in an order that is not their turn order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Array<string|{actorId: string, initiative?: number}>} combatants
 * @param {object} [options]
 * @param {boolean} [options.render]  Bring the tracker on screen and wait for a row.
 * @returns {Promise<{id: string, ids: Object<string, string>}>}
 *   `ids` maps each actor id to its combatant id.
 */
export async function createCombat(page, combatants, { render = false } = {}) {
  const entries = combatants.map((c) => (typeof c === 'string' ? { actorId: c } : c));

  const combat = await page.evaluate(async ([entries, render]) => {
    const combat = await Combat.create({});
    const created = await combat.createEmbeddedDocuments(
      'Combatant',
      entries.map(({ actorId }) => ({ actorId }))
    );

    const ids = Object.fromEntries(created.map((c) => [c.actorId, c.id]));
    const initiatives = entries
      .filter((e) => Number.isFinite(e.initiative))
      .map((e) => ({ _id: ids[e.actorId], initiative: e.initiative }));
    if (initiatives.length) await combat.updateEmbeddedDocuments('Combatant', initiatives);

    if (render) {
      await ui.sidebar.changeTab('combat', 'primary');
      await ui.combat.render({ force: true });
    }
    return { id: combat.id, ids };
  }, [entries, render]);

  if (render) {
    await page.locator('#combat li.combatant').first().waitFor({ state: 'visible', timeout: 20_000 });
  }
  return combat;
}

/**
 * Delete a combat.
 *
 * Every spec that makes one has to: a Combat is not an Actor, so the `world`
 * fixture's purge leaves it behind, and the next spec would open on a tracker
 * that already has rows.
 */
export async function deleteCombat(page, combatId) {
  await page.evaluate((id) => game.combats.get(id)?.delete(), combatId);
}

/* -------------------------------------------- */
/*  Reading the world back                      */
/* -------------------------------------------- */

/**
 * Localize keys in the running world.
 *
 * Specs assert against these rather than against hard-coded English, so they
 * check the string the player actually sees in whichever language the world
 * runs — and fail on a missing translation key instead of quietly passing.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object<string, string|[string, object]>} keys
 *   A key, or `[key, data]` for `game.i18n.format`.
 * @returns {Promise<Object<string, string>>} the same shape, localized
 * @example
 *   const t = await localize(page, {
 *     sv: ['TNO.Combat.SvMalus', { steps: 2 }],
 *     handling: 'TNO.Combat.ActiveHandling',
 *   });
 */
export async function localize(page, keys) {
  return page.evaluate((keys) => Object.fromEntries(
    Object.entries(keys).map(([name, spec]) => [
      name,
      Array.isArray(spec) ? game.i18n.format(spec[0], spec[1]) : game.i18n.localize(spec),
    ])
  ), keys);
}

/**
 * The whole `flags.tno` payload of the most recent chat message — the threshold
 * a roll was made against, the components it was summed from, and whatever else
 * that roll carried.
 *
 * Returned whole rather than picked apart, because the flags *are* the card's
 * contract: a spec asserting on a field this helper forgot to forward would
 * have to reach past it and write its own `evaluate` again.
 * @returns {Promise<object>}
 */
export async function lastMessage(page) {
  return page.evaluate(() => {
    const flags = game.messages.contents.at(-1)?.flags?.tno;
    return flags ? foundry.utils.deepClone(flags) : {};
  });
}

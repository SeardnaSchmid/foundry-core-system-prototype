/**
 * Manöver, as one formula and one table.
 *
 * "Manöver sind alles, was Kampfhandlungen wie Angriffe, Paraden, Ausweichen,
 * Bewegung und so weiter modifiziert" — and every declarable one modifies a roll
 * that already exists: "alles das läuft aber unter Angriff". None of them is a
 * roll of its own, which is why nothing here opens one. A Manöver contributes a
 * cost to the roll being made and an effect that lands elsewhere.
 *
 * This module holds itself free of Foundry globals so the arithmetic can be
 * unit-tested without a game world; `label` and `effect` are localisation keys,
 * never localised strings.
 */

/**
 * What an Ansage costs the roll that declares it.
 *
 * "Bei solchen Ansagen kann man bis zum Limit der Manöverfähigkeit 1 zu 1
 * ansagen, darüber hinaus 1 zu 2."
 *
 * The rulebook's own worked example is the test: Geschickte Angriffe 2 with a
 * 3er Finte costs 4, at rank 4 it costs 3, and at rank 0 it costs 6. Note that
 * the *effect* is always the declared Betrag — the 2:1 conversion is a surcharge
 * on the declarer, not a discount for the target.
 *
 * The per-Manöver "maximal um die Höhe deiner X Fertigkeit" phrases are **not**
 * hard caps: each section opens with "normale Ansageregeln gelten hier auf
 * alles", and the general rule's own example declares above the rank. They are
 * restatements of where 1:1 stops.
 *
 * @param {number} betrag  What is being declared.
 * @param {number} rang    The character's rank in the governing Manöverfertigkeit.
 * @returns {number} A positive cost. Subtract it from the threshold.
 */
export function ansageKosten(betrag, rang) {
  const declared = Math.max(0, Math.trunc(Number(betrag) || 0));
  const rank = Math.max(0, Math.trunc(Number(rang) || 0));
  return declared <= rank ? declared : rank + 2 * (declared - rank);
}

/**
 * How a Manöver's Betrag is arrived at.
 *
 * `free`  — the declarer picks the size (Finte, Riposte, the two Schwünge).
 * `fixed` — the rule names it (Arme and Beine cost a step, Kopf two).
 * `typed` — only the other side of the table knows it, so it is announced and
 *           typed in: the Rüstungsabdeckung for 'Rüstung umgehen', whatever the
 *           GM sets for 'Schwachstelle'. This is the same shape as the announced
 *           Schadenswert on the resistance roll, and for the same reason — a
 *           workflow that looked it up would have to read the opponent's sheet.
 * @type {Object<string, string>}
 */
export const BETRAG_MODES = { free: 'free', fixed: 'fixed', typed: 'typed' };

/**
 * Ansagen that rule one another out, offered as one choice instead of one row
 * each.
 *
 * "Im Prinzip sind sie alle kombinierbar" holds for everything ungrouped — but
 * an attack has one Stelle. Announcing the head *and* the legs is not a
 * combination, it is two different attacks, and letting both be ticked would
 * charge for both while only one could land.
 *
 * A grouped Manöver is therefore only ever declared by being *selected*, which
 * is also what keeps `fixed` honest: a Betrag the rule names has no zero, so
 * "not declared" needs a signal of its own, and the group's empty option is it.
 * @type {Object<string, {label: string, none: string}>}
 */
export const ANSAGE_GROUPS = {
  zone: { label: 'TNO.Maneuver.Zone.Label', none: 'TNO.Maneuver.Zone.None' },
};

/**
 * The declarable Manöver of the written rules.
 *
 * `skill` names the Manöverfertigkeit that governs the 1:1 limit, keyed as it is
 * in `CONFIG.TNO.skills`. Three of the Kampfregeln's section headings are not
 * the skill names — Gezielte Angriffe is 'Gezielter Stich' (`preciseStrike`),
 * Gezielte Schüsse is 'Angesagter Schuss' (`calledShot`), Starke Angriffe is
 * 'Distanzkontrolle' (`rangeControl`) — so these follow the Fertigkeiten page,
 * which is where the ranks a character actually buys are listed.
 *
 * `use` restricts a Manöver to melee or ranged; absent means either. `zone` is
 * the Stelle it announces. `requiresReach` marks the Starke Angriffe, which
 * "können nur verwendet werden, wenn der Angreifer den Reichweitenvorteil hat".
 *
 * `affects` names the defender's rolls the declared Betrag lands on. It is the
 * entire content of what crosses between two players — the defender is never
 * told *which* Manöver was declared, because from their side a Finte, a Starker
 * Schwung and a Weiter Schwung are the same sentence: your roll is worse by n.
 *
 * Not here, deliberately: Abtauchen, Unterlaufen, Positionierung, Auf Abstand
 * halten, Defensiver Kampf and Deckung nutzen. Those cost nothing and declare
 * nothing — they are standing bonuses of rank on some other roll, which makes
 * them modifier rows rather than Ansagen.
 * @type {Object<string, Object>}
 */
export const MANEUVERS = {
  feint: {
    label: 'TNO.Maneuver.Feint.Label',
    effect: 'TNO.Maneuver.Feint.Effect',
    skill: 'cunningAttacks',
    on: 'attack',
    use: 'melee',
    betrag: BETRAG_MODES.free,
    affects: ['parry', 'dodge'],
  },
  riposte: {
    label: 'TNO.Maneuver.Riposte.Label',
    effect: 'TNO.Maneuver.Riposte.Effect',
    skill: 'cunningAttacks',
    on: 'parry',
    use: 'melee',
    betrag: BETRAG_MODES.free,
    affects: [],
  },
  strongSwing: {
    label: 'TNO.Maneuver.StrongSwing.Label',
    effect: 'TNO.Maneuver.StrongSwing.Effect',
    skill: 'rangeControl',
    on: 'attack',
    use: 'melee',
    betrag: BETRAG_MODES.free,
    affects: ['parry', 'resistance'],
    requiresReach: true,
  },
  wideSwing: {
    label: 'TNO.Maneuver.WideSwing.Label',
    effect: 'TNO.Maneuver.WideSwing.Effect',
    skill: 'rangeControl',
    on: 'attack',
    use: 'melee',
    betrag: BETRAG_MODES.free,
    affects: ['dodge'],
    requiresReach: true,
  },
  arms: {
    label: 'TNO.Maneuver.Arms.Label',
    effect: 'TNO.Maneuver.Arms.Effect',
    skill: { melee: 'preciseStrike', ranged: 'calledShot' },
    on: 'attack',
    betrag: 3,
    zone: 'arms',
    group: 'zone',
  },
  legs: {
    label: 'TNO.Maneuver.Legs.Label',
    effect: 'TNO.Maneuver.Legs.Effect',
    skill: { melee: 'preciseStrike', ranged: 'calledShot' },
    on: 'attack',
    betrag: 3,
    zone: 'legs',
    group: 'zone',
  },
  head: {
    label: 'TNO.Maneuver.Head.Label',
    effect: 'TNO.Maneuver.Head.Effect',
    skill: { melee: 'preciseStrike', ranged: 'calledShot' },
    on: 'attack',
    betrag: 6,
    zone: 'head',
    group: 'zone',
  },
  bypassArmor: {
    label: 'TNO.Maneuver.BypassArmor.Label',
    effect: 'TNO.Maneuver.BypassArmor.Effect',
    skill: { melee: 'preciseStrike', ranged: 'calledShot' },
    on: 'attack',
    betrag: BETRAG_MODES.typed,
  },
  weakSpot: {
    label: 'TNO.Maneuver.WeakSpot.Label',
    effect: 'TNO.Maneuver.WeakSpot.Effect',
    skill: { melee: 'preciseStrike', ranged: 'calledShot' },
    on: 'attack',
    betrag: BETRAG_MODES.typed,
  },
};

/**
 * The Manöverfertigkeit that governs this Manöver with this kind of weapon.
 * Trefferzonen are announced with a different skill in melee than at range.
 * @param {Object} maneuver
 * @param {'melee'|'ranged'} use
 * @returns {string}
 */
export function maneuverSkill(maneuver, use) {
  return typeof maneuver?.skill === 'string' ? maneuver.skill : maneuver?.skill?.[use] ?? '';
}

/**
 * Every Manöver declarable on this roll, in table order.
 * @param {'attack'|'parry'} on
 * @param {'melee'|'ranged'} use
 * @returns {Array<{key: string, maneuver: Object}>}
 */
export function declarableManeuvers(on, use) {
  return Object.entries(MANEUVERS)
    .filter(([, maneuver]) => maneuver.on === on && (!maneuver.use || maneuver.use === use))
    .map(([key, maneuver]) => ({ key, maneuver }));
}

/**
 * The Stelle a standard attack hits when nothing was announced.
 * @type {string}
 */
export const DEFAULT_ZONE = 'torso';

/**
 * Where the damage of a hit lands, and at what multiple, given the Stelle.
 *
 * "Schaden wird direkt auf körperliche Attribute angerechnet." The Trefferzonen
 * Manöver are what redirect it: Arme splits it "auf Fingerfertigkeit und
 * Stärke", Beine "auf Beweglichkeit und Stärke", and Kopf doubles it "nach der
 * Wiederstandsprobe". Torso — the Stelle of every attack that announced
 * nothing — takes it on Stärke, and Stärke at zero is death, which is why a
 * Standardangriff kills and the Ansage is the way *not* to: "jemandem in die
 * Brust zu schießen ist zwar gut um ihn zu töten, aber was, wenn du jemanden
 * nur entwaffnen oder an der Flucht hindern willst".
 *
 * `split` marks the two zones whose damage is shared — "die (aufgerundete)
 * Hälfte … und die (abgerundete) Hälfte" — though nothing halves anything yet:
 * a failed resistance roll costs "Schaden in Höhe des verwendeten Schadenswert
 * **als Würfel**", and which dice those are is not written anywhere in the
 * rules. Until it is, the Stelle can say where damage lands and at what
 * multiple, but not how much.
 *
 * The rule is fully determined by the Stelle, which is why an attack announces
 * the location and never the rule.
 * @type {Object<string, {attributes: Array<string>, split: boolean, multiplier: number}>}
 */
export const DAMAGE_RULES = {
  torso: { attributes: ['str'], split: false, multiplier: 1 },
  head: { attributes: ['str'], split: false, multiplier: 2 },
  arms: { attributes: ['fin', 'str'], split: true, multiplier: 1 },
  legs: { attributes: ['dex', 'str'], split: true, multiplier: 1 },
};

/**
 * What the attacker has to tell the defender, reduced to numbers.
 *
 * This is the whole of the A→B channel, and it is deliberately tiny: a penalty
 * per defence, a Stelle, and whether the armour there is bypassed. The defender
 * needs none of the attacker's stats to use it, and the attacker needed none of
 * the defender's to produce it.
 *
 * The **declared Betrag** is what lands, never the cost — the 2:1 surcharge past
 * the rank is the declarer's own problem.
 *
 * @param {Array<{key: string, betrag: number}>} declared  Priced Ansagen.
 * @returns {{parry: number, dodge: number, resistance: number, zone: string, bypassArmor: boolean}}
 */
export function ansageEnvelope(declared) {
  const envelope = { parry: 0, dodge: 0, resistance: 0, zone: DEFAULT_ZONE, bypassArmor: false };

  for (const entry of declared ?? []) {
    const maneuver = MANEUVERS[entry.key];
    if (!maneuver) continue;
    for (const target of maneuver.affects ?? []) envelope[target] += entry.betrag;
    // One Stelle per attack — the zone group is what enforces it, so nothing a
    // dialog produces reaches this line twice. If two ever arrive, the last one
    // wins: there is no summing two locations into a third.
    if (maneuver.zone) envelope.zone = maneuver.zone;
    if (entry.key === 'bypassArmor') envelope.bypassArmor = true;
  }

  return envelope;
}

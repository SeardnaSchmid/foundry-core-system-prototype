// The Haltung read layer is shared by the character sheet's banner, its picker
// and the combat tracker's rows, and the whole reason it was lifted out of the
// sheet is that all three have to fall back the same way. That fallback is what
// this suite holds: an actor whose stored key no longer exists, and an actor
// that has no `system.combat` at all — which every NPC in this system is
// (template.json gives the type no combat block).
globalThis.CONFIG = {
  TNO: {
    stances: {
      open: {
        label: 'TNO.Combat.Stance.Open',
        effect: 'TNO.Combat.StanceEffect.Open',
        icon: 'fa-person',
        group: 'base',
        defenses: [],
      },
      simpleMove: {
        label: 'TNO.Combat.Stance.SimpleMove',
        effect: 'TNO.Combat.StanceEffect.SimpleMove',
        icon: 'fa-person-walking',
        group: 'movement',
        defenses: ['parry', 'dodge'],
      },
      inCover: {
        label: 'TNO.Combat.Stance.InCover',
        effect: 'TNO.Combat.StanceEffect.InCover',
        icon: 'fa-shield-halved',
        group: 'combat',
        defenses: ['dodge'],
      },
    },
    stanceGroups: [
      { key: 'base', label: 'TNO.Combat.StanceGroup.Base' },
      { key: 'movement', label: 'TNO.Combat.StanceGroup.Movement' },
      { key: 'combat', label: 'TNO.Combat.StanceGroup.Combat' },
      { key: 'recovery', label: 'TNO.Combat.StanceGroup.Recovery' },
    ],
    defaultStance: 'open',
  },
};
globalThis.game = { i18n: { localize: (key) => key } };

import { describe, expect, it } from 'vitest';

const { actorStance } = await import('../../module/helpers/combat-actions.mjs');
const { stanceEntry, stancePopoverGroups } = await import('../../module/helpers/stances.mjs');

describe('stanceEntry', () => {
  it('reads a Haltung out as label, icon, effect and permitted defences', () => {
    expect(stanceEntry('simpleMove')).toEqual({
      key: 'simpleMove',
      group: 'movement',
      label: 'TNO.Combat.Stance.SimpleMove',
      icon: 'fa-person-walking',
      effect: 'TNO.Combat.StanceEffect.SimpleMove',
      defenses: 'TNO.Combat.Parry · TNO.Combat.Dodge',
    });
  });

  it('carries the band, which is what the tracker colours a row by', () => {
    // Nine names down a narrow sidebar are read one at a time; four bands are
    // read at a glance. The chip is keyed by this rather than by the stance.
    expect(stanceEntry('inCover').group).toBe('combat');
    expect(stanceEntry('open').group).toBe('base');
    // Including through the fallback, or an unknown key would get no colour.
    expect(stanceEntry('retiredStance').group).toBe('base');
  });

  it('names the one defence a Haltung permits', () => {
    expect(stanceEntry('inCover').defenses).toBe('TNO.Combat.Dodge');
  });

  it('says so rather than nothing when a Haltung permits no defence', () => {
    expect(stanceEntry('open').defenses).toBe('TNO.Combat.StanceDefenseNone');
  });

  it('falls back to the default Haltung for a key the config no longer has', () => {
    expect(stanceEntry('retiredStance').key).toBe('open');
    expect(stanceEntry(undefined).key).toBe('open');
  });

  it('falls back for an actor with no combat block, which is every NPC', () => {
    // The tracker draws NPC rows too, and `system.combat` is character-only.
    expect(stanceEntry(actorStance({ type: 'npc', system: {} })).key).toBe('open');
    expect(stanceEntry(actorStance(null)).key).toBe('open');
  });
});

describe('stancePopoverGroups', () => {
  it('groups the Haltungen into the bands the config declares, in order', () => {
    const groups = stancePopoverGroups('open');
    expect(groups.map((group) => group.label)).toEqual([
      'TNO.Combat.StanceGroup.Base',
      'TNO.Combat.StanceGroup.Movement',
      'TNO.Combat.StanceGroup.Combat',
    ]);
  });

  it('drops a band that holds no Haltung', () => {
    // Recovery is declared but empty in this fixture; an empty heading in the
    // picker would be a band the player can never choose from.
    expect(stancePopoverGroups('open').some((group) => group.stances.length === 0)).toBe(false);
  });

  it('marks the Haltung in force, resolving an unknown key first', () => {
    const selected = (current) =>
      stancePopoverGroups(current)
        .flatMap((group) => group.stances)
        .filter((stance) => stance.selected)
        .map((stance) => stance.key);

    expect(selected('inCover')).toEqual(['inCover']);
    expect(selected('retiredStance')).toEqual(['open']);
  });
});

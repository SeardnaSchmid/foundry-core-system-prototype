# Standalone Combat Roll Workflows

**Status:** Implemented
**Scope:** Weapon Attack, weapon Parry, and character Dodge rolls

## Purpose

These are independent checks. They do not select or store targets, invoke
another workflow, resolve armour or damage, or require information supplied by
an attacker or defender.

## Attack

An owned weapon rolls its locked WA plus the actor's current rank in the
weapon's FV skill. The FV rank authored on the item is a requirement only.

- Compare weapon SV with the actor's base Strength.
- Failing FV, SV, or both applies exactly one `−3` requirement malus.
- Apply active Handhabung.
- A melee weapon requires a selected direct DK difference from `−6` through
  `+6`; that number is applied directly.
- A ranged weapon requires a selected authored range band. Null/blank bands
  cannot be selected; its authored numeric modifier is applied directly.

## Defence

**Parry** is an owned-melee-weapon check: locked WA + current FV-skill rank +
passive Handhabung + the one combined FV/SV malus. It has no DK or range
modifier.

**Dodge** is current Dexterity + current Acrobatics rank. If the existing worn
armour SV requirement is not met, it has one `−3` armour-SV malus.

## Shared roll behavior

All three workflows retain the normal editable situational modifier,
advantage/disadvantage picker, and Idea option. Selected attack context is a
signed immutable component in the live threshold, chat breakdown, and message
flags.

## Deferred

Targets, combatant state, stances, repeated-defence penalties, action economy,
automatic hand-offs, armour, hit location, resistance, damage, ammunition,
readying, manoeuvres, and chat-card resolution chains are outside this scope.

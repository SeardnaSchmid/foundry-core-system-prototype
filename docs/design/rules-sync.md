# Rules sync

The rules live in `rules/wiki/`, mirrored from the live wiki by
`npm run rules:fetch`; every fetch with a content change adds an entry at the
top of `rules/CHANGELOG.md`. This page records how far those entries have been
checked against the system, and what they left open.

**Checked through:** *2026-10-04 · Abruf 09:15 UTC* in `rules/CHANGELOG.md`

## How to sync

After a fetch, before any other work:

1. Read every `rules/CHANGELOG.md` entry newer than *Checked through*. When an
   entry is unclear, read the commit's diff (`git -C rules show <commit> -- wiki`).
2. Check each change against the code, the gear compendium (`src/packs/`) and
   `docs/design/`.
3. Add every difference to *Open* below, with the entry's date. Delete a row
   only once the change ships.
4. Where the wiki contradicts itself, or has applied a change only in part, add
   it to *Waiting on the wiki* instead, and change nothing until the wiki is
   consistent. Recheck those rows on every sync and delete the ones the wiki
   has settled.
5. Move *Checked through* to the newest entry.

Only what the system has to change goes in here. Don't restate the rule; name
the entry and the wiki page, which stay the source.

## Open

| Since | Wiki page | Change | Where the system still differs |
|---|---|---|---|
| 2026-10-04 | Waffen | A weapon may name two WA + WF pairs (Standardausrüstungs-Dao: Stärke + Raufen / Stärke + Schwerter) | a weapon stores one `wa` and one `wf` — **ask before changing** |
| 2026-10-03 | Waffen | Imperial weapons rebalanced, Bian and Riot-Chui added | not in the gear compendium |
| 2026-10-04 | Waffen | Unbewaffnet: Stärke + Raufen, HH 3/3 (2026-10-03) | pack `weapons-unbewaffnet.yml`: HH 1/1 |
| 2026-10-04 | Waffen | Tool damage: Steinfräse WS 1, Handkettensäge and Kettensäge WS 2, Lasso SS 1 | pack values still the old ones |
| 2026-10-04 | Waffen | New tables: Einfache Nahkampfwaffen, Schwerter, Schwere Nahkampfwaffen; Standes-Bian, Garde-Guandao | not in the gear compendium |

## Waiting on the wiki

Contradictions or half-applied changes in the wiki itself, last checked on
2026-10-04. The system keeps its current behaviour until the wiki settles them.

| Since | Wiki page | Contradiction | What the system does meanwhile |
|---|---|---|---|
| 2026-10-03 | Kampfregeln, Abgeleitete Kampfwerte | Angriffs- and Paradewert still subtract "SV/FV Mali", though FV is gone from the weapon legend and every table | follows the weapon legend: no FV |
| 2026-10-03 | Waffen | The melee legend says HH 0 … +3, but *Werkzeuge als Waffen* still lists negative HH (Messer, Sägen, Lasso, Kette) and the ranged legend still says −3 … +3. The tables added since all stay within 1 … 3 | `GEAR_NUMBER_BOUNDS` keeps −3 … +3; the packs keep the tool HH as listed |
| 2026-10-04 | Kampfregeln (damage table), Rüstung (RH legend) | Both still say "Rüstungsdurchdringung", while the weapon legend and every table call it RB | one value, `rb` |
| 2026-10-04 | Waffen, Fertigkeiten | The tables name "Marksman" (24 rows) and "Schwere Nahkampfaffen" (7 rows); the skill list has Scharfschütze and Schwere Nahkampfwaffen. The list also spells "Slight of Hand" | maps to the skill list: `sniper`, `heavyMelee` |
| 2026-10-04 | Waffen | Ketten-Lun has a row but no values | not in the compendium |

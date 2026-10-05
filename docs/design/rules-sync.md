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
| 2026-10-05 | Grundregeln | *Wurf* succeeds when the die is "niedriger als der Schwellenwert"; the worked example says "kleiner oder gleich" | follows the example: `≤` |
| 2026-10-05 | Grundregeln | "Jede Anwendung außer 'Fehler Analysieren' kostet genau einen Vorrat", and an empty pool allows nothing but Fehler Analysieren; *Problem lösen kombinieren* treats Fehler finden as free ("warum solltest du einen Punkt ausgeben, wenn du dir auch einfach Zeit lassen kannst?") | Fehler finden is free and offered with an empty pool |
| 2026-10-05 | Grundregeln | Fehler Analysieren costs the XP "nur bei erfolgreichem Wurf"; *Problem lösen und Erfahrung* forfeits it for every action "egal ob letztendlich erfolgreich oder nicht" | forfeits the XP claim on use, win or lose |
| 2026-10-05 | Attribute, Kampfregeln | *Schaden und Attribute* books damage directly onto the physical attributes; *Schaden und Zustände* counts it in two pools against thresholds | two pools, attributes untouched |

## Questions for the author

Rulings the system had to make where the wiki is silent. They stay as they are
until the author answers; then the answer goes into the wiki and the row goes.

| Since | Wiki page | Question | What the system does meanwhile |
|---|---|---|---|
| 2026-10-05 | Kampfregeln (*Gezielte Angriffe / Schüsse*: Rüstung umgehen) | "ignoriere sie dafür": does that ignore the Unterkleidung too? Does the bypassed hit count as penetrating (SS)? Can a Stelle covered only by Unterkleidung be bypassed at all? | Unterkleidung RW stays; the hit takes SS; no bypass on Unterkleidung alone |
| 2026-10-05 | Kampfregeln (*Schaden und Zustände*) | The damage malus applies "auf alle Würfe" — also to 6. Sinn and to the Fehler-Analysieren roll? | both roll without the damage malus |
| 2026-10-05 | Grundregeln (*Problem lösen – Idee haben*) | Is Idee haben spent before the roll, or may it be added after the dice have fallen? | before the roll only: a toggle in the roll dialog |
| 2026-10-05 | Charakterentwicklung (*Startfertigkeiten*), Fertigkeiten | Which skills may take the 120 starting XP? The wiki names no list | every skill except the five Interfacing skills, whose rules are unwritten |

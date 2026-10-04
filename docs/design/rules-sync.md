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
4. Move *Checked through* to the newest entry.

Only what the system has to change goes in here. Don't restate the rule; name
the entry and the wiki page, which stay the source.

## Open

| Since | Wiki page | Change | Where the system still differs |
|---|---|---|---|
| 2026-10-03 | Kampfregeln, Waffen | FV removed: no minimum rank, no FV malus; a weapon names WA + WF | `fv.rank` and `fvMalus` (`module/helpers/items.mjs`, `module/helpers/combat-actions.mjs`); combat PRD *Maluses*; pack weapons still carry `fv.rank` |
| 2026-10-03 | Kampfregeln, Waffen | The Raufen stand-in is gone: Raufen is an ordinary WF that a weapon names. A weapon may name two (Standardausrüstungs-Dao: Stärke + Raufen / Stärke + Schwerter) | combat PRD *Maluses* still states the stand-in; a weapon stores one `fv.skill` |
| 2026-10-03 | Kampfregeln, Abgeleitete Kampfwerte | Angriffs- and Paradewert still subtract "SV/FV Mali" — leftover in the wiki, FV no longer exists | nothing to change; follow the weapon legend |
| 2026-10-03 | Kampfregeln, Waffenwerte | HH range is now 0 … +3, but the tables still list negative values | `GEAR_NUMBER_BOUNDS` allows −3 … +3 — **ask before changing** |
| 2026-10-03 | Waffen | Imperial weapons rebalanced, Bian and Riot-Chui added | not in the gear compendium |
| 2026-10-04 | Waffen | Unbewaffnet: Stärke + Raufen, HH 3/3 (2026-10-03) | pack `weapons-unbewaffnet.yml`: HH 1/1, `fv.rank` 1 |
| 2026-10-04 | Waffen | Tool damage: Steinfräse WS 1, Handkettensäge and Kettensäge WS 2, Lasso SS 1 | pack values still the old ones |
| 2026-10-04 | Waffen | New tables: Einfache Nahkampfwaffen, Schwerter, Schwere Nahkampfwaffen; Standes-Bian, Garde-Guandao | not in the gear compendium |
| 2026-10-04 | `docs/design` | RD is RB everywhere (shipped in 0.48.0) | `character-sheet-prd.md` column list still names RD |

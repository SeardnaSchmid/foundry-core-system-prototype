# foundry-core-system-prototype
foundry-core-system-prototype

## Working title → finaler Name

„Trans-Neptunian Subjects" ist aktuell der Arbeitstitel (System-ID `tno`).
Der öffentlich sichtbare Name wird zentral über `title` in
[system.json](system.json) gesteuert — dort reicht eine Änderung.

Für eine vollständige Umbenennung (System-ID, Namespace, Dateien, Klassen)
müssen zusätzlich folgende Stellen angefasst werden:

- **`system.json`**: `id`, `title`, ggf. `manifest`/`download`-URLs
- **Dateien mit `tno` im Namen**: `module/tno.mjs`,
  `src/datamodels/module/tno.mjs`, `css/tno.css`,
  `src/scss/tno.scss`
- **Namespace/Klassen im Code**: `game.tno`, `TnoRollDialog` und
  weitere `Tno*`-Bezeichner — suchbar mit
  `grep -rli "tno" --include="*.mjs" --include="*.json" --include="*.css" --include="*.scss" --include="*.hbs" .`
- **Lokalisierung**: Schlüssel-Präfix `TNO` in `lang/en.json` und
  `lang/de.json`
- **CSS-Klassenpräfixe** in `css/tno.css`/`src/scss/` und den Templates
  (`templates/**/*.hbs`), die auf `tno-` beginnen
- **Foundry-Datenpfade** `systems/tno/...` in Templates/Manifest
- **package.json** / `package-lock.json` (Paketname)
- **`.claude/settings.local.json`** (lokaler Foundry-Symlink und Debug-Pfade)

Diese Umbenennung sollte in einem Schritt passieren, da bestehende
Foundry-Welten Daten unter dem `systems/tno/...`-Pfad und der System-ID
`tno` erwarten.

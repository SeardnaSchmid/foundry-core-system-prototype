# foundry-core-system-prototype
foundry-core-system-prototype

## Working title → finaler Name

„Edgefall" ist aktuell der Arbeitstitel (System-ID `edgefall`). Der öffentlich
sichtbare Name wird zentral über `title` in [system.json](system.json)
gesteuert — dort reicht eine Änderung.

Für eine vollständige Umbenennung (System-ID, Namespace, Dateien, Klassen)
müssen zusätzlich folgende Stellen angefasst werden:

- **`system.json`**: `id`, `title`, ggf. `manifest`/`download`-URLs
- **Dateien mit `edgefall` im Namen**: `module/edgefall.mjs`,
  `src/datamodels/module/edgefall.mjs`, `css/edgefall.css`,
  `src/scss/edgefall.scss`
- **Namespace/Klassen im Code**: `game.edgefall`, `EdgefallRollDialog` und
  weitere `Edgefall*`-Bezeichner — suchbar mit
  `grep -rli "edgefall" --include="*.mjs" --include="*.json" --include="*.css" --include="*.scss" --include="*.hbs" .`
- **Lokalisierung**: Schlüssel-Präfix `EDGEFALL` in `lang/en.json` und
  `lang/de.json`
- **CSS-Klassenpräfixe** in `css/edgefall.css`/`src/scss/` und den Templates
  (`templates/**/*.hbs`), die auf `edgefall-` beginnen
- **Foundry-Datenpfade** `systems/edgefall/...` in Templates/Manifest
- **package.json** / `package-lock.json` (Paketname)
- **`.claude/settings.local.json`** (lokaler Foundry-Symlink und Debug-Pfade)

Diese Umbenennung sollte in einem Schritt passieren, da bestehende
Foundry-Welten Daten unter dem `systems/edgefall/...`-Pfad und der System-ID
`edgefall` erwarten.

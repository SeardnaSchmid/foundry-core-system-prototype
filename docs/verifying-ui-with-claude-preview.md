# Verifying Sheet UI Changes with Claude Preview

This system isn't a normal web app with a `vite dev`/`next dev` server — the "app" is Foundry VTT itself, and the sheet only exists once a world is running and a user is logged in. This note documents the workflow used to verify CSS/template changes to the actor sheet (e.g. the `.solve-tile` alignment fixes) against a live, running Foundry instance instead of just reading the compiled CSS and hoping.

## 1. The launch config points at a running Foundry, not a dev server

`.claude/launch.json` doesn't start Foundry — it points `preview_start` at a small local redirect/proxy script that forwards to an already-running Foundry world (e.g. a "TNO Test" world on `localhost`). If that script or world isn't already up, `preview_start`/`preview_screenshot` will show Foundry's own "Join Game Session" screen instead of a sheet, which is expected, not a bug.

## 2. Logging in is a real Foundry login, scripted through `preview_fill`/`preview_click`

The join screen has a `<select>` of users. Read the options first (`preview_eval` → `Array.from(document.querySelector('select').options)`), pick a GM user by its option `value` (a Foundry user ID), `preview_fill` the select, then click the submit button. A "window too small" warning banner can appear (Foundry enforces a 1024×768 minimum) — it's cosmetic here and can be dismissed via `preview_eval` (`document.querySelector('.notification .close').click()`) or just ignored.

## 3. Opening the actor sheet: skip the UI, use the Foundry API directly

The sidebar/actor-directory UI is easy to miss with plain CSS-selector clicks (Foundry's DOM structure for the sidebar tabs isn't a simple `a[data-tab=...]`, and it changes between v11/v12/v13). It's much more reliable to open the sheet straight from the console via `preview_eval`:

```js
game.actors.getName('Lukas Brandt').sheet.render(true)
```

This is the single most useful trick in this whole workflow — it sidesteps needing to know Foundry's current sidebar markup at all.

## 4. `window.location.reload()` does not log you out, but it does close windows

After rebuilding CSS (`npm run build`) or a template edit, `preview_eval('window.location.reload()')` reliably picks up the new `css/tno.css`/`.hbs` output because Foundry's session cookie survives the reload. It does **not** re-open whatever sheet window was open before — re-run the `game.actors.getName(...).sheet.render(true)` snippet from step 3 after every reload.

## 5. Screenshots are good for "does this look right", not for "is this off by 2px"

For layout bugs like "these four numbers don't sit on the same line" or "there's a stray gap between the value and the label", a screenshot at native size is too small to eyeball reliably, and CSS `transform: scale(...)` on the element (via `preview_eval`) to zoom in for a screenshot is useful for a first look but still qualitative.

The precise version of the same check uses `preview_eval` to pull real numbers out of the DOM instead of pixels out of an image:

```js
// Compare the horizontal center of each tile's number:
Array.from(document.querySelectorAll('.solve-tile')).map(t => {
  const r = t.querySelector('.solve-tile-number').getBoundingClientRect();
  return (r.left + r.right) / 2;
});

// Compare where each tile's label starts vertically:
Array.from(document.querySelectorAll('.solve-tile-label')).map(l => l.getBoundingClientRect().top);

// Check how a wrapped label actually broke into lines (each line is its own
// ClientRect from a Range over the element's contents):
const r = document.createRange();
r.selectNodeContents(document.querySelector('.solve-tile-label'));
Array.from(r.getClientRects()).map(x => ({ left: x.left, top: x.top }));
```

This is what caught two real regressions in this session that a screenshot alone made easy to miss:
- A prefix/suffix character (`≤`, `+`, a unit label) pulling the *visual* center of a number off the tile's true center, even though the whole string was `text-align: center`.
- A later wording change (`"x max-rep"`) silently wrapping to 3 lines in a ~64px tile, which grew that one tile's row and knocked its label out of alignment with its siblings — visible in the numbers above but easy to miss at a glance in a screenshot, obvious immediately from comparing `getBoundingClientRect().top` across tiles.

## 6. Rebuild before reload

This repo compiles Sass by hand (`npm run build` → `sass src/scss/tno.scss css/tno.css`), there's no `sass --watch` wired into the preview flow. Edits to `.scss` files are invisible in the preview until `npm run build` runs and the page is reloaded. Template (`.hbs`) edits take effect on reload without a build step.

## Summary of the loop

1. Edit `.scss` / `.hbs`.
2. `npm run build` if `.scss` changed.
3. `preview_eval('window.location.reload()')`.
4. `preview_eval("game.actors.getName('<name>').sheet.render(true)")` to reopen the sheet.
5. `preview_eval` with `getBoundingClientRect()`/`getClientRects()` to get exact numbers, `preview_screenshot` (optionally after a temporary `transform: scale(...)` on the element in question) to sanity-check it visually.
6. Revert any temporary debug styling (`transform`, `outline`, etc.) applied via `preview_eval` — it's not persisted anywhere, but leaving it in place will confuse the next screenshot.

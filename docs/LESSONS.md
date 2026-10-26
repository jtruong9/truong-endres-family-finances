# Lessons (things that took more than two tries)

Format: **What didn't work / What worked / Note for next time.** Check here before similar work.

## Import tab: "Choose the account first" even though an account was chosen
- **What didn't work:** The first fix seemed to fail on retest because the browser was still running the cached old JS.
- **Cause:** Closing a Windows file dialog fires `window` `focus`. The app reloaded the data folder on focus and redrew the Import tab, replacing the account dropdown with a fresh blank one before the file input's `change` handler ran. Automated test tools don't fire that focus event, so tests missed it.
- **What worked:** `Store.reload()` redraws only when the event count changed. Focus-reload is skipped on tabs with forms (Import, Settings, Check-in, Goals, Rental, Bills) and while a dialog is open. `?v=N` cache-busting was added to every script and style link.
- **Note:** bump `?v=N` in `index.html` on every js/css change. When testing file pickers, also fire `window.dispatchEvent(new Event('focus'))`.

## Review queue: ✕ / ✓ buttons did nothing
- **Cause:** The Transactions list bound its row-click handler with `$("#tab-transactions tbody")`. Once the review table was added above it, that selector matched the *review* table's tbody, so the list's handler replaced the review handler.
- **What worked:** Give each table an id (`#tx-table`, `#review`) and bind to that.
- **Note:** never bind with a bare `tbody` or `table` selector inside a tab. Several tables can share a tab.

## Offline support: three problems found only by actually stopping the server
- **Page reloaded on first visit:** the `controllerchange` → reload handler also fired when the service worker took control for the first time, which would interrupt someone mid-setup. **Fix:** reload only after the user clicks "Update now".
- **A script was missing from the offline list:** `js/offline.js` wasn't in `sw.js`, so offline it failed to load. **Fix:** `tests/offline.test.js` checks that every file `index.html` loads is in the list with the same `?v=`.
- **Blank Dashboard on a remembered folder:** when the app reopens a remembered folder, data loads before `#app` is shown, and `render()` skips while hidden, so the first page stayed empty (offline made it obvious, but it could happen online too). **Fix:** `openApp()` builds the config and calls `render()` right after un-hiding.
- **Note:** test offline by really stopping the web server, not only by toggling `navigator.onLine`.

## Summary table hover looked broken
- **Cause:** the row hover set `background-color`, but spending cells used the `background` shorthand (shading) and the current month had its own background, so hovering lit up only some cells: a patchy, half-working highlight.
- **What worked:** cells keep their color in `background-image` layers (month tint, stacked under a hover overlay) and a plain `background-color` base, so hover adds one even layer on top of everything.
- **Note:** in tables with colored cells, never mix the `background` shorthand with hover rules that set `background-color`.

## Summary still scrolled sideways after the table was made to fit
- **Cause:** not the table. A CSS grid with `1.6fr 1fr` columns won't shrink below its content, so a chart canvas sized at a wider window held the page wide; and a headline-card sparkline (fixed 84px, `flex: none`) poked out of a narrow card.
- **What worked:** `minmax(0, …)` grid tracks + `min-width: 0` on cards and chart boxes; sparklines can shrink and are clipped to their box.
- **Note:** to find what widens a page, list elements whose `getBoundingClientRect().right > innerWidth` and walk up their parents.

## Compare years crashed with only one year of data
- **Cause:** The handler for the "average per month" checkbox ran even when that checkbox wasn't rendered.
- **Note:** guard optional controls (`const el = $(...); if (el) ...`).

## Testing an edit: the browser kept the old CSS
- **Cause:** the service worker serves files from its saved copy first. Editing a file without bumping `?v=N` means a browser that already has the app keeps the old version, even on reload.
- **Note:** after editing js/css, bump `?v=N` (index.html) and `VERSION` + the list in `sw.js` before testing, or unregister the service worker and clear `caches` in the test browser.

## Drag to reorder: nothing moved
- **Cause:** the pointer listeners were on the drag handle with `setPointerCapture`. Moving the row in the page (to show the new spot) drops pointer capture, so the handle stopped getting `pointermove` / `pointerup` after the first step.
- **Fix:** listen on `window` for `pointermove` / `pointerup` / `pointercancel`, filtered by `pointerId`. Test with real mouse moves, and scroll the rows into view first.

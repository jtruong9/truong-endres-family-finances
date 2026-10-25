# Decision log

Newest at the bottom. Format: **Decided / Why / Rejected**. Flag it before going against a logged decision.
Public file: no amounts, account details or other personal financial data.

## 2026-10 — Build our own app
- **Decided:** A custom web app instead of an off-the-shelf budgeting service. It replaces the owners' old Excel macro workbook.
- **Why:** The owners wanted their own tool, shaped around their joint-account setup, with the data kept in their own storage.
- **Rejected:** Off-the-shelf budgeting apps (subscription, third party holds the data). Patching the old macro workbook (desktop-Excel-only, can't be shared or edited by two people). A macro-free shared workbook (built and then dropped by the owners).

## 2026-10 — Platform: static site + Google Drive folder
- **Decided:** Static HTML/JS on GitHub Pages. Chrome's File System Access API reads and writes JSON files in a Google Drive for desktop folder that both owners share. Windows + Chrome, desktop only.
- **Why:** Nothing to install or host, the data never leaves the owners' Drive, and the folder picker requires https, which Pages provides.
- **Rejected:** A hosted site with a cloud database (data held by a third party; phones weren't needed). A Python desktop app (installs on each PC, and a shared database file over a sync service can corrupt). `file://` (the folder picker doesn't work there). localStorage only (data trapped in one browser).

## 2026-10 — Storage: one append-only event log per device
- **Decided:** Each computer writes only `ledger-<deviceId>.json` and reads everyone's. Changes are events (`tx`, `tx-del`, `cfg`); state = replay all events by timestamp, and the latest event wins per transaction id / config key.
- **Why:** Two people editing the same file through Drive sync creates conflict copies and lost edits. One writer per file can't conflict, and an event log merges edits and deletes cleanly.
- **Rejected:** One shared `data.json`.

## 2026-10 — Money model
- **Decided:** Paychecks land in a Joint Hub, which distributes to Joint Bills (recurring bills), each person's Personal account, and savings. Owner (joint / p1 / p2) lives on the account. Category kinds: Income / Savings / Expense / Transfer; transfers never count as income or spending.
- **Why:** Matches how the owners run their joint accounts. Putting the owner on the account means less typing and no mismatches.
- **Deferred:** Credit cards. Interim: the card is an account, purchases are expenses on it, and paying it off is a Transfer.

## 2026-10 — Look and feel
- **Decided:** Match the owners' old workbook. Barlow font (bundled). Charcoal `#3B3838` category bars with white bold underlined text. A color per month (JAN `#EF956D`, FEB `#9999FF`, MAR `#9DF1EF`, APR `#F95555`, MAY `#92D050`, JUN `#FFD966`, JUL `#FF9797`, AUG `#FFC000`, SEP `#00B0F0`, OCT `#9BC2E6`, NOV `#DA4E83`, DEC `#24908B`) with light tints down each column. Gray totals (`#BFBFBF` / `#E7E6E6` / `#D0CECE`). Remaining green `#C5E0B4` / red `#FF8585`.
- **Why:** The owners asked for it, and it makes each month easy to follow on a long table.

## 2026-10 — Vendored libraries
- **Decided:** Chart.js 4.4.7, SheetJS 0.18.5 and Barlow are copied into `vendor/`. No CDN at runtime.
- **Why:** Works offline and pins exact versions. Note: SheetJS 0.18.5 has a known prototype-pollution issue when parsing *untrusted* files. Acceptable here because users only open their own spreadsheets and bank CSVs.

## 2026-10 — Imports
- **Decided:** "Old Database (.xlsm)" import reads the old workbook's `Expense History` sheet (Month | Date | Description | Value | Category | Notes) into one chosen account; file names vary between the owners. Bank CSV imports go to a **To review** queue: nothing counts until a person confirms each row.
- **Why:** The owners want to look at every transaction themselves.
- **Rejected:** Importing bank rows straight into the ledger.

## 2026-10 — Review queue details
- **Decided:** Review rows keep the bank's direction (`dir: in|out`, positive `amount`). `Model.resolveReview` converts them on confirm (expense: out = positive, in = refund/negative; income: in = positive; transfer: stored from the sending account). Categories are **pre-filled as a guess** (CSV rules → that merchant's last category → transfer/payroll keywords) and shown in italics. **Possible duplicates** = a saved transaction touching the same account, same amount, within 4 days. Each saved one can explain only one row per account. The user removes duplicates with ✕.
- **Why:** Guesses save time but the person still looks at every row. Duplicate hints catch paychecks logged with "Distribute paycheck" and the other half of transfers seen on two statements.
- **Rejected:** Blank categories (slower), and automatic duplicate deletion (too risky).

## 2026-10 — Balances, goals, check-in, rental, compare
- **Balances:** each account gets a starting balance + date (the bank balance at the start of that day). Balances are only counted from that date, because older imported history mixed several real accounts under one app account. The monthly check-in stores `{account, date, bank, app}`.
- **Goals track by tag** (owners' choice). Savings goal: tagged savings and transfers add, tagged spending subtracts; with a due month it shows a per-month amount. Project budget: tagged spending vs. budget. *Rejected:* envelopes (extra buttons) and manual amounts (not linked to the data).
- **Check-in:** a guided monthly review (sort transactions → bank balances → bills → budgets → goals → mark done), stored in `cfg.checkins["YYYY-MM"]`.
- **Rental:** a transaction counts if its description contains the configured text **or** it carries the rental tag. Shows yearly/monthly income, expenses and net. Labelled "not tax advice".
- **Compare years:** category totals by year with % change; an "average per month" toggle makes the current partial year fair.
- **One-click bills:** "Log <month>'s bills" creates the unpaid recurring bills for the month (`t.bill` = bill name, which marks it paid).

## 2026-10 — Summary page gets a modern "fintech" look (changes the look-and-feel decision above)
- **Decided:** **Only the Summary page** drops the old-workbook styling. New look: white cards, a single blue accent, headline cards (Income / Spent / Saved / Remaining, with change vs. the same months last year and save rate), an income vs. spending chart, and a clean table. That table has a group header row with the group total, collapsible groups, a small trend sparkline per category, and a soft blue tint that's stronger for bigger amounts. Months keep **small color accents** (a thin bar in each month's old color on the header) and the current month is highlighted. Monospace-style tabular numbers.
- **Why:** The owners asked for the Summary to "look techy and new, not exactly like the old database". The other pages keep the old-workbook palette for now.
- **Rejected:** A dark dashboard and a terminal-style grid (the owners chose the clean light style). Full-column month tints (too close to the old sheet).
- **Revised (owners' request):** every month column is now **lightly tinted** in its month color, with the current month tinted stronger, outlined in a darker shade, and marked with a **NOW** chip above its name. Spending size moved from cell shading to a thin blue bar along the bottom of each cell, so it doesn't fight the month colors. Hover is one even row highlight drawn over the tints, plus an accent bar on the category name; the hovered column's month name is underlined.

## 2026-10 — Navigation: left pull-out menu instead of top tabs
- **Decided:** Pages are listed in a left sidebar, grouped as Everyday (Dashboard, Transactions, Summary, Check-in), Plan (Goals, Bills, Rental) and Data (Import, Settings, How to use). On wide windows it's docked, and ☰ shrinks it to an icon rail; that choice is remembered per computer in `localStorage` key `tf-menu-collapsed`. At ≤900px it's hidden and ☰ slides it out over the page; it closes on picking a page, clicking outside, or Esc. The top bar keeps ☰, the current page name, + Add, Distribute paycheck and ↻. The Transactions item shows a badge with the number of rows to review.
- **Why:** The owners asked for a pull-out menu on the left; ten tabs had outgrown the top bar.
- **Note:** buttons still use `#tabs [data-tab=…]`, so code that switches pages by clicking a tab keeps working.

## 2026-10 — Works offline (installable app)
- **Decided:** The app is an installable web app. A service worker (`sw.js`) saves a copy of every app file on first visit, and `manifest.webmanifest` + `icon.svg` let Chrome install it with its own icon. Page loads use the network when online (so updates arrive) and the saved copy when offline. Other files come from the saved copy first. A new version downloads in the background and the page shows "Update now"; it only reloads when the user clicks. The data still lives only in the Google Drive folder: nothing financial is cached by the service worker.
- **Why:** The owners want it to work with no internet. Data was already offline-capable (Drive for desktop keeps a local copy and uploads later); only the app files needed it.
- **Rejected:** A local copy of the app on each PC with a Python launcher (needs Python, manual file copying for every update, and a different site origin means re-picking the data folder).
- **Rule:** with every `?v=N` bump, bump `VERSION` and the file list in `sw.js`. `tests/offline.test.js` fails if they drift.

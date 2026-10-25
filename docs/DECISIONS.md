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
- **Fits the window (owners' request):** the category table no longer sits in its own scroll box. It uses a fixed layout that fills the card width; month cells show whole dollars (exact cents on hover); trend sparklines moved under each category name (hidden under 1200px); the Trend column was removed; the month header stays pinned under the top bar while scrolling the page. Checked with no sideways scroll and no clipped numbers from 1100px to 1920px wide (below about 1050px, collapse the menu).
- **Revised again:** the thin blue "how much was spent" bar was removed. The month tints, NOW chip and trend sparklines are enough.
- **Revised (owners' request):** every month column is now **lightly tinted** in its month color, with the current month tinted stronger, outlined in a darker shade, and marked with a **NOW** chip above its name. Spending size moved from cell shading to a thin blue bar along the bottom of each cell, so it doesn't fight the month colors. Hover is one even row highlight drawn over the tints, plus an accent bar on the category name; the hovered column's month name is underlined.

## 2026-10 — Navigation: left pull-out menu instead of top tabs
- **Decided:** Pages are listed in a left sidebar, grouped as Everyday (Dashboard, Transactions, Summary, Check-in), Plan (Goals, Bills, Rental) and Data (Import, Settings, How to use). On wide windows it's docked, and ☰ shrinks it to an icon rail; that choice is remembered per computer in `localStorage` key `tf-menu-collapsed`. At ≤900px it's hidden and ☰ slides it out over the page; it closes on picking a page, clicking outside, or Esc. The top bar keeps ☰, the current page name, + Add, Distribute paycheck and ↻. The Transactions item shows a badge with the number of rows to review.
- **Why:** The owners asked for a pull-out menu on the left; ten tabs had outgrown the top bar.
- **Note:** buttons still use `#tabs [data-tab=…]`, so code that switches pages by clicking a tab keeps working.

## 2026-10 — "Needs attention": flag problems, fix in bulk, or leave as is
- **Decided:** saved transactions with a problem are listed in a **⚠ Needs attention** panel at the top of Transactions, **grouped by problem**: unknown category (per name), no category, unknown account (per name), transfer with no To account, To account on a non-transfer, no date. Each group can be fixed at once (move to a category/account, add the unknown name as a new category/account, clear the To account). A row can also be clicked to fix it alone, or the group marked **Leave as is**. Rows in the list get an orange bar. The Dashboard shows a banner, the menu's Transactions badge turns orange and counts them, and the Summary's "Uncategorized / unknown" row links to the panel.
- **"Leave as is"** stores `ackIssues: ["code:value", …]` on each transaction. It hides only *that* problem; a different problem on the same row still shows. Editing a row drops marks for problems it no longer has. "Show them again" removes all marks. Rows in the review queue are never counted here.
- **Why:** imported history can carry old category names; the owners want to see and decide on every one rather than have the app guess.
- **Rejected:** auto-mapping old names to new categories (silent changes to history).

## 2026-10 — New category layout, applied to 2026 only
- **Decided (owners' choice: 2026 only):** groups are Income · Savings · **Home** (Rent, Utilities, Internet & Phone, Renters Insurance) · **Rental Property** (Rental Income, Rental Mortgage, Rental Repairs & Maintenance, Rental Utilities, Rental Insurance & Taxes) · Transportation (+ Car Maintenance & Fees, Rideshare & Transit) · **Food** (Groceries, Dining Out) · **Health & Care** (Doctor, Vet, Gym, Personal Care) · **Lifestyle** (Shopping & Clothes, Hobbies & Gear, Fun & Events, Gifts & Giving, Shared Costs, Subscriptions, Wedding) · Travel · Other (Fees, Misc). The old catch-all "Personal" is split up.
- **How:** Settings › *Reorganize 2026* lists every proposed move grouped "from → to". The owners untick or change any row before applying. Old categories stay in the list so 2021–25 still add up exactly. Unticked rows are remembered and not suggested again. The rental is identified by the Rental tab's text/tag, so no address lives in the code.
- **Facts from the owners:** the "House Repair – Venmo" payment was for the rental, and "Rental Insurance" in the old sheet is **renters insurance on the apartment** (goes to Home).
- **Summary:** a group holding both income and costs (Rental Property) shows its **net** (income − costs, labelled "net"), not the sum. Wedding/engagement costs also get a tag so Goals can track them.
- **Rejected:** re-sorting all years (the owners chose 2026 only), and splitting mortgage principal vs interest (not known yet).

## 2026-10 — Whole app: neutral minimal design (replaces the old-workbook palette)
- **Decided (owners' choice):** one design system for every page: white surfaces, hairline borders (no shadows or gradients), near-black text, a single blue accent used sparingly, Inter with tabular numbers, line icons (inline SVG) instead of text symbols/emoji, compact tables, short labels; long explanations live in How to use. The sidebar is white with a thin divider. The Summary keeps its month colors as a thin header bar + a very light column tint, and the current month keeps a "Now" marker.
- **Why:** the owners asked for "more modern and sleek, less like AI made it". The tells were emoji/text-symbol icons, paragraphs of hint text on every card, pill badges everywhere, and two competing styles (the workbook palette vs the Summary).
- **Supersedes:** the 2026-10 "Look and feel: match the owners' old workbook" decision (Barlow/charcoal). Barlow is no longer loaded.
- **Also:** hovering a number on the Summary's group rows or the Spent / Saved / Remaining rows outlines the cells it adds up (same column) and shows a small card listing each part and the total. Works for months, Year and Avg/mo; in mixed groups (Rental Property) and Remaining, costs show as minus. When a group is collapsed, its own row lights up instead of its categories. Zero cells are not outlined.
- **Labels after this change:** top bar = Install, Paycheck, Add, refresh icon; update bar = "A new version is ready · Update"; review rows use check / x icons. Older entries below may still use the previous names ("Distribute paycheck", "Update now", ☰, ✓/✕).

## 2026-10 — Works offline (installable app)
- **Decided:** The app is an installable web app. A service worker (`sw.js`) saves a copy of every app file on first visit, and `manifest.webmanifest` + `icon.svg` let Chrome install it with its own icon. Page loads use the network when online (so updates arrive) and the saved copy when offline. Other files come from the saved copy first. A new version downloads in the background and the page shows "Update now"; it only reloads when the user clicks. The data still lives only in the Google Drive folder: nothing financial is cached by the service worker.
- **Why:** The owners want it to work with no internet. Data was already offline-capable (Drive for desktop keeps a local copy and uploads later); only the app files needed it.
- **Rejected:** A local copy of the app on each PC with a Python launcher (needs Python, manual file copying for every update, and a different site origin means re-picking the data folder).
- **Rule:** with every `?v=N` bump, bump `VERSION` and the file list in `sw.js`. `tests/offline.test.js` fails if they drift.

## 2026-10 — One look for every page, matching the left menu (supersedes the Summary's own look and "other pages keep the old-workbook palette")
- **Replaced (2026-10-25):** this was made on another computer at about the same time as the neutral minimal redesign above. When the two met, the owner chose **neutral minimal**. Kept from this entry: `::file-selector-button { font: inherit }` and no rotated chart axis labels. Not kept: Barlow, the charcoal top bar, the Excel chart colors.
- **Decided (owners' choice: "lighter touch, keep month colors"):** Every page now shares the left menu's look. The top bar uses the same charcoal (`#2B2828`) as the menu and lines up with its brand row; its main button is white like the menu's current-page pill. Buttons, inputs, cards, tables and dialogs share one set of rules in `css/app.css`: 8px corners on controls, 10px on cards, hairline borders, no shadows or gradients, small uppercase gray table headings. The thick colored frames and caps became a 3px bar on the card's left edge, the same marker the menu uses for the current page. Main buttons are charcoal; the cyan accent is kept for focus rings, badges and that edge bar.
- **Kept from the old workbook:** the color per month, charcoal category bars, gray total rows, green/red "Remaining".
- **Summary:** same page background, colors and controls as everything else. Its charts and sparklines use the Dashboard's colors (income green, spending orange, saved blue; charcoal for the remaining line) instead of its own blue and purple. The small "SUMMARY" label above the title is gone because the top bar already names the page.
- **Font:** Barlow everywhere (text, buttons, inputs, tables, charts). The Summary's separate font (Inter) and its files were removed. Barlow 500 was added (`vendor/fonts/barlow-500.woff2`, same OFL license) for the in-between weight. Native "Choose File" buttons need `::file-selector-button { font: inherit }` or they fall back to the system font.
- **Why:** The owners wanted the whole app to look as modern and sleek as the menu, and not like a template.
- **Rejected:** A full redesign that also muted the month colors (the owners chose to keep them). A dark theme throughout (the owners rejected a dark dashboard earlier).
- **Not touched:** the left menu itself, layout, and all behavior.

## 2026-10 — Money flow page (diagram of where the money goes)
- **Decided (owners' choices):** a "Money flow" page in the menu under Overview. Four rows top to bottom: who earned it → the Joint Hub → the accounts it's split to (joint savings, joint bills, each person) → where it leaves them (bills paid, spending, saved). **Two views:** *Plan* (one paycheck each, prefilled from the last logged paycheck, split by Settings › Paycheck split) and *Actual month* (real transfers and spending that month). **Arrow width shows the amount** (square-root scale so small flows stay visible), with dots moving along each arrow; hovering a box highlights its arrows. Plain SVG drawn by `js/flow.js`, no library.
- **Why:** the owners wanted to see the whole paycheck → Hub → accounts flow at a glance, with motion.
- **Rejected:** same-width arrows with labels (have to read numbers to compare), stopping at the accounts row (the owners asked for the outflow row), plan-only or actual-only.
- **Rules:** whose income = a person's name in the description ("Paycheck – Kelly"), else the account owner. Income that lands outside the Hub is noted under the diagram. The accounts row always shows the usual accounts (joint savings, other joint, each person); other accounts only when money moved. Reduced-motion settings hide the dots.

## 2026-10 — Saving into Joint Savings counts as the payer's savings
- **Decided (owners' choice):** the owners keep all savings in Joint Savings (no separate personal savings). Money put into it is logged with a **Savings** category plus a **To account** ("Put into", e.g. Joint Savings). It counts as savings for whoever's account it came from (owner view, Dashboard, Summary) and, once, for the household; and it raises the To account's balance (`accountEffect`, `accountFlows`). Not flagged as "To account on a non-transfer". The add dialog fills Joint Savings in when the account is personal; the review queue offers the same picker for savings rows.
- **Paycheck split:** the Paycheck button now logs the share going into a savings-type account as **savings from the Hub** (so it counts as **joint** savings, the owners' choice), not as a transfer. Earlier paychecks logged as transfers stay as they were.
- **Why:** with one shared savings account, a personal view needs to show what each person saved; a Transfer never counts as saved.
- **Rejected:** treating any transfer into a savings account as saved (would show as one line, not by category, and every withdrawal would count as negative savings); only tracking each person's share on the Joint Savings card (Justin's own Saved total wouldn't move).

## 2026-10 — Joint view also shows savings put into Joint Savings
- **Decided (owners' choice):** savings someone puts into a joint account from a personal one count under that person **and** under Joint. In the Joint view only, the same amount also appears as income ("From Justin", tagged "put in"), because the paycheck behind it is counted under the person; without it Joint's Remaining would go negative by everything put in. Household counts it once. Implemented once in `Model.ownerParts` and used by `yearGrid`, `monthlyTotals` and `yearCompare`; the Transactions "Joint" filter lists those rows too. The "From …" rows are display-only (not saved as categories).
- **Rejected:** showing it under Joint with no matching income line (Joint's Remaining goes about −$19k for 2026), moving it to Joint only (Justin's Saved would drop to $0), leaving it as is.

## 2026-10 — Whose money: buttons with one color per view
- **Decided (owners' choice):** the Household / Joint / person filter on the Summary and Transactions is a row of buttons (`ownerTabs` in app.js), not a dropdown. The selected one is filled in that view's color: Household = ink, Joint = blue #2563EB, person 1 = green #059669, person 2 = purple #9333EA (palette validated: CVD and contrast pass). The Summary also names the view in a colored chip next to the title and puts a 3px bar in that color along the top of the headline numbers. Colors come from `[data-owner]` CSS variables (`--owner`, `--owner-bg`).
- **Rejected:** buttons without colors; keeping the dropdown with a "Viewing:" label.

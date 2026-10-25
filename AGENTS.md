# AGENTS.md: context for AI assistants working on Truong Finance

Read this first, then `docs/DECISIONS.md` (why things are the way they are) and `docs/LESSONS.md`
(mistakes not to repeat). `CLAUDE.md` points here, so Claude Code, Codex, Cursor and other tools
all get the same instructions.

> **This repository is PUBLIC.** It holds code and design notes only. Never commit anything that
> contains real financial data: transactions, balances, amounts, account numbers, bank or employer
> names tied to the owners, addresses, passwords, the `ledger-*.json` data files, or exported
> spreadsheets/CSVs. Use made-up examples ("GROCER #1234", "123 Main") in code, tests and docs.
> `.gitignore` blocks `*.json`, `*.xlsx`, `*.xlsm` and `*.csv`; don't weaken it.

## What this is

A household budgeting web app for a married couple, **Justin** (owner of the repo) and **Kelly**.
It is a static site (no build step, no server, no backend) served by GitHub Pages at
`https://jtruong9.github.io/truong-finance/`. It runs in **Chrome on Windows** (desktop only; no phones).
Data lives in a **Google Drive folder** the user picks with Chrome's folder picker.

## The people and how they work

- Both are non-developers in their daily use of this app. Explain in plain words, avoid jargon in UI text.
- Justin's standing preferences for AI help: **ask before assuming**, **simplest solution first**,
  **don't touch unrelated code**, **say when you're unsure**, show **2–3 options before big changes**,
  US spelling. Keep a decision log (here: `docs/DECISIONS.md`) and log approaches that took >2 tries
  (`docs/LESSONS.md`).
- Justin pushes to GitHub himself. Don't assume you can push. Commit with
  `jtruong9@users.noreply.github.com`, never a work address.

## Money model (the core idea; keep it intact)

```
Paychecks → Joint Hub → Joint Bills (all recurring bills)
                      → Justin Personal / Kelly Personal (each person's spending)
                      → Joint Savings
```
- Every account has an **owner**: `joint`, `p1` (Justin), `p2` (Kelly). "Whose spending" comes from
  the account, not from the transaction.
- Category **kind** is one of `Income | Savings | Expense | Transfer`. **Transfers never count as
  income or spending.** A transfer is stored once, from the sending `account` to `toAccount`.
- Transaction amounts: Expense/Savings positive = money spent/saved; negative = refund. Income positive.
- Credit cards: an account type; purchases are expenses on the card, paying the card is a Transfer.
  (The owners have not finalized how they want cards handled. Ask before changing this.)

## Architecture

| File | Role |
|---|---|
| `index.html` | Layout, menu, dialogs, script order. **Bump every `?v=N` after changing any js/css.** |
| `sw.js` + `manifest.webmanifest` + `js/offline.js` | Offline/installable app (service worker caches every app file; data is never cached). **Bump `VERSION` and the file list in `sw.js` with every `?v=N` bump.** `node tests/offline.test.js` enforces it. |
| `js/store.js` | Data layer. Folder handle in IndexedDB; append-only **event log per device** (`ledger-<deviceId>.json`); merges all ledger files. |
| `js/model.js` | **Pure** calculations (no DOM): config defaults, totals, flows, balances, goals, review-row resolution, guesses, duplicate matching, year compare, rental, budgets. Unit-tested. |
| `js/importers.js` | Old-spreadsheet (.xlsm) import, bank CSV parsing → review rows, Excel export. Uses SheetJS. |
| `js/app.js` | Startup, tab routing, Dashboard, Transactions list, add/edit dialog, spouse-name migration. |
| `js/help.js` | "How to use" tab: the user guide, written for Justin and Kelly. Update it when features change. |
| `js/review.js` | "To review" queue on the Transactions tab (bank rows waiting to be categorized). |
| `js/features.js` | Balances + bank check, Goals, Check-in, Rental, Compare years, one-click bill logging. |
| `js/app2.js` | Paycheck distribution, Summary (year report), Bills, Import tab, Settings. Calls `start()`. |
| `css/app.css` | Look and feel (matches the owners' old Excel workbook; see DECISIONS). |
| `vendor/` | Chart.js 4.4.7, SheetJS 0.18.5, Barlow font (OFL). Vendored on purpose: no CDN at runtime. |
| `tests/` | `node tests/model.test.js` and `node tests/offline.test.js`. Both must pass before committing. |

### Data format (`ledger-<deviceId>.json`)
```json
{ "app": "truong-finance", "version": 1, "device": "ab12cd34",
  "events": [ { "id": "uuid", "ts": 1730000000000, "dev": "ab12cd34", "type": "tx",     "data": { /* full transaction */ } },
              { "id": "uuid", "ts": 1730000000001, "dev": "ab12cd34", "type": "tx-del", "data": { "id": "tx-uuid" } },
              { "id": "uuid", "ts": 1730000000002, "dev": "ab12cd34", "type": "cfg",    "data": { "key": "accounts", "value": [] } } ] }
```
- Each device writes **only its own file**, so no two writers share a file and Drive sync never conflicts.
  State = replay all events from all files ordered by `ts`; the latest event per tx id / cfg key wins.
- Transaction fields: `id, date "YYYY-MM-DD", desc, amount, category, account, toAccount, notes, tags`
  (comma-separated), plus optional `review` (true = waiting in the queue, counts nowhere),
  `dir` ("in"/"out", review rows only), `guess`, `bankDesc`, `bill` (name of the recurring bill it pays).
- Config keys: `people, accounts, categories, recurring, split, rules, goals, rental, balanceChecks, checkins`.
  Defaults are in `Model.config()`.

## Rules for changing things

1. Keep `model.js` pure and add/extend tests in `tests/model.test.js` for any money logic.
2. Anything in the review queue (`t.review`) must stay out of every total. Use `Model.isPosted(t)`.
3. Don't add a build step, framework, server, or runtime CDN dependency without asking.
4. Don't change the money model, the event-log format, or the file-per-device rule without asking.
   Existing users' data folders must keep working (write a migration like `migrateSpouse()` if needed).
5. After any js/css change: bump `?v=N` in `index.html` **and** `VERSION` + file list in `sw.js`, then run `node tests/offline.test.js` (the offline cache otherwise keeps serving old code).
6. UI text is for non-technical users. Short, plain, no jargon. Update `js/help.js` to match.
7. Test in a real browser (serve the folder with `python -m http.server`; `file://` can't use the folder
   picker). Around file pickers, also fire `window.dispatchEvent(new Event('focus'))`: closing a real
   file dialog does that, and test tools don't.
8. Before committing, grep for personal data (see the top of this file).

## Open questions (ask the owners, don't decide)
- How credit cards should work (statement import vs. manual, payoff handling).
- Whether to add automatic bank syncing (paid aggregator, third-party access). Currently: no.

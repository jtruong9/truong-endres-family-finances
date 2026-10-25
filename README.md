# Truong Finance

A household budgeting app for Justin and Kelly, built around our joint account. It runs in Google Chrome, there's nothing to install, and your data stays in your own Google Drive folder.

**Money model:** every paycheck lands in the **Joint Hub**, which sends money to **Joint Bills** (all recurring bills), each person's **Personal** account, and savings. Money moved between your own accounts is a **Transfer**, which never counts as income or spending.

The **How to use** tab inside the app is the main guide for both of us. This file is the reference copy.

---

## One-time setup (each computer)

1. **Install Google Drive for desktop** (https://www.google.com/drive/download/) and sign in.
   Use your *personal* Google account, not a work one.
2. **Create the shared data folder** (one person does this once):
   - Open Google Drive in Chrome → New → New folder → name it `Truong Finance Data`.
   - Right-click the folder → Share → add Kelly's Google account as **Editor**.
   - On Kelly's computer: open drive.google.com → *Shared with me* → right-click the folder → **Organize → Add shortcut** → *My Drive*.
     Without this step the folder doesn't appear on her G: drive.
3. **Keep the folder available offline** (recommended): in File Explorer go to `G:\My Drive\Truong Finance Data` → right-click → **Offline access → Available offline**.
4. **Open the app** in Chrome: **https://jtruong9.github.io/truong-finance/**
   - Click **Choose data folder** and pick `G:\My Drive\Truong Finance Data`.
   - Chrome asks to let the site *view and edit files*. Click **Edit files** (and *Allow on every visit* if offered).
5. **Install it so it works offline:** with internet on, click **Install** in the top bar (or Chrome's menu ⋮ → *Cast, save and share* → **Install page as app**). Open it from the new Start-menu/desktop icon from then on.
   - It now opens and works **with no internet**. Anything you add while offline is saved to this computer, and Google Drive uploads it when you're back online (an **Offline** badge shows in the top bar when you're offline).
   - Updates download by themselves when you're online; click **Update** when the bar appears at the bottom.

If Chrome asks again after a restart, click **Reconnect**. That's Chrome confirming you still want the site to have folder access.

## Daily use

| To do this | Do this |
|---|---|
| Log a purchase | **Add** (or press **N**). Typing a description you've used before fills in its last category and account. |
| Log a refund | Add it with a **negative** amount in the original category. |
| Log and split a paycheck | **Paycheck** → enter net pay. It logs the paycheck in the Hub plus one transfer per account, using Settings → Paycheck split. |
| Move money yourself | Add a transaction with Category **Transfer**, the *from* account and a **To account**. |
| Import from your bank | Bank website → download the statement as **CSV** → Import tab → choose the account → pick the file → Preview → **Send to review**. Then sort every row on **Transactions › To review**; nothing counts until you confirm it. |
| Monthly money date | **Check-in** tab: sort transactions, check balances against the bank, bills, budgets, goals, mark done. |
| Savings goals / project budgets | **Goals** tab. Goals follow a tag you put on transactions. |
| Rental property | **Rental** tab: income, expenses and net per month and year. |
| Compare years | **Summary › Compare years**. |
| See where money went | **Summary**: choose the year and *Household / Joint / Justin / Kelly*. Averages divide by the months that have passed. |
| Check the bills | **Bills**: Paid / Due soon / Overdue for the month. |
| See what's left | Dashboard → *allowance left* cards, and Account flows. |
| Get the other computer's changes | They load automatically when you switch back to the window, or click **↻**. |

## First-time data load

- **Justin's history:** Import tab → **Old Database (.xlsm)** → account **Justin Personal** → choose the file.
- **Kelly's history:** the same steps on *her* computer, choosing her own old spreadsheet (whatever it's named) and account **Kelly Personal**.
- Then go to Settings → **Paycheck split** to set the default split.

## How the data is stored (and why it can't conflict)

- The folder holds one file per computer: `ledger-<id>.json`. **Each computer only writes its own file** and reads everyone's, so Google Drive never has two people editing the same file.
- Each file is a log of changes (add / edit / delete / setting). If both of you edit the *same* transaction, the later edit wins.
- **Backups:** Settings → *Download backup*. Google Drive also keeps old versions of each file: right-click → *File information → Manage versions*.
- **Don't** rename, edit or delete the `ledger-*.json` files by hand. Use the app.
- Clearing Chrome's data just means picking the folder again. Your data is in the folder, not in Chrome.

## Troubleshooting

- **"This browser can't open folders"**: use Chrome on Windows (Firefox and Safari don't support picking a folder).
- **The other person's entries don't show up:** wait for Drive to sync (check the Drive icon in the system tray), then click **↻**.
- **A row has a red bar on Transactions**: hover over it to see why (unknown category or account, or a transfer with no To account). Use the *Needs attention only* filter to see all of them.
- **Two computers show the same device id**: this happens if you copied Chrome's profile between them. Settings → *Use a different data folder* won't fix it; tell Justin.

## For Justin: updating the app

The app is static files (`index.html`, `css/`, `js/`, `vendor/`) on GitHub Pages. Edit, commit, push, and Pages updates in about a minute. Run the tests with `node tests/model.test.js`, `node tests/reorg.test.js` and `node tests/offline.test.js`.
Libraries are vendored: Chart.js 4.4.7, SheetJS 0.18.5, Barlow font (SIL Open Font License, `vendor/fonts/OFL.txt`).
After changing any app file, bump the `?v=N` numbers in `index.html` **and** `VERSION` + the file list in `sw.js` (the offline copy). `node tests/offline.test.js` checks they match.

**Working with an AI assistant:** start it in this folder. `AGENTS.md` (and `CLAUDE.md`, which points to it) gives any AI the project context, rules and architecture. `docs/DECISIONS.md` and `docs/LESSONS.md` are the shared memory. Ask the assistant to add to them, and never to put real financial data in this public repo.

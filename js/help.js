// "How to use" tab: plain-language guide for Justin and Kelly. Loaded after app.js.
"use strict";

function renderHelp() {
  const p1 = esc(CFG.people.p1), p2 = esc(CFG.people.p2);
  const p1Acct = esc((CFG.accounts.find((a) => a.owner === "p1") || { name: `${CFG.people.p1} Personal` }).name);
  const p2Acct = esc((CFG.accounts.find((a) => a.owner === "p2") || { name: `${CFG.people.p2} Personal` }).name);
  const step = (n, title, body) => `<div class="help-step"><div class="help-num">${n}</div><div><h3>${title}</h3>${body}</div></div>`;

  $("#tab-help").innerHTML = `
  <div class="help">
    <div class="card help-hero">
      <h2>How to use Truong Finance</h2>
      <p>A guide for ${p1} and ${p2}. Everything you enter is saved automatically to your shared Google Drive folder, and it shows up on the other person's computer too.</p>
      <div class="help-toc">
        <a href="#h-flow">How our money flows</a><a href="#h-first">First-time setup</a><a href="#h-daily">Everyday logging</a>
        <a href="#h-paycheck">Paychecks</a><a href="#h-import">Bank statements &amp; review</a><a href="#h-checkin">Monthly check-in</a>
        <a href="#h-read">Reading the numbers</a><a href="#h-moneyflow">Money flow</a><a href="#h-goals">Goals</a><a href="#h-bills">Bills</a><a href="#h-rental">Rental</a>
        <a href="#h-rules">Good habits</a><a href="#h-trouble">If something looks wrong</a>
      </div>
    </div>

    <div class="card" id="h-flow">
      <h2 class="cat-bar">How our money flows</h2>
      <div class="flow">
        <div class="flow-box in">Paychecks</div><div class="flow-arrow">&rarr;</div>
        <div class="flow-box hub">Joint Hub</div><div class="flow-arrow">&rarr;</div>
        <div class="flow-col">
          <div class="flow-box">Joint Bills <span>rent, utilities, insurance, subscriptions</span></div>
          <div class="flow-box">${p1Acct} <span>${p1}'s spending</span></div>
          <div class="flow-box">${p2Acct} <span>${p2}'s spending</span></div>
          <div class="flow-box">Joint Savings <span>shared savings</span></div>
        </div>
      </div>
      <ul>
        <li><b>Every paycheck goes into the Joint Hub</b>, then gets split out to the other accounts.</li>
        <li>Moving money between our own accounts is a <b>Transfer</b>. Transfers are never counted as income or spending, so nothing gets counted twice.</li>
        <li>Each account belongs to someone: <b>Joint</b>, <b>${p1}</b>, or <b>${p2}</b>. That's how the app knows whose spending is whose.</li>
      </ul>
    </div>

    <div class="card" id="h-first">
      <h2 class="cat-bar">First-time setup (each computer, once)</h2>
      ${step(1, "Open the app in Google Chrome", `<p>Go to <b>jtruong9.github.io/truong-finance</b> and bookmark it. It only works in <b>Chrome</b>.</p>`)}
      ${step(2, "Connect the shared folder", `<p>Click <b>Choose data folder</b>, then in the window go to <b>This PC &rsaquo; Google Drive (G:) &rsaquo; My Drive &rsaquo; Truong Finance Data</b>. Click the folder once and press <b>Select Folder</b> (bottom-right). When Chrome asks, click <b>Edit files</b>.</p>
        <p class="hint">${p2}: the folder is shared from ${p1}'s Google Drive. Open drive.google.com &rsaquo; <i>Shared with me</i> &rsaquo; right-click <b>Truong Finance Data</b> &rsaquo; <i>Organize &rsaquo; Add shortcut</i> &rsaquo; <i>My Drive</i>. Otherwise it won't show up on your G: drive.</p>`)}
      ${step(3, "Bring in your old spreadsheet", `<p>Go to the <b>Import</b> tab &rsaquo; <b>Old database</b>. Pick <b>your own</b> personal account (${p1} &rarr; <b>${p1Acct}</b>, ${p2} &rarr; <b>${p2Acct}</b>), then click <b>Choose File</b> and pick your old expense spreadsheet, whatever it's named. Check the preview and click <b>Import</b>.</p>`)}
      ${step(4, "If Chrome asks again later", `<p>Sometimes Chrome asks you to confirm folder access after a restart. Just click <b>Reconnect</b>. Nothing is lost.</p>`)}
      ${step(5, "Install it so it works without internet", `<p>With internet on, click <b>Install</b> in the top bar (or Chrome's menu <b>⋮</b> &rsaquo; <i>Cast, save and share</i> &rsaquo; <b>Install page as app</b>). Truong Finance gets its own icon in the Start menu and on the desktop. Open it from that icon from now on.</p>
        <p>After that it opens <b>even with no internet</b>. Everything you add while offline is saved to this computer; the <b>Offline</b> badge in the top bar just means Google Drive will upload it, and show it on the other computer, once you're back online.</p>
        <p class="hint">When an update is available you'll see <b>"A new version is ready"</b> at the bottom. Click <b>Update</b> any time.</p>`)}
      ${step(icon("menu"), "Getting around", `<p>Every page is in the <b>menu on the left</b>. Click the ${icon("menu")} button (top left) to shrink it to just icons and get more room, and click it again to bring the names back. In a small window the menu hides itself; click ${icon("menu")} to slide it out. The number on <b>Transactions</b> is how many rows are waiting for you (imported rows to sort, plus anything that needs attention).</p>`)}
    </div>

    <div class="card" id="h-daily">
      <h2 class="cat-bar">Everyday logging</h2>
      ${step(icon("plus"), "Add a purchase", `<p>Click <b>Add</b> in the top bar (or press the <b>N</b> key). Fill in:</p>
        <table class="help-table"><tbody>
          <tr><td>Date</td><td>When it happened (defaults to today)</td></tr>
          <tr><td>Amount</td><td>How much, e.g. <b>45.20</b></td></tr>
          <tr><td>Description</td><td>The store or what it was. Start typing a place you've used before and it fills in the rest.</td></tr>
          <tr><td>Category</td><td>Groceries, Gas, Food &amp; Drinks…</td></tr>
          <tr><td>Account</td><td>Which account paid. Usually your own personal account, or <b>Joint Bills</b> for a bill.</td></tr>
          <tr><td>Notes / Tags</td><td>Optional. Use tags like <b>wedding</b> or <b>honeymoon</b> to group a project.</td></tr>
        </tbody></table>
        <p>Click <b>Save</b>, or <b>Save &amp; add another</b> to enter several in a row.</p>`)}
      ${step("−", "Got a refund?", `<p>Add it with a <b>minus sign</b>, e.g. <b>-12.99</b>, in the same category as the original purchase. Don't change the original entry.</p>`)}
      ${step(icon("list"), "Fix or delete something", `<p>Go to <b>Transactions</b>, click the row, change it, and Save. To remove it, click the row and press <b>Delete</b>.</p>`)}
      ${step(icon("refresh"), "Move money between accounts", `<p>Add a transaction with Category <b>Transfer</b>. Account is where the money <b>left</b>, and <b>To account</b> is where it <b>went</b>.</p>`)}
    </div>

    <div class="card" id="h-paycheck">
      <h2 class="cat-bar">Paychecks</h2>
      ${step(1, "Log it with one button", `<p>Click <b>Paycheck</b> in the top bar. Enter the date, the <b>net pay</b> (what actually hit the bank) and whose paycheck it is.</p>`)}
      ${step(2, "Check the split and save", `<p>The window shows how much goes to Joint Bills, each personal account and savings. Click <b>Save</b>. The app logs the paycheck <i>and</i> every transfer for you.</p>`)}
      <p class="hint">The split is set once under <b>Settings &rsaquo; Paycheck split</b>. Fixed $ amounts and percentages come out first, and "Rest" divides whatever is left. Do the actual transfers in your bank as usual. This only records them.</p>
    </div>

    <div class="card" id="h-read">
      <h2 class="cat-bar">Reading the numbers</h2>
      <p><b>Dashboard</b>: this month at a glance. Income, spending, savings, what's left, and each person's <b>allowance left</b> (what was moved into your personal account minus what you've spent from it).</p>
      <p><b>Summary</b>: the whole year, every category month by month:</p>
      <div class="help-month-key">${Model.MONTHS.map((m, i) => `<span style="--mc:${Model.MONTH_COLORS[i][0]}">${m}</span>`).join("")}</div>
      <ul>
        <li>Each <b>month has its own color</b> (a thin bar on top and a faint tint down the column, the same colors as the old spreadsheet), so you can follow a month straight down the page. This month is marked <b>Now</b>.</li>
        <li>From 2026 on, categories are grouped as <b>Income, Savings, Home</b> (where you live), <b>Rental Property</b> (shown as a <b>net</b>: rent in minus its costs), <b>Transportation, Food, Health &amp; Care, Lifestyle, Travel</b> and <b>Other</b>. Older years keep their original groups.</li>
        <li>Each group has a <b>shaded row</b> with its total; click it to fold the group up. <b>Hover any number on a shaded row, or on Spent / Saved / Remaining at the bottom</b>, to see exactly what it adds up: the numbers it uses light up and a small list shows each one.</li>
        <li>Use <b>Year</b> to change years and <b>Owner</b> to see <b>Household</b> (everything), <b>Joint</b>, <b>${p1}</b> or <b>${p2}</b>.</li>
        <li><b>Avg/mo</b> divides by the months that have actually passed this year, not always 12.</li>
        <li><b>Remaining</b> at the bottom is green when you came out ahead and red when you spent more than came in.</li>
        <li><b>Account flows</b> shows money in and out of each account for one month. The Joint Hub should end near <b>$0</b> after a paycheck is split.</li>
        <li>Click <b>Compare years</b> at the top of the Summary to see every category year by year, with the % change from last year. Tick <i>average per month</i> so this year (not finished yet) compares fairly.</li>
      </ul>
    </div>

    <div class="card" id="h-moneyflow">
      <h2 class="cat-bar">Money flow</h2>
      <p>The <b>Money flow</b> page draws our money as boxes from top to bottom: paychecks &rarr; the <b>Joint Hub</b> &rarr; savings, bills and each personal account &rarr; where it leaves them. A <b>thicker arrow means more money</b>, and the moving dots show which way it goes. Hover a box to light up its arrows; hover an arrow for the exact amount.</p>
      <ul>
        <li><b>Plan</b>: type one paycheck each (it starts with your last logged paycheck) to see how it splits, using <b>Settings &rsaquo; Paycheck split</b>. Anything the split doesn't send out shows as "Stays in Joint Hub".</li>
        <li><b>Actual month</b>: what really moved that month, from saved transactions. Each account shows what came in and what's <b>left</b>, and the bottom row shows what was spent, saved or paid as bills. It fills in once paychecks are logged with the <b>Paycheck</b> button.</li>
      </ul>
    </div>

    <div class="card" id="h-import">
      <h2 class="cat-bar">Bank statements &amp; the review list</h2>
      <p>This is how we make sure we look at <b>every</b> transaction. Statement rows don't count anywhere until one of us sorts them.</p>
      ${step(1, "Download the statement as a CSV", `<p>On the bank's website, find <i>Download transactions</i> / <i>Export</i> and choose <b>CSV</b> for the month.</p>`)}
      ${step(2, "Import it", `<p><b>Import</b> tab &rsaquo; <b>Bank statement</b> &rsaquo; pick which account the statement is for &rsaquo; <b>Choose File</b> &rsaquo; <b>Preview</b>. Check the line that says how many rows are "money out" (purchases) vs "money in". If that looks backwards, flip the checkbox and preview again. Then <b>Send to review</b>.</p>`)}
      ${step(3, "Sort every row", `<p>Go to <b>Transactions</b>. The <b>To review</b> list is at the top. For each row:</p>
        <ul><li>Check the <b>category</b>. <span class="guess-key">Italic</span> means the app guessed from past transactions; change it if it's wrong.</li>
        <li>Money moved between our own accounts: choose <b>Transfer</b>, then pick the other account.</li>
        <li>Add a <b>tag</b> if it belongs to a goal or project (e.g. <i>honeymoon</i>).</li>
        <li>Click the ${icon("check")} button to confirm. It moves into the real list and starts counting.</li></ul>`)}
      ${step(icon("search"), "Watch for possible duplicates", `<p>Rows marked <span class="pill dup">possible duplicate</span> look like something already saved: for example a paycheck you logged with <b>Paycheck</b>, or the other half of a transfer from another account's statement. If it's the same money, remove it with the ${icon("x")} button so it isn't counted twice.</p>`)}
      ${step(icon("alert"), "Fix anything flagged", `<p>If saved transactions have a problem, a <b>Needs attention</b> box appears at the top of Transactions (and on the Dashboard). Fix each group, or choose <b>Leave as is</b> when it's fine.</p>`)}
      <p class="hint">Shortcuts: tick several rows and use <b>Set category on selected</b> / <b>Confirm selected</b>. Importing the same file twice is safe, since rows already imported are skipped. <b>Settings &rsaquo; Import rules</b> makes the guesses better (e.g. anything containing "SAFEWAY" = Groceries).</p>
    </div>

    <div class="card" id="h-checkin">
      <h2 class="cat-bar">Monthly check-in (our money date)</h2>
      <p>Once a month, ideally together, open the <b>Check-in</b> tab and work top to bottom (10–15 minutes):</p>
      <ol>
        <li><b>Sort every transaction</b>: import the month's statements and clear the review list.</li>
        <li><b>Check balances</b>: type each account's balance from the bank for the last day of the month. A check mark means the app matches. If it's off, something is missing or entered twice.</li>
        <li><b>Bills</b>: anything not paid?</li>
        <li><b>Budgets</b>: which categories went over?</li>
        <li><b>Goals</b>: are we on track?</li>
        <li><b>Mark the month done</b>, with a note if you like.</li>
      </ol>
      <p class="hint">Balance checks need each account's <b>starting balance</b> once: Settings &rsaquo; Accounts &rsaquo; <i>Starting balance</i> and <i>as of date</i> (e.g. the day the joint accounts opened). Old history from before that date isn't used for balances.</p>
    </div>

    <div class="card" id="h-goals">
      <h2 class="cat-bar">Goals</h2>
      <p>On the <b>Goals</b> tab, click <b>New goal</b>. Every goal follows a <b>tag</b>: put the tag on any transaction that belongs to it.</p>
      <ul>
        <li><b>Savings goal</b> (emergency fund, car, house, yearly car tabs): money you save or transfer with the tag adds up, and tagged spending takes away. With a "reach it by" date it tells you how much to save each month.</li>
        <li><b>Project budget</b> (a trip, a wedding, a remodel): adds up tagged spending against the budget and turns red if you go over.</li>
      </ul>
    </div>

    <div class="card" id="h-bills">
      <h2 class="cat-bar">Bills</h2>
      <p>On the <b>Bills</b> tab, list each recurring bill: name, category, which account pays it (normally <b>Joint Bills</b>), the amount and the day it's due. Click <b>Save bills</b>.</p>
      <p>Each month, click <b>Log … bills</b> to enter all of that month's bills in one step. Fixed amounts are filled in; type the amount for ones that vary.</p>
      <p>A bill shows <span class="pill Paid">Paid</span> once it's logged, <span class="pill Due">Due soon</span> in the 5 days before it's due, or <span class="pill Overdue">Overdue</span> after the due day. Unpaid bills also show on the Dashboard and in the Check-in.</p>
      <p class="hint">If you import the bank statement too, the bill will show as a <i>possible duplicate</i> in the review list. Remove it there.</p>
    </div>

    <div class="card" id="h-rental">
      <h2 class="cat-bar">Rental property</h2>
      <p>The <b>Rental</b> tab adds up everything for the rental: income, mortgage, repairs, utilities, and the net for each month and year. Set it up once by typing text that appears in its transactions (for example the street number) and Save. Anything that doesn't mention the property, like a repair paid by Venmo, can be tagged <b>${esc(CFG.rental.tag || "rental")}</b> instead.</p>
      <p class="hint">Useful at tax time, but ask your tax preparer what they need. This is a running total, not tax advice.</p>
    </div>

    <div class="card" id="h-rules">
      <h2 class="cat-bar">Good habits</h2>
      <ul>
        <li>Pick one way per account and stick to it: <b>import the statement</b> (and sort it), <b>or</b> type purchases in by hand. Doing both for the same account makes duplicates.</li>
        <li>Do the <b>Check-in</b> every month. The balance check is what catches mistakes.</li>
        <li>Always pick the account that <b>actually paid</b>. That's what keeps the his, hers and ours totals right.</li>
        <li>Don't open, rename or delete the <b>ledger-…json</b> files in the Drive folder. They are the app's data.</li>
        <li>Every few months: <b>Settings &rsaquo; Download backup</b>.</li>
      </ul>
    </div>

    <div class="card" id="h-trouble">
      <h2 class="cat-bar">If something looks wrong</h2>
      <table class="help-table"><tbody>
        <tr><td>The other person's entries aren't showing</td><td>Wait a minute for Google Drive to sync, then click the ${icon("refresh")} button in the top bar (right side).</td></tr>
        <tr><td>No internet</td><td>Keep working. Open the installed app from its icon; changes save to this computer and Google Drive uploads them once you're online again. The other person sees them after that.</td></tr>
        <tr><td>"Needs attention" on Transactions</td><td>Some saved transactions have a problem, like an <b>unknown category</b> (often an old name from the spreadsheet), no category, or a transfer with no To account. Each problem is listed with its transactions. Fix the whole group at once (pick the right category or account), click a transaction to fix it alone, or click <b>Leave as is</b> if it's fine. "Leave as is" can be undone with <i>Show them again</i>. The number on <b>Transactions</b> in the menu turns amber while any are left.</td></tr>
        <tr><td>A row is shaded amber</td><td>It's one of the "needs attention" transactions. Hover over it to see the problem.</td></tr>
        <tr><td>"This browser can't open folders"</td><td>Use <b>Google Chrome</b>, not Edge, Firefox or Safari.</td></tr>
        <tr><td>The page looks old after an update</td><td>Press <b>Ctrl + Shift + R</b> to reload the newest version.</td></tr>
        <tr><td>Anything else</td><td>Ask ${p1}.</td></tr>
      </tbody></table>
    </div>
  </div>`;

  $("#tab-help .help-toc").onclick = (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    document.querySelector(a.getAttribute("href")).scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

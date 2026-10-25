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
        <a href="#h-paycheck">Paychecks</a><a href="#h-read">Reading the numbers</a><a href="#h-bills">Bills</a>
        <a href="#h-import">Importing</a><a href="#h-rules">Good habits</a><a href="#h-trouble">If something looks wrong</a>
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
      ${step(3, "Bring in your old spreadsheet", `<p>Go to the <b>Import</b> tab &rsaquo; <b>Old Database</b>. Pick <b>your own</b> personal account (${p1} &rarr; <b>${p1Acct}</b>, ${p2} &rarr; <b>${p2Acct}</b>), then click <b>Choose File</b> and pick your old expense spreadsheet, whatever it's named. Check the preview and click <b>Import</b>.</p>`)}
      ${step(4, "If Chrome asks again later", `<p>Sometimes Chrome asks you to confirm folder access after a restart. Just click <b>Reconnect</b>. Nothing is lost.</p>`)}
    </div>

    <div class="card" id="h-daily">
      <h2 class="cat-bar">Everyday logging</h2>
      ${step("+", "Add a purchase", `<p>Click <b>+ Add</b> at the top (or press the <b>N</b> key). Fill in:</p>
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
      ${step("✎", "Fix or delete something", `<p>Go to <b>Transactions</b>, click the row, change it, and Save. To remove it, click the row and press <b>Delete</b>.</p>`)}
      ${step("⇄", "Move money between accounts", `<p>Add a transaction with Category <b>Transfer</b>. Account is where the money <b>left</b>, and <b>To account</b> is where it <b>went</b>.</p>`)}
    </div>

    <div class="card" id="h-paycheck">
      <h2 class="cat-bar">Paychecks</h2>
      ${step(1, "Log it with one button", `<p>Click <b>Distribute paycheck</b> at the top. Enter the date, the <b>net pay</b> (what actually hit the bank) and whose paycheck it is.</p>`)}
      ${step(2, "Check the split and save", `<p>The window shows how much goes to Joint Bills, each personal account and savings. Click <b>Save</b>. The app logs the paycheck <i>and</i> every transfer for you.</p>`)}
      <p class="hint">The split is set once under <b>Settings &rsaquo; Paycheck split</b>. Fixed $ amounts and percentages come out first, and "Rest" divides whatever is left. Do the actual transfers in your bank as usual. This only records them.</p>
    </div>

    <div class="card" id="h-read">
      <h2 class="cat-bar">Reading the numbers</h2>
      <p><b>Dashboard</b>: this month at a glance. Income, spending, savings, what's left, and each person's <b>allowance left</b> (what was moved into your personal account minus what you've spent from it).</p>
      <p><b>Summary</b>: the yearly sheet, laid out like the old spreadsheet:</p>
      <div class="help-month-key">${Model.MONTHS.map((m, i) => `<span style="background:${Model.MONTH_COLORS[i][0]}">${m.toUpperCase()}</span>`).join("")}</div>
      <ul>
        <li>Each <b>month has its own color</b>, the same colors as the old spreadsheet, so you can follow a month straight down the page.</li>
        <li>Categories are grouped under <b>dark headers</b> (INCOME, SAVINGS, BILLS…) with a gray <b>Total</b> row under each group.</li>
        <li>Use <b>Year</b> to change years and <b>Owner</b> to see <b>Household</b> (everything), <b>Joint</b>, <b>${p1}</b> or <b>${p2}</b>.</li>
        <li><b>Avg/mo</b> divides by the months that have actually passed this year, not always 12.</li>
        <li><b>Remaining</b> at the bottom is green when you came out ahead and red when you spent more than came in.</li>
        <li><b>Account flows</b> shows money in and out of each account for one month. The Joint Hub should end near <b>$0</b> after a paycheck is split.</li>
      </ul>
    </div>

    <div class="card" id="h-bills">
      <h2 class="cat-bar">Bills</h2>
      <p>On the <b>Bills</b> tab, list each recurring bill: name, category, which account pays it (normally <b>Joint Bills</b>), the amount and the day it's due. Click <b>Save bills</b>.</p>
      <p>Each month a bill shows <span class="pill Paid">Paid</span> once a matching transaction is logged, <span class="pill Due">Due soon</span> in the 5 days before it's due, or <span class="pill Overdue">Overdue</span> after the due day. Unpaid bills also show on the Dashboard.</p>
    </div>

    <div class="card" id="h-import">
      <h2 class="cat-bar">Importing from the bank</h2>
      ${step(1, "Download a CSV from your bank", `<p>On your bank's website, find <i>Download transactions</i> or <i>Export</i> and choose <b>CSV</b>.</p>`)}
      ${step(2, "Import it", `<p>Go to the <b>Import</b> tab &rsaquo; <b>Bank CSV</b> &rsaquo; pick the account it's from &rsaquo; <b>Choose File</b>. Check that the columns are matched right, then click <b>Preview</b>.</p>`)}
      ${step(3, "Review and import", `<p>Fix any categories in the preview, then click <b>Import</b>. Anything you've already entered is skipped automatically, so importing the same file twice is safe.</p>`)}
      <p class="hint">Tip: <b>Settings &rsaquo; CSV rules</b> can fill in categories for you (e.g. anything containing "SAFEWAY" = Groceries). Click <b>Suggest rules from my history</b> to get started.</p>
    </div>

    <div class="card" id="h-rules">
      <h2 class="cat-bar">Good habits</h2>
      <ul>
        <li>Log purchases at least <b>once a week</b>, or import the bank CSV.</li>
        <li>Once a month, compare each account's balance to the bank. It takes five minutes and catches mistakes.</li>
        <li>Always pick the account that <b>actually paid</b>. That's what keeps the his, hers and ours totals right.</li>
        <li>Don't open, rename or delete the <b>ledger-…json</b> files in the Drive folder. They are the app's data.</li>
        <li>Every few months: <b>Settings &rsaquo; Download backup</b>.</li>
      </ul>
    </div>

    <div class="card" id="h-trouble">
      <h2 class="cat-bar">If something looks wrong</h2>
      <table class="help-table"><tbody>
        <tr><td>The other person's entries aren't showing</td><td>Wait a minute for Google Drive to sync, then click the <b>&#x21bb;</b> button at the top right.</td></tr>
        <tr><td>A transaction has a red bar on its left</td><td>Something's missing: hover over it to see what. <b>Transactions &rsaquo; Needs attention only</b> lists them all.</td></tr>
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

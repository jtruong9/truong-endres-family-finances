// UI part 2: paycheck distribution, summary, bills, import, settings. Loaded after app.js.
"use strict";

// --------------------------------------------------------------------------------- paycheck
const dlgPay = $("#dlg-pay"), formPay = $("#form-pay");
function payPreview() {
  const amt = parseFloat(formPay.amount.value) || 0;
  const { transfers, leftover } = Model.distribute(CFG.split, amt);
  $("#pay-preview").innerHTML = CFG.split.length
    ? `<table><tbody>${transfers.map((t) => `<tr><td>${esc(formPay.account.value)} &rarr; ${esc(t.toAccount)}</td><td class="num">${money(t.amount, false)}</td></tr>`).join("")}
       <tr class="total"><td>Left in ${esc(formPay.account.value)}</td><td class="num ${leftover < 0 ? "neg" : ""}">${money(leftover, false)}</td></tr></tbody></table>`
    : `<p class="muted">No split set up yet: only the paycheck will be logged. Set one up under Settings &rsaquo; Paycheck split.</p>`;
  $("#pay-error").textContent = leftover < 0 ? "The fixed amounts add up to more than the paycheck." : "";
  return { transfers, leftover };
}
$("#btn-paycheck").onclick = () => {
  formPay.date.value = todayIso();
  formPay.amount.value = "";
  formPay.who.innerHTML = opts([["p1", CFG.people.p1], ["p2", CFG.people.p2]], "p1");
  const hub = CFG.accounts.find((a) => /hub/i.test(a.name)) || CFG.accounts[0];
  formPay.account.innerHTML = opts(CFG.accounts.map((a) => a.name), hub && hub.name);
  payPreview();
  dlgPay.showModal();
  formPay.amount.focus();
};
formPay.amount.oninput = payPreview;
formPay.account.onchange = payPreview;
$("#pay-cancel").onclick = () => dlgPay.close();
formPay.onsubmit = async (e) => {
  e.preventDefault();
  const amt = Model.r2(parseFloat(formPay.amount.value));
  if (!(amt > 0)) { $("#pay-error").textContent = "Enter the net pay."; return; }
  const { transfers, leftover } = payPreview();
  if (leftover < 0) return;
  const who = CFG.people[formPay.who.value];
  const date = formPay.date.value, from = formPay.account.value;
  const transferCat = (CFG.categories.find((c) => c.kind === "Transfer") || { name: "Transfer" }).name;
  const payCat = (CFG.categories.find((c) => c.name === "Paychecks") || CFG.categories.find((c) => c.kind === "Income")).name;
  const batch = [{ date, desc: `Paycheck – ${who}`, amount: amt, category: payCat, account: from, toAccount: "", notes: "", tags: "" },
    ...transfers.filter((t) => t.toAccount !== from).map((t) => ({ date, desc: `Paycheck split → ${t.toAccount}`, amount: t.amount, category: transferCat, account: from, toAccount: t.toAccount, notes: `from ${who}'s paycheck`, tags: "" }))];
  await Store.saveTxs(batch);
  dlgPay.close();
  toast(`Logged paycheck + ${batch.length - 1} transfer(s).`);
};

// --------------------------------------------------------------------------------- summary
function renderSummary() {
  const txs = Store.transactions();
  const grid = Model.yearGrid(CFG, txs, ui.year, ui.owner);
  const tot = Model.monthlyTotals(CFG, txs, ui.year, ui.owner);
  const n = Model.monthsElapsed(ui.year);
  const now = new Date();
  const curMonth = ui.year === now.getFullYear() ? now.getMonth() : -1;
  // Month cells take that month's color (header) or light tint (data), like the old spreadsheet.
  // Total/grand rows keep their gray so the group breaks stay obvious.
  const cell = (v, i, tinted) => `<td class="num${i === curMonth ? " cur" : ""}"${tinted ? ` style="background:${Model.MONTH_COLORS[i][1]}"` : ""}>${money(v)}</td>`;
  // Budget columns only appear once at least one category has a budget
  const showBudget = CFG.categories.some((c) => +c.budget > 0);
  const extra = showBudget ? 4 : 2;
  const row = (label, vals, cls = "", budget = null) => {
    const sum = vals.reduce((a, b) => a + b, 0), avg = sum / n;
    const has = budget != null && budget !== "" && +budget > 0;
    const tinted = cls === "";
    const isRem = cls.includes("remaining");
    const remCls = isRem ? (x) => (x > 0.005 ? " rem-pos" : x < -0.005 ? " rem-neg" : "") : () => "";
    return `<tr class="${cls}"><td class="sticky label">${esc(label)}</td>
      ${vals.map((v, i) => isRem ? `<td class="num${remCls(v)}${i === curMonth ? " cur" : ""}">${money(v)}</td>` : cell(v, i, tinted)).join("")}
      <td class="num year${remCls(sum)}"><b>${money(sum)}</b></td><td class="num year${remCls(avg)}">${money(avg)}</td>
      ${showBudget ? `<td class="num">${has ? money(+budget, false) : ""}</td>
      <td class="num ${has && avg > +budget ? "neg" : has ? "pos" : ""}">${has ? money(avg - budget, false) : ""}</td>` : ""}</tr>`;
  };
  // Dark category bar; the first group's bar sits right under the colored month header, so later
  // bars repeat the month names (small) to keep columns easy to follow on a long page.
  let firstGroup = true;
  const groupBar = (title) => {
    const months = firstGroup ? Model.MONTHS.map(() => `<td></td>`).join("")
      : Model.MONTHS.map((m, i) => `<td class="mh" style="background:${Model.MONTH_COLORS[i][0]}">${m.toUpperCase()}</td>`).join("");
    firstGroup = false;
    return `<tr class="group"><td class="sticky">${esc(title)}</td>${months}<td colspan="${extra}"></td></tr>`;
  };
  let body = "";
  const seen = new Set();
  for (const g of CFG.groups) {
    const cats = CFG.categories.filter((c) => c.group === g && c.kind !== "Transfer");
    const withData = cats.filter((c) => (grid.get(c.name) || []).some((v) => v !== 0) || +c.budget > 0);
    if (!withData.length) continue;
    body += groupBar(g.toUpperCase());
    const sub = Array(12).fill(0);
    for (const c of withData) {
      const vals = grid.get(c.name) || Array(12).fill(0);
      seen.add(c.name);
      vals.forEach((v, i) => (sub[i] += v));
      body += row(c.name, vals, "", c.budget);
    }
    body += row(`Total ${g}:`, sub.map(Model.r2), "total");
    body += `<tr class="gap"><td colspan="${13 + extra}"></td></tr>`;
  }
  const unknown = [...grid.keys()].filter((k) => !seen.has(k));
  if (unknown.length) {
    body += groupBar("UNCATEGORIZED / UNKNOWN");
    for (const k of unknown) body += row(k || "(blank)", grid.get(k));
    body += `<tr class="gap"><td colspan="${13 + extra}"></td></tr>`;
  }
  body += row("Total Monthly Spent:", tot.spending, "grand") + row("Total Saved:", tot.savings, "grand") + row("Total Remaining:", tot.remaining, "grand remaining");

  $("#tab-summary").innerHTML = `
    <div class="card"><div class="row">
      <h2 class="sheet-title">${ui.year} EXPENSE REPORT</h2>
      <label>Year <select id="sm-year">${opts(years().map(String), String(ui.year))}</select></label>
      <label>Owner <select id="sm-owner">${opts(ownerChoices(), ui.owner)}</select></label>
      <span class="spacer"></span><button id="sm-export">Export to Excel</button></div>
      <p class="hint" style="margin:6px 0 0">Averages divide by ${n} month(s). Transfers between your own accounts are left out. Budgets are set under Settings &rsaquo; Categories.${curMonth >= 0 ? ` The outlined column is the current month.` : ""}</p>
    </div>
    <div class="card"><div class="table-wrap summary"><table>
      <thead><tr><th class="sticky">Category</th>${Model.MONTHS.map((m, i) => `<th class="num mh" style="background:${Model.MONTH_COLORS[i][0]}">${m.toUpperCase()}</th>`).join("")}<th class="num">Year Total</th><th class="num">Avg / Month</th>${showBudget ? `<th class="num">Budget</th><th class="num">Avg − Budget</th>` : ""}</tr></thead>
      <tbody>${body}</tbody></table></div></div>
    <div class="card"><div class="row"><h2>Account flows</h2>
      <label>Month <select id="sm-month">${opts(Model.MONTHS.map((m, i) => [String(i), m]), String(ui.flowMonth))}</select></label></div>
      ${flowsTable(Model.accountFlows(CFG, txs, ui.year, ui.flowMonth))}</div>`;
  $("#sm-year").onchange = (e) => { ui.year = +e.target.value; renderSummary(); };
  $("#sm-owner").onchange = (e) => { ui.owner = e.target.value; renderSummary(); };
  $("#sm-month").onchange = (e) => { ui.flowMonth = +e.target.value; renderSummary(); };
  $("#sm-export").onclick = () => Importers.exportXlsx(CFG, Store.transactions(), `Truong_Finance_${todayIso()}.xlsx`);
}

// --------------------------------------------------------------------------------- bills
function renderBills() {
  const y = new Date().getFullYear();
  const st = Model.recurringStatus(CFG, Store.transactions(), y, ui.billMonth);
  const rec = CFG.recurring;
  const fixed = rec.reduce((s, b) => s + (+b.amount || 0), 0);
  $("#tab-bills").innerHTML = `
    <div class="card"><div class="row"><h2>Recurring bills</h2>
      <label>Month <select id="bl-month">${opts(Model.MONTHS.map((m, i) => [String(i), `${m} ${y}`]), String(ui.billMonth))}</select></label>
      <span class="muted">Fixed bills total ${money(fixed, false)}/month.</span></div>
      <p class="hint">"Paid" means a transaction that month with the bill's category, paid from the bill's account (and containing the match text, if set).</p>
      <div class="table-wrap"><table class="edit-table"><thead><tr><th>Bill</th><th>Category</th><th>Paid from</th><th class="num">Amount</th><th>Due day</th><th>Match text (optional)</th><th>Status</th><th></th></tr></thead><tbody>
        ${st.map((b, i) => `<tr data-i="${i}">
          <td><input data-k="name" value="${esc(b.name)}"></td>
          <td><select data-k="category">${opts(CFG.categories.map((c) => c.name), b.category, "")}</select></td>
          <td><select data-k="account">${opts(CFG.accounts.map((a) => a.name), b.account, "")}</select></td>
          <td><input data-k="amount" type="number" step="0.01" value="${b.amount ?? ""}" placeholder="varies"></td>
          <td><input data-k="day" type="number" min="1" max="31" value="${b.day}"></td>
          <td><input data-k="match" value="${esc(b.match || "")}" placeholder="e.g. Spotify"></td>
          <td><span class="pill ${b.status.split(" ")[0]}">${b.status}</span>${b.paidAmount ? ` <span class="muted">${money(b.paidAmount, false)}</span>` : ""}</td>
          <td><button class="small danger" data-del="${i}">✕</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button id="bl-add">+ Add bill</button><button id="bl-save" class="primary">Save bills</button>
        ${rec.length ? "" : `<button id="bl-seed">Start with a basic bill list</button>`}</div>
    </div>`;
  $("#bl-month").onchange = (e) => { ui.billMonth = +e.target.value; renderBills(); };
  const collect = () => $$("#tab-bills tbody tr").map((tr) => {
    const g = (k) => tr.querySelector(`[data-k="${k}"]`).value;
    return { name: g("name").trim(), category: g("category"), account: g("account"), amount: g("amount") === "" ? null : +g("amount"), day: Math.min(31, Math.max(1, +g("day") || 1)), match: g("match").trim() };
  });
  $("#bl-add").onclick = () => Store.setCfg("recurring", [...collect(), { name: "New bill", category: "", account: "Joint Bills", amount: null, day: 1, match: "" }]);
  $("#bl-save").onclick = async () => { await Store.setCfg("recurring", collect().filter((b) => b.name)); toast("Bills saved."); };
  $("#tab-bills tbody").onclick = (e) => { const i = e.target.dataset.del; if (i !== undefined) Store.setCfg("recurring", collect().filter((_, k) => k !== +i)); };
  const seed = $("#bl-seed");
  // Starter list only: no amounts here, since this code is public. Fill them in on the page.
  if (seed) seed.onclick = () => Store.setCfg("recurring", [
    ["Rent / Mortgage", "Rent / Mortgage"], ["Utilities", "Electricity / Gas Bill"], ["Water", "Water Bill"],
    ["Internet", "Internet Bill"], ["Phone", "Phone Bill"], ["Auto Insurance", "Auto Insurance"], ["Subscriptions", "Subscriptions"],
  ].map(([name, category]) => ({ name, category, account: "Joint Bills", amount: null, day: 1, match: "" })));
}

// --------------------------------------------------------------------------------- import
let pending = null;   // { rows, source }
function renderImport() {
  const accts = opts(CFG.accounts.map((a) => a.name), "", "Choose account…");
  $("#tab-import").innerHTML = `
    <div class="two">
      <div class="card"><h2>Bank CSV</h2>
        <p class="hint">Download a CSV of transactions from your bank's website, then pick it here. Rows that match something already saved are skipped.</p>
        <div class="row"><select id="im-csv-acct">${accts}</select><input type="file" id="im-csv" accept=".csv,text/csv"></div>
        <div id="im-map"></div></div>
      <div class="card"><h2>Old Database (.xlsm)</h2>
        <p class="hint">Your old expense spreadsheet, whatever its file name is. Everything on its <b>Expense History</b> sheet is imported into the account you pick. Choose your own personal account.</p>
        <div class="row"><select id="im-old-acct">${accts}</select><input type="file" id="im-old" accept=".xlsm,.xlsx"></div></div>
    </div>
    <div id="im-preview"></div>`;
  const need = (sel) => { const v = $(sel).value; if (!v) toast("Choose the account first."); return v; };
  $("#im-old").onchange = async (e) => {
    const acct = need("#im-old-acct"); if (!acct) { e.target.value = ""; return; }
    try { preview(Importers.fromOldTemplate(await Importers.readWorkbook(e.target.files[0]), acct), e.target.files[0].name); }
    catch (err) { toast(err.message, 6000); }
  };
  $("#im-csv").onchange = async (e) => {
    const acct = need("#im-csv-acct"); if (!acct) { e.target.value = ""; return; }
    const parsed = Importers.parseCsv(await e.target.files[0].text());
    const map = Importers.guessMapping(parsed.header);
    const colOpts = (sel) => opts(parsed.header.map((h, i) => [String(i), h || `Column ${i + 1}`]), String(sel), "(none)");
    $("#im-map").innerHTML = `<div class="grid2" style="margin-top:10px">
        <label>Date column<select id="mp-date">${colOpts(map.date)}</select></label>
        <label>Description column<select id="mp-desc">${colOpts(map.desc)}</select></label>
        <label>Amount column<select id="mp-amount">${colOpts(map.amount)}</select></label>
        <label>…or Debit / Credit columns<span class="row"><select id="mp-debit">${colOpts(map.debit)}</select><select id="mp-credit">${colOpts(map.credit)}</select></span></label>
        <label class="span2"><span><input type="checkbox" id="mp-neg" checked> Purchases show as negative numbers in this file (most checking accounts; many credit cards are the opposite)</span></label>
      </div><button id="mp-go" class="primary">Preview</button>`;
    $("#mp-go").onclick = () => {
      const n = (id) => ($(id).value === "" ? -1 : +$(id).value);
      const m = { date: n("#mp-date"), desc: n("#mp-desc"), amount: n("#mp-amount"), debit: n("#mp-debit"), credit: n("#mp-credit"), purchasesAreNegative: $("#mp-neg").checked };
      preview(Importers.fromCsv(parsed, m, acct, CFG.rules), e.target.files[0].name);
    };
  };
  if (pending) drawPreview();
}
function preview(rows, source) {
  pending = { rows: Importers.markDuplicates(rows, Store.transactions()), source };
  drawPreview();
}
function drawPreview() {
  const { rows, source } = pending;
  const fresh = rows.filter((r) => !r._dup);
  const unknown = [...new Set(fresh.map((r) => r.category).filter((c) => c && !CFG.categoryByName.has(c)))];
  $("#im-preview").innerHTML = `<div class="card"><div class="row"><h2>Preview · ${esc(source)}</h2>
      <span class="muted">${rows.length} rows · <b>${fresh.length} new</b> · ${rows.length - fresh.length} already saved (skipped)</span>
      <span class="spacer"></span><button id="pv-cancel">Cancel</button><button id="pv-save" class="primary" ${fresh.length ? "" : "disabled"}>Import ${fresh.length} rows</button></div>
    ${unknown.length ? `<p class="error">Categories not in your list: ${unknown.map(esc).join(", ")}. They'll import as-is and show under "Unknown"; add them in Settings or edit the rows later.</p>` : ""}
    <p class="hint">You can fix categories here before importing. Blank categories can be filled in later from Transactions › Needs attention.</p>
    <div class="table-wrap" style="max-height:480px"><table class="edit-table"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Category</th><th>Account</th><th></th></tr></thead><tbody>
      ${rows.slice(0, 500).map((r, i) => `<tr${r._dup ? ' class="muted"' : ""}><td>${r.date}</td><td>${esc(r.desc)}</td><td class="num">${money(r.amount, false)}</td>
        <td>${r._dup ? esc(r.category) : `<select data-i="${i}">${opts(CFG.categories.map((c) => c.name), r.category, r.category && !CFG.categoryByName.has(r.category) ? r.category : "(blank)")}</select>`}</td>
        <td>${esc(r.account)}</td><td>${r._dup ? "already saved" : ""}</td></tr>`).join("")}
      ${rows.length > 500 ? `<tr><td colspan="6" class="muted">…and ${rows.length - 500} more (all will import).</td></tr>` : ""}
    </tbody></table></div></div>`;
  $("#im-preview tbody").onchange = (e) => { const i = e.target.dataset.i; if (i !== undefined && e.target.value) pending.rows[+i].category = e.target.value; };
  $("#pv-cancel").onclick = () => { pending = null; $("#im-preview").innerHTML = ""; };
  $("#pv-save").onclick = async () => {
    const save = pending.rows.filter((r) => !r._dup).map(({ _dup, ...r }) => r);
    $("#pv-save").disabled = true;
    await Store.saveTxs(save);
    pending = null;
    toast(`Imported ${save.length} transactions.`);
    $("#im-preview").innerHTML = "";
  };
}

// --------------------------------------------------------------------------------- settings
function renderSettings() {
  const ownerOpts = (sel) => opts([["joint", CFG.people.joint], ["p1", CFG.people.p1], ["p2", CFG.people.p2]], sel);
  const acctOpts = (sel) => opts(CFG.accounts.map((a) => a.name), sel, "");
  const catOpts = (sel) => opts(CFG.categories.map((c) => c.name), sel, "");
  const del = `<td><button class="small danger" data-del>✕</button></td>`;
  $("#tab-settings").innerHTML = `
    <div class="card"><h2>People</h2><div class="row">
      <label>Person 1 (short) <input id="st-p1" value="${esc(CFG.people.p1)}" size="10"></label>
      <label>Full name <input id="st-p1f" value="${esc(CFG.people.p1Full || "")}"></label>
      <label>Person 2 (short) <input id="st-p2" value="${esc(CFG.people.p2)}" size="10"></label>
      <label>Full name <input id="st-p2f" value="${esc(CFG.people.p2Full || "")}"></label>
      <label>Shared label <input id="st-joint" value="${esc(CFG.people.joint)}" size="10"></label>
      <button id="st-people" class="primary">Save names</button></div>
      <p class="hint">The short name is used in menus and on the Summary (e.g. "Kelly's allowance left").</p></div>

    <div class="card"><h2>Accounts</h2>
      <p class="hint">Renaming an account here also updates every transaction that uses it.</p>
      <table class="edit-table" id="st-accts"><thead><tr><th>Name</th><th>Owner</th><th>Type</th><th>Note</th><th></th></tr></thead><tbody>
      ${CFG.accounts.map((a) => `<tr data-orig="${esc(a.name)}"><td><input data-k="name" value="${esc(a.name)}"></td><td><select data-k="owner">${ownerOpts(a.owner)}</select></td>
        <td><select data-k="type">${opts(["Checking", "Savings", "Credit Card", "Investment", "Cash"], a.type)}</select></td><td><input data-k="note" value="${esc(a.note || "")}"></td>${del}</tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button data-add="st-accts">+ Add account</button><button id="st-accts-save" class="primary">Save accounts</button></div></div>

    <div class="card"><h2>Paycheck split</h2>
      <p class="hint">What "Distribute paycheck" moves out of the hub. Fixed amounts and percents go first; "Rest" splits whatever is left.</p>
      <table class="edit-table" id="st-split"><thead><tr><th>To account</th><th>How</th><th>Value</th><th></th></tr></thead><tbody>
      ${CFG.split.map((s) => `<tr><td><select data-k="toAccount">${acctOpts(s.toAccount)}</select></td><td><select data-k="mode">${opts([["fixed", "Fixed $"], ["percent", "Percent %"], ["rest", "Rest"]], s.mode)}</select></td>
        <td><input data-k="value" type="number" step="0.01" value="${s.value ?? ""}"></td>${del}</tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button data-add="st-split">+ Add line</button><button id="st-split-save" class="primary">Save split</button></div></div>

    <div class="card"><h2>Categories &amp; budgets</h2>
      <p class="hint">Kind decides how it counts: Income, Savings, Expense, or Transfer (never counted). Renaming updates every transaction.</p>
      <div class="table-wrap" style="max-height:520px"><table class="edit-table" id="st-cats"><thead><tr><th>Name</th><th>Group</th><th>Kind</th><th>Monthly budget</th><th></th></tr></thead><tbody>
      ${CFG.categories.map((c) => `<tr data-orig="${esc(c.name)}"><td><input data-k="name" value="${esc(c.name)}"></td><td><input data-k="group" value="${esc(c.group)}" list="group-list"></td>
        <td><select data-k="kind">${opts(["Income", "Savings", "Expense", "Transfer"], c.kind)}</select></td><td><input data-k="budget" type="number" step="0.01" value="${c.budget ?? ""}"></td>${del}</tr>`).join("")}
      </tbody></table></div><datalist id="group-list">${CFG.groups.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
      <div class="row" style="margin-top:8px"><button data-add="st-cats">+ Add category</button><button id="st-cats-save" class="primary">Save categories</button></div></div>

    <div class="card"><h2>CSV auto-categorize rules</h2>
      <p class="hint">When an imported description contains the text, it gets that category. First match wins.</p>
      <table class="edit-table" id="st-rules"><thead><tr><th>Description contains</th><th>Category</th><th></th></tr></thead><tbody>
      ${CFG.rules.map((r) => `<tr><td><input data-k="match" value="${esc(r.match)}"></td><td><select data-k="category">${catOpts(r.category)}</select></td>${del}</tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button data-add="st-rules">+ Add rule</button><button id="st-rules-save" class="primary">Save rules</button><button id="st-rules-learn">Suggest rules from my history</button></div></div>

    <div class="card"><h2>Backup &amp; data</h2>
      <p class="hint">Your data lives in <b>${esc(Store.folderName())}</b> as ledger-*.json files (one per computer). Google Drive keeps old versions of each file, and a backup file gives you one more copy.</p>
      <div class="row"><button id="st-backup">Download backup (.json)</button><label class="row">Restore backup <input type="file" id="st-restore" accept=".json"></label>
        <button id="st-export">Export everything to Excel</button><button id="st-folder">Use a different data folder</button></div></div>`;

  const rowsOf = (id) => $$(`#${id} tbody tr`).map((tr) => {
    const o = { _orig: tr.dataset.orig };
    for (const el of tr.querySelectorAll("[data-k]")) o[el.dataset.k] = el.value;
    return o;
  });
  const templates = {
    "st-accts": `<tr><td><input data-k="name" value=""></td><td><select data-k="owner">${ownerOpts("joint")}</select></td><td><select data-k="type">${opts(["Checking", "Savings", "Credit Card", "Investment", "Cash"], "Checking")}</select></td><td><input data-k="note"></td>${del}</tr>`,
    "st-split": `<tr><td><select data-k="toAccount">${acctOpts("")}</select></td><td><select data-k="mode">${opts([["fixed", "Fixed $"], ["percent", "Percent %"], ["rest", "Rest"]], "fixed")}</select></td><td><input data-k="value" type="number" step="0.01"></td>${del}</tr>`,
    "st-cats": `<tr><td><input data-k="name"></td><td><input data-k="group" list="group-list"></td><td><select data-k="kind">${opts(["Income", "Savings", "Expense", "Transfer"], "Expense")}</select></td><td><input data-k="budget" type="number" step="0.01"></td>${del}</tr>`,
    "st-rules": `<tr><td><input data-k="match"></td><td><select data-k="category">${catOpts("")}</select></td>${del}</tr>`,
  };
  const tab = $("#tab-settings");
  tab.onclick = (e) => {
    if (e.target.dataset.add) $(`#${e.target.dataset.add} tbody`).insertAdjacentHTML("beforeend", templates[e.target.dataset.add]);
    if (e.target.hasAttribute("data-del")) e.target.closest("tr").remove();
  };

  $("#st-people").onclick = async () => { await Store.setCfg("people", { p1: $("#st-p1").value.trim() || "Person 1", p1Full: $("#st-p1f").value.trim(), p2: $("#st-p2").value.trim() || "Person 2", p2Full: $("#st-p2f").value.trim(), joint: $("#st-joint").value.trim() || "Joint" }); toast("Names saved."); };

  // Rename-aware save: when a name changes, rewrite the transactions that used the old name
  async function saveRenamable(key, rows, clean, fields) {
    const list = rows.map(clean).filter((x) => x.name);
    const names = list.map((x) => x.name);
    if (new Set(names).size !== names.length) { toast("Two rows have the same name."); return; }
    const renames = new Map(rows.filter((r) => r._orig && r.name.trim() && r._orig !== r.name.trim()).map((r) => [r._orig, r.name.trim()]));
    if (renames.size) {
      const changed = Store.transactions().filter((t) => fields.some((f) => renames.has(t[f])))
        .map((t) => { const u = { ...t }; for (const f of fields) if (renames.has(u[f])) u[f] = renames.get(u[f]); return u; });
      if (changed.length && !confirm(`Rename ${[...renames].map(([a, b]) => `"${a}" → "${b}"`).join(", ")}? This updates ${changed.length} transaction(s).`)) return;
      if (changed.length) await Store.saveTxs(changed);
    }
    await Store.setCfg(key, list);
    toast("Saved.");
  }
  $("#st-accts-save").onclick = () => saveRenamable("accounts", rowsOf("st-accts"), (r) => ({ name: r.name.trim(), owner: r.owner, type: r.type, note: r.note.trim() }), ["account", "toAccount"]);
  $("#st-cats-save").onclick = () => saveRenamable("categories", rowsOf("st-cats"), (r) => ({ name: r.name.trim(), group: r.group.trim() || "Other", kind: r.kind, budget: r.budget === "" ? null : +r.budget }), ["category"]);
  $("#st-split-save").onclick = async () => { await Store.setCfg("split", rowsOf("st-split").filter((s) => s.toAccount).map((s) => ({ toAccount: s.toAccount, mode: s.mode, value: s.value === "" ? 0 : +s.value }))); toast("Split saved."); };
  $("#st-rules-save").onclick = async () => { await Store.setCfg("rules", rowsOf("st-rules").filter((r) => r.match.trim() && r.category).map((r) => ({ match: r.match.trim(), category: r.category }))); toast("Rules saved."); };
  $("#st-rules-learn").onclick = () => {
    // Merchants seen 3+ times that always got the same category
    const by = new Map();
    for (const t of Store.transactions()) {
      const key = (t.desc || "").replace(/[#*\d].*$/, "").trim();
      if (key.length < 4) continue;
      if (!by.has(key)) by.set(key, new Map());
      const m = by.get(key); m.set(t.category, (m.get(t.category) || 0) + 1);
    }
    const have = new Set(CFG.rules.map((r) => r.match.toLowerCase()));
    const sugg = [...by].filter(([k, m]) => m.size === 1 && [...m.values()][0] >= 3 && !have.has(k.toLowerCase()) && CFG.categoryByName.has([...m.keys()][0]))
      .map(([k, m]) => ({ match: k, category: [...m.keys()][0] })).slice(0, 60);
    if (!sugg.length) { toast("No new suggestions."); return; }
    for (const s of sugg) $("#st-rules tbody").insertAdjacentHTML("beforeend", `<tr><td><input data-k="match" value="${esc(s.match)}"></td><td><select data-k="category">${catOpts(s.category)}</select></td>${del}</tr>`);
    toast(`Added ${sugg.length} suggested rules. Review them, then Save rules.`);
  };
  $("#st-backup").onclick = () => Importers.download(`truong-finance-backup-${todayIso()}.json`, new Blob([JSON.stringify(Store.snapshot(), null, 1)], { type: "application/json" }));
  $("#st-export").onclick = () => Importers.exportXlsx(CFG, Store.transactions(), `Truong_Finance_${todayIso()}.xlsx`);
  $("#st-restore").onchange = async (e) => {
    const snap = JSON.parse(await e.target.files[0].text());
    const n = (snap.transactions || []).length;
    if (!confirm(`Restore ${n} transactions and settings from this backup? Existing items with the same id are overwritten; nothing else is deleted.`)) return;
    await Store.restore(snap); toast("Backup restored.");
  };
  $("#st-folder").onclick = () => openApp(() => Store.pickFolder());
}

start();

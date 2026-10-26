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
  // The share that goes into a savings account is logged as savings (shared, from the Hub), so it counts in Saved
  const saveCat = (CFG.categories.find((c) => c.kind === "Savings") || { name: transferCat }).name;
  const isSavingsAcct = (name) => (CFG.accountByName.get(name) || {}).type === "Savings";
  const batch = [{ date, desc: `Paycheck – ${who}`, amount: amt, category: payCat, account: from, toAccount: "", notes: "", tags: "" },
    ...transfers.filter((t) => t.toAccount !== from).map((t) => ({ date, desc: `Paycheck split → ${t.toAccount}`, amount: t.amount,
      category: isSavingsAcct(t.toAccount) ? saveCat : transferCat, account: from, toAccount: t.toAccount, notes: `from ${who}'s paycheck`, tags: "" }))];
  await Store.saveTxs(batch);
  dlgPay.close();
  toast(`Logged paycheck + ${batch.length - 1} transfer(s).`);
};

// Summary page lives in js/summary.js

// --------------------------------------------------------------------------------- bills
function renderBills() {
  const y = new Date().getFullYear();
  const st = Model.recurringStatus(CFG, Store.transactions(), y, ui.billMonth);
  const rec = CFG.recurring;
  const fixed = rec.reduce((s, b) => s + (+b.amount || 0), 0);
  $("#tab-bills").innerHTML = `
    ${pageHead("Bills", `${money(fixed, false)} a month in fixed bills`,
      `<select id="bl-month">${opts(Model.MONTHS.map((m, i) => [String(i), `${m} ${y}`]), String(ui.billMonth))}</select>${rec.length ? `<button id="bl-log" class="primary">Log ${Model.MONTHS[ui.billMonth]} bills</button>` : ""}`)}
    <div class="card">
      <div class="table-wrap"><table class="edit-table"><thead><tr><th>Bill</th><th>Category</th><th>Paid from</th><th class="num">Amount</th><th>Due day</th><th>Match text (optional)</th><th>Status</th><th></th></tr></thead><tbody>
        ${st.map((b, i) => `<tr data-i="${i}">
          <td><input data-k="name" value="${esc(b.name)}"></td>
          <td><select data-k="category">${opts(CFG.categories.map((c) => c.name), b.category, "")}</select></td>
          <td><select data-k="account">${opts(CFG.accounts.map((a) => a.name), b.account, "")}</select></td>
          <td><input data-k="amount" type="number" step="0.01" value="${b.amount ?? ""}" placeholder="varies"></td>
          <td><input data-k="day" type="number" min="1" max="31" value="${b.day}"></td>
          <td><input data-k="match" value="${esc(b.match || "")}" placeholder="e.g. Spotify"></td>
          <td><span class="pill ${b.status.split(" ")[0]}">${b.status}</span>${b.paidAmount ? ` <span class="muted">${money(b.paidAmount, false)}</span>` : ""}</td>
          <td><button class="small ghost" data-del="${i}" title="Remove">Remove</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button id="bl-add">${icon("plus")}Add bill</button><button id="bl-save" class="primary">Save bills</button>
        ${rec.length ? "" : `<button id="bl-seed">Start with a basic bill list</button>`}</div>
    </div>`;
  $("#bl-month").onchange = (e) => { ui.billMonth = +e.target.value; renderBills(); };
  const collect = () => $$("#tab-bills tbody tr").map((tr) => {
    const g = (k) => tr.querySelector(`[data-k="${k}"]`).value;
    return { name: g("name").trim(), category: g("category"), account: g("account"), amount: g("amount") === "" ? null : +g("amount"), day: Math.min(31, Math.max(1, +g("day") || 1)), match: g("match").trim() };
  });
  const lg = $("#bl-log");
  if (lg) lg.onclick = () => openLogBills(y, ui.billMonth);
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
    ${pageHead("Import", "Bring in bank statements or your old spreadsheet")}
    <div class="two">
      <div class="card"><h2>Bank statement</h2>
        <p class="hint">A CSV from your bank. Rows go to Transactions to be sorted; anything imported before is skipped.</p>
        <div class="row"><select id="im-csv-acct">${accts}</select><input type="file" id="im-csv" accept=".csv,text/csv"></div>
        <div id="im-map"></div></div>
      <div class="card"><h2>Old database</h2>
        <p class="hint">Your old .xlsm expense spreadsheet. Imports its Expense History into the account you pick.</p>
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
      const rows = Importers.fromCsv(parsed, m, acct);
      if (!rows.length) { toast("No rows with a date and amount were found. Check the column choices.", 6000); return; }
      const fresh = Importers.markDuplicates(rows, Store.transactions());
      const newCount = fresh.filter((r) => !r._dup).length;
      const ins = rows.filter((r) => r.dir === "in").length;
      $("#im-map").insertAdjacentHTML("beforeend", `<div class="card" style="margin-top:10px" id="mp-sum">
        <p><b>${rows.length}</b> rows read: ${rows.length - ins} money out, ${ins} money in. <b>${newCount} new</b>, ${rows.length - newCount} already imported before (skipped).</p>
        <p class="hint">Sanity check: purchases should be "money out". If it's backwards, flip the checkbox above and click Preview again.</p>
        <button id="mp-send" class="primary" ${newCount ? "" : "disabled"}>Send ${newCount} rows to review</button></div>`);
      $("#mp-go").disabled = true;
      $("#mp-send").onclick = async () => {
        $("#mp-send").disabled = true;
        const idx = Model.buildGuessIndex(CFG, Store.transactions());
        const save = fresh.filter((r) => !r._dup).map(({ _dup, ...r }) => {
          const g = Model.guessCategory(CFG, idx, r);
          return { ...r, bankDesc: r.desc, category: g, guess: !!g };
        });
        await Store.saveTxs(save);
        toast(`${save.length} rows are waiting in Transactions › To review.`, 4000);
        $('#tabs [data-tab="transactions"]').click();
      };
    };
    $("#im-map").onchange = (ev) => {   // changing a mapping choice invalidates the summary
      if (ev.target.closest(".grid2")) { const s = $("#mp-sum"); if (s) s.remove(); $("#mp-go").disabled = false; }
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
  const del = `<td><button class="small ghost" data-del title="Remove">Remove</button></td>`;
  $("#tab-settings").innerHTML = `
    ${pageHead("Settings")}
    ${reorgCard()}
    <div class="card"><h2>People</h2><div class="row">
      <label>Person 1 (short) <input id="st-p1" value="${esc(CFG.people.p1)}" size="10"></label>
      <label>Full name <input id="st-p1f" value="${esc(CFG.people.p1Full || "")}"></label>
      <label>Person 2 (short) <input id="st-p2" value="${esc(CFG.people.p2)}" size="10"></label>
      <label>Full name <input id="st-p2f" value="${esc(CFG.people.p2Full || "")}"></label>
      <label>Shared label <input id="st-joint" value="${esc(CFG.people.joint)}" size="10"></label>
      <button id="st-people" class="primary">Save names</button></div>
</div>

    <div class="card"><h2>Balances today</h2>${balancesTable(todayIso(), false)}</div>

    <div class="card"><h2>Accounts</h2>
      <p class="hint">Starting balance is the bank balance at the start of that date. Enter a credit card balance as a negative number.</p>
      <table class="edit-table" id="st-accts"><thead><tr><th>Name</th><th>Owner</th><th>Type</th><th>Starting balance</th><th>…as of date</th><th>Note</th><th></th></tr></thead><tbody>
      ${CFG.accounts.map((a) => `<tr data-orig="${esc(a.name)}"><td><input data-k="name" value="${esc(a.name)}"></td><td><select data-k="owner">${ownerOpts(a.owner)}</select></td>
        <td><select data-k="type">${opts(["Checking", "Savings", "Credit Card", "Investment", "Cash"], a.type)}</select></td>
        <td><input data-k="openingBalance" type="number" step="0.01" value="${a.openingBalance ?? ""}" placeholder="balance" style="width:110px"></td>
        <td><input data-k="openingDate" type="date" value="${esc(a.openingDate || "")}"></td><td><input data-k="note" value="${esc(a.note || "")}"></td>${del}</tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button data-add="st-accts">${icon("plus")}Add account</button><button id="st-accts-save" class="primary">Save accounts</button></div></div>

    <div class="card"><h2>Paycheck split</h2>
      <p class="hint">Fixed amounts and percents come out first; Rest splits what's left.</p>
      <table class="edit-table" id="st-split"><thead><tr><th>To account</th><th>How</th><th>Value</th><th></th></tr></thead><tbody>
      ${CFG.split.map((s) => `<tr><td><select data-k="toAccount">${acctOpts(s.toAccount)}</select></td><td><select data-k="mode">${opts([["fixed", "Fixed $"], ["percent", "Percent %"], ["rest", "Rest"]], s.mode)}</select></td>
        <td><input data-k="value" type="number" step="0.01" value="${s.value ?? ""}"></td>${del}</tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button data-add="st-split">${icon("plus")}Add line</button><button id="st-split-save" class="primary">Save split</button></div></div>

    <div class="card"><h2>Categories &amp; budgets</h2>

      <div class="table-wrap" style="max-height:520px"><table class="edit-table" id="st-cats"><thead><tr><th>Name</th><th>Group</th><th>Kind</th><th>Monthly budget</th><th></th></tr></thead><tbody>
      ${CFG.categories.map((c) => `<tr data-orig="${esc(c.name)}"><td><input data-k="name" value="${esc(c.name)}"></td><td><input data-k="group" value="${esc(c.group)}" list="group-list"></td>
        <td><select data-k="kind">${opts(["Income", "Savings", "Expense", "Transfer"], c.kind)}</select></td><td><input data-k="budget" type="number" step="0.01" value="${c.budget ?? ""}"></td>${del}</tr>`).join("")}
      </tbody></table></div><datalist id="group-list">${CFG.groups.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
      <div class="row" style="margin-top:8px"><button data-add="st-cats">${icon("plus")}Add category</button><button id="st-cats-save" class="primary">Save categories</button></div></div>

    <div class="card"><h2>Import rules</h2>
      <p class="hint">If an imported description contains this text, it gets this category.</p>
      <table class="edit-table" id="st-rules"><thead><tr><th>Description contains</th><th>Category</th><th></th></tr></thead><tbody>
      ${CFG.rules.map((r) => `<tr><td><input data-k="match" value="${esc(r.match)}"></td><td><select data-k="category">${catOpts(r.category)}</select></td>${del}</tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button data-add="st-rules">${icon("plus")}Add rule</button><button id="st-rules-save" class="primary">Save rules</button><button id="st-rules-learn">Suggest rules from my history</button></div></div>

    <div class="card"><h2>Data</h2>
      <p class="hint">Stored in <b>${esc(Store.folderName())}</b>, one file per computer.</p>
      <div class="row"><button id="st-backup">Download backup</button><label class="row muted">Restore <input type="file" id="st-restore" accept=".json"></label>
        <button id="st-export">Export to Excel</button><button id="st-folder">Change folder</button></div></div>`;

  const rowsOf = (id) => $$(`#${id} tbody tr`).map((tr) => {
    const o = { _orig: tr.dataset.orig };
    for (const el of tr.querySelectorAll("[data-k]")) o[el.dataset.k] = el.value;
    return o;
  });
  const templates = {
    "st-accts": `<tr><td><input data-k="name" value=""></td><td><select data-k="owner">${ownerOpts("joint")}</select></td><td><select data-k="type">${opts(["Checking", "Savings", "Credit Card", "Investment", "Cash"], "Checking")}</select></td><td><input data-k="openingBalance" type="number" step="0.01" style="width:110px"></td><td><input data-k="openingDate" type="date"></td><td><input data-k="note"></td>${del}</tr>`,
    "st-split": `<tr><td><select data-k="toAccount">${acctOpts("")}</select></td><td><select data-k="mode">${opts([["fixed", "Fixed $"], ["percent", "Percent %"], ["rest", "Rest"]], "fixed")}</select></td><td><input data-k="value" type="number" step="0.01"></td>${del}</tr>`,
    "st-cats": `<tr><td><input data-k="name"></td><td><input data-k="group" list="group-list"></td><td><select data-k="kind">${opts(["Income", "Savings", "Expense", "Transfer"], "Expense")}</select></td><td><input data-k="budget" type="number" step="0.01"></td>${del}</tr>`,
    "st-rules": `<tr><td><input data-k="match"></td><td><select data-k="category">${catOpts("")}</select></td>${del}</tr>`,
  };
  wireReorg();
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
  $("#st-accts-save").onclick = () => saveRenamable("accounts", rowsOf("st-accts"), (r) => ({ name: r.name.trim(), owner: r.owner, type: r.type, note: r.note.trim(),
    openingBalance: r.openingBalance === "" ? null : Model.r2(+r.openingBalance), openingDate: r.openingDate || "" }), ["account", "toAccount"]);
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
  $("#st-backup").onclick = () => Importers.download(`truong-endres-finances-backup-${todayIso()}.json`, new Blob([JSON.stringify(Store.snapshot(), null, 1)], { type: "application/json" }));
  $("#st-export").onclick = () => Importers.exportXlsx(CFG, Store.transactions(), `Truong_Endres_Family_Finances_${todayIso()}.xlsx`);
  $("#st-restore").onchange = async (e) => {
    const snap = JSON.parse(await e.target.files[0].text());
    const n = (snap.transactions || []).length;
    if (!confirm(`Restore ${n} transactions and settings from this backup? Existing items with the same id are overwritten; nothing else is deleted.`)) return;
    await Store.restore(snap); toast("Backup restored.");
  };
  $("#st-folder").onclick = () => openApp(() => Store.pickFolder());
}

start();

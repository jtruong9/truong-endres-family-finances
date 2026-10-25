// Balances + bank check, savings goals, monthly check-in, rental property, compare years,
// one-click bills. Loaded after app.js / help.js, before app2.js.
"use strict";

const lastDayIso = (y, m) => { const d = new Date(y, m + 1, 0); return `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ymKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;

// --------------------------------------------------------------------------------- balances
// Table of every account: app balance vs. what the bank says. Used on the Accounts card and Check-in.
function balancesTable(asOf, withEntry) {
  const txs = Store.transactions();
  const checks = CFG.balanceChecks;
  return `<div class="table-wrap"><table class="bal-table"><thead><tr><th>Account</th><th>Owner</th><th class="num">App balance</th>
    ${withEntry ? `<th class="num">Bank says</th><th class="num">Difference</th>` : `<th>Last bank check</th>`}</tr></thead><tbody>
    ${CFG.accounts.map((a) => {
      const bal = Model.balanceAt(CFG, txs, a.name, asOf);
      const last = checks.filter((c) => c.account === a.name).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
      const lastLine = last ? `${fmtDate(last.date)} · ${Math.abs(last.bank - last.app) < 0.005 ? '<span class="pos">Matched</span>' : `<span class="neg">off by ${money(Model.r2(last.app - last.bank), false)}</span>`}` : '<span class="muted">never</span>';
      if (bal === null) return `<tr><td>${esc(a.name)}</td><td class="muted">${esc(Model.ownerLabel(CFG, a.owner))}</td><td colspan="3" class="muted">Set a starting balance in Settings &rsaquo; Accounts</td></tr>`;
      const saved = checks.find((c) => c.account === a.name && c.date === asOf);
      return `<tr data-acct="${esc(a.name)}" data-app="${bal}"><td>${esc(a.name)}</td><td class="muted">${esc(Model.ownerLabel(CFG, a.owner))}</td>
        <td class="num"><b>${money(bal, false)}</b></td>
        ${withEntry ? `<td class="num"><input class="bank-in" type="number" step="0.01" placeholder="from bank" style="width:120px" value="${saved ? saved.bank : ""}"></td><td class="num diff"></td>` : `<td>${lastLine}</td>`}</tr>`;
    }).join("")}</tbody></table></div>`;
}
// True when every account that has a starting balance matches a bank balance saved for this date
function balancesMatched(asOf) {
  const txs = Store.transactions();
  const accts = CFG.accounts.filter(Model.hasOpening);
  return accts.length > 0 && accts.every((a) => {
    const c = CFG.balanceChecks.find((x) => x.account === a.name && x.date === asOf);
    const bal = Model.balanceAt(CFG, txs, a.name, asOf);
    return c && bal !== null && Math.abs(c.bank - bal) < 0.005;
  });
}
function wireBalanceEntry(root, asOf) {
  root.querySelectorAll(".bank-in").forEach((inp) => {
    if (inp.value) setTimeout(() => inp.oninput && inp.oninput(), 0);   // show the difference for saved values
    inp.oninput = () => {
      const tr = inp.closest("tr"), app = +tr.dataset.app, v = parseFloat(inp.value), cell = tr.querySelector(".diff");
      if (isNaN(v)) { cell.innerHTML = ""; return; }
      const d = Model.r2(app - v);
      cell.innerHTML = Math.abs(d) < 0.005 ? '<span class="pos">Matches</span>' : `<span class="neg">${money(d, false)}</span><div class="hint">${d > 0 ? "app is higher: something's logged that the bank doesn't have, or a deposit is missing" : "app is lower: a purchase may be logged twice, or something is missing"}</div>`;
    };
  });
  return async () => {
    const add = [];
    root.querySelectorAll("tr[data-acct]").forEach((tr) => {
      const v = parseFloat(tr.querySelector(".bank-in")?.value);
      if (!isNaN(v)) add.push({ account: tr.dataset.acct, date: asOf, bank: Model.r2(v), app: +tr.dataset.app, at: new Date().toISOString() });
    });
    if (!add.length) { toast("Type at least one bank balance first."); return false; }
    await Store.setCfg("balanceChecks", [...CFG.balanceChecks.filter((c) => !add.some((a) => a.account === c.account && a.date === c.date)), ...add]);
    const bad = add.filter((c) => Math.abs(c.bank - c.app) >= 0.005).length;
    toast(bad ? `Saved. ${bad} account(s) don't match yet: look for missing or doubled entries.` : "Saved. Every account matches the bank.", 4500);
    return true;
  };
}

// --------------------------------------------------------------------------------- goals
function goalsTab() {
  const txs = Store.transactions();
  const goals = CFG.goals;
  const card = (g, i) => {
    const p = Model.goalProgress(CFG, txs, g);
    const pct = Math.max(0, Math.min(1, p.pct));
    const line = p.type === "budget"
      ? `<b>${money(p.spent, false)}</b> spent of ${money(p.target, false)} · <span class="${p.over ? "neg" : "pos"}">${p.over ? `${money(-p.left, false)} over budget` : `${money(p.left, false)} left`}</span>`
      : `<b>${money(p.saved, false)}</b> saved of ${money(p.target, false)}${p.done ? ' · <span class="pos">Reached</span>' : p.perMonth != null ? ` · save <b>${money(p.perMonth, false)}/month</b> to reach it by ${esc(fmtYm(g.due))}` : ""}${p.pastDue ? ' · <span class="neg">past its date</span>' : ""}`;
    return `<div class="goal" data-i="${i}">
      <div class="row"><h3 style="margin:0">${esc(g.name)}</h3><span class="pill">${p.type === "budget" ? "Project budget" : "Savings goal"}</span>
        <span class="pill">tag: ${esc(p.tag)}</span><span class="spacer"></span>
        <button class="small" data-edit="${i}">Edit</button> <button class="small" data-show="${i}">${p.items.length} transaction(s)</button></div>
      <div class="bar ${p.type === "budget" && p.over ? "over" : ""}"><span style="width:${(pct * 100).toFixed(1)}%"></span></div>
      <div>${line}</div>${g.note ? `<div class="hint">${esc(g.note)}</div>` : ""}
    </div>`;
  };
  return `
    ${pageHead("Goals", "Savings goals and project budgets, tracked by tag", `<button id="gl-add" class="primary">${icon("plus")}New goal</button>`)}
    <div class="card">
      ${goals.length ? goals.map(card).join("") : `<p class="muted">No goals yet. A goal adds up every transaction with its tag.</p>`}
      <div id="gl-form"></div></div>`;
}
const fmtYm = (ym) => (ym ? `${Model.MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : "");
function wireGoals(root) {
  const form = (g, i) => {
    $("#gl-form").innerHTML = `<div class="card goal-form"><h3>${i == null ? "New goal" : "Edit goal"}</h3><div class="grid2">
      <label>Name <input id="gf-name" value="${esc(g.name || "")}" placeholder="Emergency fund"></label>
      <label>Type <select id="gf-type">${opts([["save", "Savings goal"], ["budget", "Project budget"]], g.type || "save")}</select></label>
      <label>Tag to track <input id="gf-tag" value="${esc(g.tag || "")}" placeholder="emergency"></label>
      <label>Target / budget amount <input id="gf-target" type="number" step="0.01" value="${g.target ?? ""}"></label>
      <label>Reach it by (optional) <input id="gf-due" type="month" value="${esc(g.due || "")}"></label>
      <label>Note <input id="gf-note" value="${esc(g.note || "")}"></label></div>
      <div class="actions">${i == null ? "" : `<button class="danger" id="gf-del">Delete goal</button>`}<span class="spacer"></span><button id="gf-cancel">Cancel</button><button class="primary" id="gf-save">Save goal</button></div></div>`;
    $("#gf-name").oninput = () => { if (!$("#gf-tag").dataset.touched) $("#gf-tag").value = $("#gf-name").value.trim().toLowerCase().split(/\s+/)[0] || ""; };
    $("#gf-tag").oninput = () => ($("#gf-tag").dataset.touched = "1");
    $("#gf-cancel").onclick = () => ($("#gl-form").innerHTML = "");
    $("#gf-save").onclick = async () => {
      const ng = { name: $("#gf-name").value.trim(), type: $("#gf-type").value, tag: $("#gf-tag").value.trim().toLowerCase(),
                   target: parseFloat($("#gf-target").value) || 0, due: $("#gf-due").value, note: $("#gf-note").value.trim() };
      if (!ng.name || !ng.tag || !ng.target) { toast("Give it a name, a tag and an amount."); return; }
      const list = CFG.goals.slice();
      if (i == null) list.push(ng); else list[i] = ng;
      await Store.setCfg("goals", list); toast("Goal saved.");
    };
    const d = $("#gf-del");
    if (d) d.onclick = async () => { if (confirm(`Delete the goal "${g.name}"? Its transactions are kept.`)) await Store.setCfg("goals", CFG.goals.filter((_, k) => k !== i)); };
    $("#gf-name").focus();
  };
  $("#gl-add").onclick = () => form({}, null);
  root.onclick = (e) => {
    const ed = e.target.dataset.edit, sh = e.target.dataset.show;
    if (ed !== undefined) form(CFG.goals[+ed], +ed);
    if (sh !== undefined) { ui.tx = { ...ui.tx, q: CFG.goals[+sh].tag, year: "", account: "", category: "", owner: "all", flagged: false, page: 0 }; $('#tabs [data-tab="transactions"]').click(); }
  };
}

// --------------------------------------------------------------------------------- check-in
function renderCheckin() {
  const txs = Store.transactions();
  const now = new Date();
  if (ui.ciYear == null) { const d = new Date(now.getFullYear(), now.getMonth() - (now.getDate() < 8 ? 1 : 0), 1); ui.ciYear = d.getFullYear(); ui.ciMonth = d.getMonth(); }
  const y = ui.ciYear, m = ui.ciMonth, key = ymKey(y, m), asOf = lastDayIso(y, m);
  const done = CFG.checkins[key];
  const toReview = txs.filter((t) => t.review).length;
  const flagged = txs.filter((t) => Model.openIssues(CFG, t).length).length;
  const bills = Model.recurringStatus(CFG, txs, y, m);
  const unpaid = bills.filter((b) => b.status !== "Paid");
  const budgets = Model.budgetStatus(CFG, txs, y, m);
  const over = budgets.filter((b) => b.over);
  const tot = Model.monthlyTotals(CFG, txs, y, "all");
  const monthOpts = [];
  for (let k = 0; k < 13; k++) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); monthOpts.push([`${d.getFullYear()}-${d.getMonth()}`, `${Model.MONTHS[d.getMonth()]} ${d.getFullYear()}`]); }
  if (!monthOpts.some(([v]) => v === `${y}-${m}`)) monthOpts.unshift([`${y}-${m}`, `${Model.MONTHS[m]} ${y}`]);
  const step = (n, ok, title, body) => `<div class="ci-step ${ok ? "ok" : ""}"><div class="ci-num">${ok ? icon("check") : n}</div><div class="ci-body"><h3>${title}</h3>${body}</div></div>`;

  $("#tab-checkin").innerHTML = `
    ${pageHead("Check-in", done ? `Done ${new Date(done.at).toLocaleDateString()}${done.by ? ` by ${esc(done.by)}` : ""}` : "A monthly review, about 10 minutes",
      `<select id="ci-month">${opts(monthOpts, `${y}-${m}`)}</select>`)}
    <div class="cards">
      <div class="stat"><div class="label">Income</div><div class="value">${money(tot.income[m], false)}</div></div>
      <div class="stat"><div class="label">Spent</div><div class="value">${money(tot.spending[m], false)}</div></div>
      <div class="stat"><div class="label">Saved</div><div class="value">${money(tot.savings[m], false)}</div></div>
      <div class="stat"><div class="label">Remaining</div><div class="value ${tot.remaining[m] < 0 ? "neg" : ""}">${money(tot.remaining[m], false)}</div></div>
    </div>

    <div class="card ci">
      ${step(1, !toReview && !flagged, "Sort every transaction", toReview || flagged
        ? `<p>${toReview ? `<b>${toReview}</b> imported row(s) still to review. ` : ""}${flagged ? `<b>${flagged}</b> saved transaction(s) need attention.` : ""}</p><button class="small primary" id="ci-go-review">Open Transactions</button>`
        : `<p class="muted">Nothing waiting. Tip: import this month's bank statements first (Import tab).</p>`)}
      ${step(2, balancesMatched(asOf), `Check balances against the bank (as of ${fmtDate(asOf)})`, `<p class="hint">Look up each account's balance on the bank's website or statement for this date and type it in.</p>
        <div id="ci-bal">${balancesTable(asOf, true)}</div><button class="small primary" id="ci-bal-save" style="margin-top:6px">Save bank balances</button>`)}
      ${step(3, bills.length && !unpaid.length, "Bills", bills.length
        ? (unpaid.length ? `<table><tbody>${unpaid.map((b) => `<tr><td>${esc(b.name)}</td><td class="muted">${esc(b.account)}</td><td><span class="pill ${b.status.split(" ")[0]}">${b.status}</span></td></tr>`).join("")}</tbody></table><button class="small" id="ci-go-bills">Open Bills</button>` : `<p class="pos">All ${bills.length} bills paid.</p>`)
        : `<p class="muted">No recurring bills set up. Add them on the Bills tab.</p>`)}
      ${step(4, budgets.length && !over.length, "Budgets", budgets.length
        ? `<table><thead><tr><th>Category</th><th class="num">Budget</th><th class="num">Actual</th><th></th></tr></thead><tbody>${budgets.map((b) => `<tr><td>${esc(b.category)}</td><td class="num">${money(b.budget, false)}</td><td class="num ${b.over ? "neg" : ""}">${money(b.spent, false)}</td><td>${b.over ? `<span class="neg">${money(b.spent - b.budget, false)} over</span>` : ""}</td></tr>`).join("")}</tbody></table>`
        : `<p class="muted">No budgets set. Add monthly budgets in Settings &rsaquo; Categories to see this.</p>`)}
      ${step(5, false, "Goals", CFG.goals.length ? CFG.goals.map((g) => { const p = Model.goalProgress(CFG, txs, g); return `<div class="row"><b style="min-width:160px">${esc(g.name)}</b><div class="bar ${p.over ? "over" : ""}" style="flex:1;max-width:320px"><span style="width:${(Math.max(0, Math.min(1, p.pct)) * 100).toFixed(1)}%"></span></div><span>${p.type === "budget" ? `${money(p.spent, false)} / ${money(p.target, false)}` : `${money(p.saved, false)} / ${money(p.target, false)}`}</span></div>`; }).join("") : `<p class="muted">No goals yet (Goals tab).</p>`)}
      ${step(6, !!done, "Wrap up", `<div class="row"><input id="ci-note" placeholder="Notes for this month (optional)" value="${esc(done?.note || "")}" style="flex:1;min-width:240px">
        <select id="ci-by">${opts([CFG.people.p1, CFG.people.p2, `${CFG.people.p1} & ${CFG.people.p2}`], done?.by || `${CFG.people.p1} & ${CFG.people.p2}`)}</select>
        <button class="primary" id="ci-done">${done ? "Update" : "Mark month done"}</button></div>`)}
    </div>`;

  $("#ci-month").onchange = (e) => { const [yy, mm] = e.target.value.split("-").map(Number); ui.ciYear = yy; ui.ciMonth = mm; renderCheckin(); };
  const gr = $("#ci-go-review"); if (gr) gr.onclick = () => $('#tabs [data-tab="transactions"]').click();
  const gb = $("#ci-go-bills"); if (gb) gb.onclick = () => $('#tabs [data-tab="bills"]').click();
  $("#ci-bal-save").onclick = wireBalanceEntry($("#ci-bal"), asOf);
  $("#ci-done").onclick = async () => {
    await Store.setCfg("checkins", { ...CFG.checkins, [key]: { at: new Date().toISOString(), by: $("#ci-by").value, note: $("#ci-note").value.trim() } });
    toast(`${Model.MONTHS[m]} ${y} check-in saved.`);
  };
}

// --------------------------------------------------------------------------------- rental
function renderRental() {
  const txs = Store.transactions();
  const r = CFG.rental;
  const yrs = [...new Set(txs.filter((t) => Model.isPosted(t) && Model.isRental(r, t)).map((t) => +t.date.slice(0, 4)))].sort((a, b) => b - a);
  if (ui.rentYear == null || (yrs.length && !yrs.includes(ui.rentYear))) ui.rentYear = yrs[0] || new Date().getFullYear();
  const s = Model.rentalSummary(CFG, txs, ui.rentYear);
  const thisYear = s.years.find((x) => x.year === ui.rentYear) || { income: 0, expenses: 0, net: 0 };
  const configured = (r.match || "").trim() || (r.tag || "").trim();

  $("#tab-rental").innerHTML = `
    ${pageHead(esc(r.name || "Rental property"), "Income, costs and net for the rental", yrs.length ? `<select id="rn-year">${opts(yrs.map(String), String(ui.rentYear))}</select>` : "")}
    <div class="card">
      <div class="row">
        <label>Name <input id="rn-name" value="${esc(r.name || "")}" size="18"></label>
        <label>Description contains <input id="rn-match" value="${esc(r.match || "")}" placeholder="e.g. 123 Main" size="12"></label>
        <label>or tag <input id="rn-tag" value="${esc(r.tag || "")}" size="10"></label>
        <button id="rn-save" class="small primary">Save</button></div>
      <p class="hint">Counts any transaction whose description contains the text, or that has the tag. Not tax advice.</p></div>
    ${!configured ? `<div class="card"><p class="muted">Enter the text that identifies the property (for example its street number) above, then Save.</p></div>` : `
    <div class="cards">
      <div class="stat income"><div class="label">Income · ${ui.rentYear}</div><div class="value">${money(thisYear.income, false)}</div><div class="sub">rent and other income</div></div>
      <div class="stat spend"><div class="label">Expenses · ${ui.rentYear}</div><div class="value">${money(thisYear.expenses, false)}</div><div class="sub">mortgage, repairs, utilities…</div></div>
      <div class="stat rem"><div class="label">Net · ${ui.rentYear}</div><div class="value ${thisYear.net < 0 ? "neg" : "pos"}">${money(thisYear.net, false)}</div><div class="sub">income − expenses</div></div>
    </div>
    <div class="two">
      <div class="card"><h2>By month · ${ui.rentYear}</h2><div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead><tbody>
        ${s.months.map((x, i) => `<tr><td><span class="month-dot" style="background:${Model.MONTH_COLORS[i][0]}"></span>${Model.MONTHS[i]}</td><td class="num">${money(x.income)}</td><td class="num">${money(x.expenses)}</td><td class="num ${x.net < 0 ? "neg" : ""}" style="font-weight:500">${money(x.net)}</td></tr>`).join("")}
      </tbody></table></div></div>
      <div class="card"><h2>Every year</h2><table><thead><tr><th>Year</th><th class="num">Income</th><th class="num">Expenses</th><th class="num">Net</th></tr></thead><tbody>
        ${s.years.map((x) => `<tr><td>${x.year}</td><td class="num">${money(x.income, false)}</td><td class="num">${money(x.expenses, false)}</td><td class="num ${x.net < 0 ? "neg" : "pos"}"><b>${money(x.net, false)}</b></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nothing matched yet.</td></tr>`}
      </tbody></table>
      <h3 style="margin-top:14px">Expenses by category · ${ui.rentYear}</h3><table><tbody>${s.byCategory.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${money(c.amount, false)}</td></tr>`).join("") || `<tr><td class="muted">None</td></tr>`}</tbody></table></div>
    </div>
    <div class="card"><h2>Transactions · ${ui.rentYear}</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>
      ${s.list.map((t) => `<tr class="clickable" data-id="${esc(t.id)}"><td class="nowrap"><span class="month-dot" style="background:${Model.MONTH_COLORS[+t.date.slice(5, 7) - 1][0]}"></span>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td>${esc(t.category)}</td><td class="num">${money(t.amount, false)}</td></tr>`).join("")}
    </tbody></table></div></div>`}`;

  const ry = $("#rn-year"); if (ry) ry.onchange = (e) => { ui.rentYear = +e.target.value; renderRental(); };
  $("#rn-save").onclick = async () => { await Store.setCfg("rental", { name: $("#rn-name").value.trim() || "Rental property", match: $("#rn-match").value.trim(), tag: $("#rn-tag").value.trim().toLowerCase() }); toast("Saved."); };
  $$("#tab-rental tr[data-id]").forEach((tr) => (tr.onclick = () => openTx(Store.transactions().find((t) => t.id === tr.dataset.id))));
}

// Compare years lives in js/summary.js

// --------------------------------------------------------------------------------- one-click bills
const dlgBills = $("#dlg-bills");
function openLogBills(y, m) {
  const st = Model.recurringStatus(CFG, Store.transactions(), y, m);
  const todo = st.filter((b) => b.status !== "Paid");
  if (!todo.length) { toast("Every bill is already logged for this month."); return; }
  const day = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(d, new Date(y, m + 1, 0).getDate())).padStart(2, "0")}`;
  $("#lb-title").textContent = `Log ${Model.MONTHS[m]} ${y} bills`;
  $("#lb-body").innerHTML = `<table class="edit-table"><thead><tr><th></th><th>Bill</th><th>Paid from</th><th>Date</th><th class="num">Amount</th></tr></thead><tbody>
    ${todo.map((b, i) => `<tr data-i="${i}"><td><input type="checkbox" class="lb-on" checked></td><td>${esc(b.name)}<div class="hint">${esc(b.category)}</div></td><td class="muted">${esc(b.account)}</td>
      <td><input type="date" class="lb-date" value="${day(b.day)}"></td>
      <td><input type="number" step="0.01" class="lb-amt" value="${b.amount ?? ""}" placeholder="this month's amount" style="width:130px"></td></tr>`).join("")}</tbody></table>`;
  $("#lb-error").textContent = "";
  dlgBills.showModal();
  $("#lb-save").onclick = async () => {
    const out = [];
    for (const tr of $$("#lb-body tr[data-i]")) {
      if (!tr.querySelector(".lb-on").checked) continue;
      const b = todo[+tr.dataset.i], amt = parseFloat(tr.querySelector(".lb-amt").value);
      if (isNaN(amt)) { $("#lb-error").textContent = `Enter an amount for ${b.name} (or untick it).`; return; }
      out.push({ date: tr.querySelector(".lb-date").value, desc: b.name, amount: Model.r2(amt), category: b.category, account: b.account, toAccount: "", notes: "", tags: "", bill: b.name });
    }
    if (out.length) await Store.saveTxs(out);
    dlgBills.close();
    toast(`Logged ${out.length} bill(s).`);
  };
}
$("#lb-cancel").onclick = () => dlgBills.close();

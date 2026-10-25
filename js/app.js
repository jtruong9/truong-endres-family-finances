// UI. Renders each tab from Store (data) + Model (calculations).
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, dash = true) => (dash && Math.abs(n) < 0.005 ? "–" : (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// "2026-10-24" -> "Oct 24, 2026"
const fmtDate = (d) => `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}, ${d.slice(0, 4)}`;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const opts = (list, sel, blank) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : "") +
  list.map((v) => { const [val, lab] = Array.isArray(v) ? v : [v, v]; return `<option value="${esc(val)}"${val === sel ? " selected" : ""}>${esc(lab)}</option>`; }).join("");

const ui = {
  tab: "dashboard",
  year: new Date().getFullYear(),
  owner: "all",
  flowMonth: new Date().getMonth(),
  billMonth: new Date().getMonth(),
  tx: { q: "", account: "", category: "", owner: "all", year: "", flagged: false, page: 0 },
  charts: {},
};
let CFG = null;

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

function ownerChoices() {
  return [["all", "Household"], ["joint", CFG.people.joint], ["p1", CFG.people.p1], ["p2", CFG.people.p2]];
}
function years() {
  const ys = new Set(Store.transactions().map((t) => +t.date.slice(0, 4)));
  ys.add(new Date().getFullYear());
  return [...ys].filter(Boolean).sort((a, b) => b - a);
}

// --------------------------------------------------------------------------------- startup
async function start() {
  if (!Store.supported()) {
    $("#setup").hidden = false; $("#unsupported").hidden = false; $("#btn-pick").hidden = true;
    return;
  }
  Store.onChange(() => { CFG = Model.config(Store.cfg); render(); setStatus(); });
  const status = await Store.init();
  if (status === "ready") { await openApp(() => Store.open()); return; }
  $("#setup").hidden = false;
  if (status === "needs-permission") {
    $("#setup-msg").textContent = "Chrome needs your OK to open the data folder again.";
    $("#btn-regrant").hidden = false;
    $("#regrant-name").textContent = Store.folderName();
  }
}
// One-time upgrade for folders set up before Kelly's name was built in: "Spouse" -> Kelly,
// and the "Spouse Personal" account (plus any transactions in it) -> "Kelly Personal".
async function migrateSpouse() {
  const people = Store.cfg("people", null);
  if (people && people.p2 === "Spouse") await Store.setCfg("people", { ...people, p2: "Kelly", p2Full: "Kelly Endres" });
  const accounts = Store.cfg("accounts", null);
  if (accounts && accounts.some((a) => a.name === "Spouse Personal") && !accounts.some((a) => a.name === "Kelly Personal")) {
    await Store.setCfg("accounts", accounts.map((a) => (a.name === "Spouse Personal" ? { ...a, name: "Kelly Personal", note: "Kelly's spending" } : a)));
  }
  const moved = Store.transactions().filter((t) => t.account === "Spouse Personal" || t.toAccount === "Spouse Personal")
    .map((t) => ({ ...t, account: t.account === "Spouse Personal" ? "Kelly Personal" : t.account, toAccount: t.toAccount === "Spouse Personal" ? "Kelly Personal" : t.toAccount }));
  if (moved.length) await Store.saveTxs(moved);
}

async function openApp(fn) {
  try {
    const info = await fn();
    $("#setup").hidden = true;
    $("#app").hidden = false;
    if (info.problems.length) toast("Couldn't read: " + info.problems.join("; "), 8000);
    await migrateSpouse();
    setStatus(info);
  } catch (e) {
    if (e.name !== "AbortError") { $("#setup").hidden = false; $("#setup-msg").textContent = "Couldn't open the folder: " + e.message; }
  }
}
let fileCount = 0;
function setStatus(info) {
  if (info) fileCount = info.files.length;
  $("#status").textContent = `Data folder: ${Store.folderName()} · ${fileCount} ledger file(s) · this computer writes ledger-${Store.deviceId()}.json · ${Store.transactions().length.toLocaleString()} transactions · updated ${new Date().toLocaleTimeString()}`;
}

$("#btn-pick").onclick = () => openApp(() => Store.pickFolder());
$("#btn-regrant").onclick = () => openApp(() => Store.regrant());
$("#btn-refresh").onclick = async () => { const info = await Store.reload(); setStatus(info); toast("Reloaded from the data folder."); };
// Pick up the other computer's edits when the window regains focus. Skip the Import and Settings
// tabs: closing a file dialog fires this too, and redrawing those forms mid-use clears what was chosen.
window.addEventListener("focus", async () => {
  // Also skip tabs with forms that are typed into (check-in balances, goals, rental, bills)
  if ($("#app").hidden || ["import", "settings", "checkin", "goals", "rental", "bills"].includes(ui.tab) || document.querySelector("dialog[open]")) return;
  setStatus(await Store.reload());
});

$("#tabs").onclick = (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  ui.tab = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $$(".tab").forEach((s) => (s.hidden = s.id !== "tab-" + ui.tab));
  render();
};

function render() {
  if (!CFG || $("#app").hidden) return;
  ({ dashboard: renderDashboard, transactions: renderTransactions, summary: renderSummary, checkin: renderCheckin,
     goals: renderGoals, bills: renderBills, rental: renderRental, import: renderImport, settings: renderSettings, help: renderHelp })[ui.tab]();
}
function renderGoals() {
  $("#tab-goals").innerHTML = goalsTab();
  wireGoals($("#tab-goals"));
}

// --------------------------------------------------------------------------------- dashboard
function renderDashboard() {
  const txs = Store.transactions();
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const tot = Model.monthlyTotals(CFG, txs, y, "all");
  const flows = Model.accountFlows(CFG, txs, y, m);
  const bills = Model.recurringStatus(CFG, txs, y, m);
  const unpaid = bills.filter((b) => b.status !== "Paid");
  const flagged = txs.filter((t) => Model.isPosted(t) && Model.issues(CFG, t).length).length;
  const toReview = txs.filter((t) => t.review).length;
  const personal = flows.filter((f) => f.owner === "p1" || f.owner === "p2");

  const stat = (label, value, sub, cls = "", box = "") => `<div class="stat ${box}"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
  $("#tab-dashboard").innerHTML = `
    ${toReview ? `<div class="card banner"><b>${toReview}</b> imported transaction(s) are waiting to be sorted. They don't count in any totals until you review them. <button class="small primary" id="go-review">Review now</button></div>` : ""}
    <div class="cards">
      ${stat(`Income · ${Model.MONTHS[m]}`, money(tot.income[m], false), "paychecks + other income", "", "income")}
      ${stat(`Spending · ${Model.MONTHS[m]}`, money(tot.spending[m], false), "all accounts, excludes transfers", "", "spend")}
      ${stat(`Saved · ${Model.MONTHS[m]}`, money(tot.savings[m], false), "savings categories", "", "saved")}
      ${stat("Remaining", money(tot.remaining[m], false), "income − savings − spending", tot.remaining[m] < 0 ? "neg" : "pos", "rem")}
      ${personal.map((p) => stat(`${esc(Model.ownerLabel(CFG, p.owner))}'s allowance left`, money(p.net, false), `${esc(p.account)} this month`, p.net < 0 ? "neg" : "")).join("")}
    </div>
    <div class="two">
      <div class="card"><h2>${y}: income vs spending</h2><div class="chart-box"><canvas id="ch-year"></canvas></div></div>
      <div class="card"><h2>${Model.MONTHS[m]} spending by group</h2><div class="chart-box"><canvas id="ch-groups"></canvas></div></div>
    </div>
    <div class="two">
      <div class="card"><h2>Bills not yet paid this month</h2>${unpaid.length ? `<table><tbody>${unpaid.map((b) =>
        `<tr><td>${esc(b.name)}</td><td class="muted">${esc(b.account)}</td><td>day ${b.day}</td><td class="num">${b.amount ? money(b.amount) : "varies"}</td><td><span class="pill ${b.status.split(" ")[0]}">${b.status}</span></td></tr>`).join("")}</tbody></table>`
        : `<p class="muted">${bills.length ? "All recurring bills are paid for this month." : "No recurring bills set up yet. Add them on the Bills tab."}</p>`}</div>
      <div class="card"><h2>Account flows · ${Model.MONTHS[m]}</h2>${flowsTable(flows)}
        <p class="hint">The Hub should net to about $0 once each paycheck is distributed.</p></div>
    </div>
    ${flagged ? `<div class="card"><b>${flagged}</b> transaction(s) need attention (unknown category or account, or a transfer with no To account). <button class="small" id="go-flagged">Show them</button></div>` : ""}`;

  const go = $("#go-flagged");
  if (go) go.onclick = () => { ui.tx = { ...ui.tx, flagged: true, page: 0 }; $('#tabs [data-tab="transactions"]').click(); };
  const gr = $("#go-review");
  if (gr) gr.onclick = () => $('#tabs [data-tab="transactions"]').click();

  chart("ch-year", {
    type: "bar",
    data: { labels: Model.MONTHS, datasets: [
      { label: "Income", data: tot.income, backgroundColor: "#70AD47" },
      { label: "Spending", data: tot.spending, backgroundColor: "#ED7D31" },
      { label: "Saved", data: tot.savings, backgroundColor: "#5B9BD5" }] },
    options: { maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => "$" + v.toLocaleString() } } } },
  });
  const grid = Model.yearGrid(CFG, txs, y, "all");
  const groupSums = {};
  for (const [cat, row] of grid) {
    const c = CFG.categoryByName.get(cat);
    if (!c || c.kind !== "Expense") continue;
    groupSums[c.group] = (groupSums[c.group] || 0) + row[m];
  }
  const g = Object.entries(groupSums).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  chart("ch-groups", {
    type: "bar",
    data: { labels: g.map((x) => x[0]), datasets: [{ label: "Spent", data: g.map((x) => Model.r2(x[1])), backgroundColor: Model.MONTH_COLORS[m][0] }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: (v) => "$" + v.toLocaleString() } } } },
  });
}

function flowsTable(flows) {
  return `<div class="table-wrap"><table><thead><tr><th>Account</th><th>Owner</th><th class="num">Income</th><th class="num">Transfers in</th><th class="num">Spent</th><th class="num">Saved</th><th class="num">Transfers out</th><th class="num">Net</th></tr></thead><tbody>
    ${flows.map((f) => `<tr><td>${esc(f.account)}</td><td class="muted">${esc(Model.ownerLabel(CFG, f.owner))}</td><td class="num">${money(f.income)}</td><td class="num">${money(f.transfersIn)}</td><td class="num">${money(f.spent)}</td><td class="num">${money(f.saved)}</td><td class="num">${money(f.transfersOut)}</td><td class="num ${f.net < 0 ? "neg" : ""}"><b>${money(f.net)}</b></td></tr>`).join("")}
  </tbody></table></div>`;
}

function chart(id, cfg) {
  Chart.defaults.font.family = '"Barlow", "Segoe UI", Arial, sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = "#3B3838";
  if (ui.charts[id]) ui.charts[id].destroy();
  const el = document.getElementById(id);
  if (el) ui.charts[id] = new Chart(el, cfg);
}

// --------------------------------------------------------------------------------- transactions
const PAGE = 100;
function renderTransactions() {
  const f = ui.tx;
  const q = f.q.toLowerCase();
  let rows = Store.transactions().filter((t) => Model.isPosted(t) &&
    (!f.account || t.account === f.account || t.toAccount === f.account) &&
    (!f.category || t.category === f.category) &&
    (!f.year || t.date.startsWith(f.year)) &&
    Model.matchesOwner(CFG, t, f.owner) &&
    (!q || `${t.desc} ${t.notes} ${t.tags} ${t.category} ${t.amount}`.toLowerCase().includes(q)) &&
    (!f.flagged || Model.issues(CFG, t).length));
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const total = rows.reduce((s, t) => s + (Model.kindOf(CFG, t) === "Transfer" ? 0 : t.amount), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  f.page = Math.min(f.page, pages - 1);
  const shown = rows.slice(f.page * PAGE, (f.page + 1) * PAGE);

  $("#tab-transactions").innerHTML = `${reviewSection()}
    <div class="card">
      <h2>All transactions</h2>
      <div class="filters">
        <input type="search" id="tf-q" placeholder="Search description, notes, tags, amount" value="${esc(f.q)}">
        <select id="tf-year">${opts(years().map(String), f.year, "All years")}</select>
        <select id="tf-owner">${opts(ownerChoices(), f.owner)}</select>
        <select id="tf-account">${opts(CFG.accounts.map((a) => a.name), f.account, "All accounts")}</select>
        <select id="tf-category">${opts(CFG.categories.map((c) => c.name), f.category, "All categories")}</select>
        <label><input type="checkbox" id="tf-flagged" ${f.flagged ? "checked" : ""}> Needs attention only</label>
        <span class="spacer"></span>
        <span class="muted">${rows.length.toLocaleString()} rows · total (excl. transfers) <b>${money(total, false)}</b></span>
      </div>
      <div class="table-wrap"><table id="tx-table"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Category</th><th>Account</th><th>Owner</th><th>Notes / Tags</th></tr></thead><tbody>
        ${shown.map((t) => {
          const iss = Model.issues(CFG, t), k = Model.kindOf(CFG, t);
          return `<tr class="clickable${iss.length ? " flag" : ""}" data-id="${esc(t.id)}" title="${esc(iss.join("; "))}">
            <td class="nowrap"><span class="month-dot" style="background:${Model.MONTH_COLORS[+t.date.slice(5, 7) - 1][0]}"></span>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="num ${t.amount < 0 ? "neg" : ""}">${money(t.amount, false)}</td>
            <td>${k !== "Expense" ? `<span class="pill ${k}">${esc(t.category)}</span>` : esc(t.category)}</td>
            <td>${esc(t.account)}${t.toAccount ? ` &rarr; ${esc(t.toAccount)}` : ""}</td>
            <td class="muted">${esc(Model.ownerLabel(CFG, Model.ownerOf(CFG, t)))}</td>
            <td class="muted">${esc(t.notes)}${t.tags ? ` <span class="pill">${esc(t.tags)}</span>` : ""}</td></tr>`;
        }).join("") || `<tr><td colspan="7" class="muted">No transactions match.</td></tr>`}
      </tbody></table></div>
      <div class="pager"><button id="tp-prev" ${f.page === 0 ? "disabled" : ""}>&lsaquo; Newer</button><span>Page ${f.page + 1} of ${pages}</span><button id="tp-next" ${f.page >= pages - 1 ? "disabled" : ""}>Older &rsaquo;</button></div>
    </div>`;

  wireReview();
  const set = (k, v) => { ui.tx[k] = v; ui.tx.page = 0; renderTransactions(); };
  $("#tf-q").oninput = (e) => { clearTimeout(set.h); set.h = setTimeout(() => { set("q", e.target.value); $("#tf-q").focus(); const el = $("#tf-q"); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
  $("#tf-year").onchange = (e) => set("year", e.target.value);
  $("#tf-owner").onchange = (e) => set("owner", e.target.value);
  $("#tf-account").onchange = (e) => set("account", e.target.value);
  $("#tf-category").onchange = (e) => set("category", e.target.value);
  $("#tf-flagged").onchange = (e) => set("flagged", e.target.checked);
  $("#tp-prev").onclick = () => { f.page--; renderTransactions(); };
  $("#tp-next").onclick = () => { f.page++; renderTransactions(); };
  $("#tx-table tbody").onclick = (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) openTx(Store.transactions().find((t) => t.id === tr.dataset.id));
  };
}

// --------------------------------------------------------------------------------- add / edit dialog
const dlgTx = $("#dlg-tx"), formTx = $("#form-tx");
let editing = null;

function openTx(tx) {
  editing = tx || null;
  const t = tx || { date: todayIso(), desc: "", amount: "", category: "", account: ui.lastAccount || "", toAccount: "", notes: "", tags: "" };
  $("#tx-title").textContent = tx ? "Edit transaction" : "Add transaction";
  formTx.category.innerHTML = opts(CFG.categories.map((c) => c.name), t.category, "Choose…");
  formTx.account.innerHTML = opts(CFG.accounts.map((a) => a.name), t.account, "Choose…");
  formTx.toAccount.innerHTML = opts(CFG.accounts.map((a) => a.name), t.toAccount, "Choose…");
  for (const k of ["date", "desc", "amount", "notes", "tags"]) formTx[k].value = t[k] ?? "";
  $("#desc-list").innerHTML = [...new Set(Store.transactions().map((x) => x.desc))].slice(-400).map((d) => `<option value="${esc(d)}">`).join("");
  $("#tx-delete").hidden = !tx;
  $("#tx-save-another").hidden = !!tx;
  $("#tx-error").textContent = "";
  toggleTo();
  dlgTx.showModal();
  formTx.amount.focus();
}
function toggleTo() {
  const isT = (CFG.categoryByName.get(formTx.category.value) || {}).kind === "Transfer";
  $(".to-acct").hidden = !isT;
  if (!isT) formTx.toAccount.value = "";
}
formTx.category.onchange = toggleTo;
// Typing a description you've used before pre-fills its last category/account
formTx.desc.onchange = () => {
  if (editing || formTx.category.value) return;
  const prev = Store.transactions().filter((t) => t.desc === formTx.desc.value).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (prev) { formTx.category.value = prev.category; formTx.account.value = prev.account; toggleTo(); }
};

async function saveTx(keepOpen) {
  const t = {
    ...(editing || {}),
    date: formTx.date.value, desc: formTx.desc.value.trim(), amount: Model.r2(parseFloat(formTx.amount.value)),
    category: formTx.category.value, account: formTx.account.value, toAccount: formTx.toAccount.value,
    notes: formTx.notes.value.trim(), tags: formTx.tags.value.trim(),
  };
  const err = !t.date ? "Pick a date." : !t.desc ? "Enter a description." : isNaN(t.amount) ? "Enter an amount." :
    !t.category ? "Pick a category." : !t.account ? "Pick an account." :
    Model.kindOf(CFG, t) === "Transfer" && !t.toAccount ? "A transfer needs a To account." :
    t.toAccount && t.toAccount === t.account ? "From and To accounts must differ." : "";
  if (err) { $("#tx-error").textContent = err; return; }
  try {
    await Store.saveTx(t);
  } catch (e) { $("#tx-error").textContent = "Couldn't save to the data folder: " + e.message; return; }
  ui.lastAccount = t.account;
  toast(editing ? "Saved." : `Added ${money(t.amount, false)} · ${t.desc}`);
  if (keepOpen) { editing = null; for (const k of ["desc", "amount", "notes", "tags"]) formTx[k].value = ""; formTx.category.value = ""; toggleTo(); formTx.desc.focus(); }
  else dlgTx.close();
}
formTx.onsubmit = (e) => { e.preventDefault(); saveTx(false); };
$("#tx-save-another").onclick = () => saveTx(true);
$("#tx-cancel").onclick = () => dlgTx.close();
$("#tx-delete").onclick = async () => {
  if (!editing || !confirm(`Delete "${editing.desc}" (${money(editing.amount, false)})?`)) return;
  await Store.deleteTx(editing.id);
  dlgTx.close(); toast("Deleted.");
};
$("#btn-add").onclick = () => openTx(null);
document.addEventListener("keydown", (e) => {
  if (e.key === "n" && !e.ctrlKey && !e.metaKey && !$("#app").hidden && !document.querySelector("dialog[open]") && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openTx(null); }
});

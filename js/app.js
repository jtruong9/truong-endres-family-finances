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
// Static markup marks icon spots with data-icon; swap in the SVG once
$$("[data-icon]").forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

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
    // The data was loaded while the app was still hidden, so render() skipped drawing. Draw now.
    CFG = Model.config(Store.cfg);
    render();
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

// ---- Left pull-out menu ----
// Wide window: the menu is docked; the menu button shrinks it to an icon rail (remembered per computer).
// Narrow window: the menu is hidden and the menu button slides it out over the page; picking a page closes it.
const narrow = () => window.matchMedia("(max-width: 900px)").matches;
function setMenu(open) {
  const app = $("#app");
  if (narrow()) {
    app.classList.toggle("sb-open", open);
    $("#sb-scrim").hidden = !open;
  } else {
    app.classList.toggle("sb-collapsed", !open);
    try { localStorage.setItem("tf-menu-collapsed", open ? "0" : "1"); } catch { /* private window: just don't remember */ }
  }
  $("#btn-menu").setAttribute("aria-expanded", String(open));
}
const menuOpen = () => (narrow() ? $("#app").classList.contains("sb-open") : !$("#app").classList.contains("sb-collapsed"));
$("#btn-menu").onclick = () => setMenu(!menuOpen());
$("#sb-scrim").onclick = () => setMenu(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && narrow() && menuOpen()) setMenu(false); });
try { if (localStorage.getItem("tf-menu-collapsed") === "1") $("#app").classList.add("sb-collapsed"); } catch { /* ignore */ }
window.matchMedia("(max-width: 900px)").addEventListener("change", () => { $("#app").classList.remove("sb-open"); $("#sb-scrim").hidden = true; });

$("#tabs").onclick = (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  ui.tab = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  $$(".tab").forEach((s) => (s.hidden = s.id !== "tab-" + ui.tab));
  $("#page-title").textContent = b.querySelector(".sb-label").textContent;
  if (narrow()) setMenu(false);
  window.scrollTo(0, 0);
  render();
};

// Count of bank rows waiting to be sorted, shown on the Transactions menu item
function updateMenuBadge() {
  const txs = Store.transactions();
  const review = txs.filter((t) => t.review).length;
  const flagged = txs.filter((t) => Model.openIssues(CFG, t).length).length;
  const n = review + flagged;
  const el = $("#sb-review-count");
  el.hidden = !n;
  el.textContent = n > 99 ? "99+" : String(n);
  el.classList.toggle("warn", flagged > 0);
  el.title = [review && `${review} imported to review`, flagged && `${flagged} need attention`].filter(Boolean).join(" · ");
}

function render() {
  if (!CFG || $("#app").hidden) return;
  updateMenuBadge();
  ({ dashboard: renderDashboard, transactions: renderTransactions, summary: renderSummary, flow: renderFlow, checkin: renderCheckin,
     goals: renderGoals, bills: renderBills, rental: renderRental, import: renderImport, settings: renderSettings, help: renderHelp })[ui.tab]();
}
function renderGoals() {
  $("#tab-goals").innerHTML = goalsTab();
  wireGoals($("#tab-goals"));
}

// --------------------------------------------------------------------------------- dashboard
// Page header used by every tab: title, one line of context, and actions on the right
const pageHead = (title, sub = "", actions = "") =>
  `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions ? `<div class="actions row">${actions}</div>` : ""}</div>`;
// One-line notice with an action (review waiting, needs attention…)
const notice = (text, btn, id, warn = false) =>
  `<div class="banner${warn ? " warn" : ""}">${icon(warn ? "alert" : "list")}<span>${text}</span><span class="spacer"></span><button class="small" id="${id}">${btn}</button></div>`;

const CHART = { income: "#16A34A", spend: "#2563EB", saved: "#A78BFA", ink: "#111827", grid: "#F0F1F3", tick: "#9CA3AF" };
const moneyAxis = { grid: { color: CHART.grid }, border: { display: false }, ticks: { color: CHART.tick, maxRotation: 0, autoSkip: true, callback: (v) => "$" + (Math.abs(v) >= 1000 ? `${v / 1000}k` : v) } };

function renderDashboard() {
  const txs = Store.transactions();
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const tot = Model.monthlyTotals(CFG, txs, y, "all");
  const flows = Model.accountFlows(CFG, txs, y, m);
  const bills = Model.recurringStatus(CFG, txs, y, m);
  const unpaid = bills.filter((b) => b.status !== "Paid");
  const flagged = txs.filter((t) => Model.openIssues(CFG, t).length).length;
  const toReview = txs.filter((t) => t.review).length;
  const personal = flows.filter((f) => f.owner === "p1" || f.owner === "p2");
  const M = Model.MONTHS[m];

  const stat = (label, value, sub, cls = "") => `<div class="stat"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
  $("#tab-dashboard").innerHTML = `
    ${pageHead(`${M} ${y}`, "This month at a glance")}
    ${toReview ? notice(`${toReview} imported transaction${toReview > 1 ? "s" : ""} to sort`, "Review", "go-review") : ""}
    ${flagged ? notice(`${flagged} transaction${flagged > 1 ? "s" : ""} need attention`, "Review", "go-flagged", true) : ""}
    <div class="cards">
      ${stat("Income", money(tot.income[m], false), "Paychecks and other income")}
      ${stat("Spent", money(tot.spending[m], false), "All accounts")}
      ${stat("Saved", money(tot.savings[m], false), "Savings categories")}
      ${stat("Remaining", money(tot.remaining[m], false), "After saving and spending", tot.remaining[m] < 0 ? "neg" : "")}
      ${personal.map((p) => stat(`${esc(Model.ownerLabel(CFG, p.owner))}'s allowance`, money(p.net, false), "Left this month", p.net < 0 ? "neg" : "")).join("")}
    </div>
    <div class="two">
      <div class="card"><h2>${y}</h2><div class="chart-box"><canvas id="ch-year"></canvas></div></div>
      <div class="card"><h2>Spending in ${M}</h2><div class="chart-box"><canvas id="ch-groups"></canvas></div></div>
    </div>
    <div class="two">
      <div class="card"><h2>Bills due</h2>${unpaid.length ? `<table><tbody>${unpaid.map((b) =>
        `<tr><td>${esc(b.name)}</td><td class="muted">${esc(b.account)}</td><td class="muted">Day ${b.day}</td><td class="num">${b.amount ? money(b.amount) : "Varies"}</td><td><span class="pill ${b.status.split(" ")[0]}">${b.status}</span></td></tr>`).join("")}</tbody></table>`
        : `<p class="muted">${bills.length ? "All paid this month." : "No recurring bills yet."}</p>`}</div>
      <div class="card"><h2>Accounts</h2>${flowsTable(flows)}</div>
    </div>`;

  const go = $("#go-flagged");
  if (go) go.onclick = () => $('#tabs [data-tab="transactions"]').click();
  const gr = $("#go-review");
  if (gr) gr.onclick = () => $('#tabs [data-tab="transactions"]').click();

  const legend = { position: "bottom", align: "start", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 6, boxHeight: 6, padding: 16, color: "#6B7280" } };
  chart("ch-year", {
    type: "bar",
    data: { labels: Model.MONTHS, datasets: [
      { label: "Income", data: tot.income, backgroundColor: CHART.income, borderRadius: 3, barPercentage: .7, categoryPercentage: .7 },
      { label: "Spent", data: tot.spending, backgroundColor: CHART.spend, borderRadius: 3, barPercentage: .7, categoryPercentage: .7 },
      { label: "Saved", data: tot.savings, backgroundColor: CHART.saved, borderRadius: 3, barPercentage: .7, categoryPercentage: .7 }] },
    options: { maintainAspectRatio: false, plugins: { legend }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART.tick } }, y: moneyAxis } },
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
    data: { labels: g.map((x) => x[0]), datasets: [{ label: "Spent", data: g.map((x) => Model.r2(x[1])), backgroundColor: CHART.spend, borderRadius: 3, barThickness: 14 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: moneyAxis, y: { grid: { display: false }, border: { display: false }, ticks: { color: "#374151" } } } },
  });
}

function flowsTable(flows) {
  return `<div class="table-wrap"><table class="flows"><thead><tr><th>Account</th><th>Owner</th><th class="num">Income</th><th class="num">In</th><th class="num">Spent</th><th class="num">Saved</th><th class="num">Out</th><th class="num">Net</th></tr></thead><tbody>
    ${flows.map((f) => `<tr><td>${esc(f.account)}</td><td class="muted">${esc(Model.ownerLabel(CFG, f.owner))}</td><td class="num">${money(f.income)}</td><td class="num">${money(f.transfersIn)}</td><td class="num">${money(f.spent)}</td><td class="num">${money(f.saved)}</td><td class="num">${money(f.transfersOut)}</td><td class="num ${f.net < 0 ? "neg" : ""}" style="font-weight:600">${money(f.net)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function chart(id, cfg) {
  Chart.defaults.font.family = '"Inter", "Segoe UI", system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = "#6B7280";
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
    (Model.matchesOwner(CFG, t, f.owner) || (f.owner === "joint" && Model.ownerParts(CFG, t, "joint").length > 0)) &&
    (!q || `${t.desc} ${t.notes} ${t.tags} ${t.category} ${t.amount}`.toLowerCase().includes(q)) &&
    (!f.flagged || Model.openIssues(CFG, t).length));
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const total = rows.reduce((s, t) => s + (Model.kindOf(CFG, t) === "Transfer" ? 0 : t.amount), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  f.page = Math.min(f.page, pages - 1);
  const shown = rows.slice(f.page * PAGE, (f.page + 1) * PAGE);

  $("#tab-transactions").innerHTML = `${pageHead("Transactions", `${Store.transactions().filter(Model.isPosted).length.toLocaleString()} saved`)}${reviewSection()}${attentionSection()}
    <div class="card">
      <div class="filters">
        <input type="search" id="tf-q" placeholder="Search" value="${esc(f.q)}">
        <select id="tf-year">${opts(years().map(String), f.year, "All years")}</select>
        <select id="tf-owner">${opts(ownerChoices(), f.owner)}</select>
        <select id="tf-account">${opts(CFG.accounts.map((a) => a.name), f.account, "All accounts")}</select>
        <select id="tf-category">${opts(CFG.categories.map((c) => c.name), f.category, "All categories")}</select>
        <label class="muted"><input type="checkbox" id="tf-flagged" ${f.flagged ? "checked" : ""}> Needs attention</label>
        <span class="spacer"></span>
        <span class="muted">${rows.length.toLocaleString()} rows · total (excl. transfers) <b>${money(total, false)}</b></span>
      </div>
      <div class="table-wrap"><table id="tx-table"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th><th>Category</th><th>Account</th><th>Owner</th><th>Notes / Tags</th></tr></thead><tbody>
        ${shown.map((t) => {
          const iss = Model.openIssues(CFG, t).map((i) => i.label), k = Model.kindOf(CFG, t);
          return `<tr class="clickable${iss.length ? " flag" : ""}" data-id="${esc(t.id)}" title="${esc(iss.join("; "))}">
            <td class="nowrap"><span class="month-dot" style="background:${Model.MONTH_COLORS[+t.date.slice(5, 7) - 1][0]}"></span>${fmtDate(t.date)}</td><td>${esc(t.desc)}</td><td class="num ${t.amount < 0 ? "neg" : ""}">${money(t.amount, false)}</td>
            <td>${k !== "Expense" ? `<span class="pill ${k}">${esc(t.category)}</span>` : esc(t.category)}</td>
            <td class="nowrap">${esc(t.account)}${t.toAccount ? ` &rarr; ${esc(t.toAccount)}` : ""}</td>
            <td class="muted">${esc(Model.ownerLabel(CFG, Model.ownerOf(CFG, t)))}</td>
            <td class="muted">${esc(t.notes)}${t.tags ? ` <span class="pill">${esc(t.tags)}</span>` : ""}</td></tr>`;
        }).join("") || `<tr><td colspan="7" class="muted">No transactions match.</td></tr>`}
      </tbody></table></div>
      <div class="pager"><button id="tp-prev" ${f.page === 0 ? "disabled" : ""}>&lsaquo; Newer</button><span>Page ${f.page + 1} of ${pages}</span><button id="tp-next" ${f.page >= pages - 1 ? "disabled" : ""}>Older &rsaquo;</button></div>
    </div>`;

  wireReview();
  wireAttention();
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
// Transfers need a To account. Savings can name one too (the account the money was put into, e.g.
// Joint Savings): it counts as the payer's savings and raises that account's balance.
function toggleTo() {
  const kind = (CFG.categoryByName.get(formTx.category.value) || {}).kind;
  const show = kind === "Transfer" || kind === "Savings";
  $(".to-acct").hidden = !show;
  $(".to-acct .to-label").textContent = kind === "Savings" ? "Put into (optional)" : "To account";
  if (!show) formTx.toAccount.value = "";
  // A savings entry from a personal account usually goes into the joint savings account
  if (kind === "Savings" && !formTx.toAccount.value && !editing) {
    const from = CFG.accountByName.get(formTx.account.value), sav = CFG.accounts.find((a) => a.type === "Savings" && a.owner === "joint");
    if (sav && from && from.name !== sav.name && from.type !== "Savings") formTx.toAccount.value = sav.name;
  }
}
formTx.account.addEventListener("change", toggleTo);
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
  // Keep "leave as is" marks only for problems the edited transaction still has
  if (t.ackIssues) {
    const still = new Set(Model.issueList(CFG, t).map((i) => i.sig));
    t.ackIssues = t.ackIssues.filter((s) => still.has(s));
    if (!t.ackIssues.length) delete t.ackIssues;
  }
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

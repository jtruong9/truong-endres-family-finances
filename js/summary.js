// Summary page (year report + compare years). Scoped under .fx; styles in css/summary.css.
// Hovering a group or total number shows what it adds up (sumTip). Loaded after features.js, before app2.js.
"use strict";

// Whole dollars for the table: $12,189
const kmoney = (n) => (Math.abs(n) < 0.005 ? "–" : `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`);

// Tiny inline trend line (12 months). Zero-filled future months are left off.
function sparkline(vals, upto, color = "#9CA3AF") {
  const v = vals.slice(0, Math.max(1, upto));
  const max = Math.max(...v, 0), min = Math.min(...v, 0), w = 84, h = 22, span = max - min || 1, pad = 3;
  const pts = v.map((x, i) => `${v.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (v.length - 1)},${(h - 3 - ((x - min) / span) * (h - 6)).toFixed(1)}`).join(" ");
  const last = pts.split(" ").pop().split(",");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2" fill="${color}"/></svg>`;
}

// Change vs the same months last year: { text, cls } (good/bad depends on whether up is good)
function yoy(cur, prev, upIsGood, label) {
  if (!prev) return { text: `no data for ${label}`, cls: "flat" };
  const ch = (cur - prev) / Math.abs(prev);
  if (Math.abs(ch) < 0.005) return { text: `same as ${label}`, cls: "flat" };
  const good = upIsGood ? ch > 0 : ch < 0;
  return { text: `${ch > 0 ? "+" : "−"}${Math.abs(ch * 100).toFixed(0)}% vs ${label}`, cls: good ? "good" : "bad" };
}

ui.sumCollapsed = ui.sumCollapsed || {};

// Categories to draw: the real list, plus "From Justin"-style rows the Joint view adds for savings
// put into a joint account (Model.ownerParts). Those count as Income and aren't saved anywhere.
function summaryCategories(keys) {
  const extra = [...new Set(keys)].filter((k) => k.startsWith(Model.FROM_PREFIX) && !CFG.categoryByName.has(k))
    .map((name) => ({ name, group: "Income", kind: "Income", budget: null, putIn: true }));
  return [...CFG.categories, ...extra];
}

// Month column colors come from Model.MONTH_COLORS (one source). Classes m0..m11 get:
//   --t   faint tint for the whole column      --mc  the month's color (thin bar on the header)
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => `rgba(${hexRgb(h).join(",")},${a})`;
function ensureMonthStyle() {
  if (document.getElementById("fx-month-style")) return;
  const el = document.createElement("style");
  el.id = "fx-month-style";
  el.textContent = Model.MONTH_COLORS.map(([c], i) =>
    `.fx-table .m${i}{--t:${rgba(c, 0.08)};--mc:${c}}.fx-table .m${i}.cur{--t:${rgba(c, 0.16)}}`).join("\n");
  document.head.appendChild(el);
}

function renderSummary() {
  const v = ui.summaryView || "year";
  hideSumTip();
  const actions = `
    <div class="seg"><button data-view="year" class="${v === "year" ? "on" : ""}">Year</button><button data-view="compare" class="${v === "compare" ? "on" : ""}">Compare years</button></div>
    ${v === "year" ? `<select id="sm-year">${opts(years().map(String), String(ui.year))}</select>` : ""}
    <select id="sm-owner">${opts(ownerChoices(), ui.owner)}</select>
    <button id="sm-export">${icon("download")}Export</button>`;
  const head = pageHead(v === "year" ? `Summary ${ui.year}` : "Compare years", v === "year" ? "Every category, month by month" : "Every category, year by year", actions);
  $("#tab-summary").innerHTML = `<div class="fx">${head}${v === "year" ? yearView() : compareView()}</div>`;

  $$("#tab-summary .seg button").forEach((b) => (b.onclick = () => { ui.summaryView = b.dataset.view; renderSummary(); }));
  const ys = $("#sm-year"); if (ys) ys.onchange = (e) => { ui.year = +e.target.value; renderSummary(); };
  $("#sm-owner").onchange = (e) => { ui.owner = e.target.value; renderSummary(); };
  $("#sm-export").onclick = () => Importers.exportXlsx(CFG, Store.transactions(), `Truong_Finance_${todayIso()}.xlsx`);
  if (v === "year") wireYearView(); else { const pm = $("#cmp-pm"); if (pm) pm.onchange = (e) => { ui.cmpPerMonth = e.target.checked; renderSummary(); }; }
}

// --------------------------------------------------------------------------------- year view
function yearView() {
  const txs = Store.transactions();
  const y = ui.year, owner = ui.owner;
  const grid = Model.yearGrid(CFG, txs, y, owner);
  const tot = Model.monthlyTotals(CFG, txs, y, owner);
  const prevTot = Model.monthlyTotals(CFG, txs, y - 1, owner);
  const n = Model.monthsElapsed(y);
  const now = new Date();
  const curMonth = y === now.getFullYear() ? now.getMonth() : -1;
  const upto = curMonth >= 0 ? curMonth + 1 : 12;
  const sum = (a, k = 12) => a.slice(0, k).reduce((s, x) => s + x, 0);
  const zeros = () => Array(12).fill(0);

  // Headline numbers: year-to-date, compared with the same months last year
  const inc = sum(tot.income), spent = sum(tot.spending), saved = sum(tot.savings), rem = sum(tot.remaining);
  const pInc = sum(prevTot.income, upto), pSpent = sum(prevTot.spending, upto);
  const rate = inc ? saved / inc : 0;
  const cmpLabel = upto === 12 ? `${y - 1}` : `${Model.MONTHS[0]}–${Model.MONTHS[upto - 1]} ${y - 1}`;
  const kpi = (label, value, delta, spark, color) => `<div class="fx-kpi">
      <div class="fx-kpi-label">${label}</div><div class="fx-kpi-value">${value}</div>
      <div class="fx-kpi-foot"><span class="fx-delta ${delta.cls}">${delta.text}</span>${spark ? sparkline(spark, upto, color) : ""}</div></div>`;
  const cards = `<div class="fx-kpis">
    ${kpi("Income", money(inc, false), yoy(inc, pInc, true, cmpLabel), tot.income, CHART.income)}
    ${kpi("Spent", money(spent, false), yoy(spent, pSpent, false, cmpLabel), tot.spending, CHART.spend)}
    ${kpi("Saved", money(saved, false), { text: `${(rate * 100).toFixed(1)}% of income`, cls: rate >= 0.15 ? "good" : "flat" }, tot.savings, CHART.saved)}
    ${kpi("Remaining", money(rem, false), { text: `avg ${money(rem / n, false)}/month`, cls: rem < 0 ? "bad" : "good" }, tot.remaining, rem < 0 ? "#B91C1C" : CHART.ink)}
  </div>`;

  // Table. Every row gets a data-key; the sum rows (groups and the three totals) also get an entry in
  // `sums` listing what they add up, which the hover breakdown reads.
  const showBudget = CFG.categories.some((c) => +c.budget > 0);
  ensureMonthStyle();
  const mc = (i) => `mc m${i}${i === curMonth ? " cur" : ""}`;   // month-column classes
  const monthHead = Model.MONTHS.map((m, i) => `<th class="num fx-m ${mc(i)}">${i === curMonth ? '<span class="fx-now" title="This month">Now</span>' : ""}${m}</th>`).join("");
  const cols = 15 + (showBudget ? 1 : 0) - 1;
  const sums = {};
  const spentLines = [], savedLines = [], incomeLines = [];

  let body = "";
  const allCats = summaryCategories(grid.keys());
  CFG.groups.forEach((g, gi) => {
    const cats = allCats.filter((c) => c.group === g && c.kind !== "Transfer")
      .filter((c) => (grid.get(c.name) || []).some((x) => x !== 0) || +c.budget > 0);
    if (!cats.length) return;
    const mixed = cats.some((c) => c.kind === "Income") && cats.some((c) => c.kind !== "Income");
    const collapsed = !!ui.sumCollapsed[g];
    const gKey = `g${gi}`, catKey = (ci) => `c${gi}-${ci}`;
    const valsOf = (c) => grid.get(c.name) || zeros();
    const sub = zeros();
    cats.forEach((c) => valsOf(c).forEach((x, i) => (sub[i] += mixed && c.kind !== "Income" ? -x : x)));
    const sign = (x) => (mixed ? (x < -0.005 ? " neg" : x > 0.005 ? " pos" : "") : "");
    const subYear = sum(sub);

    // What this group row adds up, and its share of the Spent / Saved / Remaining totals.
    // Collapsed: light up the group row instead, when every category in it is of that kind.
    const lightUp = (ci, kind) => (!collapsed ? [catKey(ci)] : cats.every((c) => c.kind === kind) ? [gKey] : []);
    sums[gKey] = { title: g, total: mixed ? "Net" : "Total",
      lines: cats.map((c, ci) => ({ label: c.name, vals: valsOf(c), minus: mixed && c.kind !== "Income", rows: collapsed ? [] : [catKey(ci)] })) };
    const spentIdx = cats.map((c, ci) => (c.kind === "Expense" ? ci : -1)).filter((ci) => ci >= 0);
    if (spentIdx.length) {
      const vals = zeros();
      spentIdx.forEach((ci) => valsOf(cats[ci]).forEach((x, i) => (vals[i] += x)));
      spentLines.push({ label: mixed ? `${g} (costs)` : g, vals,
        rows: !collapsed ? spentIdx.map(catKey) : spentIdx.length === cats.length ? [gKey] : [] });
    }
    cats.forEach((c, ci) => {
      if (c.kind === "Savings") savedLines.push({ label: c.name, vals: valsOf(c), rows: lightUp(ci, "Savings") });
      if (c.kind === "Income") incomeLines.push({ label: c.name, vals: valsOf(c), rows: lightUp(ci, "Income") });
    });

    const spark = sparkline(sub, upto, "#6B7280");
    body += `<tr class="fx-group" data-group="${esc(g)}" data-key="${gKey}" data-sum="${gKey}">
      <td class="fx-sticky"><div class="fx-catname"><button class="fx-caret" aria-label="Show or hide">${icon(collapsed ? "chevronRight" : "chevronDown")}</button>${esc(g)} <span class="fx-count">${cats.length}</span>${mixed ? ' <span class="fx-net" title="Income minus costs">net</span>' : ""}</div>${spark}</td>
      ${sub.map((x, i) => `<td class="num sumable ${mc(i)}${sign(x)}">${kmoney(x)}</td>`).join("")}
      <td class="num sumable fx-year${sign(subYear)}">${kmoney(subYear)}</td><td class="num sumable${sign(subYear)}">${kmoney(subYear / n)}</td>
      ${showBudget ? "<td></td>" : ""}</tr>`;
    if (collapsed) return;
    cats.forEach((c, ci) => {
      const vals = valsOf(c);
      const yr = sum(vals), avg = yr / n, b = +c.budget > 0 ? +c.budget : null;
      const pct = b ? avg / b : 0;
      body += `<tr class="fx-row" data-key="${catKey(ci)}">
        <td class="fx-sticky fx-cat"${c.putIn ? ' title="Savings put into a joint account from a personal account. Counted here so the Joint view balances."' : ""}><div class="fx-catname">${esc(c.name)}${c.putIn ? ' <span class="fx-count">put in</span>' : ""}</div>${sparkline(vals, upto)}</td>
        ${vals.map((x, i) => `<td class="num fx-cell ${mc(i)}"${x ? ` title="${Model.MONTHS[i]}: ${money(x, false)}"` : ""}>${x ? kmoney(x) : '<span class="fx-zero">–</span>'}</td>`).join("")}
        <td class="num fx-year" title="${money(yr, false)}">${kmoney(yr)}</td><td class="num" title="${money(avg, false)}">${kmoney(avg)}</td>
        ${showBudget ? `<td class="fx-budget">${b ? `<div class="fx-meter ${pct > 1 && c.kind === "Expense" ? "over" : ""}"><span style="width:${Math.min(100, pct * 100).toFixed(0)}%"></span></div><div class="fx-meter-label">${money(avg, false)} / ${money(b, false)}</div>` : ""}</td>` : ""}
</tr>`;
    });
  });

  // Category names not in the list still count as spending (Model.kindOf defaults to Expense)
  const unknown = [...grid.keys()].filter((k) => !allCats.some((c) => c.name === k) && grid.get(k).some((x) => x !== 0));
  if (unknown.length) {
    body += `<tr class="fx-group warn" id="fx-unknown"><td class="fx-sticky" colspan="${cols}">${icon("alert")} Uncategorized / unknown categories: <a href="#" id="fx-go-fix">fix them or leave them as is on Transactions</a></td></tr>`;
    const vals = zeros();
    unknown.forEach((k, j) => {
      const row = grid.get(k);
      row.forEach((x, i) => (vals[i] += x));
      body += `<tr class="fx-row" data-key="u${j}"><td class="fx-sticky fx-cat">${esc(k || "(blank)")}</td>${row.map((x, i) => `<td class="num fx-cell ${mc(i)}">${x ? kmoney(x) : '<span class="fx-zero">–</span>'}</td>`).join("")}
        <td class="num fx-year">${kmoney(sum(row))}</td><td class="num">${kmoney(sum(row) / n)}</td>${showBudget ? "<td></td>" : ""}</tr>`;
    });
    spentLines.push({ label: "Unknown categories", vals, rows: unknown.map((_, i) => `u${i}`) });
  }

  const totalOf = (lines) => lines.reduce((acc, l) => acc.map((x, i) => x + l.vals[i]), zeros());
  sums.spent = { title: "Spent", total: "Total", lines: spentLines };
  sums.saved = { title: "Saved", total: "Total", lines: savedLines };
  sums.rem = { title: "Remaining", total: "Remaining", lines: [
    { label: "Income", vals: totalOf(incomeLines), rows: incomeLines.flatMap((l) => l.rows) },
    { label: "Saved", vals: tot.savings, minus: true, rows: ["saved"] },
    { label: "Spent", vals: tot.spending, minus: true, rows: ["spent"] }] };

  const foot = (label, vals, key) => `<tr class="fx-total" data-key="${key}" data-sum="${key}"><td class="fx-sticky">${label}</td>
    ${vals.map((x, i) => `<td class="num sumable ${mc(i)} ${key === "rem" ? (x < -0.005 ? "neg" : x > 0.005 ? "pos" : "") : ""}">${kmoney(x)}</td>`).join("")}
    <td class="num sumable fx-year ${key === "rem" ? (sum(vals) < 0 ? "neg" : "pos") : ""}">${kmoney(sum(vals))}</td><td class="num sumable">${kmoney(sum(vals) / n)}</td>${showBudget ? "<td></td>" : ""}</tr>`;

  const table = `<div class="fx-card">
    <div class="fx-card-head"><h2>By category</h2>
      <div class="fx-legend">Hover a group or total to see what it adds up · averages over ${n} month${n > 1 ? "s" : ""}</div>
      <span class="spacer"></span><button class="small ghost" id="fx-expand">${Object.values(ui.sumCollapsed).some(Boolean) ? "Expand all" : "Collapse all"}</button></div>
    <div class="fx-tablebox"><table class="fx-table fx-year-table">
      <thead><tr><th class="fx-sticky">Category</th>${monthHead}<th class="num fx-tot">Year</th><th class="num fx-tot">Avg/mo</th>${showBudget ? '<th class="fx-tot">Budget</th>' : ""}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot>${foot("Spent", tot.spending, "spent")}${foot("Saved", tot.savings, "saved")}${foot("Remaining", tot.remaining, "rem")}</tfoot>
    </table></div></div>`;

  const chartCard = `<div class="fx-grid2">
    <div class="fx-card"><div class="fx-card-head"><h2>Income vs. spending</h2></div><div class="fx-chart"><canvas id="fx-ch-flow"></canvas></div></div>
    <div class="fx-card"><div class="fx-card-head"><h2>Spending by group</h2></div><div class="fx-chart"><canvas id="fx-ch-groups"></canvas></div></div>
  </div>`;

  const flows = `<div class="fx-card"><div class="fx-card-head"><h2>Account flows</h2>
      <select id="sm-month">${opts(Model.MONTHS.map((m, i) => [String(i), `${m} ${y}`]), String(ui.flowMonth))}</select>
      <span class="hint">The Joint Hub should net to about $0 after a paycheck is split.</span></div>
    ${flowsTable(Model.accountFlows(CFG, txs, y, ui.flowMonth))}</div>`;

  ui._sumChartData = { tot, grid };
  ui._sums = { sums, n };
  return cards + chartCard + table + flows;
}

// ---- hover breakdown: a small card next to a group/total cell listing what it adds up ----
function sumTipEl() {
  let el = document.getElementById("fx-sumtip");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx-sumtip";
    el.className = "fx-sumtip";
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}
function hideSumTip() {
  const el = document.getElementById("fx-sumtip");
  if (el) el.hidden = true;
  $$("#tab-summary .sum-on, #tab-summary .sum-part").forEach((td) => td.classList.remove("sum-on", "sum-part", "sum-minus"));
}
window.addEventListener("scroll", hideSumTip, { passive: true });

// col 0..11 = a month, 12 = the Year column, 13 = Avg/mo
function showSumTip(td, key, col) {
  const { sums, n } = ui._sums || {};
  const s = sums && sums[key];
  if (!s) return;
  const at = (vals) => (col < 12 ? vals[col] : vals.reduce((a, b) => a + b, 0) / (col === 12 ? 1 : n));
  const lines = s.lines.map((l) => ({ ...l, v: at(l.vals) })).filter((l) => Math.abs(l.v) >= 0.005);
  const total = lines.reduce((a, l) => a + (l.minus ? -l.v : l.v), 0);

  // Light up the cell and the cells it adds up, in the same column
  hideSumTip();
  td.classList.add("sum-on");
  const table = td.closest("table");
  for (const l of lines) for (const k of l.rows) {
    const cell = table.querySelector(`tr[data-key="${k}"]`)?.cells[td.cellIndex];
    if (cell && !cell.querySelector(".fx-zero")) cell.classList.add("sum-part", ...(l.minus ? ["sum-minus"] : []));
  }

  // Labels are category names typed by the user: build with textContent
  const el = sumTipEl();
  el.replaceChildren();
  const add = (cls, ...texts) => {
    const d = document.createElement("div");
    d.className = cls;
    for (const t of texts) { const sp = document.createElement("span"); sp.textContent = t; d.appendChild(sp); }
    el.appendChild(d);
  };
  const colName = col < 12 ? `${Model.MONTHS[col]} ${ui.year}` : col === 12 ? `${ui.year} total` : `${ui.year} average per month`;
  const hd = document.createElement("h4");
  hd.textContent = `${s.title} · ${colName}`;
  el.appendChild(hd);
  const MAX = 12;
  lines.slice(0, MAX).forEach((l) => add(`ln${l.minus ? " minus" : ""}`, l.label, `${l.minus ? "−" : ""}${money(Math.abs(l.v), false)}`));
  if (lines.length > MAX) {
    const rest = lines.slice(MAX).reduce((a, l) => a + (l.minus ? -l.v : l.v), 0);
    add("ln more", `+ ${lines.length - MAX} more`, money(rest, false));
  }
  if (!lines.length) add("ln more", "Nothing here", "");
  add("eq", s.total, money(Model.r2(total), false));

  // Place it beside the cell, kept inside the window
  el.hidden = false;
  const r = td.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let x = r.right + 8;
  if (x + w > innerWidth - 8) x = r.left - w - 8;
  const top = Math.max(8, Math.min(r.top - 6, innerHeight - h - 8));
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${top}px`;
}

function wireYearView() {
  $("#sm-month").onchange = (e) => { ui.flowMonth = +e.target.value; renderSummary(); };
  const fix = $("#fx-go-fix");
  if (fix) fix.onclick = (e) => { e.preventDefault(); $('#tabs [data-tab="transactions"]').click(); };
  // Darken the month name over the column under the mouse; on a sum row, show what it adds up
  const table = $("#tab-summary .fx-table");
  const heads = [...table.querySelectorAll("thead th")];
  let hov = -1, tipCell = null;
  const setHov = (i) => { if (i === hov) return; if (heads[hov]) heads[hov].classList.remove("hov"); hov = i; if (i > 0 && heads[i]) heads[i].classList.add("hov"); };
  table.addEventListener("mouseover", (e) => {
    const td = e.target.closest("tbody td, tfoot td");
    setHov(td && !td.hasAttribute("colspan") ? td.cellIndex : -1);
    const sumCell = td && td.classList.contains("sumable") ? td : null;
    if (sumCell === tipCell) return;
    tipCell = sumCell;
    if (sumCell) showSumTip(sumCell, sumCell.parentElement.dataset.sum, sumCell.cellIndex - 1); else hideSumTip();
  });
  table.addEventListener("mouseleave", () => { setHov(-1); tipCell = null; hideSumTip(); });
  $$("#tab-summary .fx-group[data-group]").forEach((tr) => (tr.onclick = () => { const g = tr.dataset.group; ui.sumCollapsed[g] = !ui.sumCollapsed[g]; renderSummary(); }));
  $("#fx-expand").onclick = () => {
    const anyCollapsed = Object.values(ui.sumCollapsed).some(Boolean);
    ui.sumCollapsed = {};
    if (!anyCollapsed) CFG.groups.forEach((g) => (ui.sumCollapsed[g] = true));
    renderSummary();
  };
  const { tot, grid } = ui._sumChartData;
  const legend = { position: "bottom", align: "start", labels: { usePointStyle: true, pointStyle: "circle", boxWidth: 6, boxHeight: 6, padding: 16, color: "#6B7280" } };
  const bar = { borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.7, order: 1 };
  chart("fx-ch-flow", {
    type: "bar",
    data: { labels: Model.MONTHS, datasets: [
      { type: "line", label: "Remaining", data: tot.remaining, borderColor: CHART.ink, backgroundColor: CHART.ink, borderWidth: 1.5, pointRadius: 2, tension: 0.3, order: 0 },
      { label: "Income", data: tot.income, backgroundColor: CHART.income, ...bar },
      { label: "Spent", data: tot.spending, backgroundColor: CHART.spend, ...bar },
      { label: "Saved", data: tot.savings, backgroundColor: CHART.saved, ...bar }] },
    options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y, false)}` } } },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: CHART.tick } }, y: moneyAxis } },
  });
  const groupTotals = {};
  for (const [cat, row] of grid) {
    const c = CFG.categoryByName.get(cat);
    if (!c || c.kind !== "Expense") continue;
    groupTotals[c.group] = (groupTotals[c.group] || 0) + row.reduce((a, b) => a + b, 0);
  }
  const g = Object.entries(groupTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  chart("fx-ch-groups", {
    type: "bar",
    data: { labels: g.map((x) => x[0]), datasets: [{ label: "Spent", data: g.map((x) => Model.r2(x[1])), backgroundColor: CHART.spend, borderRadius: 3, barThickness: 14 }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.x, false) } } },
      scales: { x: moneyAxis, y: { grid: { display: false }, border: { display: false }, ticks: { color: "#374151" } } } },
  });
}

// --------------------------------------------------------------------------------- compare years
function compareView() {
  const c = Model.yearCompare(CFG, Store.transactions(), ui.owner);
  const ys = c.years.slice(-6);
  if (ys.length < 2) return `<div class="fx-card"><p class="muted">Need at least two years of data to compare.</p></div>`;
  const perMonth = !!ui.cmpPerMonth;
  const val = (cat, y) => { const v = (c.totals.get(cat) || {})[y] || 0; return perMonth ? v / c.months[y] : v; };
  const last = ys[ys.length - 1], prev = ys[ys.length - 2];
  let body = "";
  const allCats = summaryCategories(c.totals.keys());
  for (const g of CFG.groups) {
    const cats = allCats.filter((x) => x.group === g && x.kind !== "Transfer" && ys.some((y) => val(x.name, y)));
    if (!cats.length) continue;
    const kind = cats[0].kind;
    const gsum = (y) => cats.reduce((s, x) => s + val(x.name, y), 0);
    const line = (name, v, cls) => {
      const a = v(prev), b = v(last), ch = a ? (b - a) / Math.abs(a) : null;
      const good = ch == null ? "" : kind === "Expense" ? (ch > 0.05 ? "bad" : ch < -0.05 ? "good" : "flat") : ch > 0.05 ? "good" : ch < -0.05 ? "bad" : "flat";
      return `<tr class="${cls}"><td class="fx-sticky ${cls ? "" : "fx-cat"}">${esc(name)}</td>${ys.map((y) => `<td class="num">${money(Model.r2(v(y)))}</td>`).join("")}
        <td class="fx-trend">${sparkline(ys.map(v), ys.length, cls ? "#6B7280" : "#9CA3AF")}</td>
        <td class="num">${ch == null ? "" : `<span class="fx-delta ${good}">${ch > 0 ? "+" : ch < 0 ? "−" : ""}${Math.abs(ch * 100).toFixed(0)}%</span>`}</td></tr>`;
    };
    body += line(g, gsum, "fx-group static");
    for (const x of cats) body += line(x.name, (y) => val(x.name, y), "");
  }
  return `<div class="fx-card">
    <div class="fx-card-head"><h2>Category by year</h2>
      <label class="fx-check"><input type="checkbox" id="cmp-pm" ${perMonth ? "checked" : ""}> Average per month</label>
      <span class="hint">${perMonth ? `Per-month averages make ${last} (${c.months[last]} months so far) fair to compare.` : `Full-year totals. ${last} has only ${c.months[last]} month(s) so far.`} Last column: change ${prev} → ${last}.</span></div>
    <div class="table-wrap"><table class="fx-table">
      <thead><tr><th class="fx-sticky">Category</th>${ys.map((y) => `<th class="num">${y}</th>`).join("")}<th>Trend</th><th class="num">${prev}→${last}</th></tr></thead>
      <tbody>${body}</tbody></table></div></div>`;
}

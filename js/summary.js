// Summary page (year report + compare years), "clean fintech" look. Scoped under .fx so the rest
// of the app keeps its own styling. Loaded after features.js, before app2.js.
"use strict";

// Whole dollars for group and total rows: $12,189
const kmoney = (n) => (Math.abs(n) < 0.005 ? "–" : `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`);

// Tiny inline trend line (12 months). Zero-filled future months are left off.
function sparkline(vals, upto, color = "#2563EB") {
  const v = vals.slice(0, Math.max(1, upto));
  const max = Math.max(...v, 0), min = Math.min(...v, 0), w = 84, h = 22, span = max - min || 1;
  const pts = v.map((x, i) => `${v.length === 1 ? w / 2 : (i * w) / (v.length - 1)},${(h - 2 - ((x - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  const last = pts.split(" ").pop().split(",");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${color}"/></svg>`;
}

// Change vs the same months last year: { text, cls } (good/bad depends on whether up is good)
function yoy(cur, prev, upIsGood, label) {
  if (!prev) return { text: `no data for ${label}`, cls: "flat" };
  const ch = (cur - prev) / Math.abs(prev);
  if (Math.abs(ch) < 0.005) return { text: `same as ${label}`, cls: "flat" };
  const good = upIsGood ? ch > 0 : ch < 0;
  return { text: `${ch > 0 ? "▲" : "▼"} ${Math.abs(ch * 100).toFixed(0)}% vs ${label}`, cls: good ? "good" : "bad" };
}

ui.sumCollapsed = ui.sumCollapsed || {};

// Month column colors come from Model.MONTH_COLORS (one source). Classes m0..m11 get:
//   --t   light tint for the whole column      --mc  the month's color (header bar, NOW chip)
//   --mcd darker version for the current-month column edges
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgba = (h, a) => `rgba(${hexRgb(h).join(",")},${a})`;
const shade = (h, f) => `rgb(${hexRgb(h).map((v) => Math.round(v * (1 - f))).join(",")})`;
function ensureMonthStyle() {
  if (document.getElementById("fx-month-style")) return;
  const el = document.createElement("style");
  el.id = "fx-month-style";
  el.textContent = Model.MONTH_COLORS.map(([c], i) =>
    `.fx-table .m${i}{--t:${rgba(c, 0.13)};--mc:${c};--mcd:${shade(c, 0.35)}}.fx-table .m${i}.cur{--t:${rgba(c, 0.24)}}`).join("\n");
  document.head.appendChild(el);
}

function renderSummary() {
  const v = ui.summaryView || "year";
  const head = `
    <div class="fx-head">
      <div><div class="fx-eyebrow">Summary</div><h1 class="fx-title">${v === "year" ? `${ui.year} overview` : "Compare years"}</h1></div>
      <div class="fx-controls">
        <div class="fx-seg"><button data-view="year" class="${v === "year" ? "on" : ""}">Year</button><button data-view="compare" class="${v === "compare" ? "on" : ""}">Compare years</button></div>
        ${v === "year" ? `<select id="sm-year" class="fx-select">${opts(years().map(String), String(ui.year))}</select>` : ""}
        <select id="sm-owner" class="fx-select">${opts(ownerChoices(), ui.owner)}</select>
        <button id="sm-export" class="fx-btn">Export</button>
      </div>
    </div>`;
  $("#tab-summary").innerHTML = `<div class="fx">${head}${v === "year" ? yearView() : compareView()}</div>`;

  $$("#tab-summary .fx-seg button").forEach((b) => (b.onclick = () => { ui.summaryView = b.dataset.view; renderSummary(); }));
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

  // Headline cards: year-to-date, compared with the same months last year
  const inc = sum(tot.income), spent = sum(tot.spending), saved = sum(tot.savings), rem = sum(tot.remaining);
  const pInc = sum(prevTot.income, upto), pSpent = sum(prevTot.spending, upto), pSaved = sum(prevTot.savings, upto);
  const rate = inc ? saved / inc : 0;
  const cmpLabel = upto === 12 ? `${y - 1}` : `${Model.MONTHS[0]}–${Model.MONTHS[upto - 1]} ${y - 1}`;
  const kpi = (label, value, delta, spark, color) => `<div class="fx-kpi">
      <div class="fx-kpi-label">${label}</div><div class="fx-kpi-value">${value}</div>
      <div class="fx-kpi-foot"><span class="fx-delta ${delta.cls}">${delta.text}</span>${spark ? sparkline(spark, upto, color) : ""}</div></div>`;
  const cards = `<div class="fx-kpis">
    ${kpi("Income", money(inc, false), yoy(inc, pInc, true, cmpLabel), tot.income, "#16A34A")}
    ${kpi("Spent", money(spent, false), yoy(spent, pSpent, false, cmpLabel), tot.spending, "#2563EB")}
    ${kpi("Saved", money(saved, false), { text: `${(rate * 100).toFixed(1)}% of income`, cls: rate >= 0.15 ? "good" : "flat" }, tot.savings, "#7C3AED")}
    ${kpi("Remaining", money(rem, false), { text: `avg ${money(rem / n, false)}/month`, cls: rem < 0 ? "bad" : "good" }, tot.remaining, rem < 0 ? "#DC2626" : "#16A34A")}
  </div>`;

  // Table
  const showBudget = CFG.categories.some((c) => +c.budget > 0);
  ensureMonthStyle();
  const mc = (i) => `mc m${i}${i === curMonth ? " cur" : ""}`;   // month-column classes
  const monthHead = Model.MONTHS.map((m, i) => `<th class="num fx-m ${mc(i)}">${i === curMonth ? '<span class="fx-now" title="This month">Now</span>' : ""}${m}</th>`).join("");
  const cols = 15 + (showBudget ? 1 : 0);

  let body = "";
  const seen = new Set();
  for (const g of CFG.groups) {
    const cats = CFG.categories.filter((c) => c.group === g && c.kind !== "Transfer")
      .filter((c) => (grid.get(c.name) || []).some((x) => x !== 0) || +c.budget > 0);
    if (!cats.length) continue;
    const sub = Array(12).fill(0);
    cats.forEach((c) => (grid.get(c.name) || []).forEach((x, i) => (sub[i] += x)));
    const subYear = sum(sub), collapsed = !!ui.sumCollapsed[g];
    const kind = cats[0].kind;
    body += `<tr class="fx-group" data-group="${esc(g)}">
      <td class="fx-sticky"><button class="fx-caret" aria-label="Show or hide">${collapsed ? "▸" : "▾"}</button>${esc(g)} <span class="fx-count">${cats.length}</span></td>
      ${sub.map((x, i) => `<td class="num ${mc(i)}">${kmoney(x)}</td>`).join("")}
      <td class="num fx-year">${money(subYear, false)}</td><td class="num">${money(subYear / n, false)}</td>
      ${showBudget ? "<td></td>" : ""}<td class="fx-trend">${sparkline(sub, upto, kind === "Income" ? "#16A34A" : kind === "Savings" ? "#7C3AED" : "#2563EB")}</td></tr>`;
    if (collapsed) continue;
    for (const c of cats) {
      const vals = grid.get(c.name) || Array(12).fill(0);
      seen.add(c.name);
      const yr = sum(vals), avg = yr / n, b = +c.budget > 0 ? +c.budget : null;
      const pct = b ? avg / b : 0;
      body += `<tr class="fx-row">
        <td class="fx-sticky fx-cat">${esc(c.name)}</td>
        ${vals.map((x, i) => `<td class="num fx-cell ${mc(i)}">${x ? money(x, false) : '<span class="fx-zero">–</span>'}</td>`).join("")}
        <td class="num fx-year">${money(yr, false)}</td><td class="num">${money(avg, false)}</td>
        ${showBudget ? `<td class="fx-budget">${b ? `<div class="fx-meter ${pct > 1 && c.kind === "Expense" ? "over" : ""}"><span style="width:${Math.min(100, pct * 100).toFixed(0)}%"></span></div><div class="fx-meter-label">${money(avg, false)} / ${money(b, false)}</div>` : ""}</td>` : ""}
        <td class="fx-trend">${sparkline(vals, upto)}</td></tr>`;
    }
  }
  const unknown = [...grid.keys()].filter((k) => !seen.has(k) && !CFG.categories.some((c) => c.name === k && ui.sumCollapsed[c.group]));
  if (unknown.length) {
    body += `<tr class="fx-group warn" id="fx-unknown"><td class="fx-sticky" colspan="${cols}">⚠ Uncategorized / unknown categories: <a href="#" id="fx-go-fix">fix them or leave them as is on Transactions</a></td></tr>`;
    for (const k of unknown) {
      const vals = grid.get(k);
      body += `<tr class="fx-row"><td class="fx-sticky fx-cat">${esc(k || "(blank)")}</td>${vals.map((x, i) => `<td class="num fx-cell ${mc(i)}">${x ? money(x, false) : '<span class="fx-zero">–</span>'}</td>`).join("")}
        <td class="num fx-year">${money(sum(vals), false)}</td><td class="num">${money(sum(vals) / n, false)}</td>${showBudget ? "<td></td>" : ""}<td></td></tr>`;
    }
  }
  const foot = (label, vals, cls) => `<tr class="fx-total ${cls}"><td class="fx-sticky">${label}</td>
    ${vals.map((x, i) => `<td class="num ${mc(i)} ${cls === "rem" ? (x < -0.005 ? "neg" : x > 0.005 ? "pos" : "") : ""}">${kmoney(x)}</td>`).join("")}
    <td class="num fx-year ${cls === "rem" ? (sum(vals) < 0 ? "neg" : "pos") : ""}">${money(sum(vals), false)}</td><td class="num">${money(sum(vals) / n, false)}</td>${showBudget ? "<td></td>" : ""}<td></td></tr>`;

  const table = `<div class="fx-card">
    <div class="fx-card-head"><h2>By category</h2>
      <div class="fx-legend">${curMonth >= 0 ? `<span class="fx-now static">Now</span> = this month ·` : ""} averages over ${n} month${n > 1 ? "s" : ""}</div>
      <span class="spacer"></span><button class="fx-btn ghost" id="fx-expand">${Object.values(ui.sumCollapsed).some(Boolean) ? "Expand all" : "Collapse all"}</button></div>
    <div class="table-wrap"><table class="fx-table">
      <thead><tr><th class="fx-sticky">Category</th>${monthHead}<th class="num">Year</th><th class="num">Avg / mo</th>${showBudget ? "<th>Budget (avg)</th>" : ""}<th>Trend</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>${foot("Spent", tot.spending, "")}${foot("Saved", tot.savings, "")}${foot("Remaining", tot.remaining, "rem")}</tfoot>
    </table></div></div>`;

  const chartCard = `<div class="fx-grid2">
    <div class="fx-card"><div class="fx-card-head"><h2>Income vs. spending</h2></div><div class="fx-chart"><canvas id="fx-ch-flow"></canvas></div></div>
    <div class="fx-card"><div class="fx-card-head"><h2>Where it went · ${y}</h2></div><div class="fx-chart"><canvas id="fx-ch-groups"></canvas></div></div>
  </div>`;

  const flows = `<div class="fx-card"><div class="fx-card-head"><h2>Account flows</h2>
      <select id="sm-month" class="fx-select">${opts(Model.MONTHS.map((m, i) => [String(i), `${m} ${y}`]), String(ui.flowMonth))}</select>
      <span class="hint">Money in and out of each account. The Joint Hub should net to about $0 after a paycheck is split.</span></div>
    ${flowsTable(Model.accountFlows(CFG, txs, y, ui.flowMonth))}</div>`;

  ui._sumChartData = { tot, grid };
  return cards + chartCard + table + flows;
}

function wireYearView() {
  $("#sm-month").onchange = (e) => { ui.flowMonth = +e.target.value; renderSummary(); };
  const fix = $("#fx-go-fix");
  if (fix) fix.onclick = (e) => { e.preventDefault(); $('#tabs [data-tab="transactions"]').click(); };
  // Light up the header of the column under the mouse, so the month is easy to read off
  const table = $("#tab-summary .fx-table");
  const heads = [...table.querySelectorAll("thead th")];
  let hov = -1;
  const setHov = (i) => { if (i === hov) return; if (heads[hov]) heads[hov].classList.remove("hov"); hov = i; if (i > 0 && heads[i]) heads[i].classList.add("hov"); };
  table.addEventListener("mouseover", (e) => { const td = e.target.closest("tbody td, tfoot td"); setHov(td && !td.hasAttribute("colspan") ? td.cellIndex : -1); });
  table.addEventListener("mouseleave", () => setHov(-1));
  $$("#tab-summary .fx-group[data-group]").forEach((tr) => (tr.onclick = () => { const g = tr.dataset.group; ui.sumCollapsed[g] = !ui.sumCollapsed[g]; renderSummary(); }));
  $("#fx-expand").onclick = () => {
    const anyCollapsed = Object.values(ui.sumCollapsed).some(Boolean);
    ui.sumCollapsed = {};
    if (!anyCollapsed) CFG.groups.forEach((g) => (ui.sumCollapsed[g] = true));
    renderSummary();
  };
  const { tot, grid } = ui._sumChartData;
  const axis = { grid: { color: "#EEF2F7" }, border: { display: false }, ticks: { color: "#64748B", callback: (v) => "$" + (Math.abs(v) >= 1000 ? (v / 1000) + "k" : v) } };
  chart("fx-ch-flow", {
    type: "bar",
    data: { labels: Model.MONTHS, datasets: [
      { type: "line", label: "Remaining", data: tot.remaining, borderColor: "#0F172A", backgroundColor: "#0F172A", borderWidth: 2, pointRadius: 2.5, tension: 0.35, order: 0 },
      { label: "Income", data: tot.income, backgroundColor: "#22C55E", borderRadius: 4, order: 1 },
      { label: "Spent", data: tot.spending, backgroundColor: "#3B82F6", borderRadius: 4, order: 1 },
      { label: "Saved", data: tot.savings, backgroundColor: "#A78BFA", borderRadius: 4, order: 1 }] },
    options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, color: "#334155" } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y, false)}` } } },
      scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#64748B" } }, y: axis } },
  });
  const groupTotals = {};
  for (const [cat, row] of grid) {
    const c = CFG.categoryByName.get(cat);
    if (!c || c.kind !== "Expense") continue;
    groupTotals[c.group] = (groupTotals[c.group] || 0) + row.reduce((a, b) => a + b, 0);
  }
  const g = Object.entries(groupTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const palette = ["#2563EB", "#7C3AED", "#0EA5E9", "#14B8A6", "#F59E0B", "#EC4899", "#64748B", "#22C55E"];
  chart("fx-ch-groups", {
    type: "doughnut",
    data: { labels: g.map((x) => x[0]), datasets: [{ data: g.map((x) => Model.r2(x[1])), backgroundColor: palette, borderWidth: 2, borderColor: "#fff" }] },
    options: { maintainAspectRatio: false, cutout: "68%",
      plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8, color: "#334155" } },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${money(c.parsed, false)}` } } } },
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
  for (const g of CFG.groups) {
    const cats = CFG.categories.filter((x) => x.group === g && x.kind !== "Transfer" && ys.some((y) => val(x.name, y)));
    if (!cats.length) continue;
    const kind = cats[0].kind;
    const gsum = (y) => cats.reduce((s, x) => s + val(x.name, y), 0);
    const line = (name, v, cls) => {
      const a = v(prev), b = v(last), ch = a ? (b - a) / Math.abs(a) : null;
      const good = ch == null ? "" : kind === "Expense" ? (ch > 0.05 ? "bad" : ch < -0.05 ? "good" : "flat") : ch > 0.05 ? "good" : ch < -0.05 ? "bad" : "flat";
      return `<tr class="${cls}"><td class="fx-sticky ${cls ? "" : "fx-cat"}">${esc(name)}</td>${ys.map((y) => `<td class="num">${money(Model.r2(v(y)))}</td>`).join("")}
        <td class="fx-trend">${sparkline(ys.map(v), ys.length, kind === "Income" ? "#16A34A" : kind === "Savings" ? "#7C3AED" : "#2563EB")}</td>
        <td class="num">${ch == null ? "" : `<span class="fx-delta ${good}">${ch > 0 ? "▲" : ch < 0 ? "▼" : ""} ${Math.abs(ch * 100).toFixed(0)}%</span>`}</td></tr>`;
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

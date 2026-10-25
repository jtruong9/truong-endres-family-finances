// "Money flow" page: a top-down diagram of where the money goes. Paychecks → Joint Hub → the accounts
// it's split to → where it leaves them. Arrow width shows the amount; dots move along each arrow.
// Plan = one paycheck each, split by Settings › Paycheck split. Actual = one month's real transfers.
// Numbers come from Model.planFlow / Model.actualFlow. Loaded after summary.js.
"use strict";

const flowUi = { view: "plan", pay: {}, year: new Date().getFullYear(), month: new Date().getMonth() };
const FLOW_COLOR = { income: CHART.income, move: "#2563EB", spent: "#94A3B8", saved: "#8B5CF6" };
const FLOW_LABEL = { income: "Income", move: "Transfer", spent: "Spent / bills", saved: "Saved" };

function renderFlow() {
  const plan = flowUi.view === "plan";
  if (plan) for (const p of ["p1", "p2"]) if (!(p in flowUi.pay)) flowUi.pay[p] = Model.lastPaycheck(CFG, Store.transactions(), p) ?? "";
  const pays = ["p1", "p2"].map((who) => ({ who, amount: +flowUi.pay[who] || 0 }));
  const f = plan ? Model.planFlow(CFG, pays) : Model.actualFlow(CFG, Store.transactions(), flowUi.year, flowUi.month);

  const controls = plan
    ? ["p1", "p2"].map((p) => `<label class="fl-pay">${esc(CFG.people[p])}'s paycheck <input type="number" min="0" step="0.01" data-pay="${p}" value="${flowUi.pay[p]}" placeholder="0.00"></label>`).join("")
    : `<select id="fl-month">${opts(Model.MONTHS.map((m, i) => [String(i), m]), String(flowUi.month))}</select><select id="fl-year">${opts(years().map(String), String(flowUi.year))}</select>`;
  const actions = `<div class="seg"><button data-view="plan" class="${plan ? "on" : ""}">Plan</button><button data-view="actual" class="${plan ? "" : "on"}">Actual month</button></div>`;
  const moved = f.links.some((l) => l.kind === "move" && l.amount > 0);

  let note = "";
  if (plan && !CFG.split.length) note = notice("No paycheck split set up yet, so everything stays in the Hub.", "Set up the split", "fl-go-split");
  else if (plan && f.leftover < -0.005) note = notice("The fixed amounts in the paycheck split add up to more than the paychecks.", "Check the split", "fl-go-split", true);
  else if (!plan && !moved) note = notice(`No transfers out of the ${esc(f.hub)} logged for ${Model.MONTHS[flowUi.month]} ${flowUi.year}. Log paychecks with the Paycheck button and they'll show here.`, "Log a paycheck", "fl-go-pay");
  else if (!plan && f.notHub > 0.005) note = `<p class="hint">${money(f.notHub, false)} of income went straight into other accounts, not the ${esc(f.hub)}.</p>`;

  $("#tab-flow").innerHTML = `
    ${pageHead("Money flow", plan ? "Where one paycheck each goes, using your paycheck split" : "What really moved between accounts that month", actions)}
    <div class="fl-controls row">${controls}<span class="spacer"></span>
      <div class="fl-key">${["income", "move", "saved", "spent"].map((k) => `<span><i style="background:${FLOW_COLOR[k]}"></i>${FLOW_LABEL[k]}</span>`).join("")}</div></div>
    ${note}
    <div class="card fl-card"><div id="fl-diagram"></div></div>
    <p class="hint">Thicker arrow = more money. Hover a box or an arrow for the exact amounts.${plan ? " Change the split in Settings › Paycheck split." : ""}</p>`;

  drawFlow($("#fl-diagram"), f);

  $$("#tab-flow .seg button").forEach((b) => (b.onclick = () => { flowUi.view = b.dataset.view; renderFlow(); }));
  $$("#tab-flow [data-pay]").forEach((el) => (el.onchange = () => { flowUi.pay[el.dataset.pay] = el.value; renderFlow(); $(`#tab-flow [data-pay="${el.dataset.pay}"]`).focus(); }));
  const m = $("#fl-month"); if (m) m.onchange = (e) => { flowUi.month = +e.target.value; renderFlow(); };
  const y = $("#fl-year"); if (y) y.onchange = (e) => { flowUi.year = +e.target.value; renderFlow(); };
  const gs = $("#fl-go-split"); if (gs) gs.onclick = () => $('#tabs [data-tab="settings"]').click();
  const gp = $("#fl-go-pay"); if (gp) gp.onclick = () => $("#btn-paycheck").click();
}

// Lay the four rows out across the card's width and draw boxes + arrows as one SVG
function drawFlow(box, f) {
  const W = Math.max(480, box.clientWidth || 900);
  const rows = [0, 1, 2, 3].map((lv) => f.nodes.filter((n) => n.level === lv));
  const BW = Math.min(190, (W - 24) / Math.max(...rows.map((r) => r.length), 1) - 16), GAP = 110;
  // Narrow boxes: names go on up to two lines and the box grows to fit
  const wrap = f.nodes.some((n) => splitName(n.label, BW).length > 1), BH = wrap ? 80 : 66;
  const pos = new Map();
  rows.forEach((r, lv) => {
    const step = W / r.length;
    r.forEach((n, i) => pos.set(n.id, { x: step * i + step / 2 - BW / 2, y: 8 + lv * (BH + GAP), n }));
  });
  // "Where it goes" boxes go straight under the account they come from (one per account, so no overlap)
  for (const n of rows[3]) {
    const parent = f.links.find((l) => l.to === n.id);
    if (parent && pos.has(parent.from)) pos.get(n.id).x = pos.get(parent.from).x;
  }
  const H = 8 + 4 * BH + 3 * GAP + 8;
  const links = f.links.filter((l) => pos.has(l.from) && pos.has(l.to));
  const max = Math.max(...links.map((l) => l.amount), 1);
  const width = (a) => (a > 0.005 ? 2 + 20 * Math.sqrt(a / max) : 1.5);

  // Several arrows leaving / entering the same box sit side by side instead of on top of each other
  const offsets = new Map();
  const spread = (key, list, side) => {
    const total = list.reduce((s, l) => s + width(l.amount), 0) + (list.length - 1) * 3;
    let x = -total / 2;
    for (const l of list) { offsets.set(`${side}:${key}:${links.indexOf(l)}`, x + width(l.amount) / 2); x += width(l.amount) + 3; }
  };
  const byKey = (k) => { const m = new Map(); links.forEach((l) => { const key = l[k]; if (!m.has(key)) m.set(key, []); m.get(key).push(l); }); return m; };
  for (const [k, list] of byKey("from")) spread(k, list.sort((a, b) => pos.get(a.to).x - pos.get(b.to).x), "out");
  for (const [k, list] of byKey("to")) spread(k, list.sort((a, b) => pos.get(a.from).x - pos.get(b.from).x), "in");

  const paths = links.map((l, i) => {
    const a = pos.get(l.from), b = pos.get(l.to);
    const x1 = a.x + BW / 2 + offsets.get(`out:${l.from}:${i}`), y1 = a.y + BH;
    const x2 = b.x + BW / 2 + offsets.get(`in:${l.to}:${i}`), y2 = b.y - 8;
    const my = (y1 + y2) / 2, d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
    const c = FLOW_COLOR[l.kind], w = width(l.amount), on = l.amount > 0.005;
    const tip = `${FLOW_LABEL[l.kind]}: ${esc(a.n.label)} → ${esc(b.n.label)} · ${money(l.amount, false)}`;
    // Moving dots: speed is the same for every arrow; more money = more dots
    const dots = on ? Array.from({ length: Math.min(4, 1 + Math.round(3 * (l.amount / max))) }, (_, k) =>
      `<circle class="fl-dot" r="${Math.max(2.2, w / 4.5).toFixed(1)}" fill="#fff" stroke="${c}" stroke-width="1.5"><animateMotion dur="3.2s" begin="${(-k * 3.2 / 4).toFixed(2)}s" repeatCount="indefinite" path="${d}"/></circle>`).join("") : "";
    return `<g class="fl-link${on ? "" : " off"}" data-from="${esc(l.from)}" data-to="${esc(l.to)}"><title>${tip}</title>
      <path d="${d}" fill="none" stroke="${c}" stroke-width="${w.toFixed(1)}" stroke-opacity="${on ? 0.28 : 0.35}" ${on ? "" : 'stroke-dasharray="4 4"'}/>
      <path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(14, w + 8)}"/>
      ${on ? `<path d="M${x2 - 5},${y2 - 1} L${x2},${y2 + 7} L${x2 + 5},${y2 - 1} Z" fill="${c}" fill-opacity=".7"/>` : ""}${dots}</g>`;
  }).join("");

  const boxes = [...pos.values()].map(({ x, y, n }) => {
    const sub = n.lines.map(([k, v]) => `${k} ${money(v, false)}`).join(" · ");
    const tip = `${n.label}: ${n.amount == null ? "" : money(n.amount, false)}${sub ? ` (${sub})` : ""}`;
    return `<g class="fl-node${n.hub ? " hub" : ""}${n.level === 3 ? " out" : ""}" data-id="${esc(n.id)}" transform="translate(${x.toFixed(1)},${y})"><title>${esc(tip)}</title>
      <rect width="${BW}" height="${BH}" rx="10"/>
      <text x="${BW / 2}" y="${wrap ? 20 : 24}" class="fl-name">${splitName(n.label, BW).map((l, i) => `<tspan x="${BW / 2}" dy="${i ? 14 : 0}">${esc(l)}</tspan>`).join("")}</text>
      <text x="${BW / 2}" y="${BH - (sub ? 23 : 19)}" class="fl-amt">${n.amount == null ? "" : kmoney(n.amount)}</text>
      ${sub ? `<text x="${BW / 2}" y="${BH - 8}" class="fl-sub">${esc(fitText(sub, BW, 6.2))}</text>` : ""}</g>`;
  }).join("");

  box.innerHTML = `<svg class="fl-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Money flow diagram">${paths}${boxes}</svg>`;

  // Hovering a box lights up its arrows and dims the rest
  const svg = box.querySelector("svg");
  svg.addEventListener("mouseover", (e) => {
    const g = e.target.closest(".fl-node");
    svg.classList.toggle("focus", !!g);
    $$(".fl-link", svg).forEach((l) => l.classList.toggle("lit", !!g && (l.dataset.from === g.dataset.id || l.dataset.to === g.dataset.id)));
  });
  svg.addEventListener("mouseleave", () => svg.classList.remove("focus"));
}

// A box name on one line, or two lines split at a space when it's too wide (the second shortened if needed)
function splitName(s, w) {
  const max = Math.floor((w - 16) / 7.4);
  if (s.length <= max) return [s];
  const cut = s.lastIndexOf(" ", max);
  return cut > 0 ? [s.slice(0, cut), fitText(s.slice(cut + 1), w)] : [fitText(s, w)];
}

// Shorten a label to fit a box (roughly 7px per character at this size)
function fitText(s, w, px = 7.4) {
  const max = Math.floor((w - 16) / px);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Redraw at the new width when the window or menu changes size
window.addEventListener("resize", () => { if (ui.tab === "flow") { clearTimeout(renderFlow.t); renderFlow.t = setTimeout(renderFlow, 150); } });

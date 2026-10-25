// "Reorganize a year" screen (Settings › Reorganize). Shows every proposed category change grouped
// by "from → to", lets the person untick or change any row, then applies only what they approved.
// Loaded after app.js; uses Reorg (js/reorg.js).
"use strict";

const reorgUi = { year: 2026, open: {}, skip: new Set(), override: {} };

function reorgCard() {
  const r = CFG.rental || {};
  const y = reorgUi.year;
  const declined = new Set(((CFG.reorgDone || {})[y] || {}).declined || []);
  const plan = Reorg.plan(Store.transactions(), y, { rental: r });
  const moves = plan.filter((s) => (s.to !== s.from || s.addTag) && !declined.has(s.tx.id));
  const groups = new Map();
  for (const s of moves) {
    const k = `${s.from}→${s.to}`;
    if (!groups.has(k)) groups.set(k, { from: s.from, to: s.to, steps: [] });
    groups.get(k).steps.push(s);
  }
  const catNames = Reorg.categoriesAfter(CFG.categories).filter((c) => c.kind !== "Transfer").map((c) => c.name);
  const done = (CFG.reorgDone || {})[y];
  const chosen = moves.filter((s) => !reorgUi.skip.has(s.tx.id)).length;
  const sum = (steps) => steps.reduce((a, s) => a + (+s.tx.amount || 0), 0);
  const ordered = [...groups.values()].sort((a, b) => sum(b.steps) - sum(a.steps));

  return `
  <div class="card reorg" id="reorg">
    <h2>Reorganize ${y} categories</h2>
    <p class="hint">Sorts ${y} into a clearer layout: <b>Home</b> and <b>Rental Property</b> are separate groups, "Personal" is split into real categories
      (shopping, hobbies & gear, fun, gifts, car upkeep, rides…), restaurants become <b>Dining Out</b>, and wedding/engagement costs get a tag for Goals.
      Other years are not changed. Old categories stay in the list so earlier years still add up. ${done ? `<b>Last applied ${new Date(done.at).toLocaleDateString()}.</b> Rows you unticked then won't be suggested again; anything below is new since.` : ""}</p>
    ${!(r.match || r.tag) ? `<p class="error">Set up the Rental tab first (the text that identifies your rental, e.g. its street number). Otherwise rental costs can't be told apart from home costs.</p>` : ""}
    <div class="row" style="margin:6px 0 10px">
      <b>${moves.length}</b>&nbsp;proposed change${moves.length === 1 ? "" : "s"} · <b>${chosen}</b>&nbsp;selected
      <span class="spacer"></span>
      <button class="small" id="ro-all">Select all</button><button class="small" id="ro-none">Select none</button>
      <button class="primary" id="ro-apply" ${moves.length ? "" : "disabled"}>${chosen ? `Apply ${chosen} change${chosen === 1 ? "" : "s"}` : "Keep everything as is"}</button>
    </div>
    ${ordered.length ? ordered.map((g) => {
      const key = `${g.from}→${g.to}`, open = !!reorgUi.open[key];
      const on = g.steps.filter((s) => !reorgUi.skip.has(s.tx.id)).length;
      return `<div class="ro-group" data-key="${esc(key)}">
        <div class="ro-head">
          <input type="checkbox" class="ro-gsel" ${on === g.steps.length ? "checked" : ""} ${on && on < g.steps.length ? 'data-partial="1"' : ""}>
          <div class="ro-move">${g.from === g.to ? `<b>${esc(g.to)}</b> <span class="muted">(add tag)</span>` : `<span class="muted">${esc(g.from)}</span> &rarr; <b>${esc(g.to)}</b>`}
            <span class="pill">${g.steps.length} · ${money(sum(g.steps), false)}</span></div>
          <span class="spacer"></span><button class="small ghost ro-toggle">${open ? "Hide" : "Show"} transactions</button>
        </div>
        ${open ? `<table class="edit-table ro-list"><tbody>${g.steps.map((s) => `
          <tr data-id="${esc(s.tx.id)}"><td><input type="checkbox" class="ro-sel" ${reorgUi.skip.has(s.tx.id) ? "" : "checked"}></td>
            <td class="nowrap">${fmtDate(s.tx.date)}</td><td>${esc(s.tx.desc)}</td><td class="num">${money(s.tx.amount, false)}</td>
            <td><select class="ro-to">${opts(catNames, reorgUi.override[s.tx.id] || s.to)}</select></td>
            <td class="muted">${esc(s.reason)}${s.addTag ? ` · tag <span class="pill">${esc(s.addTag)}</span>` : ""}</td></tr>`).join("")}</tbody></table>` : ""}
      </div>`;
    }).join("") : `<p class="muted">Nothing to change for ${y}: it's already organized.</p>`}
  </div>`;
}

function wireReorg() {
  const root = $("#reorg");
  if (!root) return;
  const r = CFG.rental || {};
  const declined = new Set(((CFG.reorgDone || {})[reorgUi.year] || {}).declined || []);
  const plan = () => Reorg.plan(Store.transactions(), reorgUi.year, { rental: r }).filter((s) => (s.to !== s.from || s.addTag) && !declined.has(s.tx.id));
  const redraw = () => { const y = window.scrollY; renderSettings(); window.scrollTo(0, y); };
  $$("#reorg .ro-gsel[data-partial]").forEach((cb) => (cb.indeterminate = true));

  root.onclick = (e) => {
    const g = e.target.closest(".ro-group");
    if (e.target.classList.contains("ro-toggle")) { const k = g.dataset.key; reorgUi.open[k] = !reorgUi.open[k]; redraw(); }
  };
  root.onchange = (e) => {
    const g = e.target.closest(".ro-group");
    if (e.target.classList.contains("ro-gsel")) {
      for (const s of plan().filter((s) => `${s.from}→${s.to}` === g.dataset.key)) e.target.checked ? reorgUi.skip.delete(s.tx.id) : reorgUi.skip.add(s.tx.id);
      redraw();
    } else if (e.target.classList.contains("ro-sel")) {
      const id = e.target.closest("tr").dataset.id;
      e.target.checked ? reorgUi.skip.delete(id) : reorgUi.skip.add(id);
      redraw();
    } else if (e.target.classList.contains("ro-to")) {
      reorgUi.override[e.target.closest("tr").dataset.id] = e.target.value;
    }
  };
  $("#ro-all").onclick = () => { reorgUi.skip.clear(); redraw(); };
  $("#ro-none").onclick = () => { for (const s of plan()) reorgUi.skip.add(s.tx.id); redraw(); };
  $("#ro-apply").onclick = async () => {
    const all = plan();
    const steps = all.filter((s) => !reorgUi.skip.has(s.tx.id)).map((s) => (reorgUi.override[s.tx.id] ? { ...s, to: reorgUi.override[s.tx.id] } : s));
    const newlyDeclined = all.filter((s) => reorgUi.skip.has(s.tx.id)).map((s) => s.tx.id);
    if (!steps.length && !newlyDeclined.length) return;
    const msg = steps.length
      ? `Apply ${steps.length} change(s) to ${reorgUi.year}?${newlyDeclined.length ? `\n${newlyDeclined.length} unticked row(s) stay as they are and won't be suggested again.` : ""}\n\n` +
        `This also adds the new categories (Home, Rental Property, Lifestyle…). Nothing in other years changes. Tip: Settings › Download backup first if you'd like a copy.`
      : `Leave the ${newlyDeclined.length} remaining row(s) as they are? They won't be suggested again.`;
    if (!confirm(msg)) return;
    $("#ro-apply").disabled = true;
    if (steps.length) await Store.setCfg("categories", Reorg.categoriesAfter(CFG.categories));
    for (let i = 0; i < steps.length; i += 200) await Store.saveTxs(steps.slice(i, i + 200).map(Reorg.applyTx));
    const prev = (CFG.reorgDone || {})[reorgUi.year] || {};
    await Store.setCfg("reorgDone", { ...(CFG.reorgDone || {}), [reorgUi.year]: { at: new Date().toISOString(), count: (prev.count || 0) + steps.length,
      declined: [...new Set([...(prev.declined || []), ...newlyDeclined])] } });
    reorgUi.skip.clear(); reorgUi.override = {}; reorgUi.open = {};
    toast(steps.length ? `Reorganized ${steps.length} transaction(s) in ${reorgUi.year}. Check the Summary.` : "OK, those stay as they are.", 5000);
  };
}

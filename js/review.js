// "To review" queue: bank CSV rows wait here until someone sorts each one into a category.
// Nothing in the queue counts toward any total. Loaded after app.js.
"use strict";

const reviewUi = { account: "", selected: new Set(), showDupOnly: false };

function reviewRows() {
  return Store.transactions().filter((t) => t.review && (!reviewUi.account || t.account === reviewUi.account))
    .sort((a, b) => (a.date === b.date ? (a.desc < b.desc ? -1 : 1) : a.date < b.date ? -1 : 1));
}

// Draws the queue at the top of the Transactions tab. Returns "" when there's nothing to review.
function reviewSection() {
  const all = Store.transactions().filter((t) => t.review);
  if (!all.length) return "";
  const rows = reviewRows();
  const matches = Model.findMatches(Model.buildMatchIndex(Store.transactions()), rows);
  const shown = reviewUi.showDupOnly ? rows.filter((r) => matches.has(r.id)) : rows;
  const accts = [...new Set(all.map((t) => t.account))];
  const catOpts = (sel) => catOptions(sel, "Choose category…");
  const acctOpts = (sel, not) => opts(Model.openAccounts(CFG).map((a) => a.name).filter((n) => n !== not), sel, "Which account?");
  const isTransfer = (c) => (CFG.categoryByName.get(c) || {}).kind === "Transfer";
  const isSavings = (c) => (CFG.categoryByName.get(c) || {}).kind === "Savings";
  reviewUi.selected = new Set([...reviewUi.selected].filter((id) => rows.some((r) => r.id === id)));

  return `
  <div class="card review-card" id="review">
    <div class="row">
      <h2 class="review-title">To review<span class="count">${all.length}</span></h2>
      <select id="rv-acct">${opts(accts, reviewUi.account, "All imported accounts")}</select>
      ${matches.size ? `<label class="muted"><input type="checkbox" id="rv-dups" ${reviewUi.showDupOnly ? "checked" : ""}> Possible duplicates (${matches.size})</label>` : `<input type="checkbox" id="rv-dups" hidden>`}
      <span class="spacer"></span>
      <button id="rv-accept-guesses" title="Confirm every row whose category is filled in">Confirm filled-in</button>
    </div>
    <p class="hint">From a bank statement. These don't count until you confirm them. <span class="guess-key">Italic</span> categories are guesses.</p>
    <div class="table-wrap"><table class="review-table">
      <thead><tr><th><input type="checkbox" id="rv-all" title="Select all"></th><th>Date</th><th>Description</th><th class="num">In</th><th class="num">Out</th><th>Account</th><th>Category</th><th>Other account / Tags</th><th></th></tr></thead>
      <tbody>
      ${shown.map((r) => {
        const m = matches.get(r.id);
        const tr = isTransfer(r.category);
        return `<tr data-id="${esc(r.id)}" class="${m ? "dup-row" : ""}">
          <td><input type="checkbox" class="rv-sel" ${reviewUi.selected.has(r.id) ? "checked" : ""}></td>
          <td class="nowrap"><span class="month-dot" style="background:${Model.MONTH_COLORS[+r.date.slice(5, 7) - 1][0]}"></span>${fmtDate(r.date)}</td>
          <td>${esc(r.desc)}${m ? `<div><span class="pill dup">possible duplicate</span> <span class="muted">${fmtDate(m.date)} · ${esc(m.desc)} · ${money(m.amount, false)}</span></div>` : ""}</td>
          <td class="num in">${r.dir === "in" ? money(r.amount, false) : ""}</td>
          <td class="num out">${r.dir === "out" ? money(r.amount, false) : ""}</td>
          <td class="muted">${esc(r.account)}</td>
          <td><select class="rv-cat${r.guess ? " guess" : ""}">${catOpts(r.category)}</select></td>
          <td>${tr ? `<select class="rv-other" title="${r.dir === "in" ? "Money came FROM" : "Money went TO"}">${acctOpts(r.toAccount, r.account)}</select>`
                   : isSavings(r.category) ? `<select class="rv-other" title="Which of our accounts the savings went into (optional)">${opts(Model.openAccounts(CFG).map((a) => a.name).filter((n) => n !== r.account), r.toAccount, "Put into (optional)")}</select>`
                   : `<input class="rv-tags" placeholder="tags (optional)" value="${esc(r.tags || "")}">`}</td>
          <td class="nowrap"><button class="small primary rv-ok" title="Confirm">${icon("check")}</button> <button class="small ghost rv-del" title="Remove (duplicate or not needed)">${icon("x")}</button></td></tr>`;
      }).join("") || `<tr><td colspan="9" class="muted">Nothing here with this filter.</td></tr>`}
      </tbody></table></div>
    <div class="row" style="margin-top:8px">
      <span class="muted" id="rv-selcount">${reviewUi.selected.size} selected</span>
      <select id="rv-bulk-cat">${catOpts("")}</select>
      <button id="rv-bulk-apply">Set category on selected</button>
      <button id="rv-bulk-ok" class="primary">Confirm selected</button>
      <button id="rv-bulk-del" class="danger">Remove selected</button>
    </div>
  </div>`;
}

function wireReview() {
  const root = $("#review");
  if (!root) return;
  const byId = (id) => Store.transactions().find((t) => t.id === id);
  const rowOf = (el) => el.closest("tr[data-id]");
  const isTransfer = (c) => (CFG.categoryByName.get(c) || {}).kind === "Transfer";

  // Read what's on screen for a row (choices aren't saved until confirmed, except category changes)
  function choiceFor(tr) {
    return {
      category: tr.querySelector(".rv-cat").value,
      other: tr.querySelector(".rv-other")?.value || "",
      tags: tr.querySelector(".rv-tags")?.value.trim() ?? undefined,
    };
  }
  function problem(row, c) {
    if (!c.category) return "pick a category";
    if (isTransfer(c.category) && !c.other) return "pick the other account for the transfer";
    if (isTransfer(c.category) && c.other === row.account) return "the other account must be different";
    return "";
  }
  async function confirmRows(trs) {
    const out = [], bad = [];
    for (const tr of trs) {
      const row = byId(tr.dataset.id), c = choiceFor(tr);
      const p = problem(row, c);
      if (p) { bad.push(`${row.desc}: ${p}`); continue; }
      out.push(Model.resolveReview(CFG, row, c));
    }
    if (out.length) await Store.saveTxs(out);
    toast(bad.length ? `Confirmed ${out.length}. ${bad.length} still need a choice (${bad[0]}${bad.length > 1 ? ", …" : ""}).` : `Confirmed ${out.length}.`, bad.length ? 5000 : 2600);
  }
  async function removeRows(ids) {
    if (!ids.length || !confirm(`Remove ${ids.length} row(s) from the review list? (Use this for duplicates or things you don't want to track.)`)) return;
    for (const id of ids) await Store.deleteTx(id);
    toast(`Removed ${ids.length}.`);
  }

  catPickerWire(root, "select.rv-cat, #rv-bulk-cat");
  $("#rv-acct").onchange = (e) => { reviewUi.account = e.target.value; renderTransactions(); };
  $("#rv-dups").onchange = (e) => { reviewUi.showDupOnly = e.target.checked; renderTransactions(); };

  root.querySelector("tbody").onchange = async (e) => {
    const tr = rowOf(e.target);
    if (!tr) return;
    if (e.target.classList.contains("rv-sel")) {
      e.target.checked ? reviewUi.selected.add(tr.dataset.id) : reviewUi.selected.delete(tr.dataset.id);
      $("#rv-selcount").textContent = `${reviewUi.selected.size} selected`;
    } else if (e.target.classList.contains("rv-cat")) {
      // Remember the choice (still unconfirmed) so it survives a redraw; a transfer needs the other account
      const row = byId(tr.dataset.id);
      await Store.saveTx({ ...row, category: e.target.value, guess: false, toAccount: isTransfer(e.target.value) || isSavings(e.target.value) ? row.toAccount : "" });
    } else if (e.target.classList.contains("rv-other")) {
      const row = byId(tr.dataset.id);
      await Store.saveTx({ ...row, toAccount: e.target.value });
    }
  };
  root.querySelector("tbody").onclick = (e) => {
    const tr = rowOf(e.target);
    if (!tr) return;
    if (e.target.closest(".rv-ok")) confirmRows([tr]);
    if (e.target.closest(".rv-del")) removeRows([tr.dataset.id]);
  };
  $("#rv-all").onchange = (e) => {
    $$("#review .rv-sel").forEach((cb) => { cb.checked = e.target.checked; const id = rowOf(cb).dataset.id; e.target.checked ? reviewUi.selected.add(id) : reviewUi.selected.delete(id); });
    $("#rv-selcount").textContent = `${reviewUi.selected.size} selected`;
  };
  const selectedTrs = () => $$("#review tr[data-id]").filter((tr) => reviewUi.selected.has(tr.dataset.id));
  $("#rv-bulk-apply").onclick = async () => {
    const c = $("#rv-bulk-cat").value;
    if (!c || !reviewUi.selected.size) { toast("Select rows and a category first."); return; }
    // Keep the selection so "Confirm selected" can follow right after
    await Store.saveTxs(selectedTrs().map((tr) => ({ ...byId(tr.dataset.id), category: c, guess: false, toAccount: "" })));
  };
  $("#rv-bulk-ok").onclick = () => (reviewUi.selected.size ? confirmRows(selectedTrs()) : toast("Select rows first."));
  $("#rv-bulk-del").onclick = () => removeRows([...reviewUi.selected]);
  $("#rv-accept-guesses").onclick = () => {
    const trs = $$("#review tr[data-id]").filter((tr) => tr.querySelector(".rv-cat").value && !(isTransfer(tr.querySelector(".rv-cat").value) && !tr.querySelector(".rv-other")?.value));
    if (!trs.length) { toast("No rows have a category filled in yet."); return; }
    if (confirm(`Confirm ${trs.length} row(s) with the category shown? Please make sure you've looked at each one.`)) confirmRows(trs);
  };
}

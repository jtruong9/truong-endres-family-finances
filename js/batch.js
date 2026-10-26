// Batch edit on the Transactions list: tick rows (or "all N matching"), then one bar changes category,
// account, To / Put into, tags, note or date for all of them, or deletes them. The rules for what
// each change does live in Model.batchEdit. Loaded after app.js.
"use strict";

const batchUi = { sel: new Set(), allMatching: false };

// Checkbox for one row / the header
const batchBox = (t) => `<td class="bx" onclick="event.stopPropagation()"><input type="checkbox" class="bx-row" data-id="${esc(t.id)}" ${batchUi.allMatching || batchUi.sel.has(t.id) ? "checked" : ""} aria-label="Select"></td>`;
const batchHead = (shown) => `<th class="bx"><input type="checkbox" id="bx-page" ${shown.length && shown.every((t) => batchUi.allMatching || batchUi.sel.has(t.id)) ? "checked" : ""} title="Select this page" aria-label="Select this page"></th>`;

// The bar under the filters. rows = every transaction matching the filters (all pages)
function batchBar(rows, shown) {
  const ids = batchIds(rows);
  if (!ids.length) return "";
  const picked = rows.filter((t) => ids.includes(t.id));
  const sum = picked.reduce((s, t) => s + (Model.kindOf(CFG, t) === "Transfer" ? 0 : t.amount), 0);
  const allOnPage = shown.every((t) => batchUi.sel.has(t.id) || batchUi.allMatching);
  const accts = Model.openAccounts(CFG).map((a) => a.name);
  return `<div class="batch-bar" id="batch-bar">
    <div class="row batch-top">
      <b>${ids.length.toLocaleString()} selected</b><span class="muted">· ${money(sum, false)}</span>
      ${allOnPage && !batchUi.allMatching && rows.length > shown.length ? `<a href="#" id="bx-all">Select all ${rows.length.toLocaleString()} matching</a>` : ""}
      ${batchUi.allMatching ? `<span class="muted">(every row matching the filters)</span>` : ""}
      <span class="spacer"></span><button class="small ghost" id="bx-clear">Clear selection</button>
    </div>
    <div class="batch-fields">
      <label>Category<select id="bx-cat">${catOptions("", "Keep")}</select></label>
      <label>Account<select id="bx-acct">${opts(accts, "", "Keep")}</select></label>
      <label>To / Put into<select id="bx-to">${opts([["", "Keep"], ["-", "(none)"], ...accts.map((a) => [a, a])], "")}</select></label>
      <label>Date<input type="date" id="bx-date"></label>
      <label>Add tags<input id="bx-addtag" placeholder="e.g. honeymoon"></label>
      <label>Remove tags<input id="bx-rmtag" placeholder="e.g. old"></label>
      <label class="bx-note">Note<input id="bx-note" placeholder="add to each row's notes">
        <span class="bx-mode"><input type="checkbox" id="bx-replace"> replace existing notes</span></label>
    </div>
    <div class="row">
      <button class="primary" id="bx-apply">Apply to ${ids.length.toLocaleString()}</button>
      <button class="danger" id="bx-delete">Delete ${ids.length.toLocaleString()}</button>
      <span class="error" id="bx-error"></span>
    </div>
  </div>`;
}

const batchIds = (rows) => (batchUi.allMatching ? rows.map((t) => t.id) : rows.filter((t) => batchUi.sel.has(t.id)).map((t) => t.id));

function wireBatch(rows, shown) {
  const redraw = () => renderTransactions();
  const table = $("#tx-table");
  table.addEventListener("change", (e) => {
    const cb = e.target;
    if (cb.classList.contains("bx-row")) {
      if (batchUi.allMatching) {   // un-ticking one row from "all matching" keeps the rest
        batchUi.allMatching = false;
        rows.forEach((t) => batchUi.sel.add(t.id));
      }
      cb.checked ? batchUi.sel.add(cb.dataset.id) : batchUi.sel.delete(cb.dataset.id);
      redraw();
    } else if (cb.id === "bx-page") {
      if (!cb.checked) batchUi.allMatching = false;
      shown.forEach((t) => (cb.checked ? batchUi.sel.add(t.id) : batchUi.sel.delete(t.id)));
      redraw();
    }
  });
  const bar = $("#batch-bar");
  if (!bar) return;
  catPickerWire(bar, "#bx-cat");
  const all = $("#bx-all");
  if (all) all.onclick = (e) => { e.preventDefault(); batchUi.allMatching = true; redraw(); };
  $("#bx-clear").onclick = () => { batchUi.sel.clear(); batchUi.allMatching = false; redraw(); };

  const changes = () => {
    const to = $("#bx-to").value;
    return {
      category: $("#bx-cat").value, account: $("#bx-acct").value, date: $("#bx-date").value,
      toAccount: to === "" ? undefined : to === "-" ? "" : to,
      addTags: $("#bx-addtag").value.trim(), removeTags: $("#bx-rmtag").value.trim(),
      note: $("#bx-note").value.trim(), noteMode: $("#bx-replace").checked ? "replace" : "add",
    };
  };
  const describe = (ch) => [
    ch.category && `category → ${ch.category}`, ch.account && `account → ${ch.account}`,
    ch.toAccount !== undefined && `To / Put into → ${ch.toAccount || "(none)"}`, ch.date && `date → ${fmtDate(ch.date)}`,
    ch.addTags && `add tags: ${ch.addTags}`, ch.removeTags && `remove tags: ${ch.removeTags}`,
    ch.note && (ch.noteMode === "replace" ? `notes → "${ch.note}"` : `add note "${ch.note}"`)].filter(Boolean);

  $("#bx-apply").onclick = async () => {
    const ids = new Set(batchIds(rows)), picked = Store.transactions().filter((t) => ids.has(t.id));
    const ch = changes(), what = describe(ch);
    if (!what.length) { $("#bx-error").textContent = "Choose at least one change."; return; }
    const problem = Model.batchProblem(CFG, picked, ch);
    if (problem) { $("#bx-error").textContent = problem; return; }
    const edited = picked.map((t) => Model.batchEdit(CFG, t, ch)).filter((e, i) => e !== picked[i]);
    if (!edited.length) { $("#bx-error").textContent = "Those rows already look like that. Nothing to change."; return; }
    if (!confirm(`Change ${edited.length} transaction(s)?\n\n${what.join("\n")}${edited.length < picked.length ? `\n\n${picked.length - edited.length} already match and won't change.` : ""}`)) return;
    $("#bx-apply").disabled = true;
    for (let i = 0; i < edited.length; i += 300) await Store.saveTxs(edited.slice(i, i + 300));
    batchUi.sel.clear(); batchUi.allMatching = false;
    toast(`Changed ${edited.length} transaction(s).`, 3500);
  };
  $("#bx-delete").onclick = async () => {
    const ids = batchIds(rows);
    if (!confirm(`Delete ${ids.length} transaction(s)? This can't be undone (except by restoring a backup).`)) return;
    if (ids.length > 20 && prompt(`Type ${ids.length} to confirm deleting ${ids.length} transactions.`) !== String(ids.length)) { toast("Nothing deleted."); return; }
    $("#bx-delete").disabled = true;
    for (let i = 0; i < ids.length; i += 300) await Store.deleteTxs(ids.slice(i, i + 300));
    batchUi.sel.clear(); batchUi.allMatching = false;
    toast(`Deleted ${ids.length} transaction(s).`, 3500);
  };
}

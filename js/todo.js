// "To-do" page: a shared checklist (who it's for, group, priority, a note, linked transactions) plus a
// free-form notes box. Each item is saved as its own setting "todo:<id>" (Model.todoList), so the two
// computers never overwrite each other's items. Loaded after features.js.
"use strict";

const todoUi = { open: new Set(), showDone: false, linking: null };

function renderTodo() {
  const all = Model.todoList(Store.allCfg());
  const done = all.filter((t) => t.done).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  const groups = Model.todoGroups(all);
  const groupNames = [...new Set(all.map((t) => (t.group || "").trim()).filter(Boolean))];
  const openCount = all.length - done.length;
  const who = [["joint", "Both"], ["p1", CFG.people.p1], ["p2", CFG.people.p2]];
  const whoTag = (k) => `<span class="td-who" data-owner="${k === "joint" ? "joint" : k}">${esc(k === "joint" ? "Both" : CFG.people[k] || k)}</span>`;
  const txById = new Map(Store.transactions().map((t) => [t.id, t]));

  const item = (t) => {
    const open = todoUi.open.has(t.id), links = (t.txIds || []).filter((id) => txById.has(id));
    return `<div class="td-item${t.priority === "high" ? " high" : ""}${t.done ? " done" : ""}" data-id="${esc(t.id)}">
      <div class="td-row">
        ${t.done ? "" : dragHandle()}
        <label class="td-check"><input type="checkbox" class="td-done" ${t.done ? "checked" : ""} aria-label="Done"></label>
        <span class="td-text">${esc(t.text)}</span>
        ${t.priority === "high" ? `<span class="pill td-high">High</span>` : ""}
        ${whoTag(t.who || "joint")}
        ${links.length ? `<button class="small ghost td-show" title="Show the linked transactions">${icon("list")}${links.length}</button>` : ""}
        ${t.note && !open ? `<span class="td-hasnote" title="${esc(t.note)}">${icon("note")}</span>` : ""}
        ${t.done ? `<span class="muted td-when">done ${fmtDate(String(t.doneAt).slice(0, 10))}</span>` : ""}
        <span class="spacer"></span>
        <button class="small ghost td-edit">${open ? "Close" : "Edit"}</button>
      </div>
      ${open ? `<div class="td-editor">
        <label>Task<input class="td-f-text" value="${esc(t.text)}"></label>
        <div class="grid2">
          <label>For<select class="td-f-who">${opts(who, t.who || "joint")}</select></label>
          <label>Group<input class="td-f-group" value="${esc(t.group || "")}" list="td-groups" placeholder="e.g. Taxes, Wedding, House"></label>
          <label class="td-f-prio-l"><span><input type="checkbox" class="td-f-prio" ${t.priority === "high" ? "checked" : ""}> High priority</span></label>
        </div>
        <label>Note<textarea class="td-f-note" rows="3" placeholder="Details, account to call, what to ask…">${esc(t.note || "")}</textarea></label>
        <div class="td-links"><b>Linked transactions</b>
          ${links.length ? `<ul>${links.map((id) => { const x = txById.get(id); return `<li>${fmtDate(x.date)} · ${esc(x.desc)} · ${money(x.amount, false)} <a href="#" class="td-unlink" data-tx="${esc(id)}">remove</a></li>`; }).join("")}</ul>` : `<span class="muted"> none yet</span>`}
          <div class="hint">To link: on Transactions, tick the rows, then pick this item under <b>Link to to-do</b> in the bar.</div></div>
        <div class="row"><button class="danger small td-del">Delete</button><span class="spacer"></span><button class="small td-cancel">Cancel</button><button class="primary small td-save">Save</button></div>
      </div>` : ""}
    </div>`;
  };

  $("#tab-todo").innerHTML = `
    ${pageHead("To-do", `${openCount} open${done.length ? ` · ${done.length} done` : ""}`)}
    <div class="card">
      <form class="td-add row" id="td-add">
        <input id="td-new" placeholder="Add a to-do and press Enter" autocomplete="off">
        <select id="td-new-who" title="Who it's for">${opts(who, "joint")}</select>
        <input id="td-new-group" list="td-groups" placeholder="Group (optional)">
        <label class="muted"><input type="checkbox" id="td-new-prio"> High</label>
        <button class="primary" type="submit">${icon("plus")}Add</button>
      </form>
      <datalist id="td-groups">${groupNames.map((g) => `<option value="${esc(g)}">`).join("")}</datalist>
      ${groups.length ? groups.map((g) => `<div class="td-group" data-group="${esc(g.group)}">
          ${g.group ? `<h3 class="td-gname">${esc(g.group)} <span class="muted">${g.items.length}</span></h3>` : ""}
          <div class="td-list">${g.items.map(item).join("")}</div></div>`).join("")
        : `<p class="muted td-empty">Nothing to do. Add something above.</p>`}
      ${done.length ? `<div class="td-done-wrap">
        <div class="row"><button class="small ghost" id="td-toggle-done">${icon(todoUi.showDone ? "chevronDown" : "chevronRight")}Done (${done.length})</button>
          <span class="spacer"></span>${todoUi.showDone ? `<button class="small ghost" id="td-clear-done">Clear done</button>` : ""}</div>
        ${todoUi.showDone ? `<div class="td-list">${done.map(item).join("")}</div>` : ""}</div>` : ""}
    </div>
    <div class="card">
      <div class="row"><h2>Notes</h2><span class="spacer"></span><span class="muted" id="td-notes-status"></span></div>
      <textarea id="td-notes" rows="10" placeholder="Anything that isn't a task: ideas, reminders, numbers to keep handy…">${esc(Store.cfg("notes", ""))}</textarea>
      <p class="hint">Saves by itself as you type, and shows up on the other computer too. If you both edit it at the same moment, the last save wins.</p>
    </div>`;
  wireTodo(all);
}

const todoSave = (t) => Store.setCfg(`todo:${t.id}`, t);

function wireTodo(all) {
  const byId = (id) => all.find((t) => t.id === id);
  $("#td-add").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("#td-new").value.trim();
    if (!text) return;
    const minOrder = Math.min(0, ...all.map((t) => +t.order || 0));
    await todoSave({ id: Store.newId(), text, who: $("#td-new-who").value, group: $("#td-new-group").value.trim(),
      priority: $("#td-new-prio").checked ? "high" : "", note: "", txIds: [], done: false, created: new Date().toISOString(), order: minOrder - 1 });
    $("#td-new").focus();
  };
  const root = $("#tab-todo");
  root.onchange = async (e) => {
    if (!e.target.classList.contains("td-done")) return;
    const t = byId(e.target.closest(".td-item").dataset.id);
    await todoSave({ ...t, done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : "" });
  };
  root.onclick = async (e) => {
    const el = e.target.closest("button, a");
    if (!el) return;
    const box = el.closest(".td-item"), t = box && byId(box.dataset.id);
    if (el.id === "td-toggle-done") { todoUi.showDone = !todoUi.showDone; renderTodo(); return; }
    if (el.id === "td-clear-done") {
      const done = all.filter((x) => x.done);
      if (!confirm(`Remove the ${done.length} done item(s)?`)) return;
      for (const x of done) await Store.setCfg(`todo:${x.id}`, { id: x.id, deleted: true });
      return;
    }
    if (!t) return;
    if (el.classList.contains("td-edit") || el.classList.contains("td-cancel")) { todoUi.open.has(t.id) ? todoUi.open.delete(t.id) : todoUi.open.add(t.id); renderTodo(); return; }
    if (el.classList.contains("td-show")) {
      ui.tx = { ...ui.tx, q: "", year: "", account: "", category: "", owner: "all", flagged: false, page: 0, ids: (t.txIds || []).slice() };
      $('#tabs [data-tab="transactions"]').click();
      return;
    }
    if (el.classList.contains("td-unlink")) {
      e.preventDefault();
      await todoSave({ ...t, txIds: (t.txIds || []).filter((id) => id !== el.dataset.tx) });
      return;
    }
    if (el.classList.contains("td-del")) {
      if (!confirm(`Delete "${t.text}"?`)) return;
      todoUi.open.delete(t.id);
      await Store.setCfg(`todo:${t.id}`, { id: t.id, deleted: true });
      return;
    }
    if (el.classList.contains("td-save")) {
      const q = (c) => box.querySelector(c);
      const text = q(".td-f-text").value.trim();
      if (!text) { toast("The task needs some text."); return; }
      todoUi.open.delete(t.id);
      await todoSave({ ...t, text, who: q(".td-f-who").value, group: q(".td-f-group").value.trim(), priority: q(".td-f-prio").checked ? "high" : "", note: q(".td-f-note").value.trim() });
    }
  };
  // Drag to reorder within a group
  $$("#tab-todo .td-group .td-list").forEach((list) => makeSortable(list, ".td-item", async () => {
    const ids = [...list.querySelectorAll(":scope > .td-item")].map((x) => x.dataset.id);
    const base = Math.min(...ids.map((id) => +byId(id).order || 0));
    for (let i = 0; i < ids.length; i++) { const x = byId(ids[i]); if ((+x.order || 0) !== base + i) await todoSave({ ...x, order: base + i }); }
  }));
  // Notes: save a moment after typing stops
  const notes = $("#td-notes");
  notes.oninput = () => {
    $("#td-notes-status").textContent = "Typing…";
    clearTimeout(notes.t);
    notes.t = setTimeout(async () => { await Store.setCfg("notes", notes.value); $("#td-notes-status").textContent = "Saved"; }, 700);
  };
}

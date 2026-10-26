// "Needs attention" panel on the Transactions tab: saved transactions with a problem (unknown or
// missing category, unknown account, transfer missing its other account, …), grouped so a whole
// group can be fixed at once, or marked "leave as is". Loaded after app.js.
"use strict";

const ISSUE_HELP = {
  "unknown-category": "This category isn't in your category list (often a name from the old spreadsheet).",
  "no-category": "No category was chosen.",
  "unknown-account": "This account isn't in your account list.",
  "transfer-no-to": "A transfer needs the account the money went to.",
  "to-on-non-transfer": "Only transfers should have a To account.",
  "no-date": "The transaction has no date.",
};

function attentionSection() {
  const groups = Model.issueGroups(CFG, Store.transactions());
  // Nothing open: still offer a way back to anything that was marked "leave as is"
  if (!groups.length) return ackedCount() ? `<div class="at-quiet" id="attention-quiet">${ackedCount()} transaction(s) marked "leave as is". <a href="#" id="at-unack">Show again</a></div>` : "";
  const total = new Set(groups.flatMap((g) => g.txs.map((t) => t.id))).size;
  const catOpts = catOptions("", "Choose a category…", (c) => c.kind !== "Transfer");
  const acctOpts = (not) => opts(Model.openAccounts(CFG).map((a) => a.name).filter((n) => n !== not), "", "Choose an account…");

  const fixer = (g, i) => {
    switch (g.code) {
      case "unknown-category": return `
        <select class="at-cat">${catOpts}</select><button class="small primary" data-act="recat" data-i="${i}">Move all to this category</button>
        <button class="small" data-act="addcat" data-i="${i}" title="Add &quot;${esc(g.value)}&quot; to your categories so these count normally">Add "${esc(g.value)}" as a category</button>`;
      case "no-category": return `<select class="at-cat">${catOpts}</select><button class="small primary" data-act="recat" data-i="${i}">Set category for all</button>`;
      case "unknown-account": return `
        <select class="at-acct">${acctOpts("")}</select><button class="small primary" data-act="reacct" data-i="${i}">Move all to this account</button>
        <button class="small" data-act="addacct" data-i="${i}">Add "${esc(g.value)}" as an account</button>`;
      case "to-on-non-transfer": return `<button class="small primary" data-act="clearto" data-i="${i}">Remove the To account</button>`;
      default: return `<span class="muted">Fix each one: click it below.</span>`;
    }
  };
  const amountSum = (txs) => txs.reduce((s, t) => s + (+t.amount || 0), 0);

  return `
  <div class="card attention-card" id="attention">
    <div class="row"><h2 class="attention-title">Needs attention<span class="count">${total}</span></h2>
      <span class="hint">Fix each group, or leave it as is.</span></div>
    ${groups.map((g, i) => {
      const open = ui.attOpen === g.sig;
      return `<div class="at-group" data-i="${i}">
        <div class="at-head">
          <div class="at-what"><b>${esc(cap(g.label))}</b> <span class="muted">· ${g.txs.length} · ${money(amountSum(g.txs), false)}</span>
            <div class="hint">${ISSUE_HELP[g.code] || ""}</div></div>
          <div class="at-fix">${fixer(g, i)}
            <button class="small" data-act="ack" data-i="${i}" title="Keep them as they are and stop flagging this">Leave as is</button>
            <button class="small ghost" data-act="toggle" data-i="${i}">${open ? "Hide" : "Show"} transactions</button></div>
        </div>
        ${open ? `<div class="table-wrap at-list"><table><tbody>${g.txs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200).map((t) => `
          <tr class="clickable" data-id="${esc(t.id)}"><td class="nowrap">${t.date ? fmtDate(t.date) : "—"}</td><td>${esc(t.desc)}</td><td class="num">${money(t.amount, false)}</td>
          <td class="muted">${esc(t.category || "—")}</td><td class="muted">${esc(t.account || "—")}</td></tr>`).join("")}
          ${g.txs.length > 200 ? `<tr><td colspan="5" class="muted">…and ${g.txs.length - 200} more.</td></tr>` : ""}</tbody></table></div>` : ""}
      </div>`;
    }).join("")}
    ${ackedCount() ? `<p class="hint" style="margin:8px 0 0">${ackedCount()} transaction(s) were marked "leave as is". <a href="#" id="at-unack">Show them again</a></p>` : ""}
  </div>`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ackedCount = () => Store.transactions().filter((t) => (t.ackIssues || []).length).length;

function wireAttention() {
  const root = $("#attention");
  const un = $("#at-unack");
  if (un) un.onclick = async (e) => {
    e.preventDefault();
    const list = Store.transactions().filter((t) => (t.ackIssues || []).length);
    if (!confirm(`Show the ${list.length} "leave as is" transaction(s) as needing attention again?`)) return;
    await Store.saveTxs(list.map(({ ackIssues, ...t }) => t));
  };
  if (!root) return;
  const groups = Model.issueGroups(CFG, Store.transactions());
  catPickerWire(root, "select.at-cat", (c) => c.kind !== "Transfer");
  root.onclick = async (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) { openTx(Store.transactions().find((t) => t.id === tr.dataset.id)); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const g = groups[+b.dataset.i], box = b.closest(".at-group"), n = g.txs.length;
    const apply = async (fn, msg) => { await Store.saveTxs(g.txs.map(fn)); toast(msg); };
    switch (b.dataset.act) {
      case "toggle": ui.attOpen = ui.attOpen === g.sig ? null : g.sig; renderTransactions(); break;
      case "recat": {
        const c = box.querySelector(".at-cat").value;
        if (!c) { toast("Choose a category first."); return; }
        if (!confirm(`Set the category of ${n} transaction(s) to "${c}"?`)) return;
        await apply((t) => ({ ...t, category: c }), `${n} transaction(s) moved to ${c}.`); break;
      }
      case "addcat": {
        const group = prompt(`Add "${g.value}" as a new category.\nWhich group should it go in? (e.g. Bills, Transportation, Entertainment)`, "Entertainment");
        if (group === null) return;
        await Store.setCfg("categories", [...CFG.categories, { name: g.value, group: group.trim() || "Other", kind: "Expense", budget: null }]);
        toast(`Added "${g.value}" to your categories. Change its group or kind in Settings › Categories.`, 4500); break;
      }
      case "reacct": {
        const a = box.querySelector(".at-acct").value;
        if (!a) { toast("Choose an account first."); return; }
        if (!confirm(`Move ${n} transaction(s) to the account "${a}"?`)) return;
        await apply((t) => ({ ...t, account: a }), `${n} transaction(s) moved to ${a}.`); break;
      }
      case "addacct": {
        await Store.setCfg("accounts", [...CFG.accounts, { name: g.value, owner: "joint", type: "Checking", note: "" }]);
        toast(`Added "${g.value}" as an account (owner: Joint). Set its owner in Settings › Accounts.`, 4500); break;
      }
      case "clearto": await apply((t) => ({ ...t, toAccount: "" }), `Removed the To account from ${n} transaction(s).`); break;
      case "ack": {
        if (!confirm(`Leave these ${n} transaction(s) as they are and stop flagging "${g.label}"?\nThey keep counting exactly as they do now.`)) return;
        await apply((t) => ({ ...t, ackIssues: [...new Set([...(t.ackIssues || []), g.sig])] }), `OK, ${n} transaction(s) left as they are.`); break;
      }
    }
  };
}

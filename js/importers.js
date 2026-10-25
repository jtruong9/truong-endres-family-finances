// Importers (old database .xlsm, bank CSV) and exporters.
// Every importer returns plain transaction objects; the UI previews them before saving.
"use strict";

const Importers = (() => {
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // Excel date cell -> "YYYY-MM-DD" (SheetJS gives Date objects with cellDates:true, or serials)
  function toIso(v) {
    if (v instanceof Date && !isNaN(v)) return iso(new Date(v.getTime() + 12 * 3600e3)); // noon: dodge TZ edge
    if (typeof v === "number") return iso(new Date(Date.UTC(1899, 11, 30) + v * 86400e3 + 12 * 3600e3));
    if (typeof v === "string") return parseDate(v);
    return "";
  }

  // "10/24/2026", "2026-10-24", "10/24/26" -> "2026-10-24"
  function parseDate(s) {
    s = String(s || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return `${y}-${pad(+m[1])}-${pad(+m[2])}`;
    }
    return "";
  }

  const toNum = (v) => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").replace(/[$,\s]/g, "");
    const neg = /^\(.*\)$/.test(s);
    const n = parseFloat(s.replace(/[()]/g, ""));
    return isNaN(n) ? NaN : neg ? -n : n;
  };

  // ---- Old database: sheet "Expense History", columns Month | Date | Description | Value | Category | Notes ----
  function fromOldTemplate(wb, account) {
    const ws = wb.Sheets["Expense History"];
    if (!ws) throw new Error('No "Expense History" sheet in this file. Pick the old expense database (the spreadsheet with the Add Expense button).');
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 2, raw: true, defval: null });
    const out = [];
    for (const r of rows) {
      const date = toIso(r[1]);
      const amount = toNum(r[3]);
      if (!date || isNaN(amount)) continue;
      out.push({ date, desc: String(r[2] ?? "").trim(), amount: Math.round(amount * 100) / 100,
                 category: String(r[4] ?? "").trim(), account, toAccount: "", notes: String(r[5] ?? "").trim(), tags: "" });
    }
    return out;
  }

  function readWorkbook(file) {
    return file.arrayBuffer().then((buf) => XLSX.read(buf, { type: "array", cellDates: true }));
  }

  // ---- Bank CSV ----
  // Banks disagree on column names and on the sign of purchases, so the UI asks the user to map
  // columns; this guesses a starting mapping from the header names.
  function parseCsv(text) {
    const wb = XLSX.read(text, { type: "string", raw: true });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    while (rows.length && rows[0].every((c) => String(c).trim() === "")) rows.shift();
    return { header: (rows[0] || []).map(String), rows: rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")) };
  }

  function guessMapping(header) {
    const find = (...words) => header.findIndex((h) => words.some((w) => h.toLowerCase().includes(w)));
    return {
      date: Math.max(find("transaction date", "posted date", "posting date", "date"), 0),
      desc: find("description", "payee", "merchant", "name", "memo"),
      amount: find("amount"),
      debit: find("debit", "withdrawal"),
      credit: find("credit", "deposit"),
      purchasesAreNegative: true,
    };
  }

  // Turn mapped CSV rows into review-queue rows. Each keeps the bank's direction: amount is always
  // positive and dir is "out" (money left the account) or "in" (money arrived). Categories are
  // filled later by guessing and confirmed by a person (Model.resolveReview).
  function fromCsv(parsed, map, account) {
    const out = [];
    for (const r of parsed.rows) {
      const date = parseDate(r[map.date]) || toIso(r[map.date]);
      let out$;   // positive = money out
      if (map.amount >= 0) {
        out$ = toNum(r[map.amount]);
        if (map.purchasesAreNegative) out$ = -out$;   // bank shows -45.00 for a purchase
      } else {
        const d = toNum(r[map.debit]) || 0, c = toNum(r[map.credit]) || 0;
        out$ = Math.abs(d) - Math.abs(c);
      }
      if (!date || isNaN(out$) || out$ === 0) continue;
      out.push({ date, desc: String(r[map.desc] ?? "").trim(), amount: Math.round(Math.abs(out$) * 100) / 100,
                 dir: out$ > 0 ? "out" : "in", account, toAccount: "", category: "", notes: "", tags: "", review: true });
    }
    return out;
  }

  // Same bank row imported before (in the queue or already confirmed) = skip it.
  // Keyed on what the bank file says: date, amount, account and description.
  const bankKey = (t) => `${t.date}|${Math.abs(+t.amount).toFixed(2)}|${t.account}|${(t.bankDesc || t.desc || "").toLowerCase().replace(/\s+/g, " ")}`;
  function markDuplicates(incoming, existing) {
    const have = new Set(existing.map(bankKey));
    return incoming.map((t) => ({ ...t, _dup: have.has(bankKey(t)) }));
  }

  // ---- Export ----
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportXlsx(cfg, txs, name) {
    const rows = txs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => ({
      Date: t.date, Description: t.desc, Amount: t.amount, Category: t.category, Account: t.account,
      "To Account": t.toAccount || "", Owner: Model.ownerLabel(cfg, Model.ownerOf(cfg, t)), Kind: Model.kindOf(cfg, t),
      Notes: t.notes || "", Tags: t.tags || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Transactions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.accounts.map((a) => ({ ...a, owner: Model.ownerLabel(cfg, a.owner) }))), "Accounts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.categories), "Categories");
    XLSX.writeFile(wb, name);
  }

  return { readWorkbook, fromOldTemplate, parseCsv, guessMapping, fromCsv, markDuplicates, download, exportXlsx, parseDate };
})();

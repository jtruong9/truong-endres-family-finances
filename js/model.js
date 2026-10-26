// Money model and calculations. Everything here is pure (no DOM), so it's easy to test.
//
// Transaction: { id, date "YYYY-MM-DD", desc, amount (positive; negative = refund),
//                category, account, toAccount (transfers only), notes, tags }
// Category kinds: Income | Savings | Expense | Transfer. Transfers never count as income/spending.
"use strict";

const Model = (() => {
  const DEFAULT_PEOPLE = { p1: "Justin", p2: "Kelly", joint: "Joint", p1Full: "Justin Truong", p2Full: "Kelly Endres" };

  // Three real bank accounts. The Hub's money is also split, on paper, into three spending pots
  // (type "Inside Joint Hub", in: the bank account that holds it). Justin/Kelly Personal are the old
  // personal accounts: kept, closed, so past years still add up.
  const POT = "Inside Joint Hub";
  const DEFAULT_ACCOUNTS = [
    { name: "Joint Hub", owner: "joint", type: "Checking", note: "Every paycheck lands here, then gets distributed" },
    { name: "Joint Savings", owner: "joint", type: "Savings", note: "Shared savings" },
    { name: "Joint Bills", owner: "joint", type: "Checking", note: "Pays all recurring bills" },
    { name: "Justin's Spending", owner: "p1", type: POT, in: "Joint Hub", note: "Justin's money to spend" },
    { name: "Kelly's Spending", owner: "p2", type: POT, in: "Joint Hub", note: "Kelly's money to spend" },
    { name: "Joint Spending", owner: "joint", type: POT, in: "Joint Hub", note: "Eating out together, groceries, other shared costs" },
    { name: "Justin Personal", owner: "p1", type: "Checking", closed: true, note: "Old personal account (history)" },
    { name: "Kelly Personal", owner: "p2", type: "Checking", closed: true, note: "Old personal account (history)" },
  ];
  const isPot = (a) => !!a && a.type === POT;
  // Accounts to offer when entering something new (closed ones stay only for history)
  const openAccounts = (cfg) => cfg.accounts.filter((a) => !a.closed);

  const DEFAULT_CATEGORIES = [
    ["Paychecks", "Income", "Income"], ["Other Income Sources", "Income", "Income"],
    ["Monthly Saving", "Savings", "Savings"], ["Roth IRA Savings", "Savings", "Savings"],
    ["Investment Savings", "Savings", "Savings"],
    ["Tuition", "Bills", "Expense"], ["Rent / Mortgage", "Bills", "Expense"], ["Rental Insurance", "Bills", "Expense"],
    ["Electricity / Gas Bill", "Bills", "Expense"], ["Water Bill", "Bills", "Expense"], ["Phone Bill", "Bills", "Expense"],
    ["Internet Bill", "Bills", "Expense"],
    ["Gas", "Transportation", "Expense"], ["Car Payment", "Transportation", "Expense"],
    ["Car Payment / House Repair", "Transportation", "Expense"], ["Auto Insurance", "Transportation", "Expense"],
    ["Doctor / Dentist", "Health", "Expense"], ["Vet / Pet Care", "Health", "Expense"],
    ["Food & Drinks", "Food and Drinks", "Expense"], ["Groceries", "Food and Drinks", "Expense"],
    ["Travel", "Entertainment", "Expense"], ["Gym", "Entertainment", "Expense"], ["Personal", "Entertainment", "Expense"],
    ["Subscriptions", "Entertainment", "Expense"],
    ["Transfer", "Transfer", "Transfer"],
  ].map(([name, group, kind]) => ({ name, group, kind, budget: null }));

  // Order groups appear in on the Summary. Older groups (Bills, Entertainment…) stay for past years.
  const GROUP_ORDER = ["Income", "Savings", "Home", "Rental Property", "Bills", "Transportation", "Food", "Food and Drinks",
    "Health & Care", "Health", "Lifestyle", "Entertainment", "Travel", "Other"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Month colors from the old expense database: header color, and the lighter tint used for its cells
  const MONTH_COLORS = [
    ["#EF956D", "#F7C8B3"], ["#9999FF", "#B9B9FF"], ["#9DF1EF", "#CCF8F7"], ["#F95555", "#FCAEAE"],
    ["#92D050", "#BEE395"], ["#FFD966", "#FFE89F"], ["#FF9797", "#FFC5C5"], ["#FFC000", "#FFDB69"],
    ["#00B0F0", "#C1EFFF"], ["#9BC2E6", "#BCD6EE"], ["#DA4E83", "#E78DAF"], ["#24908B", "#65D9D3"],
  ];

  const r2 = (x) => Math.round(x * 100) / 100;

  function config(get) {
    const people = { ...DEFAULT_PEOPLE, ...get("people", {}) };
    const accounts = get("accounts", DEFAULT_ACCOUNTS);
    const categories = get("categories", DEFAULT_CATEGORIES);
    const groups = [...GROUP_ORDER];
    for (const c of categories) if (c.kind !== "Transfer" && !groups.includes(c.group)) groups.push(c.group);
    return {
      people, accounts, categories, groups,
      recurring: get("recurring", []),
      split: get("split", []),           // paycheck distribution: [{ toAccount, mode: "fixed"|"percent"|"rest", value }]
      rules: get("rules", []),           // CSV auto-categorize: [{ match, category }]
      goals: get("goals", []),           // [{ name, type: "save"|"budget", tag, target, due "YYYY-MM", note }]
      rental: get("rental", { name: "Rental property", match: "", tag: "rental" }),
      balanceChecks: get("balanceChecks", []),   // [{ account, date, bank, app, at }]
      checkins: get("checkins", {}),             // { "YYYY-MM": { at, by, note } }
      reorgDone: get("reorgDone", {}),           // { year: { at, count } } — "Reorganize a year" history
      accountByName: new Map(accounts.map((a) => [a.name, a])),
      categoryByName: new Map(categories.map((c) => [c.name, c])),
    };
  }

  // Bank-imported rows wait in a review queue and don't count anywhere until confirmed
  const isPosted = (t) => !t.review;
  const tagList = (t) => String(t.tags || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  const ownerLabel = (cfg, key) => cfg.people[key] || key;
  const kindOf = (cfg, tx) => (cfg.categoryByName.get(tx.category) || {}).kind || "Expense";
  const ownerOf = (cfg, tx) => (cfg.accountByName.get(tx.account) || {}).owner || "";

  // owner filter: "all" | "joint" | "p1" | "p2"
  const matchesOwner = (cfg, tx, owner) => owner === "all" || ownerOf(cfg, tx) === owner;

  // What one transaction adds to an owner's view, as [{ category, kind, amount }] ([] = nothing).
  // Savings someone puts into a joint account (Justin Personal -> Joint Savings) count for the payer
  // AND for Joint. In the Joint view they also count as money in ("From Justin"), because the
  // paycheck behind them is under the payer; that keeps Joint's Remaining from going negative.
  // Household ("all") counts everything once.
  const FROM_PREFIX = "From ";
  function ownerParts(cfg, t, owner) {
    const kind = kindOf(cfg, t);
    if (kind === "Transfer") return [];
    if (matchesOwner(cfg, t, owner)) return [{ category: t.category, kind, amount: t.amount }];
    const to = cfg.accountByName.get(t.toAccount);
    if (kind === "Savings" && owner === "joint" && to && to.owner === "joint") {
      const who = ownerOf(cfg, t);
      return [{ category: t.category, kind, amount: t.amount },
        { category: `${FROM_PREFIX}${cfg.people[who] || "other accounts"}`, kind: "Income", amount: t.amount, putIn: true }];
    }
    return [];
  }

  function inYear(tx, y) { return tx.date && +tx.date.slice(0, 4) === y; }
  function monthIdx(tx) { return +tx.date.slice(5, 7) - 1; }

  // Category x month grid for one year and owner
  function yearGrid(cfg, txs, year, owner) {
    const grid = new Map();   // category -> [12]
    for (const t of txs) {
      if (!isPosted(t) || !inYear(t, year)) continue;
      for (const p of ownerParts(cfg, t, owner)) {
        if (!grid.has(p.category)) grid.set(p.category, Array(12).fill(0));
        grid.get(p.category)[monthIdx(t)] += p.amount;
      }
    }
    for (const row of grid.values()) for (let i = 0; i < 12; i++) row[i] = r2(row[i]);
    return grid;
  }

  // Months to average over: 12 for past years, months so far for the current year
  function monthsElapsed(year, today = new Date()) {
    const y = today.getFullYear();
    if (year < y) return 12;
    if (year > y) return 1;
    return today.getMonth() + 1;
  }

  // Income / savings / spending totals per month for a year
  function monthlyTotals(cfg, txs, year, owner) {
    const out = { income: Array(12).fill(0), savings: Array(12).fill(0), spending: Array(12).fill(0) };
    for (const t of txs) {
      if (!isPosted(t) || !inYear(t, year)) continue;
      for (const p of ownerParts(cfg, t, owner)) {
        if (p.kind === "Income") out.income[monthIdx(t)] += p.amount;
        else if (p.kind === "Savings") out.savings[monthIdx(t)] += p.amount;
        else if (p.kind === "Expense") out.spending[monthIdx(t)] += p.amount;
      }
    }
    for (const key of Object.keys(out)) out[key] = out[key].map(r2);
    out.remaining = out.income.map((v, i) => r2(v - out.savings[i] - out.spending[i]));
    return out;
  }

  // Money in/out per account for one month: how much of the paycheck is left in the Hub,
  // how much allowance is left in each personal account
  function accountFlows(cfg, txs, year, month) {
    const rows = new Map(cfg.accounts.map((a) => [a.name, { account: a.name, owner: a.owner, income: 0, transfersIn: 0, spent: 0, saved: 0, transfersOut: 0 }]));
    const get = (name) => {
      if (!rows.has(name)) rows.set(name, { account: name, owner: "", income: 0, transfersIn: 0, spent: 0, saved: 0, transfersOut: 0 });
      return rows.get(name);
    };
    for (const t of txs) {
      if (!isPosted(t) || !inYear(t, year) || monthIdx(t) !== month) continue;
      const k = kindOf(cfg, t);
      const a = get(t.account);
      if (k === "Transfer") {
        a.transfersOut += t.amount;
        if (t.toAccount) get(t.toAccount).transfersIn += t.amount;
      } else if (k === "Income") a.income += t.amount;
      else if (k === "Savings") { a.saved += t.amount; if (t.toAccount) get(t.toAccount).transfersIn += t.amount; }
      else a.spent += t.amount;
    }
    return [...rows.values()].map((r) => {
      for (const k of ["income", "transfersIn", "spent", "saved", "transfersOut"]) r[k] = r2(r[k]);
      r.net = r2(r.income + r.transfersIn - r.spent - r.saved - r.transfersOut);
      return r;
    });
  }

  // Build the transfers that distribute one paycheck from the Hub
  // Order: every fixed $ amount first, then each percent OF WHAT'S LEFT after the fixed amounts,
  // then "Rest" lines share whatever remains. Results come back in that order.
  function distribute(split, amount) {
    const out = [];
    let left = amount;
    for (const s of split.filter((s) => s.mode === "fixed")) {
      const v = r2(+s.value);
      if (v > 0) { out.push({ toAccount: s.toAccount, amount: v }); left = r2(left - v); }
    }
    const afterFixed = Math.max(0, left);
    for (const s of split.filter((s) => s.mode === "percent")) {
      const v = r2((afterFixed * s.value) / 100);
      if (v > 0) { out.push({ toAccount: s.toAccount, amount: v }); left = r2(left - v); }
    }
    const rest = split.filter((s) => s.mode === "rest");
    if (rest.length && left > 0) {
      const each = r2(left / rest.length);
      rest.forEach((s, i) => out.push({ toAccount: s.toAccount, amount: i === rest.length - 1 ? r2(left - each * (rest.length - 1)) : each }));
      left = 0;
    }
    return { transfers: out, leftover: r2(left) };
  }

  // Recurring bill status for a given month. A bill counts as paid by a transaction logged from the
  // Bills tab (t.bill), or one that month with the bill's category + account (+ match text, if set).
  function recurringStatus(cfg, txs, year, month, today = new Date()) {
    return cfg.recurring.map((b) => {
      const paid = txs.filter((t) => isPosted(t) && inYear(t, year) && monthIdx(t) === month &&
        (t.bill === b.name || (t.category === b.category && t.account === b.account &&
        (!b.match || (t.desc || "").toLowerCase().includes(b.match.toLowerCase())))));
      const isCurrent = year === today.getFullYear() && month === today.getMonth();
      const isPast = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
      let status = "Upcoming";
      if (paid.length) status = "Paid";
      else if (isPast || (isCurrent && today.getDate() > b.day)) status = "Overdue";
      else if (isCurrent && b.day - today.getDate() <= 5) status = "Due soon";
      return { ...b, status, paidAmount: r2(paid.reduce((s, t) => s + t.amount, 0)) };
    });
  }

  // Problems worth flagging in the ledger. Each has a code + value so a group of them can be fixed
  // at once, and a sig ("code:value") a person can mark "leave as is" (stored on the transaction as
  // ackIssues: [sig, ...]). A different problem on the same transaction still shows up.
  function issueList(cfg, t) {
    const out = [];
    const add = (code, value, label) => out.push({ code, value: value || "", label, sig: `${code}:${value || ""}` });
    if (!t.date) add("no-date", "", "no date");
    if (!cfg.accountByName.has(t.account)) add("unknown-account", t.account, `unknown account "${t.account || ""}"`);
    if (!t.category) add("no-category", "", "no category");
    else if (!cfg.categoryByName.has(t.category)) add("unknown-category", t.category, `unknown category "${t.category}"`);
    const k = kindOf(cfg, t);
    if (k === "Transfer" && !t.toAccount) add("transfer-no-to", "", "transfer has no To account");
    if (k !== "Transfer" && k !== "Savings" && t.toAccount) add("to-on-non-transfer", "", "To account set on a non-transfer");
    return out;
  }
  const issues = (cfg, t) => issueList(cfg, t).map((i) => i.label);

  // Problems that still need a person: saved (not in review) and not marked "leave as is"
  function openIssues(cfg, t) {
    if (!isPosted(t)) return [];
    const ack = new Set(t.ackIssues || []);
    return issueList(cfg, t).filter((i) => !ack.has(i.sig));
  }

  // Open problems grouped for bulk fixing, most important first: [{ sig, code, value, label, txs }]
  const ISSUE_ORDER = ["unknown-category", "no-category", "unknown-account", "transfer-no-to", "to-on-non-transfer", "no-date"];
  function issueGroups(cfg, txs) {
    const m = new Map();
    for (const t of txs) for (const i of openIssues(cfg, t)) {
      if (!m.has(i.sig)) m.set(i.sig, { ...i, txs: [] });
      m.get(i.sig).txs.push(t);
    }
    return [...m.values()].sort((a, b) => ISSUE_ORDER.indexOf(a.code) - ISSUE_ORDER.indexOf(b.code) || b.txs.length - a.txs.length);
  }

  // CSV rule matching: first rule whose text appears in the description wins
  function autoCategory(rules, desc) {
    const d = (desc || "").toLowerCase();
    const hit = rules.find((r) => r.match && d.includes(r.match.toLowerCase()));
    return hit ? hit.category : "";
  }

  // ------------------------------------------------------------------ review queue
  // A review row keeps the bank's direction: amount is always positive, dir is "out" (money left
  // the account) or "in" (money arrived). Confirming turns it into a normal transaction.
  function resolveReview(cfg, row, choice) {
    const category = choice.category;
    const kind = (cfg.categoryByName.get(category) || {}).kind || "Expense";
    const t = { ...row, category, tags: choice.tags ?? row.tags ?? "", review: false, guess: false };
    if (kind === "Transfer" || (kind === "Savings" && choice.other)) {
      if (row.dir === "in") { t.account = choice.other; t.toAccount = row.account; }
      else { t.account = row.account; t.toAccount = choice.other; }
      t.amount = row.amount;
    } else {
      t.toAccount = "";
      // Income is positive when money came in; spending is positive when money went out
      t.amount = kind === "Income" ? (row.dir === "in" ? row.amount : -row.amount) : (row.dir === "out" ? row.amount : -row.amount);
    }
    return t;
  }

  // "GROCER #1234 SPRINGFIELD ST" -> "grocer springfield st": a key that stays the same between visits
  function merchantKey(desc) {
    return String(desc || "").toLowerCase().replace(/[#*]\S*/g, " ").replace(/\d+/g, " ").replace(/[^a-z&' ]/g, " ")
      .split(/\s+/).filter((w) => w.length > 1).slice(0, 3).join(" ");
  }

  // Index of what each merchant was categorized as before (latest wins; first word = most common)
  function buildGuessIndex(cfg, txs) {
    const full = new Map(), firstCounts = new Map();
    const sorted = txs.filter(isPosted).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const t of sorted) {
      if (!cfg.categoryByName.has(t.category)) continue;
      const key = merchantKey(t.desc);
      if (!key) continue;
      full.set(key, t.category);
      const w = key.split(" ")[0];
      if (w.length >= 4) {
        if (!firstCounts.has(w)) firstCounts.set(w, new Map());
        const m = firstCounts.get(w); m.set(t.category, (m.get(t.category) || 0) + 1);
      }
    }
    const first = new Map([...firstCounts].map(([w, m]) => [w, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
    return { full, first };
  }

  function guessCategory(cfg, index, row) {
    const transfer = (cfg.categories.find((c) => c.kind === "Transfer") || {}).name;
    let c = autoCategory(cfg.rules, row.desc);
    const key = merchantKey(row.desc);
    if (!c) c = index.full.get(key) || index.first.get(key.split(" ")[0]) || "";
    if (!c && transfer && /transfer|xfer|zelle|venmo cashout/i.test(row.desc || "")) c = transfer;
    if (!c && row.dir === "in" && /payroll|direct dep|salary|paycheck/i.test(row.desc || "") && cfg.categoryByName.has("Paychecks")) c = "Paychecks";
    const kind = (cfg.categoryByName.get(c) || {}).kind;
    if (!kind || (kind === "Income" && row.dir === "out")) return "";
    return c;
  }

  // Possible duplicates: an already-saved transaction in (or transferring into) the same account,
  // same amount, within a few days. Each saved transaction can explain only one row per account.
  function buildMatchIndex(txs) {
    const m = new Map();
    for (const t of txs) {
      if (!isPosted(t)) continue;
      const k = Math.round(Math.abs(t.amount) * 100);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return m;
  }
  function findMatches(index, rows, days = 4) {
    const claimed = new Set();
    const out = new Map();
    for (const row of rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
      const d = Date.parse(row.date);
      const hit = (index.get(Math.round(row.amount * 100)) || [])
        .filter((t) => (t.account === row.account || t.toAccount === row.account) && !claimed.has(`${t.id}|${row.account}`) &&
          Math.abs(Date.parse(t.date) - d) <= days * 864e5)
        .sort((a, b) => Math.abs(Date.parse(a.date) - d) - Math.abs(Date.parse(b.date) - d))[0];
      if (hit) { claimed.add(`${hit.id}|${row.account}`); out.set(row.id, hit); }
    }
    return out;
  }

  // ------------------------------------------------------------------ batch edit (Transactions)
  // Apply one set of changes to a transaction. Only the fields given change:
  //   { category, account, toAccount, date, addTags: "a, b", removeTags: "c", note, noteMode: "add"|"replace" }
  // Returns the edited copy, or the same object when nothing changed (so the caller can skip it).
  function batchEdit(cfg, t, ch) {
    const out = { ...t };
    if (ch.category) out.category = ch.category;
    if (ch.account) out.account = ch.account;
    if (ch.date) out.date = ch.date;
    if (ch.toAccount !== undefined && ch.toAccount !== null) out.toAccount = ch.toAccount;
    // A To account only means something on a transfer or savings; clear it otherwise
    const k = kindOf(cfg, out);
    if (k !== "Transfer" && k !== "Savings") out.toAccount = "";
    if (out.toAccount && out.toAccount === out.account) out.toAccount = t.toAccount === out.account ? "" : t.toAccount;
    if (ch.addTags || ch.removeTags) {
      const split = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
      const drop = new Set(split(ch.removeTags).map((x) => x.toLowerCase()));
      const tags = split(out.tags).filter((x) => !drop.has(x.toLowerCase()));
      for (const a of split(ch.addTags)) if (!tags.some((x) => x.toLowerCase() === a.toLowerCase())) tags.push(a);
      out.tags = tags.join(", ");
    }
    if (ch.note) out.notes = ch.noteMode === "replace" || !t.notes ? ch.note : `${t.notes} · ${ch.note}`;
    const same = ["category", "account", "toAccount", "date", "tags", "notes"].every((f) => (out[f] || "") === (t[f] || ""));
    return same ? t : out;
  }
  // Why a batch can't be applied as asked (shown before anything is saved), or ""
  function batchProblem(cfg, txs, ch) {
    if (ch.category && kindOf(cfg, { category: ch.category }) === "Transfer" && !ch.toAccount && txs.some((t) => !t.toAccount))
      return "Transfers need a To account: pick one in the To / Put into box.";
    if (ch.date && !/^\d{4}-\d{2}-\d{2}$/.test(ch.date)) return "Pick a full date.";
    return "";
  }

  // ------------------------------------------------------------------ balances
  // Money in/out of one account from a transaction (credit cards go negative as you spend)
  function accountEffect(cfg, t, name) {
    const k = kindOf(cfg, t);
    let e = 0;
    if (t.account === name) e += k === "Income" ? t.amount : -t.amount;
    // A transfer, or savings put into one of our accounts (e.g. Joint Savings), lands in toAccount
    if ((k === "Transfer" || k === "Savings") && t.toAccount === name) e += t.amount;
    return e;
  }
  const hasOpening = (a) => a && a.openingDate && a.openingBalance !== null && a.openingBalance !== undefined && a.openingBalance !== "";

  // Balance at the END of the given date. The starting balance is the balance before anything on its date.
  function balanceAt(cfg, txs, name, iso) {
    const a = cfg.accountByName.get(name);
    if (!hasOpening(a) || iso < a.openingDate) return null;
    let b = +a.openingBalance;
    for (const t of txs) if (isPosted(t) && t.date >= a.openingDate && t.date <= iso) b += accountEffect(cfg, t, name);
    return r2(b);
  }
  // What the bank shows for a real account = its own balance + every pot inside it. Pots have no
  // starting balance of their own (they start at 0 on the account's starting date).
  function bankBalanceAt(cfg, txs, name, iso) {
    const a = cfg.accountByName.get(name);
    const own = balanceAt(cfg, txs, name, iso);
    if (own === null) return null;
    let b = own;
    for (const p of cfg.accounts.filter((x) => isPot(x) && x.in === name))
      for (const t of txs) if (isPosted(t) && t.date >= a.openingDate && t.date <= iso) b += accountEffect(cfg, t, p.name);
    return r2(b);
  }
  // A pot's money so far (from the holding account's starting date, else from the beginning)
  function potBalanceAt(cfg, txs, name, iso) {
    const p = cfg.accountByName.get(name), host = p && cfg.accountByName.get(p.in);
    const from = hasOpening(host) ? host.openingDate : "";
    let b = 0;
    for (const t of txs) if (isPosted(t) && t.date >= from && t.date <= iso) b += accountEffect(cfg, t, name);
    return r2(b);
  }

  // ------------------------------------------------------------------ goals (tracked by tag)
  function monthsBetween(fromDate, dueYm) {
    if (!dueYm) return null;
    const [y, m] = dueYm.split("-").map(Number);
    return (y - fromDate.getFullYear()) * 12 + (m - 1 - fromDate.getMonth());
  }
  function goalProgress(cfg, txs, g, today = new Date()) {
    const tag = String(g.tag || g.name || "").trim().toLowerCase();
    let added = 0, spent = 0;
    const items = [];
    for (const t of txs) {
      if (!isPosted(t) || !tag || !tagList(t).includes(tag)) continue;
      items.push(t);
      if (kindOf(cfg, t) === "Expense") spent += t.amount; else added += t.amount;
    }
    const target = +g.target || 0;
    const left = monthsBetween(today, g.due);
    if (g.type === "budget") {
      return { type: "budget", tag, target, spent: r2(spent), left: r2(target - spent), pct: target ? spent / target : 0, over: spent > target, items };
    }
    const saved = r2(added - spent);
    const monthsLeft = left === null ? null : Math.max(1, left + 1);
    return { type: "save", tag, target, saved, need: r2(Math.max(0, target - saved)), pct: target ? saved / target : 0,
             monthsLeft, perMonth: monthsLeft ? r2(Math.max(0, target - saved) / monthsLeft) : null, done: saved >= target && target > 0,
             pastDue: left !== null && left < 0 && saved < target, items };
  }

  // ------------------------------------------------------------------ compare years
  function yearCompare(cfg, txs, owner, today = new Date()) {
    const years = [...new Set(txs.filter(isPosted).map((t) => +t.date.slice(0, 4)))].filter(Boolean).sort((a, b) => a - b);
    const totals = new Map();   // category -> { year: total }
    for (const t of txs) {
      if (!isPosted(t)) continue;
      const y = +t.date.slice(0, 4);
      for (const p of ownerParts(cfg, t, owner)) {
        if (!totals.has(p.category)) totals.set(p.category, {});
        const row = totals.get(p.category);
        row[y] = (row[y] || 0) + p.amount;
      }
    }
    const months = Object.fromEntries(years.map((y) => [y, monthsElapsed(y, today)]));
    return { years, totals, months };
  }

  // ------------------------------------------------------------------ rental property
  function isRental(rental, t) {
    const m = String(rental.match || "").trim().toLowerCase(), tag = String(rental.tag || "").trim().toLowerCase();
    return (m && String(t.desc || "").toLowerCase().includes(m)) || (tag && tagList(t).includes(tag));
  }
  function rentalSummary(cfg, txs, year) {
    const rows = txs.filter((t) => isPosted(t) && kindOf(cfg, t) !== "Transfer" && isRental(cfg.rental, t));
    const byYear = new Map();
    const months = Array.from({ length: 12 }, () => ({ income: 0, expenses: 0 }));
    const byCategory = new Map();
    for (const t of rows) {
      const y = +t.date.slice(0, 4), inc = kindOf(cfg, t) === "Income";
      if (!byYear.has(y)) byYear.set(y, { year: y, income: 0, expenses: 0 });
      byYear.get(y)[inc ? "income" : "expenses"] += t.amount;
      if (y !== year) continue;
      months[monthIdx(t)][inc ? "income" : "expenses"] += t.amount;
      if (!inc) byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
    }
    const fin = (o) => ({ ...o, income: r2(o.income), expenses: r2(o.expenses), net: r2(o.income - o.expenses) });
    return {
      years: [...byYear.values()].sort((a, b) => b.year - a.year).map(fin),
      months: months.map(fin),
      byCategory: [...byCategory].map(([category, v]) => ({ category, amount: r2(v) })).sort((a, b) => b.amount - a.amount),
      list: rows.filter((t) => +t.date.slice(0, 4) === year).sort((a, b) => (a.date < b.date ? 1 : -1)),
    };
  }

  // ------------------------------------------------------------------ budgets for one month
  function budgetStatus(cfg, txs, year, month, owner = "all") {
    const spent = new Map();
    for (const t of txs) {
      if (!isPosted(t) || !inYear(t, year) || monthIdx(t) !== month || !matchesOwner(cfg, t, owner)) continue;
      spent.set(t.category, (spent.get(t.category) || 0) + t.amount);
    }
    return cfg.categories.filter((c) => c.kind !== "Transfer" && +c.budget > 0)
      .map((c) => ({ category: c.name, kind: c.kind, budget: +c.budget, spent: r2(spent.get(c.name) || 0) }))
      .map((b) => ({ ...b, over: b.kind === "Expense" && b.spent > b.budget }));
  }

  // ---- Money flow page: four rows, where money comes from → Joint Hub → the accounts it's split to
  // → where it leaves them. Both functions return { hub, nodes: [{ id, level, label, amount, lines }],
  // links: [{ from, to, amount, kind: "income"|"move"|"spent"|"saved" }] }. A link of 0 is a placeholder.
  const hubName = (cfg) => (cfg.accounts.find((a) => /hub/i.test(a.name)) || cfg.accounts[0] || {}).name;
  // Order of the accounts row: savings, bills, then the Hub's pots (each person, then joint), then
  // anything else. Closed accounts only show when money moved in them.
  const acctRank = (a) => (isPot(a) ? (a.owner === "p1" ? 2 : a.owner === "p2" ? 3 : 4)
    : a.closed ? 9 : a.owner === "joint" ? (a.type === "Savings" ? 0 : 1) : a.owner === "p1" ? 5 : a.owner === "p2" ? 6 : 7);
  const flowAccounts = (cfg, hub) => cfg.accounts.map((a, i) => ({ a, i })).filter(({ a }) => a.name !== hub)
    .sort((x, y) => acctRank(x.a) - acctRank(y.a) || x.i - y.i).map(({ a }) => a);
  const outLabel = (cfg, a, role) => (role === "save" ? "Savings" : role === "bills" ? "Recurring bills" : a.owner === "p1" || a.owner === "p2" ? `${cfg.people[a.owner]}'s spending` : a.owner === "joint" ? "Joint spending" : "Spending");
  const acctRole = (cfg, a) => (a.type === "Savings" ? "save" : cfg.recurring.some((b) => b.account === a.name) || /bill/i.test(a.name) ? "bills" : "spend");
  // Whose income: a name in the description ("Paycheck – Kelly"), else the account's owner
  function incomeOwner(cfg, t) {
    const d = String(t.desc || "").toLowerCase();
    for (const p of ["p1", "p2"]) if (cfg.people[p] && new RegExp(`\\b${cfg.people[p].toLowerCase()}\\b`).test(d)) return p;
    const o = ownerOf(cfg, t);
    return o === "p1" || o === "p2" ? o : "other";
  }
  // Most recent paycheck amount for a person (prefills the plan), or null
  function lastPaycheck(cfg, txs, who) {
    let best = null;
    for (const t of txs) {
      if (!isPosted(t) || kindOf(cfg, t) !== "Income" || !(t.category === "Paychecks" || /paycheck/i.test(t.desc || ""))) continue;
      if (incomeOwner(cfg, t) === who && (!best || t.date > best.date)) best = t;
    }
    return best ? r2(best.amount) : null;
  }

  // Plan: one paycheck each, split by Settings › Paycheck split. pays = [{ who: "p1", amount }]
  // Both paychecks land in the Hub; the split is applied ONCE to the total in the Hub
  // (a $2,500 fixed line takes $2,500 per pay period, not $2,500 per person).
  function planFlow(cfg, pays) {
    const hub = hubName(cfg), nodes = [], links = [], into = new Map();
    let hubIn = 0;
    for (const p of pays) {
      const amt = r2(+p.amount || 0);
      nodes.push({ id: `pay:${p.who}`, level: 0, label: `${cfg.people[p.who]}'s paycheck`, amount: amt, lines: [] });
      links.push({ from: `pay:${p.who}`, to: `acct:${hub}`, amount: amt, kind: "income" });
      hubIn += amt;
    }
    hubIn = r2(hubIn);
    const d = distribute(cfg.split, hubIn);
    let leftover = d.leftover;
    for (const t of d.transfers) {
      if (t.toAccount === hub) leftover += t.amount;
      else into.set(t.toAccount, (into.get(t.toAccount) || 0) + t.amount);
    }
    nodes.push({ id: `acct:${hub}`, level: 1, label: hub, amount: r2(hubIn), lines: [], hub: true });
    const accts = flowAccounts(cfg, hub).filter((a) => acctRank(a) < 7 || into.has(a.name));
    for (const name of into.keys()) if (!accts.some((a) => a.name === name)) accts.push({ name, owner: "", type: "" });
    for (const a of accts) {
      const amt = r2(into.get(a.name) || 0), role = acctRole(cfg, a);
      nodes.push({ id: `acct:${a.name}`, level: 2, label: a.name, amount: amt, lines: [], pot: isPot(a) && a.in === hub });
      links.push({ from: `acct:${hub}`, to: `acct:${a.name}`, amount: amt, kind: role === "save" ? "saved" : "move" });
      const billsListed = r2(cfg.recurring.filter((b) => b.account === a.name).reduce((s, b) => s + (+b.amount || 0), 0));
      nodes.push({ id: `out:${a.name}`, level: 3, label: outLabel(cfg, a, role), amount: amt, lines: billsListed ? [["Bills listed", billsListed]] : [] });
      links.push({ from: `acct:${a.name}`, to: `out:${a.name}`, amount: amt, kind: role === "save" ? "saved" : "spent" });
    }
    leftover = r2(leftover);
    if (leftover > 0.005) {
      nodes.push({ id: "left:hub", level: 2, label: `Stays in ${hub}`, amount: leftover, lines: [] });
      links.push({ from: `acct:${hub}`, to: "left:hub", amount: leftover, kind: "move" });
    }
    return { hub, nodes, links, leftover };
  }

  // Actual: what really moved in one month, from saved transactions (all owners)
  function actualFlow(cfg, txs, year, month) {
    const hub = hubName(cfg), nodes = [], links = [];
    const flows = new Map(accountFlows(cfg, txs, year, month).map((f) => [f.account, f]));
    const income = new Map(), hubTo = new Map(), hubSaved = new Map(), moved = new Map();
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    for (const t of txs) {
      if (!isPosted(t) || !inYear(t, year) || monthIdx(t) !== month) continue;
      const k = kindOf(cfg, t);
      if (k === "Income") add(income, `${incomeOwner(cfg, t)}|${t.account}`, t.amount);
      else if (k === "Transfer" && t.toAccount) (t.account === hub ? add(hubTo, t.toAccount, t.amount) : add(moved, t.account, t.amount));
      else if (k === "Savings" && t.toAccount && t.account === hub) add(hubSaved, t.toAccount, t.amount);
    }
    // Row 0: whose income, and the account it landed in
    const who = [...new Set([...income.keys()].map((k) => k.split("|")[0]))].sort();
    for (const w of who) {
      nodes.push({ id: `src:${w}`, level: 0, label: w === "other" ? "Other income" : `${cfg.people[w]}'s income`, amount: r2([...income].filter(([k]) => k.startsWith(`${w}|`)).reduce((s, [, v]) => s + v, 0)), lines: [] });
    }
    let notHub = 0;
    for (const [k, v] of income) {
      const [w, acct] = k.split("|");
      links.push({ from: `src:${w}`, to: `acct:${acct}`, amount: r2(v), kind: "income" });
      if (acct !== hub) notHub += v;
    }
    // Row 1: the hub, plus what it paid or saved itself and what's left in it
    const h = flows.get(hub) || { income: 0, transfersIn: 0, spent: 0, saved: 0, transfersOut: 0, net: 0 };
    nodes.push({ id: `acct:${hub}`, level: 1, label: hub, amount: r2(h.income + h.transfersIn), lines: [], hub: true });
    const hubSavedOut = r2(h.saved - [...hubSaved.values()].reduce((s, v) => s + v, 0));   // saved with no account named
    if (h.spent || hubSavedOut > 0.005) {
      nodes.push({ id: "out:hub", level: 2, label: `Paid from ${hub}`, amount: r2(h.spent + hubSavedOut), lines: [["Spent", h.spent], ["Saved", hubSavedOut]].filter((l) => l[1] > 0.005) });
      if (h.spent) links.push({ from: `acct:${hub}`, to: "out:hub", amount: h.spent, kind: "spent" });
      if (hubSavedOut > 0.005) links.push({ from: `acct:${hub}`, to: "out:hub", amount: hubSavedOut, kind: "saved" });
    }
    // Row 2: every other account (the usual ones always; others only if something moved)
    for (const a of flowAccounts(cfg, hub)) {
      const f = flows.get(a.name);
      const active = f && (f.income || f.transfersIn || f.spent || f.saved || f.transfersOut);
      if (acctRank(a) >= 7 && !active) continue;
      const z = f || { income: 0, transfersIn: 0, spent: 0, saved: 0, transfersOut: 0, net: 0 };
      nodes.push({ id: `acct:${a.name}`, level: 2, label: a.name, amount: r2(z.income + z.transfersIn), lines: [["Left", z.net]], pot: isPot(a) && a.in === hub });
      const sv = r2(hubSaved.get(a.name) || 0), tr = r2(hubTo.get(a.name) || 0);
      if (tr || !sv) links.push({ from: `acct:${hub}`, to: `acct:${a.name}`, amount: tr, kind: "move" });
      if (sv) links.push({ from: `acct:${hub}`, to: `acct:${a.name}`, amount: sv, kind: "saved" });
      // Row 3: where it left this account
      const mv = r2(moved.get(a.name) || 0);
      const parts = [[acctRole(cfg, a) === "bills" ? "Bills paid" : "Spent", z.spent, "spent"], ["Saved", z.saved, "saved"], ["Moved to other accounts", mv, "move"]].filter((p) => p[1]);
      if (!parts.length) continue;
      nodes.push({ id: `out:${a.name}`, level: 3, label: outLabel(cfg, a, acctRole(cfg, a)), amount: r2(parts.reduce((s, p) => s + p[1], 0)), lines: parts.length > 1 ? parts.map((p) => [p[0], p[1]]) : [] });
      for (const [, v, kind] of parts) links.push({ from: `acct:${a.name}`, to: `out:${a.name}`, amount: r2(v), kind });
    }
    if (h.net > 0.005) {
      nodes.push({ id: "left:hub", level: 2, label: `Left in ${hub}`, amount: h.net, lines: [] });
      links.push({ from: `acct:${hub}`, to: "left:hub", amount: h.net, kind: "move" });
    }
    return { hub, nodes, links, notHub: r2(notHub) };
  }

  return {
    DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, MONTHS, MONTH_COLORS, r2, POT, isPot, openAccounts, bankBalanceAt, potBalanceAt, batchEdit, batchProblem,
    hubName, incomeOwner, lastPaycheck, planFlow, actualFlow,
    config, ownerLabel, kindOf, ownerOf, matchesOwner, ownerParts, FROM_PREFIX, isPosted, tagList,
    yearGrid, monthsElapsed, monthlyTotals, accountFlows, distribute, recurringStatus, issues, issueList, openIssues, issueGroups, autoCategory,
    resolveReview, merchantKey, buildGuessIndex, guessCategory, buildMatchIndex, findMatches,
    accountEffect, hasOpening, balanceAt, goalProgress, yearCompare, isRental, rentalSummary, budgetStatus,
  };
})();

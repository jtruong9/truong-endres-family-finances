// Money model and calculations. Everything here is pure (no DOM), so it's easy to test.
//
// Transaction: { id, date "YYYY-MM-DD", desc, amount (positive; negative = refund),
//                category, account, toAccount (transfers only), notes, tags }
// Category kinds: Income | Savings | Expense | Transfer. Transfers never count as income/spending.
"use strict";

const Model = (() => {
  const DEFAULT_PEOPLE = { p1: "Justin", p2: "Kelly", joint: "Joint", p1Full: "Justin Truong", p2Full: "Kelly Endres" };

  const DEFAULT_ACCOUNTS = [
    { name: "Joint Hub", owner: "joint", type: "Checking", note: "Every paycheck lands here, then gets distributed" },
    { name: "Joint Bills", owner: "joint", type: "Checking", note: "Pays all recurring bills" },
    { name: "Joint Savings", owner: "joint", type: "Savings", note: "Shared savings" },
    { name: "Justin Personal", owner: "p1", type: "Checking", note: "Justin's spending" },
    { name: "Kelly Personal", owner: "p2", type: "Checking", note: "Kelly's spending" },
  ];

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

  const GROUP_ORDER = ["Income", "Savings", "Bills", "Transportation", "Health", "Food and Drinks", "Entertainment"];
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
      accountByName: new Map(accounts.map((a) => [a.name, a])),
      categoryByName: new Map(categories.map((c) => [c.name, c])),
    };
  }

  const ownerLabel = (cfg, key) => cfg.people[key] || key;
  const kindOf = (cfg, tx) => (cfg.categoryByName.get(tx.category) || {}).kind || "Expense";
  const ownerOf = (cfg, tx) => (cfg.accountByName.get(tx.account) || {}).owner || "";

  // owner filter: "all" | "joint" | "p1" | "p2"
  const matchesOwner = (cfg, tx, owner) => owner === "all" || ownerOf(cfg, tx) === owner;

  function inYear(tx, y) { return tx.date && +tx.date.slice(0, 4) === y; }
  function monthIdx(tx) { return +tx.date.slice(5, 7) - 1; }

  // Category x month grid for one year and owner
  function yearGrid(cfg, txs, year, owner) {
    const grid = new Map();   // category -> [12]
    for (const t of txs) {
      if (!inYear(t, year) || !matchesOwner(cfg, t, owner)) continue;
      if (kindOf(cfg, t) === "Transfer") continue;
      if (!grid.has(t.category)) grid.set(t.category, Array(12).fill(0));
      grid.get(t.category)[monthIdx(t)] += t.amount;
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
      if (!inYear(t, year) || !matchesOwner(cfg, t, owner)) continue;
      const k = kindOf(cfg, t);
      if (k === "Income") out.income[monthIdx(t)] += t.amount;
      else if (k === "Savings") out.savings[monthIdx(t)] += t.amount;
      else if (k === "Expense") out.spending[monthIdx(t)] += t.amount;
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
      if (!inYear(t, year) || monthIdx(t) !== month) continue;
      const k = kindOf(cfg, t);
      const a = get(t.account);
      if (k === "Transfer") {
        a.transfersOut += t.amount;
        if (t.toAccount) get(t.toAccount).transfersIn += t.amount;
      } else if (k === "Income") a.income += t.amount;
      else if (k === "Savings") a.saved += t.amount;
      else a.spent += t.amount;
    }
    return [...rows.values()].map((r) => {
      for (const k of ["income", "transfersIn", "spent", "saved", "transfersOut"]) r[k] = r2(r[k]);
      r.net = r2(r.income + r.transfersIn - r.spent - r.saved - r.transfersOut);
      return r;
    });
  }

  // Build the transfers that distribute one paycheck from the Hub
  function distribute(split, amount) {
    const out = [];
    let left = amount;
    for (const s of split.filter((s) => s.mode !== "rest")) {
      const v = s.mode === "percent" ? r2((amount * s.value) / 100) : r2(+s.value);
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

  // Recurring bill status for a given month
  function recurringStatus(cfg, txs, year, month, today = new Date()) {
    return cfg.recurring.map((b) => {
      const paid = txs.filter((t) => inYear(t, year) && monthIdx(t) === month && t.category === b.category && t.account === b.account &&
        (!b.match || (t.desc || "").toLowerCase().includes(b.match.toLowerCase())));
      const isCurrent = year === today.getFullYear() && month === today.getMonth();
      const isPast = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
      let status = "Upcoming";
      if (paid.length) status = "Paid";
      else if (isPast || (isCurrent && today.getDate() > b.day)) status = "Overdue";
      else if (isCurrent && b.day - today.getDate() <= 5) status = "Due soon";
      return { ...b, status, paidAmount: r2(paid.reduce((s, t) => s + t.amount, 0)) };
    });
  }

  // Problems worth flagging in the ledger
  function issues(cfg, t) {
    const out = [];
    if (!t.date) out.push("no date");
    if (!cfg.accountByName.has(t.account)) out.push(`unknown account "${t.account || ""}"`);
    if (!cfg.categoryByName.has(t.category)) out.push(`unknown category "${t.category || ""}"`);
    if (kindOf(cfg, t) === "Transfer" && !t.toAccount) out.push("transfer has no To account");
    if (kindOf(cfg, t) !== "Transfer" && t.toAccount) out.push("To account set on a non-transfer");
    return out;
  }

  // CSV rule matching: first rule whose text appears in the description wins
  function autoCategory(rules, desc) {
    const d = (desc || "").toLowerCase();
    const hit = rules.find((r) => r.match && d.includes(r.match.toLowerCase()));
    return hit ? hit.category : "";
  }

  return {
    DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, MONTHS, MONTH_COLORS, r2,
    config, ownerLabel, kindOf, ownerOf, matchesOwner,
    yearGrid, monthsElapsed, monthlyTotals, accountFlows, distribute, recurringStatus, issues, autoCategory,
  };
})();

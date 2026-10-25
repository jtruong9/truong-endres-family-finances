// Run: node tests/model.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "model.js"), "utf8") + "\nthis.Model = Model;", ctx);
const Model = ctx.Model;

const cfgStore = {};
const CFG = Model.config((k, d) => (k in cfgStore ? cfgStore[k] : d));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const tx = (date, amount, category, account, toAccount = "") => ({ date, amount, category, account, toAccount, desc: "" });
const ledger = [
  tx("2026-11-01", 4000, "Paychecks", "Joint Hub"),
  tx("2026-11-01", 2500, "Transfer", "Joint Hub", "Joint Bills"),
  tx("2026-11-01", 600, "Transfer", "Joint Hub", "Justin Personal"),
  tx("2026-11-01", 600, "Transfer", "Joint Hub", "Kelly Personal"),
  tx("2026-11-01", 300, "Monthly Saving", "Joint Hub"),
  tx("2026-11-02", 1500, "Rent / Mortgage", "Joint Bills"),
  tx("2026-11-03", 45.25, "Food & Drinks", "Justin Personal"),
  tx("2026-11-04", 20, "Groceries", "Kelly Personal"),
  tx("2026-11-05", -10, "Food & Drinks", "Justin Personal"),   // refund
  tx("2025-12-31", 99, "Gym", "Justin Personal"),              // other year
];

t("transfers are not income or spending", () => {
  const m = Model.monthlyTotals(CFG, ledger, 2026, "all");
  assert.strictEqual(m.income[10], 4000);
  assert.strictEqual(m.spending[10], 1500 + 45.25 + 20 - 10);
  assert.strictEqual(m.savings[10], 300);
  assert.strictEqual(m.remaining[10], Model.r2(4000 - 300 - (1500 + 45.25 + 20 - 10)));
});

t("owner filter uses the account's owner", () => {
  const p1 = Model.monthlyTotals(CFG, ledger, 2026, "p1");
  assert.strictEqual(p1.spending[10], 35.25);
  const joint = Model.monthlyTotals(CFG, ledger, 2026, "joint");
  assert.strictEqual(joint.income[10], 4000);
  assert.strictEqual(joint.spending[10], 1500);
});

t("account flows: hub nets to 0, personal = allowance left", () => {
  const f = Object.fromEntries(Model.accountFlows(CFG, ledger, 2026, 10).map((r) => [r.account, r]));
  assert.strictEqual(f["Joint Hub"].net, 0);
  assert.strictEqual(f["Joint Bills"].net, Model.r2(2500 - 1500));
  assert.strictEqual(f["Justin Personal"].net, Model.r2(600 - 35.25));
  assert.strictEqual(f["Kelly Personal"].net, 580);
});

t("year grid excludes transfers and other years", () => {
  const g = Model.yearGrid(CFG, ledger, 2026, "all");
  assert.ok(!g.has("Transfer"));
  assert.ok(!g.has("Gym"));
  assert.strictEqual(g.get("Food & Drinks")[10], 35.25);
});

t("paycheck split: fixed + percent + rest", () => {
  const { transfers, leftover } = Model.distribute([
    { toAccount: "Joint Bills", mode: "fixed", value: 2500 },
    { toAccount: "Joint Savings", mode: "percent", value: 10 },
    { toAccount: "Justin Personal", mode: "rest" },
    { toAccount: "Kelly Personal", mode: "rest" },
  ], 4000.01);
  assert.strictEqual(JSON.stringify(transfers.map((x) => x.amount)), JSON.stringify([2500, 400, 550.01, 550]));
  assert.strictEqual(leftover, 0);
  assert.strictEqual(Model.r2(transfers.reduce((s, x) => s + x.amount, 0)), 4000.01);
});

t("paycheck split: over-allocated shows negative leftover", () => {
  const { leftover } = Model.distribute([{ toAccount: "Joint Bills", mode: "fixed", value: 5000 }], 4000);
  assert.strictEqual(leftover, -1000);
});

t("months elapsed for averages", () => {
  const now = new Date(2026, 9, 24);
  assert.strictEqual(Model.monthsElapsed(2025, now), 12);
  assert.strictEqual(Model.monthsElapsed(2026, now), 10);
  assert.strictEqual(Model.monthsElapsed(2027, now), 1);
});

t("recurring bill status", () => {
  const c = Model.config((k, d) => (k === "recurring" ? [
    { name: "Rent", category: "Rent / Mortgage", account: "Joint Bills", amount: 1500, day: 1 },
    { name: "Internet", category: "Internet Bill", account: "Joint Bills", amount: 40, day: 1 },
    { name: "Phone", category: "Phone Bill", account: "Joint Bills", amount: 50, day: 28 },
  ] : d));
  const s = Model.recurringStatus(c, ledger, 2026, 10, new Date(2026, 10, 25));
  assert.strictEqual(JSON.stringify(s.map((b) => b.status)), JSON.stringify(["Paid", "Overdue", "Due soon"]));
});

t("issues flag bad rows", () => {
  assert.strictEqual(JSON.stringify(Model.issues(CFG, tx("2026-01-01", 5, "Transfer", "Joint Hub"))), JSON.stringify(["transfer has no To account"]));
  assert.strictEqual(JSON.stringify(Model.issues(CFG, tx("2026-01-01", 5, "Nope", "Joint Hub"))), JSON.stringify(['unknown category "Nope"']));
  assert.strictEqual(JSON.stringify(Model.issues(CFG, ledger[1])), JSON.stringify([]));
});

t("auto category rules", () => {
  assert.strictEqual(Model.autoCategory([{ match: "grocer", category: "Groceries" }], "GROCER #1234 SPRINGFIELD ST"), "Groceries");
  assert.strictEqual(Model.autoCategory([], "x"), "");
});

// ---------------------------------------------------------------- round 2
const J = (x) => JSON.stringify(x);
const C2 = Model.config((k, d) => {
  if (k === "accounts") return [
    { name: "Joint Hub", owner: "joint", type: "Checking", openingBalance: 100, openingDate: "2026-11-01" },
    { name: "Joint Bills", owner: "joint", type: "Checking", openingBalance: 0, openingDate: "2026-11-01" },
    { name: "Joint Savings", owner: "joint", type: "Savings" },
    { name: "Justin Personal", owner: "p1", type: "Checking", openingBalance: 50, openingDate: "2026-11-01" },
    { name: "Kelly Personal", owner: "p2", type: "Checking" },
    { name: "Visa", owner: "p1", type: "Credit Card", openingBalance: 0, openingDate: "2026-11-01" }];
  if (k === "rules") return [{ match: "grocer", category: "Groceries" }];
  if (k === "rental") return { name: "Main St", match: "123 main", tag: "rental" };
  return d;
});

t("review: purchase out -> positive expense", () => {
  const r = Model.resolveReview(C2, { id: "r1", date: "2026-11-02", desc: "GROCER", amount: 23.45, dir: "out", account: "Justin Personal", review: true }, { category: "Groceries" });
  assert.strictEqual(J([r.amount, r.account, r.toAccount, r.review]), J([23.45, "Justin Personal", "", false]));
});
t("review: refund in on an expense -> negative expense", () => {
  const r = Model.resolveReview(C2, { amount: 12.99, dir: "in", account: "Justin Personal" }, { category: "Personal" });
  assert.strictEqual(r.amount, -12.99);
});
t("review: deposit as income -> positive; withdrawal as income -> negative", () => {
  assert.strictEqual(Model.resolveReview(C2, { amount: 4000, dir: "in", account: "Joint Hub" }, { category: "Paychecks" }).amount, 4000);
  assert.strictEqual(Model.resolveReview(C2, { amount: 50, dir: "out", account: "Joint Hub" }, { category: "Paychecks" }).amount, -50);
});
t("review: transfers record from the sending account", () => {
  const out = Model.resolveReview(C2, { amount: 600, dir: "out", account: "Joint Hub" }, { category: "Transfer", other: "Justin Personal" });
  assert.strictEqual(J([out.account, out.toAccount, out.amount]), J(["Joint Hub", "Justin Personal", 600]));
  const inn = Model.resolveReview(C2, { amount: 600, dir: "in", account: "Justin Personal" }, { category: "Transfer", other: "Joint Hub" });
  assert.strictEqual(J([inn.account, inn.toAccount, inn.amount]), J(["Joint Hub", "Justin Personal", 600]));
});

t("guesses: rules first, then the merchant's history; never income for money out", () => {
  const idx = Model.buildGuessIndex(C2, [{ date: "2026-01-01", desc: "MARIOS PIZZERIA 555-0100 ST", amount: 53, category: "Food & Drinks", account: "Justin Personal" }]);
  assert.strictEqual(Model.guessCategory(C2, idx, { desc: "GROCER #1234", dir: "out" }), "Groceries");
  assert.strictEqual(Model.guessCategory(C2, idx, { desc: "MARIOS PIZZERIA 555-0199 ST", dir: "out" }), "Food & Drinks");
  assert.strictEqual(Model.guessCategory(C2, idx, { desc: "ACME PAYROLL DIRECT DEP", dir: "in" }), "Paychecks");
  assert.strictEqual(Model.guessCategory(C2, idx, { desc: "ACME PAYROLL DIRECT DEP", dir: "out" }), "");
  assert.strictEqual(Model.guessCategory(C2, idx, { desc: "Online Transfer to SAV", dir: "out" }), "Transfer");
});

t("possible duplicates: same account, amount, nearby date; each match used once", () => {
  const saved = [{ id: "a", date: "2026-11-01", amount: 600, category: "Transfer", account: "Joint Hub", toAccount: "Justin Personal" }];
  const idx = Model.buildMatchIndex(saved);
  const rows = [
    { id: "x", date: "2026-11-02", amount: 600, account: "Justin Personal" },
    { id: "y", date: "2026-11-02", amount: 600, account: "Justin Personal" },
    { id: "z", date: "2026-11-20", amount: 600, account: "Justin Personal" }];
  const m = Model.findMatches(idx, rows);
  assert.strictEqual(J([m.has("x"), m.has("y"), m.has("z")]), J([true, false, false]));
});

t("balances start at the opening date and ignore review rows", () => {
  const txs = [
    { date: "2026-10-30", amount: 999, category: "Groceries", account: "Justin Personal" },
    { date: "2026-11-01", amount: 4000, category: "Paychecks", account: "Joint Hub" },
    { date: "2026-11-01", amount: 600, category: "Transfer", account: "Joint Hub", toAccount: "Justin Personal" },
    { date: "2026-11-03", amount: 45.25, category: "Food & Drinks", account: "Justin Personal" },
    { date: "2026-11-04", amount: 20, category: "Groceries", account: "Justin Personal", review: true },
    { date: "2026-11-05", amount: 80, category: "Gas", account: "Visa" },
    { date: "2026-11-06", amount: 80, category: "Transfer", account: "Justin Personal", toAccount: "Visa" }];
  assert.strictEqual(Model.balanceAt(C2, txs, "Joint Hub", "2026-11-30"), 3500);
  assert.strictEqual(Model.balanceAt(C2, txs, "Justin Personal", "2026-11-30"), Model.r2(50 + 600 - 45.25 - 80));
  assert.strictEqual(Model.balanceAt(C2, txs, "Visa", "2026-11-05"), -80);
  assert.strictEqual(Model.balanceAt(C2, txs, "Visa", "2026-11-30"), 0);
  assert.strictEqual(Model.balanceAt(C2, txs, "Joint Savings", "2026-11-30"), null);
});

t("review rows don't count in totals", () => {
  const m = Model.monthlyTotals(C2, [{ date: "2026-11-04", amount: 20, category: "Groceries", account: "Justin Personal", review: true }], 2026, "all");
  assert.strictEqual(m.spending[10], 0);
});

t("goals by tag: savings goal and project budget", () => {
  const txs = [
    { date: "2026-11-01", amount: 500, category: "Monthly Saving", account: "Joint Hub", tags: "Emergency" },
    { date: "2026-11-01", amount: 300, category: "Transfer", account: "Joint Hub", toAccount: "Joint Savings", tags: "emergency, other" },
    { date: "2026-11-09", amount: 100, category: "Personal", account: "Joint Hub", tags: "emergency" },
    { date: "2026-11-09", amount: 250, category: "Travel", account: "Justin Personal", tags: "honeymoon" }];
  const now = new Date(2026, 10, 15);
  const s = Model.goalProgress(C2, txs, { name: "Emergency", type: "save", tag: "emergency", target: 1300, due: "2027-02" }, now);
  assert.strictEqual(J([s.saved, s.need, s.monthsLeft, s.perMonth]), J([700, 600, 4, 150]));
  const b = Model.goalProgress(C2, txs, { name: "Honeymoon", type: "budget", tag: "honeymoon", target: 200 }, now);
  assert.strictEqual(J([b.spent, b.left, b.over]), J([250, -50, true]));
});

t("year compare totals by category and year", () => {
  const c = Model.yearCompare(C2, [
    { date: "2025-03-01", amount: 100, category: "Gas", account: "Justin Personal" },
    { date: "2026-03-01", amount: 150, category: "Gas", account: "Justin Personal" },
    { date: "2026-03-01", amount: 999, category: "Transfer", account: "Joint Hub", toAccount: "Joint Bills" }], "all", new Date(2026, 9, 1));
  assert.strictEqual(J([c.years, c.totals.get("Gas")[2025], c.totals.get("Gas")[2026], c.totals.has("Transfer"), c.months[2026]]), J([[2025, 2026], 100, 150, false, 10]));
});

t("rental summary by match text or tag", () => {
  const r = Model.rentalSummary(C2, [
    { date: "2026-09-28", desc: "123 Main rent", amount: 1500, category: "Other Income Sources", account: "Justin Personal" },
    { date: "2026-10-01", desc: "123 Main mortgage", amount: 2500, category: "Rent / Mortgage", account: "Justin Personal" },
    { date: "2026-08-12", desc: "Roof repair", amount: 3100, category: "Car Payment / House Repair", account: "Justin Personal", tags: "rental" },
    { date: "2026-10-01", desc: "Apartment rent", amount: 1600, category: "Rent / Mortgage", account: "Justin Personal" }], 2026);
  assert.strictEqual(J([r.years[0].income, r.years[0].expenses, r.years[0].net, r.list.length]), J([1500, 5600, -4100, 3]));
});

t("budget status flags overspending", () => {
  const c = Model.config((k, d) => (k === "categories" ? [{ name: "Groceries", group: "Food", kind: "Expense", budget: 100 }] : d));
  const b = Model.budgetStatus(c, [{ date: "2026-11-02", amount: 120, category: "Groceries", account: "Justin Personal" }], 2026, 10);
  assert.strictEqual(J([b[0].spent, b[0].over]), J([120, true]));
});

console.log(`\n${n} tests passed`);

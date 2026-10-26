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

t("paycheck split: fixed first, percent of what's left, then rest", () => {
  const { transfers, leftover } = Model.distribute([
    { toAccount: "Joint Savings", mode: "percent", value: 10 },   // listed first, still applied after the fixed amount
    { toAccount: "Joint Bills", mode: "fixed", value: 2500 },
    { toAccount: "Justin Personal", mode: "rest" },
    { toAccount: "Kelly Personal", mode: "rest" },
  ], 4000.01);
  // 2500 fixed; 10% of the 1500.01 left = 150; the 1350.01 remaining splits in two
  assert.strictEqual(JSON.stringify(transfers.map((x) => [x.toAccount, x.amount])), JSON.stringify([["Joint Bills", 2500], ["Joint Savings", 150], ["Justin Personal", 675.01], ["Kelly Personal", 675]]));
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

t("needs-attention groups, blank category, and 'leave as is'", () => {
  const rows = [
    { id: "a", date: "2026-01-01", amount: 5, category: "Old Thing", account: "Joint Hub", desc: "" },
    { id: "b", date: "2026-01-02", amount: 7, category: "Old Thing", account: "Joint Hub", desc: "" },
    { id: "c", date: "2026-01-03", amount: 2, category: "", account: "Joint Hub", desc: "" },
    { id: "d", date: "2026-01-04", amount: 9, category: "Old Thing", account: "Joint Hub", desc: "", ackIssues: ["unknown-category:Old Thing"] },
    { id: "e", date: "2026-01-05", amount: 1, category: "Old Thing", account: "Joint Hub", desc: "", review: true },
  ];
  const g = Model.issueGroups(CFG, rows);
  assert.strictEqual(JSON.stringify(g.map((x) => [x.code, x.value, x.txs.map((t) => t.id)])),
    JSON.stringify([["unknown-category", "Old Thing", ["a", "b"]], ["no-category", "", ["c"]]]));
  // acknowledged one hides only that problem; a new problem on it still shows
  const d2 = { ...rows[3], account: "Gone Account" };
  assert.strictEqual(JSON.stringify(Model.openIssues(CFG, d2).map((i) => i.code)), JSON.stringify(["unknown-account"]));
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

t("money flow plan splits each paycheck through the hub", () => {
  const c = Model.config((k, d) => (k === "split" ? [{ toAccount: "Joint Savings", mode: "fixed", value: 500 }, { toAccount: "Joint Bills", mode: "percent", value: 50 },
    { toAccount: "Justin's Spending", mode: "rest" }, { toAccount: "Kelly's Spending", mode: "rest" }] : d));
  const f = Model.planFlow(c, [{ who: "p1", amount: 4000 }, { who: "p2", amount: 3000 }]);
  const amt = (id) => f.nodes.find((x) => x.id === id).amount;
  // both paychecks summed at the Hub (7000), split once: 500 fixed, 50% of the 6500 left = 3250, rest 3250 in two
  assert.strictEqual(J([amt("acct:Joint Hub"), amt("acct:Joint Savings"), amt("acct:Joint Bills"), amt("acct:Justin's Spending"), amt("acct:Kelly's Spending")]),
    J([7000, 500, 3250, 1625, 1625]));
  assert.strictEqual(f.leftover, 0);
  // savings, bills, then the three pots inside the Hub; the closed old personal accounts are left out
  assert.strictEqual(J(f.nodes.filter((x) => x.level === 2).map((x) => [x.label, !!x.pot])),
    J([["Joint Savings", false], ["Joint Bills", false], ["Justin's Spending", true], ["Kelly's Spending", true], ["Joint Spending", true]]));
  assert.strictEqual(f.links.find((l) => l.to === "out:Joint Savings").kind, "saved");
});

t("money flow plan keeps unsplit money in the hub", () => {
  const c = Model.config((k, d) => (k === "split" ? [{ toAccount: "Joint Bills", mode: "fixed", value: 1000 }] : d));
  const f = Model.planFlow(c, [{ who: "p1", amount: 2500 }]);
  assert.strictEqual(J([f.leftover, f.nodes.find((x) => x.id === "left:hub").amount]), J([1500, 1500]));
});

t("money flow actual follows one month's transfers and spending", () => {
  const f = Model.actualFlow(CFG, ledger, 2026, 10);
  const node = (id) => f.nodes.find((x) => x.id === id);
  const link = (from, to) => f.links.filter((l) => l.from === from && l.to === to).reduce((s, l) => s + l.amount, 0);
  assert.strictEqual(J([node("acct:Joint Hub").amount, link("acct:Joint Hub", "acct:Joint Bills"), link("acct:Joint Hub", "acct:Kelly Personal")]), J([4000, 2500, 600]));
  assert.strictEqual(J([node("out:Joint Bills").amount, node("out:Justin Personal").amount, node("out:hub").amount]), J([1500, 35.25, 300]));
  assert.strictEqual(J(node("acct:Justin Personal").lines), J([["Left", 564.75]]));
  assert.strictEqual(node("left:hub"), undefined);   // 4000 in, 3700 sent out, 300 saved: nothing left
});

t("money flow knows whose paycheck it is from the description", () => {
  const p = Model.incomeOwner(CFG, { desc: "Paycheck – Kelly", account: "Joint Hub", category: "Paychecks" });
  const last = Model.lastPaycheck(CFG, [{ date: "2026-10-01", desc: "Paycheck – Justin", amount: 3900, category: "Paychecks", account: "Joint Hub" },
    { date: "2026-10-15", desc: "Paycheck – Justin", amount: 4100, category: "Paychecks", account: "Joint Hub" }], "p1");
  assert.strictEqual(J([p, last, Model.lastPaycheck(CFG, [], "p2")]), J(["p2", 4100, null]));
});

t("savings put into Joint Savings: payer's savings, and the joint account's balance", () => {
  const c = Model.config((k, d) => (k === "accounts" ? Model.DEFAULT_ACCOUNTS.map((a) => ({ ...a, openingBalance: 0, openingDate: "2026-11-01" })) : d));
  const s = [{ date: "2026-11-10", desc: "Savings", amount: 600, category: "Monthly Saving", account: "Justin Personal", toAccount: "Joint Savings" }];
  assert.strictEqual(J([Model.monthlyTotals(c, s, 2026, "p1").savings[10], Model.monthlyTotals(c, s, 2026, "joint").savings[10], Model.monthlyTotals(c, s, 2026, "all").savings[10]]), J([600, 600, 600]));
  // Joint also gets a matching "From Justin" line in, so its Remaining stays at 0; Justin and Household are unchanged
  const jt = Model.monthlyTotals(c, s, 2026, "joint"), all = Model.monthlyTotals(c, s, 2026, "all"), p1 = Model.monthlyTotals(c, s, 2026, "p1");
  assert.strictEqual(J([jt.income[10], jt.remaining[10], all.income[10], all.remaining[10], p1.remaining[10]]), J([600, 0, 0, -600, -600]));
  assert.strictEqual(J([...Model.yearGrid(c, s, 2026, "joint").keys()]), J(["Monthly Saving", "From Justin"]));
  assert.strictEqual(J([...Model.yearGrid(c, s, 2026, "p1").keys()]), J(["Monthly Saving"]));
  assert.strictEqual(J(Object.values(Model.yearCompare(c, s, "joint").totals.get("From Justin"))), J([600]));
  // Savings that stay in a personal account, or a savings entry made from a joint account, don't double up
  assert.strictEqual(J([Model.ownerParts(c, { ...s[0], toAccount: "" }, "joint").length, Model.ownerParts(c, { ...s[0], account: "Joint Hub" }, "joint").length]), J([0, 1]));
  assert.strictEqual(J([Model.balanceAt(c, s, "Justin Personal", "2026-11-30"), Model.balanceAt(c, s, "Joint Savings", "2026-11-30")]), J([-600, 600]));
  const f = new Map(Model.accountFlows(c, s, 2026, 10).map((x) => [x.account, x]));
  assert.strictEqual(J([f.get("Justin Personal").saved, f.get("Joint Savings").transfersIn, f.get("Joint Savings").net]), J([600, 600, 600]));
  assert.strictEqual(J(Model.issues(c, s[0])), J([]));   // not flagged as "To account on a non-transfer"
  assert.strictEqual(J(Model.issues(c, { ...s[0], category: "Groceries" })), J(["To account set on a non-transfer"]));
});

t("review: a savings row can name the account it went into", () => {
  const row = { date: "2026-11-10", desc: "XFER", amount: 600, dir: "out", account: "Justin Personal", review: true };
  const r = Model.resolveReview(CFG, row, { category: "Monthly Saving", other: "Joint Savings" });
  const plain = Model.resolveReview(CFG, row, { category: "Monthly Saving", other: "" });
  assert.strictEqual(J([r.account, r.toAccount, r.amount, plain.toAccount, plain.amount]), J(["Justin Personal", "Joint Savings", 600, "", 600]));
});

t("money flow: hub's split into savings is a savings arrow (joint), and hub savings into an account is drawn to it", () => {
  const c = Model.config((k, d) => (k === "split" ? [{ toAccount: "Joint Savings", mode: "fixed", value: 500 }, { toAccount: "Joint Bills", mode: "rest" }] : d));
  const p = Model.planFlow(c, [{ who: "p1", amount: 2000 }]);
  assert.strictEqual(p.links.find((l) => l.to === "acct:Joint Savings").kind, "saved");
  const a = Model.actualFlow(c, [
    { date: "2026-11-01", desc: "Paycheck – Justin", amount: 2000, category: "Paychecks", account: "Joint Hub" },
    { date: "2026-11-01", desc: "Save", amount: 500, category: "Monthly Saving", account: "Joint Hub", toAccount: "Joint Savings" }], 2026, 10);
  const l = a.links.filter((x) => x.to === "acct:Joint Savings");
  assert.strictEqual(J([l.map((x) => [x.kind, x.amount]), a.nodes.find((x) => x.id === "acct:Joint Savings").amount, !!a.nodes.find((x) => x.id === "out:hub")]), J([[["saved", 500]], 500, false]));
});

t("spending pots live inside the Joint Hub: bank balance = Hub + its pots", () => {
  const c = Model.config((k, d) => (k === "accounts" ? Model.DEFAULT_ACCOUNTS.map((a) => (a.name === "Joint Hub" ? { ...a, openingBalance: 100, openingDate: "2026-11-01" } : a)) : d));
  const s = [
    { date: "2026-11-01", desc: "Paycheck", amount: 4000, category: "Paychecks", account: "Joint Hub" },
    { date: "2026-11-01", desc: "Split", amount: 800, category: "Transfer", account: "Joint Hub", toAccount: "Justin's Spending" },
    { date: "2026-11-01", desc: "Split", amount: 600, category: "Transfer", account: "Joint Hub", toAccount: "Joint Spending" },
    { date: "2026-11-01", desc: "Split", amount: 2000, category: "Transfer", account: "Joint Hub", toAccount: "Joint Bills" },
    { date: "2026-11-03", desc: "Lunch", amount: 25, category: "Food & Drinks", account: "Justin's Spending" },
    { date: "2026-11-04", desc: "Groceries", amount: 140, category: "Groceries", account: "Joint Spending" }];
  // Hub on its own: 100 + 4000 - 3400 = 700; the pots hold 775 + 460; the bank sees 700 + 1235
  assert.strictEqual(J([Model.balanceAt(c, s, "Joint Hub", "2026-11-30"), Model.potBalanceAt(c, s, "Justin's Spending", "2026-11-30"),
    Model.potBalanceAt(c, s, "Joint Spending", "2026-11-30"), Model.bankBalanceAt(c, s, "Joint Hub", "2026-11-30")]), J([700, 775, 460, 1935]));
  // Whose: Justin's pot counts as Justin's spending, Joint Spending as Joint
  assert.strictEqual(J([Model.monthlyTotals(c, s, 2026, "p1").spending[10], Model.monthlyTotals(c, s, 2026, "joint").spending[10]]), J([25, 140]));
  assert.strictEqual(J(Model.openAccounts(c).map((a) => a.name).filter((n) => /Personal/.test(n))), J([]));
});

t("batch edit: only the chosen fields change; tags add/remove; notes add or replace", () => {
  const row = { id: "a", date: "2026-10-01", desc: "Amazon", amount: 15, category: "Personal", account: "Justin Personal", toAccount: "", notes: "filter", tags: "car, amazon" };
  const e = Model.batchEdit(CFG, row, { category: "Gas", account: "Justin's Spending", addTags: "Honeymoon, car", removeTags: "AMAZON", note: "batch" });
  assert.strictEqual(J([e.category, e.account, e.tags, e.notes, e.date, e.amount, e.desc]), J(["Gas", "Justin's Spending", "car, Honeymoon", "filter · batch", "2026-10-01", 15, "Amazon"]));
  assert.strictEqual(Model.batchEdit(CFG, row, { note: "new", noteMode: "replace" }).notes, "new");
  assert.strictEqual(Model.batchEdit(CFG, row, { date: "2026-10-05" }).date, "2026-10-05");
  // nothing to change -> the same object comes back (so it isn't re-saved)
  assert.strictEqual(Model.batchEdit(CFG, row, { category: "Personal", addTags: "car" }), row);
});

t("batch edit: To account only on transfers / savings, never the same as the account", () => {
  const sav = { id: "s", date: "2026-10-01", amount: 600, category: "Monthly Saving", account: "Justin Personal", toAccount: "", tags: "", notes: "" };
  assert.strictEqual(Model.batchEdit(CFG, sav, { toAccount: "Joint Savings" }).toAccount, "Joint Savings");
  assert.strictEqual(Model.batchEdit(CFG, { ...sav, toAccount: "Joint Savings" }, { category: "Groceries" }).toAccount, "");   // no longer savings
  assert.strictEqual(Model.batchEdit(CFG, { ...sav, toAccount: "Joint Savings" }, { account: "Joint Savings" }).toAccount, "");
  assert.strictEqual(Model.batchProblem(CFG, [sav], { category: "Transfer" }), "Transfers need a To account: pick one in the To / Put into box.");
  assert.strictEqual(Model.batchProblem(CFG, [sav], { category: "Transfer", toAccount: "Joint Hub" }), "");
});

t("categories by year: pickers show this year's + never-used + the row's own", () => {
  const c = Model.config((k, d) => (k === "categories" ? [
    { name: "Old Bills", group: "Bills", kind: "Expense" }, { name: "Rent", group: "Home", kind: "Expense" },
    { name: "Brand New", group: "Other", kind: "Expense" }, { name: "Paychecks", group: "Income", kind: "Income" }] : d));
  const s = [
    { date: "2025-03-01", amount: 10, category: "Old Bills", account: "Joint Hub" },
    { date: "2026-03-01", amount: 20, category: "Rent", account: "Joint Hub" },
    { date: "2026-03-02", amount: 30, category: "Paychecks", account: "Joint Hub" },
    { date: "2026-04-01", amount: 5, category: "Old Bills", account: "Joint Hub", review: true }];   // review rows don't count
  const by = Model.categoriesByYear(s);
  assert.strictEqual(J([[...by.get(2025)], [...by.get(2026)].sort()]), J([["Old Bills"], ["Paychecks", "Rent"]]));
  assert.strictEqual(J(Model.currentCategories(c, s, 2026).map((x) => x.name)), J(["Rent", "Brand New", "Paychecks"]));
  assert.strictEqual(J(Model.currentCategories(c, s, 2026, ["Old Bills"]).map((x) => x.name)), J(["Old Bills", "Rent", "Brand New", "Paychecks"]));
});

t("money flow plan: split what's in the Hub (paychecks summed, or a typed-in amount)", () => {
  const c = Model.config((k, d) => (k === "split" ? [{ toAccount: "Joint Savings", mode: "fixed", value: 2500 },
    { toAccount: "Justin's Spending", mode: "percent", value: 50 }, { toAccount: "Kelly's Spending", mode: "percent", value: 50 }] : d));
  const pays = [{ who: "p1", amount: 600 }, { who: "p2", amount: 2000 }];
  const amt = (f, id) => (f.nodes.find((x) => x.id === id) || {}).amount;
  // Paychecks alone: 2600 in the Hub, 2500 fixed, 50% / 50% of the 100 left
  const a = Model.planFlow(c, pays);
  assert.strictEqual(J([a.hubIn, a.paid, a.leftover, amt(a, "acct:Justin's Spending")]), J([2600, 2600, 0, 50]));
  // More is in the Hub than the paychecks: the extra shows as "Already in Joint Hub" and gets split too
  const b = Model.planFlow(c, pays, 6000);
  assert.strictEqual(J([b.hubIn, amt(b, "pay:already"), amt(b, "acct:Joint Savings"), amt(b, "acct:Kelly's Spending"), b.leftover]), J([6000, 3400, 2500, 1750, 0]));
  // Less in the Hub than the fixed amounts: negative leftover (the warning)
  assert.strictEqual(Model.planFlow(c, pays, 2000).leftover, -500);
  // Empty box = use the paychecks
  assert.strictEqual(Model.planFlow(c, pays, "").hubIn, 2600);
});

t("last paycheck ignores savings rows like 'Paycheck Saving'", () => {
  const s = [
    { date: "2026-10-09", desc: "Paycheck", amount: 3900, category: "Paychecks", account: "Justin Personal" },
    { date: "2026-10-23", desc: "Paycheck Saving", amount: 600, category: "Monthly Saving", account: "Justin Personal", toAccount: "Joint Savings" }];
  assert.strictEqual(Model.lastPaycheck(CFG, s, "p1"), 3900);
});

console.log(`\n${n} tests passed`);

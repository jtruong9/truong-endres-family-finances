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
  assert.strictEqual(Model.autoCategory([{ match: "safeway", category: "Groceries" }], "SAFEWAY #1062 SEATTLE WA"), "Groceries");
  assert.strictEqual(Model.autoCategory([], "x"), "");
});

console.log(`\n${n} tests passed`);

// Run: node tests/reorg.test.js   (made-up examples only: this repo is public)
"use strict";
const assert = require("assert");
const Reorg = require("../js/reorg.js");
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const OPTS = { rental: { match: "123 main", tag: "rental" } };
const tx = (desc, category, extra = {}) => ({ id: desc, date: "2026-05-01", desc, amount: 10, category, account: "Justin Personal", notes: "", tags: "", ...extra });
const to = (desc, category, extra, opts = OPTS) => (Reorg.propose(tx(desc, category, extra), opts) || {}).category || "";

t("rental vs home housing (rental found by the user's text)", () => {
  assert.strictEqual(to("123 Main Mortgage", "Rent / Mortgage"), "Rental Mortgage");
  assert.strictEqual(to("Apartment Rent", "Rent / Mortgage"), "Rent");
  assert.strictEqual(to("123 Main Rental Income", "Other Income Sources"), "Rental Income");
  assert.strictEqual(to("Gift from family", "Other Income Sources"), "");
  assert.strictEqual(to("123 Main Water", "Water Bill"), "Rental Utilities");
  assert.strictEqual(to("Apartment Water", "Water Bill"), "Utilities");
  assert.strictEqual(to("Apartment Utilities", "Electricity / Gas Bill"), "Utilities");
  assert.strictEqual(to("Apartment Internet", "Internet Bill"), "Internet & Phone");
  assert.strictEqual(to("Renter policy", "Rental Insurance"), "Renters Insurance");
  assert.strictEqual(to("Plumber", "Personal", { tags: "rental" }), "Rental Repairs & Maintenance");
  assert.strictEqual(to("123 Main Mortgage", "Rent / Mortgage", {}, {}), "Rent");   // no rental text set: nothing is guessed
});

t("repairs: rental vs car", () => {
  assert.strictEqual(to("Contractor 123 Main Roof Repair", "Car Payment / House Repair"), "Rental Repairs & Maintenance");
  assert.strictEqual(to("House Repair - Venmo to someone", "Car Payment / House Repair"), "Rental Repairs & Maintenance");
  assert.strictEqual(to("State Car Tags", "Car Payment / House Repair"), "Car Maintenance & Fees");
  assert.strictEqual(to("Car Payment", "Car Payment / House Repair"), "Car Payment");
});

t("Personal gets split up", () => {
  const cases = [
    ["End of Month Misc (Split w/Partner)", "Shared Costs"], ["TIRES.COM ORDER", "Car Maintenance & Fees"], ["Toll road pass", "Car Maintenance & Fees"],
    ["UBER *TRIP", "Rideshare & Transit"], ["LYFT *AIRPORT", "Rideshare & Transit"], ["REI #11", "Hobbies & Gear"], ["Corner Book Shop", "Hobbies & Gear"],
    ["STEAM PURCHASE", "Hobbies & Gear"], ["LULULEMON.COM", "Shopping & Clothes"], ["Wool Socks", "Shopping & Clothes"], ["Main St Salon", "Personal Care"],
    ["Concert tickets", "Fun & Events"], ["Rec sports league", "Fun & Events"], ["Wedding photographer", "Wedding"], ["Venmo - Baby Shower", "Gifts & Giving"], ["Parking Ticket", "Fees"], ["ANNUAL FEE", "Fees"],
    ["VERIZON STORE", "Internet & Phone"], ["APPLE.COM/BILL", "Subscriptions"], ["ALASKA AIR seat fee", "Travel"], ["Plant shop", "Shopping & Clothes"],
    ["Something unusual", "Misc"],
  ];
  for (const [d, want] of cases) assert.strictEqual(to(d, "Personal"), want, d);
  assert.strictEqual(to("Burger place", "Food & Drinks"), "Dining Out");
  assert.strictEqual(to("Gas station", "Gas"), "");
});

t("wedding/engagement tags come from the description only, not gifts or notes", () => {
  const p = Reorg.plan([tx("Wedding Table Numbers", "Personal"), tx("Paycheck", "Paychecks", { notes: "add to wedding tracker" }),
                        tx("Engagement Party Food", "Food & Drinks"), tx("Venmo - Friend Wedding", "Personal"),
                        tx("ZOLA.COM REGISTRY", "Personal", { tags: "wedding" })], 2026, OPTS);
  assert.strictEqual(JSON.stringify(p.map((s) => [s.tx.desc, s.to, s.addTag])), JSON.stringify([
    ["Wedding Table Numbers", "Wedding", "wedding"], ["Engagement Party Food", "Dining Out", "engagement"],
    ["Venmo - Friend Wedding", "Gifts & Giving", ""], ["ZOLA.COM REGISTRY", "Wedding", ""]]));
  assert.strictEqual(Reorg.applyTx(p[0]).tags, "wedding");
});

t("plan only touches the chosen year and skips review rows", () => {
  const p = Reorg.plan([tx("Diner", "Food & Drinks", { date: "2025-05-01" }), tx("Cafe", "Food & Drinks", { review: true }), tx("Pizza", "Food & Drinks")], 2026, OPTS);
  assert.strictEqual(JSON.stringify(p.map((s) => s.tx.desc)), JSON.stringify(["Pizza"]));
});

t("category list keeps old ones, regroups, adds new, Transfer last", () => {
  const before = [{ name: "Gym", group: "Entertainment", kind: "Expense" }, { name: "Rent / Mortgage", group: "Bills", kind: "Expense" }, { name: "Transfer", group: "Transfer", kind: "Transfer" }];
  const after = Reorg.categoriesAfter(before);
  assert.strictEqual(after.find((c) => c.name === "Gym").group, "Health & Care");
  assert.ok(after.find((c) => c.name === "Rent / Mortgage"));
  assert.ok(after.find((c) => c.name === "Rental Mortgage" && c.group === "Rental Property"));
  assert.strictEqual(after[after.length - 1].name, "Transfer");
  assert.strictEqual(Reorg.categoriesAfter(after).length, after.length);   // running twice adds nothing
});

console.log(`\n${n} tests passed`);

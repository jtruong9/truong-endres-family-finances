// One-time "Reorganize 2026" plan: a new category layout (Home vs. Rental Property, Personal split
// up, car upkeep, Gym under Health & Care…) plus a proposed new category for each transaction in
// the chosen year. Pure: it builds a plan; the UI shows it and nothing changes until the user
// approves. No personal details live here: the rental is found by the text the user enters.
"use strict";

const Reorg = (() => {
  // New categories added by the reorganization (existing ones are kept for earlier years)
  const NEW_CATEGORIES = [
    ["Rent", "Home", "Expense"], ["Utilities", "Home", "Expense"], ["Internet & Phone", "Home", "Expense"],
    ["Renters Insurance", "Home", "Expense"],
    ["Rental Income", "Rental Property", "Income"], ["Rental Mortgage", "Rental Property", "Expense"],
    ["Rental Repairs & Maintenance", "Rental Property", "Expense"], ["Rental Utilities", "Rental Property", "Expense"],
    ["Rental Insurance & Taxes", "Rental Property", "Expense"],
    ["Car Maintenance & Fees", "Transportation", "Expense"], ["Rideshare & Transit", "Transportation", "Expense"],
    ["Dining Out", "Food", "Expense"],
    ["Personal Care", "Health & Care", "Expense"],
    ["Shopping & Clothes", "Lifestyle", "Expense"], ["Hobbies & Gear", "Lifestyle", "Expense"],
    ["Fun & Events", "Lifestyle", "Expense"], ["Gifts & Giving", "Lifestyle", "Expense"], ["Shared Costs", "Lifestyle", "Expense"],
    ["Wedding", "Lifestyle", "Expense"],
    ["Fees", "Other", "Expense"], ["Misc", "Other", "Expense"],
  ];
  // Existing categories that move to a new group heading (their transactions don't change)
  const REGROUP = {
    "Groceries": "Food", "Doctor / Dentist": "Health & Care", "Vet / Pet Care": "Health & Care", "Gym": "Health & Care",
    "Subscriptions": "Lifestyle", "Travel": "Travel", "Personal": "Lifestyle",
  };

  // Wedding / engagement spending becomes a tag (so Goals can track it). Description only: notes in
  // old spreadsheets are sometimes on the wrong row. Gifts for other people's weddings are skipped.
  function projectTag(t) {
    const d = t.desc || "";
    if (/venmo|zelle|gift/i.test(d)) return "";
    if (/honeymoon/i.test(d)) return "honeymoon";
    if (/engagement/i.test(d)) return "engagement";
    if (/wedding|zola|marriage certificate/i.test(d)) return "wedding";
    return "";
  }

  // Proposed category for one transaction, or null to leave it. opts.rental = { match, tag }.
  function propose(t, opts = {}) {
    const d = t.desc || "", c = t.category;
    const m = String((opts.rental || {}).match || "").trim().toLowerCase();
    const rtag = String((opts.rental || {}).tag || "").trim().toLowerCase();
    const tags = String(t.tags || "").toLowerCase().split(",").map((x) => x.trim());
    const rental = (m && d.toLowerCase().includes(m)) || (rtag && tags.includes(rtag));
    const R = (category, reason) => ({ category, reason });
    // ---- the rental property ----
    if (rental) {
      if (c === "Other Income Sources") return R("Rental Income", "rent from the rental");
      if (c === "Rent / Mortgage") return R("Rental Mortgage", "the rental's mortgage");
      if (/water|electric|utilit|gas bill|sewer|garbage/i.test(d) || ["Water Bill", "Electricity / Gas Bill"].includes(c)) return R("Rental Utilities", "a utility bill for the rental");
      if (/insurance|tax/i.test(d)) return R("Rental Insurance & Taxes", "insurance or tax on the rental");
      if (c === "Car Payment / House Repair" || /repair|roof|plumb|contractor|maint/i.test(d)) return R("Rental Repairs & Maintenance", "a repair on the rental");
    }
    // A house repair while renting your own home is for the rental
    if (/house repair/i.test(d)) return R("Rental Repairs & Maintenance", "a repair on the rental");
    // ---- home ----
    if (c === "Rent / Mortgage") return R("Rent", "rent for where you live");
    if (c === "Electricity / Gas Bill" || c === "Water Bill") return R("Utilities", "a utility bill at home");
    if (c === "Internet Bill" || c === "Phone Bill") return R("Internet & Phone", "internet or phone");
    if (c === "Rental Insurance") return R("Renters Insurance", "renters insurance on your home");
    // ---- transportation ----
    if (c === "Car Payment / House Repair") return /car payment/i.test(d) ? R("Car Payment", "a car payment") : R("Car Maintenance & Fees", "car upkeep or fees");
    // ---- food ----
    if (c === "Food & Drinks") return R("Dining Out", "eating or drinking out");
    // ---- split up "Personal" ----
    if (c === "Personal") {
      if (/end of month misc|split w/i.test(d)) return R("Shared Costs", "a cost split between you");
      if (/airline|alaska air|delta air|united air|wifionboard|in-?flight/i.test(d)) return R("Travel", "a travel charge");
      if (/parking ticket|late fee|annual fee|overdraft|\bfee\b|fees\b/i.test(d)) return R("Fees", "a fee or fine");
      if (/uber|lyft|lime\b|scooter|taxi|transit|orca|light rail|\bbus\b|ferry/i.test(d)) return R("Rideshare & Transit", "a ride or transit");
      if (/tires|toyota|honda|jiffy|oil change|car wash|car tag|dmv|driver licen|wiper|air filter|good ?to ?go|toll|parking|auto ?parts/i.test(d)) return R("Car Maintenance & Fees", "car upkeep, tolls or parking");
      if (/verizon|vzw|t-mobile|at&t/i.test(d)) return R("Internet & Phone", "phone");
      if (/apple\.com\/bill|apple bill|icloud|spotify|netflix|hulu|youtube premium|kindle unlimited/i.test(d)) return R("Subscriptions", "a subscription");
      if (/\brei\b|park tool|cycl|bike|ski\b|climb|patagonia|camping|recreation\.gov|parks\b|race|book|kindle|steam|nintendo|playstation|xbox|whatnot|fantasy/i.test(d)) return R("Hobbies & Gear", "a hobby: gear, books, games, outdoors");
      if (/lululemon|levi|nordstrom|wearhouse|uniqlo|nike|adidas|old navy|\bgap\b|clothing|apparel|shoes|socks|\bhat\b|headband|salomon|peak performance|optix|glasses/i.test(d)) return R("Shopping & Clothes", "clothes or accessories");
      if (/salon|haircut|barber|\bspa\b|cvs|walgreens|pharmacy/i.test(d)) return R("Personal Care", "haircut or personal care");
      if (/concert|regal|cinema|movie|seatgeek|ticket|escape|fifa|bowling|museum|theat|show\b|league|series\b/i.test(d)) return R("Fun & Events", "fun or an event");
      if (/venmo|zelle|gift|baby shower|birthday|baptism|donation|lunar new year|red envelope/i.test(d)) return R("Gifts & Giving", "a gift or money to someone");
      if (/wedding|zola|marriage|photograph/i.test(d)) return R("Wedding", "a wedding cost");
      if (/amazon|amzn|target|costco|walmart|dollar tree|plant|frame|ikea|home depot|lowe/i.test(d)) return R("Shopping & Clothes", "general shopping");
      return R("Misc", "doesn't fit anywhere else");
    }
    return null;
  }

  // Plan for one year: [{ tx, from, to, reason, addTag }]
  function plan(txs, year, opts = {}) {
    const out = [];
    for (const t of txs) {
      if (t.review || !t.date || +t.date.slice(0, 4) !== year) continue;
      const p = propose(t, opts);
      const tag = projectTag(t);
      const tags = String(t.tags || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      const addTag = tag && !tags.includes(tag) ? tag : "";
      const moves = p && p.category !== t.category;
      if (moves || addTag) out.push({ tx: t, from: t.category, to: moves ? p.category : t.category, reason: moves ? p.reason : "", addTag });
    }
    return out;
  }

  // Category list after the reorganization: existing ones (some regrouped) + the new ones, Transfer last
  function categoriesAfter(categories) {
    const names = new Set(categories.map((c) => c.name));
    const kept = categories.map((c) => (REGROUP[c.name] ? { ...c, group: REGROUP[c.name] } : c));
    const added = NEW_CATEGORIES.filter(([n]) => !names.has(n)).map(([name, group, kind]) => ({ name, group, kind, budget: null }));
    return [...kept.filter((c) => c.kind !== "Transfer"), ...added, ...kept.filter((c) => c.kind === "Transfer")];
  }

  const applyTx = (step) => {
    const t = { ...step.tx, category: step.to };
    if (step.addTag) t.tags = [t.tags, step.addTag].filter(Boolean).join(", ");
    return t;
  };

  return { NEW_CATEGORIES, REGROUP, propose, projectTag, plan, categoriesAfter, applyTx };
})();

if (typeof module !== "undefined") module.exports = Reorg;

// Data layer: an append-only event log per device, stored as JSON files in a folder the user picks
// (their shared Google Drive folder). Each device writes ONLY its own file, so Drive sync never
// produces conflicts; every device reads all ledger-*.json files and merges them.
//
// Event: { id, ts, dev, type, data }
//   type "tx"      data = full transaction            (latest ts for a tx id wins)
//   type "tx-del"  data = { id }
//   type "cfg"     data = { key, value }              (latest ts per key wins)
"use strict";

const Store = (() => {
  // Internal names below stay "truong-finance" on purpose (the app's original name): they mark the data
  // files and this computer's saved folder, so renaming them would make the app forget or reject them.
  const DB_NAME = "truong-finance";
  let dir = null;            // FileSystemDirectoryHandle
  let deviceId = null;
  let myEvents = [];         // events in this device's file
  let allEvents = [];        // merged from every file
  let state = { tx: new Map(), cfg: {} };
  const listeners = [];

  // ---- tiny IndexedDB key/value (remembers the folder handle + device id) ----
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const t = open.result.transaction("kv", mode);
        const req = fn(t.objectStore("kv"));
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      };
    });
  }
  const kvGet = (k) => idb("readonly", (s) => s.get(k));
  const kvSet = (k, v) => idb("readwrite", (s) => s.put(v, k));

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  async function getDeviceId() {
    let d = await kvGet("deviceId");
    if (!d) { d = uid().slice(0, 8); await kvSet("deviceId", d); }
    return d;
  }

  const myFileName = () => `ledger-${deviceId}.json`;

  async function readJson(handle) {
    const text = await (await handle.getFile()).text();
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.events) ? parsed.events : [];
  }

  async function writeMine() {
    const fh = await dir.getFileHandle(myFileName(), { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ app: "truong-finance", version: 1, device: deviceId, events: myEvents }));
    await w.close();
  }

  // ---- merge every ledger file into the current state ----
  function rebuild() {
    allEvents.sort((a, b) => (a.ts === b.ts ? (a.id < b.id ? -1 : 1) : a.ts - b.ts));
    const tx = new Map();
    const cfg = {};
    for (const e of allEvents) {
      if (e.type === "tx") tx.set(e.data.id, e.data);
      else if (e.type === "tx-del") tx.delete(e.data.id);
      else if (e.type === "cfg") cfg[e.data.key] = e.data.value;
    }
    state = { tx, cfg };
    listeners.forEach((fn) => fn());
  }

  async function reload() {
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "file" && /^ledger-[\w-]+\.json$/.test(name)) files.push([name, handle]);
    }
    const seen = new Set();
    const merged = [];
    const problems = [];
    for (const [name, handle] of files) {
      try {
        for (const e of await readJson(handle)) {
          if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
        }
      } catch (err) {
        problems.push(`${name}: ${err.message}`);
      }
    }
    // Our own file may be mid-sync on disk; never lose events we already hold in memory
    for (const e of myEvents) if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    const mine = files.find(([n]) => n === myFileName());
    if (mine) {
      try {
        const disk = await readJson(mine[1]);
        const ids = new Set(myEvents.map((e) => e.id));
        for (const e of disk) if (!ids.has(e.id)) myEvents.push(e);
      } catch { /* already reported above */ }
    }
    // Only redraw when something actually changed (reloads happen every time the window regains
    // focus, including when a file-picker dialog closes; a needless redraw resets form fields)
    const changed = merged.length !== allEvents.length;
    allEvents = merged;
    if (changed) rebuild();
    return { files: files.map(([n]) => n), problems, changed };
  }

  async function append(events) {
    const ts = Date.now();
    const stamped = events.map((e, i) => ({ id: uid(), ts: ts + i * 0.001, dev: deviceId, ...e }));
    myEvents.push(...stamped);
    allEvents.push(...stamped);
    rebuild();
    await writeMine();
  }

  return {
    supported: () => typeof window.showDirectoryPicker === "function",
    async init() {
      deviceId = await getDeviceId();
      const saved = await kvGet("dir");
      if (saved) {
        dir = saved;
        const perm = await dir.queryPermission({ mode: "readwrite" });
        return perm === "granted" ? "ready" : "needs-permission";
      }
      return "needs-folder";
    },
    async pickFolder() {
      dir = await window.showDirectoryPicker({ id: "truong-finance", mode: "readwrite" });
      await kvSet("dir", dir);
      myEvents = [];
      return this.open();
    },
    async regrant() {
      const perm = await dir.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") throw new Error("Permission to the folder was not granted.");
      return this.open();
    },
    async open() {
      const mine = await dir.getFileHandle(myFileName(), { create: true });
      myEvents = await readJson(mine);
      allEvents = [];
      const info = await reload();
      rebuild();   // always draw once on open, even for an empty folder
      return info;
    },
    reload,
    folderName: () => (dir ? dir.name : ""),
    deviceId: () => deviceId,
    onChange: (fn) => listeners.push(fn),

    // ---- reads ----
    transactions: () => [...state.tx.values()],
    cfg: (key, fallback) => (key in state.cfg ? state.cfg[key] : fallback),
    eventCount: () => allEvents.length,

    // ---- writes ----
    saveTx: (tx) => append([{ type: "tx", data: { ...tx, id: tx.id || uid() } }]),
    saveTxs: (txs) => append(txs.map((t) => ({ type: "tx", data: { ...t, id: t.id || uid() } }))),
    deleteTx: (id) => append([{ type: "tx-del", data: { id } }]),
    deleteTxs: (ids) => append(ids.map((id) => ({ type: "tx-del", data: { id } }))),
    setCfg: (key, value) => append([{ type: "cfg", data: { key, value } }]),

    // Full snapshot for backups / export
    snapshot: () => ({ exportedAt: new Date().toISOString(), cfg: state.cfg, transactions: [...state.tx.values()] }),
    // Restore a snapshot as new events from this device
    restore: (snap) => append([
      ...Object.entries(snap.cfg || {}).map(([key, value]) => ({ type: "cfg", data: { key, value } })),
      ...(snap.transactions || []).map((t) => ({ type: "tx", data: t })),
    ]),
    newId: uid,
  };
})();

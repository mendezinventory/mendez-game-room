import { firebaseConfig } from "./firebase-config.js";

// Shared mode: turns on once firebase-config.js is filled in. Otherwise data stays in this browser.
const CLOUD = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");
let fb = null, db = null, auth = null;
if (CLOUD) {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  const [appMod, authMod, storeMod] = await Promise.all([
    import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js"),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  fb = { ...authMod, ...storeMod };
  auth = authMod.getAuth(app);
  db = storeMod.getFirestore(app);
}

const CONDITIONS = ["Mint", "Good", "Fair", "Poor", "For parts"];
const REGIONS = ["NTSC (US)", "PAL", "Japan", "Other"];
const WORKING = ["Working", "Needs repair", "Untested", "Not working"];

// Each section is defined by its fields. Add or rename fields here.
// "counts: true" means the section's values are added to the total.
const SECTIONS = {
  consoles: {
    label: "Consoles", counts: true,
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "maker", label: "Maker" },
      { key: "qty", label: "How many", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "region", label: "Region", type: "select", options: REGIONS },
      { key: "condition", label: "Condition", type: "select", options: CONDITIONS },
      { key: "working", label: "Working?", type: "select", options: WORKING },
      { key: "value", label: "Value each ($)", type: "number" },
      { key: "location", label: "Location" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  games: {
    label: "Games", counts: true,
    fields: [
      { key: "name", label: "Title", required: true },
      { key: "console", label: "Console", type: "console" },
      { key: "qty", label: "How many", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "rating", label: "Rating (E, T, M...)" },
      { key: "format", label: "Physical or digital", type: "select", options: ["Physical", "Digital"] },
      { key: "region", label: "Region", type: "select", options: REGIONS },
      { key: "condition", label: "Condition", type: "select", options: CONDITIONS },
      { key: "complete", label: "Complete in box", type: "checkbox" },
      { key: "value", label: "Value each ($)", type: "number" },
      { key: "location", label: "Location" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  controllers: {
    label: "Controllers", counts: true,
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "console", label: "Console", type: "console" },
      { key: "qty", label: "How many", type: "number" },
      { key: "condition", label: "Condition", type: "select", options: CONDITIONS },
      { key: "working", label: "Working?", type: "select", options: WORKING },
      { key: "value", label: "Value each ($)", type: "number" },
      { key: "location", label: "Location" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  accessories: {
    label: "Accessories", counts: true,
    fields: [
      { key: "name", label: "Item (cable, memory card, power supply...)", required: true },
      { key: "console", label: "Console", type: "console" },
      { key: "qty", label: "How many", type: "number" },
      { key: "working", label: "Working?", type: "select", options: WORKING },
      { key: "value", label: "Value each ($)", type: "number" },
      { key: "location", label: "Location" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  emulators: {
    label: "Emulators",
    fields: [
      { key: "name", label: "Emulator", required: true },
      { key: "console", label: "Emulates", type: "console" },
      { key: "device", label: "Runs on" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  wishlist: {
    label: "Wishlist",
    fields: [
      { key: "name", label: "Title or item", required: true },
      { key: "console", label: "Console", type: "console" },
      { key: "region", label: "Region", type: "select", options: REGIONS },
      { key: "target", label: "Price to pay ($)", type: "number" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
};

const KEY = "gameRoomInventory";
// Lists are grouped by console (the Consoles tab itself is one flat list).
const groupBy = sec => sec.fields.some(f => f.key === "console") ? "console" : null;
const NONE = "Not set";
const emptyData = () => Object.fromEntries(Object.keys(SECTIONS).map(k => [k, []]));
let data = CLOUD ? emptyData() : load();
let current = "consoles";
let editingId = null;
const openGroups = new Set();
const closedLists = new Set(); // tabs whose whole list is hidden

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      Object.keys(SECTIONS).forEach(k => saved[k] ||= []);
      return saved;
    }
  } catch (e) {}
  return Object.fromEntries(Object.keys(SECTIONS).map(k => [k, []]));
}
function save(keys) {
  if (!CLOUD) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    return;
  }
  (keys || [current]).forEach(k => {
    fb.setDoc(fb.doc(db, "inventory", k), { items: data[k] })
      .catch(() => alert("Couldn't save that change. Check the internet connection and try again."));
  });
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const $ = id => document.getElementById(id);

function renderTabs() {
  $("tabs").innerHTML = Object.entries(SECTIONS).map(([k, s]) =>
    `<button type="button" data-tab="${k}" aria-selected="${k === current}">${s.label} (${data[k].length})</button>`
  ).join("");
  $("stats").textContent = Object.entries(SECTIONS).filter(([k]) => k !== "wishlist").map(([k, s]) => `${data[k].length} ${s.label.toLowerCase()}`).join(", ");
  const total = Object.entries(SECTIONS).filter(([, s]) => s.counts)
    .reduce((sum, [k]) => sum + data[k].reduce((t, i) => t + (Number(i.value) || 0) * (Number(i.qty) || 1), 0), 0);
  $("csv-text").textContent = "Import CSV into " + SECTIONS[current].label;
  $("total").textContent = "Total value: " + money(total);
}

function renderForm() {
  const sec = SECTIONS[current];
  const item = data[current].find(i => i.id === editingId) || {};
  $("form-title").textContent = (editingId ? "Edit " : "Add ") + sec.label.toLowerCase().replace(/s$/, "");
  const consoleNames = data.consoles.map(c => c.name);
  const fields = sec.fields.map(f => {
    const v = item[f.key] ?? "";
    let input;
    if (f.type === "select") {
      input = `<select name="${f.key}"><option value=""></option>${(f.options || CONDITIONS).map(c => `<option ${c === v ? "selected" : ""}>${c}</option>`).join("")}</select>`;
    } else if (f.type === "textarea") {
      input = `<textarea name="${f.key}">${esc(v)}</textarea>`;
    } else if (f.type === "checkbox") {
      input = `<input type="checkbox" name="${f.key}" ${v ? "checked" : ""} style="width:auto">`;
    } else if (f.type === "console") {
      input = `<input name="${f.key}" list="console-list" value="${esc(v)}"><datalist id="console-list">${consoleNames.map(n => `<option value="${esc(n)}">`).join("")}</datalist>`;
    } else {
      input = `<input name="${f.key}" type="${f.type || "text"}" value="${esc(v)}" ${f.required ? "required" : ""} ${f.type === "number" ? 'min="0"' : ""}>`;
    }
    return `<label class="${f.type === "textarea" ? "wide" : ""}">${f.label}${input}</label>`;
  }).join("");
  $("form").innerHTML = fields + `<div class="actions"><button type="submit">${editingId ? "Save" : "Add"}</button>${editingId ? '<button type="button" id="cancel">Cancel</button>' : ""}</div>`;
}

function renderList() {
  const sec = SECTIONS[current];
  const q = $("search").value.trim().toLowerCase();
  const closed = closedLists.has(current);
  $("list-title").textContent = (closed ? "▶ " : "▼ ") + sec.label + " (" + data[current].length + ")";
  $("list-toggle").setAttribute("aria-expanded", !closed);
  $("searchbar").hidden = $("list").hidden = closed;
  const gb = groupBy(sec), grouped = !!gb;
  $("search").placeholder = "Search " + sec.label.toLowerCase();
  $("expand-all").hidden = $("collapse-all").hidden = !grouped;
  const items = data[current]
    .filter(i => !q || Object.values(i).join(" ").toLowerCase().includes(q))
    .sort((a, b) => (grouped ? (a[gb] || "~").localeCompare(b[gb] || "~") : 0) || a.name.localeCompare(b.name));
  if (!items.length) {
    $("list").innerHTML = `<li class="empty">${q ? "No matches." : `No ${sec.label.toLowerCase()} yet. Add one above.`}</li>`;
    return;
  }
  const row = i => {
    const meta = sec.fields.filter(f => f.key !== "name" && !(grouped && f.key === gb) && i[f.key] !== "" && i[f.key] !== undefined && i[f.key] !== false)
      .map(f => f.type === "checkbox" ? f.label : f.key === "qty" ? (Number(i[f.key]) > 1 ? `x${i[f.key]}` : "") : (f.key === "value" || f.key === "target") ? money(i[f.key]) + (f.key === "value" && sec.fields.some(x => x.key === "qty") ? " each" : "") : esc(i[f.key])).filter(Boolean).join(", ");
    return `<li class="item" data-id="${i.id}">
      <div class="info"><div class="name">${esc(i.name)}</div><div class="meta">${meta}</div></div>
      ${sec.fields.some(f => f.key === "value") ? `<a class="btn" target="_blank" rel="noopener" href="https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent([i.name, i.console].filter(Boolean).join(" "))}">Price</a>` : ""}
      <button type="button" data-act="edit">Edit</button>
      <button type="button" data-act="delete">Delete</button>
    </li>`;
  };
  if (!grouped) { $("list").innerHTML = items.map(row).join(""); return; }
  const groups = {};
  items.forEach(i => (groups[i[gb] || NONE] ??= []).push(i));
  $("list").innerHTML = Object.entries(groups).map(([name, list]) => {
    const open = !!q || openGroups.has(current + "|" + name);
    return `<li class="group"><button type="button" data-group="${esc(name)}" aria-expanded="${open}">${open ? "▼" : "▶"} ${esc(name)} (${list.length})</button></li>`
      + (open ? list.map(row).join("") : "");
  }).join("");
}

function renderAll() { renderTabs(); renderForm(); renderList(); }

$("tabs").addEventListener("click", e => {
  const t = e.target.closest("[data-tab]");
  if (!t) return;
  current = t.dataset.tab; editingId = null; $("search").value = "";
  renderAll();
});

$("form").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData($("form"));
  const item = { id: editingId || crypto.randomUUID() };
  SECTIONS[current].fields.forEach(f => {
    item[f.key] = f.type === "checkbox" ? fd.has(f.key) : (fd.get(f.key) || "").trim();
  });
  const list = data[current];
  const idx = list.findIndex(i => i.id === editingId);
  if (idx >= 0) list[idx] = item; else list.push(item);
  editingId = null; save(); renderAll();
});

$("form").addEventListener("click", e => {
  if (e.target.id === "cancel") { editingId = null; renderForm(); }
});

$("list").addEventListener("click", e => {
  const g = e.target.closest("[data-group]");
  if (g) {
    const k = current + "|" + g.dataset.group;
    openGroups.has(k) ? openGroups.delete(k) : openGroups.add(k);
    renderList();
    return;
  }
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.closest(".item").dataset.id;
  if (btn.dataset.act === "edit") {
    editingId = id; renderForm(); $("form-window").scrollIntoView({ behavior: "smooth" });
  } else if (confirm("Delete this item?")) {
    data[current] = data[current].filter(i => i.id !== id);
    if (editingId === id) editingId = null;
    save(); renderAll();
  }
});

$("search").addEventListener("input", renderList);

$("export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "game-inventory.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("import").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (typeof parsed !== "object" || !Object.keys(SECTIONS).some(k => Array.isArray(parsed[k]))) throw new Error();
    Object.keys(SECTIONS).forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = []; });
    if (!confirm("Replace the current inventory with this file?")) return;
    data = parsed; editingId = null; save(Object.keys(SECTIONS)); renderAll();
  } catch (err) {
    alert("That file isn't a valid inventory export.");
  }
  e.target.value = "";
});

// ---- CSV import (adds rows to the open tab) ----
const ALIASES = {
  name: ["name", "title", "game", "gamename", "item", "emulator"],
  console: ["console", "system", "platform", "emulates"],
  qty: ["qty", "quantity", "count", "howmany"],
  value: ["value", "price", "worth", "valueeach", "estimatedvalue"],
  year: ["year", "yearreleased", "released"],
  rating: ["rating", "esrb"],
  format: ["format", "physicaldigital", "physical", "digital"],
  location: ["location", "shelf", "where"],
  condition: ["condition"],
  region: ["region"],
  working: ["working", "status"],
  complete: ["complete", "completeinbox", "cib"],
  target: ["target", "pricetopay"],
  notes: ["notes", "note", "comments"],
};
const norm = t => String(t).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; rows.push(row); row = [];
    } else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

$("import-csv").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const sec = SECTIONS[current];
  const rows = parseCSV(await file.text());
  e.target.value = "";
  if (rows.length < 2) { alert("That CSV has no data rows."); return; }
  // Skip title rows above the headers (e.g. a row that just says "PLAYSTATION 3")
  const hi = Math.max(0, rows.findIndex(r => r.filter(c => c.trim()).length >= 2));
  let defaultConsole = "";
  if (hi > 0) {
    const t = rows.slice(0, hi).map(r => r.find(c => c.trim())).find(Boolean) || "";
    defaultConsole = t.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/Playstation/g, "PlayStation");
  }
  const body = rows.slice(hi + 1);
  const map = {}; const ignored = [];
  rows[hi].forEach((h, idx) => {
    const n = norm(h);
    const field = sec.fields.find(f => norm(f.key) === n || norm(f.label) === n || (ALIASES[f.key] || []).includes(n));
    if (field && !(field.key in map)) map[field.key] = idx; else if (h.trim()) ignored.push(h.trim());
  });
  if (!("name" in map)) { alert(`No column for the name of the item. Rename one column to "Title" or "Name".`); return; }
  const items = body.map(r => {
    const item = { id: crypto.randomUUID() };
    let extra = [];
    sec.fields.forEach(f => {
      let v = (r[map[f.key]] ?? "").trim();
      if (f.type === "checkbox") v = /^(y|yes|true|1|x|cib)/i.test(v);
      else if (f.type === "number") v = v.replace(/[^0-9.]/g, "");
      else if (f.type === "select" && v) {
        const opt = (f.options || CONDITIONS).find(o => norm(o) === norm(v) || norm(o).startsWith(norm(v)));
        if (opt) v = opt; else { extra.push(`${f.label}: ${v}`); v = ""; }
      }
      if (f.key === "console" && !v) v = defaultConsole;
      item[f.key] = v;
    });
    if (extra.length && "notes" in item) item.notes = [item.notes, ...extra].filter(Boolean).join("; ");
    return item;
  }).filter(i => i.name);
  const cons = defaultConsole && !("console" in map) ? `\nConsole set to "${defaultConsole}" from the title row.` : "";
  const note = (cons) + (ignored.length ? `\n\nColumns not used: ${ignored.join(", ")}` : "");
  if (!confirm(`Add ${items.length} rows to ${sec.label}?${note}`)) return;
  data[current].push(...items); save(); renderAll();
});

renderAll();

const groupKeys = () => [...new Set(data[current].map(i => current + "|" + (i[groupBy(SECTIONS[current])] || NONE)))];
$("expand-all").addEventListener("click", () => { groupKeys().forEach(k => openGroups.add(k)); renderList(); });
$("collapse-all").addEventListener("click", () => { groupKeys().forEach(k => openGroups.delete(k)); renderList(); });

// ---- Sign-in and live sync (shared mode only) ----
if (CLOUD) {
  $("tabs").hidden = $("app").hidden = true;
  let unsubs = [];
  fb.onAuthStateChanged(auth, user => {
    unsubs.forEach(u => u()); unsubs = [];
    const on = !!user;
    $("tabs").hidden = $("app").hidden = !on;
    $("login").hidden = on;
    $("account").hidden = !on;
    $("who").textContent = user ? user.email : "";
    if (!on) { data = emptyData(); return; }
    Object.keys(SECTIONS).forEach(k => {
      unsubs.push(fb.onSnapshot(fb.doc(db, "inventory", k), snap => {
        data[k] = snap.exists() ? (snap.data().items || []) : [];
        renderTabs(); renderList();
      }, () => alert("Couldn't load the inventory. This account may not have access.")));
    });
  });
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("login-error").textContent = "";
    try {
      await fb.signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
      $("password").value = "";
    } catch (err) {
      $("login-error").textContent = "Wrong email or password.";
    }
  });
  $("signout").addEventListener("click", () => fb.signOut(auth));
}

$("toggle-pw").addEventListener("click", () => {
  const pw = $("password"), show = pw.type === "password";
  pw.type = show ? "text" : "password";
  $("toggle-pw").setAttribute("aria-pressed", show);
  $("toggle-pw").setAttribute("aria-label", show ? "Hide password" : "Show password");
  $("toggle-pw").textContent = show ? "🙈" : "👁";
});

$("list-toggle").addEventListener("click", () => {
  closedLists.has(current) ? closedLists.delete(current) : closedLists.add(current);
  renderList();
});
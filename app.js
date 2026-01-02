// Sidebrain - static version (GitHub Pages) with:
// - No-header CSV support (4 columns fixed order)
// - Hierarchical group tokens (space-separated tokens, ":" for nesting)
// - Tree group selector UI (select parent includes all descendants)
// - Tree collapse state persisted locally (default collapsed)
// - Auto-expand node when you select it
// - Modes (image+name / image-only / forgotten-only)
// - Swipe controls
// - Stats + streak (session + overall) stored in localStorage
// - NEW: Shrinking working set: ✅ known removes card from current set; reset button appears when set is empty

const LS = {
  csvUrl: "flash9_csv_url",
  selectedGroups: "flash9_selected_groups", // null = all, [] = none, ["music", "uni:univie"] = selected nodes
  forgotten: "flash9_forgotten",            // map name->true
  mode: "flash9_mode",
  shuffle: "flash9_shuffle",
  stats: "flash9_stats_v1",
  openNodes: "flash9_open_nodes_v1"         // persisted open/closed state of tree nodes
};

const el = (id) => document.getElementById(id);

// Optional (stats panel). If missing in HTML, app still works.
const optionalEls = {
  statsPanel: el("statsPanel"),
  statSessionKnown: el("statSessionKnown"),
  statSessionUnknown: el("statSessionUnknown"),
  statSessionStreak: el("statSessionStreak"),
  statOverallKnown: el("statOverallKnown"),
  statOverallUnknown: el("statOverallUnknown"),
  statOverallBestStreak: el("statOverallBestStreak"),
  btnResetStats: el("btnResetStats"),
};

const ui = {
  csvUrlInput: el("csvUrlInput"),
  btnLoad: el("btnLoad"),
  btnCopyLink: el("btnCopyLink"),
  status: el("status"),
  modeSelect: el("modeSelect"),
  shuffleToggle: el("shuffleToggle"),
  groupsList: el("groupsList"),
  btnAllGroups: el("btnAllGroups"),
  btnNoneGroups: el("btnNoneGroups"),
  btnReset: el("btnReset"), // resets forgotten map only

  counter: el("counter"),
  smallStatus: el("smallStatus"),

  card: el("card"),
  cardImg: el("cardImg"),
  imgFallback: el("imgFallback"),
  cardName: el("cardName"),
  cardInfo: el("cardInfo"),
  cardGroups: el("cardGroups"),
  btnReveal: el("btnReveal"),

  btnNo: el("btnNo"),
  btnYes: el("btnYes"),
  btnNext: el("btnNext")
};

let allCards = [];
let baseFilteredCards = [];   // snapshot of "cards that match filters" (does not shrink)
let activeCards = [];         // the shrinking working set
let currentIndex = 0;
let revealed = true;

// Persisted open/close state (default collapsed => [])
let openNodeIds = new Set(loadLS(LS.openNodes, []));

// Button inserted dynamically when the set is empty
let btnResetSet = null;

// ---------- small helpers ----------
function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function setStatus(msg) {
  if (ui.status) ui.status.textContent = msg || "";
}

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- groups (tokens + hierarchy) ----------
function splitGroups(s) {
  // single space = separator
  if (!s) return [];
  return String(s).trim().split(/\s+/g).map(x => x.trim()).filter(Boolean);
}

function expandGroupPrefixes(groupTokens) {
  const out = new Set();
  for (const token of groupTokens || []) {
    const parts = token.split(":").map(p => p.trim()).filter(Boolean);
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}:${p}` : p;
      out.add(acc);
    }
  }
  return out;
}

// ---------- CSV/TSV parsing ----------
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  const counts = {
    "\t": (firstLine.match(/\t/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length
  };
  if (counts["\t"] > 0) return "\t";
  if (counts[","] > 0) return ",";
  if (counts[";"] > 0) return ";";
  return ",";
}

function parseDelimited(text, delimiter) {
  // Minimal parser with quoted-field support (good enough for Google Sheets CSV exports)
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === delimiter) {
      pushField();
      continue;
    }

    if (c === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (c === "\r") continue;

    field += c;
  }

  pushField();
  pushRow();

  while (rows.length && rows[rows.length - 1].every(x => String(x || "").trim() === "")) {
    rows.pop();
  }
  return rows;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- stats ----------
function defaultStats() {
  return {
    overallKnown: 0,
    overallUnknown: 0,
    overallBestStreak: 0,
    sessionKnown: 0,
    sessionUnknown: 0,
    sessionStreak: 0
  };
}

function getStats() {
  return loadLS(LS.stats, defaultStats());
}

function resetSessionStats() {
  const s = getStats();
  s.sessionKnown = 0;
  s.sessionUnknown = 0;
  s.sessionStreak = 0;
  saveLS(LS.stats, s);
  renderStats();
}

function resetAllStats() {
  saveLS(LS.stats, defaultStats());
  renderStats();
}

function renderStats() {
  const s = getStats();
  if (!optionalEls.statsPanel) return;

  if (optionalEls.statSessionKnown) optionalEls.statSessionKnown.textContent = String(s.sessionKnown);
  if (optionalEls.statSessionUnknown) optionalEls.statSessionUnknown.textContent = String(s.sessionUnknown);
  if (optionalEls.statSessionStreak) optionalEls.statSessionStreak.textContent = String(s.sessionStreak);

  if (optionalEls.statOverallKnown) optionalEls.statOverallKnown.textContent = String(s.overallKnown);
  if (optionalEls.statOverallUnknown) optionalEls.statOverallUnknown.textContent = String(s.overallUnknown);
  if (optionalEls.statOverallBestStreak) optionalEls.statOverallBestStreak.textContent = String(s.overallBestStreak);
}

function recordAnswer(known) {
  const s = getStats();
  if (known) {
    s.sessionKnown += 1;
    s.overallKnown += 1;
    s.sessionStreak += 1;
    if (s.sessionStreak > s.overallBestStreak) s.overallBestStreak = s.sessionStreak;
  } else {
    s.sessionUnknown += 1;
    s.overallUnknown += 1;
    s.sessionStreak = 0;
  }
  saveLS(LS.stats, s);
  renderStats();
}

// ---------- forgotten ----------
function getForgottenMap() {
  return loadLS(LS.forgotten, {});
}

function setForgotten(name, value) {
  const m = getForgottenMap();
  if (!name) return;
  if (value) m[name] = true;
  else delete m[name];
  saveLS(LS.forgotten, m);
}

// ---------- selected groups (hierarchical nodes) ----------
function getSelectedGroups() {
  return loadLS(LS.selectedGroups, null); // null = all
}

function setSelectedGroups(groupsOrNull) {
  saveLS(LS.selectedGroups, groupsOrNull);
}

function matchesSelectedGroups(card, selectedIds) {
  if (selectedIds === null) return true;        // all
  if (!Array.isArray(selectedIds)) return true;
  if (selectedIds.length === 0) return false;   // none

  const prefixes = card.groupPrefixes || new Set();
  for (const sel of selectedIds) {
    if (prefixes.has(sel)) return true;
  }
  return false;
}

// ---------- group tree ----------
function makeNode(id, label) {
  return { id, label, children: new Map() };
}

function buildGroupTree(cards) {
  const root = makeNode("__root__", "__root__");

  for (const c of cards) {
    for (const token of (c.groups || [])) {
      const parts = token.split(":").map(p => p.trim()).filter(Boolean);
      if (parts.length === 0) continue;

      let node = root;
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc}:${part}` : part;

        if (!node.children.has(part)) {
          node.children.set(part, makeNode(acc, part));
        }
        node = node.children.get(part);
      }
    }
  }
  return root;
}

function collectNodeIds(treeRoot) {
  const ids = new Set();
  const stack = Array.from(treeRoot.children.values());
  while (stack.length) {
    const n = stack.pop();
    ids.add(n.id);
    for (const child of n.children.values()) stack.push(child);
  }
  return ids;
}

function restoreAndPruneOpenState(treeRoot) {
  const saved = new Set(loadLS(LS.openNodes, [])); // default collapsed
  const existing = collectNodeIds(treeRoot);

  const pruned = new Set();
  for (const id of saved) {
    if (existing.has(id)) pruned.add(id);
  }

  openNodeIds = pruned;
  saveLS(LS.openNodes, Array.from(openNodeIds));
}

function persistOpenState() {
  saveLS(LS.openNodes, Array.from(openNodeIds));
}

function toggleOpenNode(nodeId) {
  if (openNodeIds.has(nodeId)) openNodeIds.delete(nodeId);
  else openNodeIds.add(nodeId);
  persistOpenState();
  renderGroupsUI();
}

function toggleSelectedNode(nodeId) {
  const selected = getSelectedGroups();
  const set = new Set(Array.isArray(selected) ? selected : []);

  const willSelect = !set.has(nodeId);
  if (willSelect) set.add(nodeId);
  else set.delete(nodeId);

  setSelectedGroups(Array.from(set));

  // selecting a node auto-expands it (and remembers it)
  if (willSelect) {
    openNodeIds.add(nodeId);
    persistOpenState();
  }

  renderGroupsUI();
  applyFilters(true); // changing filters should reset working set
}

function renderGroupsUI() {
  if (!ui.groupsList) return;

  const tree = buildGroupTree(allCards);
  const selected = new Set(getSelectedGroups() || []);

  ui.groupsList.innerHTML = "";
  ui.groupsList.style.display = "block";

  const renderNode = (node, depth) => {
    const row = document.createElement("div");
    row.className = "treeRow";
    row.style.paddingLeft = `${depth * 14}px`;

    const hasKids = node.children.size > 0;
    const isOpen = openNodeIds.has(node.id);

    const twist = document.createElement("button");
    twist.className = "treeTwist";
    twist.textContent = hasKids ? (isOpen ? "▾" : "▸") : "•";
    twist.disabled = !hasKids;
    twist.addEventListener("click", (e) => {
      e.preventDefault();
      if (hasKids) toggleOpenNode(node.id);
    });

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selected.has(node.id);
    cb.addEventListener("change", () => toggleSelectedNode(node.id));

    const label = document.createElement("span");
    label.className = "treeLabel";
    label.textContent = node.label;

    row.appendChild(twist);
    row.appendChild(cb);
    row.appendChild(label);
    ui.groupsList.appendChild(row);

    if (hasKids && isOpen) {
      const kids = Array.from(node.children.values()).sort((a, b) => a.label.localeCompare(b.label));
      for (const k of kids) renderNode(k, depth + 1);
    }
  };

  const roots = Array.from(tree.children.values()).sort((a, b) => a.label.localeCompare(b.label));
  for (const r of roots) renderNode(r, 0);
}

// ---------- UI helpers for shrinking set ----------
function ensureResetSetButton() {
  if (btnResetSet) return btnResetSet;

  const actionsContainer = ui.btnYes?.parentElement; // the .actions div in your HTML
  if (!actionsContainer) return null;

  const b = document.createElement("button");
  b.textContent = "↻ Reset set";
  b.className = "primary";
  b.style.display = "none";

  b.addEventListener("click", () => {
    resetWorkingSet();
  });

  actionsContainer.appendChild(b);
  btnResetSet = b;
  return btnResetSet;
}

function setPracticeControlsEnabled(enabled) {
  // show/hide existing controls based on whether there are cards left
  if (ui.btnNo) ui.btnNo.style.display = enabled ? "" : "none";
  if (ui.btnYes) ui.btnYes.style.display = enabled ? "" : "none";
  if (ui.btnNext) ui.btnNext.style.display = enabled ? "" : "none";

  const b = ensureResetSetButton();
  if (b) b.style.display = enabled ? "none" : "";
}

function resetWorkingSet() {
  // rebuild working set from the last baseFilteredCards snapshot
  const doShuffle = ui.shuffleToggle ? ui.shuffleToggle.checked : true;
  activeCards = doShuffle ? shuffleInPlace(baseFilteredCards.slice()) : baseFilteredCards.slice();
  currentIndex = 0;

  if (ui.smallStatus) {
    ui.smallStatus.textContent =
      activeCards.length > 0
        ? `Ready. ${activeCards.length} cards in the current selection.`
        : `No cards match your current filters.`;
  }

  setPracticeControlsEnabled(activeCards.length > 0);
  showCard();
}

// ---------- cards & UI ----------
function setImage(url) {
  if (!ui.cardImg || !ui.imgFallback) return;

  if (!url) {
    ui.cardImg.style.display = "none";
    ui.imgFallback.style.display = "block";
    ui.cardImg.removeAttribute("src");
    return;
  }

  ui.cardImg.onload = () => {
    ui.cardImg.style.display = "block";
    ui.imgFallback.style.display = "none";
  };
  ui.cardImg.onerror = () => {
    ui.cardImg.style.display = "none";
    ui.imgFallback.style.display = "block";
    ui.cardImg.removeAttribute("src");
  };
  ui.cardImg.src = url;
}

function renderReveal(card) {
  if (!ui.btnReveal || !ui.cardName) return;

  if (ui.modeSelect && ui.modeSelect.value === "image_only") {
    ui.btnReveal.style.display = "inline-block";
    ui.cardName.textContent = revealed ? (card.name || "—") : "???";
  } else {
    ui.btnReveal.style.display = "none";
    ui.cardName.textContent = card.name || "—";
  }
}

function showCard() {
  if (!ui.counter || !ui.cardName || !ui.cardInfo || !ui.cardGroups) return;

  if (activeCards.length === 0) {
    ui.counter.textContent = "0 / 0";
    ui.cardName.textContent = "🎉 Done!";
    ui.cardInfo.textContent = "You marked all cards as known.";
    ui.cardGroups.textContent = "";
    setImage("");
    setPracticeControlsEnabled(false);
    return;
  }

  const c = activeCards[currentIndex % activeCards.length];
  ui.counter.textContent = `${(currentIndex % activeCards.length) + 1} / ${activeCards.length}`;

  revealed = !(ui.modeSelect && ui.modeSelect.value === "image_only");
  renderReveal(c);

  ui.cardInfo.textContent = c.info || "";
  ui.cardGroups.textContent = (c.groups && c.groups.length) ? `Groups: ${c.groups.join(" ")}` : "";
  setImage(c.image || "");

  setPracticeControlsEnabled(true);
}

function nextCard() {
  if (activeCards.length === 0) return;
  currentIndex = (currentIndex + 1) % activeCards.length;
  showCard();
}

// applyFilters(resetWorkingSetToo=true) will rebuild baseFiltered and also reset the shrinking set
function applyFilters(resetWorkingSetToo = true) {
  const selectedIds = getSelectedGroups();
  const mode = ui.modeSelect ? ui.modeSelect.value : "image_name";
  const forgottenMap = getForgottenMap();

  let filtered = allCards.filter(c => c.name);
  filtered = filtered.filter(c => matchesSelectedGroups(c, selectedIds));

  if (mode === "forgotten") {
    filtered = filtered.filter(c => forgottenMap[c.name]);
  }

  baseFilteredCards = filtered.slice();

  if (ui.smallStatus) {
    ui.smallStatus.textContent =
      baseFilteredCards.length > 0
        ? `Ready. ${baseFilteredCards.length} cards in the current selection.`
        : `No cards match your current filters.`;
  }

  if (resetWorkingSetToo) {
    resetWorkingSet();
  } else {
    // if not resetting, still ensure UI reflects whether the set is empty
    setPracticeControlsEnabled(activeCards.length > 0);
    showCard();
  }
}

function removeCurrentCardFromWorkingSet() {
  if (activeCards.length === 0) return;

  const idx = currentIndex % activeCards.length;
  activeCards.splice(idx, 1);

  // Keep index stable: if we removed the last element, wrap
  if (activeCards.length === 0) {
    currentIndex = 0;
  } else if (idx >= activeCards.length) {
    currentIndex = 0;
  }
}

function markKnown(known) {
  if (activeCards.length === 0) return;

  const idx = currentIndex % activeCards.length;
  const c = activeCards[idx];

  // Mirror your existing forgotten logic:
  // unknown => add to forgotten; known => remove from forgotten
  setForgotten(c.name, !known);

  // stats/streak
  recordAnswer(known);

  // NEW behavior: known => remove from working set immediately
  if (known) {
    removeCurrentCardFromWorkingSet();
    showCard();
  } else {
    // unknown stays in set; just move on
    nextCard();
  }
}

// ---------- data loading (NO HEADERS) ----------
function buildCardsFromText_NoHeaders(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter)
    .map(r => r.map(x => String(x ?? "").trim()))
    .filter(r => r.some(cell => cell.length > 0));

  // Each row: [name, groups, imageUrl, info]
  const cards = rows.map((r) => {
    const name = (r[0] || "").trim();
    const groupsRaw = (r[1] || "").trim();
    const image = (r[2] || "").trim();
    const info = (r[3] || "").trim();

    const groups = splitGroups(groupsRaw);                 // tokens (paths)
    const groupPrefixes = expandGroupPrefixes(groups);     // ancestors included

    return { name, groups, groupPrefixes, image, info, raw: r };
  }).filter(c => c.name);

  return cards;
}

async function fetchSheet(url) {
  setStatus("Loading…");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function setCsvUrl(url) {
  if (ui.csvUrlInput) ui.csvUrlInput.value = url || "";
  saveLS(LS.csvUrl, url || "");
}

function getCsvUrl() {
  const qp = getQueryParam("csv");
  if (qp) return qp;
  const saved = loadLS(LS.csvUrl, "");
  return saved || "";
}

function copyShareLink() {
  const url = ui.csvUrlInput ? ui.csvUrlInput.value.trim() : "";
  if (!url) return;

  const u = new URL(window.location.href);
  u.searchParams.set("csv", url);

  navigator.clipboard.writeText(u.toString()).then(() => {
    setStatus("Share link copied to clipboard.");
    setTimeout(() => setStatus(""), 1500);
  }).catch(() => {
    setStatus("Could not copy automatically. You can manually add ?csv=YOUR_URL");
  });
}

// ---------- swipe support ----------
let touchStartX = null;
let touchStartY = null;

function onTouchStart(e) {
  if (!e.touches || e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}
function onTouchEnd(e) {
  if (touchStartX == null || touchStartY == null) return;
  const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
  if (!t) return;

  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  touchStartX = null;
  touchStartY = null;

  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;

  if (dx > 0) markKnown(true);
  else markKnown(false);
}

// ---------- wiring ----------
if (ui.btnLoad) ui.btnLoad.addEventListener("click", async () => {
  const url = ui.csvUrlInput ? ui.csvUrlInput.value.trim() : "";
  if (!url) {
    setStatus("Please paste a public CSV/TSV URL.");
    return;
  }
  setCsvUrl(url);

  try {
    const text = await fetchSheet(url);
    allCards = buildCardsFromText_NoHeaders(text);

    // Restore open/collapse state (default collapsed) and prune invalid IDs
    const tree = buildGroupTree(allCards);
    restoreAndPruneOpenState(tree);

    renderGroupsUI();

    // Rebuild working set from filters
    applyFilters(true);

    setStatus(`Loaded ${allCards.length} cards.`);
    resetSessionStats();
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load. ${String(err.message || err)}`);
  }
});

if (ui.btnCopyLink) ui.btnCopyLink.addEventListener("click", copyShareLink);

if (ui.modeSelect) ui.modeSelect.addEventListener("change", () => {
  saveLS(LS.mode, ui.modeSelect.value);
  applyFilters(true);
});

if (ui.shuffleToggle) ui.shuffleToggle.addEventListener("change", () => {
  saveLS(LS.shuffle, ui.shuffleToggle.checked);
  applyFilters(true);
});

if (ui.btnAllGroups) ui.btnAllGroups.addEventListener("click", () => {
  setSelectedGroups(null); // all
  renderGroupsUI();
  applyFilters(true);
});

if (ui.btnNoneGroups) ui.btnNoneGroups.addEventListener("click", () => {
  setSelectedGroups([]); // none
  renderGroupsUI();
  applyFilters(true);
});

if (ui.btnReveal) ui.btnReveal.addEventListener("click", () => {
  if (activeCards.length === 0) return;
  revealed = true;
  const c = activeCards[currentIndex % activeCards.length];
  renderReveal(c);
});

if (ui.btnYes) ui.btnYes.addEventListener("click", () => markKnown(true));
if (ui.btnNo) ui.btnNo.addEventListener("click", () => markKnown(false));
if (ui.btnNext) ui.btnNext.addEventListener("click", nextCard);

if (ui.btnReset) ui.btnReset.addEventListener("click", () => {
  // resets forgotten tags only (kept as-is)
  localStorage.removeItem(LS.forgotten);
  setStatus("Forgotten list reset on this device.");
  applyFilters(true);
  setTimeout(() => setStatus(""), 1500);
});

if (optionalEls.btnResetStats) optionalEls.btnResetStats.addEventListener("click", () => {
  resetAllStats();
  setStatus("Stats reset on this device.");
  setTimeout(() => setStatus(""), 1500);
});

if (ui.card) {
  ui.card.addEventListener("touchstart", onTouchStart, { passive: true });
  ui.card.addEventListener("touchend", onTouchEnd, { passive: true });
}

// ---------- init ----------
(function init() {
  // restore UI settings
  if (ui.modeSelect) ui.modeSelect.value = loadLS(LS.mode, "image_name");
  if (ui.shuffleToggle) ui.shuffleToggle.checked = loadLS(LS.shuffle, true);

  // create reset-set button once (hidden until needed)
  ensureResetSetButton();

  renderStats();

  const initialUrl = getCsvUrl();
  if (initialUrl && ui.csvUrlInput) {
    ui.csvUrlInput.value = initialUrl;
    if (ui.btnLoad) ui.btnLoad.click();
  } else {
    if (ui.smallStatus) ui.smallStatus.textContent = "Paste a public CSV/TSV URL to begin.";
    // empty state
    applyFilters(true);
  }
})();

// Features:
// - Loads cards from public CSV/TSV URL (no headers; 4 columns fixed order)
// - Groups: space-separated tokens, ":" indicates hierarchy (music:instr:piano)
// - Group selector as a collapsible tree; open/closed state persisted locally (default collapsed)
// - Selecting a node auto-expands it
// - Modes: image+name / image-only / forgotten-only
// - Swipe: right = known, left = unknown
// - Practice mode: ✅ known removes card from CURRENT working set (shrinking set); reset button appears when empty
// - Forgotten list stored locally (unknown => forgotten; known => remove from forgotten)
// - Stats + streak (session + overall) stored in localStorage
// - Image column can be URL OR text in brackets: [some text] -> rendered as centered overlay (autosized)
// - Info supports Markdown links: [label](https://...)
// - Clicking links opens an in-app modal preview:
//    - YouTube -> embedded player
//    - Spotify -> embedded player
//    - other -> opens in new tab
// - NEW: Save/load multiple sheet URLs locally via dropdown (dbSelect) + optional URL param &database=NAME (or &databse=NAME typo)

const LS = {
  csvUrl: "flash9_csv_url",
  selectedGroups: "flash9_selected_groups",
  forgotten: "flash9_forgotten",
  mode: "flash9_mode",
  shuffle: "flash9_shuffle",
  stats: "flash9_stats_v1",
  openNodes: "flash9_open_nodes_v1",

  databases: "flash9_databases_v1",
  activeDatabase: "flash9_active_database_v1"
};

const el = (id) => document.getElementById(id);

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
  // data source controls
  dbSelect: el("dbSelect"),
  btnForgetDb: el("btnForgetDb"),
  csvUrlInput: el("csvUrlInput"),
  btnLoad: el("btnLoad"),
  btnCopyLink: el("btnCopyLink"),
  status: el("status"),

  // options
  modeSelect: el("modeSelect"),
  shuffleToggle: el("shuffleToggle"),

  // group tree
  groupsList: el("groupsList"),
  btnAllGroups: el("btnAllGroups"),
  btnNoneGroups: el("btnNoneGroups"),

  // progress / status
  btnReset: el("btnReset"),
  counter: el("counter"),
  smallStatus: el("smallStatus"),

  // card area
  card: el("card"),
  cardImg: el("cardImg"),
  imgFallback: el("imgFallback"),
  cardName: el("cardName"),
  cardInfo: el("cardInfo"),
  cardGroups: el("cardGroups"),
  btnReveal: el("btnReveal"),

  // actions
  btnNo: el("btnNo"),
  btnYes: el("btnYes"),
  btnNext: el("btnNext")
};

let allCards = [];
let baseFilteredCards = []; // snapshot of cards matching current filters (non-shrinking)
let activeCards = [];       // shrinking practice set
let currentIndex = 0;
let revealed = true;

let openNodeIds = new Set(loadLS(LS.openNodes, [])); // default: collapsed

let btnResetSet = null;

// -------------------- small helpers --------------------
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

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function getCsvUrl() {
  // priority: query param > localStorage
  const qp = getQueryParam("csv");
  if (qp) return qp;
  return loadLS(LS.csvUrl, "") || "";
}

function setCsvUrl(url) {
  if (ui.csvUrlInput) ui.csvUrlInput.value = url || "";
  saveLS(LS.csvUrl, url || "");
}

function splitGroups(s) {
  // single space separator
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

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// -------------------- stats --------------------
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

// -------------------- forgotten map --------------------
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

// -------------------- delimiter parsing --------------------
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
  // Minimal parser with quoted-field support
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
      continue;
    }

    if (c === '"') { inQuotes = true; continue; }
    if (c === delimiter) { pushField(); continue; }
    if (c === "\n") { pushField(); pushRow(); continue; }
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

// -------------------- data loading (no headers) --------------------
function buildCardsFromText_NoHeaders(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter)
    .map(r => r.map(x => String(x ?? "").trim()))
    .filter(r => r.some(cell => cell.length > 0));

  // Each row: [name, groups, imageUrlOrText, info]
  return rows.map((r) => {
    const name = (r[0] || "").trim();
    const groupsRaw = (r[1] || "").trim();
    const image = (r[2] || "").trim();
    const info = (r[3] || "").trim();

    const groups = splitGroups(groupsRaw);
    const groupPrefixes = expandGroupPrefixes(groups);

    return { name, groups, groupPrefixes, image, info, raw: r };
  }).filter(c => c.name);
}

async function fetchSheet(url) {
  setStatus("Loading…");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// -------------------- group selection + tree --------------------
function getSelectedGroups() {
  return loadLS(LS.selectedGroups, null); // null = all
}

function setSelectedGroups(groupsOrNull) {
  saveLS(LS.selectedGroups, groupsOrNull);
}

function matchesSelectedGroups(card, selectedIds) {
  if (selectedIds === null) return true;
  if (!Array.isArray(selectedIds)) return true;
  if (selectedIds.length === 0) return false;

  const prefixes = card.groupPrefixes || new Set();
  for (const sel of selectedIds) {
    if (prefixes.has(sel)) return true; // parent selection includes descendants (prefix set contains sel)
  }
  return false;
}

function makeNode(id, label) {
  return { id, label, children: new Map() };
}

function buildGroupTree(cards) {
  const root = makeNode("__root__", "__root__");
  for (const c of cards) {
    for (const token of (c.groups || [])) {
      const parts = token.split(":").map(p => p.trim()).filter(Boolean);
      if (!parts.length) continue;

      let node = root;
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc}:${part}` : part;
        if (!node.children.has(part)) node.children.set(part, makeNode(acc, part));
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
  const saved = new Set(loadLS(LS.openNodes, []));
  const existing = collectNodeIds(treeRoot);

  const pruned = new Set();
  for (const id of saved) if (existing.has(id)) pruned.add(id);

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

  // Auto-expand on select
  if (willSelect) {
    openNodeIds.add(nodeId);
    persistOpenState();
  }

  renderGroupsUI();
  applyFilters(true);
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

// -------------------- image field: URL OR [text] overlay --------------------
function parseImageField(imageFieldRaw) {
  const s = String(imageFieldRaw || "").trim();
  const m = s.match(/^\[(.*)\]$/s);
  if (m) return { kind: "text", text: (m[1] || "").trim() };
  return { kind: "url", url: s };
}

function ensureImageTextOverlay() {
  // IMPORTANT: your HTML uses id="cardImgWrap" (per your DevTools screenshot)
  const wrap = document.getElementById("cardImgWrap");
  if (!wrap) return null;

  wrap.style.position = "relative";

  let overlay = document.getElementById("cardImgText");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "cardImgText";

  // Self-contained styling (so it works even if CSS is missing)
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "14px";
  overlay.style.boxSizing = "border-box";
  overlay.style.textAlign = "center";
  overlay.style.fontWeight = "800";
  overlay.style.lineHeight = "1.1";
  overlay.style.color = "#fff";
  overlay.style.background = "rgba(0,0,0,0.35)";
  overlay.style.borderRadius = "16px";
  overlay.style.overflow = "hidden";
  overlay.style.wordBreak = "break-word";
  overlay.style.zIndex = "5";

  wrap.appendChild(overlay);
  return overlay;
}

function fitTextToBox(el, text) {
  el.textContent = text || "";
  let size = 56;
  el.style.fontSize = `${size}px`;

  const minSize = 14;
  const maxIter = 40;

  for (let i = 0; i < maxIter; i++) {
    const overflows = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
    if (!overflows) break;

    size = Math.max(minSize, size - 2);
    el.style.fontSize = `${size}px`;

    if (size === minSize) break;
  }
}

function setImageOrText(imageFieldRaw) {
  const overlay = ensureImageTextOverlay();
  const parsed = parseImageField(imageFieldRaw);

  // Reset visibility
  if (overlay) overlay.style.display = "none";
  if (ui.cardImg) {
    ui.cardImg.style.display = "none";
    ui.cardImg.onload = null;
    ui.cardImg.onerror = null;
    ui.cardImg.removeAttribute("src");
  }
  if (ui.imgFallback) ui.imgFallback.style.display = "none";

  // Text mode
  if (parsed.kind === "text" && parsed.text) {
    if (ui.imgFallback) ui.imgFallback.style.display = "none";
    if (overlay) {
      overlay.style.display = "flex";
      requestAnimationFrame(() => {
        fitTextToBox(overlay, parsed.text);
        requestAnimationFrame(() => fitTextToBox(overlay, parsed.text));
      });
    }
    return;
  }

  // URL mode
  const url = parsed.url;
  if (!url) {
    if (ui.imgFallback) ui.imgFallback.style.display = "block";
    return;
  }

  if (!ui.cardImg || !ui.imgFallback) return;

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

// Compatibility alias if any old call still exists
function setImage(x) { setImageOrText(x); }

// -------------------- INFO: markdown links + in-app preview modal --------------------
function renderInfoWithLinks(text) {
  if (!text) return "";

  // escape HTML first
  let safe = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // markdown links: [label](https://...)
  safe = safe.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    `<a href="$2" data-preview="1">$1</a>`
  );

  return safe;
}

function ensurePreviewModal() {
  let m = document.getElementById("previewModal");
  if (m) return m;

  m = document.createElement("div");
  m.id = "previewModal";

  // Minimal inline styling to avoid needing extra CSS
  m.style.position = "fixed";
  m.style.inset = "0";
  m.style.display = "none";
  m.style.alignItems = "center";
  m.style.justifyContent = "center";
  m.style.background = "rgba(0,0,0,.65)";
  m.style.zIndex = "9999";
  m.style.padding = "16px";
  m.style.boxSizing = "border-box";

  m.innerHTML = `
    <div id="previewBox" style="
      width: min(720px, 96vw);
      max-height: 86vh;
      background: rgba(20,20,24,.95);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 18px;
      overflow: hidden;
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:10px 12px;
        border-bottom:1px solid rgba(255,255,255,.10);
      ">
        <div id="previewTitle" style="
          font-size:13px;
          opacity:.85;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        ">Preview</div>
        <button id="previewClose" style="border-radius:12px; padding:6px 10px;">Close</button>
      </div>
      <div id="previewContent" style="padding:0;"></div>
    </div>
  `;

  document.body.appendChild(m);

  const close = () => {
    const content = document.getElementById("previewContent");
    if (content) content.innerHTML = ""; // stops playback
    m.style.display = "none";
  };

  m.addEventListener("click", (e) => {
    if (e.target === m) close();
  });

  document.getElementById("previewClose")?.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && m.style.display !== "none") close();
  });

  m._close = close;
  return m;
}

function parseYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2];
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
    }
  } catch {}
  return null;
}

function parseSpotify(url) {
  // open.spotify.com/{track|album|playlist|artist|episode|show}/{id}
  try {
    const u = new URL(url);
    if (!u.hostname.includes("open.spotify.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return { type: parts[0], id: parts[1] };
  } catch {}
  return null;
}

function openPreview(title, url) {
  const modal = ensurePreviewModal();
  const t = document.getElementById("previewTitle");
  const content = document.getElementById("previewContent");
  if (!content) return;

  if (t) t.textContent = title || "Preview";
  content.innerHTML = "";

  const yt = parseYouTubeId(url);
  if (yt) {
    const src = `https://www.youtube.com/embed/${encodeURIComponent(yt)}?rel=0`;
    content.innerHTML = `<iframe style="width:100%;height:min(60vh,520px);border:0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      src="${src}"></iframe>`;
    modal.style.display = "flex";
    return;
  }

  const sp = parseSpotify(url);
  if (sp) {
    const src = `https://open.spotify.com/embed/${encodeURIComponent(sp.type)}/${encodeURIComponent(sp.id)}`;
    content.innerHTML = `<iframe style="width:100%;height:min(60vh,520px);border:0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      src="${src}"></iframe>`;
    modal.style.display = "flex";
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

// -------------------- card rendering --------------------
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

function ensureResetSetButton() {
  if (btnResetSet) return btnResetSet;

  const actionsContainer = ui.btnYes?.parentElement;
  if (!actionsContainer) return null;

  const b = document.createElement("button");
  b.textContent = "↻ Reset set";
  b.className = "primary";
  b.style.display = "none";
  b.addEventListener("click", () => resetWorkingSet());
  actionsContainer.appendChild(b);

  btnResetSet = b;
  return btnResetSet;
}

function setPracticeControlsEnabled(enabled) {
  if (ui.btnNo) ui.btnNo.style.display = enabled ? "" : "none";
  if (ui.btnYes) ui.btnYes.style.display = enabled ? "" : "none";
  if (ui.btnNext) ui.btnNext.style.display = enabled ? "" : "none";

  const b = ensureResetSetButton();
  if (b) b.style.display = enabled ? "none" : "";
}

function showCard() {
  if (!ui.counter || !ui.cardName || !ui.cardInfo || !ui.cardGroups) return;

  if (activeCards.length === 0) {
    ui.counter.textContent = "0 / 0";
    ui.cardName.textContent = "🎉 Done!";
    ui.cardInfo.textContent = "You marked all cards as known.";
    ui.cardGroups.textContent = "";
    setImageOrText("");
    setPracticeControlsEnabled(false);
    return;
  }

  const c = activeCards[currentIndex % activeCards.length];
  ui.counter.textContent = `${(currentIndex % activeCards.length) + 1} / ${activeCards.length}`;

  revealed = !(ui.modeSelect && ui.modeSelect.value === "image_only");
  renderReveal(c);

  // INFO supports markdown links + modal preview
  ui.cardInfo.innerHTML = renderInfoWithLinks(c.info || "");

  ui.cardGroups.textContent = (c.groups && c.groups.length) ? `Groups: ${c.groups.join(" ")}` : "";
  setImageOrText(c.image || "");

  setPracticeControlsEnabled(true);
}

function nextCard() {
  if (activeCards.length === 0) return;
  currentIndex = (currentIndex + 1) % activeCards.length;
  showCard();
}

// -------------------- filtering + shrinking working set --------------------
function resetWorkingSet() {
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

  if (resetWorkingSetToo) {
    resetWorkingSet();
  } else {
    setPracticeControlsEnabled(activeCards.length > 0);
    showCard();
  }
}

function removeCurrentCardFromWorkingSet() {
  if (activeCards.length === 0) return;

  const idx = currentIndex % activeCards.length;
  activeCards.splice(idx, 1);

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

  // unknown => add to forgotten; known => remove from forgotten
  setForgotten(c.name, !known);

  // stats
  recordAnswer(known);

  // shrinking-set behavior: known removes the card immediately
  if (known) {
    removeCurrentCardFromWorkingSet();
    showCard();
  } else {
    nextCard();
  }
}

// -------------------- swipe support --------------------
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

// -------------------- share link --------------------
function copyShareLink() {
  const url = ui.csvUrlInput ? ui.csvUrlInput.value.trim() : "";
  if (!url) return;

  const u = new URL(window.location.href);
  u.searchParams.set("csv", url);

  const activeName = loadLS(LS.activeDatabase, "");
  if (activeName) u.searchParams.set("database", activeName);

  navigator.clipboard.writeText(u.toString()).then(() => {
    setStatus("Share link copied to clipboard.");
    setTimeout(() => setStatus(""), 1500);
  }).catch(() => {
    setStatus("Could not copy automatically. You can manually add ?csv=YOUR_URL");
  });
}

// -------------------- saved databases dropdown --------------------
function getDatabaseNameFromQuery() {
  // supports typo: databse
  return getQueryParam("database") || getQueryParam("databse") || "";
}

function loadDatabases() {
  return loadLS(LS.databases, []); // [{name,url}]
}

function saveDatabases(list) {
  saveLS(LS.databases, list);
}

function makeNextDefaultName(existing) {
  const used = new Set(existing.map(x => (x.name || "").toLowerCase()));
  let i = 1;
  while (used.has(`database${i}`)) i++;
  return `database${i}`;
}

function upsertDatabase(name, url) {
  if (!url) return;

  const list = loadDatabases();
  const cleanName = (name || "").trim() || makeNextDefaultName(list);
  const cleanUrl = url.trim();

  const idx = list.findIndex(x => (x.name || "").toLowerCase() === cleanName.toLowerCase());
  if (idx >= 0) list[idx].url = cleanUrl;
  else list.push({ name: cleanName, url: cleanUrl });

  list.sort((a, b) => a.name.localeCompare(b.name));
  saveDatabases(list);
  saveLS(LS.activeDatabase, cleanName);
  renderDatabaseDropdown();
}

function renderDatabaseDropdown() {
  if (!ui.dbSelect) return;

  const list = loadDatabases();
  const active = loadLS(LS.activeDatabase, "");

  ui.dbSelect.innerHTML = "";

  if (!list.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no saved databases)";
    ui.dbSelect.appendChild(opt);
    ui.dbSelect.value = "";
    return;
  }

  for (const db of list) {
    const opt = document.createElement("option");
    opt.value = db.name;
    opt.textContent = db.name;
    ui.dbSelect.appendChild(opt);
  }

  ui.dbSelect.value = (active && list.some(x => x.name === active)) ? active : list[0].name;
  saveLS(LS.activeDatabase, ui.dbSelect.value);
}

function applySelectedDatabaseToInput() {
  if (!ui.dbSelect || !ui.csvUrlInput) return;
  const name = ui.dbSelect.value;
  const list = loadDatabases();
  const db = list.find(x => x.name === name);
  if (db && db.url) {
    ui.csvUrlInput.value = db.url;
    saveLS(LS.csvUrl, db.url);
  }
}

function forgetActiveDatabase() {
  const active = loadLS(LS.activeDatabase, "");
  if (!active) return;

  const list = loadDatabases().filter(x => (x.name || "").toLowerCase() !== active.toLowerCase());
  saveDatabases(list);
  saveLS(LS.activeDatabase, "");

  renderDatabaseDropdown();

  setStatus(`Forgot "${active}" on this device.`);
  setTimeout(() => setStatus(""), 1500);
}

// -------------------- wiring --------------------
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

    const tree = buildGroupTree(allCards);
    restoreAndPruneOpenState(tree);

    renderGroupsUI();
    applyFilters(true);

    setStatus(`Loaded ${allCards.length} cards.`);
    resetSessionStats();

    // Remember this URL as a “database” (named by query param or auto-numbered)
    upsertDatabase(getDatabaseNameFromQuery(), url);
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
  setSelectedGroups(null);
  renderGroupsUI();
  applyFilters(true);
});

if (ui.btnNoneGroups) ui.btnNoneGroups.addEventListener("click", () => {
  setSelectedGroups([]);
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

// INFO link click -> modal preview
if (ui.cardInfo) {
  ui.cardInfo.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[data-preview='1']");
    if (!a) return;
    e.preventDefault();
    openPreview(a.textContent || "Preview", a.getAttribute("href"));
  });
}

// Databases dropdown wiring
if (ui.dbSelect) ui.dbSelect.addEventListener("change", () => {
  applySelectedDatabaseToInput();
  // auto-load on selection (nice UX)
  if (ui.btnLoad && ui.csvUrlInput?.value?.trim()) ui.btnLoad.click();
});

if (ui.btnForgetDb) ui.btnForgetDb.addEventListener("click", () => {
  forgetActiveDatabase();
});

// -------------------- init --------------------
(function init() {
  // restore UI settings
  if (ui.modeSelect) ui.modeSelect.value = loadLS(LS.mode, "image_name");
  if (ui.shuffleToggle) ui.shuffleToggle.checked = loadLS(LS.shuffle, true);

  ensureResetSetButton();
  renderStats();

  // Render saved databases first
  renderDatabaseDropdown();

  // If URL includes ?database=NAME (or typo), store it as “active”
  const dbName = getDatabaseNameFromQuery();
  if (dbName) {
    saveLS(LS.activeDatabase, dbName);
    renderDatabaseDropdown();
  }

  // If a saved DB is selected, populate input
  applySelectedDatabaseToInput();

  // Auto-load if query param provides csv
  const initialUrl = getCsvUrl();
  if (initialUrl && ui.csvUrlInput) {
    ui.csvUrlInput.value = initialUrl;
    if (ui.btnLoad) ui.btnLoad.click();
  } else {
    if (ui.smallStatus) ui.smallStatus.textContent = "Paste a public CSV/TSV URL to begin.";
    // keep empty state stable
    baseFilteredCards = [];
    activeCards = [];
    showCard();
  }
})();

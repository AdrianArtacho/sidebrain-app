// Flash9 - static version (GitHub Pages)
// Data: public CSV/TSV URL (Google Sheets publish -> output=csv recommended)
//
// Expected columns (flexible):
// - name / Name
// - group / groups / Group
// - image / img / photo / ImageURL
// - info / notes / Info
//
// Group values can be separated by: comma, semicolon, or pipe.

const LS = {
  csvUrl: "flash9_csv_url",
  selectedGroups: "flash9_selected_groups",
  forgotten: "flash9_forgotten", // map name->true
  mode: "flash9_mode",
  shuffle: "flash9_shuffle"
};

const el = (id) => document.getElementById(id);

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
  btnReset: el("btnReset"),

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
let activeCards = [];
let currentIndex = 0;
let revealed = true;

function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function setStatus(msg) {
  ui.status.textContent = msg || "";
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

function normalizeHeader(h) {
  return (h || "").trim().toLowerCase();
}

function splitGroups(s) {
  if (!s) return [];
  return String(s)
    .split(/[,;|]/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function detectDelimiter(text) {
  // Your Streamlit version uses TSV; many Google exports are CSV.
  // We'll detect by counting separators in the header line.
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  const counts = {
    "\t": (firstLine.match(/\t/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length
  };
  // prefer tab if present, else comma, else semicolon
  if (counts["\t"] > 0) return "\t";
  if (counts[","] > 0) return ",";
  if (counts[";"] > 0) return ";";
  return ","; // default
}

function parseDelimited(text, delimiter) {
  // Minimal CSV/TSV parser with quoted-field support.
  // Not as feature-complete as PapaParse, but good enough for Sheets exports.
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // avoid trailing empty line
    if (row.length === 1 && row[0] === "" && rows.length > 0) return;
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

    if (c === "\r") {
      // ignore \r; handle windows newlines
      continue;
    }

    field += c;
  }
  pushField();
  pushRow();
  return rows;
}

function mapRow(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = row[i] ?? "";
  }
  return obj;
}

function pickField(obj, candidates) {
  for (const c of candidates) {
    const key = normalizeHeader(c);
    for (const k of Object.keys(obj)) {
      if (normalizeHeader(k) === key) return obj[k];
    }
  }
  // also allow exact normalized matching against actual keys
  for (const k of Object.keys(obj)) {
    const nk = normalizeHeader(k);
    if (candidates.map(normalizeHeader).includes(nk)) return obj[k];
  }
  return "";
}

function canonicalizeCard(raw) {
  const name = String(pickField(raw, ["name", "Name", "person", "Person"])).trim();
  const groupStr = String(pickField(raw, ["group", "groups", "Group", "Tags", "tag"])).trim();
  const image = String(pickField(raw, ["image", "img", "photo", "ImageURL", "image_url", "url"])).trim();
  const info = String(pickField(raw, ["info", "notes", "note", "description", "Info"])).trim();

  const groups = splitGroups(groupStr);
  return { name, groups, image, info, raw };
}

function uniqueGroups(cards) {
  const set = new Set();
  for (const c of cards) for (const g of c.groups) set.add(g);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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

function getSelectedGroups() {
  return loadLS(LS.selectedGroups, null); // null means "all"
}

function setSelectedGroups(groupsOrNull) {
  saveLS(LS.selectedGroups, groupsOrNull);
}

function getMode() {
  return loadLS(LS.mode, "image_name");
}

function getShuffle() {
  return loadLS(LS.shuffle, true);
}

function applyFilters() {
  const selected = getSelectedGroups(); // null or array
  const mode = ui.modeSelect.value;
  const forgottenMap = getForgottenMap();

  let filtered = allCards.filter(c => c.name);

  if (selected && Array.isArray(selected) && selected.length > 0) {
    filtered = filtered.filter(c => c.groups.some(g => selected.includes(g)));
  }

  if (mode === "forgotten") {
    filtered = filtered.filter(c => forgottenMap[c.name]);
  }

  const doShuffle = ui.shuffleToggle.checked;
  activeCards = doShuffle ? shuffleInPlace(filtered.slice()) : filtered.slice();
  currentIndex = 0;

  ui.smallStatus.textContent =
    activeCards.length > 0
      ? `Ready. ${activeCards.length} cards in the current selection.`
      : `No cards match your current filters.`;

  showCard();
}

function setImage(url) {
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

function showCard() {
  if (activeCards.length === 0) {
    ui.counter.textContent = "—";
    ui.cardName.textContent = "—";
    ui.cardInfo.textContent = "";
    ui.cardGroups.textContent = "";
    setImage("");
    return;
  }

  const c = activeCards[currentIndex % activeCards.length];

  ui.counter.textContent = `${(currentIndex % activeCards.length) + 1} / ${activeCards.length}`;

  revealed = (ui.modeSelect.value !== "image_only");
  renderReveal(c);

  ui.cardInfo.textContent = c.info || "";
  ui.cardGroups.textContent = c.groups.length ? `Groups: ${c.groups.join(", ")}` : "";
  setImage(c.image || "");
}

function renderReveal(card) {
  if (ui.modeSelect.value === "image_only") {
    ui.btnReveal.style.display = "inline-block";
    ui.cardName.textContent = revealed ? (card.name || "—") : "???";
  } else {
    ui.btnReveal.style.display = "none";
    ui.cardName.textContent = card.name || "—";
  }
}

function nextCard() {
  if (activeCards.length === 0) return;
  currentIndex = (currentIndex + 1) % activeCards.length;
  showCard();
}

function markKnown(known) {
  if (activeCards.length === 0) return;
  const c = activeCards[currentIndex % activeCards.length];
  // Mirror your Streamlit idea: "didn't know" => add to forgotten; "knew it" => remove
  setForgotten(c.name, !known);
  nextCard();
}

function renderGroupsUI() {
  const groups = uniqueGroups(allCards);
  ui.groupsList.innerHTML = "";

  const selected = getSelectedGroups(); // null or array
  const selectedSet = new Set(selected || groups); // if null => all selected

  for (const g of groups) {
    const id = `g_${btoa(unescape(encodeURIComponent(g))).replace(/=+$/,"")}`;
    const wrap = document.createElement("label");
    wrap.className = "groupItem";
    wrap.setAttribute("for", id);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.checked = selectedSet.has(g);

    cb.addEventListener("change", () => {
      const currentGroups = uniqueGroups(allCards);
      const checked = [];
      for (const gg of currentGroups) {
        const cbId = `g_${btoa(unescape(encodeURIComponent(gg))).replace(/=+$/,"")}`;
        const node = document.getElementById(cbId);
        if (node && node.checked) checked.push(gg);
      }
      // store null if "all selected" to keep URL reuse simple
      if (checked.length === currentGroups.length) setSelectedGroups(null);
      else setSelectedGroups(checked);
      applyFilters();
    });

    const span = document.createElement("span");
    span.textContent = g;

    wrap.appendChild(cb);
    wrap.appendChild(span);
    ui.groupsList.appendChild(wrap);
  }
}

async function fetchSheet(url) {
  setStatus("Loading…");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text;
}

function buildCardsFromText(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimited(text, delimiter).filter(r => r.some(cell => String(cell).trim().length > 0));
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim());
  const dataRows = rows.slice(1);

  const cards = dataRows
    .map(r => mapRow(headers, r))
    .map(canonicalizeCard)
    .filter(c => c.name); // require a name

  return cards;
}

function setCsvUrl(url) {
  ui.csvUrlInput.value = url || "";
  saveLS(LS.csvUrl, url || "");
}

function getCsvUrl() {
  // priority: query param > localStorage > input
  const qp = getQueryParam("csv");
  if (qp) return qp;
  const saved = loadLS(LS.csvUrl, "");
  return saved || "";
}

function copyShareLink() {
  const url = ui.csvUrlInput.value.trim();
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

// --- Swipe support (mobile) ---
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

  // require mostly horizontal gesture
  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;

  if (dx > 0) markKnown(true);   // swipe right => knew it
  else markKnown(false);         // swipe left => didn't know
}

// --- Event wiring ---
ui.btnLoad.addEventListener("click", async () => {
  const url = ui.csvUrlInput.value.trim();
  if (!url) {
    setStatus("Please paste a public CSV/TSV URL.");
    return;
  }
  setCsvUrl(url);

  try {
    const text = await fetchSheet(url);
    const cards = buildCardsFromText(text);

    allCards = cards;
    renderGroupsUI();
    applyFilters();

    setStatus(`Loaded ${allCards.length} cards.`);
  } catch (err) {
    console.error(err);
    setStatus(`Failed to load. ${String(err.message || err)}`);
  }
});

ui.btnCopyLink.addEventListener("click", copyShareLink);

ui.modeSelect.addEventListener("change", () => {
  saveLS(LS.mode, ui.modeSelect.value);
  applyFilters();
});

ui.shuffleToggle.addEventListener("change", () => {
  saveLS(LS.shuffle, ui.shuffleToggle.checked);
  applyFilters();
});

ui.btnAllGroups.addEventListener("click", () => {
  setSelectedGroups(null); // null = all
  renderGroupsUI();
  applyFilters();
});

ui.btnNoneGroups.addEventListener("click", () => {
  setSelectedGroups([]); // empty selection
  renderGroupsUI();
  applyFilters();
});

ui.btnReveal.addEventListener("click", () => {
  if (activeCards.length === 0) return;
  revealed = true;
  const c = activeCards[currentIndex % activeCards.length];
  renderReveal(c);
});

ui.btnYes.addEventListener("click", () => markKnown(true));
ui.btnNo.addEventListener("click", () => markKnown(false));
ui.btnNext.addEventListener("click", nextCard);

ui.btnReset.addEventListener("click", () => {
  localStorage.removeItem(LS.forgotten);
  setStatus("Progress reset on this device.");
  applyFilters();
  setTimeout(() => setStatus(""), 1500);
});

// attach swipe listeners to card
ui.card.addEventListener("touchstart", onTouchStart, { passive: true });
ui.card.addEventListener("touchend", onTouchEnd, { passive: true });

// --- Init ---
(function init() {
  // restore UI settings
  ui.modeSelect.value = getMode();
  ui.shuffleToggle.checked = getShuffle();

  const initialUrl = getCsvUrl();
  if (initialUrl) {
    ui.csvUrlInput.value = initialUrl;
    // auto-load if provided in query param
    // (still respects GitHub Pages static hosting)
    ui.btnLoad.click();
  } else {
    ui.smallStatus.textContent = "Paste a public CSV/TSV URL to begin.";
  }
})();

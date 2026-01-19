# 🧠 Sidebrain Helper

A lightweight, static **authoring companion** for the Sidebrain flashcard app.
The Helper makes it easy to **create, validate, and submit entries** to a Google Spreadsheet (via Google Forms), with strong support for hierarchical groups, images, and duplicate detection.

Designed to run entirely on **GitHub Pages** — no backend, no authentication headaches.

---

## ✨ What the Helper Does

* 🧩 **Create flashcard entries** (NAME, GROUPS, IMAGE, INFO)
* 🌳 **Pick hierarchical groups** from an existing CSV database
* 🔍 **Detect existing entries** while typing (avoid duplicates)
* 🖼️ **Paste or drag & drop images** (auto-resized, stored as data URLs)
* 🔗 **Prefill and open a Google Form** for frictionless submission
* 📋 **Generate TSV rows** for manual copy-paste into Google Sheets
* 🔖 **Deep-link directly to “Add entry”** for fast data entry
* 📱 Works great on **mobile (Android home-screen shortcut)**

---

## 🧱 Data Model (CSV / Spreadsheet)

The helper assumes a spreadsheet (or CSV export) with **no headers**, using this fixed column order:

| Column | Meaning                                           |
| ------ | ------------------------------------------------- |
| 1      | `NAME` (e.g. `Max Mustermann`)                    |
| 2      | `GROUPS` (space-separated, hierarchical with `:`) |
| 3      | `IMAGE` (URL, data-URL, or `[TEXT]`)              |
| 4      | `INFO` (free text, Markdown links allowed)        |

### Example row (TSV)

```
Name	ART:Performance PROJ:test	[?]	Just an example
```

---

## 🌳 Groups & Hierarchies

Groups are:

* **Space-separated**
* **Hierarchical**, using `:` as a separator

Example:

```
music:instr:piano UNI:UniVie:wisskomm
```

The Helper:

* Parses existing groups from the CSV
* Builds a **tree UI**
* Lets you select at any depth
* Automatically keeps the GROUPS field in sync

---

## 🖼️ Images

The IMAGE field supports:

### 1. URLs

* Direct image URLs (`.jpg`, `.png`, etc.)

### 2. Text placeholders

* Any string in brackets, e.g. `[?]`, `[Composer]`
* Useful for entries without images yet
* Easy to find later by filtering the sheet

### 3. Paste / Drag & Drop (recommended)

* Copy an image (e.g. from Google Images)
* Paste (`⌘V / Ctrl+V`) or drag into the helper
* The image is:

  * resized (~512px width)
  * converted to a data URL
  * inserted automatically into the IMAGE field

> ⚠️ Data URLs increase spreadsheet size. Fine for small/medium databases.

---

## 🔍 Duplicate Detection

As you type **Vorname / Nachname**, the helper:

* Searches existing CSV entries
* Shows matching names
* Lets you **click an existing entry** to load it back into the form

This helps:

* avoid duplicates
* maintain consistent spelling
* update existing entries safely

---

## 📝 Writing to Google Sheets (via Google Forms)

The Helper integrates with **Google Forms** for frictionless writing.

### Why Forms?

* No authentication handling
* No backend
* Google manages permissions & storage
* Submissions go straight into your spreadsheet

### How it works

* You provide the **public Form URL** (`/viewform`)
* The helper builds a **prefilled form URL**
* Clicking **“Open Google Form (prefilled)”** opens the form in a new tab
* You review → click **Submit**

### Supported fields

The helper is configured for forms with:

* **Vorname**
* **Nachname**
* **Groups**
* **Info**
* **Image**

(Internally mapped via `entry.XXXXXX` IDs.)

---

## 🔗 URL Parameters (Deep Linking)

The Helper can be fully configured via URL parameters:

| Parameter    | Description                          |
| ------------ | ------------------------------------ |
| `sheet`      | Public CSV URL (`output=csv`)        |
| `form`       | Public Google Form URL (`/viewform`) |
| `database`   | Optional label (e.g. `ART`)          |
| `#add-entry` | Scrolls directly to the entry form   |

### Example

```
helper.html
  ?sheet=ENCODED_CSV_URL
  &form=ENCODED_FORM_URL
  &database=ART
  #add-entry
```

Perfect for:

* bookmarks
* Android home-screen shortcuts
* quick data-entry sessions

---

## 📱 Mobile Use (Android)

The Helper works very well on mobile.

To add it to your home screen:

1. Open the helper URL in **Chrome**
2. Tap the address bar
3. Tap **⋮ → Add to Home screen**

You’ll get an app-like icon that opens directly to **Add entry**.

---

## 🧠 Philosophy

The Sidebrain Helper is intentionally:

* **Stateless** (aside from browser storage)
* **Transparent** (you always see what’s being written)
* **Non-magical** (Google Forms does the actual writing)
* **Composable** (works with any spreadsheet following the schema)

It’s an **authoring tool**, not a database — and that’s a feature.

---

## 🛠️ Tech Stack

* Plain HTML / CSS / JavaScript
* Runs on GitHub Pages
* Uses:

  * `fetch()` for CSV
  * Google Forms prefill URLs
  * Browser Clipboard & Drag-and-Drop APIs

No build step, no dependencies.

---

## 📄 License / Use

Use, fork, adapt freely for:

* teaching
* artistic research
* personal knowledge systems
* small collaborative databases

Attribution appreciated but not required.
# sidebrain-app (static / GitHub Pages)

A lightweight flashcard web app that **loads cards from a public CSV/TSV URL** (e.g. Google Sheets “Publish to web” export).
No server required — runs fully in the browser and works great on mobile.

## Features

- Load flashcards from a **public URL** (CSV or TSV)
- Filter by **groups** (multi-select)
- Modes:
  - **Image + name**
  - **Image only** (tap **Reveal** to show name)
  - **Forgotten only**
- Mobile-friendly: big buttons + **swipe gestures**
  - Swipe right = ✅ knew it
  - Swipe left = ❌ didn’t know
- Progress is stored locally using **localStorage** (per device)

## Data format

Your sheet should have headers like:

- `name` (required)
- `group` (optional; can contain multiple groups separated by comma/semicolon/pipe)
- `image` (optional; URL to an image)
- `info` (optional; extra text)

Header names are flexible: the app also accepts common alternatives (`Name`, `groups`, `photo`, `image_url`, `notes`, etc.).

## Using Google Sheets

1. In Google Sheets: **File → Share → Publish to web**
2. Choose the relevant sheet and export as **CSV**.
3. Copy the generated URL (often ends with `output=csv`).

## Running locally

Just open `index.html` in a browser.
For best results (fetch + caching), use a small local server, e.g.:

- Python:
  - `python -m http.server 8000`
  - open `http://localhost:8000`

## GitHub Pages deployment

1. Create a repo and push these files.
2. On GitHub: **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / folder: `/root`
5. Save — your site will be served at your GitHub Pages URL.

## Shareable URL parameter

You can open the app with a sheet URL:

`https://YOURNAME.github.io/YOURREPO/?csv=PASTE_URL_HERE`

Tip: Use the **Copy link** button inside the app to generate a shareable link.

## Notes on privacy

- Card data is fetched from the public sheet URL at runtime.
- The repository contains only the app code.
- “Forgotten” progress is stored only on the current device (localStorage).

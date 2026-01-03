# 🧠 Sidebrain

**Sidebrain** is a lightweight, server-less flashcard web app that loads all content dynamically from a **public CSV/TSV URL** (for example a Google Sheets “Publish to web” export).

It is designed for **learning, memorization, and practice**, works beautifully on **mobile**, and can be installed as a **homescreen app**.  
No backend, no accounts, no data stored in the repository.

---

## ✨ Key Features

### 📄 Data-driven
- Load flashcards from a **public CSV or TSV URL**
- Ideal for Google Sheets, LibreOffice, Excel exports
- All content lives in the spreadsheet, not in the repo

### 🗂 Hierarchical groups
- Groups are **space-separated tokens**
- Use `:` to express hierarchy:

```

music
music:instr
music:instr:piano
uni:univie:wisskomm

````

- Groups are shown as a **collapsible tree**
- Selecting a parent group automatically includes all subgroups
- Tree open/closed state is **remembered locally**

### 🔁 Practice mode with shrinking set
- When you mark a card as **known**, it is **removed from the current set**
- You cycle through a **shrinking pool** until all cards are known
- When finished, a **reset button** appears to start again

### 🖼 Image *or* text cards
- The image column can contain:
- a normal image URL
- **or text wrapped in brackets**

  ```
  [Piano]
  [Remember: Pöppel 1997]
  ```

- Bracketed text is rendered as a **large, centered card face**
- Font size auto-adapts to fit the available space

### 📝 Rich info text
- The info field supports **simple Markdown links**:

  ```
  violin [piece](https://open.spotify.com/track/...)
  ```

- Links are safe (HTML-escaped) and mobile-friendly

### ▶️ In-app previews (no leaving the app)
- Clicking a link opens a **modal preview overlay**
- Supported previews:
- **YouTube** → embedded video
- **Spotify** → embedded Spotify player
- Other links open in a new tab
- Playback stops automatically when closing the modal

### 📱 Mobile-first interaction
- Swipe gestures:
- **Swipe right** → ✅ known
- **Swipe left** → ❌ not known
- Large buttons for accessibility
- Designed for one-handed use

### 📊 Stats & streaks
- Session stats:
- known / unknown
- current streak
- Overall stats:
- total known / unknown
- best streak
- Stored locally per device (localStorage)

### 💾 Privacy-friendly
- No accounts
- No tracking
- No server
- Progress is stored **only on your device**

---

## 📑 Spreadsheet format

**Important:**  
The spreadsheet has **no headers**.

Each row must contain **exactly four columns**, in this order:

1. **Name** (required)
2. **Groups** (space-separated; `:` for hierarchy)
3. **Image URL or `[Text]`**
4. **Info text** (supports Markdown links)

### Example row

```
Ernst 	MUSIC:Lieder	[Last rose of summer]	"violin [piece](https://open.spotify.com/track/1WJLS6QFqosNjYcgjwCU27?si=7dca228749ae4a60), together with the Erlkönig"
"Aron Copland"	MUSIC:1960s	"https://upload.wikimedia.org/wikipedia/commons/5/5f/Greatvalley-map.png"	"3rd Symphony"
```

---

## 📊 Using Google Sheets

1. Create your sheet
2. **File → Share → Publish to web**
3. Select the sheet
4. Export as **CSV**
5. Copy the public URL (usually ends with `output=csv`)

Paste this URL into Sidebrain or use it directly via a share link.

---

## 🔗 Shareable links

You can open Sidebrain with a sheet URL pre-loaded:

```

[https://YOURNAME.github.io/YOURREPO/?csv=PASTE_CSV_URL_HERE](https://YOURNAME.github.io/YOURREPO/?csv=PASTE_CSV_URL_HERE)

```

There is also a **“Copy link”** button in the UI to generate this automatically.

---

## 🌍 GitHub Pages deployment

1. Create a GitHub repository
2. Add:
   - `index.html`
   - `app.js`
   - `style.css`
   - `manifest.json`
   - `Sidebrain.png`
3. Commit and push
4. On GitHub:
   - **Settings → Pages**
   - Source: *Deploy from a branch*
   - Branch: `main`
   - Folder: `/root`
5. Your app will be live at:

```

[https://YOURNAME.github.io/YOURREPO/](https://YOURNAME.github.io/YOURREPO/)

```

---

## 📱 Install as an app (PWA)

Sidebrain can be installed like a native app:

### iOS
1. Open in **Safari**
2. Share → **Add to Home Screen**
3. Launch from the 🧠 icon

### Android
- Chrome will suggest **Install app**
- Or use *Add to Home Screen* from the menu

The app opens fullscreen and remembers all settings.

---

## 🧠 Design philosophy

Sidebrain is built around:

- minimal UI
- fast iteration
- spreadsheet-as-database
- learning through repetition
- staying *inside* the learning flow

It is intentionally simple, hackable, and portable.

---

## 🛠 CREDITS

THis online App was developed by [Adrián Artacho](https://www.artacho.at/).
Enjoy — and feel free to fork, adapt, or repurpose Sidebrain for any learning context.

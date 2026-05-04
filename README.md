# DBSC Navigator

A mobile-first offline web app for **Dún Laoghaire Sailing Club** racing — course chart, leg list, start timer, race finder and documents, all in one place and fully usable without an internet connection.

Live at **https://moodbody.github.io/dbsc-course/**

---

## What it does

| Tab | What you get |
|-----|-------------|
| **Course** | Pick course card, wind direction and course number → instant chart, leg list with bearings & distances, tide arrows and a Race Overview "Now" panel that tracks your progress mark by mark. Optional live GPS and compass. |
| **Start** | Countdown timer for the RRS starting sequence. Shows all four signals (Warning → Preparatory → 1-minute → Gun). Adjust to the minute, sync to a whole minute, or let it run to zero — at the gun it automatically switches to the Course tab and opens the Race Overview ready to race. |
| **Race Finder** | Pick any Tuesday, Thursday or Saturday in the 2026 season and your class. Returns the course card, VHF channel, class flag and your warning signal time. One tap to open that course card. |
| **Docs** | DBSC Sailing Instructions, Notice of Race, mark charts and course cards. Cached for offline reading after the first view. |

---

## Features at a glance

- **All five DBSC course cards** (CC1–CC5) for the 2026 season.
- Each leg shows bearing (true), distance (NM), and port/starboard rounding.
- Tap any leg to jump straight to it and highlight it on the chart.
- **Chart** with Dublin Bay coastline, all race marks, course path and live tide stream arrows.
- **Race Overview** panel — current leg, next mark, rounding direction, bearing and distance. Tap **✓ Mark rounded** as you pass each mark; **↶ Undo** if you tap too soon.
- **GPS** (optional) — shows your live position on the chart and gives bearing/distance from your boat to the next mark. Auto-off after 30 minutes to save battery.
- **Compass** (mobile) — overlays your heading on the chart.
- **Start sequence timer** — countdown from 5 minutes (or any number of whole minutes), fires the gun at zero and starts an elapsed race clock.
- **Race Finder** — looks up any 2026 race by date and class.
- **Light and dark themes** — defaults to light; respects the system setting; user toggle saved.
- **Two-column landscape layout** — Course and Start tabs use the full screen width in landscape on phones and tablets.
- **Customisable layout** — the gear ⚙ icon lets you reorder and move panels between columns.
- **Full help guide** — tap the **?** button at any time for step-by-step instructions written for all levels of user.
- **Installable as an app** (PWA) on iPhone, iPad and Android — works fully offline once installed.

---

## Files

```
Course_information/          <- original DBSC PDFs (input only)
parse_data.py                <- extracts data from the PDFs
make_icons.py                <- generates app icon PNGs
data.json                    <- parsed data (for inspection)
docs/
  index.html                 <- the app shell
  styles.css                 <- all styles
  app.js                     <- all application logic
  data.js                    <- embedded boot data (window.DBSC_DATA)
  data.json                  <- async data fetch
  schedule.json              <- race calendar and class schedules
  tides.json                 <- tide stream data for chart arrows
  manifest.webmanifest       <- PWA manifest
  sw.js                      <- service worker (offline cache)
  icons/                     <- app icons (various sizes)
README.md
```

---

## Updating the data

### A · Quick edit on github.com (no Python needed)

`docs/data.json` and `docs/schedule.json` are fetched network-first, so any commit goes live within ~30 seconds without touching the service worker.

1. On github.com open the repo -> `docs/` -> the file you want.
2. Click the pencil icon (top right).
3. Edit the JSON. Common changes:
   - **Move a mark**: `"marks"` block -> find the mark letter -> change `lat` / `lon`.
   - **Fix a bearing or distance**: `"bearings"` / `"distances"` -> find the *from* mark, then the *to* mark entry.
   - **Tweak a course**: `"cards" -> "CC1" -> "wind" -> "A" -> "courses" -> "1"` -> each entry is `{ "mark": "E", "side": "p" }` (`p` = port, `s` = starboard).
4. **Commit directly to main**. Pages rebuilds in ~30 s.

### A2 · Editing the race schedule (`docs/schedule.json`)

- **Add/remove a regatta Saturday**: under `"calendar" -> "sat"` change `hut` for that date to `"regatta"` (no DBSC racing) or `"none"`.
- **Change a boat's start time or flag**: edit `flag` and `warn` under `"boats" -> <boat> -> "tue" / "thu" / "sat"`.
- **Move a class between Thursday fleets**: change `"thu" -> "fleet"` between `"blue"` and `"red"`.

### B · Regenerate from new DBSC PDFs (full season update)

1. Drop new PDFs into `Course_information/` (keep the same filenames: `CC1_...`, `CC2_...`, etc.).
2. Run the parser:

   ```powershell
   "c:\Users\maxgo\Desktop\DBSC Courses\.venv\Scripts\python.exe" parse_data.py
   ```

   This rewrites `data.json`, `docs/data.json` and `docs/data.js`.

3. Bump `CACHE_VERSION` in `docs/sw.js` (e.g. `"dbsc-v36"` -> `"dbsc-v37"`). This forces already-installed devices to download the new app shell.

4. Commit and push:

   ```powershell
   cd "c:\Users\maxgo\Desktop\DBSC Courses"
   git add -A
   git commit -m "2027 season cards"
   git push
   ```

---

## Installing on phones

The app is a **Progressive Web App (PWA)**. Anyone with the URL can install it to their home screen — no App Store, no accounts.

### iPhone / iPad (Safari only)

1. Open the URL in **Safari**.
2. Tap the **Share** icon -> **Add to Home Screen** -> **Add**.
3. The app icon appears on your home screen and opens full-screen, offline.

### Android (Chrome / Edge / Samsung Internet)

1. Open the URL.
2. Tap **Install** in the app banner, or open the browser menu -> **Install app**.
3. The app icon appears in your launcher.

> **Tip:** generate a QR code from the URL and keep it in the boat — anyone can scan and install in about 15 seconds.

---

## Sharing with others

Send them the URL (text, WhatsApp, email, QR code). Each person follows the install steps above on their own device. No accounts, no app stores, no cost.

---

## Local development

To run locally (required for GPS testing):

```powershell
cd "c:\Users\maxgo\Desktop\DBSC Courses\docs"
python -m http.server 8000
# Open: http://localhost:8000
```

GPS works over plain HTTP only on `localhost`. To test GPS from a phone on your LAN, use the live GitHub Pages URL instead.

---

## Notes

- **Bearings** are all **true** (no magnetic variation). Distances are in **nautical miles**.
- **Mark 3** (Green / West Pier hut start) is not in the DBSC bearings table. Bearings *from* mark 3 are computed as the reciprocal of *to* mark 3. Its GPS position is taken as the same as mark **O** (Orange start) -- accurate within the start area.
- **Mark 2** (Black start) is not in the source data; it appears in the app if used in a course but without bearing/distance.
- The chart uses a simple equirectangular projection over Dublin Bay -- accurate to well within a boat-length at this scale.

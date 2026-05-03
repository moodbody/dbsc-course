# DBSC Race Course

A small offline web app to help with sailing races at Dún Laoghaire (DBSC).
Pick the **course card** (CC1–CC5), the **wind direction letter** and the
**course number**, and the app shows the full sequence of marks to round
along with the bearing, distance and a mini chart for each leg. Tap
**“Mark rounded”** as you round each mark and the app focuses on the next
one. Optionally enable **GPS** to get a live bearing, distance and a
moving dot on the chart.

## Features

- Selects from all five DBSC course cards (CC1–CC5) for 2026.
- For each leg shows the chart bearing (true) and distance (NM) from the
  official DBSC table, plus a port/starboard rounding indicator.
- Tap any leg in the list to jump to that mark.
- Mini chart of the marks and the course path with start, current target
  and finish highlighted.
- Optional GPS for live bearing/distance and a moving dot on the chart.
- **Installable as an app** on iPhone, iPad and Android (PWA).
- Fully **offline** once installed.

## Files

```
Course_information/                  ← original DBSC PDFs (input)
parse_data.py                        ← extracts data from the PDFs
make_icons.py                        ← generates the app icon PNGs
data.json                            ← parsed data (for inspection)
docs/
  index.html                         ← the app
  styles.css
  app.js
  data.js                            ← embedded data: window.DBSC_DATA
  manifest.webmanifest               ← PWA manifest
  sw.js                              ← service worker (offline cache)
  icons/                             ← app icons
README.md
```

## Updating the data

There are **two ways** to change what the app shows. Use whichever
matches the size of the change.

### A · Quick edit on github.com (no Python, no laptop)

The app fetches `docs/data.json` live on every online launch, so any
change you commit to that file is picked up automatically.

1. On github.com open the repo → `docs/` → **`data.json`**.
2. Click the ✏️ pencil icon (top right of the file view).
3. Edit the JSON. Some examples:
   - **Move a mark**: find the `"marks"` block, locate (e.g.) `"M"`,
     change its `lat` / `lon`.
   - **Fix a bearing or distance**: under `"bearings"` (or
     `"distances"`), find the row for the *from* mark, then the entry
     for the *to* mark, and update the number.
   - **Tweak a course**: under `"cards" → "CC1" → "wind" → "A" →
     "courses" → "1"` you'll find the list of marks. Each entry is
     `{ "mark": "E", "side": "p" }` (`p` = port, `s` = starboard).
4. Click **Commit changes**, write a short message, **Commit directly
   to the main branch**.
5. Within ~30 s GitHub Pages redeploys. Next time anyone opens the app
   online they'll see the new data; offline-cached devices still
   work and will pick up the change on their next online launch.

> No need to bump the service-worker version for `data.json` edits —
> the SW is configured to fetch it network-first.

### A2 · Editing the schedule (`docs/schedule.json`)

The **Today** tab uses `docs/schedule.json` to recommend the right
course card for a given date and boat. It's also fetched
network-first, so github.com pencil edits go live within ~30 s.

Common edits:

- **Add/remove a regatta or coastal Saturday**: under
  `"calendar" → "sat"`, change the `hut` field of that date to
  `"regatta"` (no DBSC racing) or `"none"` (everyone CV).
- **Change a boat's start time / flag**: edit the `flag` and `warn`
  fields under `"boats" → <boat> → "tue" / "thu" / "sat"`.
- **Move a class between blue/red Thursday fleets**: change
  `"thu" → "fleet"` between `"blue"` and `"red"`.

The lookup logic is:

| Day | Resolution                                                                 |
| --- | -------------------------------------------------------------------------- |
| Tue | Everyone → `tue_hut` (CC5)                                                 |
| Thu | `boat.thu.fleet === "red"` → `thu_red_freebird` (CC4); else `thu_blue_corinthian` (CC3) |
| Sat | Combine `boat.sat.group` with that Saturday's `hut` colour. `alwaysHut` → CC2; `alwaysCorinthian`/`satGreen` → CC1; `satBlue` is at the hut on blue weeks; `satRed` is at the hut on red weeks; everyone else falls back to CC1. |

### B · Regenerate from new DBSC PDFs (full season update)

If DBSC publishes new course-card PDFs:

1. Drop the new files into `Course_information/` keeping the same
   filenames (`CC1_…`, `CC2_…`, etc.).
2. Run:

   ```powershell
   "c:\Users\maxgo\Desktop\DBSC Courses\.venv\Scripts\python.exe" parse_data.py
   ```

   This rewrites `data.json`, `docs/data.json` and `docs/data.js`.
3. Bump `CACHE_VERSION` in `docs/sw.js` (e.g. `dbsc-v2` → `dbsc-v3`).
   This is what tells already-installed phones to refresh the app
   shell, not just the data.
4. Commit & push:

   ```powershell
   cd "c:\Users\maxgo\Desktop\DBSC Courses"
   git add -A
   git commit -m "2027 season cards"
   git push
   ```

---

# Getting it onto your phone (and others' phones)

The app is a **Progressive Web App (PWA)**. That means: you host the
`docs/` folder on the public web, you visit the URL once on a phone, you
tap **Add to Home Screen**, and from then on it behaves like a native
app — full screen, with an icon, working offline.

You do **not** need an Apple Developer account, the App Store, or
Google Play. You just need a URL to share.

## Step 1 — Pick a host

Any of these works. They are all free for a single small site like
this.

### Option A · Netlify Drop (easiest, ~2 minutes)

1. Go to <https://app.netlify.com/drop>.
2. Drag the **`docs/` folder** (the whole folder) onto the page.
3. Netlify gives you a URL like `https://amazing-cliff-1234.netlify.app`.
   Click *Site settings* if you'd like to rename it.
4. That's your shareable link. Done.

To update later (new PDFs, etc.), run `parse_data.py`, bump the SW
version, then drag the folder onto Netlify Drop again.

### Option B · GitHub Pages (free, version-controlled)

1. Create a new GitHub repo, push the contents of the `docs/` folder.
2. Repo *Settings → Pages → Build from branch*; choose `main` and
   either `/ (root)` or `/app`.
3. Wait ~30 seconds; the URL will appear, e.g.
   `https://yourname.github.io/dbsc-course/`.

### Option C · Cloudflare Pages, Vercel, Firebase Hosting

All also free; pick whichever you like. Point them at the `docs/`
folder and they'll serve it as a static site over HTTPS.

> The host **must** serve over HTTPS. Geolocation, service workers and
> Add-to-Home-Screen will not work over plain HTTP (except on
> `localhost`). All the options above are HTTPS by default.

## Step 2 — Install on a phone

Once you have a URL like `https://your-site.netlify.app`:

### iPhone / iPad (Safari)

1. Open the URL in **Safari** (not Chrome — iOS only allows Safari to
   install PWAs).
2. Tap the **Share** icon (square with arrow up).
3. Scroll down → **Add to Home Screen**.
4. Confirm. You now have a "DBSC Course" icon on your home screen that
   opens fullscreen, no Safari toolbar.

### Android (Chrome / Edge / Samsung Internet)

1. Open the URL.
2. You'll see an **Install** button at the top of the app, *or* the
   browser will offer "Install app" in its menu.
3. Tap it. The app appears in your launcher.

## Step 3 — Share with friends

Just send them the URL (text, WhatsApp, email, QR code, whatever).
They follow the same Step 2 on their own phone. **No accounts, no app
stores, no install fees.** Each phone caches its own offline copy.

> Tip: paste the URL into a QR-code generator and print the QR on a
> small card you keep in the boat — anyone can scan and install in
> ~15 seconds.

---

## Local development / testing

For development with GPS you need a non-`file://` origin. The simplest:

```powershell
cd "c:\Users\maxgo\Desktop\DBSC Courses\app"
python -m http.server 8000
# laptop:  http://localhost:8000
# phone on same Wi-Fi:  http://<laptop-ip>:8000
```

> GPS over `http://` only works on `localhost`. To test GPS from a
> phone over your LAN, install via the public URL (Step 1).

## Notes / caveats

- Mark **3** (Green start at the West Pier hut) is not listed as a row
  in the DBSC bearings table. Bearings *from* mark 3 are computed as
  the reciprocal of *to* 3. Its position is taken to be the same as
  mark **O** (Orange start) for GPS calculations — fine within the
  start area.
- Mark **2** (Black start) is not in the source data; if it ever
  appears in a course it is shown but without bearing/distance.
- Bearings from the DBSC PDF are integers and **true** (no magnetic
  variation applied).
- The mini chart is a simple equirectangular projection over a small
  area (Dublin Bay), which is accurate to a fraction of a metre at
  this scale.

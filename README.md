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
app/
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

If DBSC publishes new PDFs (e.g. for next season), drop the new files into
`Course_information/` (keeping the same filenames) and run:

```powershell
"c:\Users\maxgo\Desktop\DBSC Courses\.venv\Scripts\python.exe" parse_data.py
```

This regenerates `data.json` and `app/data.js`. Then bump
`CACHE_VERSION` in `app/sw.js` (e.g. `dbsc-v2`) so already-installed
phones fetch the new bundle on next launch. No other code changes
needed.

---

# Getting it onto your phone (and others' phones)

The app is a **Progressive Web App (PWA)**. That means: you host the
`app/` folder on the public web, you visit the URL once on a phone, you
tap **Add to Home Screen**, and from then on it behaves like a native
app — full screen, with an icon, working offline.

You do **not** need an Apple Developer account, the App Store, or
Google Play. You just need a URL to share.

## Step 1 — Pick a host

Any of these works. They are all free for a single small site like
this.

### Option A · Netlify Drop (easiest, ~2 minutes)

1. Go to <https://app.netlify.com/drop>.
2. Drag the **`app/` folder** (the whole folder) onto the page.
3. Netlify gives you a URL like `https://amazing-cliff-1234.netlify.app`.
   Click *Site settings* if you'd like to rename it.
4. That's your shareable link. Done.

To update later (new PDFs, etc.), run `parse_data.py`, bump the SW
version, then drag the folder onto Netlify Drop again.

### Option B · GitHub Pages (free, version-controlled)

1. Create a new GitHub repo, push the contents of the `app/` folder.
2. Repo *Settings → Pages → Build from branch*; choose `main` and
   either `/ (root)` or `/app`.
3. Wait ~30 seconds; the URL will appear, e.g.
   `https://yourname.github.io/dbsc-course/`.

### Option C · Cloudflare Pages, Vercel, Firebase Hosting

All also free; pick whichever you like. Point them at the `app/`
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

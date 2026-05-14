/* DBSC Race Course – app logic
 * Selection: card -> wind -> course
 * Navigation: marks list with bearing/distance per leg + a "current leg" focus
 * GPS (optional): live bearing & distance from current position to next mark
 *
 * Data loading order at startup:
 *   1. window.DBSC_DATA from data.js (loaded synchronously) -> instant boot.
 *   2. Async fetch data.json with cache-busting -> live updates pulled
 *      from GitHub on every online launch, no Python/SW-version-bump needed
 *      for simple data tweaks.
 */

let MARKS, BEARINGS, DISTS, CARDS;

function applyData(d) {
    if (!d) return false;
    MARKS = d.marks;
    BEARINGS = d.bearings;
    DISTS = d.distances;
    CARDS = d.cards;
    return true;
}
applyData(window.DBSC_DATA);

// ---------- Coastline (approx) ----------
// Hand-traced shoreline of Dublin Bay — Howth Head south to Bray Head —
// running roughly N -> S along the western shore of the bay. Used to
// shade land on the chart. Polygons are closed by going far inland
// (lon -6.30) so anything west of the shore is filled as land.
// Coordinates are eyeballed from OSM / Admiralty 1415 (~50–100 m). Good
// enough for at-a-glance racing context, NOT for navigation.
const DUBLIN_BAY_COAST = [
    // ----- Howth peninsula (clockwise from NE) -----
    { lat: 53.395, lon: -6.057 },   // Howth Head N (Nose of Howth)
    { lat: 53.388, lon: -6.046 },   // Bailey Lighthouse promontory
    { lat: 53.382, lon: -6.052 },   // Drumleck Point
    { lat: 53.378, lon: -6.061 },   // Howth Head S
    { lat: 53.376, lon: -6.071 },   // Doldrum Bay
    { lat: 53.374, lon: -6.080 },   // Red Rock
    { lat: 53.371, lon: -6.092 },   // Sutton SE
    { lat: 53.371, lon: -6.105 },   // Sutton Cross
    // ----- Mainland north shore: Sutton -> Clontarf (inside of Bull) -----
    { lat: 53.376, lon: -6.121 },   // Sutton Strand inner
    { lat: 53.378, lon: -6.137 },   // Kilbarrack
    { lat: 53.376, lon: -6.158 },   // Raheny shore
    { lat: 53.371, lon: -6.176 },   // St Anne's Park shore
    { lat: 53.366, lon: -6.190 },   // Clontarf Wooden Bridge
    { lat: 53.361, lon: -6.205 },   // Clontarf seafront
    { lat: 53.357, lon: -6.218 },   // Fairview Park
    { lat: 53.350, lon: -6.230 },   // East Wall / Tolka mouth
    // ----- Liffey: North Wall -> mouth -> South Wall (Poolbeg) -----
    { lat: 53.348, lon: -6.230 },   // North Wall quay
    { lat: 53.347, lon: -6.220 },
    { lat: 53.347, lon: -6.205 },
    { lat: 53.347, lon: -6.187 },   // North Bull Lighthouse / channel N
    { lat: 53.343, lon: -6.187 },   // Poolbeg Lighthouse (S Wall tip)
    { lat: 53.341, lon: -6.205 },   // Great South Wall middle
    { lat: 53.340, lon: -6.219 },   // Pigeon House / chimneys
    { lat: 53.341, lon: -6.230 },   // S Wall root / Ringsend
    // ----- Sandymount -> Booterstown -> Blackrock -> Seapoint -----
    { lat: 53.335, lon: -6.225 },   // Sean Moore Park
    { lat: 53.328, lon: -6.222 },   // Sandymount strand mid
    { lat: 53.320, lon: -6.215 },   // Merrion Gates
    { lat: 53.310, lon: -6.200 },   // Booterstown Marsh
    { lat: 53.302, lon: -6.183 },   // Blackrock Park
    { lat: 53.299, lon: -6.171 },   // Salthill / Monkstown
    { lat: 53.295, lon: -6.162 },   // Seapoint
    { lat: 53.293, lon: -6.155 },   // Seapoint S
    // ----- Dún Laoghaire harbour: West Pier (L-shape) -----
    { lat: 53.293, lon: -6.149 },   // West Pier root
    { lat: 53.297, lon: -6.146 },   // West Pier mid
    { lat: 53.3015, lon: -6.142 },  // West Pier head (N tip)
    { lat: 53.3010, lon: -6.139 },  // West Pier head inner corner
    { lat: 53.298, lon: -6.140 },   // back inside (harbour W)
    { lat: 53.295, lon: -6.139 },   // harbour back (Carlisle Pier root)
    { lat: 53.294, lon: -6.135 },   // harbour back mid
    { lat: 53.295, lon: -6.131 },   // East Pier root area
    // ----- East Pier (L-shape) -----
    { lat: 53.298, lon: -6.130 },   // East Pier mid
    { lat: 53.3015, lon: -6.129 },  // East Pier head (N tip)
    { lat: 53.3008, lon: -6.126 },  // East Pier head outer corner
    { lat: 53.296, lon: -6.128 },   // back along outer East Pier
    { lat: 53.294, lon: -6.126 },   // East Pier root outer
    // ----- Sandycove -> Dalkey -> Killiney -> Bray -----
    { lat: 53.292, lon: -6.118 },   // Scotsman's Bay
    { lat: 53.290, lon: -6.108 },   // Sandycove Point / 40 Foot
    { lat: 53.287, lon: -6.101 },   // Sandycove Avenue
    { lat: 53.283, lon: -6.092 },   // Bullock Harbour
    { lat: 53.279, lon: -6.087 },   // Coliemore Harbour
    { lat: 53.276, lon: -6.087 },   // Sorrento Point (Dalkey Sound W)
    { lat: 53.270, lon: -6.094 },   // Dalkey S / White Rock
    { lat: 53.262, lon: -6.098 },   // Killiney N
    { lat: 53.254, lon: -6.099 },   // Killiney Beach mid
    { lat: 53.243, lon: -6.094 },   // Killiney S / Shanganagh
    { lat: 53.225, lon: -6.090 },   // Shanganagh Cliffs
    { lat: 53.210, lon: -6.085 },   // Bray N
    { lat: 53.197, lon: -6.077 },   // Bray Harbour
    { lat: 53.185, lon: -6.078 },   // Bray Head N
    { lat: 53.180, lon: -6.082 },   // Bray Head south
    // close polygon far inland so the land fills properly:
    { lat: 53.175, lon: -6.350 },
    { lat: 53.405, lon: -6.350 },
];

// North Bull Island — a barrier island between the channel and the open
// bay, separated from the mainland by a narrow tidal lagoon. Drawn as a
// separate land polygon so the Causeway gap reads correctly.
const BULL_ISLAND = [
    { lat: 53.371, lon: -6.140 },   // N tip (Sutton Creek)
    { lat: 53.367, lon: -6.150 },   // E shore N (Dollymount strand)
    { lat: 53.359, lon: -6.158 },   // E shore mid
    { lat: 53.351, lon: -6.170 },   // E shore S
    { lat: 53.345, lon: -6.183 },   // S tip (channel mouth)
    { lat: 53.349, lon: -6.184 },   // back along W shore (lagoon side)
    { lat: 53.355, lon: -6.176 },
    { lat: 53.362, lon: -6.165 },
    { lat: 53.368, lon: -6.150 },
];

// Dalkey Island (separate islet to draw)
const DALKEY_ISLAND = [
    { lat: 53.276, lon: -6.094 },
    { lat: 53.275, lon: -6.088 },
    { lat: 53.272, lon: -6.087 },
    { lat: 53.270, lon: -6.092 },
    { lat: 53.273, lon: -6.096 },
];

// Tide table + per-mark tidal stream rose, populated asynchronously by
// fetch("tides.json") later in the file. Declared up here (rather than
// next to the tide engine functions) so that any early call to
// renderChart() / hasTideStreamData() at module-load time finds an
// initialised binding instead of hitting the let-TDZ ReferenceError.
let TIDES = null;

// Build identifier — visible in the footer so it's easy to verify which
// version is actually running on a phone after a SW update. Bump these
// together with sw.js CACHE_VERSION on every release.
//
// Versioning scheme: MAJOR.MINOR.PATCH
//   MAJOR — bump when the SW cache version increments (breaking cache change)
//   MINOR — bump for new features or significant UI additions
//   PATCH — bump for bug-fixes, copy tweaks, minor adjustments
const APP_VERSION = "v42.2.2";
const APP_BUILD_DATE = "2026-05-14";

const $ = (id) => document.getElementById(id);

const cardSel = $("cardSel");
const windSel = $("windSel");
const courseSel = $("courseSel");
const cardSub = $("cardSub");
const summaryEl = $("summary");
const legListEl = $("legList");
const nowEl = $("now");
const btnNext = $("btnNext");
const btnUndo = $("btnUndo");
const btnReset = $("btnReset");
const btnGps = $("btnGps");
const btnCompass = $("btnCompass");
const btnTheme = $("btnTheme");
const btnExpandChart = $("btnExpandChart");
const chartModal = $("chartModal");
const chartBig = $("chartBig");
const cmClose = $("cmClose");
const infoStrip = $("infoStrip");
const countdownPanel = $("countdownPanel");
const countdownBig = $("countdownBig");
const countdownSub = $("countdownSub");
const tidePanel = $("tidePanel");
const tideBig = $("tideBig");
const tideSub = $("tideSub");
const twdInput = $("twdInput");
const twdHint = $("twdHint");
const btnTwdReset = $("btnTwdReset");

// ---------- state ----------
const state = {
    cardId: localStorage.getItem("dbsc.card") || "CC1",
    windKey: localStorage.getItem("dbsc.wind") || "A",
    courseN: +(localStorage.getItem("dbsc.course") || 1),
    rounded: 0,             // index of next mark to round (0-based into legs[])
    gpsOn: false,
    gpsWatch: null,
    gpsPos: null,          // {lat, lon, accuracy, heading?, speed?}
    gpsTimer: null,
    gpsEndTime: null,      // absolute ms timestamp when GPS auto-off fires
    headingOn: false,      // device-orientation compass active
    heading: null,         // degrees true (or magnetic if true unavailable)
    headingTrue: false,    // whether `heading` is true-north (vs magnetic)
    chartFullscreen: false,
    viewMode: localStorage.getItem("dbsc.viewMode") === "steer" ? "steer" : "chart",
    // Auto-round: when GPS is on and the boat is within ~30 m of the next
    // mark for a few consecutive fixes, advance the leg automatically.
    // Default ON; user can toggle from the controls. Counter resets when
    // the boat is no longer within range.
    autoRound: localStorage.getItem("dbsc.autoRound") !== "0",
    autoRoundHits: 0,
    // True wind direction override (degrees, where wind blows FROM).
    // null  = follow the course-card default (card.wind[windKey].bearing)
    // 0–359 = user-entered value, persisted for the session only since
    //         real wind shifts hour-by-hour.
    // Chart overlay toggles — which layers are drawn on the map.
    // Persisted individually in localStorage so they survive refresh.
    chartOverlays: {
        // tides intentionally disabled — stream data uses a constant vector,
        // not accurate enough to publish. Re-enable by restoring the line below
        // and unhiding #btnOvTides / #btnOvTidesBig in index.html.
        // tides: localStorage.getItem("dbsc.ov.tides") === "1",
        tides: false,
        allMarks: localStorage.getItem("dbsc.ov.allMarks") === "1",  // default OFF
    },
    twdOverride: (() => {
        const v = sessionStorage.getItem("dbsc.twd");
        const n = v == null ? NaN : parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 && n < 360 ? n : null;
    })(),
};

// ---------- helpers ----------
function markName(letter) {
    const m = MARKS[letter];
    return m ? m.name : letter;
}
function markColour(letter) {
    return MARKS[letter]?.colour || "";
}
function sidePill(side) {
    if (side === "p") return `<span class="pill p">PORT</span>`;
    if (side === "s") return `<span class="pill s">STBD</span>`;
    return `<span class="pill x">PASS</span>`;  // CC4 (all port) – we still mark p in the title
}
function fmtBearing(b) {
    if (b == null || isNaN(b)) return "—";
    return String(Math.round(((b % 360) + 360) % 360) % 360).padStart(3, "0") + "°";
}
function fmtDist(d) {
    if (d == null || isNaN(d)) return "—";
    return d.toFixed(2) + " NM";
}

/** Great-circle bearing & distance between two lat/lon (deg). */
function geo(lat1, lon1, lat2, lon2) {
    const toRad = (x) => x * Math.PI / 180;
    const toDeg = (x) => x * 180 / Math.PI;
    const φ1 = toRad(lat1), φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1), Δλ = toRad(lon2 - lon1);
    // distance (haversine) in nautical miles
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distNM = (6371000 * c) / 1852;
    // initial bearing
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
    return { bearing: brng, distance: distNM };
}

/** Return bearing/distance for a leg from->to using table, fallback to geo. */
function leg(from, to) {
    if (BEARINGS[from] && BEARINGS[from][to] != null && DISTS[from][to] != null) {
        return { bearing: BEARINGS[from][to], distance: DISTS[from][to], src: "table" };
    }
    const a = MARKS[from], b = MARKS[to];
    if (a && b) {
        const g = geo(a.lat, a.lon, b.lat, b.lon);
        return { bearing: g.bearing, distance: g.distance, src: "calc" };
    }
    return { bearing: null, distance: null, src: "?" };
}

// ---------- selection / persistence ----------
function saveSelection() {
    localStorage.setItem("dbsc.card", state.cardId);
    localStorage.setItem("dbsc.wind", state.windKey);
    localStorage.setItem("dbsc.course", String(state.courseN));
}

function populateCards() {
    cardSel.innerHTML = "";
    for (const id of Object.keys(CARDS)) {
        const c = CARDS[id];
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `${id} – ${c.name}`;
        cardSel.appendChild(opt);
    }
    if (!CARDS[state.cardId]) state.cardId = Object.keys(CARDS)[0];
    cardSel.value = state.cardId;
}

function populateWinds() {
    const card = CARDS[state.cardId];
    const winds = Object.keys(card.wind).sort();
    windSel.innerHTML = "";
    for (const w of winds) {
        const opt = document.createElement("option");
        opt.value = w;
        opt.textContent = `${w} – ${String(card.wind[w].bearing).padStart(3, "0")}°`;
        windSel.appendChild(opt);
    }
    if (!card.wind[state.windKey]) state.windKey = winds[0];
    windSel.value = state.windKey;
}

function populateCourses() {
    const card = CARDS[state.cardId];
    const wind = card.wind[state.windKey];
    const nums = Object.keys(wind.courses).map(Number).sort((a, b) => a - b);
    courseSel.innerHTML = "";
    for (const n of nums) {
        const opt = document.createElement("option");
        opt.value = n;
        opt.textContent = `${n}`;
        courseSel.appendChild(opt);
    }
    if (!wind.courses[state.courseN]) state.courseN = nums[0];
    courseSel.value = state.courseN;
}

// ---------- rendering ----------
function currentCourse() {
    const card = CARDS[state.cardId];
    const wind = card.wind[state.windKey];
    return {
        card,
        wind,
        bearing: wind.bearing,
        tokens: wind.courses[state.courseN] || [],
    };
}

// True Wind Direction in degrees (0–359, where wind blows FROM).
// User override takes priority; otherwise the course card's expected
// wind axis is used so things "just work" without any input.
function effectiveTWD() {
    if (state.twdOverride != null) return state.twdOverride;
    const c = currentCourse();
    return c && c.bearing != null ? c.bearing : 0;
}

// True Wind Angle for a given leg bearing (degrees).
// Returns:
//   { angle: 0..180,        // |TWA| – absolute angle off the bow
//     side: "S" | "P" | "" } // tack: wind on Stbd/Port (empty when head-to-wind or DDW)
//
// Worked example matches the user's spec:
//   TWD = 090°, leg bearing = 000°
//   diff = ((90 - 0 + 540) % 360) - 180 = 90  -> wind on starboard
function twa(legBearing, twd) {
    if (legBearing == null) return null;
    const wind = (twd != null) ? twd : effectiveTWD();
    let diff = ((wind - legBearing + 540) % 360) - 180; // -180..+180
    const angle = Math.abs(diff);
    let side = "";
    if (angle > 1 && angle < 179) side = (diff > 0) ? "S" : "P";
    return { angle: Math.round(angle), side };
}

function twaHtml(t) {
    if (!t) return "";
    if (t.side === "S") return `<span class="tack-s">${t.angle}° Starboard</span>`;
    if (t.side === "P") return `<span class="tack-p">${t.angle}° Port</span>`;
    return `<span>${t.angle}°</span>`;
}

function renderSummary() {
    const c = currentCourse();
    cardSub.textContent = `${c.card.id} – ${c.card.name}  •  VHF ${c.card.vhf}`;

    // Badge: wind letter + course number (e.g. "A1", "B3")
    const badge = `${state.windKey}${state.courseN}`;

    // Wind bearing line — show TWD override in accent if active
    const refBearing = fmtBearing(c.bearing);
    const twdLine = state.twdOverride != null
        ? `${refBearing} <span class="sum-override">→ using ${fmtBearing(state.twdOverride)}</span>`
        : refBearing;

    // Race distance
    let total = 0;
    for (let i = 1; i < c.tokens.length; i++) {
        const L = leg(c.tokens[i - 1].mark, c.tokens[i].mark);
        if (L.distance != null) total += L.distance;
    }
    const distStr = total ? total.toFixed(2) + " NM" : "—";
    const markCount = c.tokens.length;

    // Mark sequence with coloured port/stbd superscripts
    const routeHtml = c.tokens.map((tok, i) => {
        const sideKey = tok.side || (c.card.all_port ? "p" : "");
        const sideTag = sideKey === "p"
            ? `<sup class="sm-side p">P</sup>`
            : sideKey === "s"
                ? `<sup class="sm-side s">S</sup>`
                : "";
        const sep = i > 0 ? `<span class="sum-sep">→</span>` : "";
        return `${sep}<span class="sum-mark">${tok.mark}${sideTag}</span>`;
    }).join("");

    summaryEl.innerHTML = `
    <div class="sum-top">
      <span class="sum-badge">${badge}</span>
      <div class="sum-aside">
        <div class="sum-wind">Wind ref. ${twdLine}</div>
        <div class="sum-dist">Race distance: ${distStr} &middot; ${markCount} marks</div>
      </div>
    </div>
    <div class="sum-route">${routeHtml}</div>
  `;
}

function renderLegs() {
    const c = currentCourse();
    legListEl.innerHTML = "";
    c.tokens.forEach((tok, i) => {
        const li = document.createElement("li");
        const isFinish = (i === c.tokens.length - 1);
        let bearing = null, distance = null, src = "";
        if (i > 0) {
            const L = leg(c.tokens[i - 1].mark, tok.mark);
            bearing = L.bearing; distance = L.distance; src = L.src;
        }
        if (i < state.rounded) li.classList.add("done");
        if (i === state.rounded) li.classList.add("current");
        if (isFinish) li.classList.add("finish");

        const sideKey = tok.side || (c.card.all_port ? "p" : "");
        const sidePillHtml =
            sideKey === "p" ? `<span class="pill p">PORT</span>` :
                sideKey === "s" ? `<span class="pill s">STBD</span>` :
                    `<span class="pill x">—</span>`;

        const legTwa = (i > 0 && bearing != null) ? twa(bearing) : null;
        const twaLine = legTwa ? `<div class="twa">TWA ${twaHtml(legTwa)}</div>` : "";

        li.innerHTML = `
      <div class="idx">${i + 1}</div>
      <div class="info">
        <div class="name">${tok.mark} – ${markName(tok.mark)}${isFinish ? " (Finish)" : ""}</div>
        <div class="meta">${sidePillHtml}<span class="colour">${markColour(tok.mark)}</span></div>
        ${twaLine}
      </div>
      <div class="nav">
        ${i === 0
                ? `<div class="b">START</div><div class="d">&nbsp;</div>`
                : `<div class="b">${fmtBearing(bearing)}</div><div class="d">${fmtDist(distance)}${src === "calc" ? " ≈" : ""}</div>`}
      </div>
    `;
        legListEl.appendChild(li);
    });
}

function renderNow() {
    const c = currentCourse();
    const idx = state.rounded;
    const target = c.tokens[idx];
    if (!target) {
        nowEl.innerHTML = `<h3>Course complete</h3>
      <div class="name">🏁 Finished</div>
      <div class="row"><div class="cell"><div class="lbl">All marks rounded.</div></div></div>`;
        btnNext.disabled = true;
        btnUndo.disabled = idx === 0;
        return;
    }

    let tableNav = { bearing: null, distance: null, src: "" };
    if (idx > 0) tableNav = leg(c.tokens[idx - 1].mark, target.mark);

    let gpsHtml = "";
    if (state.gpsPos) {
        const m = MARKS[target.mark];
        if (m) {
            const g = geo(state.gpsPos.lat, state.gpsPos.lon, m.lat, m.lon);
            // If we have a compass heading, compute "steer X° port/stbd" so the
            // helm can just turn until that number reaches 0°.
            let steerHtml = "";
            if (state.headingOn && state.heading != null) {
                let off = ((g.bearing - state.heading + 540) % 360) - 180; // -180..+180
                const offAbs = Math.abs(off).toFixed(0);
                const dir = off > 1 ? "stbd" : (off < -1 ? "port" : "—");
                const steerText = (dir === "—") ? "on bearing" : `${offAbs}° ${dir === "stbd" ? "↻" : "↺"}`;
                steerHtml = `
                    <div class="gps-cell">
                        <div class="lbl">Steer</div>
                        <div class="val steer">${steerText}</div>
                    </div>`;
            } else {
                steerHtml = `
                    <div class="gps-cell">
                        <div class="lbl">Heading</div>
                        <div class="val" style="font-size:13px; color:var(--muted)">tap 🧭</div>
                    </div>`;
            }
            gpsHtml = `<div class="gps live">
                <div class="gps-row">
                    <div class="gps-cell">
                        <div class="lbl">Bearing (live)</div>
                        <div class="val">${fmtBearing(g.bearing)}</div>
                    </div>
                    <div class="gps-cell">
                        <div class="lbl">Distance</div>
                        <div class="val">${fmtDist(g.distance)}</div>
                    </div>
                    ${steerHtml}
                </div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px">
                    GPS ±${Math.round(state.gpsPos.accuracy)} m${state.headingOn && state.heading != null ? ` · heading ${Math.round(state.heading)}°${state.headingTrue ? "T" : "M"}` : ""}
                </div>
            </div>`;
        }
    } else {
        gpsHtml = `<div class="gps">Tap “Use GPS” for live bearing &amp; distance from your boat.</div>`;
    }

    const sideKey = target.side || (c.card.all_port ? "p" : "");
    const sidePillHtml =
        sideKey === "p" ? `<span class="pill p">PORT</span>` :
            sideKey === "s" ? `<span class="pill s">STBD</span>` :
                `<span class="pill x">—</span>`;

    // True wind angle for the upcoming leg (uses chart bearing if we have it,
    // otherwise the live GPS bearing — either way it's relative to the same TWD).
    let twaForLeg = null;
    if (idx > 0 && tableNav.bearing != null) twaForLeg = twa(tableNav.bearing);
    else if (state.gpsPos && MARKS[target.mark]) {
        const g = geo(state.gpsPos.lat, state.gpsPos.lon, MARKS[target.mark].lat, MARKS[target.mark].lon);
        twaForLeg = twa(g.bearing);
    }
    const twdNow = effectiveTWD();
    const twdSrc = state.twdOverride != null ? "your input" : "course default";
    const twaLineHtml = twaForLeg
        ? `<div class="twa-line">Wind from ${fmtBearing(twdNow)} (${twdSrc}) · TWA ${twaHtml(twaForLeg)}</div>`
        : `<div class="twa-line">Wind from ${fmtBearing(twdNow)} (${twdSrc})</div>`;

    nowEl.innerHTML = `
    <h3>Next mark — ${idx + 1} of ${c.tokens.length}</h3>
    <div class="name">${target.mark} – ${markName(target.mark)} ${sidePillHtml}</div>
    <div class="row">
      <div class="cell">
        <div class="lbl">Bearing (chart)</div>
        <div class="val">${idx === 0 ? "START" : fmtBearing(tableNav.bearing)}</div>
      </div>
      <div class="cell">
        <div class="lbl">Distance (chart)</div>
        <div class="val">${idx === 0 ? "—" : fmtDist(tableNav.distance) + (tableNav.src === "calc" ? " ≈" : "")}</div>
      </div>
      <div class="cell">
        <div class="lbl">Colour</div>
        <div class="val" style="font-size:16px">${markColour(target.mark) || "—"}</div>
      </div>
    </div>
    ${twaLineHtml}
    ${gpsHtml}
  `;

    btnNext.disabled = false;
    btnNext.textContent = isFinishLeg(idx) ? "🏁 Finish" : "✓ Mark rounded";
    btnUndo.disabled = idx === 0;
}

function isFinishLeg(idx) {
    const c = currentCourse();
    return idx === c.tokens.length - 1;
}

function renderAll() {
    renderSummary();
    renderLegs();
    renderNow();
}

// ---------- events ----------
cardSel.addEventListener("change", () => {
    const oldDefault = currentCourse().bearing;
    state.cardId = cardSel.value;
    state.rounded = 0;
    populateWinds(); populateCourses(); saveSelection();
    // If override exactly matches the previous default, the user almost
    // certainly hasn't customised TWD — let the new card's default take over.
    if (state.twdOverride === oldDefault) clearTwdOverride();
    syncTwdInput();
    renderAll();
});
windSel.addEventListener("change", () => {
    const oldDefault = currentCourse().bearing;
    state.windKey = windSel.value;
    state.rounded = 0;
    populateCourses(); saveSelection();
    if (state.twdOverride === oldDefault) clearTwdOverride();
    syncTwdInput();
    renderAll();
});
courseSel.addEventListener("change", () => {
    state.courseN = +courseSel.value;
    state.rounded = 0;
    saveSelection(); renderAll();
});

btnNext.addEventListener("click", () => {
    const c = currentCourse();
    if (state.rounded < c.tokens.length) state.rounded += 1;
    state.autoRoundHits = 0;
    renderAll();
});
btnUndo.addEventListener("click", () => {
    if (state.rounded > 0) state.rounded -= 1;
    state.autoRoundHits = 0;
    renderAll();
});
btnReset.addEventListener("click", () => {
    state.rounded = 0;
    state.autoRoundHits = 0;
    renderAll();
});

// ---------- True wind direction input ----------
function clearTwdOverride() {
    state.twdOverride = null;
    sessionStorage.removeItem("dbsc.twd");
}

// Push the effective TWD value (and override-vs-default state) back to the
// input field. Called whenever something upstream changes (card / wind sector
// / reset). User typing into the field doesn't trigger this.
function syncTwdInput() {
    if (!twdInput) return;
    const eff = effectiveTWD();
    if (state.twdOverride != null) {
        twdInput.value = String(state.twdOverride);
        if (twdHint) {
            twdHint.textContent = "\u25cf";
            twdHint.classList.add("override");
        }
    } else {
        twdInput.value = String(Math.round(eff));
        if (twdHint) {
            twdHint.textContent = "";
            twdHint.classList.remove("override");
        }
    }
}

if (twdInput) {
    const onTwdChange = () => {
        const raw = twdInput.value.trim();
        if (raw === "") { clearTwdOverride(); syncTwdInput(); renderAll(); return; }
        let n = parseInt(raw, 10);
        if (!Number.isFinite(n)) return;
        // Wrap any value into 0..359 so the helm can type "370" or "-10".
        n = ((n % 360) + 360) % 360;
        const def = currentCourse().bearing;
        if (n === def) {
            clearTwdOverride();
        } else {
            state.twdOverride = n;
            sessionStorage.setItem("dbsc.twd", String(n));
        }
        syncTwdInput();
        renderAll();
    };
    twdInput.addEventListener("change", onTwdChange);
    // Also live-update on input for instant feedback while spinner is being used.
    twdInput.addEventListener("input", () => {
        const raw = twdInput.value.trim();
        if (raw === "") return;
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n)) return;
        const wrapped = ((n % 360) + 360) % 360;
        const def = currentCourse().bearing;
        state.twdOverride = (wrapped === def) ? null : wrapped;
        if (state.twdOverride != null) sessionStorage.setItem("dbsc.twd", String(wrapped));
        else sessionStorage.removeItem("dbsc.twd");
        // Don't call syncTwdInput() here — we'd fight the user's caret.
        if (twdHint) {
            twdHint.textContent = state.twdOverride != null ? "\u25cf" : "";
            twdHint.classList.toggle("override", state.twdOverride != null);
        }
        renderAll();
    });
}

if (btnTwdReset) {
    btnTwdReset.addEventListener("click", () => {
        clearTwdOverride();
        syncTwdInput();
        renderAll();
    });
}

// ---------- GPS ----------
const GPS_AUTO_OFF_MS = 150 * 60 * 1000; // 150 minutes (2 h 30 min)
const gpsExplain = $("gpsExplain");
const gpsExplainOk = $("gpsExplainOk");
const gpsExplainCancel = $("gpsExplainCancel");
const gpsPermissionModal = document.getElementById("gpsPermissionModal");
const gpsPermissionClose = document.getElementById("gpsPermissionClose");

function stopGps(reason) {
    if (state.gpsWatch != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(state.gpsWatch);
    }
    if (state.gpsTimer) {
        clearTimeout(state.gpsTimer);
        state.gpsTimer = null;
    }
    state.gpsOn = false;
    state.gpsWatch = null;
    state.gpsPos = null;
    state.gpsEndTime = null;
    btnGps.textContent = "📍 Use GPS";
    btnGps.classList.remove("primary");
    renderNow();
    if (reason === "timeout") {
        showToast("GPS switched off after 2 h 30 min to save battery.");
    }
}

function startGps() {
    if (!("geolocation" in navigator)) {
        alert("Geolocation not available in this browser.");
        return;
    }
    // Cancel any stale watch before starting a new one
    if (state.gpsWatch != null) {
        navigator.geolocation.clearWatch(state.gpsWatch);
        state.gpsWatch = null;
    }
    state.gpsWatch = navigator.geolocation.watchPosition(
        (pos) => {
            state.gpsPos = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                heading: pos.coords.heading,
                speed: pos.coords.speed,
            };
            state.gpsOn = true;
            btnGps.textContent = "📍 GPS on";
            checkAutoRound();
            renderNow();
        },
        (err) => {
            // Only stop GPS on permanent permission errors.
            // Transient errors (TIMEOUT, POSITION_UNAVAILABLE) happen when
            // the phone screen wakes up — ignore them so GPS survives.
            if (err.code === err.PERMISSION_DENIED) {
                stopGps();
                if (gpsPermissionModal) gpsPermissionModal.hidden = false;
            }
        },
        { enableHighAccuracy: true, maximumAge: 1000 }
    );
    // Use an absolute end-time so the countdown survives the screen locking.
    // On resume, startGps() is called again but reuses the existing end-time.
    if (!state.gpsEndTime) {
        state.gpsEndTime = Date.now() + GPS_AUTO_OFF_MS;
    }
    if (state.gpsTimer) clearTimeout(state.gpsTimer);
    const remaining = state.gpsEndTime - Date.now();
    state.gpsTimer = setTimeout(() => stopGps("timeout"), remaining);
}

function showToast(msg) {
    // lightweight, only when a #toast element exists; otherwise fall back to console.
    const t = document.getElementById("toast");
    if (!t) { console.log(msg); return; }
    t.textContent = msg;
    t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 4000);
}

// ---- auto-round ----
// When the boat is within AUTO_ROUND_M of the next mark for AUTO_ROUND_HITS
// consecutive GPS fixes, advance the leg and announce it. The hit counter
// resets the moment we drift out of range so a fly-by doesn't trigger.
const AUTO_ROUND_M = 30;     // metres
const AUTO_ROUND_HITS = 3;   // consecutive fixes inside the radius
function checkAutoRound() {
    if (!state.autoRound || !state.gpsOn || !state.gpsPos) return;
    const c = currentCourse();
    const tokens = c && c.tokens;
    if (!tokens || state.rounded >= tokens.length) return;
    const nextTok = tokens[state.rounded];
    const m = nextTok && MARKS[nextTok.mark];
    if (!m) return;
    const g = geo(state.gpsPos.lat, state.gpsPos.lon, m.lat, m.lon);
    const distM = g.distance * 1852; // NM -> m
    if (distM <= AUTO_ROUND_M) {
        state.autoRoundHits += 1;
        if (state.autoRoundHits >= AUTO_ROUND_HITS) {
            state.autoRoundHits = 0;
            const finishing = state.rounded === tokens.length - 1;
            state.rounded += 1;
            renderAll();
            showToast(finishing
                ? `🏁 Finished at ${nextTok.mark}`
                : `✓ Auto-rounded ${nextTok.mark}`);
        }
    } else {
        state.autoRoundHits = 0;
    }
}

if (gpsPermissionClose) {
    gpsPermissionClose.addEventListener("click", () => {
        if (gpsPermissionModal) gpsPermissionModal.hidden = true;
    });
}

btnGps.addEventListener("click", () => {
    if (state.gpsOn) { stopGps(); return; }
    if (!("geolocation" in navigator)) {
        if (gpsPermissionModal) gpsPermissionModal.hidden = false;
        return;
    }
    if (gpsExplain) {
        gpsExplain.hidden = false;
    } else {
        startGps();
    }
});

if (gpsExplainOk) {
    gpsExplainOk.addEventListener("click", () => {
        gpsExplain.hidden = true;
        startGps();
    });
}
if (gpsExplainCancel) {
    gpsExplainCancel.addEventListener("click", () => {
        gpsExplain.hidden = true;
    });
}
if (gpsExplain) {
    gpsExplain.addEventListener("click", (e) => {
        if (e.target === gpsExplain) gpsExplain.hidden = true;
    });
}

// ---------- GPS resume on screen-wake ----------
// Browsers (especially iOS/Android) kill watchPosition when the screen locks.
// When the page becomes visible again:
//  - If hidden for >= 2 min, prompt the user to reload so stale data isn't trusted.
//  - Restart the GPS watch if the 150-minute timer hasn't expired.
const WAKE_RELOAD_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
let hiddenAt = null;

const wakeReloadModal = document.getElementById("wakeReloadModal");
const wakeReloadOk = document.getElementById("wakeReloadOk");
const wakeReloadError = document.getElementById("wakeReloadError");
if (wakeReloadOk) {
    wakeReloadOk.addEventListener("click", () => {
        wakeReloadOk.textContent = "Locating\u2026";
        wakeReloadOk.disabled = true;
        if (wakeReloadError) wakeReloadError.hidden = true;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // Fresh fix obtained — update GPS state and resume watch
                state.gpsPos = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    heading: pos.coords.heading,
                    speed: pos.coords.speed,
                };
                state.gpsOn = true;
                wakeReloadModal.hidden = true;
                wakeReloadOk.textContent = "\ud83d\udccd Reload GPS";
                wakeReloadOk.disabled = false;
                startGps();
                renderNow();
            },
            (err) => {
                wakeReloadOk.textContent = "\ud83d\udccd Reload GPS";
                wakeReloadOk.disabled = false;
                if (wakeReloadError) {
                    wakeReloadError.textContent = err.code === err.PERMISSION_DENIED
                        ? "Location access is blocked. Please enable GPS in your device settings."
                        : err.code === err.TIMEOUT
                            ? "GPS timed out. Check you\u2019re outdoors with a clear sky view and try again."
                            : "Could not get GPS position. Please try again.";
                    wakeReloadError.hidden = false;
                }
            },
            { enableHighAccuracy: true, timeout: 15000 }
        );
    });
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
    }
    // Page is becoming visible again
    const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = null;

    // If GPS auto-off timer expired while screen was locked, stop cleanly
    if (state.gpsOn && state.gpsEndTime && Date.now() >= state.gpsEndTime) {
        stopGps("timeout");
        return;
    }

    // If GPS was active and we've been away long enough, show the stale-GPS
    // prompt. Pause the active watch so the stale position isn't used; the
    // user must get a fresh fix before GPS features resume.
    if (awayMs >= WAKE_RELOAD_THRESHOLD_MS && state.gpsOn && wakeReloadModal) {
        if (state.gpsWatch != null) {
            navigator.geolocation.clearWatch(state.gpsWatch);
            state.gpsWatch = null;
        }
        wakeReloadModal.hidden = false;
        return;
    }

    // Short absence: just restart the GPS watch so the phone-lock gap is covered
    if (!state.gpsOn) return;
    startGps();
});

// ---------- init ----------
// Force-clear any stored tide overlay preference so returning users who had
// it enabled don't see it either. Remove this line when re-enabling tides.
try { localStorage.removeItem("dbsc.ov.tides"); } catch (_) {}
populateCards();
populateWinds();
populateCourses();
syncTwdInput();
renderAll();

// Check GPS permission on load: prompt if not yet granted, warn if blocked.
(function checkGpsPermissionOnLoad() {
    if (!("permissions" in navigator)) return; // API unavailable (old browsers)
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
        if (result.state === "denied") {
            // Permission permanently blocked — show info modal
            if (gpsPermissionModal) gpsPermissionModal.hidden = false;
        } else if (result.state === "prompt") {
            // User hasn't been asked yet — show the GPS explain/invite modal
            if (gpsExplain) gpsExplain.hidden = false;
        }
        // "granted": GPS button works as normal; no action needed on load
    }).catch(() => { /* permissions API rejected silently */ });
})();

// Try to pull a fresh data.json from the network (GitHub Pages) so simple
// edits to data.json on github.com show up without re-running parse_data.py.
// Falls back silently to the inline data if the fetch fails.
(function refreshDataFromJson() {
    const url = "data.json?v=" + Date.now();
    fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
            if (!d) return;
            const oldKey = JSON.stringify(window.DBSC_DATA?.marks?.A || {});
            const newKey = JSON.stringify(d.marks?.A || {});
            applyData(d);
            // Re-validate selections in case wind letters / courses changed.
            populateCards();
            populateWinds();
            populateCourses();
            syncTwdInput();
            renderAll();
            if (oldKey !== newKey) console.log("[DBSC] live data refreshed from data.json");
        })
        .catch(() => { /* offline – stick with bundled data */ });
})();

// ============================================================
// Tap-a-leg to jump
// ============================================================
legListEl.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const items = Array.from(legListEl.children);
    const idx = items.indexOf(li);
    if (idx < 0) return;
    state.rounded = idx;
    renderAll();
});

// ============================================================
// Mini chart
// ============================================================
const chartCanvas = document.getElementById("chart");

function resizeChart() {
    if (!chartCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = chartCanvas.clientWidth;
    // In landscape the canvas must not exceed the viewport height (minus a
    // small margin for the legs strip below it). In portrait keep the
    // existing 65%-of-width aspect ratio.
    let cssH;
    const isLandscape = window.innerWidth > window.innerHeight && window.innerWidth >= 600;
    if (isLandscape) {
        // Leave ~140px for legs list + chartwrap margin
        cssH = Math.max(120, Math.min(Math.round(cssW * 0.65), window.innerHeight - 140));
    } else {
        cssH = Math.round(cssW * 0.65);
    }
    chartCanvas.style.height = cssH + "px";
    chartCanvas.width = Math.round(cssW * dpr);
    chartCanvas.height = Math.round(cssH * dpr);
    renderChart();
}
window.addEventListener("resize", resizeChart);

// ---------- Draggable panel splitter ----------
// Only active in landscape (min-width 600px, width > height).
// Persists the chosen left-panel width to localStorage.
(function setupPanelSplitter() {
    const splitter = document.getElementById("panelSplitter");
    const courseLeft = document.querySelector(".course-left");
    if (!splitter || !courseLeft) return;

    const LS_KEY = "dbsc.panelWidth";
    const MIN_LEFT = 180;   // px — left panel never narrower than this
    const MAX_LEFT_FRAC = 0.70; // never more than 70% of viewport width

    function isLandscapeMode() {
        return window.innerWidth >= 600 && window.innerWidth > window.innerHeight;
    }

    function applyWidth(px) {
        const clamped = Math.max(MIN_LEFT, Math.min(px, Math.round(window.innerWidth * MAX_LEFT_FRAC)));
        courseLeft.style.width = clamped + "px";
        try { localStorage.setItem(LS_KEY, String(clamped)); } catch (_) { }
        resizeChart();
    }

    // Restore saved width on load
    (function restoreWidth() {
        const saved = parseInt(localStorage.getItem(LS_KEY), 10);
        if (saved && isLandscapeMode()) applyWidth(saved);
    })();

    // Also restore on orientation change
    window.addEventListener("resize", () => {
        if (!isLandscapeMode()) {
            // Reset inline width so portrait layout is unaffected
            courseLeft.style.width = "";
            return;
        }
        const saved = parseInt(localStorage.getItem(LS_KEY), 10);
        if (saved) applyWidth(saved);
    });

    // --- Mouse drag ---
    splitter.addEventListener("mousedown", (e) => {
        if (!isLandscapeMode()) return;
        e.preventDefault();
        splitter.classList.add("dragging");
        const startX = e.clientX;
        const startW = courseLeft.getBoundingClientRect().width;

        function onMove(ev) {
            applyWidth(startW + (ev.clientX - startX));
        }
        function onUp() {
            splitter.classList.remove("dragging");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    // --- Touch drag ---
    splitter.addEventListener("touchstart", (e) => {
        if (!isLandscapeMode()) return;
        const touch = e.touches[0];
        splitter.classList.add("dragging");
        const startX = touch.clientX;
        const startW = courseLeft.getBoundingClientRect().width;

        function onMove(ev) {
            ev.preventDefault();
            applyWidth(startW + (ev.touches[0].clientX - startX));
        }
        function onEnd() {
            splitter.classList.remove("dragging");
            splitter.removeEventListener("touchmove", onMove);
            splitter.removeEventListener("touchend", onEnd);
        }
        splitter.addEventListener("touchmove", onMove, { passive: false });
        splitter.addEventListener("touchend", onEnd);
    }, { passive: true });
})();

// Read a CSS custom property (e.g. --bg) from <html>. Used so the canvas
// drawing follows the active light/dark theme.
function cssVar(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (e) { return fallback; }
}

function renderChart() {
    drawChartTo(chartCanvas);
    if (state.chartFullscreen) drawChartTo(chartBig);
}

function drawChartTo(canvas) {
    if (!canvas) return;
    if (state.viewMode === "steer") return drawSteerTo(canvas);
    return drawMapTo(canvas);
}

function drawMapTo(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const c = currentCourse();
    const tokens = c.tokens;

    // Collect points: every mark in this course + GPS + every other mark
    // (drawn faintly for context)
    const courseLetters = tokens.map((t) => t.mark);
    const allLetters = Object.keys(MARKS);

    // Compute bounds from course marks (and GPS if active)
    const focusPts = courseLetters
        .map((l) => MARKS[l])
        .filter(Boolean)
        .map((m) => ({ lat: m.lat, lon: m.lon }));
    if (state.gpsPos) focusPts.push({ lat: state.gpsPos.lat, lon: state.gpsPos.lon });
    if (focusPts.length === 0) return;

    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of focusPts) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
    }
    // Pad bounds
    const padFrac = 0.18;
    const dLat = Math.max(maxLat - minLat, 0.005);
    const dLon = Math.max(maxLon - minLon, 0.005);
    minLat -= dLat * padFrac; maxLat += dLat * padFrac;
    minLon -= dLon * padFrac; maxLon += dLon * padFrac;

    // Equirectangular: scale longitude by cos(mid lat) for aspect.
    const midLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);

    const margin = Math.round(W * 0.05);
    const chartW = W - margin * 2;
    const chartH = H - margin * 2;

    // Compute scale that fits everything while preserving aspect ratio.
    const xRange = (maxLon - minLon) * cosLat;
    const yRange = (maxLat - minLat);
    const sx = chartW / xRange;
    const sy = chartH / yRange;
    const s = Math.min(sx, sy);
    // Centre the content
    const usedW = xRange * s;
    const usedH = yRange * s;
    const offX = margin + (chartW - usedW) / 2;
    const offY = margin + (chartH - usedH) / 2;

    function project(lat, lon) {
        const x = offX + (lon - minLon) * cosLat * s;
        const y = offY + (maxLat - lat) * s;  // y inverted: north up
        return [x, y];
    }

    // ---- sea fill (entire visible area) ----
    ctx.fillStyle = cssVar("--chart-sea", "#1d4a73");
    ctx.fillRect(0, 0, W, H);

    // ---- land polygons (Dublin Bay coast + Dalkey Island) ----
    function fillLand(coords) {
        if (!coords || coords.length < 3) return;
        ctx.beginPath();
        coords.forEach((p, i) => {
            const [x, y] = project(p.lat, p.lon);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = cssVar("--chart-land", "#2a3848");
        ctx.fill();
        ctx.lineWidth = Math.max(1, W * 0.0015);
        ctx.strokeStyle = cssVar("--chart-coast", "#4a6280");
        ctx.stroke();
    }
    fillLand(DUBLIN_BAY_COAST);
    fillLand(BULL_ISLAND);
    fillLand(DALKEY_ISLAND);

    // Background grid (very faint)
    ctx.strokeStyle = cssVar("--chart-grid", "#13314d");
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = margin + (chartH * i) / 4;
        ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(W - margin, y); ctx.stroke();
        const x = margin + (chartW * i) / 4;
        ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, H - margin); ctx.stroke();
    }

    // North arrow (the chart is always drawn north-up)
    {
        const ax = W - margin - Math.round(W * 0.025);
        const ay = margin + Math.round(W * 0.04);
        const len = Math.round(W * 0.035);
        const head = Math.round(W * 0.012);
        ctx.strokeStyle = cssVar("--chart-arrow", "#8aa5bf");
        ctx.fillStyle = cssVar("--chart-arrow", "#8aa5bf");
        ctx.lineWidth = Math.max(2, W * 0.003);
        // shaft
        ctx.beginPath();
        ctx.moveTo(ax, ay + len);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        // arrowhead
        ctx.beginPath();
        ctx.moveTo(ax, ay - head * 0.4);
        ctx.lineTo(ax - head * 0.6, ay + head * 0.4);
        ctx.lineTo(ax + head * 0.6, ay + head * 0.4);
        ctx.closePath();
        ctx.fill();
        // "N" label
        ctx.font = `bold ${Math.round(W * 0.022)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("N", ax, ay - head * 0.6);
    }

    // Wind arrow — drawn top-LEFT corner, points in the direction the wind
    // is blowing TO (i.e. opposite the TWD reading). Includes the numeric
    // bearing label so a glance at the chart confirms the wind setting.
    {
        const wTwd = effectiveTWD();
        const accent = cssVar("--accent", "#ffb000");
        const wx = margin + Math.round(W * 0.05);
        const wy = margin + Math.round(W * 0.05);
        const wlen = Math.round(W * 0.06);
        const whead = Math.round(W * 0.018);
        // Wind blows TO (TWD + 180). Convert to screen angle: 0° = up.
        const blowTo = (wTwd + 180) % 360;
        const rad = (blowTo - 90) * Math.PI / 180;
        const dx = Math.cos(rad), dy = Math.sin(rad);
        ctx.strokeStyle = accent;
        ctx.fillStyle = accent;
        ctx.lineWidth = Math.max(2, W * 0.0035);
        // shaft: from (wx,wy) outward in the blow direction
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + dx * wlen, wy + dy * wlen);
        ctx.stroke();
        // arrowhead at the tip
        const tipX = wx + dx * wlen, tipY = wy + dy * wlen;
        const perpX = -dy, perpY = dx;
        ctx.beginPath();
        ctx.moveTo(tipX + dx * whead, tipY + dy * whead);
        ctx.lineTo(tipX - dx * whead * 0.4 + perpX * whead * 0.6, tipY - dy * whead * 0.4 + perpY * whead * 0.6);
        ctx.lineTo(tipX - dx * whead * 0.4 - perpX * whead * 0.6, tipY - dy * whead * 0.4 - perpY * whead * 0.6);
        ctx.closePath();
        ctx.fill();
        // label below the icon
        ctx.font = `bold ${Math.round(W * 0.018)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(`Wind ${String(Math.round(wTwd)).padStart(3, "0")}°`,
            margin, wy + Math.round(W * 0.06));
    }

    // Faint background marks (not in this course) — shown when "all marks" overlay is on
    if (state.chartOverlays.allMarks) {
        ctx.fillStyle = cssVar("--chart-mark-faint", "#23496e");
        const dotR = Math.max(2, Math.round(W * 0.006));
        for (const letter of allLetters) {
            if (courseLetters.includes(letter)) continue;
            const m = MARKS[letter];
            if (!m) continue;
            if (m.lat < minLat || m.lat > maxLat || m.lon < minLon || m.lon > maxLon) continue;
            const [x, y] = project(m.lat, m.lon);
            ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Project course points
    const pts = tokens.map((t) => {
        const m = MARKS[t.mark];
        if (!m) return null;
        return { ...t, x: project(m.lat, m.lon)[0], y: project(m.lat, m.lon)[1], mark: t.mark };
    });

    // ---- Tidal stream grid overlay (drawn before marks so marks stay on top) ----
    // Distributes arrows evenly across the visible chart area rather than
    // attaching them to individual marks. Arrows are larger and clearer than
    // the old per-mark labels.
    if (state.chartOverlays.tides && typeof tideStreamAt === "function" && hasTideStreamData()) {
        const nowMs = Date.now();
        const tideCol = cssVar("--chart-tide", "#5fc0ff");
        // markR is declared later for mark drawing; compute the same value here
        const tideMarkR = Math.max(5, Math.round(W * 0.012));

        // Build a representative tide vector for the grid.
        // Use the default rose first; if per-mark data exists pick the first.
        let gridTs = null;
        if (TIDES && Array.isArray(TIDES.defaultTideRose) && TIDES.defaultTideRose.length > 0) {
            gridTs = tideStreamAt(null, nowMs);
        }
        if (!gridTs && TIDES && TIDES.marksTideRose) {
            const firstMark = Object.keys(TIDES.marksTideRose)[0];
            if (firstMark) gridTs = tideStreamAt(firstMark, nowMs);
        }
        // Also try course marks for a local vector
        if (!gridTs) {
            for (const p of pts) {
                if (!p) continue;
                const ts = tideStreamAt(p.mark, nowMs);
                if (ts && ts.drift >= 0.05) { gridTs = ts; break; }
            }
        }

        if (gridTs && gridTs.drift >= 0.05) {
            // Grid spacing: ~5 columns × 4 rows regardless of canvas size.
            const COLS = 5, ROWS = 4;
            const cellW = W / COLS;
            const cellH = H / ROWS;

            // Arrow length: 1 kn → 1/4 of cell width; clamped to reasonable range
            const lenPer1kn = cellW * 0.28;
            const arrowLen = Math.max(cellW * 0.14, Math.min(cellW * 0.48, gridTs.drift * lenPer1kn));
            const headLen = arrowLen * 0.35;
            const lineW = Math.max(2, W * 0.004);
            const fontSize = Math.max(11, Math.round(W * 0.022));

            // Exclusion radius around course marks and GPS dot
            const excludeR = Math.max(tideMarkR + 12, W * 0.055);
            const exclusionPts = pts.filter(Boolean).map((p) => ({ x: p.x, y: p.y }));
            if (state.gpsPos) {
                const [gx, gy] = project(state.gpsPos.lat, state.gpsPos.lon);
                exclusionPts.push({ x: gx, y: gy });
            }

            // Screen angle: compass set 0°=north → canvas 0°=east, so subtract 90°
            const rad = (gridTs.set - 90) * Math.PI / 180;
            const dx = Math.cos(rad), dy = Math.sin(rad);
            const px = -dy, py = dx; // perpendicular for arrowhead

            ctx.strokeStyle = tideCol;
            ctx.fillStyle = tideCol;
            ctx.lineWidth = lineW;
            ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;

            for (let row = 0; row < ROWS; row++) {
                for (let col = 0; col < COLS; col++) {
                    // Centre of this grid cell
                    const cx = cellW * (col + 0.5);
                    const cy = cellH * (row + 0.5);

                    // Skip if too close to any mark or GPS dot
                    let tooClose = false;
                    for (const ep of exclusionPts) {
                        const d2 = (cx - ep.x) ** 2 + (cy - ep.y) ** 2;
                        if (d2 < excludeR * excludeR) { tooClose = true; break; }
                    }
                    if (tooClose) continue;

                    // Draw shaft from tail to tip
                    const tailX = cx - dx * arrowLen * 0.5;
                    const tailY = cy - dy * arrowLen * 0.5;
                    const tipX = cx + dx * arrowLen * 0.5;
                    const tipY = cy + dy * arrowLen * 0.5;

                    // Subtle background halo for outdoor legibility
                    ctx.save();
                    ctx.strokeStyle = "rgba(0,0,0,0.35)";
                    ctx.lineWidth = lineW + 3;
                    ctx.beginPath();
                    ctx.moveTo(tailX, tailY);
                    ctx.lineTo(tipX - dx * headLen * 0.5, tipY - dy * headLen * 0.5);
                    ctx.stroke();
                    ctx.restore();

                    ctx.strokeStyle = tideCol;
                    ctx.lineWidth = lineW;
                    ctx.beginPath();
                    ctx.moveTo(tailX, tailY);
                    ctx.lineTo(tipX - dx * headLen * 0.5, tipY - dy * headLen * 0.5);
                    ctx.stroke();

                    // Filled arrowhead
                    ctx.fillStyle = tideCol;
                    ctx.beginPath();
                    ctx.moveTo(tipX + dx * headLen * 0.6, tipY + dy * headLen * 0.6);
                    ctx.lineTo(tipX - dx * headLen * 0.4 + px * headLen * 0.55,
                        tipY - dy * headLen * 0.4 + py * headLen * 0.55);
                    ctx.lineTo(tipX - dx * headLen * 0.4 - px * headLen * 0.55,
                        tipY - dy * headLen * 0.4 - py * headLen * 0.55);
                    ctx.closePath();
                    ctx.fill();

                    // Drift label — placed at the tail end so it doesn't cover the tip
                    ctx.fillStyle = tideCol;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    const labelX = tailX - dx * (fontSize * 0.6);
                    const labelY = tailY - dy * (fontSize * 0.6);
                    // Dark outline for outdoor contrast
                    ctx.save();
                    ctx.strokeStyle = "rgba(0,0,0,0.5)";
                    ctx.lineWidth = Math.max(3, fontSize * 0.25);
                    ctx.lineJoin = "round";
                    ctx.strokeText(`${gridTs.drift.toFixed(1)}kn`, labelX, labelY);
                    ctx.restore();
                    ctx.fillText(`${gridTs.drift.toFixed(1)}kn`, labelX, labelY);
                }
            }
        }
    }

    // Draw legs
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (!a || !b) continue;
        const done = i < state.rounded;
        const upcoming = i === state.rounded;
        ctx.lineWidth = upcoming ? Math.max(3, W * 0.005) : Math.max(2, W * 0.0035);
        ctx.strokeStyle = done ? cssVar("--chart-leg-done", "#345a7d") : (upcoming ? cssVar("--accent", "#ffb000") : cssVar("--chart-leg-todo", "#e7eef5"));
        ctx.setLineDash(done ? [6, 6] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

        // Arrowhead at midpoint
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const ah = Math.max(6, W * 0.012);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(ang) * ah, my + Math.sin(ang) * ah);
        ctx.lineTo(mx + Math.cos(ang + 2.6) * ah, my + Math.sin(ang + 2.6) * ah);
        ctx.lineTo(mx + Math.cos(ang - 2.6) * ah, my + Math.sin(ang - 2.6) * ah);
        ctx.closePath();
        ctx.fill();
    }
    ctx.setLineDash([]);

    // Draw marks on top
    const markR = Math.max(5, Math.round(W * 0.012));
    pts.forEach((p, i) => {
        if (!p) return;
        const isStart = i === 0;
        const isFinish = i === pts.length - 1;
        const isCurrent = i === state.rounded;

        ctx.beginPath();
        ctx.arc(p.x, p.y, markR + (isCurrent ? 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = isStart ? cssVar("--good", "#2bb673") : isFinish ? cssVar("--accent", "#ffb000") : cssVar("--chart-mark-bg", "#f5f7fa");
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isCurrent ? cssVar("--accent", "#ffb000") : "#0a1a2c";
        ctx.stroke();

        // Side indicator
        if (p.side === "p" || (currentCourse().card.all_port && !p.side)) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, markR + 6, -0.3, Math.PI - 0.3);
            ctx.strokeStyle = "#d33"; ctx.lineWidth = 2; ctx.stroke();
        } else if (p.side === "s") {
            ctx.beginPath();
            ctx.arc(p.x, p.y, markR + 6, Math.PI - 0.3, 2 * Math.PI - 0.3);
            ctx.strokeStyle = "#1aa64a"; ctx.lineWidth = 2; ctx.stroke();
        }

        // Label
        ctx.fillStyle = cssVar("--chart-mark-text", "#0a1a2c");
        ctx.font = `bold ${Math.round(W * 0.02)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(p.mark, p.x, p.y);

        // Outside label with order #
        ctx.fillStyle = isCurrent ? cssVar("--accent", "#ffb000") : cssVar("--muted", "#cfd9e4");
        ctx.font = `${Math.round(W * 0.018)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(`${i + 1}`, p.x + markR + 4, p.y - markR - 2);
    });

    // GPS position
    if (state.gpsPos) {
        const [gx, gy] = project(state.gpsPos.lat, state.gpsPos.lon);

        // Heading wedge (drawn under the dot so the dot stays visible)
        if (state.headingOn && state.heading != null) {
            // Convert true bearing -> screen angle. Screen angle 0 is east,
            // we want compass 0 = up = -π/2.
            const rad = (state.heading - 90) * Math.PI / 180;
            const len = Math.max(28, W * 0.07);
            const half = 0.45; // wedge half-angle in radians (~26°)
            ctx.beginPath();
            ctx.moveTo(gx, gy);
            ctx.arc(gx, gy, len, rad - half, rad + half);
            ctx.closePath();
            const grad = ctx.createRadialGradient(gx, gy, Math.max(6, W * 0.013), gx, gy, len);
            grad.addColorStop(0, "rgba(58,160,255,.55)");
            grad.addColorStop(1, "rgba(58,160,255,0)");
            ctx.fillStyle = grad;
            ctx.fill();
        }

        // ring
        ctx.beginPath();
        ctx.arc(gx, gy, Math.max(6, W * 0.013), 0, Math.PI * 2);
        ctx.fillStyle = "#3aa0ff"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();

        // line to next mark
        const nextIdx = state.rounded;
        if (pts[nextIdx]) {
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 2; ctx.strokeStyle = "#3aa0ff";
            ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(pts[nextIdx].x, pts[nextIdx].y); ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

// ---------- Steer (big-arrow) view ----------
// A single, full-size arrow that points at the next mark on the True
// bearing. North is always up. No compass / device-orientation needed.
// If GPS is on we use boat->mark; otherwise we fall back to the leg
// bearing from the previous mark, which is what you should be sailing.
function drawSteerTo(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const accent = cssVar("--accent", "#ffb000");
    const text = cssVar("--text", "#e7eef5");
    const muted = cssVar("--muted", "#cfd9e4");

    // Find the target mark
    const c = currentCourse();
    const tokens = c.tokens || [];
    const nextIdx = state.rounded;
    const nextTok = tokens[nextIdx];
    const nextMarkLetter = nextTok ? nextTok.mark : null;
    const nextMark = nextMarkLetter ? MARKS[nextMarkLetter] : null;

    // Compute bearing & distance
    let bearingToMark = null, distanceToMark = null, src = null;
    if (state.gpsPos && nextMark) {
        const g = geo(state.gpsPos.lat, state.gpsPos.lon, nextMark.lat, nextMark.lon);
        bearingToMark = g.bearing;
        distanceToMark = g.distance;
        src = "gps";
    } else if (nextIdx > 0 && tokens[nextIdx - 1] && nextMark) {
        const prev = MARKS[tokens[nextIdx - 1].mark];
        if (prev) {
            const g = geo(prev.lat, prev.lon, nextMark.lat, nextMark.lon);
            bearingToMark = g.bearing;
            distanceToMark = g.distance;
            src = "leg";
        }
    } else if (nextMark && tokens[0] && tokens[0].mark === nextMarkLetter) {
        // Very first mark of the course — use the start->first-mark leg if
        // there's a second token, else just point along the wind axis as a
        // graceful fallback.
        if (tokens[1]) {
            const m2 = MARKS[tokens[1].mark];
            if (m2) {
                const g = geo(nextMark.lat, nextMark.lon, m2.lat, m2.lon);
                // bearing is roughly along the first leg; show it pointed at
                // the mark from the boat-direction perspective.
                bearingToMark = g.bearing;
                distanceToMark = null;
                src = "leg";
            }
        }
    }

    // Determine boat heading for relative arrow (prefer GPS COG, then compass)
    const gpsHeading = state.gpsPos && state.gpsPos.heading != null && state.gpsPos.speed != null && state.gpsPos.speed > 0.2
        ? state.gpsPos.heading : null;
    const boatHeading = gpsHeading !== null ? gpsHeading
        : (state.headingOn && state.heading != null ? state.heading : null);
    const headingRelative = boatHeading !== null;

    // Top orientation label
    ctx.font = `700 ${Math.round(W * 0.022)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = muted;
    const orientLabel = headingRelative
        ? (gpsHeading !== null ? "↑ Bow  (GPS COG)" : "↑ Bow  (compass)")
        : "N ↑";
    ctx.fillText(orientLabel, W / 2, Math.round(H * 0.025));

    // Layout: top text block, big arrow centred, bottom text block
    const topBlockH = Math.round(H * 0.10);
    const bottomBlockH = Math.round(H * 0.22);
    const arrowAreaH = H - topBlockH - bottomBlockH;
    const cx = W / 2;
    const cy = topBlockH + arrowAreaH / 2;

    // Empty / done states
    if (!nextMark) {
        ctx.fillStyle = muted;
        ctx.font = `${Math.round(W * 0.05)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("🏁  Course complete", cx, cy);
        return;
    }
    if (bearingToMark == null) {
        ctx.fillStyle = muted;
        ctx.font = `${Math.round(W * 0.035)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`Heading to ${nextMarkLetter}`, cx, cy - 18);
        ctx.fillStyle = text;
        ctx.fillText("Turn on GPS for live bearing", cx, cy + 18);
        return;
    }

    // ---- big arrow ----
    const arrowLen = Math.min(arrowAreaH, W) * 0.85;
    const shaftW = arrowLen * 0.14;
    const headW = arrowLen * 0.36;
    const headH = arrowLen * 0.32;
    const halfL = arrowLen / 2;

    // When we have a boat heading, rotate the arrow relative to the bow so
    // that "up" = the direction the boat is moving. E.g. heading 090, bearing
    // 000 → arrow points left (9 o'clock).
    const arrowAngle = headingRelative
        ? ((bearingToMark - boatHeading + 360) % 360)
        : bearingToMark;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((arrowAngle * Math.PI) / 180); // 0° = up
    // arrow shape pointing up before rotation
    ctx.beginPath();
    ctx.moveTo(0, -halfL);                      // tip
    ctx.lineTo(headW / 2, -halfL + headH);
    ctx.lineTo(shaftW / 2, -halfL + headH);
    ctx.lineTo(shaftW / 2, halfL);
    ctx.lineTo(-shaftW / 2, halfL);
    ctx.lineTo(-shaftW / 2, -halfL + headH);
    ctx.lineTo(-headW / 2, -halfL + headH);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.strokeStyle = "#0a1a2c";
    ctx.stroke();
    ctx.restore();

    // ---- top text: "Next mark"
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = muted;
    ctx.font = `600 ${Math.round(W * 0.024)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText("Next mark", cx, topBlockH * 0.55);

    // ---- bottom text block: bearing, mark + side, distance ----
    const baseY = H - bottomBlockH;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Bearing (big)
    ctx.fillStyle = accent;
    ctx.font = `800 ${Math.round(W * 0.07)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(fmtBearing(bearingToMark), cx, baseY + Math.round(H * 0.005));

    // "to <mark>  ·  Port/Stbd"
    const sideTok = nextTok && nextTok.side;
    const sideStr = (sideTok === "p" || (c.card && c.card.all_port && !sideTok))
        ? "  ·  Port"
        : sideTok === "s" ? "  ·  Stbd" : "";
    ctx.fillStyle = text;
    ctx.font = `600 ${Math.round(W * 0.034)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(`to ${nextMarkLetter}${sideStr}`, cx, baseY + Math.round(H * 0.10));

    // Distance + source
    ctx.fillStyle = muted;
    ctx.font = `${Math.round(W * 0.026)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    const distStr = distanceToMark != null ? fmtDist(distanceToMark) : "—";
    const srcStr = src === "gps" ? " · from GPS" : src === "leg" ? " · leg bearing" : "";
    ctx.fillText(`${distStr}${srcStr}`, cx, baseY + Math.round(H * 0.155));

    // ---- Tide-push arrow (relative to the next leg) ----
    // Draws a small tide arrow inside the bottom info block. The arrow points
    // in the direction the tide is SETTING relative to the bearing to the mark,
    // so "straight up" = tide is helping you, "straight down" = tide against you,
    // "left/right" = tide pushing you off the rhumb line.
    if (typeof tideStreamAt === "function" && hasTideStreamData() && bearingToMark != null) {
        const ts = tideStreamAt(nextMarkLetter, Date.now());
        if (ts && ts.drift >= 0.1) {
            const tideCol = cssVar("--chart-tide", "#5fc0ff");
            // Relative angle: 0° = tide running same direction as mark bearing (with you)
            const relDeg = ((ts.set - bearingToMark + 360) % 360);
            const relRad = (relDeg - 90) * Math.PI / 180; // screen: 0rad = east
            const tArrowLen = Math.round(W * 0.07);
            const tArrowHead = Math.round(W * 0.022);
            const tShaftW = Math.round(W * 0.015);
            // Position: bottom-right of the bottom block
            const tax = W - Math.round(W * 0.10);
            const tay = baseY + Math.round(H * 0.12);
            const tdx = Math.cos(relRad), tdy = Math.sin(relRad);
            const tsx = tax - tdx * tArrowLen / 2;
            const tsy = tay - tdy * tArrowLen / 2;
            const tex = tax + tdx * tArrowLen / 2;
            const tey = tay + tdy * tArrowLen / 2;
            // shaft
            ctx.strokeStyle = tideCol;
            ctx.lineWidth = tShaftW;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(tsx, tsy);
            ctx.lineTo(tex, tey);
            ctx.stroke();
            ctx.lineCap = "butt";
            // arrowhead
            ctx.fillStyle = tideCol;
            const tpx = -tdy, tpy = tdx;
            ctx.beginPath();
            ctx.moveTo(tex + tdx * tArrowHead, tey + tdy * tArrowHead);
            ctx.lineTo(tex - tdx * tArrowHead * 0.35 + tpx * tArrowHead * 0.6,
                tey - tdy * tArrowHead * 0.35 + tpy * tArrowHead * 0.6);
            ctx.lineTo(tex - tdx * tArrowHead * 0.35 - tpx * tArrowHead * 0.6,
                tey - tdy * tArrowHead * 0.35 - tpy * tArrowHead * 0.6);
            ctx.closePath();
            ctx.fill();
            // drift label next to the arrow
            ctx.fillStyle = tideCol;
            ctx.font = `600 ${Math.round(W * 0.022)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText(`${ts.drift.toFixed(1)} kn`, tax - tArrowLen / 2 - 4, tay + Math.round(W * 0.005));
        }
    }
}

// Wrap renderAll to also redraw the chart
const _origRenderAll = renderAll;
renderAll = function () { _origRenderAll(); renderChart(); };

// Re-render chart whenever GPS updates (renderNow already runs, but the
// chart bounds may now include the boat position).
const _origRenderNow = renderNow;
renderNow = function () { _origRenderNow(); renderChart(); };

resizeChart();
renderAll();

// ============================================================
// Service worker (offline / installable)
// ============================================================
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch((err) => {
            console.warn("SW registration failed:", err);
        });
        // Reload once when a new SW takes control so users get fresh data.
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        // Soft update prompt: when stale-while-revalidate finds a fresher
        // copy of the app shell in the background, the SW posts us a
        // message. We show a small toast with a Reload button so the user
        // can grab the update right now instead of waiting for the next
        // launch. Debounced so multiple changed files = one toast.
        const updateToast = document.getElementById("updateToast");
        const utReload = document.getElementById("utReload");
        const utClose = document.getElementById("utClose");
        let updateShown = false;
        let updateDismissed = false;

        function showUpdateToast() {
            if (updateShown || updateDismissed || !updateToast) return;
            updateShown = true;
            updateToast.hidden = false;
        }
        function hideUpdateToast() {
            if (!updateToast) return;
            updateToast.hidden = true;
            updateShown = false;
        }
        if (utReload) {
            utReload.addEventListener("click", () => {
                window.location.reload();
            });
        }
        if (utClose) {
            utClose.addEventListener("click", () => {
                updateDismissed = true; // don't pester again this session
                hideUpdateToast();
            });
        }
        navigator.serviceWorker.addEventListener("message", (event) => {
            if (event.data && event.data.type === "update-available") {
                showUpdateToast();
            }
        });
    });
}

// ============================================================
// Android install prompt
// ============================================================
let deferredPrompt = null;
const btnInstall = document.getElementById("btnInstall");
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall) btnInstall.hidden = false;
    // Re-render the banner now that we have the native prompt available
    renderInstallBanner();
});
if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        btnInstall.hidden = true;
    });
}

// ============================================================
// Install banner (one-time, dismissible, platform-aware)
// ============================================================
const installBanner = document.getElementById("installBanner");
const ibBody = document.getElementById("ibBody");
const ibClose = document.getElementById("ibClose");
const lnkInstallHelp = document.getElementById("lnkInstallHelp");

// One-time migration: earlier versions used localStorage for "dismissed",
// which made the banner never come back. Drop that so users who closed
// it on a previous visit see it again. The new logic only persists
// dismissal when the app is actually installed (`dbsc.installed`).
try { localStorage.removeItem("dbsc.installDismissed"); } catch (_) { }

function isStandalone() {
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        window.navigator.standalone === true
    );
}

function detectPlatform() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const isAndroid = /Android/.test(ua);
    return {
        ios: isIOS || isIPadOS,
        android: isAndroid,
        desktop: !isIOS && !isIPadOS && !isAndroid,
    };
}

function instructionsFor(platform) {
    if (platform.ios) {
        return `
            <div>Add to your home screen for an offline, full-screen app:</div>
            <ol>
                <li>Tap the <strong>Share</strong> icon at the bottom of Safari.</li>
                <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> — the icon appears on your home screen.</li>
            </ol>`;
    }
    if (platform.android) {
        return `
            <div>Add to your home screen for an offline, full-screen app:</div>
            <ol>
                <li>Tap the menu in Chrome.</li>
                <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                <li>Confirm — the app icon will appear on your home screen.</li>
            </ol>`;
    }
    return `
        <div>You can install this as a desktop app:</div>
        <ol>
            <li>In Chrome / Edge, click the install icon in the address bar.</li>
            <li>Or open the browser menu and choose <strong>Install DBSC Race Course</strong>.</li>
        </ol>`;
}

function renderInstallBanner(force) {
    if (!installBanner || !ibBody) return;
    if (isStandalone()) { installBanner.hidden = true; return; }
    // Permanent dismissal only when the user actually installed.
    if (localStorage.getItem("dbsc.installed") === "1" && !force) { installBanner.hidden = true; return; }
    // Soft dismissal lasts only until the tab is closed.
    if (sessionStorage.getItem("dbsc.installHidden") === "1" && !force) { installBanner.hidden = true; return; }

    const platform = detectPlatform();
    let html = instructionsFor(platform);

    // On Android we usually have a native prompt too — offer it as a CTA.
    if (platform.android && deferredPrompt) {
        html += `<button class="ib-cta" id="ibInstall" type="button">Install now</button>`;
    }

    ibBody.innerHTML = html;
    installBanner.hidden = false;

    const ibInstall = document.getElementById("ibInstall");
    if (ibInstall) {
        ibInstall.addEventListener("click", async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (choice && choice.outcome === "accepted") {
                installBanner.hidden = true;
                localStorage.setItem("dbsc.installed", "1");
            }
        });
    }
}

if (ibClose) {
    ibClose.addEventListener("click", () => {
        installBanner.hidden = true;
        // Only hide for this session — reappear on next visit until installed.
        sessionStorage.setItem("dbsc.installHidden", "1");
    });
}
if (lnkInstallHelp) {
    lnkInstallHelp.addEventListener("click", (e) => {
        e.preventDefault();
        // Open the help guide — installation instructions are in section 8
        const helpModal = document.getElementById("helpModal");
        if (helpModal) {
            helpModal.hidden = false;
            // Scroll to the install section after modal is visible
            setTimeout(() => {
                const installSection = helpModal.querySelector("section:last-of-type");
                if (installSection) installSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
        }
    });
}

// Hide banner once installed
window.addEventListener("appinstalled", () => {
    if (installBanner) installBanner.hidden = true;
    if (btnInstall) btnInstall.hidden = true;
    localStorage.setItem("dbsc.installed", "1");
});

renderInstallBanner();

// ---------- welcome / how-to-use modal ----------
(function setupWelcome() {
    const welcomeModal = document.getElementById("welcomeModal");
    const helpModal = document.getElementById("helpModal");
    const welcomeOk = document.getElementById("welcomeOk");
    const helpClose = document.getElementById("helpClose");
    const helpOk = document.getElementById("helpOk");
    const helpBtn = document.getElementById("btnHelp");
    if (!welcomeModal) return;

    const SEEN_KEY = "dbsc.welcomeSeen";

    const openWelcome = () => { welcomeModal.hidden = false; };
    const closeWelcome = () => {
        welcomeModal.hidden = true;
        try { localStorage.setItem(SEEN_KEY, "1"); } catch (_) { }
    };

    const openHelp = () => { if (helpModal) helpModal.hidden = false; };
    const closeHelp = () => { if (helpModal) helpModal.hidden = true; };

    if (welcomeOk) welcomeOk.addEventListener("click", closeWelcome);
    welcomeModal.addEventListener("click", (e) => { if (e.target === welcomeModal) closeWelcome(); });

    if (helpBtn) helpBtn.addEventListener("click", openHelp);
    if (helpClose) helpClose.addEventListener("click", closeHelp);
    if (helpOk) helpOk.addEventListener("click", closeHelp);
    if (helpModal) {
        helpModal.addEventListener("click", (e) => { if (e.target === helpModal) closeHelp(); });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (helpModal && !helpModal.hidden) { closeHelp(); return; }
            if (!welcomeModal.hidden) closeWelcome();
        }
    });

    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch (_) { }
    if (!seen) openWelcome();
})();

// ============================================================
// Tabs (Course / Today / Docs)
// ============================================================
const tabButtons = document.querySelectorAll(".tabs .tab");
const views = {
    course: document.getElementById("view-course"),
    start: document.getElementById("view-start"),
    today: document.getElementById("view-today"),
    docs: document.getElementById("view-docs"),
};
function showTab(name) {
    for (const btn of tabButtons) {
        const active = btn.dataset.tab === name;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const [k, el] of Object.entries(views)) {
        if (!el) continue;
        if (k === name) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
    }
    if (name === "course") {
        // Recompute chart size in case it was hidden when last resized
        try { resizeChart(); } catch (_) { }
    }
}
tabButtons.forEach((b) => b.addEventListener("click", () => {
    showTab(b.dataset.tab);
    // In landscape, close the slide-down nav after picking a tab
    closeLsNav();
}));

// ============================================================
// Accordion sections
// ============================================================
const AC_KEY = "ac-state-v1";

function initAccordions() {
    // Default open/closed for first-ever visit (no localStorage)
    const defaults = {
        "ac-setup": true,
        "ac-overview": true,
        "ac-nav": false,   // Racing Controls closed until user is ready to race
        "ac-chart": true,
        "ac-legs": true,
    };

    // Load any previously saved state
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(AC_KEY) || "{}"); } catch (_) { }

    const state = Object.assign({}, defaults, saved);

    function saveState() {
        const current = {};
        for (const id of Object.keys(defaults)) {
            const el = document.getElementById(id);
            if (el) current[id] = el.classList.contains("open");
        }
        try { localStorage.setItem(AC_KEY, JSON.stringify(current)); } catch (_) { }
    }

    for (const [id, isOpen] of Object.entries(state)) {
        const section = document.getElementById(id);
        if (!section) continue;
        const btn = section.querySelector(".ac-hd");

        // Apply saved/default state
        section.classList.toggle("open", isOpen);
        if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");

        // Wire toggle on header click
        if (btn) {
            btn.addEventListener("click", () => {
                const opening = !section.classList.contains("open");
                section.classList.toggle("open", opening);
                btn.setAttribute("aria-expanded", opening ? "true" : "false");
                saveState();
                // If the chart accordion was just opened, resize the canvas
                if (id === "ac-chart" && opening) {
                    try { resizeChart(); } catch (_) { }
                }
            });
        }
    }
}

initAccordions();

// ============================================================
// Layout settings panel
// ============================================================
const LAYOUT_KEY = "layout-v1";
const LAYOUT_SECTIONS = [
    { id: "ac-setup", label: "Select Course", col: "left", visible: true },
    { id: "ac-overview", label: "Race Overview", col: "left", visible: true },
    { id: "ac-nav", label: "Racing Controls", col: "left", visible: true },
    { id: "ac-chart", label: "Chart", col: "right", visible: true },
    { id: "ac-legs", label: "Legs", col: "right", visible: true },
];

function applyLayout(settings) {
    const left = document.querySelector(".course-left");
    const right = document.querySelector(".course-right");
    if (!left || !right) return;
    // Always appendChild in settings-array order so DOM order within each
    // column is always correct, regardless of previous L/R toggles.
    for (const s of settings) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const target = s.col === "right" ? right : left;
        target.appendChild(el);
        el.hidden = !s.visible;
    }
}

function saveLayout(settings) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(settings)); } catch (_) { }
}

function initLayoutSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch (_) { }
    const settings = saved || LAYOUT_SECTIONS.map(s => ({ ...s }));
    applyLayout(settings);

    const panel = document.getElementById("settingsPanel");
    const rowsEl = document.getElementById("settingsRows");
    const btnOpen = document.getElementById("btnSettings");
    const btnClose = document.getElementById("btnSettingsClose");
    const btnDone = document.getElementById("btnSettingsDone");
    const btnReset = document.getElementById("btnSettingsReset");

    function buildRows(cfg) {
        if (!rowsEl) return;
        rowsEl.innerHTML = "";
        for (let i = 0; i < cfg.length; i++) {
            const s = cfg[i];
            const row = document.createElement("div");
            row.className = "settings-row";
            row.innerHTML =
                `<button class="settings-vis${s.visible ? " active" : ""}" data-id="${s.id}" type="button" title="${s.visible ? "Hide section" : "Show section"}">&#x1F441;</button>` +
                `<span class="settings-label${!s.visible ? " muted" : ""}">${s.label}</span>` +
                `<div class="settings-order">` +
                `<button class="settings-ord-btn" data-id="${s.id}" data-dir="up" type="button" aria-label="Move up"${i === 0 ? " disabled" : ""}>↑</button>` +
                `<button class="settings-ord-btn" data-id="${s.id}" data-dir="down" type="button" aria-label="Move down"${i === cfg.length - 1 ? " disabled" : ""}>↓</button>` +
                `</div>` +
                `<div class="settings-cols">` +
                `<button class="settings-col-btn${s.col === "left" ? " active" : ""}" data-id="${s.id}" data-col="left" type="button">L</button>` +
                `<button class="settings-col-btn${s.col === "right" ? " active" : ""}" data-id="${s.id}" data-col="right" type="button">R</button>` +
                `</div>`;
            rowsEl.appendChild(row);
        }
        rowsEl.querySelectorAll(".settings-vis").forEach(btn => {
            btn.addEventListener("click", () => {
                const item = cfg.find(s => s.id === btn.dataset.id);
                if (item) { item.visible = !item.visible; applyLayout(cfg); saveLayout(cfg); buildRows(cfg); }
            });
        });
        rowsEl.querySelectorAll(".settings-ord-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const idx = cfg.findIndex(s => s.id === btn.dataset.id);
                if (idx < 0) return;
                if (btn.dataset.dir === "up" && idx > 0) {
                    [cfg[idx - 1], cfg[idx]] = [cfg[idx], cfg[idx - 1]];
                } else if (btn.dataset.dir === "down" && idx < cfg.length - 1) {
                    [cfg[idx], cfg[idx + 1]] = [cfg[idx + 1], cfg[idx]];
                }
                applyLayout(cfg); saveLayout(cfg); buildRows(cfg);
            });
        });
        rowsEl.querySelectorAll(".settings-col-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const item = cfg.find(s => s.id === btn.dataset.id);
                if (item) { item.col = btn.dataset.col; applyLayout(cfg); saveLayout(cfg); buildRows(cfg); }
            });
        });
    }

    buildRows(settings);

    if (btnOpen) btnOpen.addEventListener("click", () => { if (panel) panel.removeAttribute("hidden"); });
    if (btnClose) btnClose.addEventListener("click", () => { if (panel) panel.setAttribute("hidden", ""); });
    if (btnDone) btnDone.addEventListener("click", () => { if (panel) panel.setAttribute("hidden", ""); });
    if (btnReset) btnReset.addEventListener("click", () => {
        const defaults = LAYOUT_SECTIONS.map(s => ({ ...s }));
        applyLayout(defaults); saveLayout(defaults); buildRows(defaults);
    });
}

initLayoutSettings();

// ============================================================
// Accordion helper — programmatic open/close from outside initAccordions
// ============================================================
function setAccordion(id, open) {
    const section = document.getElementById(id);
    if (!section) return;
    const btn = section.querySelector(".ac-hd");
    section.classList.toggle("open", open);
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (id === "ac-chart" && open) {
        try { resizeChart(); } catch (_) { }
    }
}

// ============================================================
// Race Start Sequence
// ============================================================
(function initStartSequence() {
    // --- DOM refs ---
    const statusEl = document.getElementById("startStatus");
    const clockEl = document.getElementById("startClock");
    const labelEl = document.getElementById("startClockLabel");
    const adjustEl = document.getElementById("startAdjust");
    const btnGo = document.getElementById("btnStartGo");
    const btnFinish = document.getElementById("btnStartFinish");
    const btnReset = document.getElementById("btnStartReset");
    const btnMinus = document.getElementById("btnStartMinus");
    const btnPlus = document.getElementById("btnStartPlus");
    const btnSync = document.getElementById("btnStartSync");
    const signalRows = document.querySelectorAll("#startSignals .start-signal-row");

    if (!clockEl) return; // view not in DOM

    // --- State ---
    const DEFAULT_SECS = 300; // 5 minutes
    let phase = "idle";   // idle | countdown | racing | finished
    let remaining = DEFAULT_SECS;
    let elapsed = 0;
    let ticker = null;

    // --- Helpers ---
    function fmtMSS(secs) {
        const m = Math.floor(Math.abs(secs) / 60);
        const s = Math.abs(secs) % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    function updateClock() {
        if (phase === "countdown" || phase === "idle") {
            clockEl.textContent = fmtMSS(remaining);
            clockEl.classList.toggle("warn", phase === "countdown" && remaining < 60);
            labelEl.textContent = "Time to gun";
        } else if (phase === "racing") {
            clockEl.textContent = fmtMSS(elapsed);
            clockEl.classList.remove("warn");
            labelEl.textContent = "Race elapsed";
        } else if (phase === "finished") {
            clockEl.textContent = fmtMSS(elapsed);
            clockEl.classList.remove("warn");
            labelEl.textContent = "Race time";
        }
    }

    // Signal strip: mark each row as past / active / upcoming
    function updateSignals() {
        signalRows.forEach(row => {
            const at = parseInt(row.dataset.at, 10);
            row.classList.remove("active", "past", "gun", "upcoming");
            if (phase === "idle") {
                // No styling — all neutral
            } else if (phase === "racing" || phase === "finished") {
                // All signals past; gun row gets special colour
                row.classList.add(at === 0 ? "gun" : "past");
            } else {
                // countdown
                if (remaining <= at) {
                    row.classList.add(at === 0 ? "gun" : "past");
                } else if (remaining <= at + 5) {
                    // just passed — keep as active for a moment (handled by exact tick)
                    row.classList.add("past");
                } else {
                    // upcoming
                }
                // The signal that just fired (within ~5 s window)
                if (remaining <= at && remaining > at - 5 && at > 0) {
                    row.classList.remove("past");
                    row.classList.add("active");
                }
                // Gun row: active when exactly at 0
                if (at === 0 && remaining === 0) {
                    row.classList.remove("past");
                    row.classList.add("gun");
                }
            }
        });
    }

    function setPhaseUI() {
        if (!statusEl) return;
        statusEl.setAttribute("data-phase", phase);
        const labels = {
            idle: "Preparatory",
            countdown: "Sequence running",
            racing: "Racing",
            finished: "Finished",
        };
        statusEl.textContent = labels[phase] || phase;
    }

    function applyGun() {
        // Switch to Course tab and arrange accordions for racing
        showTab("course");
        setAccordion("ac-overview", true);
        setAccordion("ac-chart", true);
        setAccordion("ac-setup", false);
        setAccordion("ac-nav", false);
        setAccordion("ac-legs", false);
        showToast("🔫 Gun! Race started — good luck!");
    }

    function triggerGun() {
        stopTicker();
        remaining = 0;
        phase = "racing";
        elapsed = 0;
        setPhaseUI();
        updateClock();
        updateSignals();
        if (adjustEl) adjustEl.hidden = true;
        if (btnFinish) btnFinish.removeAttribute("hidden");
        // start elapsed ticker
        startTicker();
        applyGun();
    }

    function tick() {
        if (phase === "countdown") {
            remaining--;
            if (remaining <= 0) {
                triggerGun();
                return;
            }
            updateClock();
            updateSignals();
        } else if (phase === "racing") {
            elapsed++;
            updateClock();
        }
    }

    function startTicker() {
        if (ticker) clearInterval(ticker);
        ticker = setInterval(tick, 1000);
    }

    function stopTicker() {
        if (ticker) { clearInterval(ticker); ticker = null; }
    }

    function doReset() {
        stopTicker();
        phase = "idle";
        remaining = DEFAULT_SECS;
        elapsed = 0;
        setPhaseUI();
        updateClock();
        updateSignals();
        if (adjustEl) adjustEl.removeAttribute("hidden");
        if (btnGo) btnGo.removeAttribute("hidden");
        if (btnFinish) btnFinish.setAttribute("hidden", "");
        if (btnReset) btnReset.setAttribute("hidden", "");
    }

    // --- Button handlers ---
    if (btnGo) btnGo.addEventListener("click", () => {
        if (phase !== "idle") return;
        phase = "countdown";
        setPhaseUI();
        updateClock();
        updateSignals();
        btnGo.setAttribute("hidden", "");
        if (btnReset) btnReset.removeAttribute("hidden");
        startTicker();
    });

    if (btnMinus) btnMinus.addEventListener("click", () => {
        if (phase !== "countdown") return;
        remaining = remaining - 60;
        if (remaining <= 0) { triggerGun(); return; }
        updateClock();
        updateSignals();
    });

    if (btnPlus) btnPlus.addEventListener("click", () => {
        if (phase !== "countdown") return;
        remaining += 60;
        updateClock();
        updateSignals();
    });

    if (btnSync) btnSync.addEventListener("click", () => {
        if (phase !== "countdown") return;
        remaining = Math.floor(remaining / 60) * 60;
        // If already under 1 min, syncing to 0 fires the gun
        if (remaining <= 0) { triggerGun(); return; }
        updateClock();
        updateSignals();
    });

    if (btnFinish) btnFinish.addEventListener("click", () => {
        if (phase !== "racing") return;
        stopTicker();
        phase = "finished";
        setPhaseUI();
        updateClock();
        updateSignals();
        btnFinish.setAttribute("hidden", "");
        if (btnReset) btnReset.removeAttribute("hidden");
        showToast(`🏁 Race finished — elapsed time ${fmtMSS(elapsed)}`);
    });

    if (btnReset) btnReset.addEventListener("click", doReset);

    // Initial render
    updateClock();
    updateSignals();
    setPhaseUI();
}());


const lsBackdrop = document.getElementById("lsBackdrop");
const headerEl = document.querySelector("header");

function openLsNav() {
    if (!headerEl) return;
    headerEl.classList.add("ls-open");
    if (lsBackdrop) lsBackdrop.removeAttribute("hidden");
}

function closeLsNav() {
    if (!headerEl) return;
    headerEl.classList.remove("ls-open");
    if (lsBackdrop) lsBackdrop.setAttribute("hidden", "");
}

if (btnLsMenu) {
    btnLsMenu.addEventListener("click", (e) => {
        e.stopPropagation();
        if (headerEl && headerEl.classList.contains("ls-open")) {
            closeLsNav();
        } else {
            openLsNav();
        }
    });
}

if (lsBackdrop) {
    lsBackdrop.addEventListener("click", closeLsNav);
}

// ============================================================
// Schedule (Today view) — date + boat -> recommended card
// ============================================================
let SCHED = null;
const todayDate = document.getElementById("todayDate");
const todayBoat = document.getElementById("todayBoat");
const btnFindRace = document.getElementById("btnFindRace");
const todayResult = document.getElementById("todayResult");

function todayIsoLocal() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
}
todayDate.value = todayIsoLocal();

const btnDateToday = document.getElementById("btnDateToday");
if (btnDateToday) {
    btnDateToday.addEventListener("click", () => {
        todayDate.value = todayIsoLocal();
        if (todayBoat.value) findRace();
    });
}

function applySchedule(s) {
    if (!s) return;
    SCHED = s;
    // Populate boat dropdown
    todayBoat.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— Select a boat / class —";
    todayBoat.appendChild(placeholder);
    for (const b of s.boats || []) {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.name;
        todayBoat.appendChild(opt);
    }
    const saved = localStorage.getItem("dbsc.boat");
    if (saved && s.boats.some((b) => b.id === saved)) todayBoat.value = saved;
}

todayBoat.addEventListener("change", () => {
    if (todayBoat.value) localStorage.setItem("dbsc.boat", todayBoat.value);
});

function dayKeyFromDateStr(iso) {
    // iso = "YYYY-MM-DD"; build a local date so weekday matches user expectation
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = dt.getDay(); // 0 Sun, 2 Tue, 4 Thu, 6 Sat
    if (wd === 2) return "tue";
    if (wd === 4) return "thu";
    if (wd === 6) return "sat";
    return null;
}

function findRace() {
    const headerMeta = document.getElementById("headerMeta");
    if (headerMeta) headerMeta.setAttribute("hidden", "");
    if (!SCHED) {
        todayResult.innerHTML = `<div class="card"><div class="big">Schedule still loading…</div></div>`;
        return;
    }
    const dateStr = todayDate.value;
    const boatId = todayBoat.value;
    if (!dateStr || !boatId) {
        todayResult.innerHTML = `<div class="card"><div class="big">Pick a date and a boat.</div></div>`;
        return;
    }
    const dayKey = dayKeyFromDateStr(dateStr);
    const boat = (SCHED.boats || []).find((b) => b.id === boatId);
    const dt = new Date(dateStr);
    const dateLabel = dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });

    if (!dayKey) {
        return showRecommend({
            warn: true,
            day: dateLabel,
            big: "No DBSC racing on this day",
            note: "DBSC races on Tuesdays, Thursdays, and Saturdays. Pick another date.",
        });
    }
    if (!boat || !boat[dayKey]) {
        return showRecommend({
            warn: true,
            day: dateLabel,
            big: `${boat ? boat.name : "Your class"} doesn't race on ${dayKey === "tue" ? "Tuesdays" : dayKey === "thu" ? "Thursdays" : "Saturdays"}`,
            note: "Try another day, or check the Racing Programme PDF in the Docs tab.",
        });
    }

    const dayInfo = boat[dayKey]; // {flag, warn, fleet?, group?}
    const cal = (SCHED.calendar && SCHED.calendar[dayKey]) || [];
    const inCal = dayKey === "sat"
        ? cal.find((e) => e.date === dateStr)
        : (cal.includes(dateStr) ? { date: dateStr } : null);

    if (!inCal) {
        return showRecommend({
            warn: true,
            day: dateLabel,
            big: "Not on the 2026 schedule",
            note: `No DBSC ${dayKey === "tue" ? "Tuesday" : dayKey === "thu" ? "Thursday" : "Saturday"} race is listed for this date in the 2026 programme.`,
        });
    }

    // Resolve which course card slot
    let slotKey = null;
    let extraNote = inCal.note || "";
    if (dayKey === "tue") {
        slotKey = "tue_hut";
    } else if (dayKey === "thu") {
        slotKey = dayInfo.fleet === "red" ? "thu_red_freebird" : "thu_blue_corinthian";
    } else if (dayKey === "sat") {
        const hut = inCal.hut; // "blue" | "red" | "none" | "regatta"
        if (hut === "regatta") {
            return showRecommend({
                warn: true,
                day: dateLabel,
                big: "Regatta — no DBSC racing",
                note: extraNote || "An external club regatta is on; DBSC isn't running races on this Saturday.",
            });
        }
        const grp = dayInfo.group;
        if (grp === "alwaysHut") slotKey = "sat_hut";
        else if (grp === "satGreen") slotKey = "sat_green";
        else if (grp === "alwaysCorinthian") slotKey = "sat_corinthian";
        else if (hut === "none") slotKey = "sat_corinthian"; // coastal/special: everyone CV
        else if (grp === "satBlue") slotKey = (hut === "blue") ? "sat_hut" : "sat_corinthian";
        else if (grp === "satRed") slotKey = (hut === "red") ? "sat_hut" : "sat_corinthian";
        else slotKey = "sat_corinthian";
    }

    const slot = SCHED.cards && SCHED.cards[slotKey];
    if (!slot) {
        return showRecommend({
            warn: true,
            day: dateLabel,
            big: "Couldn't determine a course card",
            note: "Schedule data is incomplete for this combination — please check the PDFs in the Docs tab.",
        });
    }

    // Slots without a course card (e.g. Green Fleet windward/leeward) get a
    // tailored result that points at the relevant Sailing Instructions PDF
    // instead of opening a CC card.
    if (!slot.card) {
        const noteParts = [];
        if (slot.format) noteParts.push(slot.format);
        if (slot.note) noteParts.push(slot.note);
        if (extraNote) noteParts.push(extraNote);
        return showRecommend({
            warn: false,
            day: dateLabel + " • " + slot.name,
            big: boat.name,
            rows: [
                ["Format", slot.format ? "W/L" : "—"],
                ["VHF channel", "Ch " + slot.vhf],
                ["Warning signal", dayInfo.warn || "—"],
                ["Class flag", dayInfo.flag || "—"],
            ],
            note: noteParts.join(" "),
            openPdf: slot.pdf || null,
            openPdfLabel: "Open Sailing Instructions →",
        });
    }

    showRecommend({
        warn: false,
        day: dateLabel + " • " + slot.name,
        big: `${boat.name} → ${slot.card}`,
        rows: [
            ["Course card", slot.card],
            ["VHF channel", "Ch " + slot.vhf],
            ["Warning signal", dayInfo.warn || "—"],
            ["Class flag", dayInfo.flag || "—"],
        ],
        note: extraNote || (dayKey === "sat" && inCal.hut ? `Saturday hut colour: ${inCal.hut}.` : ""),
        openCard: slot.card,
        metaText: `${boat.name} · ${dateLabel}`,
    });
}

function showRecommend({ warn, day, big, rows, note, openCard, openPdf, openPdfLabel, metaText }) {
    todayResult.classList.toggle("warn", !!warn);
    const headerMeta = document.getElementById("headerMeta");
    if (headerMeta) {
        if (metaText) { headerMeta.textContent = metaText; headerMeta.removeAttribute("hidden"); }
        else { headerMeta.setAttribute("hidden", ""); }
    }
    const rowsHtml = rows
        ? `<div class="grid">${rows.map(([l, v]) => `<div><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join("")}</div>`
        : "";
    const noteHtml = note ? `<div class="note">${note}</div>` : "";
    const btnHtml = openCard
        ? `<button id="btnOpenCard" type="button">Open ${openCard} →</button>`
        : (openPdf ? `<a id="btnOpenPdf" class="pdf-btn" href="${openPdf}" target="_blank" rel="noopener">${openPdfLabel || "Open PDF →"}</a>` : "");
    todayResult.innerHTML = `
        <div class="card">
            <div class="day">${day}</div>
            <div class="big">${big}</div>
            ${rowsHtml}
            ${noteHtml}
            ${btnHtml}
        </div>`;
    const openBtn = document.getElementById("btnOpenCard");
    if (openBtn && openCard) {
        openBtn.addEventListener("click", () => {
            if (CARDS && CARDS[openCard]) {
                state.cardId = openCard;
                state.rounded = 0;
                cardSel.value = openCard;
                populateWinds(); populateCourses(); saveSelection(); renderAll();
            }
            showTab("course");
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }
}

btnFindRace.addEventListener("click", findRace);
todayDate.addEventListener("change", () => { if (todayBoat.value) findRace(); });
todayBoat.addEventListener("change", () => { if (todayDate.value) findRace(); });

// Fetch schedule.json (network-first via SW; falls back to cache when offline).
fetch("schedule.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => { if (s) applySchedule(s); renderCountdown(); })
    .catch(() => { /* offline – feature unavailable until first online run */ });

// ============================================================
// Theme toggle (light / dark)
// ============================================================
// Resolution order:
//   1. explicit user choice in localStorage ("dbsc.theme" = "light"|"dark")
//   2. system `prefers-color-scheme`
//   3. light (default)
(function initTheme() {
    const saved = localStorage.getItem("dbsc.theme");
    let theme;
    if (saved === "light" || saved === "dark") {
        theme = saved;
    } else {
        theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
            ? "dark" : "light";
    }
    applyTheme(theme);
    // Track system changes when the user has no explicit override.
    if (!saved && window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener && mq.addEventListener("change", (e) => {
            if (!localStorage.getItem("dbsc.theme")) {
                applyTheme(e.matches ? "dark" : "light");
            }
        });
    }
})();

function applyTheme(theme) {
    if (theme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
        if (btnTheme) btnTheme.textContent = "☀️";
    } else {
        document.documentElement.removeAttribute("data-theme");
        if (btnTheme) btnTheme.textContent = "🌙";
    }
    // Theme colour for the OS chrome (status bar tint on installed app).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#eaf0f7" : "#0b3d66");
    // Canvas colours come from CSS variables, so re-render.
    if (typeof renderChart === "function") renderChart();
}

if (btnTheme) {
    btnTheme.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        const next = current === "light" ? "dark" : "light";
        localStorage.setItem("dbsc.theme", next);
        applyTheme(next);
    });
}

// ============================================================
// Compass / device-orientation heading
// ============================================================
// On iOS 13+ DeviceOrientationEvent requires an explicit user-gesture
// permission grant. Older Android & desktop just work after addEventListener.
let _orientHandler = null;

function stopCompass() {
    if (_orientHandler) {
        window.removeEventListener("deviceorientationabsolute", _orientHandler);
        window.removeEventListener("deviceorientation", _orientHandler);
        _orientHandler = null;
    }
    state.headingOn = false;
    state.heading = null;
    state.headingTrue = false;
    if (btnCompass) {
        btnCompass.textContent = "🧭 Compass";
        btnCompass.classList.remove("primary");
    }
    renderNow();
    renderChart();
}

function startCompass() {
    if (typeof DeviceOrientationEvent === "undefined") {
        alert("This device doesn't expose orientation data.");
        return;
    }
    const begin = () => {
        _orientHandler = (e) => {
            // Prefer iOS's webkit compass (already true / magnetic-corrected),
            // then absolute alpha (deviceorientationabsolute), then plain alpha.
            let h = null, isTrue = false;
            if (typeof e.webkitCompassHeading === "number") {
                h = e.webkitCompassHeading; // 0 = north, increasing clockwise
                isTrue = true;
            } else if (e.absolute && typeof e.alpha === "number") {
                h = (360 - e.alpha) % 360;
                isTrue = true;
            } else if (typeof e.alpha === "number") {
                h = (360 - e.alpha) % 360;
                isTrue = false;
            }
            if (h == null) return;
            state.heading = h;
            state.headingTrue = isTrue;
            state.headingOn = true;
            // Throttle re-render: only redraw if heading changed by ≥ 2°.
            if (state._lastDrawnHeading == null || Math.abs(h - state._lastDrawnHeading) > 2) {
                state._lastDrawnHeading = h;
                renderNow();
                renderChart();
            }
        };
        window.addEventListener("deviceorientationabsolute", _orientHandler, true);
        window.addEventListener("deviceorientation", _orientHandler, true);
        if (btnCompass) {
            btnCompass.textContent = "🧭 Compass on";
            btnCompass.classList.add("primary");
        }
    };

    // iOS 13+ permission API
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
            .then((res) => { if (res === "granted") begin(); else alert("Compass permission denied."); })
            .catch(() => alert("Couldn't request compass permission."));
    } else {
        begin();
    }
}

if (btnCompass) {
    btnCompass.addEventListener("click", () => {
        if (state.headingOn || _orientHandler) stopCompass();
        else startCompass();
    });
}

// ============================================================
// Fullscreen chart modal
// ============================================================
function resizeBigChart() {
    if (!chartBig) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = chartBig.clientWidth;
    const cssH = chartBig.clientHeight;
    chartBig.width = Math.round(cssW * dpr);
    chartBig.height = Math.round(cssH * dpr);
}

function openChartModal() {
    if (!chartModal) return;
    state.chartFullscreen = true;
    chartModal.hidden = false;
    // Wait for layout so clientWidth/Height are populated.
    requestAnimationFrame(() => {
        resizeBigChart();
        drawChartTo(chartBig);
    });
}

function closeChartModal() {
    state.chartFullscreen = false;
    if (chartModal) chartModal.hidden = true;
}

if (btnExpandChart) btnExpandChart.addEventListener("click", openChartModal);
if (cmClose) cmClose.addEventListener("click", closeChartModal);
if (chartModal) {
    chartModal.addEventListener("click", (e) => {
        // Tap outside the canvas (i.e. on the backdrop) also closes.
        if (e.target === chartModal) closeChartModal();
    });
}

// ---------- Chart / Steer view toggle ----------
(function setupViewToggle() {
    const btn = document.getElementById("btnViewToggle");
    if (!btn) return;
    function apply() {
        const isSteer = state.viewMode === "steer";
        btn.setAttribute("aria-pressed", isSteer ? "true" : "false");
        btn.textContent = isSteer ? "🗺 Chart" : "🧭 Steer";
        try { localStorage.setItem("dbsc.viewMode", state.viewMode); } catch (_) { }
        if (typeof renderChart === "function") renderChart();
    }
    btn.addEventListener("click", () => {
        state.viewMode = state.viewMode === "steer" ? "chart" : "steer";
        apply();
    });
    apply();
})();

// ---------- Auto-round toggle ----------
(function setupAutoRoundToggle() {
    const btn = document.getElementById("btnAutoRound");
    if (!btn) return;
    function apply() {
        btn.setAttribute("aria-pressed", state.autoRound ? "true" : "false");
        btn.textContent = state.autoRound ? "🎯 Auto-round on" : "🎯 Auto-round off";
        try { localStorage.setItem("dbsc.autoRound", state.autoRound ? "1" : "0"); } catch (_) { }
        if (!state.autoRound) state.autoRoundHits = 0;
    }
    btn.addEventListener("click", () => {
        state.autoRound = !state.autoRound;
        apply();
        showToast(state.autoRound
            ? "Auto-round on — marks tick off when within 30 m"
            : "Auto-round off — tap ✓ Mark rounded manually");
    });
    apply();
})();
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.chartFullscreen) closeChartModal();
});
window.addEventListener("resize", () => {
    if (state.chartFullscreen) {
        resizeBigChart();
        drawChartTo(chartBig);
    }
});

// ============================================================
// Chart layer overlay toggles (🌊 tide / ⚓ all-marks)
// ============================================================
(function setupChartLayers() {
    function wire(btnId, key) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        function apply() {
            const on = state.chartOverlays[key];
            btn.setAttribute("aria-pressed", on ? "true" : "false");
        }
        btn.addEventListener("click", () => {
            state.chartOverlays[key] = !state.chartOverlays[key];
            try { localStorage.setItem("dbsc.ov." + key, state.chartOverlays[key] ? "1" : "0"); } catch (_) { }
            apply();
            renderChart();
        });
        apply();
    }
    // wire("btnOvTides", "tides");
    wire("btnOvMarks", "allMarks");
    // wire("btnOvTidesBig", "tides");
    wire("btnOvMarksBig", "allMarks");
})();

// ============================================================
// Race combined view (timer strip + chart + overview + legs)
// ============================================================
(function setupRaceView() {
    const raceChartCanvas = document.getElementById("raceChart");
    const raceSummaryEl = document.getElementById("raceSummary");
    const raceNowEl = document.getElementById("raceNow");
    const raceLegListEl = document.getElementById("raceLegList");
    const raceTimerClock = document.getElementById("raceTimerClock");
    const raceTimerLabel = document.getElementById("raceTimerLabel");
    const raceTimerStatus = document.getElementById("raceTimerStatus");
    const btnRaceViewToggle = document.getElementById("btnRaceViewToggle");
    const raceGpsBtn = document.getElementById("raceGpsBtn");
    const raceBtnNext = document.getElementById("raceBtnNext");
    const raceBtnUndo = document.getElementById("raceBtnUndo");

    // ---- 1. Register the view so showTab can show/hide it ----
    views.race = document.getElementById("view-race");

    // ---- 2. Race chart sizing ----
    function resizeRaceChart() {
        if (!raceChartCanvas) return;
        const dpr = window.devicePixelRatio || 1;
        const cssW = raceChartCanvas.clientWidth;
        if (!cssW) return;
        const cssH = Math.round(cssW * 0.65);
        raceChartCanvas.style.height = cssH + "px";
        raceChartCanvas.width = Math.round(cssW * dpr);
        raceChartCanvas.height = Math.round(cssH * dpr);
    }
    window.addEventListener("resize", () => {
        resizeRaceChart();
        if (raceChartCanvas) drawChartTo(raceChartCanvas);
    });

    // ---- 3. Include race canvas in every renderChart call ----
    const _rcOrig = renderChart;
    renderChart = function () {
        _rcOrig();
        if (raceChartCanvas) drawChartTo(raceChartCanvas);
    };

    // ---- 4. Mirror summary / now / legs into race view ----
    function syncRaceContent() {
        if (raceSummaryEl) raceSummaryEl.innerHTML = summaryEl.innerHTML;
        if (raceNowEl) raceNowEl.innerHTML = nowEl.innerHTML;
        if (raceLegListEl) raceLegListEl.innerHTML = legListEl.innerHTML;
        // Keep the race control buttons in sync
        if (raceBtnNext) raceBtnNext.disabled = btnNext.disabled;
        if (raceBtnUndo) raceBtnUndo.disabled = btnUndo.disabled;
    }
    const _raOrig = renderAll;
    renderAll = function () { _raOrig(); syncRaceContent(); };
    const _rnOrig = renderNow;
    renderNow = function () { _rnOrig(); syncRaceContent(); };

    // ---- 5. Timer sync: poll start-timer DOM every 500 ms ----
    setInterval(() => {
        const srcClock = document.getElementById("startClock");
        const srcLabel = document.getElementById("startClockLabel");
        const srcStatus = document.getElementById("startStatus");
        if (raceTimerClock && srcClock) {
            raceTimerClock.textContent = srcClock.textContent;
            raceTimerClock.classList.toggle("warn", srcClock.classList.contains("warn"));
        }
        if (raceTimerLabel && srcLabel) raceTimerLabel.textContent = srcLabel.textContent;
        if (raceTimerStatus && srcStatus) {
            raceTimerStatus.textContent = srcStatus.textContent;
            raceTimerStatus.dataset.phase = srcStatus.dataset.phase || "idle";
        }
    }, 500);

    // ---- 6. Steer/chart toggle (syncs with main chart toggle button) ----
    function applyRaceToggle() {
        if (!btnRaceViewToggle) return;
        const isSteer = state.viewMode === "steer";
        btnRaceViewToggle.setAttribute("aria-pressed", isSteer ? "true" : "false");
        btnRaceViewToggle.textContent = isSteer ? "🗺 Chart" : "🧭 Steer";
    }
    if (btnRaceViewToggle) {
        btnRaceViewToggle.addEventListener("click", () => {
            state.viewMode = state.viewMode === "steer" ? "chart" : "steer";
            try { localStorage.setItem("dbsc.viewMode", state.viewMode); } catch (_) { }
            // Keep main toggle in sync too
            const mainToggle = document.getElementById("btnViewToggle");
            if (mainToggle) {
                mainToggle.setAttribute("aria-pressed", state.viewMode === "steer" ? "true" : "false");
                mainToggle.textContent = state.viewMode === "steer" ? "🗺 Chart" : "🧭 Steer";
            }
            renderChart();
            applyRaceToggle();
        });
        applyRaceToggle();
    }

    // ---- 7. Proxy GPS / next / undo buttons ----
    if (raceGpsBtn) {
        raceGpsBtn.addEventListener("click", () => btnGps.click());
        // Keep label in sync
        const obs = new MutationObserver(() => { raceGpsBtn.textContent = btnGps.textContent; });
        obs.observe(btnGps, { characterData: true, childList: true, subtree: true });
    }
    if (raceBtnNext) raceBtnNext.addEventListener("click", () => btnNext.click());
    if (raceBtnUndo) raceBtnUndo.addEventListener("click", () => btnUndo.click());

    // ---- 8. Timer strip "⏱" link jumps to Start tab ----
    const rtsLink = document.querySelector(".rts-link[data-tab='start']");
    if (rtsLink) rtsLink.addEventListener("click", (e) => { e.preventDefault(); showTab("start"); });

    // ---- 9. Patch showTab to initialise race view on first show ----
    const _stOrig = showTab;
    showTab = function (name) {
        _stOrig(name);
        if (name === "race") {
            resizeRaceChart();
            if (raceChartCanvas) drawChartTo(raceChartCanvas);
            syncRaceContent();
        }
    };

    // ---- 10. Initial pass ----
    resizeRaceChart();
    syncRaceContent();
})();

// ============================================================
// Next-race countdown (Course tab info strip)
// ============================================================
// Picks the next Tue/Thu/Sat date from schedule.json, derives a warning-signal
// time from the user's last-selected boat (or sensible defaults), and shows
// "Tuesday 18:35 · in 2 days". Tapping it jumps to the Race finder with that
// date pre-selected.
const DEFAULT_WARN = { tue: "18:35", thu: "18:40", sat: "14:00" };
const DAY_LABELS = { tue: "Tuesday", thu: "Thursday", sat: "Saturday" };

function nextRaceInfo(now) {
    if (!SCHED || !SCHED.calendar) return null;
    const cal = SCHED.calendar;
    const today = (now || new Date()).toISOString().slice(0, 10);
    const candidates = [];
    for (const k of ["tue", "thu", "sat"]) {
        for (const e of (cal[k] || [])) {
            const date = (typeof e === "string") ? e : e.date;
            if (!date) continue;
            if (date >= today) candidates.push({ day: k, date, entry: e });
        }
    }
    candidates.sort((a, b) => a.date.localeCompare(b.date));
    return candidates[0] || null;
}

function warnTimeFor(dayKey) {
    const boatId = localStorage.getItem("dbsc.boat");
    if (boatId && SCHED && SCHED.boats) {
        const b = SCHED.boats.find((x) => x.id === boatId);
        if (b && b[dayKey] && b[dayKey].warn) return b[dayKey].warn;
    }
    return DEFAULT_WARN[dayKey];
}

function renderCountdown() {
    if (!countdownPanel || !infoStrip) return;
    const next = nextRaceInfo(new Date());
    if (!next) {
        countdownPanel.hidden = true;
        if (tidePanel.hidden) infoStrip.hidden = true;
        return;
    }
    const warn = warnTimeFor(next.day);
    const [h, m] = (warn || "00:00").split(":").map((x) => parseInt(x, 10));
    const raceDt = new Date(next.date + "T" + (warn || "00:00") + ":00");
    const diffMs = raceDt - new Date();
    const diffMin = Math.round(diffMs / 60000);
    let when;
    if (diffMs < 0) {
        when = "starting now";
    } else if (diffMin < 60) {
        when = `in ${diffMin} min`;
    } else if (diffMin < 60 * 24) {
        when = `in ${Math.round(diffMin / 60)} h`;
    } else {
        const days = Math.floor(diffMin / (60 * 24));
        when = days === 1 ? "tomorrow" : `in ${days} days`;
    }
    const note = (next.entry && next.entry.note) ? ` · ${next.entry.note}` : "";
    countdownBig.textContent = `${DAY_LABELS[next.day]} ${warn}`;
    countdownSub.textContent = `${when}${note}`;
    countdownPanel.dataset.date = next.date;
    countdownPanel.hidden = false;
    infoStrip.hidden = false;
    // Update every minute so "in 47 min" stays current.
    if (!renderCountdown._timer) {
        renderCountdown._timer = setInterval(renderCountdown, 60000);
    }
}

if (countdownPanel) {
    countdownPanel.addEventListener("click", () => {
        const date = countdownPanel.dataset.date;
        if (date && todayDate) {
            todayDate.value = date;
            showTab("today");
            if (todayBoat.value) findRace();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });
}

// ============================================================
// Tide engine (Dún Laoghaire, static table) + tidal streams
// ============================================================
// (TIDES is declared near the top of the file so that early calls to
// renderChart() at module-load time can safely call hasTideStreamData()
// without hitting a Temporal Dead Zone reference error.)

// ---- low-level helpers ----------------------------------------------------

function _evDate(ev) { return new Date(ev.datetime); }

/** Return the two HW/LW events that bracket time `t`, plus their indices. */
function _surroundingTideEvents(t) {
    if (!TIDES || !Array.isArray(TIDES.events) || TIDES.events.length < 2) return null;
    const evs = TIDES.events;
    for (let i = 0; i < evs.length - 1; i++) {
        const a = _evDate(evs[i]).getTime();
        const b = _evDate(evs[i + 1]).getTime();
        if (t >= a && t <= b) return { a: evs[i], b: evs[i + 1], idx: i };
    }
    return null;
}

/** Cosine interpolation of tide height between two consecutive HW/LW events. */
function tideHeightAt(t) {
    const s = _surroundingTideEvents(t);
    if (!s) return null;
    const ta = _evDate(s.a).getTime(), tb = _evDate(s.b).getTime();
    const ha = s.a.height_m, hb = s.b.height_m;
    if (ha == null || hb == null) return null;
    const f = (t - ta) / (tb - ta);                 // 0..1
    // Cosine: smooth and matches real tides (ha at f=0, hb at f=1).
    return ha + (hb - ha) * (1 - Math.cos(f * Math.PI)) / 2;
}

/**
 * Hours from the nearest HW. Negative = before HW, positive = after HW.
 * Range: −6.2 .. +6.2 (semidiurnal). Returns null if no surrounding data.
 */
function tidePhaseHoursFromHW(t) {
    if (!TIDES || !Array.isArray(TIDES.events) || TIDES.events.length === 0) return null;
    const evs = TIDES.events;
    // Find nearest HW event in time
    let nearest = null, nearestDt = Infinity;
    for (const e of evs) {
        if (e.type !== "high") continue;
        const dt = Math.abs(_evDate(e).getTime() - t);
        if (dt < nearestDt) { nearestDt = dt; nearest = e; }
    }
    if (!nearest) return null;
    return (t - _evDate(nearest).getTime()) / 3600000;
}

/** Find the next event of given type strictly after `t`. */
function nextTideEvent(t, type) {
    if (!TIDES || !Array.isArray(TIDES.events)) return null;
    for (const e of TIDES.events) {
        if (type && e.type !== type) continue;
        if (_evDate(e).getTime() > t) return e;
    }
    return null;
}

/**
 * Tide stream at `markLetter` at time `t`. Linear interpolation between the
 * two surrounding entries of the per-mark or default tide rose.
 * Returns { set, drift } in degrees-true / knots, or null if no rose data.
 */
function tideStreamAt(markLetter, t) {
    if (!TIDES) return null;
    const rose = (TIDES.marksTideRose && TIDES.marksTideRose[markLetter])
        || TIDES.defaultTideRose;
    if (!Array.isArray(rose) || rose.length === 0) return null;
    const phase = tidePhaseHoursFromHW(t);
    if (phase == null) return null;
    const h = Math.max(-6, Math.min(6, phase));
    // Sort just in case
    const sorted = rose.slice().sort((a, b) => a.h - b.h);
    let lo = sorted[0], hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
        if (h >= sorted[i].h && h <= sorted[i + 1].h) {
            lo = sorted[i]; hi = sorted[i + 1]; break;
        }
    }
    const span = hi.h - lo.h || 1;
    const f = (h - lo.h) / span;
    // Interpolate set as a circular angle, drift linearly.
    const a1 = (lo.set || 0) * Math.PI / 180;
    const a2 = (hi.set || 0) * Math.PI / 180;
    const x = (1 - f) * Math.cos(a1) + f * Math.cos(a2);
    const y = (1 - f) * Math.sin(a1) + f * Math.sin(a2);
    const set = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
    const drift = (1 - f) * (lo.drift || 0) + f * (hi.drift || 0);
    return { set, drift };
}

/** Has the user populated any tidal-stream rose at all? */
function hasTideStreamData() {
    if (!TIDES) return false;
    if (Array.isArray(TIDES.defaultTideRose) && TIDES.defaultTideRose.length > 0) return true;
    const r = TIDES.marksTideRose;
    return !!(r && Object.keys(r).length > 0);
}

// ---- info-strip tide card -------------------------------------------------

function renderTides() {
    if (!tidePanel || !infoStrip) return;
    if (!TIDES || !Array.isArray(TIDES.events) || TIDES.events.length === 0) {
        tidePanel.hidden = true;
        if (countdownPanel.hidden) infoStrip.hidden = true;
        return;
    }
    const nowMs = Date.now();
    const upcoming = TIDES.events.filter((e) => _evDate(e).getTime() > nowMs).slice(0, 2);
    if (upcoming.length === 0) {
        tidePanel.hidden = true;
        if (countdownPanel.hidden) infoStrip.hidden = true;
        return;
    }
    const next = upcoming[0];
    const dt = _evDate(next);
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    const tag = next.type === "high" ? "HW" : "LW";
    const arrow = next.type === "high" ? "▲" : "▼";   // rising => HW next, falling => LW next
    const minsTo = Math.round((dt.getTime() - nowMs) / 60000);
    const inStr = minsTo < 60
        ? `in ${minsTo}m`
        : `in ${Math.floor(minsTo / 60)}h ${minsTo % 60}m`;
    tideBig.textContent = `${arrow} ${tag} ${hh}:${mm}`;
    const hStr = next.height_m != null ? ` · ${next.height_m.toFixed(1)} m` : "";
    tideSub.textContent = `${inStr}${hStr}`;
    tidePanel.hidden = false;
    infoStrip.hidden = false;
}

fetch("tides.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((t) => {
        if (!t) return;
        TIDES = t;
        renderTides();
        // Tide arrows on the chart depend on this data, redraw if needed.
        if (typeof renderChart === "function") renderChart();
    })
    .catch(() => { /* offline / not deployed yet */ });

// ---------- Version footer ----------
// Show APP_VERSION + build date in the footer so we can confirm which
// build the installed PWA is actually running. Tap the chip to force the
// service worker to check for an update.
(function setupVersion() {
    const span = document.getElementById("appVersion");
    if (!span) return;
    let dateStr = APP_BUILD_DATE;
    try {
        const d = new Date(APP_BUILD_DATE + "T00:00");
        dateStr = d.toLocaleDateString("en-IE", {
            day: "numeric", month: "short", year: "numeric",
        });
    } catch (e) { /* keep raw ISO */ }
    span.textContent = `${APP_VERSION} · ${dateStr}`;

    const btn = document.getElementById("btnVersion");
    if (!btn) return;
    btn.addEventListener("click", async () => {
        if (!("serviceWorker" in navigator)) {
            showToast("Service worker not supported.");
            return;
        }
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg) { showToast("No service worker registered yet."); return; }
            showToast("Checking for updates…");
            await reg.update();
        } catch (e) {
            showToast("Update check failed.");
        }
    });
})();

// Refresh tide panel every minute so "in 14m" rolls forward smoothly.
setInterval(() => {
    renderTides();
    if (typeof renderChart === "function" && hasTideStreamData()) renderChart();
}, 60 * 1000);

// ---------- Header height measurement for landscape sticky panels ----------
// Sets --header-h on <html> so the two-column layout can calc() correct heights.
function measureHeader() {
    const h = document.querySelector("header");
    if (h) {
        document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
    }
}
measureHeader();
window.addEventListener("resize", measureHeader, { passive: true });

// ---------- iOS Safari orientation-change zoom fix ----------
// iOS retains the zoom level when rotating landscape → portrait.
// Briefly pinning maximum-scale=1 snaps it back to 1× zoom, then
// we restore the original content so pinch-zoom still works.
(function () {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) return;
    const original = viewportMeta.getAttribute("content");
    window.addEventListener("orientationchange", () => {
        // After the rotation settles, snap zoom to 1×, then restore
        setTimeout(() => {
            viewportMeta.setAttribute("content", original + ", maximum-scale=1");
            setTimeout(() => viewportMeta.setAttribute("content", original), 300);
        }, 100);
    });
}());


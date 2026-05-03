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
// Hand-traced shoreline of Dublin Bay from Howth Head south to Bray Head,
// running roughly N -> S along the western shore of the bay. Used to
// shade land on the chart. The polygon is closed by going far inland
// (lon -6.30) so anything west of the shore is filled as land.
// These are approximate (~50 m) — fine for at-a-glance context.
const DUBLIN_BAY_COAST = [
    { lat: 53.388, lon: -6.046 },   // Howth Head NE (Bailey)
    { lat: 53.378, lon: -6.061 },   // Howth Head south
    { lat: 53.372, lon: -6.084 },   // Sutton south
    { lat: 53.371, lon: -6.144 },   // North Bull Island N tip
    { lat: 53.359, lon: -6.158 },   // Bull Island W shore
    { lat: 53.347, lon: -6.193 },   // Causeway / Clontarf
    { lat: 53.346, lon: -6.222 },   // North Wall (Liffey mouth N)
    { lat: 53.344, lon: -6.222 },   // Liffey mouth S
    { lat: 53.343, lon: -6.187 },   // Poolbeg / South Wall tip
    { lat: 53.339, lon: -6.213 },   // Sandymount strand
    { lat: 53.330, lon: -6.215 },   // Merrion gates
    { lat: 53.314, lon: -6.205 },   // Booterstown
    { lat: 53.303, lon: -6.180 },   // Blackrock
    { lat: 53.295, lon: -6.165 },   // Seapoint / Salthill
    { lat: 53.293, lon: -6.149 },   // West Pier root
    { lat: 53.300, lon: -6.139 },   // West Pier head
    { lat: 53.297, lon: -6.139 },   // back inside (harbour)
    { lat: 53.295, lon: -6.135 },   // harbour back
    { lat: 53.299, lon: -6.131 },   // East Pier head
    { lat: 53.295, lon: -6.131 },   // East Pier inside
    { lat: 53.291, lon: -6.107 },   // Sandycove / 40 Foot
    { lat: 53.282, lon: -6.094 },   // Bullock Harbour
    { lat: 53.276, lon: -6.087 },   // Coliemore (Dalkey Sound)
    { lat: 53.263, lon: -6.094 },   // Killiney N
    { lat: 53.243, lon: -6.090 },   // White Rock
    { lat: 53.197, lon: -6.077 },   // Bray Head N
    { lat: 53.180, lon: -6.080 },   // Bray Head south
    // close polygon far inland so the land fills properly:
    { lat: 53.180, lon: -6.350 },
    { lat: 53.400, lon: -6.350 },
];

// Dalkey Island (separate islet to draw)
const DALKEY_ISLAND = [
    { lat: 53.276, lon: -6.094 },
    { lat: 53.275, lon: -6.088 },
    { lat: 53.272, lon: -6.087 },
    { lat: 53.270, lon: -6.092 },
    { lat: 53.273, lon: -6.096 },
];

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
    headingOn: false,      // device-orientation compass active
    heading: null,         // degrees true (or magnetic if true unavailable)
    headingTrue: false,    // whether `heading` is true-north (vs magnetic)
    chartFullscreen: false,
    viewMode: localStorage.getItem("dbsc.viewMode") === "steer" ? "steer" : "chart",
    // True wind direction override (degrees, where wind blows FROM).
    // null  = follow the course-card default (card.wind[windKey].bearing)
    // 0–359 = user-entered value, persisted for the session only since
    //         real wind shifts hour-by-hour.
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
    return String(Math.round(((b % 360) + 360) % 360)).padStart(3, "0") + "°";
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
    const rawStr = c.tokens.map(t => `${t.mark}${t.side || (c.card.all_port ? "p" : "")}`).join(" ");

    // Total table-based distance from "start" (assumed boat position) is unknown,
    // so only sum mark-to-mark distances.
    let total = 0;
    for (let i = 1; i < c.tokens.length; i++) {
        const L = leg(c.tokens[i - 1].mark, c.tokens[i].mark);
        if (L.distance != null) total += L.distance;
    }

    summaryEl.innerHTML = `
    <div class="k">Wind</div><div class="v">${c.windKey || state.windKey} – ${fmtBearing(c.bearing)}${state.twdOverride != null ? ` <span style="color:var(--accent)">(using ${fmtBearing(state.twdOverride)})</span>` : ""}</div>
    <div class="k">Course</div><div class="v">#${state.courseN} – ${c.tokens.length} marks</div>
    <div class="k">Mark-to-mark</div><div class="v">${total ? total.toFixed(2) + " NM" : "—"}</div>
    <div class="raw">${rawStr || "(no marks)"}</div>
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
    renderAll();
});
btnUndo.addEventListener("click", () => {
    if (state.rounded > 0) state.rounded -= 1;
    renderAll();
});
btnReset.addEventListener("click", () => {
    state.rounded = 0;
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
            twdHint.textContent = "your input";
            twdHint.classList.add("override");
        }
    } else {
        twdInput.value = String(Math.round(eff));
        if (twdHint) {
            twdHint.textContent = "default";
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
            twdHint.textContent = state.twdOverride != null ? "your input" : "default";
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
const GPS_AUTO_OFF_MS = 30 * 60 * 1000; // 30 minutes
const gpsExplain = $("gpsExplain");
const gpsExplainOk = $("gpsExplainOk");
const gpsExplainCancel = $("gpsExplainCancel");

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
    btnGps.textContent = "📍 Use GPS";
    btnGps.classList.remove("primary");
    renderNow();
    if (reason === "timeout") {
        showToast("GPS switched off after 30 min to save battery.");
    }
}

function startGps() {
    if (!("geolocation" in navigator)) {
        alert("Geolocation not available in this browser.");
        return;
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
            renderNow();
        },
        (err) => {
            alert("GPS error: " + err.message);
            stopGps();
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
    if (state.gpsTimer) clearTimeout(state.gpsTimer);
    state.gpsTimer = setTimeout(() => stopGps("timeout"), GPS_AUTO_OFF_MS);
}

function showToast(msg) {
    // lightweight, only when a #toast element exists; otherwise fall back to console.
    const t = document.getElementById("toast");
    if (!t) { console.log(msg); return; }
    t.textContent = msg;
    t.hidden = false;
    setTimeout(() => { t.hidden = true; }, 4000);
}

btnGps.addEventListener("click", () => {
    if (state.gpsOn) { stopGps(); return; }
    if (!("geolocation" in navigator)) {
        alert("Geolocation not available in this browser.");
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

// ---------- init ----------
populateCards();
populateWinds();
populateCourses();
syncTwdInput();
renderAll();

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
    const cssH = Math.round(cssW * 0.65);
    chartCanvas.style.height = cssH + "px";
    chartCanvas.width = Math.round(cssW * dpr);
    chartCanvas.height = Math.round(cssH * dpr);
    renderChart();
}
window.addEventListener("resize", resizeChart);

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

    // Faint background marks (not in this course)
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

    // Project course points
    const pts = tokens.map((t) => {
        const m = MARKS[t.mark];
        if (!m) return null;
        return { ...t, x: project(m.lat, m.lon)[0], y: project(m.lat, m.lon)[1], mark: t.mark };
    });

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

    // North label / cardinal markers (small, top of canvas)
    ctx.font = `700 ${Math.round(W * 0.022)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = muted;
    ctx.fillText("N ↑", W / 2, Math.round(H * 0.025));

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

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((bearingToMark - 0) * Math.PI) / 180); // 0° = up = North
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
        sessionStorage.removeItem("dbsc.installHidden");
        localStorage.removeItem("dbsc.installed");
        renderInstallBanner(true);
        installBanner.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const modal = document.getElementById("welcomeModal");
    const okBtn = document.getElementById("welcomeOk");
    const helpBtn = document.getElementById("btnHelp");
    if (!modal) return;

    const SEEN_KEY = "dbsc.welcomeSeen";
    const open = () => { modal.hidden = false; };
    const close = () => {
        modal.hidden = true;
        try { localStorage.setItem(SEEN_KEY, "1"); } catch (_) { }
    };

    if (okBtn) okBtn.addEventListener("click", close);
    if (helpBtn) helpBtn.addEventListener("click", open);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.hidden) close();
    });

    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch (_) { }
    if (!seen) open();
})();

// ============================================================
// Tabs (Course / Today / Docs)
// ============================================================
const tabButtons = document.querySelectorAll(".tabs .tab");
const views = {
    course: document.getElementById("view-course"),
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
tabButtons.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

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
    });
}

function showRecommend({ warn, day, big, rows, note, openCard, openPdf, openPdfLabel }) {
    todayResult.classList.toggle("warn", !!warn);
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
//   2. system `prefers-color-scheme: light` -> light
//   3. dark (default — matches the original design)
(function initTheme() {
    const saved = localStorage.getItem("dbsc.theme");
    let theme;
    if (saved === "light" || saved === "dark") {
        theme = saved;
    } else {
        theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches)
            ? "light" : "dark";
    }
    applyTheme(theme);
    // Track system changes when the user has no explicit override.
    if (!saved && window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: light)");
        mq.addEventListener && mq.addEventListener("change", (e) => {
            if (!localStorage.getItem("dbsc.theme")) {
                applyTheme(e.matches ? "light" : "dark");
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
// Tide info (Dún Laoghaire, static table)
// ============================================================
let TIDES = null;

function renderTides() {
    if (!tidePanel || !infoStrip) return;
    if (!TIDES || !Array.isArray(TIDES.events) || TIDES.events.length === 0) {
        // No data yet — hide the panel rather than show fake / stale values.
        tidePanel.hidden = true;
        if (countdownPanel.hidden) infoStrip.hidden = true;
        return;
    }
    const now = new Date();
    const upcoming = TIDES.events.filter((e) => new Date(e.datetime) > now).slice(0, 2);
    if (upcoming.length === 0) {
        // Data file exists but is now stale — hide silently. The point is to
        // never display anything that might be wrong.
        tidePanel.hidden = true;
        if (countdownPanel.hidden) infoStrip.hidden = true;
        return;
    }
    const fmt = (ev) => {
        const dt = new Date(ev.datetime);
        const hh = String(dt.getHours()).padStart(2, "0");
        const mm = String(dt.getMinutes()).padStart(2, "0");
        const tag = ev.type === "high" ? "HW" : "LW";
        return `${tag} ${hh}:${mm} (${ev.height_m.toFixed(1)} m)`;
    };
    tideBig.textContent = fmt(upcoming[0]);
    tideSub.textContent = upcoming[1] ? "then " + fmt(upcoming[1]) : "";
    tidePanel.hidden = false;
    infoStrip.hidden = false;
}

fetch("tides.json?v=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((t) => { if (t) { TIDES = t; renderTides(); } })
    .catch(() => { /* offline / not deployed yet */ });

// Refresh tide panel every 5 minutes so "next event" rolls forward.
setInterval(renderTides, 5 * 60 * 1000);

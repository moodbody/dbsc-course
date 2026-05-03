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

// ---------- state ----------
const state = {
    cardId: localStorage.getItem("dbsc.card") || "CC1",
    windKey: localStorage.getItem("dbsc.wind") || "A",
    courseN: +(localStorage.getItem("dbsc.course") || 1),
    rounded: 0,             // index of next mark to round (0-based into legs[])
    gpsOn: false,
    gpsWatch: null,
    gpsPos: null,          // {lat, lon, accuracy, heading?, speed?}
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
    <div class="k">Wind</div><div class="v">${c.windKey || state.windKey} – ${fmtBearing(c.bearing)}</div>
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

        li.innerHTML = `
      <div class="idx">${i + 1}</div>
      <div class="info">
        <div class="name">${tok.mark} – ${markName(tok.mark)}${isFinish ? " (Finish)" : ""}</div>
        <div class="meta">${sidePillHtml}<span class="colour">${markColour(tok.mark)}</span></div>
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
            gpsHtml = `<div class="gps">From your position:
        <strong>${fmtBearing(g.bearing)}</strong> • <strong>${fmtDist(g.distance)}</strong>
        <span style="opacity:.7"> (±${Math.round(state.gpsPos.accuracy)} m)</span></div>`;
        }
    } else {
        gpsHtml = `<div class="gps">Tap “Use GPS” for live bearing &amp; distance from your boat.</div>`;
    }

    const sideKey = target.side || (c.card.all_port ? "p" : "");
    const sidePillHtml =
        sideKey === "p" ? `<span class="pill p">PORT</span>` :
            sideKey === "s" ? `<span class="pill s">STBD</span>` :
                `<span class="pill x">—</span>`;

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
    state.cardId = cardSel.value;
    state.rounded = 0;
    populateWinds(); populateCourses(); saveSelection(); renderAll();
});
windSel.addEventListener("change", () => {
    state.windKey = windSel.value;
    state.rounded = 0;
    populateCourses(); saveSelection(); renderAll();
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

// ---------- GPS ----------
btnGps.addEventListener("click", () => {
    if (state.gpsOn) {
        if (state.gpsWatch != null) navigator.geolocation.clearWatch(state.gpsWatch);
        state.gpsOn = false;
        state.gpsWatch = null;
        state.gpsPos = null;
        btnGps.textContent = "📍 Use GPS";
        btnGps.classList.remove("primary");
        renderNow();
        return;
    }
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
            state.gpsOn = false;
            state.gpsWatch = null;
            btnGps.textContent = "📍 Use GPS";
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
});

// ---------- init ----------
populateCards();
populateWinds();
populateCourses();
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

function renderChart() {
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext("2d");
    const W = chartCanvas.width, H = chartCanvas.height;
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

    // Background grid (very faint)
    ctx.strokeStyle = "#13314d";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = margin + (chartH * i) / 4;
        ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(W - margin, y); ctx.stroke();
        const x = margin + (chartW * i) / 4;
        ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, H - margin); ctx.stroke();
    }

    // North arrow
    ctx.fillStyle = "#8aa5bf";
    ctx.font = `${Math.round(W * 0.022)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("N ?", W - margin - 36, margin + 4);

    // Faint background marks (not in this course)
    ctx.fillStyle = "#23496e";
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
        ctx.strokeStyle = done ? "#345a7d" : (upcoming ? "#ffb000" : "#e7eef5");
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
        ctx.fillStyle = isStart ? "#2bb673" : isFinish ? "#ffb000" : "#f5f7fa";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isCurrent ? "#ffb000" : "#0a1a2c";
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
        ctx.fillStyle = "#0a1a2c";
        ctx.font = `bold ${Math.round(W * 0.02)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(p.mark, p.x, p.y);

        // Outside label with order #
        ctx.fillStyle = isCurrent ? "#ffb000" : "#cfd9e4";
        ctx.font = `${Math.round(W * 0.018)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = "left"; ctx.textBaseline = "top";
        ctx.fillText(`${i + 1}`, p.x + markR + 4, p.y - markR - 2);
    });

    // GPS position
    if (state.gpsPos) {
        const [gx, gy] = project(state.gpsPos.lat, state.gpsPos.lon);
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
window.addEventListener("appinstalled", () => {
    if (btnInstall) btnInstall.hidden = true;
});

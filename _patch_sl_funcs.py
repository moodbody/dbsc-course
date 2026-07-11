"""
Patch: insert the Start Line module functions into app.js.
Inserts the block just after the closing of the initStartSequence IIFE
and before the lsBackdrop / header code.
"""
import sys, re

path = r"c:\Users\maxgo\Desktop\DBSC Courses\docs\app.js"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Anchor: the lsBackdrop section that follows initStartSequence
ANCHOR = "\nconst lsBackdrop = document.getElementById(\"lsBackdrop\");"

if ANCHOR not in content:
    print("ERROR: anchor not found"); sys.exit(1)

NEW_BLOCK = r"""
// ============================================================
// Start Line Module
// ============================================================

/** True bearing of the line, pin→CB. */
function slLineAngle() {
    const sl = state.startLine;
    if (!sl.pinSet || !sl.cbSet) return null;
    return geo(sl.pin.lat, sl.pin.lon, sl.cb.lat, sl.cb.lon).bearing;
}

/**
 * Signed perpendicular distance from boat to the start line, in metres.
 * Positive  → boat is on the course (OCS) side.
 * Negative  → boat is safely behind the line.
 * Returns null when GPS or the line is not available.
 */
function slDtlMeters() {
    const sl = state.startLine;
    if (!sl.pinSet || !sl.cbSet || !state.gpsPos) return null;

    const midLat = (sl.pin.lat + sl.cb.lat) / 2;
    const cosLat = Math.cos(midLat * Math.PI / 180);
    const mPerDegLat = 111320;
    const mPerDegLon  = 111320 * cosLat;

    // Line vector pin→CB (m; X = east, Y = north)
    const lx = (sl.cb.lon - sl.pin.lon) * mPerDegLon;
    const ly = (sl.cb.lat - sl.pin.lat) * mPerDegLat;
    const lineLen = Math.sqrt(lx * lx + ly * ly);
    if (lineLen < 1) return null;

    // Boat vector from pin (m)
    const bx = (state.gpsPos.lon - sl.pin.lon) * mPerDegLon;
    const by = (state.gpsPos.lat - sl.pin.lat) * mPerDegLat;

    // Signed perpendicular distance (positive = left of pin→CB)
    const cross = (lx * by - ly * bx) / lineLen;

    // Determine which side is "upwind" (course / OCS side) using TWD.
    // The upwind unit vector points FROM the direction the wind comes.
    const twd = effectiveTWD();
    const twdRad = twd * Math.PI / 180;
    const windX = Math.sin(twdRad);
    const windY = Math.cos(twdRad);

    // Left-hand normal to the line
    const nx = -ly / lineLen;
    const ny =  lx / lineLen;

    // If the left-normal faces upwind, positive cross = upwind = OCS
    const dot = nx * windX + ny * windY;
    return dot >= 0 ? cross : -cross;
}

/** Which end is furthest upwind: "pin" | "cb" | "square" | null. */
function slFavoredEnd() {
    const angle = slLineAngle();
    if (angle == null) return null;
    const twd = effectiveTWD();
    // A square line has angle == twd + 90 (or twd − 90).
    // bias > 0 → line rotated CW from square → CB end is higher → CB favored.
    // bias < 0 → line rotated CCW           → pin end is higher → pin favored.
    const squareAngle = (twd + 90 + 360) % 360;
    const bias = ((angle - squareAngle + 540) % 360) - 180;
    if (Math.abs(bias) < 3) return "square";
    return bias > 0 ? "cb" : "pin";
}

/** Seconds to reach the line at current GPS SOG; null if no data / speed = 0. */
function slTtlSeconds() {
    const dtl = slDtlMeters();
    if (dtl == null) return null;
    const sog = state.gpsPos && state.gpsPos.speed; // m/s
    if (!sog || sog < 0.1) return null;
    return Math.abs(dtl) / sog;
}

/** Burn time = countdown remaining − time to line (positive = time to waste). */
function slBurnSeconds() {
    const ttl = slTtlSeconds();
    if (ttl == null) return null;
    const seq = _getStartSeqState ? _getStartSeqState() : null;
    if (!seq || seq.phase !== "countdown") return null;
    return seq.remaining - ttl;
}

function _fmtSlTime(secs) {
    if (secs == null) return "\u2014";
    const s = Math.round(Math.abs(secs));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function _fmtSlDist(m) {
    if (m == null) return "\u2014";
    const abs = Math.abs(m);
    return abs >= 10 ? `${Math.round(abs)} m` : `${abs.toFixed(1)} m`;
}

/** Populate both mark-select dropdowns from the current MARKS data. */
function populateSlMarkSelects() {
    const selPin = document.getElementById("slPinMark");
    const selCb  = document.getElementById("slCbMark");
    if (!selPin || !selCb || !MARKS) return;
    [selPin, selCb].forEach(sel => {
        const cur = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        Object.entries(MARKS)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .forEach(([letter, m]) => {
                const opt = document.createElement("option");
                opt.value = letter;
                opt.textContent = `${letter} \u2014 ${m.name}`;
                sel.appendChild(opt);
            });
        sel.value = cur;
    });
}

/** Refresh the start-line data card and setup labels. */
function renderStartLinePanel() {
    const slData        = document.getElementById("slData");
    const slPinStatus   = document.getElementById("slPinStatus");
    const slCbStatus    = document.getElementById("slCbStatus");
    const slSetupBadge  = document.getElementById("slSetupBadge");
    const sl = state.startLine;

    // End status labels
    function fmtPos(p) {
        return p ? `${p.lat.toFixed(4)}\u00b0N, ${Math.abs(p.lon).toFixed(4)}\u00b0W` : "Not set";
    }
    if (slPinStatus) {
        slPinStatus.textContent = sl.pinSet ? fmtPos(sl.pin) : "Not set";
        slPinStatus.classList.toggle("set", sl.pinSet);
    }
    if (slCbStatus) {
        slCbStatus.textContent = sl.cbSet ? fmtPos(sl.cb) : "Not set";
        slCbStatus.classList.toggle("set", sl.cbSet);
    }

    // Toggle badge text
    if (slSetupBadge) {
        if (sl.pinSet && sl.cbSet) {
            const la = slLineAngle();
            slSetupBadge.textContent = la != null ? `Set \u00b7 ${fmtBearing(la)}` : "Set";
            slSetupBadge.classList.add("active");
        } else {
            slSetupBadge.textContent = (sl.pinSet || sl.cbSet) ? "1 end set" : "Not set";
            slSetupBadge.classList.remove("active");
        }
    }

    if (!slData) return;
    if (!sl.pinSet || !sl.cbSet) { slData.hidden = true; return; }
    slData.hidden = false;

    const dtl      = slDtlMeters();
    const favored  = slFavoredEnd();
    const ttl      = slTtlSeconds();
    const burn     = slBurnSeconds();
    const seq      = _getStartSeqState ? _getStartSeqState() : null;
    const isCdown  = seq && seq.phase === "countdown";
    const isOver   = dtl != null && dtl > 0;

    // OCS banner
    const ocsWarn = document.getElementById("slOcsWarn");
    if (ocsWarn) ocsWarn.hidden = !(isOver && isCdown);

    // DTL cell
    const dtlVal = document.getElementById("slDtlVal");
    if (dtlVal) {
        if (dtl == null) { dtlVal.textContent = "\u2014"; dtlVal.className = "sl-val"; }
        else {
            dtlVal.textContent = (isOver ? "+" : "-") + _fmtSlDist(dtl);
            dtlVal.className   = "sl-val" + (isOver ? " ocs" : "");
        }
    }

    // Favored end cell
    const favVal = document.getElementById("slFavoredVal");
    if (favVal) {
        if (!favored)             { favVal.textContent = "\u2014";     favVal.className = "sl-val"; }
        else if (favored === "square") { favVal.textContent = "Square";  favVal.className = "sl-val"; }
        else {
            favVal.textContent = favored === "pin" ? "\u2693 Pin" : "\uD83D\uDEA2 CB";
            favVal.className   = `sl-val favor-${favored}`;
        }
    }

    // TTL cell
    const ttlVal = document.getElementById("slTtlVal");
    if (ttlVal) {
        if (dtl != null && isOver) { ttlVal.textContent = "OVER"; ttlVal.className = "sl-val ocs"; }
        else {
            ttlVal.textContent = ttl != null ? _fmtSlTime(ttl)
                               : (state.gpsPos ? "No SOG" : "No GPS");
            ttlVal.className = "sl-val";
        }
    }

    // Burn cell
    const burnVal = document.getElementById("slBurnVal");
    if (burnVal) {
        if (!isCdown)       { burnVal.textContent = "\u2014";   burnVal.className = "sl-val"; }
        else if (burn == null) { burnVal.textContent = ttl == null ? "No GPS" : "\u2014"; burnVal.className = "sl-val"; }
        else if (burn >= 0) { burnVal.textContent = _fmtSlTime(burn);      burnVal.className = "sl-val burn-ok"; }
        else                { burnVal.textContent = "\u2212" + _fmtSlTime(burn); burnVal.className = "sl-val burn-late"; }
    }

    // Footer — line bearing & length
    const footer = document.getElementById("slDataFooter");
    if (footer) {
        const la  = slLineAngle();
        const len = geo(sl.pin.lat, sl.pin.lon, sl.cb.lat, sl.cb.lon).distance * 1852;
        footer.textContent = la != null ? `Line ${fmtBearing(la)} \u00b7 ${Math.round(len)} m` : "";
    }
}

// Wire up the start-line setup controls
(function initStartLine() {
    const sl = state.startLine;

    const btnPinGps  = document.getElementById("btnSlPinGps");
    const btnCbGps   = document.getElementById("btnSlCbGps");
    const selPinMark = document.getElementById("slPinMark");
    const selCbMark  = document.getElementById("slCbMark");
    const btnPinClear = document.getElementById("btnSlPinClear");
    const btnCbClear  = document.getElementById("btnSlCbClear");
    const toggleBtn   = document.getElementById("slSetupToggle");
    const setupBody   = document.getElementById("slSetupBody");

    if (!btnPinGps) return; // elements not in DOM yet

    // Collapsible setup panel
    if (toggleBtn && setupBody) {
        toggleBtn.addEventListener("click", () => {
            const nowOpen = !setupBody.hidden;
            setupBody.hidden = nowOpen;
            toggleBtn.setAttribute("aria-expanded", nowOpen ? "false" : "true");
        });
    }

    function setEnd(which, lat, lon, src) {
        sl[which + "Set"] = true;
        sl[which] = { lat, lon, src };
        renderStartLinePanel();
        renderChart();
    }

    function clearEnd(which) {
        sl[which + "Set"] = false;
        sl[which] = null;
        const sel = document.getElementById(which === "pin" ? "slPinMark" : "slCbMark");
        if (sel) sel.value = "";
        renderStartLinePanel();
        renderChart();
    }

    function setFromGps(which) {
        if (!state.gpsPos) {
            showToast("Enable GPS first, then tap to set from current position.");
            return;
        }
        setEnd(which, state.gpsPos.lat, state.gpsPos.lon, "gps");
        showToast(`${which === "pin" ? "Pin" : "Committee Boat"} end set from GPS.`);
    }

    btnPinGps.addEventListener("click", () => setFromGps("pin"));
    btnCbGps.addEventListener("click",  () => setFromGps("cb"));

    if (btnPinClear) btnPinClear.addEventListener("click", () => clearEnd("pin"));
    if (btnCbClear)  btnCbClear.addEventListener("click",  () => clearEnd("cb"));

    if (selPinMark) selPinMark.addEventListener("change", () => {
        if (!selPinMark.value) return;
        const m = MARKS[selPinMark.value];
        if (m) setEnd("pin", m.lat, m.lon, "mark:" + selPinMark.value);
    });
    if (selCbMark) selCbMark.addEventListener("change", () => {
        if (!selCbMark.value) return;
        const m = MARKS[selCbMark.value];
        if (m) setEnd("cb", m.lat, m.lon, "mark:" + selCbMark.value);
    });

    populateSlMarkSelects();
    renderStartLinePanel();
}());

"""

content = content.replace(ANCHOR, NEW_BLOCK + ANCHOR)
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Done.")

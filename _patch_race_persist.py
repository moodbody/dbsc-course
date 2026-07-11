"""
Patch 1 of 2: Insert race state persistence functions into app.js.
Two insertion points:
  A) After saveSelection() — the helper functions
  B) Just before the orientation-change IIFE at the end — the deferred
     restore + stale-state modal wiring
"""
import sys, re

path = r"c:\Users\maxgo\Desktop\DBSC Courses\docs\app.js"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# ------------------------------------------------------------------ #
# A) Insert helpers right after saveSelection()
# ------------------------------------------------------------------ #
ANCHOR_A = (
    "function saveSelection() {\n"
    "    localStorage.setItem(\"dbsc.card\", state.cardId);\n"
    "    localStorage.setItem(\"dbsc.wind\", state.windKey);\n"
    "    localStorage.setItem(\"dbsc.course\", String(state.courseN));\n"
    "}"
)
if ANCHOR_A not in content:
    print("ERROR: anchor A not found"); sys.exit(1)

HELPERS = r"""
// ============================================================
// Race State Persistence
// Saves the full active race state to localStorage so the app
// can survive page reloads, screen-off events, and accidental
// refreshes during a race.
// ============================================================
const RACE_STATE_KEY = "sailingRaceApp.activeRaceState";
const RACE_STATE_VERSION = 1;
const RACE_STATE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 h

// Throttle GPS saves — one write per 5 fixes (never on every fix)
let _gpsSaveThrottle = 0;

// Set by _applyShallowRaceRestore(); consumed at end of file once all
// IIFEs (incl. initStartSequence) have run and _restoreStartSeqState is live.
let _pendingRaceRestore = null;

/** Serialise the current race state to localStorage. Safe to call often. */
function saveRaceState() {
    const seq = typeof _getStartSeqState === "function" ? _getStartSeqState() : null;
    const obj = {
        v: RACE_STATE_VERSION,
        savedAt: Date.now(),
        cardId:  state.cardId,
        windKey: state.windKey,
        courseN: state.courseN,
        rounded: state.rounded,
        twdOverride: state.twdOverride,
        startLine: state.startLine,
        startSeq: seq ? {
            phase:      seq.phase,
            remaining:  seq.remaining,
            elapsed:    seq.elapsed,
            raceStartMs: seq.raceStartMs,
        } : null,
        gpsLastKnown: state.gpsPos ? {
            lat:      state.gpsPos.lat,
            lon:      state.gpsPos.lon,
            accuracy: state.gpsPos.accuracy,
            ts:       Date.now(),
        } : null,
    };
    try { localStorage.setItem(RACE_STATE_KEY, JSON.stringify(obj)); } catch (_) {}
}

/** Read saved race state from localStorage. Returns null on any problem. */
function loadRaceState() {
    try {
        const raw = localStorage.getItem(RACE_STATE_KEY);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") return null;
        if (obj.v !== RACE_STATE_VERSION) return null;
        return obj;
    } catch (_) {
        clearRaceState();
        return null;
    }
}

/** Wipe the saved race state key. */
function clearRaceState() {
    try { localStorage.removeItem(RACE_STATE_KEY); } catch (_) {}
}

/** Basic sanity checks before attempting a restore. */
function isSavedRaceStateValid(saved) {
    if (!saved) return false;
    if (typeof saved.savedAt !== "number") return false;
    if (!saved.cardId) return false;
    return true;
}

/**
 * Apply the easy fields (rounded, GPS, startLine) to state before the
 * first renderAll so the opening frame already shows the correct state.
 * Start-sequence restore is deferred — see bottom of file.
 */
function _applyShallowRaceRestore() {
    const saved = loadRaceState();
    if (!saved || !isSavedRaceStateValid(saved)) return;

    // rounded marks
    if (typeof saved.rounded === "number") state.rounded = saved.rounded;

    // start line ends
    if (saved.startLine && (saved.startLine.pinSet || saved.startLine.cbSet)) {
        state.startLine = saved.startLine;
    }

    // TWD override (normally session-scoped; promote to persisted on restore)
    if (saved.twdOverride != null) {
        state.twdOverride = saved.twdOverride;
        try { sessionStorage.setItem("dbsc.twd", String(saved.twdOverride)); } catch (_) {}
    }

    // Last known GPS position (shown as a stale dot until a real fix arrives)
    if (saved.gpsLastKnown && typeof saved.gpsLastKnown.lat === "number") {
        state.gpsPos = {
            lat:      saved.gpsLastKnown.lat,
            lon:      saved.gpsLastKnown.lon,
            accuracy: saved.gpsLastKnown.accuracy,
            heading:  null,
            speed:    null,
        };
    }

    _pendingRaceRestore = saved;
}

"""

content = content.replace(ANCHOR_A, ANCHOR_A + HELPERS)

# ------------------------------------------------------------------ #
# B) Insert deferred-restore + modal wiring near the end of the file,
#    just before the orientation-change IIFE.
# ------------------------------------------------------------------ #
ANCHOR_B = "(function () {\n    const viewportMeta = document.querySelector('meta[name=\"viewport\"]');"
if ANCHOR_B not in content:
    print("ERROR: anchor B not found"); sys.exit(1)

DEFERRED = r"""
// ============================================================
// Deferred race state restore — runs after all IIFEs have set
// _restoreStartSeqState, so the start sequence can be resumed.
// ============================================================
(function completeDeferredRaceRestore() {
    if (!_pendingRaceRestore) return;
    const saved = _pendingRaceRestore;
    _pendingRaceRestore = null;

    const ageMs = Date.now() - (saved.savedAt || 0);

    if (ageMs > RACE_STATE_MAX_AGE_MS) {
        // Too old — ask the user before restoring
        const ageH   = Math.floor(ageMs / 3600000);
        const ageMin = Math.floor((ageMs % 3600000) / 60000);
        const ageLabel = ageH > 0
            ? `${ageH}h ${ageMin}m ago`
            : `${ageMin} minutes ago`;
        const ageEl = document.getElementById("restoreRaceAge");
        if (ageEl) ageEl.textContent = ageLabel;
        const m = document.getElementById("restoreRaceModal");
        if (m) m.hidden = false;
    } else {
        // Fresh save — restore silently
        if (saved.startSeq && typeof _restoreStartSeqState === "function") {
            _restoreStartSeqState({ ...saved.startSeq, savedAt: saved.savedAt });
        }
        showToast("Race state restored \u2713");
    }
}());

// --- Restore / discard modal handlers ---
(function wireRestoreModal() {
    const modal = document.getElementById("restoreRaceModal");
    const btnYes = document.getElementById("restoreRaceYes");
    const btnNo  = document.getElementById("restoreRaceNo");

    if (btnYes) btnYes.addEventListener("click", () => {
        if (modal) modal.hidden = true;
        const saved = loadRaceState();
        if (saved && saved.startSeq && typeof _restoreStartSeqState === "function") {
            _restoreStartSeqState({ ...saved.startSeq, savedAt: saved.savedAt });
        }
        showToast("Race state restored \u2713");
    });

    if (btnNo) btnNo.addEventListener("click", () => {
        if (modal) modal.hidden = true;
        clearRaceState();
        state.rounded = 0;
        state.startLine = { pinSet: false, cbSet: false, pin: null, cb: null };
        state.gpsPos    = null;
        renderAll();
        if (typeof renderStartLinePanel === "function") renderStartLinePanel();
        showToast("Previous race discarded.");
    });
}());

"""

content = content.replace(ANCHOR_B, DEFERRED + ANCHOR_B)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Done A+B.")

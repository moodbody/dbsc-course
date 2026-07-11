"""Patch: finalize the initStartSequence IIFE — add saveRaceState to btnFinish,
set _getStartSeqState and _restoreStartSeqState at the end."""
import sys

path = r"c:\Users\maxgo\Desktop\DBSC Courses\docs\app.js"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# --- 1. Add saveRaceState() to btnFinish handler ---
OLD_FINISH = (
    "    if (btnFinish) btnFinish.addEventListener(\"click\", () => {\n"
    "        if (phase !== \"racing\") return;\n"
    "        stopTicker();\n"
    "        phase = \"finished\";\n"
    "        setPhaseUI();\n"
    "        updateClock();\n"
    "        updateSignals();\n"
    "        btnFinish.setAttribute(\"hidden\", \"\");\n"
    "        if (btnReset) btnReset.removeAttribute(\"hidden\");\n"
    "        showToast(`\U0001F3C1 Race finished \u2014 elapsed time ${fmtMSS(elapsed)}`);\n"
    "    });"
)
NEW_FINISH = (
    "    if (btnFinish) btnFinish.addEventListener(\"click\", () => {\n"
    "        if (phase !== \"racing\") return;\n"
    "        stopTicker();\n"
    "        phase = \"finished\";\n"
    "        setPhaseUI();\n"
    "        updateClock();\n"
    "        updateSignals();\n"
    "        btnFinish.setAttribute(\"hidden\", \"\");\n"
    "        if (btnReset) btnReset.removeAttribute(\"hidden\");\n"
    "        showToast(`\U0001F3C1 Race finished \u2014 elapsed time ${fmtMSS(elapsed)}`);\n"
    "        saveRaceState();\n"
    "    });"
)
if OLD_FINISH not in content:
    print("ERROR: btnFinish anchor not found")
    # Show what's around the area
    idx = content.find("Race finished")
    print(repr(content[idx-100:idx+200]))
    sys.exit(1)
content = content.replace(OLD_FINISH, NEW_FINISH, 1)
print("btnFinish patched.")

# --- 2. Replace the IIFE closing section to expose _getStartSeqState and
#        _restoreStartSeqState ---
OLD_CLOSE = (
    "    if (btnReset) btnReset.addEventListener(\"click\", doReset);\n"
    "\n"
    "    // Initial render\n"
    "    updateClock();\n"
    "    updateSignals();\n"
    "    setPhaseUI();\n"
    "}());"
)
NEW_CLOSE = r"""    if (btnReset) btnReset.addEventListener("click", doReset);

    // Initial render
    updateClock();
    updateSignals();
    setPhaseUI();

    // Expose state and restore hook to module scope
    _getStartSeqState = () => ({ phase, remaining, elapsed, raceStartMs });

    _restoreStartSeqState = function(saved) {
        stopTicker();
        phase       = saved.phase       || "idle";
        remaining   = saved.remaining  !== undefined ? saved.remaining  : DEFAULT_SECS;
        elapsed     = saved.elapsed    !== undefined ? saved.elapsed    : 0;
        raceStartMs = saved.raceStartMs || null;

        // Advance time-sensitive values for the gap while the app was closed
        const dt = Math.floor((Date.now() - (saved.savedAt || Date.now())) / 1000);
        if (phase === "countdown") {
            remaining = Math.max(0, remaining - dt);
            if (remaining <= 0) {
                // Gun would have fired during the gap
                phase = "racing";
                raceStartMs = raceStartMs || ((saved.savedAt || Date.now()) + (saved.remaining || 0) * 1000);
            }
        }
        if (phase === "racing" && raceStartMs) {
            elapsed = Math.max(0, Math.floor((Date.now() - raceStartMs) / 1000));
        }

        setPhaseUI();
        updateClock();
        updateSignals();

        const inProgress = phase !== "idle";
        if (adjustEl)  { if (!inProgress) adjustEl.removeAttribute("hidden");  else adjustEl.hidden = true; }
        if (btnGo)     { if (!inProgress) btnGo.removeAttribute("hidden");    else btnGo.setAttribute("hidden", ""); }
        if (btnFinish) { if (phase === "racing")  btnFinish.removeAttribute("hidden"); else btnFinish.setAttribute("hidden", ""); }
        if (btnReset)  { if (inProgress)  btnReset.removeAttribute("hidden");  else btnReset.setAttribute("hidden", ""); }
        if (phase === "countdown" || phase === "racing") startTicker();
    };
}());"""

if OLD_CLOSE not in content:
    print("ERROR: IIFE close anchor not found"); sys.exit(1)
content = content.replace(OLD_CLOSE, NEW_CLOSE, 1)
print("IIFE close patched.")

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Done.")

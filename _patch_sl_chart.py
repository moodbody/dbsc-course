"""
Patch: add start-line rendering to the end of drawMapTo().
Inserts before the final closing brace of the function (after the GPS dot section).
"""
import sys

path = r"c:\Users\maxgo\Desktop\DBSC Courses\docs\app.js"
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The GPS dot section ends with these lines, followed by the closing brace of drawMapTo
ANCHOR = (
    "    // GPS position\n"
    "    if (state.gpsPos) {\n"
)

# Find the GPS block — we insert AFTER it, before the `}` that closes drawMapTo
# The drawMapTo function ends at the `}` after the GPS block.
# We can find the GPS block and then scan for the matching close brace.

start_idx = content.find(ANCHOR)
if start_idx == -1:
    print("ERROR: GPS anchor not found"); sys.exit(1)

# Walk forward to find the end of the GPS `if` block
depth = 0
i = start_idx + len("    // GPS position\n")
in_block = False
end_of_gps = None
for j in range(i, len(content)):
    ch = content[j]
    if ch == '{':
        depth += 1
        in_block = True
    elif ch == '}':
        depth -= 1
        if in_block and depth == 0:
            end_of_gps = j + 1  # index just after the closing brace of the GPS if
            break

if end_of_gps is None:
    print("ERROR: could not find end of GPS block"); sys.exit(1)

# Now find the `}` that closes drawMapTo — it should be the next `}` at the same
# indentation level (0 braces deep relative to the function body).
# Actually, let's find the next `\n}` after end_of_gps (function close brace).
close_brace_idx = content.find("\n}", end_of_gps)
if close_brace_idx == -1:
    print("ERROR: could not find drawMapTo closing brace"); sys.exit(1)

print(f"Inserting start-line chart code at index {close_brace_idx}")

CHART_CODE = r"""
    // ---- Start Line ----
    if (state.startLine.pinSet || state.startLine.cbSet) {
        const slMarkR   = Math.max(6, Math.round(W * 0.013));
        const slFont    = `bold ${Math.round(W * 0.019)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
        const slLineCol = "#f5d400";   // vivid yellow — always legible on chart
        const accentCol = cssVar("--accent", "#ffb000");
        const favored   = slFavoredEnd();

        // Draw the line if both ends are set
        if (state.startLine.pinSet && state.startLine.cbSet) {
            const [px, py] = project(state.startLine.pin.lat, state.startLine.pin.lon);
            const [cx, cy] = project(state.startLine.cb.lat,  state.startLine.cb.lon);

            // Dashed line
            ctx.setLineDash([8, 5]);
            ctx.lineWidth   = Math.max(2.5, W * 0.004);
            ctx.strokeStyle = slLineCol;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
            ctx.setLineDash([]);

            // DTL indicator — perpendicular from boat to line
            if (state.gpsPos) {
                const [gx, gy] = project(state.gpsPos.lat, state.gpsPos.lon);
                const dtlM = slDtlMeters();
                if (dtlM != null) {
                    // Project boat onto the start-line segment
                    const midLat  = (state.startLine.pin.lat + state.startLine.cb.lat) / 2;
                    const cosL    = Math.cos(midLat * Math.PI / 180);
                    const mpLat   = 111320, mpLon = 111320 * cosL;
                    const lxm = (state.startLine.cb.lon - state.startLine.pin.lon) * mpLon;
                    const lym = (state.startLine.cb.lat - state.startLine.pin.lat) * mpLat;
                    const lLen = Math.sqrt(lxm * lxm + lym * lym);
                    const bxm = (state.gpsPos.lon - state.startLine.pin.lon) * mpLon;
                    const bym = (state.gpsPos.lat - state.startLine.pin.lat) * mpLat;
                    const t   = Math.max(0, Math.min(1, (bxm * lxm + bym * lym) / (lLen * lLen)));
                    const fpLon = state.startLine.pin.lon + t * (state.startLine.cb.lon - state.startLine.pin.lon);
                    const fpLat = state.startLine.pin.lat + t * (state.startLine.cb.lat - state.startLine.pin.lat);
                    const [fpx, fpy] = project(fpLat, fpLon);

                    const isOcs = dtlM > 0;
                    ctx.setLineDash([3, 4]);
                    ctx.lineWidth   = Math.max(1.5, W * 0.003);
                    ctx.strokeStyle = isOcs ? "#ff4444" : "#3aa0ff";
                    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(fpx, fpy); ctx.stroke();
                    ctx.setLineDash([]);

                    // DTL label
                    const lmx = (gx + fpx) / 2, lmy = (gy + fpy) / 2;
                    const txt  = _fmtSlDist(dtlM);
                    ctx.font = `bold ${Math.round(W * 0.018)}px -apple-system, "Segoe UI", Roboto, sans-serif`;
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    const tw = ctx.measureText(txt).width;
                    ctx.fillStyle = "rgba(0,0,0,0.45)";
                    ctx.fillRect(lmx - tw / 2 - 4, lmy - 9, tw + 8, 18);
                    ctx.fillStyle = isOcs ? "#ff6666" : "#5abcff";
                    ctx.fillText(txt, lmx, lmy);
                }
            }
        }

        // End markers
        function drawSlEnd(lat, lon, label, isFav) {
            const [ex, ey] = project(lat, lon);
            ctx.beginPath();
            ctx.arc(ex, ey, slMarkR, 0, Math.PI * 2);
            ctx.fillStyle = isFav ? accentCol : "rgba(245,212,0,0.25)";
            ctx.fill();
            ctx.lineWidth   = isFav ? 3 : 1.5;
            ctx.strokeStyle = slLineCol;
            ctx.stroke();
            ctx.fillStyle   = isFav ? "#0a1a2c" : cssVar("--muted", "#8aa5bf");
            ctx.font = slFont;
            ctx.textAlign = "center"; ctx.textBaseline = "bottom";
            // Outline for legibility on all chart backgrounds
            ctx.save();
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = Math.max(3, W * 0.006);
            ctx.lineJoin = "round";
            ctx.strokeText(label, ex, ey - slMarkR - 3);
            ctx.restore();
            ctx.fillText(label, ex, ey - slMarkR - 3);
        }

        if (state.startLine.pinSet) drawSlEnd(state.startLine.pin.lat, state.startLine.pin.lon, "PIN", favored === "pin");
        if (state.startLine.cbSet)  drawSlEnd(state.startLine.cb.lat,  state.startLine.cb.lon,  "CB",  favored === "cb");
    }
"""

content = content[:close_brace_idx] + CHART_CODE + content[close_brace_idx:]

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Done.")

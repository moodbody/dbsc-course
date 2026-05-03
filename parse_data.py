"""
Parse DBSC course-card PDFs and the Marks/Bearings/Distances PDF
into a single data.js file for the offline web app.

Run:
    python parse_data.py

Outputs:
    docs/data.js   (defines window.DBSC_DATA)
    data.json      (same data, easier to inspect)
"""

from __future__ import annotations
import json
import os
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent
PDF_DIR = ROOT / "Course_information"
APP_DIR = ROOT / "docs"
APP_DIR.mkdir(exist_ok=True)

# Column order used by the bearings/distances matrix
LETTERS = ["A","B","C","D","E","F","G","H","J","K","L","M",
           "N","O","P","Q","R","S","T","V","W","X","Y","3"]
# Rows are letters minus "3" (no FROM-3 row in the table)
ROW_LETTERS = [c for c in LETTERS if c != "3"]

# Card metadata for nicer UI labels
CARD_META = {
    "CC1_Saturday_CV_2026_v1.pdf":      {"id": "CC1", "name": "Saturday – Committee Vessel", "vhf": "74"},
    "CC2_Saturday_Hut_2026_v1.pdf":     {"id": "CC2", "name": "Saturday – Hut",              "vhf": "68"},
    "CC3_Thursday_Blue_2026_v1.pdf":    {"id": "CC3", "name": "Thursday – Blue Fleet",       "vhf": "74"},
    "CC4_Thursday_Red_2026_v1.pdf":     {"id": "CC4", "name": "Thursday – Red Fleet",        "vhf": "72"},
    "CC5_Tuesday_Hut_2026_v1.pdf":      {"id": "CC5", "name": "Tuesday – Hut",               "vhf": "68"},
}


# ---------------------------------------------------------------------------
# Marks / bearings / distances
# ---------------------------------------------------------------------------
def parse_marks_pdf(path: Path) -> dict:
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text()
    lines = [l.rstrip() for l in text.split("\n")]

    # Skip the 4 header lines (title, lat, long+To:, "min From ...")
    # Then rows come in groups of 3:
    #   "<lat_min> <name...> <23 bearings>"
    #   "<letter>"
    #   "<long_min> <colour...> <23 distances>"
    body = lines[4:]

    marks = {}
    bearings = {}   # bearings[from][to] = degrees
    distances = {}  # distances[from][to] = nautical miles

    i = 0
    while i + 2 < len(body):
        line_b = body[i]
        line_l = body[i + 1].strip()
        line_d = body[i + 2]
        if not re.fullmatch(r"[A-Z0-9]", line_l):
            i += 1
            continue
        letter = line_l

        # --- bearing line: "<lat> <name...> b1 b2 ... b24"
        # The matrix has 24 columns and includes the diagonal cell as "-".
        toks = line_b.split()
        b_tokens = toks[-24:]
        name_tokens = toks[1:-24]
        lat_min = float(toks[0])
        name = " ".join(name_tokens)

        # --- distance line: "<long> <colour...> d1 ... d24"
        toks = line_d.split()
        d_tokens = toks[-24:]
        colour_tokens = toks[1:-24]
        long_min = float(toks[0])
        colour = " ".join(colour_tokens)

        # Convert minutes to decimal degrees (53° N, 6° W)
        lat = 53.0 + lat_min / 60.0
        lon = -(6.0 + long_min / 60.0)

        marks[letter] = {
            "letter": letter,
            "name": name,
            "colour": colour,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
        }

        # Build per-row bearing/distance dicts. The 24 tokens already
        # contain the diagonal "-" at the correct position.
        b_row, d_row = {}, {}
        for col_letter, b, d in zip(LETTERS, b_tokens, d_tokens):
            if col_letter == letter:
                continue
            try:
                b_row[col_letter] = int(b)
            except ValueError:
                pass
            try:
                d_row[col_letter] = float(d)
            except ValueError:
                pass
        bearings[letter] = b_row
        distances[letter] = d_row

        i += 3

    # Synthesise the missing "From 3 (Green)" row using reciprocal bearings
    # and symmetric distance.
    bearings["3"] = {}
    distances["3"] = {}
    for src in ROW_LETTERS:
        if "3" in bearings[src]:
            bearings["3"][src] = (bearings[src]["3"] + 180) % 360
        if "3" in distances[src]:
            distances["3"][src] = distances[src]["3"]

    # Add a placeholder mark entry for "3" so the UI can label it.
    # Its location is approximated as midway between A (Salthill/Orange start)
    # and the West Pier hut (mark O). We use the same lat/lon as O, since
    # 3 is one of the start-line marks at the West Pier hut.
    if "O" in marks:
        o = marks["O"]
        marks["3"] = {
            "letter": "3",
            "name": "Green Start",
            "colour": "Green",
            "lat": o["lat"],
            "lon": o["lon"],
            "approx": True,
        }

    return {"marks": marks, "bearings": bearings, "distances": distances}


# ---------------------------------------------------------------------------
# Course cards
# ---------------------------------------------------------------------------
# A row in a course card looks like:
#     "1 Ep Cp Np Fp Ws Mp As"           (CC1/2/3/5 – with p/s)
# or  "1 N V T V T R N R"                 (CC4 – all-port)
# Wind-direction header rows look like:  "A 000°  B 022°"
# (PDF extraction renders the degree sign as "░" or "°" depending on font).

WIND_HEADER_RE = re.compile(
    r"\b([A-Z])\s+(\d{3})\s*[°░]"
)
COURSE_LINE_RE = re.compile(r"^\s*([1-8])\s+(.+?)\s*$")
TOKEN_RE = re.compile(r"^([A-Z]|[0-9])([ps])?$", re.IGNORECASE)


def parse_course_pdf(path: Path) -> dict:
    """Return {wind_letter: {"bearing": int, "courses": {n: [tokens]}}}."""
    with pdfplumber.open(path) as pdf:
        text = "\n".join((p.extract_text() or "") for p in pdf.pages)

    # Normalise the degree placeholder so the regex above just works.
    text = text.replace("░", "°")
    lines = [l.rstrip() for l in text.split("\n")]

    wind = {}                # wind[letter] = {bearing, courses: {n: [...]}}
    current_letters: list = []   # active wind letters for the current header

    for line in lines:
        # Detect 1-2 wind-direction headers on a line
        headers = WIND_HEADER_RE.findall(line)
        if headers and not COURSE_LINE_RE.match(line):
            # A header row may declare 1, 2 or 3 wind letters at once
            current_letters = []
            for letter, deg in headers:
                wind.setdefault(letter, {"bearing": int(deg), "courses": {}})
                current_letters.append(letter)
            continue

        if not current_letters:
            continue

        m = COURSE_LINE_RE.match(line)
        if not m:
            continue
        num = int(m.group(1))
        rest = m.group(2)

        # Each wind letter on this row has its own course; courses are
        # separated by a digit that starts the next course block.
        # We split the row by detecting where the next "<digit> ..." begins.
        # Simplest: split tokens, then partition by counting how many
        # token-groups exist (one per current_letters).
        tokens = rest.split()

        # Re-split: every time we hit another "1-8" digit token, start a new bucket
        buckets: list[list[str]] = [[]]
        for t in tokens:
            if re.fullmatch(r"[1-8]", t):
                buckets.append([])
                continue
            buckets[-1].append(t)

        # Pad / trim to len(current_letters)
        if len(buckets) < len(current_letters):
            buckets += [[] for _ in range(len(current_letters) - len(buckets))]

        for letter, bucket in zip(current_letters, buckets):
            cleaned = []
            for tok in bucket:
                m2 = TOKEN_RE.match(tok)
                if not m2:
                    continue
                mark = m2.group(1).upper()
                side = (m2.group(2) or "").lower()  # 'p', 's' or ''
                cleaned.append({"mark": mark, "side": side})
            if cleaned:
                wind[letter]["courses"][num] = cleaned

    return wind


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    marks_pdf = PDF_DIR / "DBSC_Marks_Bearings_Distances_2026_v1.pdf"
    print(f"Parsing marks: {marks_pdf.name}")
    marks_data = parse_marks_pdf(marks_pdf)
    print(f"  {len(marks_data['marks'])} marks parsed")

    cards = {}
    for fname, meta in CARD_META.items():
        path = PDF_DIR / fname
        if not path.exists():
            print(f"  ! missing {fname}")
            continue
        print(f"Parsing card: {fname}")
        wind = parse_course_pdf(path)
        # Cosmetic: detect the all-port (Red Fleet) cards
        all_port = all(
            tok["side"] == ""
            for w in wind.values()
            for c in w["courses"].values()
            for tok in c
        )
        cards[meta["id"]] = {
            **meta,
            "all_port": all_port,
            "wind": wind,
        }
        n_courses = sum(len(w["courses"]) for w in wind.values())
        print(f"  {len(wind)} wind directions, {n_courses} courses")

    data = {
        "marks":     marks_data["marks"],
        "bearings":  marks_data["bearings"],
        "distances": marks_data["distances"],
        "cards":     cards,
    }

    json_path = ROOT / "data.json"
    json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {json_path}")

    # Also publish data.json into docs/ so the deployed app can fetch it.
    docs_json = APP_DIR / "data.json"
    docs_json.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {docs_json}")

    js_path = APP_DIR / "data.js"
    js_path.write_text(
        "// Auto-generated by parse_data.py – do not edit by hand.\n"
        "// This file is the offline fallback; the app prefers data.json at runtime.\n"
        "window.DBSC_DATA = " + json.dumps(data) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {js_path}")


if __name__ == "__main__":
    main()

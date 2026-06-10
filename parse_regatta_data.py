"""
Parse the DL Club Regattas Course Card A and produce regatta-data.js / regatta-data.json.

Course Card A data is hard-coded from the 2026 card (the table is embedded as an
image in the PDF and cannot be extracted via pdfplumber).

The mark/bearing/distance tables are shared with the main DBSC data (same physical
marks on Dublin Bay), so they are read from data.json rather than duplicated.

Run:
    .venv\\Scripts\\python.exe parse_regatta_data.py

Outputs:
    docs/regatta-data.js   (defines window.REGATTA_DATA)
    regatta-data.json      (same data, easier to inspect)
"""

from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_DIR = ROOT / "docs"
APP_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# Course Card A — DL Combined Clubs 2026
# All marks rounded to port (side = "p") per SI rule A1.6.
# Wind sectors A–R follow the same 22.5° step scheme as the DBSC cards.
# Each sector has 4 courses (1–4: longest to shortest).
# ---------------------------------------------------------------------------

def mk(letter: str) -> dict:
    """Convenience: mark token with port rounding."""
    return {"mark": letter, "side": "p"}


CARD_A_WIND: dict = {
    "A": {
        "bearing": 0,
        "courses": {
            1: [mk("E"), mk("D"), mk("B"), mk("D"), mk("B"), mk("D"), mk("C"), mk("K")],
            2: [mk("E"), mk("D"), mk("B"), mk("D"), mk("C"), mk("K")],
            3: [mk("E"), mk("C"), mk("K")],
            4: [mk("E"), mk("K")],
        },
    },
    "B": {
        "bearing": 22,
        "courses": {
            1: [mk("F"), mk("E"), mk("B"), mk("E"), mk("B"), mk("E"), mk("C"), mk("K")],
            2: [mk("F"), mk("E"), mk("B"), mk("E"), mk("C"), mk("K")],
            3: [mk("F"), mk("C"), mk("K")],
            4: [mk("F"), mk("K")],
        },
    },
    "C": {
        "bearing": 45,
        "courses": {
            1: [mk("F"), mk("E"), mk("C"), mk("E"), mk("C"), mk("E"), mk("D"), mk("B")],
            2: [mk("F"), mk("E"), mk("C"), mk("E"), mk("D"), mk("B")],
            3: [mk("F"), mk("D"), mk("B")],
            4: [mk("F"), mk("B")],
        },
    },
    "D": {
        "bearing": 67,
        "courses": {
            1: [mk("G"), mk("F"), mk("C"), mk("F"), mk("C"), mk("F"), mk("D"), mk("B")],
            2: [mk("G"), mk("F"), mk("C"), mk("F"), mk("D"), mk("B")],
            3: [mk("G"), mk("D"), mk("B")],
            4: [mk("G"), mk("B")],
        },
    },
    "E": {
        "bearing": 90,
        "courses": {
            1: [mk("G"), mk("F"), mk("D"), mk("F"), mk("D"), mk("F"), mk("E"), mk("C")],
            2: [mk("G"), mk("F"), mk("D"), mk("F"), mk("E"), mk("C")],
            3: [mk("G"), mk("E"), mk("C")],
            4: [mk("G"), mk("C")],
        },
    },
    "F": {
        "bearing": 112,
        "courses": {
            1: [mk("J"), mk("G"), mk("D"), mk("G"), mk("D"), mk("G"), mk("E"), mk("C")],
            2: [mk("J"), mk("G"), mk("D"), mk("G"), mk("E"), mk("C")],
            3: [mk("J"), mk("E"), mk("C")],
            4: [mk("J"), mk("C")],
        },
    },
    "G": {
        "bearing": 135,
        "courses": {
            1: [mk("J"), mk("G"), mk("E"), mk("G"), mk("E"), mk("G"), mk("F"), mk("D")],
            2: [mk("J"), mk("G"), mk("E"), mk("G"), mk("F"), mk("D")],
            3: [mk("J"), mk("F"), mk("D")],
            4: [mk("J"), mk("D")],
        },
    },
    "H": {
        "bearing": 157,
        "courses": {
            1: [mk("K"), mk("J"), mk("E"), mk("J"), mk("E"), mk("J"), mk("F"), mk("D")],
            2: [mk("K"), mk("J"), mk("E"), mk("J"), mk("F"), mk("D")],
            3: [mk("K"), mk("F"), mk("D")],
            4: [mk("K"), mk("D")],
        },
    },
    "J": {
        "bearing": 180,
        "courses": {
            1: [mk("K"), mk("J"), mk("F"), mk("J"), mk("F"), mk("J"), mk("G"), mk("E")],
            2: [mk("K"), mk("J"), mk("F"), mk("J"), mk("G"), mk("E")],
            3: [mk("K"), mk("G"), mk("E")],
            4: [mk("K"), mk("E")],
        },
    },
    "K": {
        "bearing": 202,
        "courses": {
            1: [mk("B"), mk("K"), mk("F"), mk("K"), mk("F"), mk("K"), mk("G"), mk("E")],
            2: [mk("B"), mk("K"), mk("F"), mk("K"), mk("G"), mk("E")],
            3: [mk("B"), mk("G"), mk("E")],
            4: [mk("B"), mk("E")],
        },
    },
    "L": {
        "bearing": 225,
        "courses": {
            1: [mk("B"), mk("K"), mk("G"), mk("K"), mk("G"), mk("K"), mk("G"), mk("F")],
            2: [mk("B"), mk("K"), mk("G"), mk("K"), mk("J"), mk("F")],
            3: [mk("B"), mk("J"), mk("F")],
            4: [mk("B"), mk("F")],
        },
    },
    "M": {
        "bearing": 247,
        "courses": {
            1: [mk("C"), mk("B"), mk("G"), mk("B"), mk("G"), mk("B"), mk("J"), mk("F")],
            2: [mk("C"), mk("B"), mk("G"), mk("B"), mk("J"), mk("F")],
            3: [mk("C"), mk("J"), mk("F")],
            4: [mk("C"), mk("F")],
        },
    },
    "N": {
        "bearing": 270,
        "courses": {
            1: [mk("C"), mk("B"), mk("J"), mk("B"), mk("J"), mk("B"), mk("K"), mk("G")],
            2: [mk("C"), mk("B"), mk("J"), mk("B"), mk("K"), mk("G")],
            3: [mk("C"), mk("K"), mk("G")],
            4: [mk("C"), mk("G")],
        },
    },
    "P": {
        "bearing": 292,
        "courses": {
            1: [mk("D"), mk("C"), mk("J"), mk("C"), mk("J"), mk("C"), mk("K"), mk("G")],
            2: [mk("D"), mk("C"), mk("J"), mk("C"), mk("K"), mk("G")],
            3: [mk("D"), mk("K"), mk("G")],
            4: [mk("D"), mk("G")],
        },
    },
    "Q": {
        "bearing": 315,
        "courses": {
            1: [mk("D"), mk("C"), mk("K"), mk("C"), mk("K"), mk("C"), mk("B"), mk("J")],
            2: [mk("D"), mk("C"), mk("K"), mk("C"), mk("B"), mk("J")],
            3: [mk("D"), mk("B"), mk("J")],
            4: [mk("D"), mk("J")],
        },
    },
    "R": {
        "bearing": 337,
        "courses": {
            1: [mk("E"), mk("D"), mk("K"), mk("D"), mk("K"), mk("D"), mk("B"), mk("J")],
            2: [mk("E"), mk("D"), mk("K"), mk("D"), mk("B"), mk("J")],
            3: [mk("E"), mk("B"), mk("J")],
            4: [mk("E"), mk("J")],
        },
    },
}

# Convert course number keys to strings (JSON keys must be strings)
def stringify_course_keys(wind: dict) -> dict:
    return {
        letter: {
            "bearing": data["bearing"],
            "courses": {str(k): v for k, v in data["courses"].items()},
        }
        for letter, data in wind.items()
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    # Load shared marks/bearings/distances from the already-parsed data.json
    data_json = ROOT / "data.json"
    if not data_json.exists():
        raise FileNotFoundError(
            "data.json not found — run parse_data.py first to generate it."
        )
    with open(data_json, encoding="utf-8") as f:
        base = json.load(f)

    card_a = {
        "id": "CRA",
        "name": "Club Regattas – Course A",
        "vhf": "74",
        "all_port": True,
        "wind": stringify_course_keys(CARD_A_WIND),
    }

    data = {
        "marks":     base["marks"],
        "bearings":  base["bearings"],
        "distances": base["distances"],
        "cards": {
            "CRA": card_a,
        },
    }

    json_path = ROOT / "regatta-data.json"
    json_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Wrote {json_path}")

    js_path = APP_DIR / "regatta-data.js"
    js_path.write_text(
        "// Auto-generated by parse_regatta_data.py – do not edit by hand.\n"
        "// DL Combined Clubs 2026 — Course Card A (Cruisers, VHF 74).\n"
        "// Marks and bearing/distance tables are shared with DBSC Dublin Bay data.\n"
        "window.REGATTA_DATA = " + json.dumps(data) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {js_path}")
    print(f"  Cards: {list(data['cards'].keys())}")
    print(f"  Wind sectors: {len(card_a['wind'])}")
    total = sum(len(w['courses']) for w in card_a['wind'].values())
    print(f"  Total courses: {total}")


if __name__ == "__main__":
    main()

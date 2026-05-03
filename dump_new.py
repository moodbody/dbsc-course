"""Quick dump of the new schedule + race-times PDFs to inspect content."""
import pdfplumber, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "Course_information"
for name in ["DBSC_Racing_Programme_2026_v2.pdf", "DBSC_Keelboat_Race_Times_2026_v1.pdf"]:
    print("=" * 80)
    print(name)
    print("=" * 80)
    with pdfplumber.open(ROOT / name) as pdf:
        for i, p in enumerate(pdf.pages):
            print(f"--- page {i+1} ---")
            print(p.extract_text() or "")

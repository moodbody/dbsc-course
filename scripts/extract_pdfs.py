"""Dev helper: dump extracted text from every PDF in data/course-information/
to a scratch JSON file for manual inspection when new season PDFs arrive.
Not part of the main data pipeline (see parse_data.py).

Run:
    scripts\extract_pdfs.py
"""
import pdfplumber, os, sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
folder = ROOT / "data" / "course-information"
out = {}
for f in os.listdir(folder):
    if f.lower().endswith(".pdf"):
        path = os.path.join(folder, f)
        pages_text = []
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                pages_text.append({"page": i+1, "text": page.extract_text() or ""})
        out[f] = pages_text

with open(ROOT / "pdf_extracted.json", "w", encoding="utf-8") as g:
    json.dump(out, g, indent=2)

for f, pages in out.items():
    print("="*80)
    print(f)
    print("="*80)
    for p in pages:
        print(f"--- Page {p['page']} ---")
        print(p['text'])

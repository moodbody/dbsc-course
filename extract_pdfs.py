import pdfplumber, os, sys, json

folder = r"c:\Users\maxgo\Desktop\DBSC Courses\Course_information"
out = {}
for f in os.listdir(folder):
    if f.lower().endswith(".pdf"):
        path = os.path.join(folder, f)
        pages_text = []
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                pages_text.append({"page": i+1, "text": page.extract_text() or ""})
        out[f] = pages_text

with open(r"c:\Users\maxgo\Desktop\DBSC Courses\pdf_extracted.json", "w", encoding="utf-8") as g:
    json.dump(out, g, indent=2)

for f, pages in out.items():
    print("="*80)
    print(f)
    print("="*80)
    for p in pages:
        print(f"--- Page {p['page']} ---")
        print(p['text'])

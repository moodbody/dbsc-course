"""Generate simple DBSC app icons (PNG) for the PWA.
Run once after parse_data.py:
    scripts\\make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (11, 31, 51)        # deep navy (matches app)
RING = (255, 176, 0)     # accent
TEXT = (245, 247, 250)


def font_for(size: int):
    # Try a few common bundled fonts; fall back to default
    for name in ("seguisb.ttf", "segoeuib.ttf", "arialbd.ttf", "Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()


def make(size: int, filename: str, rounded: bool = False, padding_ratio: float = 0.10):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = int(size * padding_ratio)
    box = [pad, pad, size - pad, size - pad]

    # Rounded square background (iOS will round again, but rounded helps Android)
    if rounded:
        radius = int(size * 0.22)
        d.rounded_rectangle(box, radius=radius, fill=BG)
    else:
        d.rectangle(box, fill=BG)

    # Compass-like ring
    inner_pad = int(size * 0.18)
    ring_box = [inner_pad, inner_pad, size - inner_pad, size - inner_pad]
    ring_w = max(2, int(size * 0.025))
    d.ellipse(ring_box, outline=RING, width=ring_w)

    # Tick marks at N/E/S/W
    cx = cy = size / 2
    r_outer = (size - 2 * inner_pad) / 2
    r_inner = r_outer - size * 0.06
    for ang in (0, 90, 180, 270):
        import math
        rad = math.radians(ang - 90)
        x1 = cx + math.cos(rad) * r_outer
        y1 = cy + math.sin(rad) * r_outer
        x2 = cx + math.cos(rad) * r_inner
        y2 = cy + math.sin(rad) * r_inner
        d.line([x1, y1, x2, y2], fill=RING, width=ring_w)

    # "DBSC" text
    txt = "DBSC"
    fs = int(size * 0.22)
    f = font_for(fs)
    bbox = d.textbbox((0, 0), txt, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - size * 0.015),
           txt, fill=TEXT, font=f)

    img.save(OUT / filename)
    print("wrote", OUT / filename)


if __name__ == "__main__":
    make(192, "icon-192.png", rounded=True)
    make(512, "icon-512.png", rounded=True)
    make(180, "apple-touch-icon.png", rounded=False, padding_ratio=0.0)  # iOS masks corners itself
    # Maskable icon (safe-zone padding) for Android
    make(512, "icon-512-maskable.png", rounded=True, padding_ratio=0.18)
    # Favicon
    make(64, "favicon-64.png", rounded=True)
    print("done")

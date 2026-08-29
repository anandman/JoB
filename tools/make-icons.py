#!/usr/bin/env python3
"""
Generate Jacks or Bettorment PWA icons into job/icons/. Run after changing
the mark:

    python3 tools/make-icons.py

Maskable icons keep their content inside the safe zone (a centre circle of
40% radius) because Android crops them to arbitrary shapes.
"""
from PIL import Image, ImageDraw, ImageFont
import os

BG    = (13, 17, 23)     # --color-bg
CARD  = (230, 237, 243)  # --color-text
GOLD  = (240, 192, 64)   # --color-gold
RED   = (248, 81, 73)    # --color-red

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT  = os.path.join(ROOT, "job", "icons")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def font_at(px):
    return ImageFont.truetype(FONT, px)


def centered(draw, xy, text, font, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((xy[0] - (box[0] + box[2]) / 2, xy[1] - (box[1] + box[3]) / 2),
              text, font=font, fill=fill)


def draw_icon(size, scale=1.0, bg=BG):
    """A playing card bearing J and a heart pip, on the app's dark ground."""
    ss = 4  # supersample for clean edges
    img = Image.new("RGB", (size * ss, size * ss), bg)
    d = ImageDraw.Draw(img)
    S = size * ss

    cw, ch = S * 0.52 * scale, S * 0.70 * scale
    x0, y0 = (S - cw) / 2, (S - ch) / 2
    r = cw * 0.14

    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=r, fill=CARD)
    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=r,
                        outline=GOLD, width=max(1, int(S * 0.012 * scale)))

    centered(d, (S / 2, y0 + ch * 0.40), "J", font_at(int(ch * 0.46)), BG)
    centered(d, (S / 2, y0 + ch * 0.72), "♥", font_at(int(ch * 0.26)), RED)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    targets = [
        ("icon-192.png", 192, 1.0, BG),
        ("icon-512.png", 512, 1.0, BG),
        # Maskable: shrink the mark so cropping can't clip it.
        ("icon-maskable-192.png", 192, 0.72, BG),
        ("icon-maskable-512.png", 512, 0.72, BG),
        # iOS composites onto its own rounded mask; no transparency allowed.
        ("apple-touch-icon.png", 180, 1.0, BG),
        ("favicon-32.png", 32, 1.0, BG),
    ]
    for name, size, scale, bg in targets:
        draw_icon(size, scale, bg).save(os.path.join(OUT, name), optimize=True)
        print("wrote icons/%s (%dx%d)" % (name, size, size))


if __name__ == "__main__":
    main()

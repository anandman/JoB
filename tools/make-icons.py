#!/usr/bin/env python3
"""
Generate PWA icons for every app. Run after changing a mark:

    python3 tools/make-icons.py            # all apps
    python3 tools/make-icons.py job        # just one

Each app's mark is a playing card, because that is what both games are. The
rank and pip name the game: J and a heart for Jacks or Bettorment, A and a
spade for Bettor or Bust, whose blackjack is exactly that card plus a ten.

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
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

APPS = {
    "job": {"rank": "J", "pip": "\u2665", "pip_fill": RED},   # heart
    "bob": {"rank": "A", "pip": "\u2660", "pip_fill": BG},    # spade
}


def font_at(px):
    return ImageFont.truetype(FONT, px)


def centered(draw, xy, text, font, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((xy[0] - (box[0] + box[2]) / 2, xy[1] - (box[1] + box[3]) / 2),
              text, font=font, fill=fill)


def draw_icon(app, size, scale=1.0, bg=BG):
    """A playing card bearing the app's rank and pip, on the dark ground."""
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

    centered(d, (S / 2, y0 + ch * 0.40), app["rank"], font_at(int(ch * 0.46)), BG)
    centered(d, (S / 2, y0 + ch * 0.72), app["pip"], font_at(int(ch * 0.26)), app["pip_fill"])

    return img.resize((size, size), Image.LANCZOS)


def main():
    import sys
    wanted = sys.argv[1:] or sorted(APPS)
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
    for key in wanted:
        if key not in APPS:
            raise SystemExit("unknown app %r; known: %s" % (key, ", ".join(sorted(APPS))))
        out = os.path.join(ROOT, key, "icons")
        os.makedirs(out, exist_ok=True)
        for name, size, scale, bg in targets:
            draw_icon(APPS[key], size, scale, bg).save(os.path.join(out, name), optimize=True)
        print("wrote %d icons into %s/icons/" % (len(targets), key))


if __name__ == "__main__":
    main()

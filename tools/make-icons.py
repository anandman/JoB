#!/usr/bin/env python3
"""
Generate PWA icons for every app. Run after changing a mark:

    python3 tools/make-icons.py            # all apps
    python3 tools/make-icons.py job        # just one

Each strategy app's mark is a playing card, because that is what both games
are. The rank and pip name the game: J and a heart for Jacks or Bettor, A and
a spade for Bettor or Bust, whose blackjack is exactly that card plus a ten.
Color Up is not a game, so its mark is a chip — the large one you leave with.

Maskable icons keep their content inside the safe zone (a centre circle of
40% radius) because Android crops them to arbitrary shapes.
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

BG    = (13, 17, 23)     # --color-bg
CARD  = (230, 237, 243)  # --color-text
GOLD  = (240, 192, 64)   # --color-gold
RED   = (248, 81, 73)    # --color-red

ROOT = os.path.join(os.path.dirname(__file__), "..")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

APPS = {
    "job": {"mark": "card", "rank": "J", "pip": "\u2665", "pip_fill": RED},  # heart
    "bob": {"mark": "card", "rank": "A", "pip": "\u2660", "pip_fill": BG},   # spade
    "colorup": {"mark": "chip", "spots": 6},
}


def font_at(px):
    return ImageFont.truetype(FONT, px)


def centered(draw, xy, text, font, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((xy[0] - (box[0] + box[2]) / 2, xy[1] - (box[1] + box[3]) / 2),
              text, font=font, fill=fill)


def draw_icon(app, size, scale=1.0, bg=BG):
    """The app's mark, on the dark ground."""
    ss = 4  # supersample for clean edges
    img = Image.new("RGB", (size * ss, size * ss), bg)
    d = ImageDraw.Draw(img)
    S = size * ss

    if app["mark"] == "chip":
        draw_chip(d, S, scale, app.get("spots", 6), bg)
        return img.resize((size, size), Image.LANCZOS)

    cw, ch = S * 0.52 * scale, S * 0.70 * scale
    x0, y0 = (S - cw) / 2, (S - ch) / 2
    r = cw * 0.14

    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=r, fill=CARD)
    d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=r,
                        outline=GOLD, width=max(1, int(S * 0.012 * scale)))

    centered(d, (S / 2, y0 + ch * 0.40), app["rank"], font_at(int(ch * 0.46)), BG)
    centered(d, (S / 2, y0 + ch * 0.72), app["pip"], font_at(int(ch * 0.26)), app["pip_fill"])

    return img.resize((size, size), Image.LANCZOS)


def draw_chip(d, S, scale, spots, bg):
    """A chip seen face on. The edge spots are what make it read as a chip."""
    cx = cy = S / 2
    r = S * 0.40 * scale

    def circle(radius, fill):
        d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=fill)

    circle(r, GOLD)
    # Spots are cut into the rim as wedges rather than drawn on top of it, so
    # they stay put at every size instead of drifting off the edge.
    for i in range(spots):
        a = math.degrees(2 * math.pi * i / spots) - 90
        d.pieslice([cx - r, cy - r, cx + r, cy + r], start=a - 15, end=a + 15, fill=CARD)
    circle(r * 0.72, GOLD)
    circle(r * 0.60, bg)
    circle(r * 0.44, CARD)
    circle(r * 0.32, bg)


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

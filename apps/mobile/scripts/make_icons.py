"""Draw the Android launcher icons and splash screens (committed PNGs).

The mark is ۞ — the eight-pointed star that divides the Quran into hizbs — in
the app's gold on its dark background (apps/web/app/tokens.css). Drawn with
Pillow at 4× and downsampled, so it needs no font and no SVG renderer.

    python apps/mobile/scripts/make_icons.py
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parents[1] / "android" / "app" / "src" / "main" / "res"
BG = (19, 18, 16, 255)        # --bg
GOLD = (212, 175, 55, 255)    # --gold-400
GOLD_SOFT = (212, 175, 55, 70)
SCALE = 4


def star(draw: ImageDraw.ImageDraw, cx: float, cy: float, radius: float, width: float) -> None:
    """Two overlapping squares (۞), a ring and a centre dot."""
    for turn in (0, 45):
        points = [
            (cx + radius * math.cos(math.radians(turn + 45 + 90 * k)), cy + radius * math.sin(math.radians(turn + 45 + 90 * k)))
            for k in range(4)
        ]
        draw.polygon(points, outline=GOLD, width=round(width))
    ring = radius * 0.46
    draw.ellipse((cx - ring, cy - ring, cx + ring, cy + ring), outline=GOLD, width=round(width))
    dot = radius * 0.13
    draw.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill=GOLD)


def render(size: int, *, background: bool, rounded: bool = False, circle: bool = False, mark: float = 0.62) -> Image.Image:
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if background:
        if circle:
            draw.ellipse((0, 0, big - 1, big - 1), fill=BG)
        elif rounded:
            draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.22, fill=BG)
        else:
            draw.rectangle((0, 0, big, big), fill=BG)
    radius = big * mark / 2
    # A soft halo, then the mark.
    halo = radius * 1.12
    draw.ellipse((big / 2 - halo, big / 2 - halo, big / 2 + halo, big / 2 + halo), fill=GOLD_SOFT if background else (0, 0, 0, 0))
    if background:
        inner = radius * 1.04
        draw.ellipse((big / 2 - inner, big / 2 - inner, big / 2 + inner, big / 2 + inner), fill=BG)
    star(draw, big / 2, big / 2, radius, width=max(2, big * 0.028))
    return image.resize((size, size), Image.LANCZOS)


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def main() -> None:
    for name, factor in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        legacy = round(48 * factor)
        render(legacy, background=True, rounded=True).save(folder / "ic_launcher.png")
        render(legacy, background=True, circle=True).save(folder / "ic_launcher_round.png")
        # Adaptive foreground: 108dp canvas, the mark inside the 66dp safe zone.
        render(round(108 * factor), background=False, mark=0.5).save(folder / "ic_launcher_foreground.png")

    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#131210</color>\n</resources>\n',
        encoding="utf-8",
    )

    for folder in sorted(RES.glob("drawable*")):
        splash = folder / "splash.png"
        if not splash.exists():
            continue
        width, height = Image.open(splash).size
        canvas = Image.new("RGBA", (width, height), BG)
        side = round(min(width, height) * 0.28)
        canvas.alpha_composite(render(side, background=False, mark=0.9), ((width - side) // 2, (height - side) // 2))
        canvas.convert("RGB").save(splash)
    print(f"icons and splash screens → {RES}")


if __name__ == "__main__":
    main()

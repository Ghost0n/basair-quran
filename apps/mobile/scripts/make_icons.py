"""Draw the app's logo everywhere it is a picture (committed files).

The logo: the hizb star ۞ (two squares in a ring) whose centre dot becomes the
dot of a ب — a dotless ب (ٮ) drawn with the repository's Amiri Quran font,
over the dot. In the app's gold on its dark background (apps/web/app/tokens.css).

Writes:
  - Android launcher icons (legacy, round, adaptive foreground) and splash screens;
  - the iOS app icon and splash images;
  - the web favicon (.ico), Apple touch icons, PWA icons and icon.svg
    (apps/web/public);
  - the ب outline for the React BrandMark (apps/web/components/brand-glyph.generated.ts).

Pillow draws the PNGs at 4x and downsamples; fontTools reads the glyph outline.

    pip install pillow fonttools
    python apps/mobile/scripts/make_icons.py
"""
from __future__ import annotations

import math
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
MOBILE = ROOT / "apps" / "mobile"
WEB = ROOT / "apps" / "web"
RES = MOBILE / "android" / "app" / "src" / "main" / "res"
IOS_ASSETS = MOBILE / "ios" / "App" / "App" / "Assets.xcassets"
FONT = WEB / "public" / "fonts" / "AmiriQuran-Regular.ttf"
GLYPH_TS = WEB / "components" / "brand-glyph.generated.ts"

BG = (19, 18, 16, 255)  # --bg
GOLD = (212, 175, 55, 255)  # --gold-400 (the mark)
GOLD_BRIGHT = (233, 207, 115, 255)  # the letter and its dot
SCALE = 4

# The logo on a 100-unit square (the same numbers as components/brand-mark.tsx).
RING_R, RING_W = 46, 3.2
SQUARE_R, SQUARE_W = 41, 3.4
GLYPH = "ٮ"  # ٮ — the dotless ب; the star's centre dot is its nuqta
GLYPH_X, GLYPH_BASELINE, GLYPH_SIZE = 50, 55, 40
NUQTA_X, NUQTA_Y, NUQTA_R = 50, 67, 4
# How much of a launcher icon the logo fills: close to the edge, so it reads at
# home-screen size (the ring is a circle, so the platform masks never clip it).
ICON_MARK = 0.86
# Adaptive/maskable icons are cropped to a circle of ~80% (66 of 108dp on Android).
MASKABLE_MARK = 0.72
ADAPTIVE_MARK = 0.61


def square(turn: float, cx: float, cy: float, radius: float) -> list[tuple[float, float]]:
    return [
        (cx + radius * math.cos(math.radians(turn + 45 + 90 * k)), cy + radius * math.sin(math.radians(turn + 45 + 90 * k)))
        for k in range(4)
    ]


def draw_logo(image: Image.Image, x: float, y: float, side: float) -> None:
    """The logo in a `side`-px square at (x, y) of `image`."""
    draw = ImageDraw.Draw(image)
    unit = side / 100

    def at(px: float, py: float) -> tuple[float, float]:
        return x + px * unit, y + py * unit

    cx, cy = at(50, 50)
    r = RING_R * unit
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=GOLD, width=max(1, round(RING_W * unit)))
    half = SQUARE_W * unit / 2
    for turn in (0, 45):
        points = square(turn, cx, cy, SQUARE_R * unit)
        # Each edge as a filled band, stretched by half its width past both
        # corners: at a square's right angles that is exactly a mitred join
        # (Pillow's own outlines leave notches there).
        for k in range(4):
            (px, py), (qx, qy) = points[k], points[(k + 1) % 4]
            length = math.hypot(qx - px, qy - py)
            dx, dy = (qx - px) / length, (qy - py) / length
            nx, ny = -dy * half, dx * half
            sx, sy, ex, ey = px - dx * half, py - dy * half, qx + dx * half, qy + dy * half
            draw.polygon([(sx + nx, sy + ny), (ex + nx, ey + ny), (ex - nx, ey - ny), (sx - nx, sy - ny)], fill=GOLD)
    font = ImageFont.truetype(str(FONT), size=max(1, round(GLYPH_SIZE * unit)))
    draw.text(at(GLYPH_X, GLYPH_BASELINE), GLYPH, font=font, fill=GOLD_BRIGHT, anchor="ms")
    nx, ny = at(NUQTA_X, NUQTA_Y)
    nr = NUQTA_R * unit
    draw.ellipse((nx - nr, ny - nr, nx + nr, ny + nr), fill=GOLD_BRIGHT)


def render(size: int, *, background: bool, rounded: bool = False, circle: bool = False, mark: float = ICON_MARK) -> Image.Image:
    """An icon: the logo filling `mark` of the square, on the dark background or transparent."""
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
    side = big * mark
    draw_logo(image, (big - side) / 2, (big - side) / 2, side)
    return image.resize((size, size), Image.LANCZOS)


def glyph_path() -> str:
    """The dotless ب as an SVG path on the logo's 100-unit square (like <text text-anchor=middle>)."""
    font = TTFont(str(FONT))
    name = font.getBestCmap()[ord(GLYPH)]
    glyphs = font.getGlyphSet()
    advance = font["hmtx"][name][0]
    scale = GLYPH_SIZE / font["head"].unitsPerEm
    pen = SVGPathPen(glyphs, ntos=lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
    left = GLYPH_X - advance * scale / 2
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, left, GLYPH_BASELINE)))
    return pen.getCommands()


def icon_svg(path: str) -> str:
    squares = "".join(
        f'<polygon points="{" ".join(f"{px:.2f},{py:.2f}" for px, py in square(turn, 50, 50, SQUARE_R))}"/>' for turn in (0, 45)
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        '<rect width="100" height="100" rx="22" fill="#131210"/>'
        f'<g transform="translate({50 - 50 * ICON_MARK:g} {50 - 50 * ICON_MARK:g}) scale({ICON_MARK:g})">'
        f'<g fill="none" stroke="#d4af37"><circle cx="50" cy="50" r="{RING_R}" stroke-width="{RING_W}"/>'
        f'<g stroke-width="{SQUARE_W}" stroke-linejoin="miter">{squares}</g></g>'
        f'<path d="{path}" fill="#e9cf73"/><circle cx="{NUQTA_X}" cy="{NUQTA_Y}" r="{NUQTA_R}" fill="#e9cf73"/>'
        "</g></svg>\n"
    )


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def main() -> None:
    path = glyph_path()
    GLYPH_TS.write_text(
        "// Generated by apps/mobile/scripts/make_icons.py — do not edit.\n"
        "// The dotless ب (ٮ) of the logo, from Amiri Quran, on the logo's 100-unit square.\n"
        f'export const BRAND_GLYPH_PATH =\n  "{path}";\n',
        encoding="utf-8",
    )
    print(f"glyph outline → {GLYPH_TS.relative_to(ROOT)}")

    public = WEB / "public"
    render(180, background=True).convert("RGB").save(public / "apple-touch-icon.png")
    render(180, background=True).convert("RGB").save(public / "apple-touch-icon-precomposed.png")
    render(192, background=True, rounded=True).save(public / "icon-192.png")
    render(512, background=True, rounded=True).save(public / "icon-512.png")
    render(512, background=True, mark=MASKABLE_MARK).convert("RGB").save(public / "icon-maskable-512.png")
    favicon = render(256, background=True, rounded=True, mark=0.82)
    favicon.save(public / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    (public / "icon.svg").write_text(icon_svg(path), encoding="utf-8")
    print(f"web icons → {public.relative_to(ROOT)}")

    if RES.exists():
        for name, factor in DENSITIES.items():
            folder = RES / f"mipmap-{name}"
            folder.mkdir(parents=True, exist_ok=True)
            legacy = round(48 * factor)
            render(legacy, background=True, rounded=True).save(folder / "ic_launcher.png")
            render(legacy, background=True, circle=True).save(folder / "ic_launcher_round.png")
            # Adaptive foreground: 108dp canvas, the mark inside the 66dp safe zone.
            render(round(108 * factor), background=False, mark=ADAPTIVE_MARK).save(folder / "ic_launcher_foreground.png")

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
            canvas.alpha_composite(render(side, background=False, mark=1), ((width - side) // 2, (height - side) // 2))
            canvas.convert("RGB").save(splash)
        print(f"Android icons and splash screens → {RES.relative_to(ROOT)}")

    if IOS_ASSETS.exists():
        # iOS masks the corners itself and refuses an icon with transparency.
        render(1024, background=True).convert("RGB").save(IOS_ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png")
        for splash in sorted((IOS_ASSETS / "Splash.imageset").glob("*.png")):
            size = Image.open(splash).size[0]
            canvas = Image.new("RGBA", (size, size), BG)
            side = round(size * 0.18)
            canvas.alpha_composite(render(side, background=False, mark=1), ((size - side) // 2, (size - side) // 2))
            canvas.convert("RGB").save(splash)
        print(f"iOS icon and splash screens → {IOS_ASSETS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

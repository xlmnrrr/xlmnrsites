"""Brand icons from the logo geometry: favicon.svg, apple-touch-icon.png (180×180) and og.jpg.

    python tools/icons.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / 'assets' / 'img'
BG = '#070A12'

# favicon: same mark as the site (orbit behind the X at the top, in front of it at the bottom)
FAVICON = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    f'<rect width="32" height="32" rx="8" fill="{BG}"/>'
    '<ellipse cx="16" cy="16" rx="13" ry="5.6" transform="rotate(-28 16 16)" fill="none" stroke="#7DD9E2" stroke-width="1.3" opacity=".5"/>'
    '<path d="M9.5 9.5l13 13" stroke="#ECEFF3" stroke-width="3.2" stroke-linecap="round"/>'
    '<path d="M22.5 9.5l-4.6 4.6M14.1 17.9l-4.6 4.6" stroke="#4CC3CF" stroke-width="3.2" stroke-linecap="round"/>'
    f'<path d="M4.52 22.1A13 5.6 -28 0 0 27.4 12" fill="none" stroke="{BG}" stroke-width="3.6"/>'
    '<path d="M4.52 22.1A13 5.6 -28 0 0 27.4 12" fill="none" stroke="#A8EEF3" stroke-width="1.6" stroke-linecap="round"/>'
    '<circle cx="27.4" cy="12" r="1.9" fill="#E6FBFD"/>'
    '</svg>'
)
(IMG / 'favicon.svg').write_text(FAVICON, encoding='utf-8')


def touch_icon(size=180, ss=8):
    """Draws the mark in a 32-unit space, supersampled, then downscales."""
    S = size * ss
    u = S / 32

    def P(x, y):
        return (x * u, y * u)

    im = Image.new('RGBA', (S, S), BG)

    def ellipse_pts(t0, t1, rx=11.6, ry=5.0, steps=360):
        a = math.radians(-28)
        pts = []
        for i in range(steps + 1):
            t = math.radians(t0 + (t1 - t0) * i / steps)
            x, y = rx * math.cos(t), ry * math.sin(t)
            pts.append(P(16 + x * math.cos(a) - y * math.sin(a), 16 + x * math.sin(a) + y * math.cos(a)))
        return pts

    def stroke(pts, color, w, alpha=255, caps=True):
        # each stroke on its own layer, composited: real alpha blending, smooth round joints
        layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        rgb = Image.new('RGB', (1, 1), color).getpixel((0, 0))
        fill = (*rgb, alpha)
        r = w * u / 2
        d.line(pts, fill=fill, width=round(w * u), joint='curve')
        # round caps; dense polylines get every vertex rounded so no wedge artefacts remain
        dots = pts if len(pts) > 2 else (pts if caps else [])
        if caps and len(pts) <= 2:
            dots = (pts[0], pts[-1])
        for (x, y) in dots:
            d.ellipse((x - r, y - r, x + r, y + r), fill=fill)
        im.alpha_composite(layer)

    sat_t = 20.8
    stroke(ellipse_pts(0, 360), '#7DD9E2', 1.15, alpha=125)          # back orbit
    stroke([P(10.2, 10.2), P(21.8, 21.8)], '#ECEFF3', 2.9)            # X
    stroke([P(21.8, 10.2), P(17.6, 14.4)], '#4CC3CF', 2.9)
    stroke([P(14.4, 17.6), P(10.2, 21.8)], '#4CC3CF', 2.9)
    stroke(ellipse_pts(sat_t, 180), BG, 3.3, caps=False)               # weave gap
    stroke(ellipse_pts(sat_t, 180), '#A8EEF3', 1.45)                   # front orbit
    sx, sy = ellipse_pts(sat_t, sat_t, steps=1)[0]
    r = 1.75 * u
    ImageDraw.Draw(im).ellipse((sx - r, sy - r, sx + r, sy + r), fill='#E6FBFD')
    return im.resize((size, size), Image.LANCZOS).convert('RGB')


touch_icon().save(IMG / 'apple-touch-icon.png', optimize=True)

# og: the social preview as JPEG (the PNG was ~240 KB)
og = IMG / 'og.png'
if og.exists():
    Image.open(og).convert('RGB').save(IMG / 'og.jpg', quality=86, optimize=True, progressive=True)

for f in ('favicon.svg', 'apple-touch-icon.png', 'og.jpg'):
    p = IMG / f
    if p.exists():
        print(f, p.stat().st_size // 1024, 'KB')

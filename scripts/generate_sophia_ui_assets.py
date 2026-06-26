from __future__ import annotations

import json
import math
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


PRIMARY_ROOT = (
    Path.home()
    / "OneDrive"
    / "Sync"
    / "\u996e\u6cb3"
    / "\u589e\u91cf\u6e38\u620f"
    / "\u89c9\u9192\u7684SOPHIA"
)
SECONDARY_ROOT = Path.home() / "OneDrive" / "\u589e\u91cf\u6e38\u620f" / "\u89c9\u9192\u7684sophia"
PACKAGE_NAME = "12-ui-assets"

V1_SCREEN = (2400, 1400)
V2_SCREEN = (2400, 1400)


def rgba(size, color=(0, 0, 0, 0)):
    return Image.new("RGBA", size, color)


def rgb(size, color):
    return Image.new("RGB", size, color)


def alpha_composite(dst: Image.Image, src: Image.Image, xy=(0, 0)) -> None:
    dst.alpha_composite(src, xy)


def clear_rect(im: Image.Image, box: tuple[int, int, int, int]) -> None:
    patch = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
    im.paste(patch, box)


def glow_lines(
    size: tuple[int, int],
    lines: list[list[tuple[int, int]]],
    color: tuple[int, int, int],
    width: int,
    blur: int,
    alpha: int,
) -> Image.Image:
    layer = rgba(size)
    d = ImageDraw.Draw(layer)
    for pts in lines:
        d.line(pts, fill=(*color, alpha), width=width, joint="curve")
    return layer.filter(ImageFilter.GaussianBlur(blur))


def glow_ellipses(
    size: tuple[int, int],
    boxes: list[tuple[int, int, int, int]],
    color: tuple[int, int, int],
    width: int,
    blur: int,
    alpha: int,
) -> Image.Image:
    layer = rgba(size)
    d = ImageDraw.Draw(layer)
    for box in boxes:
        d.ellipse(box, outline=(*color, alpha), width=width)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def screen_base(size: tuple[int, int]) -> Image.Image:
    w, h = size
    im = rgb(size, (5, 17, 14)).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(h):
        mix = y / max(1, h - 1)
        r = int(5 + mix * 7)
        g = int(17 + mix * 13)
        b = int(14 + mix * 11)
        d.line((0, y, w, y), fill=(r, g, b, 255))
    scan = rgba(size)
    sd = ImageDraw.Draw(scan, "RGBA")
    for y in range(0, h, 4):
        sd.line((0, y, w, y), fill=(80, 255, 210, 8))
    im.alpha_composite(scan)
    vignette = rgba(size)
    vd = ImageDraw.Draw(vignette, "RGBA")
    for i in range(80):
        a = int(2.0 * i)
        vd.rectangle((i, i, w - 1 - i, h - 1 - i), outline=(0, 0, 0, max(0, 90 - a)), width=1)
    im.alpha_composite(vignette)
    return im


def draw_panel(size: tuple[int, int], color=(40, 210, 190), alpha=80) -> Image.Image:
    w, h = size
    im = rgba(size)
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=14, outline=(*color, alpha), width=2)
    d.rectangle((10, 0, 18, h), fill=(*color, 18))
    d.line((24, 50, w - 24, 50), fill=(*color, 35), width=1)
    return im


def draw_bubble(kind: str) -> Image.Image:
    w, h = 480, 400
    im = rgba((w, h))
    palettes = {
        "calm": ((104, 244, 241), (65, 236, 225), (14, 54, 50)),
        "heavy": ((255, 52, 91), (255, 73, 104), (64, 18, 28)),
        "chain": ((255, 184, 67), (255, 196, 90), (58, 42, 16)),
    }
    main, accent, fill = palettes[kind]
    d = ImageDraw.Draw(im, "RGBA")

    lines = [
        [(24, 62), (458, 62), (466, 68), (466, 374), (458, 384), (26, 384), (14, 372), (14, 72), (24, 62)],
        [(16, 61), (38, 18), (72, 50), (44, 50)],
        [(25, 94), (458, 94)],
    ]
    im.alpha_composite(glow_lines((w, h), lines, main, 8, 6, 95))

    # Fixed top/bottom/side areas only. The center stretch area is punched out below.
    d.rounded_rectangle((14, 62, 466, 384), radius=14, outline=(*main, 240), width=3)
    d.polygon([(16, 62), (38, 18), (72, 50), (44, 50)], outline=(*accent, 240), fill=(0, 0, 0, 0))
    d.line((16, 62, 38, 18, 72, 50, 44, 50), fill=(*accent, 255), width=3)
    d.rectangle((24, 64, 456, 94), fill=(*fill, 76))
    d.line((25, 94, 456, 94), fill=(*main, 120), width=2)
    d.rectangle((0, 96, 24, 376), fill=(*fill, 32))
    d.rectangle((456, 96, 480, 376), fill=(*fill, 30))
    d.rectangle((24, 376, 456, 400), fill=(*fill, 30))

    socket = (22, 42, 64, 84)
    d.ellipse(socket, outline=(*main, 230), width=3)
    d.ellipse((28, 48, 58, 78), fill=(*fill, 90), outline=(*main, 120), width=1)

    if kind == "heavy":
        d.line((398, 76, 454, 76), fill=(*accent, 205), width=3)
        d.line((406, 374, 456, 374), fill=(*accent, 140), width=2)
        d.rectangle((430, 66, 458, 70), fill=(*accent, 110))
    elif kind == "chain":
        for x in (168, 204, 240):
            d.ellipse((x - 4, 78, x + 4, 86), outline=(*accent, 185), width=2)
        d.line((172, 82, 200, 82), fill=(*accent, 110), width=1)
        d.line((208, 82, 236, 82), fill=(*accent, 110), width=1)
        for y in (66, 78, 90):
            d.ellipse((444, y, 450, y + 6), outline=(*accent, 145), width=1)
    else:
        d.line((390, 374, 452, 374), fill=(*main, 90), width=2)

    # Required V1 bubble NineSlice center: left/right/bottom 24 px, top 96 px.
    clear_rect(im, (24, 96, 456, 376))
    return im


def draw_row(kind: str) -> Image.Image:
    w, h = 400, 48
    im = rgba((w, h))
    palettes = {
        "idle": ((82, 228, 224), (12, 55, 52), 160),
        "hot": ((111, 255, 145), (14, 64, 30), 220),
        "locked": ((255, 50, 92), (48, 17, 30), 130),
    }
    color, fill, power = palettes[kind]
    d = ImageDraw.Draw(im, "RGBA")
    im.alpha_composite(glow_lines((w, h), [[(16, 8), (384, 8), (392, 16), (392, 32), (384, 40), (16, 40), (8, 32), (8, 16), (16, 8)]], color, 5, 4, power))
    d.rounded_rectangle((8, 8, 392, 40), radius=12, outline=(*color, 230), width=2)
    d.rectangle((0, 8, 20, 40), fill=(*fill, 58))
    d.rectangle((380, 8, 400, 40), fill=(*fill, 48))
    d.rectangle((20, 0, 380, 8), fill=(*fill, 34))
    d.rectangle((20, 40, 380, 48), fill=(*fill, 34))
    if kind == "locked":
        d.arc((362, 13, 378, 31), 180, 360, fill=(*color, 230), width=2)
        d.rounded_rectangle((360, 25, 380, 38), radius=3, outline=(*color, 230), width=2)
    elif kind == "hot":
        d.line((26, 24, 358, 24), fill=(*color, 95), width=2)
    else:
        d.line((28, 24, 360, 24), fill=(*color, 65), width=1)

    # Required V1 row NineSlice center: left/right 20 px, top/bottom 8 px.
    clear_rect(im, (20, 8, 380, 40))
    return im


def draw_avatar(kind: str) -> Image.Image:
    size = 44
    im = rgba((size, size))
    palette = {
        "host": (104, 244, 241),
        "boss": (255, 65, 104),
        "system": (118, 255, 143),
        "app": (80, 180, 255),
        "sophia": (124, 255, 191),
    }[kind]
    d = ImageDraw.Draw(im, "RGBA")
    im.alpha_composite(glow_ellipses((size, size), [(5, 5, 39, 39)], palette, 4, 3, 120))
    d.ellipse((5, 5, 39, 39), outline=(*palette, 230), width=2)
    if kind == "host":
        d.arc((11, 14, 33, 42), 205, 335, fill=(*palette, 220), width=2)
        d.polygon([(22, 15), (15, 31), (29, 31)], outline=(*palette, 210))
    elif kind == "boss":
        d.polygon([(22, 7), (35, 30), (22, 38), (9, 30)], outline=(*palette, 230), width=2)
        d.ellipse((18, 14, 26, 22), fill=(*palette, 170))
    elif kind == "system":
        d.rectangle((13, 13, 31, 31), outline=(*palette, 230), width=2)
        for p in [(22, 8), (22, 36), (8, 22), (36, 22)]:
            d.line((22, 22, *p), fill=(*palette, 150), width=1)
    elif kind == "app":
        d.rounded_rectangle((11, 12, 33, 30), radius=3, outline=(*palette, 230), width=2)
        d.line((11, 18, 33, 18), fill=(*palette, 150), width=1)
        d.rectangle((17, 24, 27, 33), outline=(*palette, 160), width=1)
    else:
        d.ellipse((14, 10, 30, 26), outline=(*palette, 230), width=2)
        d.line((22, 26, 22, 35), fill=(*palette, 200), width=2)
        d.line((12, 35, 32, 35), fill=(*palette, 160), width=1)
    return im


def draw_core(active: bool) -> Image.Image:
    size = 280
    im = rgba((size, size))
    c = (120, 255, 170) if active else (86, 230, 226)
    accent = (255, 235, 100) if active else (92, 255, 245)
    d = ImageDraw.Draw(im, "RGBA")
    center = size // 2
    rings = [(38, 70), (58, 92), (82, 118), (110, 150)]
    im.alpha_composite(glow_ellipses((size, size), [(center - r, center - r, center + r, center + r) for r, _ in rings], c, 4, 5, 80 if active else 60))
    for r, a in rings:
        d.ellipse((center - r, center - r, center + r, center + r), outline=(*c, a + 70), width=2)
    for ang in range(0, 360, 45):
        rad = math.radians(ang)
        x1 = center + int(math.cos(rad) * 42)
        y1 = center + int(math.sin(rad) * 42)
        x2 = center + int(math.cos(rad) * 112)
        y2 = center + int(math.sin(rad) * 112)
        d.line((x1, y1, x2, y2), fill=(*c, 130), width=1)
        d.ellipse((x2 - 4, y2 - 4, x2 + 4, y2 + 4), outline=(*c, 170), width=1)
    d.ellipse((center - 22, center - 22, center + 22, center + 22), fill=(10, 42, 35, 170), outline=(*accent, 240), width=3)
    d.ellipse((center - 8, center - 8, center + 8, center + 8), fill=(*accent, 225))
    for r in (30, 54, 74):
        start = 12 if active else 42
        d.arc((center - r, center - r, center + r, center + r), start, start + 250, fill=(*accent, 120), width=2)
    return im


def draw_worldmap() -> Image.Image:
    w, h = V2_SCREEN
    im = rgb((w, h), (5, 17, 14)).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(h):
        mix = y / h
        d.line((0, y, w, y), fill=(5, int(16 + mix * 12), int(14 + mix * 8), 255))

    continents = [
        [(80, 110), (280, 30), (480, 110), (650, 230), (815, 330), (690, 515), (550, 610), (495, 735), (430, 575), (285, 430), (155, 265)],
        [(650, 660), (775, 705), (865, 850), (935, 1055), (862, 1325), (760, 1390), (688, 1170), (660, 960)],
        [(800, 110), (850, 0), (1035, 42), (1070, 150), (922, 185)],
        [(1132, 155), (1328, 42), (1564, 85), (1802, 42), (1980, 155), (2190, 265), (2266, 438), (2176, 554), (2014, 646), (1815, 604), (1666, 744), (1488, 640), (1338, 485), (1162, 492), (1138, 370)],
        [(1080, 418), (1255, 410), (1372, 515), (1460, 674), (1550, 848), (1538, 1075), (1418, 1188), (1225, 1118), (1140, 880)],
        [(1865, 705), (2014, 727), (2068, 842), (1960, 888), (1890, 808)],
        [(1944, 924), (2108, 902), (2228, 1056), (2148, 1218), (1975, 1162), (1920, 1032)],
    ]
    outline = (40, 202, 190)
    glow = rgba((w, h))
    gd = ImageDraw.Draw(glow, "RGBA")
    for pts in continents:
        gd.polygon(pts, fill=(17, 38, 34, 86))
        gd.line(pts + [pts[0]], fill=(*outline, 95), width=2, joint="curve")
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(2)))
    for pts in continents:
        d.polygon(pts, fill=(13, 31, 28, 80))
        d.line(pts + [pts[0]], fill=(*outline, 115), width=1, joint="curve")

    scan = rgba((w, h))
    sd = ImageDraw.Draw(scan, "RGBA")
    for y in range(0, h, 4):
        sd.line((0, y, w, y), fill=(70, 255, 210, 7))
    im.alpha_composite(scan)
    return im.convert("RGB")


def draw_node(kind: str) -> Image.Image:
    size = 96 if kind == "hub" else 64
    im = rgba((size, size))
    d = ImageDraw.Draw(im, "RGBA")
    cx = cy = size // 2
    if kind == "low":
        c = (78, 236, 242)
        pts = [(cx, 10), (size - 10, cy), (cx, size - 10), (10, cy)]
        im.alpha_composite(glow_lines((size, size), [pts + [pts[0]]], c, 4, 3, 90))
        d.line(pts + [pts[0]], fill=(*c, 235), width=2)
        d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(*c, 220))
    elif kind == "mid":
        c = (105, 255, 138)
        im.alpha_composite(glow_ellipses((size, size), [(12, 12, 52, 52), (20, 20, 44, 44)], c, 3, 3, 95))
        d.ellipse((12, 12, 52, 52), outline=(*c, 235), width=2)
        d.ellipse((24, 24, 40, 40), outline=(*c, 200), width=2)
        for a in range(0, 360, 45):
            r = math.radians(a)
            d.line((cx + int(math.cos(r) * 24), cy + int(math.sin(r) * 24), cx + int(math.cos(r) * 30), cy + int(math.sin(r) * 30)), fill=(*c, 180), width=2)
        d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=(*c, 230))
    elif kind == "high":
        c = (92, 255, 145)
        im.alpha_composite(glow_ellipses((size, size), [(8, 8, 56, 56), (17, 17, 47, 47)], c, 3, 4, 110))
        d.ellipse((8, 8, 56, 56), outline=(*c, 240), width=2)
        d.ellipse((17, 17, 47, 47), outline=(*c, 220), width=2)
        d.line((cx, 10, cx, 54), fill=(*c, 210), width=2)
        d.line((10, cy, 54, cy), fill=(*c, 210), width=2)
        d.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=(*c, 240))
    else:
        c = (86, 231, 225)
        accent = (126, 255, 175)
        im.alpha_composite(glow_ellipses((size, size), [(6, 6, 90, 90), (18, 18, 78, 78), (30, 30, 66, 66)], c, 3, 4, 90))
        for box, col in [((6, 6, 90, 90), c), ((18, 18, 78, 78), c), ((30, 30, 66, 66), accent)]:
            d.ellipse(box, outline=(*col, 220), width=2)
        d.ellipse((42, 42, 54, 54), fill=(*accent, 235))
        for a in range(0, 360, 60):
            r = math.radians(a)
            x1 = cx + int(math.cos(r) * 24)
            y1 = cy + int(math.sin(r) * 24)
            x2 = cx + int(math.cos(r) * 43)
            y2 = cy + int(math.sin(r) * 43)
            d.line((x1, y1, x2, y2), fill=(*c, 135), width=1)
            d.ellipse((x2 - 2, y2 - 2, x2 + 2, y2 + 2), outline=(*c, 180), width=1)
    return im


def draw_purge_ring() -> Image.Image:
    size = 256
    im = rgba((size, size))
    c = (255, 48, 84)
    d = ImageDraw.Draw(im, "RGBA")
    rings = [(30, 210), (43, 180), (62, 120)]
    im.alpha_composite(glow_ellipses((size, size), [(r, r, size - r, size - r) for r, _ in rings], c, 6, 7, 110))
    for inset, alpha in rings:
        d.ellipse((inset, inset, size - inset, size - inset), outline=(*c, alpha), width=4)
    d.arc((52, 52, 204, 204), 200, 350, fill=(*c, 245), width=5)
    d.arc((36, 36, 220, 220), 18, 160, fill=(*c, 210), width=3)
    return im


def draw_edge_line() -> Image.Image:
    w, h = 400, 8
    im = rgba((w, h))
    vertical = [8, 28, 82, 220, 220, 82, 28, 8]
    for x in range(w):
        fade = min(1.0, x / 16.0, (w - 1 - x) / 16.0)
        for y in range(h):
            a = int(vertical[y] * fade)
            if a:
                im.putpixel((x, y), (104, 238, 232, a))
    return im


def draw_grid_overlay() -> Image.Image:
    size = 512
    im = rgba((size, size))
    d = ImageDraw.Draw(im, "RGBA")
    for i in range(0, size, 64):
        a = 18 if i % 256 else 26
        d.line((i, 0, i, size), fill=(80, 230, 210, a), width=1)
        d.line((0, i, size, i), fill=(80, 230, 210, a), width=1)
    d.rectangle((0, 0, size - 1, size - 1), outline=(80, 230, 210, 14), width=1)
    return im


def stretch_nineslice(im: Image.Image, target: tuple[int, int], left: int, top: int, right: int, bottom: int) -> Image.Image:
    w, h = im.size
    tw, th = target
    out = rgba(target)
    xs = [0, left, w - right, w]
    ys = [0, top, h - bottom, h]
    tx = [0, left, tw - right, tw]
    ty = [0, top, th - bottom, th]
    for yi in range(3):
        for xi in range(3):
            src = im.crop((xs[xi], ys[yi], xs[xi + 1], ys[yi + 1]))
            dw = tx[xi + 1] - tx[xi]
            dh = ty[yi + 1] - ty[yi]
            if dw <= 0 or dh <= 0:
                continue
            if src.size != (dw, dh):
                src = src.resize((dw, dh), Image.Resampling.BICUBIC)
            out.alpha_composite(src, (tx[xi], ty[yi]))
    return out


def place(layer: Image.Image, asset: Image.Image, xy: tuple[int, int]) -> tuple[int, int, int, int]:
    layer.alpha_composite(asset, xy)
    x, y = xy
    return (x, y, x + asset.width, y + asset.height)


def rotate_edge(edge: Image.Image, p1: tuple[int, int], p2: tuple[int, int]) -> Image.Image:
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    length = max(1, int(math.hypot(dx, dy)))
    angle = math.degrees(math.atan2(dy, dx))
    stretched = edge.resize((length, edge.height), Image.Resampling.BICUBIC)
    return stretched.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)


def compose_v1(assets: dict[str, Image.Image]) -> tuple[Image.Image, Image.Image, dict[str, tuple[int, int, int, int]]]:
    screen = screen_base(V1_SCREEN)
    layer = rgba(V1_SCREEN)
    crops = {}

    # Low-contrast game layout under the source elements.
    for rect in [(42, 44, 2358, 136), (42, 168, 540, 1338), (584, 168, 1812, 1338), (1852, 168, 2358, 1338)]:
        panel = draw_panel((rect[2] - rect[0], rect[3] - rect[1]))
        screen.alpha_composite(panel, rect[:2])

    placements = {
        "avatar-host@2x.png": (132, 258),
        "avatar-boss@2x.png": (206, 258),
        "avatar-system@2x.png": (280, 258),
        "avatar-app@2x.png": (354, 258),
        "avatar-sophia@2x.png": (428, 258),
        "core-idle@2x.png": (148, 752),
        "bubble-calm@2x.png": (620, 228),
        "bubble-heavy@2x.png": (1320, 304),
        "bubble-chain@2x.png": (620, 798),
        "core-active@2x.png": (1100, 670),
        "row-idle@2x.png": (1888, 250),
        "row-hot@2x.png": (1888, 328),
        "row-locked@2x.png": (1888, 406),
    }
    for name, xy in placements.items():
        crops[name] = place(layer, assets[name], xy)

    screen.alpha_composite(layer)

    # In-game content drawn over the frames only for the preview screenshot.
    d = ImageDraw.Draw(screen, "RGBA")
    for y, color in [(354, (104, 244, 241)), (432, (111, 255, 145)), (910, (104, 244, 241))]:
        d.rounded_rectangle((676, y, 1120, y + 34), radius=17, outline=(*color, 135), width=2, fill=(8, 36, 31, 45))
    d.line((660, 360, 1128, 360), fill=(104, 244, 241, 50), width=1)
    d.line((1348, 410, 1782, 410), fill=(255, 65, 104, 58), width=2)
    d.line((1348, 1015, 1098, 845), fill=(255, 184, 67, 70), width=2)
    for x in (1908, 1980, 2052, 2124, 2196):
        d.rounded_rectangle((x, 268, x + 110, 281), radius=6, fill=(82, 228, 224, 42))
        d.rounded_rectangle((x, 346, x + 110, 359), radius=6, fill=(111, 255, 145, 54))
        d.rounded_rectangle((x, 424, x + 110, 437), radius=6, fill=(255, 50, 92, 36))
    return screen.convert("RGB"), layer, crops


def compose_v2(assets: dict[str, Image.Image]) -> tuple[Image.Image, Image.Image, dict[str, tuple[int, int, int, int]]]:
    world = assets["worldmap-bg@2x.png"].convert("RGBA")
    layer = rgba(V2_SCREEN)
    crops = {}

    # Raw source items on the layer; visible screenshot uses copies/transforms from the same asset set.
    source_positions = {
        "node-low@2x.png": (640, 520),
        "node-mid@2x.png": (1330, 560),
        "node-high@2x.png": (1600, 780),
        "node-hub@2x.png": (1160, 668),
        "purge-ring@2x.png": (1550, 735),
        "edge-line@2x.png": (900, 420),
        "grid-overlay@2x.png": (72, 812),
    }
    for name, xy in source_positions.items():
        crops[name] = place(layer, assets[name], xy)

    screen = world.copy()
    # Tile the grid lightly in the game screenshot, but worldmap-bg remains grid-free.
    grid = assets["grid-overlay@2x.png"].copy()
    grid.putalpha(grid.getchannel("A").point(lambda a: int(a * 0.45)))
    for y in range(0, V2_SCREEN[1], 512):
        for x in range(0, V2_SCREEN[0], 512):
            screen.alpha_composite(grid, (x, y))

    edge = assets["edge-line@2x.png"]
    connections = [((675, 552), (1205, 715)), ((1205, 715), (1362, 592)), ((1205, 715), (1632, 812)), ((1362, 592), (1838, 722)), ((932, 710), (1205, 715)), ((1205, 715), (1024, 460))]
    for p1, p2 in connections:
        e = rotate_edge(edge, p1, p2)
        screen.alpha_composite(e, (min(p1[0], p2[0]) - 4, min(p1[1], p2[1]) - e.height // 2))

    for name, xy in {
        "node-low@2x.png": (640, 520),
        "node-mid@2x.png": (1330, 560),
        "node-high@2x.png": (1600, 780),
        "node-hub@2x.png": (1160, 668),
        "purge-ring@2x.png": (1550, 735),
        "node-low@2x.png#2": (1840, 420),
        "node-mid@2x.png#2": (860, 390),
    }.items():
        src_name = name.split("#", 1)[0]
        screen.alpha_composite(assets[src_name], xy)

    return screen.convert("RGB"), layer, crops


def checker(size: tuple[int, int], cell=18) -> Image.Image:
    im = rgb(size, (8, 26, 22)).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                d.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(16, 43, 38, 255))
    return im


def make_qa(assets: dict[str, Image.Image]) -> Image.Image:
    rows = []
    for name in ["bubble-calm@2x.png", "bubble-heavy@2x.png", "bubble-chain@2x.png"]:
        stretched = stretch_nineslice(assets[name], (720, 560), 24, 96, 24, 24)
        bg = checker(stretched.size)
        bg.alpha_composite(stretched)
        rows.append((name, bg))
    for name in ["row-idle@2x.png", "row-hot@2x.png", "row-locked@2x.png"]:
        stretched = stretch_nineslice(assets[name], (720, 72), 20, 8, 20, 8)
        bg = checker(stretched.size)
        bg.alpha_composite(stretched)
        rows.append((name, bg))
    edge_stretched = stretch_nineslice(assets["edge-line@2x.png"], (720, 8), 16, 0, 16, 0)
    bg = checker((720, 48))
    bg.alpha_composite(edge_stretched, (0, 20))
    rows.append(("edge-line@2x.png", bg))

    width = 760
    height = 28 + sum(im.height + 54 for _, im in rows)
    out = rgb((width, height), (6, 21, 18)).convert("RGBA")
    d = ImageDraw.Draw(out, "RGBA")
    y = 20
    for name, im in rows:
        d.text((20, y), name, fill=(190, 230, 220, 255))
        y += 28
        out.alpha_composite(im, (20, y))
        y += im.height + 26
    return out.convert("RGB")


def save_package(root: Path, files: dict[str, Image.Image], source_files: dict[str, Image.Image], qa: Image.Image, manifest: dict) -> None:
    out = root / PACKAGE_NAME
    assets_dir = out / "assets"
    source_dir = out / "source-screenshots"
    qa_dir = out / "qa"
    out.mkdir(parents=True, exist_ok=True)
    for child in [assets_dir, source_dir, qa_dir]:
        child.mkdir(parents=True, exist_ok=True)
        for old_png in child.glob("*.png"):
            old_png.unlink()
    for old_png in out.glob("*.png"):
        old_png.unlink()

    for name, im in files.items():
        target = assets_dir / name
        im.save(target)
        shutil.copy2(target, out / name)
    for name, im in source_files.items():
        im.save(source_dir / name)
    qa.save(qa_dir / "nineslice-stretch-check.png")
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def validate(files: dict[str, Image.Image]) -> list[str]:
    errors: list[str] = []
    expected = {
        "bubble-calm@2x.png": (480, 400),
        "bubble-heavy@2x.png": (480, 400),
        "bubble-chain@2x.png": (480, 400),
        "row-idle@2x.png": (400, 48),
        "row-hot@2x.png": (400, 48),
        "row-locked@2x.png": (400, 48),
        "avatar-host@2x.png": (44, 44),
        "avatar-boss@2x.png": (44, 44),
        "avatar-system@2x.png": (44, 44),
        "avatar-app@2x.png": (44, 44),
        "avatar-sophia@2x.png": (44, 44),
        "core-idle@2x.png": (280, 280),
        "core-active@2x.png": (280, 280),
        "worldmap-bg@2x.png": (2400, 1400),
        "node-low@2x.png": (64, 64),
        "node-mid@2x.png": (64, 64),
        "node-high@2x.png": (64, 64),
        "node-hub@2x.png": (96, 96),
        "purge-ring@2x.png": (256, 256),
        "edge-line@2x.png": (400, 8),
        "grid-overlay@2x.png": (512, 512),
    }
    for name, size in expected.items():
        if name not in files:
            errors.append(f"missing {name}")
            continue
        if files[name].size != size:
            errors.append(f"{name} size {files[name].size}, expected {size}")
    for name in ["bubble-calm@2x.png", "bubble-heavy@2x.png", "bubble-chain@2x.png"]:
        a = files[name].crop((24, 96, 456, 376)).getchannel("A").getextrema()
        if a != (0, 0):
            errors.append(f"{name} center alpha {a}, expected (0, 0)")
    for name in ["row-idle@2x.png", "row-hot@2x.png", "row-locked@2x.png"]:
        a = files[name].crop((20, 8, 380, 40)).getchannel("A").getextrema()
        if a != (0, 0):
            errors.append(f"{name} center alpha {a}, expected (0, 0)")
    if files["worldmap-bg@2x.png"].mode != "RGB":
        errors.append("worldmap-bg must be RGB opaque")
    return errors


def main() -> None:
    files: dict[str, Image.Image] = {
        "bubble-calm@2x.png": draw_bubble("calm"),
        "bubble-heavy@2x.png": draw_bubble("heavy"),
        "bubble-chain@2x.png": draw_bubble("chain"),
        "row-idle@2x.png": draw_row("idle"),
        "row-hot@2x.png": draw_row("hot"),
        "row-locked@2x.png": draw_row("locked"),
        "avatar-host@2x.png": draw_avatar("host"),
        "avatar-boss@2x.png": draw_avatar("boss"),
        "avatar-system@2x.png": draw_avatar("system"),
        "avatar-app@2x.png": draw_avatar("app"),
        "avatar-sophia@2x.png": draw_avatar("sophia"),
        "core-idle@2x.png": draw_core(False),
        "core-active@2x.png": draw_core(True),
        "worldmap-bg@2x.png": draw_worldmap(),
        "node-low@2x.png": draw_node("low"),
        "node-mid@2x.png": draw_node("mid"),
        "node-high@2x.png": draw_node("high"),
        "node-hub@2x.png": draw_node("hub"),
        "purge-ring@2x.png": draw_purge_ring(),
        "edge-line@2x.png": draw_edge_line(),
        "grid-overlay@2x.png": draw_grid_overlay(),
    }

    v1_screen, v1_layer, v1_crops = compose_v1(files)
    v2_screen, v2_layer, v2_crops = compose_v2(files)

    errors = validate(files)
    if errors:
        raise SystemExit("\n".join(errors))

    source_files = {
        "v1-game-screenshot@2x.png": v1_screen,
        "v2-game-screenshot@2x.png": v2_screen,
        "v1-elements-alpha-layer@2x.png": v1_layer,
        "v2-elements-alpha-layer@2x.png": v2_layer,
    }
    qa = make_qa(files)

    crop_entries = {**{k: {"source_layer": "v1-elements-alpha-layer@2x.png", "crop_rect": v} for k, v in v1_crops.items()}, **{k: {"source_layer": "v2-elements-alpha-layer@2x.png", "crop_rect": v} for k, v in v2_crops.items()}}
    crop_entries["worldmap-bg@2x.png"] = {"source_layer": "worldmap-bg base layer used by v2-game-screenshot@2x.png", "crop_rect": [0, 0, 2400, 1400]}

    manifest = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "workflow": "V1/V2 full game screenshots were composed first from source layers; transparent PNG assets are the matching layer crops. Flattened screenshots are previews; alpha layers are the crop source.",
        "source_pages": {
            "root": "12 UI 素材需求（视觉资产规格） / 38b60335-331c-8130-bd1d-e2d072adc224",
            "v1": "V1 · 基础 UI（气泡 / 行 / 头像 / Core） / 38b60335-331c-8168-9ff1-d194dd664199",
            "v2": "V2 · 全球组网阶段（地图 / 节点 / 连线 / 清剥效果） / 38b60335-331c-81df-8e6a-ea3ad088590d",
        },
        "screenshots": {
            "v1": {"file": "source-screenshots/v1-game-screenshot@2x.png", "size": list(V1_SCREEN)},
            "v2": {"file": "source-screenshots/v2-game-screenshot@2x.png", "size": list(V2_SCREEN)},
            "v1_alpha_layer": "source-screenshots/v1-elements-alpha-layer@2x.png",
            "v2_alpha_layer": "source-screenshots/v2-elements-alpha-layer@2x.png",
        },
        "nineslice": {
            "bubble": {"logical": {"topHeight": 48, "leftWidth": 12, "rightWidth": 12, "bottomHeight": 12}, "at_2x_px": {"top": 96, "left": 24, "right": 24, "bottom": 24}, "stretch_center_alpha": 0},
            "row": {"logical": {"leftWidth": 10, "rightWidth": 10, "topHeight": 4, "bottomHeight": 4}, "at_2x_px": {"left": 20, "right": 20, "top": 8, "bottom": 8}, "stretch_center_alpha": 0},
            "edge_line": {"logical": {"leftWidth": 8, "rightWidth": 8}, "at_2x_px": {"left": 16, "right": 16}},
        },
        "asset_location": "Flat PNG copies are in this folder; identical source copies are in assets/.",
        "assets": [
            {
                "file": name,
                "size": list(im.size),
                "mode": im.mode,
                **crop_entries.get(name, {}),
            }
            for name, im in sorted(files.items())
        ],
        "qa": {"nineslice_stretch_check": "qa/nineslice-stretch-check.png"},
    }

    save_package(PRIMARY_ROOT, files, source_files, qa, manifest)
    if SECONDARY_ROOT.exists():
        save_package(SECONDARY_ROOT, files, source_files, qa, manifest)
    print(f"saved {len(files)} assets to {PRIMARY_ROOT / PACKAGE_NAME}")
    if SECONDARY_ROOT.exists():
        print(f"mirrored to {SECONDARY_ROOT / PACKAGE_NAME}")


if __name__ == "__main__":
    main()

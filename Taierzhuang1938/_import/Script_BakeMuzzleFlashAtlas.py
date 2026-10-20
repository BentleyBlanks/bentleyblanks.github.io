"""Bake the first-person muzzle flash atlas (Texture/Texture_MuzzleFlash_01.webp).

Python 3 + numpy + Pillow. Run from the repository root:

    python Taierzhuang1938/_import/Script_BakeMuzzleFlashAtlas.py [--preview out.png]

Sources are three photographic 2 x 2 sheets made with the built-in imagegen
(prompts: _import/Prompts/Texture_MuzzleFlash.txt), kept as lossless WebP in
_import/Source/MuzzleFlash/. The 2026-10-20 procedural first pass read as a
cartoon star; the user asked for COD / Battlefield realism, i.e. soft
turbulent gas lobes with photographic detail, so pixels now come from those
sheets and this script only cuts, aligns, cleans and packs them.

Layout, 4 x 4 cells of 256 px (runtime picks a random cell per sprite per shot,
with random roll and size, like COD's view-flash effects):

    0-3    rifle blast seen down the bore (camera-facing at the muzzle)
    4-7    machine-gun fireball seen down the bore
    8-11   side-on plume, muzzle at the cell's bottom edge, flame toward +V
    12-14  cells 8-10 mirrored, for more tongue variety
    15     soft round glow (procedural)

RGB is the flame's own light in sRGB (manifest channel "Atlas"); alpha is
coverage derived from luminance. Runtime blends premultiplied:
rgb + background * (1 - alpha x per-sprite occlusion).
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

projectDir = Path(__file__).resolve().parents[1]
sourceDir = projectDir / "_import/Source/MuzzleFlash"
defaultOut = projectDir / "Texture/Texture_MuzzleFlash_01.webp"
SOURCES = {
    "front": sourceDir / "Texture_MuzzleFlashFrontSource.webp",
    "fireball": sourceDir / "Texture_MuzzleFlashFireballSource.webp",
    "side": sourceDir / "Texture_MuzzleFlashSideSource.webp",
}

CELL = 256
GRID = 4
BLACK_LEVEL = 0.025        # generated "black" carries a little noise; it must read as no light
COVERAGE_FULL = 0.30       # linear luminance at which the flame fully covers what is behind
LUMA = np.array([0.2126, 0.7152, 0.0722])


def SrgbToLinear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def LinearToSrgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def Smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def CellGrid(n=CELL):
    axis = (np.arange(n) + 0.5) / n * 2 - 1
    x, y = np.meshgrid(axis, -axis)          # y up, image row 0 at the top
    return x, y


def BorderMask(x, y):
    # Every cell fades to true black before its edge so bilinear/mip sampling
    # never bleeds a neighbour into the sprite.
    return Smoothstep(0.97, 0.82, np.maximum(np.abs(x), np.abs(y)))


def Quarters(path):
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"), dtype=np.float64) / 255   # RGB only: imagegen alpha is unreliable
    h, w, _ = rgb.shape
    return [rgb[r * h // 2:(r + 1) * h // 2, c * w // 2:(c + 1) * w // 2] for r in range(2) for c in range(2)]


def CleanLinear(srgb):
    """Linear light with the generated black floor removed and the quarter's own border faded."""
    linear = SrgbToLinear(srgb)
    keep = Smoothstep(BLACK_LEVEL, BLACK_LEVEL * 3, linear @ LUMA)
    h, w = keep.shape
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum.reduce([xx, yy, w - 1 - xx, h - 1 - yy]) / min(h, w)
    keep *= Smoothstep(0.0, 0.04, edge)
    return linear * keep[..., None]


def Resample(linear, centre, scale, x, y):
    """Bilinear sample of `linear` at cell coords: source pixel = centre + (x, -y) * scale."""
    h, w, _ = linear.shape
    sx = centre[0] + x * scale - 0.5
    sy = centre[1] - y * scale - 0.5
    x0 = np.floor(sx).astype(int)
    y0 = np.floor(sy).astype(int)
    fx = (sx - x0)[..., None]
    fy = (sy - y0)[..., None]
    out = np.zeros(x.shape + (3,))
    for dy, wy in ((0, 1 - fy), (1, fy)):
        for dx, wx in ((0, 1 - fx), (1, fx)):
            xi, yi = x0 + dx, y0 + dy
            inside = ((xi >= 0) & (xi < w) & (yi >= 0) & (yi < h))[..., None]
            out += np.where(inside, linear[np.clip(yi, 0, h - 1), np.clip(xi, 0, w - 1)], 0) * wx * wy
    return out


def Supersampled(linear, centre, scale):
    # Sources are ~2x the cell: sample at 2x and box-filter so fine filaments stay clean.
    x, y = CellGrid(CELL * 2)
    big = Resample(linear, centre, scale, x, y)
    return big.reshape(CELL, 2, CELL, 2, 3).mean(axis=(1, 3))


def FrontCell(quarter):
    linear = CleanLinear(quarter)
    lum = linear @ LUMA
    h, w = lum.shape
    yy, xx = np.mgrid[0:h, 0:w]
    weight = lum ** 2                      # the hot core dominates the centre estimate
    cx = (weight * xx).sum() / weight.sum() + 0.5
    cy = (weight * yy).sum() / weight.sum() + 0.5
    r = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy).ravel()
    order = np.argsort(r)
    cumulative = np.cumsum(lum.ravel()[order]) / lum.sum()
    reach = r[order][min(len(r) - 1, np.searchsorted(cumulative, 0.985))]
    x, y = CellGrid()
    cell = Supersampled(linear, (cx, cy), reach / 0.80)   # 98.5% of the light inside 0.8 of the half cell
    return cell * BorderMask(x, y)[..., None]


def SideCell(quarter):
    linear = CleanLinear(quarter)
    lum = linear @ LUMA
    h, w = lum.shape
    rows = lum.sum(axis=1)
    lit = np.nonzero(rows > rows.max() * 0.02)[0]
    top, base = lit[0], lit[-1]
    jet = lum[max(top, base - (base - top) // 4):base + 1].sum(axis=0)   # bore axis from the jet near the muzzle
    cx = (jet * (np.arange(w) + 0.5)).sum() / jet.sum()
    scale = (base - top + 1) / 1.80        # muzzle 6% above the bottom edge, tip 4% under the top
    x, y = CellGrid()
    cell = Supersampled(linear, (cx, base + 1 - 0.94 * scale), scale)
    return cell * BorderMask(x, y)[..., None]


def GlowCell():
    x, y = CellGrid()
    r = np.hypot(x, y)
    lum = np.exp(-(r / 0.42) ** 2) * 0.55 + np.exp(-(r / 0.16) ** 2) * 0.45
    return lum[..., None] * np.array([1.0, 0.62, 0.30]) * BorderMask(x, y)[..., None]


def Normalise(cell, peak):
    """Match the hot core between cells so no variant reads as a dud or a flashbang."""
    lum = cell @ LUMA
    lit = lum[lum > 0.01]
    top = np.percentile(lit, 99.5) if lit.size else 1.0
    return cell * (peak / max(top, 1e-4))


def Pack(linear):
    coverage = np.clip((linear @ LUMA) / COVERAGE_FULL, 0, 1) ** 0.75
    return np.concatenate([LinearToSrgb(np.clip(linear, 0, 1)), coverage[..., None]], axis=-1)


def BakeAtlas():
    for key, path in SOURCES.items():
        if not path.exists():
            raise SystemExit(f"missing source sheet {path} ({key})")
    cells = [Normalise(FrontCell(q), 0.95) for q in Quarters(SOURCES["front"])]
    cells += [Normalise(FrontCell(q), 0.95) for q in Quarters(SOURCES["fireball"])]
    sides = [Normalise(SideCell(q), 0.95) for q in Quarters(SOURCES["side"])]
    cells += sides + [side[:, ::-1] for side in sides[:3]]
    cells.append(GlowCell())
    atlas = np.zeros((CELL * GRID, CELL * GRID, 4))
    for index, cell in enumerate(cells):
        row, col = divmod(index, GRID)
        atlas[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL] = Pack(cell)
    return np.clip(np.round(atlas * 255), 0, 255).astype(np.uint8)


def Main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=defaultOut)
    parser.add_argument("--preview", type=Path, help="also write an RGB PNG contact sheet here")
    args = parser.parse_args()
    pixels = BakeAtlas()
    image = Image.fromarray(pixels, "RGBA")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # q80 / alpha 50: ~0.2 MB, mean error ~4/255 on lit pixels. The flash lives 1-3
    # frames under bloom; the Texture/ total budget had ~0.2 MB of headroom.
    image.save(args.out, "WEBP", quality=80, alpha_quality=50, method=6)
    print(f"wrote {args.out} {image.size[0]}x{image.size[1]} {args.out.stat().st_size} bytes")
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        image.convert("RGB").save(args.preview)
        print(f"preview {args.preview}")


if __name__ == "__main__":
    Main()

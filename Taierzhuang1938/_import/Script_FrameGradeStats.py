"""First-level frame grading statistics: reference art vs in-engine shots.

Measures the picture-level quantities the 2026-09-28 sky / grade / interior pass
(docs/Data_TechRenderPipeline.md, "First level sky and grade") tunes against:

  L        mean display luma (Rec.709 weights on the sRGB-encoded values, 0-255)
  Lstd     luma standard deviation (global contrast)
  sat      mean chroma, (max-min)/max of each pixel (0-1)
  shB-R    shadow colour bias: mean(B-R) of the darkest 20 % of pixels (0-255)
  hiR-B    highlight colour bias: mean(R-B) of the brightest 10 % (0-255)
  sky%     share of the frame that the sky mask covers
  skyL     mean display luma inside the sky mask
  skyStd   luma std inside the sky mask (cloud structure; a blank sky is ~2)
  sky/gnd  linear-luminance ratio sky mask / bottom 35 % of the frame
  band     band-pass energy: std of (blur(L, 1.5 px) - blur(L, 6 px)) at 640 px width
  clip0    share of pixels with luma < 5  (crushed)
  clip1    share of pixels with luma > 250 (blown)

Sky mask: pixels connected to the top edge whose luma is within 70 % of the
top-edge median and whose local gradient is small; it follows the skyline well
enough for ratios (it is not a segmentation).

Usage (python from the worktree root; numpy + Pillow + scipy):
  python Taierzhuang1938/_import/Script_FrameGradeStats.py --pairs <pairs.json> [--json out.json] [--md out.md]
  python Taierzhuang1938/_import/Script_FrameGradeStats.py <image> [<image> ...]
pairs.json: [{"id": "05_1", "ref": "<png>", "before": "<png>", "after": "<png|null>"}, ...]
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

WIDTH = 640


def Load(path):
    image = Image.open(path).convert("RGB")
    h = round(image.height * WIDTH / image.width)
    return np.asarray(image.resize((WIDTH, h), Image.BILINEAR)).astype(np.float64)


def SrgbToLinear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def SkyMask(luma):
    h, w = luma.shape
    top = np.median(luma[0, :])
    grad = np.hypot(ndimage.sobel(luma, 0), ndimage.sobel(luma, 1)) / 8.0
    candidate = (luma > top * 0.70) & (grad < 6.0) & (luma > 60)
    candidate[int(h * 0.75):, :] = False
    labels, _ = ndimage.label(candidate)
    seeds = np.unique(labels[0, :])
    seeds = seeds[seeds > 0]
    mask = np.isin(labels, seeds)
    return ndimage.binary_opening(mask, iterations=1)


def Stats(path):
    rgb = Load(path)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    mx, mn = rgb.max(2), rgb.min(2)
    chroma = np.where(mx > 1, (mx - mn) / np.maximum(mx, 1), 0)
    flat = luma.ravel()
    lo, hi = np.percentile(flat, 20), np.percentile(flat, 90)
    shadow, highlight = luma <= lo, luma >= hi
    lin = SrgbToLinear(rgb)
    linLuma = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    sky = SkyMask(luma)
    h = luma.shape[0]
    ground = np.zeros_like(sky)
    ground[int(h * 0.65):, :] = True
    band = ndimage.gaussian_filter(luma, 1.5) - ndimage.gaussian_filter(luma, 6.0)
    skyShare = float(sky.mean())
    return {
        "L": float(luma.mean()), "Lstd": float(luma.std()), "sat": float(chroma.mean()),
        "shBR": float((b - r)[shadow].mean()), "hiRB": float((r - b)[highlight].mean()),
        "sky": skyShare,
        "skyL": float(luma[sky].mean()) if skyShare > 0.01 else None,
        "skyStd": float(luma[sky].std()) if skyShare > 0.01 else None,
        "skyGround": float(linLuma[sky].mean() / max(linLuma[ground].mean(), 1e-4)) if skyShare > 0.01 else None,
        "band": float(band.std()),
        "clip0": float((luma < 5).mean()), "clip1": float((luma > 250).mean()),
    }


KEYS = [("L", "L", 1), ("Lstd", "Lstd", 1), ("sat", "sat", 3), ("shBR", "shB-R", 1), ("hiRB", "hiR-B", 1),
        ("sky", "sky%", 2), ("skyL", "skyL", 1), ("skyStd", "skyStd", 1), ("skyGround", "sky/gnd", 2),
        ("band", "band", 2), ("clip0", "clip0", 3), ("clip1", "clip1", 3)]


def Fmt(v, digits):
    return "–" if v is None else f"{v:.{digits}f}"


def Mean(rows, key):
    values = [row[key] for row in rows if row and row.get(key) is not None]
    return sum(values) / len(values) if values else None


def Main(argv):
    if "--pairs" in argv:
        pairs = json.load(open(argv[argv.index("--pairs") + 1], encoding="utf-8"))
        result = []
        for p in pairs:
            entry = {"id": p["id"]}
            for col in ("ref", "before", "after"):
                entry[col] = Stats(p[col]) if p.get(col) else None
            result.append(entry)
        lines = ["| 指标 | 参考 | 改前 | 改后 |", "|---|---|---|---|"]
        for key, label, digits in KEYS:
            cells = [Fmt(Mean([e[c] for e in result], key), digits) for c in ("ref", "before", "after")]
            lines.append(f"| {label} | " + " | ".join(cells) + " |")
        lines.append("")
        lines.append("| 机位 | L 参考/前/后 | Lstd | sat | sky/gnd | skyStd | band |")
        lines.append("|---|---|---|---|---|---|---|")
        for e in result:
            def Triple(key, digits):
                return "/".join(Fmt(e[c][key] if e[c] else None, digits) for c in ("ref", "before", "after"))
            lines.append(f"| {e['id']} | {Triple('L', 0)} | {Triple('Lstd', 0)} | {Triple('sat', 2)} | "
                         f"{Triple('skyGround', 1)} | {Triple('skyStd', 0)} | {Triple('band', 1)} |")
        text = "\n".join(lines)
        print(text)
        if "--json" in argv:
            json.dump(result, open(argv[argv.index("--json") + 1], "w", encoding="utf-8"), indent=1)
        if "--md" in argv:
            open(argv[argv.index("--md") + 1], "w", encoding="utf-8").write(text + "\n")
        return
    for path in argv:
        s = Stats(path)
        print(path, " ".join(f"{label}={Fmt(s[key], digits)}" for key, label, digits in KEYS))


if __name__ == "__main__":
    Main(sys.argv[1:])

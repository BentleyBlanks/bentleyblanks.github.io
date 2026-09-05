# Packs the two imagegen sources for the incoming-shell ground marker into one
# three-channel mask consumed by Script_Vfx.mjs (SHAPE_MARKER):
#   R = reticle line art (outer circle, 16 dashes, 4 ticks, centre dot)
#   G = scorched grit between the dash ring and the outer circle
#   B = dust patch lifted off the ground by the pressure wave
# Sources (raw imagegen output, kept out of the site) live in
#   C:\Users\Bentl\Documents\Program\Taierzhuang1938SourceAssets\Vfx\IncomingMarker\
# Run from anywhere:  python Taierzhuang1938/_import/BuildIncomingMarkerTexture.py
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
SOURCE_DIR = Path(r"C:\Users\Bentl\Documents\Program\Taierzhuang1938SourceAssets\Vfx\IncomingMarker")
OUTPUT = HERE.parent / "Texture" / "Texture_IncomingMarker_01.webp"
SIZE = 768            # 3.5 m marker -> ~1 cm per texel; 1024 lossless costs 700 KB for noise
OUTER_RING_FIT = 0.90   # normalised radius where the authored outer circle lands
DUST_FIT = 0.92         # normalised radius where the dust patch has faded out


def LoadLuminance(path):
    """imagegen paints on solid black, so RGB luminance already is the mask. Its alpha
    channel is a chroma-key estimate that sits around 0.6-0.7 on solid strokes; using
    it would halve every line, so it is ignored on purpose."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def Centroid(lum, threshold):
    ys, xs = np.nonzero(lum > threshold)
    return float(xs.mean()), float(ys.mean())


def RadialProfile(lum, cx, cy):
    h, w = lum.shape
    ys, xs = np.mgrid[0:h, 0:w]
    r = np.hypot(xs - cx, ys - cy).astype(np.int32)
    return np.bincount(r.ravel(), lum.ravel()) / np.maximum(1, np.bincount(r.ravel()))


def Recenter(lum, cx, cy, half):
    """Resample so (cx, cy) is the centre and `half` source px map to SIZE/2."""
    image = Image.fromarray(lum, mode="F")
    scale = 2.0 * half / SIZE
    data = (scale, 0.0, cx - half, 0.0, scale, cy - half)
    out = image.transform((SIZE, SIZE), Image.AFFINE, data=data, resample=Image.BICUBIC, fillcolor=0.0)
    return np.clip(np.asarray(out, dtype=np.float32), 0.0, 1.0)


def NormalisedRadius():
    ys, xs = np.mgrid[0:SIZE, 0:SIZE]
    return np.hypot(xs - (SIZE - 1) / 2.0, ys - (SIZE - 1) / 2.0) / (SIZE / 2.0)


def Smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def ToU8(a):
    return Image.fromarray((np.clip(a, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8), mode="L")


def Morph(a, size, mode):
    image = ToU8(a)
    filtered = image.filter(ImageFilter.MinFilter(size) if mode == "erode" else ImageFilter.MaxFilter(size))
    return np.asarray(filtered).astype(np.float32) / 255.0


def BuildReticle():
    lum = LoadLuminance(SOURCE_DIR / "Marker_Reticle.png")
    cx, cy = Centroid(lum, 0.15)
    profile = RadialProfile(lum, cx, cy)
    # The outer circle is the brightest ring in the outer third of the image; the dash
    # ring sits near 0.30 of the width and must stay outside the search window.
    width = lum.shape[1]
    search = slice(int(width * 0.36), int(width * 0.50))
    outer = int(np.argmax(profile[search])) + search.start
    lum = Recenter(lum, cx, cy, outer / OUTER_RING_FIT)
    r = NormalisedRadius()
    # Line art: strokes sit near 0.68-0.85 luminance, grit mostly below 0.35 with a few
    # specks that pass. An opening pass (erode then dilate) drops those specks, then the
    # soft original edge is restored inside a slightly grown footprint of the strokes.
    raw = np.clip((lum - 0.42) / 0.25, 0.0, 1.0)
    opened = Morph(Morph(raw, 7, "erode"), 7, "dilate")
    footprint = Morph(opened, 9, "dilate")
    lines = np.minimum(raw, footprint)
    # Grit: everything faint between the dash ring and the outer circle, minus strokes.
    stroke_guard = 1.0 - Morph(lines, 13, "dilate")
    annulus = Smoothstep(0.50, 0.60, r) * (1.0 - Smoothstep(0.84, 0.90, r))
    grit = np.clip((lum - 0.04) / 0.40, 0.0, 1.0) * stroke_guard * annulus
    return lines, grit, {"centre": (round(cx, 1), round(cy, 1)), "outerRingPx": outer}


def BuildDust():
    lum = LoadLuminance(SOURCE_DIR / "Marker_DustGrain.png")
    cx, cy = Centroid(lum, 0.04)
    profile = RadialProfile(lum, cx, cy)
    edge = int(np.max(np.nonzero(profile > 0.02)))
    lum = Recenter(lum, cx, cy, edge / DUST_FIT)
    r = NormalisedRadius()
    lum = lum / max(1e-3, float(np.percentile(lum[lum > 0.02], 99.0)))
    dust = np.clip(lum, 0.0, 1.0) * (1.0 - Smoothstep(0.78, 0.96, r))
    return dust, {"centre": (round(cx, 1), round(cy, 1)), "edgePx": edge}


def main():
    lines, grit, reticle_info = BuildReticle()
    dust, dust_info = BuildDust()
    border = NormalisedRadius() > 0.985
    for channel in (lines, grit, dust):
        channel[border] = 0.0
    rgb = np.stack([lines, grit, dust], axis=-1)
    u8 = (np.clip(rgb, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    # Grit and dust are noise and never exceed ~0.5 alpha in the shader; 32 levels are
    # invisible there and cut the lossless WebP roughly in half. Lines stay 8-bit.
    u8[..., 1] &= 0xF8
    u8[..., 2] &= 0xF8
    image = Image.fromarray(u8, mode="RGB")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, "WEBP", lossless=True, quality=100, method=6)
    print("reticle", reticle_info, "dust", dust_info)
    print("wrote", OUTPUT, image.size, f"{OUTPUT.stat().st_size // 1024} KB")
    if len(sys.argv) > 1:
        preview = Path(sys.argv[1])
        preview.parent.mkdir(parents=True, exist_ok=True)
        image.save(preview)
        print("preview", preview)


if __name__ == "__main__":
    main()

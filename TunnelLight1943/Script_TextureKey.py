"""白底出图 → 带 alpha 的 PNG（抠背景）。

为什么需要这一步：外部生成的成图是 **JPG**，而 JPG 没有 alpha 通道——
"我出图时留了纯白背景"只有配上这一步才有意义，否则那张白底会原样贴进画面，
在深色面板上就是一块白方框（2026-08-10 用户报的就是这个）。

**目录约定**：白底原图放 `Texture/Source/`，过一遍本脚本，抠好的成品落在
`Texture/`——游戏里**只准引用 `Texture/` 这一层**。分两层就是为了让"哪张能用"
一眼看得出来，不必读代码。

抠法不是"把接近白的像素删掉"（纸本身是浅米色，阈值一高就把纸也吃掉）：
  ① 阈值只用来找**从画布四边连通进来的**那片白（scipy 连通域），
     所以纸中间的浅色高光、纸片之间露白的裂缝都各归各的；
  ② 前景先腐蚀 1 像素再羽化——JPEG 在纸边留了一圈灰白振铃，
     不啃掉这一圈，抠完纸的轮廓上会挂一道白毛边；
  ③ 半透明像素做**去白解混**（C = (C_obs − (1−a)·255) / a）：
     边缘像素本来是"纸色 + 白底"的混合，不还原回纸色，缩略图上仍是发白的一圈。
裁到 alpha 的包围盒（白边不占版面），再按 --width 缩到实际显示尺寸的两倍。

**输出格式默认 WebP**，不是 PNG：纸是照片质感的连续调，PNG 无损压不动
（同一张 760px 宽的告示，PNG 1.6MB / WebP q86 不到 200KB，肉眼没差）。
本作的 index.html 用 import map，浏览器底线本来就在 Safari 16.4+，
带 alpha 的 WebP（Safari 14+）不存在兼容问题。

用法：
  python Script_TextureKey.py Texture/Source/Texture_NoticeZhengfu.jpg [--width 760]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ProjectDir = Path(__file__).resolve().parent


def ParseArgs() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="把纯白背景的成图抠成带 alpha 的 PNG")
    parser.add_argument("source", type=Path, help="白底原图（相对本目录或绝对路径）")
    parser.add_argument("--out", type=Path, help="输出图（默认与原图同名换 .webp；给 .png 就存 PNG）")
    parser.add_argument("--quality", type=int, default=86, help="WebP 质量（PNG 无损，忽略此项）")
    parser.add_argument("--white", type=int, default=238, help="判定为背景的最低通道值")
    parser.add_argument("--spread", type=int, default=10, help="背景像素允许的最大通道差（白是中性色）")
    parser.add_argument("--feather", type=float, default=0.6, help="边缘羽化半径（像素）")
    parser.add_argument("--pad", type=int, default=4, help="裁剪时保留的透明边距")
    parser.add_argument("--width", type=int, default=0, help="输出宽度（0=不缩放）")
    return parser.parse_args()


def KeyWhite(rgb: np.ndarray, white: int, spread: int, feather: float) -> np.ndarray:
    """返回 0..1 的 alpha。只抠**与画布边缘连通**的那片白。"""
    lo = rgb.min(axis=2)
    hi = rgb.max(axis=2)
    whiteish = (lo >= white) & ((hi - lo) <= spread)

    labels, count = ndimage.label(whiteish)
    if count == 0:
        return np.ones(rgb.shape[:2], dtype=np.float32)
    # 贴着四条边的连通块才算背景：纸当中的浅色斑点不该被打成洞
    edge = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    outside = np.unique(edge[edge > 0])
    background = np.isin(labels, outside)

    foreground = ~background
    # 啃掉 JPEG 在纸边留下的一圈灰白振铃，再羽化回自然的软边
    foreground = ndimage.binary_erosion(foreground, structure=np.ones((3, 3), bool))
    alpha = ndimage.gaussian_filter(foreground.astype(np.float32), sigma=feather)
    return np.clip((alpha - 0.06) / 0.88, 0, 1)


def Unmix(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """半透明像素去白：把"纸色压在白底上"的观测值还原回纸色本身。"""
    out = rgb.astype(np.float32)
    soft = (alpha > 0.08) & (alpha < 0.995)
    a = alpha[soft][:, None]
    out[soft] = np.clip((out[soft] - (1 - a) * 255.0) / a, 0, 255)
    return out


def main() -> None:
    args = ParseArgs()
    source = args.source if args.source.is_absolute() else ProjectDir / args.source
    # 默认落在 Source 的上一层：白底原图进 Texture/Source/，成品出 Texture/
    default = source.with_suffix(".webp")
    if default.parent.name == "Source":
        default = default.parent.parent / default.name
    out = args.out or default
    if not out.is_absolute():
        out = ProjectDir / out

    rgb = np.asarray(Image.open(source).convert("RGB")).astype(np.float32)
    alpha = KeyWhite(rgb, args.white, args.spread, args.feather)
    rgb = Unmix(rgb, alpha)

    rows = np.where(alpha.max(axis=1) > 0.02)[0]
    cols = np.where(alpha.max(axis=0) > 0.02)[0]
    y0 = max(0, rows[0] - args.pad)
    y1 = min(alpha.shape[0], rows[-1] + 1 + args.pad)
    x0 = max(0, cols[0] - args.pad)
    x1 = min(alpha.shape[1], cols[-1] + 1 + args.pad)

    rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255.0])
    image = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), "RGBA")
    if args.width and image.width != args.width:
        height = round(image.height * args.width / image.width)
        image = image.resize((args.width, height), Image.LANCZOS)

    if out.suffix.lower() == ".png":
        image.save(out, "PNG", optimize=True)
    else:
        image.save(out, "WEBP", quality=args.quality, method=6, exact=False)
    kept = float(alpha.mean())
    print(f"{source.name} → {out.name}  {image.width}×{image.height}"
          f"  不透明面积 {kept:.1%}  {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()

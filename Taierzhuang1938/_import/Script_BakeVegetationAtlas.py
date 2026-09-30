"""第一关植被卡片图集：画在纯品红底上的生成图（Lovart；主图一张 + 个别卡单独重生成）→ 游戏用 alpha 卡片图集。

口径：docs/Data_FirstLevelVegetationProps.md。运行时消费方：Script_FirstLevelVegetation.mjs
（卡片 UV 与宽高比写在 Data_FirstLevelVegetation.mjs 的 VEGETATION_CARDS，本脚本打印的表就是它）。

为什么不用生成器给的透明通道：Lovart 的后端会自作主张「去背景」，抠出来是一团团填满的剪影、
边上一圈红黄镶边（2026-09-28 第一张实测，_shots/Gap3A_Source/B6/atlas_v1）。所以提示词要求
不透明纯品红底，这里自己按「品红度」键出 alpha：
    m = min(R, B) - G            纯品红 ≈ 250，草秆/枝条 ≤ 20，两者的混边在中间
    alpha = 1 - smoothstep(KEY_LO, KEY_HI, m)
    去溢色：R、B 各减 max(0, min(R,B) - G)（混边里的品红分量）
然后每张卡按自己的紧包围盒裁出、预乘 alpha 缩放进 256×512 的格子（底边对齐 = 根在格子底），
透明区的颜色从卡片向外推（mip 缩小时不把黑边/品红边混进来）。

    python Taierzhuang1938/_import/Script_BakeVegetationAtlas.py \\
        --source Taierzhuang1938/_shots/Gap3A_Source/B6/atlas_v2/lovart_376da24500f3.png \
        --card-source LowTuft=Taierzhuang1938/_shots/Gap3A_Source/B6/atlas_v3/lovart_dd9bb199850c.png
    # --dry-run：只出预览到 _shots/TextureBake/FirstLevelVegetationAtlas/，不写 Texture/

产物：
    Texture/Texture_FirstLevelVegetationAtlas.webp   1024×1024 RGBA，sRGB（alpha 线性）；清单 Data_TextureManifest 登记为 decal / Base
    _import/TextureBakes/Texture_FirstLevelVegetationAtlas.json   烘焙记录（源 sha256、参数、卡片表、产物 sha256/字节）
    _shots/TextureBake/FirstLevelVegetationAtlas/Preview.png      灰底合成预览（不进仓库）
"""
import argparse
import datetime
import hashlib
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
GENERATOR = "Script_BakeVegetationAtlas.py@3"
NAME = "FirstLevelVegetationAtlas"
KEY_LO, KEY_HI = 70.0, 210.0
SATURATION = 0.8
ATLAS = 1024
CELL_W, CELL_H = 256, 512
COLUMNS = 4

# 源图（2048²）里 8 张卡各占一格；格线在 x = 681 / 1366，列内的行线见下（Lovart v2 实测）。
# order 就是图集里的格子序号（行优先，4 列 × 2 行）。heightM 是提示词里写的真实高度，
# 运行时按它 × 宽高比出面片尺寸。
# source = 取自哪张源图（--source 主图 = "sheet"；其余用 --card-source ID=路径 给）。
# LowTuft 在 v2 主图里画成一整块铺满格子的草垫，左右和底边都被格子边切平，进游戏是一张张直边方块
# （2026-09-30 实拍），改用单独生成的一簇（lovart_dd9bb199850c，根在正下方一点、四周留足品红）；
# 那张图根下还拖一截细茎，rect 的底边截在茎上，不让草簇悬空。
CARDS = [
    {"id": "TallGrass", "rect": [0, 0, 680, 1022], "heightM": 0.62},
    {"id": "LowTuft", "rect": [100, 400, 2000, 1480], "heightM": 0.26, "source": "LowTuft"},
    {"id": "WeedStalks", "rect": [1367, 0, 2047, 680], "heightM": 0.8},
    {"id": "Bramble", "rect": [1367, 682, 2047, 1364], "heightM": 0.85},
    {"id": "Reeds", "rect": [0, 1025, 680, 2047], "heightM": 1.8},
    {"id": "GreenSprouts", "rect": [682, 682, 1365, 1357], "heightM": 0.22},
    {"id": "MixedClump", "rect": [682, 1367, 1365, 2047], "heightM": 0.42},
    {"id": "TwigShrub", "rect": [1367, 1367, 2047, 2047], "heightM": 0.7},
]
# 贴边检查：卡片在源矩形左 / 右 / 上边这一窄条里还有实心像素，就是被格子边切掉了（直边方块），拒绝烘焙。
# 底边不查：根本来就落在格子底。
EDGE_BAND = 6
EDGE_MAX = 0.02


def EdgeTouch(a):
    """左 / 右 / 上边条里实心（alpha > 0.5）像素的占比。"""
    solid = a > 0.5
    return {"left": float(solid[:, :EDGE_BAND].mean()), "right": float(solid[:, -EDGE_BAND:].mean()),
            "top": float(solid[:EDGE_BAND, :].mean())}


def Smoothstep(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def KeyMagenta(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(r, b) - g
    alpha = 1.0 - Smoothstep(KEY_LO, KEY_HI, m)
    spill = np.clip(m, 0, None)
    out = rgb.copy()
    out[..., 0] = np.clip(r - spill, 0, 255)
    out[..., 2] = np.clip(b - spill, 0, 255)
    return out, alpha


def Grade(rgb, saturation=SATURATION):
    """定色：粉紫压成米灰（生成图的芦苇穗、枯蒿是偏粉的，游戏里在阴天调色下读成淡紫），
    再整体降一点饱和度（参考图口径：低饱和冷灰棕）。只动颜色，alpha 不变。"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    pink = (r > g) & (b > g * 0.95)
    b = np.where(pink, np.minimum(b, g * 0.9), b)
    r = np.where(pink, np.minimum(r, g * 1.08), r)
    out = np.stack([r, g, b], -1)
    luma = out.mean(-1, keepdims=True)
    return np.clip(luma + (out - luma) * saturation, 0, 255)


def PushColor(rgba, iterations=24):
    """透明区填上附近卡片的颜色（逐级 3×3 加权扩散），alpha 不动。"""
    rgb = rgba[..., :3].astype(np.float64)
    a = rgba[..., 3].astype(np.float64) / 255.0
    solid = a > 0.02
    acc = rgb * solid[..., None]
    wt = solid.astype(np.float64)
    fill = rgb.copy()
    known = solid.copy()
    for _ in range(iterations):
        pad_acc = np.pad(acc, ((1, 1), (1, 1), (0, 0)), mode="edge")
        pad_wt = np.pad(wt, 1, mode="edge")
        s_acc = sum(pad_acc[1 + dy:1 + dy + acc.shape[0], 1 + dx:1 + dx + acc.shape[1]]
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        s_wt = sum(pad_wt[1 + dy:1 + dy + wt.shape[0], 1 + dx:1 + dx + wt.shape[1]]
                   for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        grow = (~known) & (s_wt > 0)
        fill[grow] = s_acc[grow] / s_wt[grow][:, None]
        known = known | grow
        acc = fill * known[..., None]
        wt = known.astype(np.float64)
    mean = rgb[solid].mean(0) if solid.any() else np.array([128.0, 120.0, 100.0])
    fill[~known] = mean
    out = rgba.copy()
    out[..., :3] = np.clip(np.where(solid[..., None], rgb, fill), 0, 255).astype(np.uint8)
    return out


def Sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def LoadKeyed(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    keyed, alpha = KeyMagenta(rgb)
    return Grade(keyed), alpha


def Bake(sources, out_path, record_path, preview_dir, dry_run, allow_edge=False):
    missing = sorted({card.get("source", "sheet") for card in CARDS} - set(sources))
    if missing:
        raise SystemExit("缺源图：" + ", ".join(missing) + "（主图 --source，单卡 --card-source ID=路径）")
    loaded = {key: LoadKeyed(path) for key, path in sources.items()}
    atlas = np.zeros((ATLAS, ATLAS, 4), np.float64)
    table = []
    bad = []
    for index, card in enumerate(CARDS):
        keyed, alpha = loaded[card.get("source", "sheet")]
        x0, y0, x1, y1 = card["rect"]
        inset = 4
        a = alpha[y0 + inset:y1 - inset + 1, x0 + inset:x1 - inset + 1]
        c = keyed[y0 + inset:y1 - inset + 1, x0 + inset:x1 - inset + 1]
        touch = EdgeTouch(a)
        if max(touch.values()) > EDGE_MAX:
            bad.append((card["id"], touch))
        ys, xs = np.nonzero(a > 0.08)
        bx0, bx1 = max(xs.min() - 2, 0), min(xs.max() + 3, a.shape[1])
        by0, by1 = max(ys.min() - 2, 0), min(ys.max() + 3, a.shape[0])
        a, c = a[by0:by1, bx0:bx1], c[by0:by1, bx0:bx1]
        h, w = a.shape
        inner_w, inner_h = CELL_W - 8, CELL_H - 5
        scale = min(inner_w / w, inner_h / h)
        tw, th = max(1, round(w * scale)), max(1, round(h * scale))
        premul = np.dstack([c * a[..., None], a * 255.0]).astype(np.float32)
        channels = [np.asarray(Image.fromarray(premul[..., k], mode="F").resize((tw, th), Image.LANCZOS))
                    for k in range(4)]
        pa = np.clip(channels[3] / 255.0, 0, 1)
        prgb = np.dstack(channels[:3])
        col = np.where(pa[..., None] > 1e-4, prgb / np.maximum(pa[..., None], 1e-4), 0)
        cx, cy = (index % COLUMNS) * CELL_W, (index // COLUMNS) * CELL_H
        ox = cx + (CELL_W - tw) // 2
        oy = cy + CELL_H - 1 - th
        atlas[oy:oy + th, ox:ox + tw, :3] = np.clip(col, 0, 255)
        atlas[oy:oy + th, ox:ox + tw, 3] = pa * 255.0
        solid = pa > 0.5
        mean = (col[solid].mean(0) / 255.0).round(3).tolist() if solid.any() else [0, 0, 0]
        # three：TextureLoader flipY = true，图像顶行在 v = 1。
        entry = {
            "id": card["id"], "cell": index,
            "uv": [round(ox / ATLAS, 5), round(1 - (oy + th) / ATLAS, 5),
                   round((ox + tw) / ATLAS, 5), round(1 - oy / ATLAS, 5)],
            "aspect": round(tw / th, 4), "heightM": card["heightM"],
            "coverage": round(float((pa > 0.5).mean()), 3), "meanSrgb": mean,
        }
        table.append(entry)
    if bad and not allow_edge:
        raise SystemExit("卡片被格子边切掉（换源图或加 --allow-edge）：" + json.dumps(bad, ensure_ascii=False))
    rgba = PushColor(np.clip(atlas, 0, 255).astype(np.uint8))
    os.makedirs(preview_dir, exist_ok=True)
    grey = np.full((ATLAS, ATLAS, 3), 96.0)
    a = rgba[..., 3:4] / 255.0
    Image.fromarray((rgba[..., :3] * a + grey * (1 - a)).astype(np.uint8)).save(os.path.join(preview_dir, "Preview.png"))
    Image.fromarray(rgba[..., :3]).save(os.path.join(preview_dir, "PreviewPushedRgb.png"))
    target = os.path.join(preview_dir, os.path.basename(out_path)) if dry_run else out_path
    Image.fromarray(rgba, "RGBA").save(target, "WEBP", quality=90, method=6, alpha_quality=100)
    record = {
        "generator": GENERATOR, "name": NAME, "date": datetime.date.today().isoformat(),
        "sources": {key: {"path": os.path.relpath(path, PROJECT).replace("\\", "/"), "sha256": Sha256(path),
                          "origin": "Lovart (generate_image_nano_banana_pro)", "keyColour": "#FF00FF"}
                    for key, path in sources.items()},
        "params": {"keyLo": KEY_LO, "keyHi": KEY_HI, "saturation": SATURATION, "pinkToBeige": True, "atlas": ATLAS, "cell": [CELL_W, CELL_H], "columns": COLUMNS},
        "colorSpace": {"rgb": "sRGB", "alpha": "linear coverage"},
        # 与 Script_BakePbrTexture 的记录同一个 outputs 形状（Script_TextureStandardsTest 逐项核 sha256 / 尺寸）。
        "outputs": [{"file": os.path.basename(out_path), "channel": "Base", "sha256": Sha256(target),
                     "bytes": os.path.getsize(target), "width": ATLAS, "height": ATLAS}],
        "cards": table,
    }
    if not dry_run:
        os.makedirs(os.path.dirname(record_path), exist_ok=True)
        with open(record_path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
            f.write("\n")
    print(json.dumps({"bytes": record["outputs"][0]["bytes"], "cards": table}, ensure_ascii=False, indent=1))


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", default=os.path.join(PROJECT, "Texture", f"Texture_{NAME}.webp"))
    parser.add_argument("--record", default=os.path.join(HERE, "TextureBakes", f"Texture_{NAME}.json"))
    parser.add_argument("--preview", default=os.path.join(PROJECT, "_shots", "TextureBake", NAME))
    parser.add_argument("--card-source", action="append", default=[], metavar="ID=PATH",
                        help="单张卡的源图（CARDS 里 source 等于 ID 的卡从这张取）")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-edge", action="store_true", help="贴边检查不过也烘（只给排查用）")
    args = parser.parse_args()
    sources = {"sheet": os.path.abspath(args.source)}
    for item in args.card_source:
        key, _, path = item.partition("=")
        sources[key] = os.path.abspath(path)
    Bake(sources, os.path.abspath(args.out), os.path.abspath(args.record),
         os.path.abspath(args.preview), args.dry_run, args.allow_edge)


if __name__ == "__main__":
    Main()

"""通用 PBR 贴图烘焙：一张源反照率（Lovart / imagegen / 扫描）→ 游戏用 Base + Normal + Orm|Orh。

口径与门槛：docs/Data_TextureAssetStandard.md。它是 _import/Script_BakeTerrainLayers.py 那套
做法（低频拉平 → 无缝 → 行列拉平 → 定色 → 高度 → 法线/AO/粗糙度）的泛化，参数按材质类取
_import/Data_TextureBakePresets.json 的预设，命令行可逐项覆盖。依赖只有 numpy + Pillow。

常用（仓库根执行）：
    python Taierzhuang1938/_import/Script_BakePbrTexture.py \\
        --source Taierzhuang1938/_shots/Gap3A_Source/Village/Gen_GreyBrickWall.png \\
        --name VillageGreyBrick --preset greyBrick --tile-m 2.0
    # 先试参数不落盘：加 --dry-run（产物进 _shots/TextureBake/<Name>/，不写 Texture/ 也不写烘焙记录）
    # 按记录原样重烘：--rebake Taierzhuang1938/_import/TextureBakes/Texture_<Name>.json

产物：
    Texture/Texture_<Name>Base.webp     sRGB 反照率，--size（默认 1024）
    Texture/Texture_<Name>Normal.webp   切线空间法线，--data-size（默认 size/2）
    Texture/Texture_<Name>Orm.webp      R=AO G=粗糙度 B=金属（glTF 顺序）     —— 或
    Texture/Texture_<Name>Orh.webp      R=AO G=粗糙度 B=高度（地形/壕沟数组用，--pack orh）
    _import/TextureBakes/Texture_<Name>.json   烘焙记录：源图 sha256、全部参数、产物 sha256/字节/尺寸、
                                               平铺与定色指标。Script_TextureStandardsTest 用它核对。
    _shots/TextureBake/<Name>/Preview_<Name>.png  3×3 平铺 + 打光预览 + 法线 + Orm（目测用，不进仓库）

法线约定（写死，文档 §3.2）：
    --normal-convention gl（默认）：OpenGL / Y+，绿 = 图像上方。对应 three MeshStandardMaterial
        以 flipY=true 采样（Script_Materials 的外部 PBR、TextureLoader 默认）。glTF 路径 flipY=false
        时 GLTFLoader 会自动把 normalScale.y 取负，同一张图照样对。
    --normal-convention terrain：绿 = 图像下方。只给地形 / 壕沟数组着色器（flipY=false、图像向下 = 世界 +Z，
        扰动直接 vec3(n.x, 0, n.y)），与 Script_BakeTerrainLayers.py 一致。
"""
import argparse
import datetime
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
GENERATOR = "Script_BakePbrTexture.py@1"
PRESETS_PATH = os.path.join(HERE, "Data_TextureBakePresets.json")
RECORD_DIR = os.path.join(HERE, "TextureBakes")


# --------------------------------------------------------------------------------------------
# 颜色与滤波
# --------------------------------------------------------------------------------------------
def SrgbToLinear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def LinearToSrgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def GaussianPeriodic(img, sigma):
    """周期边界的高斯模糊（FFT）。输入 H×W 或 H×W×C。"""
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    if img.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(img) * kernel))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(img[..., c]) * kernel)) for c in range(img.shape[2])], -1)


def Luma(srgb):
    """标准里的「亮度」= sRGB 三通道均值（与地形烘焙、门禁同一把尺）。"""
    return srgb.mean(2)


def LinearLuminance(lin):
    return lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722


# --------------------------------------------------------------------------------------------
# 去光照 / 无缝 / 定色
# --------------------------------------------------------------------------------------------
def FlattenLowFrequency(lin, sigma):
    """除掉比 sigma 更宽的明暗：生成图里的「一侧亮一侧暗」、暗角、大块斑，平铺后都是网格。"""
    low = GaussianPeriodic(lin, sigma)
    mean = lin.mean((0, 1), keepdims=True)
    return np.clip(lin * mean / np.maximum(low, 1e-4), 0, 1)


def FlattenRowsAndColumns(lin, window=21):
    """逐行/逐列均值拉平（只动一维带状分量）。**砖缝、瓦垄、木纹这类本来就成行的材质要关掉**。"""
    lum = LinearLuminance(lin)
    mean = lum.mean()

    def Ratio(profile):
        padded = np.concatenate([profile[-window:], profile, profile[:window]])
        smooth = np.convolve(padded, np.ones(window) / window, mode="same")[window:-window]
        return np.maximum(profile, 1e-4) / np.maximum(smooth, 1e-4) * (smooth / mean)

    lin = lin / Ratio(lum.mean(1))[:, None, None]
    return np.clip(lin / Ratio(LinearLuminance(lin).mean(0))[None, :, None], 0, 1)


def HeightFromLuma(lin, size):
    """亮度两档带通（细颗粒 + 块面）归一化到 0..1。σ 按 1024 标定、随尺寸缩放。"""
    k = size / 1024
    lum = LinearLuminance(lin)
    fine = GaussianPeriodic(lum, 1.2 * k) - GaussianPeriodic(lum, 6 * k)
    clod = GaussianPeriodic(lum, 5 * k) - GaussianPeriodic(lum, 38 * k)
    h = 0.45 * fine / max(fine.std(), 1e-6) + 0.55 * clod / max(clod.std(), 1e-6)
    lo, hi = np.percentile(h, 0.8), np.percentile(h, 99.2)
    return np.clip((h - lo) / max(hi - lo, 1e-6), 0, 1)


def NormalizeHeight(h):
    lo, hi = np.percentile(h, 0.5), np.percentile(h, 99.5)
    return np.clip((h - lo) / max(hi - lo, 1e-6), 0, 1)


def BlendMask(guide, size, band_frac=0.146, seed=7):
    """半图偏移交叉淡化的掩码 t（1 = 用原图，0 = 用偏移图）。与 Script_BakeTerrainLayers.MakeSeamless 同法：
    掩码几乎二值、沿中尺度噪声等值线走，高度差只轻推一把（让高度差主导会在边缘挑亮的那份，平铺成亮框）。"""
    h = w = size
    shifted = np.roll(guide, (h // 2, w // 2), (0, 1))
    y = np.arange(h)[:, None]
    x = np.arange(w)[None, :]
    edge = np.minimum(np.minimum(x, w - 1 - x), np.minimum(y, h - 1 - y)).astype(float)
    rng = np.random.default_rng(seed)
    wobble = GaussianPeriodic(rng.standard_normal((h, w)), 22 * size / 1024)
    wobble /= max(np.abs(wobble).max(), 1e-6)
    t = np.clip(edge / (band_frac * size) + wobble * 0.3, 0, 1)
    t = np.clip((t - 0.5) * 7.0 + 0.5 + (guide - shifted) * 0.6, 0, 1)
    return t * t * (3 - 2 * t)


def ApplyBlend(img, t):
    """方差保持混合（Heitz & Neyret 2018）：两张不相关纹理线性平均会掉对比度，除 √(t²+(1-t)²) 补回。"""
    size = img.shape[0]
    shifted = np.roll(img, (size // 2, size // 2), (0, 1))
    tt = t[..., None] if img.ndim == 3 else t
    mean = img.mean((0, 1), keepdims=True)
    mixed = (img - mean) * tt + (shifted - mean) * (1 - tt)
    mixed /= np.sqrt(tt * tt + (1 - tt) ** 2)
    return np.clip(mixed + mean, 0, 1)


def WeldEdges1D(img, band, axis):
    """只焊一个方向的两条边（axis=1：左右）。"""
    out = img.copy()
    size = img.shape[axis]
    for i in range(band):
        a = [slice(None)] * img.ndim
        b = [slice(None)] * img.ndim
        a[axis], b[axis] = i, size - 1 - i
        a, b = tuple(a), tuple(b)
        first, last = out[a].copy(), out[b].copy()
        t = 0.5 * (1 - i / band) ** 2
        out[a], out[b] = first * (1 - t) + last * t, last * (1 - t) + first * t
    return out


def WeldEdges(img, band):
    """只羽化四边（与 Script_BakeTrenchPom.WeldEdges 同法）：成行成列的结构（砖、瓦、木纹）不能半图偏移混合，
    那会在交界处错缝。前提是源图本身已按提示词画成近似无缝，这里只把最后几十像素焊上。"""
    out = img.copy()
    size = img.shape[0]
    for axis in (0, 1):
        for i in range(band):
            a = [slice(None)] * img.ndim
            b = [slice(None)] * img.ndim
            a[axis], b[axis] = i, size - 1 - i
            a, b = tuple(a), tuple(b)
            first, last = out[a].copy(), out[b].copy()
            t = 0.5 * (1 - i / band) ** 2
            out[a], out[b] = first * (1 - t) + last * t, last * (1 - t) + first * t
    return out


def ResizeRows(img, rows, size):
    """把 rows 这一段行（浮点边界）重采样回 size×size（逐通道 PIL 'F' 双三次）。"""
    top, bottom = int(round(rows[0])), int(round(rows[1]))
    band = img[top:bottom]
    chans = [band] if band.ndim == 2 else [band[..., c] for c in range(band.shape[2])]
    out = [np.asarray(Image.fromarray(c.astype(np.float32), "F").resize((size, size), Image.BICUBIC)) for c in chans]
    return np.clip(out[0] if band.ndim == 2 else np.stack(out, -1), 0, 1).astype(np.float64)


def FindCourses(lin, size, mortar_bright):
    """砖缝 / 瓦垄的行周期与相位：行均值去趋势后自相关取周期 P，再找砖缝行的相位 r0。
    返回 (r0, r0 + n·P)：从一条砖缝的中心起、正好 n 层，裁出来上下相接就不错层。"""
    lum = LinearLuminance(lin)
    prof = lum.mean(1) * (1 if mortar_bright else -1)
    win = max(5, size // 8)
    prof = prof - np.convolve(np.concatenate([prof[-win:], prof, prof[:win]]), np.ones(win) / win, mode="same")[win:-win]
    ac = np.real(np.fft.ifft(np.abs(np.fft.fft(prof)) ** 2))
    lo, hi = max(4, size // 80), size // 3
    lag = lo + int(np.argmax(ac[lo:hi]))
    period = float(lag)
    a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
    if a - 2 * b + c < 0:  # 抛物线细化到亚像素
        period += 0.5 * (a - c) / (a - 2 * b + c)
    scores = [np.mean([prof[int(round(o + k * period)) % size] for k in range(int(size / period))])
              for o in np.arange(0, period, 0.5)]
    r0 = float(np.arange(0, period, 0.5)[int(np.argmax(scores))])
    n = int((size - 1 - r0) // period)
    return period, (r0, r0 + n * period), n


def MatchTone(lin, mean_srgb, contrast, strength=1.0):
    """把 sRGB 均值与亮度标准差拉向目标；strength<1 只拉一部分（保留源图色相个性）。"""
    srgb = LinearToSrgb(lin)
    lum = Luma(srgb)
    cur_mean = srgb.mean((0, 1))
    dev = srgb - cur_mean[None, None, :]
    scale = contrast / max(float(lum.std()), 1e-6)
    target_mean = cur_mean + (np.asarray(mean_srgb) - cur_mean) * strength
    target_scale = 1 + (scale - 1) * strength
    return np.clip(target_mean[None, None, :] + dev * target_scale, 0, 1)


# --------------------------------------------------------------------------------------------
# 法线 / AO / 粗糙度
# --------------------------------------------------------------------------------------------
def NormalFromHeight(height, relief_m, tile_m, strength, convention):
    """切线空间法线。gl：n = (-dh/d右, +dh/d下, 1)，即绿 = 图像上方（-dh/d上）；
    terrain：n = (-dh/d右, -dh/d下, 1)，绿 = 图像下方。存储 rgb = n*0.5+0.5。"""
    px = tile_m / height.shape[1]
    hm = height * relief_m * strength
    gx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) / (2 * px)
    gy = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) / (2 * px)
    ny = gy if convention == "gl" else -gy
    n = np.stack([-gx, ny, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def Downsample(a, target):
    f = a.shape[0] // target
    if f <= 1:
        return a
    shape = (target, f, target, f) + a.shape[2:]
    return a.reshape(shape).mean((1, 3))


# --------------------------------------------------------------------------------------------
# 指标（与门禁同一把尺）
# --------------------------------------------------------------------------------------------
def EdgeBrightnessSwing(srgb):
    lum = Luma(srgb)
    n = lum.shape[0]
    d = np.minimum(np.arange(n), n - 1 - np.arange(n))
    rows, cols = lum.mean(1), lum.mean(0)
    step = max(4, n // 64)
    prof = np.array([(rows[(d >= k) & (d < k + step)].mean() + cols[(d >= k) & (d < k + step)].mean()) / 2
                     for k in range(0, n // 2, step)])
    return float((prof.max() - prof.min()) / lum.mean())


def BorderContrastRatio(srgb, width_frac=0.047):
    lum = Luma(srgb)
    detail = lum - GaussianPeriodic(lum, 3)
    local = np.sqrt(GaussianPeriodic(detail * detail, 6))
    rows, cols = local.mean(1), local.mean(0)
    n = len(rows)
    width = max(8, int(n * width_frac))
    border = np.concatenate([rows[:width], rows[n - width:], cols[:width], cols[n - width:]])
    inner = np.concatenate([rows[n // 4: 3 * n // 4], cols[n // 4: 3 * n // 4]])
    return float(np.percentile(border, 5) / max(float(np.median(inner)), 1e-9))


def ToneMetrics(srgb):
    lum = Luma(srgb)
    m = srgb.mean((0, 1))
    n = srgb.shape[0]
    low = GaussianPeriodic(lum, n / 16)
    return {
        "meanSrgb": [round(float(v), 4) for v in m],
        "luma": round(float(lum.mean()), 4),
        "lumaStd": round(float(lum.std()), 4),
        "sat": round(float((m.max() - m.min()) / max(m.max(), 1e-6)), 4),
        "clipLow": round(float((lum < 0.03).mean()), 4),
        "clipHigh": round(float((lum > 0.95).mean()), 4),
        # 大尺度明暗起伏 / 均值：烘进去的投影、侧光、暗角都落在这里。平光源应当很小。
        "lowFreq": round(float(low.std() / max(lum.mean(), 1e-6)), 4),
    }


def TileMetrics(srgb):
    n = srgb.shape[1]
    seam = (float(np.abs(srgb[:, 0] - srgb[:, -1]).mean()) + float(np.abs(srgb[0, :] - srgb[-1, :]).mean())) / 2
    interior = (float(np.abs(srgb[:, n // 2 - 1] - srgb[:, n // 2]).mean())
                + float(np.abs(srgb[n // 2 - 1, :] - srgb[n // 2, :]).mean())) / 2
    return {
        "seam": round(seam, 4),
        "interior": round(interior, 4),
        # 接缝两侧相邻像素差 ÷ 图内相邻像素差：≈1 = 接缝与图内一样连续
        "seamRatio": round(seam / max(interior, 1e-6), 3),
        "border": round(BorderContrastRatio(srgb), 3),
        "swing": round(EdgeBrightnessSwing(srgb), 4),
    }


def Sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def Rel(path):
    """记录里的路径一律相对 Taierzhuang1938/，斜杠统一；项目外的源图保留绝对路径。"""
    ap = os.path.abspath(path)
    rel = os.path.relpath(ap, PROJECT)
    return (ap if rel.startswith("..") else rel).replace("\\", "/")


# --------------------------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------------------------
def LoadSquare(path, size):
    img = Image.open(path)
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    img = img.convert("RGBA" if has_alpha else "RGB")
    if img.size[0] != img.size[1]:
        side = min(img.size)
        left, top = (img.size[0] - side) // 2, (img.size[1] - side) // 2
        img = img.crop((left, top, left + side, top + side))
    if img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    a = np.asarray(img).astype(np.float64) / 255
    return a[..., :3], (a[..., 3] if has_alpha else None)


def ResolveParams(args, presets):
    cls = presets["classes"].get(args.preset)
    if cls is None:
        raise SystemExit(f"未知 --preset {args.preset}；可选：{', '.join(presets['classes'])}")
    p = dict(cls)
    for key in ("reliefM", "rough", "roughVar", "roughLumaK", "ao", "metal", "contrast", "flattenSigma"):
        v = getattr(args, key)
        if v is not None:
            p[key] = v
    if args.mean:
        p["mean"] = [float(x) for x in args.mean.split(",")]
    if args.seamless:
        p["seamless"] = args.seamless
    if args.row_flatten is not None:
        p["rowFlatten"] = args.row_flatten == "on"
    for drop in ("label",):
        p.pop(drop, None)
    return p


def Bake(args):
    presets = json.load(open(PRESETS_PATH, encoding="utf-8"))
    p = ResolveParams(args, presets)
    size = args.size
    data_size = args.data_size or size // 2
    if size & (size - 1) or data_size & (data_size - 1) or size % data_size:
        raise SystemExit("--size / --data-size 必须是 2 的幂，且 size 能被 data-size 整除")
    if not args.name[:1].isupper() or not args.name.isalnum():
        raise SystemExit("--name 必须是 PascalCase 英文（不带 Texture_ 前缀、不带通道后缀、不带下划线）")

    src_rgb, src_alpha = LoadSquare(args.source, size)
    src_srgb = src_rgb
    src_metrics = ToneMetrics(src_srgb)
    lin = SrgbToLinear(src_rgb)
    height_src = None
    if args.height:
        h_rgb, _ = LoadSquare(args.height, size)
        height_src = h_rgb.mean(2)

    sigma = p["flattenSigma"] * size
    if not args.no_flatten:
        lin = FlattenLowFrequency(lin, sigma)

    # 无缝：blend = 半图偏移交叉淡化（土、泥、抹面这类无结构材质）；weld = 只焊四边（砖、瓦、木纹）；none = 源图已无缝
    mode = p["seamless"]
    if mode == "blend":
        guide = HeightFromLuma(lin, size) if height_src is None else NormalizeHeight(height_src)
        t = BlendMask(guide, size)
        lin = ApplyBlend(lin, t)
        if height_src is not None:
            height_src = ApplyBlend(height_src, t)
        if src_alpha is not None:
            src_alpha = ApplyBlend(src_alpha, t)
    elif mode == "weld":
        band = max(8, size // 32)
        lin = WeldEdges(lin, band)
        if height_src is not None:
            height_src = WeldEdges(height_src, band)
        if src_alpha is not None:
            src_alpha = WeldEdges(src_alpha, band)
    elif mode == "courses":
        # 成层材质（砖、瓦）：生成图说「无缝」，上下边往往各切在半层上，焊边会糊出一层双高的砖。
        # 按砖缝周期裁出整数层（从砖缝中心起），拉回正方形（竖向 ≤ 一层的形变），左右再焊边。
        period, rows, n = FindCourses(lin, size, p.get("heightFromLuma") == "invert")
        lin = ResizeRows(lin, rows, size)
        if height_src is not None:
            height_src = ResizeRows(height_src, rows, size)
        if src_alpha is not None:
            src_alpha = ResizeRows(src_alpha, rows, size)
        band = max(8, size // 32)
        lin = WeldEdges1D(lin, band, axis=1)
        if height_src is not None:
            height_src = WeldEdges1D(height_src, band, axis=1)
        print(f"  courses：周期 {period:.1f} px，取 {n} 层（行 {rows[0]:.1f}–{rows[1]:.1f}），竖向缩放 {size / (rows[1] - rows[0]):.3f}")
    elif mode != "none":
        raise SystemExit(f"未知 seamless 模式 {mode}")

    if not args.no_flatten:
        lin = FlattenLowFrequency(lin, sigma)
        if p["rowFlatten"]:
            lin = FlattenRowsAndColumns(lin)

    if args.keep_tone:
        srgb = LinearToSrgb(lin)
    else:
        srgb = MatchTone(lin, p["mean"], p["contrast"], args.tone_strength)

    if height_src is not None:
        height = NormalizeHeight(height_src)
    else:
        height = HeightFromLuma(SrgbToLinear(srgb), size)
        if p.get("heightFromLuma") == "invert":
            height = 1 - height  # 石灰砖缝比砖亮：亮 = 凹
    if args.invert_height:
        height = 1 - height
    normal = NormalFromHeight(height, p["reliefM"], args.tile_m, args.normal_strength, args.normal_convention)
    normal = Downsample(normal, data_size)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    h_small = Downsample(height, data_size)
    k = data_size / 512
    cavity = np.clip(GaussianPeriodic(h_small, 7 * k) - h_small, 0, 1)
    broad = np.clip(GaussianPeriodic(h_small, 28 * k) - GaussianPeriodic(h_small, 3 * k), 0, 1)
    ao = np.clip(1 - p["ao"] * (cavity * 2.6 + broad * 1.2), 0.45, 1)
    lum_small = Downsample(Luma(srgb), data_size)
    lum_dev = (lum_small - lum_small.mean()) / max(float(lum_small.std()), 1e-6)
    rough = (p["rough"] + p["roughVar"] * (h_small - 0.5) * 2 - (1 - ao) * 0.05
             + p["roughLumaK"] * 0.1 * lum_dev)
    rough = np.clip(rough, args.rough_min, 0.99)
    third = np.full_like(ao, p["metal"]) if args.pack == "orm" else h_small

    def U8(a):
        return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)

    channel = "Orm" if args.pack == "orm" else "Orh"
    stem_name = f"Texture_{args.name}"
    out_dir = args.out
    preview_dir = args.preview_dir or os.path.join(PROJECT, "_shots", "TextureBake", args.name)
    if args.dry_run:
        out_dir = preview_dir
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(preview_dir, exist_ok=True)

    if src_alpha is not None and args.keep_alpha:
        base_img = Image.fromarray(np.dstack([U8(srgb), U8(src_alpha)]), "RGBA")
    else:
        base_img = Image.fromarray(U8(srgb))
    norm_img = Image.fromarray(U8(normal * 0.5 + 0.5))
    pack_img = Image.fromarray(U8(np.stack([ao, rough, third], -1)))
    paths = {ch: os.path.join(out_dir, f"{stem_name}{ch}.webp") for ch in ("Base", "Normal", channel)}
    base_img.save(paths["Base"], quality=args.base_quality, method=6, alpha_quality=100)
    data_kw = dict(lossless=True, method=6) if args.data_lossless else dict(quality=args.data_quality, method=6, use_sharp_yuv=True)
    norm_img.save(paths["Normal"], **data_kw)
    pack_img.save(paths[channel], **data_kw)

    # 指标量的是**存盘后**的反照率（有损压缩也算进去）
    saved = np.asarray(Image.open(paths["Base"]).convert("RGB")).astype(np.float64) / 255
    metrics = {**ToneMetrics(saved), **TileMetrics(saved),
               "aoMean": round(float(ao.mean()), 3), "roughMean": round(float(rough.mean()), 3),
               "texelsPerMeter": round(size / args.tile_m, 1)}
    outputs = []
    for ch, path in paths.items():
        with Image.open(path) as im:
            w, h = im.size
        outputs.append({"channel": ch, "file": os.path.basename(path), "width": w, "height": h,
                        "bytes": os.path.getsize(path), "sha256": Sha256(path)})
    total = sum(o["bytes"] for o in outputs)

    WritePreview(saved, normal, pack_img, preview_dir, args.name, args.normal_convention)

    gates = presets["gates"]
    cls = presets["classes"][args.preset]
    problems = CheckGates(metrics, total, outputs, gates, cls)
    record = {
        "generator": GENERATOR,
        "date": datetime.date.today().isoformat(),
        "name": args.name,
        "preset": args.preset,
        "source": {"path": Rel(args.source), "sha256": Sha256(args.source), "metrics": src_metrics},
        "heightSource": ({"path": Rel(args.height), "sha256": Sha256(args.height)} if args.height else None),
        "params": {**p, "tileM": args.tile_m, "size": size, "dataSize": data_size, "pack": args.pack,
                   "normalConvention": args.normal_convention, "normalStrength": args.normal_strength,
                   "toneStrength": args.tone_strength, "keepTone": args.keep_tone, "noFlatten": args.no_flatten,
                   "invertHeight": args.invert_height, "keepAlpha": args.keep_alpha, "roughMin": args.rough_min,
                   "baseQuality": args.base_quality, "dataQuality": args.data_quality,
                   "dataLossless": args.data_lossless},
        "outputs": outputs,
        "totalBytes": total,
        "metrics": metrics,
        "gateProblems": problems,
    }
    record_path = os.path.join(RECORD_DIR, f"{stem_name}.json")
    if not args.dry_run and not args.no_record:
        os.makedirs(RECORD_DIR, exist_ok=True)
        with open(record_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
            f.write("\n")

    print(f"{args.name}: {size}² base / {data_size}² {channel}  total={total} bytes  "
          f"luma={metrics['luma']} std={metrics['lumaStd']} sat={metrics['sat']} "
          f"border={metrics['border']} swing={metrics['swing']} seamRatio={metrics['seamRatio']} "
          f"clip={metrics['clipLow']}/{metrics['clipHigh']} lowFreq={metrics['lowFreq']} (源图 lowFreq={src_metrics['lowFreq']})")
    for o in outputs:
        print(f"  {o['file']:44s} {o['width']}x{o['height']} {o['bytes']:>8d} B")
    print(f"  preview: {Rel(os.path.join(preview_dir, 'Preview_' + args.name + '.png'))}")
    if problems:
        print("  门槛未过（先调参数或重抽源图，别登记）：")
        for p_ in problems:
            print(f"    - {p_}")
    if args.dry_run:
        print("  --dry-run：没有写 Texture/ 与烘焙记录")
    elif not args.no_record:
        print(f"  烘焙记录：{Rel(record_path)}")
        print("  清单条目骨架（贴进 Data_TextureManifest.mjs 的 TEXTURE_MANIFEST，补全来源与消费方）：")
        print(ManifestSnippet(args, channel, outputs, record_path))
    return 1 if problems and args.strict else 0


def Audit(args):
    """--audit：不烘，只量仓库里已有的一套（例如地形层、旧素材），写一份 generator=audit 的记录，
    让门禁对它做同样的 sha256 / 平铺 / 定色核对。源图与参数未知的字段记 null。"""
    presets = json.load(open(PRESETS_PATH, encoding="utf-8"))
    channel = "Orm" if args.pack == "orm" else "Orh"
    stem_name = f"Texture_{args.name}"
    paths = {ch: os.path.join(args.out, f"{stem_name}{ch}.webp") for ch in ("Base", "Normal", channel)}
    paths = {ch: p for ch, p in paths.items() if os.path.exists(p)}
    if "Base" not in paths:
        raise SystemExit(f"找不到 {stem_name}Base.webp")
    saved = np.asarray(Image.open(paths["Base"]).convert("RGB")).astype(np.float64) / 255
    metrics = {**ToneMetrics(saved), **TileMetrics(saved),
               "texelsPerMeter": round(saved.shape[1] / args.tile_m, 1) if args.tile_m else None}
    outputs = []
    for ch, path in paths.items():
        with Image.open(path) as im:
            w, h = im.size
        outputs.append({"channel": ch, "file": os.path.basename(path), "width": w, "height": h,
                        "bytes": os.path.getsize(path), "sha256": Sha256(path)})
    total = sum(o["bytes"] for o in outputs)
    cls = presets["classes"].get(args.preset) if args.preset_given else None
    problems = CheckGates(metrics, total, outputs, presets["gates"], cls) if cls else []
    record = {"generator": "audit", "date": datetime.date.today().isoformat(), "name": args.name,
              "preset": args.preset if cls else None, "source": None, "heightSource": None,
              "params": {"tileM": args.tile_m, "pack": args.pack, "normalConvention": args.normal_convention},
              "outputs": outputs, "totalBytes": total, "metrics": metrics, "gateProblems": problems}
    record_path = os.path.join(RECORD_DIR, f"{stem_name}.json")
    os.makedirs(RECORD_DIR, exist_ok=True)
    with open(record_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{args.name}（audit）: total={total} luma={metrics['luma']} std={metrics['lumaStd']} sat={metrics['sat']} "
          f"border={metrics['border']} swing={metrics['swing']} seamRatio={metrics['seamRatio']} → {Rel(record_path)}")
    for p_ in problems:
        print(f"    - {p_}")
    return 0


def CheckGates(metrics, total, outputs, gates, cls):
    out = []
    lo, hi = cls["lumaRange"]
    if not lo <= metrics["luma"] <= hi:
        out.append(f"亮度 {metrics['luma']} 不在 {cls['lumaRange']}")
    lo, hi = cls["satRange"]
    if not lo <= metrics["sat"] <= hi:
        out.append(f"饱和 {metrics['sat']} 不在 {cls['satRange']}")
    lo, hi = cls["stdRange"]
    if not lo <= metrics["lumaStd"] <= hi:
        out.append(f"亮度标准差 {metrics['lumaStd']} 不在 {cls['stdRange']}")
    # 砖、瓦、木纹成行成列：离边距离上的明暗本来就按砖层起伏，border/swing 对它们没有意义，只看 seamRatio。
    if cls.get("isotropic", True):
        if metrics["border"] < gates["borderMin"]:
            out.append(f"border {metrics['border']} < {gates['borderMin']}（接缝一圈发平/发糊）")
        if metrics["swing"] > gates["swingMax"]:
            out.append(f"swing {metrics['swing']} > {gates['swingMax']}（离边距离上的明暗起伏，平铺成网格）")
    if metrics["seamRatio"] > gates["seamRatioMax"]:
        out.append(f"seamRatio {metrics['seamRatio']} > {gates['seamRatioMax']}（接缝比图内跳得多）")
    if metrics["clipLow"] > gates["clipLowMax"] or metrics["clipHigh"] > gates["clipHighMax"]:
        out.append(f"暗部/高光堆积 {metrics['clipLow']}/{metrics['clipHigh']} > 2%")
    if metrics["lowFreq"] > gates["lowFreqMax"]:
        out.append(f"lowFreq {metrics['lowFreq']} > {gates['lowFreqMax']}（大块明暗 = 烘进去的光影）")
    lo, hi = gates["texelsPerMeter"]
    if metrics["texelsPerMeter"] is not None and not lo <= metrics["texelsPerMeter"] <= hi:
        out.append(f"纹素密度 {metrics['texelsPerMeter']} px/m 不在 [{lo}, {hi}]")
    if total > gates["setBudgetBytes"]:
        out.append(f"整套 {total} B > {gates['setBudgetBytes']} B")
    for o in outputs:
        if o["bytes"] > gates["singleBudgetBytes"]:
            out.append(f"{o['file']} {o['bytes']} B > 单张 {gates['singleBudgetBytes']} B")
    return out


def ManifestSnippet(args, channel, outputs, record_path):
    files = "\n".join(f'      ["{o["file"]}", "{o["channel"]}", {o["width"]}, {o["height"]}],' for o in outputs)
    kind = "terrainLayer" if args.normal_convention == "terrain" else "material"
    conv = '\n    normalConvention: "terrain",' if args.normal_convention == "terrain" else ""
    return f"""  {{
    id: "{args.name}", kind: "{kind}", tier: "level:FirstLevel",
    toneClass: "{args.preset}",
    metersPerTile: {args.tile_m},{conv}
    bake: "_import/Script_BakePbrTexture.py",
    bakeRecord: "{Rel(record_path)}",
    source: {{ provider: "lovart", date: "{datetime.date.today().isoformat()}", ref: "<Lovart thread id>", prompt: "_import/Prompts/Texture_{args.name}.txt" }},
    consumers: [{{ file: "Data_LevelTextureSets.mjs", token: "{args.name}" }}],
    files: [
{files}
    ],
  }},"""


def WritePreview(srgb, normal, pack_img, preview_dir, name, convention):
    """3×3 平铺 | 左上方打光的 3×3 平铺（看法线方向与凹凸）| 法线 | Orm/Orh，各 512 宽。"""
    size = srgb.shape[0]
    tile = np.tile(srgb, (3, 3, 1))
    n_full = np.asarray(Image.fromarray((np.clip(normal * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8))
                        .resize((size, size), Image.BILINEAR)).astype(np.float64) / 255 * 2 - 1
    up = 1 if convention == "gl" else -1
    light = np.array([-0.55, 0.55 * up, 0.63])  # 光从图像左上方来
    light /= np.linalg.norm(light)
    ndl = np.clip((n_full * light[None, None, :]).sum(-1) / light[2], 0, 2)  # 平面 = 1，朝光处 >1
    lit = np.clip(np.tile(srgb * ndl[..., None], (3, 3, 1)), 0, 1)

    def Img(a):
        return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((512, 512), Image.LANCZOS)

    sheet = Image.new("RGB", (2048, 512))
    sheet.paste(Img(tile), (0, 0))
    sheet.paste(Img(lit), (512, 0))
    sheet.paste(Img(normal * 0.5 + 0.5), (1024, 0))
    sheet.paste(pack_img.convert("RGB").resize((512, 512), Image.LANCZOS), (1536, 0))
    sheet.save(os.path.join(preview_dir, f"Preview_{name}.png"))


def ParseArgs(argv):
    ap = argparse.ArgumentParser(description="源反照率 → Texture_<Name>{Base,Normal,Orm|Orh}.webp + 烘焙记录")
    ap.add_argument("--source", help="源反照率（任意尺寸；非方图取中心正方形）")
    ap.add_argument("--name", help="DescriptivePascalCase，不带 Texture_ 前缀与通道后缀")
    ap.add_argument("--preset", default="drySoil", help="材质类：见 _import/Data_TextureBakePresets.json 的 classes")
    ap.add_argument("--tile-m", type=float, help="一张图在世界里覆盖多少米（平铺边长）；UV 贴图件填它在模型上的等效米数")
    ap.add_argument("--height", help="另给一张高度图（白高黑低）；不给就从亮度带通推")
    ap.add_argument("--invert-height", action="store_true", help="高度取反（源图里凹处反而亮时用）")
    ap.add_argument("--mean", help="覆盖预设目标 sRGB 均值，如 0.36,0.36,0.35")
    ap.add_argument("--contrast", type=float, help="覆盖预设目标亮度标准差")
    ap.add_argument("--tone-strength", type=float, default=1.0, help="定色力度 0..1（1 = 完全拉到目标）")
    ap.add_argument("--keep-tone", action="store_true", help="不定色（源图已经是标定过的反照率时）")
    ap.add_argument("--reliefM", "--relief-m", dest="reliefM", type=float, help="高度 0..1 对应多少米起伏（法线斜率按米算）")
    ap.add_argument("--normal-strength", type=float, default=1.0, help="法线斜率再乘一个系数")
    ap.add_argument("--normal-convention", choices=("gl", "terrain"), default="gl")
    ap.add_argument("--rough", type=float, help="粗糙度基值")
    ap.add_argument("--roughVar", "--rough-var", dest="roughVar", type=float, help="随高度的粗糙度起伏（凸处更糙）")
    ap.add_argument("--roughLumaK", "--rough-luma-k", dest="roughLumaK", type=float, help="随亮度的粗糙度（湿泥：暗处更光滑）")
    ap.add_argument("--rough-min", type=float, default=0.3, help="粗糙度下限")
    ap.add_argument("--ao", type=float, help="腔体 AO 强度（0 = 不压）")
    ap.add_argument("--metal", type=float, help="金属度常数（Orm 的 B）")
    ap.add_argument("--pack", choices=("orm", "orh"), default="orm", help="orm：R=AO G=粗糙 B=金属；orh：B=高度（地形/壕沟数组）")
    ap.add_argument("--size", type=int, default=1024, help="Base 边长（2 的幂，≤1024；2048 须在清单写 sizeReason）")
    ap.add_argument("--data-size", type=int, default=0, help="Normal / Orm 边长（默认 size/2）")
    ap.add_argument("--seamless", choices=("blend", "weld", "courses", "none"), help="覆盖预设的无缝方式（courses：按砖缝周期裁整层，砖墙用）")
    ap.add_argument("--row-flatten", choices=("on", "off"), help="覆盖预设的行列拉平（砖/瓦/木纹要 off）")
    ap.add_argument("--flattenSigma", "--flatten-sigma", dest="flattenSigma", type=float, help="低频拉平 σ（相对边长的比例）")
    ap.add_argument("--no-flatten", action="store_true", help="跳过低频与行列拉平")
    ap.add_argument("--keep-alpha", action="store_true", help="源图带 alpha 时保留进 Base（镂空件）")
    ap.add_argument("--base-quality", type=int, default=86)
    ap.add_argument("--data-quality", type=int, default=90)
    ap.add_argument("--data-lossless", action="store_true", help="Normal / Orm 存无损（POM 高度、要精确的遮罩）")
    ap.add_argument("--out", default=os.path.join(PROJECT, "Texture"))
    ap.add_argument("--preview-dir", default="")
    ap.add_argument("--dry-run", action="store_true", help="只出到 _shots/TextureBake/<Name>/，不写 Texture/、不写记录")
    ap.add_argument("--no-record", action="store_true")
    ap.add_argument("--strict", action="store_true", help="门槛未过时退出码 1")
    ap.add_argument("--rebake", help="按烘焙记录原样重烘（源图须仍在记录的路径且 sha256 一致）")
    ap.add_argument("--audit", action="store_true",
                    help="不烘：量 Texture/ 里已有的 Texture_<Name>{Base,Normal,Orm|Orh}.webp，写 generator=audit 的记录")
    args = ap.parse_args(argv)
    args.preset_given = any(a == "--preset" or a.startswith("--preset=") for a in argv)
    if args.audit:
        if not args.name:
            ap.error("--audit 需要 --name")
        return args
    if args.rebake:
        rec = json.load(open(args.rebake, encoding="utf-8"))
        prm = rec["params"]
        src = rec["source"]["path"]
        src = src if os.path.isabs(src) else os.path.join(PROJECT, src)
        if not os.path.exists(src) or Sha256(src) != rec["source"]["sha256"]:
            raise SystemExit(f"源图不在或已变：{src}（记录 sha256 {rec['source']['sha256'][:12]}…）")
        argv2 = ["--source", src, "--name", rec["name"], "--preset", rec["preset"], "--tile-m", str(prm["tileM"]),
                 "--size", str(prm["size"]), "--data-size", str(prm["dataSize"]), "--pack", prm["pack"],
                 "--normal-convention", prm["normalConvention"], "--normal-strength", str(prm["normalStrength"]),
                 "--tone-strength", str(prm["toneStrength"]), "--mean", ",".join(str(v) for v in prm["mean"]),
                 "--contrast", str(prm["contrast"]), "--reliefM", str(prm["reliefM"]), "--rough", str(prm["rough"]),
                 "--roughVar", str(prm["roughVar"]), "--roughLumaK", str(prm["roughLumaK"]), "--ao", str(prm["ao"]),
                 "--metal", str(prm["metal"]), "--seamless", prm["seamless"],
                 "--row-flatten", "on" if prm["rowFlatten"] else "off", "--flattenSigma", str(prm["flattenSigma"]),
                 "--rough-min", str(prm["roughMin"]), "--base-quality", str(prm["baseQuality"]),
                 "--data-quality", str(prm["dataQuality"])]
        for flag, key in (("--keep-tone", "keepTone"), ("--no-flatten", "noFlatten"), ("--invert-height", "invertHeight"),
                          ("--keep-alpha", "keepAlpha"), ("--data-lossless", "dataLossless")):
            if prm.get(key):
                argv2.append(flag)
        if rec.get("heightSource"):
            hs = rec["heightSource"]["path"]
            argv2 += ["--height", hs if os.path.isabs(hs) else os.path.join(PROJECT, hs)]
        return ParseArgs(argv2)
    if not args.source or not args.name or args.tile_m is None:
        ap.error("--source、--name、--tile-m 必填（或用 --rebake）")
    return args


if __name__ == "__main__":
    # Windows 控制台默认 GBK：中文与「²」会让 print 抛 UnicodeEncodeError（不设 PYTHONUTF8 也能跑）。
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parsed = ParseArgs(sys.argv[1:])
    sys.exit(Audit(parsed) if parsed.audit else Bake(parsed))

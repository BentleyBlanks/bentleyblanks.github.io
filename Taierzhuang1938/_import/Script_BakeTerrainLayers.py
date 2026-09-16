"""把生成的地形反照率烘成分层地形材质要的三张图（Base / Normal / Orh）。

用法（仓库根执行）：
    python Taierzhuang1938/_import/Script_BakeTerrainLayers.py \
        --source Taierzhuang1938/_shots/TerrainLayers/Source

源图：底土取仓库现有的 Texture/Texture_MissionSoilBase.webp（层表 source 字段）；其余三层是
1024² 的俯视反照率 Gen_<Layer>.png（Lovart 生成，提示词与来源见 docs/Data_TerrainLayers.md）。源图只留本地忽略目录，不进仓库；进仓库的是本脚本
和它产出的 Texture/Texture_Terrain<Layer>{Base,Normal,Orh}.webp。

为什么只生成反照率、其余几张自己推：法线 / AO / 粗糙度 / 高度都从同一张高度场
推出来，四张图逐像素对齐，而且法线的坐标约定由这里定死（见 NormalFromHeight），
着色器那边不用猜 OpenGL / DirectX、也不用猜 flipY。

每层做六件事，顺序不能换：
  1. 低频拉平 —— 按周期边界（FFT）求 σ≈90 px 的低通，逐通道除掉。一张图在地形上
     重复几百遍，图内哪怕 3% 的明暗斑，远处都会排成网格（第一关原来的「马赛克」
     一半就是这个）。
  2. 无缝 —— 半图偏移的交叉淡化；过渡带的掩码按两份高度的差来切，交界是一团团
     土块的形状，不是一条半透明的叠影带。
  2b. 行列拉平 —— 逐行、逐列均值除以自身的滑动平均（见 FlattenRowsAndColumns）。
  3. 定色 —— 按层表把均值与对比度拉到目标值（sRGB 空间均值）。目标值按旧地面
     「贴图 × 顶点色」在画面上的实际亮度与色相定（旧地面线性空间 b/g ≈ 0.5），
     换材质不许让整个画面变亮变暗。第一版按生成图原色取 b/g ≈ 0.65，天光一照
     整片地发灰发蓝，实拍比旧地面亮 12%——色相与亮度两样都要对齐。
  4. 高度 —— 亮度的两档带通（细颗粒 + 土块）归一化到 0..1。
  5. 法线 / AO / 粗糙度 —— 全部从高度推。
"""
import argparse
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
SIZE = 1024
# 法线与 Orh 半分辨率：一层 2.6 m 平铺下 512 px 仍是 5 mm 一个纹素，而下载量少一半多
# （Pages 线上 0.5 MB/s，见 docs/Data_TerrainLayers.md 的体积账）。反照率保持 1024。
DATA_SIZE = 512

# tileM 必须与 Data_Tuning_Terrain.TERRAIN_SETS.MissionPlain 同步（法线斜率按米算）。
LAYERS = {
    # 底土沿用仓库里已经在用的第一关土壤图（Texture_MissionSoilBase.webp，2026-09-16 imagegen），
    # 只重做无缝、低频拉平与法线/AO/粗糙度。它近看有卵石和草梗，比新生成的细土耐看；
    # 远处的马赛克是平铺方式的问题，不是这张图的问题。
    "FieldSoil": dict(source="Texture/Texture_MissionSoilBase.webp", tileM=2.0,
                      mean=(0.416, 0.362, 0.268), contrast=0.100, reliefM=0.016,
                      rough=0.91, roughVar=0.05, ao=0.42),
    "CartTrack": dict(tileM=3.1, mean=(0.478, 0.433, 0.352), contrast=0.072, reliefM=0.007,
                      rough=0.84, roughVar=0.06, ao=0.30),
    "DryStubble": dict(tileM=2.3, mean=(0.414, 0.369, 0.260), contrast=0.098, reliefM=0.018,
                       rough=0.94, roughVar=0.04, ao=0.55),
    "SpoilEarth": dict(tileM=2.1, mean=(0.342, 0.284, 0.220), contrast=0.090, reliefM=0.032,
                       rough=0.87, roughVar=0.07, ao=0.62),
}


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


def Luminance(lin):
    return lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722


def FlattenLowFrequency(lin, sigma=90):
    low = GaussianPeriodic(lin, sigma)
    mean = lin.mean((0, 1), keepdims=True)
    return np.clip(lin * mean / np.maximum(low, 1e-4), 0, 1)


def FlattenRowsAndColumns(lin, window=21):
    """逐行 / 逐列的均值拉平（可分离，周期边界）。

    平铺后最显眼的是**整行整列**的明暗：一行略暗的像素重复几百遍就是一条横纹。
    σ 90 的低通管不到比它窄的带子（交叉淡化带、源图自带的扫描条纹都在 20–60 px 量级），
    这里把行均值、列均值各自对一个 21 px 的周期滑动平均取比值再除掉，只动一维带状分量。
    """
    lum = Luminance(lin)
    mean = lum.mean()

    def Ratio(profile):
        padded = np.concatenate([profile[-window:], profile, profile[:window]])
        kernel = np.ones(window) / window
        smooth = np.convolve(padded, kernel, mode="same")[window:-window]
        # 保留比窗口更宽的缓变（上一步低通已处理），只拉平窄带
        return np.maximum(profile, 1e-4) / np.maximum(smooth, 1e-4) * (smooth / mean)

    rows = Ratio(lum.mean(1))
    lin = lin / rows[:, None, None]
    cols = Ratio(Luminance(lin).mean(0))
    return np.clip(lin / cols[None, :, None], 0, 1)


def HeightFrom(lin):
    lum = Luminance(lin)
    fine = GaussianPeriodic(lum, 1.2) - GaussianPeriodic(lum, 6)
    clod = GaussianPeriodic(lum, 5) - GaussianPeriodic(lum, 38)
    h = 0.45 * fine / max(fine.std(), 1e-6) + 0.55 * clod / max(clod.std(), 1e-6)
    lo, hi = np.percentile(h, 0.8), np.percentile(h, 99.2)
    return np.clip((h - lo) / max(hi - lo, 1e-6), 0, 1)


def MakeSeamless(lin, band=150, seed=7):
    """半图偏移 + 按高度切的交叉淡化。返回边缘可无缝平铺的图。

    两处都是为了不在图边留下一圈「更平滑的带子」（平铺后那就是一张网格）：
      · 掩码几乎是二值的，边界沿一张中尺度噪声的等值线走；高度差只轻轻推一把
        （让交界多少顺着土块边缘）。**不能让高度差主导**：「谁高谁在上」等于
        在过渡带里挑亮的那份，实测带子整体亮 4%，平铺后就是一圈亮框；
      · 剩下那一窄条真正混合的像素走方差保持混合（Heitz & Neyret 2018）：
        两张不相关的纹理线性平均，对比度会掉到 1/√2，(a·t + b·(1-t)) 要除以
        √(t² + (1-t)²) 再加回均值。
    """
    h, w = lin.shape[:2]
    shifted = np.roll(lin, (h // 2, w // 2), (0, 1))
    ha, hb = HeightFrom(lin), HeightFrom(shifted)
    y = np.arange(h)[:, None]
    x = np.arange(w)[None, :]
    edge = np.minimum(np.minimum(x, w - 1 - x), np.minimum(y, h - 1 - y)).astype(float)
    # 离边缘 band 像素以内逐渐交给偏移图（它的边缘是原图的中心，天然连续）。
    rng = np.random.default_rng(seed)
    wobble = GaussianPeriodic(rng.standard_normal((h, w)), 22)
    wobble /= max(np.abs(wobble).max(), 1e-6)
    t = np.clip(edge / band + wobble * 0.3, 0, 1)
    t = np.clip((t - 0.5) * 7.0 + 0.5 + (ha - hb) * 0.6, 0, 1)
    t = t * t * (3 - 2 * t)
    mean = lin.mean((0, 1), keepdims=True)
    tt = t[..., None]
    mixed = (lin - mean) * tt + (shifted - mean) * (1 - tt)
    mixed /= np.sqrt(tt * tt + (1 - tt) ** 2)
    return np.clip(mixed + mean, 0, 1)


def EdgeBrightnessSwing(srgb):
    """亮度按「离图边距离」的剖面：最亮一档与最暗一档之差（相对均值）。平铺后它就是网格。"""
    lum = srgb.mean(2)
    n = lum.shape[0]
    d = np.minimum(np.arange(n), n - 1 - np.arange(n))
    rows, cols = lum.mean(1), lum.mean(0)
    prof = np.array([(rows[(d >= k) & (d < k + 16)].mean() + cols[(d >= k) & (d < k + 16)].mean()) / 2
                     for k in range(0, n // 2, 16)])
    return float((prof.max() - prof.min()) / lum.mean())


def BorderContrastRatio(srgb, width=48):
    """边缘带（平铺后就是接缝两侧）与图内部的局部对比度之比。1.0 = 看不出网格。"""
    lum = srgb.mean(2)
    detail = lum - GaussianPeriodic(lum, 3)
    local = np.sqrt(GaussianPeriodic(detail * detail, 6))
    rows = local.mean(1)
    cols = local.mean(0)
    n = len(rows)
    border = np.concatenate([rows[:width], rows[n - width:], cols[:width], cols[n - width:]])
    inner = np.concatenate([rows[n // 4: 3 * n // 4], cols[n // 4: 3 * n // 4]])
    # 取最弱的那几行：一条细带子就足以在远处排成网格
    return float(np.percentile(border, 5) / np.median(inner))


def MatchTone(lin, mean_srgb, contrast):
    """把 sRGB 空间的均值与亮度标准差拉到目标。"""
    srgb = LinearToSrgb(lin)
    lum = srgb.mean(2, keepdims=True)
    dev = srgb - srgb.mean((0, 1), keepdims=True)
    scale = contrast / max(float(lum.std()), 1e-6)
    out = np.asarray(mean_srgb)[None, None, :] + dev * scale
    return np.clip(out, 0, 1)


def Downsample(a):
    f = a.shape[0] // DATA_SIZE
    if f <= 1:
        return a
    shape = (DATA_SIZE, f, DATA_SIZE, f) + a.shape[2:]
    return a.reshape(shape).mean((1, 3))


def NormalFromHeight(height, relief_m, tile_m):
    """切线空间法线。**约定**：x = -dh/d列（图像向右），y = -dh/d行（图像向下）。

    着色器按 uv = 世界 (x, z) / 平铺米数 采样、纹理 flipY = false，于是图像向右 = 世界 +X、
    图像向下 = 世界 +Z，扰动向量直接是 vec3(n.x, 0, n.y)。存储：rgb = n * 0.5 + 0.5。
    """
    px = tile_m / height.shape[1]
    hm = height * relief_m
    gx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) / (2 * px)
    gy = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) / (2 * px)
    n = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def Bake(name, spec, source_dir, out_dir, preview_dir):
    path = os.path.join(PROJECT, spec["source"]) if spec.get("source") else os.path.join(source_dir, f"Gen_{name}.png")
    src = Image.open(path).convert("RGB")
    if src.size != (SIZE, SIZE):
        side = min(src.size)
        left, top = (src.size[0] - side) // 2, (src.size[1] - side) // 2
        src = src.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
    lin = SrgbToLinear(np.asarray(src).astype(np.float64) / 255)
    lin = FlattenLowFrequency(lin)
    lin = MakeSeamless(lin)
    lin = FlattenLowFrequency(lin)
    lin = FlattenRowsAndColumns(lin)
    srgb = MatchTone(lin, spec["mean"], spec["contrast"])
    height = HeightFrom(SrgbToLinear(srgb))
    normal = NormalFromHeight(height, spec["reliefM"], spec["tileM"])
    # 先在全分辨率上推法线再下采样（面积平均后重新归一化）：直接在 512 的高度上求导
    # 会丢掉一半细颗粒的坡度。
    normal = Downsample(normal)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    height_full = height
    height = Downsample(height)
    # 腔体遮蔽：比周围低多少，按层给强度；下限 0.45 防止远处整片发黑。
    cavity = np.clip(GaussianPeriodic(height, 7) - height, 0, 1)
    broad = np.clip(GaussianPeriodic(height, 28) - GaussianPeriodic(height, 3), 0, 1)
    ao = np.clip(1 - spec["ao"] * (cavity * 2.6 + broad * 1.2), 0.45, 1)
    rough = np.clip(spec["rough"] + spec["roughVar"] * (height - 0.5) * 2 - (1 - ao) * 0.05, 0.6, 0.99)

    def U8(a):
        return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)

    base = Image.fromarray(U8(srgb))
    norm = Image.fromarray(U8(normal * 0.5 + 0.5))
    orh = Image.fromarray(U8(np.stack([ao, rough, height], -1)))
    stem = os.path.join(out_dir, f"Texture_Terrain{name}")
    base.save(f"{stem}Base.webp", quality=84, method=6)
    norm.save(f"{stem}Normal.webp", quality=90, method=6, use_sharp_yuv=True)
    orh.save(f"{stem}Orh.webp", quality=90, method=6, use_sharp_yuv=True)
    if preview_dir:
        tile = Image.new("RGB", (SIZE * 3, SIZE * 3))
        for i in range(3):
            for j in range(3):
                tile.paste(base, (i * SIZE, j * SIZE))
        tile.resize((1024, 1024), Image.LANCZOS).save(os.path.join(preview_dir, f"Tile3x3_{name}.png"))
    sizes = {k: os.path.getsize(f"{stem}{k}.webp") for k in ("Base", "Normal", "Orh")}
    seam = float(np.abs(srgb[:, 0] - srgb[:, -1]).mean())
    border = BorderContrastRatio(srgb)
    swing = EdgeBrightnessSwing(srgb)
    interior = float(np.abs(srgb[:, 511] - srgb[:, 512]).mean())
    print(f"{name:11s} mean={srgb.mean((0, 1)).round(3)} seamLR={seam:.4f} interior={interior:.4f} border={border:.3f} swing={swing:.3f} "
          f"ao={ao.mean():.3f} rough={rough.mean():.3f} h={height_full.mean():.3f} bytes={sizes} total={sum(sizes.values())}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=os.path.join(PROJECT, "_shots", "TerrainLayers", "Source"))
    parser.add_argument("--out", default=os.path.join(PROJECT, "Texture"))
    parser.add_argument("--preview", default=os.path.join(PROJECT, "_shots", "TerrainLayers", "Preview"))
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    os.makedirs(args.preview, exist_ok=True)
    for name, spec in LAYERS.items():
        if args.only and name not in args.only.split(","):
            continue
        Bake(name, spec, args.source, args.out, args.preview)


if __name__ == "__main__":
    main()

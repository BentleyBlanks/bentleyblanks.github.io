"""把出川车厢那几套 PBR 从 1254px PNG 压成 512px WebP。

**为什么要压。** 车厢这三套是全项目唯一没走 `BuildWeaponPbr.build()` 的贴图：
imagegen 出的 1254×1254 直接以 PNG 接进了 `Script_Main` 的开机加载表，而别的
四十多套一律是 512×512 WebP。代价不是"多几百 KB"——是**开机路径上 28 MB**
（一共 39 MB，这几张占 71%），而开机那一步是全流程唯一没法跳过的等待。

**为什么 512 够。** 这几套是**按世界尺寸平铺**的：`Script_Cutscene._MakeProp`
拿 `TILE_BY_RECIPE` 决定一张图铺几米，木料是 `TILE_METERS.wood`＝1 m，
地板/顶棚没登记走默认的 1.0 m。也就是说一张图只覆盖一平方米，512px 就是
每米 512 个纹素——玩家把脸贴到长凳上也超过屏幕像素密度了。1254px 是
每米 1254 个纹素，多出来的部分在任何机位上都采样不到，只是白背在网上。

**为什么从 PNG 压而不是重新 derive。** `BuildWeaponPbr.build()` 是从一张 base
现推法线与 ORM 的，而车厢这三套的法线/ORM 是随 base 一起出的、比推出来的丰富，
现在屏幕上那一版（美术审过的）就是它们。重推等于换一套贴图，把已经调好的
车厢重打一遍光。所以这里只做一件事：**降采样**。

（`BuildWeaponPbr` 原来也挂着一条 `build_if_source("CarriageBenchWood")`，
但它要的 `Source/Texture_CarriageBenchWoodSource.png` 不在仓库里、从来没触发；
已经摘掉，免得将来源图一回来就把这里的产物顶掉——一张图只许有一个生产者。）

法线降采样之后长度略小于 1，不额外归一化：three 的 `normal_fragment_maps`
本来就对采样结果做 normalize，而 `BuildWeaponPbr` 同样没做——两边保持一致。

用法：python Taierzhuang1938/_import/Script_BakeCarriagePbr.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TEXTURE = ROOT / "Texture"
# 1254px 的原图**不放在 Texture/ 里**：那个目录是线上直接服的，源图摆在里面
# 迟早又被谁接回加载表（这次就是这么来的）。挪到 _import/Source 与别的源素材作伴。
SOURCE = ROOT / "_import" / "Source" / "Texture_CarriagePbr"

# 目标边长。与 BuildWeaponPbr.build() 的 512 一致 —— 全项目一个口径。
SIZE = 512
# 质量档同样抄 BuildWeaponPbr：base 90、法线与 ORM 92（这两张的带状伪影更显眼）。
QUALITY = {"Base": 90, "Normal": 92, "Orm": 92}

# **不含 CarriageWallSteel**：那一套在 Data_CutsceneChuchuan 里一次都没被 mat 引用
# （端墙实测渲成纯黑之后已经改走 WoodStock/Adobe，只剩一条注释记着这件事），
# 却仍旧每次开机下 6.5 MB。已经从 Script_Main 的加载表里摘掉。
STEMS = ("CarriageBenchWood", "CarriageFloorSteel", "CarriageCeilingSteel")


def bake(stem: str) -> None:
    for channel, quality in QUALITY.items():
        source = SOURCE / f"Texture_{stem}{channel}.png"
        if not source.is_file():
            print(f"skip {source.name}（没有这张 PNG）")
            continue
        image = Image.open(source).convert("RGB")
        small = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        target = TEXTURE / f"Texture_{stem}{channel}.webp"
        small.save(target, "WEBP", quality=quality, method=6)
        print(f"{source.name} {image.size[0]}px {source.stat().st_size / 1e6:.2f} MB"
              f"  →  {target.name} {SIZE}px {target.stat().st_size / 1e6:.3f} MB")


if __name__ == "__main__":
    for stem in STEMS:
        bake(stem)

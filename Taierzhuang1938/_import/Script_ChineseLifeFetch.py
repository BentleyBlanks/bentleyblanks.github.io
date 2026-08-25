# -*- coding: utf-8 -*-
"""下载「中式生活道具包」的 Sketchfab 源模型（1938 鲁南县城的家什）。

**这个文件不是给命令行直接跑的**，它跑在那台常驻 Blender 里：

    python Taierzhuang1938/_import/SketchfabBridge.py runpy \
        Taierzhuang1938/_import/Script_ChineseLifeFetch.py

理由与 SketchfabFetchInner.py 一样 —— Sketchfab 的 API key 存在 BlenderMCP
插件的偏好里，只有插件所在的那个 Python 环境拿得到。走 `runpy` 而**不是**桥的
`download` 命令：后者会把模型 import 进那台活 Blender 的场景，把别人正在改的
文件搅乱；这里只做「请求下载链接 → 解 zip 到 Source/」，一个 bpy 的场景 API
都不碰。

每个源目录里额外落一份 `license.txt`（标题 / 作者 / 许可 / UID / 原始面数），
它是 Data_SourceLicenses.md 的原始凭据 —— 只要 CC0 与 CC-BY，NC/ND 在下面的
清单里就不该出现，脚本仍会再校一次并拒掉。
"""

import io
import json
import os
import zipfile

import requests

# --- 找 BlenderMCP 插件存着的 Sketchfab API key ------------------------------
key = ""
prefs = bpy.context.preferences.addons.get("blender_mcp")          # noqa: F821
if prefs is not None:
    key = getattr(prefs.preferences, "sketchfab_api_key", "") or ""
if not key:
    key = getattr(bpy.context.scene, "blendermcp_sketchfab_api_key", "") or ""  # noqa: F821
if not key:
    key = os.getenv("BLENDERMCP_SKETCHFAB_API_KEY", "") or ""
if not key:
    raise RuntimeError("Sketchfab API key not found in addon prefs/scene/env")

BASE = (r"C:\Users\Bentl\Documents\Program\bentleyblanks.github.io\.claude"
        r"\worktrees\county-town-scene-details-4bede6\Taierzhuang1938\_import\Source")

# (uid, 目录名) —— 烘焙时从每个源里取哪些节点见 Script_ChineseLifeBake.py。
#
# **贴图一律不落盘**（见下面的 SKIP_TEXTURES）：这一层的运行时材质是游戏自己
# 烘的那套配方，源包的 2K/4K PBR 一张都用不上。不是省事，是省仓库 —— 原样解压
# 的话光是石井台与木桶两个源就有 95 MB 的 png，而它们的 scene.bin 加起来 1.3 MB。
#
# 取舍（连同被拒的三个源）记在交付报告里，判据只有一条：**样式存疑的宁可不要**。
#   · Asian Shop Pack（2f603ad8…）：现代韩国商业街，招牌上有 7-Eleven / 麦当劳
#     / 渣打银行，整包与 1938 无关，下载后当场退掉。
#   · Chinese Millstone（4346e603…）：真是中式石磨，但它是景区实物扫描 ——
#     26 万三角、scene.bin 18 MB，而且磨盘四周连着一圈现代石凳与铺装，
#     得先做几何切除才拿得到磨。换成下面 976 面的 Stone Mill Wheel。
#   · 木水桶（7b4caaba…）：桶本身没问题，但同一轮里另一个工作包正在下 PolyHaven
#     的 WoodenBucket01/02，重复了。
# 找不到可用 CC 源、直接放弃的类别：蓑衣、扁担、纺车（西式踏板纺车不是中式手摇
# 纺车）、鸡笼（搜到的全是欧式木鸡舍）、石碑、灶台铁锅。
MODELS = [
    # 水缸这一类只有实物扫描过关：DAE 的陶坊模型里那批「Color_Pot」全带盖、
    # 六棱、卡通比例，当有盖的坛子还行，当敞口水缸不行（QA 出图取证）。
    ("d00a1cb787314ffb9c5bd9c830e67b94", "Model_SketchfabStorageJarLugged"),        # 带耳陶缸
    ("41af1b457d1047c993e3c96622896b88", "Model_SketchfabStorageJarTall"),          # 高身陶缸
    ("9908305b49f74af2a32bad7240fe1021", "Model_SketchfabStorageJarRound"),         # 圆腹陶缸
    ("04337ff5619b435eaeb606a563e9b481", "Model_SketchfabAncientChinesePottery"),   # 有盖陶坛 + 柴垛 + 条凳
    ("f930b224837145a39b89c95349dd2720", "Model_SketchfabChineseWineJar"),          # 酒坛一组
    ("73b1e60901e6494fb0cb39affca6f850", "Model_SketchfabOldChineseLantern"),       # 布灯笼
    ("d413ef470a42432ba30ece881e6c76a3", "Model_SketchfabChineseSignboard"),        # 店铺匾额
    ("e29fd48add3d471ab0bf25e9ae1213d5", "Model_SketchfabWinnow"),                  # 簸箕
    ("6c7e1244d46c457fb6f3d6194663073b", "Model_SketchfabBambooBasket"),            # 笸箩
    ("38ca1b292f454d6285fe4b024fa06469", "Model_SketchfabLowWoodenBench"),          # 木凉床
    ("885951c7fc0646f4bb5b136475ee2f6c", "Model_SketchfabStoneWell"),               # 只取石井台，弃西式木棚
    ("c4731bab20764f5eb874daf3ff07fcb5", "Model_SketchfabStoneMillWheel"),          # 磨盘
    ("4eed68df8fb84284a91f42a6c6e4569c", "Model_SketchfabAsianConicalHat"),         # 斗笠
]

SKIP_TEXTURES = True
ALLOWED = ("CC0", "CC Attribution", "Public Domain")
HDR = {"Authorization": "Token " + key}
lines = []


def Allowed(label):
    if "NonCommercial" in label or "NoDeriv" in label:
        return False
    return any(label.startswith(prefix) for prefix in ALLOWED)


for uid, folder in MODELS:
    try:
        meta = requests.get("https://api.sketchfab.com/v3/models/%s" % uid,
                            headers=HDR, timeout=120)
        if meta.status_code != 200:
            lines.append("META FAIL %s -> %d %s" % (uid, meta.status_code, meta.text[:200]))
            continue
        info = meta.json()
        label = ((info.get("license") or {}).get("label") or "").strip()
        if not Allowed(label):
            lines.append("REJECT %s: license %r not CC0/CC-BY" % (uid, label))
            continue

        resp = requests.get("https://api.sketchfab.com/v3/models/%s/download" % uid,
                            headers=HDR, timeout=120)
        lines.append("download %s (%s) -> %d" % (folder, uid, resp.status_code))
        if resp.status_code != 200:
            lines.append("  " + resp.text[:300])
            continue
        url = (resp.json().get("gltf") or {}).get("url")
        if not url:
            lines.append("  no gltf url in " + json.dumps(resp.json())[:300])
            continue
        payload = requests.get(url, timeout=900)
        lines.append("  zip %d bytes=%d" % (payload.status_code, len(payload.content)))
        if payload.status_code != 200:
            continue

        dest = os.path.join(BASE, folder)
        os.makedirs(dest, exist_ok=True)

        with zipfile.ZipFile(io.BytesIO(payload.content)) as zf:
            for item in zf.infolist():
                arc = item.filename.replace("\\", "/")
                target = os.path.normpath(os.path.join(dest, arc))
                if not target.startswith(os.path.normpath(dest)):
                    lines.append("  skipped traversal entry: " + arc)
                    continue
                if item.is_dir():
                    continue
                if SKIP_TEXTURES and arc.lower().startswith("textures/"):
                    continue
                parent = os.path.dirname(target)
                if parent:
                    os.makedirs(parent, exist_ok=True)
                with zf.open(item) as src, open(target, "wb") as dst:
                    dst.write(src.read())
                lines.append("  wrote %s (%d bytes)" % (arc, item.file_size))

        # 这一份**必须在解压之后写**：zip 根目录里自带一个 license.txt（Sketchfab
        # 生成的官方署名段落），先写就会被它覆盖掉 —— 第一轮就是这么丢的。
        # 两份并存，与 Model_SketchfabBattlefieldPack 的既有约定一致：
        # license.txt = 上游原件，License_SketchfabSource.txt = 管线自己的凭据。
        with open(os.path.join(dest, "License_SketchfabSource.txt"), "w", encoding="utf-8") as fh:
            fh.write("title:   %s\n" % info.get("name"))
            fh.write("author:  %s (%s)\n" % ((info.get("user") or {}).get("displayName"),
                                             (info.get("user") or {}).get("username")))
            fh.write("license: %s\n" % label)
            fh.write("uid:     %s\n" % uid)
            fh.write("page:    %s\n" % info.get("viewerUrl"))
            fh.write("source:  %d faces / %d vertices (as published)\n"
                     % (info.get("faceCount") or 0, info.get("vertexCount") or 0))
            fh.write("use:     Taierzhuang1938 Model_ChineseLifeSet.glb"
                     " (decimated, source textures dropped)\n")
    except Exception as error:                                        # noqa: BLE001
        lines.append("  ERROR %s: %s" % (uid, error))

print("DONE\n" + "\n".join(lines))

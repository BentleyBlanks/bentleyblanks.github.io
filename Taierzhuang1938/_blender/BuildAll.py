# -*- coding: utf-8 -*-
"""跑通整条流水线：程序化建模 → 三角预算断言 → 写 Model/*.tzm.json → 写清单。

用法（Windows）：
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background \
      --python Taierzhuang1938/_blender/BuildAll.py -- --out Taierzhuang1938/Model

无头模式下 Blender 不认相对导入，所以第一件事是把本脚本所在目录塞进 sys.path。
每建完一个模型就 ResetScene()：布尔与减面借用了 bpy 的对象，不扫干净的话
下一个模型的 depsgraph 里还挂着上一个的残骸，布尔会算到别人的几何上去。
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from TzmCore import FLIPPED, ResetScene, WriteTzm      # noqa: E402
import BuildSoldiers                 # noqa: E402
import BuildWeapons                  # noqa: E402
import BuildProps                    # noqa: E402

# 三角预算。超了不是警告是**失败** —— 换模最容易翻车的就是这里，
# 一旦放行，同屏 24 人的 draw call / triangle 红线当场击穿。
BUDGET = {"soldier": 1800, "weapon": 900, "prop": 400}

# 武器全长（米），抄自 Data_Weapons.mjs 的 lengthM，**是史实数据，不许为了好看改**。
# 断言的是模型在 Z 上的实际跨度 —— 它一次就逮出了汉阳造的套筒建到枪口前头去、
# 顺带把那一段的面全朝里翻了的 bug。容差 20 mm 留给准星护翼和枪托底板的圆角。
WEAPON_LENGTH = {
    "ZhongZheng": 1.110, "HanYang": 1.250, "Zb26": 1.165, "Type38": 1.276,
    "Mauser96": 0.288, "Grenade": 0.220, "Dadao": 0.900,
}
LENGTH_TOLERANCE = 0.020

# 士兵身高（米）：模型在 Y 上从脚底到头顶（含帽/盔）的跨度应当接近它。
SOLDIER_HEIGHT = {"SoldierNra": 1.66, "SoldierIja": 1.62}
HEIGHT_TOLERANCE = 0.070


def OutDir():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    for i, a in enumerate(argv):
        if a == "--out" and i + 1 < len(argv):
            return os.path.abspath(argv[i + 1])
    return os.path.abspath(os.path.join(HERE, "..", "Model"))


def main():
    out = OutDir()
    os.makedirs(out, exist_ok=True)
    manifest = []
    failures = []

    jobs = []
    jobs.append(("SoldierNra", "soldier", BuildSoldiers.BuildNraSoldier,
                 "国民革命军第 2 集团军第 31 师步兵：布军帽 + 青天白日帽徽、灰蓝土布军装、"
                 "斜挎布子弹带（大部分格子瘪着）、绑腿、草鞋或布鞋。无钢盔。"))
    jobs.append(("SoldierIja", "soldier", BuildSoldiers.BuildIjaSoldier,
                 "日军濑谷支队步兵：立领昭五式 + 步兵红领章、九〇式钢盔（正面五角星）、"
                 "皮弹药盒三只、编上靴 + 脚绊。1938 年 3—4 月无屁帘。"))
    for name, builder in BuildWeapons.WEAPON_BUILDERS.items():
        jobs.append((name, "weapon", builder, ""))
    for name, builder in BuildProps.PROP_BUILDERS.items():
        jobs.append((name, "prop", builder, ""))

    for name, category, builder, notes in jobs:
        ResetScene()
        FLIPPED.clear()
        built = builder()
        root = built[0] if isinstance(built, tuple) else built
        path = os.path.join(out, name + ".tzm.json")
        tris, blocks, size = WriteTzm(root, path, name, notes)
        limit = BUDGET[category]
        ok = tris <= limit
        if not ok:
            failures.append("%s 三角超预算：%d > %d" % (name, tris, limit))
        joints = 0
        mounts = []
        with open(path, "r", encoding="utf-8") as handle:
            doc = json.load(handle)

        bmin, bmax = doc["bounds"]["min"], doc["bounds"]["max"]
        if name in WEAPON_LENGTH:
            span = bmax[2] - bmin[2]
            want = WEAPON_LENGTH[name]
            if abs(span - want) > LENGTH_TOLERANCE:
                ok = False
                failures.append("%s 全长对不上史实：%.3f m ≠ %.3f m" % (name, span, want))
        if name in SOLDIER_HEIGHT:
            span = bmax[1] - bmin[1]
            want = SOLDIER_HEIGHT[name]
            if abs(span - want) > HEIGHT_TOLERANCE:
                ok = False
                failures.append("%s 身高对不上：%.3f m ≠ %.3f m" % (name, span, want))
            if abs(bmin[1]) > 0.02:
                ok = False
                failures.append("%s 脚底没落在 y=0：%.3f" % (name, bmin[1]))
        for node in doc["nodes"]:
            if node.get("joint"):
                joints += 1
            if not node.get("meshes"):
                mounts.append(node["name"])
        materials = sorted({m["material"] for m in doc["meshes"]})
        manifest.append({
            "name": name, "category": category, "file": name + ".tzm.json",
            "triangles": tris, "meshBlocks": blocks, "nodes": len(doc["nodes"]),
            "joints": joints, "bytes": size, "materials": materials,
            "mounts": mounts, "bounds": doc["bounds"],
        })
        print("%-4s %-16s %-8s tris=%-5d blocks=%-3d nodes=%-3d joints=%-3d %6.1f KB  mats=%s"
              % ("ok" if ok else "FAIL", name, category, tris, blocks,
                 len(doc["nodes"]), joints, size / 1024.0, ",".join(materials)))
        # 翻面体检的战果。**这里有内容不是好消息**：说明某个建模原语的绕向写反了，
        # 兜底给你救回来了，但根子在原语上，去那儿修。
        if FLIPPED:
            print("     翻面兜底：" + "  ".join(FLIPPED))

    index_path = os.path.join(out, "Index.json")
    with open(index_path, "w", encoding="utf-8") as handle:
        json.dump({
            "format": "tzm-index", "version": 1,
            "generator": "Taierzhuang1938/_blender/BuildAll.py",
            "budget": BUDGET,
            "models": manifest,
        }, handle, ensure_ascii=False, indent=1)

    total = sum(m["triangles"] for m in manifest)
    print("\n合计 %d 个模型，%d 三角，清单写到 %s" % (len(manifest), total, index_path))
    if failures:
        for f in failures:
            print("FAIL " + f)
        sys.exit(1)
    print("BUILD_OK")


main()

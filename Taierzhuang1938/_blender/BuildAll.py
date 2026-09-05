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
import BuildCivilians                # noqa: E402
import BuildSoldiers                 # noqa: E402
import BuildWeapons                  # noqa: E402
import BuildProps                    # noqa: E402
import BuildVehicles                 # noqa: E402
import ImportWeapons                 # noqa: E402
import ImportLugouqiaoWeapons        # noqa: E402
import ImportBayonets                # noqa: E402
import ImportVehicles                # noqa: E402
from AssetBudgets import WEAPON_TRIANGLE_LIMIT, VEHICLE_TRIANGLE_LIMIT  # noqa: E402

# 三角预算。超了不是警告是**失败** —— 换模最容易翻车的就是这里，
# 一旦放行，同屏 24 人的 draw call / triangle 红线当场击穿。
BUDGET = {
    "soldier": 1800,
    "weapon": WEAPON_TRIANGLE_LIMIT,
    "prop": 400,
    "vehicle": VEHICLE_TRIANGLE_LIMIT,
}

# 武器全长（米），抄自 Data_Weapons.mjs 的 lengthM，**是史实数据，不许为了好看改**。
# 断言的是模型在 Z 上的实际跨度 —— 它一次就逮出了汉阳造的套筒建到枪口前头去、
# 顺带把那一段的面全朝里翻了的 bug。容差 20 mm 留给准星护翼和枪托底板的圆角。
WEAPON_LENGTH = {
    "ZhongZheng": 1.110, "HanYang": 1.250, "Zb26": 1.165, "Type38": 1.276,
    "Mauser96": 0.288, "ServicePistol": 0.222,
    "Grenade": 0.220, "Dadao": 0.900, "Type89Launcher": 0.413,
    "Type11": 1.100, "Type92Hmg": 1.156,
    "BrowningTripodAssembly": 2.273, "UnidentifiedMunition": 0.253,
    "OfficerSwordSet": 1.000, "RingPommelDagger": 0.450,
    "MediumMortar": 1.444,
    # 刺刀是独立模型（挂 socket 到枪口，见 ImportBayonets.py 抬头）。
    # 全长同样是史实数：HY1935 572 mm / 汉阳式 517 mm / 三十年式 514 mm。
    "BayonetZhongZheng": 0.572, "BayonetHanYang": 0.517, "BayonetType38": 0.514,
}
LENGTH_TOLERANCE = 0.020

# 士兵身高（米）：模型在 Y 上从脚底到头顶（含帽/盔）的跨度应当接近它。
# 百姓也在这张表里：**男女两个模型都建在 1.60 m 上**，身高差走运行时的整体缩放
# （Script_Actor 的 KIND_SPEC.civilian.variants）—— 加载器的
# scale = KIND_SPEC.height / MESHES.height 会把烘死在模型里的身高差直接除回去。
SOLDIER_HEIGHT = {
    "SoldierNra": 1.66, "SoldierIja": 1.62,
    "CivilianMale": 1.60, "CivilianFemale": 1.60,
}

# 车辆三围（宽 X / 高 Y / 长 Z，米），抄自 Data_Weapons.mjs，**同样是史实数据**。
# 车比枪更容易越建越胖：每加一块装甲板都想往外挪一点，五块之后车就宽了半米，
# 而巷宽 2.5 m 进不进得来是一条**玩法规则**（Data_Levels 抬头）。所以逐轴断言。
VEHICLE_SPAN = {
    "Type95HaGo": (2.07, 2.27, 4.38),
    "Type97ChiHa": (2.475, 2.38, 5.50),
    "Type89Tank": (2.15, 2.56, 4.30),
}
VEHICLE_TOLERANCE = 0.08
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


def NamedArg(flag):
    """从 Blender `--` 后的参数读取逗号分隔模型名。"""
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    for i, arg in enumerate(argv):
        if arg == flag and i + 1 < len(argv):
            return {name.strip() for name in argv[i + 1].split(",") if name.strip()}
    return set()


def main():
    out = OutDir()
    os.makedirs(out, exist_ok=True)
    requested = NamedArg("--only")
    removed = NamedArg("--remove")
    index_path = os.path.join(out, "Index.json")
    # 单件重建不能把其余模型从清单抹掉。只替换本次落盘的条目，同时可把已经
    # 废弃的型号从清单摘掉；完整构建仍从空清单开始，保证没有历史幽灵条目。
    manifest = []
    if requested and os.path.isfile(index_path):
        with open(index_path, "r", encoding="utf-8") as handle:
            previous = json.load(handle)
        manifest = [entry for entry in previous.get("models", [])
                    if entry["name"] not in requested and entry["name"] not in removed]
    failures = []

    jobs = []
    jobs.append(("SoldierNra", "soldier", BuildSoldiers.BuildNraSoldier,
                 "川军第 22 集团军第 122 师步兵：布军帽 + 青天白日帽徽、灰蓝土布军装、"
                 "斜挎布子弹带（大部分格子瘪着）、绑腿、露趾草鞋。无钢盔。"))
    jobs.append(("SoldierIja", "soldier", BuildSoldiers.BuildIjaSoldier,
                 "日军濑谷支队步兵：立领昭五式 + 步兵红领章、九〇式钢盔（正面五角星）、"
                 "皮弹药盒三只、编上靴 + 脚绊。1938 年 3—4 月无屁帘。"))
    jobs.append(("CivilianMale", "soldier", BuildCivilians.BuildCivilianMale,
                 "鲁南男性平民：对襟夹袄 + 中式小立领 + 布盘扣、腰里一条布带、"
                 "裤脚扎腿带（不是绑腿）、千层底黑布鞋、包头布。身上没有任何军用装具。"))
    jobs.append(("CivilianFemale", "soldier", BuildCivilians.BuildCivilianFemale,
                 "鲁南女性平民：大襟褂（衣襟从领口斜扣到左腋下）、肥裤扎脚、"
                 "包头巾 + 颈后裹着的纂儿、千层底布鞋。身上没有任何军用装具。"))
    for name, builder in BuildWeapons.WEAPON_BUILDERS.items():
        imported = ImportWeapons.BuilderFor(name)
        jobs.append((name, "weapon", imported or builder, ""))
    # 这两把没有程序化 TZM 成品；可重分发源模存在时才落盘。源文件缺席则运行时
    # 退回 Script_Actor 的程序化兜底，不阻断克隆仓库的构建。
    for optional_name in ("Type11", "Type92Hmg"):
        optional_builder = ImportWeapons.BuilderFor(optional_name)
        if optional_builder:
            jobs.append((optional_name, "weapon", optional_builder,
                         ImportWeapons.SOURCES[optional_name]["note"]))
    # 卢沟桥资源包的同名枪（Type11 / Mauser96）在这里排到旧导入器之后：
    # 新资源存在时覆盖同名 job，旧模型仍留在仓库作为对比参考，不删除。
    lugouqiao_jobs = []
    for name, spec in ImportLugouqiaoWeapons.SOURCES.items():
        builder = ImportLugouqiaoWeapons.BuilderFor(name)
        if builder:
            lugouqiao_jobs.append((name, "weapon", builder, spec["note"]))
    replacement_names = {entry[0] for entry in lugouqiao_jobs}
    jobs = [entry for entry in jobs if entry[0] not in replacement_names]
    jobs.extend(lugouqiao_jobs)
    for name in ImportBayonets.SOURCES:
        builder = ImportBayonets.BuilderFor(name)
        if builder:
            jobs.append((name, "weapon", builder, ImportBayonets.SOURCES[name]["note"]))
    for name, builder in BuildProps.PROP_BUILDERS.items():
        jobs.append((name, "prop", builder, ""))
    jobs.append(("Type89Launcher", "weapon", BuildVehicles.BuildType89Launcher,
                 "八九式重掷弹筒：筒身 + 螺杆 + 弧形驻钣。无两脚架，约 45° 手持发射。"))
    vehicle_names = list(BuildVehicles.VEHICLE_BUILDERS)
    for name in ImportVehicles.SOURCES:
        if name not in vehicle_names:
            vehicle_names.append(name)
    for name in vehicle_names:
        # 掷弹筒是单兵武器（走上面 weapon 那行），不进 vehicle 名单
        if name == "Type89Launcher":
            continue
        imported = ImportVehicles.BuilderFor(name)
        builder = BuildVehicles.VEHICLE_BUILDERS.get(name)
        if imported is None and builder is None:
            raise RuntimeError("载具没有可用构建器：%s" % name)
        jobs.append((name, "vehicle", imported or builder, ""))

    for name, category, builder, notes in jobs:
        if requested and name not in requested:
            continue
        ResetScene()
        FLIPPED.clear()
        built = builder()
        root = built[0] if isinstance(built, tuple) else built
        path = os.path.join(out, name + ".tzm.json")
        static_mesh = getattr(builder, "staticMesh", False)
        tris, blocks, size, audit = WriteTzm(root, path, name, notes, audit=not static_mesh)
        # 摄影测量车的近景预算由导入器逐资产声明；其余类别仍强制全局红线。
        limit = getattr(builder, "budget", BUDGET[category])
        ok = tris <= limit
        if not ok:
            failures.append("%s 三角超预算：%d > %d" % (name, tris, limit))

        # 实体性自检。**程序化武器是硬失败**：玩家会把枪怼到脸上看，一处飘着的零件
        # 就是一处穿帮。导入的外部模按材质切开后，枪管贴机匣前脸经常是 0 mm 共面缝，
        # 包围盒判据会误报；人物与建筑构件只警告。
        imported = getattr(builder, "imported", False)
        for label, near, gap in audit["strays"]:
            line = "%s 零件飘着：%s 离 %s 还差 %.1f mm" % (name, label, near, gap * 1000.0)
            if category == "weapon" and not imported:
                ok = False
                failures.append(line)
            else:
                print("warn " + line)
        for a, b, gap in audit["coplanar"]:
            line = "%s 面贴面（会闪）：%s / %s 只重叠 %.2f mm" % (name, a, b, gap * 1000.0)
            if category == "weapon" and not imported:
                ok = False
                failures.append(line)
            else:
                print("warn " + line)
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
        if name in VEHICLE_SPAN:
            want = VEHICLE_SPAN[name]
            got = tuple(bmax[i] - bmin[i] for i in range(3))
            for i, axis in enumerate("XYZ"):
                if abs(got[i] - want[i]) > VEHICLE_TOLERANCE:
                    ok = False
                    failures.append("%s 车身 %s 向对不上：%.3f m ≠ %.3f m"
                                    % (name, axis, got[i], want[i]))
            if abs(bmin[1]) > 0.03:
                ok = False
                failures.append("%s 履带没落在 y=0：%.3f" % (name, bmin[1]))
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
        entry = {
            "name": name, "category": category, "file": name + ".tzm.json",
            "triangles": tris, "meshBlocks": blocks, "nodes": len(doc["nodes"]),
            "joints": joints, "bytes": size, "materials": materials,
            "mounts": mounts, "bounds": doc["bounds"],
        }
        source_triangles = getattr(builder, "sourceTriangles", None)
        if source_triangles is not None:
            entry["sourceTriangles"] = source_triangles
            entry["targetTriangles"] = getattr(builder, "targetTriangles", None)
            entry["triangleLimit"] = getattr(builder, "triangleLimit", limit)
        manifest.append(entry)
        print("%-4s %-16s %-8s tris=%-5d blocks=%-3d nodes=%-3d joints=%-3d %6.1f KB  mats=%s"
              % ("ok" if ok else "FAIL", name, category, tris, blocks,
                 len(doc["nodes"]), joints, size / 1024.0, ",".join(materials)))
        # 翻面体检的战果。**这里有内容不是好消息**：说明某个建模原语的绕向写反了，
        # 兜底给你救回来了，但根子在原语上，去那儿修。
        if FLIPPED:
            print("     翻面兜底：" + "  ".join(FLIPPED))

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

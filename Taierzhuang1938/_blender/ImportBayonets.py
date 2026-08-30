# -*- coding: utf-8 -*-
"""把外部免费刺刀模收进规范系，出成独立的 Bayonet*.tzm.json。

为什么是**独立模型**而不是建进枪里：BuildAll 对枪的全长有史实硬断言
（WEAPON_LENGTH），上了刺刀的全长是另一个史实数（三八式 1.663 m）——
把刀焊进枪模会把这条断言搅成两可。独立出刀，枪的断言不动，刀有自己的
全长断言；运行时按 socket 挂点扣到枪口上，装/卸只是切一个 Group 的可见性。

规范系（与武器一致的右手系）：**原点 = 护手前脸（刀身与柄的分界）**，
刀尖朝 -Z、柄与柄尾朝 +Z、+Y 朝枪管一侧。挂点：
  socket —— 枪口环中心。运行时把它对到枪的 muzzle 挂点上（bore 轴），
             整把刀就落在史实位置：环套枪口、柄贴刺刀座。
  tip    —— 刀尖（(0, 0, -bladeM)），Combat 层将来要画刀痕/判穿刺用得上。

史实尺寸（docs/Data_HistoryMaterial.md 口径的延长）：
  HY1935（中正式）：全长 572 mm、刃长 428 mm
  汉阳造（八八式配刀）：全长 517 mm、刃长 395 mm
  三十年式（三八式）：全长 514 mm、刃长 400 mm
做法与 ImportWeapons 一致：柄段整体等比（护手→柄尾 = 全长 − 刃长），
刀身只沿 Z 拉到史实刃长 —— 截面不动，柄的握持比例不动。

两把中式刀共用 Seitengewehr 84/98 底模（毛瑟系刀形），做两处 license-safe
的史实修形：S84/98 没有枪口环而 HY1935/汉阳式有 —— 程序化补一个环；
木柄片也按 C96 握片的先例程序化贴上。三十年式用带钩护手的 T30 底模，
环是模型自带的。来源与许可见 _import/Data_SourceLicenses.md。
"""

import os

import bmesh
import bpy
from mathutils import Matrix

from TzmCore import Box, Node, TubeZ, Transform, Join
from ImportWeapons import (
    _Aabb, _Collect, _ImportFile,
    _Src, _Xform, _AlignLongAxisToZ,
)
from AssetBudgets import WEAPON_TRIANGLE_LIMIT, TriangleTarget

T_STEEL = "gunSteel"
T_WOOD = "gunWood"

BUDGET = WEAPON_TRIANGLE_LIMIT
BUILD_STATS = {}

SOURCES = {
    "BayonetZhongZheng": {
        "file": os.path.join("Model_Seitengewehr8498", "scene.gltf"),
        "bladeM": 0.428, "overallM": 0.572,
        # 底模没有环（S84/98 本来就取消了环），HY1935 有：程序化补
        "addRing": True, "addGrips": True,
        "socket": (0.0, 0.022, -0.004),
        "note": "CC-BY Seitengewehr 84/98（Sketchfab / PL_historyfan_K）→ HY1935。"
                "毛瑟系刀形；补枪口环与木柄片，刃拉长到 428 mm。",
    },
    "BayonetHanYang": {
        "file": os.path.join("Model_Seitengewehr8498", "scene.gltf"),
        "bladeM": 0.395, "overallM": 0.517,
        "addRing": True, "addGrips": True,
        "socket": (0.0, 0.022, -0.004),
        "note": "同一 CC-BY 底模 → 汉阳造配刀（八八式系）。刃 395 mm。",
    },
    "BayonetType38": {
        "file": os.path.join("Model_Type30Bayonet", "scene.gltf"),
        "bladeM": 0.400, "overallM": 0.514,
        # 三十年式的环与钩形护手是模型自带的。**不走贴图色分桶**：
        # 这张 PSX 漫反射整体偏棕，colorSplit 会把整把刀判成木头（实测），
        # 全钢反而对 —— 三十年式的柄片本来就有全钢的后期批次，蓝钢一体不出戏。
        "skip": ("Arisaka-T30-scaberd", "Arisaka-T30-belt"),
        "addRing": False, "addGrips": False,
        "socket": (0.0, 0.020, 0.004),
        "note": "CC-BY Ps1 Arisaka T30 Bayonet（Sketchfab / Swordmanck）→ 三十年式。"
                "钩形护手 + 枪口环自带；丢掉刀鞘与腰带。刃 400 mm。",
    },
}


def _MeanSliceArea(bms, z0, z1, bins=10):
    """z0..z1 内按 bin 求平均截面积（包围盒近似）。判"哪一半是刀"用。"""
    table = {}
    for bm in bms:
        for v in bm.verts:
            if z0 <= v.co.z < z1:
                key = int((v.co.z - z0) / max(1e-9, (z1 - z0) / bins))
                b = table.setdefault(key, [1e9, -1e9, 1e9, -1e9])
                b[0] = min(b[0], v.co.x); b[1] = max(b[1], v.co.x)
                b[2] = min(b[2], v.co.y); b[3] = max(b[3], v.co.y)
    areas = [max(0.0, b[1] - b[0]) * max(0.0, b[3] - b[2]) for b in table.values()]
    return sum(areas) / max(1, len(areas))


def _GuardFrontZ(bms):
    """护手前脸：从刀尖往柄找第一个"截面宽度跳上台阶"的 z。

    刀身截面窄（毛瑟系 25—30 mm 宽、几 mm 厚），护手/环那一段宽一倍以上。
    按 2% 分片找出宽度中位数的 2.2 倍首次出现的位置。"""
    lo, hi = _Aabb(bms)
    span = hi.z - lo.z
    steps = 50
    widths = []
    for i in range(steps):
        z0 = lo.z + span * i / steps
        z1 = lo.z + span * (i + 1) / steps
        b = [1e9, -1e9]
        n = 0
        for bm in bms:
            for v in bm.verts:
                if z0 <= v.co.z < z1:
                    n += 1
                    b[0] = min(b[0], v.co.x); b[1] = max(b[1], v.co.x)
        widths.append((z0, (b[1] - b[0]) if n else 0.0))
    valid = sorted(w for _, w in widths if w > 0)
    median = valid[len(valid) // 2] if valid else 0.0
    for z0, w in widths:
        if w > median * 2.2:
            return z0
    return lo.z + span * 0.6


def _CenterOnBladeAxis(bms):
    """把刀身轴压到 (x=0, y=0)：取刀身前 60% 顶点的几何中心。"""
    lo, hi = _Aabb(bms)
    cut = lo.z + (hi.z - lo.z) * 0.45
    sx = sy = n = 0.0
    for bm in bms:
        for v in bm.verts:
            if v.co.z < cut:
                sx += v.co.x; sy += v.co.y; n += 1
    if n:
        _Xform(bms, Matrix.Translation((-sx / n, -sy / n, 0.0)))


def BuildBayonet(name):
    spec = SOURCES[name]
    path = _Src(spec["file"])
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _ImportFile(path)
    buckets = _Collect(None, spec.get("skip", ()),
                       color_split=spec.get("colorSplit", False))
    if "steel" not in buckets:
        raise RuntimeError("%s 导入后没有钢件" % name)
    steel = buckets["steel"]
    wood = buckets.get("wood")
    bms = [b for b in (steel, wood) if b is not None]

    _AlignLongAxisToZ(bms)
    # 刀尖朝 -Z：细的一半是刀（按平均截面积判）
    lo, hi = _Aabb(bms)
    mid = (lo.z + hi.z) * 0.5
    if _MeanSliceArea(bms, lo.z, mid) > _MeanSliceArea(bms, mid, hi.z):
        _Xform(bms, Matrix.Rotation(3.141592653589793, 4, "Y"))

    # 原点挪到护手前脸，刀身轴压到 x=0 / y=0
    guard = _GuardFrontZ(bms)
    _Xform(bms, Matrix.Translation((0.0, 0.0, -guard)))
    _CenterOnBladeAxis(bms)

    # 柄段等比缩放（护手→柄尾 = 全长 − 刃长），刀身只沿 Z 拉到史实刃长
    lo, hi = _Aabb(bms)
    hilt_target = spec["overallM"] - spec["bladeM"]
    s = hilt_target / max(1e-6, hi.z)
    _Xform(bms, Matrix.Diagonal((s, s, s, 1.0)))
    lo, hi = _Aabb(bms)
    stretch = spec["bladeM"] / max(1e-6, -lo.z)
    for bm in bms:
        for v in bm.verts:
            if v.co.z < 0.0:
                v.co.z *= stretch
        bm.normal_update()

    # The selected source is below the firearm threshold.  Keep its authored
    # topology: generic bevel/decimation would move it away from the original
    # count before the historical muzzle ring and grip repairs are added.
    source_triangles = sum(sum(max(len(face.verts) - 2, 1) for face in mesh.faces)
                           for mesh in bms)
    target_triangles = TriangleTarget(name, "weapon", source_triangles)
    BUILD_STATS[name] = {
        "sourceTriangles": source_triangles,
        "targetTriangles": target_triangles,
        "triangleLimit": WEAPON_TRIANGLE_LIMIT,
    }

    # --- license-safe 史实修形 -----------------------------------------------
    sx, sy, sz = spec["socket"]
    if spec.get("addRing"):
        # 枪口环：内孔让给枪管（运行时枪管从中穿过，实心短套读作环箍）
        ring = TubeZ(0.0115, 0.0115, 0.018, segments=14)
        Transform(ring, y=sy, z=sz)
        collar = TubeZ(0.0095, 0.0125, 0.008, segments=14)
        Transform(collar, y=sy, z=sz + 0.012)
        steel = Join(steel, ring, collar)
        bmesh.ops.remove_doubles(steel, verts=steel.verts[:], dist=1e-4)
        steel.normal_update()
    if spec.get("addGrips"):
        # 木柄片：两片带铆钉位的侧板（C96 握片的先例）。落在柄段中前部。
        panels = []
        lo, hi = _Aabb([steel])
        grip0 = min(hi.z - 0.012, 0.030)
        grip_len = max(0.055, (hi.z - grip0) * 0.72)
        for side in (-1.0, 1.0):
            panel = Box(0.0040, 0.0210, grip_len, bevel=0.0012, segments=2)
            Transform(panel, x=side * 0.0085, y=0.0, z=grip0 + grip_len * 0.5)
            panels.append(panel)
        wood = Join(wood, *panels) if wood is not None else Join(*panels)
        wood.normal_update()

    root = Node("root")
    body = root.Child("body")
    if wood is not None and wood.faces:
        body.Add("wood", wood, tile=T_WOOD)
    body.Add("steel", steel, tile=T_STEEL)
    body.Child("socket", t=(sx, sy, sz))
    body.Child("tip", t=(0.0, 0.0, -spec["bladeM"]))
    return root


def BuilderFor(name):
    spec = SOURCES.get(name)
    if not spec or not os.path.isfile(_Src(spec["file"])):
        return None

    def _Build():
        root = BuildBayonet(name)
        stats = BUILD_STATS[name]
        _Build.sourceTriangles = stats["sourceTriangles"]
        _Build.targetTriangles = stats["targetTriangles"]
        _Build.triangleLimit = stats["triangleLimit"]
        return root
    _Build.__name__ = "BuildBayonet_%s" % name
    _Build.imported = True
    _Build.budget = WEAPON_TRIANGLE_LIMIT
    return _Build

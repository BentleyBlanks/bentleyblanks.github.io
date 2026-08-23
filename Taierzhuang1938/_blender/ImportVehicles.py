# -*- coding: utf-8 -*-
"""把外部 CC-BY 战车模型收进载具规范系，再交给 WriteTzm。

坐标系与 BuildVehicles.py 一致：原点在地面、车体中心；车头朝 -Z；
长在 Z、宽在 X、高在 Y；炮塔是 joint=True 的「turret」节点。

来源模型按部件组名收桶（Sketchfab 拆件组：Hull / Track / Turret / Barrel）：
  Hull + Turret -> armor（装甲漆面，tile=armor）
  Track         -> track（履带与负重轮，tile=track）
  Barrel        -> steel（炮管等发蓝钢件，tile=steel）

源图依然不进 Pages（与枪械同一个理由：共享三套 authored PBR，见
Data_SourceLicenses.md）。扫描/摄影测量件顶点按面拆分，先焊接成真实连通岛，
再按连通岛逐个减面把三角数压到车辆预算 1600。

挂点（gunMuzzle / rearMgMuzzle / hatch / mgMuzzle / hullFront）按部件几何推算：
炮口取枪管最前端的质心、舱盖取炮塔顶面质心、塔后机枪取炮塔后端质心——
现在没有载具系统，这些位置只为将来接系统时不必重建模型。
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from TzmCore import Join, Node
from ImportWeapons import _DecimateToBudget

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "_import", "Source"))

BUDGET = 1600

SOURCES = {
    "Type89Tank": {
        "file": os.path.join("Model_Type89ChiRo", "scene.gltf"),
        "span": (2.15, 2.56, 4.30),
        # (部件组名, 材质桶, 属于炮塔节点?)
        "parts": [("Hull", "armor", False), ("Track", "track", False),
                  ("Turret", "armor", True), ("Barrel", "steel", True)],
        "note": "CC-BY Type 89 I-Go (Chi-Ro)（Sketchfab / snrnsrk5）→ 八九式中战车（甲）。"
                "前起动轮抬高、炮塔偏前、塔后机枪与车体右前机枪球座齐备；"
                "尺寸按史实 4.30 × 2.15 × 2.56 m 归一。源图为摄影测量烘焙图，"
                "运行时按 armor/track/steel 三桶重漆。",
    },
}


def _Src(name):
    return os.path.join(SRC, name)


def _PartKey(obj, parts):
    """最近的祖先里第一个命中部件组名的就是它。"""
    chain = []
    node = obj
    while node is not None:
        chain.append(node.name)
        node = node.parent
    for name in chain:               # 最近祖先优先
        for key, _bucket, _turret in parts:
            if key in name:
                return key
    return None


def _Aabb(bms):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for bm in bms:
        for vert in bm.verts:
            lo.x, lo.y, lo.z = min(lo.x, vert.co.x), min(lo.y, vert.co.y), min(lo.z, vert.co.z)
            hi.x, hi.y, hi.z = max(hi.x, vert.co.x), max(hi.y, vert.co.y), max(hi.z, vert.co.z)
    return lo, hi


def _Xform(bms, matrix):
    for bm in bms:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        bm.normal_update()


def BuildImported(name):
    spec = SOURCES[name]
    path = _Src(spec["file"])
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)

    parts = spec["parts"]
    gathered = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        key = _PartKey(obj, parts)
        if not key:
            print("[ImportVehicles] %s 未匹配部件组，跳过" % obj.name)
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.transform(bm, matrix=evaluated.matrix_world, verts=bm.verts[:])
        evaluated.to_mesh_clear()
        gathered.setdefault(key, []).append(bm)

    partbm = {}
    turret_keys = []
    for key, bucket, in_turret in parts:
        raw_list = gathered.get(key)
        if not raw_list:
            raise RuntimeError("%s 导入后缺少 %s 部件" % (name, key))
        joined = Join(*raw_list)
        # 摄影测量件的顶点是按面拆的（同一位置每面一份）：焊起来才有真正的
        # 连通岛，逐岛减面才动得了；0.6 mm 不会误焊真正的接缝。
        bmesh.ops.remove_doubles(joined, verts=joined.verts[:], dist=0.0006)
        joined.normal_update()
        partbm[key] = joined
        if in_turret:
            turret_keys.append(key)

    all_bms = list(partbm.values())

    # --- 归一化：Z-up 源、车头 +Y → 游戏系（Y 上、-Z 前）-----------------
    # 绕 X 转 -90°：(x, y, z) -> (x, z, -y)，old +Y(车头) -> new -Z ✓，old +Z(上) -> new +Y ✓
    _Xform(all_bms, Matrix.Rotation(-math.pi * 0.5, 4, "X"))

    # 车头验正：炮管（Barrel 部件）应落在 -Z 半侧；不对就绕 Y 翻 180°
    blo, bhi = _Aabb([partbm["Barrel"]])
    if (blo.z + bhi.z) * 0.5 > 0.0:
        _Xform(all_bms, Matrix.Rotation(math.pi, 4, "Y"))

    # 逐轴归一缩放到史实三围（扫描件比例与实车有几厘米级偏差，逐轴拉正）
    lo, hi = _Aabb(all_bms)
    sx = spec["span"][0] / (hi.x - lo.x)
    sy = spec["span"][1] / (hi.y - lo.y)
    sz = spec["span"][2] / (hi.z - lo.z)
    _Xform(all_bms, Matrix.Diagonal((sx, sy, sz, 1.0)))

    # 落地 + 居中：地面 y=0、车体中心 x=0/z=0
    lo, hi = _Aabb(all_bms)
    _Xform(all_bms, Matrix.Translation((-0.5 * (lo.x + hi.x), -lo.y, -0.5 * (lo.z + hi.z))))

    # --- 炮塔：独立关节节点，枢轴取塔座中心 --------------------------------
    tlo, thi = _Aabb([partbm["Turret"]])
    pivot = Vector((0.0, tlo.y, 0.5 * (tlo.z + thi.z)))
    for key in turret_keys:
        bmesh.ops.transform(partbm[key], matrix=Matrix.Translation(-pivot),
                            verts=partbm[key].verts[:])
        partbm[key].normal_update()

    # --- 三角预算（≤1600）：装甲+钢件按连通岛压，履带保形 ------------------
    def EstTris(bm):
        return sum(max(len(f.verts) - 2, 1) for f in bm.faces)

    track_tris = EstTris(partbm["Track"])
    armor_steel = [partbm[k] for k, _b, _t in parts if _b != "track"]
    dec = _DecimateToBudget(armor_steel, budget=int((BUDGET - track_tris) * 0.92))
    if dec is not None:
        idx = 0
        for key, _b, _t in parts:
            if _b != "track":
                partbm[key] = dec[idx]
                idx += 1

    # --- 挂点（部件几何推算）-----------------------------------------------
    hlo, hhi = _Aabb([partbm["Hull"]])            # 车体（根空间）
    blo, bhi = _Aabb([partbm["Barrel"]])          # 炮管（炮塔局部）

    def Centroid(bm, pred):
        pts = [v.co for v in bm.verts if pred(v.co)]
        if not pts:
            return Vector((0.0, 0.0, 0.0))
        c = Vector((0.0, 0.0, 0.0))
        for p in pts:
            c += p
        return c / len(pts)

    muzzle = Centroid(partbm["Barrel"],
                      lambda co: co.z < blo.z + (bhi.z - blo.z) * 0.15)
    muzzle.x = 0.0
    muzzle.z = blo.z - 0.02
    hatch = Centroid(partbm["Turret"], lambda co: co.y > thi.y - 0.12)
    hatch.x = 0.0
    hatch.y = thi.y + 0.02
    rear = Centroid(partbm["Turret"], lambda co: co.z > thi.z - 0.5)
    rearX = rear.x
    rearY = rear.y
    rearZ = thi.z + 0.20
    ball = Centroid(partbm["Hull"],
                    lambda co: co.z < hlo.z + (hhi.z - hlo.z) * 0.12 and co.x > 0.10)
    front = Centroid(partbm["Hull"], lambda co: co.z < hlo.z + 0.25)
    front.x = 0.0

    # --- 节点树 ------------------------------------------------------------
    root = Node("root")
    body = root.Child("body")
    body.Add("armor", partbm["Hull"], tile="armor")
    body.Add("track", partbm["Track"], tile="track")
    turret = body.Child("turret", t=tuple(pivot), joint=True)
    turret.Add("armor", partbm["Turret"], tile="armor")
    turret.Add("steel", partbm["Barrel"], tile="steel")

    turret.Child("gunMuzzle", t=tuple(muzzle))
    turret.Child("rearMgMuzzle", t=(rearX, rearY, rearZ))
    turret.Child("hatch", t=tuple(hatch))
    body.Child("mgMuzzle", t=tuple(ball))
    body.Child("hullFront", t=tuple(front))
    return root


def BuilderFor(name):
    spec = SOURCES.get(name)
    if not spec:
        return None
    if not os.path.isfile(_Src(spec["file"])):
        return None

    def _Build():
        return BuildImported(name)
    _Build.__name__ = "BuildImported_%s" % name
    _Build.imported = True
    return _Build

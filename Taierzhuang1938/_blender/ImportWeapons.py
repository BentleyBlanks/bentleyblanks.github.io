# -*- coding: utf-8 -*-
"""把外部免费枪模（OBJ / glTF）收进武器规范系，再交给 WriteTzm。

坐标系与 BuildWeapons.py 一致：右手握把 = 原点、枪管沿 -Z、膛线轴 y = +0.035。
步枪还把枪托底板放到 z = +0.255；驳壳枪按原程序化模型，击锤后端约 z = +0.046。

外部模型只取几何。贴图丢掉 —— TZM 用游戏内 steel/wood 的盒式投影，
跟人物、沙包走同一套烘焙材质，4K PBR 既进不了加载器也撑爆 Pages。
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from TzmCore import Decimate, Join, Node

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "_import", "Source"))

BORE = 0.035
BUTT_Z = 0.255
PISTOL_REAR_Z = 0.046
T_STEEL = "gunSteel"
T_WOOD = "gunWood"
BUDGET = 900


def _Src(name):
    return os.path.join(SRC, name)


# 每把枪对应一份可再分发的免费源。史实对应写在 Data_SourceLicenses.md。
SOURCES = {
    "ZhongZheng": {
        "file": "Model_Kar98k.obj",
        "lengthM": 1.110,
        "kind": "rifle",
        "matIndex": {0: "wood", 1: "steel", 2: "steel"},
        "note": "CC0 Kar98k（OpenGameArt / byzmod3d）→ 中正式。中正式是毛瑟标准型短管，"
                "剪影与 Kar98k 同族，全长按史实 1.110 m 缩放。",
    },
    "HanYang": {
        "file": "Model_Kar98k.obj",
        "lengthM": 1.250,
        "kind": "rifle",
        "matIndex": {0: "wood", 1: "steel", 2: "steel"},
        "jacket": True,
        "note": "同一把 Kar98k 拉到汉阳造的 1.250 m，再套上 φ32 薄套筒。"
                "套筒是八八式的剪影特征；完整 Gewehr 88 免费模 Sketchfab 要登录才能下。",
    },
    "Mauser96": {
        "file": "Model_MauserC96.glb",
        "lengthM": 0.288,
        "kind": "pistol",
        "skip": ("Boom", "Reload", "Near"),
        "note": "CC0 Mauser C96（itch.io / Plewr）。Boom 是枪口焰网格，丢掉。",
    },
}


def _ImportFile(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise ValueError("不支持的枪模格式：%s" % path)


def _GuessMaterial(slot_name, index, mat_index):
    if mat_index and index in mat_index:
        return mat_index[index]
    name = (slot_name or "").lower()
    if any(key in name for key in ("wood", "stock", "grab", "grip", "handle")):
        return "wood"
    return "steel"


def _Collect(mat_index=None, skip=()):
    """把场景里的网格按 steel/wood 收成两个 bmesh。跳过 skip 里的对象名。"""
    skip = {s.lower() for s in skip}
    buckets = {"steel": [], "wood": []}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        stem = obj.name.split(".")[0].lower()
        if obj.name.lower() in skip or stem in skip:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        raw = bmesh.new()
        raw.from_mesh(mesh)
        bmesh.ops.transform(raw, matrix=evaluated.matrix_world, verts=raw.verts[:])
        evaluated.to_mesh_clear()
        raw.faces.ensure_lookup_table()
        by_slot = {}
        for face in raw.faces:
            by_slot.setdefault(face.material_index, []).append(face)
        slots = obj.material_slots
        for slot_i, faces in by_slot.items():
            slot_name = ""
            if slot_i < len(slots) and slots[slot_i].material:
                slot_name = slots[slot_i].material.name
            material = _GuessMaterial(slot_name, slot_i, mat_index)
            part = raw.copy()
            drop = [f for f in part.faces if f.material_index != slot_i]
            bmesh.ops.delete(part, geom=drop, context="FACES")
            loose = [v for v in part.verts if not v.link_faces]
            if loose:
                bmesh.ops.delete(part, geom=loose, context="VERTS")
            if part.faces:
                buckets[material].append(part)
            else:
                part.free()
        raw.free()
    out = {}
    for material, parts in buckets.items():
        if not parts:
            continue
        joined = Join(*parts)
        # 导入模常有「枪管正好贴在机匣前脸」的共面缝，焊 1.5 mm 让审计当成一整块
        bmesh.ops.remove_doubles(joined, verts=joined.verts[:], dist=0.0015)
        joined.normal_update()
        out[material] = joined
    return out


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


def _AlignLongAxisToZ(bms):
    lo, hi = _Aabb(bms)
    span = hi - lo
    axis = max(range(3), key=lambda i: span[i])
    if axis == 0:
        rot = Matrix.Rotation(-math.pi * 0.5, 4, "Y")
    elif axis == 1:
        rot = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        rot = Matrix.Identity(4)
    _Xform(bms, rot)


def _FlipIfGripIsAbove(bms, wood, steel):
    """木握把 / 枪托腹应当在膛线轴下方。驳壳枪的扫帚柄尤其明显。"""
    if wood is None or steel is None or not wood.verts or not steel.verts:
        return
    wood_y = sum(v.co.y for v in wood.verts) / len(wood.verts)
    steel_y = sum(v.co.y for v in steel.verts) / len(steel.verts)
    if wood_y > steel_y:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Z"))


def _FlipIfStockIsForward(bms, wood):
    """木料重心应当靠近枪托（+Z）。驳壳枪的木握把也在后端。"""
    if wood is None or not wood.verts:
        return
    centroid = Vector((0.0, 0.0, 0.0))
    for vert in wood.verts:
        centroid += vert.co
    centroid /= len(wood.verts)
    if centroid.z < 0.0:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Y"))


def _Place(bms, steel, wood, length_m, kind):
    lo, hi = _Aabb(bms)
    current = hi.z - lo.z
    if current < 1e-4:
        raise RuntimeError("导入的枪模厚度为零")
    _Xform(bms, Matrix.Diagonal((length_m / current, length_m / current, length_m / current, 1.0)))
    lo, hi = _Aabb(bms)

    rear_z = BUTT_Z if kind == "rifle" else PISTOL_REAR_Z
    shift_z = rear_z - hi.z

    barrel_y = BORE
    if steel is not None and steel.verts:
        muzzle_cut = lo.z + (hi.z - lo.z) * 0.12
        ys = [v.co.y for v in steel.verts if v.co.z < muzzle_cut]
        if ys:
            barrel_y = sum(ys) / len(ys)
    shift_y = BORE - barrel_y
    shift_x = -0.5 * (lo.x + hi.x)
    _Xform(bms, Matrix.Translation((shift_x, shift_y, shift_z)))


def _DecimateToBudget(bms):
    total = sum(len(bm.faces) for bm in bms)
    # OBJ 的面可能是四边，WriteTzm 会三角化；按 2× 面数估一下上限
    estimated = 0
    for bm in bms:
        estimated += sum(max(len(f.verts) - 2, 1) for f in bm.faces)
    if estimated <= BUDGET:
        return
    ratio = max(0.12, (BUDGET * 0.92) / float(estimated))
    replaced = []
    for bm in bms:
        decimated = Decimate(bm, ratio)
        bm.free()
        replaced.append(decimated)
    return replaced


def _AddJacket(steel, length_m):
    """汉阳造的套筒：φ32 薄壁，从机匣插到枪口附近。"""
    from BuildWeapons import TubeAlongZ
    muzzle_z = -(length_m - BUTT_Z)
    jacket = TubeAlongZ(-0.100, muzzle_z + 0.055, 0.0162, 0.0158, segments=10)
    steel = Join(steel, jacket)
    bmesh.ops.remove_doubles(steel, verts=steel.verts[:], dist=1e-4)
    steel.normal_update()
    return steel


def _Mounts(node, length_m, kind, lo, hi):
    muzzle_z = lo.z - 0.006
    if kind == "rifle":
        grip_l = (0.0, -0.012, muzzle_z * 0.58)
        sight_z = -0.165 * (length_m / 1.110)
        mag = (0.0, BORE - 0.045, -0.055)
    else:
        grip_l = (0.0, -0.012, -0.055)
        sight_z = -0.078
        mag = (0.0, BORE - 0.040, -0.062)
    node.Child("muzzle", t=(0.0, BORE, muzzle_z))
    node.Child("gripR", t=(0.0, 0.0, 0.0))
    node.Child("gripL", t=grip_l)
    node.Child("sight", t=(0.0, BORE + 0.020, sight_z))
    node.Child("magazine", t=mag)


def BuildImported(name):
    spec = SOURCES[name]
    path = _Src(spec["file"])
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _ImportFile(path)
    buckets = _Collect(spec.get("matIndex"), spec.get("skip", ()))
    if "steel" not in buckets:
        raise RuntimeError("%s 导入后没有钢件" % name)
    wood = buckets.get("wood")
    steel = buckets["steel"]
    bms = [bm for bm in (steel, wood) if bm is not None]
    _AlignLongAxisToZ(bms)
    _FlipIfStockIsForward(bms, wood)
    _FlipIfGripIsAbove(bms, wood, steel)
    _Place(bms, steel, wood, spec["lengthM"], spec["kind"])
    if spec.get("jacket") and steel is not None:
        steel = _AddJacket(steel, spec["lengthM"])
        bms = [bm for bm in (steel, wood) if bm is not None]
    decimated = _DecimateToBudget(bms)
    if decimated is not None:
        steel = decimated[0]
        wood = decimated[1] if len(decimated) > 1 else None
        bms = [bm for bm in (steel, wood) if bm is not None]
    lo, hi = _Aabb(bms)
    root = Node("root")
    body = root.Child("body")
    if wood is not None:
        body.Add("wood", wood, tile=T_WOOD)
    body.Add("steel", steel, tile=T_STEEL)
    _Mounts(body, spec["lengthM"], spec["kind"], lo, hi)
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

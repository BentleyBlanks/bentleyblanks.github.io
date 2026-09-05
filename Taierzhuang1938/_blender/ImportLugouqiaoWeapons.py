# -*- coding: utf-8 -*-
"""Import the individually split Lugouqiao weapons without discarding UVs.

Unlike the older generic weapon importer, every source material remains a
separate runtime bucket.  The checked-in source blends point at the untouched
DDS/TGA/JPEG originals; browser-ready JPG/PNG derivatives are loaded by Main.
"""

import os
import math

import bpy
import bmesh

from TzmCore import AUTHORED_NORMAL_LAYER, MATERIAL_NAMES, Node, Transform, TransformMatrix, TubeZ
from ImportWeapons import (
    _Aabb, _AlignLongAxisToZ, _AutoSmooth, _DecimateToBudget,
    _FlipIfGripIsAbove, _FlipIfStockIsForward, _Mounts, _OrientAllSteelFirearm,
    _Place,
)
from AssetBudgets import (
    SPECIAL_TRIANGLE_TARGETS, WEAPON_TRIANGLE_LIMIT, TriangleTarget,
)


HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.abspath(os.path.join(HERE, "..", "_import", "Source", "Model_LugouqiaoWeapons"))
BUILD_STATS = {}

SOURCES = {
    "BrowningTripodAssembly": {"lengthM": 2.273, "kind": "assembly", "side": "neutral",
                   "decimateBias": 1.030,
                   "note": "源节点 BROTRIPO009；名称与结构不足以确认具体勃朗宁型号，按识别截图标注。"},
    "UnidentifiedMunition": {"lengthM": 0.253, "kind": "assembly", "side": "neutral",
                   "note": "源节点 Cylinder026；弹体型号未明，保留 WW-100heqdf 原贴图。"},
    "OfficerSwordSet": {"lengthM": 1.000, "kind": "melee", "side": "ija",
                   "decimateBias": 10.000,
                   "decimateBudget": 9400,
                   "note": "源节点 Group146；军刀与刀鞘组合，具体制式未明。"},
    "RingPommelDagger": {"lengthM": 0.450, "kind": "melee", "side": "neutral",
                   "note": "源节点 Mesh_0300；带环首短刃，具体制式未明。"},
    "Type11": {"lengthM": 1.100, "kind": "rifle", "side": "ija",
                   "excludeObjects": {"4"},
                   # This source has no material bucket whose name contains
                   # "Wood", so the generic stock-direction heuristic treats
                   # the barrel end as the stock.  The resulting mesh points
                   # opposite to muzzle/gripL in both actor and viewmodel rigs.
                   "forceFlip": True,
                   "note": "十一年式轻机枪；源节点 QEDQD，保留 body/body2/fore/ammobox 四张原贴图。源文件中的分解展示件保留在独立 Blend，运行时只取装配态枪体。"},
    "Mauser96": {"lengthM": 0.288, "kind": "pistol", "side": "nra",
                   "note": "毛瑟 C96；源节点 Sphere001，保留 maose_d 与 maose_s。"},
    "MediumMortar": {"lengthM": 1.444, "kind": "assembly", "side": "neutral",
                   "note": "源节点 sphere3；中型迫击炮，具体型号未明。"},
}

RUNTIME_MATERIALS = {
    "lqBrowningTripod", "lqUnidentifiedMunition",
    "lqOfficerSword", "lqRingPommelDagger",
    "lqType11AmmoBox", "lqType11Body", "lqType11BodyAlt", "lqType11Fore",
    "lqMauser96", "lqMediumMortar", "lqWeaponPlain",
}
MATERIAL_NAMES.update(RUNTIME_MATERIALS)

# 这些源 Blend 是从旧 DCC 场景拆出来的，若干 polygon.material_index 仍保留
# 255 / 1 / 2，而对应对象实际只剩一个 slot。不能只按面槽名分桶：那会把有明确
# 原贴图的枪身送进 lqWeaponPlain。对象身份来自拆分清单，稳定且逐件可审计。
TYPE11_OBJECT_MATERIAL = {
    "0": "lqType11BodyAlt",
    "1": "lqType11AmmoBox",
    "3": "lqType11Body",
    "9": "lqType11Fore",
}


def _material_for(asset, material_name, object_name):
    value = (material_name or "").casefold()
    object_value = object_name.casefold()
    if asset == "BrowningTripodAssembly": return "lqBrowningTripod"
    if asset == "UnidentifiedMunition": return "lqUnidentifiedMunition"
    if asset == "OfficerSwordSet":
        return ("lqOfficerSword"
                if "stripe01l" in value or object_value in {"对象142", "对象143"}
                else "lqWeaponPlain")
    if asset == "RingPommelDagger": return "lqRingPommelDagger"
    if asset == "Type11":
        if "ammobox" in value: return "lqType11AmmoBox"
        if "body2" in value: return "lqType11BodyAlt"
        if "body" in value: return "lqType11Body"
        if "fore" in value: return "lqType11Fore"
        return TYPE11_OBJECT_MATERIAL.get(object_name, "lqWeaponPlain")
    if asset == "Mauser96": return "lqMauser96"
    if asset == "MediumMortar": return "lqMediumMortar"
    return "lqWeaponPlain"


def _tile_for(material):
    """源贴图桶保留 source UV；程序化钢木桶必须改回枪械尺度盒投影。"""
    if material == "lqWeaponPlain":
        return "gunSteel"
    if material == "wood":
        return "gunWood"
    if material in {"lqBrowningTripod", "lqMediumMortar"}:
        return "gunSteel"
    return "sourceUv"


def _prepare_export_normals(bms):
    """清退坏拓扑，并让本批声明的 42° 光滑组真正成为导出法线来源。"""
    for mesh in bms:
        if mesh.edges:
            bmesh.ops.dissolve_degenerate(mesh, dist=1e-7, edges=mesh.edges[:])
        if mesh.faces:
            bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces[:])
        authored = mesh.loops.layers.float_vector.get(AUTHORED_NORMAL_LAYER)
        if authored is not None:
            mesh.loops.layers.float_vector.remove(authored)
        mesh.normal_update()
    _AutoSmooth(bms, 42.0)


def _drop_face_islands_past_z(mesh, threshold):
    """删除规范坐标后位于枪尾之外的独立陈列件，不切穿主枪体。"""
    seen = set()
    drop = []
    for seed in mesh.faces:
        if seed in seen:
            continue
        stack = [seed]
        seen.add(seed)
        component = []
        while stack:
            face = stack.pop()
            component.append(face)
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked not in seen:
                        seen.add(linked)
                        stack.append(linked)
        if min(vertex.co.z for face in component for vertex in face.verts) > threshold:
            drop.extend(component)
    if drop:
        bmesh.ops.delete(mesh, geom=drop, context="FACES")
        loose = [vertex for vertex in mesh.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(mesh, geom=loose, context="VERTS")


def _collect(asset):
    buckets = {}
    excluded = SOURCES[asset].get("excludeObjects", set())
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.name in excluded:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        raw = bmesh.new()
        raw.from_mesh(mesh)
        authored = raw.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
        raw.faces.ensure_lookup_table()
        for polygon in mesh.polygons:
            face = raw.faces[polygon.index]
            for loop, loop_index in zip(face.loops, polygon.loop_indices):
                loop[authored] = mesh.corner_normals[loop_index].vector
        TransformMatrix(raw, evaluated.matrix_world)
        evaluated.to_mesh_clear()
        raw.faces.ensure_lookup_table()
        by_slot = {}
        for face in raw.faces:
            by_slot.setdefault(face.material_index, []).append(face)
        for slot_index in by_slot:
            material_name = ""
            if slot_index < len(obj.material_slots) and obj.material_slots[slot_index].material:
                material_name = obj.material_slots[slot_index].material.name
            runtime_name = _material_for(asset, material_name, obj.name)
            part = raw.copy()
            drop = [face for face in part.faces if face.material_index != slot_index]
            if drop:
                bmesh.ops.delete(part, geom=drop, context="FACES")
            loose = [vertex for vertex in part.verts if not vertex.link_faces]
            if loose:
                bmesh.ops.delete(part, geom=loose, context="VERTS")
            if part.faces:
                buckets.setdefault(runtime_name, []).append(part)
            else:
                part.free()
        raw.free()

    joined = {}
    for material, parts in buckets.items():
        destination = bmesh.new()
        for part in parts:
            mesh = bpy.data.meshes.new("LugouqiaoJoin")
            part.to_mesh(mesh)
            destination.from_mesh(mesh)
            bpy.data.meshes.remove(mesh)
            part.free()
        destination.normal_update()
        joined[material] = destination
    return joined


def BuildImported(name):
    spec = SOURCES[name]
    path = os.path.join(SOURCE_DIR, "Model_Lugouqiao%s.blend" % name)
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    bpy.ops.wm.open_mainfile(filepath=path)
    buckets = _collect(name)
    if not buckets:
        raise RuntimeError("%s did not contain mesh data" % name)
    material_names = list(buckets)
    bms = [buckets[key] for key in material_names]
    _AlignLongAxisToZ(bms)
    wood = next((buckets[key] for key in material_names if "Wood" in key), None)
    steel = next((buckets[key] for key in material_names if "Wood" not in key), bms[0])
    if spec["kind"] != "melee":
        _FlipIfStockIsForward(bms, wood)
        _FlipIfGripIsAbove(bms, wood, steel)
        if wood is None:
            _OrientAllSteelFirearm(bms)
    if spec.get("forceFlip"):
        for mesh in bms:
            Transform(mesh, ry=math.pi)
    _Place(bms, steel, wood, spec["lengthM"], spec["kind"])
    source_triangles = sum(sum(max(len(face.verts) - 2, 1) for face in mesh.faces)
                           for mesh in bms)
    target_triangles = TriangleTarget(name, "weapon", source_triangles)
    BUILD_STATS[name] = {
        "sourceTriangles": source_triangles,
        "targetTriangles": target_triangles,
        "triangleLimit": WEAPON_TRIANGLE_LIMIT,
    }
    if source_triangles > target_triangles:
        reduced = _DecimateToBudget(
            bms, budget=spec.get("decimateBudget", target_triangles),
            ratio_bias=spec.get("decimateBias", 1.005))
        if reduced is not None:
            bms = reduced
    _prepare_export_normals(bms)
    lo, hi = _Aabb(bms)
    root = Node("root")
    body = root.Child("body")
    for material, mesh in zip(material_names, bms):
        body.Add(material, mesh, tile=_tile_for(material))
    _Mounts(body, spec["lengthM"], spec["kind"], lo, hi, spec, steel)
    return root


def BuilderFor(name):
    if name not in SOURCES:
        return None
    path = os.path.join(SOURCE_DIR, "Model_Lugouqiao%s.blend" % name)
    if not os.path.isfile(path):
        return None

    def _Build():
        root = BuildImported(name)
        stats = BUILD_STATS[name]
        _Build.sourceTriangles = stats["sourceTriangles"]
        _Build.targetTriangles = stats["targetTriangles"]
        _Build.triangleLimit = stats["triangleLimit"]
        _Build.budget = stats["targetTriangles"]
        return root
    _Build.__name__ = "BuildImportedLugouqiao_%s" % name
    _Build.imported = True
    _Build.budget = SPECIAL_TRIANGLE_TARGETS.get(name, WEAPON_TRIANGLE_LIMIT)
    return _Build

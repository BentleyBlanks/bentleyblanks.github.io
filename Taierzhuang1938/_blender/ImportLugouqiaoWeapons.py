# -*- coding: utf-8 -*-
"""Import the individually split Lugouqiao weapons without discarding UVs.

Unlike the older generic weapon importer, every source material remains a
separate runtime bucket.  The checked-in source blends point at the untouched
DDS/TGA/JPEG originals; browser-ready JPG/PNG derivatives are loaded by Main.
"""

import os

import bpy
import bmesh

from TzmCore import AUTHORED_NORMAL_LAYER, MATERIAL_NAMES, Node, TransformMatrix
from ImportWeapons import (
    _Aabb, _AlignLongAxisToZ, _AutoSmooth, _DecimateToBudget,
    _FlipIfGripIsAbove, _FlipIfStockIsForward, _Mounts, _OrientAllSteelFirearm,
    _Place,
)


HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.abspath(os.path.join(HERE, "..", "_import", "Source", "Model_LugouqiaoWeapons"))

SOURCES = {
    "WaltherP38": {"lengthM": 0.216, "kind": "pistol", "side": "nra",
                   "note": "瓦尔特 P38；源节点 2#，保留 Lug_reb 原贴图。"},
    "BrowningTripodAssembly": {"lengthM": 2.273, "kind": "assembly", "side": "neutral",
                   "note": "源节点 BROTRIPO009；名称与结构不足以确认具体勃朗宁型号，按识别截图标注。"},
    "UnidentifiedMunition": {"lengthM": 0.253, "kind": "assembly", "side": "neutral",
                   "note": "源节点 Cylinder026；弹体型号未明，保留 WW-100heqdf 原贴图。"},
    "UnidentifiedBoltActionRifle": {"lengthM": 1.120, "kind": "rifle", "side": "neutral",
                   "excludeObjects": {"MK98_BA2", "MK98_LOK"},
                   "note": "源节点 FQDQD / MK98_*；仅能确认栓动步枪，具体型号未明。源文件中的分解展示零件保留在独立 Blend，运行时只取装配态枪体。"},
    "OfficerSwordSet": {"lengthM": 1.000, "kind": "melee", "side": "ija",
                   "note": "源节点 Group146；军刀与刀鞘组合，具体制式未明。"},
    "RingPommelDagger": {"lengthM": 0.450, "kind": "melee", "side": "neutral",
                   "note": "源节点 Mesh_0300；带环首短刃，具体制式未明。"},
    "UnidentifiedAntiaircraftGun": {"lengthM": 1.100, "kind": "rifle", "side": "neutral",
                   "note": "源节点 MK1；可确认高射炮形制，具体型号未明。"},
    "LightMortar": {"lengthM": 0.500, "kind": "assembly", "side": "neutral",
                   "note": "源节点 PJP；轻型迫击/掷弹器，具体型号未明。"},
    "Type11": {"lengthM": 1.100, "kind": "rifle", "side": "ija",
                   "excludeObjects": {"4"},
                   "note": "十一年式轻机枪；源节点 QEDQD，保留 body/body2/fore/ammobox 四张原贴图。源文件中的分解展示件保留在独立 Blend，运行时只取装配态枪体。"},
    "Mauser96": {"lengthM": 0.288, "kind": "pistol", "side": "nra",
                   "note": "毛瑟 C96；源节点 Sphere001，保留 maose_d 与 maose_s。"},
    "MediumMortar": {"lengthM": 1.444, "kind": "assembly", "side": "neutral",
                   "note": "源节点 sphere3；中型迫击炮，具体型号未明。"},
    "Karabiner98k": {"lengthM": 1.110, "kind": "rifle", "side": "neutral",
                   "note": "Karabiner 98k；源节点名称直接给出型号，保留 diffuse 与 normal。"},
}

RUNTIME_MATERIALS = {
    "lqWaltherP38", "lqBrowningTripod", "lqUnidentifiedMunition",
    "lqUnidentifiedBoltActionRifle", "lqOfficerSword", "lqRingPommelDagger",
    "lqUnidentifiedAntiaircraftMetal", "lqUnidentifiedAntiaircraftWood", "lqLightMortar",
    "lqType11AmmoBox", "lqType11Body", "lqType11BodyAlt", "lqType11Fore",
    "lqMauser96", "lqMediumMortar", "lqKarabiner98k", "lqWeaponPlain",
}
MATERIAL_NAMES.update(RUNTIME_MATERIALS)


def _material_for(asset, material_name, object_name):
    value = (material_name or "").casefold()
    object_value = object_name.casefold()
    if asset == "WaltherP38": return "lqWaltherP38"
    if asset == "BrowningTripodAssembly": return "lqBrowningTripod"
    if asset == "UnidentifiedMunition": return "lqUnidentifiedMunition"
    if asset == "UnidentifiedBoltActionRifle":
        return "lqUnidentifiedBoltActionRifle" if "dl772" in value else "lqWeaponPlain"
    if asset == "OfficerSwordSet": return "lqOfficerSword"
    if asset == "RingPommelDagger": return "lqRingPommelDagger"
    if asset == "UnidentifiedAntiaircraftGun":
        return "lqUnidentifiedAntiaircraftWood" if "wood" in value or "wood" in object_value else "lqUnidentifiedAntiaircraftMetal"
    if asset == "LightMortar": return "lqLightMortar"
    if asset == "Type11":
        if "ammobox" in value: return "lqType11AmmoBox"
        if "body2" in value: return "lqType11BodyAlt"
        if "body" in value: return "lqType11Body"
        if "fore" in value: return "lqType11Fore"
        return "lqWeaponPlain"
    if asset == "Mauser96": return "lqMauser96"
    if asset == "MediumMortar": return "lqMediumMortar"
    if asset == "Karabiner98k": return "lqKarabiner98k"
    return "lqWeaponPlain"


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
    _Place(bms, steel, wood, spec["lengthM"], spec["kind"])
    reduced = _DecimateToBudget(bms, budget=5800)
    if reduced is not None:
        bms = reduced
    _AutoSmooth(bms, 42.0)
    lo, hi = _Aabb(bms)
    root = Node("root")
    body = root.Child("body")
    for material, mesh in zip(material_names, bms):
        body.Add(material, mesh, tile="sourceUv")
    _Mounts(body, spec["lengthM"], spec["kind"], lo, hi, spec, steel)
    return root


def BuilderFor(name):
    if name not in SOURCES:
        return None
    path = os.path.join(SOURCE_DIR, "Model_Lugouqiao%s.blend" % name)
    if not os.path.isfile(path):
        return None

    def _Build():
        return BuildImported(name)
    _Build.__name__ = "BuildImportedLugouqiao_%s" % name
    _Build.imported = True
    _Build.budget = 6000
    return _Build

"""Rebuild the attributed rural-house GLB from its downloaded Sketchfab source.

Run with Blender:
  blender --background --python Script_ChineseRuralHouseBake.py

The selected source is 236,434 triangles.  The approved runtime target is
58,812 triangles: twice the 29,406-triangle checked-in mesh that preceded this
rule.  Source objects, UVs, materials and embedded textures stay intact; the
project PBR configurator may then rebind selected material slots.
"""

from __future__ import annotations

from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


importDir = Path(__file__).resolve().parent
sourcePath = importDir / "Source" / "Model_SketchfabTraditionalChineseHouse" / "scene.gltf"
outputPath = importDir.parent / "Model" / "Model_ChineseRuralHouse.glb"
sys.path.insert(0, str(importDir.parent / "_blender"))
from AssetBudgets import TriangleTargetForDesired

targetTriangles = 58812
targetSpan = 6.4


def Triangles(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def Flatten(obj: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def Decimate(obj: bpy.types.Object, desired: int) -> None:
    before = Triangles(obj)
    target = TriangleTargetForDesired(before, desired)
    if target >= before:
        return
    modifier = obj.modifiers.new("RuntimeDecimate", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = max(0.001, min(1.0, target / before))
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def Main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(sourcePath))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in objects:
        Flatten(obj)

    sourceTotal = sum(Triangles(obj) for obj in objects)
    resolvedTotal = TriangleTargetForDesired(sourceTotal, targetTriangles)
    allocated = 0
    ordered = sorted(objects, key=lambda item: (Triangles(item), item.name))
    for index, obj in enumerate(ordered):
        before = Triangles(obj)
        if index == len(ordered) - 1:
            desired = max(1, resolvedTotal - allocated)
        else:
            desired = max(1, round(before * resolvedTotal / sourceTotal))
        allocated += desired
        Decimate(obj, desired)

    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    span = max(high.x - low.x, high.y - low.y, high.z - low.z)
    transform = Matrix.Scale(targetSpan / span, 4) @ Matrix.Translation(
        (-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z))
    for obj in objects:
        obj.data.transform(transform)
        obj.location = (0, 0, 0)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth_by_angle()

    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(outputPath), export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True,
    )
    actual = sum(Triangles(obj) for obj in objects)
    print(f"ChineseRuralHouse: {sourceTotal} -> {actual} triangles", flush=True)
    print(f"EXPORTED {outputPath.name} ({outputPath.stat().st_size} bytes)", flush=True)
    print("CHINESE_RURAL_HOUSE_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()

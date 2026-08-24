"""Bake selected Poly Haven CC0 sources into lightweight shared runtime GLBs.

Run with Blender, not system Python:
  blender --background --python Script_ExternalAssetBake.py

The generated files deliberately contain no downloaded textures.  The game
reuses its WoodDoor, GroundRubble, and WoodBeam materials after loading, which
keeps repeated battlefield props small and visually consistent.
"""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Matrix


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "Source"
MODEL = HERE.parent / "Model"


def ResetScene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Import(source_name: str, file_name: str) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    path = SOURCE / source_name / file_name
    bpy.ops.import_scene.gltf(filepath=str(path))
    return [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]


def TriangleCount(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def Join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise RuntimeError(f"No source objects selected for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.convert(target="MESH")
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    # Poly Haven sometimes instances the same mesh for open/closed variants.
    # Make the joined result single-user before applying its node transform.
    obj.data = obj.data.copy()
    obj.data.name = f"Mesh_{name}"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def Optimize(obj: bpy.types.Object, target_triangles: int, target_span: float | None = None) -> tuple[int, int]:
    before = TriangleCount(obj)
    if before > target_triangles:
        modifier = obj.modifiers.new("RuntimeDecimate", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.01, min(1.0, target_triangles / before))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle()

    # Every variant gets a local, ground-ready origin.  Blender is Z-up; the
    # glTF exporter converts this to the game's Y-up coordinate system.
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    min_x = min(point.x for point in corners)
    max_x = max(point.x for point in corners)
    min_y = min(point.y for point in corners)
    max_y = max(point.y for point in corners)
    min_z = min(point.z for point in corners)
    obj.data.transform(Matrix.Translation((-(min_x + max_x) / 2, -(min_y + max_y) / 2, -min_z)))
    if target_span is not None:
        current_span = max(max_x - min_x, max_y - min_y, max(point.z for point in corners) - min_z)
        obj.data.transform(Matrix.Scale(target_span / current_span, 4))
    obj.location = (0, 0, 0)

    # Strip source PBR textures. Runtime replaces this marker material.
    obj.data.materials.clear()
    material = bpy.data.materials.get("RuntimeSharedMaterial")
    if material is None:
        material = bpy.data.materials.new("RuntimeSharedMaterial")
        material.diffuse_color = (0.34, 0.29, 0.22, 1)
        material.use_nodes = False
    obj.data.materials.append(material)
    after = TriangleCount(obj)
    return before, after


def Vector(values):
    # Kept local to avoid exposing Blender math types in the bake declarations.
    from mathutils import Vector as BlenderVector
    return BlenderVector(values)


def Export(objects: list[bpy.types.Object], file_name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    output = MODEL / file_name
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"EXPORTED {output.name} ({output.stat().st_size} bytes)", flush=True)


def BakeCrates() -> None:
    ResetScene()
    imported = Import("Model_PolyHavenOldMilitaryCrate", "old_military_crate_1k.gltf")
    groups = {
        suffix: [item for item in imported if item.name.lower().endswith(suffix)]
        for suffix in ("_a", "_b")
    }
    variants = []
    for suffix, name in (("_a", "MilitaryCrateClosed"), ("_b", "MilitaryCrateOpen")):
        obj = Join(groups[suffix], name)
        before, after = Optimize(obj, 2400)
        print(f"{name}: {before} -> {after} triangles", flush=True)
        variants.append(obj)
    Export(variants, "Model_MilitaryCrateSet.glb")


def BakeStones() -> None:
    ResetScene()
    imported = Import("Model_PolyHavenNamaqualandStones01", "namaqualand_stones_01_1k.gltf")
    variants = []
    stone_spans = (0.45, 0.55, 0.50, 0.40, 0.60)
    for index, source_obj in enumerate(sorted(imported, key=lambda item: item.name), start=1):
        name = f"StackableStone{index:02d}"
        obj = Join([source_obj], name)
        before, after = Optimize(obj, 900, stone_spans[index - 1])
        print(f"{name}: {before} -> {after} triangles", flush=True)
        variants.append(obj)

    extras = (
        ("Model_PolyHavenStone01", "stone_01_1k.gltf", "StackableStone06", 1000, 0.65),
        ("Model_PolyHavenRock07", "rock_07_1k.gltf", "StackableStone07", 900, 0.75),
    )
    for folder, source_file, name, target, span in extras:
        obj = Join(Import(folder, source_file), name)
        before, after = Optimize(obj, target, span)
        print(f"{name}: {before} -> {after} triangles", flush=True)
        variants.append(obj)
    Export(variants, "Model_StackableStoneSet.glb")


def BakeTrunks() -> None:
    ResetScene()
    variants = []
    declarations = (
        ("Model_PolyHavenDeadTreeTrunk", "dead_tree_trunk_1k.gltf", "DeadTreeTrunk01"),
        ("Model_PolyHavenDeadTreeTrunk02", "dead_tree_trunk_02_1k.gltf", "DeadTreeTrunk02"),
    )
    for folder, source_file, name in declarations:
        obj = Join(Import(folder, source_file), name)
        before, after = Optimize(obj, 2400)
        print(f"{name}: {before} -> {after} triangles", flush=True)
        variants.append(obj)
    Export(variants, "Model_DeadTreeTrunkSet.glb")


def Main() -> None:
    MODEL.mkdir(parents=True, exist_ok=True)
    BakeCrates()
    BakeStones()
    BakeTrunks()
    print("EXTERNAL_ASSET_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()

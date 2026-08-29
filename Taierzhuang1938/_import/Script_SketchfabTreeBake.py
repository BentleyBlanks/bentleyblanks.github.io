"""Bake three approved Sketchfab leafless trees into one lightweight runtime GLB.

Run with Blender:
  blender --background --python Script_SketchfabTreeBake.py

Every source is CC-BY-4.0.  The downloaded ``license.txt`` beside each source
is retained verbatim, while the runtime mesh drops the source texture and uses
the game's shared TreeBark material.  All variants are centered, grounded and
normalized to the same reference height so placement code can scale by metres.
"""

from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Matrix, Vector


importDir = Path(__file__).resolve().parent
sourceDir = importDir / "Source"
modelDir = importDir.parent / "Model"
referenceHeight = 7.0

treeSpecs = (
    ("Model_SketchfabOldOakWithoutLeavesHighPoly", "LeaflessTreeOak", 24000, None),
    ("Model_SketchfabTreeWithoutLeaves01", "LeaflessTree01", 30000, None),
    # This download also contains two disconnected decorative-card meshes
    # (``tree_twig`` and ``tree_plamatisate``).  They collapse into floating
    # shards under simplification and are not part of the woody tree silhouette.
    ("Model_SketchfabTreeWithoutLeavesLowPoly", "LeaflessTreeLowPoly", 12000, {"Tree__0"}),
)


def ResetScene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Import(folder: str, objectNames: set[str] | None = None) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sourceDir / folder / "scene.gltf"))
    objects = [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]
    if objectNames is not None:
        objects = [obj for obj in objects if obj.name in objectNames]
    return objects


def Flatten(obj: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world


def Join(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    if not objects:
        raise RuntimeError("No mesh objects found for " + name)
    for obj in objects:
        Flatten(obj)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    result = bpy.context.object
    result.data = result.data.copy()
    result.name = name
    result.data.name = "Mesh_" + name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return result


def TriangleCount(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def Marker() -> bpy.types.Material:
    material = bpy.data.materials.get("TreeBark")
    if material is None:
        material = bpy.data.materials.new("TreeBark")
        material.diffuse_color = (0.30, 0.23, 0.17, 1)
        material.use_nodes = False
    return material


def Optimize(obj: bpy.types.Object, targetTriangles: int) -> tuple[int, int, tuple[float, float, float]]:
    before = TriangleCount(obj)
    def Normalize() -> None:
        # Read the current mesh, not ``Object.bound_box``: immediately after a
        # modifier apply Blender can leave that cached box one topology behind.
        obj.data.update()
        usedIndices = {index for polygon in obj.data.polygons for index in polygon.vertices}
        points = [obj.data.vertices[index].co for index in usedIndices]
        low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
        high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
        height = high.z - low.z
        if height <= 0.001:
            raise RuntimeError(f"{obj.name} has invalid vertical span {height}")
        obj.data.transform(Matrix.Translation(
            (-(low.x + high.x) / 2, -(low.y + high.y) / 2, -low.z)))
        obj.data.transform(Matrix.Scale(referenceHeight / height, 4))
        obj.data.update()
        obj.location = (0, 0, 0)

    Normalize()

    def Decimate(name: str, goal: int = targetTriangles) -> None:
        current = TriangleCount(obj)
        if current <= goal:
            return
        modifier = obj.modifiers.new(name, "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.001, min(1.0, goal / current))
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    # Keep the authored cylindrical branch topology.  Voxel union destroys
    # sub-decimetre twigs, while aggressive collapse turns every disconnected
    # twig shell into a floating triangle.  The budgets below are deliberately
    # high enough to retain a readable silhouette and are paid once per GPU
    # instance rather than once per draw call.
    Decimate("RuntimeDecimate")
    # Collapse can move the lowest surviving trunk vertex by centimetres.
    # Reassert the shared seven-metre, ground-at-zero contract after topology
    # changes so runtime placement never has to carry per-variant offsets.
    Normalize()

    obj.data.validate(clean_customdata=True)
    obj.data.update()

    obj.data.materials.clear()
    obj.data.materials.append(Marker())
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    # Voxel-unioned branch skins are intentionally irregular; angle-limited
    # smoothing exposes every remesh triangle as a black shard in the game.
    # Trees have no authored hard-surface edges, so smooth the full surface.
    bpy.ops.object.shade_smooth()

    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
    size = tuple(high[axis] - low[axis] for axis in range(3))
    return before, TriangleCount(obj), size


def Export(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    output = modelDir / "Model_LeaflessTreeSet.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_apply=True, export_materials="EXPORT", export_yup=True,
    )
    print(f"EXPORTED {output.name} ({output.stat().st_size} bytes)", flush=True)


def Main() -> None:
    modelDir.mkdir(parents=True, exist_ok=True)
    ResetScene()
    variants = []
    for folder, runtimeName, targetTriangles, objectNames in treeSpecs:
        obj = Join(Import(folder, objectNames), runtimeName)
        before, after, size = Optimize(obj, targetTriangles)
        print(
            f"{runtimeName}: {before} -> {after} triangles; "
            f"size={size[0]:.3f} x {size[1]:.3f} x {size[2]:.3f} m",
            flush=True,
        )
        variants.append(obj)
    Export(variants)
    print("SKETCHFAB_TREE_BAKE_OK", flush=True)


if __name__ == "__main__":
    Main()

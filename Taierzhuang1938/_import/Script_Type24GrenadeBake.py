"""Bake the CC-BY Sketchfab Type 24 stick grenade into the runtime GLB.

Run with Blender:
  blender --background --python Script_Type24GrenadeBake.py

The source download remains under ``Source/Model_SketchfabType24Grenade`` with
its generated license text.  The runtime asset is deliberately a separate,
metric GLB: it has one centred origin, a 0.22 m longest axis, and 1K PBR maps
instead of the source's 2K payload.  Script_GrenadeAsset.mjs shares this one
mesh between the first-person prop and the pool of thrown grenades.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "Source" / "Model_SketchfabType24Grenade" / "scene.gltf"
OUTPUT = HERE.parent / "Model" / "Model_Type24Grenade.glb"
TARGET_LENGTH_M = 0.220
TARGET_TEXTURE_PX = 1024


def TriangleCount(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def Bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        for axis in range(3):
            lo[axis] = min(lo[axis], point[axis])
            hi[axis] = max(hi[axis], point[axis])
    return lo, hi


def AlignLongestAxisToZ(obj: bpy.types.Object) -> None:
    """Keep the grenade's long axis on local Z, matching the old prop contract."""
    lo, hi = Bounds(obj)
    extents = [hi[axis] - lo[axis] for axis in range(3)]
    longest = max(range(3), key=lambda axis: extents[axis])
    if longest == 2:
        return
    # Source glTF is Y-up while Blender is Z-up, but preserve this as a
    # measured rule rather than relying on exporter-specific axes.
    rotation = Matrix.Rotation(-1.5707963267948966, 4, "Y" if longest == 0 else "X")
    obj.data.transform(rotation)


def Main() -> None:
    if not SOURCE.is_file():
        raise RuntimeError(f"Missing Type 24 source: {SOURCE}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one grenade mesh, got {len(meshes)}")
    grenade = meshes[0]
    bpy.context.view_layer.objects.active = grenade
    grenade.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    AlignLongestAxisToZ(grenade)
    # Source has the explosive head at +Z.  The game grenade contract is the
    # opposite (head towards local -Z), shared by the held prop and physics
    # projectile, so both placements get the correct silhouette without a
    # per-call rotation correction.
    grenade.data.transform(Matrix.Rotation(math.pi, 4, "X"))

    lo, hi = Bounds(grenade)
    span = max(hi[axis] - lo[axis] for axis in range(3))
    if span <= 0:
        raise RuntimeError("Type 24 source has an empty bounding box")
    grenade.data.transform(Matrix.Translation((
        -(lo.x + hi.x) * 0.5,
        -(lo.y + hi.y) * 0.5,
        -(lo.z + hi.z) * 0.5,
    )))
    grenade.data.transform(Matrix.Scale(TARGET_LENGTH_M / span, 4))
    grenade.name = "Type24Grenade"
    grenade.data.name = "Mesh_Type24Grenade"

    for image in bpy.data.images:
        if image.size[0] > TARGET_TEXTURE_PX or image.size[1] > TARGET_TEXTURE_PX:
            aspect = image.size[1] / image.size[0]
            image.scale(TARGET_TEXTURE_PX, max(1, round(TARGET_TEXTURE_PX * aspect)))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    grenade.select_set(True)
    bpy.context.view_layer.objects.active = grenade
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_yup=True,
    )
    lo, hi = Bounds(grenade)
    size = hi - lo
    print(
        f"TYPE24_GRENADE_BAKE_OK tris={TriangleCount(grenade)} "
        f"size=({size.x:.4f},{size.y:.4f},{size.z:.4f}) bytes={OUTPUT.stat().st_size}",
        flush=True,
    )


if __name__ == "__main__":
    Main()

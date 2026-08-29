"""Bake canonical first-person hands and uniform sleeves from Lugou NRA model 01.

The shipped third-person GLB is the user-provided NRA model 01. This baker poses
it on the first frame of its authored RifleIdle clip, keeps the two forearm / hand /
finger vertex sets, applies the original skin, and converts each side into the
viewmodel grip frame: +X = held-object axis, -Y = palm, +Z = fingers.

The exported meshes are static on purpose. Script_Viewmodel already owns the
weapon-specific animated hand targets; parenting these authored, posed meshes to
those targets is more stable than retargeting a second full arm skeleton at runtime.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


def ParseArgs() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(args)


def FindSource() -> tuple[bpy.types.Object, bpy.types.Object]:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and len(obj.vertex_groups) > 0]
    if len(armatures) != 1 or len(meshes) != 1:
        raise RuntimeError(f"expected one armature and one skinned mesh, got {len(armatures)} / {len(meshes)}")
    return armatures[0], meshes[0]


def PoseRifleIdle(armature: bpy.types.Object) -> None:
    action = next((item for item in bpy.data.actions if item.name == "RifleIdle"), None)
    if action is None:
        raise RuntimeError("RifleIdle action is missing")
    armature.animation_data_create().action = action
    bpy.context.scene.frame_set(int(action.frame_range[0]))
    bpy.context.view_layer.update()


def IsSideGroup(name: str, side: str) -> bool:
    normalized = f" {name.lower().replace('_', ' ')} "
    return f" {side.lower()} " in normalized and any(
        marker in normalized for marker in (" hand", "finger")
    )


def DeleteOtherVertices(mesh: bpy.types.Object, side: str) -> None:
    groups = {group.index for group in mesh.vertex_groups if IsSideGroup(group.name, side)}
    if not groups:
        raise RuntimeError(f"no {side} arm vertex groups")
    keep = [
        sum(group.weight for group in vertex.groups if group.group in groups) >= 0.20
        for vertex in mesh.data.vertices
    ]
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex, wanted in zip(mesh.data.vertices, keep):
        vertex.select = not wanted
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")


def SourceSocketMatrix(armature: bpy.types.Object, side: str) -> Matrix:
    """Rebuild the generated socket from the posed wrist without Blender's Empty bug."""
    wrist = armature.pose.bones.get(f"Bip002 {side} Hand")
    if wrist is None:
        raise RuntimeError(f"Bip002 {side} Hand is missing")
    local = Matrix.Translation(Vector((0, 9.18953, 0))) @ Quaternion(
        (0.70710678, 0.70710678, 0, 0)
    ).to_matrix().to_4x4()
    return armature.matrix_world @ wrist.matrix @ local


def DeleteNonSkinFaces(mesh: bpy.types.Object) -> None:
    """Discard the tiny hand-weighted uniform shards; the runtime sleeve covers the wrist."""
    skin_slots = {
        index for index, material in enumerate(mesh.data.materials)
        if material and material.name == "John_All Body"
    }
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for polygon in mesh.data.polygons:
        polygon.select = polygon.material_index not in skin_slots
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")


def BakeSide(source: bpy.types.Object, armature: bpy.types.Object, side: str) -> bpy.types.Object:
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    bpy.context.collection.objects.link(duplicate)
    DeleteOtherVertices(duplicate, side)
    DeleteNonSkinFaces(duplicate)
    bpy.context.view_layer.update()

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = duplicate.evaluated_get(depsgraph)
    baked_data = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    baked = bpy.data.objects.new(f"Hand{'Left' if side == 'L' else 'Right'}", baked_data)
    bpy.context.collection.objects.link(baked)
    baked.data.transform(duplicate.matrix_world)

    socket_matrix = SourceSocketMatrix(armature, side)
    origin = socket_matrix.translation.copy()
    basis = socket_matrix.to_3x3()
    grip = (basis @ Vector((1, 0, 0))).normalized()
    fingers = (basis @ Vector((0, 1, 0))).normalized()
    back = (basis @ Vector((0, 0, 1))).normalized()

    for vertex in baked.data.vertices:
        relative = vertex.co - origin
        vertex.co = Vector((relative.dot(grip), relative.dot(back), relative.dot(fingers)))
    baked.matrix_world = Matrix.Identity(4)

    bpy.data.objects.remove(duplicate, do_unlink=True)
    return baked


def CleanMaterialSlots(mesh: bpy.types.Object) -> None:
    used = {polygon.material_index for polygon in mesh.data.polygons}
    for index in reversed(range(len(mesh.data.materials))):
        if index not in used:
            mesh.data.materials.pop(index=index)
            for polygon in mesh.data.polygons:
                if polygon.material_index > index:
                    polygon.material_index -= 1


def Export(output: Path, hands: list[bpy.types.Object]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for hand in hands:
        CleanMaterialSlots(hand)
        hand.select_set(True)
    bpy.context.view_layer.objects.active = hands[0]
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_animations=False, export_skins=False,
        export_image_format="WEBP", export_image_add_webp=True,
        export_image_webp_fallback=False,
    )


def Main() -> None:
    args = ParseArgs()
    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(input_path), import_shading="NORMALS")
    armature, source = FindSource()
    PoseRifleIdle(armature)
    hands = [BakeSide(source, armature, "R"), BakeSide(source, armature, "L")]
    Export(output_path, hands)
    print(f"Baked {output_path.name}: " + ", ".join(
        f"{hand.name}={len(hand.data.vertices)} vertices" for hand in hands
    ))


if __name__ == "__main__":
    Main()

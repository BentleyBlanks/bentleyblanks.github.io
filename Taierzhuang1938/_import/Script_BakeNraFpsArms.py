"""Derive the first-person skeletal arms from shipped Lugou NRA model 01.

The input is ``Model/Character/Model_LugouNra01.glb``: the same audited 53-bone,
16-clip character used by third-person actors. This baker keeps the original
armature, animation clips, skin weights, uniform sleeves, hands and all finger
chains, then removes vertices that are not influenced by either arm.

Do not apply the armature modifier here. The 2026-08-30 static-hand bake did so
and exported ``skins=0 / animations=0``; runtime could only teleport two rigid
hand meshes to coarse targets. The first-person runtime now solves the authored
upper-arm -> forearm -> hand chains and uses the source clips as finger-pose
profiles, so losing the skin or clips is a hard bake failure.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

import bpy


EXPECTED_ACTIONS = (
    "LeanWallSitPeek",
    "RifleIdle",
    "RifleIdleAlt",
    "RifleRun",
    "CrouchFire",
    "CrouchFireAlt",
    "CrouchIdle",
    "MachineGunFire",
    "EmplacementIdle",
    "AttackCommand",
    "ProneFire",
    "StandFireCrouch",
    "StandFireCrouchAlt",
    "AdvanceKneelFire",
    "AdvanceFire",
    "PistolFire",
)
PROFILE_ACTIONS = {
    "rifle": "RifleIdle",
    "lmg": "MachineGunFire",
    "pistol": "PistolFire",
    "melee": "RifleIdle",
    "throwable": "AttackCommand",
}
ARM_ROLE_SUFFIXES = (
    "clavicle",
    "upperarm",
    "forearm",
    "hand",
    "finger0",
    "finger01",
    "finger02",
    "finger1",
    "finger11",
    "finger12",
    "finger2",
    "finger21",
    "finger22",
    "finger3",
    "finger31",
    "finger32",
    "finger4",
    "finger41",
    "finger42",
)
# Shoulder vertices blend into the torso in the source character.  Treating a
# token arm weight as ownership kept long torso wedges in the first-person
# export; IK then stretched those wedges across the camera and exposed their
# open back faces.  A vertex belongs to the arms only when the arm chains carry
# at least half of its normalized skin influence.
MIN_ARM_INFLUENCE = 0.5
REQUIRED_BONE_SUFFIXES = tuple(
    f"{side}{role}"
    for side in ("l", "r")
    for role in ("clavicle", "upperarm", "forearm", "hand", "finger0", "finger1", "finger4")
)


def ParseArgs() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(args)


def NormalizeName(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def FindSource() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        and len(obj.vertex_groups) > 0
        and any(modifier.type == "ARMATURE" for modifier in obj.modifiers)
    ]
    if len(armatures) != 1 or not meshes:
        raise RuntimeError(
            f"expected one armature and at least one skinned mesh, got {len(armatures)} / {len(meshes)}"
        )
    return armatures[0], meshes


def IsArmGroup(name: str) -> bool:
    normalized = NormalizeName(name)
    return any(
        normalized.endswith(f"{side}{suffix}")
        for side in ("l", "r")
        for suffix in ARM_ROLE_SUFFIXES
    )


def DeleteNonArmVertices(mesh: bpy.types.Object) -> tuple[int, int]:
    armGroups = {group.index for group in mesh.vertex_groups if IsArmGroup(group.name)}
    if not armGroups:
        raise RuntimeError(f"{mesh.name}: no arm vertex groups")
    originalCount = len(mesh.data.vertices)
    keep = []
    for vertex in mesh.data.vertices:
        armWeight = sum(
            assignment.weight
            for assignment in vertex.groups
            if assignment.group in armGroups
        )
        keep.append(armWeight >= MIN_ARM_INFLUENCE)
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex, wanted in zip(mesh.data.vertices, keep, strict=True):
        vertex.select = not wanted
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.select_set(False)
    return originalCount, len(mesh.data.vertices)


def CleanMaterialSlots(mesh: bpy.types.Object) -> None:
    used = {polygon.material_index for polygon in mesh.data.polygons}
    for index in reversed(range(len(mesh.data.materials))):
        if index in used:
            continue
        mesh.data.materials.pop(index=index)
        for polygon in mesh.data.polygons:
            if polygon.material_index > index:
                polygon.material_index -= 1


def SubdivideForFirstPerson(mesh: bpy.types.Object) -> None:
    """One restrained Catmull-Clark pass; the third-person source is faceted at 25 cm."""
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    modifier = mesh.modifiers.new(name="FirstPersonSurface", type="SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = 1
    modifier.render_levels = 1
    # Interpolate bind vertices/weights before the armature, never bake a posed mesh.
    while mesh.modifiers.find(modifier.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    result = bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh.select_set(False)
    if "FINISHED" not in result:
        raise RuntimeError(f"{mesh.name}: first-person subdivision failed")


def ActionNames() -> set[str]:
    return {action.name for action in bpy.data.actions}


def ValidateSource(armature: bpy.types.Object) -> None:
    boneNames = {NormalizeName(bone.name) for bone in armature.data.bones}
    missingBones = [
        suffix for suffix in REQUIRED_BONE_SUFFIXES
        if not any(name.endswith(suffix) for name in boneNames)
    ]
    missingActions = sorted(set(EXPECTED_ACTIONS) - ActionNames())
    if missingBones or missingActions:
        raise RuntimeError(
            f"source contract failed: missing bones={missingBones}, missing actions={missingActions}"
        )


def Prepare(armature: bpy.types.Object, meshes: list[bpy.types.Object]) -> dict[str, object]:
    ValidateSource(armature)
    counts = {}
    keptMeshes = []
    for mesh in meshes:
        before, after = DeleteNonArmVertices(mesh)
        if after <= 0:
            bpy.data.objects.remove(mesh, do_unlink=True)
            continue
        CleanMaterialSlots(mesh)
        SubdivideForFirstPerson(mesh)
        mesh.name = "Mesh_FpsArmsNraSkeletal01" if not keptMeshes else f"Mesh_FpsArmsNraSkeletal01_{len(keptMeshes) + 1}"
        counts[mesh.name] = {
            "sourceVertices": before,
            "keptVertices": after,
            "firstPersonVertices": len(mesh.data.vertices),
        }
        keptMeshes.append(mesh)
    if not keptMeshes:
        raise RuntimeError("arm filtering removed every skinned mesh")
    armature.name = "Rig_FpsArmsNraSkeletal01"
    armature.data.name = "Rig_FpsArmsNraSkeletal01"
    armature["fpsArmSource"] = "Model_LugouNra01"
    armature["fpsArmInfluenceMinimum"] = MIN_ARM_INFLUENCE
    armature["fpsGripProfiles"] = json.dumps(PROFILE_ACTIONS, separators=(",", ":"))
    return {"meshes": keptMeshes, "counts": counts}


def Export(output: Path, armature: bpy.types.Object, meshes: list[bpy.types.Object]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = armature
    result = bpy.ops.export_scene.gltf(
        filepath=str(output),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=82,
        export_image_add_webp=True,
        export_image_webp_fallback=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_skins=True,
        export_all_influences=False,
        export_influence_nb=4,
        export_def_bones=True,
        export_optimize_animation_size=False,
        export_optimize_animation_keep_anim_armature=True,
        export_optimize_animation_keep_anim_object=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
    )
    if "FINISHED" not in result or not output.is_file():
        raise RuntimeError(f"glTF export failed: {output}")


def ValidateOutput(output: Path) -> dict[str, object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(output), import_pack_images=False)
    if "FINISHED" not in result:
        raise RuntimeError(f"fresh glTF import failed: {output}")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and any(modifier.type == "ARMATURE" for modifier in obj.modifiers)
    ]
    if len(armatures) != 1 or not meshes:
        raise RuntimeError(
            f"fresh GLB lost its rig: armatures={len(armatures)}, skinned meshes={len(meshes)}"
        )
    armature = armatures[0]
    ValidateSource(armature)
    return {
        "armatures": len(armatures),
        "skinnedMeshes": len(meshes),
        "bones": len(armature.data.bones),
        "animations": sorted(ActionNames()),
        "vertices": sum(len(mesh.data.vertices) for mesh in meshes),
    }


def Main() -> None:
    args = ParseArgs()
    inputPath = args.input.resolve()
    outputPath = args.output.resolve()
    if not inputPath.is_file():
        raise FileNotFoundError(inputPath)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(inputPath), import_pack_images=False)
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF import failed: {inputPath}")
    armature, meshes = FindSource()
    prepared = Prepare(armature, meshes)
    Export(outputPath, armature, prepared["meshes"])
    validation = ValidateOutput(outputPath)
    print(json.dumps({"output": str(outputPath), "filter": prepared["counts"], **validation}, indent=2))


if __name__ == "__main__":
    Main()

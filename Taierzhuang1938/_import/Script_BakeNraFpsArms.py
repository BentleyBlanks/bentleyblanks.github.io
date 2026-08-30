"""Derive the first-person skeletal arms from shipped Lugou NRA model 01.

The input is ``Model/Character/Model_LugouNra01.glb``: the same audited 53-bone,
16-clip character used by third-person actors. This baker keeps the original
armature, animation clips, uniform sleeves, hands and all finger chains, then
removes vertices that are not meaningfully influenced by either arm. Retained
vertices are normalized to arm-only weights: a first-person shoulder seam must
not remain partly pinned to the hidden spine/torso while the clavicle moves.

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
import struct
import sys

import bpy
from mathutils import Matrix


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
ARM_WEIGHT_MIN = 0.50
TRANSFORM_EPSILON = 1e-5
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
    # 0.02 kept large torso/cape triangles whose only relationship to the arms
    # was a tiny clavicle blend.  In first person those triangles hung below the
    # wrists as torn sheets.  Keep the sleeve seam, but require the arms to own
    # a meaningful share of every exported vertex.
    keep = [
        sum(assignment.weight for assignment in vertex.groups if assignment.group in armGroups)
        >= ARM_WEIGHT_MIN
        for vertex in mesh.data.vertices
    ]
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
    # The source shoulder/cape seam blends arm groups with Spine1/Spine2.  Once
    # the torso is removed those non-arm weights become invisible anchors: an
    # overhead throw moves the arm-owned end of a face while its spine-owned
    # end stays behind, producing metre-long triangular spikes despite perfect
    # grip residuals.  A viewmodel arm is an arm-only skin; discard the hidden
    # torso influences and renormalize every retained vertex deterministically.
    for group in reversed(list(mesh.vertex_groups)):
        if not IsArmGroup(group.name):
            mesh.vertex_groups.remove(group)
    for vertex in mesh.data.vertices:
        assignments = [(item.group, item.weight) for item in vertex.groups]
        total = sum(weight for _, weight in assignments)
        if total <= 1e-8:
            raise RuntimeError(f"{mesh.name}: retained vertex {vertex.index} lost all arm weights")
        for groupIndex, weight in assignments:
            mesh.vertex_groups[groupIndex].add([vertex.index], weight / total, "REPLACE")
    return originalCount, len(mesh.data.vertices)


def AuditArmOnlyWeights(mesh: bpy.types.Object) -> dict[str, float]:
    nonArmWeight = 0.0
    normalizationError = 0.0
    for vertex in mesh.data.vertices:
        total = 0.0
        for assignment in vertex.groups:
            group = mesh.vertex_groups[assignment.group]
            total += assignment.weight
            if not IsArmGroup(group.name):
                nonArmWeight = max(nonArmWeight, assignment.weight)
        normalizationError = max(normalizationError, abs(total - 1.0))
    if nonArmWeight > TRANSFORM_EPSILON or normalizationError > TRANSFORM_EPSILON:
        raise RuntimeError(
            f"{mesh.name}: arm-only weight contract failed "
            f"nonArm={nonArmWeight} normalizationError={normalizationError}"
        )
    return {
        "maxNonArmWeight": nonArmWeight,
        "maxWeightNormalizationError": normalizationError,
    }


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


def BasisAudit(matrix: Matrix) -> dict[str, float]:
    basis = matrix.to_3x3()
    columns = [basis.col[index].copy() for index in range(3)]
    scales = [column.length for column in columns]
    unit = [column.normalized() if column.length > 1e-12 else column for column in columns]
    shear = max(abs(unit[a].dot(unit[b])) for a, b in ((0, 1), (0, 2), (1, 2)))
    return {
        "minScale": min(scales),
        "maxScale": max(scales),
        "maxShear": shear,
        "determinant": basis.determinant(),
    }


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
    # Keep the imported glTF armature/mesh transform relationship intact.  The
    # source uses a positive, uniform 0.01 adapter above the actual Biped bones;
    # applying that transform to only part of a skinned hierarchy changes the
    # coordinate space expected by the inverse bind matrices and explodes the
    # mesh.  The adapter is harmless; actual joint nodes are audited below.
    counts = {}
    keptMeshes = []
    for mesh in meshes:
        before, after = DeleteNonArmVertices(mesh)
        if after <= 0:
            bpy.data.objects.remove(mesh, do_unlink=True)
            continue
        CleanMaterialSlots(mesh)
        weightAudit = AuditArmOnlyWeights(mesh)
        SubdivideForFirstPerson(mesh)
        weightAudit = AuditArmOnlyWeights(mesh)
        mesh.name = "Mesh_FpsArmsNraSkeletal01" if not keptMeshes else f"Mesh_FpsArmsNraSkeletal01_{len(keptMeshes) + 1}"
        counts[mesh.name] = {
            "sourceVertices": before,
            "keptVertices": after,
            "firstPersonVertices": len(mesh.data.vertices),
            **weightAudit,
        }
        keptMeshes.append(mesh)
    if not keptMeshes:
        raise RuntimeError("arm filtering removed every skinned mesh")
    armature.name = "Rig_FpsArmsNraSkeletal01"
    armature.data.name = "Rig_FpsArmsNraSkeletal01"
    armature["fpsArmSource"] = "Model_LugouNra01"
    armature["fpsArmInfluenceMinimum"] = ARM_WEIGHT_MIN
    armature["fpsGripProfiles"] = json.dumps(PROFILE_ACTIONS, separators=(",", ":"))
    armature["fpsRigContract"] = "uniform-adapter-unit-joints-arm-only-anatomy-v4"
    armature["fpsArmWeightMinimum"] = ARM_WEIGHT_MIN
    armature["fpsArmOnlyWeights"] = True
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
        # Preserve the armature adapter, mesh coordinates and inverse bind
        # matrices as one coherent coordinate system.
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
    )
    if "FINISHED" not in result or not output.is_file():
        raise RuntimeError(f"glTF export failed: {output}")


def ValidateOutput(output: Path) -> dict[str, object]:
    payload = output.read_bytes()
    jsonLength, jsonType = struct.unpack_from("<II", payload, 12)
    if jsonType != 0x4E4F534A:
        raise RuntimeError(f"first GLB chunk is not JSON: {output}")
    document = json.loads(payload[20 : 20 + jsonLength].rstrip(b" \0").decode("utf8"))
    runtimeNodes = [
        node for node in document.get("nodes", [])
        if node.get("name") == "Rig_FpsArmsNraSkeletal01"
    ]
    if len(runtimeNodes) != 1:
        raise RuntimeError(f"expected one GLB runtime armature node: {runtimeNodes}")
    adapterScale = runtimeNodes[0].get("scale", [1.0, 1.0, 1.0])
    if min(adapterScale) <= 0 or max(adapterScale) - min(adapterScale) > TRANSFORM_EPSILON:
        raise RuntimeError(f"GLB armature adapter is mirrored/nonuniform: {adapterScale}")
    jointIndices = sorted({joint for skin in document.get("skins", []) for joint in skin.get("joints", [])})
    if not jointIndices:
        raise RuntimeError("GLB has no skin joints")
    badJointScales = []
    nodes = document.get("nodes", [])
    for jointIndex in jointIndices:
        node = nodes[jointIndex]
        scale = node.get("scale", [1.0, 1.0, 1.0])
        if any(abs(component - 1.0) > TRANSFORM_EPSILON for component in scale):
            badJointScales.append((node.get("name", jointIndex), scale))
    if badJointScales:
        raise RuntimeError(f"GLB bone nodes are not unit scale: {badJointScales[:8]}")
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
    transformAudit = {}
    weightAudit = {}
    for obj in [armature, *meshes]:
        audit = BasisAudit(obj.matrix_world)
        transformAudit[obj.name] = {
            **audit,
            "scale": [float(component) for component in obj.scale],
        }
        # Blender's glTF importer intentionally recreates the positive uniform
        # adapter object for armatures.  Actual GLB joint nodes are unit scale;
        # fresh import still audits sign and shear.
        if obj is not armature and any(abs(component - 1.0) > TRANSFORM_EPSILON for component in obj.scale):
            raise RuntimeError(f"fresh GLB has non-unit object scale: {obj.name} {tuple(obj.scale)}")
        if audit["determinant"] <= 0 or audit["maxShear"] > TRANSFORM_EPSILON:
            raise RuntimeError(f"fresh GLB has mirrored/sheared object basis: {obj.name} {audit}")
        if obj.type == "MESH":
            weightAudit[obj.name] = AuditArmOnlyWeights(obj)
    boneScaleError = 0.0
    for poseBone in armature.pose.bones:
        for component in poseBone.matrix.to_scale():
            boneScaleError = max(boneScaleError, abs(component - 1.0))
    if boneScaleError > TRANSFORM_EPSILON:
        raise RuntimeError(f"fresh GLB pose bones are not unit scale: max error {boneScaleError}")
    return {
        "armatures": len(armatures),
        "skinnedMeshes": len(meshes),
        "bones": len(armature.data.bones),
        "animations": sorted(ActionNames()),
        "vertices": sum(len(mesh.data.vertices) for mesh in meshes),
        "boneScaleError": boneScaleError,
        "adapterScale": adapterScale,
        "unitJointNodes": len(jointIndices),
        "transformAudit": transformAudit,
        "weightAudit": weightAudit,
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

"""Consolidate the 3ds Max FBX bridge into ten web-ready animated GLBs.

Input is produced by ``Script_ExportLugouCharacters.ms``.  Each bind-pose FBX contains the
original Skin/Physique deformation and materials; the animation FBXs contain one canonical
Biped hierarchy baked at one sample per frame.  This baker combines the sixteen actions,
adds semantic weapon/back/hand sockets, embeds textures as WebP and validates every fresh
GLB import before writing the manifest consumed by the browser runtime.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
import re
import sys
import time

import bpy
from mathutils import Matrix, Vector


MODEL_PATTERN = re.compile(r"^Model_(Lugou(?:Nra|Ija)\d{2})\.fbx$", re.IGNORECASE)
ACTION_PATTERN = re.compile(
    r"^Animation_LugouCanonical_([A-Za-z][A-Za-z0-9]*)\.fbx$",
    re.IGNORECASE,
)
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
CORE_BONES = {
    "head": ("head",),
    "neck": ("neck",),
    "chest": ("spine2", "spine1", "spine"),
    "pelvis": ("pelvis",),
    "handR": ("rhand", "handr", "righthand"),
    "handL": ("lhand", "handl", "lefthand"),
    "footR": ("rfoot", "footr", "rightfoot"),
    "footL": ("lfoot", "footl", "leftfoot"),
    "upperArmR": ("rupperarm", "upperarmr", "rightupperarm"),
    "upperArmL": ("lupperarm", "upperarml", "leftupperarm"),
    "forearmR": ("rforearm", "forearmr", "rightforearm"),
    "forearmL": ("lforearm", "forearml", "leftforearm"),
    "thighR": ("rthigh", "thighr", "rightthigh"),
    "thighL": ("lthigh", "thighl", "leftthigh"),
    "calfR": ("rcalf", "calfr", "rightcalf"),
    "calfL": ("lcalf", "calfl", "leftcalf"),
}
REQUIRED_CORE_BONES = frozenset(("head", "neck", "chest", "pelvis", "handR", "handL", "footR", "footL"))
SOCKETS = {
    "Socket_WeaponR": "handR",
    "Socket_WeaponL": "handL",
    "Socket_BackBlade": "chest",
    "Socket_HeadGear": "head",
}


def ParseArgs() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--texture-dir", type=Path)
    parser.add_argument("--keep-blend", action="store_true")
    return parser.parse_args(argv)


def NormalizeName(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def FindBone(armature: bpy.types.Object, aliases: tuple[str, ...]) -> bpy.types.Bone | None:
    normalized = [(bone, NormalizeName(bone.name)) for bone in armature.data.bones]
    for alias in aliases:
        wanted = NormalizeName(alias)
        for bone, name in normalized:
            if name.endswith(wanted):
                return bone
    return None


def CoreBoneMap(armature: bpy.types.Object) -> dict[str, str]:
    resolved: dict[str, str] = {}
    for role, aliases in CORE_BONES.items():
        bone = FindBone(armature, aliases)
        if bone is not None:
            resolved[role] = bone.name
    return resolved


def ResetScene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ImportFbx(path: Path, useAnimation: bool) -> tuple[list[bpy.types.Object], list[bpy.types.Action]]:
    beforeObjects = set(bpy.data.objects)
    beforeActions = set(bpy.data.actions)
    result = bpy.ops.import_scene.fbx(
        filepath=str(path),
        use_anim=useAnimation,
        use_custom_normals=True,
        use_image_search=False,
        ignore_leaf_bones=True,
        automatic_bone_orientation=False,
        use_prepost_rot=True,
        bake_space_transform=False,
        global_scale=1.0,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"FBX import failed: {path}")
    return (
        [obj for obj in bpy.data.objects if obj not in beforeObjects],
        [action for action in bpy.data.actions if action not in beforeActions],
    )


def MainArmature(objects: list[bpy.types.Object]) -> bpy.types.Object:
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("FBX has no armature")
    armatures.sort(key=lambda obj: len(obj.data.bones), reverse=True)
    return armatures[0]


def SkinnedMeshes(objects: list[bpy.types.Object]) -> list[bpy.types.Object]:
    return [
        obj
        for obj in objects
        if obj.type == "MESH"
        and any(modifier.type == "ARMATURE" for modifier in obj.modifiers)
        and len(obj.vertex_groups) > 0
    ]


def WorldBounds(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    low = Vector((float("inf"), float("inf"), float("inf")))
    high = Vector((float("-inf"), float("-inf"), float("-inf")))
    for mesh in meshes:
        for corner in mesh.bound_box:
            point = mesh.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    if not all(value < float("inf") for value in low):
        raise RuntimeError("could not measure character bounds")
    return low, high


def NormalizeCharacterFrame(
    modelId: str,
    importedObjects: list[bpy.types.Object],
    meshes: list[bpy.types.Object],
) -> tuple[bpy.types.Object, dict[str, list[float]]]:
    """Remove the five-person Max layout offset and put the soles on local Z=0."""
    importedSet = set(importedObjects)
    exportRoot = bpy.data.objects.new(f"Character_{modelId}", None)
    bpy.context.scene.collection.objects.link(exportRoot)
    for obj in importedObjects:
        if obj.parent not in importedSet:
            world = obj.matrix_world.copy()
            obj.parent = exportRoot
            obj.matrix_world = world
    bpy.context.view_layer.update()
    low, high = WorldBounds(meshes)
    exportRoot.location = (-(low.x + high.x) * 0.5, -(low.y + high.y) * 0.5, -low.z)
    bpy.context.view_layer.update()
    low, high = WorldBounds(meshes)
    size = high - low
    return exportRoot, {
        "min": [round(value, 6) for value in low],
        "max": [round(value, 6) for value in high],
        "size": [round(value, 6) for value in size],
    }


def BuildTextureIndex(textureDir: Path | None) -> dict[str, list[Path]]:
    index: dict[str, list[Path]] = defaultdict(list)
    if textureDir is None or not textureDir.is_dir():
        return index
    for path in textureDir.rglob("*"):
        if path.is_file():
            index[path.name.casefold()].append(path)
    return index


def RelinkImages(textureIndex: dict[str, list[Path]]) -> list[str]:
    missing: list[str] = []
    for image in bpy.data.images:
        if image.source not in {"FILE", "SEQUENCE"}:
            continue
        current = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
        if current and current.is_file():
            continue
        basename = Path(image.filepath).name.casefold() if image.filepath else image.name.casefold()
        matches = textureIndex.get(basename, [])
        if matches:
            image.filepath = str(matches[0])
            try:
                image.reload()
            except RuntimeError:
                missing.append(image.name)
        else:
            missing.append(image.name)
    return sorted(set(missing))


def RemoveImportedObjects(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def BoneTopology(armature: bpy.types.Object) -> tuple[int, ...]:
    bones = list(armature.data.bones)
    indices = {bone.name: index for index, bone in enumerate(bones)}
    return tuple(indices[bone.parent.name] if bone.parent else -1 for bone in bones)


def MapSkeletonByTopology(
    modelBones: list[bpy.types.Bone],
    canonicalTopology: tuple[int, ...],
) -> list[bpy.types.Bone]:
    """Return model bones ordered by canonical index, independent of FBX list order."""
    modelIndices = {bone.name: index for index, bone in enumerate(modelBones)}
    modelChildren: list[list[int]] = [[] for _ in modelBones]
    modelRoots: list[int] = []
    for index, bone in enumerate(modelBones):
        parent = bone.parent
        while parent is not None and parent.name not in modelIndices:
            parent = parent.parent
        if parent is None:
            modelRoots.append(index)
        else:
            modelChildren[modelIndices[parent.name]].append(index)

    canonicalChildren: list[list[int]] = [[] for _ in canonicalTopology]
    canonicalRoots: list[int] = []
    for index, parentIndex in enumerate(canonicalTopology):
        if parentIndex < 0:
            canonicalRoots.append(index)
        else:
            canonicalChildren[parentIndex].append(index)

    def Signature(index: int, children: list[list[int]], cache: dict[int, str]) -> str:
        if index not in cache:
            childSignatures = sorted(Signature(child, children, cache) for child in children[index])
            cache[index] = "(" + "".join(childSignatures) + ")"
        return cache[index]

    modelCache: dict[int, str] = {}
    canonicalCache: dict[int, str] = {}
    if len(modelRoots) != len(canonicalRoots):
        raise RuntimeError("skeleton root count differs from canonical Biped")
    ordered: list[bpy.types.Bone | None] = [None] * len(canonicalTopology)

    def Pair(modelIndex: int, canonicalIndex: int) -> None:
        modelSignature = Signature(modelIndex, modelChildren, modelCache)
        canonicalSignature = Signature(canonicalIndex, canonicalChildren, canonicalCache)
        if modelSignature != canonicalSignature:
            raise RuntimeError("skeleton subtree differs from canonical Biped")
        ordered[canonicalIndex] = modelBones[modelIndex]
        modelGroups: dict[str, list[int]] = defaultdict(list)
        canonicalGroups: dict[str, list[int]] = defaultdict(list)
        for child in modelChildren[modelIndex]:
            modelGroups[Signature(child, modelChildren, modelCache)].append(child)
        for child in canonicalChildren[canonicalIndex]:
            canonicalGroups[Signature(child, canonicalChildren, canonicalCache)].append(child)
        if set(modelGroups) != set(canonicalGroups):
            raise RuntimeError("skeleton child signatures differ from canonical Biped")
        for signature, canonicalGroup in canonicalGroups.items():
            modelGroup = modelGroups[signature]
            if len(modelGroup) != len(canonicalGroup):
                raise RuntimeError("skeleton child multiplicity differs from canonical Biped")
            # Identical subtrees are fingers or the L/R leg pair.  FBX preserves
            # sibling data order even when its global bone list order changes.
            for modelChild, canonicalChild in zip(modelGroup, canonicalGroup, strict=True):
                Pair(modelChild, canonicalChild)

    modelRootGroups = sorted(modelRoots, key=lambda index: Signature(index, modelChildren, modelCache))
    canonicalRootGroups = sorted(
        canonicalRoots, key=lambda index: Signature(index, canonicalChildren, canonicalCache)
    )
    for modelRoot, canonicalRoot in zip(modelRootGroups, canonicalRootGroups, strict=True):
        Pair(modelRoot, canonicalRoot)
    if any(bone is None for bone in ordered):
        raise RuntimeError("skeleton topology mapping is incomplete")
    return [bone for bone in ordered if bone is not None]


def ReadCanonicalSkeleton(actionPaths: dict[str, Path]) -> tuple[tuple[str, ...], tuple[int, ...]]:
    firstPath = actionPaths.get(EXPECTED_ACTIONS[0])
    if firstPath is None:
        raise RuntimeError(f"missing canonical {EXPECTED_ACTIONS[0]} FBX")
    ResetScene()
    importedObjects, _ = ImportFbx(firstPath, True)
    armature = MainArmature(importedObjects)
    names = tuple(bone.name for bone in armature.data.bones)
    topology = BoneTopology(armature)
    if len(names) < 20:
        raise RuntimeError(f"canonical skeleton has only {len(names)} bones")
    return names, topology


def ReadCanonicalBindRest(
    modelPath: Path,
    canonicalNames: tuple[str, ...],
    canonicalTopology: tuple[int, ...],
) -> dict[str, Matrix]:
    """Capture the NRA01 Figure/bind matrices used as the shared motion zero.

    A skeleton-only FBX exported after ``biped.loadBipFile`` stores the loaded
    action pose in the FBX bind/rest matrices.  Treating those per-action matrices
    as rest would cancel the stance (for example, crouch-fire becomes a T pose)
    and retain only small recoil keys.  The untouched NRA01 bind scene is the
    authoritative source rest for every canonical BIP action.
    """
    ResetScene()
    importedObjects, _ = ImportFbx(modelPath, False)
    armature = MainArmature(importedObjects)
    meshes = SkinnedMeshes(importedObjects)
    CanonicalizeSkeleton(armature, meshes, canonicalNames, canonicalTopology)
    rest = {
        name: RestLocalMatrix(armature.data.bones[name]).copy()
        for name in canonicalNames
        if name in armature.data.bones
    }
    if len(rest) != len(canonicalNames):
        raise RuntimeError(
            f"{modelPath.name}: canonical rest has {len(rest)} of {len(canonicalNames)} bones"
        )
    return rest


def CanonicalizeSkeleton(
    armature: bpy.types.Object,
    meshes: list[bpy.types.Object],
    canonicalNames: tuple[str, ...],
    canonicalTopology: tuple[int, ...],
) -> None:
    allBones = list(armature.data.bones)
    # Nra03 has one Skin-weighted HeadNub.  The action FBX importer removes that
    # leaf (ignore_leaf_bones), but the bind importer correctly keeps it because
    # deleting a weighted bone would lose the character's head accessory.  Keep
    # the extra leaf and canonicalize the 52 shared Biped bones around it.
    mappedBones = allBones
    if len(allBones) == len(canonicalNames) + 1:
        extraBones = [bone for bone in allBones if "headnub" in NormalizeName(bone.name)]
        if len(extraBones) == 1:
            mappedBones = [bone for bone in allBones if bone != extraBones[0]]
    if len(mappedBones) != len(canonicalNames):
        raise RuntimeError(
            f"{armature.name}: skeleton has {len(allBones)} bones, canonical has {len(canonicalNames)}"
        )

    try:
        mappedBones = MapSkeletonByTopology(mappedBones, canonicalTopology)
    except RuntimeError as error:
        raise RuntimeError(f"{armature.name}: {error}") from error

    oldNames = tuple(bone.name for bone in mappedBones)
    temporaryNames = tuple(f"LugouTempBone{index:03d}" for index in range(len(mappedBones)))
    for mesh in meshes:
        for oldName, temporaryName in zip(oldNames, temporaryNames, strict=True):
            group = mesh.vertex_groups.get(oldName)
            if group is not None:
                group.name = temporaryName
    for bone, temporaryName in zip(mappedBones, temporaryNames, strict=True):
        bone.name = temporaryName
    for bone, canonicalName in zip(mappedBones, canonicalNames, strict=True):
        bone.name = canonicalName
    for mesh in meshes:
        for temporaryName, canonicalName in zip(temporaryNames, canonicalNames, strict=True):
            group = mesh.vertex_groups.get(temporaryName)
            if group is not None:
                group.name = canonicalName
    armature.name = "Rig_LugouCharacter"
    armature.data.name = "Rig_LugouCharacter"


def ActionFrameCount(action: bpy.types.Action) -> float:
    start, end = action.frame_range
    return max(0.0, end - start)


def RestLocalMatrix(bone: bpy.types.Bone) -> Matrix:
    return bone.parent.matrix_local.inverted_safe() @ bone.matrix_local if bone.parent else bone.matrix_local.copy()


def PoseLocalMatrix(poseBone: bpy.types.PoseBone) -> Matrix:
    return poseBone.parent.matrix.inverted_safe() @ poseBone.matrix if poseBone.parent else poseBone.matrix.copy()


def RetargetAction(
    sourceArmature: bpy.types.Object,
    baseArmature: bpy.types.Object,
    sourceAction: bpy.types.Action,
    actionId: str,
    canonicalSourceRest: dict[str, Matrix],
) -> bpy.types.Action:
    """Bake one FBX/Biped motion onto this model's own rest axes and proportions.

    FBX force-sampling writes every bone's full local translation as well as its
    rotation.  Reusing those raw curves on another Biped works only when bone roll,
    rest axes and segment lengths are byte-identical; the Japanese and Nationalist
    source rigs are not.  Each action FBX also captures its loaded frame as its own
    FBX rest pose, so its local pose must be compared with the untouched NRA01 bind
    rest rather than that per-action rest.  Transfer that canonical rest delta and
    rebuild it on the target hierarchy.  This is baked here so the browser only
    plays ordinary glTF clips.
    """
    sourceBones = sourceArmature.data.bones
    targetBones = baseArmature.data.bones
    sharedNames = [bone.name for bone in targetBones if bone.name in sourceBones]
    if len(sharedNames) < min(12, len(sourceBones)):
        raise RuntimeError(
            f"{actionId}: skeleton mismatch ({len(sharedNames)} shared of {len(sourceBones)} source bones)"
        )
    missingCanonical = [name for name in sharedNames if name not in canonicalSourceRest]
    if missingCanonical:
        raise RuntimeError(f"{actionId}: canonical rest missing bones {missingCanonical}")
    targetRest = {name: RestLocalMatrix(targetBones[name]) for name in sharedNames}
    orderedNames = sorted(sharedNames, key=lambda name: len(sourceBones[name].parent_recursive))
    rootNames = [name for name in sharedNames if targetBones[name].parent is None]
    if len(rootNames) != 1:
        raise RuntimeError(f"{actionId}: expected one root bone, found {rootNames}")
    rootName = rootNames[0]
    footNames = [
        name for name in sharedNames
        if "foot" in NormalizeName(name) or "toe" in NormalizeName(name)
    ]
    if len(footNames) < 2:
        raise RuntimeError(f"{actionId}: could not identify both feet")
    targetGroundZ = min(
        min(targetBones[name].head_local.z, targetBones[name].tail_local.z)
        for name in footNames
    )

    targetAction = bpy.data.actions.new(name=f"Animation_{actionId}")
    targetAction.use_fake_user = True
    sourceArmature.animation_data_create().action = sourceAction
    targetAnimation = baseArmature.animation_data_create()
    targetAnimation.action = targetAction
    start = int(round(sourceAction.frame_range[0]))
    end = int(round(sourceAction.frame_range[1]))
    scene = bpy.context.scene
    previousFrame = scene.frame_current
    try:
        for poseBone in baseArmature.pose.bones:
            poseBone.rotation_mode = "QUATERNION"
            poseBone.matrix_basis.identity()
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for name in orderedNames:
                sourcePose = sourceArmature.pose.bones[name]
                targetPose = baseArmature.pose.bones[name]
                sourceLocal = PoseLocalMatrix(sourcePose)
                delta = canonicalSourceRest[name].inverted_safe() @ sourceLocal
                targetLocal = targetRest[name] @ delta
                targetPose.matrix = (
                    targetPose.parent.matrix @ targetLocal if targetPose.parent else targetLocal
                )
            bpy.context.view_layer.update()
            # Gameplay locomotion already moves Actor.root, so imported clips must
            # be in-place.  Strip horizontal BIP root travel and ground both feet
            # every frame; otherwise legacy pelvis heights can bury a running
            # model while a crouch clip happens to look correct.
            rootPose = baseArmature.pose.bones[rootName]
            rootMatrix = rootPose.matrix.copy()
            rootMatrix.translation.x = targetRest[rootName].translation.x
            rootMatrix.translation.y = targetRest[rootName].translation.y
            rootPose.matrix = rootMatrix
            bpy.context.view_layer.update()
            currentGroundZ = min(
                min(baseArmature.pose.bones[name].head.z, baseArmature.pose.bones[name].tail.z)
                for name in footNames
            )
            rootMatrix = rootPose.matrix.copy()
            rootMatrix.translation.z += targetGroundZ - currentGroundZ
            rootPose.matrix = rootMatrix
            bpy.context.view_layer.update()
            for name in orderedNames:
                targetPose = baseArmature.pose.bones[name]
                targetPose.keyframe_insert(data_path="location", frame=frame, group=name)
                targetPose.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
                targetPose.keyframe_insert(data_path="scale", frame=frame, group=name)
    finally:
        scene.frame_set(previousFrame)
        targetAnimation.action = None
        if sourceArmature.animation_data:
            sourceArmature.animation_data.action = None
        for poseBone in baseArmature.pose.bones:
            poseBone.matrix_basis.identity()
        bpy.context.view_layer.update()
    return targetAction


def ImportAction(
    path: Path,
    baseArmature: bpy.types.Object,
    actionId: str,
    canonicalSourceRest: dict[str, Matrix],
) -> bpy.types.Action:
    importedObjects, importedActions = ImportFbx(path, True)
    targetAction: bpy.types.Action | None = None
    try:
        actionArmature = MainArmature(importedObjects)
        baseBones = set(baseArmature.data.bones.keys())
        actionBones = set(actionArmature.data.bones.keys())
        shared = baseBones & actionBones
        if len(shared) < min(12, len(baseBones)):
            raise RuntimeError(
                f"{path.name}: skeleton mismatch ({len(shared)} shared of {len(baseBones)} base bones)"
            )
        if not importedActions or actionArmature.animation_data is None:
            raise RuntimeError(f"{path.name}: no armature animation Action")
        sourceAction = actionArmature.animation_data.action
        if sourceAction is None:
            raise RuntimeError(f"{path.name}: armature has no active Action")
        targetAction = RetargetAction(
            actionArmature,
            baseArmature,
            sourceAction,
            actionId,
            canonicalSourceRest,
        )
        return targetAction
    finally:
        RemoveImportedObjects(importedObjects)
        for importedAction in importedActions:
            if importedAction != targetAction and importedAction.users == 0:
                bpy.data.actions.remove(importedAction)


def AddSockets(armature: bpy.types.Object, boneMap: dict[str, str]) -> list[str]:
    created: list[str] = []
    for socketName, role in SOCKETS.items():
        boneName = boneMap.get(role)
        if not boneName:
            continue
        socket = bpy.data.objects.new(socketName, None)
        socket.empty_display_type = "ARROWS"
        socket.empty_display_size = 0.08
        socket["socketRole"] = role
        bpy.context.scene.collection.objects.link(socket)
        socket.parent = armature
        socket.parent_type = "BONE"
        socket.parent_bone = boneName
        socket.location = (0.0, 0.0, 0.0)
        socket.rotation_euler = (0.0, 0.0, 0.0)
        created.append(socketName)
    return created


def BuildNlaTracks(armature: bpy.types.Object, actions: dict[str, bpy.types.Action]) -> None:
    animationData = armature.animation_data_create()
    animationData.action = None
    for track in list(animationData.nla_tracks):
        animationData.nla_tracks.remove(track)
    for actionId in EXPECTED_ACTIONS:
        action = actions[actionId]
        track = animationData.nla_tracks.new()
        track.name = actionId
        start = int(round(action.frame_range[0]))
        strip = track.strips.new(actionId, start, action)
        strip.name = actionId


def MeshStats(meshes: list[bpy.types.Object]) -> tuple[int, int]:
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return vertices, triangles


def ExportGlb(path: Path) -> None:
    result = bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
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
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_skins=True,
        export_all_influences=False,
        export_influence_nb=4,
        export_def_bones=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True,
        export_optimize_animation_keep_anim_object=True,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_draco_mesh_compression_enable=False,
        export_meshopt_compression_enable=False,
        use_visible=True,
    )
    if "FINISHED" not in result or not path.is_file():
        raise RuntimeError(f"glTF export failed: {path}")


def ValidateGlb(path: Path) -> dict[str, object]:
    ResetScene()
    result = bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=False)
    if "FINISHED" not in result:
        raise RuntimeError(f"fresh glTF import failed: {path}")
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    meshes = SkinnedMeshes(list(bpy.context.scene.objects))
    actions = sorted(action.name for action in bpy.data.actions)
    if len(armatures) != 1:
        raise RuntimeError(f"{path.name}: expected one armature, found {len(armatures)}")
    if not meshes:
        raise RuntimeError(f"{path.name}: no skinned mesh after fresh import")
    if len(actions) != len(EXPECTED_ACTIONS):
        raise RuntimeError(
            f"{path.name}: expected {len(EXPECTED_ACTIONS)} actions, found {len(actions)}"
        )
    return {
        "armatures": len(armatures),
        "skinnedMeshes": len(meshes),
        "animations": actions,
    }


def DiscoverInputs(inputDir: Path) -> tuple[dict[str, Path], dict[str, Path]]:
    models: dict[str, Path] = {}
    actions: dict[str, Path] = {}
    for path in inputDir.glob("*.fbx"):
        modelMatch = MODEL_PATTERN.match(path.name)
        if modelMatch:
            models[modelMatch.group(1)] = path
            continue
        actionMatch = ACTION_PATTERN.match(path.name)
        if actionMatch:
            actions[actionMatch.group(1)] = path
    return models, actions


def BakeModel(
    modelId: str,
    modelPath: Path,
    actionPaths: dict[str, Path],
    outputDir: Path,
    textureIndex: dict[str, list[Path]],
    keepBlend: bool,
    canonicalNames: tuple[str, ...],
    canonicalTopology: tuple[int, ...],
    canonicalSourceRest: dict[str, Matrix],
) -> dict[str, object]:
    ResetScene()
    importedObjects, _ = ImportFbx(modelPath, False)
    armature = MainArmature(importedObjects)
    meshes = SkinnedMeshes(importedObjects)
    if not meshes:
        raise RuntimeError(f"{modelPath.name}: bind FBX has no skinned mesh")
    CanonicalizeSkeleton(armature, meshes, canonicalNames, canonicalTopology)
    boneMap = CoreBoneMap(armature)
    missingRoles = sorted(REQUIRED_CORE_BONES - set(boneMap))
    if missingRoles:
        raise RuntimeError(f"{modelPath.name}: missing core bones {missingRoles}")
    exportRoot, bounds = NormalizeCharacterFrame(modelId, importedObjects, meshes)
    missingTextures = RelinkImages(textureIndex)

    actions: dict[str, bpy.types.Action] = {}
    for actionId in EXPECTED_ACTIONS:
        actionPath = actionPaths.get(actionId)
        if actionPath is None:
            raise RuntimeError(f"{modelId}: missing {actionId} FBX")
        actions[actionId] = ImportAction(
            actionPath,
            armature,
            actionId,
            canonicalSourceRest,
        )
    sockets = AddSockets(armature, boneMap)
    BuildNlaTracks(armature, actions)
    armature["characterId"] = modelId
    armature["faction"] = "nra" if "Nra" in modelId else "ija"
    armature["boneRoles"] = json.dumps(boneMap, ensure_ascii=True, separators=(",", ":"))

    vertices, triangles = MeshStats(meshes)
    outputPath = outputDir / f"Model_{modelId}.glb"
    ExportGlb(outputPath)
    if keepBlend:
        bpy.ops.wm.save_as_mainfile(
            filepath=str(outputDir / f"Scene_{modelId}.blend"),
            check_existing=False,
        )
    validation = ValidateGlb(outputPath)
    return {
        "id": modelId,
        "faction": "nra" if "Nra" in modelId else "ija",
        "url": f"./Model/Character/{outputPath.name}",
        "source": modelPath.name,
        "vertices": vertices,
        "triangles": triangles,
        "bytes": outputPath.stat().st_size,
        "boneRoles": boneMap,
        "bounds": bounds,
        "sockets": sockets,
        "animations": list(EXPECTED_ACTIONS),
        "missingTextures": missingTextures,
        "validation": validation,
    }


def Main() -> None:
    args = ParseArgs()
    inputDir = args.input_dir.resolve()
    outputDir = args.output_dir.resolve()
    textureDir = args.texture_dir.resolve() if args.texture_dir else None
    if not inputDir.is_dir():
        raise FileNotFoundError(inputDir)
    outputDir.mkdir(parents=True, exist_ok=True)
    models, actions = DiscoverInputs(inputDir)
    if len(models) != 10:
        raise RuntimeError(f"expected 10 bind-pose FBX files, found {len(models)}")
    if set(actions) != set(EXPECTED_ACTIONS):
        missing = sorted(set(EXPECTED_ACTIONS) - set(actions))
        extra = sorted(set(actions) - set(EXPECTED_ACTIONS))
        raise RuntimeError(f"canonical action mismatch: missing={missing}, extra={extra}")
    textureIndex = BuildTextureIndex(textureDir)
    canonicalNames, canonicalTopology = ReadCanonicalSkeleton(actions)
    canonicalModelPath = models.get("LugouNra01")
    if canonicalModelPath is None:
        raise RuntimeError("missing canonical Model_LugouNra01.fbx")
    canonicalSourceRest = ReadCanonicalBindRest(
        canonicalModelPath,
        canonicalNames,
        canonicalTopology,
    )

    startedAt = time.perf_counter()
    records: list[dict[str, object]] = []
    for modelId in sorted(models):
        print(f"BAKE {modelId}")
        records.append(
            BakeModel(
                modelId,
                models[modelId],
                actions,
                outputDir,
                textureIndex,
                args.keep_blend,
                canonicalNames,
                canonicalTopology,
                canonicalSourceRest,
            )
        )
    manifest = {
        "schema": 1,
        "generatedBy": "Script_BakeLugouCharacters.py",
        "models": records,
        "elapsedSeconds": round(time.perf_counter() - startedAt, 3),
    }
    manifestPath = outputDir / "Data_LugouCharacterManifest.json"
    manifestPath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"WROTE {manifestPath}")


if __name__ == "__main__":
    Main()

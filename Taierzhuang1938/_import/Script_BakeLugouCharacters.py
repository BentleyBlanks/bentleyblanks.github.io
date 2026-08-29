"""Consolidate the 3ds Max FBX bridge into ten web-ready animated GLBs.

Input is produced by ``Script_ExportLugouCharacters.ms``.  Each bind-pose FBX contains the
original Skin/Physique deformation and materials; the two sets of sixteen faction-canonical
animation FBXs contain the BIP motion sampled on NRA01 and IJA01 at one sample per frame.  This
baker transfers each faction's rest-relative poses onto its five original rigs, adds semantic
sockets, embeds textures as WebP and validates every fresh GLB import before writing the browser
manifest.

2026-08-29 incident, read before touching the grounding code
------------------------------------------------------------
A bake shipped ten GLBs in which the **root bone's own translation never reached the
file**: every one of the sixteen clips held the pelvis at its rest height, so the lying,
kneeling and sitting clips all stood upright in mid-air.  Non-root translation (thigh,
clavicle) survived; only the root channel was flat.

It shipped because the only pose-related audit asked *"does the deformed mesh dip below
Z=0?"* and the ground correction was lift-only (``max(0.0, -groundZ)``).  A body frozen at
standing height floats, floating bodies never dip below zero, so the audit reported
``maxGroundPenetrationMeters == 0`` for all 160 clip/model pairs and looked healthy.

Two rules came out of it, both enforced below:

*   **Ground clearance is not a pose audit.**  Contact poses (prone, sit) legitimately let
    the mesh sink a little into the contact plane, and a floating body trivially passes a
    penetration test.  ``AUDIT_GROUND_LIMITS`` therefore keeps the standing reference clip
    tight and lets contact poses breathe -- it is no longer pretending to guard the pose.
*   **The pose audit measures the pelvis.**  ``ValidateGlb`` reports each clip's pelvis
    world height from the freshly re-imported GLB, and ``BakeModel`` refuses to write a
    model whose sixteen clips share one pelvis height (``MIN_PELVIS_SPREAD_METERS``).
    Script_CharacterModelTest re-measures the same thing straight out of the shipped GLB.
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
    r"^Animation_(Lugou(?:Nra|Ija)Canonical|Lugou(?:Nra|Ija)\d{2})_([A-Za-z][A-Za-z0-9]*)\.fbx$",
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
GROUND_ROOT_NAME = "GroundRoot"
# The only clip whose soles are genuinely meant to rest on the floor; every other clip is a
# contact pose that may sink a few centimetres into the surface it lies or kneels on.
STANDING_REFERENCE_ACTION = "AdvanceFire"
AUDIT_GROUND_LIMITS = {"standing": 0.08, "contact": 0.25}
# Sixteen clips that share one pelvis height mean the root translation channel was lost.
# See the module docstring: this, not ground penetration, is the pose audit.
MIN_PELVIS_SPREAD_METERS = 0.40
MAX_LOW_POSE_PELVIS_METERS = 0.35
MIN_HIGH_POSE_PELVIS_METERS = 0.70


def ParseArgs() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--texture-dir", type=Path)
    parser.add_argument("--keep-blend", action="store_true")
    parser.add_argument("--model", help="Bake one Lugou model while iterating on the pipeline")
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


def LimitSkinWeights(meshes: list[bpy.types.Object], limit: int = 4) -> int:
    """Match Three.js' four-weight shader before pose/ground validation.

    Letting the glTF exporter perform this truncation at the very end means the
    baker grounds one deformation while the browser renders another.  Apply the
    same top-four normalized weights up front so every offline audit observes the
    exact skin data that ships.
    """
    changedVertices = 0
    for mesh in meshes:
        for vertex in mesh.data.vertices:
            weighted = sorted(
                ((assignment.group, assignment.weight) for assignment in vertex.groups
                 if assignment.weight > 0),
                key=lambda item: item[1],
                reverse=True,
            )
            if len(weighted) <= limit:
                continue
            changedVertices += 1
            kept = weighted[:limit]
            total = sum(weight for _, weight in kept)
            for groupIndex, _ in weighted[limit:]:
                mesh.vertex_groups[groupIndex].remove([vertex.index])
            if total > 1e-12:
                for groupIndex, weight in kept:
                    mesh.vertex_groups[groupIndex].add(
                        [vertex.index], weight / total, "REPLACE"
                    )
    return changedVertices


def AddGroundRoot(armature: bpy.types.Object) -> str:
    """Parent the imported Biped under a dedicated, unweighted placement bone."""
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        groundBone = armature.data.edit_bones.new(GROUND_ROOT_NAME)
        groundBone.head = (0.0, 0.0, 0.0)
        groundBone.tail = (0.0, 0.0, 0.1)
        for bone in armature.data.edit_bones:
            if bone != groundBone and bone.parent is None:
                bone.parent = groundBone
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
        armature.select_set(False)
    return GROUND_ROOT_NAME


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


def EvaluatedMeshGroundZ(meshes: list[bpy.types.Object]) -> float:
    """Return the actual lowest deformed vertex in Blender Z-up world space."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    groundZ = float("inf")
    for mesh in meshes:
        evaluatedObject = mesh.evaluated_get(depsgraph)
        evaluatedMesh = evaluatedObject.to_mesh()
        try:
            matrixWorld = evaluatedObject.matrix_world
            for vertex in evaluatedMesh.vertices:
                groundZ = min(groundZ, (matrixWorld @ vertex.co).z)
        finally:
            evaluatedObject.to_mesh_clear()
    if groundZ == float("inf"):
        raise RuntimeError("could not measure evaluated character ground")
    return groundZ


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
    """Capture the faction source rig's Figure/bind matrices used as BIP motion zero."""
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
    if len(allBones) > len(canonicalNames):
        # One NRA bind rig has a weighted HeadNub; StandFireCrouch's BIP has an
        # additional Neck link.  Find the known removable bones whose collapsed
        # hierarchy matches the fixed 52-bone runtime topology.  MapSkeletonByTopology
        # already walks through excluded parents, so removing Neck1 correctly makes
        # Head a logical child of Neck without discarding Neck1's sampled transform.
        knownExtras = [
            bone for bone in allBones
            if "headnub" in NormalizeName(bone.name)
            or (
                re.search(r"neck\d+$", NormalizeName(bone.name)) is not None
                and bone.parent is not None
                and "neck" in NormalizeName(bone.parent.name)
            )
        ]
        if len(knownExtras) == len(allBones) - len(canonicalNames):
            mappedBones = [bone for bone in allBones if bone not in knownExtras]
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


def PoseLocalMatrix(
    poseBone: bpy.types.PoseBone,
    includedNames: set[str] | None = None,
) -> Matrix:
    parent = poseBone.parent
    if includedNames is not None:
        while parent is not None and parent.name not in includedNames:
            parent = parent.parent
    return parent.matrix.inverted_safe() @ poseBone.matrix if parent else poseBone.matrix.copy()


def RetargetAction(
    sourceArmature: bpy.types.Object,
    baseArmature: bpy.types.Object,
    meshes: list[bpy.types.Object],
    sourceAction: bpy.types.Action,
    actionId: str,
    sourceBindRest: dict[str, Matrix],
) -> bpy.types.Action:
    """Bake one faction-canonical Max/BIP motion onto this model's bind rig.

    FBX force-sampling writes every bone's full local translation as well as its
    rotation.  NRA and IJA have different Figure/bind axes, so their sampled actions
    are deliberately kept separate.  Compare the sampled pose with the untouched
    same-faction source rest, then rebuild that delta on each target's own rest axes
    and proportions.
    """
    sourceBones = sourceArmature.data.bones
    targetBones = baseArmature.data.bones
    sharedNames = [bone.name for bone in targetBones if bone.name in sourceBones]
    if len(sharedNames) < min(12, len(sourceBones)):
        raise RuntimeError(
            f"{actionId}: skeleton mismatch ({len(sharedNames)} shared of {len(sourceBones)} source bones)"
        )
    missingBind = [name for name in sharedNames if name not in sourceBindRest]
    if missingBind:
        raise RuntimeError(f"{actionId}: source bind rest missing bones {missingBind}")
    targetRest = {name: RestLocalMatrix(targetBones[name]) for name in sharedNames}
    sharedNameSet = set(sharedNames)
    orderedNames = sorted(sharedNames, key=lambda name: len(sourceBones[name].parent_recursive))
    rootNames = [
        name for name in sharedNames
        if targetBones[name].parent is None or targetBones[name].parent.name not in sharedNameSet
    ]
    if len(rootNames) != 1:
        raise RuntimeError(f"{actionId}: expected one root bone, found {rootNames}")
    rootName = rootNames[0]
    targetAction = bpy.data.actions.new(name=f"Animation_{actionId}")
    targetAction.use_fake_user = True
    sourceArmature.animation_data_create().action = sourceAction
    targetAnimation = baseArmature.animation_data_create()
    targetAnimation.action = targetAction
    start = int(round(sourceAction.frame_range[0]))
    end = int(round(sourceAction.frame_range[1]))
    maxPoseDeltaError = 0.0
    maxGroundCorrection = 0.0
    rootHeightLow = float("inf")
    rootHeightHigh = float("-inf")
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
                sourceLocal = PoseLocalMatrix(sourcePose, sharedNameSet)
                delta = sourceBindRest[name].inverted_safe() @ sourceLocal
                targetLocal = targetRest[name] @ delta
                targetPose.matrix = (
                    targetPose.parent.matrix @ targetLocal if targetPose.parent else targetLocal
                )
            bpy.context.view_layer.update()
            # Compare the canonical Max/BIP pose before applying the deliberate
            # global in-place/ground correction.  The correction is not a pose
            # mismatch; it is the world placement contract for gameplay.
            for name in orderedNames:
                sourceDelta = sourceBindRest[name].inverted_safe() @ PoseLocalMatrix(
                    sourceArmature.pose.bones[name], sharedNameSet
                )
                targetDelta = targetRest[name].inverted_safe() @ PoseLocalMatrix(
                    baseArmature.pose.bones[name]
                )
                maxPoseDeltaError = max(
                    maxPoseDeltaError,
                    max(abs(a - b) for rowA, rowB in zip(sourceDelta, targetDelta, strict=True)
                        for a, b in zip(rowA, rowB, strict=True)),
                )
            # Lock this source frame into the target Action before asking the
            # dependency graph to evaluate the skinned mesh.  Once earlier frame
            # keys exist, an update otherwise restores their interpolation and
            # silently discards the just-assigned pose/ground correction.
            for name in orderedNames:
                targetPose = baseArmature.pose.bones[name]
                targetPose.keyframe_insert(data_path="location", frame=frame, group=name)
                targetPose.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
                targetPose.keyframe_insert(data_path="scale", frame=frame, group=name)
            # Gameplay locomotion already moves Actor.root, so imported clips are
            # in-place.  Ground against the actual deformed uniform/boot mesh, not
            # a foot-bone head: a Biped foot node sits around the ankle and treating
            # it as the sole visibly buries both boots.
            rootPose = baseArmature.pose.bones[rootName]
            rootMatrix = rootPose.matrix.copy()
            # `rootPose.matrix` is armature space, so the in-place lock has to come from the
            # root bone's armature-space rest head -- NOT from `targetRest[rootName]`, which
            # since GroundRoot exists is expressed in GroundRoot's *bone* axes (its Y points
            # along world Z).  Both happen to be ~zero on the current Biped, which is exactly
            # why the mixed-frame version could sit here unnoticed.
            restHead = targetBones[rootName].matrix_local.translation
            rootMatrix.translation.x = restHead.x
            rootMatrix.translation.y = restHead.y
            rootPose.matrix = rootMatrix
            rootPose.keyframe_insert(data_path="location", frame=frame, group=rootName)
            rootPose.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=rootName)
            rootPose.keyframe_insert(data_path="scale", frame=frame, group=rootName)
            # Evidence that the authored root motion actually made it into this Action.
            # A clip whose root never leaves its rest height is either a genuinely static
            # pose or -- far more likely -- the 2026-08-29 regression coming back.
            rootWorldZ = (baseArmature.matrix_world @ rootPose.matrix).translation.z
            rootHeightLow = min(rootHeightLow, rootWorldZ)
            rootHeightHigh = max(rootHeightHigh, rootWorldZ)
            groundPose = baseArmature.pose.bones[GROUND_ROOT_NAME]
            groundPose.matrix_basis.identity()
            groundPose.keyframe_insert(data_path="location", frame=frame, group=GROUND_ROOT_NAME)
            groundPose.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=GROUND_ROOT_NAME
            )
            groundPose.keyframe_insert(data_path="scale", frame=frame, group=GROUND_ROOT_NAME)
            # Re-evaluate the just-keyed action at this exact frame.  A view-layer
            # update alone can leave the evaluated skin one dependency-graph tick
            # behind the pose channels, which under-measures the required lift.
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            currentGroundZ = EvaluatedMeshGroundZ(meshes)
            # Only lift penetration.  A source pose may intentionally leave a few
            # millimetres of clearance (notably the prone clip's raised boot); pulling
            # that pose downward changes its authored body placement and can make the
            # fresh glTF skin penetrate by the same amount after bind conversion.
            groundCorrection = max(0.0, -currentGroundZ)
            maxGroundCorrection = max(maxGroundCorrection, groundCorrection)
            groundMatrix = groundPose.matrix.copy()
            # EvaluatedMeshGroundZ is in world metres, while Biped bone matrices
            # are in the armature's local units (the Max FBXs carry a 0.01 object
            # scale).  Convert explicitly or a requested 1 cm lift becomes 0.1 mm.
            groundAxisWorldScale = (
                baseArmature.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))
            ).length
            groundMatrix.translation.z += groundCorrection / max(groundAxisWorldScale, 1e-8)
            groundPose.matrix = groundMatrix
            groundPose.keyframe_insert(data_path="location", frame=frame, group=GROUND_ROOT_NAME)
            groundPose.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=GROUND_ROOT_NAME
            )
            groundPose.keyframe_insert(data_path="scale", frame=frame, group=GROUND_ROOT_NAME)
            bpy.context.view_layer.update()
    finally:
        scene.frame_set(previousFrame)
        targetAnimation.action = None
        if sourceArmature.animation_data:
            sourceArmature.animation_data.action = None
        for poseBone in baseArmature.pose.bones:
            poseBone.matrix_basis.identity()
        bpy.context.view_layer.update()
    targetAction["sourceFrameCount"] = end - start + 1
    targetAction["sourceBoneCount"] = len(sharedNames)
    targetAction["maxPoseDeltaError"] = maxPoseDeltaError
    targetAction["maxGroundCorrectionMeters"] = maxGroundCorrection
    targetAction["rootHeightLowMeters"] = rootHeightLow
    targetAction["rootHeightHighMeters"] = rootHeightHigh
    return targetAction


def ImportAction(
    path: Path,
    baseArmature: bpy.types.Object,
    meshes: list[bpy.types.Object],
    actionId: str,
    sourceBindRest: dict[str, Matrix],
    canonicalNames: tuple[str, ...],
    canonicalTopology: tuple[int, ...],
) -> bpy.types.Action:
    importedObjects, importedActions = ImportFbx(path, True)
    targetAction: bpy.types.Action | None = None
    try:
        actionArmature = MainArmature(importedObjects)
        # Max appends numeric suffixes when a scene contains several Bipeds
        # (for example `Bip001 Pelvis001`).  Rename bind and action hierarchies
        # by topology so scene-unique suffixes do not block canonical
        # rest-relative motion comparison against each target skeleton.
        CanonicalizeSkeleton(actionArmature, [], canonicalNames, canonicalTopology)
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
            meshes,
            sourceAction,
            actionId,
            sourceBindRest,
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
        export_optimize_animation_size=False,
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


def ValidateGlb(
    path: Path,
    animationAudit: dict[str, dict[str, object]],
    pelvisBoneName: str,
) -> dict[str, object]:
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
    armature = armatures[0]
    animationData = armature.animation_data_create()
    for track in animationData.nla_tracks:
        track.mute = True
    maxPenetrationByAction: dict[str, float] = {}
    pelvisHeightByAction: dict[str, list[float]] = {}
    # The pose audit reads the pelvis out of the *shipped* file, not out of the bake's own
    # bookkeeping.  See the module docstring: trusting the baker's self-report is how the
    # frozen-root regression reached the browser.
    pelvisPose = armature.pose.bones.get(pelvisBoneName)
    if pelvisPose is None:
        raise RuntimeError(f"{path.name}: re-imported GLB has no pelvis bone {pelvisBoneName}")
    scene = bpy.context.scene
    for action in bpy.data.actions:
        animationData.action = action
        start, end = action.frame_range
        sampleCount = max(2, int(animationAudit.get(action.name, {}).get("sourceFrames", 2)))
        maxPenetration = 0.0
        pelvisLow = float("inf")
        pelvisHigh = float("-inf")
        for sampleIndex in range(sampleCount):
            sampleFrame = start + (end - start) * sampleIndex / (sampleCount - 1)
            wholeFrame = int(sampleFrame)
            scene.frame_set(wholeFrame, subframe=sampleFrame - wholeFrame)
            bpy.context.view_layer.update()
            maxPenetration = max(maxPenetration, -EvaluatedMeshGroundZ(meshes))
            pelvisZ = (armature.matrix_world @ pelvisPose.matrix).translation.z
            pelvisLow = min(pelvisLow, pelvisZ)
            pelvisHigh = max(pelvisHigh, pelvisZ)
        maxPenetrationByAction[action.name] = max(0.0, maxPenetration)
        pelvisHeightByAction[action.name] = [pelvisLow, pelvisHigh]
    animationData.action = None
    return {
        "armatures": len(armatures),
        "skinnedMeshes": len(meshes),
        "animations": actions,
        "maxGroundPenetrationMeters": maxPenetrationByAction,
        "pelvisHeightMeters": pelvisHeightByAction,
    }


def DiscoverInputs(inputDir: Path) -> tuple[dict[str, Path], dict[str, dict[str, Path]]]:
    models: dict[str, Path] = {}
    actions: dict[str, dict[str, Path]] = defaultdict(dict)
    for path in inputDir.glob("*.fbx"):
        modelMatch = MODEL_PATTERN.match(path.name)
        if modelMatch:
            models[modelMatch.group(1)] = path
            continue
        actionMatch = ACTION_PATTERN.match(path.name)
        if actionMatch:
            actions[actionMatch.group(1)][actionMatch.group(2)] = path
    return models, dict(actions)


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
    animationSource: str,
    animationSourceModel: str,
) -> dict[str, object]:
    ResetScene()
    importedObjects, _ = ImportFbx(modelPath, False)
    armature = MainArmature(importedObjects)
    meshes = SkinnedMeshes(importedObjects)
    if not meshes:
        raise RuntimeError(f"{modelPath.name}: bind FBX has no skinned mesh")
    CanonicalizeSkeleton(armature, meshes, canonicalNames, canonicalTopology)
    limitedWeightVertices = LimitSkinWeights(meshes)
    AddGroundRoot(armature)
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
            meshes,
            actionId,
            canonicalSourceRest,
            canonicalNames,
            canonicalTopology,
        )
    sockets = AddSockets(armature, boneMap)
    BuildNlaTracks(armature, actions)
    # ValidateGlb resets Blender to a fresh scene, invalidating every Action RNA
    # handle.  Freeze the source-parity evidence before that destructive reload.
    animationAudit = {
        actionId: {
            "sourceFrames": int(actions[actionId].get("sourceFrameCount", 0)),
            "sourceBones": int(actions[actionId].get("sourceBoneCount", 0)),
            "maxPoseDeltaError": float(actions[actionId].get("maxPoseDeltaError", 1)),
            "maxGroundCorrectionMeters": float(
                actions[actionId].get("maxGroundCorrectionMeters", 0)
            ),
            "rootHeightMeters": [
                float(actions[actionId].get("rootHeightLowMeters", 0)),
                float(actions[actionId].get("rootHeightHighMeters", 0)),
            ],
        }
        for actionId in EXPECTED_ACTIONS
    }
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
    validation = ValidateGlb(outputPath, animationAudit, boneMap["pelvis"])
    for actionId, penetration in validation["maxGroundPenetrationMeters"].items():
        animationAudit[actionId]["maxGroundPenetrationMeters"] = penetration
    for actionId, heights in validation["pelvisHeightMeters"].items():
        animationAudit[actionId]["pelvisHeightMeters"] = [round(value, 6) for value in heights]
    poseFailures = [
        actionId for actionId, audit in animationAudit.items()
        if float(audit["maxPoseDeltaError"]) > 0.001
    ]
    groundFailures = [
        actionId for actionId, audit in animationAudit.items()
        if float(audit["maxGroundPenetrationMeters"]) > (
            AUDIT_GROUND_LIMITS["standing"] if actionId == STANDING_REFERENCE_ACTION
            else AUDIT_GROUND_LIMITS["contact"]
        )
    ]
    # The pose audit.  Ground clearance cannot see a frozen root -- a body stuck at standing
    # height simply floats -- so the sixteen clips' pelvis heights are what gets checked.
    pelvisLow = min(audit["pelvisHeightMeters"][0] for audit in animationAudit.values())
    pelvisHigh = max(audit["pelvisHeightMeters"][1] for audit in animationAudit.values())
    pelvisSpread = pelvisHigh - pelvisLow
    poseSpreadFailure = (
        pelvisSpread < MIN_PELVIS_SPREAD_METERS
        or pelvisLow > MAX_LOW_POSE_PELVIS_METERS
        or pelvisHigh < MIN_HIGH_POSE_PELVIS_METERS
    )
    if poseFailures or groundFailures or poseSpreadFailure:
        raise RuntimeError(
            f"{modelId}: animation audit failed; pose={poseFailures}, ground={groundFailures}, "
            f"pelvis={pelvisLow:.3f}..{pelvisHigh:.3f} (spread {pelvisSpread:.3f}) -- a spread "
            "below the threshold means the root translation channel never reached the GLB"
        )
    return {
        "id": modelId,
        "faction": "nra" if "Nra" in modelId else "ija",
        "url": f"./Model/Character/{outputPath.name}",
        "source": modelPath.name,
        "animationSource": animationSource,
        "animationSourceModel": animationSourceModel,
        "vertices": vertices,
        "triangles": triangles,
        "limitedWeightVertices": limitedWeightVertices,
        "bytes": outputPath.stat().st_size,
        "boneRoles": boneMap,
        "bounds": bounds,
        "sockets": sockets,
        "animations": list(EXPECTED_ACTIONS),
        "pelvisHeightSpreadMeters": round(pelvisSpread, 6),
        "animationAudit": animationAudit,
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
    textureIndex = BuildTextureIndex(textureDir)

    startedAt = time.perf_counter()
    records: list[dict[str, object]] = []
    selectedModels = [args.model] if args.model else sorted(models)
    unknownModels = [modelId for modelId in selectedModels if modelId not in models]
    if unknownModels:
        raise RuntimeError(f"unknown model selection: {unknownModels}")
    sourceContexts: dict[str, tuple[
        dict[str, Path], str, tuple[str, ...], tuple[int, ...], dict[str, Matrix]
    ]] = {}
    for modelId in selectedModels:
        factionStem = "Nra" if "Nra" in modelId else "Ija"
        sideCanonicalId = f"Lugou{factionStem}Canonical"
        animationSource = sideCanonicalId if sideCanonicalId in actions else modelId
        animationSourceModel = f"Lugou{factionStem}01" if animationSource == sideCanonicalId else modelId
        if animationSource not in actions:
            raise RuntimeError(
                f"{modelId}: missing faction-canonical action set {sideCanonicalId}"
            )
        if animationSource not in sourceContexts:
            canonicalActions = actions[animationSource]
            if set(canonicalActions) != set(EXPECTED_ACTIONS):
                missing = sorted(set(EXPECTED_ACTIONS) - set(canonicalActions))
                extra = sorted(set(canonicalActions) - set(EXPECTED_ACTIONS))
                raise RuntimeError(
                    f"{animationSource} action mismatch: missing={missing}, extra={extra}"
                )
            canonicalNames, canonicalTopology = ReadCanonicalSkeleton(canonicalActions)
            canonicalModelPath = models.get(animationSourceModel)
            if canonicalModelPath is None:
                raise RuntimeError(f"missing canonical Model_{animationSourceModel}.fbx")
            canonicalSourceRest = ReadCanonicalBindRest(
                canonicalModelPath,
                canonicalNames,
                canonicalTopology,
            )
            sourceContexts[animationSource] = (
                canonicalActions,
                animationSourceModel,
                canonicalNames,
                canonicalTopology,
                canonicalSourceRest,
            )
        (
            canonicalActions,
            animationSourceModel,
            canonicalNames,
            canonicalTopology,
            canonicalSourceRest,
        ) = sourceContexts[animationSource]
        print(f"BAKE {modelId}")
        records.append(
            BakeModel(
                modelId,
                models[modelId],
                canonicalActions,
                outputDir,
                textureIndex,
                args.keep_blend,
                canonicalNames,
                canonicalTopology,
                canonicalSourceRest,
                animationSource,
                animationSourceModel,
            )
        )
    manifest = {
        "schema": 2,
        "generatedBy": "Script_BakeLugouCharacters.py",
        "models": records,
        "elapsedSeconds": round(time.perf_counter() - startedAt, 3),
    }
    manifestPath = outputDir / "Data_LugouCharacterManifest.json"
    manifestPath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"WROTE {manifestPath}")


if __name__ == "__main__":
    Main()

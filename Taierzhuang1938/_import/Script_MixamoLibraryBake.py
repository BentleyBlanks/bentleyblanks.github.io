# Mixamo FBX -> GLB for the animation preview tool (Tool_MixamoAnimationPreview.html).
#
# Run through the repo helper (headless, no MCP):
#   node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/Script_MixamoLibraryBake.py \
#     --batch-args <args.json>      # ["<rawDir>", "<outDir>"]
#
# Every <rawDir>/*.fbx becomes <outDir>/<same stem>.glb. Bones lose the "mixamorig:" prefix
# (Hips, Spine, LeftArm ...), the one action is renamed to the file stem. Files named
# Model_*.fbx keep their mesh (the X Bot body); every other file is armature + one clip.
# An existing, newer GLB is skipped, so re-running only converts new downloads.
import bpy
import os
import sys

PREFIX = "mixamorig:"


def Args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) == 1 and argv[0].endswith(".json"):
        import json
        with open(argv[0], encoding="utf-8") as f:
            argv = json.load(f)
    if len(argv) < 2:
        raise SystemExit("usage: -- <rawDir> <outDir>")
    return os.path.abspath(argv[0]), os.path.abspath(argv[1])


def ClearScene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Convert(source, target, keepMesh):
    ClearScene()
    bpy.ops.import_scene.fbx(filepath=source, automatic_bone_orientation=False, ignore_leaf_bones=False)
    stem = os.path.splitext(os.path.basename(source))[0]
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError(f"no armature in {source}")
    for arm in armatures:
        # Renaming through RNA also rewrites the action's fcurve data paths.
        for bone in arm.data.bones:
            if bone.name.startswith(PREFIX):
                bone.name = bone.name[len(PREFIX):]
        arm.name = "Armature"
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and not keepMesh:
            bpy.data.objects.remove(obj, do_unlink=True)
    actions = list(bpy.data.actions)
    for i, action in enumerate(actions):
        action.name = stem if i == 0 else f"{stem}_{i}"
    if keepMesh:
        # The body ships without clips; the tool plays the clip files on it.
        for arm in armatures:
            if arm.animation_data:
                arm.animation_data.action = None
        for action in actions:
            bpy.data.actions.remove(action)
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        export_animations=not keepMesh,
        export_animation_mode="ACTIVE_ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
    )


def Main():
    rawDir, outDir = Args()
    os.makedirs(outDir, exist_ok=True)
    done, skipped, failed = 0, 0, []
    for name in sorted(os.listdir(rawDir)):
        if not name.lower().endswith(".fbx"):
            continue
        source = os.path.join(rawDir, name)
        target = os.path.join(outDir, os.path.splitext(name)[0] + ".glb")
        if os.path.exists(target) and os.path.getmtime(target) >= os.path.getmtime(source):
            skipped += 1
            continue
        try:
            Convert(source, target, name.startswith("Model_"))
            done += 1
        except Exception as error:  # keep going; report at the end
            failed.append(f"{name}: {error}")
    print(f"[MixamoBake] converted {done}, skipped {skipped}, failed {len(failed)}")
    for line in failed:
        print("[MixamoBake] FAIL", line)


Main()

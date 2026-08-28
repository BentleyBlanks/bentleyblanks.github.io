"""Print compact animation diagnostics for one intermediate Lugou FBX."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import bpy
import math


def PoseDeltaReport(armature: bpy.types.Object, action: bpy.types.Action) -> dict[str, object]:
    armature.animation_data_create().action = action
    start, end = action.frame_range
    frames = sorted({int(round(start)), int(round((start + end) * 0.5)), int(round(end))})
    wanted = [
        bone.name for bone in armature.data.bones
        if any(token in bone.name.casefold() for token in ("upperarm", "forearm", "thigh", "spine"))
    ]
    samples: dict[str, object] = {}
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        frameResult: dict[str, object] = {}
        for name in wanted:
            dataBone = armature.data.bones[name]
            poseBone = armature.pose.bones[name]
            restLocal = (dataBone.parent.matrix_local.inverted_safe() @ dataBone.matrix_local
                         if dataBone.parent else dataBone.matrix_local.copy())
            poseLocal = (poseBone.parent.matrix.inverted_safe() @ poseBone.matrix
                         if poseBone.parent else poseBone.matrix.copy())
            delta = restLocal.inverted_safe() @ poseLocal
            frameResult[name] = {
                "angleDegrees": round(math.degrees(delta.to_quaternion().angle), 3),
                "translation": [round(value, 4) for value in delta.to_translation()],
            }
        samples[str(frame)] = frameResult
    return samples


def Main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    args = parser.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(
        filepath=str(args.input.resolve()),
        use_anim=True,
        use_custom_normals=True,
        use_image_search=False,
        ignore_leaf_bones=True,
        automatic_bone_orientation=False,
        use_prepost_rot=True,
        bake_space_transform=False,
        global_scale=1.0,
    )
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    actions = list(bpy.data.actions)
    activeAction = armatures[0].animation_data.action if armatures and armatures[0].animation_data else None
    report = {
        "sceneRange": [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
        "armatures": [
            {
                "name": obj.name,
                "bones": [bone.name for bone in obj.data.bones],
                "parents": [bone.parent.name if bone.parent else None for bone in obj.data.bones],
            }
            for obj in armatures
        ],
        "actions": [
            {
                "name": action.name,
                "range": list(action.frame_range),
                "slots": len(action.slots),
            }
            for action in actions
        ],
        "activeAction": activeAction.name if activeAction else None,
        "poseDeltas": PoseDeltaReport(armatures[0], activeAction) if armatures and activeAction else {},
    }
    print("LUGOU_FBX_JSON=" + json.dumps(report, ensure_ascii=True, separators=(",", ":")))


if __name__ == "__main__":
    Main()

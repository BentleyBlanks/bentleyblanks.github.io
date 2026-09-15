"""Merge four faction-retargeted Kimodo collapse actions into one GLB library."""
from pathlib import Path
import argparse
import sys

import bpy


parser = argparse.ArgumentParser()
parser.add_argument("--input-dir", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--blend-out", type=Path, required=True)
parser.add_argument("--faction", choices=["Nra", "Ija"], required=True)
parser.add_argument("--clips", nargs="+", default=[
    "DeathCollapseA", "DeathCollapseB", "DeathCollapseC", "DeathCollapseD",
])
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])

actionNames = [f"Animation_{args.faction}_{clip}_V1" for clip in args.clips]
blendPaths = [args.input_dir / f"Scene_{args.faction}_{clip}_V1.blend" for clip in args.clips]
for path in blendPaths:
    if not path.exists():
        raise RuntimeError(f"Missing retarget source: {path}")

bpy.ops.wm.open_mainfile(filepath=str(blendPaths[0]))
for path, actionName in zip(blendPaths[1:], actionNames[1:]):
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        if actionName not in source.actions:
            raise RuntimeError(f"Missing {actionName} in {path}")
        target.actions = [actionName]

wanted = set(actionNames)
for action in list(bpy.data.actions):
    if action.name not in wanted:
        bpy.data.actions.remove(action)
for actionName in actionNames:
    action = bpy.data.actions.get(actionName)
    if action is None:
        raise RuntimeError(f"Action failed to load: {actionName}")
    action.use_fake_user = True

scene = bpy.context.scene
arm = bpy.data.objects[f"Rig_{args.faction}Infantry"]
body = bpy.data.objects[f"Model_{args.faction}InfantryBody"]
arm.animation_data_create()
arm.animation_data.action = bpy.data.actions[actionNames[0]]
scene.frame_start = 1
scene.frame_end = int(max(action.frame_range[1] for action in bpy.data.actions))

bpy.ops.object.select_all(action="DESELECT")
# Runtime only consumes the skeleton rest transforms and animation tracks. Keep
# the audited body mesh in the source blend, but do not ship duplicate character
# geometry and eight embedded textures in each animation library.
for obj in [arm]:
    obj.hide_set(False)
    obj.select_set(True)
bpy.context.view_layer.objects.active = arm

args.blend_out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(args.blend_out), compress=True)
args.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(args.output),
    export_format="GLB",
    use_selection=True,
    use_active_scene=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_merge_animation="ACTION",
    export_force_sampling=True,
    export_anim_slide_to_zero=True,
    export_anim_single_armature=True,
    export_skins=True,
    export_yup=True,
    export_extras=True,
)
print("DONE", args.faction, args.output, ",".join(actionNames), flush=True)

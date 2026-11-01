# Shared kit for clips that Claude authors on top of Mixamo clips (2026-11-01).
#
# A per-clip build script lives next to this file as MixamoAuthored/Script_Author_<Name>.py, imports this kit,
# loads one Mixamo base clip, edits it (mostly arms, hands and fingers) and exports. Run headless:
#   node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/MixamoAuthored/Script_Author_<Name>.py --task Author<Name>
#
# Outputs (committed with the library since 2026-11-01; Raw FBX and Authored sources live in _import/Mixamo):
#   Animation/Mixamo/Animation_Claude_<Name>.glb      the clip, same layout as the converted Mixamo clips (armature "Armature",
#                                        bones without the "mixamorig:" prefix, one action named after the file);
#                                        glTF extras on the scene carry author / base clip / source paths.
#   _import/Mixamo/Authored/<Name>.blend                the edited scene, for later iteration by hand.
#   _import/Mixamo/Authored/<Name>.report.json          per-frame measurements for review (palms, feet, rifle points, distances).
#
# Coordinates: Blender world is Z-up, metres. Rifle points are given in the project's weapon frame
# (three.js convention, Model/Model_<id>.tzm.json): origin = right-hand grip (gripR), -Z = muzzle, +Y = up, +X = right.
# RifleFrame() rebuilds that frame from the two palms exactly the way Tool_MixamoAnimationPreview.html does for clips
# with rifleHand "L": origin at the right palm, -Z from the right palm towards the left palm, +Y = world up made
# perpendicular. Pick a frame where both hands hold the rifle (usually the first frame of a rifle clip).
import bpy
import json
import math
import os
import sys
from mathutils import Matrix, Quaternion, Vector

PREFIX = "mixamorig:"
FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.normpath(os.path.join(HERE, "..", "Animation", "Mixamo"))
RAW, AUTHORED = (os.path.join(HERE, "Mixamo", sub) for sub in ("Raw", "Authored"))
AUTHOR = "Claude Opus 5.5"

# Points on the project rifles, weapon frame (see header). Measured from the tzm meshes / mounts on 2026-11-01.
#   knob        bolt-handle ball, bolt closed and turned down
#   knobUp      same, handle turned up ~90 degrees (bolt unlocked, not yet drawn back)
#   knobBack    turned up and drawn fully back (boltOpen stroke)
#   feedMouth   top of the charger guide / magazine well, where the stripper clip sits
#   gripL       support-hand point on the handguard
RIFLES = {
    "ZhongZheng": {"knob": (0.030, 0.014, -0.115), "knobUp": (0.012, 0.058, -0.115), "stroke": 0.078,
                   "feedMouth": (0.0, 0.040, -0.170), "gripL": (0.0, -0.012, -0.499), "muzzle": (0.0, 0.035, -0.861)},
    "Type38": {"knob": (0.073, 0.045, -0.122), "knobUp": (0.020, 0.088, -0.122), "stroke": 0.120,
               "feedMouth": (0.0, 0.047, -0.185), "gripL": (0.0, -0.012, -0.443), "muzzle": (0.0, 0.035, -1.029)},
}
for spec in RIFLES.values():
    up = spec["knobUp"]
    spec["knobBack"] = (up[0], up[1], up[2] + spec["stroke"])

FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")


# ----------------------------------------------------------------------------- loading
def Args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def LoadBase(stem, frame_end=None):
    """Fresh scene with the Mixamo clip Raw/<stem>.fbx. Returns the armature (bones renamed, action kept)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(RAW, stem + ".fbx"), automatic_bone_orientation=False,
                             ignore_leaf_bones=False)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for bone in arm.data.bones:
        if bone.name.startswith(PREFIX):
            bone.name = bone.name[len(PREFIX):]
    arm.name = "Armature"
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    start, end = arm.animation_data.action.frame_range
    scene.frame_start, scene.frame_end = int(start), int(frame_end or end)
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return arm


def ExtendTo(arm, frame_end):
    """Make the scene longer than the base clip; the last base pose holds (constant extrapolation)."""
    bpy.context.scene.frame_end = int(frame_end)


def Frames():
    scene = bpy.context.scene
    return range(scene.frame_start, scene.frame_end + 1)


def At(frame):
    bpy.context.scene.frame_set(int(frame))


# ----------------------------------------------------------------------------- measuring (evaluated pose)
def BoneHead(arm, name, frame=None):
    if frame is not None:
        At(frame)
    return arm.matrix_world @ arm.pose.bones[name].head


def BoneMatrix(arm, name, frame=None):
    if frame is not None:
        At(frame)
    return arm.matrix_world @ arm.pose.bones[name].matrix


def Palm(arm, side, frame=None):
    """Same point the preview uses: wrist joint 55% of the way to the middle-finger root."""
    hand, middle = BoneHead(arm, f"{side}Hand", frame), BoneHead(arm, f"{side}HandMiddle1")
    return hand.lerp(middle, 0.55)


def RifleFrame(arm, frame):
    """World matrix of the rifle (weapon frame -> Blender world) rebuilt from the palms at `frame`."""
    right, left = Palm(arm, "Right", frame), Palm(arm, "Left")
    z = (right - left).normalized()                       # +Z points back, muzzle is -Z
    y = Vector((0, 0, 1)) - z * z.z
    y.normalize()
    x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = right
    return m


def RiflePoint(frame_matrix, rifle, name):
    return frame_matrix @ Vector(RIFLES[rifle][name])


def WristFor(arm, side, palm_target, frame):
    """Wrist position that puts the palm on palm_target, keeping the hand's current orientation at `frame`."""
    return palm_target - (Palm(arm, side, frame) - BoneHead(arm, f"{side}Hand"))


# ----------------------------------------------------------------------------- editing
def _Empty(name, location=(0, 0, 0)):
    empty = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(empty)
    empty.location = location
    return empty


def ArmIk(arm, side, keys, window, pole=None, rotation_keys=None, blend=4, pole_angle_deg=-90):
    """Drive one arm with IK and bake the result back into the action.

    keys            [(frame, wrist_world_position)] - where the wrist (Hand bone head) must be. Use WristFor() to
                    turn a palm target into a wrist target. Interpolation between keys is Bezier.
    window          (first, last) frames where IK is fully on; it fades in/out over `blend` frames on each side,
                    so the base animation is untouched outside [first - blend, last + blend].
    pole            optional world position for the elbow to point at (fixed), e.g. out to the side and down.
    pole_angle_deg  IK pole angle; on the X Bot right arm 180 keeps the elbow outside (-90 folded it into the body).
    rotation_keys   optional [(frame, world_quaternion)] for the hand; also blended by the window.
    """
    target = _Empty(f"IK_{side}")
    for frame, position in keys:
        target.location = position
        target.keyframe_insert("location", frame=frame)
    if rotation_keys:
        target.rotation_mode = "QUATERNION"
        for frame, quat in rotation_keys:
            target.rotation_quaternion = quat
            target.keyframe_insert("rotation_quaternion", frame=frame)
    fore = arm.pose.bones[f"{side}ForeArm"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    if pole is not None:
        pole_obj = _Empty(f"Pole_{side}", pole)
        ik.pole_target, ik.pole_angle = pole_obj, math.radians(pole_angle_deg)
    rot = None
    if rotation_keys:
        rot = arm.pose.bones[f"{side}Hand"].constraints.new("COPY_ROTATION")
        rot.target = target
    first, last = window
    for constraint in filter(None, (ik, rot)):
        for frame, value in ((first - blend, 0.0), (first, 1.0), (last, 1.0), (last + blend, 0.0)):
            constraint.influence = value
            constraint.keyframe_insert("influence", frame=frame)
    bones = [f"{side}Arm", f"{side}ForeArm", f"{side}Hand"]
    _BakeBones(arm, bones, first - blend, last + blend)
    bpy.data.objects.remove(target, do_unlink=True)
    if pole is not None:
        bpy.data.objects.remove(bpy.data.objects[f"Pole_{side}"], do_unlink=True)


def _BakeBones(arm, bones, start, end):
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        # Blender 5 moved bone selection from Bone to PoseBone.
        if hasattr(pb, "select"):
            pb.select = pb.name in bones
        else:
            pb.bone.select = pb.name in bones
    scene = bpy.context.scene
    bpy.ops.nla.bake(frame_start=max(scene.frame_start, int(start)), frame_end=min(scene.frame_end, int(end)),
                     only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=True,
                     bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")


def KeyRotation(arm, bone, frame, quat):
    """Key a bone's local rotation (pose space, relative to rest) at frame.
    NOTE: Mixamo clips carry a linear key on every frame, so a key here changes only this one frame - nothing is
    interpolated towards neighbours. Write every frame of a changed span (see Curl / your own per-frame loop)."""
    pb = arm.pose.bones[bone]
    pb.rotation_quaternion = quat
    pb.keyframe_insert("rotation_quaternion", frame=frame)


def Curl(arm, side, frame, amount, thumb=None, fingers=FINGERS[1:], axis=(1, 0, 0), max_deg=(55, 80, 60)):
    """Key a finger curl at frame. amount 0 = straight (rest), 1 = fist. Each finger joint i turns max_deg[i] * amount
    about the bone's local `axis`. Check the sign once on your clip (Mixamo X Bot fingers bend about local X)."""
    for finger in fingers:
        for i in range(3):
            KeyRotation(arm, f"{side}Hand{finger}{i + 1}", frame,
                        Quaternion(axis, math.radians(max_deg[i] * amount)))
    if thumb is not None:
        for i in range(3):
            KeyRotation(arm, f"{side}HandThumb{i + 1}", frame, Quaternion(axis, math.radians(35 * thumb)))


# ----------------------------------------------------------------------------- output
def Export(arm, name, meta):
    """Write Animation/Mixamo/Animation_Claude_<name>.glb + _import/Mixamo/Authored/<name>.blend. meta: dict with at least base, label, note."""
    os.makedirs(GLB, exist_ok=True)
    os.makedirs(AUTHORED, exist_ok=True)
    stem = f"Animation_Claude_{name}"
    arm.animation_data.action.name = stem
    scene = bpy.context.scene
    info = {"author": AUTHOR, "basedOn": "Mixamo", **meta,
            "script": f"Taierzhuang1938/_import/MixamoAuthored/Script_Author_{name}.py",
            "blend": f"Taierzhuang1938/_import/Mixamo/Authored/{name}.blend"}
    scene["tz_authored"] = json.dumps(info, ensure_ascii=False)
    # Read by Script_MixamoLibraryFetch.mjs --prune: base / note / timings show up in the preview tool.
    with open(os.path.join(AUTHORED, name + ".meta.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
    blend = os.path.join(AUTHORED, name + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(GLB, stem + ".glb"), export_format="GLB",
                              export_animations=True, export_animation_mode="ACTIVE_ACTIONS",
                              export_force_sampling=True, export_skins=True, export_yup=True, export_apply=False,
                              export_extras=True)
    print(f"[MixamoAuthor] wrote {stem}.glb and {name}.blend")
    return stem


def Report(arm, name, rifle=None, rifle_frame=None, extra=None):
    """Per-frame measurements for review. rifle_frame: the frame RifleFrame() was taken at (rifle pinned to the
    left hand from then on, as the preview does)."""
    rows = []
    pin = None
    if rifle and rifle_frame is not None:
        m0 = RifleFrame(arm, rifle_frame)
        left0 = BoneMatrix(arm, "LeftHand", rifle_frame)
        pin = left0.inverted() @ m0
    for frame in Frames():
        At(frame)
        row = {"f": frame}
        for side in ("Right", "Left"):
            row[side[0] + "palm"] = list(Palm(arm, side))
        for foot in ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"):
            row[foot] = list(BoneHead(arm, foot))
        row["hips"] = list(BoneHead(arm, "Hips"))
        if pin is not None:
            m = BoneMatrix(arm, "LeftHand") @ pin
            for point in ("knob", "knobUp", "knobBack", "feedMouth", "gripL"):
                row["d_R_" + point] = (Palm(arm, "Right") - m @ Vector(RIFLES[rifle][point])).length
            row["d_R_grip"] = (Palm(arm, "Right") - m.translation).length
            row["d_L_gripL"] = (Palm(arm, "Left") - m @ Vector(RIFLES[rifle]["gripL"])).length
        rows.append(row)
    path = os.path.join(AUTHORED, name + ".report.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"name": name, "rifle": rifle, "rifleFrame": rifle_frame, "frames": rows, **(extra or {})}, f)
    print(f"[MixamoAuthor] report {path}")

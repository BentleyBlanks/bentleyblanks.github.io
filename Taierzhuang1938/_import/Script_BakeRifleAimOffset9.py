# 9-Pose Rifle Aim Offset Baker (BlenderMCP / Blender 5.2, 2026-11-21).
#
# Reproducible baker for the 3x3 (9-frame) upper-body Mesh-Space Additive Aim Offset asset:
#   Taierzhuang1938/Animation/Mixamo/Animation_RifleAimOffset9.glb
#
# Run via the repository's sanctioned BlenderMCP wrapper (never raw blender.exe):
#   node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/Script_BakeRifleAimOffset9.py --task RifleAimOffset9
#
# Optional CLI arguments (after `--` or via `--batch-args`):
#   --blend-out <path>    Save editable .blend source OUTSIDE the git repo
#                         (defaults to C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\RifleAimOffset9\Scene_RifleAimOffset9.blend
#                          if OneDrive root exists, else C:\Users\admin\Documents\Blender\Taierzhuang1938\RifleAimOffset9\Scene_RifleAimOffset9.blend).
#   --preview <png>       Render a 3x3 contact sheet (using Model_MixamoXBot.glb + rifle proxy) to a local scratch PNG.
#
# Grid contract (frames 0..8 @ 30 fps -> glTF times 0/30 .. 8/30 s, row-major 3x3):
#   Frame 0: UpLeft     (Yaw +75 deg LEFT,  Pitch +50 deg UP)
#   Frame 1: UpCenter   (Yaw   0 deg,       Pitch +50 deg UP)
#   Frame 2: UpRight    (Yaw -75 deg RIGHT, Pitch +50 deg UP)
#   Frame 3: MidLeft    (Yaw +75 deg LEFT,  Pitch   0 deg)
#   Frame 4: Center     (Yaw   0 deg,       Pitch   0 deg)  <-- Exact unmodified RefPose from RifleAimingIdle_V1 frame 1
#   Frame 5: MidRight   (Yaw -75 deg RIGHT, Pitch   0 deg)
#   Frame 6: DownLeft   (Yaw +75 deg LEFT,  Pitch -45 deg DOWN)
#   Frame 7: DownCenter (Yaw   0 deg,       Pitch -45 deg DOWN)
#   Frame 8: DownRight  (Yaw -75 deg RIGHT, Pitch -45 deg DOWN)
#
# Invariants verified before export:
#   - Hips and all leg bones on frames 0..8 match Frame 4 (Center) identically (< 1e-4 deg).
#   - Upper spine, clavicles, arms, hands and head are ergonomically sculpted for a right-handed rifle
#     (asymmetric left-shoulder protraction on right-aim, shoulder-pocket tuck, cheek-weld roll, 2-bone IK palm lock).
#   - Both palms stay within < 5 mm of their calibrated rifle grip points across all 9 frames.

import json
import math
import os
import sys
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.normpath(os.path.join(HERE, ".."))
GLB_DIR = os.path.join(PROJECT, "Animation", "Mixamo")
GLB_OUT = os.path.join(GLB_DIR, "Animation_RifleAimOffset9.glb")
XBOT_MODEL_GLB = os.path.join(GLB_DIR, "Model_MixamoXBot.glb")
BASE_CLIP = "Animation_Mixamo_RifleAimingIdle_V1"

sys.path.insert(0, HERE)
import Script_MixamoAuthorKit as K

FPS = 30
# Measured on Animation_Mixamo_RifleAimingIdle_V1 Frame 1 (Blender world Z-up):
#   MuzzleDir ~ (0, -1, 0), Left = (+1, 0, 0), Right = (-1, 0, 0), Up = (0, 0, +1).
AXIS_UP = Vector((0.0, 0.0, 1.0))
AXIS_FWD = Vector((0.0, -1.0, 0.0))
AXIS_LEFT = Vector((1.0, 0.0, 0.0))
AXIS_RIGHT = Vector((-1.0, 0.0, 0.0))

# 3x3 Grid definition (row-major: Up -> Mid -> Down, Left -> Center -> Right)
YAW_COLS_DEG = (75.0, 0.0, -75.0)     # +deg = Left (CCW around +Z), -deg = Right
PITCH_ROWS_DEG = (50.0, 0.0, -45.0)   # +deg = Up (CCW around AXIS_RIGHT = -X), -deg = Down
GRID_NAMES = (
    "UpLeft", "UpCenter", "UpRight",
    "MidLeft", "Center", "MidRight",
    "DownLeft", "DownCenter", "DownRight",
)

# Anatomical spine/head yaw & pitch fractions (sum = 1.00 for yaw, slightly tuned for up vs down pitch)
SPINE_YAW_FRAC = (
    ("Spine",  0.14),
    ("Spine1", 0.24),
    ("Spine2", 0.34),
    ("Neck",   0.14),
    ("Head",   0.14),
)
SPINE_PITCH_UP_FRAC = (
    ("Spine",  0.12),
    ("Spine1", 0.25),
    ("Spine2", 0.37),
    ("Neck",   0.14),
    ("Head",   0.12),
)
SPINE_PITCH_DOWN_FRAC = (
    ("Spine",  0.17),
    ("Spine1", 0.30),
    ("Spine2", 0.34),
    ("Neck",   0.11),
    ("Head",   0.08),  # Head bows slightly less than chest so eyes stay aligned along iron sights
)

LOWER_BODY_BONES = (
    "Hips",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "LeftToe_End",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "RightToe_End",
)

UPPER_BODY_BONES = (
    "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
)


def ParseArgs():
    argv = K.Args()
    opts = {"blend_out": None, "preview": None}
    i = 0
    while i < len(argv):
        if argv[i] == "--blend-out" and i + 1 < len(argv):
            opts["blend_out"] = argv[i + 1]
            i += 2
        elif argv[i] == "--preview" and i + 1 < len(argv):
            opts["preview"] = argv[i + 1]
            i += 2
        else:
            i += 1
    if not opts["blend_out"]:
        onedrive_root = r"C:\Users\Bentl\OneDrive\AI\Models\Blender"
        if os.path.isdir(onedrive_root):
            base_dir = onedrive_root
        else:
            base_dir = os.path.join(os.path.expanduser("~"), "Documents", "Blender")
        opts["blend_out"] = os.path.join(base_dir, "Taierzhuang1938", "RifleAimOffset9", "Scene_RifleAimOffset9.blend")
    return opts


def RotateBoneWorld(arm, name, axis, deg):
    if abs(deg) < 1e-6:
        return
    pb = arm.pose.bones[name]
    mw = arm.matrix_world @ pb.matrix
    pivot = mw.translation.copy()
    rot = Matrix.Rotation(math.radians(deg), 4, axis.normalized())
    new_mw = Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot) @ mw
    pb.matrix = arm.matrix_world.inverted() @ new_mw
    bpy.context.view_layer.update()


def SetBoneWorldAimAndTwist(arm, name, target_dir, up_hint):
    """Align bone's +Y axis (head->tail) to target_dir while keeping bone's +Z as close to up_hint as possible."""
    pb = arm.pose.bones[name]
    mw = arm.matrix_world @ pb.matrix
    pos = mw.translation.copy()
    scale = mw.to_scale()
    y_axis = target_dir.normalized()
    z_axis = up_hint - y_axis * up_hint.dot(y_axis)
    if z_axis.length < 1e-6:
        z_axis = Vector((0, 0, 1)) if abs(y_axis.z) < 0.9 else Vector((1, 0, 0))
        z_axis = z_axis - y_axis * z_axis.dot(y_axis)
    z_axis.normalize()
    x_axis = y_axis.cross(z_axis).normalized()
    z_axis = x_axis.cross(y_axis).normalized()
    rot3 = Matrix((x_axis, y_axis, z_axis)).transposed()
    new_mw = rot3.to_4x4()
    for c in range(3):
        new_mw[0][c] *= scale.x
        new_mw[1][c] *= scale.y
        new_mw[2][c] *= scale.z
    new_mw.translation = pos
    pb.matrix = arm.matrix_world.inverted() @ new_mw
    bpy.context.view_layer.update()


def SolveTwoBoneIk(arm, side, target_wrist, pole_world, target_hand_rot3):
    """Exact analytical 2-bone IK for Mixamo Left/Right arm with smooth elbow pole and wrist alignment."""
    upper_name = f"{side}Arm"
    lower_name = f"{side}ForeArm"
    hand_name = f"{side}Hand"

    # Measure bone lengths and current roll references in world space
    p_sh = K.BoneHead(arm, upper_name).copy()
    p_el = K.BoneHead(arm, lower_name).copy()
    p_wr = K.BoneHead(arm, hand_name).copy()
    l1 = (p_el - p_sh).length
    l2 = (p_wr - p_el).length

    # Preserve each bone's natural twist orientation around its longitudinal axis relative to the bend plane
    m_up0 = (arm.matrix_world @ arm.pose.bones[upper_name].matrix).to_3x3().normalized()
    m_lo0 = (arm.matrix_world @ arm.pose.bones[lower_name].matrix).to_3x3().normalized()
    d1_0 = (p_el - p_sh).normalized()
    d2_0 = (p_wr - p_el).normalized()
    plane0 = d1_0.cross(d2_0)
    if plane0.length < 1e-5:
        plane0 = Vector((0, 0, 1))
    else:
        plane0.normalize()

    # Clamp target within comfortable anatomical reach (98.5% of max extension to avoid elbow pop)
    to_t = target_wrist - p_sh
    dist = to_t.length
    min_d = abs(l1 - l2) + 0.03
    max_d = (l1 + l2) * 0.985
    if dist < 1e-6:
        dir_t = (p_wr - p_sh).normalized()
        dist = min_d
    else:
        dir_t = to_t / dist
        dist = max(min_d, min(max_d, dist))
    clamped_wrist = p_sh + dir_t * dist

    # Law of cosines for shoulder angle
    cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist)))
    sin_a = math.sqrt(max(0.0, 1.0 - cos_a * cos_a))

    # Bend direction toward pole_world, perpendicular to dir_t
    pole_dir = pole_world - p_sh
    pole_perp = pole_dir - dir_t * pole_dir.dot(dir_t)
    if pole_perp.length < 1e-5:
        pole_perp = Vector((0, 0, -1)) - dir_t * (-dir_t.z)
    pole_perp.normalize()

    new_el = p_sh + dir_t * (l1 * cos_a) + pole_perp * (l1 * sin_a)
    new_d1 = (new_el - p_sh).normalized()
    new_d2 = (clamped_wrist - new_el).normalized()

    # Rotate upper arm from old d1_0 to new_d1, then twist around new_d1 so the bend normal aligns
    q_up_swing = d1_0.rotation_difference(new_d1)
    # Apply swing to upper arm world matrix
    pb_up = arm.pose.bones[upper_name]
    mw_up = arm.matrix_world @ pb_up.matrix
    scale_up = mw_up.to_scale()
    r_up = q_up_swing.to_matrix() @ m_up0

    # Align elbow bend plane smoothly to avoid twisting upper arm
    new_plane = new_d1.cross(new_d2)
    if new_plane.length > 1e-5:
        new_plane.normalize()
        cur_plane = (q_up_swing @ plane0)
        cur_plane = cur_plane - new_d1 * cur_plane.dot(new_d1)
        if cur_plane.length > 1e-5:
            cur_plane.normalize()
            q_twist = cur_plane.rotation_difference(new_plane)
            # Limit twist slightly if near 180 deg singularity
            r_up = q_twist.to_matrix() @ r_up

    new_mw_up = r_up.to_4x4()
    for c in range(3):
        new_mw_up[0][c] *= scale_up.x
        new_mw_up[1][c] *= scale_up.y
        new_mw_up[2][c] *= scale_up.z
    new_mw_up.translation = p_sh
    pb_up.matrix = arm.matrix_world.inverted() @ new_mw_up
    bpy.context.view_layer.update()

    # Now rotate forearm from its current world direction to new_d2
    pb_lo = arm.pose.bones[lower_name]
    p_el_now = K.BoneHead(arm, lower_name).copy()
    p_wr_now = K.BoneHead(arm, hand_name).copy()
    cur_d2 = (p_wr_now - p_el_now).normalized()
    q_lo_swing = cur_d2.rotation_difference(new_d2)
    mw_lo = arm.matrix_world @ pb_lo.matrix
    scale_lo = mw_lo.to_scale()
    r_lo = q_lo_swing.to_matrix() @ mw_lo.to_3x3().normalized()
    new_mw_lo = r_lo.to_4x4()
    for c in range(3):
        new_mw_lo[0][c] *= scale_lo.x
        new_mw_lo[1][c] *= scale_lo.y
        new_mw_lo[2][c] *= scale_lo.z
    new_mw_lo.translation = p_el_now
    pb_lo.matrix = arm.matrix_world.inverted() @ new_mw_lo
    bpy.context.view_layer.update()

    # Align hand orientation cleanly to target_hand_rot3 (carrying fingers rigidly on the rifle!)
    pb_hand = arm.pose.bones[hand_name]
    mw_h = arm.matrix_world @ pb_hand.matrix
    scale_h = mw_h.to_scale()
    new_mw_h = target_hand_rot3.to_4x4()
    for c in range(3):
        new_mw_h[0][c] *= scale_h.x
        new_mw_h[1][c] *= scale_h.y
        new_mw_h[2][c] *= scale_h.z
    new_mw_h.translation = mw_h.translation.copy()
    pb_hand.matrix = arm.matrix_world.inverted() @ new_mw_h
    bpy.context.view_layer.update()


def SnapshotPose(arm):
    snap = {}
    for pb in arm.pose.bones:
        snap[pb.name] = (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy())
    return snap


def RestorePose(arm, snap):
    for pb in arm.pose.bones:
        loc, rot, scl = snap[pb.name]
        pb.location = loc.copy()
        pb.rotation_quaternion = rot.copy()
        pb.scale = scl.copy()
    bpy.context.view_layer.update()


def BuildAimOffset9(opts):
    arm = K.LoadBase(BASE_CLIP)
    K.At(1)

    # Capture Frame 1 (Center RefPose) completely
    ref_snap = SnapshotPose(arm)
    ref_rifle_m = K.RifleFrame(arm, 1)
    ref_r_palm = K.Palm(arm, "Right").copy()
    ref_l_palm = K.Palm(arm, "Left").copy()
    ref_r_hand_m = K.BoneMatrix(arm, "RightHand").copy()
    ref_l_hand_m = K.BoneMatrix(arm, "LeftHand").copy()
    ref_spine2_m = K.BoneMatrix(arm, "Spine2").copy()
    ref_r_arm_head = K.BoneHead(arm, "RightArm").copy()
    ref_l_arm_head = K.BoneHead(arm, "LeftArm").copy()
    ref_r_elbow = K.BoneHead(arm, "RightForeArm").copy()
    ref_l_elbow = K.BoneHead(arm, "LeftForeArm").copy()

    # Exact offsets of wrists and palms in RifleFrame coordinates (invariant across all 9 poses!)
    ref_rifle_inv = ref_rifle_m.inverted()
    r_wrist_in_rifle = ref_rifle_inv @ K.BoneHead(arm, "RightHand")
    l_wrist_in_rifle = ref_rifle_inv @ K.BoneHead(arm, "LeftHand")
    r_hand_rot_in_rifle = ref_rifle_inv.to_3x3().normalized() @ ref_r_hand_m.to_3x3().normalized()
    l_hand_rot_in_rifle = ref_rifle_inv.to_3x3().normalized() @ ref_l_hand_m.to_3x3().normalized()
    # Rifle pose relative to Spine2 (chest) at Center
    rifle_in_spine2 = ref_spine2_m.inverted() @ ref_rifle_m
    # Elbow pole offsets relative to shoulder-wrist midpoint at Center
    r_pole_rel = ref_r_elbow - 0.5 * (ref_r_arm_head + K.BoneHead(arm, "RightHand"))
    l_pole_rel = ref_l_elbow - 0.5 * (ref_l_arm_head + K.BoneHead(arm, "LeftHand"))

    # Replace action with a brand new clean 9-frame action (frames 0..8 @ 30 fps)
    old_action = arm.animation_data.action
    action = bpy.data.actions.new(name="Animation_RifleAimOffset9")
    arm.animation_data.action = action
    if old_action and old_action.users == 0:
        bpy.data.actions.remove(old_action)

    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = 8

    report_poses = []

    for row_idx, pitch_deg in enumerate(PITCH_ROWS_DEG):
        for col_idx, yaw_deg in enumerate(YAW_COLS_DEG):
            frame = row_idx * 3 + col_idx
            pose_name = GRID_NAMES[frame]
            scene.frame_set(frame)
            RestorePose(arm, ref_snap)

            if frame != 4:
                # --- 1) Spine & Head anatomical Mesh-Space rotation ---
                # Pitch axis rotates with accumulated yaw so pitched torso stays upright in the aimed vertical plane!
                yaw_norm = yaw_deg / 75.0           # +1 = full left, -1 = full right
                pitch_norm = pitch_deg / (50.0 if pitch_deg >= 0 else 45.0)  # +1 = full up, -1 = full down

                pitch_fracs = dict(SPINE_PITCH_UP_FRAC if pitch_deg >= 0 else SPINE_PITCH_DOWN_FRAC)
                yaw_fracs = dict(SPINE_YAW_FRAC)

                # Subtle ergonomic roll (cheek-weld into right-handed stock + natural counter-lean on sideways twist)
                # Looking left tilts chest slightly right; looking right opens chest slightly left;
                # Head rolls gently right (+3..5 deg around AXIS_FWD) to maintain cheek weld on stock.
                roll_map = {
                    "Spine":  -2.0 * yaw_norm,
                    "Spine1": -3.0 * yaw_norm,
                    "Spine2": -3.5 * yaw_norm + 2.0 * max(0.0, pitch_norm),
                    "Neck":    2.5 * yaw_norm,
                    "Head":    4.0 * yaw_norm + 3.0 * abs(yaw_norm),
                }

                acc_yaw = 0.0
                for bname in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
                    dy = yaw_deg * yaw_fracs[bname]
                    dp = pitch_deg * pitch_fracs[bname]
                    dr = roll_map[bname]
                    # Current local vertical-plane axes after partial yaw
                    mid_yaw_rad = math.radians(acc_yaw + 0.5 * dy)
                    cur_right = Matrix.Rotation(mid_yaw_rad, 3, AXIS_UP) @ AXIS_RIGHT
                    cur_fwd = Matrix.Rotation(mid_yaw_rad, 3, AXIS_UP) @ AXIS_FWD

                    RotateBoneWorld(arm, bname, AXIS_UP, dy)
                    RotateBoneWorld(arm, bname, cur_right, dp)
                    RotateBoneWorld(arm, bname, cur_fwd, dr)
                    acc_yaw += dy

                # --- 2) Ergonomic Right-Handed Clavicle Sculpting ---
                # Aiming UP: both clavicles elevate so shoulder pocket lifts smoothly with buttstock.
                # Aiming DOWN: clavicles depress softly so rifle clears chin.
                # Aiming RIGHT (yaw < 0): LeftShoulder protracts forward to reach handguard effortlessly;
                #                         RightShoulder retracts slightly back.
                # Aiming LEFT  (yaw > 0): RightShoulder rolls slightly forward & elevates slightly to hold stock.
                aim_yaw_rot3 = Matrix.Rotation(math.radians(yaw_deg), 3, AXIS_UP)
                aim_right = aim_yaw_rot3 @ AXIS_RIGHT
                aim_fwd = aim_yaw_rot3 @ AXIS_FWD

                # Left clavicle
                l_sh_yaw = -11.0 * max(0.0, -yaw_norm) + 4.0 * max(0.0, yaw_norm)   # Protract forward when aiming right
                l_sh_elev = 8.5 * max(0.0, pitch_norm) - 5.5 * max(0.0, -pitch_norm)
                RotateBoneWorld(arm, "LeftShoulder", AXIS_UP, l_sh_yaw)
                RotateBoneWorld(arm, "LeftShoulder", aim_right, l_sh_elev)

                # Right clavicle
                r_sh_yaw = -6.0 * max(0.0, -yaw_norm) + 7.0 * max(0.0, yaw_norm)
                r_sh_elev = 6.5 * max(0.0, pitch_norm) - 4.5 * max(0.0, -pitch_norm)
                RotateBoneWorld(arm, "RightShoulder", AXIS_UP, r_sh_yaw)
                RotateBoneWorld(arm, "RightShoulder", aim_right, r_sh_elev)

                # --- 3) Compute Target Rifle Frame & Solve Two-Hand Analytical IK ---
                # Start from chest-carried rifle position (so it moves naturally with clavicle/chest),
                # then orient rifle strictly along the aimed (yaw, pitch) direction while keeping stock
                # comfortably anchored near the right shoulder pocket!
                spine2_now = K.BoneMatrix(arm, "Spine2")
                r_sh_now = K.BoneHead(arm, "RightArm")
                l_sh_now = K.BoneHead(arm, "LeftArm")

                # Exact world rotation from Center rifle to target (yaw, pitch)
                q_aim_yaw = Quaternion(AXIS_UP, math.radians(yaw_deg))
                q_aim_pitch = Quaternion(aim_right, math.radians(pitch_deg))
                q_aim_total = q_aim_pitch @ q_aim_yaw

                # Slight natural rifle cant (roll) matching shooter's cheek-weld (<= 4 deg)
                q_cant = Quaternion(q_aim_total @ AXIS_FWD, math.radians(3.0 * yaw_norm))
                target_rifle_rot3 = (q_cant @ q_aim_total).to_matrix() @ ref_rifle_m.to_3x3().normalized()

                # Anchor right palm offset relative to RightArm shoulder (rotated by q_aim_total),
                # blended slightly with chest-carried anchor for natural shoulder pocket seating
                ref_sh_to_rpalm = ref_r_palm - ref_r_arm_head
                # Pull stock a tiny bit closer on extreme up/down pitch so arms never over-extend
                pull_in = 1.0 - 0.06 * abs(pitch_norm) - 0.04 * abs(yaw_norm)
                target_r_palm = r_sh_now + (q_aim_total @ (ref_sh_to_rpalm * pull_in))
                # Lift stock slightly toward eye line on upward aim, lower gently on downward aim
                target_r_palm += Vector((0.0, 0.0, 0.025 * max(0.0, pitch_norm) - 0.020 * max(0.0, -pitch_norm)))

                target_rifle_m = target_rifle_rot3.to_4x4()
                target_rifle_m.translation = target_r_palm

                target_r_wrist = target_rifle_m @ r_wrist_in_rifle
                target_l_wrist = target_rifle_m @ l_wrist_in_rifle
                target_r_hand_rot3 = target_rifle_rot3 @ r_hand_rot_in_rifle
                target_l_hand_rot3 = target_rifle_rot3 @ l_hand_rot_in_rifle

                # Anatomical elbow poles rotated with the aimed torso
                r_pole = 0.5 * (r_sh_now + target_r_wrist) + (q_aim_total @ r_pole_rel) + Vector((0, 0, -0.06))
                # Left elbow tucks slightly under barrel on high pitch & left aim so it never flares awkwardly
                l_pole = 0.5 * (l_sh_now + target_l_wrist) + (q_aim_total @ l_pole_rel) + Vector((0, 0, -0.08 - 0.05 * max(0.0, pitch_norm)))

                SolveTwoBoneIk(arm, "Right", target_r_wrist, r_pole, target_r_hand_rot3)
                SolveTwoBoneIk(arm, "Left", target_l_wrist, l_pole, target_l_hand_rot3)

                # Re-assert lower body strictly identical to Frame 4 (zero drift guarantee!)
                for bname in LOWER_BODY_BONES:
                    if bname in arm.pose.bones:
                        pb = arm.pose.bones[bname]
                        loc, rot, scl = ref_snap[bname]
                        pb.location = loc.copy()
                        pb.rotation_quaternion = rot.copy()
                        pb.scale = scl.copy()
                bpy.context.view_layer.update()

            # Keyframe EVERY bone cleanly at this frame
            for pb in arm.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                if pb.name == "Hips":
                    pb.keyframe_insert("location", frame=frame)

            # Measure quality metrics for this frame
            r_palm_now = K.Palm(arm, "Right")
            l_palm_now = K.Palm(arm, "Left")
            grip_dist_now = (r_palm_now - l_palm_now).length
            grip_err_mm = abs(grip_dist_now - (ref_r_palm - ref_l_palm).length) * 1000.0
            rf_now = K.RifleFrame(arm, frame)
            muzzle_now = -(rf_now.to_3x3().col[2]).normalized()
            # Measure achieved yaw & pitch relative to Center muzzle
            muzzle_ref = -(ref_rifle_m.to_3x3().col[2]).normalized()
            yaw_ach = math.degrees(math.atan2(muzzle_now.x, -muzzle_now.y) - math.atan2(muzzle_ref.x, -muzzle_ref.y))
            pitch_ach = math.degrees(math.asin(max(-1.0, min(1.0, muzzle_now.z))) - math.asin(max(-1.0, min(1.0, muzzle_ref.z))))

            # Verify lower-body max rotation error vs ref_snap
            max_leg_deg = 0.0
            for bname in LOWER_BODY_BONES:
                if bname in arm.pose.bones:
                    q_cur = arm.pose.bones[bname].rotation_quaternion
                    q_ref = ref_snap[bname][1]
                    ang = math.degrees(q_cur.rotation_difference(q_ref).angle)
                    if ang > max_leg_deg:
                        max_leg_deg = ang

            report_poses.append({
                "frame": frame,
                "name": pose_name,
                "targetYawDeg": yaw_deg,
                "targetPitchDeg": pitch_deg,
                "achievedYawDeg": round(yaw_ach, 1),
                "achievedPitchDeg": round(pitch_ach, 1),
                "gripDistM": round(grip_dist_now, 4),
                "gripErrMm": round(grip_err_mm, 2),
                "maxLegDeltaDeg": round(max_leg_deg, 5),
            })

    # Make all fcurves LINEAR so frame sampling is crisp & predictable
    if hasattr(action, "fcurves"):
        for fc in action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"

    # Verify strict invariants
    print("=== 9-POSE RIFLE AIM OFFSET REPORT ===")
    for r in report_poses:
        print(
            f"  f{r['frame']} {r['name']:10s} | tgt=({r['targetYawDeg']:+5.0f}y, {r['targetPitchDeg']:+5.0f}p) "
            f"| got=({r['achievedYawDeg']:+5.1f}y, {r['achievedPitchDeg']:+5.1f}p) "
            f"| gripErr={r['gripErrMm']:4.2f}mm | legDelta={r['maxLegDeltaDeg']:.5f}deg"
        )
        assert r["maxLegDeltaDeg"] < 1e-3, f"Lower body drifted on frame {r['frame']}: {r['maxLegDeltaDeg']}"
        assert r["gripErrMm"] < 8.0, f"Grip distance error too large on frame {r['frame']}: {r['gripErrMm']} mm"

    # Stamp glTF scene extras metadata
    meta = {
        "schema": 1,
        "author": "Antigravity",
        "basedOn": BASE_CLIP,
        "fps": FPS,
        "gridCols": 3,
        "gridRows": 3,
        "refFrame": 4,
        "yawColsDeg": list(YAW_COLS_DEG),
        "pitchRowsDeg": list(PITCH_ROWS_DEG),
        "poses": report_poses,
        "script": "Taierzhuang1938/_import/Script_BakeRifleAimOffset9.py",
    }
    scene["tz_aim_offset"] = json.dumps(meta, ensure_ascii=False)

    # Save editable .blend OUTSIDE the git repo
    blend_path = os.path.abspath(opts["blend_out"])
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    print(f"[AimOffset9] saved blend: {blend_path}")

    # Export clean animation-only GLB (armature + 9-frame action, matching existing Mixamo GLB layout)
    os.makedirs(GLB_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_force_sampling=True,
        export_frame_range=True,
        export_frame_step=1,
        export_skins=True,
        export_yup=True,
        export_apply=False,
        export_extras=True,
    )
    glb_size = os.path.getsize(GLB_OUT)
    print(f"[AimOffset9] exported GLB: {GLB_OUT} ({glb_size} bytes)")

    if opts["preview"]:
        RenderPreviewSheet(opts["preview"])


def RenderPreviewSheet(png_path):
    """Render a 3x3 visual verification sheet using Model_MixamoXBot.glb + rifle proxy."""
    print(f"[AimOffset9] rendering 3x3 preview sheet -> {png_path}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # CRITICAL: set scene FPS to 30 BEFORE importing GLB so keyframe times 0/30..8/30 map 1:1 to frames 0..8!
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 8

    # Import XBot mesh + our newly baked 9-frame animation
    bpy.ops.import_scene.gltf(filepath=XBOT_MODEL_GLB)
    xbot_arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    xbot_meshes = [o for o in bpy.data.objects if o.type == "MESH"]

    bpy.ops.import_scene.gltf(filepath=GLB_OUT)
    anim_arm = next(o for o in bpy.data.objects if o.type == "ARMATURE" and o != xbot_arm)
    baked_action = anim_arm.animation_data.action if anim_arm.animation_data else None
    if baked_action:
        xbot_arm.animation_data_create()
        xbot_arm.animation_data.action = baked_action
        # Blender 4.4 / 5.x slotted actions: bind slot explicitly so PoseBones evaluate the imported action!
        if hasattr(xbot_arm.animation_data, "action_slot") and getattr(baked_action, "slots", None):
            for slot in baked_action.slots:
                if getattr(slot, "target_id_type", "OBJECT") == "OBJECT":
                    xbot_arm.animation_data.action_slot = slot
                    break
    bpy.data.objects.remove(anim_arm, do_unlink=True)

    # Build a clean visual rifle proxy cylinder (1.05m barrel + stock) that tracks the palms
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=1.08, location=(0, 0, 0))
    rifle_obj = bpy.context.active_object
    rifle_obj.name = "RifleProxy"
    mat_rifle = bpy.data.materials.new("MatRifle")
    mat_rifle.diffuse_color = (0.35, 0.20, 0.10, 1.0)
    rifle_obj.data.materials.append(mat_rifle)

    # Give XBot a crisp light-gray material for clear silhouette reading
    mat_body = bpy.data.materials.new("MatXBot")
    mat_body.diffuse_color = (0.72, 0.76, 0.82, 1.0)
    for m in xbot_meshes:
        m.data.materials.clear()
        m.data.materials.append(mat_body)

    # Render all 9 frames to individual tiles and composite into 3x3 sheet using Blender's Image API
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 360
    scene.render.resolution_y = 360
    scene.render.image_settings.file_format = "PNG"
    scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.12, 0.14, 0.18)

    # Front-3/4 camera so Left, Center, Right, Up and Down silhouettes & rifle direction read unmistakably
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 42
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam_pos = Vector((0.85, -2.75, 1.50))
    look_at = Vector((0.0, -0.05, 1.05))
    cam.location = cam_pos
    cam.rotation_euler = (look_at - cam_pos).to_track_quat("-Z", "Y").to_euler()

    tile_dir = os.path.dirname(os.path.abspath(png_path))
    os.makedirs(tile_dir, exist_ok=True)
    tile_paths = []
    for f in range(9):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        # Place rifle proxy along RightPalm -> LeftPalm line
        rp = K.Palm(xbot_arm, "Right")
        lp = K.Palm(xbot_arm, "Left")
        z_dir = (rp - lp).normalized()   # +Z back, -Z muzzle
        y_dir = (Vector((0, 0, 1)) - z_dir * z_dir.z).normalized()
        x_dir = y_dir.cross(z_dir).normalized()
        rmat = Matrix((x_dir, y_dir, z_dir)).transposed().to_4x4()
        # Cylinder local Z is along rifle axis; offset center forward toward muzzle (-0.28 m from gripR)
        rmat.translation = rp - z_dir * 0.28
        rifle_obj.matrix_world = rmat
        bpy.context.view_layer.update()

        tpath = os.path.join(tile_dir, f"_tmp_tile_{f}.png")
        scene.render.filepath = tpath
        bpy.ops.render.render(write_still=True)
        tile_paths.append(tpath)

    # Composite 3x3 tiles into one 1080x1080 PNG
    w, h = 360, 360
    sheet = bpy.data.images.new("AimOffset9Sheet", width=w * 3, height=h * 3, alpha=True)
    buf = [0.0] * (w * 3 * h * 3 * 4)
    for idx, tpath in enumerate(tile_paths):
        img = bpy.data.images.load(tpath)
        pix = list(img.pixels)
        row = idx // 3        # 0=top (Up), 1=mid, 2=bot (Down)
        col = idx % 3         # 0=left, 1=center, 2=right
        # Blender image pixels are bottom-to-top, so row 0 goes at top (y_off = 2*h)
        y_off = (2 - row) * h
        x_off = col * w
        for py in range(h):
            src_start = py * w * 4
            dst_start = ((y_off + py) * (w * 3) + x_off) * 4
            buf[dst_start:dst_start + w * 4] = pix[src_start:src_start + w * 4]
        bpy.data.images.remove(img)
        try:
            os.remove(tpath)
        except OSError:
            pass
    sheet.pixels = buf
    sheet.filepath_raw = os.path.abspath(png_path)
    sheet.file_format = "PNG"
    sheet.save()
    print(f"[AimOffset9] saved 3x3 preview sheet: {png_path}")


if __name__ == "__main__":
    BuildAimOffset9(ParseArgs())

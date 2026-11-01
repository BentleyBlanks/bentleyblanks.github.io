"""StripperLoadProne - 卧姿压桥夹装弹（中正式 / 三八式，转栓式；不是汉阳造的整夹装填）。

改自 Mixamo 的 Animation_Mixamo_ProneIdle_V1（端枪卧姿，第 1 帧两手都握枪，共 149 帧，首尾相同）。
单次动作（loop = false），第 1 帧和最后一帧逐帧等于原动作的第 1 / 第 149 帧（把原来 4.9 s 的呼吸均匀拉长到 6.8 s，
所以起止两头的姿势、手指、肘、脚都和原动作一模一样，能和别的卧姿动作接上）。

做法：
  1. 躯干：骨盆到胸口沿身体纵轴逐级向左侧翻（右侧抬起，右手好够腰前），头略低下看机匣、拉栓时右肩后带；
  2. 双脚用 IK 钉在原位（骨盆转一点、抬高 2.5 cm 也不让脚漂）；
  3. 左手一直托护木（IK），枪完全跟着左手走（预览就是这样放枪的）：左手把枪转过来——枪托离肩向右挪、
     枪头略抬、枪身相对身体向右倾，世界里枪几乎是正的；
  4. 右手按路标点 IK：握把 -> 拉柄 -> 上翻 -> 后拉 -> 放开 -> 腰带前侧子弹盒 -> 取桥夹 -> 手贴到机匣上插夹
     -> 压弹两下 -> 回拉柄（后拉位）-> 前推 -> 下压 -> 回握把；
  5. 插夹、压弹的手型：右手贴在机匣右上方，掌心朝下贴近槽口（离 feedMouth <= 8 cm），食指到小指向前从机匣
     右侧勾住枪身（指尖在机匣右下侧），拇指屈曲、指肚压在桥夹最上面那发子弹上；压弹 = 拇指屈曲加深 + 手腕下沉
     2.5 cm，不是整条胳膊上下。手型是在拇指指肚压到 feedMouth 上方 1.2 cm 的前提下，用随机搜索 + 局部细化选出的
     （搜索条件：掌心 <= 8 cm、手腕在机匣右上方、指尖在机匣右下侧）。
  6. 起止各约 0.4 s 内手臂 IK 渐入渐出，极点（肘朝哪边）也从原动作的肘位渐变到中段用的极点，所以起止帧不动。

关键帧时间表（秒，30 fps，第 1 帧 = 0 s）：
  0.00-0.30  原端枪卧姿
  0.30-1.20  身体向左侧翻（骨盆 16 度、胸口共约 33 度）、头低下；左手把枪转过来（枪托离肩向右挪、枪头抬 4 度、
             枪身相对身体向右倾，世界里枪几乎是正的）；右手仍握把跟着枪走
  0.65-1.25  右手松开握把，伸向拉柄（手指先张开再合拢）
  1.25-1.40  右手握住拉柄（掌心离拉柄点约 1.2 cm）
  1.40-1.60  拉柄上翻 90 度
  1.60-1.95  后拉到底（右肩跟着后带一点）
  1.95-2.10  停一拍；2.10-2.30 放开拉柄
  2.30-3.05  右手贴着身体右侧低处伸到腰带前侧子弹盒（约 0.75 s）
  3.05-3.30  握住并掏出桥夹（拇指食指捏住）
  3.30-4.20  把桥夹从身体右侧低处端到机匣右上方，低头看
  4.20-4.32  竖着插进桥夹槽（手贴在机匣上，桥夹捏在拇指和食指之间）
  4.32-4.52  压弹第一下（手腕下沉 + 拇指屈曲，拇指指肚压到 feedMouth 上方约 1.2 cm）；4.52-4.67 抬起
  4.67-4.85  压弹第二下；4.85-5.02 拇指离开
  5.02-5.50  右手回到拉柄（后拉位）握住
  5.50-5.76  向前推栓，空桥夹在约 5.60 s 被顶飞（预览里没有桥夹）
  5.76-5.95  下压拉柄锁住；5.95-6.08 停一拍放开
  6.08-6.50  右手回握把，枪托回抵肩、枪回正，身体回正
  6.50-6.80  停在端枪卧姿

史实：转栓式步枪（中正式 = 毛瑟 98 式系，三八式）。拉栓 = 拉柄上翻约 90 度 -> 后拉 -> 前推 -> 下压；
5 发桥夹从机匣顶部桥夹槽插下，拇指把子弹压进弹仓，推栓时空桥夹被顶飞（不用手去拔）。
汉阳造是整夹装填，不是这个动作。卧姿时枪身立着、身体略向左侧翻是为了让右手够到腰带前侧的子弹盒、同时桥夹槽朝上。

手骨坐标约定（这副骨架）：手骨局部 +Y = 手指方向，+Z = 掌心法线（手指弯曲的方向），+X = 拇指一侧。
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "StripperLoadProne"
BASE = "Animation_Mixamo_ProneIdle_V1"
RIFLE = "ZhongZheng"
RI = K.RIFLES[RIFLE]
FPS = 30
T_END = 6.8
LAST = 1 + int(round(T_END * FPS))
ID = Quaternion((1, 0, 0, 0))
WIN = 12                                    # IK windows start / end this many frames inside the clip
BLEND = 10                                  # and fade in / out over this many frames (frames 1..2 and the last 2 stay untouched)


# ----------------------------------------------------------------------------- small helpers
def Smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * u * (u * (u * 6 - 15) + 10)


def Track(t, pts):
    """Piecewise smooth value: pts [(time, value)], flat before the first / after the last, eased between."""
    if t <= pts[0][0]:
        return pts[0][1]
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t < t1:
            return v0 + (v1 - v0) * Smooth((t - t0) / (t1 - t0))
    return pts[-1][1]


def WQ(m):
    return m.to_3x3().normalized().to_quaternion()


def Align(a, A, b, B):
    """Rotation R with R a = A exactly and R b as close to B as a rigid turn allows."""
    a, A = Vector(a).normalized(), Vector(A).normalized()
    b, B = Vector(b), Vector(B)
    b = (b - a * a.dot(b)).normalized()
    B = (B - A * A.dot(B)).normalized()
    Ml = Matrix((a, b, a.cross(b))).transposed()
    Mw = Matrix((A, B, A.cross(B))).transposed()
    return (Mw @ Ml.transposed()).to_quaternion()


def Deg(x):
    return math.radians(x)


def Tm(f):
    return (f - 1) / FPS


def Fr_(t):
    return 1 + int(round(t * FPS))


def Slerp(q0, q1, s):
    if q0.dot(q1) < 0:
        q1 = -q1
    return q0.slerp(q1, s)


def PowQ(q, a):
    """q ** a along the rotation axis (a may exceed 1: curl further than the original grip)."""
    axis, ang = q.to_axis_angle()
    return Quaternion(axis, ang * a)


# ----------------------------------------------------------------------------- load + capture the base clip
arm = K.LoadBase(BASE)
sc = bpy.context.scene
F0, FB = sc.frame_start, sc.frame_end
K.ExtendTo(arm, LAST)
POSE = list(arm.pose.bones)
NAMES = [pb.name for pb in POSE]

base_rot, base_loc, base_foot, base_heads = {}, {}, {}, {}
for f in range(F0, FB + 1):
    K.At(f)
    base_rot[f] = {pb.name: pb.rotation_quaternion.copy() for pb in POSE}
    base_loc[f] = {pb.name: pb.location.copy() for pb in POSE}
    base_foot[f] = {s: (K.BoneHead(arm, s + "Foot"), WQ(K.BoneMatrix(arm, s + "Foot"))) for s in ("Left", "Right")}
    if f in (F0, FB):
        base_heads[f] = {pb.name: K.BoneHead(arm, pb.name) for pb in POSE}


def BaseU(f):
    """Position in the base clip (fractional frame): the whole clip is stretched evenly over F0..LAST."""
    return F0 + (f - F0) * (FB - F0) / (LAST - F0)


def _Split(f):
    u = BaseU(f)
    i = min(int(math.floor(u)), FB - 1)
    return i, u - i


def BaseAt(f):
    i, s = _Split(f)
    rot = {n: Slerp(base_rot[i][n], base_rot[i + 1][n], s) for n in NAMES}
    loc = {n: base_loc[i][n].lerp(base_loc[i + 1][n], s) for n in NAMES}
    return rot, loc


def FootAt(f, side):
    i, s = _Split(f)
    (p0, q0), (p1, q1) = base_foot[i][side], base_foot[i + 1][side]
    return p0.lerp(p1, s), Slerp(q0, q1, s)


K.At(F0)
M0 = K.RifleFrame(arm, F0)
Qm0 = WQ(M0)
left0 = K.BoneMatrix(arm, "LeftHand", F0)
PIN = left0.inverted() @ M0
Qh0 = WQ(K.BoneMatrix(arm, "RightHand"))
wrist0 = K.BoneHead(arm, "RightHand")
palm0 = K.Palm(arm, "Right")
PALM_OFF = Qh0.inverted() @ (palm0 - wrist0)          # palm point in the hand-bone frame (metres)
REL0 = Qm0.inverted() @ Qh0                          # right hand relative to the rifle in the grip
hips0 = K.BoneHead(arm, "Hips")
Qhips0 = WQ(K.BoneMatrix(arm, "Hips"))
neck0 = K.BoneHead(arm, "Neck")
BODY_AXIS = (neck0 - hips0).normalized()              # pelvis -> neck, roughly -Y
ROLL_AXIS = -BODY_AXIS                                # +angle about it lifts the right side

# ----------------------------------------------------------------------------- tracks (seconds)
ROLL = [(0, 0), (0.35, 0), (1.2, 1), (5.95, 1), (6.65, 0)]
RIFLE_ENV = [(0, 0), (0.30, 0), (1.15, 1), (6.0, 1), (6.55, 0)]
HEAD_DIP = [(0, 0), (0.6, 0), (1.4, 1), (5.95, 1), (6.65, 0)]
PULL = [(1.55, 0), (1.95, 1), (2.45, 0)]
PRESS_DIP = [(4.2, 0), (4.52, 1), (4.67, 0.3), (4.85, 1), (5.02, 0)]
ROLL_DEG = {"Hips": 20.0, "Spine": 8.0, "Spine1": 5.0, "Spine2": 4.0, "Head": -14.0}


def RotateAbout(name, axis, angle, pivot=None):
    pb = arm.pose.bones[name]
    mw = arm.matrix_world @ pb.matrix
    p = mw.translation.copy() if pivot is None else pivot
    t = Matrix.Translation(p)
    mw2 = t @ Matrix.Rotation(angle, 4, axis) @ t.inverted() @ mw
    pb.matrix = arm.matrix_world.inverted() @ mw2
    bpy.context.view_layer.update()


def LiftHips(dz):
    pb = arm.pose.bones["Hips"]
    mw = Matrix.Translation((0, 0, dz)) @ (arm.matrix_world @ pb.matrix)
    pb.matrix = arm.matrix_world.inverted() @ mw
    bpy.context.view_layer.update()


# ----------------------------------------------------------------------------- stage 1: dense keys + torso edits
for f in range(F0, LAST + 1):
    K.At(f)
    t = Tm(f)
    rot, loc = BaseAt(f)
    for pb in POSE:
        pb.rotation_quaternion = rot[pb.name]
        pb.location = loc[pb.name]
    bpy.context.view_layer.update()
    r, h, pull, press = Track(t, ROLL), Track(t, HEAD_DIP), Track(t, PULL), Track(t, PRESS_DIP)
    if r > 0 or h > 0 or pull > 0 or press > 0:
        LiftHips(0.025 * r)
        for bone in ("Hips", "Spine", "Spine1", "Spine2"):
            RotateAbout(bone, ROLL_AXIS, Deg(ROLL_DEG[bone]) * r)
        RotateAbout("Spine2", Vector((0, 0, 1)), Deg(-4.0) * pull)                    # right shoulder drawn back with the bolt
        RotateAbout("Head", ROLL_AXIS, Deg(ROLL_DEG["Head"]) * r)
        RotateAbout("Head", Vector((1, 0, 0)), Deg(20.0) * h + Deg(4.0) * press)       # look down at the action
    for pb in POSE:
        pb.keyframe_insert("rotation_quaternion", frame=f)
    arm.pose.bones["Hips"].keyframe_insert("location", frame=f)
K.At(F0)


# ----------------------------------------------------------------------------- generic IK + bake (K.ArmIk with auto pole angle)
def IkBake(tip_bone, joint_bone, rot_bone, bake_bones, keys, rot_keys, pole_pos, window, blend=BLEND, tag="IK", joint_ref=None):
    target = K._Empty(f"{tag}_T")
    for f, p in keys:
        target.location = p
        target.keyframe_insert("location", frame=f)
    target.rotation_mode = "QUATERNION"
    for f, q in rot_keys:
        target.rotation_quaternion = q
        target.keyframe_insert("rotation_quaternion", frame=f)
    if isinstance(pole_pos, list):          # animated pole: [(frame, point)]
        pole = K._Empty(f"{tag}_P", pole_pos[0][1])
        for f, p in pole_pos:
            pole.location = p
            pole.keyframe_insert("location", frame=f)
    else:
        pole = K._Empty(f"{tag}_P", pole_pos)
    ik = arm.pose.bones[tip_bone].constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole
    rot = arm.pose.bones[rot_bone].constraints.new("COPY_ROTATION")
    rot.target = target
    # Pick the pole angle that reproduces the wanted middle joint (elbow / knee). Default: the original joint at the first frame,
    # where the target sits exactly on the original pose and the pole on the original side. With joint_ref ([(frame, point)])
    # the angle is fitted (any value, 6 degree steps) so the solved joint lands on those points.
    ik.influence = 0.0
    K.At(F0)
    bpy.context.view_layer.update()
    ref = arm.matrix_world @ arm.pose.bones[joint_bone].head
    ik.influence = 1.0
    best = None
    if joint_ref is None:
        angles, refs = (-90, 90, 0, 180), [(F0, ref)]
    else:
        angles, refs = range(-180, 181, 6), [(F0, ref)] + joint_ref
    for ang in angles:
        ik.pole_angle = Deg(ang)
        score = 0.0
        for tf, pt in refs:
            K.At(tf)
            bpy.context.view_layer.update()
            score += (arm.matrix_world @ arm.pose.bones[joint_bone].head - pt).length
        if best is None or score < best[0]:
            best = (score, ang)
    ik.pole_angle = Deg(best[1])
    first, last = window
    for c in (ik, rot):
        for f, v in ((first - blend, 0.0), (first, 1.0), (last, 1.0), (last + blend, 0.0)):
            c.influence = v
            c.keyframe_insert("influence", frame=f)
    K._BakeBones(arm, bake_bones, first - blend, last + blend)
    for o in (target, pole):
        bpy.data.objects.remove(o, do_unlink=True)


def SmoothRot(keys, t0, t1, half=4):
    """Moving average (+-half frames) of the hand rotation keys between t0 and t1 s, so the hand turns steadily."""
    out = []
    for i, (f, q) in enumerate(keys):
        if not (t0 <= Tm(f) <= t1):
            out.append((f, q))
            continue
        lo, hi = max(0, i - half), min(len(keys) - 1, i + half)
        acc = Quaternion((0, 0, 0, 0))
        for j in range(lo, hi + 1):
            qj = keys[j][1]
            acc += qj if qj.dot(q) >= 0 else -qj
        acc.normalize()
        out.append((f, acc))
    return out



def BasePole(side, lift=(0, 0, 0), limb="Arm"):
    """Pole point from the base pose: the middle joint pushed further away from the root-end line (limb: Arm or Leg)."""
    K.At(F0)
    names = ("Arm", "ForeArm", "Hand") if limb == "Arm" else ("UpLeg", "Leg", "Foot")
    sh, el, wr = (K.BoneHead(arm, side + n) for n in names)
    mid = sh.lerp(wr, 0.5)
    return mid + (el - mid).normalized() * 0.5 + Vector(lift)


WINDOW = (F0 + WIN, LAST - WIN)

# ----------------------------------------------------------------------------- stage 2: feet pinned
for side in ("Left", "Right"):
    pole = BasePole(side, limb="Leg")
    keys, rkeys = [], []
    prevq = None
    for f in range(F0, LAST + 1):
        pos, q = FootAt(f, side)
        if prevq is not None and q.dot(prevq) < 0:
            q = -q
        prevq = q
        keys.append((f, pos))
        rkeys.append((f, q))
    IkBake(f"{side}Leg", f"{side}Leg", f"{side}Foot", [f"{side}UpLeg", f"{side}Leg", f"{side}Foot"], keys, rkeys, pole, WINDOW, tag=f"Leg{side}")

# ----------------------------------------------------------------------------- rifle (follows the left hand)
G = Vector(RI["gripL"])
RIFLE_DEG = {"yaw": 7.0, "pitch": 4.0, "roll": -6.0}      # butt out to the right / muzzle up / top of the rifle to the right


def MDes(t):
    e = Track(t, RIFLE_ENV)
    rot = (Matrix.Rotation(Deg(RIFLE_DEG["roll"]) * e, 4, "Z") @ Matrix.Rotation(Deg(RIFLE_DEG["pitch"]) * e, 4, "X")
           @ Matrix.Rotation(Deg(RIFLE_DEG["yaw"]) * e, 4, "Y"))
    return M0 @ Matrix.Translation(G) @ rot @ Matrix.Translation(-G)


# ----------------------------------------------------------------------------- finger poses (right hand)
FING = {"idx": ["RightHandIndex1", "RightHandIndex2", "RightHandIndex3"],
        "mid": [f"RightHand{n}{i}" for n in ("Middle", "Ring", "Pinky") for i in (1, 2, 3)],
        "th": ["RightHandThumb1", "RightHandThumb2", "RightHandThumb3"]}


def FingerQuats(f, a_idx, a_mid, a_th):
    """1 = the original grip curl of this frame (exactly the base clip), 0 = straight, > 1 = curled further."""
    rot, _ = BaseAt(f)
    out = {}
    for key, a in (("idx", a_idx), ("mid", a_mid), ("th", a_th)):
        for b in FING[key]:
            out[b] = rot[b] if a == 1.0 else PowQ(rot[b], a)
    return out


FINGER_KEYS = [  # t, idx, mid, thumb
    (0.00, 1.0, 1.0, 1.0), (0.60, 1.0, 1.0, 1.0), (0.95, 0.35, 0.35, 0.35), (1.25, 0.70, 0.80, 0.78),
    (2.00, 0.70, 0.80, 0.78), (2.20, 0.35, 0.35, 0.30), (2.90, 0.35, 0.35, 0.30), (3.18, 0.50, 0.55, 0.45),
    (3.40, 0.55, 0.80, 0.50), (4.00, 0.50, 0.80, 0.90), (4.20, 0.50, 0.80, 1.00), (4.32, 0.50, 0.80, 1.00),
    (4.52, 0.60, 0.80, 1.30), (4.67, 0.60, 0.80, 1.00), (4.85, 0.60, 0.80, 1.30), (5.02, 0.60, 0.80, 1.00),
    (5.22, 0.40, 0.45, 0.30), (5.50, 0.70, 0.80, 0.78), (5.95, 0.70, 0.80, 0.78), (6.12, 0.40, 0.45, 0.40),
    (6.50, 1.0, 1.0, 1.0)]


def FingerPose(t):
    for (t0, *p0), (t1, *p1) in zip(FINGER_KEYS, FINGER_KEYS[1:]):
        if t < t1:
            s = Smooth((t - t0) / (t1 - t0))
            return tuple(a + (b - a) * s for a, b in zip(p0, p1))
    return tuple(FINGER_KEYS[-1][1:])


# ----------------------------------------------------------------------------- right hand waypoints
KN, KU, KB = (Vector(RI[k]) for k in ("knob", "knobUp", "knobBack"))
FM = Vector(RI["feedMouth"])
OUT = Vector((0.012, 0, 0))                      # palm sits a little outboard of the knob ball
R_KNOB = Quaternion((0, 0, 1), Deg(45)) @ REL0   # palm turned from "toward the stock" to "left and down, onto the knob"
# Press hand (rifle frame): palm down on the right-top of the receiver, fingers forward and curled over the right side,
# thumb pointing left across the top. Found by a search that keeps the palm within 8 cm of feedMouth with the thumb pad
# 1.2 cm above it, the wrist above and right of the receiver, and the finger tips on its lower right side.
R_PRESS = Quaternion((-0.1401, 0.1313, 0.7522, -0.6304)).normalized()
P_BOT = Vector((0.031, 0.069, -0.122))            # palm at the bottom of a press
P_TOP = P_BOT + Vector((0.0, 0.022, 0.0))
P_INS = P_BOT + Vector((0.0, 0.025, 0.0))
# pouch: front of the belt, right side. Hips-local point/orientation from the base pose (world base axes).
POUCH_BASE = hips0 + Vector((-0.13, 0.0, -0.075))
POUCH_LOCAL = Qhips0.inverted() @ (POUCH_BASE - hips0)
R_POUCH = Qhips0.inverted() @ Align((0, 1, 0), (0.55, 0.75, -0.2), (0, 0, 1), (0.6, 0.0, -0.8))   # palm toward the belly

# On the way to the belt pouch and back the fingers follow the shoulder -> palm line (the forearm roughly continues into the
# hand, so the wrist never folds back), palm turned toward the belly, and this blends into the waypoint orientation at both
# ends over about 0.35 s.
AUTO = [(2.30, 0.0), (2.65, 1.0), (3.85, 1.0), (4.20, 0.0)]
PALM_TO_BELLY = Vector((0.75, 0.0, -0.65))
PALM_BLEND = [(3.45, 0.0), (4.10, 1.0)]


def P(pos, rot):
    return {"pos": Vector(pos), "rot": rot}


# (time, ref, spec, bulge in world (metres, applied sin-shaped over the segment to the next point))
WP = [
    (0.00, "rifle", P((0, 0, 0), REL0), None),
    (0.65, "rifle", P((0, 0, 0), REL0), None),
    (1.25, "rifle", P(KN + OUT, R_KNOB), Vector((0, 0, 0.02))),
    (1.40, "rifle", P(KN + OUT, R_KNOB), None),
    (1.60, "rifle", P(KU + OUT, R_KNOB), None),
    (1.95, "rifle", P(KB + OUT, R_KNOB), None),
    (2.10, "rifle", P(KB + OUT, R_KNOB), None),
    (2.30, "rifle", P(KB + OUT + Vector((0.05, 0.02, 0.0)), R_KNOB), Vector((-0.25, 0.0, -0.01))),
    (3.18, "hips", P(POUCH_LOCAL, R_POUCH), None),
    (3.38, "hips", P(POUCH_LOCAL, R_POUCH), None),
    (3.45, "hips", P(POUCH_LOCAL + Vector((0.0, 0.0, -0.02)), R_POUCH), Vector((-0.25, 0.0, -0.01))),
    (4.20, "rifle", P(P_INS, R_PRESS), None),
    (4.32, "rifle", P(P_INS - Vector((0, 0.004, 0)), R_PRESS), None),
    (4.52, "rifle", P(P_BOT, R_PRESS), None),
    (4.67, "rifle", P(P_TOP, R_PRESS), None),
    (4.85, "rifle", P(P_BOT, R_PRESS), None),
    (5.02, "rifle", P(P_TOP + Vector((0, 0.02, 0)), R_PRESS), None),
    (5.50, "rifle", P(KB + OUT, R_KNOB), Vector((0.03, 0.0, 0.03))),
    (5.76, "rifle", P(KU + OUT, R_KNOB), None),
    (5.95, "rifle", P(KN + OUT, R_KNOB), None),
    (6.08, "rifle", P(KN + OUT, R_KNOB), None),
    (6.50, "rifle", P((0, 0, 0), REL0), Vector((0.0, 0.0, 0.02))),
    (6.80, "rifle", P((0, 0, 0), REL0), None),
]


def WristFor(spec, ref_m, ref_q, hips_head):
    """World wrist position + hand rotation for one waypoint spec in the given reference frame."""
    rot = ref_q @ spec["rot"]
    point = ref_m @ spec["pos"] if ref_m is not None else hips_head + ref_q @ spec["pos"]
    return point - rot @ PALM_OFF, rot, point


def RightHand(t, mrifle, hips_m, shoulder):
    hips_head, hips_q = hips_m.translation, WQ(hips_m)
    rifle_q = WQ(mrifle)
    for i in range(len(WP) - 1):
        t0, ref0, sp0, bulge = WP[i]
        t1, ref1, sp1, _ = WP[i + 1]
        if t < t1 or i == len(WP) - 2:
            s = Smooth((t - t0) / (t1 - t0))
            if t0 in (2.30, 3.45):             # the long slides along the body: steadier speed through the middle
                s = 0.4 * s + 0.6 * min(1.0, max(0.0, (t - t0) / (t1 - t0)))
            ends = []
            for ref, sp in ((ref0, sp0), (ref1, sp1)):
                if ref == "rifle":
                    ends.append(WristFor(sp, mrifle, rifle_q, hips_head))
                else:
                    ends.append(WristFor(sp, None, hips_q, hips_head))
            w = ends[0][0].lerp(ends[1][0], s)
            if bulge is not None:
                w = w + bulge * math.sin(math.pi * s)
            q = Slerp(ends[0][1], ends[1][1], s)
            point = ends[0][2].lerp(ends[1][2], s)
            if bulge is not None:
                point = point + bulge * math.sin(math.pi * s)
            wa = Track(t, AUTO)
            if wa > 0:
                c = Track(t, PALM_BLEND)
                press_n = (rifle_q @ R_PRESS) @ Vector((0, 0, 1))
                qa = Align((0, 1, 0), point - shoulder, (0, 0, 1), PALM_TO_BELLY * (1 - c) + press_n * c)
                q = Slerp(q, qa, wa)
                w = point - q @ PALM_OFF
            return w, q, point


# ----------------------------------------------------------------------------- stage 3: both arms
lk, lrk, rk, rrk, rpt = [], [], [], [], []
prev_l = prev_r = None
for f in range(F0, LAST + 1):
    t = Tm(f)
    K.At(f)
    hips_m = K.BoneMatrix(arm, "Hips")
    m = MDes(t)
    lt = m @ PIN.inverted()
    lq = WQ(lt)
    if prev_l is not None and lq.dot(prev_l) < 0:
        lq = -lq
    prev_l = lq
    lk.append((f, lt.translation.copy()))
    lrk.append((f, lq))
    wr, rq, pt = RightHand(t, m, hips_m, K.BoneHead(arm, "RightArm"))
    if prev_r is not None and rq.dot(prev_r) < 0:
        rq = -rq
    prev_r = rq
    rk.append((f, wr))
    rrk.append((f, rq))
    rpt.append(pt)


def PoleKeys(start, middle):
    """Pole that starts at the base elbow's side and moves to the mid-clip pole while the body rolls (same envelope)."""
    return [(f, start.lerp(middle, Track(Tm(f), ROLL))) for f in range(F0, LAST + 1)]


rrk = SmoothRot(rrk, 2.3, 4.3)
rk = [(f, pt - q @ PALM_OFF) for (f, q), pt in zip(rrk, rpt)]      # wrist follows the smoothed hand turn, palm stays on its path
POLE_L = PoleKeys(BasePole("Left"), BasePole("Left", (0.12, 0, 0.12)))

# Right arm: the elbow side is chosen per frame. It starts on the base elbow's side, turns outward-and-down while the body
# rolls, and swings up-and-back while the hand is away from the rifle (the right side is up then, elbow high is natural).
# The pole is the point on that side of the shoulder-wrist line, so it can never be in line with the arm axis.
V_OUT = Vector((-0.8, -0.1, -0.5)).normalized()


# While the hand slides to the belt and back, the elbow side is outward-and-back and level (not down, not up): the upper arm
# reaches back and out along the ribs instead of rising.
W_LEVEL = [(2.30, 0.0), (2.55, 1.0), (3.95, 1.0), (4.25, 0.0)]
V_LEVEL = Vector((-1.0, 0.3, 0.0)).normalized()


V_PASS = Vector((-0.3, 0.9, 0.0)).normalized()        # hand level with the shoulder (arm hanging down beside it): elbow behind, level


def ElbowDir(t, v_base, dy):
    """dy: wrist y minus shoulder y (negative = hand ahead of the shoulder)."""
    v = v_base.lerp(V_OUT, Track(t, ROLL)).lerp(V_LEVEL, Track(t, W_LEVEL))
    return v.lerp(V_PASS, Smooth(1.0 - abs(dy) / 0.35) * Track(t, W_LEVEL))


def ElbowPoleKeys(side, wrist_keys):
    """Per-frame pole for the right arm plus the elbow points it should produce.

    The elbow is a point on the circle of positions allowed by the arm lengths (axis = shoulder -> wrist). Its default side
    comes from ElbowDir; while the hand slides to the belt and back, a small dynamic program turns it about the axis (the fewest
    degrees, changing slowly from frame to frame) so that it never rises above the shoulder (+2 cm) and stays out to the right of
    the body.
    """
    K.At(F0)
    sh0, el0, wr0 = (K.BoneHead(arm, side + n) for n in ("Arm", "ForeArm", "Hand"))
    v_base = (el0 - sh0.lerp(wr0, 0.5)).normalized()
    a_up, a_fore = (el0 - sh0).length, (wr0 - el0).length
    rows, last = [], None
    for f, wr in wrist_keys:
        K.At(f)
        sh = K.BoneHead(arm, side + "Arm")
        axis = (wr - sh).normalized()
        v = ElbowDir(Tm(f), v_base, wr.y - sh.y)
        n = v - axis * axis.dot(v)
        n = last if n.length < 0.15 and last is not None else n.normalized()
        last = n
        L = (wr - sh).length
        xx = (a_up ** 2 - a_fore ** 2 + L * L) / (2 * L)
        h = math.sqrt(max(a_up ** 2 - xx * xx, 1e-6))
        rows.append({"f": f, "sh": sh.copy(), "wr": wr, "axis": axis, "n": n, "m": axis.cross(n), "c": sh + axis * xx, "h": h,
                     "t0": K.BoneHead(arm, "Hips"), "t1": K.BoneHead(arm, "Spine2")})
    # Dynamic program over the turn angle phi (degrees) for frames inside the slide window. phi is measured from a basis that is
    # carried along from frame to frame with the least twist (no jumps when the arm passes through the vertical).
    idx = [i for i, r in enumerate(rows) if 2.2 <= Tm(r["f"]) <= 4.35]
    phis = list(range(-180, 181, 5))
    INF = 1e9
    if idx:
        nt = rows[idx[0]]["n"]
        for i in idx:
            r = rows[i]
            nt = nt - r["axis"] * r["axis"].dot(nt)
            nt = nt.normalized()
            r["bn"], r["bm"] = nt, r["axis"].cross(nt)
        last_r = rows[idx[-1]]
        psi = math.degrees(math.atan2(last_r["n"].dot(last_r["bm"]), last_r["n"].dot(last_r["bn"])))   # end must meet the default side

        def elbow(r, phi):
            return r["c"] + (r["bn"] * math.cos(Deg(phi)) + r["bm"] * math.sin(Deg(phi))) * r["h"]

        def seg_dist(p, a, b):
            ab = b - a
            u = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
            return (p - (a + ab * u)).length

        def cost(r, e, phi):
            # the forearm must stay clear of the torso (axis Hips -> Spine2, radius 0.12 + margin); the elbow must not rise
            # above the shoulder (+0.5 cm), stay out to the right of the shoulder, and stay off the floor
            dmin = min(seg_dist(r["wr"].lerp(e, q / 4.0), r["t0"], r["t1"]) for q in range(1, 5))
            return (4000.0 * max(0.0, e.z - (r["sh"].z + 0.005)) + 3000.0 * max(0.0, e.x - (r["sh"].x - 0.05))
                    + 2000.0 * max(0.0, 0.12 - dmin) + 4000.0 * max(0.0, 0.07 - e.z) + 0.0002 * phi * phi)

        E = [[elbow(rows[i], ph) for ph in phis] for i in idx]
        best = [[INF] * len(phis) for _ in idx]
        back = [[0] * len(phis) for _ in idx]
        for k, ph in enumerate(phis):
            best[0][k] = cost(rows[idx[0]], E[0][k], ph) if ph == 0 else INF
        for i in range(1, len(idx)):
            for k, ph in enumerate(phis):
                c0 = cost(rows[idx[i]], E[i][k], ph)
                for k2 in range(len(phis)):
                    if best[i - 1][k2] >= INF:
                        continue
                    d = (E[i][k] - E[i - 1][k2]).length            # how far the elbow travels in one frame
                    if d > 0.10:
                        continue
                    tot = best[i - 1][k2] + c0 + 1500.0 * d * d
                    if tot < best[i][k]:
                        best[i][k], back[i][k] = tot, k2
        k = min(range(len(phis)), key=lambda q: best[-1][q])      # free end; the elbow eases back to the default side afterwards
        chosen = [0] * len(idx)
        for i in range(len(idx) - 1, -1, -1):
            chosen[i] = phis[k]
            k = back[i][k]
        for i, ph in zip(idx, chosen):
            r = rows[i]
            r["n"] = (r["bn"] * math.cos(Deg(ph)) + r["bm"] * math.sin(Deg(ph))).normalized()
        # ease from the last chosen side back to the default side over the next ~0.5 s (the hand rests at the rifle then)
        n_last = rows[idx[-1]]["n"]
        for i in range(idx[-1] + 1, len(rows)):
            r = rows[i]
            w = Smooth((Tm(r["f"]) - Tm(rows[idx[-1]]["f"])) / 0.5)
            if w >= 1.0:
                break
            nl = n_last - r["axis"] * r["axis"].dot(n_last)
            nl = nl.normalized() if nl.length > 0.15 else r["n"]
            nn = nl.lerp(r["n"], w)
            nn = nn - r["axis"] * r["axis"].dot(nn)
            r["n"] = nn.normalized() if nn.length > 0.15 else r["n"]
    pole, elb = [], []
    for r in rows:
        elb.append((r["f"], r["c"] + r["n"] * r["h"]))
        pole.append((r["f"], r["sh"].lerp(r["wr"], 0.5) + r["n"] * 0.5))
    # smooth the pole path (moving average over +-4 frames) so the elbow swings round steadily
    sm = []
    for i in range(len(pole)):
        lo, hi = max(0, i - 4), min(len(pole) - 1, i + 4)
        acc = Vector((0, 0, 0))
        for j in range(lo, hi + 1):
            acc += pole[j][1]
        sm.append((pole[i][0], acc / (hi - lo + 1)))
    return sm, elb


POLE_R, ELBOW_R = ElbowPoleKeys("Right", rk)
IkBake("LeftForeArm", "LeftForeArm", "LeftHand", ["LeftArm", "LeftForeArm", "LeftHand"], lk, lrk, POLE_L, WINDOW, tag="ArmL")
IkBake("RightForeArm", "RightForeArm", "RightHand", ["RightArm", "RightForeArm", "RightHand"], rk, rrk, POLE_R, WINDOW, tag="ArmR",
       joint_ref=[e for e in ELBOW_R if e[0] in (Fr_(0.9), Fr_(1.5), Fr_(2.4), Fr_(2.7), Fr_(3.0), Fr_(3.4), Fr_(3.8), Fr_(4.2), Fr_(5.0))])

# ----------------------------------------------------------------------------- stage 4: right-hand fingers
for f in range(F0, LAST + 1):
    for b, q in FingerQuats(f, *FingerPose(Tm(f))).items():
        pb = arm.pose.bones[b]
        pb.rotation_quaternion = q
        pb.keyframe_insert("rotation_quaternion", frame=f)
K.At(F0)

# The bake leaves the influence curves of the removed constraints behind; drop them so the clip ends at LAST.
act = arm.animation_data.action
for layer in act.layers:
    for strip in layer.strips:
        for cb in strip.channelbags:
            for fc in list(cb.fcurves):
                if "constraints" in fc.data_path:
                    cb.fcurves.remove(fc)
act.use_frame_range = True
act.frame_start, act.frame_end = F0, LAST

# ----------------------------------------------------------------------------- self checks (stored in the report)
rows = []
hip_start = K.BoneHead(arm, "Hips", F0)
foot_ref = {n: K.BoneHead(arm, n, F0) for n in ("LeftFoot", "RightFoot")}
prev_palm = None
max_speed = 0.0
min_z, min_t = {}, {}
jump, prev_j = {}, None
for f in range(F0, LAST + 1):
    K.At(f)
    lm = K.BoneMatrix(arm, "LeftHand")
    mi = (lm @ PIN).inverted()
    tip_r = mi @ K.BoneHead(arm, "RightHandThumb4")
    palm = K.Palm(arm, "Right")
    if prev_palm is not None:
        max_speed = max(max_speed, (palm - prev_palm).length * FPS)
    prev_palm = palm
    hts = {"RElbow": K.BoneHead(arm, "RightForeArm").z, "LElbow": K.BoneHead(arm, "LeftForeArm").z,
           "RHand": K.BoneHead(arm, "RightHand").z, "LHand": K.BoneHead(arm, "LeftHand").z,
           "RPalm": palm.z, "Chest": min(K.BoneHead(arm, "Spine1").z, K.BoneHead(arm, "Spine2").z),
           "RHandTip": min(K.BoneHead(arm, f"RightHand{n}4").z for n in ("Thumb", "Index", "Middle", "Ring", "Pinky")),
           "LHandTip": min(K.BoneHead(arm, f"LeftHand{n}4").z for n in ("Thumb", "Index", "Middle", "Ring", "Pinky")),
           "LKnee": K.BoneHead(arm, "LeftLeg").z, "RKnee": K.BoneHead(arm, "RightLeg").z}
    for k, v in hts.items():
        if v < min_z.get(k, 9):
            min_z[k], min_t[k] = v, round(Tm(f), 2)
    cur = {n: K.BoneHead(arm, n) for n in ("RightForeArm", "LeftForeArm", "LeftLeg", "RightLeg", "RightHand", "LeftHand")}
    if prev_j:
        for n, v in cur.items():
            d = (v - prev_j[n]).length * 100
            if d > jump.get(n, (0, 0))[0]:
                jump[n] = (round(d, 2), round(Tm(f), 2))
    prev_j = cur
    rows.append({"f": f, "t": round(Tm(f), 3), "thumbTipInRifle": [round(x, 4) for x in tip_r],
                 "thumbTipToFeedMouth_cm": round((tip_r - FM).length * 100, 2),
                 "thumbAboveFeedMouth_cm": round((tip_r.y - FM.y) * 100, 2),
                 "thumbLateral_cm": [round((tip_r.x - FM.x) * 100, 2), round((tip_r.z - FM.z) * 100, 2)],
                 "hipsDrift": round((K.BoneHead(arm, "Hips") - hip_start).length, 4),
                 "footDrift": {n: round((K.BoneHead(arm, n) - foot_ref[n]).length, 4) for n in foot_ref},
                 "heights": {k: round(v, 3) for k, v in hts.items()}})

dev = {}
for f, bf in ((F0, F0), (LAST, FB)):
    K.At(f)
    dev[str(f)] = round(max((K.BoneHead(arm, n) - base_heads[bf][n]).length for n in NAMES) * 100, 3)
extra = {"startEndMaxBoneDeviation_cm_vs_base": dev, "maxJointJump_cm_per_frame": jump,
         "minHeights": {k: round(v, 3) for k, v in min_z.items()}, "minHeightAt_s": min_t,
         "maxRightPalmSpeed_mps": round(max_speed, 2), "checks": rows}

TIMINGS = {"hold": [0.0, 0.30], "rollAndTurnRifle": [0.30, 1.20], "reachBolt": [0.65, 1.25], "graspBolt": [1.25, 1.40],
           "boltUp": [1.40, 1.60], "boltBack": [1.60, 1.95], "releaseBolt": [1.95, 2.30], "toPouch": [2.30, 3.18],
           "takeClip": [3.18, 3.45], "carryClip": [3.45, 4.20], "insertClip": [4.20, 4.32], "press1": [4.32, 4.52],
           "pressUp": [4.52, 4.67], "press2": [4.67, 4.85], "thumbLeave": [4.85, 5.02], "backToBolt": [5.02, 5.50],
           "boltForward": [5.50, 5.76], "clipFlies": 5.60, "boltDown": [5.76, 5.95], "toGripAndRecover": [6.08, 6.50], "hold2": [6.50, 6.80]}
K.Export(arm, NAME, {"base": BASE, "label": "卧姿压桥夹装弹", "loop": False,
                     "note": "中正式/三八式转栓步枪（毛瑟98式系）；5发桥夹插进机匣顶桥夹槽，拇指压弹，推栓时空夹被顶飞。汉阳造是整夹装填，不是这个动作。预览里不显示桥夹和子弹。",
                     "timings": TIMINGS, "duration": T_END, "rifle": RIFLE})
K.Report(arm, NAME, rifle=RIFLE, rifle_frame=F0, extra=extra)

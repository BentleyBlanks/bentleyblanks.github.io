# RifleBoltProne -- 卧姿拉栓（中正式 / 毛瑟 98 式转栓）
#
# 是什么：国军步兵卧姿，开完枪后拉栓退壳、推弹上膛。枪一直抵在肩窝，左手托护木不动，两肘撑地、身体和腿贴地不动；
#         右手松开握把 -> 向前够到拉柄球头 -> 拇指、食指（加中指）攥住球头 -> 上翻约 90° 开锁 ->
#         后拉到底（退壳）停一拍 -> 前推 -> 下压锁闭 -> 松手回握把。拉栓时脸略抬离枪托，右肩后带一点。
# 改自：Animation_Mixamo_ProneIdle_V1（端枪卧姿待机，149 帧，几乎静止）。
#       ProneFiringRifle_V1 只有 26 帧的开枪后坐循环，第 1 帧与 ProneIdle 的两手/枪位完全一致（掌心 (-0.021,-0.717,0.122)，
#       左掌 (-0.015,-1.016,0.175)），所以选更干净的 ProneIdle（没有后坐抖动，截取一段 2 s 也能头尾对齐）。
#       第 1 帧两手都握枪、枪抵肩：右掌到左掌 0.303 m，RifleFrame 重建的枪位稳定。
# 史实：中正式 = 毛瑟 98 式转栓：拉柄上翻约 90° 开锁，后拉到底（退壳），前推（顶弹入膛），下压锁闭。
#       熟练兵一次拉栓 0.8–1.2 s；趴着肘撑地、手腕空间小，做得比站姿稍慢，这里拉栓本身（抓住到松手）1.0 s。
#
# 关键帧（30 fps，第 1 帧 = 0 s；t = (帧 - 1) / 30）：
#   帧   t(s)   内容
#     1  0.00   原卧姿持枪（左手托护木，右手握把）
#     6  0.17   右手开始离开握把（手指松开）
#    15  0.47   掌心到拉柄球头（knob）；手指攥住            脸开始略抬
#    21  0.67   上翻 90° 完成（knobUp）
#    30  0.97   后拉到底（knobBack）                        右肩后带、到底停一拍（退壳）
#    38  1.23   前推回 knobUp
#    45  1.47   下压锁闭（knob）；手指松开                  拉栓 15 -> 45 共 1.00 s
#    54  1.77   右手回到握把，手指握回
#    61  2.00   与第 1 帧相同，可循环
#
# 左手：不做任何编辑，躯干、腿、骨盆也不动；只动右手臂/手指/右肩/头颈，所以左手（= 枪）、骨盆、双脚都不动。
import sys, os, math, json, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Quaternion, Vector, Matrix

bpy = K.bpy
NAME = "RifleBoltProne"
BASE = "Animation_Mixamo_ProneIdle_V1"
RIFLE = "ZhongZheng"
END = 61

F0, F_LEAVE, F_CONTACT, F_UP, F_BACK, F_FWD, F_DOWN, F_RELEASE, F_HOME = 1, 6, 15, 21, 30, 38, 45, 49, 54
ROLL_FRAC = 0.5                   # 手跟着拉柄绕枪膛轴转的比例（拉柄转 97°，手只转一半，腕子不扭）
PALM_OUT = 0.020                  # 掌心骨线到拉柄球头的距离（皮肤厚度 + 攥握，m），沿手背方向外让
SHOULDER_BACK = 0.0               # 右肩后带（下面按帧给出）

arm = K.LoadBase(BASE, frame_end=END)
scene = bpy.context.scene
act = arm.animation_data.action
cb = act.layers[0].strips[0].channelbag(arm.animation_data.action_slot)
FR = list(range(F0, END + 1))


def Smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def Env(keys, f):
    if f <= keys[0][0]:
        return keys[0][1]
    for (fa, va), (fb, vb) in zip(keys, keys[1:]):
        if f <= fb:
            return va + (vb - va) * Smooth((f - fa) / (fb - fa))
    return keys[-1][1]


# ------------------------------------------------------------------ 0. 头尾对齐（截 61 帧，最后 12 帧渐变回第 1 帧），砍掉 61 之后的键
for fc in cb.fcurves:
    v1 = fc.evaluate(F0)
    for kp in fc.keyframe_points:
        if END - 12 < kp.co[0] <= END:
            s = Smooth((kp.co[0] - (END - 12)) / 12.0)
            kp.co[1] = kp.co[1] * (1 - s) + v1 * s
    for i in range(len(fc.keyframe_points) - 1, -1, -1):
        if fc.keyframe_points[i].co[0] > END:
            fc.keyframe_points.remove(fc.keyframe_points[i])
    fc.update()

# ------------------------------------------------------------------ 1. 编辑前存下原动作的相关量
FINGER_BONES = [f"RightHand{fn}{i}" for fn in ("Index", "Middle", "Ring", "Pinky", "Thumb") for i in (1, 2, 3)]
LAYERED = ["Neck", "Head", "RightShoulder"] + FINGER_BONES
base_q = {}
for f in FR:
    K.At(f)
    for b in LAYERED:
        base_q[(b, f)] = arm.pose.bones[b].rotation_quaternion.copy()

M0 = K.RifleFrame(arm, F0)                     # 枪架（武器 -> 世界），左手不动所以整条不变
R3 = M0.to_3x3()
hand_R0 = K.BoneMatrix(arm, "RightHand", F0).to_quaternion().to_matrix()   # 骨矩阵带 0.01 缩放，只取朝向
wrist0 = K.BoneHead(arm, "RightHand", F0)
palm0 = K.Palm(arm, "Right", F0)
v_local = hand_R0.inverted() @ (palm0 - wrist0)     # 腕 -> 掌心（手骨局部）
Z_LOCAL = Vector((0, 0, 1))                          # 手骨局部 +Z = 掌面朝向（握把时朝向枪），实测：= 枪架 -X
head0 = {b: K.BoneHead(arm, b, F0) for b in ("Head", "Neck", "RightArm", "RightForeArm", "RightHand")}


def W(name):
    return M0 @ Vector(K.RIFLES[RIFLE][name])


knob, knob_up, knob_back = W("knob"), W("knobUp"), W("knobBack")
AXIS_C = Vector((0.0, 0.036, -0.115))               # 枪膛轴在武器坐标 (x,y)
ORBIT = math.degrees(math.atan2(0.058 - 0.036, 0.012) - math.atan2(0.014 - 0.036, 0.030))   # 球头上翻 ~97°


def RollQ(deg):
    """绕枪架 Z 轴（枪膛轴）转 deg，用世界朝向表示。"""
    rz = Matrix.Rotation(math.radians(deg), 3, "Z")
    return R3 @ rz @ R3.inverted()


def HandR(roll_deg):
    return RollQ(roll_deg) @ hand_R0


def PalmTarget(point, roll_deg):
    """掌心目标 = 球头 + 沿手背方向外让 PALM_OUT。"""
    return point - HandR(roll_deg) @ Z_LOCAL * PALM_OUT


def Wrist(palm_target, roll_deg):
    return palm_target - HandR(roll_deg) @ v_local


pbs = arm.pose.bones
mw = arm.matrix_world
def LayerRot(bone, keys):
    """keys = [(frame, delta_quat)]，帧间平滑插值；两端外保持。逐帧写键，盖掉原来的逐帧键。"""
    pb = pbs[bone]
    for f in FR:
        if f <= keys[0][0]:
            d = keys[0][1]
        elif f >= keys[-1][0]:
            d = keys[-1][1]
        else:
            for (fa, da), (fb, db) in zip(keys, keys[1:]):
                if fa <= f <= fb:
                    d = da.slerp(db, Smooth((f - fa) / (fb - fa)))
                    break
        pb.rotation_quaternion = base_q[(bone, f)] @ d
        pb.keyframe_insert("rotation_quaternion", frame=f)



ID = Quaternion((1, 0, 0), 0)
HEAD_LIFT = 7.0
HEAD_SIGN = -1       # 实测：绕局部 X 负向转 = 头顶往后、脸抬起
SH_BACK = 8.0        # 右肩后带（度，绕 RightShoulder 局部 X 正向 = 肩后移，实测 5° ≈ 8 mm）
LayerRot('Head', [(F0, ID), (F_LEAVE, ID), (F_CONTACT, Quaternion((1, 0, 0), math.radians(HEAD_LIFT * HEAD_SIGN))), (F_DOWN, Quaternion((1, 0, 0), math.radians(HEAD_LIFT * HEAD_SIGN))), (F_HOME, ID), (END, ID)])
LayerRot('Neck', [(F0, ID), (F_LEAVE, ID), (F_CONTACT, Quaternion((1, 0, 0), math.radians(0.4 * HEAD_LIFT * HEAD_SIGN))), (F_DOWN, Quaternion((1, 0, 0), math.radians(0.4 * HEAD_LIFT * HEAD_SIGN))), (F_HOME, ID), (END, ID)])
LayerRot('RightShoulder', [(F0, ID), (F_UP, ID), (F_BACK, Quaternion((1, 0, 0), math.radians(SH_BACK))), (F_FWD, Quaternion((1, 0, 0), math.radians(-0.3 * SH_BACK))), (F_DOWN + 2, ID), (END, ID)])
def ArmIkPA(arm, side, keys, window, pole, pole_angle_deg, rotation_keys=None, blend=4):
    """K.ArmIk 的拷贝，只多一个 pole_angle 参数（工具包写死 -90°，这副骨架上肘会翻到身体里面；实测 180° 肘朝极点）。"""
    target = K._Empty(f"IK_{side}")
    for frame, position in keys:
        target.location = position
        target.keyframe_insert("location", frame=frame)
    target.rotation_mode = "QUATERNION"
    for frame, quat in rotation_keys:
        target.rotation_quaternion = quat
        target.keyframe_insert("rotation_quaternion", frame=frame)
    fore = arm.pose.bones[f"{side}ForeArm"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    pole_obj = K._Empty(f"Pole_{side}", pole)
    ik.pole_target, ik.pole_angle = pole_obj, math.radians(pole_angle_deg)
    rot = arm.pose.bones[f"{side}Hand"].constraints.new("COPY_ROTATION")
    rot.target = target
    first, last = window
    for constraint in (ik, rot):
        for frame, value in ((first - blend, 0.0), (first, 1.0), (last, 1.0), (last + blend, 0.0)):
            constraint.influence = value
            constraint.keyframe_insert("influence", frame=frame)
    K._BakeBones(arm, [f"{side}Arm", f"{side}ForeArm", f"{side}Hand"], first - blend, last + blend)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)


roll_up = ROLL_FRAC * ORBIT
pt_closed = PalmTarget(knob, 0.0)
pt_up = PalmTarget(knob_up, roll_up)
pt_back = PalmTarget(knob_back, roll_up)


def Pose(point, roll):
    return (Wrist(PalmTarget(point, roll), roll), HandR(roll).to_quaternion())


def Lerp(a, b, t):
    return a.lerp(b, t)


orig = (wrist0, hand_R0.to_quaternion())
c_pose = Pose(knob, 0.0)
u_pose = Pose(knob_up, roll_up)
b_pose = Pose(knob_back, roll_up)
mid_reach = (Lerp(wrist0, c_pose[0], 0.55) + Vector((0, 0, 0.030)), orig[1].slerp(c_pose[1], 0.55))
away = (Lerp(c_pose[0], wrist0, 0.5) + Vector((0, 0.0, 0.040)), orig[1].slerp(c_pose[1], 0.5))
# 前推回 knobUp 时手还在 roll_up；下压时 roll 回 0
keys_ik = [
    (F_LEAVE, orig),
    (10, mid_reach),
    (F_CONTACT, c_pose),
    (F_UP, u_pose),
    (F_BACK, b_pose),
    (F_FWD, u_pose),
    (F_DOWN, c_pose),
    (50, away),
    (F_HOME, orig),
]
wr_keys = [(f, p[0]) for f, p in keys_ik]
rot_keys = [(f, p[1]) for f, p in keys_ik]
# 到底那一拍停一帧（退壳）
wr_keys.insert(5, (F_BACK + 1, b_pose[0]))
rot_keys.insert(5, (F_BACK + 1, b_pose[1]))
POLE = Vector((-0.25, -0.56, 0.02))      # 肘的落点：右侧、贴地
ArmIkPA(arm, "Right", wr_keys, (F_LEAVE, F_HOME), POLE, 180.0, rotation_keys=rot_keys, blend=4)

# ------------------------------------------------------------------ 2. 手指：随机搜索一个攥球头的姿势
def Tail(b):
    return mw @ pbs[b].tail


def Axis(ax):
    return Vector(ax)


AXES = ((1, 0, 0), (0, 1, 0), (0, 0, 1))


def SetFingerDeltas(base, deltas):
    for b, d in deltas.items():
        pbs[b].rotation_quaternion = base[b] @ d
    bpy.context.view_layer.update()


def DeltaFromVars(v):
    d = {}
    for fn, lim in (("Index", 0), ("Middle", 1)):
        for i in range(3):
            d[f"RightHand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(v[f"{fn}{i}"]))
    for fn in ("Ring", "Pinky"):
        for i in range(3):
            d[f"RightHand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(v[f"{fn}{i}"]))
    for i in range(3):
        q = Quaternion((1, 0, 0), 0)
        for a in range(3):
            q = q @ Quaternion(AXES[a], math.radians(v[f"T{i}{'XYZ'[a]}"]))
        d[f"RightHandThumb{i + 1}"] = q
    return d


K.At(F_CONTACT)
base_c = {b: pbs[b].rotation_quaternion.copy() for b in FINGER_BONES}
knob_c = knob.copy()
palm_c = K.Palm(arm, "Right")


def Loss(v):
    SetFingerDeltas(base_c, DeltaFromVars(v))
    ti, tm, tt = Tail("RightHandIndex3"), Tail("RightHandMiddle3"), Tail("RightHandThumb3")
    k = knob_c
    L = (ti - k).length - 0.015
    L2 = (tt - k).length - 0.015
    L3 = (tm - k).length - 0.020
    sep = max(0.0, 0.022 - (ti - tt).length)
    pen = 0.0
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            pen += 1e-5 * v[f"{fn}{i}"] ** 2 * 0.1
    for i in range(3):
        for a in "XYZ":
            pen += 2e-5 * v[f"T{i}{a}"] ** 2
    # 关节活动范围（度）
    rng = 0.0
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            val = v[f"{fn}{i}"]
            rng += max(0, val - 70) ** 2 + max(0, -15 - val) ** 2
    return 3000 * (L * L + L2 * L2 + L3 * L3 + sep * sep) + pen + 0.003 * rng


random.seed(7)
v = {f"{fn}{i}": 0.0 for fn in ("Index", "Middle", "Ring", "Pinky") for i in range(3)}
v.update({f"T{i}{a}": 0.0 for i in range(3) for a in "XYZ"})
for fn in ("Ring", "Pinky"):
    for i in range(3):
        v[f"{fn}{i}"] = 15.0
best = Loss(v)
step = 12.0
for it in range(3500):
    cand = dict(v)
    for k in random.sample(list(v.keys()), 3):
        cand[k] += random.gauss(0, step)
    for k in ("Ring0", "Ring1", "Ring2", "Pinky0", "Pinky1", "Pinky2"):
        cand[k] = max(-5.0, min(55.0, cand[k]))
    for k in v:
        if k[0] == "T":
            cand[k] = max(-45.0, min(45.0, cand[k]))
    c = Loss(cand)
    if c < best:
        best, v = c, cand
    if it % 700 == 699:
        step *= 0.6
SetFingerDeltas(base_c, DeltaFromVars(v))
print("FINGER LOSS", best, "idx tip", (Tail("RightHandIndex3") - knob_c).length, "thumb tip", (Tail("RightHandThumb3") - knob_c).length,
      "mid tip", (Tail("RightHandMiddle3") - knob_c).length, "idx-thumb", (Tail("RightHandIndex3") - Tail("RightHandThumb3")).length)
print("FINGER VARS", json.dumps({k: round(x, 1) for k, x in v.items()}))
grip_delta = {b: Quaternion((1, 0, 0), 0) for b in FINGER_BONES}
pinch_delta = DeltaFromVars(v)
open_delta = {}
for b in FINGER_BONES:
    if b.startswith("RightHandThumb"):
        open_delta[b] = pinch_delta[b].slerp(Quaternion((1, 0, 0), 0), 0.5)
    else:
        open_delta[b] = Quaternion((1, 0, 0), math.radians(-12))
for b in ("RightHandRing1", "RightHandRing2", "RightHandRing3", "RightHandPinky1", "RightHandPinky2", "RightHandPinky3"):
    open_delta[b] = Quaternion((1, 0, 0), math.radians(-5))

# ------------------------------------------------------------------ 3. 手指时间线 + 头/右肩反应（叠在原动作上，每帧写键）
for b in FINGER_BONES:
    # 手型切换各用 6 帧缓入缓出（握 -> 张 4 帧、张 -> 攥 6 帧、攥 -> 张 6 帧、张 -> 握 7 帧），单帧转角 < 25°
    LayerRot(b, [(F0, grip_delta[b]), (F_LEAVE, grip_delta[b]), (10, open_delta[b]), (F_CONTACT + 1, pinch_delta[b]),
                 (F_DOWN - 1, pinch_delta[b]), (F_DOWN + 5, open_delta[b]), (F_HOME + 3, grip_delta[b]), (END, grip_delta[b])])

# ------------------------------------------------------------------ 4. 收尾：新写的键改线性（和原动作一致），导出，量测
for fc in cb.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
    fc.update()

TIMINGS = {"start": 0.0, "leave": round((F_LEAVE - 1) / 30, 2), "contact": round((F_CONTACT - 1) / 30, 2),
           "up": round((F_UP - 1) / 30, 2), "back": round((F_BACK - 1) / 30, 2), "forward": round((F_FWD - 1) / 30, 2),
           "down": round((F_DOWN - 1) / 30, 2), "release": round((F_DOWN + 1) / 30, 2), "home": round((F_HOME - 1) / 30, 2),
           "end": round((END - 1) / 30, 2)}
K.Export(arm, NAME, {
    "base": BASE, "label": "卧姿拉栓",
    "note": "中正式/毛瑟 98 式转栓：左手托护木、双肘撑地、枪抵肩不动；右手离握把 -> 攥拉柄球头 -> 上翻 90° -> 后拉到底停一拍 -> 前推 -> 下压 -> 回握把。"
            "拉栓本身（攥住到松手）1.0 s，整条 2.0 s，首尾相同可循环。不是汉阳造（整夹装填）的动作；日军三八式拉柄更靠后更大，需要换 --rifle=Type38 再看。",
    "timings": TIMINGS, "loop": True, "durationSec": round((END - 1) / 30, 3)})

pin = K.BoneMatrix(arm, "LeftHand", F0).inverted() @ M0
elbow_z, elbow_pos, fore_min_z, speed, cur_d, lhand, lfoot = [], [], [], [], [], [], []
KNOB_PATH = [(F_CONTACT, "knob"), (F_UP, "knobUp"), (F_BACK, "knobBack"), (F_FWD, "knobUp"), (F_DOWN, "knob")]


def KnobAt(f, m):
    """接触段（15..45 帧）拉柄球头此刻的位置：相邻关键点间用和手一样的平滑插值（武器 -> 世界用当帧枪架 m）。"""
    for (fa, na), (fb, nb) in zip(KNOB_PATH, KNOB_PATH[1:]):
        if fa <= f <= fb:
            a, b = Vector(K.RIFLES[RIFLE][na]), Vector(K.RIFLES[RIFLE][nb])
            return m @ a.lerp(b, Smooth((f - fa) / (fb - fa)))
    return None


prev = None
for f in FR:
    K.At(f)
    m = K.BoneMatrix(arm, "LeftHand") @ pin
    P = K.Palm(arm, "Right")
    e = K.BoneHead(arm, "RightForeArm")
    w = K.BoneHead(arm, "RightHand")
    elbow_z.append(round(e.z, 4)); elbow_pos.append([round(x, 4) for x in e])
    fore_min_z.append(round(min((e.lerp(w, t)).z for t in (0, 0.25, 0.5, 0.75, 1)), 4))
    speed.append(round((P - prev).length, 4) if prev is not None else 0.0)
    prev = P
    kp_now = KnobAt(f, m)
    cur_d.append(round((P - kp_now).length, 4) if kp_now is not None else None)
K.Report(arm, NAME, rifle=RIFLE, rifle_frame=F0, extra={
    "timings": TIMINGS, "phaseFrames": {"contact": F_CONTACT, "up": F_UP, "back": F_BACK, "forward": F_FWD, "down": F_DOWN},
    "rightElbowZ": elbow_z, "rightElbow": elbow_pos, "rightForearmMinZ": fore_min_z, "rightPalmStepPerFrame": speed,
    "rightPalmToCurrentKnob": cur_d, "palmOutOfKnobM": PALM_OUT,
})
print("MAX palm step/frame (m)", max(speed), "min elbow z", min(elbow_z), "min forearm z", min(fore_min_z))
print("DONE")

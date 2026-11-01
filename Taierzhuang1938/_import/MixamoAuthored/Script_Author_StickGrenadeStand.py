# StickGrenadeStand「国军木柄弹·站着扔」 (Claude, 2026-11-01)
#
# 这是什么：国军步兵站着，先点火再扔一枚木柄手榴弹（巩式 / 二四式，没有保险销）。
#   右手握木柄靠弹头一端、弹头朝上，举在胸腹前；左手到木柄尾端，拇指食指捏住尾盖，手腕来回拧两三下把盖拧开，
#   手一松把盖甩掉；再把左手放回尾端下面，小指勾住拉火绳，往左下后方猛地一拽（左肘往后带，身体略反向）；
#   拉完不停顿，接着就是原动作的引臂、甩出、收势。
# 改自：Animation_Mixamo_Throw_V1（站着甩臂投掷，67 帧，开头约 7 帧静止，第 8 帧起手往后引，第 28 帧附近出手）。
#   没换 Throwing_V1：那条 168 帧，出手前后各有很长的静止，右手出手速度只有 6 m/s，也没有肩的甩动；Throw_V1 的右手出手峰值 11 m/s，
#   正是预览工具认「挥得最快的手」所需要的，而且整条只有 2.2 s，前面加 1.4 s 点火后总长 3.3 s 正好在要求里。
#   做法：先把原动作整体往后平移 33 帧（腿、骨盆、没动的骨头在点火段停在原动作第 1 帧，所以脚不漂），
#   再在前面 41 帧里重写躯干、头、双臂、双手五指；原动作第 8 帧（手刚开始往后引）接在新第 41 帧。
#
# 关键帧时间表（30 fps；第 1 帧 = 0 s；t = (帧 - 1) / 30）：
#   帧   1  0.000  空手站立，手榴弹在右手（右手垂在身侧）
#   帧 2-10 0.03-0.30  右手把弹举到胸腹前、弹头朝上、五指握柄；左手抬起去找木柄尾端；头略低看着手
#   帧  11  0.333  左拇指食指捏住尾盖（左掌心在右掌心下方约 12.5 cm）
#   帧 11-25 0.333-0.800  拧盖：手腕来回拧三下（每下 ±28° 左右，回程手指略松再捏），第三下拧到头，盖松脱
#   帧 25-29 0.800-0.933  盖脱手：左手往外一松、手指张开，盖扔掉
#   帧 29-33 0.933-1.067  左手回到尾端下方，小指勾住拉火绳
#   帧 33-35 1.067-1.133  勾稳、绳绷直（右手略被带一下）
#   帧 35-41 1.133-1.333  猛拽：左手往左下后方 ~0.35 m，6 帧；左肘后带，躯干转肩、略向右倾
#   帧 38-46 1.233-1.500  右手已经开始引臂（IK 渐出，接回原动作）；左手也渐出，回到原动作左手的平衡动作
#   帧 41  1.333  对应原动作第 8 帧（引臂起点）；帧 61 = 原动作第 28 帧 = 出手（2.0 s）；帧 100 = 收势（3.3 s）
#   整条 100 帧 = 3.3 s，单次（loop: false）。点火段 1.33 s。
#
# 史实：国军木柄手榴弹（巩式 / 二四式）：没有保险销。拧开木柄尾端的盖，拽出拉火绳（绳头套在小指上一拽），
#   随即甩出；拉火后几秒就炸，不会拿在手里等。所以拉完绳马上引臂，没有停顿。
#
# 预览里手榴弹挂在「挥得最快的手」（右手出手 11 m/s）掌心；右手整条都握着弹，左手最快 < 3 m/s。
import sys, os, math, json, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Quaternion, Vector, Matrix

bpy = K.bpy
NAME = "StickGrenadeStand"
BASE = "Animation_Mixamo_Throw_V1"
BASE_END = 67
SHIFT = 33                       # 新帧 = 原帧 + SHIFT
END = BASE_END + SHIFT           # 100

# ----------------------------------------------------------------------------- 时间表（新帧号）
F_REACH = 14                     # 左手捏住尾盖
F_CAP_OFF = 25                   # 盖拧到头
F_TOSS = 29                      # 盖扔出去，手张到最开
F_HOOK = 32                      # 左手回到尾端下方，小指勾住绳
F_PULL0, F_PULL1 = 35, 41        # 猛拽
T0 = 2        # 手的目标路径从这一帧才开始动；IK 在它之前用 T0-1 帧渐入，肘位置差异摊在这几帧
F_R_END = 40                     # 右手 IK 最后一帧（之后 8 帧渐出，接原动作引臂）
F_L_END = 41                     # 左手 IK 最后一帧
BLEND_OUT = 8
_THA = float(os.environ.get('TZ_THA', '22'))
THETA = [(14, -_THA), (18, _THA), (21, -_THA), (25, _THA * 1.3)]   # 拧盖手腕转角（度）

# 木柄几何（预览里 Model_Grenade：以右掌心为原点，弹头在拇指一侧 0.145 m，尾端在另一侧 0.075 m）
CAP_BELOW = 0.075                # 尾端离右掌心
LEFT_PALM_BELOW = 0.135          # 拧盖时左掌心离右掌心（沿木柄往下）
LEFT_PALM_OUT = 0.024            # 左掌心偏外（+X）
BRIEF_BELOW = 0.13               # 任务单的检验点：右掌心沿木柄往下 13 cm

arm = K.LoadBase(BASE, frame_end=END)
scene = bpy.context.scene
pbs = arm.pose.bones
mw = arm.matrix_world
act = arm.animation_data.action
cb = act.layers[0].strips[0].channelbag(arm.animation_data.action_slot)
FR = list(range(1, END + 1))
SIDES = ("Right", "Left")


def Smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def Seg(f, a, b):
    return Smooth((f - a) / float(b - a))


def Env(keys, f):
    """[(frame, value)] 分段平滑插值，两端保持。"""
    if f <= keys[0][0]:
        return keys[0][1]
    for (fa, va), (fb, vb) in zip(keys, keys[1:]):
        if f <= fb:
            return va + (vb - va) * Smooth((f - fa) / float(fb - fa))
    return keys[-1][1]


# ------------------------------------------------------------------ 0. 原动作整体后移 SHIFT 帧（前面停在原第 1 帧），逐帧写线性键
for fc in cb.fcurves:
    vals = [fc.evaluate(b) for b in range(1, BASE_END + 1)]
    for i in range(len(fc.keyframe_points) - 1, -1, -1):
        fc.keyframe_points.remove(fc.keyframe_points[i])
    fc.keyframe_points.add(END)
    for n in range(1, END + 1):
        b = min(BASE_END, max(1, n - SHIFT))
        kp = fc.keyframe_points[n - 1]
        kp.co = (n, vals[b - 1])
        kp.interpolation = "LINEAR"
    fc.update()

# ------------------------------------------------------------------ 1. 记下后移后的相关骨头姿态
FINGER_BONES = {s: [f"{s}Hand{fn}{i}" for fn in K.FINGERS for i in (1, 2, 3)] for s in SIDES}
LAYERED = ["Spine1", "Spine2", "Neck", "Head"] + FINGER_BONES["Right"] + FINGER_BONES["Left"]
base_q = {}
for f in FR:
    K.At(f)
    for b in LAYERED:
        base_q[(b, f)] = pbs[b].rotation_quaternion.copy()


def ApplyLayer(bone, fn):
    """每帧：骨头 = 原动作（后移后）@ fn(frame)；逐帧写键。"""
    pb = pbs[bone]
    for f in FR:
        pb.rotation_quaternion = base_q[(bone, f)] @ fn(f)
        pb.keyframe_insert("rotation_quaternion", frame=f)


def QX(deg):
    return Quaternion((1, 0, 0), math.radians(deg))


def QY(deg):
    return Quaternion((0, 1, 0), math.radians(deg))


def QZ(deg):
    return Quaternion((0, 0, 1), math.radians(deg))


ID = Quaternion((1, 0, 0), 0)

# ------------------------------------------------------------------ 2. 躯干和头（要在 IK 之前改：手的目标是世界坐标，躯干动了手才不跟着漂）
#   实测（见探针）：脊柱 +X = 前倾（低头弯腰），+Y = 扭转（左肩向后），+Z = 向右侧倾；头 +X = 低头
PITCH = [(1, 0.0), (10, 1.0), (34, 1.0), (41, 0.5), (50, 0.0)]            # 低头看手（比例）
TWIST = [(1, 0.0), (33, 0.0), (F_PULL1, 1.0), (47, 0.0)]                  # 拽绳时转肩（左肩向后）
LEAN = [(1, 0.0), (33, 0.0), (F_PULL1, 1.0), (47, 0.0)]                   # 略向右倾（与拽的方向相反）
HEADP = [(1, 0.0), (3, 0.0), (10, 1.0), (34, 1.0), (F_PULL1, 0.7), (48, 0.0)]


def SpineDelta(share):
    def fn(f):
        return QY(9.0 * share * Env(TWIST, f)) @ QX(5.0 * share * Env(PITCH, f)) @ QZ(3.5 * share * Env(LEAN, f))
    return fn


ApplyLayer("Spine1", SpineDelta(0.5))
ApplyLayer("Spine2", SpineDelta(0.5))
ApplyLayer("Neck", lambda f: QX(5.0 * Env(HEADP, f)))
ApplyLayer("Head", lambda f: QX(9.0 * Env(HEADP, f)))

# ------------------------------------------------------------------ 3. 手的朝向、掌心 <-> 手腕换算（都在原动作第 1 帧量）
def HandRot3(side, frame=None):
    return K.BoneMatrix(arm, side + "Hand", frame).to_quaternion().to_matrix()


LOC = {}
for side in SIDES:
    R = HandRot3(side, 1)
    w = K.BoneHead(arm, side + "Hand", 1)
    m = K.BoneHead(arm, side + "HandMiddle1")
    t = K.BoneHead(arm, side + "HandThumb1")
    fing = (m - w).normalized()
    th = t - w
    th = (th - fing * th.dot(fing)).normalized()
    LOC[side] = {"fl": R.inverted() @ fing, "tl": R.inverted() @ th, "v": R.inverted() @ (K.Palm(arm, side) - w),
                 "R1": R.copy(), "palm1": K.Palm(arm, side).copy()}


def Basis(a, b):
    e1 = a.normalized()
    e2 = (b - e1 * b.dot(e1)).normalized()
    return Matrix((e1, e2, e1.cross(e2))).transposed()


def HandRot(side, F, T, primary="T"):
    """世界朝向（3x3）：手指方向 = F、拇指一侧 = T（primary 指定哪个精确，另一个被正交化）。"""
    fl, tl = LOC[side]["fl"], LOC[side]["tl"]
    if primary == "T":
        return Basis(T, F) @ Basis(tl, fl).inverted()
    return Basis(F, T) @ Basis(fl, tl).inverted()


def WristFor3(side, palm, Rm):
    return palm - Rm @ LOC[side]["v"]


# 自检：用第 1 帧的方向重建应得到原朝向
chk = HandRot("Right", (LOC["Right"]["R1"] @ LOC["Right"]["fl"]), (LOC["Right"]["R1"] @ LOC["Right"]["tl"]))
print("HandRot self-check err", max(abs(chk[i][j] - LOC["Right"]["R1"][i][j]) for i in range(3) for j in range(3)))

# ------------------------------------------------------------------ 4. 目标轨迹
UP = Vector((0, 0, 1))
P_R1, P_L1 = LOC["Right"]["palm1"], LOC["Left"]["palm1"]
Q_R1, Q_L1 = LOC["Right"]["R1"].to_quaternion(), LOC["Left"]["R1"].to_quaternion()

T_R = Vector((0.10, -0.15, 0.98)).normalized()            # 弹头朝上，略向前向内
F_R = Vector((0.30, -0.85, 0.25))                         # 右前臂方向：向前、略向内
P_R_HOLD = Vector((-0.07, -0.30, float(os.environ.get('TZ_PRZ', '1.30'))))                    # 右掌心：胸腹前
R_R_HOLD = HandRot("Right", F_R, T_R, "T")
Q_R_HOLD = R_R_HOLD.to_quaternion()
T_R_ACT = R_R_HOLD @ LOC["Right"]["tl"]                    # 实际拇指一侧（= 弹头方向）
CAP = P_R_HOLD - T_R_ACT * CAP_BELOW                       # 尾盖位置
OUT = Vector((1, 0, 0))
S_L = Vector((0.15, 0.02, 1.41))                           # 左肩关节（原动作第 1 帧量）
FNAMES = ("Index", "Middle", "Ring", "Pinky")

F_L = Vector(tuple(float(x) for x in os.environ.get('TZ_FL', '-0.48,-0.42,0.77').split(',')))                       # 左手指方向：朝内朝上，指向尾盖
T_L = Vector((0.0, -1.0, 0.0))                            # 左拇指朝前，掌心朝外上（托在尾盖下面兜住）
R_L_PINCH = HandRot("Left", F_L, T_L, "F")
# 捏点在手本地坐标里固定：沿手指 5.0 cm、掌心一侧 1.2 cm、拇指一侧 1.2 cm；掌心位置由「捏点 = 尾盖」反推
_NL = LOC["Left"]["fl"].cross(LOC["Left"]["tl"])
QREF_LOCAL = 0.050 * LOC["Left"]["fl"] + 0.012 * _NL + 0.012 * LOC["Left"]["tl"]
P_L_PINCH = CAP - R_L_PINCH @ QREF_LOCAL


def OrbitRot(deg):
    return Matrix.Rotation(math.radians(deg), 3, T_R_ACT)


def Theta(f):
    if f <= THETA[0][0]:
        return THETA[0][1]
    if f >= THETA[-1][0]:
        return THETA[-1][1]
    for (fa, va), (fb, vb) in zip(THETA, THETA[1:]):
        if fa <= f <= fb:
            return va + (vb - va) * Smooth((f - fa) / (fb - fa))


def LeftPinchPose(deg):
    o = OrbitRot(deg)
    return CAP + o @ (P_L_PINCH - CAP), o @ R_L_PINCH


P_TOSS = P_L_PINCH + Vector((0.075, 0.0, -0.03))
MAXD = (55, 80, 60)
HALF_FRAC = {"Index": 0.55, "Middle": 0.6, "Ring": 0.8, "Pinky": 0.8}      # 勾绳：小指无名指弯 >= 80%，其余半握
FIST_FRAC = {"Index": 1.0, "Middle": 1.05, "Ring": 1.1, "Pinky": 1.15}      # 拽绳：全部手指 >= 100%（攥紧）


def FingerDelta(frac):
    return {("F", fn, i + 1): QX(MAXD[i] * frac[fn]) for fn in FNAMES for i in range(3)}


# 勾绳时小指尖要落在尾端：在原动作第 1 帧、手本地坐标里量半握姿势下小指尖的位置，再反推掌心
K.At(1)
_save = {b: pbs[b].rotation_quaternion.copy() for b in FINGER_BONES["Left"]}
for (_, fn, i), q in FingerDelta(HALF_FRAC).items():
    pbs[f"Left" + f"Hand{fn}{i}"].rotation_quaternion = _save[f"LeftHand{fn}{i}"] @ q
bpy.context.view_layer.update()
_Rh = HandRot3("Left")
_pk = _Rh.inverted() @ ((mw @ pbs["LeftHandPinky3"].tail) - K.Palm(arm, "Left"))
_rk = _Rh.inverted() @ ((mw @ pbs["LeftHandRing3"].tail) - K.Palm(arm, "Left"))
print("local pinky tip", _pk, "ring tip", _rk)
for b, q in _save.items():
    pbs[b].rotation_quaternion = q
bpy.context.view_layer.update()
_P = CAP.copy()
for _ in range(4):
    _F = ((_P - S_L).normalized() + Vector((0.0, 0.0, 0.25))).normalized()
    _P = CAP - HandRot("Left", _F, T_L, "F") @ _pk
P_HOOK = _P
print("P_HOOK", P_HOOK, "CAP", CAP)
P_PULL_END = Vector((0.19, -0.07, 0.95))


def RightTrack(f):
    """(掌心位置, 3x3 朝向)。"""
    if f <= 12:
        s = Seg(f, T0, 12)
        p = P_R1.lerp(P_R_HOLD, s)
        p.z += 0.03 * math.sin(math.pi * s)                # 先略抬再落到位
        q = Q_R1.slerp(Q_R_HOLD, s)
        return p, q.to_matrix()
    p = P_R_HOLD.copy()
    # 拧盖时手上的反作用：随每一下往里带一点点
    th = Theta(f) if F_REACH <= f <= F_CAP_OFF else 0.0
    p += Vector((0.0, 0.0, 0.0)) + (-OUT) * 0.0045 * (th / 40.0)
    # 拽绳那一下：被绳带一下（左下）
    if F_PULL0 + 1 <= f <= F_R_END:
        k = math.sin(math.pi * Seg(f, F_PULL0 + 1, F_R_END))
        p += Vector((0.012, 0.004, -0.014)) * k
    return p, R_R_HOLD


def LeftTrack(f):
    if f < F_REACH:
        s = Seg(f, T0, F_REACH)
        p0, R0 = LeftPinchPose(Theta(F_REACH))
        p = P_L1.lerp(p0, s)
        p.z += 0.04 * math.sin(math.pi * s)
        q = Q_L1.slerp(R0.to_quaternion(), s)
        return p, q.to_matrix()
    if f <= F_CAP_OFF:
        return LeftPinchPose(Theta(f))
    p_end, R_end = LeftPinchPose(Theta(F_CAP_OFF))
    if f <= F_TOSS:
        p = p_end.lerp(P_TOSS, Seg(f, F_CAP_OFF, F_TOSS))
    elif f <= F_HOOK:
        p = P_TOSS.lerp(P_HOOK, Seg(f, F_TOSS, F_HOOK))
    elif f <= F_PULL0:
        p = P_HOOK.copy()
    else:
        u = (f - F_PULL0) / float(F_PULL1 - F_PULL0)
        p = P_HOOK.lerp(P_PULL_END, u * u * (3 - 2 * u))
    # 手的朝向：从拧盖的朝向慢慢转到「手指顺着肩->手腕的连线（略上翘）」，勾绳和拽绳时腕子不折
    farm = (p - S_L).normalized() + Vector((0.0, 0.0, 0.25))
    target = HandRot("Left", farm.normalized(), T_L, "F")
    s_o = Seg(f, F_CAP_OFF, F_HOOK)
    return p, Quaternion.slerp(R_end.to_quaternion(), target.to_quaternion(), s_o).to_matrix()


def Tracks(track, last, side):
    keys, rkeys = [], []
    prev = None
    for f in range(1, last + 1):
        p, Rm = track(f)
        keys.append((f, WristFor3(side, p, Rm)))
        q = Rm.to_quaternion()
        if prev is not None and q.dot(prev) < 0:
            q.negate()
        prev = q
        rkeys.append((f, q))
    return keys, rkeys


# ------------------------------------------------------------------ 5. IK（每帧一个键，手腕位置 + 手朝向），烘回动作
def ArmIkDense(side, keys, rkeys, on_first, on_last, pole, pole_angle, ramp_in=2, ramp_out=BLEND_OUT):
    target = K._Empty(f"IK_{side}")
    target.rotation_mode = "QUATERNION"
    for f, pos in keys:
        target.location = pos
        target.keyframe_insert("location", frame=f)
    for f, q in rkeys:
        target.rotation_quaternion = q
        target.keyframe_insert("rotation_quaternion", frame=f)
    fore = pbs[f"{side}ForeArm"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    pole_obj = K._Empty(f"Pole_{side}", pole)
    ik.pole_target, ik.pole_angle = pole_obj, math.radians(pole_angle)
    rot = pbs[f"{side}Hand"].constraints.new("COPY_ROTATION")
    rot.target = target
    for c in (ik, rot):
        for f, v in ((on_first - ramp_in, 0.0), (on_first, 1.0), (on_last, 1.0), (on_last + ramp_out, 0.0)):
            c.influence = v
            c.keyframe_insert("influence", frame=f)
    K._BakeBones(arm, [f"{side}Arm", f"{side}ForeArm", f"{side}Hand"], max(1, on_first - ramp_in), on_last + ramp_out)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)


POLE_R = Vector((-0.50, 0.25, 0.85))
POLE_L = Vector(tuple(float(x) for x in os.environ.get("TZ_POLE_LP", "0.9,0.2,1.0").split(",")))
POLE_ANGLE_R = 180.0
POLE_ANGLE_L = float(os.environ.get("TZ_POLE_L", "0"))

kR, rR = Tracks(RightTrack, F_R_END, "Right")
ArmIkDense("Right", kR, rR, 11, F_R_END, POLE_R, POLE_ANGLE_R, ramp_in=10, ramp_out=9)
kL, rL = Tracks(LeftTrack, F_L_END, "Left")
_LR = int(os.environ.get("TZ_LR", "3"))
ArmIkDense("Left", kL, rL, _LR + 1, F_L_END, POLE_L, POLE_ANGLE_L, ramp_in=_LR)
K.At(F_REACH + 1)
print("elbows @ pinch: R", K.BoneHead(arm, "RightForeArm"), "L", K.BoneHead(arm, "LeftForeArm"))
K.At(F_PULL1)
print("elbows @ pull end: R", K.BoneHead(arm, "RightForeArm"), "L", K.BoneHead(arm, "LeftForeArm"))

# ------------------------------------------------------------------ 6. 手指：用小优化器解出「握木柄」「捏尾盖」，再按时间线写
AXES = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
FNAMES = ("Index", "Middle", "Ring", "Pinky")


def DeltaFromVars(v):
    d = {}
    for fn in FNAMES:
        for i in range(3):
            d[("F", fn, i + 1)] = QX(v[f"{fn}{i}"])
    for i in range(3):
        q = Quaternion((1, 0, 0), 0)
        for a in range(3):
            q = q @ Quaternion(AXES[a], math.radians(v[f"T{i}{'XYZ'[a]}"]))
        d[("F", "Thumb", i + 1)] = q
    return d


def SetFingers(side, base, v):
    d = DeltaFromVars(v)
    for (_, fn, i), q in d.items():
        b = f"{side}Hand{fn}{i}"
        pbs[b].rotation_quaternion = base[b] @ q
    bpy.context.view_layer.update()


def Tail(b):
    return mw @ pbs[b].tail


def Dist2Axis(p, o, ax):
    d = p - o
    return (d - ax * d.dot(ax)).length


def Solve(side, frame, lossfn, init, iters, seed, rng_curl=(-10, 100), restarts=4):
    K.At(frame)
    base = {b: pbs[b].rotation_quaternion.copy() for b in FINGER_BONES[side]}

    def full(vv):
        SetFingers(side, base, vv)
        return lossfn(vv)

    gbest, gv = None, None
    for r in range(restarts):
        random.seed(seed + 101 * r)
        v = {f"{fn}{i}": 0.0 for fn in FNAMES for i in range(3)}
        v.update({f"T{i}{a}": 0.0 for i in range(3) for a in "XYZ"})
        v.update(init)
        if r:
            for k in v:
                v[k] += random.gauss(0, 15)
                v[k] = max(-50.0, min(50.0, v[k])) if k[0] == "T" else max(rng_curl[0], min(rng_curl[1], v[k]))
        best = full(v)
        step = 14.0
        for it in range(iters):
            cand = dict(v)
            for k in random.sample(list(v.keys()), 3):
                cand[k] += random.gauss(0, step)
            for k in cand:
                if k[0] == "T":
                    cand[k] = max(-50.0, min(50.0, cand[k]))
                else:
                    cand[k] = max(rng_curl[0], min(rng_curl[1], cand[k]))
            c = full(cand)
            if c < best:
                best, v = c, cand
            if it % (iters // 5) == (iters // 5) - 1:
                step *= 0.6
        if gbest is None or best < gbest:
            gbest, gv = best, dict(v)
    SetFingers(side, base, gv)
    print(f"SOLVE {side} f{frame} loss {gbest:.5f}", json.dumps({k: round(x, 1) for k, x in gv.items()}))
    return gv, base


def Reg(v, wc=1e-5, wt=2e-5):
    pen = 0.0
    for k, x in v.items():
        pen += (wt if k[0] == "T" else wc) * x * x
    return pen


# 4a. 右手握木柄：四指尖落在以木柄为轴、半径 ~1.8 cm 的圆周上，在掌心一侧；拇指压在食指上
F_GRIP_EVAL = 16
K.At(F_GRIP_EVAL)
O_R = K.Palm(arm, "Right")
_w, _m, _t = K.BoneHead(arm, "RightHand"), K.BoneHead(arm, "RightHandMiddle1"), K.BoneHead(arm, "RightHandThumb1")
_f = (_m - _w).normalized()
AX_R = (_t - _w - _f * (_t - _w).dot(_f)).normalized()
N_R = AX_R.cross(_f)                                       # 右手掌心朝向（拇指朝上、指朝前时朝内）
print("right axis", AX_R, "palm normal", N_R, "O", O_R)


def LossGrip(v):
    L = 0.0
    tips = {}
    for fn in FNAMES:
        tip = Tail(f"RightHand{fn}3")
        mid = Tail(f"RightHand{fn}2")
        tips[fn] = tip
        d = Dist2Axis(tip, O_R, AX_R)
        L += (d - 0.018) ** 2 * 3000
        dm = Dist2Axis(mid, O_R, AX_R)
        L += max(0.0, 0.015 - dm) ** 2 * 3000
        side_ok = (tip - O_R).dot(N_R)
        L += max(0.0, 0.012 - side_ok) ** 2 * 3000
    tt = Tail("RightHandThumb3")
    L += (Dist2Axis(tt, O_R, AX_R) - 0.020) ** 2 * 3000
    L += max(0.0, (tt - tips["Index"]).length - 0.030) ** 2 * 3000
    L += max(0.0, 0.010 - (tt - tips["Index"]).length) ** 2 * 3000
    return L + Reg(v)


vGripR, baseGripR = Solve("Right", F_GRIP_EVAL, LossGrip, {f"{fn}{i}": 40.0 for fn in FNAMES for i in range(3)}, 3500, 11)
GRIP_R = DeltaFromVars(vGripR)

# 4b. 左手捏尾盖：拇指、食指指尖落在尾盖两侧，中指轻搭，无名指小指自然卷
K.At(F_REACH)
O_R2 = K.Palm(arm, "Right")
_w, _m, _t = K.BoneHead(arm, "RightHand"), K.BoneHead(arm, "RightHandMiddle1"), K.BoneHead(arm, "RightHandThumb1")
_f = (_m - _w).normalized()
AX_R2 = (_t - _w - _f * (_t - _w).dot(_f)).normalized()
CAP_NOW = O_R2 - AX_R2 * CAP_BELOW
_pl = K.Palm(arm, "Left"); _wl = K.BoneHead(arm, "LeftHand"); _ml = K.BoneHead(arm, "LeftHandMiddle1"); _tl = K.BoneHead(arm, "LeftHandThumb1")
_fl = (_ml - _wl).normalized(); _thl = (_tl - _wl - _fl * (_tl - _wl).dot(_fl)).normalized()
print("DBG L fingerdir", _fl, "thumbside", _thl, "palmN", _fl.cross(_thl), "palm->cap", (CAP_NOW - _pl), "idx root", K.BoneHead(arm, "LeftHandIndex1") - _pl, "idx tip(rest)", Tail("LeftHandIndex3") - _pl)
print("cap now", CAP_NOW, "left palm", K.Palm(arm, "Left"), "left palm to cap", (K.Palm(arm, "Left") - CAP_NOW).length)


def LossPinch(v):
    ti, tt, tm = Tail("LeftHandIndex3"), Tail("LeftHandThumb3"), Tail("LeftHandMiddle3")
    L = ((ti - CAP_NOW).length - 0.011) ** 2 + ((tt - CAP_NOW).length - 0.011) ** 2 + ((tm - CAP_NOW).length - 0.022) ** 2
    L += max(0.0, 0.014 - (ti - tt).length) ** 2
    pen = 0.0
    for fn in ("Ring", "Pinky"):
        for i in range(3):
            pen += 3e-5 * (v[f"{fn}{i}"] - 40.0) ** 2
    return 3000 * L + pen + Reg(v) * 0.5


vPinchL, basePinchL = Solve("Left", F_REACH, LossPinch, {f"{fn}{i}": 30.0 for fn in FNAMES for i in range(3)}, 3000, 13)
PINCH_L = DeltaFromVars(vPinchL)
PINCH_TIPS = {"index": (Tail("LeftHandIndex3") - CAP_NOW).length, "thumb": (Tail("LeftHandThumb3") - CAP_NOW).length}
print("pinch tip->cap", PINCH_TIPS)


def Scaled(delta, amount):
    return {k: ID.slerp(q, amount) for k, q in delta.items()}


def Uniform(curl):
    """所有四指弯 curl 度（三节按 55/80/60 比例），拇指不动。"""
    d = {}
    for fn in FNAMES:
        for i in range(3):
            d[("F", fn, i + 1)] = QX(curl * (55, 80, 60)[i] / 60.0)
    for i in range(3):
        d[("F", "Thumb", i + 1)] = ID.copy()
    return d


def Merge(*ds):
    out = {}
    for d in ds:
        out.update(d)
    return out


ZERO = Uniform(0.0)
OPEN_R = Merge(Uniform(-8.0), {("F", "Thumb", i): ID.slerp(GRIP_R[("F", "Thumb", i)], 0.25) for i in (1, 2, 3)})
OPEN_L = Scaled(PINCH_L, 0.45)                 # 伸手去捏时手指半松，不张到最开，这样捏上去每帧转角小
LOOSE_L = Scaled(PINCH_L, 0.8)                 # 拧盖回程：略松一下再捏
FLICK_L = Scaled(PINCH_L, 0.6)                # 甩盖
HOOK_HALF = Merge(FingerDelta(HALF_FRAC), {("F", "Thumb", i): ID.slerp(PINCH_L[("F", "Thumb", i)], 0.5) for i in (1, 2, 3)})
FIST_L = Merge(FingerDelta(FIST_FRAC), {("F", "Thumb", i): ID.slerp(PINCH_L[("F", "Thumb", i)], 0.5) for i in (1, 2, 3)})


def PoseAt(keys, f):
    """keys = [(frame, pose_dict)]，帧间平滑插值（四元数 slerp），两端保持。"""
    if f <= keys[0][0]:
        return keys[0][1]
    if f >= keys[-1][0]:
        return keys[-1][1]
    for (fa, pa), (fb, pb_) in zip(keys, keys[1:]):
        if fa <= f <= fb:
            s = Smooth((f - fa) / float(fb - fa))
            return {k: pa[k].slerp(pb_[k], s) for k in pa}


def ApplyFingers(side, keys):
    for f in FR:
        pose = PoseAt(keys, f)
        for (_, fn, i), q in pose.items():
            b = f"{side}Hand{fn}{i}"
            pbs[b].rotation_quaternion = base_q[(b, f)] @ q
            pbs[b].keyframe_insert("rotation_quaternion", frame=f)


# 手型之间的切换都至少 4-6 帧、带缓入缓出（平滑插值），每帧手指转角 <= 25 度
RIGHT_FINGER_KEYS = [(1, ZERO), (3, ZERO), (6, OPEN_R), (15, GRIP_R), (47, GRIP_R), (55, ZERO), (END, ZERO)]
LEFT_FINGER_KEYS = [(1, ZERO), (4, ZERO), (10, OPEN_L), (F_REACH + 2, PINCH_L), (17, PINCH_L), (18.5, LOOSE_L), (20, PINCH_L),
                    (F_CAP_OFF, PINCH_L), (F_TOSS, FLICK_L), (F_HOOK, HOOK_HALF), (F_PULL0, FIST_L), (F_L_END + 1, FIST_L), (F_L_END + 7, ZERO), (END, ZERO)]
ApplyFingers("Right", RIGHT_FINGER_KEYS)
ApplyFingers("Left", LEFT_FINGER_KEYS)

# ------------------------------------------------------------------ 7. 收尾：所有键改线性，导出，量测
for fc in cb.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
    fc.update()

def Ang(q1, q2):
    return math.degrees(2 * math.acos(min(1.0, abs(q1.dot(q2)))))


_prev, _turns, _bend = {}, [], []
for f in FR:
    K.At(f)
    for b in pbs.keys():
        q = pbs[b].rotation_quaternion.copy()
        if b in _prev:
            _turns.append((round(Ang(q, _prev[b]), 1), b, f))
        _prev[b] = q
    for side in SIDES:
        fo = (K.BoneHead(arm, side + "Hand") - K.BoneHead(arm, side + "ForeArm")).normalized()
        ha = (K.BoneHead(arm, side + "HandMiddle1") - K.BoneHead(arm, side + "Hand")).normalized()
        _bend.append((round(math.degrees(math.acos(max(-1.0, min(1.0, fo.dot(ha))))), 1), side, f))
_turns.sort(reverse=True)
print("TOP TURNS (deg/frame, bone, frame)", _turns[:14])
_bend.sort(reverse=True)
print("TOP WRIST BEND", [b for b in _bend if b[1] == "Left"][:5], [b for b in _bend if b[1] == "Right"][:3])

TIMINGS = {"start": 0.0, "gripRaise": round((10 - 1) / 30, 3), "capPinch": round((F_REACH - 1) / 30, 3), "capOff": round((F_CAP_OFF - 1) / 30, 3),
           "capToss": round((F_TOSS - 1) / 30, 3), "cordHook": round((F_HOOK - 1) / 30, 3), "pullStart": round((F_PULL0 - 1) / 30, 3),
           "pullEnd": round((F_PULL1 - 1) / 30, 3), "windupStart": round((F_L_END - 1) / 30, 3), "release": round((28 + SHIFT - 1) / 30, 3),
           "end": round((END - 1) / 30, 3)}
K.Export(arm, NAME, {
    "base": BASE, "label": "国军木柄弹·站着扔",
    "note": "国军木柄弹（巩式/二四式，无保险销）：右手握柄弹头朝上；左手捏尾盖拧两三下拧开、盖扔掉；左小指勾拉火绳往左下后方猛拽；"
            "不停顿接原动作的引臂和甩出。点火段 1.33 s，整条 3.3 s。拉火后几秒就炸，所以拽完马上扔，别在中间加等待。",
    "timings": TIMINGS, "loop": False, "durationSec": round((END - 1) / 30, 3)})

# 量测
prevR = prevL = None
speedR, speedL, dBrief, dCapTip, dPalmCap, axisUp, elbowL, elbowR = [], [], [], [], [], [], [], []
for f in FR:
    K.At(f)
    PR, PL = K.Palm(arm, "Right"), K.Palm(arm, "Left")
    w = K.BoneHead(arm, "RightHand")
    m = K.BoneHead(arm, "RightHandMiddle1")
    t = K.BoneHead(arm, "RightHandThumb1")
    fing = (m - w).normalized()
    ax = (t - w - fing * (t - w).dot(fing)).normalized()      # 弹头方向（预览里弹头朝拇指一侧）
    speedR.append(round((PR - prevR).length * 30, 3) if prevR is not None else 0.0)
    speedL.append(round((PL - prevL).length * 30, 3) if prevL is not None else 0.0)
    prevR, prevL = PR.copy(), PL.copy()
    pt13 = PR - ax * BRIEF_BELOW
    dBrief.append(round((PL - pt13).length, 4))
    cap = PR - ax * CAP_BELOW
    dCapTip.append(round(min((Tail("LeftHandIndex3") - cap).length, (Tail("LeftHandThumb3") - cap).length), 4))
    dPalmCap.append(round((PL - cap).length, 4))
    axisUp.append(round(ax.z, 3))
    elbowL.append([round(x, 3) for x in K.BoneHead(arm, "LeftForeArm")])
    elbowR.append([round(x, 3) for x in K.BoneHead(arm, "RightForeArm")])
tipCap, fistFrac = [], []
for f in FR:
    K.At(f)
    PRm = K.Palm(arm, "Right")
    _w = K.BoneHead(arm, "RightHand"); _m = K.BoneHead(arm, "RightHandMiddle1"); _t = K.BoneHead(arm, "RightHandThumb1")
    _fi = (_m - _w).normalized(); _ax = (_t - _w - _fi * (_t - _w).dot(_fi)).normalized()
    _cap = PRm - _ax * CAP_BELOW
    tipCap.append(round(min((Tail(f"LeftHand{fn}3") - _cap).length for fn in FNAMES), 4))
    fr = {}
    for fn in FNAMES:
        fr[fn] = round(sum(Ang(pbs[f"LeftHand{fn}{i + 1}"].rotation_quaternion, base_q[(f"LeftHand{fn}{i + 1}", f)]) / MAXD[i] for i in range(3)) / 3.0, 2)
    fistFrac.append(fr)
print("tip->cap frames 30..36 (cm)", [round(tipCap[f - 1] * 100, 1) for f in range(30, 37)])
print("finger bend fractions frames 31..42", [(f, fistFrac[f - 1]) for f in range(31, 43)])
K.Report(arm, NAME, extra={"anyFingertipToCap": tipCap, "leftFingerBendFraction": fistFrac,
    "timings": TIMINGS, "phaseFrames": {"reach": F_REACH, "capOff": F_CAP_OFF, "toss": F_TOSS, "hook": F_HOOK, "pull0": F_PULL0, "pull1": F_PULL1, "rEnd": F_R_END, "release": 28 + SHIFT},
    "rightPalmSpeed": speedR, "leftPalmSpeed": speedL, "leftPalmToBriefPoint13cm": dBrief, "leftFingertipToCap": dCapTip, "leftPalmToCapEnd": dPalmCap,
    "grenadeHeadUpZ": axisUp, "leftElbow": elbowL, "rightElbow": elbowR, "capBelowM": CAP_BELOW, "briefBelowM": BRIEF_BELOW,
})
print("pinch frames d(brief13)", [dBrief[f - 1] for f in range(F_REACH, F_CAP_OFF + 1)])
print("pinch frames d(fingertip->cap)", [dCapTip[f - 1] for f in range(F_REACH, F_CAP_OFF + 1)])
print("pull speeds L", [(f, speedL[f - 1]) for f in range(F_PULL0 - 1, F_L_END + 3)])
print("max speedR", max(speedR), "at", speedR.index(max(speedR)) + 1, "max speedL", max(speedL), "at", speedL.index(max(speedL)) + 1)
print("head-up z min over 10..50", min(axisUp[9:50]))
print("DONE")

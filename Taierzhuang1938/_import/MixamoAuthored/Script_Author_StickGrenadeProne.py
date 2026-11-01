# StickGrenadeProne「国军木柄弹·趴着扔」 (Claude, 2026-11-01)
#
# 是什么：国军步兵卧姿投木柄手榴弹（巩式 / 二四式）。趴在地上，右手握木柄靠弹头一端（弹头朝前上），
#   左手在身体前下方捏住木柄尾端的盖，手腕转两三下把盖拧下，小指勾住拉火绳猛地一拽；拉火后不停顿，
#   身体向左侧翻、右臂从体侧向后带、再向上向前抡出（出手后弹头朝前上方飞），扔完立刻翻回趴姿。单次，不循环。
#
# 改自：Animation_Mixamo_ThrowGrenade_V1（卧姿投弹，106 帧 / 3.53 s）。原动作是端着东西的卧姿，右手从身侧后带再抡，
#   身体向左侧翻到约 90°（肩线竖起），最后翻回。这条动作保留它的侧翻、躯干、头颈、右臂抡出的整套运动，但做了这些改动：
#     1. 前半段（0–1.5 s）原动作的躯干/骨盆/腿完全不用，改成静止的第 1 帧卧姿，双手改成"拧盖拉火"的新动作；
#     2. 躯干从第 46 帧起并入原动作第 44 帧的姿势（快进 8 帧），带臂段（原动作第 44-52 帧）放慢到 0.5 倍速，之后 1:1 沿用原动作的抡臂，出手之后 1.4 倍速翻回；
#     3. 骨盆平移原动作 ~11 cm，这里只取 HIPS_FRAC 的比例，保证 ≤ 5 cm；双脚用 IK 钉在第 1 帧的位置；
#     4. 双手的姿势全部用 IK 重做：右手握弹的朝向（弹头朝前上）与手指、左手拇指食指捏盖（指节角度用小优化器在手骨局部解出）、
#        拧盖时整只手绕木柄轴转（盖在轴上，指尖不离盖）、拉绳，都是新写的；
#        出手点（原动作右手最快的那一刻）的手心轨迹沿用原动作，朝向改成弹头朝前上。
#
# 关键帧（30 fps；预览里 t = 帧 / 30，下面都按这个写）：
#   帧   t(s)   内容
#     1  0.03   原卧姿（两手端着东西）
#    14  0.47   到位：右手握木柄近弹头端（弹头朝前上）；左手拇指、食指指尖对捏在木柄尾盖上（指尖到尾端约 1 cm）
#   14-44        左手腕绕木柄轴转 3 下（每下 60° 再退回），手指一直捏着盖；右手稳住木柄
#    44  1.47   盖拧下，左手往后退一点，小指勾住拉火绳
#   47-51        猛拉火绳（左手 ~2.4 m/s）
#    46  1.53   躯干开始侧翻（接着原动作第 44 帧的姿势）；右手从第 51 帧起向后带
#    55-70       带臂：右手离开身前 -> 摆到体后最远，约 0.5-0.6 s（放慢到原动作的 0.5 倍速），手速不超过 3.2 m/s
#    52  1.73   左手松开绳，伸向前方的地上撑住
#    70  2.33   右手摆到体后最远，弹头朝上略向后
#    77  2.57   出手（右手掌心最快 8 m/s），朝前上方，弹头朝前上
#    84  2.80   随挥，右手向前下
#  ~104  3.5    翻回卧姿，手回到第 1 帧的位置
#   总长 112 帧 = 3.73 s，loop = false
#
# 史实：国军木柄手榴弹（巩式 / 二四式）没有保险销。拧开木柄尾端的盖，拽出拉火绳（绳头勾在小指上一拽），随即甩出；
#   拉火后几秒就炸，不会拿在手里等。卧姿投弹常是侧身上手甩。
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "StickGrenadeProne"
BASE = "Animation_Mixamo_ThrowGrenade_V1"
N = 112

# ----------------------------------------------------------------------------- 参数
HIPS_FRAC = 0.30          # 骨盆平移取原动作的比例
ROLL_SCALE = 1.0          # 躯干/骨盆旋转取原动作偏离第 1 帧的比例
F_ROLL0, F_ROLL1, G_AT_R1 = 44, 54, 44      # 第 44-54 帧（10 帧）把静止的第 1 帧姿势逐骨头混到原动作第 44 帧的姿势
F_TURN = 70.0             # 带臂到最后一刻（原动作第 52 帧）；第 54 -> 70 帧放慢到 0.5 倍速，带臂（手离开身前到摆到体后最远）从 0.4 s 拉到约 0.55 s
F_SLOW, G_SLOW, SLOW_SPEED = 80.0, 62, 1.4    # 出手后 1.4 倍速翻回

F_READY = 14              # 双手到位
TWIST_START, TWIST_CYCLE, TWIST_N, TWIST_DEG = 14, 9, 3, 50.0
F_CAP_OFF = 41
F_HOOK = 46
F_PULL = (47, 48, 49, 50, 51)               # 拉绳 5 个点，下面按比例分配
PULL_FRACS = (0.0, 0.20, 0.65, 0.92, 1.0)
PULL_LEN = 0.18
F_R_BLEND0, F_R_BLEND1 = 50, 69             # 右手从"握弹"并入原动作的抡臂轨迹
F_WIND, F_REL, F_FOLLOW = 70, 77, 84        # 右手朝向关键帧：体后、出手、随挥
W_R_END = 100                                 # 右手 IK 在这一帧之后交还原动作
F_L_BLEND0, F_L_BLEND1 = 52, 70
W_L_END = 106

A_READY = Vector((-0.05, -0.62, 0.78)).normalized()    # 弹头朝前上
A_WIND = Vector((-0.25, 0.45, 0.85)).normalized()      # 体后：弹头朝上略向后
A_REL = Vector((0.0, -0.70, 0.71)).normalized()        # 出手：朝前上
A_FOLLOW = Vector((0.0, -0.85, -0.35)).normalized()    # 随挥：朝前下
T_RIGHT_PALM = Vector((-0.007, -0.90, 0.27))           # 到位时右掌心
TAIL_FROM_PALM = 0.075                                  # 手榴弹模型：木柄尾端（盖）在握点往小指一侧 7.5 cm
LEFT_DROP = 0.07                                        # 翻身后左手落地的下沉量
LEFT_ON_TAIL = 0.025                                    # 左掌心超出尾端
PULL_DIR = Vector((0.35, 0.93, -0.10)).normalized()
ELBOW_R_DESIGN = Vector((-0.30, -0.60, 0.05))
ELBOW_L_DESIGN = Vector((0.30, -0.62, 0.10))


def Smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def Lerp(a, b, t):
    return a + (b - a) * t


def G(f):
    if f < F_ROLL1:
        return float(G_AT_R1)
    if f <= F_TURN:
        return G_AT_R1 + (f - F_ROLL1) * 8.0 / (F_TURN - F_ROLL1)
    if f <= F_SLOW:
        return 52.0 + (f - F_TURN)
    return min(106.0, G_SLOW + SLOW_SPEED * (f - F_SLOW))


def Fmt(v, n=3):
    return tuple(round(x, n) for x in v)


LOG = []


def log(s):
    print("[StickProne]", s)
    LOG.append(s)


# ----------------------------------------------------------------------------- 载入并按时间表重排原动作
arm = K.LoadBase(BASE, frame_end=106)
scene = bpy.context.scene
act = arm.animation_data.action
cb = act.layers[0].strips[0].channelbag(arm.animation_data.action_slot)
fc = {(f.data_path, f.array_index): f for f in cb.fcurves}
BONES = [pb.name for pb in arm.pose.bones if (f'pose.bones["{pb.name}"].rotation_quaternion', 0) in fc]
SC = arm.matrix_world.to_scale()[0]


def SampleQ(bone, g):
    p = f'pose.bones["{bone}"].rotation_quaternion'
    q = Quaternion([fc[(p, i)].evaluate(g) for i in range(4)])
    q.normalize()
    return q


def SampleLoc(bone, g):
    p = f'pose.bones["{bone}"].location'
    return Vector([fc[(p, i)].evaluate(g) for i in range(3)])


q1 = {b: SampleQ(b, 1) for b in BONES}
hips_loc1 = SampleLoc("Hips", 1)
rot_q, hips_loc = {}, {}
STATIC_TOES = ("LeftToeBase", "RightToeBase")
for f in range(1, N + 1):
    g = G(f)
    w_mix = Smooth((f - F_ROLL0) / (F_ROLL1 - F_ROLL0))      # 静止姿势 -> 原动作的混合权重（10 帧缓入缓出）
    for b in BONES:
        q = SampleQ(b, g)
        qa = q1[b].copy()
        if qa.dot(q) < 0:
            qa.negate()
        q = qa.slerp(q, w_mix)
        if b in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder") and ROLL_SCALE != 1.0:
            q = q1[b].slerp(q, ROLL_SCALE)
        if b in STATIC_TOES:
            q = q1[b]
        rot_q[(b, f)] = q
    hips_loc[f] = hips_loc1 + (SampleLoc("Hips", g) - hips_loc1) * (HIPS_FRAC * w_mix)

for f_ in list(cb.fcurves):
    cb.fcurves.remove(f_)
scene.frame_start, scene.frame_end = 1, N
pbs = arm.pose.bones
for f in range(1, N + 1):
    for b in BONES:
        pbs[b].rotation_quaternion = rot_q[(b, f)]
        pbs[b].keyframe_insert("rotation_quaternion", frame=f)
    pbs["Hips"].location = hips_loc[f]
    pbs["Hips"].keyframe_insert("location", frame=f)
K.At(1)
log(f"remapped base to {N} frames; hips frac {HIPS_FRAC}")

# ----------------------------------------------------------------------------- 重排后的"自然"姿势快照（IK 之前）
nat = {}
for f in range(1, N + 1):
    K.At(f)
    d = {}
    for side in ("Right", "Left"):
        d[side + "palm"] = K.Palm(arm, side)
        d[side + "wrist"] = K.BoneHead(arm, side + "Hand")
        d[side + "elbow"] = K.BoneHead(arm, side + "ForeArm")
        d[side + "sh"] = K.BoneHead(arm, side + "Arm")
        d[side + "q"] = K.BoneMatrix(arm, side + "Hand").to_3x3().normalized().to_quaternion()
        d[side + "knee"] = K.BoneHead(arm, side + "Leg")
        d[side + "foot"] = K.BoneHead(arm, side + "Foot")
    d["hips"] = K.BoneHead(arm, "Hips")
    nat[f] = d
log("natural right palm @ release-ish: " + str([(f, Fmt(nat[f]["Rightpalm"], 2)) for f in (54, 60, 66, 69, 72, 78)]))

# 手骨局部：腕 -> 掌心
v_local = {}
for side in ("Right", "Left"):
    K.At(1)
    rot1 = K.BoneMatrix(arm, side + "Hand").to_3x3().normalized()
    v_local[side] = rot1.inverted() @ (K.Palm(arm, side) - K.BoneHead(arm, side + "Hand"))


def OrientFrom(f_w, n_w):
    """手骨头世界朝向：局部 Y = 手指方向 f_w，局部 Z = 掌心法线 n_w，局部 X = f x n。"""
    f_w = f_w.normalized()
    n_w = (n_w - f_w * n_w.dot(f_w)).normalized()
    x_w = f_w.cross(n_w)
    return Matrix((x_w, f_w, n_w)).transposed().to_quaternion()


# 预览工具里的"拇指侧"= 拇指 1 号骨相对腕、投影到垂直于手指的方向；实测它在手骨局部里是 (±0.86, 0, 0.51)
SIDE_LOC = {"Right": Vector((0.862, 0.0, 0.506)).normalized(), "Left": Vector((-0.862, 0.0, 0.507)).normalized()}


def RightOrient(a_w, fore):
    """右手：预览意义下的拇指侧 = 木柄方向 a_w（弹头），手指方向 = 小臂方向在垂直于 a_w 的分量。"""
    f_w = fore - a_w * fore.dot(a_w)
    if f_w.length < 1e-4:
        f_w = Vector((1, 0, 0))
    f_w.normalize()
    e1 = Vector((0, 1, 0))
    e2 = SIDE_LOC["Right"]
    loc = Matrix((e1, e2, e1.cross(e2))).transposed()
    wor = Matrix((f_w, a_w, f_w.cross(a_w))).transposed()
    return (wor @ loc.inverted()).to_quaternion(), f_w


def SlerpQ(a, b, t):
    if a.dot(b) < 0:
        b = b.copy()
        b.negate()
    return a.slerp(b, t)


# ----------------------------------------------------------------------------- 右手目标（每帧）
def AxisAt(f):
    keys = [(F_READY, A_READY), (F_R_BLEND0 + 1, A_READY), (F_WIND, A_WIND), (F_REL, A_REL), (F_FOLLOW, A_FOLLOW)]
    if f <= keys[0][0]:
        return A_READY
    for (fa, va), (fb, vb) in zip(keys, keys[1:]):
        if f <= fb:
            return Lerp(va, vb, Smooth((f - fa) / (fb - fa))).normalized()
    return A_FOLLOW


pull_prog = {}
for f in range(1, N + 1):
    pull_prog[f] = 0.0
for f, fr in zip(F_PULL, PULL_FRACS):
    pull_prog[f] = fr
for f in range(F_PULL[-1] + 1, N + 1):
    pull_prog[f] = 1.0

R_palm, R_q, R_pole, R_axis = {}, {}, {}, {}
RP = T_RIGHT_PALM
for f in range(1, W_R_END + 1):
    n = nat[min(max(f, F_ROLL1), N)]  # 并入窗口里，前 54 帧用第 54 帧的自然姿势
    w_pos = Smooth((f - F_R_BLEND0) / (F_R_BLEND1 - F_R_BLEND0))
    ready_k = Smooth((f - 1) / (F_READY - 1))
    mine_pos = Lerp(nat[1]["Rightpalm"], RP, ready_k) + A_READY * (0.0 * Smooth(pull_prog[f]))
    palm = Lerp(mine_pos, n["Rightpalm"], w_pos)
    palm = palm + Vector((0, 0, 0.04 * math.sin(math.pi * max(0.0, min(1.0, (f - 84) / 16.0)))))   # 收势时手指别蹭地
    elbow_mine = Lerp(nat[1]["Rightelbow"], ELBOW_R_DESIGN, ready_k)
    elbow = Lerp(elbow_mine, n["Rightelbow"], w_pos)
    a_w = AxisAt(f)
    fore = palm - elbow
    q_mine, _ = RightOrient(a_w, fore)
    if f < F_READY:
        q = SlerpQ(nat[1]["Rightq"], q_mine, Smooth((f - 1) / (F_READY - 1)))
    elif f <= F_FOLLOW:
        q = q_mine
    else:
        q = SlerpQ(R_q[F_FOLLOW], nat[min(W_R_END, N)]["Rightq"], Smooth((f - F_FOLLOW) / (W_R_END - F_FOLLOW)))
    R_palm[f], R_q[f], R_pole[f], R_axis[f] = palm, q, elbow, a_w
def SmoothQuats(qd, lo, hi, passes=2):
    for _ in range(passes):
        old = {f: qd[f].copy() for f in range(lo - 1, hi + 2)}
        for f in range(lo, hi + 1):
            a = SlerpQ(old[f - 1], old[f + 1], 0.5)
            qd[f] = SlerpQ(old[f], a, 0.5)


def ClampWrist(qd, lo, hi, limit_deg):
    """手指方向与（肘 -> 掌心）方向夹角不超过 limit_deg：超出的部分把手朝小臂方向掰回来。"""
    lim = math.radians(limit_deg)
    for f in range(lo, hi + 1):
        y = qd[f] @ Vector((0, 1, 0))
        fore = (R_palm[f] - R_pole[f]).normalized()
        ang = y.angle(fore)
        if ang > lim:
            axis = y.cross(fore)
            if axis.length > 1e-6:
                qd[f] = Quaternion(axis.normalized(), ang - lim) @ qd[f]


SmoothQuats(R_q, F_WIND - 2, W_R_END - 2)
ClampWrist(R_q, F_READY, W_R_END, 58.0)
SmoothQuats(R_q, F_WIND - 2, W_R_END - 2, passes=1)

log(f"right design palm samples: {[(f, Fmt(R_palm[f], 2)) for f in (1, 14, 30, 50, 56, 62, 69, 76, 90)]}")

# ----------------------------------------------------------------------------- 手指弯曲方向
# 先在一帧上试弯曲方向：绕局部 X 正转让指尖靠近掌心就是弯
SIGN = {}
for side in ("Right", "Left"):
    K.At(1)
    base_q = {b: pbs[b].rotation_quaternion.copy() for b in [f"{side}Hand{fn}{i}" for fn in K.FINGERS for i in (1, 2, 3)]}
    res = {}
    for sgn in (1, -1):
        for fn in K.FINGERS[1:]:
            for i in range(3):
                pbs[f"{side}Hand{fn}{i + 1}"].rotation_quaternion = Quaternion((1, 0, 0), sgn * math.radians((55, 80, 60)[i] * 0.8))
        bpy.context.view_layer.update()
        res[sgn] = (arm.matrix_world @ pbs[f"{side}HandMiddle3"].tail - K.Palm(arm, side)).length
    SIGN[side] = 1 if res[1] < res[-1] else -1
    for b, q in base_q.items():
        pbs[b].rotation_quaternion = q
    log(f"finger curl sign {side}: {SIGN[side]} (tip-palm +:{res[1]:.3f} -:{res[-1]:.3f})")
THUMB_SIGN = {}
for side in ("Right", "Left"):
    K.At(1)
    res = {}
    for sgn in (1, -1):
        for i in range(3):
            pbs[f"{side}HandThumb{i + 1}"].rotation_quaternion = Quaternion((1, 0, 0), sgn * math.radians(35))
        bpy.context.view_layer.update()
        res[sgn] = (arm.matrix_world @ pbs[f"{side}HandThumb3"].tail - arm.matrix_world @ pbs[f"{side}HandIndex2"].head).length
    THUMB_SIGN[side] = 1 if res[1] < res[-1] else -1
    log(f"thumb sign {side}: {THUMB_SIGN[side]} ({res[1]:.3f} / {res[-1]:.3f})")
K.At(1)



# ----------------------------------------------------------------------------- 左手：拇指、食指指尖捏住尾盖
A = A_READY
CAP = R_palm[F_READY] - A * TAIL_FROM_PALM              # 木柄尾端（盖）：握点（右掌心）往小指一侧 7.5 cm
HAND_ROT_LOC = {"fl": Vector((0, 1, 0)), "tl": SIDE_LOC["Left"]}


def Basis(a, b):
    e1 = a.normalized()
    e2 = (b - e1 * b.dot(e1)).normalized()
    return Matrix((e1, e2, e1.cross(e2))).transposed()


def LeftRot(F, T):
    """左手世界朝向（3x3）：手指方向 = F，预览意义的拇指侧 = T（被正交化）。"""
    return Basis(F, T) @ Basis(HAND_ROT_LOC["fl"], HAND_ROT_LOC["tl"]).inverted()


def QXd(deg):
    return Quaternion((1, 0, 0), math.radians(deg))


def RestMat(name):
    return arm.data.bones[name].matrix_local


def FingerHeads(side, finger, quats):
    """手骨局部坐标（米）里每个关节的头，最后一个是指尖。quats：3 个关节相对静止姿势的局部旋转。"""
    prev = RestMat(f"{side}Hand")
    c = Matrix.Identity(4)
    heads = []
    for i, q in enumerate(quats, start=1):
        b = RestMat(f"{side}Hand{finger}{i}")
        c = c @ (prev.inverted() @ b) @ q.to_matrix().to_4x4()
        heads.append(c.translation * SC)
        prev = b
    tip = c @ (prev.inverted() @ RestMat(f"{side}Hand{finger}4"))
    heads.append(tip.translation * SC)
    return heads


FN4 = ("Index", "Middle", "Ring", "Pinky")


def PinchQuats(v):
    """v: 指节角度（度）。四指绕局部 X（带弯曲方向符号），拇指三轴欧拉。"""
    qs = {}
    for fn in FN4:
        for i in range(3):
            qs[f"LeftHand{fn}{i + 1}"] = QXd(SIGN["Left"] * v[f"{fn}{i}"])
    for i in range(3):
        q = Quaternion((1, 0, 0), 0)
        for a_i, ax in enumerate((Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))):
            q = q @ Quaternion(ax, math.radians(v[f"T{i}{'XYZ'[a_i]}"]))
        qs[f"LeftHandThumb{i + 1}"] = q
    return qs


PALM_LOC = v_local["Left"]


def PinchLoss(v, cap_loc=None):
    if cap_loc is None:
        cap_loc = Vector((v["cx"], v["cy"], v["cz"]))
    qs = PinchQuats(v)
    ti = FingerHeads("Left", "Index", [qs[f"LeftHandIndex{i}"] for i in (1, 2, 3)])[3]
    tt = FingerHeads("Left", "Thumb", [qs[f"LeftHandThumb{i}"] for i in (1, 2, 3)])[3]
    tm = FingerHeads("Left", "Middle", [qs[f"LeftHandMiddle{i}"] for i in (1, 2, 3)])[3]
    L = ((ti - cap_loc).length - 0.009) ** 2 * 3 + ((tt - cap_loc).length - 0.009) ** 2 * 3 + ((tm - cap_loc).length - 0.022) ** 2
    L += max(0.0, 0.016 - (ti - tt).length) ** 2
    L += ((ti + tt) * 0.5 - cap_loc).length ** 2 * 0.5
    L += max(0.0, 0.008 - cap_loc.z) ** 2                  # 盖在掌心一侧
    dpc = (cap_loc - PALM_LOC).length                       # 掌心离盖 3.5-7.5 cm
    L += max(0.0, 0.035 - dpc) ** 2 + max(0.0, dpc - 0.075) ** 2
    pen = 0.0
    for fn in ("Ring", "Pinky"):
        for i in range(3):
            pen += 3e-5 * (v[f"{fn}{i}"] - 40.0) ** 2
    for k, x in v.items():
        if k[0] == "c":
            continue
        pen += (2e-5 if k[0] == "T" else 1e-5) * x * x
    return 3000 * L + pen, (ti - cap_loc).length, (tt - cap_loc).length


def PinchSolve(iters, seed, init=None):
    rnd = random.Random(seed)
    v = {f"{fn}{i}": 40.0 for fn in FN4 for i in range(3)}
    v.update({f"T{i}{a}": 0.0 for i in range(3) for a in "XYZ"})
    v.update({"cx": 0.0, "cy": 0.10, "cz": 0.03})
    if init:
        v.update(init)
    best = PinchLoss(v)[0]
    step = 14.0
    for it in range(iters):
        cand = dict(v)
        for k in rnd.sample(list(v.keys()), 3):
            if k[0] == "c":
                cand[k] += rnd.gauss(0, 0.004 * step / 14.0)
            else:
                cand[k] += rnd.gauss(0, step)
                cand[k] = max(-50.0, min(50.0, cand[k])) if k[0] == "T" else max(-10.0, min(100.0, cand[k]))
        c = PinchLoss(cand)[0]
        if c < best:
            best, v = c, cand
        if it % max(1, iters // 5) == max(1, iters // 5) - 1:
            step *= 0.6
    return best, v


# 1) 在手骨局部坐标里解：盖放在哪一点、五指怎么弯，能让食指、拇指尖落在盖两侧（与手在世界里怎么放无关）
sols = [PinchSolve(2500, 11 + 17 * r) for r in range(5)]
sols.sort(key=lambda t: t[0])
sc_p, vbest = sols[0]
cap_loc_L = Vector((vbest["cx"], vbest["cy"], vbest["cz"]))
PINCH_Q = PinchQuats(vbest)
_, d_i, d_t = PinchLoss(vbest)
log(f"PINCH local solve: loss {sc_p:.3f} (all restarts {[round(t[0], 2) for t in sols]}); tip->cap index {d_i * 100:.2f} cm thumb {d_t * 100:.2f} cm; cap in hand frame {Fmt(cap_loc_L * 100, 1)} cm")
log("pinch angles " + str({k: round(x, 2) if k[0] == "c" else round(x) for k, x in vbest.items()}))

# 2) 在世界里挑手的朝向：手腕够得着、拧的时候不蹭地、不撞右手；肘不要太弯或太直
Lsh = nat[1]["Leftsh"]
Rpalm_hold = R_palm[F_READY]
cands = []
for Fv in (Vector((-0.70, -0.45, 0.45)), Vector((-0.50, -0.70, 0.50)), Vector((-0.80, -0.05, 0.60)), Vector((-0.35, -0.85, 0.40)),
           Vector((-0.9, -0.3, 0.1)), Vector((-0.6, -0.8, 0.0)), Vector((-0.2, -0.9, 0.35)), Vector((-0.9, 0.2, 0.3)),
           Vector((0.0, -0.8, 0.6)), Vector((-0.5, 0.3, 0.8)), Vector((-0.4, -0.5, 0.75)), Vector((-0.9, -0.4, 0.35))):
    F0 = Fv.normalized()
    ref = Vector((0, 0, 1)) - F0 * F0.z
    if ref.length < 1e-3:
        ref = Vector((1, 0, 0))
    ref.normalize()
    for k in range(12):
        T0 = Quaternion(F0, math.radians(30 * k)) @ ref
        R = LeftRot(F0, T0)
        wrist = CAP - R @ cap_loc_L
        P = wrist + R @ v_local["Left"]
        dist_sh = (wrist - Lsh).length
        if not (0.22 < dist_sh < 0.52):
            continue
        pen = abs(dist_sh - 0.40) * 3
        zmin = 9.0
        for deg in (-TWIST_DEG, -TWIST_DEG / 2, 0.0, TWIST_DEG / 2, TWIST_DEG):
            o = Matrix.Rotation(math.radians(deg), 3, A)
            zmin = min(zmin, (CAP + o @ (wrist - CAP)).z, (CAP + o @ (P - CAP)).z)
        if zmin < 0.07:
            pen += (0.07 - zmin) * 30
        if (P - Rpalm_hold).length < 0.09:
            pen += 1.0
        if (wrist - Rpalm_hold).length < 0.09:
            pen += 1.0
        # 左前臂方向（肩 -> 腕）与手指方向别差太多（腕别扭断）
        fore = (wrist - Lsh).normalized()
        pen += max(0.0, 0.2 - (R @ Vector((0, 1, 0))).dot(fore)) * 2
        cands.append((pen, F0, T0, R, P))
cands.sort(key=lambda c: c[0])
log(f"pinch hand-pose candidates: {len(cands)} feasible; best penalties {[round(c[0], 3) for c in cands[:5]]}")
_, F_L, T_L, R_L_PINCH, P_L_PINCH = cands[0]
log(f"pinch hand pose: F {Fmt(F_L, 2)} T {Fmt(T_L, 2)} palm {Fmt(P_L_PINCH, 3)} palm->cap {(P_L_PINCH - CAP).length * 100:.1f} cm")


def LeftPinchPose(deg):
    o = Matrix.Rotation(math.radians(deg), 3, A)
    return CAP + o @ (P_L_PINCH - CAP), (o @ R_L_PINCH).to_quaternion()


def TwistDeg(f):
    t = f - TWIST_START
    if t < 0 or t >= TWIST_CYCLE * TWIST_N:
        return 0.0
    u = t % TWIST_CYCLE
    rise = TWIST_CYCLE * 0.6
    return TWIST_DEG * (Smooth(u / rise) if u < rise else 1 - Smooth((u - rise) / (TWIST_CYCLE - rise)))


L_palm, L_q, L_pole = {}, {}, {}
for f in range(1, W_L_END + 1):
    n = nat[min(max(f, F_L_BLEND1), N)]
    w_nat = Smooth((f - F_L_BLEND0) / (F_L_BLEND1 - F_L_BLEND0))
    ready_k = Smooth((f - 1) / (F_READY - 1))
    p_pin, q_pin = LeftPinchPose(TwistDeg(f))
    back = 0.03 * Smooth((f - F_CAP_OFF) / (F_HOOK - F_CAP_OFF))      # 盖拧下后手往后退一点，小指去勾绳
    pull_off = PULL_DIR * (PULL_LEN * pull_prog[f])
    if f < F_READY:
        mine_pos = Lerp(nat[1]["Leftpalm"], p_pin, ready_k)
        q_mine = SlerpQ(nat[1]["Leftq"], q_pin, ready_k)
    else:
        mine_pos = p_pin - A * back + pull_off
        q_mine = q_pin
    palm = Lerp(mine_pos, n["Leftpalm"], w_nat)
    # 翻身后左手落到地上撑住（原动作里左手端着东西离地 15 cm 以上）
    palm = palm + Vector((0, 0, -LEFT_DROP * Smooth((f - F_L_BLEND0) / 8.0) * (1 - Smooth((f - 90) / 12.0))))
    q = SlerpQ(q_mine, nat[min(f, N)]["Leftq"], w_nat)
    elbow = Lerp(Lerp(nat[1]["Leftelbow"], ELBOW_L_DESIGN, ready_k), n["Leftelbow"] + Vector((0, 0, 0.05)), w_nat)
    L_palm[f], L_q[f], L_pole[f] = palm, q, elbow


# ----------------------------------------------------------------------------- IK（逐帧目标，烘回动作）
def PickPoleAngle(side, frame, wrist_pos, pole_pos, chain="ForeArm", root="Arm"):
    K.At(frame)
    target, pole_obj = K._Empty("IKtest"), K._Empty("PoleTest", pole_pos)
    target.location = wrist_pos
    fore = pbs[f"{side}{chain}"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole_obj
    shoulder = K.BoneHead(arm, f"{side}{root}")
    best = (-2, None)
    for ang in (-180, -135, -90, -45, 0, 45, 90, 135):
        ik.pole_angle = math.radians(ang)
        bpy.context.view_layer.update()
        elbow = arm.matrix_world @ pbs[f"{side}{chain}"].head
        axis = (wrist_pos - shoulder).normalized()
        mid = shoulder + axis * (elbow - shoulder).dot(axis)
        bend = elbow - mid
        want = pole_pos - (shoulder + axis * (pole_pos - shoulder).dot(axis))
        cos = bend.normalized().dot(want.normalized()) if bend.length > 1e-6 and want.length > 1e-6 else -1
        if cos > best[0]:
            best = (cos, ang)
    fore.constraints.remove(ik)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)
    log(f"pole angle {side} @f{frame}: {best[1]} (cos {best[0]:.2f})")
    return best[1]


def LimbIk(tip_bone_prefix, chain_bone, tip_bone, targets, quats, poles, window, pole_angle, blend=3, bones=None):
    """targets/quats/poles: {frame: ...}。chain_bone 是 ForeArm / Leg，tip_bone 是 Hand / Foot。"""
    target = K._Empty("IK_" + chain_bone)
    pole_obj = K._Empty("Pole_" + chain_bone)
    target.rotation_mode = "QUATERNION"
    prev = None
    for f in sorted(targets):
        target.location = targets[f]
        target.keyframe_insert("location", frame=f)
        q = quats[f].copy()
        if prev is not None and q.dot(prev) < 0:
            q.negate()
        prev = q
        target.rotation_quaternion = q
        target.keyframe_insert("rotation_quaternion", frame=f)
        pole_obj.location = poles[f]
        pole_obj.keyframe_insert("location", frame=f)
    ik = pbs[chain_bone].constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    ik.pole_target = pole_obj
    if isinstance(pole_angle, (list, tuple)):
        for frame, ang in pole_angle:
            ik.pole_angle = math.radians(ang)
            ik.keyframe_insert("pole_angle", frame=frame)
    else:
        ik.pole_angle = math.radians(pole_angle)
    rot = pbs[tip_bone].constraints.new("COPY_ROTATION")
    rot.target = target
    first, last = window
    for con in (ik, rot):
        for frame, value in ((first - blend, 0.0), (first, 1.0), (last, 1.0), (last + blend, 0.0)):
            con.influence = value
            con.keyframe_insert("influence", frame=frame)
    K._BakeBones(arm, bones, first - blend, last + blend)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)


# 腿：钉住第 1 帧的双脚（位置 + 朝向）
foot1 = {}
K.At(1)
for side in ("Left", "Right"):
    foot1[side] = (K.BoneHead(arm, side + "Foot"), K.BoneMatrix(arm, side + "Foot").to_3x3().normalized().to_quaternion())
LEG_FROM = 42
for side in ("Left", "Right"):
    tg = {f: foot1[side][0] for f in range(LEG_FROM, N + 1)}
    qs = {f: foot1[side][1] for f in range(LEG_FROM, N + 1)}
    po = {f: nat[f][side + "knee"] for f in range(LEG_FROM, N + 1)}
    a1 = PickPoleAngle(side, 1, foot1[side][0], nat[1][side + "knee"], "Leg", "UpLeg")
    a70 = PickPoleAngle(side, 72, foot1[side][0], po[72], "Leg", "UpLeg")
    while a70 - a1 > 180:
        a70 -= 360
    while a70 - a1 < -180:
        a70 += 360
    keys = [(LEG_FROM, a1), (60, a70), (88, a70), (N - 8, a1)]
    LimbIk("", side + "Leg", side + "Foot", tg, qs, po, (LEG_FROM + 2, N - 8), keys, blend=8,
           bones=[side + "UpLeg", side + "Leg", side + "Foot"])

for side in ("Left", "Right"):
    dd = []
    for f in range(40, N + 1, 6):
        K.At(f)
        dd.append((f, round((K.BoneHead(arm, side + "Leg") - nat[f][side + "knee"]).length * 100, 1), round((K.BoneHead(arm, side + "Foot") - foot1[side][0]).length * 100, 1)))
    log(f"DEBUG leg {side} knee-vs-natural / foot drift (f, cm, cm): {dd}")
# 手：右手 / 左手
wr_r = {f: R_palm[f] - R_q[f] @ v_local["Right"] for f in R_palm}
wr_l = {f: L_palm[f] - L_q[f] @ v_local["Left"] for f in L_palm}
ang_r = PickPoleAngle("Right", F_READY + 6, wr_r[F_READY + 6], R_pole[F_READY + 6])
ang_l = PickPoleAngle("Left", F_READY + 6, wr_l[F_READY + 6], L_pole[F_READY + 6])
LimbIk("", "RightForeArm", "RightHand", wr_r, R_q, R_pole, (1, W_R_END), ang_r, blend=4,
       bones=["RightArm", "RightForeArm", "RightHand"])
LimbIk("", "LeftForeArm", "LeftHand", wr_l, L_q, L_pole, (1, W_L_END), ang_l, blend=4,
       bones=["LeftArm", "LeftForeArm", "LeftHand"])
log("arms/legs IK baked")

# ----------------------------------------------------------------------------- 手指
def FingerQ(side, bone, amounts):
    """amounts: dict finger -> 0..1。返回局部旋转。"""
    if bone in amounts:
        return amounts[bone]
    fn = bone[len(side) + 4:-1]
    i = int(bone[-1]) - 1
    amt = amounts.get(fn, 0.0)
    if fn == "Thumb":
        return Quaternion((1, 0, 0), THUMB_SIGN[side] * math.radians((30, 40, 35)[i] * amt))
    return Quaternion((1, 0, 0), SIGN[side] * math.radians((55, 80, 60)[i] * amt))


GRIP = {"Index": 0.95, "Middle": 1.0, "Ring": 1.0, "Pinky": 1.0, "Thumb": 0.9}
PINCH = {"Index": 0.55, "Middle": 0.6, "Ring": 0.65, "Pinky": 0.7, "Thumb": 0.75}
HOOK = {"Index": 0.8, "Middle": 0.85, "Ring": 0.9, "Pinky": 1.0, "Thumb": 0.6}
OPEN = {"Index": 0.15, "Middle": 0.2, "Ring": 0.25, "Pinky": 0.3, "Thumb": 0.1}


def FingerTimeline(side, spec):
    """spec: [(帧, 姿势 dict 或 None=原动作自然姿势)]，帧间平滑；逐帧写键。"""
    bones = [f"{side}Hand{fn}{i}" for fn in K.FINGERS for i in (1, 2, 3)]
    for b in bones:
        for f in range(1, N + 1):
            def At(k):
                fk, pose = spec[k]
                if isinstance(pose, int):
                    return rot_q[(b, pose)]
                return rot_q[(b, min(fk, N))] if pose is None else FingerQ(side, b, pose)
            if f <= spec[0][0]:
                q = At(0) if spec[0][1] is not None else rot_q[(b, f)]
            elif f >= spec[-1][0]:
                q = At(len(spec) - 1) if spec[-1][1] is not None else rot_q[(b, f)]
            else:
                for k in range(len(spec) - 1):
                    fa, fb = spec[k][0], spec[k + 1][0]
                    if fa <= f <= fb:
                        pa, pb_ = spec[k][1], spec[k + 1][1]
                        qa = rot_q[(b, f)] if pa is None else (rot_q[(b, pa)] if isinstance(pa, int) else FingerQ(side, b, pa))
                        qb = rot_q[(b, f)] if pb_ is None else (rot_q[(b, pb_)] if isinstance(pb_, int) else FingerQ(side, b, pb_))
                        q = qa.slerp(qb, Smooth((f - fa) / (fb - fa)))
                        break
            pbs[b].rotation_quaternion = q
            pbs[b].keyframe_insert("rotation_quaternion", frame=f)


FingerTimeline("Right", [(1, None), (F_READY - 3, GRIP), (F_REL, GRIP), (F_REL + 6, OPEN), (F_REL + 16, 100), (104, 100), (N, None)])
FingerTimeline("Left", [(1, None), (F_READY - 3, PINCH_Q), (F_CAP_OFF, PINCH_Q), (F_HOOK + 1, HOOK), (F_PULL[-1] + 1, HOOK),
                        (F_PULL[-1] + 8, OPEN), (F_L_BLEND1 + 4, None)])

# ----------------------------------------------------------------------------- 收尾
act = arm.animation_data.action
channelbags = [c for layer in act.layers for strip in layer.strips for c in strip.channelbags]
dropped = 0
for c in channelbags:
    for f_ in list(c.fcurves):
        if "constraints" in f_.data_path:
            c.fcurves.remove(f_)
            continue
        for kp in reversed(list(f_.keyframe_points)):
            if kp.co[0] < 1 - 1e-4 or kp.co[0] > N + 1e-4:
                f_.keyframe_points.remove(kp)
                dropped += 1
        for kp in f_.keyframe_points:
            kp.interpolation = "LINEAR"
        f_.update()
log(f"trimmed {dropped} out-of-range keys; frame_range {tuple(act.frame_range)}")

TIMINGS = {"start": 1 / 30, "ready": F_READY / 30, "twist_start": TWIST_START / 30, "cap_off": F_CAP_OFF / 30,
           "pull_start": F_PULL[0] / 30, "pull_end": F_PULL[-1] / 30, "roll_start": F_ROLL0 / 30,
           "windup": F_WIND / 30, "release": F_REL / 30, "followthrough": F_FOLLOW / 30,
           "end": N / 30}
TIMINGS = {k: round(v, 3) for k, v in TIMINGS.items()}
K.Export(arm, NAME, {
    "base": BASE, "label": "国军木柄弹·趴着扔",
    "note": "国军木柄手榴弹（巩式/二四式）没有保险销：趴着，右手握木柄近弹头端、弹头朝前上；左手拇指、食指捏住木柄尾端的盖，手腕绕木柄轴转 3 下拧下，"
            "小指勾住拉火绳猛拉；随即身体向左侧翻、右臂从体后向上向前抡出，出手后立刻翻回趴姿。拉火后不停顿，不能握着等。"
            "单次、不循环。预览里弹头挂在挥得最快的右手上，出手点在约 2.57 s。",
    "timings": TIMINGS, "loop": False, "durationSec": round(N / 30, 3)})

# ----------------------------------------------------------------------------- 报告 + 自查
extra = {"timings": TIMINGS, "logs": LOG}
rows = []
low = []
min_z = {}
prev = {}
speeds = {"R": [], "L": []}
tail_dist = {}
tipd = {}
for f in range(1, N + 1):
    K.At(f)
    P = {s: K.Palm(arm, s) for s in ("Right", "Left")}
    for s in ("R", "L"):
        p = P["Right" if s == "R" else "Left"]
        speeds[s].append(round((p - prev[s]).length * 30, 3) if s in prev else 0.0)
        prev[s] = p.copy()
    hand = K.BoneHead(arm, "RightHand")
    side = (K.BoneHead(arm, "RightHandThumb1") - hand)
    fing = (K.BoneHead(arm, "RightHandMiddle1") - hand).normalized()
    side = (side - fing * side.dot(fing)).normalized()
    tail_pt = P["Right"] - side * TAIL_FROM_PALM
    tail_dist[f] = (P["Left"] - tail_pt).length
    tip_i = K.BoneHead(arm, "LeftHandIndex4")
    tip_t = K.BoneHead(arm, "LeftHandThumb4")
    tip_m = K.BoneHead(arm, "LeftHandMiddle4")
    tipd[f] = ((tip_i - tail_pt).length, (tip_t - tail_pt).length, (tip_m - tail_pt).length)
    rows.append({"f": f, "side": list(side), "tail": list(tail_pt)})
    for nm in ("RightForeArm", "LeftForeArm", "RightHand", "LeftHand", "Spine2", "Spine1", "Head"):
        z = K.BoneHead(arm, nm).z
        min_z[nm] = min(min_z.get(nm, 9), z)
    for pb in pbs:
        for z in ((arm.matrix_world @ pb.head).z, (arm.matrix_world @ pb.tail).z):
            low.append((round(z, 3), pb.name, f))
            min_z["ALL"] = min(min_z.get("ALL", 9), z)
extra.update({"speedR": speeds["R"], "speedL": speeds["L"], "stick": rows, "leftPalmToTail": [round(tail_dist[f], 4) for f in sorted(tail_dist)], "leftTipsToTail": [[round(x, 4) for x in tipd[f]] for f in sorted(tipd)]})
K.Report(arm, NAME, extra=extra)

# 汇总打印
K.At(1)
h0 = K.BoneHead(arm, "Hips", 1)
lf0, rf0 = K.BoneHead(arm, "LeftFoot", 1), K.BoneHead(arm, "RightFoot", 1)
hip_max = foot_l = foot_r = 0.0
for f in range(1, N + 1):
    hip_max = max(hip_max, (K.BoneHead(arm, "Hips", f) - h0).length)
    foot_l = max(foot_l, (K.BoneHead(arm, "LeftFoot") - lf0).length)
    foot_r = max(foot_r, (K.BoneHead(arm, "RightFoot") - rf0).length)
log(f"VERIFY hips max move {hip_max * 100:.1f} cm; feet drift L {foot_l * 100:.1f} R {foot_r * 100:.1f} cm")
log(f"VERIFY max speed R {max(speeds['R']):.2f} @f{speeds['R'].index(max(speeds['R'])) + 1}  L {max(speeds['L']):.2f} @f{speeds['L'].index(max(speeds['L'])) + 1}")
log("VERIFY left speed in pull: " + str([(f, speeds['L'][f - 1]) for f in range(F_PULL[0] - 1, F_PULL[-1] + 3)]))
log("VERIFY left fingertip to tail end (cm) [index, thumb, middle] f14..41 step 3: " + str([(f, [round(x * 100, 2) for x in tipd[f]]) for f in range(14, 42, 3)]))
log("VERIFY left fingertip max over f14..41 (index, thumb): %.2f %.2f cm" % (max(tipd[f][0] for f in range(14, 42)) * 100, max(tipd[f][1] for f in range(14, 42)) * 100))
log("VERIFY left palm to tail (cm) f14..46: " + str([round(tail_dist[f] * 100, 1) for f in range(14, 47, 4)]))
low.sort()
log("VERIFY lowest 8: " + str(low[:8]))
log("VERIFY min z: " + str({k: round(v, 3) for k, v in min_z.items()}))
low2 = sorted(x for x in low if "Toe" not in x[1])
log("VERIFY lowest 6 (no toes): " + str(low2[:6]))
ra = [K.Palm(arm, "Right", f) for f in range(1, N + 1)]
for f in range(70, 84):
    v = (ra[f] - ra[f - 1]) * 30
    log(f"  release scan f{f}: speed {v.length:.1f} m/s dir {Fmt(v.normalized(), 2)} elev {math.degrees(math.asin(v.normalized().z)):.0f}")
big = [(f + 1, round(speeds['R'][f], 1)) for f in range(N) if speeds['R'][f] > 2.4]
log("VERIFY right palm steps > 2.4 m/s: " + str(big))
bigL = [(f + 1, round(speeds['L'][f], 1)) for f in range(N) if speeds['L'][f] > 2.0]
log("VERIFY left palm steps > 2.0 m/s: " + str(bigL))
for side in ("Right", "Left"):
    el = []
    for f in range(1, N + 1):
        K.At(f)
        el.append(K.BoneHead(arm, side + "ForeArm"))
    st = max(((el[i] - el[i - 1]).length, i + 1) for i in range(1, N))
    log(f"VERIFY {side} elbow max step {st[0] * 100:.1f} cm @f{st[1]}; min elbow z {min(e.z for e in el):.3f}")
for f in (1, 14, 30, 44, 50, 58, 66, 70, 74, 77, 80, 84, 92, 104, 112):
    K.At(f)
    r_el, l_el = K.BoneHead(arm, "RightForeArm"), K.BoneHead(arm, "LeftForeArm")
    s = rows[f - 1]["side"]
    log(f"f{f}: Rpalm {Fmt(K.Palm(arm, 'Right'))} z={K.Palm(arm, 'Right').z:.2f} Lpalm {Fmt(K.Palm(arm, 'Left'))} Relb {Fmt(r_el, 2)} Lelb {Fmt(l_el, 2)} stick-axis {Fmt(s, 2)} "
        f"RelbAngle {math.degrees((K.BoneHead(arm, 'RightArm') - r_el).angle(K.BoneHead(arm, 'RightHand') - r_el)):.0f}")
# 首尾差
K.At(1)
a = {pb.name: pb.rotation_quaternion.copy() for pb in pbs}
K.At(N)
worst, wname = max((2 * math.acos(min(1.0, abs(pb.rotation_quaternion.dot(a[pb.name])))), pb.name) for pb in pbs)
log(f"VERIFY start/end worst bone rotation difference {math.degrees(worst):.2f} deg ({wname})")
K.At(1)
h1 = {pb.name: (arm.matrix_world @ pb.head).copy() for pb in pbs}
K.At(N)
dm = max(((arm.matrix_world @ pb.head - h1[pb.name]).length, pb.name) for pb in pbs)
log(f"VERIFY start/end max joint position difference {dm[0] * 100:.2f} cm ({dm[1]})")
with open(os.path.join(K.AUTHORED, NAME + ".log.txt"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(LOG))
print("DONE")

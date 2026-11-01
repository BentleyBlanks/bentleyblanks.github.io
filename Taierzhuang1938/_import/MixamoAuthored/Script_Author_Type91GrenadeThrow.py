# Type91GrenadeThrow「日军九一式·拔销磕盔扔」 (Claude, 2026-11-01)
#
# 这是什么：日军步兵跪姿，右手握九一式手榴弹，先用牙咬住保险销拉环、头一扭拔掉销，
#   再把引信帽一端往自己钢盔顶上用力一磕（点火），停一拍等一等（九一式延时 7-8 秒，老兵不抢着扔，免得被扔回来），然后甩出。
# 改自：Animation_Mixamo_GrenadeThrow_V3（跪着咬拉环投弹·单次，174 帧）。
#   原动作：右手握弹；第 10-19 帧右手把弹举到嘴边，第 34-47 帧头埋低、右手贴在嘴前（咬销，掌心离嘴约 8 cm），
#   第 47-52 帧头往后一扯手拉开（拔销），第 55 帧起左臂前伸平衡、躯干后仰引臂，第 97-109 帧右手从后上方甩出（掌心峰值约 5.6 m/s），
#   之后收势，第 142 帧起一直静止。
#   做法：第 1-52 帧原样（含咬销和拔销）；第 52 帧之后插入 42 帧（1.4 s）磕盔段：原动作冻结在第 52 帧的姿势（腿、骨盆、左臂都不动，
#   所以脚和膝不漂），只在躯干、颈、头、右锁骨上叠加直起/低头/耸肩，右臂用 IK 带着手绕开脸、举到钢盔顶右上方、磕、停顿、再绕开脸落回；
#   插入段末尾姿势等于第 52 帧，原动作第 53 帧起接着走（左臂前伸平衡、躯干后仰引臂、右手甩出、收势，整体后移 42 帧）。
#   原动作 152 帧之后是一段静止，裁掉。手指不动（握弹的手型用原动作的）。
#   手的位置都写成「头顶 HeadTop_End + 偏移」，头怎么动手都跟着，磕盔点不会被躯干叠加带偏。
#
# 关键帧时间表（30 fps；第 1 帧 = 0 s；t = (帧 - 1) / 30。注意导出的 GLB 在预览里的时间 = 帧 / 30，比这里晚 1/30 s）：
#   帧   1-10  0.00-0.30  跪姿待机，右手握弹放在膝前，左手撑在左膝（原动作）
#   帧  10-19  0.30-0.60  右手举到嘴边（原动作）
#   帧  37-46  1.20-1.50  咬销：头埋低，右手贴嘴前，引信帽尖离嘴 1.6 cm，掌心离嘴 7-8 cm（原动作）
#   帧  46-52  1.50-1.70  头一扭、手拉开，把销拔掉（原动作）
#   帧  52-68  1.70-2.23  右手从嘴前绕到头右侧（离头骨网格 ≥ 5 cm）、再抬到钢盔顶右上方，腕后扣；躯干头颈直起，右肩耸起
#   帧  68-71  2.23-2.33  磕：腕往下快敲 3 帧，掌心速度 0.7 -> 1.8 -> 2.9 m/s；头同时略低迎上去；帧 71 = 引信帽尖碰到钢盔顶
#   帧  71-74  2.33-2.43  敲实后微弹（手速 < 0.3 m/s）
#   帧  74-78  2.43-2.57  停一拍，手几乎不动
#   帧  78-94  2.57-3.10  右手绕开脸，慢慢落回原动作第 52 帧的位置（峰值 2.2 m/s），头颈躯干回原姿势
#   帧  94 起  3.10       接原动作第 53 帧（左臂前伸、躯干后仰引臂），帧 144 = 出手（预览挑出的出手帧，右手 5.6 m/s），之后收势
#   整条 194 帧 = 6.43 s，单次（loop: false）。磕盔到引臂开始约 0.77 s。
#   磕盔接触帧（帧 71）：帽尖在 HeadTop_End 正上方 3.0 cm；掌心在 HeadTop_End 右侧 5.8 cm、上方 6.4 cm；拇指侧（帽）方向 (0.87, 0, -0.50) 朝左下。
#
# 史实：日军九一式手榴弹：拔掉保险销，把引信帽往钢盔（或石头、硬物）上用力一磕才点着，再扔；延时 7-8 秒，
#   所以磕完常常停一拍再扔。
#
# 预览里手榴弹挂在「挥得最快的那只手」（右手出手约 5.6 m/s）的掌心；右手整条都握着弹，左手峰值 < 右手出手速度。
#   原动作自带的左臂前伸平衡（帧 99-103，峰值约 3.0 m/s，此时右手 < 0.2 m/s）没动：整条的峰值上左手 3.9 m/s（收势下落）< 右手 5.6 m/s。
#   弹的引信帽朝拇指一侧伸出，帽尖 = 掌心 + 0.067 m × 拇指侧方向（预览：Ø5 cm 弹体长 9.5 cm，帽在 z=-0.067 处）。
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Quaternion, Vector, Matrix

bpy = K.bpy
NAME = "Type91GrenadeThrow"
BASE = "Animation_Mixamo_GrenadeThrow_V3"
TRIM = 152                       # 原动作保留到第 152 帧（之后是静止）
S = 52                           # 插入点：原动作第 52 帧
RISE_N, HOLD_N, LOW_N = 16, 4, 16
F_RISE = S + RISE_N              # 68 手举到钢盔顶右上方
F_C = F_RISE + 3                 # 71 引信帽尖碰盔
F_REB = F_C + 3                  # 74 微弹结束
F_HOLD = F_REB + HOLD_N          # 80 停顿结束
F_BACK = F_HOLD + LOW_N          # 94 落回原姿势
N = F_BACK - S                   # 插入帧数 42
END = TRIM + N                   # 194
F_RELEASE = 102 + N              # 原动作第 102 帧是右手峰值（出手）
RAMP_IN, RAMP_OUT = 6, 6

CAP_LEN = 0.067                  # 预览里引信帽尖离掌心
FUSE_ABOVE = 0.030               # 磕盔时帽尖在 HeadTop_End 上方
RISE_ABOVE = 0.15                # 手从多高落下来（掌心）
AX_KNOCK = Vector((0.86, 0.0, -0.5)).normalized()      # 磕的时候拇指侧（引信帽）方向：向左下
AX_COCK = Vector((0.88, 0.25, 0.40)).normalized()      # 举起时：腕后扣，帽朝左略向上
STRIKE_S = (0.08, 0.40, 1.0)                           # 磕 3 帧的累计路程比例（0.06 / 0.084 / 0.096 m 每帧 -> 1.8 / 2.5 / 2.9 m/s）

UP_DEG = {"Spine1": 8.0, "Spine2": 8.0, "Neck": 10.0, "Head": 12.0}    # 直起（-X）总量
DIP_DEG = {"Neck": 2.0, "Head": 7.0}
SHRUG_DEG = 14.0                                                      # 右锁骨上抬（+Z），让手够得到                                  # 磕时低头（+X）

arm = K.LoadBase(BASE, frame_end=END)
scene = bpy.context.scene
pbs = arm.pose.bones
mw = arm.matrix_world
act = arm.animation_data.action
cb = act.layers[0].strips[0].channelbag(arm.animation_data.action_slot)
FR = list(range(1, END + 1))


def Smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def Ease(t):
    """比 Smooth 缓和：中段最大速度只有匀速的 1.25 倍。"""
    t = max(0.0, min(1.0, t))
    return 0.5 * (Smooth(t) + t)


def Env(keys, f):
    if f <= keys[0][0]:
        return keys[0][1]
    for (fa, va), (fb, vb) in zip(keys, keys[1:]):
        if f <= fb:
            return va + (vb - va) * Smooth((f - fa) / float(fb - fa))
    return keys[-1][1]


def BaseOf(n):
    if n <= S:
        return n
    if n <= S + N:
        return S
    return min(TRIM, n - N)


# ------------------------------------------------------------------ 0. 重排原动作：S 之后冻结 N 帧，再接着走；逐帧写线性键
for fc in cb.fcurves:
    vals = [fc.evaluate(b) for b in range(1, 175)]
    for i in range(len(fc.keyframe_points) - 1, -1, -1):
        fc.keyframe_points.remove(fc.keyframe_points[i])
    fc.keyframe_points.add(END)
    for n in range(1, END + 1):
        kp = fc.keyframe_points[n - 1]
        kp.co = (n, vals[BaseOf(n) - 1])
        kp.interpolation = "LINEAR"
    fc.update()

# ------------------------------------------------------------------ 1. 躯干、颈、头的叠加（直起 + 磕时低头）
LAYERED = ["Spine1", "Spine2", "Neck", "Head", "RightShoulder"]
base_q = {}
for f in FR:
    K.At(f)
    for b in LAYERED:
        base_q[(b, f)] = pbs[b].rotation_quaternion.copy()

UP_ENV = [(S, 0.0), (S + RISE_N // 2, 0.55), (F_RISE, 1.0), (F_REB, 1.0), (F_HOLD, 0.9), (F_BACK, 0.0)]
DIP_ENV = [(S, 0.0), (F_RISE - 1, 0.0), (F_C, 1.0), (F_C + 5, 0.7), (F_HOLD + 2, 0.0)]


def QX(deg):
    return Quaternion((1, 0, 0), math.radians(deg))


def Layer(bone):
    pb = pbs[bone]
    for f in FR:
        if bone == "RightShoulder":
            pb.rotation_quaternion = base_q[(bone, f)] @ Quaternion((0, 0, 1), math.radians(SHRUG_DEG * Env(UP_ENV, f)))
        else:
            d = -UP_DEG.get(bone, 0.0) * Env(UP_ENV, f) + DIP_DEG.get(bone, 0.0) * Env(DIP_ENV, f)
            pb.rotation_quaternion = base_q[(bone, f)] @ QX(d)
        pb.keyframe_insert("rotation_quaternion", frame=f)


for b in LAYERED:
    Layer(b)

# ------------------------------------------------------------------ 2. 量测：基准手腕（重排后、未改手）、头顶、嘴
def HandRot3(frame=None):
    return K.BoneMatrix(arm, "RightHand", frame).to_quaternion().to_matrix()


K.At(S)
R_S = HandRot3()
V_LOC = R_S.inverted() @ (K.Palm(arm, "Right") - K.BoneHead(arm, "RightHand"))     # 掌心相对手腕（手局部）
FL_LOC = R_S.inverted() @ (K.BoneHead(arm, "RightHandMiddle1") - K.BoneHead(arm, "RightHand")).normalized()
_t = K.BoneHead(arm, "RightHandThumb1") - K.BoneHead(arm, "RightHand")
_fw = (K.BoneHead(arm, "RightHandMiddle1") - K.BoneHead(arm, "RightHand")).normalized()
TL_LOC = R_S.inverted() @ (_t - _fw * _t.dot(_fw)).normalized()


def ThumbAxis():
    """弹头方向（预览：从手腕指向 Middle1 的垂直方向上的拇指侧）。"""
    w, m, t = K.BoneHead(arm, "RightHand"), K.BoneHead(arm, "RightHandMiddle1"), K.BoneHead(arm, "RightHandThumb1")
    fg = (m - w).normalized()
    ax = t - w
    return (ax - fg * ax.dot(fg)).normalized()


# 头局部的「前」：第 1 帧用肩线定出身体朝向，换到头骨局部
K.At(1)
_fwd = (K.BoneHead(arm, "LeftShoulder") - K.BoneHead(arm, "RightShoulder")).cross(Vector((0, 0, 1)))
_fwd.z = 0
_fwd.normalize()
HEAD_FWD_LOC = K.BoneMatrix(arm, "Head").to_3x3().normalized().inverted() @ _fwd


def Mouth():
    h, top = K.BoneHead(arm, "Head"), K.BoneHead(arm, "HeadTop_End")
    up = (top - h).normalized()
    fw = K.BoneMatrix(arm, "Head").to_3x3().normalized() @ HEAD_FWD_LOC
    return h + up * 0.05 + fw * 0.09        # 嘴唇前缘（估）


BASE_W = {}                      # 重排后原动作的右手：(手腕, 朝向四元数)，只对插入段之外有意义
TOP = {}
for f in FR:
    K.At(f)
    BASE_W[f] = (K.BoneHead(arm, "RightHand").copy(), K.BoneMatrix(arm, "RightHand").to_quaternion())
    TOP[f] = K.BoneHead(arm, "HeadTop_End").copy()

K.At(S)
P0 = K.Palm(arm, "Right").copy()
AX_BASE = ThumbAxis()
Q_BASE = BASE_W[S][1]
ELBOW_S = K.BoneHead(arm, "RightForeArm").copy()
SHOULDER_S = K.BoneHead(arm, "RightArm").copy()
print("S: palm", P0, "axis", AX_BASE, "elbow", ELBOW_S, "shoulder", SHOULDER_S, "top", TOP[S])
print("Top at S", TOP[S], " at rise", TOP[F_RISE], " at contact", TOP[F_C])


def QRot(a, b):
    return a.rotation_difference(b)


Q_COCK = QRot(AX_BASE, AX_COCK) @ Q_BASE
Q_KNOCK = QRot(AX_BASE, AX_KNOCK) @ Q_BASE

# ------------------------------------------------------------------ 3. 右手轨迹（掌心 = 头顶 TOP(f) + 相对偏移）
REL_C = -AX_KNOCK * CAP_LEN + Vector((0, 0, FUSE_ABOVE))        # 帽尖在 Top 上方 FUSE_ABOVE -> 掌心
REL_HI = REL_C + Vector((-0.012, 0.012, RISE_ABOVE))
REL_REB = REL_C + Vector((0.0, 0.0, 0.016))
REL_W = Vector((-0.25, 0.03, -0.02))                              # 绕开脸：头顶高度、右侧 20 cm


def Bez(p0, w, p1, u):
    wc = w * 2 - (p0 + p1) * 0.5                                 # 让曲线中点过 w
    return p0 * (1 - u) ** 2 + wc * 2 * u * (1 - u) + p1 * u * u


def RelAt(f):
    """(相对头顶的掌心偏移, 朝向四元数)。"""
    rel_s = P0 - TOP[S]
    rel_e = P0 - TOP[F_BACK]
    if f <= S:
        return rel_s, Q_BASE
    if f <= F_RISE:
        u = Ease((f - S) / float(F_RISE - S))
        return Bez(rel_s, REL_W, REL_HI, u), Q_BASE.slerp(Q_COCK, u)
    if f <= F_C:
        i = f - F_RISE                                           # 1..3
        s = STRIKE_S[i - 1]
        return REL_HI.lerp(REL_C, s), Q_COCK.slerp(Q_KNOCK, s)
    if f <= F_REB:
        k = Smooth((f - F_C) / float(F_REB - F_C))
        return REL_C.lerp(REL_REB, k), Q_KNOCK
    if f <= F_HOLD:
        return REL_REB.copy(), Q_KNOCK
    if f <= F_BACK:
        u = Ease((f - F_HOLD) / float(F_BACK - F_HOLD))
        return Bez(REL_REB, REL_W, rel_e, u), Q_KNOCK.slerp(Q_BASE, u)
    return rel_e, Q_BASE


def Track(f):
    if f < S - RAMP_IN or f > F_BACK + RAMP_OUT or f < S or f > F_BACK:
        w, q = BASE_W[min(f, END)]
        return w, q
    rel, q = RelAt(f)
    palm = TOP[f] + rel
    return palm - q.to_matrix() @ V_LOC, q


# ------------------------------------------------------------------ 4. IK 右臂（每帧一个键），烘回动作
def ArmIkDense(side, keys, rkeys, on_first, on_last, pole, pole_angle, ramp_in, ramp_out):
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


POLE_OFF = Vector(tuple(float(x) for x in os.environ.get("T91_POLE", "-0.30,0.15,0.35").split(",")))
POLE_ANGLE = float(os.environ.get("T91_POLE_ANGLE", "180"))
POLE = ELBOW_S + POLE_OFF
keys, rkeys = [], []
prev = None
IK_FIRST, IK_LAST = S, F_BACK
TARGET_PALM = {}
for f in range(S - RAMP_IN, F_BACK + RAMP_OUT + 1):
    wrist, q = Track(f)
    keys.append((f, wrist))
    qq = q.copy()
    if prev is not None and qq.dot(prev) < 0:
        qq.negate()
    prev = qq
    rkeys.append((f, qq))
    TARGET_PALM[f] = wrist + q.to_matrix() @ V_LOC
ArmIkDense("Right", keys, rkeys, IK_FIRST, IK_LAST, POLE, POLE_ANGLE, RAMP_IN, RAMP_OUT)

# ------------------------------------------------------------------ 5. 收尾：线性键，导出
for fc in cb.fcurves:
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
    fc.update()

TIMINGS = {"start": 0.0, "bringToMouth": round((19 - 1) / 30, 3), "biteStart": round((37 - 1) / 30, 3), "pinPull": round((46 - 1) / 30, 3),
           "raiseToHelmet": round((S - 1) / 30, 3), "helmetCocked": round((F_RISE - 1) / 30, 3), "knockContact": round((F_C - 1) / 30, 3),
           "pauseStart": round((F_REB - 1) / 30, 3), "pauseEnd": round((F_HOLD - 1) / 30, 3), "armBack": round((F_BACK - 1) / 30, 3),
           "release": round((F_RELEASE - 1) / 30, 3), "end": round((END - 1) / 30, 3)}
K.Export(arm, NAME, {
    "base": BASE, "label": "日军九一式·拔销磕盔扔",
    "note": "日军九一式手榴弹：右手握弹，举到嘴边用牙咬住保险销拉环、头一扭拔掉销（原动作）；再把引信帽一端往自己钢盔顶上一磕点火（腕往下快敲，头略低迎上去），"
            "停约 0.7 s（九一式延时 7-8 秒，老兵等一下再扔）；然后接原动作的引臂和甩出。整条 6.4 s，单次。预览里弹挂右手到出手。给日军用，不要给国军（国军木柄弹没有保险销）。",
    "timings": TIMINGS, "loop": False, "durationSec": round((END - 1) / 30, 3)})

# ------------------------------------------------------------------ 6. 量测
rows = []
prevR = prevL = None
speedR, speedL = [], []
for f in FR:
    K.At(f)
    PR, PL = K.Palm(arm, "Right"), K.Palm(arm, "Left")
    speedR.append(round((PR - prevR).length * 30, 3) if prevR is not None else 0.0)
    speedL.append(round((PL - prevL).length * 30, 3) if prevL is not None else 0.0)
    prevR, prevL = PR.copy(), PL.copy()
    ax = ThumbAxis()
    top = K.BoneHead(arm, "HeadTop_End")
    head = K.BoneHead(arm, "Head")
    mouth = Mouth()
    tip = PR + ax * CAP_LEN
    hv = (top - head)
    # 掌心 / 帽尖到头骨轴线（Head -> HeadTop_End）的距离
    def AxisDist(p):
        t = max(0.0, min(1.0, (p - head).dot(hv) / hv.dot(hv)))
        return (p - (head + hv * t)).length
    rows.append({"f": f, "speedR": speedR[-1], "speedL": speedL[-1],
                 "dPalmMouth": round((PR - mouth).length, 4), "dTipMouth": round((tip - mouth).length, 4),
                 "palmMinusTop": [round(x, 4) for x in (PR - top)], "tipMinusTop": [round(x, 4) for x in (tip - top)],
                 "palmAxisDist": round(AxisDist(PR), 4), "tipAxisDist": round(AxisDist(tip), 4),
                 "axis": [round(x, 3) for x in ax], "top": [round(x, 4) for x in top],
                 "palmErr": round((PR - TARGET_PALM[f]).length, 4) if f in TARGET_PALM else None,
                 "elbowR": [round(x, 3) for x in K.BoneHead(arm, "RightForeArm")],
                 "shoulderR": [round(x, 3) for x in K.BoneHead(arm, "RightArm")]})
K.Report(arm, NAME, extra={"timings": TIMINGS, "phaseFrames": {"S": S, "N": N, "rise": F_RISE, "contact": F_C, "rebEnd": F_REB, "holdEnd": F_HOLD, "back": F_BACK,
                                                              "release": F_RELEASE}, "rows": rows,
                           "capLenM": CAP_LEN})

print("CONTACT f", F_C, "palm-top", rows[F_C - 1]["palmMinusTop"], "tip-top", rows[F_C - 1]["tipMinusTop"], "axis", rows[F_C - 1]["axis"], "palmErr", rows[F_C - 1]["palmErr"])
print("speedR strike", [(f, speedR[f - 1]) for f in range(F_RISE - 1, F_REB + 2)])
print("speedR hold", [speedR[f - 1] for f in range(F_REB, F_HOLD + 1)])
print("speedR back", [speedR[f - 1] for f in range(F_HOLD, F_BACK + 8)])
print("max speedR", max(speedR), "at", speedR.index(max(speedR)) + 1, "max speedL", max(speedL), "at", speedL.index(max(speedL)) + 1)
print("max speedR after back", max(speedR[F_BACK + 8:]), "max speedL (all)", max(speedL))
print("bite dPalmMouth", [(r["f"], r["dPalmMouth"]) for r in rows if 34 <= r["f"] <= 50])
print("min palmAxisDist 53..90", min((r["palmAxisDist"], r["f"]) for r in rows if S < r["f"] < F_BACK))
print("min tipAxisDist 53..90", min((r["tipAxisDist"], r["f"]) for r in rows if S < r["f"] < F_BACK))
print("palmErr max", max(r["palmErr"] for r in rows if r["palmErr"] is not None and S <= r["f"] <= F_BACK))
for f in (S, S + 6, F_RISE, F_C, F_HOLD, F_BACK):
    print("elbow/shoulder f", f, rows[f - 1]["elbowR"], rows[f - 1]["shoulderR"], "top", rows[f - 1]["top"])
print("DONE")

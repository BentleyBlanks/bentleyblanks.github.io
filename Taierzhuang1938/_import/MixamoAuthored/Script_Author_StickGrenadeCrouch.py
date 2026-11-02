# StickGrenadeCrouch -- 国军木柄弹·蹲着扔（蹲在掩体 / 壕沟后，扔过胸墙）
#
# 是什么：国军步兵蹲在胸墙后面，右手握木柄靠弹头一端、弹头朝上；左手伸到木柄尾端拧开盖（手腕转两三下），
#         小指勾住拉火绳往下后方猛拽；随即身体半起、右臂从肩后甩出，越过约 1 m 高的胸墙；扔完马上缩回蹲下。
#         拉火后不停顿（木柄弹拉火后几秒就炸，不会拿在手里等）。
# 改自：Animation_Mixamo_ThrowGrenade_V2（蹲姿投弹，106 帧 3.53 s，30 fps）。
#   看懂原动作：右手扔、左手几乎不动（<1 m/s，伸在前面当平衡臂）。原动作 1-35 帧右手在胸前到耳边「备弹」，
#   36-50 帧右臂向后下方抡到身后，51-57 帧向前上方甩出（第 57 帧手速 9 m/s，右掌心高 1.35 m），58-72 帧收势，
#   73-106 帧慢慢回到开头的蹲姿。它的两只手并没有「拧盖、拉绳」的内容，所以：
#     - 躯干、腿、头：原样保留（不重做）；前 35 帧的身体放慢到 39 帧（让出时间给拧盖和拉绳）；
#     - 右臂、左臂：前 40 帧全部重做（逐帧 IK），之后接回原动作的抡臂和甩出（抡臂到甩出这段压快 1.2 倍）；
#     - 半起身：在原动作那一点点起身之上再叠加 20 cm（臀部抬高），双脚用 IK 钉在第 1 帧位置，全程不漂；
#   甩臂本身（后抡、前甩）仍是原动作的，不是我写的。
# 史实：国军木柄手榴弹（巩式 / 二四式）没有保险销：拧开木柄尾端的盖，拽出拉火绳（绳头勾在小指上），随即甩出。
#       预览挂弹的方式：弹头从拇指一侧伸出拳头（木柄沿拇指方向，弹头 = 拇指侧），所以右手拇指朝上 = 弹头朝上。
#
# 关键帧（30 fps，第 1 帧 = 0 s；t = (帧 - 1) / 30）：
#   帧   t(s)   内容
#     1  0.00   蹲姿，原动作双手在胸前
#     8  0.23   左掌心到木柄尾端，右手已握弹（弹头朝上）
#     8-26      拧盖三下：每下 4 帧拧、2 帧回握（左手腕绕木柄轴 -65°）
#    26-28      手指就位：小指勾住拉火绳
#    28-34 0.90-1.10  拽绳：左手朝下后方 0.28 m，1.8 m/s 左右；右手握住往同方向挪 2 cm 顶住
#    34-40 1.10-1.30  左手松开、手臂前伸当平衡臂；右手转向耳边备弹，接回原动作
#    40-58 1.30-1.90  原动作抡臂（压快 1.2 倍），身体后坐，随后半起（臀部抬 20 cm）
#    ~57.5 1.88  出手（右掌心最快，约 1.5 m 高）
#    58-106     收势、缩回蹲下（原动作）
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Quaternion, Vector, Matrix

bpy = K.bpy
NAME = "StickGrenadeCrouch"
BASE = "Animation_Mixamo_ThrowGrenade_V2"

# ------------------------------------------------------------------ 时间表（新帧）
NB = 106                      # 原动作帧数
NJ = 41                       # 新第 41 帧 = 原第 36 帧（接回点）
F_REACH = 8                   # 左掌心到尾端
TWIST = [(8, 14), (14, 20), (20, 26)]     # 三下拧盖，每下 6 帧
F_HOOK0, F_HOOK1, F_PULL0, F_PULL1 = 26, 30, 29, 35     # 手型捏->勾 26-30（4 帧过渡），拽绳 29-35
F_R_IN = 6                    # 右手到位
F_L_END = 47                  # 左臂 IK 窗口末帧（之后 7 帧渐出）。2026-11-02 审查：原 43 时接回点是原动作第 38 帧的左手，
                              # 正压在左膝上（腕进小腿 3.4 cm）；挪到 47（原动作第 42 帧，手已抬离膝盖）
F_R_END = NJ                  # 右臂 IK 窗口末帧（之后 4 帧渐出）
SQUEEZE = 1.0                 # 原第 36-57 帧压快倍数
TOTAL = 111                   # 总帧数
LIFT = 0.20                   # 半起身再抬高臀部（m）
LIFT_ENV = [(50, 0.0), (62, 1.0), (64, 1.0), (82, 0.0)]
TWIST_DEG = -35.0             # 拧盖：绕木柄轴（从木柄向弹头方向看）
TAIL_OFF = 0.075              # 右掌心沿木柄往下到尾端盖（m）：项目手榴弹模型 z 从 -0.145（弹头）到 +0.075（尾端）
PULL_DIST = 0.27
PULL_PITCH = -50.0            # 拽绳时手掌随前臂往下俯（度，绕世界左右轴），免得手腕折过头
PULL_DIR = Vector((0.04, 0.72, -0.69)).normalized()     # 朝下后（-Y 是人的前方，+Y 是后）
HOLD_OFF = Vector((0.0, -0.08, -0.02))                    # 握弹位置 = 原第 1 帧右掌心 + 此偏移（世界方向）
U_HOLD = Vector((0.10, -0.08, 1.0)).normalized()        # 木柄轴（弹头方向）
F_R = Vector((0.04, -0.99, 0.10))                       # 右手指方向（朝前）
F_L = Vector((-0.55, -0.83, 0.0))                       # 左手指方向（朝前偏右）

arm = K.LoadBase(BASE)
scene = bpy.context.scene
act = arm.animation_data.action
cb = act.layers[0].strips[0].channelbag(arm.animation_data.action_slot)
pbs = arm.pose.bones
mw = arm.matrix_world
END = TOTAL
FR = list(range(1, END + 1))


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


# ------------------------------------------------------------------ 0. 时间重排：新帧 -> 原帧
KNOTS = [(1.0, 1.0), (float(NJ), 36.0), (NJ + 21.0 / SQUEEZE, 57.0), (float(NJ + 21.0 / SQUEEZE + 49), 106.0)]


def BaseFrame(n):
    if n <= KNOTS[0][0]:
        return KNOTS[0][1]
    for (na, ba), (nb, bb) in zip(KNOTS, KNOTS[1:]):
        if n <= nb:
            return ba + (bb - ba) * (n - na) / (nb - na)
    return KNOTS[-1][1]


for fc in cb.fcurves:
    pts = sorted((kp.co[0], kp.co[1]) for kp in fc.keyframe_points)
    fr0, frN = pts[0][0], pts[-1][0]
    dense = {int(round(a)): b for a, b in pts}

    def Ev(x, dense=dense, fr0=fr0, frN=frN):
        x = max(fr0, min(frN, x))
        i = int(math.floor(x))
        j = min(i + 1, int(frN))
        return dense[i] + (dense[j] - dense[i]) * (x - i)

    vals = [Ev(BaseFrame(n)) for n in FR]
    try:
        fc.keyframe_points.clear()
    except Exception:
        while len(fc.keyframe_points):
            fc.keyframe_points.remove(fc.keyframe_points[0])
    fc.keyframe_points.add(len(FR))
    for kp, n, v in zip(fc.keyframe_points, FR, vals):
        kp.co = (float(n), v)
        kp.interpolation = "LINEAR"
    fc.update()
K.ExtendTo(arm, END)
scene.frame_start, scene.frame_end = 1, END
ALLQ0 = {}
for _f in (1, END):
    K.At(_f)
    for _pb in pbs:
        ALLQ0[(_pb.name, _f)] = _pb.rotation_quaternion.copy()

# ------------------------------------------------------------------ 1. 编辑前存下原动作的量
FINGERS_ALL = {side: [f"{side}Hand{fn}{i}" for fn in ("Thumb", "Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)]
               for side in ("Right", "Left")}
KEEP = ["Neck", "Head"] + FINGERS_ALL["Right"] + FINGERS_ALL["Left"]
base_q = {}
base_hips_loc = {}
sp2_loc, sp2_rot = {}, {}
for f in FR:
    K.At(f)
    for b in KEEP:
        base_q[(b, f)] = pbs[b].rotation_quaternion.copy()
    base_hips_loc[f] = pbs["Hips"].location.copy()
    m = K.BoneMatrix(arm, "Spine2")
    sp2_loc[f] = m.translation.copy()
    sp2_rot[f] = m.to_quaternion().to_matrix()
f1 = {}
K.At(1)
for side in ("Right", "Left"):
    f1[side] = {"palm": K.Palm(arm, side), "wrist": K.BoneHead(arm, f"{side}Hand"),
                "quat": K.BoneMatrix(arm, f"{side}Hand").to_quaternion(),
                "elbow": K.BoneHead(arm, f"{side}ForeArm"), "shoulder": K.BoneHead(arm, f"{side}Arm")}
# 40 帧（接回点）原动作右手姿势
K.At(NJ)
join_R = {"wrist": K.BoneHead(arm, "RightHand"), "quat": K.BoneMatrix(arm, "RightHand").to_quaternion()}
K.At(F_L_END)
join_L = {"wrist": K.BoneHead(arm, "LeftHand"), "quat": K.BoneMatrix(arm, "LeftHand").to_quaternion()}
# 腿：左右脚踝、脚朝向（第 1 帧），膝盖逐帧（原动作）
ankle0 = {s: K.BoneHead(arm, f"{s}Foot", 1) for s in ("Left", "Right")}
foot_q0 = {s: K.BoneMatrix(arm, f"{s}Foot", 1).to_quaternion() for s in ("Left", "Right")}
knee_base = {s: {} for s in ("Left", "Right")}
hip_base = {s: {} for s in ("Left", "Right")}
for f in FR:
    K.At(f)
    for s in ("Left", "Right"):
        knee_base[s][f] = K.BoneHead(arm, f"{s}Leg")
        hip_base[s][f] = K.BoneHead(arm, f"{s}UpLeg")

V_LOCAL = Vector((0.0, 0.0524, 0.0))    # 腕 -> 掌心（手骨局部，实测两手相同）
S_LOCAL = {"Right": Vector((0.862, 0.0, 0.506)).normalized(), "Left": Vector((-0.862, 0.0, 0.507)).normalized()}   # 拇指侧（= 木柄轴 = 弹头方向）


def HandQuat(side, u, fdir):
    """手的世界朝向：手骨局部「拇指侧」轴 -> u（木柄轴），手骨局部 Y（指向）-> fdir（压到垂直于 u）。"""
    s = S_LOCAL[side]
    yl = Vector((0, 1, 0))
    bl = Matrix((s, yl, s.cross(yl))).transposed()
    fd = (fdir - u * fdir.dot(u)).normalized()
    bw = Matrix((u, fd, u.cross(fd))).transposed()
    return (bw @ bl.inverted()).to_quaternion()


def Wrist(side, palm, q):
    return palm - q.to_matrix() @ V_LOCAL


def Stick(side, q):
    """木柄轴（弹头方向）= 手骨局部拇指侧轴在世界里的方向。"""
    return (q.to_matrix() @ S_LOCAL[side]).normalized()


def FixSigns(seq):
    out, prev = [], None
    for q in seq:
        q = q.copy()
        if prev is not None and q.dot(prev) < 0:
            q.negate()
        out.append(q)
        prev = q
    return out


# ------------------------------------------------------------------ 2. 躯干叠加：低头看手（头颈）、半起身（臀部）
def LayerRot(bone, keys):
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
DIP = lambda deg: Quaternion((1, 0, 0), math.radians(deg))      # 绕局部 X 正向 = 低头（Prone 脚本实测：负向 = 抬脸）
LayerRot("Head", [(1, ID), (6, DIP(5)), (F_PULL1, DIP(7)), (NJ, ID)])
LayerRot("Neck", [(1, ID), (6, DIP(2)), (F_PULL1, DIP(3)), (NJ, ID)])

M3 = (mw.to_3x3() @ arm.data.bones["Hips"].matrix_local.to_3x3()).inverted()
hips_lift = {f: LIFT * Env(LIFT_ENV, f) for f in FR}
for f in FR:
    pbs["Hips"].location = base_hips_loc[f] + M3 @ Vector((0, 0, hips_lift[f]))
    pbs["Hips"].keyframe_insert("location", frame=f)
K.At(58)
print("[Crouch] hips z at 58:", K.BoneHead(arm, "Hips").z, "(lift", hips_lift[58], ")")


# ------------------------------------------------------------------ 3. 腿：IK 钉脚（脚踝、脚朝向钉在第 1 帧）
def TestPole(chain_bone, mid_name, target_pos, pole_pos, want_mid, angles):
    """试 IK 极点角：返回 {角: (膝/肘到想要位置的距离, 终点到目标的距离)}。"""
    tgt = K._Empty("T_test", target_pos)
    pol = K._Empty("P_test", pole_pos)
    ik = pbs[chain_bone].constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = tgt, 2, pol
    out = {}
    for a in angles:
        ik.pole_angle = math.radians(a)
        bpy.context.view_layer.update()
        mid = K.BoneHead(arm, mid_name)
        end = mw @ pbs[chain_bone].tail
        out[a] = (round((mid - want_mid).length, 3), round((end - target_pos).length, 4))
    pbs[chain_bone].constraints.remove(ik)
    bpy.data.objects.remove(tgt, do_unlink=True)
    bpy.data.objects.remove(pol, do_unlink=True)
    return out


LEG_ANGLE = {}
K.At(1)
for s in ("Left", "Right"):
    mid = knee_base[s][1]
    ankle = ankle0[s]
    hipp = hip_base[s][1]
    ext = (mid - (hipp + ankle) * 0.5)
    pole = mid + ext * 0.25
    res = TestPole(f"{s}Leg", f"{s}Leg", ankle, pole, mid, range(-180, 181, 10))
    print(f"[Crouch] leg pole-angle best {s}:", min(res.items(), key=lambda kv: kv[1][0]))
    LEG_ANGLE[s] = min(res, key=lambda a: res[a][0])
print("[Crouch] leg pole angles:", LEG_ANGLE)


LEG_WINDOW = (50, 86, 8)


def LegIk(side):
    tgt = K._Empty(f"IK_{side}Leg", ankle0[side])
    tgt.rotation_mode = "QUATERNION"
    tgt.rotation_quaternion = foot_q0[side]
    pol = K._Empty(f"Pole_{side}Leg")
    for f in FR:
        mid, hipp = knee_base[side][f], hip_base[side][f] + Vector((0, 0, 0.5 * hips_lift[f]))
        ext = mid + Vector((0, 0, 0.5 * hips_lift[f])) - (hipp + ankle0[side]) * 0.5
        pol.location = mid + Vector((0, 0, 0.5 * hips_lift[f])) + ext * 0.25
        pol.keyframe_insert("location", frame=f)
    ik = pbs[f"{side}Leg"].constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target, ik.pole_angle = tgt, 2, pol, math.radians(LEG_ANGLE[side])
    rot = pbs[f"{side}Foot"].constraints.new("COPY_ROTATION")
    rot.target = tgt
    first, last, blend = LEG_WINDOW           # 只在起身那段（臀部抬高）把脚钉住；头尾不碰，保持和 base 一样
    for c in (ik, rot):
        for frame, value in ((first - blend, 0.0), (first, 1.0), (last, 1.0), (last + blend, 0.0)):
            c.influence = value
            c.keyframe_insert("influence", frame=frame)
    K._BakeBones(arm, [f"{side}UpLeg", f"{side}Leg", f"{side}Foot"], first - blend, last + blend)
    bpy.data.objects.remove(tgt, do_unlink=True)
    bpy.data.objects.remove(pol, do_unlink=True)


LegIk("Left")
LegIk("Right")

# ------------------------------------------------------------------ 4. 双臂目标（逐帧）
# 右手：握弹位置 = 原第 1 帧右掌心 + 偏移，固定在 Spine2 局部（躯干在动，手跟着躯干）；朝向：弹头朝上
q_hold_R = HandQuat("Right", U_HOLD, F_R)
K.At(1)
hold_local = sp2_rot[1].inverted() @ (f1["Right"]["palm"] + HOLD_OFF - sp2_loc[1])
U_R = Stick("Right", q_hold_R)
D_PULL = PULL_DIR


def HoldPalmR(f):
    return sp2_loc[f] + sp2_rot[f] @ hold_local


def RightPose(f):
    """右手 (掌心, 朝向)；拽绳时顶住（沿拉的方向挪 2 cm），34 帧起转向备弹并接回原动作。"""
    palm = HoldPalmR(f)
    q = q_hold_R
    if f < F_R_IN:
        s = Smooth((f - 1) / (F_R_IN - 1))
        palm = f1["Right"]["palm"].lerp(palm, s)
        q = f1["Right"]["quat"].slerp(q_hold_R, s)
    palm = palm + D_PULL * (0.02 * Smooth((f - F_PULL0) / (F_PULL1 - F_PULL0)))
    return palm, q


def RightKey(f):
    palm, q = RightPose(f)
    wrist = Wrist("Right", palm, q)
    if f > F_PULL1:
        s = Smooth((f - F_PULL1) / (F_R_END - F_PULL1))
        wrist = wrist.lerp(join_R["wrist"], s)
        q = q.slerp(join_R["quat"], s)
    return wrist, q


def TailAt(f):
    palm, q = RightPose(f)
    return palm - Stick("Right", q) * TAIL_OFF, Stick("Right", q)


def Prog(t):          # 拽绳进度：起手快、收手慢（拉到绳长为止）
    t = max(0.0, min(1.0, t))
    return 1.0 - (1.0 - t) ** 1.5


def Curl(amounts, pinky=None):
    """握拳姿势 {骨: 四元数}（不含拇指）。amounts = (食, 中, 无名, 小) 每根的握紧程度，关节最大角 (55, 80, 60)。"""
    out = {}
    for fn, a in zip(("Index", "Middle", "Ring", "Pinky"), amounts):
        for i, mx in enumerate((55, 80, 60)):
            deg = (pinky[i] if (fn == "Pinky" and pinky) else mx * a)
            out[f"LeftHand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(deg))
    return out


def SolveThumb(side, fingers):
    """在给定的握姿下找一组拇指关节角，让拇指尖对上食指尖（捏住盖）。"""
    from mathutils import Euler
    K.At(1)
    for b, q in fingers.items():
        pbs[b].rotation_quaternion = q
    bpy.context.view_layer.update()

    def tip(name):
        return mw @ pbs[name].tail

    def cost(p):
        for i in range(3):
            pbs[f"{side}HandThumb{i + 1}"].rotation_quaternion = Euler(tuple(math.radians(v) for v in p[3 * i:3 * i + 3]), "XYZ").to_quaternion()
        bpy.context.view_layer.update()
        return abs((tip(f"{side}HandThumb3") - tip(f"{side}HandIndex3")).length - 0.012) + sum(v * v for v in p) * 1e-7
    p, best, step = [0.0] * 9, None, 20.0
    best = cost(p)
    while step > 0.5:
        improved = False
        for k in range(9):
            for sg in (1, -1):
                q = list(p)
                q[k] += sg * step
                if abs(q[k]) > 65:
                    continue
                c = cost(q)
                if c < best - 1e-6:
                    best, p, improved = c, q, True
        if not improved:
            step /= 2
    print(f"[Crouch] {side} thumb euler {[round(v, 1) for v in p]} residual {best * 100:.2f} cm")
    return [Euler(tuple(math.radians(v) for v in p[3 * i:3 * i + 3]), "XYZ").to_quaternion() for i in range(3)]


pinch_f = Curl((0.55, 0.75, 0.85, 0.90))        # 食指微屈、拇指对上食指尖，捏住尾盖
pinch_f_tight = pinch_f
hook_f = Curl((1.0, 1.0, 1.0, 1.0), pinky=(70, 95, 55))
THUMB_L = SolveThumb("Left", pinch_f_tight)
K.At(1)
for b in list(pinch_f_tight) + [f"LeftHandThumb{i}" for i in (1, 2, 3)]:
    pbs[b].rotation_quaternion = base_q[(b, 1)]



# 捏盖几何：拇指尖、食指尖的中点在手骨局部坐标里的位置（相对掌心）；之后把这个中点放到尾盖上
for b, q in pinch_f.items():
    pbs[b].rotation_quaternion = q
for i in (1, 2, 3):
    pbs[f"LeftHandThumb{i}"].rotation_quaternion = THUMB_L[i - 1]
bpy.context.view_layer.update()
_Rh = K.BoneMatrix(arm, "LeftHand").to_quaternion().to_matrix()
_tI, _tT = mw @ pbs["LeftHandIndex3"].tail, mw @ pbs["LeftHandThumb3"].tail
C_LOC_L = _Rh.inverted() @ ((_tI + _tT) * 0.5 - K.Palm(arm, "Left"))
print("[Crouch] left pinch: tip gap", round((_tI - _tT).length * 100, 2), "cm; palm->tip-mid in hand frame", tuple(round(x, 3) for x in C_LOC_L))
K.At(1)
for b in list(pinch_f_tight) + [f"LeftHandThumb{i}" for i in (1, 2, 3)]:
    pbs[b].rotation_quaternion = base_q[(b, 1)]

# 左手朝向：手指朝前偏右并略朝上，绕指向轴转 12 个角度挑一个让掌心朝着右拳的
H_DIR = Vector((-0.55, -0.83, 0.0)).normalized()
F_L_DIR = (U_HOLD * 0.30 + H_DIR * 0.95).normalized()
_p0 = F_L_DIR.cross(Vector((0, 0, 1))).normalized()
_cap_est = f1["Right"]["palm"] + HOLD_OFF - U_HOLD * TAIL_OFF
best_k, best_s = None, -9
for k in range(12):
    sdir = Quaternion(F_L_DIR, math.radians(30 * k)) @ _p0
    qk = HandQuat("Left", sdir, F_L_DIR)
    palm_est = _cap_est - qk.to_matrix() @ C_LOC_L
    n = qk.to_matrix() @ Vector((0, 0, 1))
    want = (f1["Right"]["palm"] + HOLD_OFF - palm_est).normalized()
    along = (palm_est - (f1["Right"]["palm"] + HOLD_OFF)).dot(-U_HOLD)       # 左掌心在右掌心下方多远（沿木柄）
    gap = (palm_est - (f1["Right"]["palm"] + HOLD_OFF)).length
    sc = -abs(along - 0.09) * 10 - max(0.0, 0.10 - gap) * 20 + 0.3 * n.dot(want)   # 要 ~9 cm、别钻进右拳、掌心尽量朝着右拳
    print(f"[Crouch] orient k={k}: along {along * 100:.1f} cm gap {gap * 100:.1f} cm align {n.dot(want):.2f}")
    if sc > best_s:
        best_k, best_s = k, sc
Q0_L = HandQuat("Left", Quaternion(F_L_DIR, math.radians(30 * best_k)) @ _p0, F_L_DIR)
print("[Crouch] left hand orientation pick", best_k, "palm-normal alignment", round(best_s, 2))

q_neutral_L = {}


def LeftPose(f):
    """左手 (掌心, 朝向)：伸到尾端，拧盖（绕木柄轴 -65°），拽绳（沿 PULL_DIR 0.28 m）。"""
    tail, u = TailAt(f)
    q0 = Q0_L
    ang = 0.0
    for (a, b) in TWIST:
        if a <= f <= b:
            ang = TWIST_DEG * (Smooth((f - a) / 3.0) if f <= a + 3 else 1.0 - Smooth((f - a - 3) / 3.0))
    Ru = Quaternion(u, math.radians(ang))                  # 绕通过尾盖的木柄轴转：指尖中点始终在盖上
    q = Ru @ q0
    palm = tail + Ru @ ((tail - q0.to_matrix() @ C_LOC_L) - tail)
    if f < F_REACH:
        s = Smooth((f - 1) / (F_REACH - 1))
        palm = f1["Left"]["palm"].lerp(palm, s)
        q = f1["Left"]["quat"].slerp(q, s)
    if f > F_PULL0:
        pr = Prog((f - F_PULL0) / float(F_PULL1 - F_PULL0))
        palm = palm + D_PULL * PULL_DIST * pr
        q = Quaternion(Vector((1, 0, 0)), math.radians(PULL_PITCH * pr)) @ q
    return palm, q


# 极点（肘尖朝哪）
K.At(1)
pole_R = f1["Right"]["elbow"] + Vector((-0.05, 0.05, -0.05))
pole_L = f1["Left"]["shoulder"] + Vector((0.10, -0.05, -0.35))
# 先试一试左右臂的极点角
for side, pole, frm in (("Right", pole_R, 14), ("Left", pole_L, 14)):
    palm, q = (RightPose(frm) if side == "Right" else LeftPose(frm))
    wr = Wrist(side, palm, q)
    K.At(1)
    res = TestPole(f"{side}ForeArm", f"{side}ForeArm", wr, pole, pole, range(-180, 181, 45))
    print(f"[Crouch] {side} arm pole-angle test (elbow dist to pole, wrist miss):", res)

import builtins
ARM_ANGLE = {"Right": float(os.environ.get("TZ_ANG_R", "180")), "Left": float(os.environ.get("TZ_ANG_L", "0"))}


def DoArm(side, fn_key, first, last, blend, pole):
    keys, rkeys = [], []
    for f in range(1, last + 1):
        w, q = fn_key(f)
        keys.append((f, w))
        rkeys.append((f, q))
    qs = FixSigns([q for _, q in rkeys])
    rkeys = [(f, q) for (f, _), q in zip(rkeys, qs)]
    K.ArmIk(arm, side, keys, window=(first, last), pole=pole, rotation_keys=rkeys, blend=blend, pole_angle_deg=ARM_ANGLE[side])


def LeftKey(f):
    palm, q = LeftPose(f)
    w = Wrist("Left", palm, q)
    if f > F_PULL1:                                  # 拽完松手，手臂前伸到原动作的平衡臂位置（慢于右手的甩）
        s = Smooth((f - F_PULL1) / float(F_L_END - F_PULL1))
        w = w.lerp(join_L["wrist"], s)
        q = q.slerp(join_L["quat"], s)
    return w, q


# 窗口头上的渐入：第 1 帧影响度 0（= 原动作），到 first 帧完全接管，所以开头不会换姿势
DoArm("Left", LeftKey, F_REACH, F_L_END, F_REACH - 1, pole_L)
DoArm("Right", RightKey, F_R_IN, F_R_END, F_R_IN - 1, pole_R)


# ------------------------------------------------------------------ 5. 手指（定义已前移到第 4 步之前）


def PoseL(kind, f):
    out = {}
    if kind == "base":
        for b in FINGERS_ALL["Left"]:
            out[b] = base_q[(b, f)]
        return out
    src = {"pinch": pinch_f, "tight": pinch_f_tight, "hook": hook_f}[kind]
    out.update(src)
    for i in (1, 2, 3):
        out[f"LeftHandThumb{i}"] = THUMB_L[i - 1] if kind != "hook" else THUMB_L[i - 1].slerp(Quaternion((1, 0, 0), 0), 0.3)
    return out


def LeftFingers(f):
    first = PoseL("base", 1)
    if f < F_REACH:
        s = Smooth((f - 3) / float(F_REACH - 3)) if f > 3 else 0.0
        pa, pb_ = PoseL("base", f), PoseL("pinch", f)
        return {b: first[b].slerp(pb_[b], s) for b in pb_}
    if f <= TWIST[-1][1]:
        return PoseL("pinch", f)
    if f <= F_HOOK1:
        s = Smooth((f - F_HOOK0) / float(F_HOOK1 - F_HOOK0))
        pa, pb_ = PoseL("pinch", f), PoseL("hook", f)
        return {b: pa[b].slerp(pb_[b], s) for b in pa}
    if f <= F_PULL1:
        return PoseL("hook", f)
    s = Smooth((f - F_PULL1) / float(NJ - F_PULL1))
    pa, pb_ = PoseL("hook", f), PoseL("base", f)
    return {b: pa[b].slerp(pb_[b], s) for b in pa}


grip_R = {b: base_q[(b, 1)] for b in FINGERS_ALL["Right"]}


def RightFingers(f):
    if f <= F_PULL1:
        return grip_R
    s = Smooth((f - F_PULL1) / float(NJ - F_PULL1))
    return {b: grip_R[b].slerp(base_q[(b, f)], s) for b in grip_R}


for f in range(1, NJ + 1):
    for pose in (LeftFingers(f), RightFingers(f)):
        for b, q in pose.items():
            pbs[b].rotation_quaternion = q
            pbs[b].keyframe_insert("rotation_quaternion", frame=f)

# ------------------------------------------------------------------ 6. 收尾
for fc in list(cb.fcurves):
    if "constraints[" in fc.data_path:          # IK 烘焙后留下的约束影响度曲线，已经没有用了
        cb.fcurves.remove(fc)
        continue
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
    fc.update()
fixed = 0
for pb in pbs:                                    # 四元数符号连续（烘焙段与原动作段可能差一个负号，线性插值会在半帧处翻出去）
    fcs = [cb.fcurves.find(f'pose.bones["{pb.name}"].rotation_quaternion', index=i) for i in range(4)]
    if not all(fcs):
        continue
    prev = None
    for k in range(len(fcs[0].keyframe_points)):
        q = Quaternion([fc.keyframe_points[k].co[1] for fc in fcs])
        if prev is not None and q.dot(prev) < 0:
            for fc in fcs:
                kp = fc.keyframe_points[k]
                kp.co = (kp.co[0], -kp.co[1])
            q.negate()
            fixed += 1
        prev = q
    for fc in fcs:
        fc.update()
print("[Crouch] quaternion sign fixes:", fixed)

# 2026-11-02 审查：原动作（ThrowGrenade_V2 第 55-58 帧 = 这里第 60-63 帧，出手前后）右手腕连同手指有一帧去了又回来的抽动
# （右手 31.6° / 26.1°、手指 16°）。在这段对右手和右手手指的本地旋转做 [1,2,1]/4 平滑（只动这几帧，出手时刻不变）
SMOOTH_R = (57, 67, 4)                            # 首帧, 末帧, 遍数
_smoothed = []
for pb in pbs:
    if not pb.name.startswith("RightHand"):
        continue
    fcs = [cb.fcurves.find(f'pose.bones["{pb.name}"].rotation_quaternion', index=i) for i in range(4)]
    if not all(fcs):
        continue
    idx = {int(round(kp.co[0])): k for k, kp in enumerate(fcs[0].keyframe_points)}
    if not all(f in idx for f in range(SMOOTH_R[0] - 1, SMOOTH_R[1] + 2)):
        continue
    def _Q(f):
        return Quaternion([fc.keyframe_points[idx[f]].co[1] for fc in fcs])
    for _ in range(SMOOTH_R[2]):
        old = {f: _Q(f) for f in range(SMOOTH_R[0] - 1, SMOOTH_R[1] + 2)}
        for f in range(SMOOTH_R[0], SMOOTH_R[1] + 1):
            q = old[f].slerp(old[f - 1].slerp(old[f + 1], 0.5), 0.5)
            for i, fc in enumerate(fcs):
                kp = fc.keyframe_points[idx[f]]
                kp.co = (kp.co[0], q[i])
    for fc in fcs:
        fc.update()
    _smoothed.append(pb.name)
print("[Crouch] smoothed right hand / fingers frames", SMOOTH_R, len(_smoothed), "bones")

TIMINGS = {"开始": 0.0, "左手到尾端": round((F_REACH - 1) / 30, 2), "拧盖三下": [round((TWIST[0][0] - 1) / 30, 2), round((TWIST[-1][1] - 1) / 30, 2)],
           "小指勾绳": round((F_HOOK0 - 1) / 30, 2), "拽绳": [round((F_PULL0 - 1) / 30, 2), round((F_PULL1 - 1) / 30, 2)],
           "右手转向备弹、接回原动作": round((NJ - 1) / 30, 2), "出手": round((NJ + 21.0 / SQUEEZE - 1) / 30, 2), "结束": round((END - 1) / 30, 2)}
K.Export(arm, NAME, {
    "base": BASE, "label": "国军木柄弹·蹲着扔", "loop": False, "durationSec": round((END - 1) / 30, 3),
    "note": "蹲在胸墙后：右手握柄靠弹头一端、弹头朝上；左手到尾端拧盖三下，小指勾拉火绳往下后拽；随即身体半起，右臂从肩后甩出过胸墙，扔完缩回蹲下。"
            "国军木柄弹没有保险销，拉火后几秒就炸，不停顿。后抡、前甩两段来自 Mixamo 原动作（压快 1.2 倍），拧盖和拉绳是重做的。"
            "预览里弹头从拇指一侧伸出，所以右手拇指朝上 = 弹头朝上。",
    "timings": TIMINGS, "grenade": "Gongxian"})

# ------------------------------------------------------------------ 7. 测量
for _f in (1, END):
    K.At(_f)
    _bad = sorted(((math.degrees(_pb.rotation_quaternion.rotation_difference(ALLQ0[(_pb.name, _f)]).angle), _pb.name) for _pb in pbs), reverse=True)[:6]
    print(f"[Crouch] diff vs base at f{_f}:", [(n, round(a, 1)) for a, n in _bad])
def StickDir(side, f=None):
    if f is not None:
        K.At(f)
    w = K.BoneHead(arm, f"{side}Hand")
    m = K.BoneHead(arm, f"{side}HandMiddle1")
    t = K.BoneHead(arm, f"{side}HandThumb1")
    fing = (m - w).normalized()
    th = t - w
    return (th - fing * th.dot(fing)).normalized()


rows = []
prevL = prevR = None
stats = {"tip_far": {}, "palm_along": {}, "tail_d": {}, "palm_gap": {}, "speed_L": {}, "speed_R": {}, "R_z": {}, "wrist_err_R": {}, "wrist_err_L": {}}
for f in FR:
    K.At(f)
    PR, PL = K.Palm(arm, "Right"), K.Palm(arm, "Left")
    u = StickDir("Right")
    tail = PR - u * TAIL_OFF
    tI, tT = mw @ pbs["LeftHandIndex3"].tail, mw @ pbs["LeftHandThumb3"].tail
    stats["tail_d"][f] = round(min((tI - tail).length, (tT - tail).length) * 100, 2)      # 食指/拇指尖到尾盖（取近的）
    stats["tip_far"][f] = round(max((tI - tail).length, (tT - tail).length) * 100, 2)
    stats["palm_gap"][f] = round((PL - PR).length * 100, 2)
    stats["palm_along"][f] = round((PR - PL).dot(u) * 100, 2)
    stats["speed_L"][f] = round((PL - prevL).length * 30, 2) if prevL is not None else 0.0
    stats["speed_R"][f] = round((PR - prevR).length * 30, 2) if prevR is not None else 0.0
    stats["R_z"][f] = round(PR.z, 3)
    if f <= F_L_END:
        stats["wrist_err_L"][f] = round((K.BoneHead(arm, "LeftHand") - LeftKey(f)[0]).length * 100, 2)
    if f <= F_R_END:
        stats["wrist_err_R"][f] = round((K.BoneHead(arm, "RightHand") - RightKey(f)[0]).length * 100, 2)
    prevL, prevR = PL, PR
print("[Crouch] nearer fingertip (thumb/index) -> cap (cm), frames 8-26:", [stats["tail_d"][f] for f in range(8, 27)])
print("[Crouch] farther fingertip -> cap (cm), frames 8-26:", [stats["tip_far"][f] for f in range(8, 27)])
print("[Crouch] left palm <-> right palm gap (cm), frames 8-26:", [stats["palm_gap"][f] for f in range(8, 27)])
print("[Crouch] left palm below right palm along stick (cm), frames 8-26:", [stats["palm_along"][f] for f in range(8, 27)])
print("[Crouch] left speed m/s, pull frames 28-34:", [stats["speed_L"][f] for f in range(28, 36)])
print("[Crouch] right speed m/s, pull frames 28-34:", [stats["speed_R"][f] for f in range(28, 36)])
print("[Crouch] IK wrist error cm L:", max(stats["wrist_err_L"].values()), "R:", max(stats["wrist_err_R"].values()))
print("[Crouch] left speed max before f40:", max(stats["speed_L"][f] for f in range(2, 41)), " right max before f40:", max(stats["speed_R"][f] for f in range(2, 41)))
print("[Crouch] left speed max overall:", max(stats["speed_L"].values()), " right max overall:", max(stats["speed_R"].values()))

# 仿预览的出手判定：半帧采样，只看「速度不朝下超过 20°」的帧，挑掌心最快的那只手
dur = (END - 1) / 30.0
steps = max(30, round(dur * 30 * 2))
dt = dur / steps
best = None
prev = {}
sin20 = math.sin(math.radians(20))
for i in range(steps + 1):
    t = i * dt
    scene.frame_set(int(math.floor(t * 30)) + 1, subframe=(t * 30) % 1.0)
    for side in ("Right", "Left"):
        p = K.Palm(arm, side)
        if side in prev:
            v = (p - prev[side]) / dt
            sp = v.length
            if v.z >= -sin20 * sp and (best is None or sp > best["speed"]):
                best = {"speed": sp, "hand": side, "t": t, "p": tuple(round(x, 3) for x in p), "height": round(p.z, 3)}
        prev[side] = p.copy()
print("[Crouch] preview-style release:", best)
# 出手前后左右手最快速度（半帧）
K.At(1)

# 双脚漂移
K.At(1)
ft0 = {n: K.BoneHead(arm, n) for n in ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")}
drift = {n: 0.0 for n in ft0}
zmin = {n: 9.0 for n in ft0}
for f in FR:
    K.At(f)
    for n in ft0:
        drift[n] = max(drift[n], (K.BoneHead(arm, n) - ft0[n]).length)
        zmin[n] = min(zmin[n], K.BoneHead(arm, n).z)
print("[Crouch] foot drift max (cm):", {n: round(v * 100, 2) for n, v in drift.items()})
hz = [K.BoneHead(arm, "Hips", f).z for f in FR]
hd = [K.BoneHead(arm, "Head", f).z for f in FR]
print("[Crouch] hips z min/max", round(min(hz), 3), round(max(hz), 3), " head z min/max", round(min(hd), 3), round(max(hd), 3))
rel_f = int(round(best["t"] * 30)) + 1 if best else 58
print("[Crouch] release frame ~", rel_f, "right palm z", stats["R_z"].get(rel_f), "head z", round(K.BoneHead(arm, "Head", rel_f).z, 3))

K.Report(arm, NAME, extra={"timings": TIMINGS, "tailDistCm": stats["tail_d"], "palmGapCm": stats["palm_gap"], "speedL": stats["speed_L"],
                           "speedR": stats["speed_R"], "release": best})
print("DONE")

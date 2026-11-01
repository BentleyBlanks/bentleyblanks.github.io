# BandageKneel「跪着给伤员包扎」 (Claude, 2026-11-01)
#
# 这是什么：双膝跪姿，伤员仰躺在面前的地上，要包的是他一条手臂（上臂，一段直径约 10 cm 的肢体）。
#   抗战时的急救：没有心肺复苏，就是裹伤布/绷带缠绕。两手配合缠绕：右手拿着绷带卷，从近侧经肢体上方把卷送到远侧，
#   左手在远侧下方接住，沿肢体下方拉回近侧，再交还右手——每圈 1.0 s 上下；缠 3 圈，随后两手向外拉紧一次（各 7 cm），
#   回到起手姿势，可循环。头低着看伤处，上身前倾。预览里没有伤员和绷带，只有人；绷带卷当成直径约 5 cm 的圆柱握在手里。
#
# 改自：Animation_Mixamo_KneelingIdle_V1（双膝跪姿待机）。建议的 KneelingInspecting_V1 是单膝跪、左膝立在身前、
#   躯干扭向右前、左手举在头前，伤员的肢体放在身前时左膝正好挡在手臂要伸过去的路上，所以换成双膝跪（身前什么都没有）。
#   只取原件第 1 帧的姿势铺满整条（呼吸起伏压平），再改：髋后坐前倾、躯干前倾、双臂 IK、手指、头颈。
#
# 假定的伤员肢体（世界坐标，Blender Z 朝上，米，人脸朝 -Y，人的右 = -X）：
#   轴线沿 X 方向，经过点 (0, AXIS_Y, AXIS_Z)，半径 5.0 cm（直径 10 cm），X 范围约 -0.20 ~ +0.20 m；
#   AXIS_Y / AXIS_Z 见下方常量（距两膝连线的前方距离 / 离地高度）。
#
# 做法：
#   * 髋：沿大腿绕膝转，髋往后坐一点、下沉；骨盆前倾；两条腿用 IK 钉在原件的膝和踝上（膝、脚不动），脚的朝向随小腿不变。
#   * 躯干：骨盆前倾 + 三节脊柱前倾，总前倾约 LEAN 度；绕圈时随手的节奏小幅俯仰/侧移，拉紧时再多压低几度。
#   * 手：每只手掌心在垂直于肢体的平面里走一段椭圆弧，掌心到轴线 8–11 cm；手向（四指方向）跟着前臂走再往肢体弯一点，
#     下方那只手四指放平朝远侧（手掌朝上从肢体下面伸过去）。IK 每帧一个关键帧，手朝向用 COPY_ROTATION。
#   * 手指：握卷 <-> 张开，用 6 帧缓入缓出，逐帧写。
#   * 头：每帧朝伤处，颈 40% 头 60%。
#
# 关键帧时间表（秒，30 fps，帧号 = 1 + 秒 * 30；整条 3.6 s = 109 帧，首尾相同，loop: true）：
#   第 1 圈 0.00-1.00  第 2 圈 1.00-2.05  第 3 圈 2.05-3.00（三圈长度略不同，不机械）
#   每圈内（u = 圈内进度）：0.00-0.42 右手拿卷从近侧上方送到远侧，左手（空手）同时往远侧下方探；
#     0.42-0.52 远侧交接（左手先握住，右手后松）；0.52-0.95 左手沿下方把卷拉回近侧，右手（空手）抬高弧线回近侧；
#     0.95-1.00 近侧交接（右手先握，左手后松）。
#   3.00-3.60 拉紧：右手向右外拉 7 cm、左手向左外拉 7 cm（左手晚 0.08 s），回位；3.60 = 第 0 帧。
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Quaternion, Vector, Matrix, Euler

bpy = K.bpy
NAME = "BandageKneel"
BASE = "Animation_Mixamo_KneelingIdle_V1"
FPS = 30
LOOP_FRAMES = 108
END = 1 + LOOP_FRAMES                      # 109
T_LOOP = LOOP_FRAMES / FPS                 # 3.6 s

# ------------------------------------------------------------------ 可调参数
AXIS_Y, AXIS_Z, LIMB_R = -0.205, 0.32, 0.050   # 肢体轴线（沿 X）
HAND_X = {"Right": -0.075, "Left": 0.075}     # 两手沿肢体方向相距 15 cm
PULL = 0.055
BETA = 55.0            # 大腿绕膝后摆角（髋后坐）
PELVIS_PITCH = 21.0    # 骨盆前倾
SPINE_LEAN = (10.0, 10.0, 8.0)   # Spine, Spine1, Spine2 前倾
WRAP = [(0.0, 1.0), (1.0, 1.0), (2.0, 1.0)]
R_A = [0.113, 0.115, 0.111]
RC = [0.121, 0.123, 0.119]        # 拿卷时掌心到轴线的距离（每圈略不同）
R_B = [0.087, 0.085, 0.089]
PHI_FAR_A = [172.0, 175.0, 170.0]
PHI_NEAR_A, PHI_NEAR_B, PHI_FAR_B = 8.0, 352.0, 188.0
CLEAR_FINGER = 0.03
RZ_B = 0.108           # 下方那只手掌心在轴线下方的高度差（米）
TILT = 0.0
POLE_Z = 0.05         # 肘尖参考点比肩低多少（让前臂更接近水平，减小腕弯折）
SMOOTH_PASSES = 3
ZB = 0.72              # 下方那只手在轴线下方的纵向半径系数
THUMB_SIGN_R = -1.0
THUMB_SIGN_L = -1.0
TOP_R, TOP_L = 0.10, 0.25    # 握卷时手指卷曲上限（右 / 左）
FIN_CAP = 0.3          # 四指方向朝轴线的分量上限（防止手指戳进肢体）
if os.environ.get("BK_TUNE"):          # 调参用：BK_TUNE="AXIS_Y=-0.4,BETA=45,..."
    for kv in os.environ["BK_TUNE"].split(";"):
        k_, v_ = kv.split("=")
        globals()[k_] = tuple(float(x) for x in v_.split(",")) if "," in v_ else float(v_)

arm = K.LoadBase(BASE)
scene = bpy.context.scene
LAST = scene.frame_end
print("[BandageKneel] armature matrix_world", arm.matrix_world)


def Smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def Env(keys, x):
    if x <= keys[0][0]:
        return keys[0][1]
    for (xa, va), (xb, vb) in zip(keys, keys[1:]):
        if x <= xb:
            return va + (vb - va) * Smooth((x - xa) / (xb - xa))
    return keys[-1][1]


def EnvL(keys, x):
    """和 Env 一样，但段内是「线性 + 平滑」的各一半：中段速度只有平滑插值的 0.83 倍，端点仍然缓入缓出。"""
    if x <= keys[0][0]:
        return keys[0][1]
    for (xa, va), (xb, vb) in zip(keys, keys[1:]):
        if x <= xb:
            t = (x - xa) / (xb - xa)
            return va + (vb - va) * 0.5 * (t + Smooth(t))
    return keys[-1][1]


def R3(m):
    return m.to_quaternion().to_matrix()


MROT0 = arm.matrix_world.to_quaternion().to_matrix()


def SetWorld(pb, rot_world, pos_world):
    """按世界旋转（3x3，单位旋转）和世界位置（米）摆一根骨头（armature 有 0.01 缩放，不能直接乘 matrix_world）。"""
    m = (MROT0.inverted() @ rot_world).to_4x4()
    m.translation = arm.matrix_world.inverted() @ pos_world
    pb.matrix = m
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ 1. 铺满第 1 帧
def FreezeFrame1():
    K.At(1)
    pose = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones}
    for f in range(scene.frame_start, LAST + 1):
        for pb in arm.pose.bones:
            q, loc = pose[pb.name]
            pb.rotation_quaternion = q
            pb.location = loc
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)


FreezeFrame1()
K.ExtendTo(arm, END)
FR = list(range(1, END + 1))

K.At(1)
BASE_Q = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
ANKLE = {s: K.BoneHead(arm, f"{s}Foot") for s in ("Left", "Right")}
FOOT_R0 = {s: R3(K.BoneMatrix(arm, f"{s}Foot")) for s in ("Left", "Right")}
TOE0 = {s: K.BoneHead(arm, f"{s}ToeBase") for s in ("Left", "Right")}
KNEE = {s: K.BoneHead(arm, f"{s}Leg") for s in ("Left", "Right")}
HIPJ = {s: K.BoneHead(arm, f"{s}UpLeg") for s in ("Left", "Right")}
HIP_M0 = K.BoneMatrix(arm, "Hips")
FWD_LOC = {b: R3(K.BoneMatrix(arm, b)).inverted() @ Vector((0, -1, 0)) for b in ("Neck", "Head")}
THIGH = (HIPJ["Left"] - KNEE["Left"]).length
DXL = abs(HIPJ["Left"].x - KNEE["Left"].x)
LYZ = math.sqrt(THIGH ** 2 - DXL ** 2)
print(f"[BandageKneel] thigh {THIGH:.3f} in-plane {LYZ:.3f} knees {KNEE['Left']} ankles {ANKLE['Left']}")
SHANK = (KNEE["Left"] - ANKLE["Left"]).length

# ------------------------------------------------------------------ 2. 髋：绕膝后坐 + 前倾，腿 IK 钉住膝踝
kmid = (KNEE["Left"] + KNEE["Right"]) * 0.5
jmid0 = (HIPJ["Left"] + HIPJ["Right"]) * 0.5
off_loc = R3(HIP_M0).inverted() @ (jmid0 - HIP_M0.translation)      # 髋关节中点在髋骨局部（世界朝向系，米）
b = math.radians(BETA)
R_new = Matrix.Rotation(math.radians(PELVIS_PITCH), 3, "X") @ R3(HIP_M0)
hips = arm.pose.bones["Hips"]


def SetHips(delta):
    M_target = Vector((jmid0.x + delta[0], kmid.y + LYZ * math.sin(b) + delta[1], kmid.z + LYZ * math.cos(b) + delta[2]))
    H_pos = M_target - R_new @ Vector(off_loc)
    K.At(1)
    for _ in range(3):
        SetWorld(hips, R_new, H_pos)
        jm = (K.BoneHead(arm, "LeftUpLeg") + K.BoneHead(arm, "RightUpLeg")) * 0.5
        H_pos = H_pos + (M_target - jm)
    SetWorld(hips, R_new, H_pos)


def LegIk(side, at=True):
    tgt = K._Empty(f"LegT_{side}", ANKLE[side])
    pole = K._Empty(f"LegP_{side}", KNEE[side])
    leg = arm.pose.bones[f"{side}Leg"]
    ik = leg.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = tgt, 2, pole
    if at:
        K.At(1)

    def err_at(ang):
        ik.pole_angle = math.radians(ang)
        bpy.context.view_layer.update()
        return (K.BoneHead(arm, f"{side}Leg") - KNEE[side]).length
    best = min(((err_at(a), a) for a in range(-180, 180, 15)))
    step = 7.5
    while step > 0.1:
        for a in (best[1] - step, best[1] + step):
            e = err_at(a)
            if e < best[0]:
                best = (e, a)
        step /= 2
    print(f"[BandageKneel] leg IK {side} pole_angle {best[1]:.2f} knee err {best[0]*100:.2f} cm")
    ik.pole_angle = math.radians(best[1])
    return tgt, pole


def LegProbe():
    objs_ = [LegIk(s_, at=False) for s_ in ("Left", "Right")]
    errs = [(K.BoneHead(arm, f"{s_}Leg") - KNEE[s_]).length for s_ in ("Left", "Right")]
    for s_, (t_, p_) in zip(("Left", "Right"), objs_):
        arm.pose.bones[f"{s_}Leg"].constraints.remove(arm.pose.bones[f"{s_}Leg"].constraints[0])
        bpy.data.objects.remove(t_, do_unlink=True)
        bpy.data.objects.remove(p_, do_unlink=True)
    return max(errs)


def Cost(d):
    SetHips(d)
    return LegProbe()


bestd, bestc, step = [0.0, 0.0, 0.0], None, 0.01
bestc = Cost(bestd)
while step > 0.0004:
    improved = False
    for k_ in range(3):
        for sg in (1, -1):
            d = list(bestd)
            d[k_] += sg * step
            c = Cost(d)
            if c < bestc - 1e-5:
                bestc, bestd, improved = c, d, True
    if not improved:
        step /= 2
print(f"[BandageKneel] hips offset {[round(v*100,2) for v in bestd]} cm -> knee err {bestc*100:.2f} cm")
SetHips(bestd)
hq, hl = hips.rotation_quaternion.copy(), hips.location.copy()
for f in FR:
    hips.rotation_quaternion, hips.location = hq, hl
    hips.keyframe_insert("rotation_quaternion", frame=f)
    hips.keyframe_insert("location", frame=f)
objs = [LegIk(s_) for s_ in ("Left", "Right")]
K._BakeBones(arm, ["LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg"], 1, END)
for t, p in objs:
    bpy.data.objects.remove(t, do_unlink=True)
    bpy.data.objects.remove(p, do_unlink=True)
K.At(1)
for s_ in ("Left", "Right"):       # 脚的世界朝向钉回原件（小腿方向有零点几度的差，会让脚尖挪 1-2 cm）
    fb = arm.pose.bones[f"{s_}Foot"]
    SetWorld(fb, FOOT_R0[s_], K.BoneHead(arm, f"{s_}Foot"))
    q_ = fb.rotation_quaternion.copy()
    for f_ in FR:
        fb.rotation_quaternion = q_
        fb.keyframe_insert("rotation_quaternion", frame=f_)
K.At(1)
for s in ("Left", "Right"):
    print(f"[BandageKneel] after leg IK {s}: knee {(K.BoneHead(arm, s+'Leg') - KNEE[s]).length*100:.2f} cm ankle {(K.BoneHead(arm, s+'Foot') - ANKLE[s]).length*100:.2f} cm")

# ------------------------------------------------------------------ 3. 时间函数
def Wrap(t):
    for k, (t0, T) in enumerate(WRAP):
        if t < t0 + T - 1e-9:
            return k, (t - t0) / T
    return None, None


def PhiA(k, u):
    far = PHI_FAR_A[k]
    return EnvL([(0.0, PHI_NEAR_A), (0.42, far), (0.52, far - 2.0), (0.95, PHI_NEAR_A), (1.0, PHI_NEAR_A)], u)


def PhiB(k, u):
    far = PHI_FAR_B
    return EnvL([(0.0, PHI_NEAR_B), (0.04, PHI_NEAR_B), (0.42, far), (0.52, far + 2.0), (0.95, PHI_NEAR_B), (1.0, PHI_NEAR_B)], u)


G_CARRY, G_EMPTY = 0.62, 0.35     # 拿卷的手：四指卷曲 0.62；空手半握 0.35


def GripA(u):     # 握<->半握的过渡每次 >= 0.17 圈（约 5 帧），先握后松
    return Env([(0.0, G_CARRY), (0.42, G_CARRY), (0.60, G_EMPTY), (0.78, G_EMPTY), (0.95, G_CARRY), (1.0, G_CARRY)], u)


def GripB(u):
    return Env([(0.0, G_CARRY), (0.10, G_CARRY), (0.27, G_EMPTY), (0.30, G_EMPTY), (0.46, G_CARRY), (1.0, G_CARRY)], u)


def PullEnv(side, tau):
    if side == "Right":
        return Env([(0, 0), (0.16, 1), (0.24, 1), (0.50, 0), (0.6, 0)], tau)
    return Env([(0, 0), (0.08, 0), (0.24, 1), (0.32, 1), (0.58, 0), (0.6, 0)], tau)


def Hand(side, t):
    """(palm world, grip 0..1, pull 0..1)"""
    t = t % T_LOOP
    k, u = Wrap(t)
    pull = 0.0
    if k is None:
        k, u = len(WRAP) - 1, 1.0
        pull = PullEnv(side, t - 3.0)
    if side == "Right":
        phi, grip = PhiA(k, u), GripA(u)
    else:
        phi, grip = PhiB(k, u), GripB(u)
    e_ = (grip - G_EMPTY) / (G_CARRY - G_EMPTY)
    r = RC[k] - 0.020 * (1.0 - e_)          # 拿卷：掌心到轴线 12 cm 左右（肢体半径 5 + 卷直径 5 + 手掌厚）；空手 10 cm 左右
    if pull > 0:
        r -= 0.004 * pull
        grip = G_CARRY + 0.02 * pull
    ph = math.radians(phi)
    cy = math.cos(ph)
    y = AXIS_Y + r * cy
    z = AXIS_Z + r * math.sin(ph) * (ZB if (side == "Left" and math.sin(ph) < 0) else 1.0)
    x = HAND_X[side] + (-1 if side == "Right" else 1) * PULL * pull
    return Vector((x, y, z)), grip, pull


# ------------------------------------------------------------------ 4. 躯干
def Lean(t):
    """相对基本前倾的增量（度）：拉紧时压低，每圈远侧交接时探出去一点。"""
    t = t % T_LOOP
    k, u = Wrap(t)
    if k is None:
        return 1.0 * max(PullEnv("Right", t - 3.0), PullEnv("Left", t - 3.0))
    return 0.8 * Env([(0, 0), (0.45, 1), (0.95, 0)], u)


def Sway(t):
    """躯干侧移（绕 Y 扭，度）：朝着正在送卷的右手那边一点。"""
    t = t % T_LOOP
    k, u = Wrap(t)
    if k is None:
        return 0.0
    return 3.0 * Env([(0, 0), (0.42, 1), (0.52, 1), (0.95, 0), (1, 0)], u)


for f in FR:
    t = (f - 1) / FPS
    ln, sw = Lean(t), Sway(t)
    for i, bn in enumerate(("Spine", "Spine1", "Spine2")):
        w = (SPINE_LEAN[i] + ln * (SPINE_LEAN[i] / sum(SPINE_LEAN)))
        q = BASE_Q[bn] @ Quaternion((1, 0, 0), math.radians(w)) @ Quaternion((0, 1, 0), math.radians(sw / 3.0))
        arm.pose.bones[bn].rotation_quaternion = q
        arm.pose.bones[bn].keyframe_insert("rotation_quaternion", frame=f)

K.At(1)
for bn in ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"):
    print("[BandageKneel] dbg", bn, tuple(round(v, 3) for v in K.BoneHead(arm, bn)))
_s2 = R3(K.BoneMatrix(arm, "Spine2")) @ Vector((0, 1, 0))
print(f"[BandageKneel] Spine2 axis lean from vertical {math.degrees(math.acos(max(-1,min(1,_s2.z)))):.1f} deg; spine self flexion {sum(SPINE_LEAN):.0f} deg")
print("[BandageKneel] after lean: Head", K.BoneHead(arm, "Head"), "shoulders", K.BoneHead(arm, "LeftArm"), K.BoneHead(arm, "RightArm"))

# 肩（锁骨）往前送一点，增加够远的余量：对每个方向试 ±，选让上臂根最往前（-Y）移动的那个
SHOULDER_PROTRACT = 18.0
K.At(1)
for side in ("Left", "Right"):
    pb = arm.pose.bones[f"{side}Shoulder"]
    base_q_ = pb.rotation_quaternion.copy()
    ref = K.BoneHead(arm, f"{side}Arm")
    best = None
    for ax in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
        for sg in (1, -1):
            pb.rotation_quaternion = base_q_ @ Quaternion(ax, math.radians(SHOULDER_PROTRACT * sg))
            bpy.context.view_layer.update()
            d_ = K.BoneHead(arm, f"{side}Arm") - ref
            if best is None or d_.y < best[0]:
                best = (d_.y, ax, sg, d_)
    pb.rotation_quaternion = base_q_
    bpy.context.view_layer.update()
    print(f"[BandageKneel] {side} shoulder protract axis {best[1]} sign {best[2]} moves arm root {tuple(round(v*100,1) for v in best[3])} cm")
    for f_ in FR:
        pb.rotation_quaternion = base_q_ @ Quaternion(best[1], math.radians(SHOULDER_PROTRACT * best[2]))
        pb.keyframe_insert("rotation_quaternion", frame=f_)

# ------------------------------------------------------------------ 5. 手的本地基底
FINGER_NAMES = ("Index", "Middle", "Ring", "Pinky")
MAXDEG = (55, 80, 60)
INFO = {}
K.At(1)
for side in ("Right", "Left"):
    Rm = R3(K.BoneMatrix(arm, f"{side}Hand"))
    inv = Rm.inverted()
    wrist = K.BoneHead(arm, f"{side}Hand")
    fL = (inv @ (K.BoneHead(arm, f"{side}HandMiddle1") - wrist)).normalized()
    po = inv @ (K.Palm(arm, side) - wrist)
    # 弯曲符号 + 掌心法线：弯曲后食指尖朝掌心走的方向
    pbs = arm.pose.bones
    straight = inv @ (K.BoneHead(arm, f"{side}HandIndex4") - wrist)
    best = None
    for sgn in (1, -1):
        for i in range(3):
            pbs[f"{side}HandIndex{i+1}"].rotation_quaternion = Quaternion((sgn, 0, 0), math.radians(MAXDEG[i]))
        bpy.context.view_layer.update()
        tip = inv @ (K.BoneHead(arm, f"{side}HandIndex4") - wrist)
        d = (tip - po).length
        if best is None or d < best[0]:
            best = (d, sgn, tip - straight)
    for i in range(3):
        pbs[f"{side}HandIndex{i+1}"].rotation_quaternion = BASE_Q[f"{side}HandIndex{i+1}"]
    bpy.context.view_layer.update()
    disp = best[2]
    nL = (disp - fL * disp.dot(fL)).normalized()
    INFO[side] = dict(fL=fL, nL=nL, po=po, sgn=best[1])
    print(f"[BandageKneel] {side} hand fL {tuple(round(v,2) for v in fL)} nL {tuple(round(v,2) for v in nL)} curl sign {best[1]} palm off {po.length:.3f}")


def Basis(a, b_):
    a = a.normalized()
    b_ = (b_ - a * a.dot(b_)).normalized()
    return Matrix((a, b_, a.cross(b_))).transposed()


def HandQuat(side, f, n):
    i = INFO[side]
    return (Basis(f, n) @ Basis(i["fL"], i["nL"]).inverted()).to_quaternion()


def HandOrient(side, palm, shoulder, grip):
    axis_pt = Vector((palm.x, AXIS_Y, AXIS_Z))
    rad_in = (axis_pt - palm).normalized()
    f0 = (palm - shoulder).normalized()
    a = f0.dot(rad_in)                                   # f0 朝轴线的分量，封顶 FIN_CAP（平滑）
    x_ = FIN_CAP - a
    a2 = FIN_CAP - 0.5 * (x_ + math.sqrt(x_ * x_ + 0.01))
    # 四指的「横向」方向 û：沿圆周切线（不会戳向轴线），切线朝向在 φ 的两个区间里相反，中间过渡时四指转成平行于肢体（-X/+X）
    phi = math.degrees(math.atan2(palm.z - AXIS_Z, palm.y - AXIS_Y))
    t_hat = Vector((0.0, -math.sin(math.radians(phi)), math.cos(math.radians(phi))))      # 世界 (x, y, z)：φ 增大的切线方向
    x_out = Vector((-1.0 if side == "Right" else 1.0, 0.0, 0.0))
    if side == "Right":     # φ 范围约 -15..195：近侧四指朝下（-t），上方/远侧朝前（+t）
        ph_ = (phi + 90.0) % 360.0 - 90.0
        s_ = 2.0 * Smooth((ph_ - 5.0) / 70.0) - 1.0
    else:                   # φ 范围约 165..375：远侧四指朝下（+t），下方/近侧朝前（-t）
        ph_ = phi % 360.0
        if ph_ < 90.0:
            ph_ += 360.0
        s_ = 1.0 - 2.0 * Smooth((ph_ - 195.0) / 70.0)
    u_ = (t_hat * s_ + x_out * math.sqrt(max(0.0, 1.0 - s_ * s_)))
    u_ = (u_ - rad_in * u_.dot(rad_in)).normalized()
    f = (rad_in * a2 + u_ * math.sqrt(max(0.0, 1.0 - a2 * a2))).normalized()
    w = max(0.0, min(1.0, (0.13 - palm.z) / 0.07))
    f_flat = Vector((0.0, -1.0, 0.05)).normalized()
    f = (f * (1 - w) + f_flat * w).normalized()
    zmin = -(palm.z - CLEAR_FINGER - 0.015) / 0.10
    if f.z < zmin:
        f.z = zmin
        f.normalize()
    # 掌心法线：拇指方向固定（右手拇指朝人的右、左手朝人的左，即 -X / +X 的世界方向，右手 t=-X 左手 t=+X），
    # 这样 n 随 f 连续变化，不会翻。右手（上方）掌心朝运动方向偏上，左手（下方）掌心朝上。
    if side == "Right":
        n = Vector((-1.0, 0.0, 0.0)).cross(f) * THUMB_SIGN_R
    else:
        n = f.cross(Vector((1.0, 0.0, 0.0))) * THUMB_SIGN_L
    n.normalize()
    return f, n


# ------------------------------------------------------------------ 6. 双臂 IK
def ArmIkAuto(side, keys, rot_keys, pole, probe_frame):
    """K.ArmIk 的变体：先在 probe_frame 试几个 pole_angle，挑肘最靠近 pole 的。"""
    tgt = K._Empty(f"IKp_{side}")
    tgt.rotation_mode = "QUATERNION"
    fr, pos = keys[probe_frame]
    tgt.location = pos
    tgt.rotation_quaternion = rot_keys[probe_frame][1]
    pole_obj = K._Empty(f"PoleP_{side}", pole)
    fore = arm.pose.bones[f"{side}ForeArm"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = tgt, 2, pole_obj
    rot = arm.pose.bones[f"{side}Hand"].constraints.new("COPY_ROTATION")
    rot.target = tgt
    best = None
    K.At(fr)
    for ang in (0, 90, 180, -90):
        ik.pole_angle = math.radians(ang)
        bpy.context.view_layer.update()
        e = K.BoneHead(arm, f"{side}ForeArm")
        d = (e - pole).length
        print(f"[BandageKneel] {side} arm pole_angle {ang}: elbow {tuple(round(v,3) for v in e)} d_pole {d:.3f}")
        if best is None or d < best[0]:
            best = (d, ang)
    fore.constraints.remove(ik)
    arm.pose.bones[f"{side}Hand"].constraints.remove(rot)
    bpy.data.objects.remove(tgt, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)
    print(f"[BandageKneel] {side} arm pole_angle -> {best[1]}")
    K.ArmIk(arm, side, keys, window=(1, END), pole=pole, rotation_keys=rot_keys, pole_angle_deg=best[1])


# 每帧的目标
import numpy as np

TARGET = {"Right": [], "Left": []}
ROT = {"Right": [], "Left": []}
GRIP = {"Right": {}, "Left": {}}
PALMS = {"Right": [], "Left": []}
SHOULD = {"Right": [], "Left": []}
for f in FR:
    t = (f - 1) / FPS
    K.At(f)
    for side in ("Right", "Left"):
        palm, grip, pull = Hand(side, t)
        PALMS[side].append(palm)
        SHOULD[side].append(K.BoneHead(arm, f"{side}Arm"))
        GRIP[side][f] = grip
        GRIP[side][("palm", f)] = palm

# 手朝向：掌心始终朝向肢体轴线（法线 n 取径向，随绕圈的角度转），四指方向 f 在垂直于径向的圆上选（再允许 +-40 度外倾），
# 每帧在候选里用动态规划选：腕弯折小、相邻帧朝向变化 <= 24 度、首尾同一姿势。
NPSI = 72
DELTAS = (-60.0, -45.0, -30.0, -15.0, 0.0, 15.0, 30.0)
NCAND = NPSI * len(DELTAS)
AX = np.array([AXIS_Y, AXIS_Z])


def FrameCands(side, palm):
    p = np.array(palm)
    rad_in = np.array([0.0, AX[0] - p[1], AX[1] - p[2]])
    rad_in /= np.linalg.norm(rad_in)
    e1 = np.array([1.0, 0.0, 0.0])
    e2 = np.cross(rad_in, e1)
    F, N = [], []
    for dl in DELTAS:
        d = math.radians(dl)
        for j in range(NPSI):
            ps = 2 * math.pi * j / NPSI
            g = math.cos(ps) * e1 + math.sin(ps) * e2
            F.append(math.cos(d) * g + math.sin(d) * rad_in)
            N.append(math.cos(d) * rad_in - math.sin(d) * g)
    return np.array(F), np.array(N), rad_in


def CandQuats(side, F, N):
    i_ = INFO[side]
    Bl = Basis(i_["fL"], i_["nL"]).inverted()
    out = []
    for f_, n_ in zip(F, N):
        c_ = np.cross(f_, n_)
        Bw = Matrix(((f_[0], n_[0], c_[0]), (f_[1], n_[1], c_[1]), (f_[2], n_[2], c_[2])))
        q = (Bw @ Bl).to_quaternion()
        out.append((q.w, q.x, q.y, q.z))
    return np.array(out)


def SolveOrient(side):
    n = len(FR)
    Fs, Ns, Qs, Us = [], [], [], []
    for i in range(n):
        F, N, rin = FrameCands(side, PALMS[side][i])
        sh_ = np.array(SHOULD[side][i])
        pm_ = np.array(PALMS[side][i])
        sg_ = -1.0 if side == "Right" else 1.0
        elbow_est = sh_ + np.array([sg_ * 0.16, 0.35 * (pm_[1] - sh_[1]) + 0.02, -0.21])      # 实测的肘位：在肩外侧约 16 cm、低约 21 cm
        f0 = pm_ - elbow_est                                                             # 前臂方向估计
        f0 /= np.linalg.norm(f0)
        ang = np.degrees(np.arccos(np.clip(F @ f0, -1, 1)))
        cost = ang ** 2 * 0.035 + 0.8 * (1 - N @ rin)
        tipc = np.array(PALMS[side][i])[None, :] + F * 0.07 + N * 0.085          # 握拳后指尖的估计位置（卷曲 0.6：指尖朝掌心法线方向弯进约 8 cm）
        viol = np.maximum(0.0, 0.070 - np.hypot(tipc[:, 1] - AX[0], tipc[:, 2] - AX[1]))
        cost = cost + 1.2e5 * viol ** 2
        cost = np.where(ang > 100.0, cost + 1e4, cost)
        tip = np.array(PALMS[side][i])[None, :] + F * 0.14
        cost = np.where(tip[:, 2] < 0.04, cost + 1e4, cost)
        Fs.append(F); Ns.append(N); Qs.append(CandQuats(side, F, N)); Us.append(cost)
    T = []
    for i in range(n - 1):
        dots = np.abs(Qs[i] @ Qs[i + 1].T)
        ang = np.degrees(2 * np.arccos(np.clip(dots, 0, 1)))
        T.append(np.where(ang <= 24.0, (ang / 12.0) ** 2 * 3.0, 1e4))
    best_all = None
    start_costs = Us[0] + Us[-1]
    for s0 in np.argsort(start_costs)[:40]:
        cost = np.full(NCAND, 1e9)
        cost[s0] = Us[0][s0]
        back = np.zeros((n, NCAND), int)
        for i in range(1, n):
            tot = cost[:, None] + T[i - 1]
            back[i] = np.argmin(tot, axis=0)
            cost = tot[back[i], np.arange(NCAND)] + Us[i]
        endc = cost[s0]
        if best_all is None or endc < best_all[0]:
            path, j = [s0], s0
            for i in range(n - 1, 0, -1):
                j = back[i][j]
                path.append(j)
            best_all = (endc, path[::-1])
    print(f"[BandageKneel] {side} orientation DP cost {best_all[0]:.2f}")
    return [Qs[i][j] for i, j in enumerate(best_all[1])]


for side in ("Right", "Left"):
    qarr = SolveOrient(side)
    qlist = []
    for qa in qarr:
        q = Quaternion((float(qa[0]), float(qa[1]), float(qa[2]), float(qa[3])))
        if qlist and qlist[-1].dot(q) < 0:
            q = Quaternion((-q.w, -q.x, -q.y, -q.z))
        qlist.append(q)
    nloop = len(qlist) - 1
    for _ in range(SMOOTH_PASSES):
        new_q = []
        for i in range(nloop):
            a_, b_, c_ = qlist[(i - 1) % nloop], qlist[i], qlist[(i + 1) % nloop]
            if a_.dot(b_) < 0:
                a_ = Quaternion((-a_.w, -a_.x, -a_.y, -a_.z))
            if c_.dot(b_) < 0:
                c_ = Quaternion((-c_.w, -c_.x, -c_.y, -c_.z))
            m_ = Quaternion((a_.w + 2 * b_.w + c_.w, a_.x + 2 * b_.x + c_.x, a_.y + 2 * b_.y + c_.y, a_.z + 2 * b_.z + c_.z))
            m_.normalize()
            new_q.append(m_)
        qlist = new_q + [new_q[0]]
    for i, f in enumerate(FR):
        q = qlist[i]
        if ROT[side] and ROT[side][-1][1].dot(q) < 0:
            q = Quaternion((-q.w, -q.x, -q.y, -q.z))
        TARGET[side].append((f, PALMS[side][i] - q.to_matrix() @ INFO[side]["po"]))
        ROT[side].append((f, q))

for side in ("Right", "Left"):
    big = []
    for (f1, q1), (f2, q2) in zip(ROT[side], ROT[side][1:]):
        a_ = math.degrees(q1.rotation_difference(q2).angle)
        if a_ > 12:
            big.append((f2, round(a_, 1)))
    print(f"[BandageKneel] {side} target rot steps >12 deg: {big}")
K.At(1)
poles = {}
for side in ("Right", "Left"):
    sh = K.BoneHead(arm, f"{side}Arm")
    sgn = -1 if side == "Right" else 1
    poles[side] = sh + Vector((0.32 * sgn, 0.30, POLE_Z))
    ArmIkAuto(side, TARGET[side], ROT[side], poles[side], 30)

# 臂在接近伸直时 IK 的肘角会有尖峰：对上臂/前臂的烘焙旋转做一次周期 [1,2,1] 平滑（腕位置变化 < 1 cm）
SM_BONES = [f"{sd}{b_}" for sd in ("Left", "Right") for b_ in ("Arm", "ForeArm")]
saved = {b_: [] for b_ in SM_BONES}
for f_ in FR:
    K.At(f_)
    for b_ in SM_BONES:
        saved[b_].append(arm.pose.bones[b_].rotation_quaternion.copy())
nl_ = len(FR) - 1
for b_ in SM_BONES:
    qs_ = saved[b_]
    out_ = []
    for i in range(nl_):
        a_, m_, c_ = qs_[(i - 1) % nl_], qs_[i], qs_[(i + 1) % nl_]
        if a_.dot(m_) < 0:
            a_ = Quaternion((-a_.w, -a_.x, -a_.y, -a_.z))
        if c_.dot(m_) < 0:
            c_ = Quaternion((-c_.w, -c_.x, -c_.y, -c_.z))
        q_ = Quaternion((a_.w + 2 * m_.w + c_.w, a_.x + 2 * m_.x + c_.x, a_.y + 2 * m_.y + c_.y, a_.z + 2 * m_.z + c_.z))
        q_.normalize()
        out_.append(q_)
    out_.append(out_[0])
    for f_, q_ in zip(FR, out_):
        arm.pose.bones[b_].rotation_quaternion = q_
        arm.pose.bones[b_].keyframe_insert("rotation_quaternion", frame=f_)

# ------------------------------------------------------------------ 7. 手指（逐帧，握 <-> 张 6 帧缓入缓出已在 Grip 函数里）
OPEN_AMT, FIST = 0.18, 1.0


def FistQuat(side, i, amt):
    return Quaternion((INFO[side]["sgn"], 0, 0), math.radians(MAXDEG[i] * amt))


def FindThumb(side, grip_amt):
    """握卷姿势下找拇指关节欧拉角，使指尖落在食指末节旁（手本地坐标）。"""
    K.At(1)
    pbs = arm.pose.bones
    for fn, mult in zip(FINGER_NAMES, (0.95, 1.0, 1.05, 1.1)):
        for i in range(3):
            pbs[f"{side}Hand{fn}{i+1}"].rotation_quaternion = FistQuat(side, i, grip_amt * mult)
    bpy.context.view_layer.update()
    Rm = R3(K.BoneMatrix(arm, f"{side}Hand"))
    inv = Rm.inverted()
    palm = K.Palm(arm, side)
    i3 = inv @ (K.BoneHead(arm, f"{side}HandIndex3") - palm)
    i4 = inv @ (K.BoneHead(arm, f"{side}HandIndex4") - palm)
    target = (i3 + i4) * 0.5 + INFO[side]["nL"] * 0.012

    def cost(p):
        for i in range(3):
            pbs[f"{side}HandThumb{i+1}"].rotation_quaternion = Euler(tuple(math.radians(v) for v in p[3 * i:3 * i + 3]), "XYZ").to_quaternion()
        bpy.context.view_layer.update()
        pal = K.Palm(arm, side)
        tip = Rm.inverted() @ (K.BoneHead(arm, f"{side}HandThumb4") - pal)
        return (tip - target).length + sum(v * v for v in p) * 1e-7
    p = [0.0] * 9
    bestc, step = cost(p), 20.0
    while step > 0.5:
        improved = False
        for k_ in range(9):
            for sg in (1, -1):
                q_ = list(p)
                q_[k_] += sg * step
                if abs(q_[k_]) > 65:
                    continue
                c = cost(q_)
                if c < bestc - 1e-6:
                    bestc, p, improved = c, q_, True
        if not improved:
            step /= 2
    print(f"[BandageKneel] {side} thumb euler {[round(v,1) for v in p]} residual {bestc*100:.2f} cm")
    for fn in FINGER_NAMES:
        for i in range(3):
            pbs[f"{side}Hand{fn}{i+1}"].rotation_quaternion = BASE_Q[f"{side}Hand{fn}{i+1}"]
    for i in range(3):
        pbs[f"{side}HandThumb{i+1}"].rotation_quaternion = BASE_Q[f"{side}HandThumb{i+1}"]
    bpy.context.view_layer.update()
    return [Euler(tuple(math.radians(v) for v in p[3 * i:3 * i + 3]), "XYZ").to_quaternion() for i in range(3)]


THUMB = {s: FindThumb(s, G_CARRY) for s in ("Right", "Left")}
for f in FR:
    for side in ("Right", "Left"):
        g = GRIP[side][f]
        e = max(0.0, min(1.0, (g - G_EMPTY) / (G_CARRY - G_EMPTY)))      # 0 半握 .. 1 握卷
        for fn, mult in zip(FINGER_NAMES, (0.95, 1.0, 1.05, 1.1)):
            for i in range(3):
                pb = arm.pose.bones[f"{side}Hand{fn}{i+1}"]
                pb.rotation_quaternion = FistQuat(side, i, g * mult)
                pb.keyframe_insert("rotation_quaternion", frame=f)
        for i in range(3):
            pb = arm.pose.bones[f"{side}HandThumb{i+1}"]
            pb.rotation_quaternion = Quaternion().slerp(THUMB[side][i], 0.45 + 0.55 * e)
            pb.keyframe_insert("rotation_quaternion", frame=f)

# ------------------------------------------------------------------ 8. 头颈：朝伤处看
for f in FR:
    t = (f - 1) / FPS
    K.At(f)
    pa, pb_ = GRIP["Right"][("palm", f)], GRIP["Left"][("palm", f)]
    gaze = Vector((0.15 * (pa.x + pb_.x), AXIS_Y, AXIS_Z)) + Vector((0, 0, 0.03))
    for bone, frac in (("Neck", 0.4), ("Head", 0.6)):
        pbone = arm.pose.bones[bone]
        Rm = R3(K.BoneMatrix(arm, bone))
        eye = K.BoneHead(arm, "Head") + Vector((0, 0, 0.06))
        d = (gaze - eye).normalized()
        fw = Rm @ FWD_LOC[bone]
        delta = Quaternion().slerp(fw.rotation_difference(d), frac)
        SetWorld(pbone, delta.to_matrix() @ Rm, K.BoneHead(arm, bone))
        pbone.keyframe_insert("rotation_quaternion", frame=f)

# ------------------------------------------------------------------ 9. 导出 + 报告
# 去掉 END 之后的多余关键帧（原件比我们长）
def AllFCurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    return [fc for layer in action.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]


for fc in AllFCurves(arm.animation_data.action):
    for idx in reversed(range(len(fc.keyframe_points))):
        if fc.keyframe_points[idx].co.x > END + 0.5 or fc.keyframe_points[idx].co.x < 0.5:
            fc.keyframe_points.remove(fc.keyframe_points[idx])
    fc.update()
timings = {"开始（右手近侧上方待送）": 0.0, "第1圈送卷到远侧": 0.42, "第1圈远侧交接": 0.52, "第1圈拉回近侧": 0.95,
           "第2圈起": 1.0, "第2圈远侧交接": 1.0 + 0.47 * 1.05, "第3圈起": 2.05, "第3圈远侧交接": 2.05 + 0.47 * 0.95,
           "第3圈结束": 3.0, "拉紧向外最大": 3.0 + 0.2, "拉紧回位": 3.5, "结束=开始": T_LOOP}
K.Export(arm, NAME, {
    "base": BASE, "label": "跪着给伤员包扎", "loop": True,
    "note": "双膝跪、伤员仰躺在面前，包扎他的上臂：右手拿绷带卷从上方送过肢体，左手在下方接住拉回，每圈约1秒，缠3圈后两手向外拉紧一次，可循环。"
            f"肢体轴线沿X，过点(0,{AXIS_Y},{AXIS_Z})，直径约10cm；预览里没有伤员和绷带。1938年急救没有心肺复苏。",
    "timings": timings,
})

# 每帧到轴线距离、掌心高度、指尖高度
rows = []
maxerr = 0.0
for f in FR:
    K.At(f)
    row = {"f": f}
    for side in ("Right", "Left"):
        p = K.Palm(arm, side)
        tgt = GRIP[side][("palm", f)]
        maxerr = max(maxerr, (p - tgt).length)
        row[side] = {"axisDist": math.hypot(p.y - AXIS_Y, p.z - AXIS_Z), "z": p.z, "xOff": p.x, "err": (p - tgt).length,
                     "tipZ": min(K.BoneHead(arm, f"{side}Hand{fn}4").z for fn in FINGER_NAMES + ("Thumb",)),
                     "tipAxis": min(math.hypot(K.BoneHead(arm, f"{side}Hand{fn}4").y - AXIS_Y, K.BoneHead(arm, f"{side}Hand{fn}4").z - AXIS_Z)
                                    for fn in FINGER_NAMES + ("Thumb",))}
    rows.append(row)
K.Report(arm, NAME, extra={"limbAxis": {"point": [0.0, AXIS_Y, AXIS_Z], "dir": [1, 0, 0], "radius": LIMB_R, "xRange": [-0.20, 0.20]},
                           "handRows": rows, "frames_note": "handRows: palm->axis distance (m), palm z, fingertip min z, IK target error"})
for f_ in (1, 20, 38, 70, 101):
    K.At(f_)
    print(f"[BandageKneel] dbgE f{f_} shoulder {tuple(round(v,3) for v in K.BoneHead(arm,'RightArm'))} elbow {tuple(round(v,3) for v in K.BoneHead(arm,'RightForeArm'))} wrist {tuple(round(v,3) for v in K.BoneHead(arm,'RightHand'))} palm {tuple(round(v,3) for v in K.Palm(arm,'Right'))} mid1 {tuple(round(v,3) for v in K.BoneHead(arm,'RightHandMiddle1'))}")
for fn_ in FINGER_NAMES + ("Thumb",):
    worst = 9.0
    for f_ in FR:
        K.At(f_)
        h_ = K.BoneHead(arm, f"LeftHand{fn_}4")
        worst = min(worst, math.hypot(h_.y - AXIS_Y, h_.z - AXIS_Z))
    print(f"[BandageKneel] left {fn_} tip->axis min {worst*100:.1f} cm")
_hd = [math.hypot(K.BoneHead(arm, "Head").y - AXIS_Y, K.BoneHead(arm, "Head").z - AXIS_Z) for _f in (K.At(_f) or _f for _f in FR)]
print(f"[BandageKneel] head->axis min {min(_hd)*100:.1f} cm max {max(_hd)*100:.1f} cm")
_sl = []
for _f in FR:
    K.At(_f)
    _v = R3(K.BoneMatrix(arm, "Spine2")) @ Vector((0, 1, 0))
    _sl.append(math.degrees(math.acos(max(-1, min(1, _v.z)))))
print(f"[BandageKneel] Spine2 lean from vertical min {min(_sl):.1f} max {max(_sl):.1f} deg")
print(f"[BandageKneel] palm IK target error max {maxerr*100:.2f} cm")
for side in ("Right", "Left"):
    d = [r[side]["axisDist"] for r in rows]
    z = [r[side]["z"] for r in rows]
    tz = [r[side]["tipZ"] for r in rows]
    ta = [r[side]["tipAxis"] for r in rows]
    print(f"[BandageKneel] {side} fingertip->axis min {min(ta)*100:.1f} cm (limb radius {LIMB_R*100:.1f})")
    print(f"[BandageKneel] {side} axis dist {min(d)*100:.1f}..{max(d)*100:.1f} cm; palm z min {min(z)*100:.1f} cm; fingertip z min {min(tz)*100:.1f} cm")

for side in ("Right", "Left"):
    carry = [r[side] for r, f_ in zip(rows, FR) if GRIP[side][f_] >= 0.58]
    empty = [r[side] for r, f_ in zip(rows, FR) if GRIP[side][f_] <= 0.40]
    print(f"[BandageKneel] {side} CARRY frames {len(carry)}: palm->axis {min(c['axisDist'] for c in carry)*100:.1f}..{max(c['axisDist'] for c in carry)*100:.1f} cm, tip->axis min {min(c['tipAxis'] for c in carry)*100:.1f} cm")
    print(f"[BandageKneel] {side} EMPTY frames {len(empty)}: palm->axis {min(c['axisDist'] for c in empty)*100:.1f}..{max(c['axisDist'] for c in empty)*100:.1f} cm, tip->axis min {min(c['tipAxis'] for c in empty)*100:.1f} cm")
f0 = {"LeftFoot": ANKLE["Left"], "RightFoot": ANKLE["Right"], "LeftLeg": KNEE["Left"], "RightLeg": KNEE["Right"],
      "LeftToeBase": TOE0["Left"], "RightToeBase": TOE0["Right"]}
maxfoot = 0.0
prev = {s: None for s in ("Right", "Left")}
maxspeed = 0.0
for f in FR:
    K.At(f)
    for n, p0 in f0.items():
        dd = (K.BoneHead(arm, n) - p0).length
        if f == 1:
            print(f"[BandageKneel] drift {n} {dd*100:.2f} cm")
        maxfoot = max(maxfoot, dd)
    for s in ("Right", "Left"):
        p = K.Palm(arm, s)
        if prev[s] is not None:
            maxspeed = max(maxspeed, (p - prev[s]).length)
        prev[s] = p
print(f"[BandageKneel] feet/knee drift max {maxfoot*100:.2f} cm; palm max step {maxspeed*100:.2f} cm/frame")
K.At(1)
a1 = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
K.At(END)
print("[BandageKneel] seam max quat diff (deg)", max(math.degrees(a1[pb.name].rotation_difference(pb.rotation_quaternion).angle) for pb in arm.pose.bones))

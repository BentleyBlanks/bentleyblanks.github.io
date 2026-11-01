# RifleBoltKneel -- 跪姿拉栓（中正式 / 毛瑟 98 式转栓）
#
# 是什么：国军步兵单膝跪姿，开完枪后枪仍抵肩、脸贴枪托，左手托护木、左肘架在左膝上不动；
#         右手松开握把 -> 向前够到拉柄 -> 手指握住拉柄球头 -> 上翻 90° 开锁 -> 后拉到底 ->
#         前推 -> 下压锁闭 -> 松手回握把 -> 回到跪姿瞄准。
# 改自：Animation_Mixamo_RifleKneelToAim_V1（跪着举枪瞄准，0.8 s）。取末帧「跪姿抵肩瞄准」为基础姿势，
#       整条把末帧姿势铺满（身体、左手、双腿全部固定不动），再在上面只改右臂、右手指、右肩、头颈。
#       （上一版用 RifleKneelIdle_V1，那条是低位待机、枪在腰前，不是射击后的姿势，已弃用。）
# 史实：中正式 = 毛瑟 98 式转栓：拉柄上翻约 90° 开锁，后拉到底（退壳），前推（顶弹入膛），下压锁闭。
#       熟练兵一次拉栓 0.8–1.2 s；右手离开握把、回握把各 0.2–0.3 s。
#
# 关键帧（30 fps，第 1 帧 = 0 s；t = (帧 - 1) / 30）：
#   帧   t(s)   内容
#     1  0.00   原跪姿持枪（左手托护木，右手握把）
#     6  0.17   右手开始离开握把（手指松开）
#    12  0.37   掌心到拉柄球头（knob）；手指握住
#    17  0.53   上翻 90° 完成（knobUp）
#    26  0.83   后拉到底（knobBack）          右肩后带一点
#    28  0.90   到底停一拍（退壳）
#    35  1.13   前推回 knobUp
#    40  1.30   下压锁闭（knob）；手指松开    拉栓 12 -> 40 共 0.93 s
#    49  1.60   右手回到握把，手指握回
#    56  1.83   与第 1 帧相同，可循环
#
# 左手：不做任何编辑；肩/头的反作用只动右肩和头颈，躯干不动，所以左手（= 枪）、左肘、膝盖和双脚都不动。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Quaternion, Vector, Matrix, Euler

bpy = K.bpy
NAME = "RifleBoltKneel"
BASE = "Animation_Mixamo_RifleKneelToAim_V1"
RIFLE = "ZhongZheng"
END = 56

# ------------------------------------------------------------------ 时间表（帧）
F0 = 1
F_LEAVE, F_CONTACT, F_UP, F_BACK, F_BACKHOLD, F_FWD, F_DOWN, F_RETURN = 6, 12, 17, 26, 28, 35, 40, 49
ARC = (0.034, 0.040, -0.115)                    # 上翻/下压途中球头划过的圆弧中点（武器坐标），向右外凸
ROLL_CONTACT = 25.0                             # 抓住拉柄时手相对原握把朝向绕枪膛轴的前旋角（度）：掌心朝左略朝下
ROLL_UP = ROLL_CONTACT + 60.0                   # 上翻时前臂前旋到掌心朝下（前旋共约 85°，在腕关节活动范围内）
# 球头在握拳空腔里的位置（手骨局部坐标：X 拇指侧、Y 手指方向、Z 掌心法线）。掌心点到球头 = |C_LOC| = 2.2 cm
C_LOC = Vector((0.0, 0.012, 0.018))
THUMB_TIP_TARGET = Vector((0.026, 0.020, 0.036))   # 拇指尖停在食指尖旁（局部坐标，相对掌心点）

arm = K.LoadBase(BASE)
LAST = bpy.context.scene.frame_end


def FreezeLastFrame():
    """把末帧姿势铺满 1..END：逐帧写所有骨头的旋转和位置（原动作每帧都有关键帧，只改个别帧不会过渡）。"""
    K.At(LAST)
    pose = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones}
    for f in range(bpy.context.scene.frame_start, LAST + 1):
        for pb in arm.pose.bones:
            q, loc = pose[pb.name]
            pb.rotation_quaternion = q
            pb.location = loc
            pb.keyframe_insert("rotation_quaternion", frame=f)
            pb.keyframe_insert("location", frame=f)


FreezeLastFrame()
K.ExtendTo(arm, END)
scene = bpy.context.scene
FR = list(range(F0, END + 1))


def Smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def Env(keys, f):
    """分段平滑包络：keys = [(frame, value)]，两端外保持。"""
    if f <= keys[0][0]:
        return keys[0][1]
    for (fa, va), (fb, vb) in zip(keys, keys[1:]):
        if f <= fb:
            return va + (vb - va) * Smooth((f - fa) / (fb - fa))
    return keys[-1][1]


# ------------------------------------------------------------------ 先把原动作的相关量存下来（编辑前）
base_q = {}       # (bone, frame) -> 原局部四元数
BONES_TOUCHED = ["Neck", "Head", "RightShoulder"] + [f"RightHand{fn}{i}" for fn in ("Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)] \
    + [f"RightHandThumb{i}" for i in (1, 2, 3)]
base_pin = {}     # 枪架（武器 -> 世界），枪跟左手走
base_hand_q = {}  # 右手骨世界朝向（原动作）
M1 = K.RifleFrame(arm, F0)
left1 = K.BoneMatrix(arm, "LeftHand", F0)
PIN = left1.inverted() @ M1
for f in FR:
    K.At(f)
    for b in BONES_TOUCHED:
        base_q[(b, f)] = arm.pose.bones[b].rotation_quaternion.copy()
    base_pin[f] = K.BoneMatrix(arm, "LeftHand") @ PIN
    base_hand_q[f] = K.BoneMatrix(arm, "RightHand").to_quaternion()
wrist0 = K.BoneHead(arm, "RightHand", F0)
palm0 = K.Palm(arm, "Right", F0)
hand_local_off = base_hand_q[F0].inverted() @ (palm0 - wrist0)       # 掌心相对手腕，在手骨局部坐标里


def Pt(frame, name_or_xyz, off=Vector((0, 0, 0))):
    """拉栓路径上的武器坐标点 -> 世界（用当帧左手算出的枪架）。"""
    if isinstance(name_or_xyz, str):
        p = Vector(K.RIFLES[RIFLE][name_or_xyz])
    else:
        p = Vector(name_or_xyz)
    return base_pin[frame] @ (p + off)


def HandQ(frame, roll_deg):
    """手的世界朝向 = 原握把朝向再绕枪膛轴（武器 +Z）滚转 roll_deg。"""
    axis = (base_pin[frame].to_3x3() @ Vector((0, 0, 1))).normalized()
    return Quaternion(axis, math.radians(roll_deg)) @ base_hand_q[frame]


def WristAt(frame, palm_target, q):
    return palm_target - q.to_matrix() @ hand_local_off


# ------------------------------------------------------------------ 1. 右肩后带（先于 IK，IK 以肩为根）
SHOULDER_ENV = [(F_UP, 0.0), (F_BACK, 1.0), (F_BACKHOLD, 1.0), (F_FWD + 2, 0.0)]
for f in FR:
    e = Env(SHOULDER_ENV, f)
    q = base_q[("RightShoulder", f)] @ Quaternion((0, 0, 1), math.radians(9.0 * e))
    pb = arm.pose.bones["RightShoulder"]
    pb.rotation_quaternion = q
    pb.keyframe_insert("rotation_quaternion", frame=f)

# ------------------------------------------------------------------ 2. 右臂 IK：手腕路径 + 手朝向
keys, rot_keys = [], []


def Key(frame, point, roll):
    q = HandQ(frame, roll)
    palm = Pt(frame, point) - q.to_matrix() @ C_LOC          # 掌心点在球头「后面」，球头落在手指围成的空腔里
    keys.append((frame, WristAt(frame, palm, q)))
    rot_keys.append((frame, q))


def BaseKey(frame):
    K.At(frame)
    keys.append((frame, K.BoneHead(arm, "RightHand")))
    rot_keys.append((frame, base_hand_q[frame]))


BaseKey(F_LEAVE)
Key(F_CONTACT, "knob", ROLL_CONTACT)
Key(F_CONTACT + 3, ARC, (ROLL_CONTACT + ROLL_UP) / 2 + 3)      # 圆弧中点
Key(F_UP, "knobUp", ROLL_UP)
Key(F_BACK, "knobBack", ROLL_UP + 4)
Key(F_BACKHOLD, "knobBack", ROLL_UP + 4)
Key(F_FWD, "knobUp", ROLL_UP)
Key(F_DOWN - 3, ARC, (ROLL_CONTACT + ROLL_UP) / 2 + 3)
Key(F_DOWN, "knob", ROLL_CONTACT)
BaseKey(F_RETURN)

# 肘尖方向：原动作右肘的位置略向外、向下
K.At(F0)
elbow0 = K.BoneHead(arm, "RightForeArm")
pole = elbow0 + Vector((-0.10, 0.02, -0.06))
K.ArmIk(arm, "Right", keys, window=(F_LEAVE, F_RETURN), pole=pole, rotation_keys=rot_keys, pole_angle_deg=180)


# ------------------------------------------------------------------ 3. 手指（逐帧写，免得和原动作的逐帧曲线混）
CURL = {"Index": 1.15, "Middle": 1.15, "Ring": 1.2, "Pinky": 1.2}      # 握住球头：几乎握拳
OPEN = {"Index": 0.30, "Middle": 0.35, "Ring": 0.40, "Pinky": 0.45}     # 够向拉柄时手半张开
MAXDEG = (55, 80, 60)


def FistQuat(i, amount):
    return Quaternion((1, 0, 0), math.radians(MAXDEG[i] * amount))


def FindThumb():
    """在握拳姿势下找一组拇指关节欧拉角，使拇指尖落在 THUMB_TIP_TARGET（相对掌心点的手骨局部坐标）。"""
    K.At(F0)
    pbs = arm.pose.bones
    for fn, amt in CURL.items():
        for i in range(3):
            pbs[f"RightHand{fn}{i + 1}"].rotation_quaternion = FistQuat(i, amt)
    hq = K.BoneMatrix(arm, "RightHand").to_quaternion()

    def cost(p):
        for i in range(3):
            pbs[f"RightHandThumb{i + 1}"].rotation_quaternion = Euler(tuple(math.radians(v) for v in p[3 * i:3 * i + 3]), "XYZ").to_quaternion()
        bpy.context.view_layer.update()
        palm = K.Palm(arm, "Right")
        tip = hq.inverted() @ (K.BoneHead(arm, "RightHandThumb4") - palm)
        return (tip - THUMB_TIP_TARGET).length + sum(v * v for v in p) * 1e-7
    p = [0.0] * 9
    best, step = cost(p), 20.0
    while step > 0.5:
        improved = False
        for k in range(9):
            for sgn in (1, -1):
                q = list(p)
                q[k] += sgn * step
                if abs(q[k]) > 65:
                    continue
                c = cost(q)
                if c < best - 1e-6:
                    best, p, improved = c, q, True
        if not improved:
            step /= 2
    print(f"[RifleBoltKneel] thumb euler {[round(v, 1) for v in p]} residual {best * 100:.2f} cm")
    K.At(F0)
    return [Euler(tuple(math.radians(v) for v in p[3 * i:3 * i + 3]), "XYZ").to_quaternion() for i in range(3)]


THUMB_PINCH = FindThumb()


def Pose(frame, kind):
    """kind 'grip' 原握把；'open' 半张开；'pinch' 握住拉柄。返回 {bone: quat}。"""
    out = {}
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in (1, 2, 3):
            b = f"RightHand{fn}{i}"
            if kind == "grip":
                out[b] = base_q[(b, frame)]
            else:
                out[b] = FistQuat(i - 1, (OPEN if kind == "open" else CURL)[fn])
    for i in (1, 2, 3):
        b = f"RightHandThumb{i}"
        if kind == "grip":
            out[b] = base_q[(b, frame)]
        elif kind == "open":
            out[b] = Quaternion((1, 0, 0), 0).slerp(THUMB_PINCH[i - 1], 0.15)
        else:
            out[b] = THUMB_PINCH[i - 1]
    return out


# 手型切换都用 5–7 帧带缓入缓出（每帧手指转角 ≤ 25°）：握把 -> 半张开 -> 握拉柄 -> 半张开 -> 握把
FINGER_KEYS = [(F0, "grip"), (F_LEAVE + 1, "open"), (F_CONTACT - 4, "open"), (F_CONTACT + 3, "pinch"), (F_DOWN, "pinch"),
               (F_DOWN + 6, "open"), (F_RETURN - 2, "open"), (F_RETURN + 5, "grip"), (END, "grip")]
for f in FR:
    for (fa, ka), (fb, kb) in zip(FINGER_KEYS, FINGER_KEYS[1:]):
        if fa <= f <= fb:
            t = Smooth((f - fa) / max(1, fb - fa))
            pa, pb_ = Pose(f, ka), Pose(f, kb)
            for b in pa:
                arm.pose.bones[b].rotation_quaternion = pa[b].slerp(pb_[b], t)
                arm.pose.bones[b].keyframe_insert("rotation_quaternion", frame=f)
            break

# ------------------------------------------------------------------ 4. 头颈：先看（手到之前），拉完回到看准星
LOOK_ENV = [(F0, 0.0), (F_CONTACT, 1.0), (F_DOWN, 1.0), (F_RETURN, 0.0)]
for f in FR:
    e = Env(LOOK_ENV, f)
    arm.pose.bones["Neck"].rotation_quaternion = base_q[("Neck", f)] @ Quaternion((1, 0, 0), math.radians(2 * e))
    arm.pose.bones["Neck"].keyframe_insert("rotation_quaternion", frame=f)
    h = base_q[("Head", f)] @ Quaternion((1, 0, 0), math.radians(3 * e)) @ Quaternion((0, 0, 1), math.radians(3 * e))
    arm.pose.bones["Head"].rotation_quaternion = h
    arm.pose.bones["Head"].keyframe_insert("rotation_quaternion", frame=f)

# ------------------------------------------------------------------ 5. 导出 + 报告
timings = {"开始": 0.0, "手离开握把": (F_LEAVE - 1) / 30, "握住拉柄": (F_CONTACT - 1) / 30, "上翻到位": (F_UP - 1) / 30,
           "后拉到底": (F_BACK - 1) / 30, "到底停一拍结束": (F_BACKHOLD - 1) / 30, "前推到位": (F_FWD - 1) / 30,
           "下压锁闭": (F_DOWN - 1) / 30, "手回握把": (F_RETURN - 1) / 30, "结束": (END - 1) / 30}
K.Export(arm, NAME, {
    "base": BASE, "label": "跪姿拉栓", "loop": True,
    "note": "取末帧跪姿瞄准为基础。中正式（毛瑟98）转栓：上翻90°—后拉—前推—下压；单膝跪姿，枪抵肩，左手托护木不动。不要用在汉阳造上（整夹装填）。",
    "timings": timings, "rifle": RIFLE,
})
K.Report(arm, NAME, rifle=RIFLE, rifle_frame=F0, extra={"contactFrames": [F_CONTACT, F_UP, F_BACK, F_BACKHOLD, F_FWD, F_DOWN]})

# 额外的日志：接触帧距离、左手漂移、手速、脚漂移
K.At(F0)
L0 = K.Palm(arm, "Left")
lf0 = {n: K.BoneHead(arm, n) for n in ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "RightLeg", "LeftLeg")}
maxL = maxfoot = maxspeed = 0.0
prev = None
for f in FR:
    K.At(f)
    maxL = max(maxL, (K.Palm(arm, "Left") - L0).length)
    for n, p0 in lf0.items():
        maxfoot = max(maxfoot, (K.BoneHead(arm, n) - p0).length)
    pr = K.Palm(arm, "Right")
    if prev is not None:
        maxspeed = max(maxspeed, (pr - prev).length)
    prev = pr
    if f % 4 == 1:
        e = K.BoneHead(arm, "RightForeArm"); sh = K.BoneHead(arm, "RightArm"); w = K.BoneHead(arm, "RightHand")
        print(f"[RifleBoltKneel] f{f} elbow {tuple(round(v, 3) for v in e)} shoulder->elbow {(e - sh).length:.3f} elbow->wrist {(w - e).length:.3f}")
    if f in (F_CONTACT, F_UP, F_BACK, F_BACKHOLD, F_FWD, F_DOWN):
        tgt = {F_CONTACT: "knob", F_UP: "knobUp", F_BACK: "knobBack", F_BACKHOLD: "knobBack", F_FWD: "knobUp", F_DOWN: "knob"}[f]
        d = (pr - base_pin[f] @ Vector(K.RIFLES[RIFLE][tgt])).length
        print(f"[RifleBoltKneel] frame {f} palm->{tgt} {d*100:.2f} cm")
print(f"[RifleBoltKneel] left palm drift max {maxL*100:.2f} cm; feet/knee drift max {maxfoot*100:.2f} cm; right palm max step {maxspeed*100:.2f} cm/frame")

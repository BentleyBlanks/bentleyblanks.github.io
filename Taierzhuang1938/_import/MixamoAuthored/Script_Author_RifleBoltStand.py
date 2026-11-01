# RifleBoltStand「站姿拉栓」 (Claude, 2026-11-01)
#
# 这是什么：站着、枪抵肩，刚打完一枪后拉一次栓。左手托护木不动；右手离开握把，
#   抓住拉柄球头（拇指和食指对捏），上翻、后拉到底、前推、下压锁住，再回握把。
#   动作首尾姿势一致（loop: true），可以接在开枪动作后面反复用。
#
# 改自：Animation_Mixamo_RifleAimingIdle_V1（站姿端枪瞄准待机，第 1 帧两手都在枪上）。
#   保留它的腿、躯干和呼吸；只改右臂、右手五指，躯干/头/右肩做一点反作用，
#   左臂用 IK 钉住第 1 帧的位置，保证枪不晃。呼吸在最后 ~13 帧渐渐并回第 1 帧，首尾才接得上。
#
# 关键帧时间表（30 fps；帧号从 1 起。GLB 里第 1 帧在 1/30 s，所以预览里的秒 = 帧 / 30，下面括号里都是这个秒数）：
#   帧  1 (0.033 s)  瞄准停顿开始（开过枪后眼睛不离目标）
#   帧  9 (0.300 s)  右手松开握把，手指张开往拉柄去
#   帧 14 (0.467 s)  右掌心到拉柄球头；帧 15 (0.500 s) 拇指食指对捏住
#   帧 15 -> 19 (0.500 -> 0.633 s)  上翻 90 多度（knob -> knobUp）
#   帧 19 -> 26 (0.633 -> 0.867 s)  后拉到底（knobUp -> knobBack）
#   帧 26 -> 27 (0.867 -> 0.900 s)  到底停一拍（弹壳在这里抛出）
#   帧 27 -> 32 (0.900 -> 1.067 s)  前推（knobBack -> knobUp）
#   帧 32 -> 36 (1.067 -> 1.200 s)  下压锁死（knobUp -> knob）
#   帧 38 -> 47 (1.267 -> 1.567 s)  松开拉柄，手回握把，手指重新握紧
#   帧 47 -> 60 (1.567 -> 2.000 s)  瞄准停顿（呼吸并回第 1 帧）
#   拉栓本身（抓住 -> 松手）帧 14 -> 38 = 0.80 s；离开握把到回握把帧 9 -> 47 = 1.27 s；整条 2.0 s（60 帧）。
#
# 史实：中正式（毛瑟 98 式）、三八式都是转栓式。拉栓 = 拉柄上翻约 90 度 -> 往后拉到底 -> 往前推 -> 下压锁住；
#   熟练兵靠肩不离枪就能做，右手拇指和食指（连同中指）捏着球头，所以眼睛可以不离目标。
#   这条动作不涉及桥夹，没有现代战术持枪的习惯（不是 AR 那种拉机柄）。
#
# 手的做法：握手姿势（掌心朝枪、四指朝前、拇指朝上）。球头在拇指与弯曲的食指之间，手柄从虎口穿过。
#   指关节角度不是手摆的，而是脚本里用一个小优化器在「手本地坐标」里解出来的：
#   让拇指末节和食指末节同时贴在球头两侧，其余三指蜷在掌心前面，不碰球头、不碰手柄。
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Euler, Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "RifleBoltStand"
BASE = "Animation_Mixamo_RifleAimingIdle_V1"
RIFLE = "ZhongZheng"

# ----------------------------------------------------------------------------- 时间表（帧）
N = 64                 # 总帧数：1..64
F_LEAVE = 8            # 右手松开握把，手指开始张开
F_GRASP = 15           # 掌心到球头
F_PINCH = 20           # 手指对捏完成（张开 -> 捏 用 6 帧）
F_UP_START, F_UP = 19, 26    # 上翻 7 帧
F_BACK = 33            # 拉到底（7 帧）
F_PUSH = 34            # 开始前推
F_FWD = 39             # 前推到位（knobUp，5 帧）
F_DOWN_START, F_DOWN = 38, 45  # 下压 7 帧
F_RETURN = 45          # 开始撤手、松指
F_GRIP = 53            # 右手回握把（8 帧）
F_FIN_END = 57         # 手指重新握紧
F_CLOSE_FROM = 54      # 呼吸并回第 1 帧的起点

# 手的姿态参数（枪坐标：x 右、y 上、z 向后；z 负方向是枪口）
GRASP_F = Vector((0.10, 0.12, -1.0))       # 四指朝前，略朝上、略朝枪
GRASP_N = Vector((-1.0, -0.25, 0.0))       # 掌心朝左（朝机匣），略朝下
POLE_OUT = 0.5                              # 右肘极点往外多推多少（相对肩-腕中点到肘的偏移）
KNOB_PROBE = 0.0

# 躯干反作用（度）；符号在日志里核对
PULL_TWIST = (-1.5, -2.5)  # Spine1 / Spine2 绕竖轴，右肩往后
SHOULDER_BACK = -2.5       # RightShoulder 绕竖轴，肩带再往后一点
HEAD_PITCH = (-2.0, -3.0)  # Neck / Head 绕横轴，下巴抬一点（脸略离枪托）
HEAD_ROLL = 2.0            # 头往左歪一点，避开球头


# ----------------------------------------------------------------------------- 小工具
def Ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def Track(keys, f):
    """分段平滑曲线：keys [(帧, 值)]，每段 smoothstep（最大速度是匀速的 1.5 倍），各关键帧处速度为 0。"""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            return v1 if f1 == f0 else v0 + (v1 - v0) * Ease((f - f0) / (f1 - f0))
    return keys[-1][1]


def R3(m):
    return m.to_3x3().normalized()


def WorldQuat(m):
    return R3(m).to_quaternion()


def Fmt(v, n=3):
    return tuple(round(x, n) for x in v)


# ----------------------------------------------------------------------------- 躯干 / 头：绕世界轴转骨头
def RotateBoneWorld(arm, name, axis, deg):
    pb = arm.pose.bones[name]
    mw = arm.matrix_world @ pb.matrix
    pivot = mw.translation.copy()
    rot = Matrix.Rotation(math.radians(deg), 4, axis)
    new = Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot) @ mw
    pb.matrix = arm.matrix_world.inverted() @ new
    bpy.context.view_layer.update()


def KeyBoneRot(arm, name, frame):
    arm.pose.bones[name].keyframe_insert("rotation_quaternion", frame=frame)


# ----------------------------------------------------------------------------- 循环：最后一段并回第 1 帧
def LoopClose(arm, f_from, f_to):
    K.At(1)
    first = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
    for f in range(f_from, f_to + 1):
        K.At(f)
        w = Ease((f - (f_from - 1)) / (f_to - (f_from - 1)))
        for pb in arm.pose.bones:
            loc1, q1 = first[pb.name]
            pb.rotation_quaternion = pb.rotation_quaternion.slerp(q1, w)
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == "Hips":
                pb.location = pb.location.lerp(loc1, w)
                pb.keyframe_insert("location", frame=f)


# ----------------------------------------------------------------------------- 手：局部坐标、指链正向运动学
SC = None  # 骨架物体缩放（厘米 -> 米）


def RestMat(arm, name):
    return arm.data.bones[name].matrix_local


def FingerHeads(arm, side, finger, quats):
    """手本地坐标（米）里每个关节的头位置，最后一个是指尖。quats：3 个关节的局部旋转（相对静止姿势）。"""
    prev = RestMat(arm, f"{side}Hand")
    c = Matrix.Identity(4)
    heads = []
    for i, q in enumerate(quats, start=1):
        b = RestMat(arm, f"{side}Hand{finger}{i}")
        c = c @ (prev.inverted() @ b) @ q.to_matrix().to_4x4()
        heads.append(c.translation * SC)
        prev = b
    tip = c @ (prev.inverted() @ RestMat(arm, f"{side}Hand{finger}4"))
    heads.append(tip.translation * SC)
    return heads


def SegDist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def HandAxes(arm, side, frame):
    """手骨头世界旋转 Q，以及手本地坐标里的 (前=指向, 法=掌心朝向, 侧=小指->拇指)。"""
    K.At(frame)
    q = WorldQuat(K.BoneMatrix(arm, f"{side}Hand"))
    hand = K.BoneHead(arm, f"{side}Hand")
    f = (K.BoneHead(arm, f"{side}HandMiddle1") - hand).normalized()
    a = K.BoneHead(arm, f"{side}HandIndex1") - K.BoneHead(arm, f"{side}HandPinky1")
    a = (a - f * a.dot(f)).normalized()
    n = a.cross(f)
    inv = q.inverted()
    return q, inv @ f, inv @ n, inv @ a


def HandQuatFor(basis_local, f_w, n_w):
    """让手的 (前, 法) 对齐世界里的 f_w, n_w 的手骨头世界旋转。"""
    lf, ln, la = basis_local
    f_w = f_w.normalized()
    n_w = (n_w - f_w * n_w.dot(f_w)).normalized()
    a_w = f_w.cross(n_w)
    wm = Matrix((f_w, n_w, a_w)).transposed()
    lm = Matrix((lf, ln, la)).transposed()
    return (wm @ lm.inverted()).to_quaternion()


# ----------------------------------------------------------------------------- 捏拉柄：解指关节
def SolvePinch(arm, palm_l, handle_dir_l, log):
    """在手本地坐标里解：球头相对掌心的偏移 n'(<=2 cm) + 拇指 9 个角 + 食指 3 个角 + 其余三指蜷曲度。
    返回 dict。"""
    rnd = random.Random(11)
    inf = 1e9

    def pack(v):
        n_off = Vector(v[0:3])
        th = [Quaternion(Euler([math.radians(a) for a in v[3 + 3 * i:6 + 3 * i]], "XYZ")) for i in range(3)]
        idx = [Quaternion((1, 0, 0), math.radians(a)) for a in v[12:15]]
        c = v[15]
        oth = {}
        for fn, scale in (("Middle", 1.0), ("Ring", 1.1), ("Pinky", 1.15)):
            cc = min(1.0, c * scale)
            oth[fn] = [Quaternion((1, 0, 0), math.radians(a * cc)) for a in (62, 100, 48)]
        return n_off, th, idx, oth

    lo = [-0.023] * 3 + [-60, -60, -60] * 3 + [0, 0, 0] + [0.2]
    hi = [0.023] * 3 + [60, 60, 70] * 3 + [70, 95, 60] + [0.8]

    def seg_clear(k, segs, clear):
        e = 0.0
        for a, b in segs:
            d = SegDist(k, a, b) * 1000
            if d < clear:
                e += (clear - d) ** 2
        return e

    def energy(v, detail=False):
        n_off, th, idx, oth = pack(v)
        k = palm_l + n_off
        t_heads = FingerHeads(arm, "Right", "Thumb", th)
        i_heads = FingerHeads(arm, "Right", "Index", idx)
        t_seg = (t_heads[2], t_heads[3])
        i_seg = (i_heads[2], i_heads[3])
        dt = SegDist(k, *t_seg) * 1000
        di = SegDist(k, *i_seg) * 1000
        e = 6 * (dt - 18) ** 2 + 6 * (di - 19) ** 2
        # 两个接触点在球头两侧
        tc = t_seg[0].lerp(t_seg[1], 0.5)
        ic = i_seg[0].lerp(i_seg[1], 0.5)
        e += 2 * ((tc - ic).length * 1000 - 35) ** 2
        side_t = (tc - k).normalized()
        side_i = (ic - k).normalized()
        e += 400 * max(0.0, side_t.dot(side_i) + 0.2) ** 2
        # 其余指节离球头至少 14 mm
        all_segs = [(t_heads[0], t_heads[1]), (t_heads[1], t_heads[2]),
                    (i_heads[0], i_heads[1]), (i_heads[1], i_heads[2])]
        for fn in ("Middle", "Ring", "Pinky"):
            h = FingerHeads(arm, "Right", fn, oth[fn])
            all_segs += [(h[0], h[1]), (h[1], h[2]), (h[2], h[3])]
        e += 2 * seg_clear(k, all_segs, 17)
        # 手柄：从球头朝 handle_dir_l 伸出去 34 mm，离所有指节至少 9 mm
        for s in (0.012, 0.020, 0.028, 0.034):
            p = k + handle_dir_l * s
            e += 3 * seg_clear(p, all_segs + [t_seg, i_seg], 10)
        # 偏移越小越好，超过 2 cm 重罚
        off = n_off.length * 1000
        e += 0.05 * off ** 2 + (50 * (off - 23) ** 2 if off > 23 else 0)
        # 轻微正则：别出怪姿势
        for a in v[3:12]:
            e += 0.002 * a * a
        if detail:
            return {"E": e, "dt": dt, "di": di, "off": off}
        return e

    best_v, best_e = None, inf
    for restart in range(8):
        v = [rnd.uniform(l + 0.3 * (h - l), h - 0.3 * (h - l)) for l, h in zip(lo, hi)]
        v[0:3] = [rnd.uniform(-0.01, 0.01) for _ in range(3)]
        e = energy(v)
        iters = 4000
        for it in range(iters):
            s = 1.0 - 0.95 * it / iters
            w = list(v)
            for _ in range(rnd.choice((1, 2, 3))):
                i = rnd.randrange(len(v))
                w[i] = min(hi[i], max(lo[i], w[i] + rnd.gauss(0, (hi[i] - lo[i]) * 0.08 * s)))
            e2 = energy(w)
            if e2 < e:
                v, e = w, e2
        log(f"  pinch restart {restart}: E={e:.1f} {energy(v, True)}")
        if e < best_e:
            best_v, best_e = v, e
    n_off, th, idx, oth = pack(best_v)
    detail = energy(best_v, True)
    log(f"  PINCH best E={best_e:.1f} {detail} offset(mm)={Fmt(n_off * 1000, 1)}")
    log(f"  thumb deg={[round(a, 1) for a in best_v[3:12]]} index deg={[round(a, 1) for a in best_v[12:15]]} curl={best_v[15]:.2f}")
    return {"n": n_off, "thumb": th, "index": idx, "others": oth, "detail": detail}


# ----------------------------------------------------------------------------- 自己的 IK（带极点角度自动挑、极点可以动）
def ArmIk2(arm, side, keys, window, pole_keys, rotation_keys, blend=4, pole_angle=None):
    target = K._Empty(f"IK_{side}")
    for frame, position in keys:
        target.location = position
        target.keyframe_insert("location", frame=frame)
    target.rotation_mode = "QUATERNION"
    prev = None
    for frame, quat in rotation_keys:
        quat = quat.copy()
        if prev is not None and quat.dot(prev) < 0:
            quat.negate()
        prev = quat
        target.rotation_quaternion = quat
        target.keyframe_insert("rotation_quaternion", frame=frame)
    pole_obj = K._Empty(f"Pole_{side}")
    for frame, position in pole_keys:
        pole_obj.location = position
        pole_obj.keyframe_insert("location", frame=frame)
    fore = arm.pose.bones[f"{side}ForeArm"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    ik.pole_target, ik.pole_angle = pole_obj, math.radians(-90 if pole_angle is None else pole_angle)
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


def PickPoleAngle(arm, side, frame, wrist_pos, pole_pos, log):
    """试几个极点角度，挑让肘最朝极点的那个。"""
    K.At(frame)
    target, pole_obj = K._Empty("IKtest"), K._Empty("PoleTest", pole_pos)
    target.location = wrist_pos
    fore = arm.pose.bones[f"{side}ForeArm"]
    ik = fore.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole_obj
    shoulder = K.BoneHead(arm, f"{side}Arm")
    best = (-2, None)
    for ang in (-180, -135, -90, -45, 0, 45, 90, 135):
        ik.pole_angle = math.radians(ang)
        bpy.context.view_layer.update()
        elbow = arm.matrix_world @ arm.pose.bones[f"{side}ForeArm"].head
        axis = (wrist_pos - shoulder).normalized()
        mid = shoulder + axis * (elbow - shoulder).dot(axis)
        bend = (elbow - mid)
        want = pole_pos - (shoulder + axis * (pole_pos - shoulder).dot(axis))
        cos = bend.normalized().dot(want.normalized()) if bend.length > 1e-6 else -1
        log(f"  pole_angle {ang}: elbow {Fmt(elbow)} cos {cos:.3f}")
        if cos > best[0]:
            best = (cos, ang)
    fore.constraints.remove(ik)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)
    log(f"  -> pole angle {best[1]} ({side})")
    return best[1]


# ----------------------------------------------------------------------------- 清理：动作只留 1..N，丢掉烘焙留下的越界关键帧与残留约束曲线
def TrimAction(arm, first, last, log):
    act = arm.animation_data.action
    channelbags = [cb for layer in act.layers for strip in layer.strips for cb in strip.channelbags]
    dropped_curves = dropped_keys = 0
    for cb in channelbags:
        for fc in list(cb.fcurves):
            if "constraints" in fc.data_path:
                cb.fcurves.remove(fc)
                dropped_curves += 1
                continue
            for kp in reversed(list(fc.keyframe_points)):
                if kp.co[0] < first - 1e-4 or kp.co[0] > last + 1e-4:
                    fc.keyframe_points.remove(kp)
                    dropped_keys += 1
    log(f"trim action: dropped {dropped_curves} constraint curves, {dropped_keys} out-of-range keys; frame_range now {tuple(act.frame_range)}")


# ----------------------------------------------------------------------------- 主流程
def Main():
    global SC
    logs = []

    def log(s):
        print("[BoltStand]", s)
        logs.append(s)
        # 并行跑别的动作时共用日志会串，所以另写一份自己的
        with open(os.path.join(K.AUTHORED, NAME + ".log.txt"), "a", encoding="utf-8") as fh:
            fh.write(s + "\n")

    os.makedirs(K.AUTHORED, exist_ok=True)
    open(os.path.join(K.AUTHORED, NAME + ".log.txt"), "w").close()
    arm = K.LoadBase(BASE, frame_end=N)
    SC = arm.matrix_world.to_scale()[0]
    log(f"base {BASE} frames 1..{N}  armature scale {SC}")
    K.At(1)

    # --- 第 1 帧的基准：枪坐标系、左手位置/朝向、右手朝向
    M0 = K.RifleFrame(arm, 1)
    R0 = M0.to_3x3()
    rifle = K.RIFLES[RIFLE]
    left_wrist0 = K.BoneHead(arm, "LeftHand", 1)
    left_q0 = WorldQuat(K.BoneMatrix(arm, "LeftHand", 1))
    q_r0, lf, ln, la = HandAxes(arm, "Right", 1)
    palm_l = (RestMat(arm, "RightHand").inverted() @ RestMat(arm, "RightHandMiddle1")).translation * SC * 0.55
    # FK 自检：用第 1 帧实际的指关节旋转，和骨架里读到的指尖位置比
    K.At(1)
    for fn in ("Index", "Thumb"):
        quats = [arm.pose.bones[f"Right Hand{fn}{i}".replace(" ", "")].rotation_quaternion.copy() for i in (1, 2, 3)]
        heads = FingerHeads(arm, "Right", fn, quats)
        hand_m = K.BoneMatrix(arm, "RightHand")
        actual = (hand_m.inverted() @ K.BoneHead(arm, f"RightHand{fn}4")) * SC
        log(f"FK check {fn}: model tip {Fmt(heads[3] * 1000, 1)} mm  actual {Fmt(actual * 1000, 1)} mm")

    # --- 第 0 步：最后一段并回第 1 帧（循环）
    LoopClose(arm, F_CLOSE_FROM, N)

    # --- 第 1 步：躯干 / 头 / 右肩的反作用（先于手臂 IK）
    pull = [(F_GRASP, 0.0), (F_UP, 0.6), (F_BACK, 1.0), (F_PUSH, 1.0), (F_FWD + 2, 0.5), (F_RETURN + 4, 0.0)]
    head_env = [(F_LEAVE, 0.0), (F_UP, 1.0), (F_FWD, 1.0), (F_GRIP - 2, 0.0)]
    probe = {}
    for f in range(F_LEAVE, F_GRIP + 1):
        K.At(f)
        ep, eh = Track(pull, f), Track(head_env, f)
        if ep > 1e-4:
            RotateBoneWorld(arm, "Spine1", (0, 0, 1), PULL_TWIST[0] * ep)
            RotateBoneWorld(arm, "Spine2", (0, 0, 1), PULL_TWIST[1] * ep)
            RotateBoneWorld(arm, "RightShoulder", (0, 0, 1), SHOULDER_BACK * ep)
            for nm in ("Spine1", "Spine2", "RightShoulder"):
                KeyBoneRot(arm, nm, f)
        if eh > 1e-4:
            RotateBoneWorld(arm, "Neck", (1, 0, 0), HEAD_PITCH[0] * eh)
            RotateBoneWorld(arm, "Head", (1, 0, 0), HEAD_PITCH[1] * eh)
            RotateBoneWorld(arm, "Head", (0, 1, 0), HEAD_ROLL * eh)
            for nm in ("Neck", "Head"):
                KeyBoneRot(arm, nm, f)
        if f in (F_LEAVE, F_BACK):
            probe[f] = (K.BoneHead(arm, "RightArm"), arm.matrix_world @ arm.pose.bones["Head"].tail)
    log(f"torso probe: RightArm head {Fmt(probe[F_LEAVE][0])} -> {Fmt(probe[F_BACK][0])} (want +Y = back); "
        f"Head tail {Fmt(probe[F_LEAVE][1])} -> {Fmt(probe[F_BACK][1])} (want +Z = chin up)")

    # --- 第 2 步：左手钉住
    left_elbow0 = K.BoneHead(arm, "LeftForeArm", 1)
    left_sh0 = K.BoneHead(arm, "LeftArm", 1)
    pole_l = left_elbow0 + (left_elbow0 - (left_sh0 + left_wrist0) * 0.5) * 1.0
    ang_l = PickPoleAngle(arm, "Left", 1, left_wrist0, pole_l, log)
    ArmIk2(arm, "Left", [(1, left_wrist0), (N, left_wrist0)], (1, N), [(1, pole_l), (N, pole_l)],
           [(1, left_q0), (N, left_q0)], blend=4, pole_angle=ang_l)

    # --- 第 3 步：右手路径（枪坐标系里算，M0 不变，因为左手钉住了）
    k0, ku = Vector(rifle["knob"]), Vector(rifle["knobUp"])
    chord = ku - k0
    mid = (k0 + ku) * 0.5
    perp = Vector((chord.y, -chord.x, 0)).normalized()          # 90 度弧的圆心在弦的这一侧
    centre = mid - perp * (chord.length * 0.5)
    if (Matrix.Rotation(math.radians(90), 2) @ Vector((k0.x - centre.x, k0.y - centre.y)) - Vector((ku.x - centre.x, ku.y - centre.y))).length > 0.005:
        centre = mid + perp * (chord.length * 0.5)
    c2 = Vector((centre.x, centre.y))
    log(f"bolt axis centre (weapon) {Fmt(centre, 4)}  knob radius {(Vector((k0.x, k0.y)) - c2).length:.4f}")
    handle_w = (Vector((c2.x - k0.x, c2.y - k0.y, 0))).normalized()   # 闭栓时手柄从球头指向栓轴
    f_w = R0 @ GRASP_F
    n_w = R0 @ GRASP_N
    basis = (lf, ln, la)
    q_grasp = HandQuatFor(basis, f_w, n_w)
    handle_world = R0 @ handle_w
    handle_l = (q_grasp.inverted() @ handle_world).normalized()
    pinch = SolvePinch(arm, palm_l, handle_l, log)
    off_world = q_grasp @ pinch["n"]                              # 掌心 -> 球头
    p0_w = k0 - R0.inverted() @ off_world                        # 抓取时掌心（枪坐标）
    log(f"palm->knob offset {off_world.length * 100:.2f} cm; palm at grasp (weapon) {Fmt(p0_w, 4)}")

    theta_keys = [(F_UP_START, 0.0), (F_UP, 95.0), (F_DOWN_START, 95.0), (F_DOWN, 0.0)]  # 下压 7 帧，与前推末尾重叠 1 帧
    stroke_keys = [(F_UP, 0.0), (F_BACK, 1.0), (F_PUSH, 1.0), (F_FWD, 0.0)]
    reach_keys = [(F_LEAVE, 0.0), (F_GRASP, 1.0), (F_RETURN, 1.0), (F_GRIP, 0.0)]
    z_axis_w = (R0 @ Vector((0, 0, 1))).normalized()

    def HoldAt(f):
        theta, s = Track(theta_keys, f), Track(stroke_keys, f)
        rel = Vector((p0_w.x - c2.x, p0_w.y - c2.y))
        rel = Matrix.Rotation(math.radians(theta), 2) @ rel
        p = Vector((c2.x + rel.x, c2.y + rel.y, p0_w.z + s * rifle["stroke"]))
        q = Quaternion(z_axis_w, math.radians(theta)) @ q_grasp
        knob_w = Vector((c2.x, c2.y, k0.z + s * rifle["stroke"])) + Matrix.Rotation(math.radians(theta), 3, "Z") @ Vector((k0.x - c2.x, k0.y - c2.y, 0))
        return M0 @ p, q, M0 @ knob_w

    # --- 基础：窗口各帧的右手原姿势（IK 前，躯干已改）
    base_palm, base_q = {}, {}
    for f in range(F_LEAVE, F_GRIP + 1):
        K.At(f)
        base_palm[f] = K.Palm(arm, "Right")
        base_q[f] = WorldQuat(K.BoneMatrix(arm, "RightHand"))
    keys, rkeys = [], []
    prev_q = None
    for f in range(F_LEAVE, F_GRIP + 1):
        r = Track(reach_keys, f)
        hold_p, hold_q, _ = HoldAt(f)
        palm = base_palm[f].lerp(hold_p, r)
        q = base_q[f].slerp(hold_q, r)
        wrist = palm - q @ palm_l
        keys.append((f, wrist))
        rkeys.append((f, q))
    # 极点（肘朝哪边）：取右肘第 1 帧的位置外推，抬手时肘略随手升高
    sh0 = K.BoneHead(arm, "RightArm", 1)
    el0 = K.BoneHead(arm, "RightForeArm", 1)
    wr0 = K.BoneHead(arm, "RightHand", 1)
    pole_base = el0 + (el0 - (sh0 + wr0) * 0.5) * POLE_OUT
    pole_keys = []
    for f in range(F_LEAVE, F_GRIP + 1):
        r = Track(reach_keys, f)
        up = Track([(F_UP_START, 0.0), (F_UP, 1.0), (F_FWD, 1.0), (F_DOWN, 0.0)], f)
        pole_keys.append((f, pole_base + Vector((0, 0, 0.06 * up * r))))
    ang_r = PickPoleAngle(arm, "Right", F_BACK, keys[F_BACK - F_LEAVE][1], pole_keys[F_BACK - F_LEAVE][1], log)

    # 手指基础值（读一次，IK 不动手指）
    finger_bones = [f"RightHand{fn}{i}" for fn in K.FINGERS for i in (1, 2, 3)]
    grip_q = {}
    for f in (F_LEAVE, F_FIN_END):
        K.At(f)
        for b in finger_bones:
            grip_q[(f, b)] = arm.pose.bones[b].rotation_quaternion.copy()

    ArmIk2(arm, "Right", keys, (F_LEAVE, F_GRIP), pole_keys, rkeys, blend=4, pole_angle=ang_r)

    # --- 第 4 步：右手五指：握把 -> 张开 -> 对捏 -> 张开 -> 握把
    pinch_q = {}
    for i in (1, 2, 3):
        pinch_q[f"RightHandThumb{i}"] = pinch["thumb"][i - 1]
        pinch_q[f"RightHandIndex{i}"] = pinch["index"][i - 1]
        for fn in ("Middle", "Ring", "Pinky"):
            pinch_q[f"RightHand{fn}{i}"] = pinch["others"][fn][i - 1]
    open_q = {}
    for b in finger_bones:
        fn = b[len("RightHand"):-1]
        amount = {"Thumb": 0.0, "Index": 0.2, "Middle": 0.45, "Ring": 0.5, "Pinky": 0.55}[fn]
        i = int(b[-1])
        open_q[b] = Quaternion((1, 0, 0), math.radians((55, 80, 60)[i - 1] * amount)) if fn != "Thumb" else Quaternion()
    sched = [(F_LEAVE, "grip"), (F_LEAVE + 6, "open"), (F_PINCH, "pinch"), (F_RETURN, "pinch"), (F_RETURN + 6, "open"), (F_FIN_END, "grip")]
    for b in finger_bones:
        pts = []
        for f, src in sched:
            q = grip_q[(f, b)] if src == "grip" else (open_q[b] if src == "open" else pinch_q[b])
            pts.append((f, q))
        for f in range(F_LEAVE, F_FIN_END + 1):
            for (f0, q0), (f1, q1) in zip(pts, pts[1:]):
                if f0 <= f <= f1:
                    w = 0.0 if f1 == f0 else Ease((f - f0) / (f1 - f0))
                    q = q0.slerp(q1, w)
                    break
            arm.pose.bones[b].rotation_quaternion = q
            arm.pose.bones[b].keyframe_insert("rotation_quaternion", frame=f)

    # --- 导出 + 报告
    # 预览里的时间 = 帧 / 30（GLB 第 1 帧在 1/30 s）
    timings = {"idle_start": 1 / 30, "release_grip": F_LEAVE / 30, "reach_knob": F_GRASP / 30,
               "pinch_knob": F_PINCH / 30, "up_done": F_UP / 30, "back_done": F_BACK / 30,
               "forward_done": F_FWD / 30, "down_done": F_DOWN / 30, "release_knob": F_RETURN / 30,
               "back_on_grip": F_GRIP / 30, "duration": N / 30}
    meta = {"base": BASE, "label": "站姿拉栓",
            "note": "中正式/三八式转栓：上翻、后拉、前推、下压；枪始终抵肩，左手托护木不动；首尾同姿势，可循环。"
                    "按中正式拉柄位置做（三八式拉柄更靠右约 4 cm，手会略偏）。"
                    "不涉及桥夹；拉到底时是弹壳抛出的时刻。",
            "timings": timings, "loop": True}
    TrimAction(arm, 1, N, log)
    K.Export(arm, NAME, meta)

    # 自测：每帧测量
    extra = {"timings": timings, "logs": logs}
    K.Report(arm, NAME, rifle=RIFLE, rifle_frame=1, extra=extra)
    Verify(arm, M0, rifle, HoldAt, log)


def Verify(arm, M0, rifle, HoldAt, log):
    """成品后自检：手速、左手漂移、脚漂移、接触距离。"""
    m_pin = None
    K.At(1)
    pin = K.BoneMatrix(arm, "LeftHand", 1).inverted() @ K.RifleFrame(arm, 1)
    lp0, lf0, rf0 = K.Palm(arm, "Left", 1), K.BoneHead(arm, "LeftFoot", 1), K.BoneHead(arm, "RightFoot", 1)
    max_speed, max_ldrift, max_ft = 0.0, 0.0, 0.0
    prev = None
    contact = {}
    for f in range(1, N + 1):
        K.At(f)
        rp = K.Palm(arm, "Right")
        if prev is not None:
            max_speed = max(max_speed, (rp - prev).length * 30)
        prev = rp
        max_ldrift = max(max_ldrift, (K.Palm(arm, "Left") - lp0).length)
        max_ft = max(max_ft, (K.BoneHead(arm, "LeftFoot") - lf0).length, (K.BoneHead(arm, "RightFoot") - rf0).length)
        m = K.BoneMatrix(arm, "LeftHand") @ pin
        pts = {"knob": "knob", "knobUp": "knobUp", "knobBack": "knobBack"}
        for nm in pts:
            contact.setdefault(nm, []).append((f, (rp - m @ Vector(rifle[nm])).length))
    log(f"VERIFY max right-palm speed {max_speed:.2f} m/s; left palm drift max {max_ldrift * 100:.2f} cm; feet drift max {max_ft * 100:.2f} cm")
    for f in (F_GRASP, F_UP, F_BACK, F_FWD, F_DOWN):
        _, _, kn = HoldAt(f)
        K.At(f)
        log(f"  frame {f}: palm to *moving* knob (design) {(K.Palm(arm, 'Right') - kn).length * 100:.2f} cm; "
            + ", ".join(f"d_{n}={dict(v)[f] * 100:.1f}" for n, v in contact.items()))
    # 指节到球头的实际距离（骨头线到球心，米 -> mm），球头跟着手柄走
    for f in (F_GRASP, F_UP, F_BACK, F_FWD, F_DOWN):
        _, _, kn = HoldAt(f)
        K.At(f)
        h = lambda n: K.BoneHead(arm, "RightHand" + n)
        tseg = SegDist(kn, h("Thumb3"), h("Thumb4"))
        iseg = SegDist(kn, h("Index3"), h("Index4"))
        i2 = SegDist(kn, h("Index2"), h("Index3"))
        mseg = min(SegDist(kn, h("Middle2"), h("Middle3")), SegDist(kn, h("Middle3"), h("Middle4")))
        loc = lambda p: Fmt(M0.inverted() @ p, 3)
        log(f"  frame {f}: knob->thumb seg {tseg * 1000:.1f} mm, index distal {iseg * 1000:.1f}, index mid {i2 * 1000:.1f}, middle {mseg * 1000:.1f}; "
            f"palm(w) {loc(K.Palm(arm, 'Right'))} knob(w) {loc(kn)} thumb4(w) {loc(h('Thumb4'))} index4(w) {loc(h('Index4'))}")
    # 手和头的距离（脸可以离枪托，但手不能撞脸）
    for f in (1, F_UP, F_BACK, F_FWD):
        K.At(f)
        head = K.BoneHead(arm, "Head")
        mid = head.lerp(arm.matrix_world @ arm.pose.bones["Head"].tail, 0.4)
        tips = min((K.BoneHead(arm, "RightHand" + n) - mid).length for n in ("Thumb4", "Index4", "Middle4", "Pinky4", "Index2"))
        log(f"  frame {f}: right palm to head centre {(K.Palm(arm, 'Right') - mid).length * 100:.1f} cm, nearest fingertip {tips * 100:.1f} cm")
    for f in (1, F_GRASP, F_UP, F_BACK, F_FWD, F_DOWN):
        K.At(f)
        log(f"  frame {f}: right elbow {Fmt(K.BoneHead(arm, 'RightForeArm'))} right shoulder joint {Fmt(K.BoneHead(arm, 'RightArm'))} "
            f"elbow bend {math.degrees((K.BoneHead(arm, 'RightArm') - K.BoneHead(arm, 'RightForeArm')).angle(K.BoneHead(arm, 'RightHand') - K.BoneHead(arm, 'RightForeArm'))):.0f} deg")
    # 首尾差
    K.At(1)
    a = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
    K.At(N)
    worst = max((pb.rotation_quaternion.rotation_difference(a[pb.name]).angle for pb in arm.pose.bones))
    log(f"VERIFY loop seam: worst bone rotation difference {math.degrees(worst):.3f} deg")


Main()

# StretcherFrontJog「担架·抬前头小跑」 (Claude, 2026-11-01)
#
# 这是什么：抬担架走在前头的人小跑。担架在他身后，两根杆从他身体两侧过去，他两手在胯两侧略靠后攥着杆（杆沿前后方向），
#   两臂下垂吃重，身体照小跑的节奏但负重略前倾、起伏压小、步子沉，原地循环（loop: true）。
#   预览里担架自动挂在两手掌心的中点上、在他身后；这条动作只管人，不管担架。
#
# 改自：Animation_Mixamo_SlowRun_V1（空手慢跑，原地循环，23 帧 = 0.733 s，最后一帧 = 第 1 帧）。
#   第二版（复审要求：平稳碎步，不是蹲着往前冲）。把原件改成「抬担架的平稳碎步」：
#     * 整条放慢 TIME_STRETCH 倍（周期约 0.97 s，30 帧）：靠在原件小数帧上取值（Blender 子帧求值）重采样；
#     * 髋整体抬高 0.09 m（原件髋 0.84-0.98 m，现在 0.985-1.013 m），上下起伏只留原件的 BOUNCE_K = 20%，
#       所以支撑相膝内角最小 143 度（摆动相屈膝照常，最小 108 度）；
#     * 步幅压到原件的 STRIDE = 0.58 倍，摆动脚抬高压到 FOOT_LIFT = 0.6 倍，脚的朝向做 FOOT_SMOOTH 遍平滑
#       （位置不动，所以不影响滑步；原件脚跟-脚掌翻转太快，大腿/膝每帧转角超限）；
#     * 躯干比原件少前倾 11 度（原件前倾约 24 度，现在平均 12 度、最大 14 度），脖子和头反向补回 80%；
#     * 躯干绕脊柱的扭转压掉 TWIST_DAMP = 90%、侧倾压掉 ROLL_DAMP = 85%（两手攥杆不甩臂，两肩不一高一低，手臂长度才稳）；
#     * 两肩锁骨往下压约 5 cm；
#     * 双臂逐帧 IK：掌心钉在「两手同高、相距 0.58 m、在髋关节后面」的目标上；高度固定在 PALM_H，只有肩膀抬高到
#       手臂会被拉直时才把两手一起抬到刚好够得着（所以手靠身体平稳，不靠肘吸收起伏），前后随髋 KF 倍，左右随两肩中点 KX 倍；
#     * 脚趾按周期平滑（原件脚趾单帧突弹）；
#     * 双手握拳攥杆（食指侧朝前、指尖朝下、掌心朝内），握拳姿势全程不变；
#     * 循环接缝：最后 8 帧把残差用缓入缓出摊开（不是把末帧直接复制成首帧）；末帧 = 首帧是周期端点，
#       three 里循环时 t = T 与 t = 0 同一姿势，不会停一帧。
#
# 关键帧时间表（秒，30 fps，帧号 = 1 + 秒 * 30）：整条是一个完整跑步周期（约 0.97 s，两步各约 0.48 s），首帧 = 末帧，原地。手不分阶段，全程钉着。
#
# 史实：担架是竹竿布兜担架，两个人一前一后抬，伤员 60-70 kg，每头约 35 kg；运伤员急行军是快步小跑，
#   负重小跑步子短、起伏小、手臂不甩，因为两手攥着杆。1938 年没有现代担架肩带，抬杆就是双手攥竹竿。
#
# 自己加的东西（工具包没有）：同 StretcherFrontWalk（逐帧 IK、符号现场探、握拳手指、测量写进 report.json 的 mine 字段）。
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "StretcherFrontJog"
BASE = "Animation_Mixamo_SlowRun_V1"
LABEL = "担架·抬前头小跑"
FPS = 30

# ----------------------------------------------------------------------------- 可调参数
LEAN = -11.0             # 躯干整体前倾（度），在原件的基础上再加
HEAD_COMP = 0.80        # 脖子+头反向补回的比例
DROP = -0.090           # 髋整体下沉（米）
HIPS_BACK = 0.010       # 髋往后挪（米，前倾时重心回一点）
BOUNCE_K = 0.20         # 髋上下起伏保留的比例
STRIDE = 0.58           # 步幅（脚前后位置相对身体中线压缩的比例）
SHOULDER_DROP = 0.050   # 肩膀往下沉的距离（米）
PALM_H = 0.762          # 掌心离地（米，均值）
PALM_BACK = 0.08        # 掌心在髋关节后面多少（米，均值）
HALF_SPACING = 0.29     # 两掌心相距 0.58 m 的一半
KZ, KF, KX = 0.60, 0.50, 0.90   # 掌心随髋的高度/前后/左右起伏的比例
HAND_F_BLEND = 0.5      # 手指方向 = 肩到掌心方向与竖直向下的混合比例（0 = 竖直向下）
FIST = dict(Index=(55, 75, 50), Middle=(60, 80, 55), Ring=(65, 85, 55), Pinky=(70, 85, 55))
LOOP = True
TIME_STRETCH = 1.30      # 整条放慢的倍数（原件 0.73 s 一个周期，腿每帧转角超过 12 度；负重小跑本来也该慢一点）
ADAPT_DMAX = 0.605       # 肩到掌心的距离上限（再远手臂就伸直够不着）
TWIST_DAMP = 0.9         # 躯干/脖子/头绕脊柱方向的扭转（跑步时肩与髋反向扭）压掉的比例：两手攥着杆不甩，肩膀不会大幅反扭
ROLL_DAMP = 0.85         # 躯干侧倾压掉的比例
FOOT_LIFT = 0.60          # 摆动脚抬多高保留的比例（碎步，脚不抬那么高）
FOOT_SMOOTH = 6          # 脚朝向平滑遍数
REF = "hips"            # 掌心随动的参照：髋（hips）或两肩中点（shoulders）
STANCE_DZ = 0.020        # 站定段：脚踝高度低于该脚最低值多少米以内
SIDES = ("Right", "Left")
SGN = {"Right": 1.0, "Left": -1.0}

LOG_PATH = None


def log(s):
    print("[StretcherFrontJog]", s)
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(s + "\n")


def R3(m):
    return m.to_3x3().normalized()


def Fmt(v, n=3):
    return tuple(round(x, n) for x in v)


def Mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs)


# ----------------------------------------------------------------------------- 手的朝向（四指方向 f、食指-小指方向 a）
def HandBasis(arm, side, frame):
    K.At(frame)
    q = R3(K.BoneMatrix(arm, f"{side}Hand"))
    hand = K.BoneHead(arm, f"{side}Hand")
    f = (K.BoneHead(arm, f"{side}HandMiddle1") - hand).normalized()
    a = K.BoneHead(arm, f"{side}HandIndex1") - K.BoneHead(arm, f"{side}HandPinky1")
    a = (a - f * a.dot(f)).normalized()
    n = a.cross(f)
    inv = q.inverted()
    return q, inv @ f, inv @ n, inv @ a


def OrientMatrix(local_basis, f_w, a_w):
    """让手的 (四指方向, 食指-小指方向) 对齐 f_w, a_w 的手骨头世界旋转（3x3）。"""
    lf, ln, la = local_basis
    f_w = Vector(f_w).normalized()
    a_w = Vector(a_w)
    a_w = (a_w - f_w * a_w.dot(f_w)).normalized()
    n_w = a_w.cross(f_w)
    wm = Matrix((f_w, n_w, a_w)).transposed()
    lm = Matrix((lf, ln, la)).transposed()
    return wm @ lm.inverted()


# ----------------------------------------------------------------------------- IK 工具
def PickPoleAngle(arm, tip_bone, root_bone, frame, target_pos, pole_pos):
    """扫极点角度，挑让中间关节（肘/膝）偏向极点那一侧最多的角度。"""
    K.At(frame)
    target, pole_obj = K._Empty("IKtest"), K._Empty("PoleTest", pole_pos)
    target.location = target_pos
    tip = arm.pose.bones[tip_bone]
    ik = tip.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole_obj
    root = K.BoneHead(arm, root_bone)
    best = (-2, None)
    for ang in range(-180, 180, 10):
        ik.pole_angle = math.radians(ang)
        bpy.context.view_layer.update()
        mid = arm.matrix_world @ tip.head
        axis = (target_pos - root).normalized()
        bend = mid - (root + axis * (mid - root).dot(axis))
        want = pole_pos - (root + axis * (pole_pos - root).dot(axis))
        cos = bend.normalized().dot(want.normalized()) if bend.length > 1e-6 else -1
        if cos > best[0]:
            best = (cos, ang)
    tip.constraints.remove(ik)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)
    log(f"  pole angle {tip_bone}: {best[1]} (cos {best[0]:.3f})")
    return best[1]


def LimbIk(arm, tip_bone, tail_bone, frames, pos_keys, quat_keys, pole_keys, pole_angle, tag):
    """tip_bone：IK 末端所在骨（前臂/小腿）；tail_bone：之后要拷贝朝向的骨（手/脚）。逐帧目标/极点。"""
    target = K._Empty(f"IK_{tag}")
    target.rotation_mode = "QUATERNION"
    pole_obj = K._Empty(f"Pole_{tag}")
    prev = None
    for f in frames:
        target.location = pos_keys[f]
        target.keyframe_insert("location", frame=f)
        q = quat_keys[f].copy()
        if prev is not None and q.dot(prev) < 0:
            q.negate()
        prev = q
        target.rotation_quaternion = q
        target.keyframe_insert("rotation_quaternion", frame=f)
        pole_obj.location = pole_keys[f]
        pole_obj.keyframe_insert("location", frame=f)
    ik = arm.pose.bones[tip_bone].constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    ik.pole_target, ik.pole_angle = pole_obj, math.radians(pole_angle)
    rot = arm.pose.bones[tail_bone].constraints.new("COPY_ROTATION")
    rot.target = target
    return target, pole_obj


def Trim(arm, first, last):
    act = arm.animation_data.action
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in list(cb.fcurves):
                    if "constraints" in fc.data_path:
                        cb.fcurves.remove(fc)
                        continue
                    for kp in reversed(list(fc.keyframe_points)):
                        if kp.co[0] < first - 1e-4 or kp.co[0] > last + 1e-4:
                            fc.keyframe_points.remove(kp)


# ----------------------------------------------------------------------------- 手指
def FistQuats(side, signs):
    out = {}
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            out[f"{side}Hand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(signs * FIST[fn][i]))
    return out


def ProbeFingerSign(arm, side, base_pose):
    """绕本地 X 转正角度，指尖是靠近还是远离掌心？返回让指尖靠近掌心的符号。"""
    K.At(1)
    palm = K.Palm(arm, side)
    res = {}
    for sgn in (1.0, -1.0):
        for name, q in FistQuats(side, sgn).items():
            arm.pose.bones[name].rotation_quaternion = q
        bpy.context.view_layer.update()
        tip = arm.matrix_world @ arm.pose.bones[f"{side}HandIndex3"].tail
        res[sgn] = (tip - K.Palm(arm, side)).length
    for name, q in base_pose.items():
        arm.pose.bones[name].rotation_quaternion = q
    bpy.context.view_layer.update()
    best = min(res, key=lambda k: res[k])
    log(f"  finger curl sign {side}: +X -> tip-palm {res[1.0] * 100:.1f} cm, -X -> {res[-1.0] * 100:.1f} cm, use {best:+.0f}")
    return best


def ThumbSearch(arm, side, fist_signs):
    """让拇指尖贴近食指中节的位置（握杆时拇指扣在食指上），在一小批候选里挑。"""
    K.At(1)
    for name, q in FistQuats(side, fist_signs).items():
        arm.pose.bones[name].rotation_quaternion = q
    bpy.context.view_layer.update()
    target = arm.matrix_world @ arm.pose.bones[f"{side}HandIndex2"].head
    best = (9.0, None)
    for x1 in (-30, 0, 30):
        for z1 in (-40, -20, 0, 20, 40):
            for x2 in (-40, 0, 40):
                for x3 in (-50, 0, 50):
                    qs = [Quaternion((0, 0, 1), math.radians(z1)) @ Quaternion((1, 0, 0), math.radians(x1)),
                          Quaternion((1, 0, 0), math.radians(x2)), Quaternion((1, 0, 0), math.radians(x3))]
                    for i, q in enumerate(qs):
                        arm.pose.bones[f"{side}HandThumb{i + 1}"].rotation_quaternion = q
                    bpy.context.view_layer.update()
                    tip = arm.matrix_world @ arm.pose.bones[f"{side}HandThumb3"].tail
                    d = (tip - target).length
                    if d < best[0]:
                        best = (d, qs)
    log(f"  thumb search {side}: tip to index-middle-phalanx {best[0] * 100:.1f} cm")
    return best[1]


def AtB(f, N0, N):
    """把新时间轴上的第 f 帧映射回原件的时间（含小数帧）并求值。"""
    tb = 1 + (f - 1) * (N0 - 1) / (N - 1)
    fl = int(math.floor(tb + 1e-9))
    bpy.context.scene.frame_set(fl, subframe=max(0.0, tb - fl))


def Flatten(arm):
    slot = arm.animation_data.action_slot
    cb = arm.animation_data.action.layers[0].strips[0].channelbag(slot)
    n = 0
    for fc in list(cb.fcurves):
        if fc.data_path.startswith("pose.bones"):
            cb.fcurves.remove(fc)
            n += 1
    return n


# ----------------------------------------------------------------------------- 主流程
def Main():
    global LOG_PATH
    os.makedirs(K.AUTHORED, exist_ok=True)
    LOG_PATH = os.path.join(K.AUTHORED, NAME + ".log.txt")
    open(LOG_PATH, "w").close()
    arm = K.LoadBase(BASE)
    scene = bpy.context.scene
    N0 = int(scene.frame_end)
    N = int(round((N0 - 1) * TIME_STRETCH)) + 1
    frames = list(range(1, N + 1))
    cyc = frames[:-1]                      # 最后一帧 = 第 1 帧，求平均时不重复算
    DURATION = (N - 1) / FPS
    log(f"base {BASE}, base frames 1..{N0}, stretched to 1..{N} ({DURATION:.3f} s, x{(N - 1) / (N0 - 1):.3f})")

    # --- 坐标轴：右、前
    K.At(1)
    rv = K.BoneHead(arm, "RightArm") - K.BoneHead(arm, "LeftArm")
    rv.z = 0
    RA = rv.normalized()
    FA = Vector((0, 0, 1)).cross(RA)
    UP = Vector((0, 0, 1))
    log(f"right axis {Fmt(RA)}  forward axis {Fmt(FA)}")

    # --- 记录原件逐帧数据
    EDIT = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "RightShoulder", "LeftShoulder", "LeftToeBase", "RightToeBase"]
    FINGER_BONES = [f"{s}Hand{fn}{i}" for s in SIDES for fn in ("Thumb", "Index", "Middle", "Ring", "Pinky") for i in (1, 2, 3)]
    K.At(1)
    neutral = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
    base = {}
    for f in frames:
        AtB(f, N0, N)
        base[f] = dict(
            hips=K.BoneHead(arm, "Hips"),
            sh={s: K.BoneHead(arm, f"{s}Arm") for s in SIDES},
            hipj={s: K.BoneHead(arm, f"{s}UpLeg") for s in SIDES},
            foot={s: K.BoneHead(arm, f"{s}Foot") for s in SIDES},
            footR={s: R3(K.BoneMatrix(arm, f"{s}Foot")) for s in SIDES},
            knee={s: K.BoneHead(arm, f"{s}Leg") for s in SIDES},
            loc={n: arm.pose.bones[n].location.copy() for n in EDIT},
            q={n: arm.pose.bones[n].rotation_quaternion.normalized() for n in EDIT + FINGER_BONES},
        )

    # 躯干扭转减弱：脊柱/脖子/头的局部旋转拆成「绕本地 Y（沿脊柱）的扭转」和「其余」，扭转部分乘 (1 - TWIST_DAMP)
    for f in frames:
        for tn in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
            q = base[f]["q"][tn]
            tw = Quaternion((q.w, 0.0, q.y, 0.0))
            if tw.magnitude < 1e-6:
                continue
            tw.normalize()
            swing = q @ tw.inverted()
            tw2 = Quaternion((1, 0, 0, 0)).slerp(tw, 1.0 - TWIST_DAMP)
            base[f]["q"][tn] = (swing @ tw2).normalized()
            # 侧倾（绕本地 Z）同样压掉：两肩不再一高一低，手臂长度才稳
            q = base[f]["q"][tn]
            rz = Quaternion((q.w, 0.0, 0.0, q.z))
            if rz.magnitude > 1e-6:
                rz.normalize()
                sw2 = q @ rz.inverted()
                base[f]["q"][tn] = (sw2 @ Quaternion((1, 0, 0, 0)).slerp(rz, 1.0 - ROLL_DAMP)).normalized()

    # 循环闭合检查（原件首尾差）
    worst = []
    for n in base[1]["q"]:
        a, b = base[1]["q"][n], base[N]["q"][n]
        worst.append((math.degrees(2 * math.acos(min(1.0, abs(a.dot(b))))), n))
    worst.sort(reverse=True)
    log("base loop closure worst bones (deg): " + ", ".join(f"{n} {d:.2f}" for d, n in worst[:5]))

    # --- 探符号：髋位置的雅可比（本地一个单位 -> 世界位移）
    K.At(1)
    pbh = arm.pose.bones["Hips"]
    loc0 = pbh.location.copy()
    h0 = K.BoneHead(arm, "Hips")
    cols = []
    for i in range(3):
        v = Vector((0, 0, 0))
        v[i] = 1.0
        pbh.location = loc0 + v
        bpy.context.view_layer.update()
        cols.append(K.BoneHead(arm, "Hips") - h0)
    pbh.location = loc0
    bpy.context.view_layer.update()
    J = Matrix((cols[0], cols[1], cols[2])).transposed()
    Jinv = J.inverted()
    log(f"hips jacobian columns (world per local unit): {[Fmt(c, 4) for c in cols]}")

    # 脊柱前倾符号：Spine 绕本地 X 转 +5 度，肩膀往前走还是往后走
    K.At(1)
    sp = arm.pose.bones["Spine"]
    q0 = sp.rotation_quaternion.copy()
    s0 = K.BoneHead(arm, "RightArm")
    sp.rotation_quaternion = q0 @ Quaternion((1, 0, 0), math.radians(5))
    bpy.context.view_layer.update()
    shift = (K.BoneHead(arm, "RightArm") - s0).dot(FA)
    sp.rotation_quaternion = q0
    bpy.context.view_layer.update()
    LEAN_SGN = 1.0 if shift > 0 else -1.0
    log(f"lean sign: +X on Spine moves shoulder {shift * 100:+.2f} cm forward -> sign {LEAN_SGN:+.0f}")

    # 锁骨下压：试 6 个候选（X/Y/Z 正负），挑让肩关节往下掉最多的
    def ShoulderProbe(side):
        pb = arm.pose.bones[f"{side}Shoulder"]
        K.At(1)
        qs = pb.rotation_quaternion.copy()
        a0 = K.BoneHead(arm, f"{side}Arm")
        best = (0.0, None)
        for axi, axv in enumerate(((1, 0, 0), (0, 1, 0), (0, 0, 1))):
            for sgn in (1.0, -1.0):
                pb.rotation_quaternion = qs @ Quaternion(axv, math.radians(10 * sgn))
                bpy.context.view_layer.update()
                drop = a0.z - K.BoneHead(arm, f"{side}Arm").z
                if drop > best[0]:
                    best = (drop, (axv, sgn))
        pb.rotation_quaternion = qs
        bpy.context.view_layer.update()
        drop10, (axv, sgn) = best
        ang = min(32.0, 10.0 * SHOULDER_DROP / drop10)
        log(f"  shoulder {side}: axis {axv} sign {sgn:+.0f} drops {drop10 * 100:.2f} cm per 10 deg -> use {ang:.1f} deg")
        return Quaternion(axv, math.radians(sgn * ang))

    sh_delta = {s: ShoulderProbe(s) for s in SIDES}

    # 手指符号和拇指
    fist_sign, thumb_q = {}, {}
    for s in SIDES:
        K.At(1)
        pose0 = {n: arm.pose.bones[n].rotation_quaternion.copy() for n in FINGER_BONES if n.startswith(s)}
        fist_sign[s] = ProbeFingerSign(arm, s, pose0)
        thumb_q[s] = ThumbSearch(arm, s, fist_sign[s])
        for n, q in pose0.items():
            arm.pose.bones[n].rotation_quaternion = q
        bpy.context.view_layer.update()

    # 手的本地基底（原件第 1 帧）、掌心偏移
    info = {}
    for s in SIDES:
        q0h, lf, ln, la = HandBasis(arm, s, 1)
        v_loc = q0h.inverted() @ (K.Palm(arm, s, 1) - K.BoneHead(arm, f"{s}Hand", 1))
        info[s] = dict(basis=(lf, ln, la), v_loc=v_loc)
        K.At(1)
        log(f"  {s} hand at base frame 1: fingers {Fmt(q0h @ lf)}, index-pinky {Fmt(q0h @ la)}")

    # --- 压平：原件动画曲线全部去掉（之后每根动的骨头都逐帧自己写），其余骨头停在原件第 1 帧
    removed = Flatten(arm)
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion = neutral[pb.name][0].copy(), neutral[pb.name][1].copy()
    scene.frame_start, scene.frame_end = 1, N
    bpy.context.view_layer.update()
    log(f"flattened {removed} fcurves; scene frames 1..{N}")

    # --- 脚趾：原件的脚趾在脚尖离地那一帧会一下子弹回 0（单帧 19 度），按周期做 5 点平滑，免得出现突刺
    toe_s = {}
    for tn in ("LeftToeBase", "RightToeBase"):
        ref = base[1]["q"][tn]
        arr = []
        for f in cyc:
            q = base[f]["q"][tn].copy()
            if q.dot(ref) < 0:
                q.negate()
            arr.append(q)
        n = len(arr)
        for _ in range(2):
            out_ = []
            for i in range(n):
                acc = Quaternion((0, 0, 0, 0))
                for k, w in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1)):
                    qq = arr[(i + k) % n]
                    acc = Quaternion((acc.w + qq.w * w, acc.x + qq.x * w, acc.y + qq.y * w, acc.z + qq.z * w))
                acc.normalize()
                out_.append(acc)
            arr = out_
        toe_s[tn] = {f: arr[f - 1] for f in cyc}
        toe_s[tn][N] = arr[0]

    # --- 髋、躯干、头、锁骨：逐帧关键帧
    mean_hz = Mean(base[f]["hips"].z for f in cyc)
    mean_hy = Mean(base[f]["hips"].dot(FA) for f in cyc)
    shares = (("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35))
    head_shares = (("Neck", 0.4), ("Head", 0.6))
    for f in frames:
        K.At(f)
        hz = base[f]["hips"].z
        dz = (mean_hz - DROP + BOUNCE_K * (hz - mean_hz)) - hz
        delta = UP * dz - FA * HIPS_BACK
        pb = arm.pose.bones["Hips"]
        pb.location = base[f]["loc"]["Hips"] + Jinv @ delta
        pb.keyframe_insert("location", frame=f)
        for name, share in shares:
            pb = arm.pose.bones[name]
            pb.rotation_quaternion = base[f]["q"][name] @ Quaternion((1, 0, 0), math.radians(LEAN_SGN * LEAN * share))
            pb.keyframe_insert("rotation_quaternion", frame=f)
        for name, share in head_shares:
            pb = arm.pose.bones[name]
            pb.rotation_quaternion = base[f]["q"][name] @ Quaternion((1, 0, 0), math.radians(-LEAN_SGN * LEAN * HEAD_COMP * share))
            pb.keyframe_insert("rotation_quaternion", frame=f)
        for tn in ("LeftToeBase", "RightToeBase"):
            pb = arm.pose.bones[tn]
            pb.rotation_quaternion = toe_s[tn][f]
            pb.keyframe_insert("rotation_quaternion", frame=f)
        for s in SIDES:
            pb = arm.pose.bones[f"{s}Shoulder"]
            pb.rotation_quaternion = base[f][f"q"][f"{s}Shoulder"] @ sh_delta[s]
            pb.keyframe_insert("rotation_quaternion", frame=f)
        # 手指：握拳（所有帧同一个姿势，覆盖原件的摆动）
        for s in SIDES:
            qs = FistQuats(s, fist_sign[s])
            for i in range(3):
                qs[f"{s}HandThumb{i + 1}"] = thumb_q[s][i]
            for n, q in qs.items():
                pb = arm.pose.bones[n]
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f)

    # --- 编辑之后的世界位置
    new = {}
    for f in frames:
        K.At(f)
        new[f] = dict(hips=K.BoneHead(arm, "Hips"),
                      sh={s: K.BoneHead(arm, f"{s}Arm") for s in SIDES},
                      hipj={s: K.BoneHead(arm, f"{s}UpLeg") for s in SIDES})
    def RefPt(f):
        if REF == "shoulders":
            return (new[f]["sh"]["Right"] + new[f]["sh"]["Left"]) * 0.5
        return new[f]["hips"]
    nz = Mean(RefPt(f).z for f in cyc)
    ny = Mean(RefPt(f).dot(FA) for f in cyc)
    nx = Mean(RefPt(f).dot(RA) for f in cyc)
    hipj_fwd = Mean(Mean(new[f]["hipj"][s].dot(FA) for s in SIDES) for f in cyc)
    log(f"after edit: hips z mean {nz:.3f} (was {mean_hz:.3f}); hip joint fwd mean {hipj_fwd:.3f}")

    # --- 掌心目标
    # 左右、前后：跟着髋做很小的随动。高度：两手同高，定在 PALM_H；只有某一帧肩膀抬得太高、手臂（肩到掌心）会被拉过
    # ADAPT_DMAX 时，才把两只手一起抬到刚好够得着的高度（肩膀低的时候手臂自然弯一点），再做两次 1-2-1 平滑去棱角。
    shx_mean = Mean(((new[f]["sh"]["Right"] + new[f]["sh"]["Left"]) * 0.5).dot(RA) for f in cyc)
    pxy = {}
    for f in frames:
        hy = RefPt(f).dot(FA)
        shx = ((new[f]["sh"]["Right"] + new[f]["sh"]["Left"]) * 0.5).dot(RA)
        y = hipj_fwd - PALM_BACK + KF * (hy - ny)
        xc = shx_mean + KX * (shx - shx_mean)
        for s in SIDES:
            pxy[(f, s)] = RA * (xc + SGN[s] * HALF_SPACING) + FA * y
    zraw = {}
    for f in frames:
        zl = PALM_H
        for s in SIDES:
            sh = new[f]["sh"][s]
            dh2 = (pxy[(f, s)].x - sh.x) ** 2 + (pxy[(f, s)].y - sh.y) ** 2
            zl = max(zl, sh.z - math.sqrt(max(ADAPT_DMAX ** 2 - dh2, 0.01)))
        zraw[f] = zl
    arr = [zraw[f] for f in cyc]
    n_ = len(arr)
    for _ in range(2):
        arr = [(arr[(i - 1) % n_] + 2 * arr[i] + arr[(i + 1) % n_]) / 4 for i in range(n_)]
    zfin = {f: arr[f - 1] for f in cyc}
    zfin[N] = arr[0]
    rises = [zfin[f] - PALM_H for f in frames]
    palm_t, wrist_t, quat_t, pole_t = {}, {}, {}, {}
    for f in frames:
        for s in SIDES:
            palm = Vector((pxy[(f, s)].x, pxy[(f, s)].y, zfin[f]))
            palm_t[(f, s)] = palm
            fvec = (palm - new[f]["sh"][s]).normalized()
            fdir = (fvec * HAND_F_BLEND + (-UP) * (1 - HAND_F_BLEND)).normalized()
            Rm = OrientMatrix(info[s]["basis"], fdir, FA)
            wrist = palm - Rm @ info[s]["v_loc"]
            wrist_t[(f, s)] = wrist
            quat_t[(f, s)] = Rm.to_quaternion()
            out = (RA * SGN[s] * 0.6 - FA * 0.5 - UP * 0.2).normalized()
            pole_t[(f, s)] = (new[f]["sh"][s] + wrist) * 0.5 + out * 0.5

    for f in frames:
        log("   f%d  hipsz %.3f  shR z %.3f dist %.3f | shL z %.3f dist %.3f | palm z %.3f" % (f, new[f]["hips"].z, new[f]["sh"]["Right"].z, (new[f]["sh"]["Right"] - palm_t[(f, "Right")]).length, new[f]["sh"]["Left"].z, (new[f]["sh"]["Left"] - palm_t[(f, "Left")]).length, zfin[f]))
    log(f"reach rise applied: max {max(rises) * 100:.1f} cm, frames with rise > 0: {sum(1 for r in rises if r > 1e-6)}")
    objs = []
    for s in SIDES:
        # 极点角度：用第 1 帧、目标往肩膀方向收 6 cm（让肘有一点弯，能判方向）
        sh1 = new[1]["sh"][s]
        t_test = wrist_t[(1, s)] + (sh1 - wrist_t[(1, s)]).normalized() * 0.06
        ang = PickPoleAngle(arm, f"{s}ForeArm", f"{s}Arm", 1, t_test, pole_t[(1, s)])
        objs += LimbIk(arm, f"{s}ForeArm", f"{s}Hand", frames, {f: wrist_t[(f, s)] for f in frames},
                       {f: quat_t[(f, s)] for f in frames}, {f: pole_t[(f, s)] for f in frames}, ang, s[0])

    # --- 腿：脚踝位置（前后按步幅压缩）和朝向钉在原件
    foot_t = {}
    fz_min = {s_: min(base[f]["foot"][s_].z for f in cyc) for s_ in SIDES}
    for s in SIDES:
        pos, quat, pole = {}, {}, {}
        for f in frames:
            fp = base[f]["foot"][s]
            fy = fp.dot(FA)
            fp_new = fp + FA * ((mean_hy + STRIDE * (fy - mean_hy)) - fy)
            fp_new.z = fz_min[s] + FOOT_LIFT * (fp.z - fz_min[s])
            pos[f] = fp_new
            quat[f] = base[f]["footR"][s].to_quaternion()
            if f > 1 and quat[f].dot(quat[f - 1]) < 0:
                quat[f].negate()
            hj = new[f]["hipj"][s]
            pole[f] = (hj + fp_new) * 0.5 + (FA + RA * SGN[s] * 0.12).normalized() * 0.5
        # 脚的朝向做 FOOT_SMOOTH 遍 1-2-1 周期平滑（原件脚跟-脚掌翻转太快，每帧转角超限）；位置不动，所以不影响滑步
        arr = [quat[f] for f in cyc]
        n_ = len(arr)
        for _ in range(FOOT_SMOOTH):
            nxt = []
            for i in range(n_):
                a_, b_, c_ = arr[(i - 1) % n_], arr[i], arr[(i + 1) % n_]
                if a_.dot(b_) < 0:
                    a_ = Quaternion((-a_.w, -a_.x, -a_.y, -a_.z))
                if c_.dot(b_) < 0:
                    c_ = Quaternion((-c_.w, -c_.x, -c_.y, -c_.z))
                q = Quaternion((a_.w + 2 * b_.w + c_.w, a_.x + 2 * b_.x + c_.x, a_.y + 2 * b_.y + c_.y, a_.z + 2 * b_.z + c_.z))
                q.normalize()
                nxt.append(q)
            arr = nxt
        for f in cyc:
            quat[f] = arr[f - 1]
        quat[N] = arr[0]
        foot_t[s] = pos
        ang = PickPoleAngle(arm, f"{s}Leg", f"{s}UpLeg", 1, pos[1], pole[1])
        objs += LimbIk(arm, f"{s}Leg", f"{s}Foot", frames, pos, quat, pole, ang, s[0] + "Leg")
    bones = [f"{s}{b}" for s in SIDES for b in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot")]
    K._BakeBones(arm, bones, 1, N)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    Trim(arm, 1, N)
    K.At(1)

    # --- 循环闭合：最后一帧逐骨设成第 1 帧（原件首尾本来就几乎一样，这里抹掉残差）
    K.At(1)
    q1 = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
    h1 = arm.pose.bones["Hips"].location.copy()
    K.At(N)
    diffs = sorted(((math.degrees(2 * math.acos(min(1.0, abs(pb.rotation_quaternion.dot(q1[pb.name]))))), pb.name) for pb in arm.pose.bones), reverse=True)
    log("loop closure before fix, worst bones (deg): " + ", ".join(f"{n} {d:.2f}" for d, n in diffs[:4]))
    qN = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
    hN = arm.pose.bones["Hips"].location.copy()
    dq = {n: qN[n].inverted() @ q1[n] for n in q1}
    SEAM = 8
    for f in range(N - SEAM, N + 1):
        w = (f - (N - SEAM)) / SEAM
        w = w * w * (3 - 2 * w)
        K.At(f)
        cur = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
        hcur = arm.pose.bones["Hips"].location.copy()
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (cur[pb.name] @ Quaternion((1, 0, 0, 0)).slerp(dq[pb.name], w)).normalized()
            pb.keyframe_insert("rotation_quaternion", frame=f)
        arm.pose.bones["Hips"].location = hcur + (h1 - hN) * w
        arm.pose.bones["Hips"].keyframe_insert("location", frame=f)
    log(f"seam: last {SEAM} frames blend the residual away smoothly (no copy of frame 1)")
    K.At(1)

    # --- 检查：IK 到位情况
    for s in SIDES:
        errs = []
        for f in frames:
            K.At(f)
            errs.append((K.Palm(arm, s) - palm_t[(f, s)]).length)
        for i, e in enumerate(errs):
            if e > 0.004:
                f = frames[i]
                K.At(f)
                log(f"   {s} f{f}: err {e * 100:.2f} cm, shoulder {Fmt(K.BoneHead(arm, f'{s}Arm'))} -> palm target {Fmt(palm_t[(f, s)])} dist {(K.BoneHead(arm, f'{s}Arm') - palm_t[(f, s)]).length:.3f}, wrist target dist {(K.BoneHead(arm, f'{s}Arm') - wrist_t[(f, s)]).length:.3f}")
        w = max(range(len(errs)), key=lambda i: errs[i])
        log(f"{s} palm vs target: max {errs[w] * 100:.2f} cm at {w / FPS:.2f}s, mean {Mean(errs) * 100:.2f} cm")
    for s in SIDES:
        errs = []
        for f in frames:
            K.At(f)
            errs.append((K.BoneHead(arm, f"{s}Foot") - foot_t[s][f]).length)
        log(f"{s} ankle vs target: max {max(errs) * 100:.2f} cm")

    # --- 手臂几何（诊断）
    for f in (1, N // 4 + 1, N // 2 + 1, 3 * N // 4 + 1):
        K.At(f)
        for s in ("Right",):
            sh, el, wr, pm = (K.BoneHead(arm, f"{s}Arm"), K.BoneHead(arm, f"{s}ForeArm"), K.BoneHead(arm, f"{s}Hand"), K.Palm(arm, s))
            log(f"  f{f} {s}: shoulder {Fmt(sh)} elbow {Fmt(el)} wrist {Fmt(wr)} palm {Fmt(pm)}  upper {(el - sh).length:.3f} fore {(wr - el).length:.3f} "
                f"shoulder->wrist {(wr - sh).length:.3f} shoulder->palm {(pm - sh).length:.3f}")

    # --- 测量
    rows = []
    for f in frames:
        K.At(f)
        pr, pl = K.Palm(arm, "Right"), K.Palm(arm, "Left")
        hj = (K.BoneHead(arm, "RightUpLeg") + K.BoneHead(arm, "LeftUpLeg")) * 0.5
        rows.append(dict(
            f=f, t=round((f - 1) / FPS, 3),
            palm_dist=(pr - pl).length, palm_dz=pr.z - pl.z, palm_z={"R": pr.z, "L": pl.z},
            palm_fwd={"R": pr.dot(FA), "L": pl.dot(FA)}, palm_x={"R": pr.dot(RA), "L": pl.dot(RA)},
            palm_behind_hip_joint={"R": (pr - K.BoneHead(arm, "RightUpLeg")).dot(FA), "L": (pl - K.BoneHead(arm, "LeftUpLeg")).dot(FA)},
            knee={s: InteriorAngle(K.BoneHead(arm, f"{s}UpLeg"), K.BoneHead(arm, f"{s}Leg"), K.BoneHead(arm, f"{s}Foot")) for s in SIDES},
            lean=math.degrees(math.atan2((K.BoneHead(arm, "Neck") - K.BoneHead(arm, "Hips")).dot(FA), (K.BoneHead(arm, "Neck") - K.BoneHead(arm, "Hips")).z)),
            elbow_angle={s: InteriorAngle(K.BoneHead(arm, f"{s}Arm"), K.BoneHead(arm, f"{s}ForeArm"), K.BoneHead(arm, f"{s}Hand")) for s in SIDES},
            foot={s: list(K.BoneHead(arm, f"{s}Foot")) for s in SIDES},
            hips=list(K.BoneHead(arm, "Hips")), head=list(K.BoneHead(arm, "Head")),
        ))

    def Rng(vals):
        vals = list(vals)
        return max(vals) - min(vals)

    summary = {}
    allz = [v for r in rows for v in r["palm_z"].values()]
    summary["palm_z_m_min_max"] = [round(min(allz), 3), round(max(allz), 3)]
    for s in ("R", "L"):
        summary[f"palm_{s}_z_range_cm"] = round(Rng(r["palm_z"][s] for r in rows) * 100, 2)
        summary[f"palm_{s}_fwd_range_cm"] = round(Rng(r["palm_fwd"][s] for r in rows) * 100, 2)
        summary[f"palm_{s}_x_range_cm"] = round(Rng(r["palm_x"][s] for r in rows) * 100, 2)
        bh = [r["palm_behind_hip_joint"][s] * 100 for r in rows]
        summary[f"palm_{s}_fwd_of_hip_joint_cm_min_max"] = [round(min(bh), 1), round(max(bh), 1)]
    d = [r["palm_dist"] for r in rows]
    summary["palm_dist_m_min_max"] = [round(min(d), 4), round(max(d), 4)]
    summary["palm_height_diff_cm_max"] = round(max(abs(r["palm_dz"]) for r in rows) * 100, 2)
    el = [v for r in rows for v in r["elbow_angle"].values()]
    summary["elbow_interior_deg_min_max"] = [round(min(el), 1), round(max(el), 1)]
    summary["lean_deg_mean_max"] = [round(Mean(r["lean"] for r in rows), 1), round(max(r["lean"] for r in rows), 1)]
    summary["knee_interior_min_all_deg"] = round(min(v for r in rows for v in r["knee"].values()), 1)
    kst = []
    for s in SIDES:
        zs = [r["foot"][s][2] for r in rows]
        zm = min(zs)
        kst += [r["knee"][s] for r, z in zip(rows, zs) if z < zm + STANCE_DZ]
    summary["knee_interior_min_stance_deg"] = round(min(kst), 1)
    summary["hips_z_m_min_max"] = [round(min(r["hips"][2] for r in rows), 3), round(max(r["hips"][2] for r in rows), 3)]

    # 站定脚：找着地段（踝高度低于该脚最低值 + 3 cm），在这段里对前后位置做直线拟合，看残差；同样量原件
    def StanceFit(series):
        zs = [p[2] for p in series]
        zmin = min(zs)
        idx = [i for i, z in enumerate(zs) if z < zmin + STANCE_DZ]
        # 取最长连续段（循环：把序列接一遍）
        n = len(series)
        best = (0, None)
        i = 0
        runs = []
        mark = [i in idx for i in range(n)]
        start = None
        for i in range(2 * n):
            if mark[i % n]:
                if start is None:
                    start = i
            else:
                if start is not None:
                    runs.append((start, i - 1))
                    start = None
        if start is not None:
            runs.append((start, 2 * n - 1))
        runs = [r for r in runs if r[1] - r[0] < n]
        if not runs:
            return None
        a, b = max(runs, key=lambda r: r[1] - r[0])
        pts = []
        for i in range(a, b + 1):
            p = series[i % n]
            pts.append((i - a, p.dot(FA) if hasattr(p, "dot") else 0))
        m = len(pts)
        if m < 3:
            return None
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        mx, my = Mean(xs), Mean(ys)
        sl = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
        res = max(abs(y - (my + sl * (x - mx))) for x, y in zip(xs, ys))
        return dict(frames=(a % n + 1, b % n + 1), n=m, speed_m_s=-sl * FPS, residual_cm=res * 100)

    cyc_n = len(cyc)
    stance = {}
    for s in SIDES:
        mine = StanceFit([Vector(rows[i]["foot"][s]) for i in range(cyc_n)])
        orig = StanceFit([base[f]["foot"][s] for f in cyc])
        stance[s] = dict(mine=mine, base=orig)
        log(f"stance {s}: mine {mine}  base {orig}")
    summary["stance"] = stance
    for k, v in summary.items():
        log(f"SUMMARY {k}: {v}")

    # 触地时间（脚踝最低且前后位置在身体前方最远的帧附近）：这里取踝高度从抬起转为最低段的起点
    contact = {}
    for s in SIDES:
        st = stance[s]["mine"]
        if st:
            contact[s] = round((st["frames"][0] - 1) / FPS, 3)

    timings = {"start": 0.0, "end": round(DURATION, 3), "cycle": round(DURATION, 3), "step": round(DURATION / 2, 3)}
    for s, t in contact.items():
        timings[f"{s}FootDown"] = t
    meta = {
        "base": BASE, "label": LABEL, "loop": LOOP, "duration": round(DURATION, 3), "timings": timings,
        "note": f"抬担架前头的人（小跑）：两手在胯两侧略靠后攥杆，掌心相距 0.58 m、同高、离地约 {PALM_H} m，两臂几乎伸直下垂；"
                f"平稳碎步：整条比原件放慢 {TIME_STRETCH} 倍（周期约 0.97 s），髋抬高、起伏只留原件的 {BOUNCE_K}，上身前倾约 12 度，步幅缩到原件的 {STRIDE} 倍；原地循环，首帧 = 末帧。"
                "预览里担架自动挂在两手中点、在他身后；站定脚前后速度见 report.json 的 mine.summary.stance。",
    }
    K.Export(arm, NAME, meta)
    K.Report(arm, NAME, extra={"timings": timings, "mine": {"summary": summary, "rows": rows}})


def InteriorAngle(a, b, c):
    u, v = (a - b).normalized(), (c - b).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, u.dot(v)))))


if __name__ == "__main__":
    Main()

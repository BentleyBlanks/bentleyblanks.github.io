# StretcherFrontWalk「担架·抬前头走」 (Claude, 2026-11-01)
#
# 这是什么：抬担架走在前头的人。担架在他身后，两根杆从他身体两侧过去，他两手在胯两侧略靠后握着杆（杆沿前后方向），
#   两臂伸直下垂吃重，上身略前倾拉着走，肩膀被拉得往下沉，步子稍短稍沉，一路原地循环走（loop: true）。
#   预览里担架会自动挂在两手掌心的中点上、在他身后；这条动作只管人，不管担架。
#
# 改自：Animation_Mixamo_Walking_V21（空手普通走，原地循环，38 帧 = 1.233 s，最后一帧 = 第 1 帧）。
#   腿、骨盆、躯干的节奏全部沿用原件逐帧数据，在上面叠加：
#     * 整个人下沉（髋低 DROP 米，上下起伏压到原来的 BOUNCE_K 倍），屈膝承重；
#     * 步幅缩到原来的 STRIDE 倍（脚的前后位置以身体中线为中心整体压缩，脚抬多高不变）；
#     * 躯干整体前倾 LEAN 度（脊柱三节分摊），脖子和头反向补回大部分，视线仍朝前；
#     * 两肩锁骨往下压（肩膀被负重拽低）；
#     * 双臂逐帧 IK：掌心钉在「两手同高、相距 0.58 m、在髋关节后面」的目标上，目标只跟着身体起伏做很小的随动
#       （高度随髋的 KZ 倍，前后随髋的 KF 倍，左右随髋的 KX 倍），所以手几乎不随步子摆；
#     * 双腿逐帧 IK：脚踝位置/朝向钉在原件值（前后按步幅压缩），脚不滑；
#     * 双手握拳攥杆：杆沿前后方向穿过拳心（手的食指侧朝前、指尖朝下，掌心朝内）。
#
# 关键帧时间表（秒，30 fps，帧号 = 1 + 秒 * 30）：整条是一个完整步态周期，两步各 0.617 s。
#   0.00 - 1.233  循环（首帧 = 末帧），原地。左脚触地约在 0.0 s 附近，右脚触地约在 0.62 s 附近（见 report 的 contact）。
#   手：全程钉着，不分阶段；掌心起伏只来自身体随动。
#
# 史实：担架是竹竿布兜担架，两个人一前一后抬；伤员 60–70 kg，每头约 35 kg。两臂伸直吃重，不是端着抬、也不是背在肩上；
#   抬着走的人步子短、起伏小。1938 年没有现代担架的肩带，抬杆就是双手攥竹竿。
#
# 自己加的东西（工具包没有）：
#   * 逐帧 IK 的双臂/双腿（目标/极点/朝向逐帧写，烘回动作）；极点角度自动挑；
#   * 脊柱前倾、头反向补偿、锁骨下压、髋下沉的符号是现场探出来的（不是猜的）；
#   * 握拳手指的弯曲符号现场探；
#   * 站定脚直线残差、手起伏、掌心距离的逐帧测量（写进 report.json 的 mine 字段）。
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "StretcherFrontWalk"
BASE = "Animation_Mixamo_Walking_V21"
LABEL = "担架·抬前头走"
FPS = 30

# ----------------------------------------------------------------------------- 可调参数
LEAN = 8.0              # 躯干整体前倾（度），在原件的基础上再加
HEAD_COMP = 0.80        # 脖子+头反向补回的比例
DROP = 0.035            # 髋整体下沉（米）
HIPS_BACK = 0.015       # 髋往后挪（米，前倾时重心回一点）
BOUNCE_K = 0.75         # 髋上下起伏保留的比例
STRIDE = 0.92           # 步幅（脚前后位置相对身体中线压缩的比例）
SHOULDER_DROP = 0.025   # 肩膀往下沉的距离（米）
PALM_H = 0.77           # 掌心离地（米，均值）
PALM_BACK = 0.10        # 掌心在髋关节后面多少（米，均值）
HALF_SPACING = 0.29     # 两掌心相距 0.58 m 的一半
KZ, KF, KX = 0.60, 0.60, 0.45   # 掌心随髋的高度/前后/左右起伏的比例
HAND_F_BLEND = 0.5      # 手指方向 = 肩到掌心方向与竖直向下的混合比例（0 = 竖直向下）
FIST = dict(Index=(55, 75, 50), Middle=(60, 80, 55), Ring=(65, 85, 55), Pinky=(70, 85, 55))
LOOP = True
STANCE_DZ = 0.012        # 站定段：脚踝高度低于该脚最低值多少米以内
SIDES = ("Right", "Left")
SGN = {"Right": 1.0, "Left": -1.0}

LOG_PATH = None


def log(s):
    print("[StretcherFrontWalk]", s)
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


# ----------------------------------------------------------------------------- 主流程
def Main():
    global LOG_PATH
    os.makedirs(K.AUTHORED, exist_ok=True)
    LOG_PATH = os.path.join(K.AUTHORED, NAME + ".log.txt")
    open(LOG_PATH, "w").close()
    arm = K.LoadBase(BASE)
    scene = bpy.context.scene
    N = int(scene.frame_end)
    frames = list(range(1, N + 1))
    cyc = frames[:-1]                      # 最后一帧 = 第 1 帧，求平均时不重复算
    DURATION = (N - 1) / FPS
    log(f"base {BASE}, frames 1..{N}, {DURATION:.3f} s")

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
    base = {}
    for f in frames:
        K.At(f)
        base[f] = dict(
            hips=K.BoneHead(arm, "Hips"),
            sh={s: K.BoneHead(arm, f"{s}Arm") for s in SIDES},
            hipj={s: K.BoneHead(arm, f"{s}UpLeg") for s in SIDES},
            foot={s: K.BoneHead(arm, f"{s}Foot") for s in SIDES},
            footR={s: R3(K.BoneMatrix(arm, f"{s}Foot")) for s in SIDES},
            knee={s: K.BoneHead(arm, f"{s}Leg") for s in SIDES},
            loc={n: arm.pose.bones[n].location.copy() for n in EDIT},
            q={n: arm.pose.bones[n].rotation_quaternion.copy() for n in EDIT + FINGER_BONES},
        )

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
        ang = min(25.0, 10.0 * SHOULDER_DROP / drop10)
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
    nz = Mean(new[f]["hips"].z for f in cyc)
    ny = Mean(new[f]["hips"].dot(FA) for f in cyc)
    nx = Mean(new[f]["hips"].dot(RA) for f in cyc)
    hipj_fwd = Mean(Mean(new[f]["hipj"][s].dot(FA) for s in SIDES) for f in cyc)
    log(f"after edit: hips z mean {nz:.3f} (was {mean_hz:.3f}); hip joint fwd mean {hipj_fwd:.3f}")

    # --- 掌心目标
    palm_t, wrist_t, quat_t, pole_t = {}, {}, {}, {}
    for f in frames:
        hz, hy, hx = new[f]["hips"].z, new[f]["hips"].dot(FA), new[f]["hips"].dot(RA)
        z = PALM_H + KZ * (hz - nz)
        y = hipj_fwd - PALM_BACK + KF * (hy - ny)
        xc = nx + KX * (hx - nx)
        for s in SIDES:
            palm = RA * (xc + SGN[s] * HALF_SPACING) + FA * y + UP * z
            palm_t[(f, s)] = palm
            fvec = (palm - new[f]["sh"][s]).normalized()
            fdir = (fvec * HAND_F_BLEND + (-UP) * (1 - HAND_F_BLEND)).normalized()
            Rm = OrientMatrix(info[s]["basis"], fdir, FA)
            wrist = palm - Rm @ info[s]["v_loc"]
            wrist_t[(f, s)] = wrist
            quat_t[(f, s)] = Rm.to_quaternion()
            out = (RA * SGN[s] * 0.6 - FA * 0.5 - UP * 0.2).normalized()
            pole_t[(f, s)] = (new[f]["sh"][s] + wrist) * 0.5 + out * 0.5

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
    for s in SIDES:
        pos, quat, pole = {}, {}, {}
        for f in frames:
            fp = base[f]["foot"][s]
            fy = fp.dot(FA)
            fp_new = fp + FA * ((mean_hy + STRIDE * (fy - mean_hy)) - fy)
            pos[f] = fp_new
            quat[f] = base[f]["footR"][s].to_quaternion()
            hj = new[f]["hipj"][s]
            pole[f] = (hj + fp_new) * 0.5 + (FA + RA * SGN[s] * 0.12).normalized() * 0.5
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
    for pb in arm.pose.bones:
        pb.rotation_quaternion = q1[pb.name]
        pb.keyframe_insert("rotation_quaternion", frame=N)
    arm.pose.bones["Hips"].location = h1
    arm.pose.bones["Hips"].keyframe_insert("location", frame=N)
    K.At(1)

    # --- 检查：IK 到位情况
    for s in SIDES:
        errs = []
        for f in frames:
            K.At(f)
            errs.append((K.Palm(arm, s) - palm_t[(f, s)]).length)
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
        "note": f"抬担架前头的人（走）：两手在胯两侧略靠后攥杆，掌心相距 0.58 m、同高、离地约 {PALM_H} m，两臂几乎伸直下垂；"
                f"上身比原件多前倾约 {LEAN:.0f} 度，髋下沉 {DROP * 100:.1f} cm，步幅缩到原件的 {STRIDE} 倍；原地循环，首帧 = 末帧。"
                "预览里担架自动挂在两手中点、在他身后；站定脚前后速度见 report.json 的 mine.summary.stance。",
    }
    K.Export(arm, NAME, meta)
    K.Report(arm, NAME, extra={"timings": timings, "mine": {"summary": summary, "rows": rows}})


def InteriorAngle(a, b, c):
    u, v = (a - b).normalized(), (c - b).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, u.dot(v)))))


if __name__ == "__main__":
    Main()

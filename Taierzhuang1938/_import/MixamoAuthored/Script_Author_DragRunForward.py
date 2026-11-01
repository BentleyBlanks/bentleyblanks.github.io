# DragRunForward「单手在身后拖着往前跑」 (Claude, 2026-11-01)
#
# 这是什么：原地循环的跑步。顺子右手在身后下方攥着被角（或伤员的衣领），手臂几乎伸直往后拽，
#   后面拖着裹伤员的被子，阻力大：上身比空手跑多前倾 15 度、右肩被拉向后下、重心压低（髋下沉 7 cm、膝多屈）、
#   步幅缩短到空手跑的 0.82、步频放慢到 133 步/分、每一步髋的起伏加大（蹬地更用力）；左臂照常摆但幅度只有原来的 0.65。
#   右手在一个周期里基本不动（拖着重物，只随每一步蹬地被拽动一两厘米）。
#   预览里没有被子和伤员，只有一只攥拳的右手伸在身后。循环（loop: true），原地。
#
# 改自：Animation_Mixamo_UnarmedRunForward_V1（空手向前跑，24 帧一个周期 = 0.8 s，第 25 帧 = 第 1 帧）。
#   试过 FastRun_V1：一个周期只有 0.53 s（225 步/分），像冲刺，拖重物要拉长 1.5 倍才合理，拉长后腿部节奏已不是它本来的样子，
#   所以用 UnarmedRunForward_V1，把周期拉到 0.9 s（27 帧），首尾帧（1 和 28）相同。
#
# 做法（全部逐帧，因为 Mixamo 每帧都有关键帧）：
#   1. 把原动作按 24/27 重采样到 28 帧（第 1 帧到第 28 帧，28 = 1）。
#   2. 在每一帧上改身体：髋下沉并放大起伏；脊柱三节共加前倾 15 度、绕竖轴扭 14 度（右肩往后）；颈和头反向补偿一部分让眼睛看前方；
#      右锁骨往后下拉；左臂（上臂/前臂/手）向周期平均姿势收缩到 0.65。
#   3. 腿：脚踝目标 = 原动作脚踝世界位置，前后方向相对该脚一个周期的均值缩到 0.82、高度不变、朝向不变，用 IK 烘；
#      膝盖极点沿原动作的膝弯方向外推。
#   4. 右臂：IK 烘。手腕目标 = 髋 + 设计偏移（右 26 cm、身后 30 cm、低 30 cm 的掌心点），限制到手臂最大伸展的 95%；
#      叠加跟髋上下起伏同步的 ±2.2 cm（前后）、±1.2 cm（上下）的小拽动。手朝向固定：掌心朝身体、四指朝下略向后，拇指在前。
#      右手五指攥拳（全周期不变）。
#
# 关键时间表（秒，30 fps，28 帧，0-0.9 s）：见 meta timings（左/右脚落地、蹬离、髋最低点由测得的脚踝高度决定）。
#
# 史实/用法：1938 年滕县，担架不够时的伤员后送：把伤员裹在被子里，一个人拽着被角往前拖跑（拖拽式后送），
#   不是现代救援的肩扛消防员式。拖的是被子/伤员，阻力大，所以跑得矮、前倾、慢、短步。
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "DragRunForward"
BASE = "Animation_Mixamo_UnarmedRunForward_V1"
BASE_CYCLE = 24                      # 原动作一个周期的帧数（1..25）
N = 28                               # 输出 1..28，27 帧间隔 = 0.9 s
CYCLE = N - 1
FPS = 30
DURATION = CYCLE / FPS

# ---- 设计参数
LEAN_ADD = 15.0          # 脊柱总共加的前倾（度）
TWIST = 14.0             # 胸向右肩往后扭（度）
SHOULDER_BACK = 9.0      # 右锁骨往后（度）
SHOULDER_DROP = 10.0      # 右锁骨往下（度）
HEAD_PITCH_COMP = 0.60   # 头颈补偿掉的前倾比例
HEAD_YAW_COMP = 0.85
HIPS_DROP = 0.09         # 髋下沉（米）
BOB_SCALE = 1.35         # 髋起伏放大
STRIDE = 0.82            # 步幅
LEFT_ARM_K = 0.65        # 左臂摆幅
# 右手掌心目标（髋局部：右、前、上 = 相对髋的偏移，米）
PALM_OFF = (0.24, -0.35, -0.35)
REACH = 0.97             # 手腕目标限制在最大伸展的比例
OSC_BACK, OSC_UP = 0.022, 0.012
SHARES = (("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35))

TOE_PASSES, FOOT_PASSES = 7, 9
LOG_PATH = None


def log(s):
    print("[DragRun]", s)
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(s + "\n")


def R3(m):
    return m.to_3x3().normalized()


def Fmt(v, n=3):
    return tuple(round(x, n) for x in v)


def Ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


# 朝向：角色朝 -Y，右 = -X，左 = +X
FWD, RIGHT, UP = Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))


def Dir(right, fwd, up):
    return RIGHT * right + FWD * fwd + UP * up


def RotAxis(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)


# ----------------------------------------------------------------------------- 手
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


def OrientMatrix(local_basis, f_w, n_w):
    lf, ln, la = local_basis
    f_w = Vector(f_w).normalized()
    n_w = Vector(n_w)
    n_w = (n_w - f_w * n_w.dot(f_w)).normalized()
    a_w = f_w.cross(n_w)
    wm = Matrix((f_w, n_w, a_w)).transposed()
    lm = Matrix((lf, ln, la)).transposed()
    return wm @ lm.inverted()


# 拳：Index/Middle/Ring/Pinky 每节绕本地 X；拇指按搜索求得，指尖压在食指/中指中节上（拇指 1: x,y,z；2: x,z；3: x）
FIST = dict(Index=(62, 88, 58), Middle=(64, 92, 60), Ring=(66, 94, 62), Pinky=(68, 94, 60),
            Thumb=((-10.0, -24.0, 23.5), (-5.8, 25.0), (-2.4,)))


def FistQuats(side="Right"):
    out = {}
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            out[f"{side}Hand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(FIST[fn][i]))
    (x1, y1, z1), (x2, z2), (x3,) = FIST["Thumb"]
    out[f"{side}HandThumb1"] = Quaternion((0, 0, 1), math.radians(z1)) @ Quaternion((0, 1, 0), math.radians(y1)) @ Quaternion((1, 0, 0), math.radians(x1))
    out[f"{side}HandThumb2"] = Quaternion((0, 0, 1), math.radians(z2)) @ Quaternion((1, 0, 0), math.radians(x2))
    out[f"{side}HandThumb3"] = Quaternion((1, 0, 0), math.radians(x3))
    return out


# ----------------------------------------------------------------------------- IK 工具（取自 StripperLoadStand）
def PoleMatch(arm, tip_bone, target_pos, pole_pos, ref_mid):
    """扫极点角度，挑让中间关节（肘/膝）最贴近原件位置的那个（第 1 帧）。"""
    K.At(1)
    target, pole_obj = K._Empty("IKtest"), K._Empty("PoleTest", pole_pos)
    target.location = target_pos
    tip = arm.pose.bones[tip_bone]
    ik = tip.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole_obj
    best = (9.0, None)
    for ang in range(-180, 180, 10):
        ik.pole_angle = math.radians(ang)
        bpy.context.view_layer.update()
        err = ((arm.matrix_world @ tip.head) - ref_mid).length
        if err < best[0]:
            best = (err, ang)
    tip.constraints.remove(ik)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)
    log(f"  pole match {tip_bone}: angle {best[1]} deg, mid-joint error {best[0] * 100:.2f} cm")
    return best[1]


def LimbIk(arm, tip_bone, tail_bone, pos, quat, pole, pole_angle, tag):
    target = K._Empty(f"IK_{tag}")
    target.rotation_mode = "QUATERNION"
    pole_obj = K._Empty(f"Pole_{tag}")
    prev = None
    for f in range(1, N + 1):
        target.location = pos[f]
        target.keyframe_insert("location", frame=f)
        q = quat[f].copy()
        if prev is not None and q.dot(prev) < 0:
            q.negate()
        prev = q
        target.rotation_quaternion = q
        target.keyframe_insert("rotation_quaternion", frame=f)
        pole_obj.location = pole[f]
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


def Flatten(arm):
    slot = arm.animation_data.action_slot
    cb = arm.animation_data.action.layers[0].strips[0].channelbag(slot)
    n = 0
    for fc in list(cb.fcurves):
        if fc.data_path.startswith("pose.bones"):
            cb.fcurves.remove(fc)
            n += 1
    return n


def InteriorAngle(a, b, c):
    u, v = (a - b).normalized(), (c - b).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, u.dot(v)))))


def SegDist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def Lean(arm, bone="Spine2"):
    """骨头 Y 轴（骨头方向）相对竖直向前倾的角度（度，前倾为正）。"""
    m = R3(K.BoneMatrix(arm, bone))
    y = m.col[1]
    return math.degrees(math.atan2(-y.y, y.z))


# ----------------------------------------------------------------------------- 主流程
def Main():
    global LOG_PATH
    os.makedirs(K.AUTHORED, exist_ok=True)
    LOG_PATH = os.path.join(K.AUTHORED, NAME + ".log.txt")
    open(LOG_PATH, "w").close()
    arm = K.LoadBase(BASE, frame_end=N)
    W = arm.matrix_world.copy()
    Wi = W.inverted()
    sc = bpy.context.scene
    bones = [pb.name for pb in arm.pose.bones]
    log(f"base {BASE}; output frames 1..{N} ({DURATION:.3f} s)")

    lenUp = (K.BoneHead(arm, "RightArm", 1) - K.BoneHead(arm, "RightForeArm")).length
    lenFore = (K.BoneHead(arm, "RightForeArm") - K.BoneHead(arm, "RightHand")).length
    LARM = lenUp + lenFore
    log(f"right arm upper {lenUp:.3f} fore {lenFore:.3f} total {LARM:.3f}")
    info = {}
    for side in ("Right", "Left"):
        q0, lf, ln, la = HandBasis(arm, side, 1)
        v_loc = q0.inverted() @ (K.Palm(arm, side, 1) - K.BoneHead(arm, f"{side}Hand", 1))
        info[side] = dict(basis=(lf, ln, la), v_loc=v_loc)

    # ---- 1. 重采样原动作
    base = {}          # i -> {bone: (loc, quat)}
    basew = {}         # i -> 世界量
    for i in range(1, N + 1):
        bf = 1 + (i - 1) * BASE_CYCLE / CYCLE
        fi = int(math.floor(bf + 1e-9))
        sc.frame_set(fi, subframe=max(0.0, bf - fi))
        base[i] = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
        w = {"lean": Lean(arm), "hips": K.BoneHead(arm, "Hips")}
        for s in ("Left", "Right"):
            w[s + "Foot"] = K.BoneHead(arm, f"{s}Foot")
            w[s + "FootRot"] = R3(K.BoneMatrix(arm, f"{s}Foot")).to_quaternion()
            w[s + "Knee"] = K.BoneHead(arm, f"{s}Leg")
            w[s + "Hip"] = K.BoneHead(arm, f"{s}UpLeg")
        basew[i] = w
    # 脚趾、脚在原件里蹬离/落地时转得太快（相邻帧 > 12 度），沿周期做 1-2-1 平滑
    def SmoothCycle(qs, passes):
        for _ in range(passes):
            out = []
            for k in range(CYCLE):
                a_, b_, c_ = qs[(k - 1) % CYCLE].copy(), qs[k].copy(), qs[(k + 1) % CYCLE].copy()
                if a_.dot(b_) < 0:
                    a_.negate()
                if c_.dot(b_) < 0:
                    c_.negate()
                m_ = Quaternion((0.25 * a_.w + 0.5 * b_.w + 0.25 * c_.w, 0.25 * a_.x + 0.5 * b_.x + 0.25 * c_.x,
                                 0.25 * a_.y + 0.5 * b_.y + 0.25 * c_.y, 0.25 * a_.z + 0.5 * b_.z + 0.25 * c_.z))
                m_.normalize()
                out.append(m_)
            qs = out
        return qs

    for toe in ("LeftToeBase", "RightToeBase"):
        sm = SmoothCycle([base[i][toe][1].copy() for i in range(1, CYCLE + 1)], TOE_PASSES)
        for k in range(CYCLE):
            base[k + 1][toe] = (base[k + 1][toe][0], sm[k])
    for s_ in ("Left", "Right"):
        sm = SmoothCycle([basew[i][s_ + "FootRot"] for i in range(1, CYCLE + 1)], FOOT_PASSES)
        for k in range(CYCLE):
            basew[k + 1][s_ + "FootRot"] = sm[k]
    # 首尾帧严格相同（循环）
    base[N] = base[1]
    basew[N] = basew[1]
    # 首尾帧是否一致（原件）
    d = max(math.degrees(2 * math.acos(min(1.0, abs(base[1][b][1].dot(base[N][b][1]))))) for b in bones)
    log(f"resampled base: frame 1 vs {N} max bone rotation diff {d:.4f} deg; lean {basew[1]['lean']:.1f}")

    # ---- 极点角度（用原动作第 1 帧；PoleMatch 内部 K.At(1) 是原件的第 1 帧）
    K.At(1)
    sh0, el0, wr0 = (K.BoneHead(arm, b) for b in ("RightArm", "RightForeArm", "RightHand"))
    dir0 = (el0 - (sh0 + wr0) * 0.5).normalized()
    ang_r = PoleMatch(arm, "RightForeArm", wr0, (sh0 + wr0) * 0.5 + dir0 * 0.5, el0)
    ang_leg = {}
    for s in ("Left", "Right"):
        hip, knee, ank = (K.BoneHead(arm, b) for b in (f"{s}UpLeg", f"{s}Leg", f"{s}Foot"))
        mid = (hip + ank) * 0.5
        ang_leg[s] = PoleMatch(arm, f"{s}Leg", ank, mid + (knee - mid).normalized() * 0.5, knee)

    # ---- 2. 压平，逐帧设姿态并改身体
    removed = Flatten(arm)
    log(f"flattened {removed} fcurves")

    bobs = [basew[i]["hips"].z for i in range(1, CYCLE + 1)]
    bob_mean = sum(bobs) / len(bobs)
    # 左臂平均姿势
    mean_q = {}
    for b in ("LeftArm", "LeftForeArm", "LeftHand"):
        ref = base[1][b][1]
        acc = Quaternion((0, 0, 0, 0))
        for i in range(1, CYCLE + 1):
            q = base[i][b][1].copy()
            if q.dot(ref) < 0:
                q.negate()
            acc = Quaternion((acc.w + q.w, acc.x + q.x, acc.y + q.y, acc.z + q.z))
        acc.normalize()
        mean_q[b] = acc

    def ApplyWorldRot(bone, rot3):
        pb = arm.pose.bones[bone]
        Mw = W @ pb.matrix
        head = Mw.translation.copy()
        Mn = rot3.to_4x4() @ Mw
        Mn.translation = head
        pb.matrix = Wi @ Mn
        bpy.context.view_layer.update()

    final = {}
    fw = {}
    fist = FistQuats("Right")
    for i in range(1, N + 1):
        for b in bones:
            pb = arm.pose.bones[b]
            pb.location, pb.rotation_quaternion = base[i][b][0].copy(), base[i][b][1].copy()
        for b in ("LeftArm", "LeftForeArm", "LeftHand"):
            q = base[i][b][1].copy()
            m = mean_q[b].copy()
            if q.dot(m) < 0:
                m.negate()
            arm.pose.bones[b].rotation_quaternion = m.slerp(q, LEFT_ARM_K)
        for b, q in fist.items():
            arm.pose.bones[b].rotation_quaternion = q
        bpy.context.view_layer.update()
        # 髋：下沉并放大起伏
        pb = arm.pose.bones["Hips"]
        Mw = W @ pb.matrix
        z = basew[i]["hips"].z
        Mw.translation = Mw.translation + Vector((0, 0, -HIPS_DROP + (z - bob_mean) * (BOB_SCALE - 1.0)))
        pb.matrix = Wi @ Mw
        bpy.context.view_layer.update()
        # 脊柱：前倾（绕世界 X，前倾为正）+ 扭（右肩往后）
        for name, share in SHARES:
            rot = RotAxis("Z", -TWIST * share) @ RotAxis("X", LEAN_ADD * share)
            ApplyWorldRot(name, rot)
        # 头颈补偿
        for name, share in (("Neck", 0.5), ("Head", 0.5)):
            rot = RotAxis("Z", TWIST * HEAD_YAW_COMP * share) @ RotAxis("X", -LEAN_ADD * HEAD_PITCH_COMP * share)
            ApplyWorldRot(name, rot)
        # 右锁骨：往后下拉（右 = -X：往后 = 绕 Z 负向转，往下 = 绕 Y 负向转）
        ApplyWorldRot("RightShoulder", RotAxis("Z", -SHOULDER_BACK) @ RotAxis("Y", -SHOULDER_DROP))
        final[i] = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
        w = {s + k: K.BoneHead(arm, f"{s}{b}") for s in ("Left", "Right") for k, b in (("Hip", "UpLeg"),)}
        w["hips"] = K.BoneHead(arm, "Hips")
        w["shoulder"] = K.BoneHead(arm, "RightArm")
        w["lshoulder"] = K.BoneHead(arm, "LeftArm")
        fw[i] = w
    log(f"after FK edit: frame 1 lean {Lean(arm):.1f} (last evaluated frame {N})")
    # 符号自检：右肩 y 比左肩更靠后（+Y），右肩更低
    log(f"sign check @frame 1: right shoulder y {fw[1]['shoulder'].y:.3f} left {fw[1]['lshoulder'].y:.3f}; "
        f"right z {fw[1]['shoulder'].z:.3f} left {fw[1]['lshoulder'].z:.3f}")

    # ---- 3. 写关键帧（全部骨头、全部帧）
    for i in range(1, N + 1):
        for b in bones:
            pb = arm.pose.bones[b]
            pb.location, pb.rotation_quaternion = final[i][b]
            pb.keyframe_insert("location", frame=i)
            pb.keyframe_insert("rotation_quaternion", frame=i)

    # ---- 4. 目标：右手腕、脚踝、极点
    q_hand = OrientMatrix(info["Right"]["basis"], Dir(0.0, -0.30, -0.95), Dir(-1.0, 0.0, 0.0))
    qh = q_hand.to_quaternion()
    v_loc = info["Right"]["v_loc"]
    palm_off_vec = Dir(*PALM_OFF)
    zs = [basew[i]["hips"].z for i in range(1, CYCLE + 1)]
    dz = [(zs[(k + 1) % CYCLE] - zs[(k - 1) % CYCLE]) for k in range(CYCLE)]
    dzmax = max(abs(x) for x in dz)
    zdev = [z - bob_mean for z in zs]
    zdmax = max(abs(x) for x in zdev)
    wr_pos, wr_quat, pole_r = {}, {}, {}
    pole_dir_r = Dir(0.25, -0.9, 0.0).normalized()      # 肘弯向身后略向外（手臂几乎伸直，只是定个方向）
    for i in range(1, N + 1):
        k = (i - 1) % CYCLE
        hips_w = fw[i]["hips"]
        osc_back = OSC_BACK * (dz[k] / dzmax)                 # 髋上升（蹬地）时手被往后拽
        osc_up = OSC_UP * (zdev[k] / zdmax)
        palm_t = hips_w + palm_off_vec + Dir(0, -osc_back, osc_up)
        wr = palm_t - (R3(Matrix.Identity(4)) @ (q_hand @ v_loc))
        sh = fw[i]["shoulder"]
        dv = wr - sh
        if dv.length > REACH * LARM:
            wr = sh + dv.normalized() * REACH * LARM
        wr_pos[i], wr_quat[i] = wr, qh
        pole_r[i] = (sh + wr) * 0.5 + pole_dir_r * 0.5
    ank_pos, ank_quat, knee_pole = {"Left": {}, "Right": {}}, {"Left": {}, "Right": {}}, {"Left": {}, "Right": {}}
    for s in ("Left", "Right"):
        ys = [basew[i][s + "Foot"].y for i in range(1, CYCLE + 1)]
        ymean = sum(ys) / len(ys)
        for i in range(1, N + 1):
            b = basew[i]
            a = b[s + "Foot"].copy()
            a.y = ymean + (a.y - ymean) * STRIDE
            ank_pos[s][i] = a
            ank_quat[s][i] = b[s + "FootRot"]
            mid_b = (b[s + "Hip"] + b[s + "Foot"]) * 0.5
            dkn = (b[s + "Knee"] - mid_b).normalized()
            mid_n = (fw[i][s + "Hip"] + a) * 0.5
            knee_pole[s][i] = mid_n + dkn * 0.5
    objs = []
    objs += LimbIk(arm, "RightForeArm", "RightHand", wr_pos, wr_quat, pole_r, ang_r, "R")
    for s in ("Left", "Right"):
        objs += LimbIk(arm, f"{s}Leg", f"{s}Foot", ank_pos[s], ank_quat[s], knee_pole[s], ang_leg[s], s + "Leg")
    ikbones = ["RightArm", "RightForeArm", "RightHand"] + [f"{s}{b}" for s in ("Left", "Right") for b in ("UpLeg", "Leg", "Foot")]
    K._BakeBones(arm, ikbones, 1, N)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    Trim(arm, 1, N)
    K.At(1)
    errs = {"wrist": 0.0, "Left": 0.0, "Right": 0.0}
    for f in range(1, N + 1):
        K.At(f)
        errs["wrist"] = max(errs["wrist"], (K.BoneHead(arm, "RightHand") - wr_pos[f]).length)
        for s in ("Left", "Right"):
            errs[s] = max(errs[s], (K.BoneHead(arm, f"{s}Foot") - ank_pos[s][f]).length)
    log(f"IK errors: right wrist max {errs['wrist'] * 100:.2f} cm, ankles L {errs['Left'] * 100:.2f} R {errs['Right'] * 100:.2f} cm")
    K.At(1)

    # ---- 5. 测量
    rows = []
    foot_h = {s: [] for s in ("Left", "Right")}
    for f in range(1, N + 1):
        K.At(f)
        hips = K.BoneHead(arm, "Hips")
        palm = K.Palm(arm, "Right")
        rel = palm - hips
        sh, el, wrh = (K.BoneHead(arm, b) for b in ("RightArm", "RightForeArm", "RightHand"))
        thigh_a, thigh_b = K.BoneHead(arm, "RightUpLeg"), K.BoneHead(arm, "RightLeg")
        shin_b = K.BoneHead(arm, "RightFoot")
        fore_mid = (el + wrh) * 0.5
        torso = [K.BoneHead(arm, n) for n in ("Hips", "Spine", "Spine1", "Spine2")]
        row = {
            "f": f, "t": round((f - 1) / FPS, 3),
            "Rpalm_rel_hips_right_cm": round(-rel.x * 100, 1),
            "Rpalm_rel_hips_behind_cm": round(rel.y * 100, 1),       # 身后为正
            "Rpalm_rel_hips_up_cm": round(rel.z * 100, 1),
            "Rpalm_height_m": round(palm.z, 3),
            "Rarm_straightness": round((wrh - sh).length / LARM, 3),
            "Rarm_straight_incl_palm": round((palm - sh).length / (LARM + (K.Palm(arm, "Right") - wrh).length), 3),
            "Relbow_interior_deg": round(InteriorAngle(sh, el, wrh), 1),
            "Spine2_lean_deg": round(Lean(arm), 1),
            "Spine2_lean_base_deg": round(basew[f]["lean"], 1),
            "hips_z_m": round(hips.z, 3),
            "palm_to_thigh_cm": round((SegDist(palm, thigh_a, thigh_b) - 0.085) * 100, 1),
            "elbow_to_thigh_cm": round((SegDist(el, thigh_a, thigh_b) - 0.085) * 100, 1),
            "forearm_mid_to_thigh_cm": round((SegDist(fore_mid, thigh_a, thigh_b) - 0.085) * 100, 1),
            "palm_to_shin_cm": round((SegDist(palm, thigh_b, shin_b) - 0.06) * 100, 1),
            "palm_to_torso_axis_cm": round(min(math.hypot(palm.x - c.x, palm.y - c.y) for c in torso) * 100, 1),
            "Lelbow_interior_deg": round(InteriorAngle(K.BoneHead(arm, "LeftArm"), K.BoneHead(arm, "LeftForeArm"), K.BoneHead(arm, "LeftHand")), 1),
        }
        for s in ("Left", "Right"):
            foot_h[s].append((f, K.BoneHead(arm, f"{s}Foot")))
        rows.append(row)

    def rng(key):
        v = [r[key] for r in rows[:CYCLE]]
        return min(v), max(v), round(max(v) - min(v), 1)

    for key in ("Rpalm_rel_hips_right_cm", "Rpalm_rel_hips_behind_cm", "Rpalm_rel_hips_up_cm", "Rpalm_height_m", "Rarm_straightness",
                "Relbow_interior_deg", "Spine2_lean_deg", "Spine2_lean_base_deg", "hips_z_m", "palm_to_thigh_cm", "elbow_to_thigh_cm",
                "forearm_mid_to_thigh_cm", "palm_to_shin_cm", "palm_to_torso_axis_cm", "Lelbow_interior_deg"):
        log(f"{key}: min/max/range {rng(key)}")
    lean_mean = sum(r["Spine2_lean_deg"] for r in rows[:CYCLE]) / CYCLE
    lean_base_mean = sum(r["Spine2_lean_base_deg"] for r in rows[:CYCLE]) / CYCLE
    log(f"Spine2 lean mean {lean_mean:.1f} deg vs base {lean_base_mean:.1f} deg (added {lean_mean - lean_base_mean:.1f})")

    # 站立相（平脚段）：脚趾尖和脚踝都贴近各自的最低高度的连续帧；对脚踝和脚趾尖的 y 做线性拟合，
    # 残差 = 脚相对「匀速后退的地面」的漂移（原地跑，地面以 ground_speed 往后走）
    def SoleSeries(s_):
        out = []
        for f in range(1, CYCLE + 1):
            K.At(f)
            tip = arm.matrix_world @ arm.pose.bones[f"{s_}ToeBase"].tail
            out.append((K.BoneHead(arm, f"{s_}Foot"), tip))
        return out

    def FlatStance(series, n):
        zmin_a = min(a_.z for a_, _ in series)
        zmin_t = min(t_.z for _, t_ in series)
        idx = [k for k in range(n) if series[k][0].z < zmin_a + 0.012 and series[k][1].z < zmin_t + 0.012]
        groups, cur = [], []
        for k in idx:
            if cur and k != cur[-1] + 1:
                groups.append(cur)
                cur = []
            cur.append(k)
        if cur:
            groups.append(cur)
        if len(groups) > 1 and groups[0][0] == 0 and groups[-1][-1] == n - 1:
            groups[0] = groups[-1] + groups[0]
            groups.pop()
        return max(groups, key=len)

    def Residual(vals):
        n = len(vals)
        ts = list(range(n))
        tm, vm = sum(ts) / n, sum(vals) / n
        slope = sum((t - tm) * (v - vm) for t, v in zip(ts, vals)) / max(1e-9, sum((t - tm) ** 2 for t in ts))
        return max(abs(v - (vm + slope * (t - tm))) for t, v in zip(ts, vals)), slope

    slide, contacts = {}, {}
    for s in ("Left", "Right"):
        series = SoleSeries(s)
        grp = FlatStance(series, CYCLE)
        ra, slope = Residual([series[k][0].y for k in grp])
        rt, _ = Residual([series[k][1].y for k in grp])
        za = [series[k][0].z for k in grp]
        zt = [series[k][1].z for k in grp]
        slide[s] = dict(frames=[g + 1 for g in grp], ankle_residual_cm=round(ra * 100, 2), toe_residual_cm=round(rt * 100, 2),
                        ground_speed_m_s=round(abs(slope) * FPS, 2), ankle_z_range_cm=round((max(za) - min(za)) * 100, 1),
                        toe_z_range_cm=round((max(zt) - min(zt)) * 100, 1))
        contacts[s] = round(grp[0] / FPS, 2)
        log(f"flat-foot stance {s}: frames {grp[0] + 1}..{grp[-1] + 1} ({len(grp)} frames) {slide[s]}")
    # 对照：原件（同一方法，原件 24 帧周期 30 fps）
    sc.frame_end = 25
    for s in ("Left", "Right"):
        series = []
        for i in range(1, CYCLE + 1):
            series.append((basew[i][s + "Foot"], None))
        bsr = None
        zs_ = [p_[0].z for p_ in series]
        zmin = min(zs_)
        idx = [k for k in range(CYCLE) if zs_[k] < zmin + 0.012]
        log(f"base {s}: ankle within 1.2 cm of lowest on {len(idx)} of {CYCLE} resampled frames; base ankle speed in stance "
            f"{abs((series[idx[-1]][0].y - series[idx[0]][0].y) / max(1, idx[-1] - idx[0])) * FPS:.2f} m/s (resampled 0.9 s, unscaled stride)")

    # 最大手速、关节步长、首尾一致
    for side in ("Right", "Left"):
        mx, at = 0.0, 0
        for f in range(2, N + 1):
            v = (K.Palm(arm, side, f) - K.Palm(arm, side, f - 1)).length * FPS
            if v > mx:
                mx, at = v, f
        log(f"max palm speed {side}: {mx:.2f} m/s at frame {at} (in-place run, hips-relative speed is lower)")
    for bone in ("RightArm", "RightForeArm", "RightHand", "LeftArm", "LeftForeArm", "LeftLeg", "RightLeg", "LeftUpLeg", "RightUpLeg", "Spine2", "RightShoulder"):
        prev, worst, wf = None, 0.0, 1
        for f in range(1, N + 1):
            K.At(f)
            q = arm.pose.bones[bone].rotation_quaternion.copy()
            if prev is not None:
                ang = math.degrees(2 * math.acos(min(1.0, abs(q.dot(prev)))))
                if ang > worst:
                    worst, wf = ang, f
            prev = q
        log(f"max joint step {bone}: {worst:.1f} deg/frame at frame {wf}")
    for bone in ("RightToeBase", "RightFoot"):
        steps = []
        for f in range(2, N + 1):
            K.At(f - 1)
            qa = arm.pose.bones[bone].rotation_quaternion.copy()
            K.At(f)
            qb = arm.pose.bones[bone].rotation_quaternion.copy()
            steps.append(round(math.degrees(2 * math.acos(min(1.0, abs(qa.dot(qb))))), 1))
        log(f"steps {bone}: {steps}")
    K.At(1)
    palm1 = K.Palm(arm, "Right")
    for fn in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        tipb = arm.pose.bones[f"RightHand{fn}3"]
        log(f"fist check: {fn} tip to palm {((arm.matrix_world @ tipb.tail) - palm1).length * 100:.1f} cm; "
            f"knuckle(1) to palm {(K.BoneHead(arm, f'RightHand{fn}1') - palm1).length * 100:.1f} cm")
    q1 = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
    K.At(N)
    dloop = max(math.degrees(2 * math.acos(min(1.0, abs(pb.rotation_quaternion.dot(q1[pb.name]))))) for pb in arm.pose.bones)
    ploop = max((K.BoneHead(arm, n, 1) - K.BoneHead(arm, n, N)).length for n in ("Hips", "RightHand", "LeftHand", "LeftFoot", "RightFoot"))
    log(f"loop closure: frame 1 vs {N}: max bone rotation diff {dloop:.4f} deg, max joint position diff {ploop * 100:.3f} cm")

    # ---- 报告与导出
    tstep = {s: contacts[s] for s in ("Left", "Right")}
    timings = {"cycle": [0.0, round(DURATION, 2)], "leftFootPlant": tstep["Left"], "rightFootPlant": tstep["Right"],
               "stepsPerMin": round(2 * 60 / DURATION)}
    extra = {"timings": timings, "mine": rows, "slide": slide, "leanMean": lean_mean, "leanBaseMean": lean_base_mean}
    meta = {
        "base": BASE, "label": "单手在身后拖着往前跑", "loop": True, "duration": round(DURATION, 3), "timings": timings,
        "note": "顺子右手在身后下方攥着被角/衣领，手臂几乎伸直往后拽（预览里没有被子和伤员，只有一只攥拳的右手）；"
                "原地循环 0.9 s（133 步/分），上身比空手跑多前倾约 15 度、髋下沉 7 cm、步幅缩到 0.82；"
                "拖拽式后送，不是肩扛。首尾帧相同。",
    }
    K.Export(arm, NAME, meta)
    K.Report(arm, NAME, rifle=None, extra=extra)


if __name__ == "__main__":
    Main()

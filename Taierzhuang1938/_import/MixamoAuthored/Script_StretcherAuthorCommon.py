# 担架抬起 / 放下四条动作共用的制作代码（Claude，2026-11-01）。
# 四个制作脚本 Script_Author_StretcherLiftRear / LowerRear / LiftFront / LowerFront 各自只写自己的数据，
# 都 import 本文件。不改工具包 Script_MixamoAuthorKit.py。
#
# 做法（和 StripperLoadStand 同一套）：把 base 的「站立那一帧」取下来当中性姿势（全身所有骨头），其余整条动作
# 重建：
#   * 髋位置 / 骨盆前倾 / 脊柱三节前屈 / 头颈俯仰 / 肩下沉 —— 逐帧写关键帧（世界坐标里定目标，反解成骨头局部旋转）；
#   * 双臂：手腕位置 + 手朝向逐帧 IK（极点跟着肩走，肘朝外后下），双腿：脚踝位置 / 脚朝向钉在中性姿势，逐帧 IK，
#     所以脚不会漂，下蹲时膝盖自己往前弯；
#   * 手指：中性（base 的手型）<-> 握杆拳，按「握紧程度」c 逐帧插值，换手型至少 0.3 s 缓入缓出。
# 坐标：身体坐标 (右, 前, 高)：人面朝 -Y（世界），人的右手在 -X。原点 = 中性姿势时髋的 xy。
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
FPS = 30
POLE_HALF = 0.29            # 两根杆中心各距中线 0.29 m（掌心相距 0.58 m）
HAND_FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")
LOG_PATH = None


def log(s):
    print("[Stretcher]", s)
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(s + "\n")


def Ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def R3(m):
    return m.to_3x3().normalized()


def Rx(deg):
    return Matrix.Rotation(math.radians(deg), 3, "X")


def Ry(deg):
    return Matrix.Rotation(math.radians(deg), 3, "Y")


def Lerp(a, b, s):
    return a + (b - a) * s


def AngleBetween(q1, q2):
    return math.degrees(2 * math.acos(min(1.0, abs(q1.dot(q2)))))


# ----------------------------------------------------------------------------- 身体坐标
class Body:
    """右(-X)、前(-Y)、高(Z)。"""

    def __init__(self, x0, y0):
        self.x0, self.y0 = x0, y0

    def P(self, right, fwd, z):
        return Vector((self.x0 - right, self.y0 - fwd, z))

    def Dir(self, right, fwd, up):
        return Vector((-right, -fwd, up))

    def Local(self, p):
        return (self.x0 - p.x, self.y0 - p.y, p.z)


# ----------------------------------------------------------------------------- 手的本地基底（与 StripperLoadStand 相同）
def HandBasis(arm, side, frame):
    K.At(frame)
    q = R3(K.BoneMatrix(arm, f"{side}Hand"))
    hand = K.BoneHead(arm, f"{side}Hand")
    f = (K.BoneHead(arm, f"{side}HandMiddle1") - hand).normalized()
    a = K.BoneHead(arm, f"{side}HandIndex1") - K.BoneHead(arm, f"{side}HandPinky1")
    a = (a - f * a.dot(f)).normalized()
    n = a.cross(f)            # 右手 = 掌心朝向；左手 = 手背朝向（两手共用这个约定）
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


# ----------------------------------------------------------------------------- 骨头世界旋转 -> 局部四元数
def LocalQuat(arm, bone, W, Wparent):
    b = arm.data.bones[bone]
    Rc = b.matrix_local.to_3x3()
    mw3 = arm.matrix_world.to_3x3().normalized()
    if b.parent is None:
        L = mw3 @ Rc
    else:
        Rp = b.parent.matrix_local.to_3x3()
        L = Wparent @ (Rp.inverted() @ Rc)
    return (L.inverted() @ W).to_quaternion()


def HipsLocation(arm, target_world):
    b = arm.data.bones["Hips"]
    Rc = b.matrix_local.to_3x3()
    return Rc.inverted() @ ((arm.matrix_world.inverted() @ target_world) - b.head_local)


# ----------------------------------------------------------------------------- IK
def PoleMatch(arm, tip_bone, target_pos, pole_pos, ref_mid, frame):
    K.At(frame)
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


def LimbIk(arm, tip_bone, tail_bone, pos_keys, quat_keys, pole_keys, pole_angle, tag, frames):
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


# ----------------------------------------------------------------------------- 手指握法
# 握杆拳：四指绕杆（杆沿拇指方向、粗 5.6 cm），拇指从另一侧压在食指上。数值是每个关节绕本地 X 的角度。
FIST = dict(Index=(62, 78, 40), Middle=(66, 82, 45), Ring=(70, 82, 45), Pinky=(72, 80, 45),
            Thumb=((10, 22), (22, 8), (35, 0)))


def FistQuats(side):
    out = {}
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            out[f"{side}Hand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(FIST[fn][i]))
    for i in range(3):
        x, z = FIST["Thumb"][i]
        out[f"{side}HandThumb{i + 1}"] = Quaternion((0, 0, 1), math.radians(z)) @ Quaternion((1, 0, 0), math.radians(x))
    return out


def HeadPitch(arm, bone):
    m = R3(K.BoneMatrix(arm, bone))
    up = m.col[1]
    return math.degrees(math.atan2(-up.y, up.z))


# ----------------------------------------------------------------------------- 主流程
def Build(cfg):
    """cfg:
    name, label, base, neutral ('first'|'last'), end ('rear'|'front'), note, duration
    states: {名: dict(hips=(r,f,z), pitch, flex=(a,b,c), neck, head, drop, R=(r,f,z), L=(r,f,z), aw)}  A 由中性姿势自动生成
    keys:   [(t, 状态名)]    相邻两项之间用 smootherstep 过渡（同名 = 保持）
    close:  [(t, c)]         握紧程度 0..1（线性插值再缓入缓出）
    timings: 写进 meta 的时间表
    """
    global LOG_PATH
    name = cfg["name"]
    os.makedirs(K.AUTHORED, exist_ok=True)
    LOG_PATH = os.path.join(K.AUTHORED, name + ".log.txt")
    open(LOG_PATH, "w").close()
    duration = cfg["duration"]
    N = int(round(duration * FPS)) + 1
    frames = list(range(1, N + 1))
    arm = K.LoadBase(cfg["base"], frame_end=N)
    base_end = int(arm.animation_data.action.frame_range[1])
    nf = 1 if cfg["neutral"] == "first" else base_end
    log(f"{name}: base {cfg['base']} neutral frame {nf} of {base_end}; out frames 1..{N} ({duration} s)")

    # --- 中性姿势
    K.At(nf)
    neutral_q = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
    neutral_loc = {pb.name: pb.location.copy() for pb in arm.pose.bones}
    chain = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "RightShoulder", "LeftShoulder"]
    Wn = {b: R3(K.BoneMatrix(arm, b)) for b in chain}
    hips0 = K.BoneHead(arm, "Hips")
    body = Body(hips0.x, hips0.y)
    ankle0 = {s: K.BoneHead(arm, f"{s}Foot") for s in ("Left", "Right")}
    footW0 = {s: R3(K.BoneMatrix(arm, f"{s}Foot")) for s in ("Left", "Right")}
    knee0 = {s: K.BoneHead(arm, f"{s}Leg") for s in ("Left", "Right")}
    hipj0 = {s: K.BoneHead(arm, f"{s}UpLeg") for s in ("Left", "Right")}
    sho0 = {s: K.BoneHead(arm, f"{s}Arm") for s in ("Left", "Right")}
    wr0 = {s: K.BoneHead(arm, f"{s}Hand") for s in ("Left", "Right")}
    el0 = {s: K.BoneHead(arm, f"{s}ForeArm") for s in ("Left", "Right")}
    palm0 = {s: K.Palm(arm, s) for s in ("Left", "Right")}
    handW0 = {s: R3(K.BoneMatrix(arm, f"{s}Hand")) for s in ("Left", "Right")}
    pitch_h0 = HeadPitch(arm, "Hips")
    pitch_s20 = HeadPitch(arm, "Spine2")
    log(f"neutral hips {tuple(round(v, 3) for v in hips0)}  palms R {tuple(round(v, 3) for v in palm0['Right'])} L {tuple(round(v, 3) for v in palm0['Left'])}")
    info = {}
    for side in ("Right", "Left"):
        q0, lf, ln, la = HandBasis(arm, side, nf)
        v_loc = q0.inverted() @ (K.Palm(arm, side, nf) - K.BoneHead(arm, f"{side}Hand", nf))
        info[side] = dict(basis=(lf, ln, la), v_loc=v_loc)
    # 肩下沉的符号：绕世界 Y 转正角度是升还是降
    shoulder_sign = {}
    right_sign_test = {}
    for side in ("Right", "Left"):
        b = f"{side}Shoulder"
        q = LocalQuat(arm, b, Ry(6) @ Wn[b], Wn["Spine2"])
        arm.pose.bones[b].rotation_quaternion = q
        bpy.context.view_layer.update()
        z1 = K.BoneHead(arm, f"{side}Arm").z
        arm.pose.bones[b].rotation_quaternion = neutral_q[b]
        bpy.context.view_layer.update()
        z0 = K.BoneHead(arm, f"{side}Arm").z
        shoulder_sign[side] = -1.0 if z1 > z0 else 1.0
        log(f"  shoulder {side}: +6 deg about Y moves the joint {'up' if z1 > z0 else 'down'} ({(z1 - z0) * 100:.1f} cm) -> sign {shoulder_sign[side]}")
    clav = 0.11             # 锁骨长度，下沉 d 米 = 转 asin(d / clav)

    # --- 状态
    states = {}
    A = dict(hips=body.Local(hips0), pitch=0.0, flex=(0.0, 0.0, 0.0), neck=0.0, head=0.0, drop=0.0,
             R=body.Local(palm0["Right"]), L=body.Local(palm0["Left"]), aw=0.0)
    states["A"] = A
    for k, v in cfg["states"].items():
        states[k] = v
    timeline = cfg["keys"]
    close_keys = cfg["close"]

    def StatePose(t):
        if t <= timeline[0][0]:
            return states[timeline[0][1]], states[timeline[0][1]], 0.0, ""
        for (t0, n0), (t1, n1) in zip(timeline, timeline[1:]):
            if t <= t1:
                s = Ease((t - t0) / (t1 - t0)) if n0 != n1 else 0.0
                return states[n0], states[n1], s, (n0, n1)
        return states[timeline[-1][1]], states[timeline[-1][1]], 0.0, ""

    def Closure(t):
        ks = close_keys
        if t <= ks[0][0]:
            return ks[0][1]
        for (t0, c0), (t1, c1) in zip(ks, ks[1:]):
            if t <= t1:
                return c0 + (c1 - c0) * Ease((t - t0) / (t1 - t0))
        return ks[-1][1]

    def Pose(t):
        a, b, s, pair = StatePose(t)
        out = {}
        out["hips"] = tuple(Lerp(x, y, s) for x, y in zip(a["hips"], b["hips"]))
        for k in ("pitch", "neck", "head", "drop", "aw"):
            out[k] = Lerp(a[k], b[k], s)
        out["flex"] = tuple(Lerp(x, y, s) for x, y in zip(a["flex"], b["flex"]))
        # 手：左右偏（r）先到 / 后离，其余线性
        sr = s
        if pair:
            if cfg["pole_state"] == pair[1] and pair[0] != pair[1]:
                sr = Ease(min(1.0, _raw(t, timeline) * 1.8))
            elif cfg["pole_state"] == pair[0]:
                sr = Ease(max(0.0, 1.0 - (1.0 - _raw(t, timeline)) * 1.8))
        for side in ("R", "L"):
            pa, pb_ = a[side], b[side]
            out[side] = (Lerp(pa[0], pb_[0], sr), Lerp(pa[1], pb_[1], s), Lerp(pa[2], pb_[2], s))
        out["c"] = Closure(t)
        return out

    def _raw(t, tl):
        for (t0, n0), (t1, n1) in zip(tl, tl[1:]):
            if t <= t1:
                return (t - t0) / (t1 - t0) if t1 > t0 else 0.0
        return 1.0

    poses = {f: Pose((f - 1) / FPS) for f in frames}

    # --- 压平、回到中性
    removed = Flatten(arm)
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion = neutral_loc[pb.name].copy(), neutral_q[pb.name].copy()
    bpy.context.view_layer.update()
    log(f"flattened {removed} fcurves")

    fist = {s: FistQuats(s) for s in ("Right", "Left")}
    finger_bones = {s: [b for b in fist[s]] for s in fist}

    # --- 躯干 / 头 / 肩 / 髋 / 手指 关键帧
    for f in frames:
        P = poses[f]
        hp = body.P(*P["hips"])
        pb = arm.pose.bones["Hips"]
        pb.location = HipsLocation(arm, hp)
        cum = P["pitch"]
        Wh = Rx(cum) @ Wn["Hips"]
        pb.rotation_quaternion = LocalQuat(arm, "Hips", Wh, None)
        pb.keyframe_insert("location", frame=f)
        pb.keyframe_insert("rotation_quaternion", frame=f)
        Wprev = Wh
        for bone, fl in zip(("Spine", "Spine1", "Spine2"), P["flex"]):
            cum += fl
            W = Rx(cum) @ Wn[bone]
            arm.pose.bones[bone].rotation_quaternion = LocalQuat(arm, bone, W, Wprev)
            arm.pose.bones[bone].keyframe_insert("rotation_quaternion", frame=f)
            Wprev = W
        Wsp2 = Wprev
        cum_sp2 = cum
        Wneck = Rx(P["neck"]) @ Wn["Neck"]
        arm.pose.bones["Neck"].rotation_quaternion = LocalQuat(arm, "Neck", Wneck, Wsp2)
        arm.pose.bones["Neck"].keyframe_insert("rotation_quaternion", frame=f)
        Whead = Rx(P["head"]) @ Wn["Head"]
        arm.pose.bones["Head"].rotation_quaternion = LocalQuat(arm, "Head", Whead, Wneck)
        arm.pose.bones["Head"].keyframe_insert("rotation_quaternion", frame=f)
        for side in ("Right", "Left"):
            b = f"{side}Shoulder"
            phi = shoulder_sign[side] * math.degrees(math.asin(min(0.9, P["drop"] / clav)))
            W = Ry(phi) @ (Rx(cum_sp2) @ Wn[b])
            arm.pose.bones[b].rotation_quaternion = LocalQuat(arm, b, W, Wsp2)
            arm.pose.bones[b].keyframe_insert("rotation_quaternion", frame=f)
            c = P["c"]
            for bn, q in fist[side].items():
                arm.pose.bones[bn].rotation_quaternion = neutral_q[bn].slerp(q, c)
                arm.pose.bones[bn].keyframe_insert("rotation_quaternion", frame=f)
    # 手指：骨头 q 在 c=0 时 = 中性
    # --- 肩位置（用于极点）
    sho = {s: {} for s in ("Left", "Right")}
    for f in frames:
        K.At(f)
        for s in ("Left", "Right"):
            sho[s][f] = K.BoneHead(arm, f"{s}Arm")

    # --- 手的目标
    grip_f = cfg.get("grip_f", (0.0, 0.10, -1.0))          # 右手四指方向（身体坐标：右,前,上）
    grip_n = (-1.0, 0.0, 0.0)                               # 右手掌心朝向 = 向内（左）；左手同一个向量（手背朝外）
    wr_keys, wr_quat, pole_keys = {s: {} for s in ("Left", "Right")}, {s: {} for s in ("Left", "Right")}, {s: {} for s in ("Left", "Right")}
    q_grip = {}
    q_neu = {s: handW0[s].to_quaternion() for s in ("Left", "Right")}
    for side in ("Right", "Left"):
        sgn = 1.0 if side == "Right" else -1.0
        fdir = body.Dir(sgn * grip_f[0], grip_f[1], grip_f[2])
        ndir = body.Dir(*grip_n)
        q_grip[side] = OrientMatrix(info[side]["basis"], fdir, ndir).to_quaternion()
    dir0 = {s: (el0[s] - (sho0[s] + wr0[s]) * 0.5).normalized() for s in ("Left", "Right")}
    # B<->C 段（手握着杆随身体上升 / 下降）：手不按自己的直线走，而是挂在肩上：手的前后、高低 = 肩 + 一个偏移，
    # 偏移在两端（B 和 C 的设计手位）之间缓入缓出，所以两臂一路伸直、不会被拉长也不会缩短
    follow = []
    for (t0, n0), (t1, n1) in zip(timeline, timeline[1:]):
        if "B" in (n0, n1) and n0 != n1:
            follow.append((t0, t1, n0, n1))
    fol_off = {}
    for (t0, t1, n0, n1) in follow:
        for nm_, t_ in ((n0, t0), (n1, t1)):
            f_ = min(N, 1 + int(round(t_ * FPS)))
            for side, key in (("Right", "R"), ("Left", "L")):
                loc = body.Local(sho[side][f_])
                des = states[nm_][key]
                fol_off[(nm_, side)] = (des[1] - loc[1], loc[2] - des[2])      # (前后偏移, 肩到掌心的竖直距离)
    for k_, v_ in fol_off.items():
        log(f"  follow offset {k_}: fwd {v_[0]:.3f} m, shoulder-palm vertical {v_[1]:.3f} m")
    for f in frames:
        P = poses[f]
        w = P["aw"]
        t_now = (f - 1) / FPS
        for side, key in (("Right", "R"), ("Left", "L")):
            sgn = 1.0 if side == "Right" else -1.0
            des = P[key]
            for (t0, t1, n0, n1) in follow:
                if t0 <= t_now <= t1:
                    sf = Ease((t_now - t0) / (t1 - t0))
                    o0, o1 = fol_off[(n0, side)], fol_off[(n1, side)]
                    loc = body.Local(sho[side][f])
                    des = (des[0], loc[1] + Lerp(o0[0], o1[0], sf), loc[2] - Lerp(o0[1], o1[1], sf))
            # hand_bump [(t0, t1, 前后 m)]：这段时间两手额外往前（负 = 往后）挪一点，sin² 包络（两端速度为 0）。
            # 2026-11-02 审查：前头起身 / 下蹲到一半时屁股往后坐，身后担架布那一头的横档（掌心后 12 cm）会扫到屁股，手往后让 6 cm；
            # 后头起身时手从膝前往上收，手往前让 5 cm，拇指不蹭膝盖。肩到掌心的距离保持不变（手跟着略抬），臂不被拉长
            for (bt0, bt1, dfw) in cfg.get("hand_bump", ()):
                if bt0 < t_now < bt1:
                    loc = body.Local(sho[side][f])
                    reach2 = sum((a_ - b_) ** 2 for a_, b_ in zip(des, loc))
                    nf_ = des[1] + dfw * math.sin(math.pi * (t_now - bt0) / (bt1 - bt0)) ** 2
                    vz = math.sqrt(max(0.0, reach2 - (des[0] - loc[0]) ** 2 - (nf_ - loc[1]) ** 2))
                    des = (des[0], nf_, loc[2] - vz if des[2] < loc[2] else des[2])
            palm = body.P(*des)
            qa, qb = q_neu[side], q_grip[side]
            if qa.dot(qb) < 0:
                qb = qb.copy()
                qb.negate()
            q = qa.slerp(qb, Ease(w))
            wr_quat[side][f] = q
            wr_keys[side][f] = palm - q.to_matrix() @ info[side]["v_loc"]
            design = body.Dir(sgn * 0.6, -0.5, -0.4).normalized()
            d = (dir0[side] * (1 - w) + design * w).normalized()
            pole_keys[side][f] = (sho[side][f] + wr_keys[side][f]) * 0.5 + d * 0.5
    for t_, nm_ in timeline:
        f_ = min(N, 1 + int(round(t_ * FPS)))
        log(f"  state {nm_} t={t_}: shoulderR {tuple(round(v, 3) for v in body.Local(sho['Right'][f_]))} wristR {tuple(round(v, 3) for v in body.Local(wr_keys['Right'][f_]))} reach {(sho['Right'][f_] - wr_keys['Right'][f_]).length * 100:.1f} cm")
    # 可达性
    ARM = 0.561
    worst = {}
    for side in ("Right", "Left"):
        worst[side] = max(((sho[side][f] - wr_keys[side][f]).length, f) for f in frames)
        fw = worst[side][1]
        log(f"   at that frame shoulder (right,fwd,z) {tuple(round(v, 3) for v in body.Local(sho[side][fw]))} wrist target {tuple(round(v, 3) for v in body.Local(wr_keys[side][fw]))}")
        log(f"arm reach {side}: max shoulder->wrist {worst[side][0] * 100:.1f} cm at frame {worst[side][1]} (arm bones {ARM * 100:.1f} cm)")

    # --- IK
    pa = {}
    for side in ("Right", "Left"):
        pa[side] = PoleMatch(arm, f"{side}ForeArm", wr0[side], (sho0[side] + wr0[side]) * 0.5 + dir0[side] * 0.5, el0[side], 1 if cfg["neutral"] == "first" else N)
    objs = []
    for side in ("Right", "Left"):
        objs += LimbIk(arm, f"{side}ForeArm", f"{side}Hand", wr_keys[side], wr_quat[side], pole_keys[side], pa[side], f"A{side}", frames)
    ldir = {}
    for s in ("Left", "Right"):
        out = 1.0 if s == "Right" else -1.0
        ldir[s] = body.Dir(out * 0.12, 1.0, 0.5)
        pole = ankle0[s] + ldir[s]
        ang = PoleMatch(arm, f"{s}Leg", ankle0[s], pole, knee0[s], 1 if cfg["neutral"] == "first" else N)
        quat = {f: footW0[s].to_quaternion() for f in frames}
        objs += LimbIk(arm, f"{s}Leg", f"{s}Foot", {f: ankle0[s] for f in frames}, quat, {f: pole for f in frames}, ang, f"L{s}", frames)
    bones = [f"{s}{b}" for s in ("Left", "Right") for b in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot")]
    K._BakeBones(arm, bones, 1, N)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    Trim(arm, 1, N)
    # 开头 / 结尾的中性站姿保持：IK 解出的四肢和 base 原姿势差几度，所以在中性保持段里逐帧用 base 原值，
    # 靠近动作段的最后 6 帧（0.2 s）缓入缓出过渡到 IK 结果，这样首尾逐帧等于 base 又没有一跳
    ramp = 0.2
    holds = []
    for i, ((t0, n0), (t1, n1)) in enumerate(zip(timeline, timeline[1:])):
        if n0 == "A" and n1 == "A":
            holds.append((t0, t1, i > 0, i + 2 < len(timeline)))
    limb_bones = [f"{s}{b}" for s in ("Left", "Right") for b in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot")]
    baked = {}
    for f in frames:
        K.At(f)
        baked[f] = {b: arm.pose.bones[b].rotation_quaternion.copy() for b in limb_bones}
    for f in frames:
        t = (f - 1) / FPS
        w = 1.0
        for (t0, t1, has_prev, has_next) in holds:
            if t0 - 1e-6 <= t <= t1 + 1e-6:
                w = 0.0
                if has_next:
                    w = max(w, Ease(1.0 - (t1 - t) / ramp)) if t > t1 - ramp else w
                if has_prev:
                    w = max(w, Ease(1.0 - (t - t0) / ramp)) if t < t0 + ramp else w
        if w >= 1.0:
            continue
        for b in limb_bones:
            q = baked[f][b]
            n = neutral_q[b]
            if q.dot(n) < 0:
                q = q.copy()
                q.negate()
            arm.pose.bones[b].rotation_quaternion = n.slerp(q, w)
            arm.pose.bones[b].keyframe_insert("rotation_quaternion", frame=f)
    K.At(1)

    # --- 检查 / 测量
    rows = []
    prevq = {}
    maxturn = {"trunk_leg": (0, "", 0), "arm": (0, "", 0), "finger": (0, "", 0)}
    for f in frames:
        K.At(f)
        for pb in arm.pose.bones:
            q = pb.rotation_quaternion.copy()
            if pb.name in prevq:
                ang = AngleBetween(q, prevq[pb.name])
                nm = pb.name
                grp = "finger" if "HandThumb" in nm or "HandIndex" in nm or "HandMiddle" in nm or "HandRing" in nm or "HandPinky" in nm else \
                    "arm" if any(k in nm for k in ("Shoulder", "Arm", "ForeArm")) or nm.endswith("Hand") else "trunk_leg"
                if nm.endswith("Hand") or "Shoulder" in nm or nm.endswith("Arm") and "Up" not in nm or nm.endswith("ForeArm"):
                    grp = "arm"
                if ang > maxturn[grp][0]:
                    maxturn[grp] = (ang, nm, f)
            prevq[pb.name] = q
    for g, (v, nm, f) in maxturn.items():
        log(f"max per-frame turn {g}: {v:.1f} deg ({nm}) at frame {f} ({(f - 1) / FPS:.2f}s)")

    for f in frames:
        K.At(f)
        P = poses[f]
        pr, pl = K.Palm(arm, "Right"), K.Palm(arm, "Left")
        hips_p = K.BoneHead(arm, "Hips")
        neck_p = K.BoneHead(arm, "Neck")
        lean = math.degrees(math.atan2(-(neck_p.y - hips_p.y), neck_p.z - hips_p.z))
        row = {
            "f": f, "t": round((f - 1) / FPS, 3), "c": round(P["c"], 3),
            "palm_gap_cm": round((pr - pl).length * 100, 2),
            "palm_dz_cm": round((pr.z - pl.z) * 100, 2),
            "palm_R_z": round(pr.z, 3), "palm_L_z": round(pl.z, 3),
            "palm_R_fwd_of_hips_cm": round(-(pr.y - hips_p.y) * 100, 1),
            "hips_z": round(hips_p.z, 3),
            "spineFlex_deg": round((HeadPitch(arm, "Spine2") - pitch_s20) - (HeadPitch(arm, "Hips") - pitch_h0), 1),
            "pelvisPitch_deg": round(HeadPitch(arm, "Hips") - pitch_h0, 1),
            "trunkLean_deg": round(lean, 1),
            "knee_deg": {s: round(InteriorAngle(K.BoneHead(arm, f"{s}UpLeg"), K.BoneHead(arm, f"{s}Leg"), K.BoneHead(arm, f"{s}Foot")), 1) for s in ("Left", "Right")},
            "elbow_deg": {s: round(InteriorAngle(K.BoneHead(arm, f"{s}Arm"), K.BoneHead(arm, f"{s}ForeArm"), K.BoneHead(arm, f"{s}Hand")), 1) for s in ("Left", "Right")},
            "wristErr_cm": {s: round((K.BoneHead(arm, f"{s}Hand") - wr_keys[s][f]).length * 100, 2) for s in ("Left", "Right")},
        }
        rows.append(row)
    # 脚漂移
    K.At(1)
    ft0 = {n: K.BoneHead(arm, n, 1) for n in ("LeftFoot", "RightFoot")}
    drift = {n: 0.0 for n in ft0}
    for f in frames:
        for n in ft0:
            drift[n] = max(drift[n], (K.BoneHead(arm, n, f) - ft0[n]).length)
    log(f"foot drift max (cm): {{{', '.join(f'{n}: {v * 100:.2f}' for n, v in drift.items())}}}")
    # 握杆段
    gripped = [r for r in rows if r["c"] >= 0.85]
    if gripped:
        gaps = [r["palm_gap_cm"] for r in gripped]
        dzs = [abs(r["palm_dz_cm"]) for r in gripped]
        log(f"grip frames {gripped[0]['t']}..{gripped[-1]['t']} s: palm gap {min(gaps):.2f}..{max(gaps):.2f} cm, max |dz| {max(dzs):.2f} cm, "
            f"palm height {min(min(r['palm_R_z'], r['palm_L_z']) for r in gripped):.3f}..{max(max(r['palm_R_z'], r['palm_L_z']) for r in gripped):.3f} m")
    low = min(rows, key=lambda r: r["hips_z"])
    log(f"lowest hips z {low['hips_z']} m at {low['t']} s: spineFlex {low['spineFlex_deg']} pelvis {low['pelvisPitch_deg']} trunkLean {low['trunkLean_deg']} knee {low['knee_deg']} elbow {low['elbow_deg']}")
    log(f"max spine flex {max(r['spineFlex_deg'] for r in rows)} deg; max trunk lean {max(r['trunkLean_deg'] for r in rows)} deg; "
        f"min knee {min(min(r['knee_deg'].values()) for r in rows)} deg; min elbow {min(min(r['elbow_deg'].values()) for r in rows)} deg")
    log(f"IK wrist error max {max(max(r['wristErr_cm'].values()) for r in rows):.2f} cm")
    speed = 0.0
    for r0, r1 in zip(rows, rows[1:]):
        pass
    prev = None
    for f in frames:
        K.At(f)
        p = (K.Palm(arm, "Right"), K.Palm(arm, "Left"))
        if prev:
            speed = max(speed, (p[0] - prev[0]).length * FPS, (p[1] - prev[1]).length * FPS)
        prev = p
    log(f"max palm speed {speed:.2f} m/s")

    meta = {"base": cfg["base"], "label": cfg["label"], "loop": False, "duration": round(N / FPS - 1 / FPS, 3),
            "timings": cfg["timings"], "note": cfg["note"]}
    K.Export(arm, name, meta)
    K.Report(arm, name, extra={"timings": cfg["timings"], "mine": rows, "footDriftCm": {n: round(v * 100, 2) for n, v in drift.items()}})

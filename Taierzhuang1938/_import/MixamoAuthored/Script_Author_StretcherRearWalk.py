# StretcherRearWalk「担架·抬后头走」 (Claude, 2026-11-01)
#
# 这是什么：两个人抬担架，走在后头的那一个。担架上躺着伤员（60-70 kg 加担架，每头约 35 kg），
#   两臂伸直下垂、两手在大腿前外侧各握一根杆（掌心相距 0.58 m，离地约 0.77 m），
#   肩被往下拉，上身挺直略后仰抵重，步子比空手推车短一点、稍沉，膝盖微屈。
#   原地循环（loop: true）。预览会把担架挂在两手掌心的中点上，担架保持水平。
#
# 改自：Animation_Mixamo_WheelbarrowWalk_V2（推空车走，原地循环；手势本来就是两手低握两根把，
#   手指握拳、握杆方向沿前后）。保留它的躯干扭转、骨盆摆动、脚的抬放节奏；做了这些改动：
#   * 重新计时：29 帧一个循环（0.97 s）拉成 34 帧（1.13 s），步幅乘 0.80（脚的前后行程缩到 80%），
#     走速从约 1.7 m/s 降到约 1.16 m/s（担架行军速度）。
#   * 骨盆上下起伏乘 0.40、左右摆乘 0.70；整体下沉让肩落到 1.33 m 左右（膝盖微屈，吃重感）。
#   * 上身整体后仰到约 -3 度（负 = 向后；原件前倾约 12 度）：骨盆回倾 30%，三节脊柱分担其余，
#     脖子/头反向补回去，头的世界朝向跟原件一致（眼睛平视前方，不会仰着天）。
#   * 两个锁骨向下压 6 度（肩被往下拉）。
#   * 两臂用逐帧 IK 做：手腕目标 = 肩关节（跟躯干走）+ 固定的下垂偏移；
#     手的世界朝向固定为原件第 1 帧的握杆朝向，手指固定为原件第 1 帧的握拳。
#     掌心高度只跟肩的起伏的一半（所以手不会跟着大幅晃，也不会让手臂被拉到伸直上限）。
#   * 两腿逐帧 IK：脚踝位置 = 原件脚踝位置（前后行程乘 0.80、高度不变），脚朝向 = 原件脚朝向。
#   首尾两帧完全相同（最后一帧取与第 1 帧同一时刻，与原件的做法一致，原件第 30 帧 = 第 1 帧），
#   IK 逐帧迭代造成的首尾小差，在最后 8 帧里平滑并回第 1 帧（不硬拷贝）。
#
# 关键帧时间表（30 fps；帧号从 1 起；GLB 里第 1 帧在 1/30 s；整条 35 帧 = 1.133 s，循环周期 34 帧）：
#   见 meta.timings：两脚各自最靠前的时刻、骨盆最高/最低的时刻（运行时从结果里量出来）。
#
# 史实/用法：1938 年滕县战地抬担架（竹竿布兜担架）。两人前后抬，后头的人两手握杆的后端，杆从身体两侧过去，
#   手垂在大腿外侧前方；没有肩扛（战地抬运伤员是手抬，不是肩担）。
#
# 这个文件也被 Script_Author_StretcherRearJog.py 当模块引用（Build(cfg)）：两条动作共用同一套做法，
# 只是 base、重新计时、步幅、起伏量不同。
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
FPS = 30
GRIP_SOURCE = "Animation_Mixamo_WheelbarrowWalk_V2"      # 握杆的手指/手朝向取自这条的第 1 帧

WALK = dict(
    name="StretcherRearWalk", base="Animation_Mixamo_WheelbarrowWalk_V2", label="担架·抬后头走",
    cycle=29, M=36,               # 原件一个循环 29 帧（第 30 帧 = 第 1 帧）-> 新的 34 帧
    kappa=0.80,                   # 脚前后行程比例
    bounce=0.40, sway=0.70,       # 骨盆上下 / 左右摆比例
    lean=-1.0, hip_share=0.30,    # 目标躯干前倾角（负 = 后仰），骨盆分担比例
    depress=14.0,                  # 锁骨压低的起始角（度），之后按 reach 自动调
    palm_z=0.778,                 # 掌心平均高度（米）：站直、两臂伸直、肩略下沉时的自然高度，能接担架抬起动作的结尾
    reach=0.530,                  # 平均 肩 -> 手腕 距离（米）；臂总长 0.549。锁骨压低的角度反复调到这个值
    stance_knee=163.5,
    hunch=6.0, depress_max=20.0,            # 支撑相膝内角下限（度）：骨盆高度按这个定
    sh_comp=0.70,                 # 锁骨随骨盆起伏反向补偿的比例（肩高起伏压到 30%）
    lam_z=0.80, lam_xy=0.50,      # 掌心跟肩的起伏的比例
    palm_fwd=-0.05,               # 掌心在髋关节前面多少（负 = 前）：担架把手往前拉，臂略前倾
    spacing=0.58,
    note="担架后头：两臂伸直下垂吃重，两手握杆在大腿前外侧，掌心相距 0.58 m、离地约 0.77 m，肩下沉，上身略后仰，步子短而沉。原地循环，预览自动挂担架。",
)


def R3(m):
    return m.to_3x3().normalized()


def Fmt(v, n=3):
    return tuple(round(x, n) for x in v)


LOG_PATH = None


def log(s):
    print("[StretcherRear]", s)
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(s + "\n")


def AtT(tb):
    fl = int(math.floor(tb))
    bpy.context.scene.frame_set(fl, subframe=tb - fl)


def Upd():
    bpy.context.view_layer.update()


def Head(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].head


def RotW(arm, name, axis, deg):
    """绕世界轴 axis 转一根骨头（支点 = 它的头），子骨头跟着转。"""
    pb = arm.pose.bones[name]
    mw = arm.matrix_world @ pb.matrix
    pivot = mw.translation.copy()
    rot = Matrix.Rotation(math.radians(deg), 4, axis)
    new = Matrix.Translation(pivot) @ rot @ Matrix.Translation(-pivot) @ mw
    pb.matrix = arm.matrix_world.inverted() @ new
    Upd()


def Ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def Interior(a, b, c):
    u, v = (a - b).normalized(), (c - b).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, u.dot(v)))))


def SegDist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


# ----------------------------------------------------------------------------- 握杆的手：取自推车走第 1 帧
def GripSource():
    arm = K.LoadBase(GRIP_SOURCE)
    K.At(1)
    out = {"fingers": {}, "q": {}, "vloc": {}}
    for side in ("Right", "Left"):
        q0 = R3(K.BoneMatrix(arm, f"{side}Hand"))
        out["q"][side] = q0.to_quaternion()
        out["vloc"][side] = q0.inverted() @ (K.Palm(arm, side) - K.BoneHead(arm, f"{side}Hand"))
        for pb in arm.pose.bones:
            if pb.name.startswith(f"{side}Hand") and pb.name != f"{side}Hand":
                out["fingers"][pb.name] = pb.rotation_quaternion.copy()
    return out


# ----------------------------------------------------------------------------- IK
def LimbIk(arm, N, tip_bone, tail_bone, pos, quat, pole, pole_angle, tag):
    target = K._Empty(f"IK_{tag}")
    target.rotation_mode = "QUATERNION"
    pole_obj = K._Empty(f"Pole_{tag}")
    prev = None
    for i in range(N):
        f = i + 1
        target.location = pos[i]
        target.keyframe_insert("location", frame=f)
        q = quat[i].copy()
        if prev is not None and q.dot(prev) < 0:
            q.negate()
        prev = q
        target.rotation_quaternion = q
        target.keyframe_insert("rotation_quaternion", frame=f)
        pole_obj.location = pole[i]
        pole_obj.keyframe_insert("location", frame=f)
    ik = arm.pose.bones[tip_bone].constraints.new("IK")
    ik.target, ik.chain_count = target, 2
    ik.pole_target, ik.pole_angle = pole_obj, math.radians(pole_angle)
    rot = arm.pose.bones[tail_bone].constraints.new("COPY_ROTATION")
    rot.target = target
    return [target, pole_obj]


def PickPole(arm, tip_bone, root_bone, tests, label):
    """扫极点角度：挑让中间关节（肘/膝）朝极点方向弯的那个。tests: [(帧, 目标点, 极点)]。"""
    target, pole_obj = K._Empty("IKtest"), K._Empty("PoleTest")
    tip = arm.pose.bones[tip_bone]
    ik = tip.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole_obj
    best = (-1e9, None)
    for ang in range(-180, 180, 10):
        ik.pole_angle = math.radians(ang)
        tot = 0.0
        for f, tp, pp in tests:
            K.At(f)
            target.location, pole_obj.location = tp, pp
            Upd()
            root = Head(arm, root_bone)
            mid = arm.matrix_world @ tip.head
            axis = (tp - root).normalized()
            bend = mid - (root + axis * (mid - root).dot(axis))
            want = pp - (root + axis * (pp - root).dot(axis))
            tot += bend.normalized().dot(want.normalized()) if bend.length > 1e-6 else -1.0
        if tot > best[0]:
            best = (tot, ang)
    tip.constraints.remove(ik)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole_obj, do_unlink=True)
    log(f"  pole angle {label}: {best[1]} deg (mean cos {best[0] / len(tests):.3f})")
    return best[1]


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


# ----------------------------------------------------------------------------- 主流程
def Build(cfg):
    global LOG_PATH
    name = cfg["name"]
    M = cfg["M"]
    N = M + 1
    os.makedirs(K.AUTHORED, exist_ok=True)
    LOG_PATH = os.path.join(K.AUTHORED, name + ".log.txt")
    open(LOG_PATH, "w").close()

    grip = GripSource()
    arm = K.LoadBase(cfg["base"], frame_end=N)
    log(f"base {cfg['base']}  cycle {cfg['cycle']} frames -> {M} (+1 closing frame)  duration {(N - 1) / FPS:.3f} s")
    bones = [pb.name for pb in arm.pose.bones]
    finger_bones = set(grip["fingers"])
    IK_BONES = [f"{s}{b}" for s in ("Left", "Right") for b in ("Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot")]

    # --- 1) 采样原件（重新计时）
    samples = []
    for i in range(N):
        tb = 1 + cfg["cycle"] * (i % M) / M      # 最后一帧与第 1 帧取同一时刻（严格周期）
        AtT(tb)
        s = {"pose": {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones},
             "hips": Head(arm, "Hips"), "neck": Head(arm, "Neck")}
        for side in ("Left", "Right"):
            s[side + "Ankle"] = Head(arm, f"{side}Foot")
            s[side + "FootQ"] = R3(arm.matrix_world @ arm.pose.bones[f"{side}Foot"].matrix).to_quaternion()
        samples.append(s)
    base_lean = [math.degrees(math.atan2(s["hips"].y - s["neck"].y, s["neck"].z - s["hips"].z)) for s in samples[:M]]
    mean_lean0 = sum(base_lean) / M
    hips_m = Vector((sum(s["hips"].x for s in samples[:M]) / M, sum(s["hips"].y for s in samples[:M]) / M,
                     sum(s["hips"].z for s in samples[:M]) / M))
    ank_y = sum(s[side + "Ankle"].y for s in samples[:M] for side in ("Left", "Right")) / (2 * M)
    log(f"base mean lean {mean_lean0:.1f} deg (+ = forward); hips mean {Fmt(hips_m)}; ankle mean y {ank_y:.3f}")
    kappa, bounce, sway = cfg["kappa"], cfg["bounce"], cfg["sway"]

    neutral = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
    removed = Flatten(arm)
    log(f"flattened {removed} fcurves")

    def SetPose(pose):
        for pb in arm.pose.bones:
            loc, q = pose[pb.name]
            pb.location, pb.rotation_quaternion = loc.copy(), q.copy()
        Upd()

    # 锁骨压低的方向：试一下哪个符号让肩关节变低
    SetPose(samples[0]["pose"])
    depress_sign = {}
    for side in ("Right", "Left"):
        z0 = Head(arm, f"{side}Arm").z
        RotW(arm, f"{side}Shoulder", (0, 1, 0), 5.0)
        depress_sign[side] = 1.0 if Head(arm, f"{side}Arm").z < z0 else -1.0
        SetPose(samples[0]["pose"])
    log(f"clavicle depress sign {depress_sign}")

    # 脚踝目标（只由原件决定）
    ankle_t, foot_q = {}, {}
    for side in ("Right", "Left"):
        ankle_t[side] = [Vector((sm[side + "Ankle"].x, ank_y + kappa * (sm[side + "Ankle"].y - ank_y), sm[side + "Ankle"].z))
                         for sm in samples]
        for _ in range(cfg.get("ankle_smooth", 1)):         # 脚踝轨迹在循环里轻微平滑（只改摆动相交接处的拐角）
            at = ankle_t[side]
            ankle_t[side] = [(at[i - 1] + at[i] * 2 + at[(i + 1) % M]) / 4 for i in range(M)] + [None]
            ankle_t[side][M] = ankle_t[side][0].copy()
        fq = [sm[side + "FootQ"].copy() for sm in samples]
        for i in range(1, N):
            if fq[i].dot(fq[i - 1]) < 0:
                fq[i].negate()
        for _ in range(cfg.get("foot_smooth", 0)):          # 脚朝向目标在循环里平滑（[1,2,1]/4）
            new = []
            for i in range(M):
                a_, b_, c_ = fq[i - 1], fq[i], fq[(i + 1) % M]
                q = Quaternion((a_.w + 2 * b_.w + c_.w, a_.x + 2 * b_.x + c_.x, a_.y + 2 * b_.y + c_.y, a_.z + 2 * b_.z + c_.z))
                q.normalize()
                new.append(q)
            fq = new + [new[0].copy()]
        foot_q[side] = fq
    SetPose(samples[0]["pose"])
    seg_a = (Head(arm, "LeftUpLeg") - Head(arm, "LeftLeg")).length
    seg_b = (Head(arm, "LeftLeg") - Head(arm, "LeftFoot")).length
    th = math.radians(cfg["stance_knee"])
    chord = math.sqrt(seg_a ** 2 + seg_b ** 2 - 2 * seg_a * seg_b * math.cos(th))
    log(f"thigh {seg_a:.3f} shin {seg_b:.3f}; stance knee {cfg['stance_knee']} deg -> hip-ankle distance <= {chord:.3f}")
    sgn = {"Right": -1.0, "Left": 1.0}
    CLAV = 0.108

    def Compose(dlean, hips_z, depress, sh_ref):
        res = []
        for i in range(N):
            s = samples[i]
            SetPose(s["pose"])
            hw = Head(arm, "Hips")
            z = hips_z[i] if hips_z else hips_m.z - 0.02 + bounce * (hw.z - hips_m.z)
            tgt = Vector((hips_m.x + sway * (hw.x - hips_m.x), ank_y + kappa * (hw.y - ank_y), z))
            pb = arm.pose.bones["Hips"]
            m = pb.matrix.copy()
            m.translation = arm.matrix_world.inverted() @ tgt
            pb.matrix = m
            Upd()
            RotW(arm, "Hips", (1, 0, 0), dlean * cfg["hip_share"])
            rest = dlean * (1 - cfg["hip_share"]) / 3
            for b in ("Spine", "Spine1", "Spine2"):
                RotW(arm, b, (1, 0, 0), rest)
            hunch = cfg.get("hunch", 0.0)                  # 上背含胸：Spine1/Spine2 再向前弯，肩更低（负重把肩往下拉）
            for b in ("Spine1", "Spine2"):
                RotW(arm, b, (1, 0, 0), hunch / 2)
            RotW(arm, "Neck", (1, 0, 0), -(dlean + hunch) * 0.4)
            RotW(arm, "Head", (1, 0, 0), -(dlean + hunch) * 0.6)
            shn = {}
            for side in ("Right", "Left"):
                RotW(arm, f"{side}Shoulder", (0, 1, 0), depress_sign[side] * depress)
                shn[side] = Head(arm, f"{side}Arm").z
                if sh_ref:                       # 锁骨随骨盆起伏反向补偿：肩高变化压到 (1 - sh_comp)
                    x = max(-0.21, min(0.21, cfg["sh_comp"] * (shn[side] - sh_ref[side]) / CLAV))
                    RotW(arm, f"{side}Shoulder", (0, 1, 0), depress_sign[side] * math.degrees(math.asin(x)))
            hips_w, neck_w = Head(arm, "Hips"), Head(arm, "Neck")
            row = {
                "pose": {pb2.name: (pb2.location.copy(), pb2.rotation_quaternion.copy()) for pb2 in arm.pose.bones},
                "sh": {side: Head(arm, f"{side}Arm") for side in ("Right", "Left")},
                "shn": shn,
                "hipj": {side: Head(arm, f"{side}UpLeg") for side in ("Right", "Left")},
                "hips": hips_w,
                "lean": math.degrees(math.atan2(hips_w.y - neck_w.y, neck_w.z - hips_w.z)),
            }
            res.append(row)
        return res

    qT = {side: grip["q"][side].to_matrix() for side in ("Right", "Left")}
    vloc = grip["vloc"]
    pv = {side: qT[side] @ vloc[side] for side in ("Right", "Left")}           # 手腕 -> 掌心（世界）
    half = cfg["spacing"] / 2

    def Targets(comp):
        """掌心/手腕目标；同时返回平均「肩 -> 手腕」距离（臂总长 0.549）。"""
        sh_mid = [(r["sh"]["Right"] + r["sh"]["Left"]) / 2 for r in comp]
        sh_mean = sum(sh_mid[:M], Vector()) / M
        hip_y = sum((r["hipj"]["Right"].y + r["hipj"]["Left"].y) / 2 for r in comp[:M]) / M
        py0 = hip_y + cfg["palm_fwd"]
        pz0 = cfg["palm_z"]
        palm_t = {"Right": [], "Left": []}
        wrist_t = {"Right": [], "Left": []}
        for i in range(N):
            d = sh_mid[i] - sh_mean
            for side in ("Right", "Left"):
                p = Vector((sh_mean.x + cfg["lam_xy"] * d.x + sgn[side] * half, py0 + cfg["lam_xy"] * d.y,
                            pz0 + cfg["lam_z"] * d.z))
                palm_t[side].append(p)
                wrist_t[side].append(p - pv[side])
        reach = sum((comp[i]["sh"][sd] - wrist_t[sd][i]).length for i in range(M) for sd in ("Right", "Left")) / (2 * M)
        reach_max = max((comp[i]["sh"][sd] - wrist_t[sd][i]).length for i in range(M) for sd in ("Right", "Left"))
        return palm_t, wrist_t, reach, reach_max, sh_mean, py0

    chord_max = math.sqrt(seg_a ** 2 + seg_b ** 2 - 2 * seg_a * seg_b * math.cos(math.radians(177.0)))

    def LegZ(comp, i, side, dist):
        hj = comp[i]["hipj"][side]
        an = ankle_t[side][i]
        hd2 = (hj.x - an.x) ** 2 + (hj.y - an.y) ** 2
        return an.z + math.sqrt(max(dist ** 2 - hd2, 0.05)) - (hj.z - comp[i]["hips"].z)

    def HipsZ(comp, hips_z_prev):
        """每帧骨盆高度：踩在地上的那条腿（脚踝最低的）膝内角刚好 = stance_knee；
        另一条腿不许被拉过 177 度（够得着）；再循环平滑，平滑后重新夹回这两条约束。"""
        def Bounds(i):
            low = min(("Right", "Left"), key=lambda sd: ankle_t[sd][i].z)
            want = LegZ(comp, i, low, chord)
            cap = min(LegZ(comp, i, sd, chord_max) for sd in ("Right", "Left"))
            return want, cap
        need = [min(*Bounds(i)) for i in range(M)]
        for _ in range(cfg.get("hips_smooth", 2)):
            need = [(need[i - 1] + 2 * need[i] + need[(i + 1) % M]) / 4 for i in range(M)]
        need = [min(need[i], Bounds(i)[1]) for i in range(M)]
        return need + [need[0]]

    dlean = cfg["lean"] - mean_lean0
    depress, hips_z, sh_ref = cfg["depress"], None, None
    for it in range(10):
        comp = Compose(dlean, hips_z, depress, sh_ref)
        lean_m = sum(r["lean"] for r in comp[:M]) / M
        palm_t, wrist_t, reach_m, reach_max, sh_mean, py0 = Targets(comp)
        shz = [sum(r["shn"][sd] for r in comp[:M]) / M for sd in ("Right", "Left")]
        log(f"compose pass {it}: dlean {dlean:.2f}, depress {depress:.1f}, hips {'legs' if hips_z else 'scaled'} -> lean {lean_m:.2f}, "
            f"shoulder z {sh_mean.z:.3f}, reach mean {reach_m:.3f} max {reach_max:.3f}")
        e_l, e_r = cfg["lean"] - lean_m, reach_m - cfg["reach"]
        new_hz = HipsZ(comp, hips_z)
        dz = max(abs(a_ - b_) for a_, b_ in zip(new_hz, hips_z)) if hips_z else 9.0
        sh_ref = {"Right": shz[0], "Left": shz[1]}
        if hips_z and abs(e_l) < 0.15 and abs(e_r) < 0.002 and dz < 0.002:
            break
        dlean += e_l
        if hips_z:
            depress = max(2.0, min(cfg.get('depress_max', 16.0), depress + 0.5 * e_r / 0.0017))
        hips_z = new_hz
    # 连续四元数（防止插值翻转）
    prev = {}
    for r in comp:
        for bn, (loc, q) in r["pose"].items():
            if bn in prev and q.dot(prev[bn]) < 0:
                q.negate()
            prev[bn] = q.copy()

    # 脚趾弯折是原件蹬地时一下弹起的（重新计时后仍有 20 度/帧），循环里平滑两遍（[1,2,1]/4）
    for tb in ("LeftToeBase", "RightToeBase"):
        for _ in range(cfg.get("toe_smooth", 3)):
            qs = [comp[i]["pose"][tb][1].copy() for i in range(M)]
            new = []
            for i in range(M):
                a, b, c = qs[i - 1], qs[i], qs[(i + 1) % M]
                if a.dot(b) < 0:
                    a = a.copy(); a.negate()
                if c.dot(b) < 0:
                    c = c.copy(); c.negate()
                q = Quaternion((a.w + 2 * b.w + c.w, a.x + 2 * b.x + c.x, a.y + 2 * b.y + c.y, a.z + 2 * b.z + c.z))
                q.normalize()
                new.append(q)
            for i in range(M):
                comp[i]["pose"][tb] = (comp[i]["pose"][tb][0], new[i])
        comp[M]["pose"][tb] = (comp[M]["pose"][tb][0], comp[0]["pose"][tb][1].copy())

    # --- 4) 写身体关键帧（手指固定握拳）
    for i in range(N):
        f = i + 1
        pose = dict(comp[i]["pose"])
        for bn in finger_bones:
            pose[bn] = (neutral[bn][0], grip["fingers"][bn])
        SetPose(pose)
        for pb in arm.pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f)
        arm.pose.bones["Hips"].keyframe_insert("location", frame=f)
    K.At(1)

    # --- 5) 手臂 + 腿 IK
    objs = []
    tests = [1, 1 + M // 4, 1 + M // 2, 1 + 3 * M // 4]
    for side in ("Right", "Left"):
        poles = []
        for i in range(N):
            mid = (comp[i]["sh"][side] + wrist_t[side][i]) / 2
            poles.append(mid + Vector((sgn[side] * 0.35, 0.9, -0.1)).normalized() * 0.5)
        ang = PickPole(arm, f"{side}ForeArm", f"{side}Arm",
                       [(f, wrist_t[side][f - 1], poles[f - 1]) for f in tests], f"{side} arm")
        objs += LimbIk(arm, N, f"{side}ForeArm", f"{side}Hand", wrist_t[side], [Quaternion(qT[side].to_quaternion())] * N,
                       poles, ang, side[0] + "A")
        poles = []
        for i in range(N):
            mid = (comp[i]["hipj"][side] + ankle_t[side][i]) / 2
            poles.append(mid + Vector((sgn[side] * 0.12, -1.0, 0.0)).normalized() * 0.6)
        ang = PickPole(arm, f"{side}Leg", f"{side}UpLeg",
                       [(f, ankle_t[side][f - 1], poles[f - 1]) for f in tests], f"{side} leg")
        objs += LimbIk(arm, N, f"{side}Leg", f"{side}Foot", ankle_t[side], foot_q[side], poles, ang, side[0] + "L")
    K._BakeBones(arm, IK_BONES, 1, N)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    Trim(arm, 1, N)

    # --- 6) 首尾完全一致：最后一帧 = 第 1 帧
    K.At(1)
    first = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
    K.At(N)
    diff_q = 0.0
    for pb in arm.pose.bones:
        loc1, q1 = first[pb.name]
        diff_q = max(diff_q, math.degrees(2 * math.acos(min(1.0, abs(pb.rotation_quaternion.dot(q1))))))
    log(f"closing frame vs first frame before copy: max bone rotation difference {diff_q:.4f} deg")
    # 最后 8 帧把 IK 解出来的姿势平滑并回第 1 帧（IK 逐帧迭代，首尾差 0.2-1.4 度，不能在最后一步硬拷贝出小跳）
    SEAM = 8
    tail = {}
    for f in range(N - SEAM, N + 1):
        K.At(f)
        tail[f] = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
    ident = Quaternion((1, 0, 0, 0))
    for f in range(N - SEAM + 1, N + 1):
        w = Ease((f - (N - SEAM)) / SEAM)
        for pb in arm.pose.bones:
            loc1, q1 = first[pb.name]
            locN, qN = tail[N][pb.name]
            locf, qf = tail[f][pb.name]
            if qN.dot(q1) < 0:
                q1 = q1.copy(); q1.negate()
            delta = qN.inverted() @ q1                      # 最后一帧到第 1 帧的小修正（局部旋转）
            if delta.w < 0:
                delta = delta.copy(); delta.negate()
            pb.rotation_quaternion = qf @ ident.slerp(delta, w)
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == "Hips":
                pb.location = locf + (loc1 - locN) * w
                pb.keyframe_insert("location", frame=f)

    # --- 7) 测量
    rows = []
    for f in range(1, N + 1):
        K.At(f)
        row = {"f": f, "t": round((f - 1) / FPS, 4)}
        for side in ("Right", "Left"):
            row[side[0] + "palm"] = list(K.Palm(arm, side))
            row[side[0] + "ankle"] = list(Head(arm, f"{side}Foot"))
            row[side[0] + "toe"] = list(Head(arm, f"{side}ToeBase"))
            row[side[0] + "elbow"] = Interior(Head(arm, f"{side}Arm"), Head(arm, f"{side}ForeArm"), Head(arm, f"{side}Hand"))
            row[side[0] + "knee"] = Interior(Head(arm, f"{side}UpLeg"), Head(arm, f"{side}Leg"), Head(arm, f"{side}Foot"))
            hipj, knee = Head(arm, f"{side}UpLeg"), Head(arm, f"{side}Leg")
            palm = K.Palm(arm, side)
            row[side[0] + "thighDist"] = min(SegDist(palm, hipj, knee), SegDist(palm, Head(arm, f"{'Left' if side == 'Right' else 'Right'}UpLeg"),
                                                                                    Head(arm, f"{'Left' if side == 'Right' else 'Right'}Leg")))
            row[side[0] + "ankleErr"] = (Head(arm, f"{side}Foot") - ankle_t[side][f - 1]).length
            row[side[0] + "wristErr"] = (Head(arm, f"{side}Hand") - wrist_t[side][f - 1]).length
        row["hips"] = list(Head(arm, "Hips"))
        row["shoulderMid"] = list((Head(arm, "RightArm") + Head(arm, "LeftArm")) / 2)
        neck, hips = Head(arm, "Neck"), Head(arm, "Hips")
        row["lean"] = math.degrees(math.atan2(hips.y - neck.y, neck.z - hips.z))
        rows.append(row)

    def Rng(vals):
        return max(vals) - min(vals)

    rz = [r["Rpalm"][2] for r in rows]
    lz = [r["Lpalm"][2] for r in rows]
    mz = [(a + b) / 2 for a, b in zip(rz, lz)]
    my = [(r["Rpalm"][1] + r["Lpalm"][1]) / 2 for r in rows]
    mx = [(r["Rpalm"][0] + r["Lpalm"][0]) / 2 for r in rows]
    dist = [(Vector(r["Rpalm"]) - Vector(r["Lpalm"])).length for r in rows]
    dz = [abs(a - b) for a, b in zip(rz, lz)]
    summary = {
        "palmHeightRange_cm": round(Rng(mz) * 100, 2),
        "palmHeightRight_cm": [round(min(rz) * 100, 1), round(max(rz) * 100, 1)],
        "palmHeightLeft_cm": [round(min(lz) * 100, 1), round(max(lz) * 100, 1)],
        "palmHeightWorst_cm": round(max(max(rz) - min(rz), max(lz) - min(lz)) * 100, 2),
        "palmForeAftRange_cm": round(max(Rng([r["Rpalm"][1] for r in rows]), Rng([r["Lpalm"][1] for r in rows])) * 100, 2),
        "palmSideRange_cm": round(max(Rng([r["Rpalm"][0] for r in rows]), Rng([r["Lpalm"][0] for r in rows])) * 100, 2),
        "palmDistance_m": [round(min(dist), 4), round(max(dist), 4)],
        "palmHeightDiffMax_cm": round(max(dz) * 100, 2),
        "palmGroundHeight_m": [round(min(min(rz), min(lz)), 3), round(max(max(rz), max(lz)), 3)],
        "elbowInterior_deg": [round(min(min(r["Relbow"], r["Lelbow"]) for r in rows), 1),
                              round(max(max(r["Relbow"], r["Lelbow"]) for r in rows), 1)],
        "kneeInterior_deg": [round(min(min(r["Rknee"], r["Lknee"]) for r in rows), 1),
                             round(max(max(r["Rknee"], r["Lknee"]) for r in rows), 1)],
        "palmToThighMin_cm": round(min(min(r["RthighDist"], r["LthighDist"]) for r in rows) * 100, 1),
        "leanMean_deg": round(sum(r["lean"] for r in rows[:M]) / M, 2),
        "leanRange_deg": [round(min(r["lean"] for r in rows), 1), round(max(r["lean"] for r in rows), 1)],
        "hipsZ_m": [round(min(r["hips"][2] for r in rows), 3), round(max(r["hips"][2] for r in rows), 3)],
        "shoulderMidZ_m": [round(min(r["shoulderMid"][2] for r in rows), 3), round(max(r["shoulderMid"][2] for r in rows), 3)],
        "ankleErrMax_cm": round(max(max(r["RankleErr"], r["LankleErr"]) for r in rows) * 100, 2),
        "wristErrMax_cm": round(max(max(r["RwristErr"], r["LwristErr"]) for r in rows) * 100, 2),
    }
    # 每根骨头相邻帧最大转角（腿/躯干 <= 12 度/帧）
    turns = {}
    prevq = None
    for f in range(1, N + 1):
        K.At(f)
        cur = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones}
        if prevq:
            for bn, q in cur.items():
                a = math.degrees(2 * math.acos(min(1.0, abs(q.dot(prevq[bn])))))
                if a > turns.get(bn, (0, 0))[0]:
                    turns[bn] = (a, f)
        prevq = cur
    worst = sorted(turns.items(), key=lambda kv: -kv[1][0])[:8]
    summary["maxTurnPerFrame_deg"] = {bn: [round(a, 1), f] for bn, (a, f) in worst}
    # 支撑相膝内角（脚踝高度 < 最低 + 1.2 cm 的平脚着地帧）
    sk = []
    for side in ("R", "L"):
        zmin = min(r[side + "ankle"][2] for r in rows)
        sk += [r[side + "knee"] for r in rows if r[side + "ankle"][2] < zmin + 0.012]
    summary["stanceKneeMin_deg"] = round(min(sk), 1)
    # 手速
    vmax = 0.0
    for a, b in zip(rows, rows[1:]):
        for k in ("Rpalm", "Lpalm"):
            vmax = max(vmax, (Vector(b[k]) - Vector(a[k])).length * FPS)
    summary["palmSpeedMax_mps"] = round(vmax, 2)
    # 支撑脚漂移：脚踝高度 < 触地阈值的连续段，对「前后位置随时间」拟合直线，看偏离；横向看最大离散
    stance = {}
    for side in ("R", "L"):
        zmin = min(r[side + "ankle"][2] for r in rows)
        thr = zmin + 0.006
        segs, cur = [], []
        for r in rows[:-1]:
            if r[side + "ankle"][2] < thr:
                cur.append(r)
            elif cur:
                segs.append(cur)
                cur = []
        if cur:
            segs.append(cur)
        out = []
        for seg in segs:
            if len(seg) < 3:
                continue
            ts = [r["t"] for r in seg]
            ys = [r[side + "ankle"][1] for r in seg]
            xs = [r[side + "ankle"][0] for r in seg]
            tm, ym, xm = sum(ts) / len(ts), sum(ys) / len(ys), sum(xs) / len(xs)
            den = sum((t - tm) ** 2 for t in ts) or 1e-9
            slope = sum((t - tm) * (y - ym) for t, y in zip(ts, ys)) / den
            dev_y = max(abs(y - (ym + slope * (t - tm))) for t, y in zip(ts, ys))
            out.append({"frames": [seg[0]["f"], seg[-1]["f"]], "speed_mps": round(slope, 3),
                        "devAlongLine_cm": round(dev_y * 100, 2), "lateralDrift_cm": round((max(xs) - min(xs)) * 100, 2),
                        "heightDrift_cm": round((max(r[side + "ankle"][2] for r in seg) - min(r[side + "ankle"][2] for r in seg)) * 100, 2)})
        stance[side] = out
    summary["stance"] = stance
    # 首尾对比
    summary["loopMaxPalmDiff_cm"] = round(max((Vector(rows[0][k]) - Vector(rows[-1][k])).length for k in ("Rpalm", "Lpalm", "Rankle", "Lankle", "hips")) * 100, 4)
    summary["duration_s"] = round((N - 1) / FPS, 3)
    for k, v in summary.items():
        log(f"{k}: {v}")

    # 时间表
    def when(fn):
        return round(max(rows[:-1], key=fn)["t"], 3)

    timings = {
        "start": 0.0, "leftFootMostForward": when(lambda r: -r["Lankle"][1]), "rightFootMostForward": when(lambda r: -r["Rankle"][1]),
        "hipsHighest": when(lambda r: r["hips"][2]), "hipsLowest": when(lambda r: -r["hips"][2]),
        "end": round((N - 1) / FPS, 3),
    }
    meta = {"base": cfg["base"], "label": cfg["label"], "loop": True, "duration": round((N - 1) / FPS, 3),
            "timings": timings, "note": cfg["note"]}
    K.Export(arm, name, meta)
    K.Report(arm, name, extra={"timings": timings, "summary": summary, "mine": rows})


if __name__ == "__main__":
    Build(WALK)

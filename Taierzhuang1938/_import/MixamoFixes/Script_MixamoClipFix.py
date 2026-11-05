# Mixamo 原件修复（2026-11-02 全库审查之后）：从 Raw FBX 重新转 GLB，转之前按修法数据改动作。
#
#   node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_import/MixamoFixes/Script_MixamoClipFix.py \
#     --batch-args <args.json> --task MixamoClipFix
#   args.json = ["--only=SittingIdle_V3,Crawling_V1"（词干，可省 Animation_Mixamo_ 前缀，整名匹配）, "--log=<dir>", "--no-export", "--diag", "--out=<dir>"]
#   （都可省；不给 --only 就跑修法表里全部；--out 导到别的目录试烘、不碰 Animation/Mixamo 和 Original）
#
# 修法表 Data_MixamoClipFixOps.json（同目录）：{ "clips": { "<文件名词干>": { "ops": [ {op…}, … ] } } }，op 按顺序执行：
#   { "op": "seam",   "topic": "Seam",   "frames": 12 }
#       可循环动作首尾不接：尾段 frames 帧里每根骨头逐帧乘上一个渐增的本地修正，最后一帧 = 第一帧（smoothstep 渐入）。
#   { "op": "glitch", "topic": "Glitch", "threshold": 13, "flagAt": 15, "maxRun": 2, "maxRunLeaf": 8, "bones": [...] | 省略 = 全身 }
#       一帧抽搐：只修审查会报的帧（离前后两帧中间姿势 > flagAt 度，同审查量法），每帧找包住它的最短一段（胳膊腿躯干 ≤ maxRun 帧，脚趾手指 ≤ maxRunLeaf 帧），换成两端好帧之间的球面插值；
#       胳膊 / 腿 / 脊柱同一条链上的骨头同几帧一起插值（单插一节会让手脚戳进身体），换完这段和两端都不超阈值才算。
#       更长的段不插（那是真快的动作），记进日志的「未消掉」。循环动作首尾按环处理。
#   { "op": "hands",  "topic": "Hands",  "sides": ["Right","Left"], "handCm": 1.0, "forearmCm": 1.5, "link": false,
#     "rotate": true, "fingerDeg": 30, "wristDeg": 20, "capCm": 12, "targets": [骨名…]（省略 = 审查同一套：躯干、头、大腿、小腿） }
#       手掌 / 指节 / 前臂进身体：逐帧在点上求最小改动（同审查量法的手腕、指节、前臂三点，贴着目标 handCm / forearmCm）：
#       最深的是指节 → 先绕指根转那根手指的第一节（≤ fingerDeg），再绕手腕转手掌（≤ wristDeg）；都不够或是手腕 / 前臂
#       进去 → 整只手（前臂进去时连前臂）沿穿插量的数值梯度往外平移（≤ capCm）。平移用两节骨解析 IK 落到骨头上
#       （肩不动，肘的弯曲平面跟着肩→腕方向最小转动、不翻面，手腕世界朝向不变）。每帧要的量时间上取邻域最大再
#       高斯平滑（前后约 6 帧渐入渐出），推完再量、补余量，最多 6 轮。
#       link = true：两只手腕推同一个位移、不转手腕手指（端枪时两手在枪上的相对关系和握法不变）。
#   { "op": "shift", "topic": "Pose", "frames": [a, b], "cm": 2, "awayFrom": "Head" | "dir": [x, y, z]（世界，Z 朝上）,
#     "sides": ["Right","Left"], "ramp": 6 }
#       手本身没穿、是手里的枪 / 刀穿进身体时用：两只手腕同推 cm（背离某根骨的人体胶囊中心，或按世界方向），
#       第 a–b 帧满量、前后 ramp 帧 smoothstep 渐入渐出，两节骨 IK、手腕世界朝向不变，道具相对两手不变。
#   { "op": "grip", "topic": "Grip", "marginMm": 0, "tolMm": 0.5, "sigma": 1 }
#       大刀动作的两手贴刀柄（2026-11-05，只给挂大刀的 GreatSword 九条；量法 Script_DadaoGripAudit.mjs，挂法 = 预览工具 Tool_MixamoAnimationPreview.html）：
#       挂法移植：刀固定在右手里（标定 = GreatSwordIdle_V1 第 0 帧），握点 = 掌心点（手腕 → 中指根 0.72）沿掌心法线推出
#       「该人物掌心皮肤厚度（X Bot 绑定网格量）+ 刀柄在掌心方向的支撑距离（圆角矩形截面）+ 2 mm」，标定做两遍（掌心对着窄边还是宽面取决于刀的朝向）。
#       1) 左手两节骨 IK（LeftReach）：握持权重 h = 左手握点离刀轴 z 0.13–0.20 段的距离（0.12–0.18 m 渐变），时间上取 ±3 帧最大值再高斯 σ=2；
#          目标点 = 刀轴上 z 0.13–0.17 处；手掌最小转动让刀柄落进掌平面，再绕掌心法线把手指与「朝护手」方向的夹角限在 40–90°；
#          掌心离轴线的距离按手掌 + 拇指根顶点（X Bot 绑定网格，LeftHand + LeftHandThumb1 主权重 ≥ 0.5）对刀柄 SDF 求到陷进 0.5 mm（二分），
#          腕位置 = 目标 − 转后的手的掌心偏移，SolveArm 两节骨 IK（左肩不动），按 h 混合；左手松开的帧（h = 0）保持原动作；手是反的帧不动并记日志。
#       2) 手指（四指各 3 节，拇指第 1 节两个自由度 + 第 2、3 节）：每节骨 = swing ⊗ 绕本地轴的转角（保留原来的外展 / 扭转），
#          胶囊（半径 = 皮肤顶点到骨头线距离的第 90 百分位，指尖一端缩到指尖关节）对刀柄解析 SDF（圆角矩形柄、椭圆护手板，柄尾环用 BVH）的净空：
#          E = Σ wᵢ·max(cᵢ,0)² + 1000·Σ max(−cᵢ−tol,0)² + 7.4e-5·(θ₃ − 0.7·θ₂)²，首帧 5° 全网格 + 1° 细化，之后在上一帧解附近细化，
#          陷进 > 1 mm 或 E 变大 4 倍回全网格；拇指另和同手食指 / 中指胶囊互相避让；Thumb1 不进接触测试（它是掌根肌肉）。
#          按握持权重 g（右手恒 1，左手由握点离柄距离定）混合、时间上 σ=1 平滑（循环动作首尾仍是同一帧）。
#       刀固定在右手里，不再有「刀尾朝左手转」（AIM_AT_POMMEL 已从 Script_MixamoProps.mjs 删掉）。
# 人体量法照搬 Script_MixamoLibraryAudit.mjs 的 SetupInPage：X Bot 蒙皮按每根骨一段椭圆截面胶囊拟合（第 85 百分位）。
# 改前第一次覆盖时把当时的 GLB 拷到 Animation/Mixamo/Original/（已有就不拷）。每条写一份日志 JSON 到 --log 目录，
# Script_MixamoClipFixRecords.mjs 拿它和审查数生成 <词干>.<主题>.fix.json。
import base64
import bpy
import itertools
import json
import math
import os
import shutil
import struct
import sys
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

PREFIX = "mixamorig:"
HERE = os.path.dirname(os.path.abspath(__file__))
TZ = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(TZ, "_import", "Mixamo", "Raw")
OUT = os.path.join(TZ, "Animation", "Mixamo")
ORIG = os.path.join(OUT, "Original")
OPS = os.path.join(HERE, "Data_MixamoClipFixOps.json")

VOLUME_BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm",
                "LeftForeArm", "RightForeArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]
HAND_TARGETS = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]
FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"]


def Log(*a):
    print("[MixamoClipFix]", *a, flush=True)


def Args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) == 1 and argv[0].endswith(".json") and os.path.exists(argv[0]):
        with open(argv[0], encoding="utf-8") as f:
            argv = json.load(f)
    opts = {"only": None, "log": None, "export": True, "diag": False, "out": None}
    for a in argv:
        if a.startswith("--only="):
            opts["only"] = [s for s in a[7:].split(",") if s]
        elif a.startswith("--log="):
            opts["log"] = a[6:]
        elif a.startswith("--out="):
            opts["out"] = a[6:]
        elif a == "--no-export":
            opts["export"] = False
        elif a == "--diag":
            opts["diag"] = True
    return opts


def ClearScene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def Import(source):
    """Same import as Script_MixamoLibraryBake.py Convert()."""
    ClearScene()
    bpy.ops.import_scene.fbx(filepath=source, automatic_bone_orientation=False, ignore_leaf_bones=False)
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError(f"no armature in {source}")
    for arm in armatures:
        for bone in arm.data.bones:
            if bone.name.startswith(PREFIX):
                bone.name = bone.name[len(PREFIX):]
        arm.name = "Armature"
    return armatures[0]


def Export(target):
    """Same export parameters as Script_MixamoLibraryBake.py Convert()."""
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
    )


def Pct(arr, p):
    s = sorted(arr)
    return s[min(len(s) - 1, int(math.floor(p * len(s))))]


def FitBody():
    """Port of the audit's SetupInPage capsule fit, in Blender bone space (armature units)."""
    arm = Import(os.path.join(RAW, "Model_MixamoXBot.fbx"))
    armInv = arm.matrix_world.inverted()
    samples = {n: [] for n in VOLUME_BONES}
    boneInv = {b.name: b.matrix_local.inverted() for b in arm.data.bones}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        names = {g.index: (g.name[len(PREFIX):] if g.name.startswith(PREFIX) else g.name) for g in obj.vertex_groups}
        toArm = armInv @ obj.matrix_world
        for v in obj.data.vertices:
            best, bw = None, 0.0
            for g in v.groups:
                if g.weight > bw:
                    bw, best = g.weight, names.get(g.group)
            if bw < 0.6 or best not in samples:
                continue
            p = boneInv[best] @ (toArm @ v.co)
            samples[best].append((p.x, p.y, p.z))
    vols = {}
    for name, pts in samples.items():
        if len(pts) < 20:
            continue
        xs, ys, zs = [p[0] for p in pts], [p[1] for p in pts], [p[2] for p in pts]
        cx, cz = Pct(xs, 0.5), Pct(zs, 0.5)
        rx, rz = Pct([abs(x - cx) for x in xs], 0.85), Pct([abs(z - cz) for z in zs], 0.85)
        vols[name] = dict(cx=cx, cz=cz, rx=rx, rz=rz, y0=Pct(ys, 0.05), y1=Pct(ys, 0.95))
    rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
    return vols, rest


# ---------------------------------------------------------------- clip data
class Clip:
    def __init__(self, arm, stem):
        self.arm, self.stem = arm, stem
        self.scale = arm.matrix_world.to_scale()[0]  # metres per armature unit
        action = arm.animation_data.action
        self.action = action
        cb = action.layers[0].strips[0].channelbags[0]
        self.fc = {}
        for fc in cb.fcurves:
            dp = fc.data_path
            if not dp.startswith('pose.bones["'):
                continue
            bone = dp.split('"')[1]
            prop = dp.split(".")[-1]
            self.fc.setdefault(bone, {}).setdefault(prop, {})[fc.array_index] = fc
        fr = action.frame_range
        self.frames = list(range(int(round(fr[0])), int(round(fr[1])) + 1))
        self.n = len(self.frames)
        bones = list(arm.data.bones)
        depth = {}
        for b in bones:
            d, p = 0, b.parent
            while p:
                d, p = d + 1, p.parent
            depth[b.name] = d
        self.order = [b.name for b in sorted(bones, key=lambda b: depth[b.name])]
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.children = {b.name: [c.name for c in b.children] for b in bones}
        self.rel = {b.name: (b.parent.matrix_local.inverted() @ b.matrix_local if b.parent else b.matrix_local.copy()) for b in bones}
        self.Q, self.L, self.S = {}, {}, {}
        for name in self.order:
            ch = self.fc.get(name, {})
            self.Q[name] = [self.ReadQ(ch, k) for k in range(self.n)]
            self.L[name] = [self.ReadV(ch, "location", k, 0.0) for k in range(self.n)]
            self.S[name] = [self.ReadV(ch, "scale", k, 1.0) for k in range(self.n)]
        self.dirty = set()
        self.Q0 = {b: [q.copy() for q in qs] for b, qs in self.Q.items()}

    def ReadQ(self, ch, k):
        r = ch.get("rotation_quaternion")
        if not r:
            return Quaternion()
        f = self.frames[k]
        return Quaternion([r[i].evaluate(f) if i in r else (1.0 if i == 0 else 0.0) for i in range(4)])

    def ReadV(self, ch, prop, k, default):
        r = ch.get(prop)
        if not r:
            return Vector((default,) * 3)
        f = self.frames[k]
        return Vector([r[i].evaluate(f) if i in r else default for i in range(3)])

    def Basis(self, name, k, q=None):
        m = (q or self.Q[name][k]).to_matrix().to_4x4()
        s = self.S[name][k]
        m = m @ Matrix.Diagonal((s.x, s.y, s.z, 1.0))
        m.translation = self.L[name][k]
        return m

    def Pose(self, k):
        P = {}
        for name in self.order:
            par = self.parent[name]
            base = (P[par] @ self.rel[name]) if par else self.rel[name]
            P[name] = base @ self.Basis(name, k)
        return P

    def Subtree(self, root):
        out, stack = [], [root]
        while stack:
            b = stack.pop()
            out.append(b)
            stack.extend(self.children[b])
        return [b for b in self.order if b in set(out)]

    def RePose(self, P, k, root, override):
        for name in self.Subtree(root):
            par = self.parent[name]
            base = (P[par] @ self.rel[name]) if par else self.rel[name]
            P[name] = base @ self.Basis(name, k, override.get(name))

    def WriteBack(self):
        cb = self.action.layers[0].strips[0].channelbags[0]
        for name in self.dirty:
            r = self.fc.setdefault(name, {}).setdefault("rotation_quaternion", {})
            for i in range(4):
                if i not in r:
                    r[i] = cb.fcurves.new(f'pose.bones["{name}"].rotation_quaternion', index=i, group_name=name)
                fc = r[i]
                fc.keyframe_points.clear()
                fc.keyframe_points.add(self.n)
                for k in range(self.n):
                    kp = fc.keyframe_points[k]
                    v = self.Q[name][k][i]
                    kp.co = (self.frames[k], v)
                    kp.handle_left = (self.frames[k] - 0.3, v)
                    kp.handle_right = (self.frames[k] + 0.3, v)
                    kp.interpolation = "LINEAR"
                fc.update()


def Angle(a, b):
    return 2 * math.degrees(math.acos(min(1.0, abs(a.dot(b)))))


def Smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def Ranges(frames):
    """[3,4,5,9] -> '3–5、9' (audit frame numbers = Blender frame numbers)."""
    frames = sorted(set(frames))
    out, start, prev = [], None, None
    for f in frames:
        if start is None:
            start = prev = f
        elif f == prev + 1:
            prev = f
        else:
            out.append(f"{start}" if start == prev else f"{start}–{prev}")
            start = prev = f
    if start is not None:
        out.append(f"{start}" if start == prev else f"{start}–{prev}")
    return "、".join(out)


def IsLoop(manifest, stem):
    c = manifest.get(stem + ".glb")
    return bool(c and c.get("loop"))


# ---------------------------------------------------------------- seam
def OpSeam(clip, op, ctx):
    n = clip.n
    K = int(op.get("frames", min(12, max(3, n // 3))))
    K = min(K, n - 1)
    per = []
    for name in clip.order:
        qs = clip.Q[name]
        first, last = qs[0], qs[-1]
        gap = Angle(first, last)
        if gap < 0.5:
            continue
        c = last.inverted() @ first
        if c.w < 0:
            c.negate()
        for j in range(K + 1):
            k = n - 1 - K + j
            w = Smoothstep(j / K)
            qs[k] = qs[k] @ Quaternion().slerp(c, w)
        qs[-1] = first.copy()
        clip.dirty.add(name)
        per.append((gap, name))
    per.sort(reverse=True)
    top = "、".join(f"{nm} {g:.1f}°" for g, nm in per[:4])
    first, last = clip.frames[0], clip.frames[-1]
    return [f"第 {last - K}–{last} 帧 全身 {len(per)} 根骨头尾段渐变到第 {first} 帧的姿势（smoothstep，尾帧 = 首帧），首尾差大的：{top}"]


# ---------------------------------------------------------------- glitch
def GlitchMetric(qs, k, cyc):
    n = len(qs)
    if cyc:
        prev, nxt = qs[cyc(k - 1)], qs[cyc(k + 1)]
    else:
        if k >= n - 1:
            return 0.0
        prev = qs[k - 1] if k > 0 else qs[0]
        nxt = qs[k + 1]
    return Angle(qs[k], prev.slerp(nxt, 0.5))


CHAINS = [["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"], ["RightShoulder", "RightArm", "RightForeArm", "RightHand"],
          ["LeftUpLeg", "LeftLeg", "LeftFoot"], ["RightUpLeg", "RightLeg", "RightFoot"], ["Spine", "Spine1", "Spine2", "Neck", "Head"]]


def IsLeaf(name):
    return "Toe" in name or ("Hand" in name and name[-1].isdigit())


def OpGlitch(clip, op, ctx):
    thr = float(op.get("threshold", 13))
    flagAt = float(op.get("flagAt", 15))
    maxRunBody = int(op.get("maxRun", 2))
    maxRunLeaf = int(op.get("maxRunLeaf", 8))
    allBones = [b for b in clip.order if not b.endswith("_End") and not (b[-1] == "4" and "Hand" in b)]
    bones = op.get("bones") or allBones
    n = clip.n
    loop = ctx["loop"]
    for name in allBones:
        qs = clip.Q[name]
        for k in range(1, n):
            if qs[k].dot(qs[k - 1]) < 0:
                qs[k] = -qs[k]
    # 循环动作：尾帧和首帧一样就按 n-1 帧一圈，否则 n 帧一圈
    gaps = sum(Angle(clip.Q[b][0], clip.Q[b][-1]) for b in allBones)
    steps = sum(Angle(clip.Q[b][-2], clip.Q[b][-1]) for b in allBones)
    dup = loop and (gaps < 0.5 * steps or gaps < 1.0)
    period = (n - 1) if dup else n
    cyc = (lambda k: k % period) if loop else None
    idxs = list(range(period if loop else n - 1))
    W = (lambda i: cyc(i)) if loop else (lambda i: i)
    chainOf = {b: c for c in CHAINS for b in c}

    def Metric(name, k):
        return GlitchMetric(clip.Q[name], k, cyc)

    changes, unresolved, touched = [], [], {}
    for name in bones:
        if max(Metric(name, k) for k in idxs) <= flagAt:
            continue  # 审查不报的骨头不动
        leaf = IsLeaf(name)
        maxRun = maxRunLeaf if leaf else maxRunBody
        group = [name] if leaf else [b for b in chainOf.get(name, [name]) if b in clip.Q]
        worst = 0.0
        fixedFrames = []
        for _ in range(8):
            # 只修审查会报的帧（> flagAt）；换完的段和两端要压到 threshold 以下
            bad = sorted([(Metric(name, k), k) for k in idxs if Metric(name, k) > flagAt], reverse=True)
            if not bad:
                break
            progressed = False
            for dev, k in bad:
                if Metric(name, k) <= flagAt:
                    continue
                done = False
                for L in range(1, maxRun + 1):
                    for a in range(k - L + 1, k + 1):
                        b = a + L - 1
                        if not loop and (a < 0 or b + 1 > n - 1):
                            continue
                        check = [W(i) for i in range(a - 1, b + 2) if loop or 0 <= i < n - 1]
                        orig = {(g, i): Metric(g, i) for g in group for i in check}
                        cand = {}
                        for g in group:
                            qs = clip.Q[g]
                            if not loop and a == 0:
                                # 开头没有前一帧：这几帧定在后面第一帧好帧上
                                for i in range(0, b + 1):
                                    cand[(g, i)] = qs[b + 1].copy()
                            else:
                                A, B = qs[W(a - 1)], qs[W(b + 1)]
                                for j, i in enumerate(range(a, b + 1)):
                                    cand[(g, W(i))] = A.slerp(B, (j + 1) / (L + 1))
                        saved = {key: clip.Q[key[0]][key[1]] for key in cand}
                        for (g, i), q in cand.items():
                            clip.Q[g][i] = q
                        ok = all(Metric(name, i) <= thr for i in check) and \
                            all(Metric(g, i) <= max(thr, orig[(g, i)]) for g in group if g != name for i in check)
                        if ok:
                            done = True
                            for (g, i) in cand:
                                touched.setdefault(g, set()).add(i)
                            fixedFrames.extend(i for (g, i) in cand if g == name)
                            worst = max(worst, dev)
                            break
                        for (g, i), q in saved.items():
                            clip.Q[g][i] = q
                    if done:
                        break
                progressed = progressed or done
            if not progressed:
                break
        left = [(round(Metric(name, k), 1), k) for k in idxs if Metric(name, k) > flagAt]
        if fixedFrames:
            fr = [clip.frames[i] for i in fixedFrames]
            extra = f"（同链 {'、'.join(g for g in group if g != name)} 同几帧一起插值）" if len(group) > 1 else ""
            changes.append(f"{name} 第 {Ranges(fr)} 帧：原来离前后帧中间姿势最多 {worst:.1f}°，换成两端好帧之间的球面插值{extra}")
        if left:
            unresolved.append(f"{name} 还有 {len(left)} 帧 > {flagAt}°（最大 {max(left)[0]}° @ 第 {clip.frames[max(left)[1]]} 帧，"
                              f"{maxRun} 帧以内的插值消不掉，按真快的动作留着）")
    for g in touched:
        clip.dirty.add(g)
        if dup:
            clip.Q[g][-1] = clip.Q[g][0].copy()
    ctx["unresolved"].extend(unresolved)
    return changes


# ---------------------------------------------------------------- hands
class Body:
    def __init__(self, vols, clip, targets):
        self.v = [(name, vols[name]) for name in targets if name in vols]
        self.scale = clip.scale

    def Local(self, P, name, point):
        v = dict(self.v)[name]
        M = P[name]
        loc = M.inverted_safe() @ point
        k = min(v["rx"], v["rz"])
        if loc.y < v["y0"]:
            dy, sy = v["y0"] - loc.y, -1.0
        elif loc.y > v["y1"]:
            dy, sy = loc.y - v["y1"], 1.0
        else:
            dy, sy = 0.0, 0.0
        ex, ez = (loc.x - v["cx"]) / v["rx"], (loc.z - v["cz"]) / v["rz"]
        e = math.sqrt(ex * ex + ez * ez + (dy / k) ** 2)
        g = Vector((ex / v["rx"], sy * dy / (k * k), ez / v["rz"]))
        return e, k, M.to_3x3() @ g

    def Probe(self, P, point, r):
        """Deepest volume for a point (armature space). Returns (depth_m, bone)."""
        best = (-1.0, None)
        for name, v in self.v:
            e, k, _ = self.Local(P, name, point)
            d = (1 - e) * k * self.scale + r
            if d > best[0]:
                best = (d, name)
        return best

    def Normal(self, P, name, refs):
        """Outward direction of volume `name`: gradient at the first reference point that is clearly outside its core
        (deep points near the axis have no reliable gradient, so use the wrist / elbow / shoulder the arm comes from)."""
        for i, pt in enumerate(refs):
            e, k, g = self.Local(P, name, pt)
            if (e > 0.45 or i == len(refs) - 1) and g.length > 1e-9:
                return g.normalized()
        return Vector((0, 0, 1))


def HandPoints(clip, side):
    pts = [(f"{side}Hand", 0.025, "腕")]
    for f in FINGERS:
        for k in (1, 2, 3, 4):
            nm = f"{side}Hand{f}{k}"
            if nm in clip.parent:
                pts.append((nm, 0.006 if k == 4 else 0.01, f"{f}{k}"))
    return pts


def Measure(clip, body, P, side, handPts):
    """(hand depth, part, bone, normal) and (forearm depth, t, bone, normal) for one side, metres."""
    hand = (-1.0, None, None, None)
    for b, r, part in handPts:
        d, vb = body.Probe(P, P[b].translation, r)
        if d > hand[0]:
            hand = (d, part, vb, None)
    S, E, W = P[f"{side}Arm"].translation, P[f"{side}ForeArm"].translation, P[f"{side}Hand"].translation
    fore = (-1.0, None, None, None)
    for t in (0.35, 0.6, 0.85):
        d, vb = body.Probe(P, E.lerp(W, t), 0.03)
        if d > fore[0]:
            fore = (d, t, vb, None)
    if hand[0] > 0:
        mid = P[f"{side}HandMiddle1"].translation if f"{side}HandMiddle1" in P else W
        hand = hand[:3] + (body.Normal(P, hand[2], [W.lerp(mid, 0.5), W, E, S]),)
    if fore[0] > 0:
        fore = fore[:3] + (body.Normal(P, fore[2], [E.lerp(W, fore[1]), E, S]),)
    return hand, fore


def Frame3(x, n):
    x = x.normalized()
    y = (n - x * n.dot(x)).normalized()
    z = x.cross(y)
    return Matrix((x, y, z)).transposed()


def SolveArm(clip, P, k, side, dW, dE, nRef):
    """Two-bone IK in armature space; returns {bone: new local quaternion} for Arm, ForeArm, Hand."""
    up, fo, ha = f"{side}Arm", f"{side}ForeArm", f"{side}Hand"
    S0, E0, W0 = P[up].translation.copy(), P[fo].translation.copy(), P[ha].translation.copy()
    L1, L2 = (E0 - S0).length, (W0 - E0).length
    Wt = W0 + dW
    dv = Wt - S0
    d = max(abs(L1 - L2) + 1e-4, min(dv.length, (L1 + L2) * 0.9999))
    u = dv.normalized()

    def Perp(p, axis):
        v = (p - S0) - axis * (p - S0).dot(axis)
        return v

    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, L1 * L1 - a * a))
    u0 = (W0 - S0).normalized()
    # 肘的弯曲平面：法线取原姿势的（胳膊伸直时用相邻帧在上臂坐标里的），跟着肩→腕方向最小转动，不会翻面
    n0 = (nRef - u0 * nRef.dot(u0)).normalized()
    n1 = u0.rotation_difference(u) @ n0
    n1 = (n1 - u * n1.dot(u)).normalized()
    v = u.cross(n1)  # dE（前臂要推的量）不拿来转弯曲平面：伸直的胳膊上那会让平面逐帧乱翻、上臂一帧拧几十度
    E1 = S0 + u * a + v * h
    W1 = S0 + u * d
    R1 = Frame3(E1 - S0, n1) @ Frame3(E0 - S0, n0).transposed()
    R2 = Frame3(W1 - E1, n1) @ Frame3(W0 - E0, n0).transposed()
    newUp = (R1 @ P[up].to_3x3())
    newFo = (R2 @ P[fo].to_3x3())
    newHa = P[ha].to_3x3()
    out = {}
    parUp = P[clip.parent[up]] @ clip.rel[up]
    out[up] = (parUp.to_3x3().inverted() @ newUp).to_quaternion()
    mUp = newUp.to_4x4()
    mUp.translation = S0
    parFo = mUp @ clip.rel[fo]
    out[fo] = (parFo.to_3x3().inverted() @ newFo).to_quaternion()
    mFo = newFo.to_4x4()
    mFo.translation = E1
    parHa = mFo @ clip.rel[ha]
    out[ha] = (parHa.to_3x3().inverted() @ newHa).to_quaternion()
    for name, q in out.items():
        ref = clip.Q0[name][k]
        q.normalize()
        if q.dot(ref) < 0:
            q.negate()
    return out


def Envelope(req, loop, half=3, sigma=2.0, radius=7):
    n = len(req)
    idx = (lambda i: i % n) if loop else (lambda i: min(n - 1, max(0, i)))
    D = []
    for i in range(n):
        best = Vector()
        for j in range(i - half, i + half + 1):
            if not loop and (j < 0 or j >= n):
                continue
            r = req[idx(j)]
            if r.length > best.length:
                best = r
        D.append(best)
    w = [math.exp(-0.5 * (j / sigma) ** 2) for j in range(-radius, radius + 1)]
    ws = sum(w)
    out = []
    for i in range(n):
        acc = Vector()
        for jj, wj in zip(range(i - radius, i + radius + 1), w):
            if not loop and (jj < 0 or jj >= n):
                continue
            acc += D[idx(jj)] * wj
        out.append(acc / ws)
    return out


class FrameBody:
    """Body volumes posed for one frame (trunk / head / legs do not move when only arms are edited)."""

    def __init__(self, body, P):
        self.sc = body.scale
        self.items = []
        for name, v in body.v:
            M = P[name]
            mid = (v["y0"] + v["y1"]) / 2
            center = M @ Vector((v["cx"], mid, v["cz"]))
            rad = math.hypot(max(v["rx"], v["rz"]), (v["y1"] - v["y0"]) / 2) + max(v["rx"], v["rz"])
            self.items.append((name, M.inverted_safe(), center, rad, v, min(v["rx"], v["rz"])))

    def Depth(self, p, r):
        """Deepest penetration (m) of a sphere (armature-space centre p, radius r metres) into any volume; (depth, bone)."""
        ru = r / self.sc
        best, bone = -1.0, None
        for name, inv, center, rad, v, k in self.items:
            if (p - center).length > rad + ru:
                continue
            loc = inv @ p
            if loc.y < v["y0"]:
                dy = v["y0"] - loc.y
            elif loc.y > v["y1"]:
                dy = loc.y - v["y1"]
            else:
                dy = 0.0
            ex, ez = (loc.x - v["cx"]) / v["rx"], (loc.z - v["cz"]) / v["rz"]
            e = math.sqrt(ex * ex + ez * ez + (dy / k) ** 2)
            d = (1 - e) * k * self.sc + r
            if d > best:
                best, bone = d, name
        return best, bone


def RotQ(v):
    return Quaternion(v.normalized(), v.length) if v.length > 1e-12 else Quaternion()


def RotAbout(p, pivot, rv):
    if rv.length < 1e-12:
        return p
    return pivot + RotQ(rv) @ (p - pivot)


AXES = [Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0)), Vector((0, 0, 1)), Vector((0, 0, -1))]


def SolveFrame(clip, fb, P, sides, link, rotate, handT, foreT, budgets, used):
    """Smallest extra (wrist translation, elbow translation, finger / wrist rotations) that gets this frame's hand and
    forearm points out of the body. Works on the points directly (hand rigid on the wrist, finger chains rigid on their
    knuckles); the caller turns it into IK + local rotations. All vectors in armature space."""
    sc = clip.scale
    fingerB, handB = budgets
    st = {}
    for s in sides:
        W, E = P[f"{s}Hand"].translation.copy(), P[f"{s}ForeArm"].translation.copy()
        pts = [(W, 0.025, None)]
        knuckles = {}
        for f in FINGERS:
            f1 = f"{s}Hand{f}1"
            if f1 not in P:
                continue
            knuckles[f] = P[f1].translation.copy()
            for j in (1, 2, 3, 4):
                nm = f"{s}Hand{f}{j}"
                if nm in P:
                    pts.append((P[nm].translation.copy(), 0.006 if j == 4 else 0.01, f if j > 1 else f + "#k"))
        fore = [(E.lerp(W, t), t) for t in (0.35, 0.6, 0.85)]
        foreIn = any(fb.Depth(p, 0.03)[0] > foreT for p, _ in fore)
        st[s] = dict(W=W, E=E, pts=pts, knuckles=knuckles, fore=fore, foreIn=foreIn,
                     fr={f: Vector() for f in knuckles}, hr=Vector(), t=Vector())
    if link:
        shared = Vector()
        for s in sides:
            st[s]["t"] = shared

    def Cost(s, only=None):
        x = st[s]
        tot, worst = 0.0, (0.0, None)
        for p, r, f in x["pts"]:
            if only is not None and f != only:
                continue
            q = p
            if f in x["knuckles"]:
                q = RotAbout(q, x["knuckles"][f], x["fr"][f])
            q = RotAbout(q, x["W"], x["hr"]) + x["t"]
            d = fb.Depth(q, r)[0] - handT
            if d > 0:
                tot += d
                if d > worst[0]:
                    worst = (d, f)
        if only is None:
            for p, tau in x["fore"]:
                q = p + x["t"] * (1.0 if x["foreIn"] else tau)
                d = fb.Depth(q, 0.03)[0] - foreT
                if d > 0:
                    tot += d
                    if d > worst[0]:
                        worst = (d, "fore")
        return tot, worst

    def TotalCost():
        return sum(Cost(s)[0] for s in sides)

    h = 0.003 / sc
    for it in range(60):
        costs = {s: Cost(s) for s in sides}
        total = sum(c[0] for c in costs.values())
        if total <= 1e-6:
            break
        s = max(sides, key=lambda z: costs[z][1][0])
        x = st[s]
        worstF = costs[s][1][1]
        improved = False
        # 1) 抬那根手指  2) 抬手掌  （端枪两手同推时不转）
        if rotate and worstF not in (None, "fore"):
            tries = ((("f", worstF), fingerB), (("h", None), handB)) if worstF in x["knuckles"] else ((("h", None), handB),)
            for key, pivotBudget in tries:
                cur = x["fr"][worstF] if key[0] == "f" else x["hr"]
                base = Cost(s, worstF)[0] if key[0] == "f" else Cost(s)[0]
                best = None
                for step in (math.radians(4), math.radians(1.5)):
                    for ax in AXES:
                        cand = cur + ax * step
                        if cand.length + used.get((s, key), 0.0) > pivotBudget:
                            continue
                        if key[0] == "f":
                            x["fr"][worstF] = cand
                            c = Cost(s, worstF)[0]
                            x["fr"][worstF] = cur
                        else:
                            x["hr"] = cand
                            c = Cost(s)[0]
                            x["hr"] = cur
                        if c < base - 1e-5 and (best is None or c < best[0]):
                            best = (c, cand)
                    if best:
                        break
                if best:
                    if key[0] == "f":
                        x["fr"][worstF] = best[1]
                    else:
                        x["hr"] = best[1]
                    improved = True
                    break
        if improved:
            continue
        # 3) 整只手（连前臂）平移：数值梯度 + 回退步长
        t0 = x["t"].copy()
        g = Vector()
        for i in range(3):
            d = Vector()
            d[i] = h
            x["t"][:] = t0 + d
            cp = TotalCost()
            x["t"][:] = t0 - d
            cm = TotalCost()
            g[i] = (cp - cm) / (2 * h)
        x["t"][:] = t0
        if g.length < 1e-9:
            break
        step = min(max(costs[s][1][0], 0.003), 0.03) / sc
        ok = False
        for _ in range(6):
            x["t"][:] = t0 - g.normalized() * step
            if TotalCost() < total - 1e-6:
                ok = True
                break
            step *= 0.5
        if not ok:
            x["t"][:] = t0
            break
    out = {}
    for s in sides:
        x = st[s]
        out[s] = dict(t=x["t"].copy(), e=(x["t"].copy() if x["foreIn"] else Vector()), hr=x["hr"].copy(),
                      fr={f: v.copy() for f, v in x["fr"].items()})
    return out


def OpHands(clip, op, ctx):
    vols = ctx["vols"]
    sides = op.get("sides", ["Right", "Left"])
    link = bool(op.get("link", False))
    rotate = bool(op.get("rotate", not link))  # 端枪两手同推时不动手腕和手指（握枪的手形不变）
    handT, foreT = op.get("handCm", 1.0) / 100.0, op.get("forearmCm", 1.5) / 100.0
    fingerBudget, handBudget = math.radians(op.get("fingerDeg", 30)), math.radians(op.get("wristDeg", 20))
    capM = op.get("capCm", 12) / 100.0
    body = Body(vols, clip, op.get("targets", HAND_TARGETS))
    sc = clip.scale
    n = clip.n
    loop = ctx["loop"]
    allSides = ["Right", "Left"] if link else sides
    pts = {s: HandPoints(clip, s) for s in allSides}
    fingers = {s: [f for f in FINGERS if f"{s}Hand{f}1" in clip.parent] for s in allSides}
    rotBones = {s: ([f"{s}Hand"] + [f"{s}Hand{f}1" for f in fingers[s]]) if rotate else [] for s in allSides}
    totW = {s: [Vector() for _ in range(n)] for s in allSides}
    totE = {s: [Vector() for _ in range(n)] for s in allSides}
    totR = {s: {b: [Vector() for _ in range(n)] for b in rotBones[s]} for s in allSides}
    # 每帧原姿势的肘弯曲平面法线，存在上臂坐标里；伸直（< 10°）的帧借最近的弯着的帧
    nLoc = {s: [None] * n for s in allSides}
    upR = {s: [None] * n for s in allSides}
    beforeMax = {s: [0.0, 0.0] for s in allSides}
    fbs = []
    for k in range(n):
        P = clip.Pose(k)
        fbs.append(FrameBody(body, P))
        for s in allSides:
            S0, E0, W0 = (P[f"{s}{b}"].translation for b in ("Arm", "ForeArm", "Hand"))
            c = (E0 - S0).normalized().cross((W0 - E0).normalized())
            upR[s][k] = P[f"{s}Arm"].to_3x3()
            if c.length > 0.17:
                nLoc[s][k] = upR[s][k].transposed() @ c.normalized()
            hand, fore = Measure(clip, body, P, s, pts[s])
            beforeMax[s][0] = max(beforeMax[s][0], hand[0])
            beforeMax[s][1] = max(beforeMax[s][1], fore[0])
    for s in allSides:
        have = [k for k in range(n) if nLoc[s][k] is not None]
        for k in range(n):
            if nLoc[s][k] is None:
                nLoc[s][k] = nLoc[s][min(have, key=lambda j: abs(j - k))].copy() if have else Vector((1, 0, 0))
    nRefW = lambda s, k: upR[s][k] @ nLoc[s][k]
    capped = {s: set() for s in allSides}

    def Posed(k):
        P = clip.Pose(k)
        overs = {}
        for s in allSides:
            dW, dE = totW[s][k], totE[s][k]
            over = {}
            if dW.length > 1e-9 or dE.length > 1e-9:
                over = SolveArm(clip, P, k, s, dW, dE, nRefW(s, k))
            for b in rotBones[s]:
                rv = totR[s][b][k]
                if rv.length > 1e-9:
                    over[b] = over.get(b, clip.Q[b][k]) @ RotQ(rv)
            if over:
                clip.RePose(P, k, f"{s}Arm", over)
                overs.update(over)
        return P, overs

    def Bad(P, k):
        for s in allSides:
            for b, r, part in pts[s]:
                if fbs[k].Depth(P[b].translation, r)[0] > handT:
                    return True
            E, W = P[f"{s}ForeArm"].translation, P[f"{s}Hand"].translation
            for t in (0.35, 0.6, 0.85):
                if fbs[k].Depth(E.lerp(W, t), 0.03)[0] > foreT:
                    return True
        return False

    for rnd in range(6):
        reqW = {s: [Vector() for _ in range(n)] for s in allSides}
        reqE = {s: [Vector() for _ in range(n)] for s in allSides}
        reqR = {s: {b: [Vector() for _ in range(n)] for b in rotBones[s]} for s in allSides}
        anyReq = False
        for k in range(n):
            P, _ = Posed(k)
            if not Bad(P, k):
                continue
            used = {}
            for s in allSides:
                for b in rotBones[s]:
                    key = ("h", None) if b == f"{s}Hand" else ("f", b[len(s) + 4:-1])
                    used[(s, key)] = totR[s][b][k].length
            res = SolveFrame(clip, fbs[k], P, allSides, link, rotate, handT, foreT, (fingerBudget, handBudget), used)
            for s in allSides:
                r = res[s]
                reqW[s][k], reqE[s][k] = r["t"], r["e"]
                if rotate:
                    # 世界轴转角 → 该骨自己的本地轴（手指的转在手掌转之前施加）
                    reqR[s][f"{s}Hand"][k] = P[f"{s}Hand"].to_3x3().transposed() @ r["hr"]
                    for f, v in r["fr"].items():
                        b = f"{s}Hand{f}1"
                        reqR[s][b][k] = P[b].to_3x3().transposed() @ v
                if r["t"].length > 1e-9 or r["hr"].length > 1e-9 or any(v.length > 1e-9 for v in r["fr"].values()):
                    anyReq = True
        if not anyReq:
            break
        for s in allSides:
            for tot, req in [(totW[s], reqW[s]), (totE[s], reqE[s])] + [(totR[s][b], reqR[s][b]) for b in rotBones[s]]:
                if any(v.length > 0 for v in req):
                    sm = Envelope(req, loop)
                    for k in range(n):
                        tot[k] += sm[k]
            for k in range(n):
                for arr in (totW, totE):
                    if arr[s][k].length * sc > capM:
                        arr[s][k] = arr[s][k].normalized() * (capM / sc)
                        capped[s].add(k)
                for b in rotBones[s]:
                    budget = handBudget if b == f"{s}Hand" else fingerBudget
                    if totR[s][b][k].length > budget:
                        totR[s][b][k] = totR[s][b][k].normalized() * budget
        if loop:
            for s in allSides:
                totW[s][-1], totE[s][-1] = totW[s][0].copy(), totE[s][0].copy()
                for b in rotBones[s]:
                    totR[s][b][-1] = totR[s][b][0].copy()

    # apply
    afterMax = {s: [0.0, 0.0] for s in allSides}
    changes = []
    moved = {s: [] for s in allSides}
    newQ = {}
    for k in range(n):
        P, overs = Posed(k)
        for name, q in overs.items():
            q = q.normalized()
            if q.dot(clip.Q[name][k]) < 0:
                q.negate()
            newQ.setdefault(name, {})[k] = q
        for s in allSides:
            if any(b.startswith(s) for b in overs):
                moved[s].append(k)
            hand, fore = Measure(clip, body, P, s, pts[s])
            afterMax[s][0] = max(afterMax[s][0], hand[0])
            afterMax[s][1] = max(afterMax[s][1], fore[0])
    for name, per in newQ.items():
        for k, q in per.items():
            clip.Q[name][k] = q
        clip.dirty.add(name)
    for s in allSides:
        if not moved[s]:
            continue
        side = "右" if s == "Right" else "左"
        fr = [clip.frames[k] for k in moved[s]]
        mx, mk = max((totW[s][k].length * sc * 100, k) for k in moved[s])
        emag = max(totE[s][k].length * sc * 100 for k in moved[s])
        parts = []
        if mx > 0.05:
            turn = {b: max(Angle(clip.Q[b][k], clip.Q0[b][k]) for k in moved[s]) for b in (f"{s}Arm", f"{s}ForeArm")}
            wdir = clip.arm.matrix_world.to_3x3().normalized() @ totW[s][mk].normalized()
            dtxt = "上" if wdir.z > 0.7 else "下" if wdir.z < -0.7 else "外"
            t = (f"{side}臂两节骨 IK（{s}Arm 最多转 {turn[f'{s}Arm']:.1f}°、{s}ForeArm 最多转 {turn[f'{s}ForeArm']:.1f}°）："
                 f"手腕往外推最多 {mx:.1f} cm（第 {clip.frames[mk]} 帧，朝{dtxt}）")
            if emag > 0.05:
                t += f"，前臂同推最多 {emag:.1f} cm"
            t += "，手腕世界朝向不变" if not rotBones[s] else ""
            if link:
                t += "（两手同推一个位移，枪在两手间的相对关系不变）"
            parts.append(t)
        rots = []
        for b in rotBones[s]:
            a = max(math.degrees(totR[s][b][k].length) for k in range(n))
            if a > 0.3:
                rots.append(f"{b.replace(s + 'Hand', '') or '手腕'} {a:.0f}°")
        if rots:
            parts.append("手指 / 手掌往外抬（绕指根 / 手腕转）最多：" + "、".join(rots))
        changes.append(f"第 {Ranges(fr)} 帧 {side}手：" + "；".join(parts) + "；前后约 6 帧渐入渐出")
        if capped[s]:
            ctx["unresolved"].append(f"{side}手第 {Ranges([clip.frames[k] for k in capped[s]])} 帧要推超过 {capM * 100:.0f} cm，封顶")
    ctx["measure"]["hands"] = {s: {"beforeHandCm": round(beforeMax[s][0] * 100, 1), "beforeForearmCm": round(beforeMax[s][1] * 100, 1),
                                   "afterHandCm": round(afterMax[s][0] * 100, 1), "afterForearmCm": round(afterMax[s][1] * 100, 1)}
                               for s in allSides}
    return changes


def OpShift(clip, op, ctx):
    """Both wrists (or the listed sides) translated together by a few cm over a frame range, smoothstep ramps, IK as in
    hands; for poses where a held prop (rifle / sword) clips the body while the hands themselves are fine."""
    sides = op.get("sides", ["Right", "Left"])
    a, b = op["frames"]
    ramp = int(op.get("ramp", 6))
    cm = float(op["cm"])
    sc = clip.scale
    n = clip.n
    toArm = clip.arm.matrix_world.inverted().to_3x3().normalized()
    vols = ctx["vols"]
    nLoc = {}
    for s in sides:
        nLoc[s] = []
        for k in range(n):
            P = clip.Pose(k)
            S0, E0, W0 = (P[f"{s}{x}"].translation for x in ("Arm", "ForeArm", "Hand"))
            c = (E0 - S0).normalized().cross((W0 - E0).normalized())
            nLoc[s].append(P[f"{s}Arm"].to_3x3().transposed() @ c.normalized() if c.length > 0.17 else None)
        have = [k for k in range(n) if nLoc[s][k] is not None]
        nLoc[s] = [v if v is not None else (nLoc[s][min(have, key=lambda j: abs(j - k))] if have else Vector((1, 0, 0)))
                   for k, v in enumerate(nLoc[s])]
    touched, newQ, dirs = [], {}, []
    for k in range(n):
        f = clip.frames[k]
        if f < a - ramp or f > b + ramp:
            continue
        w = 1.0 if a <= f <= b else Smoothstep(1 - (a - f) / ramp) if f < a else Smoothstep(1 - (f - b) / ramp)
        if w <= 0:
            continue
        P = clip.Pose(k)
        if "awayFrom" in op:
            v = vols[op["awayFrom"]]
            center = P[op["awayFrom"]] @ Vector((v["cx"], (v["y0"] + v["y1"]) / 2, v["cz"]))
            mid = sum((P[f"{s}Hand"].translation for s in sides), Vector()) / len(sides)
            d = (mid - center).normalized()
        else:
            d = (toArm @ Vector(op["dir"])).normalized()
        dirs.append(d)
        dW = d * (cm / 100.0 * w / sc)
        over = {}
        for s in sides:
            o = SolveArm(clip, P, k, s, dW, Vector(), P[f"{s}Arm"].to_3x3() @ nLoc[s][k])
            clip.RePose(P, k, f"{s}Arm", o)
            over.update(o)
        for name, q in over.items():
            newQ.setdefault(name, {})[k] = q
        touched.append(k)
    for name, per in newQ.items():
        for k, q in per.items():
            clip.Q[name][k] = q
        clip.dirty.add(name)
    how = f"背离 {op['awayFrom']}" if "awayFrom" in op else f"朝 {op['dir']}"
    who = "两手" if len(sides) == 2 else ("右手" if sides[0] == "Right" else "左手")
    return [f"第 {Ranges([clip.frames[k] for k in touched])} 帧 {who}同推 {cm:g} cm（{how}，第 {a}–{b} 帧满量、前后 {ramp} 帧渐入渐出），"
            f"两节骨 IK、手腕世界朝向不变，手里的道具跟着平移、相对两手不变"]


# ---------------------------------------------------------------- grip
GRIP_CAL_STEM = "Animation_Mixamo_GreatSwordIdle_V1"
GRIP_R = Vector((0.0, 0.0, 0.03))          # Model_Dadao gripR, metres (same as the tool)
GRIP_PALM_ALONG = 0.72                      # palm point = wrist -> middle MCP at this fraction (tool: DADAO_PALM_ALONG)
GRIP_SKIN = {"Right": 0.0, "Left": 0.0}     # palm skin distance per side, armature units (measured from the X Bot rest mesh in GripSetup; tool: PalmSkin)
GRIP_SC = 0.01                              # metres per armature unit (set in GripSetup)
GRIP_PALM_MARGIN = 0.002                    # metres added to the grip-point offset (tool: DADAO_PALM_MARGIN)
# Dadao solid, dadao-local metres; same constants as Script_DadaoGripAudit.mjs (handle = rounded rectangle, guard = elliptical plate)
GRIP_HANDLE = dict(hx=0.0097, hy=0.0210, cy=-0.0005, rc=0.006, z0=0.0, z1=0.205)
GRIP_GUARD = dict(hx=0.0086, ay=0.0485, cy=0.0045, az=0.020, cz=-0.0275)
GRIP_RING_Z = 0.205                         # pommel ring: BVH of the triangles above this z, queried only above 0.19
GRIP_SAMPLE_M = 0.004
GRIP_FINGERS = ["Index", "Middle", "Ring", "Pinky"]
FINGER_LIMITS = [(-10.0, 90.0), (0.0, 105.0), (0.0, 80.0)]
THUMB_LIMITS = [(-35.0, 35.0), (-25.0, 25.0), (-20.0, 60.0), (-20.0, 80.0)]
GRIP_NAMES = {"Index": "食指", "Middle": "中指", "Ring": "无名指", "Pinky": "小指", "Thumb": "拇指"}


def GaussSmooth(vals, sigma, cyc):
    if sigma <= 0:
        return list(vals)
    R = int(math.ceil(3 * sigma))
    w = [math.exp(-(i * i) / (2 * sigma * sigma)) for i in range(-R, R + 1)]
    n, out = len(vals), []
    for k in range(n):
        s = ws = 0.0
        for j, i in enumerate(range(-R, R + 1)):
            idx = k + i
            if cyc:
                idx %= n
            elif not 0 <= idx < n:
                continue
            s += w[j] * vals[idx]
            ws += w[j]
        out.append(s / ws)
    return out


def MaxFilter(vals, radius, cyc):
    n, out = len(vals), []
    for k in range(n):
        m = 0.0
        for i in range(-radius, radius + 1):
            idx = k + i
            if cyc:
                idx %= n
            elif not 0 <= idx < n:
                continue
            m = max(m, vals[idx])
        out.append(m)
    return out


def Smooth3(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def PalmNormal(P, side):
    h, m = P[f"{side}Hand"].translation, P[f"{side}HandMiddle1"].translation
    w = P[f"{side}HandIndex1"].translation - P[f"{side}HandPinky1"].translation
    f = m - h
    return (w.cross(f) if side == "Right" else f.cross(w)).normalized()


def HandleSupport(ux, uy):
    """Distance from the handle axis to the handle surface along (ux, uy) in the dadao xy plane, metres (tool: HandleSupport)."""
    E = GRIP_HANDLE
    ln = math.hypot(ux, uy) or 1.0
    ux, uy = ux / ln, uy / ln
    return E["cy"] * uy + (E["hx"] - E["rc"]) * abs(ux) + (E["hy"] - E["rc"]) * abs(uy) + E["rc"]


def GripPoint(P, side, rot=None):
    """Palm point (wrist -> middle MCP at GRIP_PALM_ALONG) pushed out along the palm normal by the palm skin distance plus the handle's
    support distance toward the palm; rot = the dadao rotation (3x3, armature space), None = palm on a wide face (tool: GripPoint)."""
    h, m = P[f"{side}Hand"].translation, P[f"{side}HandMiddle1"].translation
    n = PalmNormal(P, side)
    support = GRIP_HANDLE["hx"]
    if rot is not None:
        u = rot.transposed() @ (-n)
        support = HandleSupport(u.x, u.y)
    return h.lerp(m, GRIP_PALM_ALONG) + n * (GRIP_SKIN[side] + (support + GRIP_PALM_MARGIN) / GRIP_SC)


def RigidRot(P, cal):
    """Rotation (3x3) of the dadao riding rigidly on the right hand."""
    return (P["RightHand"] @ cal["offset"]).to_quaternion().to_matrix()


def DadaoPlacement(clip, P, cal):
    """Port of the tool's PlaceDadao: the dadao rides rigidly on the right hand (calibration offset). Returns (rot 3x3, translation)
    in armature space (units)."""
    M = P["RightHand"] @ cal["offset"]
    rot = M.to_quaternion().to_matrix()
    return rot, M @ (GRIP_R / clip.scale) - rot @ (GRIP_R / clip.scale)


# ---- dadao signed distance (negative inside); ported from Script_DadaoGripAudit.mjs
def GripExtrude(d2, dl):
    if d2 < 0 and dl < 0:
        return max(d2, dl)
    return math.hypot(max(d2, 0.0), max(dl, 0.0))


def GripEllipseSd(u, v, a, b):
    px, py = abs(u), abs(v)
    tx = ty = 0.70710678
    for _ in range(4):
        x, y = a * tx, b * ty
        ex, ey = (a * a - b * b) * tx ** 3 / a, (b * b - a * a) * ty ** 3 / b
        rx, ry, qx, qy = x - ex, y - ey, px - ex, py - ey
        r, q = math.hypot(rx, ry), math.hypot(qx, qy)
        if q < 1e-12:
            break
        tx, ty = min(1.0, max(0.0, (qx * r / q + ex) / a)), min(1.0, max(0.0, (qy * r / q + ey) / b))
        t = math.hypot(tx, ty)
        tx, ty = tx / t, ty / t
    d = math.hypot(px - a * tx, py - b * ty)
    return -d if (u / a) ** 2 + (v / b) ** 2 < 1 else d


def GripHandleSd(x, y, z):
    E = GRIP_HANDLE
    qx, qy = abs(x) - (E["hx"] - E["rc"]), abs(y - E["cy"]) - (E["hy"] - E["rc"])
    d2 = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - E["rc"]
    return GripExtrude(d2, max(E["z0"] - z, z - E["z1"]))


def GripGuardSd(x, y, z):
    G = GRIP_GUARD
    return GripExtrude(GripEllipseSd(y - G["cy"], z - G["cz"], G["ay"], G["az"]), abs(x) - G["hx"])


def DecodeDadaoRing():
    """BVH of the pommel ring (triangles with any vertex above GRIP_RING_Z); unsigned, the ring is thin."""
    with open(os.path.join(TZ, "Model", "Model_Dadao.tzm.json"), encoding="utf-8") as f:
        asset = json.load(f)

    def Dec(text, code):
        data = base64.b64decode(text)
        return struct.unpack("<" + code * (len(data) // struct.calcsize(code)), data)

    verts, polys = [], []
    for block in asset["meshes"]:
        pos = Dec(block["pos"], "H")
        idx = Dec(block["idx"], "I" if block["idxBits"] == 32 else "H")
        base = len(verts)
        for i in range(block["count"]):
            verts.append(Vector([block["posMin"][j] + pos[i * 3 + j] * block["posScale"][j] for j in range(3)]))
        for i in range(0, len(idx), 3):
            tri = (base + idx[i], base + idx[i + 1], base + idx[i + 2])
            if any(verts[v].z > GRIP_RING_Z for v in tri):
                polys.append(tri)
    return BVHTree.FromPolygons(verts, polys)


def FitFingers():
    """Finger capsule radii: 90th percentile of the radial distance sqrt((x-cx)^2+(z-cz)^2) of the bone's skin vertices (dominant weight >= 0.6,
    bone-local, cx/cz medians; the tip bone is merged into the last joint). Returns radii in metres."""
    arm = Import(os.path.join(RAW, "Model_MixamoXBot.fbx"))
    sc = arm.matrix_world.to_scale()[0]
    armInv = arm.matrix_world.inverted()
    boneInv = {b.name: b.matrix_local.inverted() for b in arm.data.bones}
    want = {f"{s}Hand{f}{k}": f"{s}Hand{f}{min(k, 3)}" for s in ("Right", "Left") for f in FINGERS for k in (1, 2, 3, 4)}
    samples = {}
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        names = {g.index: (g.name[len(PREFIX):] if g.name.startswith(PREFIX) else g.name) for g in obj.vertex_groups}
        toArm = armInv @ obj.matrix_world
        for v in obj.data.vertices:
            best, bw = None, 0.0
            for g in v.groups:
                if g.weight > bw:
                    bw, best = g.weight, names.get(g.group)
            if bw < 0.6 or best not in want:
                continue
            p = boneInv[best] @ (toArm @ v.co)
            samples.setdefault(want[best], []).append((p.x, p.z))
    radii = {}
    for name, pts in samples.items():
        if len(pts) < 8:
            continue
        cx, cz = Pct([p[0] for p in pts], 0.5), Pct([p[1] for p in pts], 0.5)
        radii[name] = Pct([math.hypot(p[0] - cx, p[1] - cz) for p in pts], 0.9) * sc
    palmSet = []
    leftHead, leftRest = arm.data.bones["LeftHand"].head_local.copy(), arm.data.bones["LeftHand"].matrix_local.to_quaternion().to_matrix()
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        names = {g.index: (g.name[len(PREFIX):] if g.name.startswith(PREFIX) else g.name) for g in obj.vertex_groups}
        toArm = armInv @ obj.matrix_world
        for v in obj.data.vertices:
            top, tw = None, 0.0
            for g in v.groups:
                if g.weight > tw:
                    tw, top = g.weight, names.get(g.group)
            if tw >= 0.5 and top in ("LeftHand", "LeftHandThumb1"):
                palmSet.append(leftRest.transposed() @ (toArm @ v.co - leftHead))
    skin = {}
    for side in ("Right", "Left"):
        hb = {k: arm.data.bones[f"{side}Hand{k}"].head_local.copy() for k in ("", "Middle1", "Index1", "Pinky1")}
        f = hb["Middle1"] - hb[""]
        w = hb["Index1"] - hb["Pinky1"]
        n = (w.cross(f) if side == "Right" else f.cross(w)).normalized()
        point = hb[""].lerp(hb["Middle1"], GRIP_PALM_ALONG)
        best = None
        for obj in bpy.data.objects:
            if obj.type != "MESH":
                continue
            names = {g.index: (g.name[len(PREFIX):] if g.name.startswith(PREFIX) else g.name) for g in obj.vertex_groups}
            toArm = armInv @ obj.matrix_world
            for v in obj.data.vertices:
                top, tw = None, 0.0
                for g in v.groups:
                    if g.weight > tw:
                        tw, top = g.weight, names.get(g.group)
                if tw < 0.5 or top != f"{side}Hand":
                    continue
                d = toArm @ v.co - point
                along = d.dot(n)
                if (d - n * along).length * sc < 0.025 and (best is None or along > best):
                    best = along
        skin[side] = (best if best is not None else 0.25 * f.length) * sc
    return radii, skin, palmSet


def SwingTwist(q, A):
    """q = swing @ twist about unit axis A; returns (swing, twist angle in degrees)."""
    q = q.copy()
    if q.w < 0:
        q.negate()
    v = Vector((q.x, q.y, q.z))
    d = v.dot(A)
    twist = Quaternion((q.w, A.x * d, A.y * d, A.z * d))
    if twist.magnitude < 1e-9:
        return q, 0.0
    twist.normalize()
    return q @ twist.inverted(), math.degrees(2 * math.atan2(d, q.w))


def ChainHeads(clip, P, k, side, finger, qs):
    """Joint heads (4) of a finger given local rotations for its first three bones (None = the clip's own)."""
    prev, heads = P[f"{side}Hand"], []
    for i in range(4):
        name = f"{side}Hand{finger}{i + 1}"
        mat = prev @ clip.rel[name] @ clip.Basis(name, k, qs[i] if i < 3 and qs else None)
        heads.append(mat.translation.copy())
        prev = mat
    return heads


class GripWorld:
    def __init__(self, ring, radii, cal):
        self.ring, self.radii, self.cal = ring, radii, cal
        self.flexA = {}     # side -> unit axis with sign so +theta flexes toward the palm normal
        self.thumbA = {}    # side -> unit axis for Thumb2 / Thumb3
        self.thumb1A = {}   # side -> unit axis for Thumb1

    def Sdf(self, p):
        x, y, z = p
        d = GripHandleSd(x, y, z)
        if z < 0.01:
            d = min(d, GripGuardSd(x, y, z))
        if z > 0.19:
            h = self.ring.find_nearest(Vector(p), 0.05)
            if h[0] is not None:
                d = min(d, h[3])
        return d


def GRIP_SC_SET(sc):
    global GRIP_SC
    GRIP_SC = sc


def GripSetup(ctx):
    radii, skin, palmSet = FitFingers()
    Log("left palm vertex set (LeftHand + LeftHandThumb1, dominant weight >= 0.5):", len(palmSet))
    Log("palm skin distance mm (X Bot rest mesh, ALONG %.2f)" % GRIP_PALM_ALONG, {k: round(v * 1000, 2) for k, v in skin.items()})
    Log("finger radii mm (p90 radial)", {k: round(v * 1000, 1) for k, v in radii.items() if k.startswith("Right")})
    ring = DecodeDadaoRing()
    arm = Import(os.path.join(RAW, GRIP_CAL_STEM + ".fbx"))
    clip = Clip(arm, GRIP_CAL_STEM)
    sc = clip.scale
    GRIP_SC_SET(sc)
    for side in skin:
        GRIP_SKIN[side] = skin[side] / sc
    P = clip.Pose(0)
    fingers = P["RightHandMiddle1"].translation - P["RightHand"].translation
    rot = None
    for _pass in range(2):
        R, L = GripPoint(P, "Right", rot), GripPoint(P, "Left", rot)
        z = (L - R).normalized()
        y = (fingers - z * fingers.dot(z)).normalized()
        x = y.cross(z)
        rot = Matrix((x, y, z)).transposed()
        origin = R - rot @ (GRIP_R / sc)
    M0 = Matrix.Translation(origin) @ rot.to_4x4()
    cal = {"offset": P["RightHand"].inverted() @ M0}
    world = GripWorld(ring, radii, cal)
    world.leftPalm = palmSet
    rotT0 = rot.transposed()
    for side in ("Right", "Left"):
        n = PalmNormal(P, side)
        gain = {}
        for sign in (1.0, -1.0):
            A = Vector((sign, 0.0, 0.0))
            swing = [SwingTwist(clip.Q[f"{side}HandIndex{i + 1}"][0], A)[0] for i in range(3)]
            base = ChainHeads(clip, P, 0, side, "Index", swing)[3]
            qs = [q @ Quaternion(A, math.radians(5.0)) for q in swing]
            gain[sign] = (ChainHeads(clip, P, 0, side, "Index", qs)[3] - base).dot(n)
        sign = 1.0 if gain[1.0] >= gain[-1.0] else -1.0
        world.flexA[side] = Vector((sign, 0.0, 0.0))
        Log(f"flexion check {side}: from the straight index (twist removed) +X 5deg moves the tip along the palm normal by {gain[1.0] * sc * 1000:.2f} mm, -X by {gain[-1.0] * sc * 1000:.2f} mm -> sign {sign:+.0f}")
        tip0 = ChainHeads(clip, P, 0, side, "Thumb", None)[3]
        d0 = (rotT0 @ (tip0 - origin)) * sc
        for label, joints in (("Thumb2/3", (1, 2)), ("Thumb1", (0,))):
            best = None
            for axis in (0, 2):
                for sgn in (1.0, -1.0):
                    A = Vector((0.0, 0.0, 0.0))
                    A[axis] = sgn
                    qs = [clip.Q[f"{side}HandThumb{i + 1}"][0] @ (Quaternion(A, math.radians(5.0)) if i in joints else Quaternion()) for i in range(3)]
                    d1 = (rotT0 @ (ChainHeads(clip, P, 0, side, "Thumb", qs)[3] - origin)) * sc
                    gainT = math.hypot(d0.x, d0.y + 0.0005) - math.hypot(d1.x, d1.y + 0.0005)
                    Log(f"{label} axis test {side}: {'XYZ'[axis]}{'+' if sgn > 0 else '-'} 5deg -> {gainT * 1000:+.2f} mm toward the handle axis")
                    if best is None or gainT > best[0]:
                        best = (gainT, A)
            (world.thumbA if label == "Thumb2/3" else world.thumb1A)[side] = best[1]
            Log(f"{label} flexion axis {side}: {best[1][0]:+.0f} {best[1][1]:+.0f} {best[1][2]:+.0f}")
    ctx["gripWorld"] = world


# ---------------------------------------------------------------- left-hand reach
def WeightedSmooth(vals, weights, sigma, cyc):
    """Gaussian smoothing of Vector samples, weighted by `weights` (frames with no hold weight do not drag their neighbours)."""
    n, R = len(vals), int(math.ceil(3 * sigma))
    out = []
    for k in range(n):
        acc, ws = Vector((0.0, 0.0, 0.0)), 0.0
        for i in range(-R, R + 1):
            idx = k + i
            if cyc:
                idx %= n
            elif not 0 <= idx < n:
                continue
            w = math.exp(-(i * i) / (2 * sigma * sigma)) * weights[idx]
            acc += vals[idx] * w
            ws += w
        out.append(acc / ws if ws > 1e-9 else Vector((0.0, 0.0, 0.0)))
    return out


def LeftReach(clip, world, ctx):
    """Left-arm IK: with the dadao rigid in the right hand, move the left wrist so the left grip point sits on the rear handle axis
    (z 0.13-0.20) and turn the hand minimally so the handle lies in its palm plane. Weighted by a holding weight, so frames where the
    left hand lets go keep the original motion. Shoulder fixed, two-bone IK. Returns (changes, stats)."""
    n, sc, cyc = clip.n, clip.scale, ctx["loop"]
    Ps = [clip.Pose(k) for k in range(n)]
    rows, hraw, zraw = [], [], []
    for P in Ps:
        M = P["RightHand"] @ world.cal["offset"]
        rot, org = M.to_quaternion().to_matrix(), M.translation.copy()
        G0 = GripPoint(P, "Left", rot)
        Gl = (rot.transposed() @ (G0 - org)) * sc
        zh = max(0.13, min(0.20, Gl.z))
        hraw.append(1 - Smooth3(0.12, 0.18, math.hypot(math.hypot(Gl.x, Gl.y), Gl.z - zh)))
        zraw.append(max(0.13, min(0.17, Gl.z)))
        rows.append((rot, org, G0))
    h = [max(0.0, min(1.0, v)) for v in GaussSmooth(MaxFilter(hraw, 3, cyc), 2.0, cyc)]
    zt = GaussSmooth(zraw, 2.0, cyc)
    rvs, R0s, W0s, pls, swv, reversed_ = [], [], [], [], [], []
    for k, P in enumerate(Ps):
        rot, org, G0 = rows[k]
        a = rot @ Vector((0.0, 0.0, 1.0))
        W0 = P["LeftHand"].translation.copy()
        q0 = P["LeftHand"].to_quaternion()
        R0 = q0.to_matrix()
        nL = PalmNormal(P, "Left")
        nt = nL - a * nL.dot(a)
        nt = nt.normalized() if nt.length > 1e-6 else nL
        qfix = nL.rotation_difference(nt)
        axis, ang = qfix.to_axis_angle()
        rvs.append(axis * ang)
        Rf = qfix.to_matrix()
        mid0 = P["LeftHandMiddle1"].translation
        pls.append(R0.transposed() @ (W0.lerp(mid0, GRIP_PALM_ALONG) - W0))
        # swivel about the new palm normal: the angle between the finger direction (in the palm plane) and -a (toward the guard) into [40, 90] deg
        fp = Rf @ (mid0 - W0)
        fp = fp - nt * fp.dot(nt)
        negA = -a
        phi = math.atan2(nt.dot(negA.cross(fp)), negA.dot(fp)) if fp.length > 1e-9 else math.radians(60.0)
        sgn = 1.0 if phi >= 0 else -1.0
        target = sgn * max(math.radians(40.0), min(math.radians(90.0), abs(phi)))
        swivel = target - phi
        swv.append(swivel)
        across0 = P["LeftHandIndex1"].translation - P["LeftHandPinky1"].translation
        reversed_.append((Quaternion(nt, swivel).to_matrix() @ Rf @ across0).dot(a) > 0)
        R0s.append(q0)
        W0s.append(W0)
    rvsm = WeightedSmooth(rvs, h, 2.0, cyc)
    swsm = GaussSmooth([v * hv for v, hv in zip(swv, h)], 2.0, cyc)
    swsm = [v / hv if hv > 1e-3 else 0.0 for v, hv in zip(GaussSmooth([v * hv for v, hv in zip(swv, h)], 2.0, cyc), GaussSmooth(h, 2.0, cyc))]
    for k in range(n):
        if reversed_[k]:
            h[k] = 0.0
    nLoc = []
    for P in Ps:
        S0, E0, W0 = (P[f"Left{x}"].translation for x in ("Arm", "ForeArm", "Hand"))
        c = (E0 - S0).normalized().cross((W0 - E0).normalized())
        nLoc.append(P["LeftArm"].to_3x3().transposed() @ c.normalized() if c.length > 0.17 else None)
    have = [k for k in range(n) if nLoc[k] is not None]
    nLoc = [v if v is not None else (nLoc[min(have, key=lambda j: abs(j - k))] if have else Vector((1.0, 0.0, 0.0))) for k, v in enumerate(nLoc)]
    used, maxMove, maxTurn, short, maxSwivel, maxCorr = [], 0.0, 0.0, [], 0.0, 0.0
    for k, P in enumerate(Ps):
        if h[k] < 1e-3:
            continue
        mag = rvsm[k].length
        qs = Quaternion(rvsm[k] / mag, mag) if mag > 1e-9 else Quaternion()
        Rfix = qs.to_matrix()
        nLk = PalmNormal(P, "Left")
        ntk = (Rfix @ nLk).normalized()
        Rn = Quaternion(ntk, swsm[k]).to_matrix() @ Rfix @ R0s[k].to_matrix()
        maxSwivel = max(maxSwivel, abs(math.degrees(swsm[k])))
        qn = Rn.to_quaternion()
        if R0s[k].dot(qn) < 0:
            qn.negate()
        qb = R0s[k].slerp(qn, h[k])
        rot, org, _ = rows[k]
        T = org + rot @ Vector((0.0, 0.0, zt[k])) / sc
        # palm offset: the smallest distance from the axis along the palm normal where the palm vertex set (LeftHand + Thumb1) penetrates
        # the handle by no more than 0.5 mm (bisection), instead of the skin + support formula
        rotT = rot.transposed()
        LC = [(rotT @ (Rn @ c)) * sc for c in world.leftPalm]
        base = rotT @ (T - Rn @ pls[k] - org) * sc
        step = rotT @ ntk

        def Pen(delta):
            w0 = base - step * delta
            return max(-GripHandleSd(w0.x + c.x, w0.y + c.y, w0.z + c.z) for c in LC)

        lo, hi = 0.005, 0.07
        if Pen(lo) <= 0.0005:
            delta = lo
        elif Pen(hi) > 0.0005:
            delta = hi
        else:
            for _b in range(14):
                mid = (lo + hi) / 2
                if Pen(mid) > 0.0005:
                    lo = mid
                else:
                    hi = mid
            delta = hi
        formula = GRIP_SKIN["Left"] * sc + HandleSupport(*(rotT @ (-ntk))[:2]) + GRIP_PALM_MARGIN
        maxCorr = max(maxCorr, abs(delta - formula) * 1000)
        Ppalm = T - ntk * (delta / sc)
        dW = (Ppalm - Rn @ pls[k] - W0s[k]) * h[k]
        over = SolveArm(clip, P, k, "Left", dW, Vector(), P["LeftArm"].to_3x3() @ nLoc[k])
        Pn = dict(P)
        clip.RePose(Pn, k, "LeftArm", over)
        parHa = (Pn["LeftForeArm"] @ clip.rel["LeftHand"]).to_3x3()
        qh = (parHa.inverted() @ qb.to_matrix()).to_quaternion()
        qh.normalize()
        if qh.dot(clip.Q0["LeftHand"][k]) < 0:
            qh.negate()
        over["LeftHand"] = qh
        for name, q in over.items():
            clip.Q[name][k] = q
        for name in over:
            clip.dirty.add(name)
        Pn2 = dict(P)
        clip.RePose(Pn2, k, "LeftArm", over)
        left = (Pn2["LeftHand"].translation - (W0s[k] + dW)).length * sc * 100
        maxMove = max(maxMove, dW.length * sc * 100)
        maxTurn = max(maxTurn, Angle(R0s[k], qb))
        used.append(k)
        if left > 1.0:
            short.append((clip.frames[k], left))
    changes, stats = [], {"frames": len(used), "maxMoveCm": round(maxMove, 1), "maxTurnDeg": round(maxTurn, 1), "maxSwivelDeg": round(maxSwivel, 1), "offsetCorrMm": round(maxCorr, 1), "reversed": sum(reversed_), "short": len(short)}
    if used:
        changes.append(f"左手两节骨 IK 到刀柄尾段第 {Ranges([clip.frames[k] for k in used if h[k] > 0.01])} 帧：手腕最多移 {maxMove:.1f} cm、手掌最多转 {maxTurn:.1f}°（其中绕掌心法线摆正手指方向最多 {maxSwivel:.1f}°），左肩不动"
                       f"（刀固定在右手里，左手落到刀轴 z 0.13–0.17 处，手掌转到刀柄落进掌平面、手指与朝护手方向夹角 40–90°；掌心离轴线的距离按手掌和拇指根的顶点逐帧求（陷进刀柄 0.5 mm），比公式最多差 {maxCorr:.1f} mm；左手松开的帧保持原动作）")
    if sum(reversed_):
        ctx["unresolved"].append(f"左手有 {sum(reversed_)} 帧手是反的（食指侧朝刀柄尾端），这几帧不动：第 {Ranges([clip.frames[k] for k in range(n) if reversed_[k]])} 帧")
    if short:
        ctx["unresolved"].append(f"左手 IK 有 {len(short)} 帧够不到目标（两节骨臂长限制），最多差 {max(s[1] for s in short):.1f} cm，第 {Ranges([s[0] for s in short])} 帧")
    return changes, stats


# ---------------------------------------------------------------- finger / thumb optimisation
def Frange(lo, hi, step):
    out, v = [], lo
    while v <= hi + 1e-9:
        out.append(round(v, 4))
        v += step
    return out


class ChainEval:
    """One finger (or the thumb) on one frame. Fingers: (th1, th2, th3) in degrees. Thumb: (Thumb1 flexion delta, Thumb1 delta about local X,
    th2, th3). Joint heads / capsule clearances are cached per joint level."""

    def __init__(self, clip, world, P, k, side, finger, info, frame, tol, fingerSegs=None):
        self.clip, self.world, self.k, self.sc = clip, world, k, clip.scale
        self.thumb = finger == "Thumb"
        self.names = [f"{side}Hand{finger}{i}" for i in (1, 2, 3, 4)]
        self.rad = [world.radii.get(b, 0.009 if self.thumb else 0.008) for b in self.names[:3]]
        self.rel = [clip.rel[b] for b in self.names]
        self.hand = P[f"{side}Hand"]
        self.info, self.rotT, self.trans, self.tol = info, frame[0], frame[1], tol
        self.fingerSegs = fingerSegs or []
        self.th0 = [0.0, 0.0] + [info[b]["th0"][k] for b in self.names[1:3]] if self.thumb else None
        self.c1, self.c2, self.c3 = {}, {}, {}

    def Q(self, j, th, x=0.0):
        inf = self.info[self.names[j]]
        if self.thumb and j == 0:
            return inf["q0"][self.k] @ Quaternion(inf["A"], math.radians(th)) @ Quaternion(Vector((1.0, 0.0, 0.0)), math.radians(x))
        return inf["sw"][self.k] @ Quaternion(inf["A"], math.radians(th))

    def Clear(self, a, b, r, cap=False):
        sc = self.sc
        if cap:
            d = b - a
            if d.length > 1e-9:
                b = b - d.normalized() * (r / sc)
                if (b - a).dot(d) < 0:
                    b = a
        n = max(1, int(math.ceil((b - a).length * sc / GRIP_SAMPLE_M)))
        best = 1e9
        for t in range(n + 1):
            p = a.lerp(b, t / n)
            loc = (self.rotT @ (p - self.trans)) * sc
            c = self.world.Sdf(loc) - r
            for fa, fb, fr in self.fingerSegs:
                ab = fb - fa
                u = max(0.0, min(1.0, (p - fa).dot(ab) / max(ab.dot(ab), 1e-12)))
                c = min(c, ((fa + ab * u) - p).length * sc - r - fr)
            best = min(best, c)
        return best, (a, b)

    def L1(self, a, x):
        key = (a, x)
        if key not in self.c1:
            M = self.hand @ self.rel[0] @ self.clip.Basis(self.names[0], self.k, self.Q(0, a, x))
            h1, h2 = (self.hand @ self.rel[0]).translation, (M @ self.rel[1]).translation
            self.c1[key] = (M, h2, None if self.thumb else self.Clear(h1, h2, self.rad[0])[0], (h1, h2))
        return self.c1[key]

    def L2(self, a, x, b):
        key = (a, x, b)
        if key not in self.c2:
            M1, h2, _, _ = self.L1(a, x)
            M = M1 @ self.rel[1] @ self.clip.Basis(self.names[1], self.k, self.Q(1, b))
            h3 = (M @ self.rel[2]).translation
            c, seg = self.Clear(h2, h3, self.rad[1])
            self.c2[key] = (M, h3, c, seg)
        return self.c2[key]

    def L3(self, a, x, b, c):
        key = (a, x, b, c)
        if key not in self.c3:
            M2, h3, _, _ = self.L2(a, x, b)
            M = M2 @ self.rel[2] @ self.clip.Basis(self.names[2], self.k, self.Q(2, c))
            h4 = (M @ self.rel[3]).translation
            self.c3[key] = self.Clear(h3, h4, self.rad[2], cap=True)
        return self.c3[key]

    def Split(self, th):
        th = [round(t, 4) for t in th]
        return (th[0], th[1], th[2], th[3]) if self.thumb else (th[0], 0.0, th[1], th[2])

    def Clearances(self, th):
        a, x, b, c = self.Split(th)
        return [self.L1(a, x)[2], self.L2(a, x, b)[2], self.L3(a, x, b, c)[0]]

    def E(self, th, w=(0.25, 1.0, 1.0)):
        tol = self.tol
        cs = self.Clearances(th)
        if self.thumb:
            e = 0.5 * max(cs[1], 0.0) ** 2 + max(cs[2], 0.0) ** 2
            e += 1000.0 * sum(max(-v - tol, 0.0) ** 2 for v in cs[1:])
            e += 5e-6 * sum(math.radians(t - t0) ** 2 for t, t0 in zip(th, self.th0))
        else:
            e = sum(wi * max(v, 0.0) ** 2 for wi, v in zip(w, cs))
            e += 1000.0 * sum(max(-v - tol, 0.0) ** 2 for v in cs)
            e += 7.4e-5 * (math.radians(th[2]) - 0.7 * math.radians(th[1])) ** 2
        return e

    def Segs(self, th):
        a, x, b, c = self.Split(th)
        l1, l2, l3 = self.L1(a, x)[3], self.L2(a, x, b)[3], self.L3(a, x, b, c)[1]
        return [(l1[0], l1[1], self.rad[0]), (l2[0], l2[1], self.rad[1]), (l3[0], l3[1], self.rad[2])]


def GridSearch(ev, lists):
    best = None
    for th in itertools.product(*lists):
        e = ev.E(th)
        if best is None or e < best[0]:
            best = (e, tuple(th))
    return best


def Refine(ev, center, half, step, limits):
    lists = [Frange(max(lo, c - hf), min(hi, c + hf), st) for c, hf, st, (lo, hi) in zip(center, half, step, limits)]
    return GridSearch(ev, lists)


def SolveChain(ev, prev, limits):
    """Full grid on the first frame of a run (or on fallback), then refine; later frames refine around the previous raw solution."""
    thumb, nd = ev.thumb, len(limits)
    pen0 = 1 if thumb else 0
    if prev is not None:
        e, th = Refine(ev, prev[1], [6.0] * nd, [3.0 if thumb else 2.0] * nd, limits)
        e, th = Refine(ev, th, [1.5] * nd, [0.75 if thumb else 0.5] * nd, limits)
        if min(ev.Clearances(th)[pen0:]) >= -0.001 and e <= 4 * max(prev[0], 2e-6):
            return e, th, False
    if thumb:
        full = [Frange(limits[0][0], limits[0][1], 7.0), Frange(limits[1][0], limits[1][1], 5.0), Frange(limits[2][0], limits[2][1], 10.0), Frange(limits[3][0], limits[3][1], 10.0)]
        e, th = GridSearch(ev, full)
        e, th = Refine(ev, th, [7.0, 5.0, 10.0, 10.0], [3.5, 2.5, 5.0, 5.0], limits)
        e, th = Refine(ev, th, [2.0] * 4, [1.0] * 4, limits)
    else:
        full = [Frange(lo, hi, 5.0) for lo, hi in limits]
        e, th = GridSearch(ev, full)
        e, th = Refine(ev, th, [5.0] * 3, [1.0] * 3, limits)
    return e, th, True


def OpGrip(clip, op, ctx):
    world = ctx["gripWorld"]
    margin = float(op.get("marginMm", 0.0)) / 1000.0
    tol = float(op.get("tolMm", 0.5)) / 1000.0
    sigma = float(op.get("sigma", 1.0))
    n, sc, cyc = clip.n, clip.scale, ctx["loop"]

    def Frames(Ps):
        out = []
        for P in Ps:
            rot, trans = DadaoPlacement(clip, P, world.cal)
            out.append((rot.transposed(), trans))
        return out

    def LeftWeights(Ps, frames):
        raw = []
        for k in range(n):
            G = (frames[k][0] @ (GripPoint(Ps[k], "Left", RigidRot(Ps[k], world.cal)) - frames[k][1])) * sc
            rho = math.hypot(G.x, G.y + 0.0003)
            raw.append((1 - Smooth3(0.015, 0.04, rho)) * Smooth3(-0.03, 0.0, G.z) * (1 - Smooth3(0.25, 0.29, G.z)))
        return raw, [max(0.0, min(1.0, v)) for v in GaussSmooth(MaxFilter(raw, 3, cyc), 2.0, cyc)]

    changes, measure = [], {}
    ikLines, ikStats = LeftReach(clip, world, ctx)
    changes.extend(ikLines)
    measure["ik"] = ikStats
    Ps = [clip.Pose(k) for k in range(n)]
    frames = Frames(Ps)
    _, gsL = LeftWeights(Ps, frames)
    gs = {"Right": [1.0] * n, "Left": gsL}

    for side in ("Right", "Left"):
        solveAt = [k for k in range(n) if gs[side][k] > 0.01]
        if not solveAt:
            continue
        names = GRIP_FINGERS + ["Thumb"]
        stat = {"frames": len(solveAt), "grid": 0, "pen": {f: 0 for f in names}, "far": {f: 0 for f in names}, "touch": 0.0}
        bones = {f: [f"{side}Hand{f}{i}" for i in (1, 2, 3)] for f in names}
        info = {}
        for f, bs in bones.items():
            for i, b in enumerate(bs):
                A = (world.thumb1A[side] if i == 0 else world.thumbA[side]) if f == "Thumb" else world.flexA[side]
                sw, th0 = [], []
                for k in range(n):
                    if f == "Thumb" and i == 0:
                        sw.append(clip.Q[b][k].copy())
                        th0.append(0.0)
                    else:
                        s_, t_ = SwingTwist(clip.Q[b][k], A)
                        sw.append(s_)
                        th0.append(t_)
                info[b] = {"sw": sw, "th0": th0, "A": A, "q0": [q.copy() for q in clip.Q[b]]}
        fit = {b: list(info[b]["th0"]) for b in info}
        fitX = [0.0] * n
        solved = {b: [False] * n for b in info}
        prevSol = {f: None for f in bones}
        lastK = None
        pinLast = (cyc and solveAt[0] == 0 and solveAt[-1] == n - 1 and Angle(clip.Q0["RightHand"][0], clip.Q0["RightHand"][-1]) < 0.5
                   and Angle(clip.Q0["LeftHand"][0], clip.Q0["LeftHand"][-1]) < 0.5)   # loop clip whose last frame repeats the first: solve it once
        for k in (solveAt[:-1] if pinLast else solveAt):
            if lastK is None or k != lastK + 1:
                prevSol = {f: None for f in bones}
            lastK = k
            fingerSegs = []
            for f in names:
                thumb = f == "Thumb"
                ev = ChainEval(clip, world, Ps[k], k, side, f, info, frames[k], tol, fingerSegs if thumb else None)
                for j in range(3):
                    ev.rad[j] += margin
                e, th, grid = SolveChain(ev, prevSol[f], THUMB_LIMITS if thumb else FINGER_LIMITS)
                stat["grid"] += int(grid)
                prevSol[f] = (e, th)
                cs = ev.Clearances(th)
                pen0 = 1 if thumb else 0
                if min(cs[pen0:]) < -0.001:
                    stat["pen"][f] += 1
                if min(cs[pen0:]) > 0.003:
                    stat["far"][f] += 1
                if not thumb:
                    stat["touch"] += sum(1 for v in cs if v <= 0.0015)
                if thumb:
                    fitX[k] = th[1]
                    vals = [th[0], th[2], th[3]]
                else:
                    vals = list(th)
                for i, b in enumerate(bones[f]):
                    fit[b][k] = vals[i]
                    solved[b][k] = True
                if f in ("Index", "Middle"):
                    fingerSegs.extend(ev.Segs(th))
        if pinLast:
            for b in fit:
                fit[b][n - 1], solved[b][n - 1] = fit[b][0], solved[b][0]
            fitX[n - 1] = fitX[0]
        stat["touchMean"] = round(stat["touch"] / (len(solveAt) * 4), 3)
        del stat["touch"]
        measure[side] = stat
        g = gs[side]
        worst = {f: 0.0 for f in bones}
        smX = GaussSmooth(fitX, sigma, cyc)
        for f, bs in bones.items():
            for bi, b in enumerate(bs):
                inf = info[b]
                seq = GaussSmooth(fit[b], sigma, cyc)
                for k in range(n):
                    if f == "Thumb" and bi == 0:
                        qf = inf["q0"][k] @ Quaternion(inf["A"], math.radians(seq[k])) @ Quaternion(Vector((1.0, 0.0, 0.0)), math.radians(smX[k]))
                    else:
                        qf = inf["sw"][k] @ Quaternion(inf["A"], math.radians(seq[k]))
                    q0 = inf["q0"][k]
                    if q0.dot(qf) < 0:
                        qf.negate()
                    qn = q0.slerp(qf, g[k])
                    worst[f] = max(worst[f], Angle(q0, qn))
                    clip.Q[b][k] = qn
                clip.dirty.add(b)
        who = "右手" if side == "Right" else "左手"
        fr = [clip.frames[k] for k in range(n) if g[k] > 0.01]
        changes.append(f"{who} 第 {Ranges(fr)} 帧：手指逐帧按刀柄外形优化合拢（每节骨绕本地轴转、保留原来的外展 / 扭转；四指各自在关节限位里搜最贴刀柄的角度，拇指第 1 节两个自由度 + 第 2、3 节），"
                       f"最大改动 {'、'.join(f'{GRIP_NAMES[f]} {worst[f]:.0f}°' for f in bones)}")
        for f in names:
            if stat["pen"][f]:
                ctx["unresolved"].append(f"{side}{f} 有 {stat['pen'][f]} 帧优化完仍陷进刀柄 > 1 mm")
            if stat["far"][f]:
                ctx["unresolved"].append(f"{side}{f} 有 {stat['far'][f]} 帧离刀柄 > 3 mm（够不到或在柄尾环上）")
    if cyc and Angle(clip.Q0["RightHand"][0], clip.Q0["RightHand"][-1]) < 0.5 and Angle(clip.Q0["LeftHand"][0], clip.Q0["LeftHand"][-1]) < 0.5:
        for b in clip.dirty:   # loop clip whose last frame repeats the first: keep it that way after the temporal smoothing
            clip.Q[b][-1] = clip.Q[b][0].copy()
    ctx["measure"]["grip"] = measure
    return changes


OPS_FN = {"seam": OpSeam, "glitch": OpGlitch, "hands": OpHands, "shift": OpShift, "grip": OpGrip}


def Diag(clip, ctx):
    """Seam / glitch diagnostics without changing anything."""
    n = clip.n
    seam = sorted(((Angle(clip.Q[b][0], clip.Q[b][-1]), b) for b in clip.order), reverse=True)[:5]
    lines = []
    for g, b in seam:
        qs = clip.Q[b]
        lines.append(f"seam {b} {g:.1f}° | step first {Angle(qs[0], qs[1]):.1f} last {Angle(qs[-2], qs[-1]):.1f}")
    return lines


def Main():
    opts = Args()
    with open(OPS, encoding="utf-8") as f:
        table = json.load(f)["clips"]
    with open(os.path.join(OUT, "Data_MixamoLibrary.json"), encoding="utf-8") as f:
        manifest = {c["file"]: c for c in json.load(f)["clips"]}
    stems = [s for s in table if not s.startswith("_")]
    if opts["only"]:
        want = {o if o.startswith("Animation_") else f"Animation_Mixamo_{o}" for o in opts["only"]}
        stems = [s for s in stems if s in want]
        if opts["diag"]:
            extra = sorted(w for w in want if w not in stems)
            stems += extra
    vols, rest = FitBody()
    setupCtx = {}
    if any(o["op"] == "grip" for st in stems for o in table[st].get("ops", [])):
        GripSetup(setupCtx)
    Log("body volumes", {k: round(v["rx"], 2) for k, v in vols.items()})
    os.makedirs(ORIG, exist_ok=True)
    if opts["log"]:
        os.makedirs(opts["log"], exist_ok=True)
    for stem in stems:
        source = os.path.join(RAW, stem + ".fbx")
        target = os.path.join(OUT, stem + ".glb")
        try:
            arm = Import(source)
            actions = list(bpy.data.actions)
            for i, action in enumerate(actions):
                action.name = stem if i == 0 else f"{stem}_{i}"
            restDiff = max(max((arm.data.bones[b].matrix_local.translation - rest[b].translation).length,
                               Angle(arm.data.bones[b].matrix_local.to_quaternion(), rest[b].to_quaternion()))
                           for b in rest if b in arm.data.bones)
            Log(stem, "rest diff vs X Bot (units / deg)", round(restDiff, 4))
            clip = Clip(arm, stem)
            ctx = {"vols": vols, "loop": IsLoop(manifest, stem), "unresolved": [], "measure": {}, **setupCtx}
            if opts["diag"]:
                for line in Diag(clip, ctx):
                    Log(stem, line)
            entry = table.get(stem, {"ops": []})
            record = {"stem": stem, "frames": clip.n, "firstFrame": clip.frames[0], "loop": ctx["loop"], "restDiff": restDiff, "topics": {}}
            for op in entry.get("ops", []):
                topic = op.get("topic", op["op"].capitalize())
                lines = OPS_FN[op["op"]](clip, op, ctx)
                record["topics"].setdefault(topic, []).extend(lines)
                for line in lines:
                    Log(stem, topic, line)
            record["unresolved"] = ctx["unresolved"]
            record["measure"] = ctx["measure"]
            for u in ctx["unresolved"]:
                Log(stem, "UNRESOLVED", u)
            if ctx["measure"]:
                Log(stem, "measure", json.dumps(ctx["measure"]))
            clip.WriteBack()
            if opts["export"] and opts["out"]:
                for obj in list(bpy.data.objects):
                    if obj.type == "MESH":
                        bpy.data.objects.remove(obj, do_unlink=True)
                os.makedirs(opts["out"], exist_ok=True)
                Export(os.path.join(opts["out"], stem + ".glb"))
            elif opts["export"] and entry.get("ops"):
                orig = os.path.join(ORIG, stem + ".glb")
                if not os.path.exists(orig) and os.path.exists(target):
                    shutil.copy2(target, orig)
                for obj in list(bpy.data.objects):
                    if obj.type == "MESH":
                        bpy.data.objects.remove(obj, do_unlink=True)
                Export(target)
                record["exported"] = True
            if opts["log"]:
                logPath = os.path.abspath(os.path.join(opts["log"], stem + ".json"))
                if os.name == "nt":
                    logPath = "\\\\?\\" + logPath  # 临时目录路径常超 260 字符
                with open(logPath, "w", encoding="utf-8") as f:
                    json.dump(record, f, ensure_ascii=False, indent=1)
        except Exception as error:
            import traceback
            traceback.print_exc()
            Log(stem, "FAIL", error)


Main()

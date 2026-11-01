# StripperLoadKneel「跪姿压桥夹装弹」 (Claude, 2026-11-01)
#
# 这是什么：单膝（右膝）跪姿，枪收近身体、枪口斜指左前上方，左手弯肘托枪，右手开栓、从腰带前右侧的子弹盒取一个 5 发桥夹，
#   竖着插进机匣顶的桥夹槽，拇指在夹上往下压两下把子弹压进弹仓，右手回拉柄往前推栓（空夹被顶飞，不用手拔）、
#   下压锁死，最后右手回握把、枪放回跪姿端枪的原位置。单次动作（loop: false）。
#   预览里只有枪，没有桥夹和子弹；时间表按「手里有夹」去做。
#   做法和已过审的 StripperLoadStand（站姿）一致（同一套枪轨迹 + 逐帧 IK 的写法），跪姿专有的改动见下。
#
# 改自：Animation_Mixamo_RifleKneelIdle_V1（跪姿端枪待机：左脚在前踏地、右膝着地，枪在腰前低位，第 1 帧两手都在枪上）。
#   第 1 帧和最后一帧都等于原件第 1 帧的姿势（全身所有骨头；原件首尾本来就一样，呼吸起伏被压平成第 1 帧的姿势），
#   接得上别的 RifleKneel 系动作；左手相对枪的位置全程不变（预览里枪钉在左手上：第 1 帧两手掌心定枪，之后枪跟着左手走）。
#   中间：躯干/头/锁骨重新打关键帧；双臂用 IK 烘；开头 0.10-0.30 s、结尾 5.79-5.97 s 是 IK 淡入淡出
#   （这两段目标还是原件的手位，所以看不出动），首尾保持原件姿势。
#
# 跪姿专有的处理：
#   * 髋和双腿不动：髋位置、双腿所有骨头整条锁成原件第 1 帧的值，不做腿 IK，所以着地的右膝、右脚尖和左脚在整条动作里一点都不漂。
#     躯干的前倾/侧倾只动脊柱三节，不碰髋（站姿版靠髋下沉放低枪；跪姿本来就低，不需要）。
#   * 原件里躯干本来就前倾约 16-30 度、头已经朝下，所以装弹时只在这上面再加一点（胸 +3..+6 度、头再低 +14..+32 度，头偏向右看机匣）。
#   * 装弹位置（枪的方位）：机匣（feedMouth）停在胸骨前约 28 cm（Spine2 轴前 37 cm，原件里躯干前倾、胸朝右偏约 30 度）、高约 0.64 m（原件端枪时 0.59 m），
#     枪口斜指左前上约 32 度；枪托落在右胯外上方，夹在右小臂和右大腿上方之间；
#     左手弯肘约 86 度托在枪中段（Mixamo 原件里左手握的位置，比工程护木点近 20 cm，保留原手距）。
#   * 取夹的子弹盒挂在腰带前右侧；右大腿从髋斜着往前下方到着地的右膝，所以盒子在大腿的上方，手不会碰到腿。
#
# 关键帧时间表（秒，30 fps，帧号 = 1 + 秒 * 30；整条 6.17 s = 186 帧）：
#   0.00-0.10  原件端枪跪姿（逐帧等于原件第 1 帧）；0.10-0.30 IK 淡入（手位不变）
#   0.30-0.95  收枪：枪口抬到约 32 度、枪移到胸前右侧，头低下；左手托枪，右手一直握着握把
#   1.00-1.18  右手松开握把，往前到拉柄；1.18 掌心到球头（knob，栓关闭）
#   1.25-1.50  握住球头上翻约 90 度（knob -> knobUp）；1.50-1.72 往后拉到底（knobUp -> knobBack）；1.72-1.84 到底停一拍（开栓完成）
#   1.84-2.30  松手，右手去右髋前的子弹盒（腰带高度，右髋前侧）；2.30-2.58 取出桥夹（2.42 手指合拢）
#   2.58-3.07  把夹竖着送到桥夹槽（feedMouth）上方，拇指尖在 feedMouth 正上方约 7.5 cm
#   3.07-3.25  夹竖着插进槽（拇指尖 7.5 -> 6.6 cm 高）
#   3.25-3.37  拇指移到子弹顶上，3.37 压第 1 下（拇指尖离 feedMouth 约 1.4 cm）；3.53 稍抬（4.1 cm）；3.67 压第 2 下（1.2 cm）；3.85 松手上抬
#   3.85-4.29  右手回到拉柄（栓还开着，knobBack）；4.22 掌心到球头，4.29 握紧
#   4.29-4.55  往前推栓（knobBack -> knobUp，空夹被顶飞）；4.55-4.80 下压锁住（knobUp -> knob，下压时前旋角 32 度）；4.80-4.87 稳一拍
#   手型：握 <-> 半张 <-> 张开 <-> 捏 <-> 压之间每次切换 0.22-0.24 s（约 7 帧）smootherstep 渐变，手指每帧不超过 23 度（FINGER_EVENTS）
#   4.87-5.29  松开拉柄，右手回握把；5.22-5.79 枪放回原件的端枪位置（右手一直握着）；5.79-5.97 IK 淡出；到 6.17 停住
#   第一次拉栓：握住球头 1.18 -> 松手 1.84（0.66 s）；第二次推栓：握住 4.22 -> 松手 4.87（0.65 s）。
#   （设计时间到实际时间的映射见 Warp()：把收枪拉长到 0.65 s，取夹到槽口那一程多给 0.07 s。）
#
# 史实：中正式（毛瑟 98 式）、三八式是转栓式：拉柄上翻约 90 度、往后拉到底，才露出机匣顶上的桥夹槽。
#   5 发桥夹竖着插进槽里，拇指把子弹往下压进弹仓（一到两下），推栓时前进的枪机把空夹顶飞，不用手去拔。
#   不是汉阳造（八八式）的整夹装填；也没有现代战术持枪的习惯。子弹盒是国军的皮质弹药盒，挂腰带前右侧。
#
# 自己加的东西（工具包没有，和 StripperLoadStand 相同）：
#   * 枪的轨迹 M(t)：第 1 帧 = 原件两手掌心定出的枪位；装弹位置按「机匣落在胸前哪里、方位角、俯仰」定；中间 slerp+smootherstep。
#     左手手腕/朝向 = M(t) 乘上第 1 帧「手相对枪」的固定偏移（所以预览里「枪跟左手走」和这里算的一致）。
#     右手的目标挂在枪、或挂在髋（子弹盒），段间用 smootherstep 交叉过渡。
#   * 自己的 IK 函数：双臂，逐帧关键帧、极点角度自动挑、极点跟着肩/腕走、influence 逐帧淡入淡出。
#   * 手的朝向用「四指方向 + 掌心法线」描述（和手骨本地基底对齐），拇指指尖目标用 FK 求出的拇指尖偏移。
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import Script_MixamoAuthorKit as K
from mathutils import Matrix, Quaternion, Vector

bpy = K.bpy
NAME = "StripperLoadKneel"
BASE = "Animation_Mixamo_RifleKneelIdle_V1"
RIFLE = "ZhongZheng"
FPS = 30
N = 186                                    # 1..186，6.167 s
DURATION = (N - 1) / FPS
R = K.RIFLES[RIFLE]
KNOB, KNOB_UP, KNOB_BACK = Vector(R["knob"]), Vector(R["knobUp"]), Vector(R["knobBack"])
FEED, GRIPL = Vector(R["feedMouth"]), Vector(R["gripL"])

# 设计时间 -> 实际时间（分段线性）：收枪拉长到 0.65 s；取夹到槽口多 0.07 s
WARP = [(0.0, 0.0), (0.15, 0.30), (0.75, 0.95), (2.38, 2.58), (2.80, 3.07), (100.0, 100.27)]
FADE_IN = (0.10, 0.30)                     # IK 淡入（实际时间）
FADE_OUT_START = 5.79                      # IK 开始淡出 = 枪回到原位的时刻
FADE_OUT = 0.18


def Warp(t):
    for (a0, b0), (a1, b1) in zip(WARP, WARP[1:]):
        if t <= a1:
            return b0 + (b1 - b0) * (t - a0) / (a1 - a0)
    return t


def Fr(t):
    return 1 + t * FPS


def Tm(f):
    return (f - 1) / FPS


def Ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (6 * x - 15) + 10)


def R3(m):
    return m.to_3x3().normalized()


def Fmt(v, n=3):
    return tuple(round(x, n) for x in v)


def Influence(t):
    if t <= FADE_IN[0]:
        return 0.0
    if t < FADE_IN[1]:
        return Ease((t - FADE_IN[0]) / (FADE_IN[1] - FADE_IN[0]))
    if t <= FADE_OUT_START:
        return 1.0
    return 1.0 - Ease((t - FADE_OUT_START) / FADE_OUT)


LOG_PATH = None


def log(s):
    print("[StripperLoad]", s)
    if LOG_PATH:
        with open(LOG_PATH, "a", encoding="utf-8") as fh:
            fh.write(s + "\n")


# ----------------------------------------------------------------------------- 设计数据
# 装弹位置：机匣（feedMouth）落点在胸坐标（右、前、绝对高度 z），枪的方位角（相对胸朝向，正 = 向左）、俯仰（正 = 枪口朝上）
POSE_B = dict(feed=(0.0, 0.38, 0.64), az=34.0, pitch=32.0, roll=0.0)
RIFLE_KEYS = [(0.00, "A"), (0.15, "A"), (0.75, "B"), (4.95, "B"), (5.52, "A"), (5.73, "A")]
# 动作反作用：(中心时间, 宽度 s, 枪本地位移 (x右, y上, z后) m, 俯仰变化度)
BUMPS = [
    (1.50, 0.07, (0.0, 0.0, 0.012), 0.8),
    (3.10, 0.06, (0.0, -0.010, 0.0), -1.0),
    (3.40, 0.06, (0.0, -0.010, 0.0), -1.0),
    (4.25, 0.07, (0.0, 0.0, -0.010), 0.0),
]

# 躯干/头/右肩/髋姿态（度、厘米）：(胸俯仰, 胸偏航, 胸侧倾, 头俯仰, 头偏航, 头侧倾, 右肩向后, 髋下沉, 髋后移)
# 符号：俯仰 + = 前倾；偏航 + = 向左转；侧倾 + = 向右倾；右肩向后 + = 肩往后收
BODY_POSES = {
    "N": (0, 0, 0, 0, 0, 0, 0, 0.0, 0.0),
    "B": (3, 0, 0, 14, -14, 0, 0, 0.0, 0.0),
    "bolt": (3, -3, 0, 16, -16, 3, 4, 0.0, 0.0),
    "pouch": (4, -2, 3, 22, -18, 0, 0, 0.0, 0.0),
    "seat": (5, 0, 1, 28, -22, 0, 0, 0.0, 0.0),
    "press": (6, 0, 1, 30, -22, 0, 0, 0.0, 0.0),
    "push": (4, 2, 0, 16, -16, 0, -2, 0.0, 0.0),
}
BODY_KEYS = [(0.0, "N"), (0.15, "N"), (0.75, "B"), (1.12, "B"), (1.52, "bolt"), (1.72, "B"), (2.15, "pouch"),
             (2.40, "pouch"), (2.85, "seat"), (3.10, "press"), (3.26, "seat"), (3.40, "press"), (3.65, "seat"),
             (4.05, "bolt"), (4.30, "push"), (4.66, "B"), (5.05, "B"), (5.52, "N"), (5.73, "N")]

# 右手关键帧：t 设计秒；ref W=挂在枪（枪坐标 x右 y上 z后）、B=挂在身体（右、前、绝对高度）
# orient：(四指方向, 掌心法线)，坐标同 ref；mode palm=掌心到点 / thumb=拇指尖到点；fing=手指预设
GRASP_F, GRASP_N = (0.10, 0.12, -1.0), (-1.0, -0.25, 0.0)


def RotZ(v, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2])


def GRASP(roll=0.0):
    return (RotZ(GRASP_F, roll), RotZ(GRASP_N, roll))


# 插夹：掌心朝左上（手托在机匣右侧下方，拇指和食指捏着夹往上够），四指略朝左前
PINCH_O = ((-0.17, -0.17, -0.97), (-0.766, 0.643, 0.0))
MID_O = ((-0.08, -0.10, -0.99), (-0.966, 0.259, 0.0))
# 压弹：握手姿势（四指朝前、掌心朝机匣）罩在机匣右侧，四指从右侧勾住枪身，拇指屈曲、指肚压在夹顶上；压下去时手腕下沉（四指略朝下）
PRESS_O = ((0.0, -0.05, -1.0), (-1.0, -0.1, 0.0))
PRESS_DOWN = ((0.0, -0.10, -0.995), (-0.995, -0.10, 0.0))
POUCH_O = ((0.0, 0.45, -0.85), (-1.0, 0.0, 0.0))        # B 坐标：四指朝下略朝前，掌心朝身体
MID_UP = (KNOB + KNOB_UP) * 0.5 + Vector((0.012, 0.0, 0.0))
MID_DOWN = MID_UP.copy()
KB_ROLL = 32.0


def RightKeys(pouch_b):
    W, B = "W", "B"
    return [
        dict(t=0.00, ref=W, p=(0, 0, 0), o=GRASP(), fing="grip"),
        dict(t=0.80, ref=W, p=(0, 0, 0), o=GRASP(), fing="grip"),
        dict(t=0.90, ref=W, p=tuple(KNOB * 0.5), o=GRASP(), fing="open"),
        dict(t=0.98, ref=W, p=tuple(KNOB), o=GRASP(), fing="open"),
        dict(t=1.05, ref=W, p=tuple(KNOB), o=GRASP(), fing="grip"),
        dict(t=1.16, ref=W, p=tuple(MID_UP), o=GRASP(KB_ROLL * 0.5), fing="grip"),
        dict(t=1.30, ref=W, p=tuple(KNOB_UP), o=GRASP(KB_ROLL), fing="grip"),
        dict(t=1.52, ref=W, p=tuple(KNOB_BACK), o=GRASP(KB_ROLL), fing="grip"),
        dict(t=1.58, ref=W, p=tuple(KNOB_BACK), o=GRASP(KB_ROLL), fing="grip"),
        dict(t=1.64, ref=W, p=tuple(KNOB_BACK), o=GRASP(KB_ROLL), fing="open"),
        dict(t=2.10, ref=B, p=pouch_b, o=POUCH_O, fing="open"),
        dict(t=2.22, ref=B, p=pouch_b, o=POUCH_O, fing="clip"),
        dict(t=2.38, ref=B, p=pouch_b, o=POUCH_O, fing="clip"),
        dict(t=2.80, ref=W, p=tuple(FEED + Vector((0, 0.075, 0))), o=PINCH_O, fing="clip", mode="thumb"),
        dict(t=2.93, ref=W, p=tuple(FEED + Vector((0, 0.066, 0))), o=PINCH_O, fing="clip", mode="thumb"),
        dict(t=3.06, ref=W, p=tuple(FEED + Vector((0, 0.030, 0))), o=MID_O, fing="grip", mode="thumb", oskip=True),
        dict(t=3.16, ref=W, p=tuple(FEED + Vector((0, 0.014, 0))), o=PRESS_DOWN, fing="grip", mode="thumb"),
        dict(t=3.28, ref=W, p=tuple(FEED + Vector((0, 0.042, 0))), o=PRESS_O, fing="grip", mode="thumb"),
        dict(t=3.40, ref=W, p=tuple(FEED + Vector((0, 0.012, 0))), o=PRESS_DOWN, fing="grip", mode="thumb"),
        dict(t=3.58, ref=W, p=tuple(FEED + Vector((0, 0.045, 0))), o=PRESS_O, fing="open", mode="thumb"),
        dict(t=3.95, ref=W, p=tuple(KNOB_BACK), o=GRASP(KB_ROLL), fing="open"),
        dict(t=4.02, ref=W, p=tuple(KNOB_BACK), o=GRASP(KB_ROLL), fing="grip"),
        dict(t=4.26, ref=W, p=tuple(KNOB_UP), o=GRASP(KB_ROLL), fing="grip"),
        dict(t=4.38, ref=W, p=tuple(MID_DOWN), o=GRASP(KB_ROLL * 0.5), fing="grip"),
        dict(t=4.50, ref=W, p=tuple(KNOB), o=GRASP(), fing="grip"),
        dict(t=4.58, ref=W, p=tuple(KNOB), o=GRASP(), fing="grip"),
        dict(t=4.66, ref=W, p=tuple(KNOB), o=GRASP(), fing="open"),
        dict(t=5.02, ref=W, p=(0, 0, 0), o=GRASP(), fing="open"),
        dict(t=5.09, ref=W, p=(0, 0, 0), o=GRASP(), fing="grip"),
        dict(t=5.73, ref=W, p=(0, 0, 0), o=GRASP(), fing="grip"),
    ]


# 手指预设：每指 3 个关节绕本地 X 的角度；拇指每关节 (绕 X, 绕 Z)。"grip" = 第 1 帧原件的握法。
FINGER_PRESETS = {
    "open": dict(Index=(8, 10, 5), Middle=(10, 12, 8), Ring=(14, 14, 10), Pinky=(18, 16, 10),
                 Thumb=((0, -15), (0, 0), (0, 0))),
    "clip": dict(Index=(55, 60, 25), Middle=(55, 70, 40), Ring=(60, 75, 45), Pinky=(65, 80, 45),
                 Thumb=((10, 25), (15, 10), (40, 0))),
}


# ----------------------------------------------------------------------------- 手：本地基底、朝向
def HandBasis(arm, side, frame):
    """手骨头世界旋转 q0（3x3），以及手本地坐标里的 (四指方向 lf, 掌心法线 ln, 拇指侧 la)。"""
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
    """让手的 (四指, 法线) 对齐 f_w, n_w 的手骨头世界旋转（3x3）。"""
    lf, ln, la = local_basis
    f_w = Vector(f_w).normalized()
    n_w = Vector(n_w)
    n_w = (n_w - f_w * n_w.dot(f_w)).normalized()
    a_w = f_w.cross(n_w)
    wm = Matrix((f_w, n_w, a_w)).transposed()
    lm = Matrix((lf, ln, la)).transposed()
    return wm @ lm.inverted()


# ----------------------------------------------------------------------------- 身体坐标
class Body:
    """以某根骨头（髋 / 胸）第 1 帧的朝向与位置为准的水平坐标系：右、前、绝对高度。"""

    def __init__(self, arm, bone):
        K.At(1)
        m = R3(K.BoneMatrix(arm, bone))
        z = m.col[2]
        self.f = Vector((z.x, z.y, 0)).normalized()
        self.l = Vector((-self.f.y, self.f.x, 0))
        self.r = -self.l
        self.o = K.BoneHead(arm, bone)

    def P(self, right, fwd, z):
        v = self.o + self.r * right + self.f * fwd
        return Vector((v.x, v.y, z))

    def Dir(self, right, fwd, up):
        return self.r * right + self.f * fwd + Vector((0, 0, 1)) * up

    def Local(self, p):
        d = p - self.o
        return (d.dot(self.r), d.dot(self.f), p.z)


# ----------------------------------------------------------------------------- 枪的轨迹
def RifleMatFeed(chest, feed, az, pitch, roll=0.0):
    ang = math.radians(az)
    h = chest.f * math.cos(ang) + chest.l * math.sin(ang)
    p = math.radians(pitch)
    d = h * math.cos(p) + Vector((0, 0, math.sin(p)))
    z = -d
    y = Vector((0, 0, 1)) - z * z.z
    y.normalize()
    x = y.cross(z)
    if roll:
        c, s = math.cos(math.radians(roll)), math.sin(math.radians(roll))
        x, y = x * c + y * s, y * c - x * s
    rot = Matrix((x, y, z)).transposed()
    m = rot.to_4x4()
    m.translation = chest.P(*feed) - rot @ FEED
    return m


class RifleTrack:
    def __init__(self, mats):
        self.keys = [(Warp(t), mats[name]) for t, name in RIFLE_KEYS]

    def Base(self, t):
        keys = self.keys
        if t <= keys[0][0]:
            return keys[0][1].copy()
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if t <= t1:
                e = 1.0 if t1 == t0 else Ease((t - t0) / (t1 - t0))
                q = a.to_quaternion().slerp(b.to_quaternion(), e)
                m = q.to_matrix().to_4x4()
                m.translation = a.translation.lerp(b.translation, e)
                return m
        return keys[-1][1].copy()

    def Blend(self, t):
        """0 = 在原件端枪位，1 = 在装弹位（和枪位置同样的 smootherstep）。"""
        keys = self.keys
        val = {"A": 0.0, "B": 1.0}
        if t <= keys[0][0]:
            return 0.0
        for (t0, a), (t1, b), (na, nb) in zip(keys, keys[1:], zip(RIFLE_KEYS, RIFLE_KEYS[1:])):
            if t <= t1:
                e = 1.0 if t1 == t0 else Ease((t - t0) / (t1 - t0))
                va, vb = val[na[1]], val[nb[1]]
                return va + (vb - va) * e
        return val[RIFLE_KEYS[-1][1]]

    def M(self, t):
        m = self.Base(t)
        local = Vector((0, 0, 0))
        dpitch = 0.0
        for tc, sig, vec, dp in BUMPS:
            w = math.exp(-((t - Warp(tc)) / sig) ** 2)
            local += Vector(vec) * w
            dpitch += dp * w
        if dpitch:
            rot = Matrix.Rotation(math.radians(dpitch), 4, m.to_3x3() @ Vector((1, 0, 0)))
            tr = m.translation.copy()
            m = rot @ m
            m.translation = tr
        m.translation = m @ local
        return m


# ----------------------------------------------------------------------------- IK
def PickPoleAngle(arm, tip_bone, root_bone, frame, target_pos, pole_pos):
    K.At(frame)
    target, pole_obj = K._Empty("IKtest"), K._Empty("PoleTest", pole_pos)
    target.location = target_pos
    tip = arm.pose.bones[tip_bone]
    ik = tip.constraints.new("IK")
    ik.target, ik.chain_count, ik.pole_target = target, 2, pole_obj
    root = K.BoneHead(arm, root_bone)
    best = (-2, None)
    for ang in (-180, -135, -90, -45, 0, 45, 90, 135):
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


def PoleMatch(arm, tip_bone, root_bone, target_pos, pole_pos, ref_mid):
    """扫极点角度，挑让中间关节（肘/膝）最贴近原件位置的那个（第 1 帧、目标 = 原件的腕/踝）。"""
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


def KeyInfluence(constraint, f):
    constraint.influence = Influence(Tm(f))
    constraint.keyframe_insert("influence", frame=f)


def LimbIk(arm, tip_bone, tail_bone, wrist_keys, quat_keys, pole_keys, pole_angle, tag):
    """tip_bone：IK 末端所在骨（前臂/小腿）；tail_bone：之后要拷贝朝向的骨（手/脚）。逐帧目标/极点/influence。"""
    target = K._Empty(f"IK_{tag}")
    target.rotation_mode = "QUATERNION"
    pole_obj = K._Empty(f"Pole_{tag}")
    prev = None
    for f in range(1, N + 1):
        target.location = wrist_keys[f]
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
    for f in range(1, N + 1):
        KeyInfluence(ik, f)
        KeyInfluence(rot, f)
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
    """去掉所有骨头的动画曲线（之后设成第 1 帧的值）。"""
    slot = arm.animation_data.action_slot
    cb = arm.animation_data.action.layers[0].strips[0].channelbag(slot)
    n = 0
    for fc in list(cb.fcurves):
        if fc.data_path.startswith("pose.bones"):
            cb.fcurves.remove(fc)
            n += 1
    return n


# ----------------------------------------------------------------------------- 手指
def FingerQuats(preset, neutral, side="Right"):
    if preset == "grip":
        return {b: neutral[b][1].copy() for b in neutral
                if b.startswith(f"{side}Hand") and b[len(side) + 4:].startswith(("Thumb", "Index", "Middle", "Ring", "Pinky"))}
    spec = FINGER_PRESETS[preset]
    out = {}
    for fn in ("Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            out[f"{side}Hand{fn}{i + 1}"] = Quaternion((1, 0, 0), math.radians(spec[fn][i]))
    for i in range(3):
        x, z = spec["Thumb"][i]
        out[f"{side}HandThumb{i + 1}"] = Quaternion((0, 0, 1), math.radians(z)) @ Quaternion((1, 0, 0), math.radians(x))
    return out


def ThumbTipLocal(arm, quats):
    for b, q in quats.items():
        arm.pose.bones[b].rotation_quaternion = q
    bpy.context.view_layer.update()
    hand = K.BoneMatrix(arm, "RightHand")
    tip = arm.matrix_world @ arm.pose.bones["RightHandThumb3"].tail
    return R3(hand).inverted() @ (tip - K.BoneHead(arm, "RightHand"))


# 手型切换事件（设计时间，开始, 结束, 变到哪个手型）：每次切换都 >= 0.2 s（约 6 帧），smootherstep 缓入缓出，
# 单指骨每帧转角 <= 25 度。grip = 原件握把的手型；ready = 握和张开之间一半（去够拉柄时手半张）；open = 张开；clip = 捏夹。
FINGER_EVENTS = [
    (0.74, 0.94, "ready"),     # 手离开握把，半张着去够拉柄
    (0.96, 1.18, "grip"),      # 到拉柄，握住球头（上翻中握紧）
    (1.56, 1.80, "open"),      # 拉栓到底，松手
    (2.08, 2.32, "clip"),      # 在子弹盒处捏住桥夹
    (2.78, 3.00, "grip"),      # 夹插进槽后，握手姿势罩在机匣右侧（压弹）
    (3.40, 3.64, "open"),      # 压完松手
    (3.94, 4.18, "grip"),      # 回到拉柄握住
    (4.58, 4.82, "open"),      # 栓下压锁住，松手
    (5.00, 5.24, "grip"),      # 回握把
]


def FingerTimeline():
    keys, cur = [(0.0, "grip")], "grip"
    for ts, te, name in FINGER_EVENTS:
        keys += [(Warp(ts), cur), (Warp(te), name)]
        cur = name
    keys.append((Warp(100.0), cur))
    return keys


def FingerPose(keys, t, presets):
    names = list(presets["open"].keys())              # 三种手型共有的指骨（grip 里还带着 Thumb4 等末端骨，不动它）
    if t <= keys[0][0]:
        return {k_: presets[keys[0][1]][k_].copy() for k_ in names}
    for (t0, a), (t1, b) in zip(keys, keys[1:]):
        if t <= t1:
            if a == b:
                return {k_: presets[a][k_].copy() for k_ in names}
            e = 1.0 if t1 <= t0 else Ease((t - t0) / (t1 - t0))
            return {k_: presets[a][k_].slerp(presets[b][k_], e) for k_ in names}
    return {k_: presets[keys[-1][1]][k_].copy() for k_ in names}


def OriKeys(rkeys, t):
    ok = [k for k in rkeys if not k.get("oskip")]
    i = 0
    while i + 1 < len(ok) and ok[i + 1]["t"] <= t + 1e-9:
        i += 1
    return ok[i], ok[min(i + 1, len(ok) - 1)]


def InteriorAngle(a, b, c):
    """在 b 处 a-b-c 的夹角（度）。"""
    u, v = (a - b).normalized(), (c - b).normalized()
    return math.degrees(math.acos(max(-1.0, min(1.0, u.dot(v)))))


def HeadPitchDeg(arm, frame):
    """头骨头（世界）前倾角：头上轴在其朝向竖直面内偏离竖直的角度，低头为正。"""
    K.At(frame)
    m = R3(K.BoneMatrix(arm, "Head"))
    up, fwd = m.col[1], m.col[2]
    fh = Vector((fwd.x, fwd.y, 0)).normalized()
    return math.degrees(math.atan2(up.dot(fh), up.z))


def SegDist(p, a, b):
    """点 p 到线段 ab 的距离。"""
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


# ----------------------------------------------------------------------------- 主流程
def Main():
    global LOG_PATH, neutral_hips_z
    os.makedirs(K.AUTHORED, exist_ok=True)
    LOG_PATH = os.path.join(K.AUTHORED, NAME + ".log.txt")
    open(LOG_PATH, "w").close()
    arm = K.LoadBase(BASE, frame_end=N)
    log(f"base {BASE}, frames 1..{N}")
    K.At(1)
    hips = Body(arm, "Hips")
    chest = Body(arm, "Spine2")
    log(f"hips fwd {Fmt(hips.f)}  chest fwd {Fmt(chest.f)} chest origin {Fmt(chest.o)}")

    # --- 第 1 帧基准
    neutral = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones}
    M0b = K.RifleFrame(arm, 1)
    R0b = M0b.to_3x3()
    palmL1 = K.Palm(arm, "Left", 1)
    left_w = M0b.inverted() @ palmL1                     # 左手掌心在枪坐标里的位置（= (0,0,-0.286)）
    log(f"left palm in weapon frame {Fmt(left_w)}")
    info = {}
    for side in ("Right", "Left"):
        q0, lf, ln, la = HandBasis(arm, side, 1)
        v_loc = q0.inverted() @ (K.Palm(arm, side, 1) - K.BoneHead(arm, f"{side}Hand", 1))
        info[side] = dict(q0=q0, basis=(lf, ln, la), v_loc=v_loc, rel=R0b.inverted() @ q0)
    # 脚、膝、髋的基准（IK 钉住）
    foot0 = {s: (K.BoneHead(arm, f"{s}Foot", 1), R3(K.BoneMatrix(arm, f"{s}Foot", 1))) for s in ("Left", "Right")}
    knee0 = {s: K.BoneHead(arm, f"{s}Leg", 1) for s in ("Left", "Right")}
    hip0 = {s: K.BoneHead(arm, f"{s}UpLeg", 1) for s in ("Left", "Right")}
    sho0 = {s: K.BoneHead(arm, f"{s}Arm", 1) for s in ("Left", "Right")}
    head_pitch0 = HeadPitchDeg(arm, 1)
    neutral_hips_z = K.BoneHead(arm, "Hips", 1).z

    # --- 拇指尖偏移（FK），各预设
    right_f = {name: FingerQuats(name, neutral) for name in ("grip", "open", "clip")}
    right_f["ready"] = {b: right_f["grip"][b].slerp(right_f["open"][b], 0.55) for b in right_f["open"]}
    thumb_tip = {name: ThumbTipLocal(arm, q) for name, q in right_f.items()}
    for b, q in right_f["grip"].items():
        arm.pose.bones[b].rotation_quaternion = q

    # --- 压平：全部骨头锁成第 1 帧
    removed = Flatten(arm)
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion = neutral[pb.name][0].copy(), neutral[pb.name][1].copy()
    bpy.context.view_layer.update()
    log(f"flattened {removed} fcurves")

    # --- 躯干 / 头 / 右肩 / 髋关键帧
    def KeyBody():
        chest_b = (("Spine", 0.35), ("Spine1", 0.35), ("Spine2", 0.30))
        head_b = (("Neck", 0.35), ("Head", 0.65))
        for t, pose in BODY_KEYS:
            cp, cy, cr, hp, hy, hr, sb, hdrop, hback = BODY_POSES[pose]
            f = round(Fr(Warp(t)))
            for (name, share) in chest_b:
                d = Quaternion((1, 0, 0), math.radians(cp * share)) @ Quaternion((0, 1, 0), math.radians(cy * share)) \
                    @ Quaternion((0, 0, 1), math.radians(-cr * share))
                pb = arm.pose.bones[name]
                pb.rotation_quaternion = neutral[name][1] @ d
                pb.keyframe_insert("rotation_quaternion", frame=f)
            for (name, share) in head_b:
                d = Quaternion((1, 0, 0), math.radians(hp * share)) @ Quaternion((0, 1, 0), math.radians(hy * share)) \
                    @ Quaternion((0, 0, 1), math.radians(-hr * share))
                pb = arm.pose.bones[name]
                pb.rotation_quaternion = neutral[name][1] @ d
                pb.keyframe_insert("rotation_quaternion", frame=f)
            pb = arm.pose.bones["RightShoulder"]
            pb.rotation_quaternion = neutral["RightShoulder"][1] @ Quaternion((0, 0, 1), math.radians(sb))
            pb.keyframe_insert("rotation_quaternion", frame=f)

    KeyBody()

    # --- 右手手指关键帧
    hipj = hip0["Right"]
    hipf = hips.Local(hipj)
    pouch_b = (hipf[0] + 0.09, hipf[1] + 0.10, hipj.z + 0.10)        # 腰带前右侧，在右大腿（斜着往前下方到着地的右膝）的上方
    log(f"pouch point (hips right, fwd, z) {Fmt(pouch_b)}; right hip joint {Fmt(hipf)}")
    rkeys = RightKeys(pouch_b)
    for k in rkeys:
        k["t"] = Warp(k["t"])
    # 手型切换：每次握 <-> 张 <-> 捏 <-> 压 的切换至少用 FINGER_MIN_BLEND 秒（>= 5 帧），带缓入缓出；逐帧写手指
    ftimeline = FingerTimeline()
    fq, tip_f = {}, {}
    for f in range(1, N + 1):
        fq[f] = FingerPose(ftimeline, Tm(f), right_f)
        tip_f[f] = ThumbTipLocal(arm, fq[f])
        for b, q in fq[f].items():
            pb = arm.pose.bones[b]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)

    # --- 逐帧目标
    mats = {"A": M0b, "B": RifleMatFeed(chest, **POSE_B)}
    track = RifleTrack(mats)
    frames = range(1, N + 1)
    M = {f: track.M(Tm(f)) for f in frames}

    def RefP(ref, f, p):
        return M[f] @ Vector(p) if ref == "W" else hips.P(*p)

    def RefO(ref, f, o):
        if ref == "W":
            return R3(M[f]) @ OrientMatrix(info["Right"]["basis"], *o)
        return OrientMatrix(info["Right"]["basis"], hips.Dir(*o[0]), hips.Dir(*o[1]))

    wr_keys, wr_quat, left_keys, left_quat = {}, {}, {}, {}
    for f in frames:
        t = Tm(f)
        qL = R3(M[f]) @ info["Left"]["rel"]
        left_keys[f] = M[f] @ left_w - qL @ info["Left"]["v_loc"]
        left_quat[f] = qL.to_quaternion()
        i = 0
        while i + 1 < len(rkeys) and rkeys[i + 1]["t"] <= t + 1e-9:
            i += 1
        a = rkeys[i]
        b = rkeys[min(i + 1, len(rkeys) - 1)]
        u = 0.0 if b["t"] == a["t"] else Ease((t - a["t"]) / (b["t"] - a["t"]))
        # 朝向：跳过 oskip 的关键帧（避免在它那里一停一走），在剩下的关键帧之间做一整段 smootherstep
        oa, ob = OriKeys(rkeys, t)
        uo = 0.0 if ob["t"] == oa["t"] else Ease((t - oa["t"]) / (ob["t"] - oa["t"]))
        qa = RefO(oa["ref"], f, oa["o"]).to_quaternion()
        qb = RefO(ob["ref"], f, ob["o"]).to_quaternion()
        if qa.dot(qb) < 0:
            qb.negate()
        q = qa.slerp(qb, uo)
        qm = q.to_matrix()
        res = []
        for k in (a, b):
            tip_local = tip_f[f] if k.get("mode") == "thumb" else info["Right"]["v_loc"]
            res.append(RefP(k["ref"], f, k["p"]) - qm @ tip_local)
        wr_keys[f] = res[0].lerp(res[1], u)
        wr_quat[f] = q

    # 极点：枪在原件端枪位时沿用原件的肘方向（IK 才和原件姿势重合），枪移到装弹位的过程中过渡到设计方向（右肘朝外下后，左肘朝下略向后）
    el0 = {s_: K.BoneHead(arm, f"{s_}ForeArm", 1) for s_ in ("Left", "Right")}
    wr0 = {s_: K.BoneHead(arm, f"{s_}Hand", 1) for s_ in ("Left", "Right")}
    dir0 = {s_: (el0[s_] - (sho0[s_] + wr0[s_]) * 0.5).normalized() for s_ in ("Left", "Right")}
    design = {"Right": hips.Dir(0.6, -0.3, -0.6).normalized(), "Left": hips.Dir(-0.2, -0.3, -0.9).normalized()}
    pole_r, pole_l = {}, {}
    for f in frames:
        w = track.Blend(Tm(f))
        pole_r[f] = (sho0["Right"] + wr_keys[f]) * 0.5 + (dir0["Right"] * (1 - w) + design["Right"] * w).normalized() * 0.5
        pole_l[f] = (sho0["Left"] + left_keys[f]) * 0.5 + (dir0["Left"] * (1 - w) + design["Left"] * w).normalized() * 0.5
    ang_r = PoleMatch(arm, "RightForeArm", "RightArm", wr0["Right"], (sho0["Right"] + wr0["Right"]) * 0.5 + dir0["Right"] * 0.5, el0["Right"])
    ang_l = PoleMatch(arm, "LeftForeArm", "LeftArm", wr0["Left"], (sho0["Left"] + wr0["Left"]) * 0.5 + dir0["Left"] * 0.5, el0["Left"])
    objs = []
    objs += LimbIk(arm, "RightForeArm", "RightHand", wr_keys, wr_quat, pole_r, ang_r, "R")
    objs += LimbIk(arm, "LeftForeArm", "LeftHand", left_keys, left_quat, pole_l, ang_l, "L")
    # 腿和髋不碰：整条锁成原件第 1 帧的值（Flatten 之后没有曲线），着地的右膝/右脚尖/左脚逐帧不动
    bones = [f"{s_}{b}" for s_ in ("Left", "Right") for b in ("Arm", "ForeArm", "Hand")]
    K._BakeBones(arm, bones, 1, N)
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    Trim(arm, 1, N)
    # IK 影响为 0 的帧（头尾两段）把双臂写回原件第 1 帧的值，保证首尾逐帧等于 base
    for f in frames:
        if Influence(Tm(f)) <= 0.0:
            for b in bones:
                pb = arm.pose.bones[b]
                pb.rotation_quaternion = neutral[b][1].copy()
                pb.location = neutral[b][0].copy()
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.keyframe_insert("location", frame=f)
    K.At(1)

    # --- 检查
    errs = {"R": [], "L": []}
    for f in frames:
        K.At(f)
        errs["R"].append((K.BoneHead(arm, "RightHand") - wr_keys[f]).length * Influence(Tm(f)))
        errs["L"].append((K.BoneHead(arm, "LeftHand") - left_keys[f]).length * Influence(Tm(f)))
    for s in ("R", "L"):
        worst = max(range(len(errs[s])), key=lambda i: errs[s][i])
        log(f"IK wrist error (influence-weighted) {s}: max {errs[s][worst] * 100:.2f} cm at {Tm(worst + 1):.2f}s")

    # 起止与原件第 1 帧逐骨比较
    for f in (1, N):
        K.At(f)
        worst = 0.0
        for pb in arm.pose.bones:
            q0 = neutral[pb.name][1]
            d = math.degrees(2 * math.acos(min(1.0, abs(pb.rotation_quaternion.dot(q0)))))
            worst = max(worst, d)
        for pb in arm.pose.bones:
            d = math.degrees(2 * math.acos(min(1.0, abs(pb.rotation_quaternion.dot(neutral[pb.name][1])))))
            if d > 0.05:
                log(f"   frame {f}: {pb.name} differs {d:.3f} deg")
        loc = (arm.pose.bones["Hips"].location - neutral["Hips"][0]).length
        log(f"frame {f} vs base frame 1: max bone rotation difference {worst:.3f} deg, hips location diff {loc:.4f} cm")

    for bone in ("RightArm", "RightForeArm", "RightHand", "LeftArm", "LeftForeArm", "LeftHand", "LeftLeg", "RightLeg", "LeftUpLeg", "RightUpLeg"):
        prev, worst, wf = None, 0.0, 1
        for f in frames:
            K.At(f)
            q = arm.pose.bones[bone].rotation_quaternion.copy()
            if prev is not None:
                ang = math.degrees(2 * math.acos(min(1.0, abs(q.dot(prev)))))
                if ang > worst:
                    worst, wf = ang, f
            prev = q
        log(f"max joint step {bone}: {worst:.1f} deg/frame at {Tm(wf):.2f}s")

    # --- 报告所需的逐帧量
    m0 = K.RifleFrame(arm, 1)
    pin = K.BoneMatrix(arm, "LeftHand", 1).inverted() @ m0
    rows = []
    thigh_r, torso_r = 0.095, 0.13                       # 大腿 / 躯干胶囊半径的估计（米）
    for f in frames:
        K.At(f)
        m = K.BoneMatrix(arm, "LeftHand") @ pin
        mi = m.inverted()
        tip = arm.matrix_world @ arm.pose.bones["RightHandThumb3"].tail
        feed_w = m @ FEED
        s2 = K.BoneHead(arm, "Spine2")
        s2m = R3(K.BoneMatrix(arm, "Spine2"))
        cf = Vector((s2m.col[2].x, s2m.col[2].y, 0)).normalized()
        axis = (K.BoneHead(arm, "Neck") - K.BoneHead(arm, "Spine")).normalized()
        n = (cf - axis * cf.dot(axis)).normalized()
        sternum = s2 + n * 0.10                           # 胸骨：Spine2 往胸前法线方向 10 cm
        # 枪（从枪托到枪口，带弹仓的下沿）到躯干、大腿的最近距离（3D，扣掉半径）
        torso_pts = [K.BoneHead(arm, nm) for nm in ("Hips", "Spine", "Spine1", "Spine2", "Neck")]
        legs = {s_: (K.BoneHead(arm, f"{s_}UpLeg"), K.BoneHead(arm, f"{s_}Leg")) for s_ in ("Left", "Right")}
        c_torso, c_thigh = 9.0, {"Left": 9.0, "Right": 9.0}
        for zz in [0.28 - 0.04 * i for i in range(0, 29)]:
            for yy in (0.0, -0.06):
                pt = m @ Vector((0, yy, zz))
                for a_, b_ in zip(torso_pts, torso_pts[1:]):
                    c_torso = min(c_torso, SegDist(pt, a_, b_) - torso_r)
                for s_, (a_, b_) in legs.items():
                    c_thigh[s_] = min(c_thigh[s_], SegDist(pt, a_, b_) - thigh_r)
        hm = R3(K.BoneMatrix(arm, "Head"))
        eye = K.BoneHead(arm, "Head") + hm.col[1] * 0.09 + hm.col[2] * 0.07
        gaze = hm.col[2]
        to_feed = (feed_w - eye).normalized()
        row = {
            "f": f, "t": round(Tm(f), 3),
            "rifle_to_torso_clear_cm": round(c_torso * 100, 1),
            "rifle_to_thigh_clear_cm": {k_: round(v_ * 100, 1) for k_, v_ in c_thigh.items()},
            "thumbTip_in_weapon_minus_feed_cm": [round(x * 100, 1) for x in (mi @ tip - FEED)],
            "Rpalm_to_feed_cm": round((K.Palm(arm, "Right") - feed_w).length * 100, 1),
            "thumbTip_to_feed_cm": round((tip - feed_w).length * 100, 1),
            "Rpalm_to_pouch_cm": round((K.Palm(arm, "Right") - hips.P(*pouch_b)).length * 100, 1),
            "Rpalm_to_rightHipJoint_cm": round((K.Palm(arm, "Right") - K.BoneHead(arm, "RightUpLeg")).length * 100, 1),
            "feed_world_z_m": round(feed_w.z, 3),
            "feed_to_Spine2_horizontal_cm": round(math.hypot(feed_w.x - s2.x, feed_w.y - s2.y) * 100, 1),
            "feed_to_sternum_horizontal_cm": round(math.hypot(feed_w.x - sternum.x, feed_w.y - sternum.y) * 100, 1),
            "feed_ahead_of_sternum_along_chest_fwd_cm": round(((feed_w - sternum).dot(cf)) * 100, 1),
            "leftElbow_interior_deg": round(InteriorAngle(K.BoneHead(arm, "LeftArm"), K.BoneHead(arm, "LeftForeArm"), K.BoneHead(arm, "LeftHand")), 1),
            "rightElbow_interior_deg": round(InteriorAngle(K.BoneHead(arm, "RightArm"), K.BoneHead(arm, "RightForeArm"), K.BoneHead(arm, "RightHand")), 1),
            "headPitchDown_deg": round(HeadPitchDeg(arm, f) - head_pitch0, 1),
            "headPitchDown_abs_deg": round(HeadPitchDeg(arm, f), 1),
            "head_gaze_to_feed_deg": round(math.degrees(math.acos(max(-1.0, min(1.0, gaze.dot(to_feed))))), 1),
            "feed_to_eye_cm": round((feed_w - eye).length * 100, 1),
        }
        rows.append(row)
    press1, press2 = round(Fr(Warp(3.16))), round(Fr(Warp(3.40)))
    for tag, f in (("press1", press1), ("press2", press2)):
        r = rows[f - 1]
        log(f"{tag} t={r['t']}: feedMouth world z {r['feed_world_z_m']} m, to sternum horizontal {r['feed_to_sternum_horizontal_cm']} cm "
            f"(to Spine2 axis {r['feed_to_Spine2_horizontal_cm']} cm), left elbow {r['leftElbow_interior_deg']} deg, "
            f"right elbow {r['rightElbow_interior_deg']} deg, head pitch down +{r['headPitchDown_deg']} deg (abs {r['headPitchDown_abs_deg']}), "
            f"gaze-to-feed {r['head_gaze_to_feed_deg']} deg, eye-to-feed {r['feed_to_eye_cm']} cm")
    log("insert/press table (every 0.1 s): t | palm->feedMouth cm | thumb tip->feedMouth cm | thumb tip height above feed cm | thumb tip dx,dz cm")
    for k in range(0, 10):
        tt = round(3.0 + 0.1 * k, 1)
        r = rows[round(Fr(tt)) - 1]
        v = r["thumbTip_in_weapon_minus_feed_cm"]
        log(f"   {tt:.1f} | {r['Rpalm_to_feed_cm']:5.1f} | {r['thumbTip_to_feed_cm']:5.1f} | {v[1]:5.1f} | {v[0]:4.1f},{v[2]:4.1f}")
    inner = [r for r in rows if 1.0 <= r["t"] <= 5.2]
    log(f"rifle closest to torso capsule (r={torso_r}) while loading: {min(r['rifle_to_torso_clear_cm'] for r in inner)} cm clear (negative = inside)")
    for s_ in ("Left", "Right"):
        log(f"rifle closest to {s_} thigh capsule (r={thigh_r}) while loading: {min(r['rifle_to_thigh_clear_cm'][s_] for r in inner)} cm clear")
    log(f"left elbow interior angle range {min(r['leftElbow_interior_deg'] for r in rows)}..{max(r['leftElbow_interior_deg'] for r in rows)} deg")
    log(f"head pitch down (abs) max {max(r['headPitchDown_abs_deg'] for r in rows)} deg; delta vs base max {max(r['headPitchDown_deg'] for r in rows)}")
    pr_ = [r['head_gaze_to_feed_deg'] for r in rows if 3.0 <= r['t'] <= 3.8]
    log(f"head gaze-to-feed during press {min(pr_)}..{max(pr_)} deg")

    # 着地点漂移（右膝、右脚尖、左脚、双踝）和手速、左手相对枪的变化
    K.At(1)
    p0 = {nm: K.BoneHead(arm, nm) for nm in ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "RightLeg", "LeftLeg", "Hips")}
    drift = {nm: 0.0 for nm in p0}
    dL, prev_p, maxstep = [], None, (0.0, 1)
    for f in frames:
        K.At(f)
        for nm, p_ in p0.items():
            drift[nm] = max(drift[nm], (K.BoneHead(arm, nm) - p_).length)
        pr = K.Palm(arm, "Right")
        if prev_p is not None and (pr - prev_p).length > maxstep[0]:
            maxstep = ((pr - prev_p).length, f)
        prev_p = pr
        dL.append((K.Palm(arm, "Left") - (K.BoneMatrix(arm, "LeftHand") @ pin) @ Vector(R["gripL"])).length)
    log("foot / knee / hips drift max (cm): " + ", ".join(f"{nm} {v * 100:.2f}" for nm, v in drift.items()))
    log(f"right palm max step {maxstep[0] * 100:.1f} cm/frame at {Tm(maxstep[1]):.2f}s ({maxstep[0] * FPS:.2f} m/s); "
        f"left palm to gripL varies {min(dL) * 100:.2f}..{max(dL) * 100:.2f} cm (abs {min(dL) * 100:.1f})")

    # --- 报告与导出
    timings = {k: ([round(Warp(x), 2) for x in v] if isinstance(v, list) else round(Warp(v), 2)) for k, v in {
        "start": 0.0, "lower": [0.15, 0.75], "toKnob": [0.80, 0.98], "unlockUp": [1.05, 1.30], "pullBack": [1.30, 1.52],
        "boltOpen": 1.64, "toPouch": [1.64, 2.10], "takeClip": [2.10, 2.38], "toFeed": [2.38, 2.80], "insert": [2.80, 2.98],
        "thumbPress1": 3.16, "thumbPress2": 3.40, "releaseClip": 3.58, "backToKnob": [3.58, 4.02],
        "pushForward": [4.02, 4.26], "lockDown": [4.26, 4.50], "toGrip": [4.66, 5.02], "raise": [4.95, 5.52],
    }.items()}
    timings["end"] = round(DURATION, 2)
    extra = {"timings": timings, "mine": rows}
    meta = {
        "base": BASE, "label": "跪姿压桥夹装弹", "loop": False, "duration": round(DURATION, 3), "timings": timings,
        "note": "中正式/三八式转栓式桥夹装弹（不是汉阳造）；预览只有枪，没有桥夹和子弹；单次动作，首尾等于 RifleKneelIdle_V1 第 1 帧。"
                "单膝（右膝）跪姿；装弹时枪收近身体：机匣在胸骨前约 28 cm、高约 0.64 m，枪口斜指左前上约 32 度，左手弯肘托枪；髋和双腿整条不动。",
    }
    K.Export(arm, NAME, meta)
    K.Report(arm, NAME, rifle=RIFLE, rifle_frame=1, extra=extra)


neutral_hips_z = 0.0

if __name__ == "__main__":
    Main()

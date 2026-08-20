# -*- coding: utf-8 -*-
"""武器模型。

规范坐标系与 Script_Actor.BuildWeaponGeometry 完全一致：
  **右手握把 = 原点、枪管沿 -Z、膛线轴在 y = +0.035、枪托底板在 z = +0.255**。
换枪只换一个 Group，据枪姿势 / 枪口位置 / 拉栓点都不用跟着改。

全长是史实数据（见 Data_Weapons.mjs），**不许为了好看改**，也不许跟着人物身高缩放。
每支枪带五个挂点空节点：muzzle / gripR / gripL / sight / magazine。
近战与投掷物（大刀、手榴弹）只有 muzzle / gripR (/ gripL)。

近景武器三角预算 ≤ 6000/把。第一人称枪械是屏幕主角，不再沿用远景道具预算。

--- 两条在第 2 轮视觉审查里补上的硬规矩 -----------------------------------

**一、零件之间只准「插进去」，不准「刚好挨着」，更不准「差一点」。**
  这里的每个零件都是一个独立的闭合网格，谁也不知道邻居在哪，靠的全是写坐标
  时脑子里对齐。三种错法各有各的丑：
    · 差一点（负重叠）—— 零件飘着。捷克式的握把悬在机匣下方 14 mm，
      三八式扳机正下方 30 mm 见地，大刀的刀身、护手、刀柄是三段各飘各的。
    · 刚好挨着（重叠 0）—— 两张共面的皮在深度上打架，转起来一闪一闪，
      用户说的"面穿透"有一半是这个。中正式的枪管起点正好压在机匣前脸上。
    · 插进去（重叠 ≥ 3 mm）—— 唯一正确的做法。**内部的面被外壳挡住，
      一个像素都画不出来，不花钱。**
  TzmCore.AuditSolid 在构建期逐块查，武器是硬失败（BuildAll 会退出码 1）。
  包围盒判据抓不到"细长零件插在另一个细长零件的包围盒里但没真碰上"这一类，
  所以写坐标时该算的还是要算 —— 自检是网，不是替代品。

**二、贴图格距走 GUN_TILE，不走建筑那一套。**
  枪只有房子的十分之一大。用 wood=1.0 m 的格距，一支步枪的枪托横着只吃到
  贴图的 4%，木纹的年轮带被拉成横跨整个托身的黑橙虎斑 —— 这就是"还不如
  纯色不给贴图"。数值与第一人称视图模型的 VM_TILE 对齐，见 TzmCore.GUN_TILE。
"""

import math

from TzmCore import BooleanDifference, Box, Join, Lathe, Loft, Node, RibbonYz, Ring, Transform, TubeY

PI = math.pi
BORE = 0.035          # 膛线轴高
BUTT_Z = 0.255        # 右手握把到枪托底板
SEG = 16              # 第一人称枪管/护圈：8 段在近景会明显折面，16 段仍很轻
# 贴图格距名（**不是材质名**）。材质名照旧是 steel / wood / accessory / red ——
# 那是加载器去材质表里取材质的键，白名单在 TzmCore.MATERIAL_NAMES 里。
# 这三个只喂给 Add(tile=...)，见抬头第二条。
T_STEEL = "gunSteel"
T_WOOD = "gunWood"
T_CLOTH = "gunCloth"


def LoftZ(rings, segments=SEG, **kwargs):
    """沿 -Z 放样。传进来的 ring["y"] 直接写目标 z 坐标，**从枪托往枪口排**
    （z 递减）；ring 的 rx 是横向半宽、rz 是竖向半高、cz 是竖向偏移。

    实现是「先沿 +Y 放样再绕 X 转 -90°」—— 直接在 Z 上放样要重写一遍绕向判断，
    转一次省掉一整套「这块面从里面看才有」的调试。
    """
    flipped = [dict(r, y=-r["y"]) for r in rings]
    bm = Loft(flipped, segments, **kwargs)
    Transform(bm, rx=-PI * 0.5)
    return bm


def TubeAlongZ(z0, z1, r0, r1, segments=SEG, power=2.0, cap=True, smooth=True, y=BORE):
    """一段沿 -Z 的管：枪管、套筒、驻退筒。z0 靠枪托、z1 靠枪口。"""
    return LoftZ([Ring(z0, r=r0, power=power, cz=y), Ring(z1, r=r1, power=power, cz=y)],
                 segments, capStart=cap, capEnd=cap, smooth=smooth)


def Mounts(node, muzzleZ, gripFrontZ, sightZ, magY=-0.02, magZ=-0.06, both=True):
    """挂空节点。视图模型拿 muzzle 出枪焰、拿 gripL 摆左手、拿 sight 对准星，
    人物 IK 拿 gripR/gripL 解两只手。**位置错了不是模型难看，是枪焰飘在空中。**"""
    node.Child("muzzle", t=(0.0, BORE, muzzleZ))
    node.Child("gripR", t=(0.0, 0.0, 0.0))
    if both:
        node.Child("gripL", t=(0.0, -0.012, gripFrontZ))
    if sightZ is not None:
        node.Child("sight", t=(0.0, BORE + 0.020, sightZ))
        node.Child("magazine", t=(0.0, magY, magZ))


# ---------------------------------------------------------------------------
# 通用零件
# ---------------------------------------------------------------------------

def BoltRifleStock(total, foreEnd, comb=1.0):
    """毛瑟式枪托：**一整根木料**，底板 → 托腮 → 握把颈 → 弹仓两侧 → 护木。

    原来是 butt / fore 两段分别放样再 Join：butt 收在 z=+0.020、fore 从 z=-0.010
    起，中间那 30 mm 谁也没有 —— 扳机正下方一个通孔，从侧下方看得见地面。
    真枪的托本来也不是两截接的，握把颈就是同一根木料收细的地方；串成一条放样
    既补上了洞，又省掉两个（本来就看不见的）端盖。

    截面比例逐段变才有枪托的剪影：底板扁而高、托腮收窄、握把颈最细、
    到弹仓两侧再鼓回来、护木收成一条。一根等截面方料是玩具。
    """
    return LoftZ([
        Ring(BUTT_Z, rx=0.020, rz=0.062 * comb, cz=0.008, power=3.4),         # 底板
        Ring(BUTT_Z - 0.030, rx=0.021, rz=0.064 * comb, cz=0.008, power=3.2),
        Ring(BUTT_Z - 0.110, rx=0.021, rz=0.053 * comb, cz=0.012, power=2.8),  # 托腮
        Ring(BUTT_Z - 0.175, rx=0.019, rz=0.040, cz=0.008, power=2.6),
        Ring(BUTT_Z - 0.215, rx=0.0165, rz=0.029, cz=0.001, power=2.4),        # 握把颈（最细）
        Ring(0.005, rx=0.018, rz=0.030, cz=0.004, power=2.6),                  # 扳机后
        Ring(-0.030, rx=0.0225, rz=0.034, cz=0.008, power=2.8),                # 弹仓两侧鼓出
        Ring(-0.105, rx=0.0215, rz=0.029, cz=0.012, power=2.8),
        Ring(foreEnd * 0.60, rx=0.019, rz=0.024, cz=0.016, power=2.8),
        Ring(foreEnd, rx=0.017, rz=0.021, cz=0.018, power=2.8),
    ])


def TriggerGuard(zBack, zFront, yTop, drop=0.026, width=0.011, thick=0.0042):
    """扳机护圈：从托底后端垂下、绕过扳机、再回到托底前端的一条 U 形铁。

    原来这里只有一个 6×20×10 mm 的小方块当扳机，而且**离机匣底面还差 2 mm**
    （构建期自检第一条抓到的）—— 侧影上是"机匣底下挂着一小片铁"。
    护圈是步枪侧影里最认得出的一处轮廓，两端都埋进木托里，接头自然消失。
    """
    points = []
    steps = 7
    zMid, zHalf = (zBack + zFront) * 0.5, (zBack - zFront) * 0.5
    for i in range(steps):
        t = i / (steps - 1.0)
        ang = PI * t
        points.append((yTop - drop * math.sin(ang), zMid + zHalf * math.cos(ang)))
    return RibbonYz(points, width, thick)


def BoltHandle(z, bend=0.55, knob=0.011):
    """拉机柄 + 球头。bend=0 是三八式那种近乎水平的直柄，
    bend≈0.6 是毛瑟式的下折柄 —— 这一处角度是两族步枪的分界。

    柄与球原来朝**相反的两个方向**：柄按 rz=-π/2+bend 折向斜上，球按 −sin(bend)
    摆到了斜下，两者差 54 mm，渲出来是"机匣旁边浮着一颗黑球"。
    正确的那一头是球：毛瑟式叫「下折柄」，本来就该往下。所以改的是柄的转角
    （-π/2 − bend），不是球。柄长同时从 52 收到 48 mm，让球把柄尖吃进去 4 mm。
    """
    arm = TubeY(0.0058, 0.0052, 0.052, 6)
    Transform(arm, y=0.026)
    Transform(arm, rz=-PI * 0.5 - bend)
    Transform(arm, x=0.017, y=BORE + 0.014, z=z)
    ball = Loft([Ring(-knob, r=0.0), Ring(-knob * 0.5, r=knob * 0.86),
                 Ring(knob * 0.5, r=knob * 0.86), Ring(knob, r=0.0)], 6)
    reach = 0.048
    Transform(ball, x=0.017 + reach * math.cos(bend),
              y=BORE + 0.014 - reach * math.sin(bend), z=z)
    return Join(arm, ball)


def LadderSight(z, y=BORE + 0.010):
    """立框式表尺：底座 + 竖起来的标尺板。照门位置直接决定 sight 挂点。
    底座压低 3 mm 让它真骑在枪管上（原来只搭着 1 mm，是共面闪烁的常客）。"""
    base = Box(0.024, 0.012, 0.052, bevel=0.002)
    Transform(base, y=y, z=z)
    leaf = Box(0.019, 0.026, 0.004)
    Transform(leaf, y=y + 0.012, z=z + 0.020, rx=-0.22)
    return Join(base, leaf)


def FrontSight(z, hooded=False):
    """准星座（+ 三八式那种护翼）。座子要坐进枪管里 4 mm，别停在管壁上。"""
    post = Box(0.004, 0.016, 0.006)
    Transform(post, y=BORE + 0.010, z=z)
    band = LoftZ([Ring(z + 0.012, rx=0.011, rz=0.011, cz=BORE, power=2.0),
                  Ring(z - 0.012, rx=0.011, rz=0.011, cz=BORE, power=2.0)],
                 6, capStart=False, capEnd=False, smooth=False)
    parts = [post, band]
    if hooded:
        for s in (-1, 1):
            wing = Box(0.003, 0.020, 0.008)
            Transform(wing, x=s * 0.008, y=BORE + 0.014, z=z)
            parts.append(wing)
    return Join(*parts)


def SlingSwivels(places):
    """背带环。places 是 [(z, y), ...] —— **y 必须逐个给**：枪托底面是条曲线，
    前环在护木下面（y≈-0.01）、后环在托腹下面（y≈-0.045），拿同一个 y 摆两处，
    一处会整个埋进木头里看不见、另一处会悬空 4 mm。"""
    parts = []
    for z, y in places:
        ring = Lathe([(0.006, 0.0), (0.009, 0.0), (0.009, 0.003), (0.006, 0.003)],
                     6, smooth=False, closed=True)
        Transform(ring, rz=PI * 0.5)
        Transform(ring, y=y, z=z)
        parts.append(ring)
    return Join(*parts)


def FloorPlate(z, depth=0.076, y=-0.024):
    """弹仓底板。毛瑟式是**内置弹仓**，从外面只看得见托腹下这一片铁 ——
    原来那个 28×30×78 的弹仓盒整个埋在木托里，一个像素都露不出来，
    白扛 12 个三角。"""
    plate = Box(0.026, 0.010, depth, bevel=0.002)
    Transform(plate, y=y, z=z)
    return plate


# ---------------------------------------------------------------------------
# 中正式 1.110 m
# ---------------------------------------------------------------------------

def BuildZhongZheng():
    total = 1.110
    muzzleZ = -(total - BUTT_Z)
    root = Node("root")
    body = root.Child("body")
    foreEnd = muzzleZ * 0.66

    body.Add("wood", BoltRifleStock(total, foreEnd), tile=T_WOOD)
    # 上护木：毛瑟枪管上半段包一层木，是「不是一根铁棍」的关键。
    # 起点从 -0.185 挪到 -0.140，插进机匣 10 mm，两截木头之间不再断开。
    body.Add("wood", LoftZ([
        Ring(-0.140, rx=0.014, rz=0.010, cz=BORE + 0.012, power=2.6),
        Ring(foreEnd * 0.55, rx=0.013, rz=0.009, cz=BORE + 0.011, power=2.6),
        Ring(foreEnd, rx=0.012, rz=0.008, cz=BORE + 0.010, power=2.6),
    ]), tile=T_WOOD)

    receiver = Box(0.034, 0.048, 0.190, bevel=0.004)
    Transform(receiver, y=BORE - 0.004, z=-0.055)
    body.Add("steel", receiver, tile=T_STEEL)
    # 中正式是 5 发桥夹压入的内置弹仓：外面只有托腹下的一片底板
    body.Add("steel", FloorPlate(-0.055), tile=T_STEEL)
    # 扳机护圈 + 扳机。两端埋进木托 10 mm
    body.Add("steel", TriggerGuard(0.022, -0.042, -0.012), tile=T_STEEL)
    trigger = Box(0.005, 0.018, 0.008)
    Transform(trigger, y=-0.020, z=-0.006)
    body.Add("steel", trigger, tile=T_STEEL)

    # 枪管起点从机匣前脸（-0.150）退到机匣**里面**：共面 = 闪
    body.Add("steel", TubeAlongZ(-0.100, muzzleZ, 0.0088, 0.0074), tile=T_STEEL)
    body.Add("steel", BoltHandle(-0.030, 0.55), tile=T_STEEL)
    body.Add("steel", LadderSight(-0.165), tile=T_STEEL)
    body.Add("steel", FrontSight(muzzleZ + 0.022), tile=T_STEEL)
    # 刺刀座
    lug = Box(0.010, 0.014, 0.036)
    Transform(lug, y=BORE - 0.013, z=muzzleZ + 0.040)
    body.Add("steel", lug, tile=T_STEEL)
    body.Add("steel", SlingSwivels([(foreEnd * 0.7, -0.012), (BUTT_Z - 0.110, -0.045)]), tile=T_STEEL)

    Mounts(body, muzzleZ - 0.008, foreEnd * 0.58, -0.165, magY=BORE - 0.045, magZ=-0.055)
    return root


# ---------------------------------------------------------------------------
# 汉阳造 1.250 m —— 枪管外那层薄套筒是它的剪影特征
# ---------------------------------------------------------------------------

def BuildHanYang():
    total = 1.250
    muzzleZ = -(total - BUTT_Z)
    root = Node("root")
    body = root.Child("body")
    foreEnd = muzzleZ * 0.50

    body.Add("wood", BoltRifleStock(total, foreEnd, comb=0.96), tile=T_WOOD)

    receiver = Box(0.033, 0.046, 0.185, bevel=0.004)
    Transform(receiver, y=BORE - 0.004, z=-0.050)
    body.Add("steel", receiver, tile=T_STEEL)
    # 曼利夏式漏夹弹仓：这一支的弹仓是**真的凸在托腹外面**的（跟毛瑟的内置不同），
    # 但原来摆的位置只露出 1 mm，等于白建。压到露出 8 mm。
    mag = Box(0.030, 0.044, 0.062, bevel=0.003)
    Transform(mag, y=BORE - 0.047, z=-0.040)
    body.Add("steel", mag, tile=T_STEEL)
    body.Add("steel", TriggerGuard(0.024, -0.010, -0.012), tile=T_STEEL)
    trigger = Box(0.005, 0.018, 0.008)
    Transform(trigger, y=-0.020, z=0.004)
    body.Add("steel", trigger, tile=T_STEEL)

    # **枪管套筒**：φ32 的薄壁圆筒一路包到枪口附近。88 式的识别点，
    # 没有它就跟中正式分不出来 —— 而这两把枪在第 31 师是混装的。
    #
    # 注意 z 是**递减**才是往枪口去（枪管沿 -Z）。这里最早写成 muzzleZ - 0.055，
    # 结果套筒跑到枪口前头去了，而且 LoftZ 的环序反了整段面朝里。
    # 全长断言（BuildAll 的 WEAPON_LENGTH）就是为了逮这一类。
    # 起点同样退进机匣里 40 mm。
    body.Add("steel", TubeAlongZ(-0.100, muzzleZ + 0.055, 0.0162, 0.0158, segments=10), tile=T_STEEL)
    # 套筒尽头露出的一小截枪管 + 枪口帽
    body.Add("steel", TubeAlongZ(muzzleZ + 0.075, muzzleZ, 0.0090, 0.0082), tile=T_STEEL)
    capRing = LoftZ([Ring(muzzleZ + 0.062, rx=0.0135, rz=0.0135, cz=BORE),
                     Ring(muzzleZ + 0.040, rx=0.0135, rz=0.0135, cz=BORE)],
                    SEG, capStart=False, capEnd=False, smooth=False)
    body.Add("steel", capRing, tile=T_STEEL)

    body.Add("steel", BoltHandle(-0.026, 0.62), tile=T_STEEL)
    body.Add("steel", LadderSight(-0.160), tile=T_STEEL)
    body.Add("steel", FrontSight(muzzleZ + 0.020), tile=T_STEEL)
    body.Add("steel", SlingSwivels([(foreEnd * 0.8, -0.010), (BUTT_Z - 0.110, -0.044)]), tile=T_STEEL)

    Mounts(body, muzzleZ - 0.008, muzzleZ * 0.42, -0.160, magY=BORE - 0.050, magZ=-0.040)
    return root


# ---------------------------------------------------------------------------
# ZB-26 轻机枪 1.165 m —— 弹匣从上方插、枪管上提把、前段两脚架
# ---------------------------------------------------------------------------

def BuildZb26():
    total = 1.165
    muzzleZ = -(total - BUTT_Z)
    root = Node("root")
    body = root.Child("body")

    # 枪托：轻机枪的托更细更直。末端从 z=+0.060 伸到 +0.010 ——
    # 原来收在 0.060，而机匣后脸在 0.055，中间 5 mm 是空的。
    body.Add("wood", LoftZ([
        Ring(BUTT_Z, rx=0.018, rz=0.048, cz=0.006, power=3.2),
        Ring(BUTT_Z - 0.130, rx=0.019, rz=0.036, cz=0.008, power=2.8),
        Ring(0.010, rx=0.018, rz=0.030, cz=0.006, power=2.6),
    ]), tile=T_WOOD)
    # 握把是**竖着往下伸**的，所以沿 +Y 放样再前倾着装上去。
    # 拿 LoftZ 建的话截面是垂直于枪管的，一根往下走的柱子会被切成一堆斜片。
    #
    # 事故：握把顶原来在 y=-0.012，而机匣底面在 y=+0.002 —— 整根握把悬空 14 mm。
    # 台架侧视图上是"机匣下面飘着一块木头"。顶端抬进机匣里 16 mm。
    grip = Loft([Ring(0.014, rx=0.018, rz=0.021, power=2.6),
                 Ring(-0.032, rx=0.016, rz=0.019, power=2.6),
                 Ring(-0.076, rx=0.014, rz=0.017, power=2.6)], 6)
    Transform(grip, rx=0.30)
    Transform(grip, y=0.0, z=0.012)
    body.Add("wood", grip, tile=T_WOOD)

    receiver = Box(0.040, 0.058, 0.290, bevel=0.005)
    Transform(receiver, y=BORE - 0.008, z=-0.090)
    body.Add("steel", receiver, tile=T_STEEL)
    body.Add("steel", TriggerGuard(0.006, -0.036, 0.004, drop=0.024), tile=T_STEEL)

    # **弹匣从上方插**：20 发直弹匣，微微后倾。这是 ZB-26 一眼可辨的地方，
    # 也是它和布伦（弯弹匣）的分界。弹匣是竖的，所以沿 +Y 放样再装上机匣顶。
    # 匣底原来正好停在机匣顶面上（重叠 1 mm）—— 插进去 30 mm 才是"插着"。
    magazine = Loft([
        Ring(-0.030, rx=0.014, rz=0.026, power=3.4),
        Ring(0.060, rx=0.013, rz=0.024, power=3.4),
        Ring(0.122, rx=0.012, rz=0.022, power=3.4),
    ], 6)
    Transform(magazine, rx=-0.12)
    Transform(magazine, y=BORE + 0.022, z=-0.118)
    body.Add("steel", magazine, tile=T_STEEL)

    # 带散热环的枪管。起点退进机匣 45 mm（原来正好压在机匣前脸上，整支枪从
    # 那里裂成"机匣一团 + 枪管一团"两个互不相连的块）
    barrelRings = []
    for i in range(9):
        t = i / 8.0
        z = -0.190 + (muzzleZ + 0.105 + 0.190) * t
        r = 0.0125 - 0.0028 * t
        barrelRings.append(Ring(z, r=r * (1.30 if i % 2 == 0 else 1.0), cz=BORE))
    body.Add("steel", LoftZ(barrelRings), tile=T_STEEL)
    body.Add("steel", TubeAlongZ(muzzleZ + 0.135, muzzleZ, 0.0105, 0.0125), tile=T_STEEL)

    # 提把：横在枪管上方，抓着换枪管用
    handle = LoftZ([Ring(-0.290, rx=0.010, rz=0.008, cz=BORE + 0.048, power=3.0),
                    Ring(-0.400, rx=0.010, rz=0.008, cz=BORE + 0.048, power=3.0)], 6)
    body.Add("wood", handle, tile=T_WOOD)
    for z in (-0.288, -0.402):
        post = Box(0.010, 0.040, 0.012)
        Transform(post, y=BORE + 0.028, z=z)
        body.Add("steel", post, tile=T_STEEL)

    # 两脚架：架在前段，收起时贴着枪管。这里做成张开的战斗状态。
    # 腿加粗一档（5.5 → 7 mm）—— 原来在 1600×900 上只有 2 px 宽，读成两根铁丝。
    for s in (-1, 1):
        leg = TubeY(0.0070, 0.0050, 0.230, 5)
        Transform(leg, y=-0.115)
        Transform(leg, rz=s * 0.30, rx=-0.16)
        Transform(leg, x=s * 0.012, y=BORE - 0.008, z=muzzleZ + 0.155)
        body.Add("steel", leg, tile=T_STEEL)
    yoke = Box(0.036, 0.020, 0.020, bevel=0.003)
    Transform(yoke, y=BORE - 0.010, z=muzzleZ + 0.155)
    body.Add("steel", yoke, tile=T_STEEL)

    body.Add("steel", LadderSight(-0.205, y=BORE + 0.014), tile=T_STEEL)
    body.Add("steel", FrontSight(muzzleZ + 0.028), tile=T_STEEL)

    Mounts(body, muzzleZ - 0.010, -0.470, -0.205, magY=BORE + 0.120, magZ=-0.118)
    return root


# ---------------------------------------------------------------------------
# 三八式 1.276 m —— 机匣上方的防尘滑盖
# ---------------------------------------------------------------------------

def BuildType38():
    total = 1.276
    muzzleZ = -(total - BUTT_Z)
    root = Node("root")
    body = root.Child("body")
    foreEnd = muzzleZ * 0.70

    # 三八式是二段接木的直托，托腮比毛瑟浅
    body.Add("wood", BoltRifleStock(total, foreEnd, comb=0.88), tile=T_WOOD)
    body.Add("wood", LoftZ([
        Ring(-0.150, rx=0.014, rz=0.010, cz=BORE + 0.012, power=2.6),
        Ring(foreEnd * 0.60, rx=0.013, rz=0.009, cz=BORE + 0.011, power=2.6),
        Ring(foreEnd, rx=0.012, rz=0.008, cz=BORE + 0.010, power=2.6),
    ]), tile=T_WOOD)

    receiver = Box(0.032, 0.046, 0.200, bevel=0.004)
    Transform(receiver, y=BORE - 0.004, z=-0.060)
    body.Add("steel", receiver, tile=T_STEEL)
    body.Add("steel", FloorPlate(-0.060, depth=0.072), tile=T_STEEL)
    body.Add("steel", TriggerGuard(0.020, -0.044, -0.012), tile=T_STEEL)
    trigger = Box(0.005, 0.018, 0.008)
    Transform(trigger, y=-0.020, z=-0.008)
    body.Add("steel", trigger, tile=T_STEEL)

    # **防尘滑盖**：一片带纵向折边的弧形钢板，扣在机匣上方随枪机前后滑。
    # 三八式的独门标志（也是它一拉栓就哗啦响的原因），没有它就是把毛瑟。
    cover = LoftZ([
        Ring(0.028, rx=0.0165, rz=0.0090, cz=BORE + 0.014, power=3.6),
        Ring(-0.030, rx=0.0170, rz=0.0095, cz=BORE + 0.015, power=3.6),
        Ring(-0.130, rx=0.0170, rz=0.0095, cz=BORE + 0.015, power=3.6),
        Ring(-0.158, rx=0.0155, rz=0.0085, cz=BORE + 0.014, power=3.6),
    ], 6, smooth=False)
    body.Add("steel", cover, tile=T_STEEL)

    body.Add("steel", TubeAlongZ(-0.110, muzzleZ, 0.0082, 0.0070), tile=T_STEEL)
    # 三八式的拉机柄近乎水平、球头小
    body.Add("steel", BoltHandle(0.010, 0.10, knob=0.0095), tile=T_STEEL)
    body.Add("steel", LadderSight(-0.185), tile=T_STEEL)
    body.Add("steel", FrontSight(muzzleZ + 0.024, hooded=True), tile=T_STEEL)
    lug = Box(0.010, 0.014, 0.040)
    Transform(lug, y=BORE - 0.013, z=muzzleZ + 0.044)
    body.Add("steel", lug, tile=T_STEEL)
    body.Add("steel", SlingSwivels([(foreEnd * 0.75, -0.012), (BUTT_Z - 0.115, -0.042)]), tile=T_STEEL)

    Mounts(body, muzzleZ - 0.008, foreEnd * 0.62, -0.185, magY=BORE - 0.036, magZ=-0.060)
    return root


# ---------------------------------------------------------------------------
# 驳壳枪（毛瑟 C96）0.288 m
# ---------------------------------------------------------------------------

def BuildMauser96():
    root = Node("root")
    body = root.Child("body")
    muzzleZ = -0.242            # 击锤后端到枪口 = 全长 0.288

    # 扫帚柄握把：这把枪叫「驳壳」就是因为它那个木壳枪盒兼枪托，
    # 握把本身是**圆头的一根扫帚柄**（C96 的绰号就是从这来的）。竖着放样。
    grip = Loft([
        Ring(0.014, rx=0.017, rz=0.021, power=2.4),
        Ring(-0.036, rx=0.019, rz=0.023, power=2.2),
        Ring(-0.076, rx=0.017, rz=0.021, power=2.2),
        Ring(-0.092, rx=0.011, rz=0.014, power=2.2),
    ], 8)
    Transform(grip, rx=0.10)
    Transform(grip, y=0.006, z=0.004)
    body.Add("wood", grip, tile=T_WOOD)

    frame = Box(0.026, 0.042, 0.120, bevel=0.003)
    Transform(frame, y=BORE - 0.008, z=-0.030)
    body.Add("steel", frame, tile=T_STEEL)
    # 固定弹仓在扳机**前方** —— C96 的识别点，摆到握把里就成了勃朗宁。
    # 匣顶抬 4 mm：原来正好顶在节套底面上（重叠 0），那是一条会闪的共面缝。
    mag = Box(0.022, 0.038, 0.042, bevel=0.003)
    Transform(mag, y=BORE - 0.026, z=-0.062)
    body.Add("steel", mag, tile=T_STEEL)
    body.Add("steel", TriggerGuard(-0.004, -0.034, 0.010, drop=0.022, width=0.009), tile=T_STEEL)
    trigger = Box(0.004, 0.014, 0.007)
    Transform(trigger, y=0.000, z=-0.018)
    body.Add("steel", trigger, tile=T_STEEL)

    # **枪管节套**：C96 的枪管不是从机匣前脸直接冒出来的，前面有一段粗的节套。
    # 原来枪管的起点正好落在机匣前脸上（重叠 0），整支枪从那里裂成
    # "机匣一团 + 枪管一团"两个互不相连的块 —— 这是自检报出来的第二条。
    extension = Box(0.020, 0.022, 0.052, bevel=0.002)
    Transform(extension, y=BORE, z=-0.098)
    body.Add("steel", extension, tile=T_STEEL)
    body.Add("steel", TubeAlongZ(-0.090, muzzleZ, 0.0072, 0.0066), tile=T_STEEL)

    # 击锤：原来摆在 z=+0.036，机匣后脸只到 +0.030，靠 1 mm 挂着。
    # 连同后面的枪机尾一起往回压。
    boltTail = LoftZ([Ring(0.038, rx=0.011, rz=0.011, cz=BORE + 0.006, power=2.2),
                      Ring(0.010, rx=0.012, rz=0.012, cz=BORE + 0.006, power=2.2)], 8)
    body.Add("steel", boltTail, tile=T_STEEL)
    hammer = Box(0.008, 0.026, 0.014, bevel=0.002)
    Transform(hammer, y=BORE + 0.022, z=0.030, rx=-0.25)
    body.Add("steel", hammer, tile=T_STEEL)
    body.Add("steel", FrontSight(muzzleZ + 0.014), tile=T_STEEL)
    rear = Box(0.018, 0.014, 0.030, bevel=0.002)
    Transform(rear, y=BORE + 0.012, z=-0.078)
    body.Add("steel", rear, tile=T_STEEL)

    Mounts(body, muzzleZ - 0.006, -0.055, -0.078, magY=BORE - 0.040, magZ=-0.062, both=True)
    return root


# ---------------------------------------------------------------------------
# 木柄手榴弹 0.22 m
# ---------------------------------------------------------------------------

def BuildGrenade():
    """改良后全长 220 mm：弹体 φ58 × 92、木柄 φ29 × 125。
    第 31 师一役用掉三十万余枚，这不是装饰品。"""
    root = Node("root")
    body = root.Child("body")
    # 弹体在 -Z（朝前扔出去的方向），木柄从原点往 +Z。
    # 弹体尾端原来收在 z=-0.083、木柄头到 -0.080，中间空 3 mm ——
    # 台架上是"弹体和柄各飘各的"。现在弹体往回伸到 -0.068，套住柄 12 mm。
    body.Add("steel", LoftZ([
        Ring(-0.068, rx=0.0175, rz=0.0175, power=2.2),     # 收颈：套在木柄上的那一小段
        Ring(-0.083, rx=0.029, rz=0.029, power=2.2),
        Ring(-0.120, rx=0.029, rz=0.029, power=2.2),
        Ring(-0.170, rx=0.028, rz=0.028, power=2.2),
        Ring(-0.175, rx=0.022, rz=0.022, power=2.2),
    ], 10), tile=T_STEEL)
    body.Add("wood", LoftZ([
        Ring(0.045, rx=0.0165, rz=0.0165, power=2.2),      # 柄尾（拉火绳藏在这里）
        Ring(0.036, rx=0.0145, rz=0.0145, power=2.2),
        Ring(-0.080, rx=0.0145, rz=0.0145, power=2.2),
    ], 8), tile=T_WOOD)
    # 柄尾的铁盖
    body.Add("steel", LoftZ([Ring(0.050, rx=0.0170, rz=0.0170, power=2.2),
                           Ring(0.038, rx=0.0170, rz=0.0170, power=2.2)], 8), tile=T_STEEL)
    body.Child("muzzle", t=(0.0, 0.0, -0.175))
    body.Child("gripR", t=(0.0, 0.0, 0.0))
    return root


# ---------------------------------------------------------------------------
# 大刀 0.90 m（参考右侧实物：宽刃、短护手、带孔全茎柄）
# ---------------------------------------------------------------------------

# 外轮廓直接抄参考图右侧那把：(z, 刀背 y, 刃口 y)。刀根窄、前段明显放宽，
# 刃口是一整条外鼓弧；刀背到最后约 90 mm 才下切，刀尖保留一小段钝口。
# 旧版最后收成一个极点，又配 S 护手和外置大铁环，整体更像左侧那把/影视道具，
# 与用户点名的右侧带孔全茎柄不是同一型制。
DADAO_EDGE = [
    # z,      刀背 y,   刃口 y      (刃宽 mm)
    (0.026, 0.010, -0.010),      # 20  刀茎插进吞口与柄
    (-0.012, 0.014, -0.026),     # 40  刀根
    (-0.105, 0.014, -0.032),     # 46
    (-0.215, 0.012, -0.041),     # 53
    (-0.330, 0.008, -0.052),     # 60
    (-0.430, 0.001, -0.064),     # 65
    (-0.515, -0.008, -0.075),    # 67  劈砍重心处最宽
    (-0.565, -0.020, -0.079),    # 59  刀背开始下切
    (-0.602, -0.043, -0.079),    # 36
    (-0.624, -0.060, -0.075),    # 15  保留钝口，不收成剑尖
]

# 刀身半厚（沿 z 与 DADAO_EDGE 一一对应）。5—6 mm 的宽厚背是西北军大刀的特征，
# 往刀尖收到 1 mm。截面用 power=1.7 的超椭圆：接近菱形，上下两头是尖的，
# 于是"下面这条边看得出是开了锋的"——power=3 那种圆角矩形截面渲出来是把铁尺。
DADAO_THICK = [0.0030, 0.0030, 0.0029, 0.0028, 0.0027,
               0.0026, 0.0024, 0.0021, 0.0017, 0.0012]


def BuildDadao():
    """第 29 军带出来、第 31 师照做的大刀。

    按用户参考图右侧那把锁定四处：
      · 柄尾是**全茎柄上的圆孔**，不是另焊一只大铁环；
      · 护手只是一道窄吞口与红色束带，不做左侧那把显眼的 S 形护手；
      · 刀身 40 → 67 mm，前宽后窄，刃线外鼓；
      · 刀背末段斜切，尖端仍有 15 mm 钝口，不收成剑尖。

    这三段（刀身 / 吞口 / 全茎柄）**必须互相插进去**：刀茎穿过吞口一直露到柄尾。
    照这个结构建，接缝自然就没了；
    照"各自摆各自的坐标"建，构建期自检会逐块报"零件飘着"。
    """
    root = Node("root")
    body = root.Child("body")

    # 刀身：把两条边线折算成 Loft 要的 (中心 cz, 半高 rz)。
    # rx 是横向半厚、rz 是竖向半宽 —— LoftZ 转过 -90° 之后 ring 的 z 就是竖直方向。
    blade = []
    for (z, back, edge), thick in zip(DADAO_EDGE, DADAO_THICK):
        half = (back - edge) * 0.5
        mid = (back + edge) * 0.5
        if half < 1e-4:
            blade.append(Ring(z, rx=0.0, rz=0.0, cz=mid))       # 刀尖收成一个极点
        else:
            blade.append(Ring(z, rx=thick, rz=half, cz=mid, power=1.7))
    body.Add("blade", LoftZ(blade, 8, smooth=False), tile=T_STEEL)

    # 刀背棱：沿刀背再压一条略厚的圆棱（半厚 3.6 mm > 刀身的 3.0 mm）。
    # 有了它，刀从侧面看是"背厚刃薄"的楔子；没有它，power=1.7 的菱形截面
    # 会把刀背也削成尖的，读起来是一把双刃剑。到斜切段就收掉，别爬上刀尖。
    spine = []
    rows = list(zip(DADAO_EDGE, DADAO_THICK))[:9]
    for i, ((z, back, _edge), thick) in enumerate(rows):
        # 最后两站把棱收掉：让它在斜切段"化"进刀身，别在刀背上留一道断头的台阶
        fade = 1.0 if i < len(rows) - 2 else (0.55 if i == len(rows) - 2 else 0.15)
        spine.append(Ring(z, rx=thick * 1.2 * fade, rz=0.0055 * fade,
                          cz=back - 0.0045 * fade, power=2.4))
    body.Add("blade", LoftZ(spine, 6, smooth=True), tile=T_STEEL)

    # 右侧实物没有夸张护手，只有一片略宽于刀根的吞口。短、扁、两头圆，
    # 让轮廓保持“民国军用大刀”而不是欧洲剑或左侧那把 S 护手刀。
    collar = Box(0.016, 0.054, 0.018, bevel=0.004)
    Transform(collar, z=0.001)
    body.Add("blade", collar, tile=T_STEEL)

    # 全茎柄：钢茎一直露到柄尾并加宽，末端直接开孔。参考图右侧最醒目的就是这只孔，
    # 不能再用悬在柄外面的 Torus 假装。布尔只做这一刀，洞就是造型本身。
    tang = LoftZ([
        Ring(-0.006, rx=0.0048, rz=0.020, power=3.4),
        Ring(0.090, rx=0.0048, rz=0.021, power=3.4),
        Ring(0.185, rx=0.0048, rz=0.022, power=3.2),
        Ring(0.225, rx=0.0048, rz=0.026, power=2.5),
        Ring(0.270, rx=0.0048, rz=0.022, power=2.2),
    ], 12, smooth=False)
    hole = TubeY(0.010, 0.010, 0.020, 16, cap=True, smooth=True)
    Transform(hole, rz=PI * 0.5, z=0.244)
    body.Add("blade", BooleanDifference(tang, hole), tile=T_STEEL)

    # 两片干净木质握片压在全茎两侧，四周留出 3—4 mm 钢边；末端圆孔完整露出。
    body.Add("grip", LoftZ([
        Ring(0.205, rx=0.0064, rz=0.0175, power=3.2),
        Ring(0.145, rx=0.0066, rz=0.0185, power=3.2),
        Ring(0.075, rx=0.0066, rz=0.0185, power=3.2),
        Ring(0.020, rx=0.0062, rz=0.0170, power=3.2),
    ], 10), tile=T_WOOD)

    # 参考图吞口后是一道窄红束带；它是分色节点，不再在柄尾挂红绸。
    wrap = Box(0.016, 0.044, 0.013, bevel=0.002)
    Transform(wrap, z=0.019)
    body.Add("red", wrap, tile=T_CLOTH)

    # 刀尖：近战判定与第一人称深度预算都读它（见 Script_Viewmodel 的 muzzle）。
    # y 跟着 DADAO_EDGE 的弯度走 —— 刀身沉下去了，尖也就不在轴线上了。
    body.Child("muzzle", t=(0.0, -0.068, -0.624))
    # 双手都退到吞口后面：手位在 z=0 时拳头不能啃进红束带
    body.Child("gripR", t=(0.0, 0.0, 0.030))
    body.Child("gripL", t=(0.0, 0.0, 0.155))
    return root


WEAPON_BUILDERS = {
    "ZhongZheng": BuildZhongZheng,
    "HanYang": BuildHanYang,
    "Zb26": BuildZb26,
    "Type38": BuildType38,
    "Mauser96": BuildMauser96,
    "Grenade": BuildGrenade,
    "Dadao": BuildDadao,
}

# -*- coding: utf-8 -*-
"""武器模型。

规范坐标系与 Script_Actor.BuildWeaponGeometry 完全一致：
  **右手握把 = 原点、枪管沿 -Z、膛线轴在 y = +0.035、枪托底板在 z = +0.255**。
换枪只换一个 Group，据枪姿势 / 枪口位置 / 拉栓点都不用跟着改。

全长是史实数据（见 Data_Weapons.mjs），**不许为了好看改**，也不许跟着人物身高缩放。
每支枪带五个挂点空节点：muzzle / gripR / gripL / sight / magazine。
近战与投掷物（大刀、手榴弹）只有 muzzle / gripR (/ gripL)。

三角预算 ≤ 900/把。
"""

import math

from TzmCore import Box, Join, Lathe, Loft, Node, Ring, Transform, TubeY

PI = math.pi
BORE = 0.035          # 膛线轴高
BUTT_Z = 0.255        # 右手握把到枪托底板
SEG = 8               # 圆截面段数：枪身零件都很细，8 段在屏幕上已经是圆的


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
    """毛瑟式枪托：**底板 / 托腮 / 握把颈 / 护木**四段。
    一根方料是玩具，分段（而且每段截面比例不同）才有枪托的剪影。"""
    butt = LoftZ([
        Ring(BUTT_Z, rx=0.020, rz=0.062 * comb, cz=0.008, power=3.4),        # 底板
        Ring(BUTT_Z - 0.030, rx=0.021, rz=0.064 * comb, cz=0.008, power=3.2),
        Ring(BUTT_Z - 0.110, rx=0.021, rz=0.053 * comb, cz=0.012, power=2.8), # 托腮
        Ring(BUTT_Z - 0.175, rx=0.019, rz=0.040, cz=0.008, power=2.6),
        Ring(BUTT_Z - 0.215, rx=0.017, rz=0.028, cz=0.000, power=2.4),        # 握把颈
        Ring(0.020, rx=0.018, rz=0.030, cz=0.004, power=2.6),
    ])
    fore = LoftZ([
        Ring(-0.010, rx=0.022, rz=0.032, cz=0.008, power=2.8),
        Ring(-0.120, rx=0.021, rz=0.028, cz=0.012, power=2.8),
        Ring(foreEnd * 0.60, rx=0.019, rz=0.024, cz=0.016, power=2.8),
        Ring(foreEnd, rx=0.017, rz=0.021, cz=0.018, power=2.8),
    ])
    return Join(butt, fore)


def BoltHandle(z, bend=0.55, knob=0.011):
    """拉机柄 + 球头。bend=0 是三八式那种近乎水平的直柄，
    bend≈0.6 是毛瑟式的下折柄 —— 这一处角度是两族步枪的分界。"""
    arm = TubeY(0.0055, 0.0050, 0.052, 6)
    Transform(arm, y=0.026)
    Transform(arm, rz=-PI * 0.5 + bend)
    Transform(arm, x=0.017, y=BORE + 0.014, z=z)
    ball = Loft([Ring(-knob, r=0.0), Ring(-knob * 0.5, r=knob * 0.86),
                 Ring(knob * 0.5, r=knob * 0.86), Ring(knob, r=0.0)], 6)
    tip = 0.017 + 0.052 * math.cos(bend)
    Transform(ball, x=tip, y=BORE + 0.014 - 0.052 * math.sin(bend), z=z)
    return Join(arm, ball)


def LadderSight(z):
    """立框式表尺：底座 + 竖起来的标尺板。照门位置直接决定 sight 挂点。"""
    base = Box(0.024, 0.010, 0.052, bevel=0.002)
    Transform(base, y=BORE + 0.013, z=z)
    leaf = Box(0.019, 0.026, 0.004)
    Transform(leaf, y=BORE + 0.028, z=z + 0.020, rx=-0.22)
    return Join(base, leaf)


def FrontSight(z, hooded=False):
    """准星座（+ 三八式那种护翼）。"""
    post = Box(0.004, 0.014, 0.006)
    Transform(post, y=BORE + 0.014, z=z)
    band = LoftZ([Ring(z + 0.012, rx=0.011, rz=0.011, cz=BORE, power=2.0),
                  Ring(z - 0.012, rx=0.011, rz=0.011, cz=BORE, power=2.0)],
                 6, capStart=False, capEnd=False, smooth=False)
    parts = [post, band]
    if hooded:
        for s in (-1, 1):
            wing = Box(0.003, 0.020, 0.008)
            Transform(wing, x=s * 0.008, y=BORE + 0.016, z=z)
            parts.append(wing)
    return Join(*parts)


def SlingSwivels(zFront, zBack):
    parts = []
    for z in (zFront, zBack):
        ring = Lathe([(0.006, 0.0), (0.009, 0.0), (0.009, 0.003), (0.006, 0.003)],
                     6, smooth=False, closed=True)
        Transform(ring, rz=PI * 0.5)
        Transform(ring, y=-0.020, z=z)
        parts.append(ring)
    return Join(*parts)


# ---------------------------------------------------------------------------
# 中正式 1.110 m
# ---------------------------------------------------------------------------

def BuildZhongZheng():
    total = 1.110
    muzzleZ = -(total - BUTT_Z)
    root = Node("root")
    body = root.Child("body")
    foreEnd = muzzleZ * 0.66

    body.Add("wood", BoltRifleStock(total, foreEnd), tile="wood")
    # 上护木：毛瑟枪管上半段包一层木，是「不是一根铁棍」的关键
    body.Add("wood", LoftZ([
        Ring(-0.185, rx=0.014, rz=0.010, cz=BORE + 0.012, power=2.6),
        Ring(foreEnd * 0.55, rx=0.013, rz=0.009, cz=BORE + 0.011, power=2.6),
        Ring(foreEnd, rx=0.012, rz=0.008, cz=BORE + 0.010, power=2.6),
    ]), tile="wood")

    receiver = Box(0.034, 0.048, 0.190, bevel=0.004)
    Transform(receiver, y=BORE - 0.004, z=-0.055)
    body.Add("steel", receiver, tile="steel")
    # 固定弹仓：中正式是 5 发桥夹压入，机匣下方一块凸料
    mag = Box(0.028, 0.030, 0.078, bevel=0.003)
    Transform(mag, y=BORE - 0.033, z=-0.055)
    body.Add("steel", mag, tile="steel")
    trigger = Box(0.006, 0.020, 0.010)
    Transform(trigger, y=BORE - 0.040, z=0.006)
    body.Add("steel", trigger, tile="steel")

    body.Add("steel", TubeAlongZ(-0.150, muzzleZ, 0.0088, 0.0074), tile="steel")
    body.Add("steel", BoltHandle(-0.030, 0.55), tile="steel")
    body.Add("steel", LadderSight(-0.175), tile="steel")
    body.Add("steel", FrontSight(muzzleZ + 0.022), tile="steel")
    # 刺刀座
    lug = Box(0.010, 0.014, 0.036)
    Transform(lug, y=BORE - 0.014, z=muzzleZ + 0.040)
    body.Add("steel", lug, tile="steel")
    body.Add("steel", SlingSwivels(foreEnd * 0.7, BUTT_Z - 0.110), tile="steel")

    Mounts(body, muzzleZ - 0.008, foreEnd * 0.58, -0.175, magY=BORE - 0.045, magZ=-0.055)
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

    body.Add("wood", BoltRifleStock(total, foreEnd, comb=0.96), tile="wood")

    receiver = Box(0.033, 0.046, 0.185, bevel=0.004)
    Transform(receiver, y=BORE - 0.004, z=-0.050)
    body.Add("steel", receiver, tile="steel")
    mag = Box(0.030, 0.044, 0.062, bevel=0.003)     # 曼利夏式漏夹弹仓，比毛瑟的深
    Transform(mag, y=BORE - 0.040, z=-0.040)
    body.Add("steel", mag, tile="steel")

    # **枪管套筒**：φ32 的薄壁圆筒一路包到枪口附近。88 式的识别点，
    # 没有它就跟中正式分不出来 —— 而这两把枪在第 31 师是混装的。
    #
    # 注意 z 是**递减**才是往枪口去（枪管沿 -Z）。这里最早写成 muzzleZ - 0.055，
    # 结果套筒跑到枪口前头去了，而且 LoftZ 的环序反了整段面朝里。
    # 全长断言（BuildAll 的 WEAPON_LENGTH）就是为了逮这一类。
    body.Add("steel", TubeAlongZ(-0.145, muzzleZ + 0.055, 0.0162, 0.0158, segments=10), tile="steel")
    # 套筒尽头露出的一小截枪管 + 枪口帽
    body.Add("steel", TubeAlongZ(muzzleZ + 0.060, muzzleZ, 0.0090, 0.0082), tile="steel")
    capRing = LoftZ([Ring(muzzleZ + 0.062, rx=0.0135, rz=0.0135, cz=BORE),
                     Ring(muzzleZ + 0.040, rx=0.0135, rz=0.0135, cz=BORE)],
                    SEG, capStart=False, capEnd=False, smooth=False)
    body.Add("steel", capRing, tile="steel")

    body.Add("steel", BoltHandle(-0.026, 0.62), tile="steel")
    body.Add("steel", LadderSight(-0.170), tile="steel")
    body.Add("steel", FrontSight(muzzleZ + 0.020), tile="steel")
    body.Add("steel", SlingSwivels(foreEnd * 0.8, BUTT_Z - 0.110), tile="steel")

    Mounts(body, muzzleZ - 0.008, muzzleZ * 0.42, -0.170, magY=BORE - 0.050, magZ=-0.040)
    return root


# ---------------------------------------------------------------------------
# ZB-26 轻机枪 1.165 m —— 弹匣从上方插、枪管上提把、前段两脚架
# ---------------------------------------------------------------------------

def BuildZb26():
    total = 1.165
    muzzleZ = -(total - BUTT_Z)
    root = Node("root")
    body = root.Child("body")

    # 枪托：轻机枪的托更细更直，带一个握把
    body.Add("wood", LoftZ([
        Ring(BUTT_Z, rx=0.018, rz=0.048, cz=0.006, power=3.2),
        Ring(BUTT_Z - 0.130, rx=0.019, rz=0.036, cz=0.008, power=2.8),
        Ring(0.060, rx=0.018, rz=0.030, cz=0.006, power=2.6),
    ]), tile="wood")
    # 握把是**竖着往下伸**的，所以沿 +Y 放样再前倾着装上去。
    # 拿 LoftZ 建的话截面是垂直于枪管的，一根往下走的柱子会被切成一堆斜片。
    grip = Loft([Ring(0.0, rx=0.018, rz=0.021, power=2.6),
                 Ring(-0.045, rx=0.016, rz=0.019, power=2.6),
                 Ring(-0.088, rx=0.014, rz=0.017, power=2.6)], 6)
    Transform(grip, rx=0.30)
    Transform(grip, y=-0.012, z=0.012)
    body.Add("wood", grip, tile="wood")

    receiver = Box(0.040, 0.058, 0.290, bevel=0.005)
    Transform(receiver, y=BORE - 0.008, z=-0.090)
    body.Add("steel", receiver, tile="steel")

    # **弹匣从上方插**：20 发直弹匣，微微后倾。这是 ZB-26 一眼可辨的地方，
    # 也是它和布伦（弯弹匣）的分界。弹匣是竖的，所以沿 +Y 放样再装上机匣顶。
    magazine = Loft([
        Ring(0.0, rx=0.014, rz=0.026, power=3.4),
        Ring(0.072, rx=0.013, rz=0.024, power=3.4),
        Ring(0.128, rx=0.012, rz=0.022, power=3.4),
    ], 6)
    Transform(magazine, rx=-0.12)
    Transform(magazine, y=BORE + 0.022, z=-0.118)
    body.Add("steel", magazine, tile="steel")

    # 带散热环的枪管
    barrelRings = []
    for i in range(9):
        t = i / 8.0
        z = -0.235 + (muzzleZ + 0.075 + 0.235) * t
        r = 0.0125 - 0.0028 * t
        barrelRings.append(Ring(z, r=r * (1.30 if i % 2 == 0 else 1.0), cz=BORE))
    body.Add("steel", LoftZ(barrelRings), tile="steel")
    body.Add("steel", TubeAlongZ(muzzleZ + 0.075, muzzleZ, 0.0105, 0.0125), tile="steel")

    # 提把：横在枪管上方，抓着换枪管用
    handle = LoftZ([Ring(-0.290, rx=0.010, rz=0.008, cz=BORE + 0.048, power=3.0),
                    Ring(-0.400, rx=0.010, rz=0.008, cz=BORE + 0.048, power=3.0)], 6)
    body.Add("wood", handle, tile="wood")
    for z in (-0.288, -0.402):
        post = Box(0.010, 0.040, 0.012)
        Transform(post, y=BORE + 0.028, z=z)
        body.Add("steel", post, tile="steel")

    # 两脚架：架在前段，收起时贴着枪管。这里做成张开的战斗状态
    for s in (-1, 1):
        leg = TubeY(0.0055, 0.0042, 0.230, 5)
        Transform(leg, y=-0.115)
        Transform(leg, rz=s * 0.30, rx=-0.16)
        Transform(leg, x=s * 0.012, y=BORE - 0.014, z=muzzleZ + 0.155)
        body.Add("steel", leg, tile="steel")
    yoke = Box(0.036, 0.014, 0.020, bevel=0.003)
    Transform(yoke, y=BORE - 0.012, z=muzzleZ + 0.155)
    body.Add("steel", yoke, tile="steel")

    body.Add("steel", LadderSight(-0.205), tile="steel")
    body.Add("steel", FrontSight(muzzleZ + 0.028), tile="steel")

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
    body.Add("wood", BoltRifleStock(total, foreEnd, comb=0.88), tile="wood")
    body.Add("wood", LoftZ([
        Ring(-0.200, rx=0.014, rz=0.010, cz=BORE + 0.012, power=2.6),
        Ring(foreEnd * 0.60, rx=0.013, rz=0.009, cz=BORE + 0.011, power=2.6),
        Ring(foreEnd, rx=0.012, rz=0.008, cz=BORE + 0.010, power=2.6),
    ]), tile="wood")

    receiver = Box(0.032, 0.046, 0.200, bevel=0.004)
    Transform(receiver, y=BORE - 0.004, z=-0.060)
    body.Add("steel", receiver, tile="steel")
    mag = Box(0.026, 0.028, 0.072, bevel=0.003)
    Transform(mag, y=BORE - 0.032, z=-0.060)
    body.Add("steel", mag, tile="steel")

    # **防尘滑盖**：一片带纵向折边的弧形钢板，扣在机匣上方随枪机前后滑。
    # 三八式的独门标志（也是它一拉栓就哗啦响的原因），没有它就是把毛瑟。
    cover = LoftZ([
        Ring(0.028, rx=0.0165, rz=0.0090, cz=BORE + 0.016, power=3.6),
        Ring(-0.030, rx=0.0170, rz=0.0095, cz=BORE + 0.017, power=3.6),
        Ring(-0.130, rx=0.0170, rz=0.0095, cz=BORE + 0.017, power=3.6),
        Ring(-0.158, rx=0.0155, rz=0.0085, cz=BORE + 0.016, power=3.6),
    ], 6, smooth=False)
    body.Add("steel", cover, tile="steel")

    body.Add("steel", TubeAlongZ(-0.160, muzzleZ, 0.0082, 0.0070), tile="steel")
    # 三八式的拉机柄近乎水平、球头小
    body.Add("steel", BoltHandle(0.010, 0.10, knob=0.0095), tile="steel")
    body.Add("steel", LadderSight(-0.195), tile="steel")
    body.Add("steel", FrontSight(muzzleZ + 0.024, hooded=True), tile="steel")
    lug = Box(0.010, 0.014, 0.040)
    Transform(lug, y=BORE - 0.014, z=muzzleZ + 0.044)
    body.Add("steel", lug, tile="steel")
    body.Add("steel", SlingSwivels(foreEnd * 0.75, BUTT_Z - 0.115), tile="steel")

    Mounts(body, muzzleZ - 0.008, foreEnd * 0.62, -0.195, magY=BORE - 0.036, magZ=-0.060)
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
        Ring(0.010, rx=0.017, rz=0.021, power=2.4),
        Ring(-0.036, rx=0.019, rz=0.023, power=2.2),
        Ring(-0.076, rx=0.017, rz=0.021, power=2.2),
        Ring(-0.092, rx=0.011, rz=0.014, power=2.2),
    ], 8)
    Transform(grip, rx=0.10)
    Transform(grip, y=0.006, z=0.004)
    body.Add("wood", grip, tile="wood")

    frame = Box(0.026, 0.042, 0.120, bevel=0.003)
    Transform(frame, y=BORE - 0.008, z=-0.030)
    body.Add("steel", frame, tile="steel")
    # 固定弹仓在扳机**前方** —— C96 的识别点，摆到握把里就成了勃朗宁
    mag = Box(0.022, 0.038, 0.042, bevel=0.003)
    Transform(mag, y=BORE - 0.030, z=-0.062)
    body.Add("steel", mag, tile="steel")
    guard = Box(0.008, 0.022, 0.028)
    Transform(guard, y=BORE - 0.030, z=-0.016)
    body.Add("steel", guard, tile="steel")

    body.Add("steel", TubeAlongZ(-0.090, muzzleZ, 0.0072, 0.0066), tile="steel")
    hammer = Box(0.008, 0.026, 0.014, bevel=0.002)
    Transform(hammer, y=BORE + 0.020, z=0.036, rx=-0.25)
    body.Add("steel", hammer, tile="steel")
    body.Add("steel", FrontSight(muzzleZ + 0.014), tile="steel")
    rear = Box(0.018, 0.012, 0.030, bevel=0.002)
    Transform(rear, y=BORE + 0.014, z=-0.078)
    body.Add("steel", rear, tile="steel")

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
    # 弹体在 -Z（朝前扔出去的方向），木柄从原点往 +Z
    body.Add("steel", LoftZ([
        Ring(-0.083, rx=0.029, rz=0.029, power=2.2),
        Ring(-0.120, rx=0.029, rz=0.029, power=2.2),
        Ring(-0.172, rx=0.028, rz=0.028, power=2.2),
        Ring(-0.175, rx=0.024, rz=0.024, power=2.2),
    ], 10), tile="steel")
    body.Add("wood", LoftZ([
        Ring(0.045, rx=0.0165, rz=0.0165, power=2.2),      # 柄尾（拉火绳藏在这里）
        Ring(0.036, rx=0.0145, rz=0.0145, power=2.2),
        Ring(-0.080, rx=0.0145, rz=0.0145, power=2.2),
    ], 8), tile="wood")
    # 柄尾的铁盖
    body.Add("steel", LoftZ([Ring(0.050, rx=0.0170, rz=0.0170, power=2.2),
                             Ring(0.041, rx=0.0170, rz=0.0170, power=2.2)], 8), tile="steel")
    body.Child("muzzle", t=(0.0, 0.0, -0.175))
    body.Child("gripR", t=(0.0, 0.0, 0.0))
    return root


# ---------------------------------------------------------------------------
# 大刀 0.90 m（刃长 0.595）
# ---------------------------------------------------------------------------

def BuildDadao():
    """第 29 军带出来、第 31 师照做的大刀。

    三处不许做错：
      · **柄尾必有铁环**（缠红布条那个），没有环就成了日式短刀；
      · **护手是一小片铁，不是圆盘**，圆盘那是欧洲剑；
      · 刀身宽 57 → 38 mm、背厚 5—6 mm，**又宽又薄**，不是等宽铁条。
    """
    root = Node("root")
    body = root.Child("body")

    # 刀身：rx 是横向半厚、rz 是竖向半宽（刃朝下，用 cz 把重心往下压）
    body.Add("steel", LoftZ([
        Ring(-0.020, rx=0.0028, rz=0.0285, cz=-0.004, power=3.0),
        Ring(-0.300, rx=0.0027, rz=0.0270, cz=-0.003, power=3.0),
        Ring(-0.520, rx=0.0025, rz=0.0230, cz=0.000, power=3.0),
        Ring(-0.590, rx=0.0022, rz=0.0190, cz=0.006, power=2.8),   # 收向刀尖
        Ring(-0.615, rx=0.0012, rz=0.0075, cz=0.012, power=2.4),
    ], 6, smooth=False), tile="steel")

    # 护手：一小片横铁，比刀身略宽一点点就够
    guard = Box(0.038, 0.020, 0.008, bevel=0.002)
    Transform(guard, z=-0.008)
    body.Add("steel", guard, tile="steel")

    # 柄：缠布，握两手
    body.Add("accessory", LoftZ([
        Ring(0.205, rx=0.0135, rz=0.0165, power=2.6),
        Ring(0.120, rx=0.0145, rz=0.0180, power=2.6),
        Ring(0.030, rx=0.0140, rz=0.0175, power=2.6),
        Ring(0.004, rx=0.0130, rz=0.0160, power=2.6),
    ], 6), tile="cloth")

    # **柄尾铁环**：一个真的圆环（Lathe 转出来的环面），红布条缠在环根
    ring = Lathe([(0.032, -0.005), (0.040, -0.005), (0.040, 0.005), (0.032, 0.005)],
                 8, smooth=True, closed=True)
    Transform(ring, rx=PI * 0.5)
    Transform(ring, z=0.242)
    body.Add("steel", ring, tile="steel")
    collar = Box(0.016, 0.016, 0.026, bevel=0.002)
    Transform(collar, z=0.220)
    body.Add("steel", collar, tile="steel")
    rag = Box(0.020, 0.020, 0.040, bevel=0.004)
    Transform(rag, z=0.262)
    body.Add("red", rag, tile="cloth")

    body.Child("muzzle", t=(0.0, 0.012, -0.630))
    body.Child("gripR", t=(0.0, 0.0, 0.0))
    body.Child("gripL", t=(0.0, 0.0, 0.115))
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

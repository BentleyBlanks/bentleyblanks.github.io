# -*- coding: utf-8 -*-
"""日方的三件重装备：八九式重掷弹筒 / 八九式中战车 / 九四式轻装甲车。

这三条在 Data_Weapons.mjs 里有完整数据、在 Data_Levels.mjs 里有出场位置，
可一直没有几何 —— 枪械编辑器那一栏写着「车辆与掷弹筒没有模型，只看数据」。

--- 坐标系 -----------------------------------------------------------------

掷弹筒走**武器规范系**（与 BuildWeapons 一致）：右手握点 = 原点、筒口沿 -Z。
它是单兵携行的东西，走这条路人物才能直接拿着它。

车辆走**载具规范系**：
  · 原点在**地面、车体中心**（不是车底盘中心）—— 放置的人写一个 (x, z) 就落地，
    不用查这辆车的底盘离地多少；
  · **车头朝 -Z**，与人物、武器同向。全场只有这一个前方约定，别再发明第二个；
  · 长在 Z、宽在 X、高在 Y，数字直接对 Data_Weapons 的 lengthM/widthM/heightM。

炮塔是**关节**（joint=True）。现在没有载具系统、炮塔不会转，但结构先摆对：
将来加转向的人只要写 `nodes.get("turret").rotation.y = …`，不用回来重建模型。

--- 三角预算 ---------------------------------------------------------------

车辆 ≤ 1600。比士兵（1800）低一档是有道理的：同屏最多两辆，而且它们通常在
三十米开外 —— 剪影（履带的前高后低、炮塔的位置、炮管的长短）决定一切，
铆钉和负重轮的圈数一个像素都换不来。

--- 史实红线（docs/Data_HistoryMaterial.md 与 Data_Weapons.mjs 的 note）-----

  · 八九式中战车：车长 4.30 / 宽 2.15 / 高 2.56 m，装甲 6—17 mm。
    **前起动轮抬高**、履带前段上翘是它最好认的一条剪影线；炮塔在车体中线偏前，
    塔后另有一挺机枪（不是装饰，是它被从背后爬上去的原因）。
  · 九四式轻装甲车：3.10 / 1.60 / 1.60 m，只有一挺机枪，车尾有牵引钩 ——
    它本来是拉弹药拖车的，被拉到前线当装甲车用，牵引钩必须在。
  · 八九式重掷弹筒：全长 413 mm，**没有两脚架**，底部弧形驻钣抵地，约 45° 手持发射。
    别给它加脚架 —— 那是把它认成迫击炮。
"""

import math

from TzmCore import Box, Join, Lathe, Loft, Node, RibbonYz, Ring, Transform, TubeZ

PI = math.pi

# 贴图格距。车体钢板用 armor（0.75 m 一格）：一面 4.3 m 的车体侧板吃到六格，
# SteelHelmet 那张图的锈斑与粗糙度变化正好落在「几十厘米一处」的尺度上。
# 套枪的 gunSteel（0.030）会把锈斑缩成砂纸，套建筑的 steel（0.35）又太密。
T_ARMOR = "armor"        # 材质名兼格距名（两边同名，见 TzmCore.TILE_METERS["armor"]）
T_STEEL = "steel"        # 同上
T_TRACK = "track"        # 履带与负重轮：**不是 armor**（没喷漆）也不是发蓝裸钢
T_GUN_STEEL = "gunSteel"  # **只是格距**：掷弹筒是单兵器材，格距走枪那一套
T_GUN_WOOD = "gunWood"    # 同上。材质名仍然是 steel / wood

SEG = 10


def LoftZ(rings, segments=SEG, **kwargs):
    """沿 -Z 放样：ring["y"] 写的是目标 z（从尾往口排，z 递减）。
    与 BuildWeapons.LoftZ 同一套约定 —— 先沿 +Y 放样再绕 X 转 -90°。"""
    flipped = [dict(r, y=-r["y"]) for r in rings]
    bm = Loft(flipped, segments, **kwargs)
    Transform(bm, rx=-PI * 0.5)
    return bm


# ---------------------------------------------------------------------------
# 八九式重掷弹筒（全长 413 mm）
# ---------------------------------------------------------------------------

def BuildType89Launcher():
    """筒身 + 螺杆 + 弧形驻钣 + 侧面击发机构。**没有两脚架。**

    全长 413 mm 分配：驻钣尾端 z=+0.185，筒口 z=-0.228。握点（原点）落在螺杆上，
    人物的右手就抓在那儿 —— 这是「手持发射」这件事在几何上的落点。
    """
    root = Node("root")
    body = root.Child("body")

    # 筒身：φ50 的滑膛短筒，口部略收（真物是口部有一圈加厚）
    body.Add("steel", LoftZ([
        Ring(-0.014, rx=0.0250, rz=0.0250, power=2.2),
        Ring(-0.030, rx=0.0255, rz=0.0255, power=2.2),
        Ring(-0.205, rx=0.0250, rz=0.0250, power=2.2),
        Ring(-0.216, rx=0.0268, rz=0.0268, power=2.2),   # 口部加厚圈
        Ring(-0.228, rx=0.0262, rz=0.0262, power=2.2),
    ], SEG), tile=T_GUN_STEEL)

    # 螺杆：调射程用的粗牙螺杆，筒底插进去 14 mm（零件之间只准插进去，不准挨着）
    body.Add("steel", LoftZ([
        Ring(0.150, rx=0.0165, rz=0.0165, power=2.2),
        Ring(0.030, rx=0.0155, rz=0.0155, power=2.2),
        Ring(-0.010, rx=0.0210, rz=0.0210, power=2.2),   # 锥座
        Ring(-0.040, rx=0.0180, rz=0.0180, power=2.2),   # **插进筒里 26 mm**：
    ], 8), tile=T_GUN_STEEL)                             # 刚好挨着会两张皮打架，一转一闪

    # 驻钣：抵地的那块弧形铁鞋。用一段 Lathe 的浅碗，凹面朝后下方。
    plate = Lathe([(0.0, 0.0), (0.030, 0.006), (0.048, 0.030), (0.049, 0.050)], 10, smooth=False)
    Transform(plate, rx=PI * 0.5)          # 碗口朝 +Z（贴地那一面）
    Transform(plate, z=0.135)          # 压住螺杆尾端 15 mm
    body.Add("steel", plate, tile=T_GUN_STEEL)
    # 驻钣与螺杆之间的球窝接头
    body.Add("steel", LoftZ([Ring(0.158, rx=0.0215, rz=0.0215, power=2.4),
                                 Ring(0.118, rx=0.0215, rz=0.0215, power=2.4)], 8),
             tile=T_GUN_STEEL)

    # 击发机构：筒身右侧一块小方壳 + 扳机杆（这是「它能手持击发」的可读零件）
    housing = Box(0.026, 0.040, 0.062, bevel=0.004, segments=1)
    Transform(housing, x=0.030, y=-0.006, z=-0.046)
    body.Add("steel", housing, tile=T_GUN_STEEL)
    lever = Box(0.010, 0.030, 0.014)
    Transform(lever, x=0.030, y=-0.030, z=-0.030, rx=0.25)
    body.Add("steel", lever, tile=T_GUN_STEEL)

    # 握把：螺杆上缠的一段皮/木，左手扶这里。给它一点直径差，剪影上才看得出是「握处」
    grip = LoftZ([Ring(0.096, rx=0.0215, rz=0.0215, power=2.6),
                  Ring(0.040, rx=0.0225, rz=0.0225, power=2.6)], 8)
    body.Add("wood", grip, tile=T_GUN_WOOD)

    body.Child("muzzle", t=(0.0, 0.0, -0.230))
    body.Child("gripR", t=(0.0, 0.0, 0.0))
    body.Child("gripL", t=(0.0, 0.0, -0.070))
    body.Child("sight", t=(0.026, 0.026, -0.060))
    body.Child("magazine", t=(0.0, 0.0, 0.150))
    return root


# ---------------------------------------------------------------------------
# 履带：一条闭合的环带，前段上翘
# ---------------------------------------------------------------------------

def TrackLoop(points, width, thick=0.055):
    """把 (y, z) 环路扫成一条履带。首尾点重合，两端的封口正好互相盖住。

    为什么不用 Strip：见 TzmCore.RibbonYz 的抬头 —— 履带绕过前后轮时切线会走满
    一整圈，通用 Frenet 标架在切线水平那两处翻向，整条带子拧成麻花。
    """
    return RibbonYz(points, width, thick)


def RoadWheel(x, z, y, radius, width, seg=8):
    """负重轮：一个扁圆柱。**x 必须传** —— 少传一个参数的后果是两侧的轮子
    全叠在车体中线上，从外面一只都看不见，而侧面的履带里空着一条缝。

    轮廓只有三段（面、外圈、面）。原来给了六段做倒角：一只轮子 80 三角、
    一辆车十八只 = 1440 —— 整辆车的预算被负重轮吃光了，而它在三十米外是四个像素。
    """
    bm = Lathe([(0.0, -width * 0.5), (radius, -width * 0.5),
                (radius, width * 0.5), (0.0, width * 0.5)], seg, smooth=False)
    # Lathe 绕 Y 转，得到的是「轴沿 Y」的轮子；轮轴该沿 X，绕 Z 转 90°
    Transform(bm, rz=PI * 0.5)
    Transform(bm, x=x, y=y, z=z)
    return bm


# ---------------------------------------------------------------------------
# 八九式中战车 4.30 × 2.15 × 2.56 m
# ---------------------------------------------------------------------------

def BuildType89Tank():
    """甲型的剪影：前起动轮抬高、车体方正、炮塔偏前、塔后另有机枪。

    竖向分配（全高 2.56 是史实数据，BuildAll 逐轴断言）：
      履带底 0 → 下车体 0.30—0.94 → 上车体 0.90—1.56 → 炮塔 1.50—2.16
      → 指挥塔 2.10—2.48 → 舱盖 2.46—2.56
    每一段都**压着上一段 4—6 cm**：零件之间只准插进去，不准刚好挨着。
    """
    root = Node("root")
    body = root.Child("body")

    halfW = 1.075          # 2.15 / 2
    trackW = 0.30
    trackX = halfW - trackW * 0.5 - 0.005

    # --- 履带 --------------------------------------------------------------
    # 侧视图的环路：底面贴地 y=0.055，尾轮低、**前起动轮抬到 y=0.92** ——
    # 这条前高后低的斜线是八九式最好认的一处剪影。
    # 前后端点收在 ±2.13 以内：全长 4.30 是史实数据，而**轮子的半径也算进跨度**——
    # 上一版把前起动轮摆到 z=-1.96 半径 0.30，车头凭空长出 13 cm。
    loop = [
        (0.055, -1.70), (0.055, 1.84), (0.26, 2.06), (0.62, 2.08),
        (0.78, 1.86), (0.78, -1.40), (0.92, -1.86), (0.80, -2.11),
        (0.42, -2.10), (0.055, -1.70),
    ]
    for side in (-1, 1):
        track = TrackLoop(loop, trackW)
        Transform(track, x=side * trackX)
        body.Add(T_TRACK, track, tile=T_TRACK)

        # 悬挂挡板：把履带环里那块空当填上。不填的话从侧面能一眼看穿整辆车。
        plate = Box(0.12, 0.58, 3.50, bevel=0.01)
        Transform(plate, x=side * (trackX - 0.03), y=0.40, z=0.06)
        body.Add(T_ARMOR, plate, tile=T_ARMOR)

        wx = side * trackX
        for z in (-1.28, -0.52, 0.24, 1.00):
            body.Add(T_TRACK, RoadWheel(wx, z, 0.21, 0.19, 0.22), tile=T_TRACK)
        body.Add(T_TRACK, RoadWheel(wx, -1.84, 0.62, 0.26, 0.24), tile=T_TRACK)   # 前起动轮（抬高）
        body.Add(T_TRACK, RoadWheel(wx, 1.86, 0.36, 0.22, 0.24), tile=T_TRACK)    # 后诱导轮

    # --- 车体 --------------------------------------------------------------
    # 下车体：夹在两条履带之间，比履带内沿再宽一点（插进去 3 cm，别刚好挨着）
    lower = Box(1.66, 0.64, 3.80, bevel=0.02)
    Transform(lower, y=0.62, z=0.02)
    body.Add(T_ARMOR, lower, tile=T_ARMOR)

    # 上车体。**用 Box，不用 4 段的 Loft** ——
    # Loft 的截面是超椭圆，4 段就是在 θ = 0/90/180/270 上取四个点，
    # 不管 power 给到多少，出来永远是**菱形棱柱**：车体侧面变成两片斜坡，
    # 正脸是一个尖角朝上的钻石（第一版台架图上那颗钻石就是这么来的）。
    # 方盒就用方料，圆的地方才放样。
    upper = Box(1.64, 0.66, 3.06, bevel=0.03)
    Transform(upper, y=1.23, z=0.34)
    body.Add(T_ARMOR, upper, tile=T_ARMOR)
    # 驾驶室：比战斗室矮一档、窄一点，前脸再往前伸出去
    driver = Box(1.56, 0.48, 0.86, bevel=0.03)
    Transform(driver, y=1.14, z=-1.36)
    body.Add(T_ARMOR, driver, tile=T_ARMOR)
    # 首上斜板：一块斜着盖在驾驶室前脸上的板，把方盒的直角切掉
    glacis = Box(1.52, 0.46, 0.10, bevel=0.02)
    Transform(glacis, rx=0.72)
    Transform(glacis, y=1.30, z=-1.70)
    body.Add(T_ARMOR, glacis, tile=T_ARMOR)

    # 驾驶手观察窗（凸出来的一块小盒）与车体机枪球座（右前）
    visor = Box(0.44, 0.16, 0.10, bevel=0.008)
    Transform(visor, x=-0.24, y=1.26, z=-1.80)
    body.Add(T_ARMOR, visor, tile=T_ARMOR)
    ball = Lathe([(0.0, 0.0), (0.12, 0.03), (0.13, 0.10), (0.0, 0.13)], 8, smooth=True)
    Transform(ball, rx=-PI * 0.5)
    Transform(ball, x=0.34, y=1.12, z=-1.80)
    body.Add(T_ARMOR, ball, tile=T_ARMOR)
    hullMg = TubeZ(0.024, 0.020, 0.30, 8)
    Transform(hullMg, x=0.34, y=1.12, z=-1.86)
    body.Add(T_STEEL, hullMg, tile="steel")

    # 尾部排气消音器：车体右侧一根**顺着车身**的粗管。
    # 别绕 Y 转 90°——那样它横在车头前面变成一根撞角（上一版就是）。
    muffler = TubeZ(0.085, 0.085, 1.10, 8)
    Transform(muffler, x=0.84, y=1.16, z=1.44)
    body.Add(T_STEEL, muffler, tile="steel")

    # --- 炮塔（关节）-------------------------------------------------------
    # 位置：车体中线**偏前** 0.35 m。八九式的炮塔就在驾驶室后面紧挨着。
    turret = body.Child("turret", t=(0.0, 1.50, -0.35), joint=True)
    drum = Loft([
        Ring(0.0, rx=0.56, rz=0.62, cz=-0.02, power=3.2),
        Ring(0.34, rx=0.55, rz=0.61, cz=-0.02, power=3.2),
        Ring(0.66, rx=0.46, rz=0.51, cz=-0.02, power=3.0),
    ], 10)
    turret.Add(T_ARMOR, drum, tile=T_ARMOR)
    # 指挥塔：塔顶偏左后的一个小圆筒 + 舱盖。全高 2.56 靠它顶到位。
    # 粗而矮。原来 φ0.48 高 0.38 立在塔顶上，剪影读作一根烟囱 ——
    # 九〇式的指挥塔是个能钻出半个人的圆座，不是排气管。
    cupola = Loft([
        Ring(0.60, rx=0.31, rz=0.31, power=2.6),
        Ring(0.94, rx=0.29, rz=0.29, power=2.6),
    ], 8)
    Transform(cupola, x=-0.10, z=0.16)
    turret.Add(T_ARMOR, cupola, tile=T_ARMOR)
    hatch = Loft([Ring(0.92, rx=0.295, rz=0.295, power=2.6),
                  Ring(1.06, rx=0.255, rz=0.255, power=2.6)], 8)
    Transform(hatch, x=-0.10, z=0.16)
    turret.Add(T_ARMOR, hatch, tile=T_ARMOR)

    # 五七毫米短炮：炮盾 + 短粗炮管。短是它的特征 —— 画长了就成了九七式。
    mantlet = Loft([Ring(0.14, rx=0.20, rz=0.14, power=3.0),
                    Ring(0.46, rx=0.20, rz=0.14, power=3.0)], 8)
    Transform(mantlet, z=-0.56)
    turret.Add(T_ARMOR, mantlet, tile=T_ARMOR)
    barrel = TubeZ(0.052, 0.046, 0.56, 8)
    Transform(barrel, y=0.30, z=-0.52)
    turret.Add(T_STEEL, barrel, tile="steel")

    # 塔后机枪：从背后爬上去的人正对着它，这挺枪不是装饰
    rearBall = Lathe([(0.0, 0.0), (0.10, 0.02), (0.11, 0.08), (0.0, 0.10)], 8, smooth=True)
    Transform(rearBall, rx=PI * 0.5)
    Transform(rearBall, x=0.16, y=0.32, z=0.52)
    turret.Add(T_ARMOR, rearBall, tile=T_ARMOR)
    rearMg = TubeZ(0.022, 0.018, 0.26, 8)
    Transform(rearMg, x=0.16, y=0.32, z=0.56, ry=PI)
    turret.Add(T_STEEL, rearMg, tile="steel")

    turret.Child("gunMuzzle", t=(0.0, 0.30, -1.10))
    turret.Child("rearMgMuzzle", t=(0.16, 0.32, 0.84))
    turret.Child("hatch", t=(-0.10, 1.06, 0.16))
    body.Child("mgMuzzle", t=(0.34, 1.12, -2.16))
    body.Child("hullFront", t=(0.0, 0.90, -2.12))
    return root


# ---------------------------------------------------------------------------
# 九四式轻装甲车 3.10 × 1.60 × 1.60 m
# ---------------------------------------------------------------------------

def BuildType94Tankette():
    """豆战车。一挺机枪、四只负重轮、**车尾牵引钩** —— 它本来是拉弹药拖车的。

    竖向（全高 1.60）：履带底 0 → 车体 0.30—0.98 → 炮塔 0.94—1.46 → 舱盖 1.44—1.60。
    """
    root = Node("root")
    body = root.Child("body")

    halfW = 0.80
    trackW = 0.22
    trackX = halfW - trackW * 0.5 - 0.004

    loop = [
        (0.050, -1.20), (0.050, 1.30), (0.22, 1.50), (0.50, 1.50),
        (0.58, 1.26), (0.58, -1.02), (0.68, -1.34), (0.58, -1.56),
        (0.30, -1.55), (0.050, -1.20),
    ]
    for side in (-1, 1):
        track = TrackLoop(loop, trackW, 0.045)
        Transform(track, x=side * trackX)
        body.Add(T_TRACK, track, tile=T_TRACK)

        plate = Box(0.09, 0.42, 2.36, bevel=0.008)
        Transform(plate, x=side * (trackX - 0.02), y=0.31, z=0.03)
        body.Add(T_ARMOR, plate, tile=T_ARMOR)

        wx = side * trackX
        for z in (-0.82, -0.26, 0.30, 0.86):
            body.Add(T_TRACK, RoadWheel(wx, z, 0.17, 0.135, 0.16), tile=T_TRACK)
        body.Add(T_TRACK, RoadWheel(wx, -1.34, 0.42, 0.18, 0.17), tile=T_TRACK)   # 前起动轮
        body.Add(T_TRACK, RoadWheel(wx, 1.32, 0.30, 0.16, 0.17), tile=T_TRACK)    # 后诱导轮

    # 车体：小方盒 + 一块明显的首上斜板（豆战车的正脸就是一块斜板）。
    # 同样用 Box —— 4 段的 Loft 出来是菱形棱柱，见上面战车那一段的账。
    hull = Box(1.24, 0.68, 2.40, bevel=0.025)
    Transform(hull, y=0.64, z=0.16)
    body.Add(T_ARMOR, hull, tile=T_ARMOR)
    nose = Box(1.12, 0.46, 0.52, bevel=0.02)
    Transform(nose, y=0.56, z=-1.20)
    body.Add(T_ARMOR, nose, tile=T_ARMOR)
    glacis = Box(1.10, 0.52, 0.08, bevel=0.015)
    Transform(glacis, rx=0.78)
    Transform(glacis, y=0.76, z=-1.28)
    body.Add(T_ARMOR, glacis, tile=T_ARMOR)

    visor = Box(0.34, 0.12, 0.09, bevel=0.006)
    Transform(visor, x=-0.18, y=0.76, z=-1.44)
    body.Add(T_ARMOR, visor, tile=T_ARMOR)

    # 炮塔：一挺机枪的小塔，偏车体右后。全高 1.60 由舱盖顶到。
    turret = body.Child("turret", t=(0.10, 0.94, 0.10), joint=True)
    drum = Loft([
        Ring(0.0, rx=0.33, rz=0.35, power=3.0),
        Ring(0.40, rx=0.31, rz=0.33, power=3.0),
        Ring(0.56, rx=0.27, rz=0.28, power=2.8),
    ], 8)
    turret.Add(T_ARMOR, drum, tile=T_ARMOR)
    # 舱盖压扁摊平：竖着一截小圆筒在塔顶就是个烟囱（战车那边同一笔账）
    hatch = Loft([Ring(0.54, rx=0.255, rz=0.255, power=2.6),
                  Ring(0.66, rx=0.225, rz=0.225, power=2.6)], 8)
    turret.Add(T_ARMOR, hatch, tile=T_ARMOR)
    ball = Lathe([(0.0, 0.0), (0.085, 0.02), (0.095, 0.07), (0.0, 0.09)], 8, smooth=True)
    Transform(ball, rx=-PI * 0.5)
    Transform(ball, y=0.18, z=-0.28)
    turret.Add(T_ARMOR, ball, tile=T_ARMOR)
    mg = TubeZ(0.020, 0.017, 0.30, 8)
    Transform(mg, y=0.18, z=-0.32)
    turret.Add(T_STEEL, mg, tile="steel")

    # 车尾牵引钩：这一件不能省 —— 九四式是拉着弹药拖车来的
    hook = Box(0.10, 0.16, 0.16, bevel=0.008)
    Transform(hook, y=0.44, z=1.34)
    body.Add(T_STEEL, hook, tile="steel")

    turret.Child("gunMuzzle", t=(0.0, 0.18, -0.62))
    body.Child("towHook", t=(0.0, 0.44, 1.42))
    body.Child("hullFront", t=(0.0, 0.46, -1.48))
    return root


VEHICLE_BUILDERS = {
    "Type89Launcher": BuildType89Launcher,
    "Type89Tank": BuildType89Tank,
}

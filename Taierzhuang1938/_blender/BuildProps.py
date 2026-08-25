# -*- coding: utf-8 -*-
"""建筑构件 + 场景饰件。

第一批（门楼四件）：门楼斗拱 / 屋脊兽头 / 格子窗棂 / 门墩石 ——
台儿庄那种鲁南运河商镇门楼上「一眼中式」的最小集合。

第二批（滕县饰件轮 WP-E1）：臂板信号机 / 站台灯 / 教堂尖券窗花 / 牢门五金 / 道口标。
这一批不是建筑构件而是**场景饰件**：它们由 Script_TrimProps.mjs 以运行时实例摆进
战斗关卡（不进 BuildSink，多数不登记碰撞），所以「原点在安装面」这条约定在这里
更要命 —— 摆的人手里只有一个 (x, y, z)，猜错安装面就是一根杆埋进地里半米。

放置、复制、朝向是 Script_World / Script_TrimProps 那边的事，这里只出零件，
原点一律在**安装面**上：
    Dougong        坐斗底面（落在额枋上）
    RidgeBeast     脊背安装面（落在正脊顶面）
    WindowLattice  窗台中点
    DoorPier       地面
    SemaphoreSignal / StationLamp / CrossingSign   地面（基墩底面）
    ChurchTracery  窗台中点（窗洞净宽中线，厚度对称于墙心）
    CellDoorIron   门板外表面、门扇底边中点（z ≥ 0 全部朝门外）

色板是史实红线：青砖 #7E8388（灰蓝，**不是红砖**）、小青瓦 #6E7276、
过墙石 #B3B0A6、夯土 #A8926E —— 这里只出几何，颜色由材质名（Stone/WoodBeam/
RoofTile/armor/track）到 MaterialLibrary 的配方决定，别在几何里烤颜色。

材质名只许用 **TzmCore.MATERIAL_NAMES ∩ ResolveTengxianMaterial 已登记集**：
Stone / WoodBeam / WoodDoor / RoofTile / armor / track。
铁活想要的 `IronPlate`（PLAIN_MAP 里已有，语义正好）**不在** TzmCore 白名单里，
本包不许改 TzmCore，所以铁件一律走 `track`（SteelHelmet 配方 + 0x8f887c 哑光暗灰，
就是风吹日晒的熟铁），漆过的铁杆走 `armor`（0xb9ad86 军绿卡其漆钢）。
换名字的请求写在 WP_E1 报告里，由主会话统一改三处（TzmCore / Verify / TzmShot）。

三角预算 ≤ 400/件。
"""

import math

from TzmCore import (BooleanDifference, Box, Join, Lathe, Loft, Node, Ring,
                     Transform)

PI = math.pi


def BuildDougong():
    """斗拱（一斗三升的简化）：坐斗 + 十字卯口 + 一层拱 + 三个升。

    **卯口是真的挖出来的**（BooleanDifference）—— 斗拱之所以是斗拱，
    就在于「木头互相咬进去」这件事；拿两块贴着的方料假装，近看一眼就露馅。
    这也是这条管线里唯一值得动布尔的地方：洞就是造型本身，而且只有两刀。
    """
    root = Node("root")
    body = root.Child("body")

    # 坐斗：上大下小的梯形斗，底面在 y=0
    seat = Loft([
        Ring(0.0, rx=0.105, rz=0.105, power=6.0),
        Ring(0.055, rx=0.140, rz=0.140, power=6.0),
        Ring(0.085, rx=0.150, rz=0.150, power=6.0),
    ], 4, smooth=False)
    # 十字卯口：两块相交的方料，从斗顶往下挖 40 mm
    # 两刀分开挖。Join 出来的十字是**自交**的（两块方料在正中重叠），
    # 而 EXACT 求解器对自交体的绕数判定是未定义行为 —— 实测直接返回空网格，
    # 整个坐斗凭空消失。挖两次，每次的刀都是一块干净的凸方料。
    slotA = Box(0.320, 0.044, 0.062)
    Transform(slotA, y=0.085)
    seat = BooleanDifference(seat, slotA)
    slotB = Box(0.062, 0.044, 0.320)
    Transform(slotB, y=0.085)
    seat = BooleanDifference(seat, slotB)
    body.Add("WoodBeam", seat, tile="wood")

    # 拱：横过来的一根弯枋，两端起翘
    arm = Loft([
        Ring(-0.300, rx=0.026, rz=0.030, power=4.0),
        Ring(-0.180, rx=0.030, rz=0.040, power=4.0),
        Ring(0.0, rx=0.030, rz=0.046, power=4.0),
        Ring(0.180, rx=0.030, rz=0.040, power=4.0),
        Ring(0.300, rx=0.026, rz=0.030, power=4.0),
    ], 4, smooth=False)
    Transform(arm, rz=PI * 0.5)      # 把放样轴从 +Y 转到 +X
    Transform(arm, y=0.108)
    body.Add("WoodBeam", arm, tile="wood")

    # 三个升（小斗）：正中一个、两端各一个
    for x in (-0.255, 0.0, 0.255):
        riser = Loft([
            Ring(0.0, rx=0.048, rz=0.048, power=6.0),
            Ring(0.038, rx=0.062, rz=0.062, power=6.0),
            Ring(0.056, rx=0.066, rz=0.066, power=6.0),
        ], 4, smooth=False)
        Transform(riser, x=x, y=0.140)
        body.Add("WoodBeam", riser, tile="wood")

    body.Child("top", t=(0.0, 0.196, 0.0))
    return root


def BuildRidgeBeast():
    """屋脊兽头（正吻的民居简化版）：一个上卷的兽首，张口吞脊。

    民居不是宫殿，不许做成故宫那种九兽 —— 鲁南商镇的脊饰就是一只糙陶兽头，
    体量小、纹样少、烧得发青。原点在脊背安装面上。
    """
    root = Node("root")
    body = root.Child("body")

    # 兽首主体：从脊面往上鼓，前端张口
    head = Loft([
        Ring(0.0, rx=0.055, rz=0.100, cz=-0.010, power=3.0),
        Ring(0.070, rx=0.070, rz=0.120, cz=-0.005, power=2.8),
        Ring(0.150, rx=0.072, rz=0.115, cz=0.010, power=2.6),
        Ring(0.215, rx=0.058, rz=0.085, cz=0.030, power=2.4),
        Ring(0.255, rx=0.034, rz=0.048, cz=0.048, power=2.2),   # 向后上方卷
        Ring(0.275, rx=0.016, rz=0.022, cz=0.062, power=2.2),
    ], 8)
    body.Add("RoofTile", head, tile="roof")

    # 下颌：往前伸出去咬住屋脊
    jaw = Loft([
        Ring(0.0, rx=0.050, rz=0.036, power=3.0),
        Ring(0.030, rx=0.044, rz=0.030, power=3.0),
    ], 6, smooth=False)
    Transform(jaw, rx=PI * 0.5)
    Transform(jaw, y=0.058, z=-0.100)
    body.Add("RoofTile", jaw, tile="roof")

    # 两只眼睛 + 一对犄角：低多边形，只保剪影
    for s in (-1, 1):
        eye = Loft([Ring(0.0, r=0.0), Ring(0.010, r=0.016), Ring(0.020, r=0.0)], 6)
        Transform(eye, rx=PI * 0.5)
        Transform(eye, x=s * 0.040, y=0.142, z=-0.086)
        body.Add("RoofTile", eye, tile="roof")
        horn = Loft([Ring(0.0, r=0.014), Ring(0.048, r=0.009), Ring(0.070, r=0.0)], 5)
        Transform(horn, rx=-0.5, rz=s * 0.42)
        Transform(horn, x=s * 0.046, y=0.192, z=-0.010)
        body.Add("RoofTile", horn, tile="roof")

    body.Child("ridge", t=(0.0, 0.0, 0.0))
    return root


def BuildWindowLattice():
    """格子窗棂：外框 + 步步锦格心。1.10 m 宽 × 1.35 m 高的一扇。

    格心用**竖 4 横 5** 的疏格 —— 再密就是把三角预算全喂给窗户了，
    而窗棂在巷战里通常是逆光剪影，密到看不清反而丢了「木格子」这个读数。
    """
    root = Node("root")
    body = root.Child("body")
    W, H, D = 1.10, 1.35, 0.055
    frame = 0.070

    for (w, h, x, y) in ((W, frame, 0.0, H * 0.5 - frame * 0.5),
                         (W, frame, 0.0, -H * 0.5 + frame * 0.5),
                         (frame, H - frame * 2, -W * 0.5 + frame * 0.5, 0.0),
                         (frame, H - frame * 2, W * 0.5 - frame * 0.5, 0.0)):
        bar = Box(w, h, D, bevel=0.006)
        Transform(bar, x=x, y=y + H * 0.5)
        body.Add("WoodDoor", bar, tile="wood")

    inner_w = W - frame * 2
    inner_h = H - frame * 2
    for i in range(4):
        x = (-0.5 + (i + 1) / 5.0) * inner_w
        bar = Box(0.026, inner_h, D * 0.62)
        Transform(bar, x=x, y=H * 0.5)
        body.Add("WoodDoor", bar, tile="wood")
    for j in range(5):
        y = (-0.5 + (j + 1) / 6.0) * inner_h
        bar = Box(inner_w, 0.026, D * 0.62)
        Transform(bar, y=y + H * 0.5)
        body.Add("WoodDoor", bar, tile="wood")

    body.Child("sillCenter", t=(0.0, 0.0, 0.0))
    return root


def BuildDoorPier():
    """门墩石（抱鼓石）：方座 + 鼓面。过墙石 #B3B0A6 那一档灰白石。

    鼓面用 Lathe 转出来（它本来就是个鼓），方座是带倒角的石料。
    原点在地面。
    """
    root = Node("root")
    body = root.Child("body")

    base = Box(0.360, 0.300, 0.480, bevel=0.018)
    Transform(base, y=0.150)
    body.Add("Stone", base, tile="stone")

    # 鼓：轴横着（面朝两侧），所以转完绕 Z 转 90°
    drum = Lathe([
        (0.0, -0.060), (0.195, -0.060), (0.215, -0.040),
        (0.215, 0.040), (0.195, 0.060), (0.0, 0.060),
    ], 12, smooth=True)
    Transform(drum, rz=PI * 0.5)
    Transform(drum, y=0.415)
    body.Add("Stone", drum, tile="stone")

    # 鼓钉一圈：只在朝外那面点六颗，低多边形
    for i in range(6):
        th = i / 6.0 * math.pi * 2.0
        stud = Loft([Ring(0.0, r=0.020), Ring(0.014, r=0.014), Ring(0.020, r=0.0)], 5)
        Transform(stud, rz=-PI * 0.5)
        Transform(stud, x=0.062, y=0.415 + math.sin(th) * 0.145, z=math.cos(th) * 0.145)
        body.Add("Stone", stud, tile="stone")

    body.Child("doorSide", t=(-0.180, 0.150, 0.0))
    return root


# ===========================================================================
# 滕县饰件轮（WP-E1）：铁路 / 教堂 / 监狱 / 道口
#
# 这一批的共同纪律：
#   ① 零件之间必须**真重叠**（AuditSolid 用连通块包围盒判，≥0.3 mm）。
#      建筑构件超预算只是慢，饰件飘着是穿帮 —— 一根悬空的信号臂在站台上
#      是第一眼就看见的事故。所以每加一块料都先想「它咬住谁」。
#   ② 段数抠到底：饰件是**成列摆**的（站台灯 6 盏、窗花 10 扇），
#      一件多 40 个三角，一关就多 400。圆截面一律 6 段，只有灯罩给到 10 段
#      （它是唯一一个会被玩家平视看到整个轮廓的旋转体）。
#   ③ 不做字：站牌、警示牌、匾额一律空牌面 —— 1938 年三月的字样无资料，
#      与 A7 的教堂匾额、B1 的站牌同一口径。
# ===========================================================================


def BuildSemaphoreSignal():
    """臂板信号机（下臂式）：基墩 + 格构杆 + 梯挂 + 臂板 + 配重杆。

    津浦路德建段的进站信号机。臂板是**木**的（早期臂板普遍是木板包铁，
    这里让它读成木头而不是钢板，也顺带把它从灰扑扑的杆子上分出来），
    杆、梯、配重全是漆过的铁（armor）。

    梯子不做独立的支架：七根踏棍**穿过杆子**（z 向做深到 0.20），
    这样 AuditSolid 的连通块判据一次就过，比另外加六个托架省 72 个三角。
    """
    root = Node("root")
    body = root.Child("body")

    # 混凝土基墩（读作石）：原点在它的底面，也就是地面
    base = Box(0.46, 0.24, 0.46)
    Transform(base, y=0.12)
    body.Add("Stone", base, tile="stone")

    # 杆：5.2 m 的收分方杆（power=4 让它读成型钢而不是水管）
    mast = Loft([
        Ring(0.16, r=0.088, power=4.0),
        Ring(2.60, r=0.070, power=4.0),
        Ring(5.05, r=0.055, power=4.0),
    ], 6, smooth=False)
    body.Add("armor", mast, tile="armor")
    cap = Loft([Ring(5.02, r=0.080, power=4.0), Ring(5.16, r=0.030, power=4.0)],
               6, smooth=False)
    body.Add("armor", cap, tile="armor")

    # 梯挂：两根边梃 + 七根踏棍
    for s in (-1, 1):
        stile = Box(0.036, 3.30, 0.036)
        Transform(stile, x=s * 0.140, y=1.85, z=0.170)
        body.Add("armor", stile, tile="armor")
    for i in range(7):
        rung = Box(0.31, 0.026, 0.200)
        Transform(rung, y=0.45 + i * 0.46, z=0.090)
        body.Add("armor", rung, tile="armor")

    # 臂板与它的托座
    bracket = Box(0.13, 0.30, 0.22)
    Transform(bracket, x=0.09, y=4.25)
    body.Add("armor", bracket, tile="armor")
    blade = Box(1.02, 0.20, 0.036)
    Transform(blade, x=0.62, y=4.25, z=0.100)
    body.Add("WoodDoor", blade, tile="wood")
    # 色灯框（臂板另一端的配重头，夜里挂灯的那一块）
    spec = Box(0.16, 0.30, 0.09)
    Transform(spec, x=-0.13, y=4.10)
    body.Add("armor", spec, tile="armor")

    # 底部配重杆 + 铅坨 + 一路通到臂板的拉杆
    lever = Box(0.34, 0.10, 0.24)
    Transform(lever, x=0.17, y=1.15, z=0.060)
    body.Add("armor", lever, tile="armor")
    weight = Box(0.13, 0.13, 0.07)
    Transform(weight, x=0.32, y=1.10, z=0.060)
    body.Add("armor", weight, tile="armor")
    rod = Box(0.03, 3.10, 0.03)
    Transform(rod, x=0.30, y=2.70, z=0.100)
    body.Add("armor", rod, tile="armor")

    body.Child("foot", t=(0.0, 0.0, 0.0))
    return root


def BuildStationLamp():
    """站台灯：铸铁灯柱 + 搪瓷灯罩 + 灯泡。3.2 m。

    灯罩用 10 段（全场唯一一个给到 10 段的旋转体）：它是站台上平视高度的
    唯一一条曲线，6 段的话在站台尽头看过去是个六棱漏斗，一眼假。
    灯泡给 Stone（近白）—— 白天读作磨砂玻璃，夜里靠场景光吃亮，
    饰件层没有独立光源（也不该有：一盏灯一个 light 就是六个 shadow pass）。
    """
    root = Node("root")
    body = root.Child("body")

    flare = Loft([
        Ring(0.00, r=0.170, power=3.0),
        Ring(0.10, r=0.115, power=3.0),
        Ring(0.26, r=0.075, power=3.0),
    ], 6, smooth=False)
    body.Add("armor", flare, tile="armor")

    post = Loft([Ring(0.22, r=0.062), Ring(2.86, r=0.048)], 6, smooth=False)
    body.Add("armor", post, tile="armor")

    collar = Box(0.11, 0.06, 0.11)
    Transform(collar, y=2.90)
    body.Add("armor", collar, tile="armor")

    shade = Loft([
        Ring(2.90, rx=0.300, rz=0.300, power=2.2),
        Ring(3.06, rx=0.190, rz=0.190, power=2.2),
        Ring(3.20, rx=0.050, rz=0.050, power=2.2),
    ], 10)
    body.Add("RoofTile", shade, tile="roof")

    # 灯泡顶端**插进灯罩 3 cm**：两块料齐平到 0.00 mm 就是共面 z-fighting
    #（AuditSolid 会点名），而 3 cm 的插入量在灯罩里看不见
    bulb = Loft([Ring(2.70, r=0.0), Ring(2.77, r=0.062), Ring(2.93, r=0.046)], 6)
    body.Add("Stone", bulb, tile="stone")

    body.Child("foot", t=(0.0, 0.0, 0.0))
    return root


def BuildChurchTracery():
    """尖券窗花：嵌进 A7 天主堂那种「石套 + 两根斜券石交成尖」的窗洞里。

    尺寸对的是**石套围出来的净洞**，不是 openW。这一条是出图换来的：
    AddLancetWindow 的两侧石套摆在 ±(openW/2 − 0.07)、各 0.15 宽 ⇒ 净宽只有
    openW − 0.29 = 1.21，斜券石的下端落在 y≈2.57、券尖内皮到 y≈3.03。
    第一版照 openW 1.50 / winH 2.60 / archH 0.89 建，结果是：两根竖边梃整根埋在
    石套里看不见，券头的圆窗心和两根斜石**从券尖上头戳出去**捅进屋面暗处。
    所以这里的三个数是净洞：1.21 / 2.57 / 0.46（斜率 50.6°，与石套的 rz=0.68 一致）。

    别的尺寸的窗洞由 Script_TrimProps 的 scale 缩放，**不在这里出第二个模型** ——
    一扇窗花两百个三角，出两个尺寸等于白付一份 draw call。

    做法上只有一条讲究：券头那个圆是**真的旋转体**（Lathe closed），
    不是四根小方料拼的八边形。窗花在教堂里通常是逆光剪影，剪影上一个
    多边形的圆是最刺眼的假。
    """
    root = Node("root")
    body = root.Child("body")
    W, H, ARCH = 1.21, 2.57, 0.46
    bar = 0.070

    # 两根竖边梃
    for s in (-1, 1):
        jamb = Box(0.090, H, bar)
        Transform(jamb, x=s * (W / 2 - 0.045), y=H / 2)
        body.Add("Stone", jamb, tile="stone")

    # 两根斜券石：从**边梃中线的顶端**交到尖顶。
    # 第一版拿 W/2 和 W/4 算这两个数，斜石的下端就落到边梃外面去了 ——
    # 出图上窗肩两侧各支出一个 3 cm 的角，读成「窗户长了两只耳朵」。
    # 起点必须是边梃的中线 jambX，不是窗洞的净宽边。
    jambX = W / 2 - 0.045
    lean = math.atan2(jambX, ARCH)
    span = math.hypot(jambX, ARCH)
    for s in (-1, 1):
        rib = Box(0.090, span + 0.03, bar)
        Transform(rib, rz=s * lean)
        Transform(rib, x=s * (jambX / 2), y=H + ARCH / 2)
        body.Add("Stone", rib, tile="stone")

    # 中挺 + 两道横档
    mull = Box(0.075, H, bar * 0.86)
    Transform(mull, y=H / 2)
    body.Add("Stone", mull, tile="stone")
    for y in (0.89, 1.83):
        rail = Box(W - 0.14, 0.060, bar * 0.80)
        Transform(rail, y=y)
        body.Add("Stone", rail, tile="stone")

    # 券头的圆窗心 + 一截把它吊在中挺上的短柱。
    # 圆心压到 H+0.18、外径 0.13：券里越往上越窄，半径大一档就顶出斜石外面去。
    ring = Lathe([
        (0.088, -0.024), (0.130, -0.024), (0.130, 0.024), (0.088, 0.024),
    ], 12, smooth=True, closed=True)
    Transform(ring, rx=PI * 0.5)
    Transform(ring, y=H + 0.18)
    body.Add("Stone", ring, tile="stone")
    stub = Box(0.075, 0.13, bar * 0.86)
    Transform(stub, y=H + 0.03)
    body.Add("Stone", stub, tile="stone")

    body.Child("sillCenter", t=(0.0, 0.0, 0.0))
    return root


def BuildCellDoorIron():
    """牢门五金：两道包铁 + 合页轴 + 竖铁 + 锁盒 + 锁鼻 + 挂锁 + 四颗门钉。

    A1 的牢门本身已经有两道 IronPlate 横箍（y=0.55 / 1.41），这一件**不重复
    那两道**：它落在 y=0.26 / 1.62 两档，中间靠一根竖铁串起来，锁盒挂在
    竖铁的中段（y≈1.02），正好落在原来两道箍中间的空当里。
    也就是说这件是「把程序化的两道箍补成一副完整的门五金」，不是盖住它们。

    原点在**门板外表面、门扇底边中点**，几何全部 z ≥ 0（朝门外），
    所以摆的人只要给门扇的外表面坐标，不用算门板厚度。
    """
    root = Node("root")
    body = root.Child("body")
    DW = 1.0                       # 牢门净宽（CELL.doorW）

    # 两道横包铁（贯通门宽）。**宽度按门板算不按门洞算**：A1 的门板是
    # doorW − 0.05 = 0.95 宽，包铁做到 0.94 才不会两头骑到砖墙上去
    #（第一版做 0.94 但中心偏了 0.02，合页轴整只翻出门板外，出图上贴在砖缝里）。
    for y in (0.26, 1.62):
        strap = Box(DW - 0.10, 0.085, 0.024)
        Transform(strap, y=y, z=0.012)
        body.Add("track", strap, tile="armor")
        # 合页轴：包铁在铰边卷成的一只筒
        knuckle = Box(0.055, 0.16, 0.055)
        Transform(knuckle, x=-0.445, y=y, z=0.012)
        body.Add("track", knuckle, tile="armor")
        # 门钉：一道箍上两颗（避开 x=0.30 的竖铁）
        for x in (-0.32, -0.08):
            stud = Loft([Ring(0.0, r=0.022), Ring(0.014, r=0.017), Ring(0.024, r=0.0)], 5)
            Transform(stud, rx=PI * 0.5)          # +Y → +Z：钉头朝门外
            Transform(stud, x=x, y=y, z=0.018)
            body.Add("track", stud, tile="armor")

    # 竖铁：把两道箍与锁盒串成一件
    spine = Box(0.050, 1.50, 0.020)
    Transform(spine, x=0.30, y=0.94, z=0.010)
    body.Add("track", spine, tile="armor")

    # 锁盒 + 锁鼻 + 挂锁
    plate = Box(0.26, 0.32, 0.026)
    Transform(plate, x=0.30, y=1.02, z=0.013)
    body.Add("track", plate, tile="armor")
    staple = Lathe([
        (0.052, -0.016), (0.082, -0.016), (0.082, 0.016), (0.052, 0.016),
    ], 6, smooth=False, closed=True)
    Transform(staple, rx=PI * 0.5)
    # 锁鼻要同时咬住竖铁（z ≤ 0.020）与锁盒（z ≤ 0.026）：z=0.034 时对两块料
    # 各留 2 mm / 8 mm 的真重叠。齐平到 0.00 mm 就是共面 z-fighting，AuditSolid 会点名。
    Transform(staple, x=0.30, y=0.95, z=0.034)
    body.Add("track", staple, tile="armor")
    lock = Box(0.085, 0.110, 0.050)
    Transform(lock, x=0.30, y=0.855, z=0.042)
    body.Add("track", lock, tile="armor")

    body.Child("doorFace", t=(0.0, 0.0, 0.0))
    return root


def BuildCrossingSign():
    """道口标：斜十字牌 + 一块空警示牌 + 木杆 + 石基。

    牌面**不刻字**（同 B1 的站牌、A7 的匾额）。斜十字本身就是道口的国际读法，
    不需要字；而 1938 年三月津浦路道口标的字样与形制都没有资料。
    牌面走 Stone（近白）——刷白灰的木牌，与灰青的县城拉得开。
    """
    root = Node("root")
    body = root.Child("body")

    base = Box(0.34, 0.24, 0.34)
    Transform(base, y=0.12)
    body.Add("Stone", base, tile="stone")

    # 杆顶收在 2.10：斜十字的交点在 2.02，杆再高一档就会从两条上斜臂之间戳出来
    # 一截木头（出图抓到），读成「十字牌插在电线杆上」。
    post = Loft([Ring(0.16, r=0.078, power=4.0), Ring(2.10, r=0.062, power=4.0)],
                6, smooth=False)
    body.Add("WoodDoor", post, tile="wood")

    for s in (-1, 1):
        blade = Box(1.34, 0.18, 0.032)
        Transform(blade, rz=s * PI * 0.25)
        Transform(blade, y=2.02, z=0.070)
        body.Add("Stone", blade, tile="stone")

    warn = Box(0.60, 0.26, 0.026)
    Transform(warn, y=1.42, z=0.070)
    body.Add("Stone", warn, tile="stone")

    body.Child("foot", t=(0.0, 0.0, 0.0))
    return root


PROP_BUILDERS = {
    "Dougong": BuildDougong,
    "RidgeBeast": BuildRidgeBeast,
    "WindowLattice": BuildWindowLattice,
    "DoorPier": BuildDoorPier,
    # —— 滕县饰件轮（WP-E1）——
    "SemaphoreSignal": BuildSemaphoreSignal,
    "StationLamp": BuildStationLamp,
    "ChurchTracery": BuildChurchTracery,
    "CellDoorIron": BuildCellDoorIron,
    "CrossingSign": BuildCrossingSign,
}

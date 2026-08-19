# -*- coding: utf-8 -*-
"""建筑构件：门楼斗拱 / 屋脊兽头 / 格子窗棂 / 门墩石。

够用即可，别贪多 —— 这四件是台儿庄那种鲁南运河商镇门楼上「一眼中式」的最小集合。
放置、复制、朝向是 Script_World 那边的事，这里只出零件，原点一律在**安装面**上
（斗拱在坐斗底、兽头在脊面、窗棂在窗框外沿、门墩在地面），摆的人不用猜。

色板是史实红线：青砖 #7E8388（灰蓝，**不是红砖**）、小青瓦 #6E7276、
过墙石 #B3B0A6、夯土 #A8926E —— 这里只出几何，颜色由材质名（Stone/WoodBeam/
RoofTile）到 MaterialLibrary 的配方决定，别在几何里烤颜色。

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


PROP_BUILDERS = {
    "Dougong": BuildDougong,
    "RidgeBeast": BuildRidgeBeast,
    "WindowLattice": BuildWindowLattice,
    "DoorPier": BuildDoorPier,
}

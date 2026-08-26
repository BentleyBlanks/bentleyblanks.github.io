# -*- coding: utf-8 -*-
"""士兵模型：川军第 22 集团军第 122 师 / 日军濑谷支队。

骨架层级与 Script_Actor.mjs 的 Actor 构造函数**逐字对齐**（root > body > hips >
chest > neck；shoulder/elbow；thigh/knee/ankle），关节局部偏移用同一套
Dimensions() 比值算出来。这样下游 agent 换模只需要把 AttachBone 的几何来源
从 KindGeometry() 换成 LoadModel()，姿态代码一行不用改。

史实红线（docs/Data_HistoryMaterial.md 第三节，不许在这里即兴发挥）：
  · 川军第 22 集团军：灰蓝土布军装、**布军帽 + 青天白日帽徽**、绑腿、草鞋、
    布制子弹带斜挎且**大部分格子瘪着**。**绝不给钢盔** —— 那是中央军的。
  · 日方：**立领昭五式** + 步兵红领章 + **九〇式钢盔**（正面黄铜五角星）、
    皮弹药盒三只、编上靴 + 脚绊。**1938 年 3—4 月绝不能有屁帘**。

三角预算 ≤ 1800/人。省三角的思路不是砍零件，是砍**段数**：躯干 12 段、
四肢 8 段、头 10 段。剪影靠截面比例，不靠段数。
"""

import math

from TzmCore import (Box, Join, Lathe, Loft, Node, Ring, RibbonYz, Strip, Transform, TubeY)

PI = math.pi


def Dimensions(height):
    """与 Script_Actor.Dimensions 同一套比值（1930 年代中日士兵：腿短、肩不宽）。"""
    H = height
    return {
        "height": H,
        "ankleY": 0.055 * H, "kneeY": 0.285 * H, "hipY": 0.520 * H, "waistY": 0.600 * H,
        "shoulderY": 0.820 * H, "neckY": 0.855 * H,
        "thighLen": (0.520 - 0.285) * H,
        "shinLen": (0.285 - 0.055) * H,
        "upperArmLen": 0.165 * H,
        "forearmLen": 0.155 * H,
        "hipHalf": 0.050 * H,
        "shoulderHalf": 0.113 * H,
        "waistHalf": 0.086 * H, "waistDepth": 0.068 * H,
        "chestHalf": 0.107 * H, "chestDepth": 0.083 * H,
        "headW": 0.102 * H, "headH": 0.132 * H, "headD": 0.126 * H,
        "footLen": 0.148 * H, "footW": 0.056 * H, "footH": 0.055 * H,
    }


SEG_BODY = 12
SEG_LIMB = 8
SEG_HEAD = 10


def SoftBox(w, h, d, segments=6, power=3.4):
    """软方料：弹药盒、干粮袋、子弹带的鼓格。

    为什么不用 Box(bevel=…)：倒角立方体是 44 三角，这个是 32，而且**布/皮的
    形状本来就是软的**——超椭圆的圆角比机械倒角更像装满了东西的袋子。
    一个士兵身上有六七块这种料，省下来的一百多三角刚好是一条绑腿的层叠。
    """
    return Loft([
        Ring(-h * 0.5, rx=w * 0.44, rz=d * 0.44, power=power),
        Ring(0.0, rx=w * 0.50, rz=d * 0.50, power=power),
        Ring(h * 0.5, rx=w * 0.44, rz=d * 0.44, power=power),
    ], segments)


# ---------------------------------------------------------------------------
# 共用零件
# ---------------------------------------------------------------------------

def Torso(d, chestLift, collarStand):
    """躯干：从腰到肩的放样。**肩宽腰窄的收分是「不是胶囊」的第一眼判据**，
    截面用 power=2.7 的超椭圆 —— 人的胸廓横截面是扁的圆角矩形，不是正圆。"""
    base = d["waistY"] - d["waistY"]     # 局部系原点 = 腰
    top = d["shoulderY"] - d["waistY"]
    rings = [
        Ring(base - 0.02, rx=d["waistHalf"] * 0.98, rz=d["waistDepth"] * 0.98, power=2.6),
        Ring(base + top * 0.22, rx=d["waistHalf"] * 1.02, rz=d["waistDepth"] * 1.02, power=2.6),
        Ring(base + top * 0.52, rx=d["chestHalf"] * 0.92, rz=d["chestDepth"] * 0.98, power=2.7),
        Ring(base + top * 0.80, rx=d["chestHalf"], rz=d["chestDepth"], power=2.8),
        Ring(base + top + chestLift, rx=d["chestHalf"] * 0.97, rz=d["chestDepth"] * 0.9, power=3.0),
        # 肩线之上再收一圈，肩头才有「削肩」的转折而不是一刀切平
        Ring(base + top + chestLift + 0.024, rx=d["chestHalf"] * 0.72, rz=d["chestDepth"] * 0.66, power=3.0),
    ]
    if collarStand > 0.0:
        # 立领：昭五式的识别点。领子必须比脖子粗、比肩窄，且**高出肩线一截**
        rings.append(Ring(base + top + chestLift + 0.030, rx=0.062, rz=0.058, power=2.4))
        rings.append(Ring(base + top + chestLift + 0.030 + collarStand, rx=0.060, rz=0.056, power=2.4))
    return Loft(rings, SEG_BODY)


def Pelvis(d):
    """胯：一段带前后厚度差的短放样，上口对腰、下口分出两条腿根。"""
    return Loft([
        Ring(-0.02 * d["height"], rx=d["hipHalf"] * 2.35, rz=d["waistDepth"] * 0.96, power=3.0),
        Ring(0.028 * d["height"], rx=d["waistHalf"] * 1.02, rz=d["waistDepth"] * 1.0, power=2.8),
        Ring(0.078 * d["height"], rx=d["waistHalf"] * 0.99, rz=d["waistDepth"] * 0.98, power=2.7),
    ], SEG_BODY)


def UpperArm(d, sleeve, segments=SEG_LIMB):
    """上臂：**有粗细变化的旋转体**，肩头鼓、肘窝收。圆柱一眼假就假在这里。

    半径是按**连军装袖子** φ12—13 cm 定的。原来给的 0.052H（φ17.3，袖子一乘
    到 φ18.7）比大腿还粗，剪影上两条胳膊糊成两根圆木，遮住半个躯干。"""
    L = d["upperArmLen"]
    r = 0.040 * d["height"]
    return Loft([
        Ring(0.018, r=r * 1.02 * sleeve, power=2.3),
        Ring(-L * 0.18, r=r * 1.00 * sleeve, power=2.2),
        Ring(-L * 0.62, r=r * 0.84 * sleeve, power=2.2),
        Ring(-L * 1.00, r=r * 0.74, power=2.2),
    ], segments)


def ForeArm(d, sleeve, cuff, segments=SEG_LIMB):
    """小臂 + 袖口。cuff>0 时袖口鼓出一圈（军装袖口是有翻边的）。"""
    L = d["forearmLen"]
    r = 0.033 * d["height"]
    rings = [
        Ring(0.008, r=r * 0.98 * sleeve, power=2.2),
        Ring(-L * 0.35, r=r * 0.90 * sleeve, power=2.2),
        Ring(-L * 0.72, r=r * 0.74 * sleeve, power=2.2),
    ]
    if cuff > 0.0:
        rings.append(Ring(-L * 0.78, r=r * 0.80 * sleeve, power=2.2))
        rings.append(Ring(-L * 0.86, r=r * 0.72, power=2.2))
    else:
        rings.append(Ring(-L * 0.88, r=r * 0.66, power=2.2))
    return Loft(rings, segments)


def Hand(d, side):
    """手：一块带收分的方料 + 一个拇指。段数极省，但握枪时能看出五指方向。"""
    H = d["height"]
    palm = Loft([
        Ring(0.0, rx=0.026 * H * 0.5, rz=0.019 * H * 0.5, power=3.0),
        Ring(-0.030 * H, rx=0.027 * H * 0.5, rz=0.020 * H * 0.5, power=3.2),
        Ring(-0.060 * H, rx=0.024 * H * 0.5, rz=0.017 * H * 0.5, power=3.2),
        Ring(-0.070 * H, rx=0.017 * H * 0.5, rz=0.013 * H * 0.5, power=3.0),
    ], 6)
    thumb = TubeY(0.0075 * H * 0.5 * 2, 0.006 * H, 0.030 * H, 5)
    Transform(thumb, x=side * 0.014 * H, y=-0.028 * H, z=0.006 * H, rz=side * 0.55)
    return Join(palm, thumb)


def Thigh(d, trouser, segments=SEG_LIMB):
    """大腿：军裤是宽松的，上粗下细但**膝上要留一点垮下来的余量**。"""
    L = d["thighLen"]
    r = 0.059 * d["height"]
    return Loft([
        Ring(0.02, rx=r * 1.06 * trouser, rz=r * 1.00 * trouser, power=2.6),
        Ring(-L * 0.30, rx=r * 0.95 * trouser, rz=r * 0.92 * trouser, power=2.5),
        Ring(-L * 0.70, rx=r * 0.80 * trouser, rz=r * 0.80 * trouser, power=2.4),
        Ring(-L * 1.00, rx=r * 0.66, rz=r * 0.68, power=2.4),
    ], segments)


def ShinPuttee(d, wraps, tone, segments=SEG_LIMB):
    """小腿 + 绑腿。

    **绑腿是缠出来的层叠，不是一根管子**：半径沿高度做锯齿（每圈鼓 1.6 mm、
    交界处收回来），再让每一圈的截面绕 Y 微微 roll 一点，斜缠的错层就出来了。
    这一招不多花一个三角形 —— 层数就是放样的圈数。
    """
    L = d["shinLen"]
    kneeR = 0.053 * d["height"]
    ankleR = 0.032 * d["height"]
    rings = [Ring(0.015, r=kneeR * 1.02, power=2.4),
             Ring(-L * 0.14, r=kneeR * 0.94, power=2.4)]
    # 绑腿从膝下缠到踝上
    top, bottom = -L * 0.18, -L * 0.94
    for i in range(wraps * 2 + 1):
        t = i / (wraps * 2.0)
        y = top + (bottom - top) * t
        base = kneeR * 0.90 + (ankleR - kneeR * 0.90) * t
        bulge = 1.0 + (0.055 if i % 2 == 0 else -0.012) * tone
        rings.append(Ring(y, r=base * bulge, power=2.35, roll=t * 0.9))
    rings.append(Ring(-L * 1.0, r=ankleR * 0.92, power=2.3))
    return Loft(rings, segments)


def Foot(d, toeLift):
    """脚：**高度等于踝高**，从踝一直铺到地面。随手给个厚度人会陷进地里。"""
    L, W, H = d["footLen"], d["footW"], d["footH"]
    return Loft([
        Ring(0.0, rx=W * 0.86, rz=L * 0.22, cz=L * 0.10, power=3.0),
        Ring(-H * 0.45, rx=W * 0.98, rz=L * 0.34, cz=L * 0.02, power=3.2),
        Ring(-H * 0.90, rx=W * 1.00, rz=L * 0.44, cz=-L * 0.06, power=3.6),
        Ring(-H, rx=W * 0.90, rz=L * 0.42 - toeLift, cz=-L * 0.07, power=3.6),
    ], SEG_LIMB)


def BareFoot(d):
    """草鞋里露出的脚。

    参考出川老照片：脚背与趾根不被鞋面包住，只有草绳压在皮肤上。这里把旧版
    一整块“鞋楦”缩成 6 边、4 截面的裸脚，省下来的面数全部留给鞋底和系带。
    """
    L, W, H = d["footLen"], d["footW"], d["footH"]
    # Loft 默认沿 Y；先沿“脚长”放样，再绕 X 转平，才能让脚背是圆顺的长体，
    # 而不是旧版从踝向鞋头扩张的三角楔。旋转后旧 Y 变成前方 -Z，旧 Z 变成高度 Y。
    foot = Loft([
        Ring(-L * 0.20, rx=W * 0.62, rz=H * 0.42, cz=-H * 0.42, power=2.6),
        Ring(L * 0.08, rx=W * 0.76, rz=H * 0.34, cz=-H * 0.46, power=2.7),
        Ring(L * 0.55, rx=W * 0.96, rz=H * 0.26, cz=-H * 0.58, power=2.8),
        Ring(L * 0.80, rx=W * 0.86, rz=H * 0.16, cz=-H * 0.72, power=2.7),
    ], 6)
    Transform(foot, rx=-PI * 0.5)
    return foot


def StrawSandal(d):
    """川军草鞋：薄编底、交叉系带与前掌分束草绳。

    草鞋最重要的不是颜色，而是“薄底 + 露趾 + 绳带”的负空间。两道斜带从前掌
    收向踝部；鞋头三束短绳把前缘分开，近景低机位能读出参考照片里的草编节奏。
    """
    L, W, H = d["footLen"], d["footW"], d["footH"]
    soleH = 0.012
    parts = [Loft([
        Ring(-H, rx=W * 1.02, rz=L * 0.48, cz=-L * 0.06, power=3.6),
        Ring(-H + soleH, rx=W * 1.00, rz=L * 0.47, cz=-L * 0.06, power=3.6),
    ], 6, smooth=False)]

    # 从鞋缘斜跨脚背的两根草绳；长轴沿 Z，绕 Y 后形成 V 字。
    for side in (-1, 1):
        strap = Box(0.012, 0.010, L * 0.38)
        Transform(strap, y=-H * 0.12, z=-L * 0.38, ry=side * 0.38)
        parts.append(strap)

    # 鞋头三束 U 形趾环：从脚背越过趾尖再扣回鞋底前缘，正面不再是三个方块。
    for i in (-1, 0, 1):
        toeRope = RibbonYz([
            (-H * 0.48, -L * 0.56),
            (-H * 0.42, -L * 0.72),
            (-H * 0.70, -L * 0.82),
        ], W * 0.15, 0.009)
        Transform(toeRope, x=i * W * 0.43)
        parts.append(toeRope)
    return Join(*parts)


def HeadShape(d):
    """头：颅顶圆、下颌方并且往前收 —— **下巴的剪影**是「有脸」的最低要求。

    **脸朝 -Z。** 这条跟躯干（枪在 -Z、背包在 +Z）是同一个约定。
    整个头部这一套（头/帽/帽檐/帽徽/钢盔/五角星/eyes 挂点）原来是按 +Z 摆的，
    等于**把头装反了**：帽檐扣在后脑勺上、帽徽长在脑后、eyes 挂点在后脑 —— 而
    帽徽与领章是史实红线里点名的敌我识别标志，正面看过去一个都没有。
    """
    W, HH, D = d["headW"], d["headH"], d["headD"]
    return Loft([
        Ring(-HH * 0.50, rx=W * 0.30, rz=D * 0.26, cz=-D * 0.02, power=2.6),     # 下巴尖
        Ring(-HH * 0.36, rx=W * 0.40, rz=D * 0.36, cz=D * 0.01, power=2.8),      # 下颌
        Ring(-HH * 0.14, rx=W * 0.47, rz=D * 0.44, cz=D * 0.02, power=2.8),      # 颧骨
        Ring(HH * 0.08, rx=W * 0.50, rz=D * 0.47, cz=D * 0.03, power=2.7),       # 颅最宽
        Ring(HH * 0.30, rx=W * 0.45, rz=D * 0.42, cz=D * 0.04, power=2.5),
        Ring(HH * 0.46, rx=W * 0.30, rz=D * 0.27, cz=D * 0.04, power=2.3),
        Ring(HH * 0.52, r=0.0),
    ], SEG_HEAD)


def Neck(d):
    return Loft([Ring(0.0, rx=0.038, rz=0.034, power=2.4),
                 Ring(0.042, rx=0.036, rz=0.032, power=2.4)], 8)


# ---------------------------------------------------------------------------
# 中方：布军帽 + 青天白日帽徽
# ---------------------------------------------------------------------------

def FieldCap(d):
    """布军帽（非钢盔）。帽筒略呈梯形、**帽檐是短而硬的一片**，
    帽墙上还有一圈翻起来的护耳布带 —— 这三样凑齐才不像棒球帽。"""
    W, HH, D = d["headW"], d["headH"], d["headD"]
    crown = Loft([
        Ring(HH * 0.02, rx=W * 0.53, rz=D * 0.50, cz=D * 0.03, power=2.7),
        Ring(HH * 0.16, rx=W * 0.54, rz=D * 0.51, cz=D * 0.03, power=2.7),    # 帽墙
        Ring(HH * 0.20, rx=W * 0.55, rz=D * 0.52, cz=D * 0.03, power=2.7),    # 翻边
        Ring(HH * 0.40, rx=W * 0.50, rz=D * 0.47, cz=D * 0.04, power=2.5),
        Ring(HH * 0.56, rx=W * 0.34, rz=D * 0.31, cz=D * 0.05, power=2.3),
        Ring(HH * 0.62, r=0.0),
    ], SEG_HEAD)
    # 帽檐：一片下倾的扁料，前缘比根部窄。装在**脸这一侧**（-Z），
    # 前缘往下扣 —— 所以摆到 -Z 之后俯仰角要跟着反号，不然帽檐是往天上翘的。
    brim = Loft([
        Ring(0.0, rx=W * 0.50, rz=D * 0.115, cz=0.0, power=3.4),
        Ring(-0.009, rx=W * 0.40, rz=D * 0.100, cz=0.0, power=3.4),
    ], 8, smooth=False)
    Transform(brim, rx=-0.30)
    # 往前挪到**探出帽墙 3.5 cm** 的位置（帽墙前缘在 z=-0.48D）：原来那片只探出
    # 4 mm，等于没有帽檐，正面看这顶帽子是个圆帽壳，跟布军帽的剪影对不上。
    Transform(brim, y=HH * 0.06, z=-D * 0.55)
    return Join(crown, brim)


def SunBadgeBlue(d):
    """青天白日帽徽的蓝底。全场唯二的高饱和点之一，直径只有 12 mm ——
    轮廓压成两段（两端都收到轴上），转出来是 12 个三角的透镜片。
    帽徽在屏幕上是三个像素，给它 60 个三角是把预算烧在看不见的地方。"""
    disc = Lathe([(0.0, 0.0), (0.0128, 0.0011), (0.0, 0.0024)], 6, smooth=False)
    Transform(disc, rx=-PI * 0.5)
    Transform(disc, y=d["headH"] * 0.16, z=-d["headD"] * 0.50)
    return disc


def SunBadgeWhite(d):
    """白日十二芒。芒尖靠 10 边低多边形的锥面暗示，不逐根建 ——
    12 根光芒逐根建是 100+ 三角，而它在屏幕上比一个像素大不了多少。"""
    sun = Lathe([(0.0, 0.0), (0.0092, 0.0012), (0.0, 0.0034)], 10, smooth=False)
    Transform(sun, rx=-PI * 0.5)
    Transform(sun, y=d["headH"] * 0.16, z=-d["headD"] * 0.50 - 0.0022)
    return sun


def Bandolier(d):
    """布制子弹带，斜挎。

    **大部分格子必须是瘪的** —— 这是一眼读出「第 31 师缺弹」的美术语言，
    不是装饰。做法：带子本体一条 Strip，只在靠身的前三格加鼓包，
    其余格子只有缝线的凹凸（靠贴图，几何不加）。
    """
    H = d["height"]
    cx, cd = d["chestHalf"], d["chestDepth"]
    # 从右肩绕到左腰，前后各走一段
    path = [
        (0.045 * H, 0.205 * H, -cd * 0.55),
        (0.070 * H, 0.150 * H, -cd * 0.92),
        (0.030 * H, 0.055 * H, -cd * 1.02),
        (-0.045 * H, -0.020 * H, -cd * 0.90),
        (-0.082 * H, -0.045 * H, -cd * 0.10),
        (-0.070 * H, 0.010 * H, cd * 0.86),
        (0.000, 0.105 * H, cd * 1.00),
        (0.048 * H, 0.200 * H, cd * 0.55),
    ]
    belt = Strip(path, 0.052, 0.012)
    parts = [belt]
    # 鼓着的三格：位置取路径上靠胸前的那几段。**其余格子几何上一点不鼓** ——
    # 瘪不是「少建一点」，瘪就是这条带子的常态。
    for i, t in enumerate((1, 2, 3)):
        p = path[t]
        pouch = SoftBox(0.044, 0.052, 0.026)
        Transform(pouch, x=p[0] * 1.0, y=p[1], z=p[2] * 1.18, rz=-0.5 + i * 0.12)
        parts.append(pouch)
    return Join(*parts)


def HaversackAndBelt(d):
    """腰带 + 干粮袋 + 水壶。中方装具是布的，形状软、边角圆。"""
    H = d["height"]
    belt = Loft([
        Ring(-0.017 * H, rx=d["waistHalf"] * 1.05, rz=d["waistDepth"] * 1.05, power=2.7),
        Ring(0.017 * H, rx=d["waistHalf"] * 1.05, rz=d["waistDepth"] * 1.05, power=2.7),
    ], SEG_BODY, capStart=False, capEnd=False, smooth=False)
    bag = SoftBox(0.115, 0.135, 0.052, segments=6, power=3.0)
    Transform(bag, x=-0.078 * H, y=-0.030 * H, z=d["waistDepth"] * 0.72)
    strap = Strip([(-0.030 * H, 0.195 * H, -d["chestDepth"] * 0.5),
                   (-0.062 * H, 0.100 * H, -d["chestDepth"] * 0.95),
                   (-0.080 * H, 0.010 * H, -d["chestDepth"] * 0.5),
                   (-0.082 * H, -0.020 * H, d["waistDepth"] * 0.6)], 0.038, 0.009)
    return Join(belt, bag, strap)


# ---------------------------------------------------------------------------
# 日方：九〇式钢盔 / 立领昭五式 / 皮弹药盒
# ---------------------------------------------------------------------------

def Type90Helmet(d):
    """九〇式钢盔：**半球带小檐、边缘向外翻卷**。

    翻卷的边是这顶盔和德式 M35 / 英式飞碟盔的分界，靠放样最后两圈半径
    先扩后微收做出来（扩 8%、再回 2%），一圈额外顶点换一个正确的剪影。
    正面五角星单独一块（accentB / 黄铜色），不并进盔体。
    """
    W, HH, D = d["headW"], d["headH"], d["headD"]
    rx, rz = W * 0.585, D * 0.545
    rings = [
        Ring(HH * 0.575, r=0.0),
        Ring(HH * 0.545, rx=rx * 0.30, rz=rz * 0.30, power=2.2),
        Ring(HH * 0.430, rx=rx * 0.62, rz=rz * 0.62, power=2.3),
        Ring(HH * 0.240, rx=rx * 0.86, rz=rz * 0.87, power=2.4),
        Ring(HH * 0.020, rx=rx * 0.98, rz=rz * 0.99, power=2.5),
        Ring(-HH * 0.150, rx=rx * 1.00, rz=rz * 1.00, power=2.5),
        Ring(-HH * 0.235, rx=rx * 1.08, rz=rz * 1.09, power=2.5),   # 外翻
        Ring(-HH * 0.268, rx=rx * 1.06, rz=rz * 1.07, power=2.5),   # 卷回
    ]
    dome = Loft(rings, SEG_HEAD, capStart=False, capEnd=False)
    # 盔沿前方稍微拉长成小檐：靠一块窄放样贴在前缘，比整体加圈便宜
    peak = Loft([
        Ring(0.0, rx=rx * 0.62, rz=rz * 0.10, power=3.2),
        Ring(-0.012, rx=rx * 0.50, rz=rz * 0.075, power=3.2),
    ], 8, smooth=False)
    Transform(peak, rx=-0.34)
    Transform(peak, y=-HH * 0.205, z=-rz * 1.00)
    # 盔箍（内衬圈露出来的一线）
    band = Loft([
        Ring(-HH * 0.150, rx=rx * 0.97, rz=rz * 0.98, power=2.5),
        Ring(-HH * 0.220, rx=rx * 0.95, rz=rz * 0.96, power=2.5),
    ], SEG_HEAD, capStart=False, capEnd=False, smooth=False)
    return Join(dome, peak, band)


def HelmetStar(d):
    """正面黄铜五角星。五角靠 5 段 Lathe 的星形轮廓做不到，直接用一个
    5 边棱台 + 中心抬高 —— 屏幕上它只有几个像素，剪影是五边形就够。"""
    star = Lathe([(0.0, 0.0), (0.0165, 0.0), (0.0060, 0.0034), (0.0, 0.0038)], 5, smooth=False)
    # 先绕车削轴（Y）转 18°，再立起来 —— 顺序反了的话 ry 是在**已经立起来的**
    # 星上做偏航，星面就不正对前方了（原来那版就是反的，只是 16 mm 的星看不出来）
    Transform(star, ry=PI * 0.1)   # 让一个尖朝上
    Transform(star, rx=-PI * 0.5)
    Transform(star, y=d["headH"] * 0.02, z=-d["headD"] * 0.545 - 0.004)
    return star


def CollarTab(d, side):
    """步兵红领章：立领两侧各一块长方形红呢。1938 年昭五式的兵种色，
    步兵是红（#B03A2E）。做成薄片、单面装错就看不见，所以加载器给 accentA
    的材质本来就是 DoubleSide。"""
    tab = Box(0.030, 0.020, 0.006)
    Transform(tab, rz=side * 0.10)
    return tab


def LeatherPouches(d):
    """皮弹药盒三只：腰前左右各一小盒（各 30 发）、后腰一大盒（60 发 + 油壶）。
    这是九九式之前的标准配置，位置不能乱摆。"""
    H = d["height"]
    parts = []
    for s in (-1, 1):
        small = SoftBox(0.072 * H, 0.058 * H, 0.042 * H, power=4.0)
        Transform(small, x=s * 0.052 * H, y=-0.012 * H, z=-d["waistDepth"] - 0.016 * H)
        parts.append(small)
    big = SoftBox(0.150 * H, 0.070 * H, 0.050 * H, power=4.0)
    Transform(big, y=-0.012 * H, z=d["waistDepth"] + 0.020 * H)
    parts.append(big)
    belt = Loft([
        Ring(-0.016 * H, rx=d["waistHalf"] * 1.04, rz=d["waistDepth"] * 1.04, power=2.7),
        Ring(0.016 * H, rx=d["waistHalf"] * 1.04, rz=d["waistDepth"] * 1.04, power=2.7),
    ], SEG_BODY, capStart=False, capEnd=False, smooth=False)
    parts.append(belt)
    # 刺刀鞘挂左腰
    scabbard = Loft([
        Ring(0.0, rx=0.012, rz=0.016, power=3.0),
        Ring(-0.24, rx=0.011, rz=0.014, power=3.0),
        Ring(-0.29, rx=0.006, rz=0.008, power=3.0),
    ], 6)
    Transform(scabbard, x=-d["waistHalf"] - 0.020 * H, y=-0.10 * H, z=0.02 * H, rx=0.18)
    parts.append(scabbard)
    return Join(*parts)


def MarchingBoot(d):
    """编上靴：靴筒到小腿肚，**外面再打脚绊（布带缠踝）**。日军没有绑腿，
    脚绊只缠踝上一小段 —— 别做成中方那种缠到膝下的绑腿。"""
    L = d["shinLen"]
    kneeR = 0.053 * d["height"]
    ankleR = 0.034 * d["height"]
    rings = [Ring(0.015, r=kneeR * 1.02, power=2.4),
             Ring(-L * 0.20, r=kneeR * 0.92, power=2.4),
             Ring(-L * 0.52, r=kneeR * 0.74, power=2.4),
             Ring(-L * 0.62, r=ankleR * 1.16, power=2.5)]     # 靴筒口
    for i in range(5):
        t = i / 4.0
        y = -L * 0.66 - L * 0.30 * t
        bulge = 1.0 + (0.05 if i % 2 == 0 else -0.01)
        rings.append(Ring(y, r=ankleR * (1.10 - 0.14 * t) * bulge, power=2.4, roll=t * 0.8))
    rings.append(Ring(-L, r=ankleR * 0.92, power=2.3))
    return Loft(rings, SEG_LIMB)


# ---------------------------------------------------------------------------
# 组装
# ---------------------------------------------------------------------------

def Limbs(root, d, spec):
    """四肢 + 手脚。左右各一套，几何镜像用 sx=-1 会翻绕向，所以这里
    重新生成而不是镜像 —— 多几行代码换一个不会背面剔除翻掉的模型。

    **百姓（BuildCivilians）也走这一个函数。** 关节偏移
    （肩 shoulderHalf / 肘 upperArmLen / 胯 hipHalf / 膝 thighLen / 踝 shinLen）
    必须与 Script_Actor 的 Actor 构造函数逐字一致，抄第二份迟早会漂 ——
    所以军民共用这一份，差异全部走 spec：
      legMaterial  大腿那一桶的材质名（军装 uniform / 百姓 trouser）
      shinParts    小腿段自建：[(节点名前缀, 材质, fn(d, segments))]，
                   给了就不走 legwrap 那两支
      footParts    踝下自建：[(材质, fn(d))]，给了就不走 footwear 那两支
    """
    hips = root["hips"]
    chest = root["chest"]
    sleeve = spec["sleeve"]
    armSegments = spec.get("armSegments", SEG_LIMB)
    legSegments = spec.get("legSegments", SEG_LIMB)

    for tag, side in (("L", -1), ("R", 1)):
        shoulder = chest.Child(
            "shoulder" + tag,
            t=(side * d["shoulderHalf"], d["shoulderY"] - d["waistY"] - 0.02 * d["height"], 0.0),
            joint=True)
        shoulder.Add("uniform", UpperArm(d, sleeve, armSegments), tile="cloth")
        if spec["shoulderStrap"]:
            # 肩襻：昭五式肩上一条布襻，中方军装没有。加它是为了区分两军的肩部剪影
            shoulder.Child("epaulet" + tag, t=(0.0, 0.012, 0.004))                 .Add("uniform", Box(0.030, 0.008, 0.062, bevel=0.003), tile="cloth")

        elbow = shoulder.Child("elbow" + tag, t=(0.0, -d["upperArmLen"], 0.0), joint=True)
        elbow.Add("uniform", ForeArm(d, sleeve, spec["cuff"], armSegments), tile="cloth")
        # 手是 elbow 底下的**非关节**子节点。骨架仍与 Script_Actor 一致
        #（没有独立的手关节），但几何挂在一个有名字、有偏移的节点上：
        # 加载器合批时会把它烘回小臂那一桶，而想单独换一只手也找得到。
        elbow.Child("hand" + tag, t=(0.0, -d["forearmLen"] * 0.90, 0.0))             .Add("skin", Hand(d, side), tile="cloth")
        # 手心挂点：视图模型和 IK 都要它
        elbow.Child("grip" + tag, t=(0.0, -d["forearmLen"] * 0.96, 0.010))

    for tag, side in (("L", -1), ("R", 1)):
        thigh = hips.Child("thigh" + tag, t=(side * d["hipHalf"], 0.0, 0.0), joint=True)
        thigh.Add(spec.get("legMaterial", "uniform"),
                  Thigh(d, spec["trouser"], legSegments), tile="cloth")

        knee = thigh.Child("knee" + tag, t=(0.0, -d["thighLen"], 0.0), joint=True)
        if spec.get("shinParts"):
            for name, material, build in spec["shinParts"]:
                knee.Child(name + tag).Add(material, build(d, legSegments), tile="cloth")
        elif spec["legwrap"] == "puttee":
            # 绑腿的层叠单独一块（accessory 桶：色同军装或更浅）
            # 4 层：再多一层只多 32 个三角，但 4 层已经能读出「缠」的节奏
            knee.Child("puttee" + tag).Add(
                "accessory", ShinPuttee(d, 4, 1.0, legSegments), tile="cloth")
        else:
            knee.Child("boot" + tag).Add("leather", MarchingBoot(d), tile="cloth")

        ankle = knee.Child("ankle" + tag, t=(0.0, -d["shinLen"], 0.0), joint=True)
        if spec.get("footParts"):
            for material, build in spec["footParts"]:
                ankle.Add(material, build(d), tile="cloth")
        elif spec.get("footwear") == "strawSandal":
            ankle.Add("skin", BareFoot(d), tile="cloth")
            ankle.Add("shoe", StrawSandal(d), tile="cloth")
        else:
            ankle.Add("shoe", Foot(d, spec["toeLift"]), tile="cloth")


def BuildNraSoldier():
    """川军第 22 集团军第 122 师士兵。草鞋、绑腿，**无钢盔。**"""
    d = Dimensions(1.66)
    root = Node("root")
    body = root.Child("body", t=(0.0, d["hipY"], 0.0))
    hips = body.Child("hips", joint=True)
    hips.Add("uniform", Pelvis(d), tile="cloth")

    chest = hips.Child("chest", t=(0.0, d["waistY"] - d["hipY"], 0.0), joint=True)
    chest.Add("uniform", Torso(d, 0.010, 0.0), tile="cloth")
    chest.Child("bandolier").Add("accessory", Bandolier(d), tile="cloth")
    chest.Child("webbing").Add("accessory", HaversackAndBelt(d), tile="cloth")

    neck = chest.Child("neck", t=(0.0, d["neckY"] - d["waistY"], 0.0), joint=True)
    neck.Add("skin", Neck(d), tile="cloth")
    # 头 / 帽 / 帽徽是 neck 底下三层**非关节**子节点，各自建在自己的原点上。
    # 好处有二：几何脚本里不用到处 Transform 一个共同偏移（改头高只改一处），
    # 而且这三层的相对矩阵正好把加载器的嵌套合批路径跑通 —— 那条路径不被
    # 真数据走一遍，等下游 agent 加子节点时才发现算错就晚了。
    head = neck.Child("head", t=(0.0, d["headH"] * 0.50 + 0.010, 0.0))
    head.Add("skin", HeadShape(d), tile="cloth")
    cap = head.Child("cap")
    cap.Add("uniform", FieldCap(d), tile="cloth")
    badge = cap.Child("capBadge")
    badge.Add("accentA", SunBadgeBlue(d), tile="cloth")
    badge.Add("accentB", SunBadgeWhite(d), tile="cloth")
    # 视线挂点：给瞄准/看向用
    head.Child("eyes", t=(0.0, d["headH"] * 0.05, -d["headD"] * 0.42))

    Limbs({"hips": hips, "chest": chest}, d, {
        "sleeve": 1.06, "cuff": 0.012, "trouser": 1.10, "legwrap": "puttee",
        "toeLift": 0.010, "footwear": "strawSandal", "armSegments": 6, "legSegments": 7,
        "shoulderStrap": False,
    })

    # 背枪 / 持枪挂点，与 Script_Actor 的 weaponMount 同名同位
    chest.Child("weaponMount", t=(0.0, 0.02 * d["height"], -d["chestDepth"] * 0.4))
    chest.Child("slingBack", t=(0.0, 0.06 * d["height"], d["chestDepth"] + 0.02))
    return root, d


def BuildIjaSoldier():
    """日军濑谷支队步兵。立领昭五式 + 红领章 + 九〇式钢盔 + 编上靴。**无屁帘。**"""
    d = Dimensions(1.62)
    root = Node("root")
    body = root.Child("body", t=(0.0, d["hipY"], 0.0))
    hips = body.Child("hips", joint=True)
    hips.Add("uniform", Pelvis(d), tile="cloth")

    chest = hips.Child("chest", t=(0.0, d["waistY"] - d["hipY"], 0.0), joint=True)
    # collarStand=0.032：立领高出肩线 32 mm，昭五式的识别点
    chest.Add("uniform", Torso(d, 0.008, 0.032), tile="cloth")
    chest.Child("pouches").Add("leather", LeatherPouches(d), tile="cloth")
    for side in (-1, 1):
        tag = "L" if side < 0 else "R"
        collar = chest.Child(
            "collarTab" + tag,
            t=(side * 0.050, d["shoulderY"] - d["waistY"] + 0.030, -0.040))
        collar.Add("accentA", CollarTab(d, side), tile="cloth")

    neck = chest.Child("neck", t=(0.0, d["neckY"] - d["waistY"], 0.0), joint=True)
    neck.Add("skin", Neck(d), tile="cloth")
    head = neck.Child("head", t=(0.0, d["headH"] * 0.50 + 0.010, 0.0))
    head.Add("skin", HeadShape(d), tile="cloth")
    helmet = head.Child("helmet", t=(0.0, 0.006, 0.0))
    helmet.Add("helmet", Type90Helmet(d), tile="steel")
    helmet.Child("helmetStar").Add("accentB", HelmetStar(d), tile="steel")
    head.Child("eyes", t=(0.0, d["headH"] * 0.02, -d["headD"] * 0.42))

    Limbs({"hips": hips, "chest": chest}, d, {
        "sleeve": 1.02, "cuff": 0.0, "trouser": 1.04, "legwrap": "boot",
        "toeLift": 0.006, "shoulderStrap": True,
    })

    chest.Child("weaponMount", t=(0.0, 0.02 * d["height"], -d["chestDepth"] * 0.4))
    chest.Child("slingBack", t=(0.0, 0.06 * d["height"], d["chestDepth"] + 0.02))
    return root, d

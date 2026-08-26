# -*- coding: utf-8 -*-
"""百姓模型：1938 年 3—4 月鲁南（台儿庄—峄县）乡下的男女平民。

骨架、关节偏移、四肢装配**全部复用 BuildSoldiers**（`Limbs`、`Dimensions`）——
运行时的 Actor 只有一套 13 关节骨架，百姓和士兵共用它，抄第二份关节表迟早会漂。
这里只负责「穿什么」。

为什么要有这个文件（别把它当锦上添花）：
  百姓原来走的是 Model_Civilian*.glb 那条 13 块刚体分段的路。那套资产**根本没有
  脚** —— 裤管到脚踝就断了，人踩在地面下 11 cm；躯干是七八块互不相连的平板叠着，
  头是个方盒加一片浮在上面的帽板。士兵 2026-08-25 已经从这条路搬到程序化 tzm，
  百姓是最后一个还挂在上面的 kind。

史实红线（1938 年 3—4 月，鲁南春寒，白天十度上下）：
  · **不许光膀子/短袖。** 那几个月当地人穿的是夹袄或棉袄，粗布、自染，
    本白（未染）与靛蓝两种最常见 —— 色表在 Script_Actor 的 HEX.civilCloth。
  · 男：对襟短袄 + 小立领 + 布盘扣、裤腰肥、**裤脚用布带扎住**（下地干活的常态，
    和军人的绑腿不是一回事：绑腿缠到膝下，扎腿带只在踝上两道）、千层底黑布鞋、
    腰里一条布带、头上一条手巾。
  · 女：**大襟**（衣襟从领口斜向右腋下扣过去）——这是女装剪影唯一一眼能读的
    识别点，比什么都重要；裤子更肥、褂子更长、包头巾罩住头发、颈后裹着纂儿。
  · **百姓身上不许出现任何军用装具**：子弹带、武装带、皮盒、钢盔一律没有。
    区分军民是这个场景的玩法规则（误伤平民），不是美术偏好。

三角预算 ≤ 1800/人，与士兵同一档。
"""

import math

from BuildSoldiers import (Dimensions, ForeArm, Hand, HeadShape, Limbs, Neck, SEG_BODY,
                           SEG_HEAD, SEG_LIMB, SoftBox, Thigh, UpperArm)
from TzmCore import Box, Join, Loft, Node, Ring, RibbonYz, Strip, Transform

PI = math.pi


# 体型系数。**只改几何，不改关节位置** —— 肩关节永远在 ±shoulderHalf、
# 胯关节永远在 ±hipHalf（运行时的 Actor 就是按这两个数摆骨头的）。
# 女性靠「肩窄一档、腰胯宽一档、褂子长一截」区分，不靠改骨架。
#
# sleeve / trouser 是**乘在管子半径上的**，别拿它去表达「棉衣很厚」：
# 1.16 的袖子 = 直径 15 cm 的胳膊，6 边放样下就是两块贴在身侧的板子
# （第一版实拍就是这个毛病）。厚度靠躯干的截面去说，四肢老老实实按人来。
FIGURE = {
    "male": {
        "chest": 1.00, "chestD": 1.06, "waist": 1.02, "waistD": 1.04,
        "hip": 1.00, "sleeve": 1.06, "trouser": 1.04, "foot": 1.00, "hem": 0.105,
    },
    "female": {
        "chest": 0.92, "chestD": 1.00, "waist": 0.97, "waistD": 1.00,
        "hip": 1.06, "sleeve": 0.99, "trouser": 1.08, "foot": 0.90, "hem": 0.150,
    },
}


# ---------------------------------------------------------------------------
# 上身
# ---------------------------------------------------------------------------

def PaddedJacket(d, f):
    """夹袄/棉袄的上半截（腰到肩）。

    **棉衣的第一眼判据是「不收腰」**：军装是肩宽腰窄的收分，棉袄从腰到胸几乎同粗、
    肩头是圆钝的一坨。所以这里的 waist→chest 半径几乎不变，肩线之上收得也比
    军装慢。领子是中式小立领，比军装的立领矮一半、比脖子粗一圈。
    """
    top = d["shoulderY"] - d["waistY"]
    ch, cd = d["chestHalf"] * f["chest"], d["chestDepth"] * f["chestD"]
    wh, wd = d["waistHalf"] * f["waist"], d["waistDepth"] * f["waistD"]
    rings = [
        Ring(-0.034, rx=wh * 1.12, rz=wd * 1.12, power=2.5),
        Ring(top * 0.24, rx=wh * 1.10, rz=wd * 1.10, power=2.5),
        Ring(top * 0.56, rx=ch * 1.02, rz=cd * 1.04, power=2.6),
        Ring(top * 0.84, rx=ch * 1.04, rz=cd * 1.00, power=2.7),
        Ring(top + 0.012, rx=ch * 0.98, rz=cd * 0.90, power=2.9),
        Ring(top + 0.040, rx=ch * 0.66, rz=cd * 0.60, power=2.9),
        # 小立领：只高出肩线 22 mm（昭五式那种硬立领是 32 mm 且笔挺）
        Ring(top + 0.046, rx=0.058, rz=0.054, power=2.4),
        Ring(top + 0.068, rx=0.056, rz=0.052, power=2.4),
    ]
    return Loft(rings, SEG_BODY)


def JacketHem(d, f):
    """袄的下摆。**挂在胯上而不是胸上** —— 挂在胸上的话人一弯腰、一扭身，
    下摆会跟着胸腔转进大腿里去。挂在胯上它只跟着骨盆走，是布料该有的样子。"""
    wh, wd = d["waistHalf"] * f["waist"], d["waistDepth"] * f["waistD"]
    hip = f["hip"]
    top = d["waistY"] - d["hipY"]
    drop = f["hem"]
    # 上口要**钻进袄里去**，别停在袄的下缘上：袄挂在 chest 上（比这里高 top），
    # 它的最后一圈落在本地 top-0.034；下摆上口收在 top*0.66 就等于在腰下留了
    # 一圈一厘米的空档，实拍是胯两侧支出两片亮翅膀。抬到 top*0.90、并且比袄窄
    # 一档（1.05 对 1.12），才是「掖在里面」。
    return Loft([
        Ring(-drop, rx=wh * 1.15 * hip, rz=wd * 1.15 * hip, power=2.6),
        Ring(-drop * 0.40, rx=wh * 1.16 * hip, rz=wd * 1.16 * hip, power=2.6),
        Ring(top * 0.90, rx=wh * 1.05, rz=wd * 1.05, power=2.5),
    ], SEG_BODY, capStart=False, capEnd=False)


def Pelvis(d, f):
    """胯（裤腰）。比士兵那一版肥一档 —— 中式裤是大裆裤，腰身是围出来的。"""
    H = d["height"]
    hip = f["hip"]
    return Loft([
        Ring(-0.022 * H, rx=d["hipHalf"] * 2.45 * hip, rz=d["waistDepth"] * 1.00, power=3.0),
        Ring(0.030 * H, rx=d["waistHalf"] * 1.06 * hip, rz=d["waistDepth"] * 1.02, power=2.8),
        Ring(0.082 * H, rx=d["waistHalf"] * 1.02, rz=d["waistDepth"] * 1.00, power=2.7),
    ], SEG_BODY)


def WaistSash(d, f):
    """腰里那条布带。挂在胯上（和下摆同一根骨头），扎在下摆外面。
    带头垂在左前 —— 一个不对称的小细节，站一排人时不至于全是复制品。"""
    wh, wd = d["waistHalf"] * f["waist"], d["waistDepth"] * f["waistD"]
    hip = f["hip"]
    y = (d["waistY"] - d["hipY"]) * 0.30
    band = Loft([
        Ring(y - 0.019, rx=wh * 1.20 * hip, rz=wd * 1.20 * hip, power=2.6),
        Ring(y + 0.019, rx=wh * 1.21 * hip, rz=wd * 1.21 * hip, power=2.6),
    ], SEG_BODY, capStart=False, capEnd=False, smooth=False)
    # 带头顺着左前垂下去。**别往侧面支棱** —— 横着支出来的一截在剪影上
    # 会读成挂在腰上的东西（水壶／弹药袋），而百姓身上一件装具都不该有。
    tail = Box(0.024, 0.078, 0.009)
    Transform(tail, x=-wh * 0.34, y=y - 0.050, z=-wd * 1.20, rz=0.10)
    return Join(band, tail)


def FrontPlacket(d, f):
    """男装对襟：一条从领口垂到下摆的门襟。**在 YZ 平面里走**，用 RibbonYz
    而不是 Strip —— 这条带子横截面永远横平，通用 Frenet 标架在垂直段会翻。"""
    top = d["shoulderY"] - d["waistY"]
    cd = d["chestDepth"] * f["chestD"]
    wd = d["waistDepth"] * f["waistD"]
    return RibbonYz([
        (top + 0.042, -cd * 0.62),
        (top * 0.78, -cd * 1.03),
        (top * 0.34, -cd * 1.08),
        (-0.030, -wd * 1.14),
    ], 0.028, 0.008)


def ClothButtons(d, f):
    """布盘扣四粒。一粒 12 个三角，四粒不到 50 —— 正面近景里它是「这不是军装」
    的第二个证据（第一个是没有子弹带）。"""
    top = d["shoulderY"] - d["waistY"]
    cd = d["chestDepth"] * f["chestD"]
    parts = []
    for i in range(4):
        t = i / 3.0
        knot = Box(0.017, 0.013, 0.010, bevel=0.003)
        Transform(knot, y=top * (0.74 - 0.68 * t), z=-cd * (1.05 + 0.02 * t))
        parts.append(knot)
    return Join(*parts)


def JacketSection(d, f, y):
    """袄在高度 y 处的横截面半径 (rx, rz)。**贴在衣服表面上的东西都得问它**。

    第一版的大襟是照拍脑袋的坐标写死的，结果下半截整个埋进躯干里 ——
    正面看是一道断在胸口的短杠，读不出「斜襟」。衣服的截面是放样出来的，
    别在两个地方各写一遍。
    """
    top = d["shoulderY"] - d["waistY"]
    ch, cd = d["chestHalf"] * f["chest"], d["chestDepth"] * f["chestD"]
    wh, wd = d["waistHalf"] * f["waist"], d["waistDepth"] * f["waistD"]
    rings = [
        (-0.034, wh * 1.12, wd * 1.12),
        (top * 0.24, wh * 1.10, wd * 1.10),
        (top * 0.56, ch * 1.02, cd * 1.04),
        (top * 0.84, ch * 1.04, cd * 1.00),
        (top + 0.012, ch * 0.98, cd * 0.90),
    ]
    if y <= rings[0][0]:
        return rings[0][1], rings[0][2]
    for (y0, rx0, rz0), (y1, rx1, rz1) in zip(rings, rings[1:]):
        if y <= y1:
            t = (y - y0) / (y1 - y0)
            return rx0 + (rx1 - rx0) * t, rz0 + (rz1 - rz0) * t
    return rings[-1][1], rings[-1][2]


def CrossLapel(d, f):
    """女装大襟：衣襟从右领口斜过胸口、扣到左腋下，再顺左肋垂下去。

    这是整个女装模型里**最值钱的一条线**。三十米外看不清脸、看不清盘扣，
    但这条斜襟能把「女装」两个字读出来。所以它必须**从领口一直走到腋下再下摆**，
    半路断在胸口的话只是一道莫名其妙的斜杠。

    路径点按 JacketSection 算出来的截面往外让 4%（贴着衣服走），走 Strip
    （真三维路径，要在 X 上横过去），不是 RibbonYz。
    """
    top = d["shoulderY"] - d["waistY"]
    # (高度比例, 从正前往左腋绕过去的角度)。0 = 正前，PI/2 = 正左。
    keys = [(1.030, 0.10), (0.80, 0.30), (0.55, 0.62), (0.32, 1.05), (0.10, 1.40), (-0.10, 1.50)]
    path = []
    for ratio, theta in keys:
        y = top * ratio if ratio > 0 else -0.030
        rx, rz = JacketSection(d, f, y)
        path.append((-rx * math.sin(theta) * 1.04, y, -rz * math.cos(theta) * 1.04))
    return Strip(path, 0.032, 0.009)


# ---------------------------------------------------------------------------
# 头
# ---------------------------------------------------------------------------

def HeadWrap(d):
    """男：包头布。整块罩住颅顶，前缘压在额头上半，左前打一个结。

    **不许用 towel 那一桶（HEX.towel，本白）。** 白毛巾在这个场景里是**敢死队**
    的标志（Script_Actor 的 towelHead，SetTowel 开关的就是它）；给百姓也扎一条
    白的，等于把那条战场识别信息作废。走 accessory（灰蓝土布）。

    **不许做成一条勒在眉骨上的窄带。** 前两版都栽在这儿：这个项目的脸是没有
    五官的，一条横过上半张脸的深色带子加下面一线黑头发，正面读出来就是**蒙眼**。
    整块罩住颅顶、前缘停在额头上部，才读成「裹着头」。
    """
    W, HH, D = d["headW"], d["headH"], d["headD"]
    cap = Loft([
        Ring(HH * 0.08, rx=W * 0.545, rz=D * 0.512, cz=D * 0.010, power=2.7),
        Ring(HH * 0.17, rx=W * 0.558, rz=D * 0.525, cz=D * 0.012, power=2.7),
        Ring(HH * 0.33, rx=W * 0.505, rz=D * 0.472, cz=D * 0.020, power=2.5),
        # 顶上这两圈必须**盖过颅顶**：HeadShape 的顶点在 0.52 HH，
        # 帽子收在 0.505 就等于让头皮从帽尖钻出来一小块（实拍一眼就看见）。
        Ring(HH * 0.46, rx=W * 0.335, rz=D * 0.305, cz=D * 0.025, power=2.3),
        Ring(HH * 0.535, rx=W * 0.165, rz=D * 0.150, cz=D * 0.025, power=2.2),
        Ring(HH * 0.570, r=0.0),
    ], SEG_HEAD, capStart=False)
    knot = SoftBox(0.032, 0.026, 0.022, segments=5, power=3.0)
    Transform(knot, x=-W * 0.28, y=HH * 0.19, z=-D * 0.45, rz=0.5)
    return Join(cap, knot)


def HeadKerchief(d):
    """女：包头巾（蓝印花布，走 accessory 桶）。罩住颅顶与两鬓、颈后鼓出一坨。

    第一版是一个从眉骨一路封到头顶的光滑穹壳，实拍出来是**一顶泳帽**。
    三处改法缺一不可，别只挑一处做：
      · 前缘抬到发际线（-0.06 HH）—— 压到眉骨等于把耳朵和下颌角一起吞掉；
      · 颅顶压扁一档 —— 布是搭在头上的，不是吹出来的半球；
      · 颈后鼓一坨（裹在布里的纂儿）—— 没有它，背影里它仍然只是个壳。

    颈后那一坨原来是一条 RibbonYz 平带，实拍是**一张浮在脑后的卡片**，
    而且正好和露在外面的黑纂儿叠在一起。平带不适合做鼓包，换成放样。
    """
    W, HH, D = d["headW"], d["headH"], d["headD"]
    cap = Loft([
        Ring(-HH * 0.06, rx=W * 0.545, rz=D * 0.510, cz=D * 0.050, power=2.7),
        Ring(HH * 0.10, rx=W * 0.565, rz=D * 0.530, cz=D * 0.035, power=2.7),
        Ring(HH * 0.30, rx=W * 0.510, rz=D * 0.478, cz=D * 0.045, power=2.5),
        # 同男式：顶上要盖过 HeadShape 的 0.52 HH 顶点，别让头皮从帽尖钻出来。
        Ring(HH * 0.45, rx=W * 0.335, rz=D * 0.305, cz=D * 0.050, power=2.3),
        Ring(HH * 0.530, rx=W * 0.165, rz=D * 0.150, cz=D * 0.050, power=2.2),
        Ring(HH * 0.565, r=0.0),
    ], SEG_HEAD, capStart=False)
    nape = Loft([
        Ring(-HH * 0.30, rx=W * 0.30, rz=D * 0.150, cz=D * 0.320, power=2.6),
        Ring(-HH * 0.10, rx=W * 0.42, rz=D * 0.210, cz=D * 0.360, power=2.6),
        Ring(HH * 0.10, rx=W * 0.40, rz=D * 0.200, cz=D * 0.340, power=2.6),
    ], 8, capStart=False, capEnd=False)
    return Join(cap, nape)


def NapeHair(d):
    """后脑那一层头发。

    做法是「**整圈、但整体后移**」：后面探出颅骨外所以看得见，前面缩进颅骨里
    所以看不见 —— 比切半个环便宜，侧脸也不会留一条硬边。
    （同一个招数在 Script_Actor 的 _AttachExtraBones.hairBack 里也用过一次，
    那是给军帽补的；百姓的头发建在模型里，那边已经按 headgear 把百姓排除了。）

    没有它，帽子边缘以下的后脑与脸同色 —— 背影镜从后面看像正脸。
    """
    W, HH, D = d["headW"], d["headH"], d["headD"]
    return Loft([
        Ring(-HH * 0.22, rx=W * 0.395, rz=D * 0.385, cz=D * 0.105, power=2.7),
        Ring(-HH * 0.02, rx=W * 0.415, rz=D * 0.405, cz=D * 0.100, power=2.7),
        Ring(HH * 0.18, rx=W * 0.395, rz=D * 0.385, cz=D * 0.100, power=2.6),
    ], SEG_HEAD, capStart=False, capEnd=False)


# ---------------------------------------------------------------------------
# 腿脚
# ---------------------------------------------------------------------------

def TrouserShin(d, segments=SEG_LIMB, wide=1.04):
    """小腿上的裤管。**裤管是垂下来的，不跟着腿收**：从膝到踝几乎同粗，
    到踝上被扎带一勒才突然收口，堆出一小圈布。收成锥形就成了马裤，不对。

    膝口半径要**对齐大腿下口**（Thigh 最后一圈是 0.66×0.059H = 0.039H，
    而且那一圈**不吃 trouser 倍数**）。第一版按 0.052H×1.14 起头，比大腿下口
    宽了三分之一，膝盖那里凭空多出一圈台阶 —— 实拍看是两截接不上的管子。
    """
    L = d["shinLen"]
    kneeR = 0.042 * d["height"] * wide
    calfR = 0.049 * d["height"] * wide
    ankleR = 0.036 * d["height"]
    return Loft([
        Ring(0.016, r=kneeR, power=2.4),
        Ring(-L * 0.32, r=calfR, power=2.4),
        Ring(-L * 0.66, r=calfR * 0.94, power=2.4),
        Ring(-L * 0.80, r=ankleR * 1.26, power=2.4),     # 堆在扎带上的余量
        Ring(-L * 0.885, r=ankleR * 1.00, power=2.4),    # 扎口
        # 裤口探进鞋帮里 2% 小腿长（≈7 mm）。**踝关节两侧的几何必须交叠**：
        # 正好接在踝上是一条 0 mm 的共面缝，会闪；旧那套 GLB 分段就是这么开缝的。
        Ring(-L * 1.02, r=ankleR * 0.92, power=2.3),
    ], segments)


def AnkleTie(d, segments=SEG_LIMB):
    """扎腿带：踝上两道。**和绑腿不是一回事** —— 绑腿从膝下一路缠到踝
    （士兵那条 ShinPuttee 有 4 层），扎腿带只有两道、只在踝上 6 cm 之内。
    这个差别是战场上区分军民的一处细节，别顺手做成绑腿。"""
    L = d["shinLen"]
    ankleR = 0.036 * d["height"]
    rings = []
    for i in range(5):
        t = i / 4.0
        y = -L * 0.845 - L * 0.085 * t
        bulge = 1.0 + (0.075 if i % 2 == 0 else -0.010)
        rings.append(Ring(y, r=ankleR * (1.10 - 0.05 * t) * bulge, power=2.4, roll=t * 0.7))
    return Loft(rings, segments, capStart=False, capEnd=False)


def ClothShoeUpper(d, scale):
    """千层底布鞋的鞋面。**高度等于踝高，从踝一路铺到地面** ——
    随手给个厚度人就陷进地里（旧那套 GLB 百姓正是这么陷了 11 cm）。"""
    L, W, H = d["footLen"] * scale, d["footW"] * scale, d["footH"]
    # 鞋面一直做到离地 4 mm —— 它的下缘要**埋在**鞋底那 13 mm 里面，
    # 而不是停在鞋底上表面上（那是一条共面缝，会闪）。
    return Loft([
        Ring(0.0, rx=W * 0.78, rz=L * 0.23, cz=L * 0.11, power=3.0),
        Ring(-H * 0.38, rx=W * 0.94, rz=L * 0.35, cz=L * 0.02, power=3.2),
        Ring(-H * 0.74, rx=W * 0.96, rz=L * 0.43, cz=-L * 0.05, power=3.5),
        Ring(-H + 0.004, rx=W * 0.93, rz=L * 0.42, cz=-L * 0.06, power=3.6),
    ], SEG_LIMB)


def ClothShoeSole(d, scale):
    """纳的白布底。单独一块浅色 —— 黑鞋面配一线白底是布鞋的招牌，
    全黑一坨在地面上读不出「鞋」，只读成「腿断在这儿了」。"""
    L, W, H = d["footLen"] * scale, d["footW"] * scale, d["footH"]
    return Loft([
        Ring(-H, rx=W * 0.99, rz=L * 0.450, cz=-L * 0.06, power=3.6),
        Ring(-H + 0.013, rx=W * 1.00, rz=L * 0.455, cz=-L * 0.06, power=3.6),
    ], SEG_LIMB)


# ---------------------------------------------------------------------------
# 组装
# ---------------------------------------------------------------------------

def _Build(gender):
    """男女共用的装配。两个模型都建在 1.60 m 上（= Script_Actor 的
    KIND_SPEC.civilian.height）—— 男女身高差走运行时的整体缩放，不在这里烘死，
    否则加载器的 scale = spec.height / MESHES.height 会把它除回去。"""
    f = FIGURE[gender]
    female = gender == "female"
    d = Dimensions(1.60)


    root = Node("root")
    body = root.Child("body", t=(0.0, d["hipY"], 0.0))

    hips = body.Child("hips", joint=True)
    hips.Add("trouser", Pelvis(d, f), tile="cloth")
    hips.Child("hem").Add("uniform", JacketHem(d, f), tile="cloth")
    # 腰带只给男的。女的是松垂的大襟褂，勒一条腰带既不对，也会和斜襟那条线打架。
    if not female:
        hips.Child("sash").Add("accessory", WaistSash(d, f), tile="cloth")

    chest = hips.Child("chest", t=(0.0, d["waistY"] - d["hipY"], 0.0), joint=True)
    chest.Add("uniform", PaddedJacket(d, f), tile="cloth")
    if female:
        chest.Child("lapel").Add("accessory", CrossLapel(d, f), tile="cloth")
    else:
        chest.Child("placket").Add("accessory", FrontPlacket(d, f), tile="cloth")
        chest.Child("buttons").Add("accessory", ClothButtons(d, f), tile="cloth")

    neck = chest.Child("neck", t=(0.0, d["neckY"] - d["waistY"], 0.0), joint=True)
    neck.Add("skin", Neck(d), tile="cloth")
    head = neck.Child("head", t=(0.0, d["headH"] * 0.50 + 0.010, 0.0))
    head.Add("skin", HeadShape(d), tile="cloth")
    head.Child("hair").Add("hair", NapeHair(d), tile="cloth")
    head.Child("headcloth").Add(
        "accessory", HeadKerchief(d) if female else HeadWrap(d), tile="cloth")
    head.Child("eyes", t=(0.0, d["headH"] * 0.05, -d["headD"] * 0.42))

    Limbs({"hips": hips, "chest": chest}, d, {
        "sleeve": f["sleeve"], "cuff": 0.0, "trouser": f["trouser"],
        "legwrap": None, "toeLift": 0.0, "shoulderStrap": False,
        "armSegments": 7, "legSegments": 7,
        "legMaterial": "trouser",
        "shinParts": [
            ("trouserShin", "trouser", lambda dd, seg: TrouserShin(dd, seg, f["trouser"])),
            ("ankleTie", "accessory", AnkleTie),
        ],
        "footParts": [
            ("shoe", lambda dd: ClothShoeUpper(dd, f["foot"])),
            ("accessory", lambda dd: ClothShoeSole(dd, f["foot"])),
        ],
    })

    # 百姓不背枪，但挂点必须在：Actor 的 GetMount 与过场（递水、抬担架、
    # 举白旗）都按名字取它们，缺一个就是运行时 null。
    chest.Child("weaponMount", t=(0.0, 0.02 * d["height"], -d["chestDepth"] * 0.4))
    chest.Child("slingBack", t=(0.0, 0.06 * d["height"], d["chestDepth"] + 0.02))
    return root, d


def BuildCivilianMale():
    """鲁南男性平民：对襟夹袄 + 小立领 + 布盘扣、扎腿带、千层底布鞋、头上一条手巾。"""
    return _Build("male")


def BuildCivilianFemale():
    """鲁南女性平民：大襟褂（斜襟是唯一一眼可读的女装标志）、肥裤、包头巾 + 纂儿。"""
    return _Build("female")

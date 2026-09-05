# -*- coding: utf-8 -*-
"""《血战台儿庄》Blender 程序化建模内核 —— 建模原语 + 节点树 + TZM 导出。

为什么自己定一个 .tzm.json 而不是 glTF：
  自研格式只需要表达四件事：节点层级、每节点局部变换、每节点挂的网格、材质名。
  这四件事写出来不到 200 行，读它的加载器也不到 200 行，且不用迁就外部格式的
  tone mapping / 预通道约定。
 （历史注：早期仓里只有 vendor/three/build 核心库；后来为外部 GLB 道具、蒙皮
  人物与过场引入了 examples/jsm 的 GLTFLoader。TZM 管线保持独立，两边各管各的。）

为什么在 Blender 里直接按**游戏坐标系（Y 上、-Z 前）**建模，而不是 Blender
的 Z 上：
  无头程序化生成根本不看视口，转轴反而是纯风险 —— 轴换手性的时候法线要跟着
  翻，翻漏一处就是「这块面从里面看才有」。所以这里全程 Y 上，导出零变换。
  副作用：拿 Blender GUI 打开 .blend 会看到模型躺着。这是刻意的，别去"修"。

三角面预算（超了同屏 24 人会掉帧，见任务书性能红线）：
  士兵 ≤ 1800、近景武器 ≤ 6000、建筑构件 ≤ 400。BuildAll 会逐个断言。
"""

import base64
import json
import math
import os
import struct

import bpy
import bmesh
from mathutils import Matrix, Vector

TAU = math.pi * 2.0

# 每格贴图代表多少米。必须与 Script_Geo.mjs 的 TILE_METERS 一致，
# 否则同一张 ClothNra 贴在人身上和贴在沙袋上密度不同，一眼看穿是两套资产。
TILE_METERS = {
    "brick": 1.2, "adobe": 1.6, "roof": 1.1, "wood": 1.0,
    "ground": 2.6, "stone": 1.4, "sandbag": 0.9, "cloth": 0.6, "steel": 0.35,
}

# 枪械专用格距。**建筑那几个数不许套到枪上。**
#
# 事故（第 2 轮视觉审查，用户原话是"还不如纯色不给贴图呢"）：
#   枪原来跟房子共用 wood=1.0 / steel=0.35。一支 1.11 m 的中正式，枪托宽 42 mm ——
#   横着只吃到贴图的 4%，竖着吃满一整格。BakeWood 那张图上的年轮带本身有
#   8—16 cm 宽（它是按 1 m 一格的门板画的），落到枪托上就成了一条条**横跨整个
#   托身的黑橙虎斑**；BakeSteel 的粗糙度场同理，大刀刀身 0.6 m 只跨 1.7 格，
#   于是半边刀镜面反天空（白）、半边反地面（黑），中间一条硬边。
#   贴图本身没问题（单独看两张图都很好），错的是**密度**。
#
# 这三个数不是新调的，是直接抄第一人称视图模型里已经验过的那一套
# （Script_Viewmodel.mjs 的 VM_TILE —— 那边第 1 轮视觉审查就踩过同一个坑，
# 结论写在它的抬头注释里）。第三人称/台架这一路当时漏掉了，这次对齐。
GUN_TILE = {"gunSteel": 0.030, "gunWood": 0.085, "gunCloth": 0.045}
TILE_METERS.update(GUN_TILE)

# 车辆钢板：**跟钢盔同一档 0.35 m**。SteelHelmet 那张图的锈斑在这个密度下是
# 2 cm 一处的细点，读作「风吹日晒的旧漆」——正是九〇式钢盔在人头上的样子。
# 试过 0.75 与 1.5：锈斑跟着放大到 5 cm、10 cm，整辆车像出了一身橘红麻疹。
# 锈斑这类**离散斑点**的观感只由「一个斑在屏幕上多大」决定，与物体多大无关。
TILE_METERS["armor"] = 0.35
# 履带板：一块 15 cm，所以格距给 0.30 —— 一格里正好两块板的尺度
TILE_METERS["track"] = 0.30

# 允许出现在模型里的材质名。必须是 Script_Actor.ActorMaterials() 返回的桶名的子集 ——
# 加载器不造材质，只按名字去现成的材质表里取。写错名字导出时就报错，
# 别等到运行时才发现半个人是黑的。
MATERIAL_NAMES = {
    "uniform", "accessory", "shoe", "skin", "helmet", "steel", "blade", "grip", "wood",
    "leather", "towel", "red", "accentA", "accentB", "dadao",
    # 百姓：裤子与上衣是两块布（默认同色，过场可以分别指定），头发露在头巾外面。
    # 两个桶 ActorMaterials 早就返回了，只是以前没有模型用到它们。
    "trouser", "hair",
    # 车辆装甲板（喷漆钢，不是裸钢）与履带 —— 见 Script_Actor.ActorMaterials
    "armor", "track", "type89Armor", "type89Track", "type89Barrel",
    # 建筑构件用的是 MaterialLibrary 的配方名，加载器同样直接透传
    "Stone", "WoodBeam", "WoodDoor", "RoofTile", "BrickWall", "Adobe",
}

# Node.Add 的翻面体检报告：`节点/材质 ×块数`。BuildAll 每建完一个模型打一次并清空。
# 空的才是正常状态 —— 有内容说明某个建模原语的绕向写反了。
FLIPPED = []
AUTHORED_NORMAL_LAYER = "TzmAuthoredNormal"


# ---------------------------------------------------------------------------
# 建模原语：全部返回一个独立的 bmesh
# ---------------------------------------------------------------------------

def _SuperEllipse(theta, rx, rz, power):
    """超椭圆采样。power=2 是正圆，power=4 往方里收 —— 躯干、枪托、弹药盒
    都不是正圆柱，这个指数就是「不像胶囊」的第一道分水岭。"""
    c, s = math.cos(theta), math.sin(theta)
    e = 2.0 / power
    x = rx * math.copysign(abs(c) ** e, c)
    z = rz * math.copysign(abs(s) ** e, s)
    return x, z


def Ring(y, r=None, rx=None, rz=None, cx=0.0, cz=0.0, power=2.0, roll=0.0):
    """一圈截面。r 是 rx==rz 的简写；roll 让截面绕 Y 转（缠绑腿的错层靠它）。"""
    return {
        "y": y,
        "rx": rx if rx is not None else r,
        "rz": rz if rz is not None else r,
        "cx": cx, "cz": cz, "power": power, "roll": roll,
    }


def Loft(rings, segments=12, capStart=True, capEnd=True, smooth=True):
    """把一串截面放样成一个实体。躯干的肩宽腰窄、四肢的粗细变化、钢盔的
    半球带檐，全是这一个函数出来的 —— 圆柱是它 rings 全同的退化情形。"""
    bm = bmesh.new()
    layers = []
    for ring in rings:
        verts = []
        degenerate = abs(ring["rx"]) < 1e-6 and abs(ring["rz"]) < 1e-6
        if degenerate:
            # 半径收到 0 的圈退化成一个极点，否则顶端会挤出一撮零面积三角形
            verts = [bm.verts.new((ring["cx"], ring["y"], ring["cz"]))]
        else:
            for i in range(segments):
                th = TAU * i / segments + ring["roll"]
                x, z = _SuperEllipse(th, ring["rx"], ring["rz"], ring["power"])
                verts.append(bm.verts.new((ring["cx"] + x, ring["y"], ring["cz"] + z)))
        layers.append(verts)

    for a, b in zip(layers, layers[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for i in range(segments):
                j = (i + 1) % segments
                f = bm.faces.new((a[0], b[i], b[j]))
                f.smooth = smooth
        elif len(b) == 1:
            for i in range(segments):
                j = (i + 1) % segments
                f = bm.faces.new((a[i], b[0], a[j]))
                f.smooth = smooth
        else:
            for i in range(segments):
                j = (i + 1) % segments
                # 绕向定死成 (下i, 上i, 上j, 下j)：cross(向上, 切向) 朝外，
                # 这样闭合体不靠 recalc 也是对的，开放片（背带）才有确定的正面
                f = bm.faces.new((a[i], b[i], b[j], a[j]))
                f.smooth = smooth

    # 封口的绕向：θ 递增的一圈点，**原序**的法线是 -Y（从上往下看是顺时针）。
    # 所以起点圈用原序（朝下 = 朝外）、终点圈用反序（朝上 = 朝外）。
    # 原来两边都写反了 —— 藏在关节里的封口没人看得见，可鞋底、帽檐的上下两面
    # 就是封口面，于是**鞋底从下面看是空的、帽檐是一片穿透的薄唇**。
    if capStart and len(layers[0]) > 2:
        bm.faces.new(layers[0]).smooth = False
    if capEnd and len(layers[-1]) > 2:
        bm.faces.new(list(reversed(layers[-1]))).smooth = False

    # 上面那套绕向只在 rings **由下往上**写（y 递增）时朝外。
    # 而四肢、钢盔、鞋、绑腿、帽檐全是从关节往下写的（y 从 0 掉到 -L）——
    # 一个"往上"变成"往下"，cross(向上, 切向) 就整个反号，出来的是**里外翻的壳**。
    # 后果分两档：只有法线反的（袖子、裤腿）迎光面渲成暗的，整个人读起来是平的；
    # 连绕序一起反的（钢盔、鞋）直接被背面剔除吞掉。而包围盒、三角数、材质桶、
    # draw call 全部正常，Verify 全绿，**只有真截图看得见**——这一版就是这么翻的车。
    # 所以方向判据写在这里，别让每个调用方自己去记"rings 必须递增"。
    if len(layers) > 1 and rings[-1]["y"] < rings[0]["y"]:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def Lathe(profile, segments=12, smooth=True, closed=False):
    """旋转体：profile 是 [(r, y), ...] 的外轮廓，绕 Y 轴用 bmesh.ops.spin 转一圈。
    手榴弹弹体、水壶、帽顶、门墩鼓面走这条。

    closed=True 会把轮廓首尾连上 —— 轮廓两端都**不在轴上**时（圆环、垫圈）必须开，
    否则转出来是一张开放的面片，背面剔除一开就半边消失。
    """
    bm = bmesh.new()
    verts = [bm.verts.new((p[0], p[1], 0.0)) for p in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if closed and len(verts) > 2:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(
        bm, geom=verts + edges, axis=(0.0, 1.0, 0.0), cent=(0.0, 0.0, 0.0),
        dvec=(0.0, 0.0, 0.0), angle=TAU, steps=segments, use_merge=True, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = smooth
    bm.normal_update()
    return bm


def Box(w, h, d, bevel=0.0, segments=1, smooth=False):
    """一块方料。bevel > 0 时倒角 —— 直角在近距离视图模型上是塑料感的主因。"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, h, d)), verts=bm.verts[:])
    if bevel > 0.0:
        bmesh.ops.bevel(
            bm, geom=bm.verts[:] + bm.edges[:], offset=bevel, segments=segments,
            profile=0.5, affect="EDGES", clamp_overlap=True)
    for f in bm.faces:
        f.smooth = smooth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def TubeY(r0, r1, length, segments=10, power=2.0, cap=True, smooth=True):
    """沿 +Y 的锥台。y 从 -length/2 到 +length/2。"""
    return Loft([Ring(-length * 0.5, r=r0, power=power),
                 Ring(length * 0.5, r=r1, power=power)],
                segments, capStart=cap, capEnd=cap, smooth=smooth)


def TubeZ(r0, r1, length, segments=10, power=2.0, cap=True, smooth=True):
    """沿 -Z 的锥台（武器坐标系：枪管朝 -Z）。z 从 0 到 -length。"""
    bm = TubeY(r0, r1, length, segments, power, cap, smooth)
    # 绕 X 转 -90°：+Y 变 -Z
    Transform(bm, rx=-math.pi * 0.5, y=0.0)
    Transform(bm, z=-length * 0.5)
    return bm


def Strip(points, width, thickness, smooth=False):
    """把一串 (x, y, z) 骨架点扫成一条有厚度的带子。斜挎子弹带、背包带、
    刀鞘的挎带走这条 —— 用一根扁盒子代替它会立刻穿帮成「贴在身上的贴纸」。"""
    bm = bmesh.new()
    layers = []
    for i, p in enumerate(points):
        p = Vector(p)
        nxt = Vector(points[min(i + 1, len(points) - 1)])
        prv = Vector(points[max(i - 1, 0)])
        tangent = (nxt - prv)
        if tangent.length < 1e-6:
            tangent = Vector((0.0, 1.0, 0.0))
        tangent.normalize()
        side = tangent.cross(Vector((0.0, 0.0, 1.0)))
        if side.length < 1e-4:
            side = tangent.cross(Vector((0.0, 1.0, 0.0)))
        side.normalize()
        out = side.cross(tangent).normalized()
        hw, ht = width * 0.5, thickness * 0.5
        quad = [p + side * hw + out * ht, p - side * hw + out * ht,
                p - side * hw - out * ht, p + side * hw - out * ht]
        layers.append([bm.verts.new(tuple(v)) for v in quad])
    for a, b in zip(layers, layers[1:]):
        for i in range(4):
            j = (i + 1) % 4
            f = bm.faces.new((a[i], b[i], b[j], a[j]))
            f.smooth = smooth
    bm.faces.new(list(reversed(layers[0]))).smooth = False
    bm.faces.new(layers[-1]).smooth = False
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def _FaceComponents(bm):
    """把 bmesh 拆成若干连通块（按共边连通）。Join 出来的零件天然是分开的块，
    所以体检必须**逐块**做：整块合起来算体积，一只翻了面的小鞋会被一条大裤腿的
    正体积盖过去。"""
    seen = set()
    out = []
    for seed in bm.faces:
        if seed in seen:
            continue
        stack = [seed]
        seen.add(seed)
        group = []
        while stack:
            face = stack.pop()
            group.append(face)
            for edge in face.edges:
                for other in edge.link_faces:
                    if other not in seen:
                        seen.add(other)
                        stack.append(other)
        out.append(group)
    return out


def OrientOutward(bm):
    """把每个**封闭**连通块翻成法线朝外。返回翻了几块。

    判据是有符号体积 Σ (a×b)·c / 6：闭合壳为负就是里外翻的，这是几何事实，
    跟凸不凸、有没有洞都无关，不是启发式。开放的块（背带、腰带、盔沿这种
    没封口的片）体积没意义，一律不动 —— 它们的正面由 Loft / Strip 的绕向定死。

    为什么把它挂在 Node.Add 这一个口子上：全场几何都要从这里进节点树，
    在这里体检等于**没有一块料能绕过体检**。翻面事故的特征是所有可自动断言的
    数字（三角数、包围盒、draw call、材质桶）全部正常，Verify 全绿，
    只有截图看得见 —— 那就不能只靠某个原语自己写对。
    """
    flipped = 0
    for group in _FaceComponents(bm):
        edges = set()
        for face in group:
            edges.update(face.edges)
        if any(len(e.link_faces) != 2 for e in edges):
            continue                      # 开放块：体积没有意义
        volume = 0.0
        for face in group:
            verts = face.verts[:]
            a = verts[0].co
            for i in range(1, len(verts) - 1):
                b, c = verts[i].co, verts[i + 1].co
                volume += a.cross(b).dot(c)
        if volume < 0.0:
            bmesh.ops.reverse_faces(bm, faces=group)
            # reverse_faces 只改绕序；自定义逐角法线仍指着翻面前的方向。
            # 导入模型若保留 AUTHORED_NORMAL_LAYER，导出器又会优先读它，结果就是
            # “面已经朝外、光照法线仍朝内”：正面发黑、轮廓像漏面。
            authored = bm.loops.layers.float_vector.get(AUTHORED_NORMAL_LAYER)
            if authored is not None:
                for face in group:
                    for loop in face.loops:
                        loop[authored] = -Vector(loop[authored])
            flipped += 1
    if flipped:
        bm.normal_update()
    return flipped

def RibbonYz(points, width, thick, smooth=False):
    """YZ 平面里的一条扁铁条：扳机护圈、背带环、提把。points 是 [(y, z), ...]。

    为什么不用 Strip：Strip 走的是通用 Frenet 标架，`side = tangent × Z`。
    护圈绕过最低点时切线正好水平，那个叉乘掉到 1e-4 以下走进兜底分支，
    side 会**翻向** —— 整条带子从最低点开始拧 180°，渲出来是一条自交的麻花。
    枪上这些铁条全在 YZ 平面内、横截面永远是横平的一条，用不着通用标架：
    法向直接在平面内取切线的垂线，绕过任何角度都不翻。
    """
    bm = bmesh.new()
    layers = []
    n = len(points)
    hw, ht = width * 0.5, thick * 0.5
    for i, (y, z) in enumerate(points):
        ny_, nz_ = points[min(i + 1, n - 1)], points[max(i - 1, 0)]
        ty, tz = ny_[0] - nz_[0], ny_[1] - nz_[1]
        length = math.hypot(ty, tz) or 1.0
        ty, tz = ty / length, tz / length
        nY, nZ = -tz, ty                       # 平面内的法向：切线转 90°
        quad = [
            (hw, y + nY * ht, z + nZ * ht),
            (-hw, y + nY * ht, z + nZ * ht),
            (-hw, y - nY * ht, z - nZ * ht),
            (hw, y - nY * ht, z - nZ * ht),
        ]
        layers.append([bm.verts.new(v) for v in quad])
    for a, b in zip(layers, layers[1:]):
        for i in range(4):
            j = (i + 1) % 4
            f = bm.faces.new((a[i], b[i], b[j], a[j]))
            f.smooth = smooth
    bm.faces.new(list(reversed(layers[0]))).smooth = False
    bm.faces.new(layers[-1]).smooth = False
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def TransformMatrix(bm, matrix):
    """变换几何，并同步变换导入模型携带的逐角法线。"""
    authored = bm.loops.layers.float_vector.get(AUTHORED_NORMAL_LAYER)
    if authored is not None:
        normal_matrix = matrix.to_3x3().inverted().transposed()
        for face in bm.faces:
            for loop in face.loops:
                normal = normal_matrix @ Vector(loop[authored])
                if normal.length > 1e-9:
                    normal.normalize()
                loop[authored] = normal
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
    bm.normal_update()
    return bm


def Transform(bm, x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, sx=1.0, sy=1.0, sz=1.0):
    """就地变换一个 bmesh。顺序：缩放 → ZYX 欧拉 → 平移。"""
    m = (Matrix.Translation((x, y, z))
         @ Matrix.Rotation(rz, 4, "Z")
         @ Matrix.Rotation(ry, 4, "Y")
         @ Matrix.Rotation(rx, 4, "X")
         @ Matrix.Diagonal((sx, sy, sz, 1.0)))
    return TransformMatrix(bm, m)


def Join(*meshes):
    """把若干 bmesh 并成一个（不做焊接：不同零件焊在一起会把法线拉花）。"""
    out = bmesh.new()
    out_uv = None
    out_authored_normal = None
    for src in meshes:
        if src is None:
            continue
        src.verts.index_update()
        src_uv = src.loops.layers.uv.active
        src_authored_normal = src.loops.layers.float_vector.get(AUTHORED_NORMAL_LAYER)
        if src_uv is not None and out_uv is None:
            # Imported assets may carry an authored UV atlas. Most TZM models still
            # use deterministic box projection, but preserve the layer for the few
            # source-authored PBR assets that explicitly request it.
            out_uv = out.loops.layers.uv.new("UVMap")
        if src_authored_normal is not None and out_authored_normal is None:
            out_authored_normal = out.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
        remap = {v.index: out.verts.new(v.co) for v in src.verts}
        out.verts.index_update()
        for f in src.faces:
            try:
                nf = out.faces.new([remap[v.index] for v in f.verts])
                nf.smooth = f.smooth
                if src_uv is not None and out_uv is not None:
                    for src_loop, out_loop in zip(f.loops, nf.loops):
                        out_loop[out_uv].uv = src_loop[src_uv].uv
                if src_authored_normal is not None and out_authored_normal is not None:
                    for src_loop, out_loop in zip(f.loops, nf.loops):
                        out_loop[out_authored_normal] = src_loop[src_authored_normal]
            except ValueError:
                pass    # 重复面：直接丢，别让整条管线炸在一块看不见的皮上
        src.free()
    out.normal_update()
    return out


def BooleanDifference(bmA, bmB):
    """A 减 B。bmesh 没有布尔算子，只能借 bpy 的 Boolean 修改器 + depsgraph
    求值 —— 无头模式下这条路是通的（不需要 bpy.ops.object.modifier_apply）。
    只在「洞是造型本身」的地方用（斗拱的十字卯口），别拿它做倒角，
    布尔出来的三角数不可控，三角预算扛不住。

    **两个输入都必须是不自交的闭合体。** EXACT 求解器按绕数判定内外，
    自交体（比如 Join 出来的十字刀）的绕数是 2，判定结果未定义 —— 实测会
    整块返回空网格。要挖十字就挖两刀，别先把两块料并成一把刀。"""
    objA = _BmToObject(bmA, "boolA")
    objB = _BmToObject(bmB, "boolB")
    mod = objA.modifiers.new("diff", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = objB
    mod.solver = "EXACT"
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = objA.evaluated_get(depsgraph)
    result = bmesh.new()
    result.from_mesh(evaluated.to_mesh())
    evaluated.to_mesh_clear()
    for o in (objA, objB):
        bpy.data.objects.remove(o, do_unlink=True)
    bmesh.ops.recalc_face_normals(result, faces=result.faces[:])
    result.normal_update()
    return result


def _BmToObject(bm, name):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def Decimate(bm, ratio):
    """兜底减面。建模段数控制不住时才用 —— 它会把规整的环切打成乱三角，
    法线也跟着糙，能不用就不用。"""
    if ratio >= 0.999:
        return bm
    obj = _BmToObject(bm, "dec")
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.ratio = ratio
    # collapse 默认输出以四边面为主，1 面折 2 三角，预算断言按三角数算会算出
    # 一笔糊涂账；而且四边输出在深减面上经常减不动（实测卡在目标比例以上）。
    # 管线反正要在导出时三角化，这里直接出三角，数量可预期。
    mod.use_collapse_triangulate = True
    # 不加这两步的话新加的修改器根本不会被求值：Blender 5.x 里 evaluated_get
    # 拿到的还是**没带修改器**的网格，减面对输入毫无效果（实测 76k→56k，
    # 加了 update 之后 76k→6.3k），而超预算的模型会带着 58k 三角"成功"写出，
    # BuildAll 才在最后一刻把它判死。这是 2026-08 捷克式换模时逮到的。
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    evaluated = obj.evaluated_get(depsgraph)
    out = bmesh.new()
    out.from_mesh(evaluated.to_mesh())
    evaluated.to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    out.normal_update()
    return out


# ---------------------------------------------------------------------------
# 节点树
# ---------------------------------------------------------------------------

class Node:
    """一个节点。joint=True 表示「运行时会被逐帧改 rotation」——
    加载器就是按 joint 切合批区间的：一个 joint 到下一个 joint 之间的所有
    网格按材质合并成 1—2 个 draw call。挂点（枪口/握把）是没有网格的 joint=False
    节点，加载器照样把它们放进 nodes 表里。"""

    def __init__(self, name, t=(0.0, 0.0, 0.0), r=(0.0, 0.0, 0.0), s=1.0, joint=False):
        self.name = name
        self.t = tuple(float(v) for v in t)
        self.r = tuple(float(v) for v in r)
        self.s = (float(s), float(s), float(s)) if isinstance(s, (int, float)) else tuple(s)
        self.joint = bool(joint)
        self.parts = []          # [(material, bmesh, tileMeters)]
        self.children = []

    def Child(self, name, t=(0.0, 0.0, 0.0), r=(0.0, 0.0, 0.0), s=1.0, joint=False):
        node = Node(name, t, r, s, joint)
        self.children.append(node)
        return node

    def Add(self, material, bm, tile="cloth", **place):
        """往节点上挂一块几何。place 走 Transform 的参数（在节点局部系里摆位）。

        进树之前过一道翻面体检（OrientOutward）：这是全场几何唯一的入口，
        在这里体检就没有一块料能绕过去。翻了的块记在 FLIPPED 里，BuildAll 会打出来 ——
        **看到这一行不是"修好了"，是"某个原语的绕向写错了，去改那个原语"**。
        """
        if material not in MATERIAL_NAMES:
            raise ValueError("材质名不在白名单里：%s" % material)
        if place:
            Transform(bm, **place)
        healed = OrientOutward(bm)
        if healed:
            FLIPPED.append("%s/%s ×%d" % (self.name, material, healed))
        if tile == "sourceUv":
            tile_value = None
        else:
            tile_value = TILE_METERS.get(tile, 1.0) if isinstance(tile, str) else float(tile)
        self.parts.append((material, bm, tile_value))
        return self

    def Walk(self):
        yield self
        for c in self.children:
            for n in c.Walk():
                yield n


# ---------------------------------------------------------------------------
# 三角化 / 法线 / UV / 量化
# ---------------------------------------------------------------------------

def _ExtractLoops(bm, tile):
    """三角化并吐出 (position, normal, uv) 三元组序列。

    光滑法线只由**相邻的 smooth 面**加权累加：直接拿 vert.normal 的话，
    圆柱端盖（flat）会把侧壁（smooth）的法线往轴向拽，柱面边缘出现一圈死光。
    """
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    bm.verts.index_update()
    bm.faces.index_update()

    smooth_normals = {}
    for f in bm.faces:
        if not f.smooth:
            continue
        try:
            weight = f.calc_area()
        except ValueError:
            weight = 0.0
        for v in f.verts:
            acc = smooth_normals.get(v.index)
            if acc is None:
                acc = Vector((0.0, 0.0, 0.0))
                smooth_normals[v.index] = acc
            acc += f.normal * max(weight, 1e-9)

    source_uv = bm.loops.layers.uv.active if tile is None else None
    authored_normal = bm.loops.layers.float_vector.get(AUTHORED_NORMAL_LAYER)
    if tile is None and source_uv is None:
        raise ValueError("sourceUv 网格没有活动 UV 层")
    inv_tile = 0.0 if tile is None else 1.0 / max(tile, 1e-6)
    out = []
    for f in bm.faces:
        # 小于约 0.03 mm × 0.03 mm 的三角在 uint16 位置量化后会塌成线/点；
        # 留着只会制造黑缝和重复索引，不贡献可见轮廓。
        if f.calc_area() <= 1e-9:
            continue
        fn = f.normal.copy()
        if fn.length < 1e-9:
            continue
        fn.normalize()
        # UV：按面法线的主轴做盒式投影，尺度换算成「米 / 每格米数」。
        # 全场贴图密度统一是这套管线的既有规矩（见 Script_Geo 的抬头注释）。
        ax = max(range(3), key=lambda i: abs(fn[i]))
        face_out = []
        for loop in f.loops:
            v = loop.vert
            if authored_normal is not None and Vector(loop[authored_normal]).length > 1e-9:
                n = Vector(loop[authored_normal])
                n.normalize()
            elif f.smooth and v.index in smooth_normals:
                n = smooth_normals[v.index].copy()
                if n.length < 1e-9:
                    n = fn.copy()
                n.normalize()
            else:
                n = fn
            # 非流形旧模型或极瘦三角会把共享顶点的面积加权法线拉到面背后。
            # 无论法线来自源文件还是自动光滑，最终都不能与承载它的面相反；否则
            # 正面会被当成背面照亮，编辑器里看起来就是漏面/黑三角。
            if n.dot(fn) <= 0.05:
                n = fn
            co = v.co
            if source_uv is not None:
                authored = loop[source_uv].uv
                uv = (authored.x, authored.y)
            elif ax == 0:
                uv = (co.z * inv_tile, co.y * inv_tile)
            elif ax == 1:
                uv = (co.x * inv_tile, co.z * inv_tile)
            else:
                uv = (co.x * inv_tile, co.y * inv_tile)
            face_out.append(((co.x, co.y, co.z), (n.x, n.y, n.z), uv))
        averaged = Vector((0.0, 0.0, 0.0))
        for _position, normal, _uv in face_out:
            averaged += Vector(normal)
        if averaged.length < 1e-8 or averaged.normalized().dot(fn) <= 0.05:
            face_out = [(position, (fn.x, fn.y, fn.z), uv)
                        for position, _normal, uv in face_out]
        out.extend(face_out)
    return out


def _BuildMesh(loops):
    """去重成索引网格。键量化到 0.1 mm / 0.01 法线 / 0.001 UV —— 太严了
    去不掉重，太松了会把两个不同硬边的角焊在一起。"""
    lookup = {}
    positions, normals, uvs, indices = [], [], [], []
    for p, n, uv in loops:
        key = (round(p[0], 5), round(p[1], 5), round(p[2], 5),
               round(n[0], 3), round(n[1], 3), round(n[2], 3),
               round(uv[0], 4), round(uv[1], 4))
        idx = lookup.get(key)
        if idx is None:
            idx = len(positions) // 3
            lookup[key] = idx
            positions.extend(p)
            normals.extend(n)
            uvs.extend(uv)
        indices.append(idx)
    return positions, normals, uvs, indices


def _B64(fmt, values):
    return base64.b64encode(struct.pack("<%d%s" % (len(values), fmt), *values)).decode("ascii")


def _Quantize(positions, normals, uvs, indices):
    """位置 / UV 量化成 uint16，法线量化成 int8。

    为什么值得量化：一个士兵约 1000 顶点，明文十进制 JSON 要 70 KB 上下，
    量化后 base64 出来约 18 KB。节点树仍然是明文的 —— 要读要改的是层级，
    不是顶点浮点数。
    """
    count = len(positions) // 3
    pmin = [min(positions[i::3]) for i in range(3)]
    pmax = [max(positions[i::3]) for i in range(3)]
    pscale = [max(pmax[i] - pmin[i], 1e-6) / 65535.0 for i in range(3)]
    qpos = []
    for i in range(count):
        for a in range(3):
            qpos.append(max(0, min(65535, int(round((positions[i * 3 + a] - pmin[a]) / pscale[a])))))

    umin = [min(uvs[0::2]) if count else 0.0, min(uvs[1::2]) if count else 0.0]
    umax = [max(uvs[0::2]) if count else 1.0, max(uvs[1::2]) if count else 1.0]
    uscale = [max(umax[i] - umin[i], 1e-6) / 65535.0 for i in range(2)]
    quv = []
    for i in range(count):
        for a in range(2):
            quv.append(max(0, min(65535, int(round((uvs[i * 2 + a] - umin[a]) / uscale[a])))))

    qnrm = [max(-127, min(127, int(round(v * 127.0)))) for v in normals]

    # 浮点空间里仍有面积的极细三角，经过 uint16 位置量化后也可能塌成线；
    # 用最终整数坐标复查一次并直接剔除，保证浏览器拿到的索引没有零面积面。
    kept_indices = []
    for i in range(0, len(indices), 3):
        ia, ib, ic = indices[i:i + 3]
        a = qpos[ia * 3:ia * 3 + 3]
        b = qpos[ib * 3:ib * 3 + 3]
        c = qpos[ic * 3:ic * 3 + 3]
        ab = [b[axis] - a[axis] for axis in range(3)]
        ac = [c[axis] - a[axis] for axis in range(3)]
        cross = [ab[1] * ac[2] - ab[2] * ac[1],
                 ab[2] * ac[0] - ab[0] * ac[2],
                 ab[0] * ac[1] - ab[1] * ac[0]]
        if cross == [0, 0, 0]:
            continue
        physical_cross = [cross[0] * pscale[1] * pscale[2],
                          cross[1] * pscale[2] * pscale[0],
                          cross[2] * pscale[0] * pscale[1]]
        face_normal = Vector(physical_cross).normalized()
        averaged = Vector(tuple(qnrm[ia * 3 + axis] + qnrm[ib * 3 + axis]
                                + qnrm[ic * 3 + axis] for axis in range(3)))
        if averaged.length > 1e-8 and averaged.normalized().dot(face_normal) > 0.05:
            kept_indices.extend((ia, ib, ic))
            continue
        # 量化改变了极瘦三角的有效朝向时，给它独占三个顶点和面法线；不能就地
        # 改共享顶点，否则相邻的正常面会一起被拉花。
        for source in (ia, ib, ic):
            replacement = len(qpos) // 3
            qpos.extend(qpos[source * 3:source * 3 + 3])
            quv.extend(quv[source * 2:source * 2 + 2])
            qnrm.extend(max(-127, min(127, int(round(face_normal[axis] * 127.0))))
                        for axis in range(3))
            kept_indices.append(replacement)

    count = len(qpos) // 3
    wide = count > 65535
    return {
        "count": count,
        "posMin": [round(v, 6) for v in pmin],
        "posScale": [pscale[i] for i in range(3)],
        "uvMin": [round(v, 5) for v in umin],
        "uvScale": [uscale[i] for i in range(2)],
        "pos": _B64("H", qpos),
        "nrm": _B64("b", qnrm),
        "uv": _B64("H", quv),
        "idxBits": 32 if wide else 16,
        "idxCount": len(kept_indices),
        "idx": _B64("I" if wide else "H", kept_indices),
    }


# ---------------------------------------------------------------------------
# 实体性自检：零件之间到底连没连上
# ---------------------------------------------------------------------------
#
# 为什么需要机器来查这件事：
#   这条管线里的每个零件都是一个**独立的闭合 bmesh**，谁也不知道邻居在哪。
#   写建模脚本时是在脑子里对坐标 —— "枪托收在 z=+0.020，护木从 z=-0.010 起"
#   听着是接上了，其实中间空了 30 mm，扳机正下方从侧下方看得见地面。
#   这类洞在正片里只有几个像素，在编辑器台架上怼近了看却是第一眼就看到的事故，
#   而且**每一处都要绕着模型转一圈才找得到**。所以让构建期去找。
#
# 判据用**连通块的包围盒**，不是精确布尔：
#   零件之间要"读成一整块"，包围盒必须在三个轴上都真重叠一点（≥ 0.3 mm）。
#   包围盒重叠不代表实体一定相交（斜着摆的两根杆可以骗过它），但反过来是硬的：
#   包围盒不重叠 ⇒ 实体**一定**没接触。抓漏不抓错，正是自检要的方向。
#
# 顺带报"恰好贴面"（重叠量在 0—0.3 mm）：两张共面的皮在深度上打架，
# 转起来会闪 —— 用户说的"面穿透"里有一半是这个，不是真的插进去了。

CONTACT_MIN = 0.0003        # 3 丝。小于这个量的"接触"当成共面，会 z-fighting
COPLANAR_MAX = 0.0003


def _Islands(bm):
    """按顶点连通把一个 bmesh 拆成若干块，返回每块的 (min, max) 包围盒。

    一个 Join 出来的 bmesh 里可能装着好几个互不相连的零件（枪托 + 护木、
    两条脚架腿），拆开逐块判才有意义 —— 不拆的话一根横跨全枪的包围盒
    会把所有洞都盖住。
    """
    bm.verts.index_update()
    parent = list(range(len(bm.verts)))

    def Find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for edge in bm.edges:
        a, b = Find(edge.verts[0].index), Find(edge.verts[1].index)
        if a != b:
            parent[a] = b

    boxes = {}
    for v in bm.verts:
        root_id = Find(v.index)
        box = boxes.get(root_id)
        if box is None:
            boxes[root_id] = [list(v.co), list(v.co)]
        else:
            for a in range(3):
                box[0][a] = min(box[0][a], v.co[a])
                box[1][a] = max(box[1][a], v.co[a])
    return list(boxes.values())


def _Overlap(a, b):
    """两个包围盒在三个轴上的重叠量（负数 = 这个轴上分开了多远）。"""
    return [min(a[1][i], b[1][i]) - max(a[0][i], b[0][i]) for i in range(3)]


def AuditSolid(parts):
    """parts: [(label, bmin, bmax)]，全部在**根空间**。返回 (孤块报告, 共面报告)。

    孤块 = 与其它任何零件都没有真重叠的连通块，或者整个模型裂成了多个互不相连
    的团。第二种更隐蔽：捷克式的握把、枪托、机匣各自成团时，模型看着"齐全"，
    转到侧面才发现握把悬在半空。
    """
    n = len(parts)
    parent = list(range(n))

    def Find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    coplanar = []
    for i in range(n):
        for j in range(i + 1, n):
            ov = _Overlap(parts[i][1:], parts[j][1:])
            worst = min(ov)
            if worst >= CONTACT_MIN:
                a, b = Find(i), Find(j)
                if a != b:
                    parent[a] = b
            elif 0.0 <= worst <= COPLANAR_MAX:
                coplanar.append((parts[i][0], parts[j][0], worst))

    groups = {}
    for i in range(n):
        groups.setdefault(Find(i), []).append(parts[i][0])
    islands = list(groups.values())
    if len(islands) <= 1:
        return [], coplanar

    # 最大的那一团算主体，其余整团一起报（**不逐个零件报**：捷克式的机匣一旦
    # 从枪管上掉下来，挂在机匣上的弹匣、表尺、枪托、握把会跟着一起掉，
    # 逐个报出来是九行噪音，实际只有一处要改）。带上离主体最近的那道缝宽，
    # 好直接换算成"把这一段往回挪几毫米"。
    islands.sort(key=len, reverse=True)
    main = set(islands[0])
    box_of = {p[0]: p[1:] for p in parts}
    reports = []
    for stray in islands[1:]:
        best = None
        for label in stray:
            for other in main:
                gap = -min(_Overlap(box_of[label], box_of[other]))
                if best is None or gap < best[0]:
                    best = (gap, label, other)
        reports.append((
            "%s（%d 块）" % ("+".join(sorted(stray)[:4]) + ("…" if len(stray) > 4 else ""), len(stray)),
            "%s↔%s" % (best[1], best[2]) if best else "?",
            best[0] if best else 0.0,
        ))
    return reports, coplanar


# ---------------------------------------------------------------------------
# 导出
# ---------------------------------------------------------------------------

def WriteTzm(root, path, name, notes="", audit=True):
    """把节点树写成 .tzm.json。返回 (三角数, 网格块数, 字节数, 自检报告)。"""
    nodes, meshes = [], []
    index_of = {}
    order = list(root.Walk())
    for i, node in enumerate(order):
        index_of[id(node)] = i

    parent_of = {id(root): -1}
    for node in order:
        for c in node.children:
            parent_of[id(c)] = index_of[id(node)]

    # 包围盒必须在**根空间**里量，不能把每个节点的局部坐标堆在一起 ——
    # 堆出来的数字看着像模像样，其实是「所有零件都摆在原点」的假象，
    # 于是 1.66 m 的人报出 0.79 m 的高度，视锥剔除和落地判定跟着一起错。
    worlds = []
    for node in order:
        local = (Matrix.Translation(node.t)
                 @ Matrix.Rotation(node.r[2], 4, "Z")
                 @ Matrix.Rotation(node.r[1], 4, "Y")
                 @ Matrix.Rotation(node.r[0], 4, "X")
                 @ Matrix.Diagonal((node.s[0], node.s[1], node.s[2], 1.0)))
        parent = parent_of[id(node)]
        worlds.append(local if parent < 0 else worlds[parent] @ local)

    total_tris = 0
    bounds_min = [1e9] * 3
    bounds_max = [-1e9] * 3
    audit_parts = []
    for nodeIndex, node in enumerate(order):
        # 同一节点上同材质的零件先合成一块：帽子 6 个零件都是 uniform，
        # 不在这里并的话文件里就是 6 个 mesh 块，加载器还得再并一次
        by_material = {}
        for material, bm, tile in node.parts:
            by_material.setdefault((material, tile), []).append(bm)
        entry = {
            "name": node.name,
            "parent": parent_of[id(node)],
            "t": [round(v, 6) for v in node.t],
            "r": [round(v, 6) for v in node.r],
        }
        if node.s != (1.0, 1.0, 1.0):
            entry["s"] = [round(v, 6) for v in node.s]
        if node.joint:
            entry["joint"] = True
        mesh_ids = []
        for (material, tile), bms in by_material.items():
            loops = []
            for bm in bms:
                # 自检要在三角化与 free 之前取：连通块只跟拓扑有关，
                # 但 bmesh 一 free 就什么都问不到了
                for box in _Islands(bm):
                    corners = [
                        worlds[nodeIndex] @ Vector((box[a][0], box[b][1], box[c][2]))
                        for a in (0, 1) for b in (0, 1) for c in (0, 1)
                    ]
                    lo = [min(p[i] for p in corners) for i in range(3)]
                    hi = [max(p[i] for p in corners) for i in range(3)]
                    audit_parts.append(("%s:%s#%d" % (node.name, material, len(audit_parts)), lo, hi))
                loops.extend(_ExtractLoops(bm, tile))
                bm.free()
            if not loops:
                continue
            positions, normals, uvs, indices = _BuildMesh(loops)
            if not indices:
                continue
            world = worlds[nodeIndex]
            for i in range(0, len(positions), 3):
                p = world @ Vector((positions[i], positions[i + 1], positions[i + 2]))
                for a in range(3):
                    bounds_min[a] = min(bounds_min[a], p[a])
                    bounds_max[a] = max(bounds_max[a], p[a])
            block = _Quantize(positions, normals, uvs, indices)
            block["material"] = material
            total_tris += block["idxCount"] // 3
            mesh_ids.append(len(meshes))
            meshes.append(block)
        if mesh_ids:
            entry["meshes"] = mesh_ids
        nodes.append(entry)

    doc = {
        "format": "tzm",
        "version": 1,
        "name": name,
        "units": "meters",
        "axis": "Y-up, -Z forward",
        "generator": "Blender %s / Taierzhuang1938/_blender" % bpy.app.version_string,
        "notes": notes,
        "triangles": total_tris,
        "bounds": {
            "min": [round(v, 5) for v in bounds_min],
            "max": [round(v, 5) for v in bounds_max],
        },
        "nodes": nodes,
        "meshes": meshes,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(doc, handle, ensure_ascii=False, separators=(",", ":"))
    strays, coplanar = AuditSolid(audit_parts) if audit else ([], [])
    return total_tris, len(meshes), os.path.getsize(path), {"strays": strays, "coplanar": coplanar}


def ResetScene():
    """清空场景。布尔/减面借了 bpy 的对象，跑完一个模型就扫干净，
    不然下一个模型的 depsgraph 里还挂着上一个的残骸。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)

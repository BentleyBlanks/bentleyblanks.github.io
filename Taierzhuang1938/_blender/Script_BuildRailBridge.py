# -*- coding: utf-8 -*-
"""Script_BuildRailBridge.py —— 北沙河铁路桥（第一关 18「奉令毁桥」）的模型与坍塌动画。

口径：Taierzhuang1938/docs/Data_RailBridge.md（2026-09-30「三孔」一节）。

河拓宽到约 66 m 之后，桥是三孔铆接钢桁架下承桥（普拉特式、折线上弦，每孔钢梁 23.2 m / 墩心距 24 m、
桁高 5.4–6.2 m），由南到北：南引桥（料石实体，坐在沙滩后的路基上）→ 1 号墩（南岸沙滩水边）→
被炸的最南一孔 → 2 号墩 → 中孔 → 3 号墩 → 北孔 → 北桥台（八字翼墙，坐在北岸）。
三个墩是圆端（长圆形）料石墩，带帽石与支座。桥面是横梁 + 纵梁 + 枕木 + 纵铺木板 + 两股钢轨。
18 阶段 1 号墩顶与最南一孔跨中预埋了炸药，导爆索沿下弦走到墩顶、顺墩身下到沙滩，
再沿沙地拉到安全区的起爆器；1 号墩脚下摆着木药箱与一卷线（爆破手蹲在那儿装药）。

坍塌是**程序算出来的关键帧**，不是 Blender 刚体解算，**只有最南一孔塌**：
  · 跨中一整个节间（|z| < CUT）被炸飞成若干块碎件；
  · 北半孔以北端支座（2 号墩）为铰向河里折下去，自由端落在真实的河底高度上；
  · 1 号墩的药包把墩顶帽石与支座掀飞，南半孔失去支撑：整孔往北滑出墩顶、贴着墩的北面刮下去落进河槽
    （从南岸顺着桥轴看，只有这样才读得出「近处这一孔没了」）；
  · 碎件按抛体 + 自旋积分，落在从游戏地形导出的高度场上（Data_RailBridgeTerrain.json），
    进水就减速沉底并记一条溅水事件；
  · 另两孔、2/3 号墩、北桥台原样不动（两孔共用一份网格实例）。
全部坐标**直接按游戏轴建**（Y 上、X 东、Z 南，原点 = 被炸孔中心 (-77, 0, 148)），导出时
export_yup=False —— 在 Blender 视口里看模型是躺着的，这是刻意的（与 TzmCore 同一约定）。

产物：
  Model/Model_RailBridge.glb    网格（每块一个节点）+ 一段 "Collapse" 动画（30 fps）
  Model/Data_RailBridge.json    件表、事件（起爆 / 入水 / 落地 / 砸底）、末态与三角统计
  <SOURCE_DIR>/Model_RailBridge.blend 与 Review/*.png（只留本机）

在本任务的独立 Blender 里跑（BlenderMCP）：
  node scripts/Script_BlenderMcp.mjs start --task RailBridge
  node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<worktree>/Taierzhuang1938/_blender/Script_BuildRailBridge.py', run_name='__main__')"
地形改了先重跑 _blender/Script_ExportRailBridgeTerrain.mjs。
"""
import bpy
import json
import math
import os
import random
import hashlib
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
MODEL_DIR = os.path.join(PROJECT, "Model")
SOURCE_DIR = os.environ.get("RAIL_BRIDGE_SOURCE_DIR",
                            r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/RailBridge")
TERRAIN_PATH = os.path.join(HERE, "Data_RailBridgeTerrain.json")
TERRAIN_TEXT = open(TERRAIN_PATH, "r", encoding="utf-8").read()
TERRAIN = json.loads(TERRAIN_TEXT)

FPS = 30
DURATION = 6.0
FRAMES = int(round(DURATION * FPS)) + 1

# ---------------------------------------------------------------------------
# 尺寸（米，桥局部坐标）
# ---------------------------------------------------------------------------
TX = TERRAIN["deck"]["trussOffsetX"]    # 2.95：桁架中面，与桁架碰撞盒同一位置
RAIL_X = TERRAIN["deck"]["railGaugeHalf"]
BEAR = 11.6                              # 支座 |z|
FACE = 10.8                              # 桥台前墙 |z|
NP = 6
PANEL = 2 * BEAR / NP                    # 3.867
NODE_Z = [-BEAR + i * PANEL for i in range(NP + 1)]
YB = -0.10                               # 下弦中心
TOPH = [None, 5.4, 6.0, 6.2, 6.0, 5.4, None]
BC_W, BC_H = 0.40, 0.50
TC_W, TC_H = 0.44, 0.46
TIE_TOP, TIE_H, TIE_W, TIE_HALF = 0.53, 0.18, 0.22, 2.6
PLANK_TOP = 0.66                         # = MISSION_RAIL_BRIDGE.deckTopY，桥面碰撞盒顶
STR_X, STR_TOP, STR_D = 0.72, 0.35, 0.55
FB_TOP, FB_D = 0.35, 0.70
CUT = 1.933                              # 跨中被炸飞的那一节间半宽
APPROACH = 99.0                          # 单孔时代 |z| 超过它的桥面属于桥台；三孔各孔自成一件，不再分区
SEAT_Y = -0.47
COPING_Y0 = -0.77
HALF_SPAN = 12.0                         # 墩心距的一半（24 m）

# 三孔布局（局部 z，原点 = 被炸孔中心）：墩心与各孔中心都从游戏地形快照里的布局读，写死的只是校验
LAYOUT = TERRAIN["layout"]
PIER_Z = {p["id"]: p["z"] for p in LAYOUT["piers"]}
P1, P2, P3 = PIER_Z["Pier1"], PIER_Z["Pier2"], PIER_Z["Pier3"]
SPAN_A, SPAN_B, SPAN_C = (P1 + P2) / 2, (P2 + P3) / 2, P3 - HALF_SPAN     # 被炸孔 / 中孔 / 北孔中心
NORTH_GAP_Z, SOUTH_GAP_Z = TERRAIN["deck"]["gapZ"]                           # 道砟 / 枕木 / 钢轨断开的两端
assert abs(SPAN_A) < 1e-6 and abs(P1 - P2 - 2 * HALF_SPAN) < 1e-6 and abs(P2 - P3 - 2 * HALF_SPAN) < 1e-6, PIER_Z
PIER_R, PIER_HL = 1.8, 1.9               # 长圆墩：两端半径 1.8、直边半长 1.9（白盒碰撞盒 3.4 × 3.6 整个埋在里面）
PIER_TOP_COURSE = -0.97                  # 帽石层的底（1 号墩被炸后剩下的墩顶）

WATER_TOP = TERRAIN["water"]["top"]
WATER_Z0 = TERRAIN["water"]["z0"]
WATER_Z1 = TERRAIN["water"]["z1"]

TILE = {"Steel": 0.9, "Stone": 1.4, "Timber": 1.0, "Charge": 0.6, "Cable": 0.5}
MATERIAL_NAME = {k: "RailBridge" + k for k in TILE}
REVIEW_COLOR = {"Steel": (0.08, 0.085, 0.085, 1), "Stone": (0.42, 0.39, 0.34, 1), "Timber": (0.2, 0.15, 0.1, 1),
                "Charge": (0.45, 0.38, 0.22, 1), "Cable": (0.02, 0.02, 0.02, 1)}


def TerrainAt(x, z):
    grid, h = TERRAIN["grid"], TERRAIN["heights"]
    fx = (x - grid["x0"]) / grid["step"]
    fz = (z - grid["z0"]) / grid["step"]
    ix = max(0, min(len(h[0]) - 2, int(math.floor(fx))))
    iz = max(0, min(len(h) - 2, int(math.floor(fz))))
    tx = min(1.0, max(0.0, fx - ix))
    tz = min(1.0, max(0.0, fz - iz))
    a = h[iz][ix] * (1 - tx) + h[iz][ix + 1] * tx
    b = h[iz + 1][ix] * (1 - tx) + h[iz + 1][ix + 1] * tx
    return a * (1 - tz) + b * tz


# ---------------------------------------------------------------------------
# 几何收集：件名 -> 顶点/面/材质/UV
# ---------------------------------------------------------------------------
class Geo:
    __slots__ = ("verts", "faces", "mats", "uvs", "share")

    def __init__(self):
        self.verts, self.faces, self.mats, self.uvs, self.share = [], [], [], [], None


PIECES = {}
KIND = {}
UV_RNG = random.Random(1938)
HEXA_FACES = ((1, 3, 7, 5), (0, 4, 6, 2), (2, 6, 7, 3), (0, 1, 5, 4), (4, 5, 7, 6), (0, 2, 3, 1))
# 造一孔桁架时的三个开关：FORCE 非空 = 这一孔所有几何都进同一件（永久孔）；CUTTING 关 = 构件不按跨中节间切开。
FORCE = None
CUTTING = True
STATIC_NAMES = ("AbutmentNorth", "ApproachSouth", "Piers", "SpanMid", "SpanNorth")


def Piece(name, kind):
    if name not in PIECES:
        PIECES[name] = Geo()
        KIND[name] = kind
    return PIECES[name]


def KindOf(name):
    if name.startswith("__") or name in STATIC_NAMES:
        return "static"
    if name in ("NorthSpan", "SouthSpan"):
        return "span"
    if name in ("Charges", "CableBridge", "Crates"):
        return "charges"
    if name == "CableGround":
        return "cable"
    if name == "Exploder":
        return "exploder"
    if name == "ExploderHandle":
        return "handle"
    return "debris"


def Quad(piece, mat, quad, offset):
    if FORCE:
        piece = FORCE
    g = Piece(piece, KindOf(piece))
    base = len(g.verts)
    g.verts.extend(tuple(p) for p in quad)
    g.faces.append((base, base + 1, base + 2, base + 3))
    g.mats.append(mat)
    e1, e3 = quad[1] - quad[0], quad[3] - quad[0]
    if e1.length >= e3.length:
        ua = e1.normalized()
        rest = e3 - ua * e3.dot(ua)
    else:
        ua = e3.normalized()
        rest = e1 - ua * e1.dot(ua)
    va = rest.normalized() if rest.length > 1e-9 else ua.orthogonal().normalized()
    tile = TILE[mat]
    g.uvs.append([((p - quad[0]).dot(ua) / tile + offset[0], (p - quad[0]).dot(va) / tile + offset[1]) for p in quad])


def Hexa(piece, mat, c):
    c = [Vector(p) for p in c]
    if (c[1] - c[0]).cross(c[2] - c[0]).dot(c[4] - c[0]) < 0:
        c = [c[1], c[0], c[3], c[2], c[5], c[4], c[7], c[6]]
    offset = (UV_RNG.random() * 4, UV_RNG.random() * 4)
    for f in HEXA_FACES:
        Quad(piece, mat, [c[i] for i in f], offset)


def Box(piece, mat, centre, X, Y, Z):
    centre = Vector(centre)
    corners = []
    for i in range(8):
        sx = 1 if i & 1 else -1
        sy = 1 if i & 2 else -1
        sz = 1 if i & 4 else -1
        corners.append(centre + X * sx + Y * sy + Z * sz)
    Hexa(piece, mat, corners)


def AxisBox(piece, mat, x0, x1, y0, y1, z0, z1):
    if x0 > x1:
        x0, x1 = x1, x0
    if z0 > z1:
        z0, z1 = z1, z0
    if y0 > y1:
        y0, y1 = y1, y0
    Box(piece, mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
        Vector(((x1 - x0) / 2, 0, 0)), Vector((0, (y1 - y0) / 2, 0)), Vector((0, 0, (z1 - z0) / 2)))


def Beam(piece, mat, a, b, w, h, xaxis=(1, 0, 0)):
    a, b = Vector(a), Vector(b)
    z = b - a
    length = z.length
    if length < 1e-6:
        return
    zn = z / length
    xa = Vector(xaxis)
    xa = xa - zn * xa.dot(zn)
    if xa.length < 1e-6:
        xa = zn.orthogonal()
    xa.normalize()
    ya = zn.cross(xa)
    Box(piece, mat, (a + b) / 2, xa * (w / 2), ya * (h / 2), zn * (length / 2))


def Region(z):
    if z <= -APPROACH:
        return "AbutmentNorth"
    if z >= APPROACH:
        return "AbutmentSouth"
    if z < -CUT:
        return "NorthSpan"
    if z > CUT:
        return "SouthSpan"
    return "Centre"


def Side(x):
    return "W" if x < 0 else "E"


def TrussRule(s):
    def rule(p):
        r = Region(p.z)
        return "CentreTruss" + Side(s) if r == "Centre" else r
    return rule


def FloorRule(p):
    r = Region(p.z)
    return "CentreFloor" if r == "Centre" else r


def BracingRule(p):
    r = Region(p.z)
    return "CentreBracing" if r == "Centre" else r


def DeckRule(p):
    r = Region(p.z)
    if r != "Centre":
        return r
    band = 0 if p.z < -0.65 else (1 if p.z < 0.65 else 2)
    return "DeckChunk%s%d" % (Side(p.x), band)


def RailRule(p):
    r = Region(p.z)
    if r != "Centre":
        return r
    return "RailBit%s%s" % (Side(p.x), "N" if p.z < 0 else "S")


TRUSS_CUTS = (-CUT, CUT)
DECK_CUTS = (-APPROACH, -CUT, -0.65, 0.65, CUT, APPROACH)
RAIL_CUTS = (-APPROACH, -CUT, 0.0, CUT, APPROACH)


def Member(rule, mat, a, b, w, h, xaxis=(1, 0, 0), cuts=None):
    if cuts is None:
        cuts = TRUSS_CUTS if CUTTING else ()
    a, b = Vector(a), Vector(b)
    ts = [0.0, 1.0]
    for c in cuts:
        if (a.z - c) * (b.z - c) < 0:
            ts.append((c - a.z) / (b.z - a.z))
    ts.sort()
    for t0, t1 in zip(ts, ts[1:]):
        if t1 - t0 < 1e-6:
            continue
        p0, p1 = a.lerp(b, t0), a.lerp(b, t1)
        Beam(rule((p0 + p1) / 2), mat, p0, p1, w, h, xaxis)


def RuleBox(rule, mat, x0, x1, y0, y1, z0, z1):
    AxisBox(rule(Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))), mat, x0, x1, y0, y1, z0, z1)


# ---------------------------------------------------------------------------
# 北桥台（北孔的北端：以北孔中心 SPAN_C 为基准，沿用单孔时代的桥台尺寸；坐在北岸，大半埋在岸里）
# 南端不再是桥台：那里是 1 号墩 + 南引桥（见 Pier / ApproachSouth）。
# ---------------------------------------------------------------------------
def AbutmentNorthBuild():
    sigma = -1
    name = "AbutmentNorth"
    rng = random.Random(41)
    Z = lambda v: SPAN_C + sigma * v
    # 基础与墙身芯（前脸缩进 0.15，让料石之间的灰缝读得出深度）
    AxisBox(name, "Stone", -4.7, 4.7, -4.62, -4.2, Z(10.35), Z(17.3))
    AxisBox(name, "Stone", -4.2, 4.2, -4.2, COPING_Y0, Z(10.95), Z(17.0))
    # 前脸料石：8 皮，错缝，块面随机凸出 0–5 cm
    courses = 8
    ch = (COPING_Y0 - (-4.2)) / courses
    gap = 0.028
    for c in range(courses):
        y0 = -4.2 + c * ch
        x = -4.2 - (rng.uniform(0.2, 0.55) if c % 2 else 0)
        while x < 4.2:
            length = rng.uniform(0.62, 1.22)
            x1 = min(4.2, x + length)
            xa = max(-4.2, x)
            if x1 - xa > 0.12:
                p = rng.uniform(0.0, 0.055)
                AxisBox(name, "Stone", xa + gap / 2, x1 - gap / 2, y0 + gap / 2, y0 + ch - gap / 2,
                        Z(FACE - p), Z(11.05))
            x = x1
    # 转角的隅石：两侧各一列长短交替的立石
    for c in range(courses):
        y0 = -4.2 + c * ch
        for side in (-1, 1):
            depth = 0.9 if c % 2 == 0 else 0.55
            AxisBox(name, "Stone", side * 4.2, side * 4.28, y0 + gap / 2, y0 + ch - gap / 2,
                    Z(FACE - 0.02), Z(FACE + depth))
    # 帽石（桥座前沿，外挑 0.12）
    x = -4.35
    while x < 4.35:
        x1 = min(4.35, x + rng.uniform(0.85, 1.2))
        AxisBox(name, "Stone", x + 0.012, x1 - 0.012, COPING_Y0 + 0.01, SEAT_Y, Z(FACE - 0.12), Z(BEAR))
        x = x1
    # 桥座与背墙、填心、道砟
    AxisBox(name, "Stone", -4.2, 4.2, COPING_Y0, SEAT_Y, Z(BEAR), Z(12.2))
    AxisBox(name, "Stone", -4.2, 4.2, COPING_Y0, 0.12, Z(12.2), Z(17.0))
    AxisBox(name, "Stone", -4.35, 4.35, 0.08, 0.2, Z(12.12), Z(12.34))          # 背墙顶的压顶石
    ballast = [(-3.3, 0.1, 12.05), (3.3, 0.1, 12.05), (-2.75, 0.35, 12.05), (2.75, 0.35, 12.05),
               (-3.3, 0.1, 14.5), (3.3, 0.1, 14.5), (-2.75, 0.35, 14.5), (2.75, 0.35, 14.5)]
    Hexa(name, "Stone", [Vector((x, y, Z(z))) for (x, y, z) in ballast])
    # 八字翼墙：从前墙两角斜着往后、往外张，顶面随岸坡降下去
    for side in (-1, 1):
        f = Vector((side * 4.2, 0, Z(FACE)))
        b = Vector((side * 6.1, 0, Z(16.9)))
        d = (b - f).normalized()
        n = Vector((d.z, 0, -d.x))
        if n.x * side < 0:
            n = -n
        t_front, t_back = -0.55, TerrainAt(b.x, b.z) + 0.38
        u_front, u_back = -4.62, TerrainAt(b.x, b.z) - 0.7
        corners = []
        for i in range(8):
            ix, iy, iz = i & 1, (i >> 1) & 1, (i >> 2) & 1
            base = f if iz == 0 else b
            p = base + n * (0.85 * ix)
            y = (t_front if iz == 0 else t_back) if iy else (u_front if iz == 0 else u_back)
            corners.append(Vector((p.x, y, p.z)))
        Hexa(name, "Stone", corners)
        cap = []
        for i in range(8):
            ix, iy, iz = i & 1, (i >> 1) & 1, (i >> 2) & 1
            base = f if iz == 0 else b
            p = base + n * (-0.08 + 1.01 * ix)
            y = (t_front if iz == 0 else t_back) + (0.2 if iy else -0.06)
            cap.append(Vector((p.x, y, p.z)))
        Hexa(name, "Stone", cap)
    # 北孔北端的支座（床石 + 铸钢座）随北孔那份模板走（SpanShoes），这里不再造。


def Shoe(piece, xc, zb):
    """一副支座：床石 + 铸钢座，以支座中心 zb 为准（相邻两孔的支座在同一个墩上隔 0.8 m，所以只有 ±0.38 长）。"""
    AxisBox(piece, "Stone", xc - 0.52, xc + 0.52, SEAT_Y, -0.40, zb - 0.38, zb + 0.38)
    AxisBox(piece, "Steel", xc - 0.31, xc + 0.31, -0.40, -0.345, zb - 0.28, zb + 0.28)
    AxisBox(piece, "Steel", xc - 0.36, xc + 0.36, -0.40, -0.37, zb - 0.34, zb + 0.34)


# ---------------------------------------------------------------------------
# 长圆墩（1/2/3 号）。**桥面标高是白盒定死的**（桥面顶 0.66、钢梁底 -0.375），水面在 -1.2 上下，
# 所以墩身大半在水里 / 沙里，露出来的是帽石层与最上一两皮 —— 不要做成概念图里三米高的圆柱。
# 墩心 zp。obround：两端半圆（半径 PIER_R），直边半长 PIER_HL。
# ---------------------------------------------------------------------------
def StadiumPoints(zp, n=6):
    pts = []
    for k in range(n + 1):                                   # 东端半圆：北 → 东 → 南
        a = -math.pi / 2 + math.pi * k / n
        pts.append(Vector((PIER_HL + PIER_R * math.cos(a), 0, zp + PIER_R * math.sin(a))))
    for k in range(n + 1):                                   # 西端半圆：南 → 西 → 北
        a = math.pi / 2 + math.pi * k / n
        pts.append(Vector((-PIER_HL + PIER_R * math.cos(a), 0, zp + PIER_R * math.sin(a))))
    return pts


def StoneRing(zp, y0, y1, rng, piece_of, stagger, inset=0.62, protrude=0.045):
    """一皮沿长圆周砌的料石。piece_of(k) 给第 k 块所属的件名。"""
    pts = StadiumPoints(zp)
    edges = []
    for k in range(len(pts)):
        a, b = pts[k], pts[(k + 1) % len(pts)]
        n = max(1, int(round((b - a).length / 1.9)))
        cuts = [i / n for i in range(n + 1)]
        if stagger and n > 1:
            cuts = [0.0] + [min(0.97, max(0.03, c + 0.5 / n)) for c in cuts[1:-1]] + [1.0]
        for t0, t1 in zip(cuts, cuts[1:]):
            edges.append((a.lerp(b, t0), a.lerp(b, t1)))
    gap = 0.02
    centre = Vector((0, 0, zp))
    for k, (a, b) in enumerate(edges):
        p = rng.uniform(0.0, protrude)
        out = []
        for pt in (a, b):
            d = pt - centre
            d.y = 0
            # 半圆上的点沿本端圆心往外凸；直边上的点沿 z 往外凸
            cx = PIER_HL if pt.x > 0 else -PIER_HL
            r = Vector((pt.x - cx, 0, pt.z - zp))
            r = r.normalized() if r.length > 1e-6 and abs(pt.x) > PIER_HL - 1e-6 else Vector((0, 0, 1 if pt.z > zp else -1))
            out.append(pt + r * p)
        inner = [Vector((o.x * inset, 0, zp + (o.z - zp) * inset)) for o in out]
        c = []
        for i in range(8):
            end, yy, depth = i & 1, (i >> 1) & 1, (i >> 2) & 1
            base = out[end] if depth == 0 else inner[end]
            # 块与块之间留灰缝：沿边方向各收 gap/2
            other = out[1 - end] if depth == 0 else inner[1 - end]
            base = base.lerp(other, gap / max(0.05, (out[0] - out[1]).length))
            c.append(Vector((base.x, y1 - gap / 2 if yy else y0 + gap / 2, base.z)))
        Hexa(piece_of(k), "Stone", c)
    return len(edges)


def Pier(zp, blasted=False):
    """墩身：埋进河床的芯、三皮料石、帽石层。blasted（1 号墩）的帽石层逐块成件（Pier1Cap*）—— 起爆时被药包掀飞。"""
    rng = random.Random(53 + int(zp))
    ymid = PIER_TOP_COURSE
    core_hw = PIER_HL + PIER_R * 0.62
    AxisBox("Piers", "Stone", -core_hw, core_hw, -4.7, ymid, zp - 1.1, zp + 1.1)
    # 露出水面 / 沙面的几皮：从 -2.6 起三皮到 PIER_TOP_COURSE
    courses = 3
    ch = (ymid - (-2.6)) / courses
    for c in range(courses):
        StoneRing(zp, -2.6 + c * ch, -2.6 + (c + 1) * ch, rng, lambda k: "Piers", stagger=c % 2 == 1)
    # 帽石层（PIER_TOP_COURSE → 桥座面 SEAT_Y）：芯板 + 一圈料石
    if blasted:
        n = StoneRing(zp, ymid, SEAT_Y, rng, lambda k: "Pier1Cap%d" % (k // 2), stagger=False, protrude=0.06)
        for j, (xa, xb) in enumerate(((-core_hw, -1.0), (-1.0, 1.0), (1.0, core_hw))):
            AxisBox("Pier1Cap%d" % (n // 2 + j), "Stone", xa + 0.01, xb - 0.01, ymid, SEAT_Y, zp - 1.1, zp + 1.1)
    else:
        StoneRing(zp, ymid, SEAT_Y, rng, lambda k: "Piers", stagger=False, protrude=0.06)
        AxisBox("Piers", "Stone", -core_hw, core_hw, ymid, SEAT_Y, zp - 1.1, zp + 1.1)


# ---------------------------------------------------------------------------
# 桁架（s = -1 西片、+1 东片）
# ---------------------------------------------------------------------------
def TopY(i):
    return YB + TOPH[i]


def Truss(s):
    rule = TrussRule(s)
    x = s * TX
    # 下弦：箱形 + 底盖板 + 上沿两道角钢
    Member(rule, "Steel", (x, YB, -BEAR - 0.35), (x, YB, BEAR + 0.35), BC_W, BC_H)
    Member(rule, "Steel", (x, YB - BC_H / 2 - 0.012, -BEAR - 0.35), (x, YB - BC_H / 2 - 0.012, BEAR + 0.35), BC_W + 0.07, 0.025)
    for e in (-1, 1):
        Member(rule, "Steel", (x + e * (BC_W / 2 + 0.02), YB + BC_H / 2 - 0.04, -BEAR - 0.3),
               (x + e * (BC_W / 2 + 0.02), YB + BC_H / 2 - 0.04, BEAR + 0.3), 0.045, 0.08)
    # 端斜杆与上弦
    for i0, i1 in ((0, 1), (6, 5)):
        a = Vector((x, YB, NODE_Z[i0]))
        b = Vector((x, TopY(i1), NODE_Z[i1]))
        d = (b - a).normalized()
        Member(rule, "Steel", a - d * 0.2, b + d * 0.24, TC_W, TC_H)
        Member(rule, "Steel", a - d * 0.1, b + d * 0.2, TC_W + 0.1, 0.03, xaxis=(1, 0, 0))
    for i in range(1, 5):
        a = Vector((x, TopY(i), NODE_Z[i]))
        b = Vector((x, TopY(i + 1), NODE_Z[i + 1]))
        Member(rule, "Steel", a, b, TC_W, TC_H)
        up = Vector((0, 1, 0))
        Member(rule, "Steel", a + up * (TC_H / 2 + 0.012), b + up * (TC_H / 2 + 0.012), TC_W + 0.1, 0.025)
    # 竖杆：1、5 是吊杆（两块扁钢），2、3、4 是缀条连起来的两根槽钢
    for i in range(1, 6):
        z = NODE_Z[i]
        y0, y1 = YB + BC_H / 2, TopY(i) - TC_H / 2
        if i in (1, 5):
            for dz in (-0.1, 0.1):
                Member(rule, "Steel", (x, y0, z + dz), (x, y1, z + dz), 0.24, 0.028, xaxis=(1, 0, 0))
            continue
        for dz in (-0.15, 0.15):
            Member(rule, "Steel", (x, y0, z + dz), (x, y1, z + dz), 0.3, 0.075, xaxis=(1, 0, 0))
        pitch = 0.42
        steps = max(2, int((y1 - y0) / pitch))
        for face in (-1, 1):
            xf = x + face * 0.155
            for k in range(steps):
                ya = y0 + (y1 - y0) * k / steps
                yb = y0 + (y1 - y0) * (k + 1) / steps
                za, zb = (z - 0.15, z + 0.15) if k % 2 == 0 else (z + 0.15, z - 0.15)
                Member(rule, "Steel", (xf, ya, za), (xf, yb, zb), 0.012, 0.055, xaxis=(1, 0, 0))
    # 主斜杆（眼杆成对）与跨中两格的反斜杆（圆钢 + 花篮螺栓）
    diagonals = ((1, 2), (2, 3), (5, 4), (4, 3))
    for ti, bi in diagonals:
        a = Vector((x, TopY(ti) - 0.18, NODE_Z[ti]))
        b = Vector((x, YB + 0.12, NODE_Z[bi]))
        for dx in (-0.13, 0.13):
            Member(rule, "Steel", a + Vector((dx, 0, 0)), b + Vector((dx, 0, 0)), 0.035, 0.2, xaxis=(1, 0, 0))
    for ti, bi in ((3, 2), (3, 4)):
        a = Vector((x, TopY(ti) - 0.18, NODE_Z[ti]))
        b = Vector((x, YB + 0.12, NODE_Z[bi]))
        Member(rule, "Steel", a, b, 0.055, 0.055)
        m = a.lerp(b, 0.5)
        d = (b - a).normalized()
        Member(rule, "Steel", m - d * 0.18, m + d * 0.18, 0.09, 0.09)
    # 节点板：每个节点两面各一块
    for i in range(NP + 1):
        z = NODE_Z[i]
        for face in (-1, 1):
            xf = x + face * (BC_W / 2 + 0.013)
            if i in (0, NP):
                RuleBox(rule, "Steel", xf - 0.011, xf + 0.011, YB - 0.24, YB + 0.95, z - 0.62, z + 0.62)
            else:
                RuleBox(rule, "Steel", xf - 0.011, xf + 0.011, YB - 0.2, YB + 0.78, z - 0.58, z + 0.58)
            if 1 <= i <= 5:
                xt = x + face * (TC_W / 2 + 0.013)
                RuleBox(rule, "Steel", xt - 0.011, xt + 0.011, TopY(i) - 0.95, TopY(i) + 0.16, z - 0.6, z + 0.6)


# ---------------------------------------------------------------------------
# 两片桁架之间：横梁、纵梁、上下平联、门架、横联
# ---------------------------------------------------------------------------
def Portal(i_bottom, i_top):
    rule = BracingRule
    sigma = -1 if NODE_Z[i_bottom] < 0 else 1
    a = Vector((0, YB, NODE_Z[i_bottom]))
    b = Vector((0, TopY(i_top), NODE_Z[i_top]))
    d = (b - a).normalized()
    n = Vector((1, 0, 0)).cross(d)
    if n.z * sigma < 0:
        n = -n
    P = lambda f: a.lerp(b, f)
    xin = TX - TC_W / 2
    ft, fb = 0.94, 0.75
    for f in (ft, fb):
        p = P(f)
        Member(rule, "Steel", (-xin, p.y, p.z), (xin, p.y, p.z), 0.16, 0.13, xaxis=tuple(d))
    steps = 10
    for k in range(steps):
        xa = -xin + 2 * xin * k / steps
        xb = -xin + 2 * xin * (k + 1) / steps
        fa, fb2 = (ft, fb) if k % 2 == 0 else (fb, ft)
        pa, pb = P(fa), P(fb2)
        Member(rule, "Steel", (xa, pa.y, pa.z), (xb, pb.y, pb.z), 0.016, 0.075, xaxis=tuple(n))
    for side in (-1, 1):
        p0, p1 = P(fb), P(0.5)
        Member(rule, "Steel", (side * (xin - 1.25), p0.y, p0.z), (side * xin, p1.y, p1.z), 0.13, 0.13, xaxis=tuple(n))
    # 门架铭牌：外挑 0.1，朝桥外
    c = P(0.845) + n * 0.1
    Box(rule(c), "Steel", c, Vector((0.78, 0, 0)), d * 0.19, n * 0.018)
    Box(rule(c), "Timber", c + n * 0.022, Vector((0.7, 0, 0)), d * 0.13, n * 0.006)


def CrossMembers():
    xin = TX - BC_W / 2
    for i in range(NP + 1):
        z = NODE_Z[i]
        # 横梁：工字钢（腹板 + 上下翼缘）
        RuleBox(FloorRule, "Steel", -xin, xin, FB_TOP - FB_D + 0.035, FB_TOP - 0.035, z - 0.012, z + 0.012)
        for y0, y1 in ((FB_TOP - 0.035, FB_TOP), (FB_TOP - FB_D, FB_TOP - FB_D + 0.035)):
            RuleBox(FloorRule, "Steel", -xin, xin, y0, y1, z - 0.15, z + 0.15)
    for i in range(NP):
        za, zb = NODE_Z[i] + 0.15, NODE_Z[i + 1] - 0.15
        for sx in (-1, 1):
            x = sx * STR_X
            Member(FloorRule, "Steel", (x, STR_TOP - STR_D / 2, za), (x, STR_TOP - STR_D / 2, zb), 0.018, STR_D - 0.06)
            for y in (STR_TOP - 0.015, STR_TOP - STR_D + 0.015):
                Member(FloorRule, "Steel", (x, y, za), (x, y, zb), 0.2, 0.03)
        # 下平联
        for e in (-1, 1):
            Member(FloorRule, "Steel", (-e * (xin - 0.05), -0.3, NODE_Z[i]), (e * (xin - 0.05), -0.3, NODE_Z[i + 1]),
                   0.1, 0.1, xaxis=(0, 1, 0))
    # 上平联：每个上弦节点一道缀条横撑，每个上弦节间一对交叉撑
    xin = TX - TC_W / 2
    for i in range(1, 6):
        z, y = NODE_Z[i], TopY(i)
        for yy in (y + 0.16, y - 0.24):
            Member(BracingRule, "Steel", (-xin, yy, z), (xin, yy, z), 0.12, 0.12, xaxis=(0, 0, 1))
        steps = 12
        for k in range(steps):
            xa = -xin + 2 * xin * k / steps
            xb = -xin + 2 * xin * (k + 1) / steps
            ya, yb = (y + 0.16, y - 0.24) if k % 2 == 0 else (y - 0.24, y + 0.16)
            Member(BracingRule, "Steel", (xa, ya, z), (xb, yb, z), 0.014, 0.06, xaxis=(0, 0, 1))
        if i in (2, 3, 4):
            for side in (-1, 1):
                Member(BracingRule, "Steel", (side * (xin - 1.05), y - 0.3, z), (side * (TX - 0.16), y - 1.35, z),
                       0.11, 0.11, xaxis=(0, 0, 1))
    for i in range(1, 5):
        for e in (-1, 1):
            Member(BracingRule, "Steel", (-e * xin, TopY(i) + 0.08, NODE_Z[i]),
                   (e * xin, TopY(i + 1) + 0.08, NODE_Z[i + 1]), 0.1, 0.1, xaxis=(0, 1, 0))
    Portal(0, 1)
    Portal(6, 5)


# ---------------------------------------------------------------------------
# 桥面：枕木、纵铺木板、钢轨
# ---------------------------------------------------------------------------
def TieTopAt(z):
    """引道上的枕木顶：不低于桥面枕木顶，跟着地面抬（与单孔时代同一条规则）。"""
    return max(TIE_TOP, TerrainAt(0, z) + 0.03)


RAIL_PROFILE = ((0.0625, TIE_TOP, TIE_TOP + 0.015), (0.009, TIE_TOP + 0.015, PLANK_TOP - 0.035),
                (0.032, PLANK_TOP - 0.035, PLANK_TOP))


def SpanDeck(seed, blasted):
    """一孔钢梁上的桥面：枕木（顶 0.53）、纵铺木板与钢轨头齐平在 0.66 = deckTopY。z 从 -12 到 +12（墩心到墩心）。
    blasted（被炸孔）按跨中节间切开，其余永久孔整块。"""
    rng = random.Random(seed)
    ties = []
    z = -HALF_SPAN + 0.12
    while z <= HALF_SPAN - 0.1:
        ties.append(z)
        z += 0.55
    for z in ties:
        top = TIE_TOP
        half = TIE_HALF + rng.uniform(-0.05, 0.05)
        dz = rng.uniform(-0.02, 0.02)
        x0 = -half + rng.uniform(-0.03, 0.03)
        if blasted and Region(z) == "Centre":
            RuleBox(DeckRule, "Timber", x0, -0.01, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
            RuleBox(DeckRule, "Timber", 0.01, x0 + 2 * half, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
        else:
            RuleBox(DeckRule, "Timber", x0, x0 + 2 * half, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
    # 木板：轨间一条、轨外两条；每块板随机在 3–4.5 m 处对接，接缝错开
    zend = HALF_SPAN - 0.05
    strips = [(-0.6, 0.6), (0.82, 2.6), (-2.6, -0.82)]
    for x0, x1 in strips:
        n = max(1, round((x1 - x0) / 0.3))
        w = (x1 - x0) / n
        for k in range(n):
            px0, px1 = x0 + k * w + 0.012, x0 + (k + 1) * w - 0.012
            cuts = list(DECK_CUTS) if blasted else []
            zc = -zend + rng.uniform(0.5, 3.5)
            while zc < zend:
                cuts.append(zc)
                zc += rng.uniform(3.0, 4.5)
            cuts = sorted(set(round(c, 4) for c in cuts if -zend < c < zend))
            edges = [-zend] + cuts + [zend]
            for za, zb in zip(edges, edges[1:]):
                if zb - za < 0.05:
                    continue
                RuleBox(DeckRule, "Timber", px0, px1, TIE_TOP, PLANK_TOP - rng.uniform(0, 0.008), za + 0.006, zb - 0.006)
    # 钢轨：轨底 / 轨腰 / 轨头三段，桥上平直
    for sx in (-1, 1):
        x = sx * RAIL_X
        edges = [-HALF_SPAN, -CUT, 0.0, CUT, HALF_SPAN] if blasted else [-HALF_SPAN, -4.0, 4.0, HALF_SPAN]
        for za, zb in zip(edges, edges[1:]):
            for hw, y0, y1 in RAIL_PROFILE:
                RuleBox(RailRule, "Steel", x - hw, x + hw, y0, y1, za + 0.004, zb - 0.004)


def ApproachDeck(piece, z_start, z_end, seed):
    """桥外的引道：枕木与钢轨逐枕跟着地面走，直到轨道样条的断口 gapZ。z_start → z_end（可以是从南往北）。"""
    rng = random.Random(seed)
    step = 0.55 if z_end > z_start else -0.55
    ties = []
    z = z_start + step * 0.22
    while (z < z_end - 0.1) if step > 0 else (z > z_end + 0.1):
        ties.append(z)
        z += step
    for z in ties:
        top = TieTopAt(z)
        half = TIE_HALF + rng.uniform(-0.05, 0.05)
        dz = rng.uniform(-0.02, 0.02)
        x0 = -half + rng.uniform(-0.03, 0.03)
        AxisBox(piece, "Timber", x0, x0 + 2 * half, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
    zs = [z_start] + ties + [z_end]
    for sx in (-1, 1):
        x = sx * RAIL_X
        for za, zb in zip(zs, zs[1:]):
            ya, yb = TieTopAt(za), TieTopAt(zb)
            for hw, y0, y1 in RAIL_PROFILE:
                a = Vector((x, ya + (y0 + y1) / 2 - TIE_TOP, za))
                b = Vector((x, yb + (y0 + y1) / 2 - TIE_TOP, zb))
                Beam(piece, "Steel", a, b, 2 * hw, y1 - y0)


def ApproachSouth():
    """南引桥：料石实体，从 1 号墩顶接出来、坐在沙滩后的路基上。桥面标高与两侧钢梁一致（碰撞是 RailBridgeApproachSouthDeck）。
    北头是一截窄「颈」（留出墩顶那两个药包的位置），往南加宽成带矮石栏的实心桥头。"""
    name = "ApproachSouth"
    rng = random.Random(47)
    z0, z1 = HALF_SPAN + 0.05, 19.0
    neck_end, half_w = 13.3, 3.2
    # 颈：从墩顶（-0.47）一直到道砟底
    AxisBox(name, "Stone", -2.4, 2.4, SEAT_Y, 0.2, z0, neck_end)
    # 桥头实体：向下埋进沙里
    AxisBox(name, "Stone", -half_w + 0.15, half_w - 0.15, -1.9, 0.2, neck_end, z1)
    # 两侧料石面：三皮，错缝，块面随机凸出 0–5 cm
    courses = 3
    ch = (0.2 - (-1.9)) / courses
    gap = 0.026
    for side in (-1, 1):
        for c in range(courses):
            y0 = -1.9 + c * ch
            z = neck_end - (rng.uniform(0.2, 0.6) if c % 2 else 0)
            while z < z1:
                length = rng.uniform(0.7, 1.35)
                zb = min(z1, z + length)
                za = max(neck_end, z)
                if zb - za > 0.15:
                    p = rng.uniform(0.0, 0.05)
                    AxisBox(name, "Stone", *sorted((side * (half_w - 0.16 - 0.001), side * (half_w - p))),
                            y0 + gap / 2, y0 + ch - gap / 2, za + gap / 2, zb - gap / 2)
                z = zb
    # 矮石栏：立在桥头两侧（内面 2.85，外面 3.2），顶 0.85，栏顶压一道帽石；南端阶梯式降下去
    for side in (-1, 1):
        z = neck_end + 0.05
        k = 0
        while z < z1 - 0.3:
            length = rng.uniform(0.85, 1.3)
            zb = min(z1 - 0.3, z + length)
            drop = 0.0 if zb < z1 - 2.4 else (0.22 if zb < z1 - 1.2 else 0.45)
            xa, xb = sorted((side * 2.86, side * 3.2))
            AxisBox(name, "Stone", xa, xb, 0.2, 0.85 - drop, z + gap / 2, zb - gap / 2)
            xa2, xb2 = sorted((side * 2.8, side * 3.27))
            AxisBox(name, "Stone", xa2, xb2, 0.85 - drop, 0.93 - drop, z, zb)
            z = zb
            k += 1
    # 道砟：梯形断面（底 ±3.0、顶 ±2.3），顶 0.35 = 枕木底；比桥面的木板宽一点
    ballast = [(-2.85, 0.2, z0), (2.85, 0.2, z0), (-2.3, 0.35, z0), (2.3, 0.35, z0),
               (-2.85, 0.2, z1), (2.85, 0.2, z1), (-2.3, 0.35, z1), (2.3, 0.35, z1)]
    Hexa(name, "Stone", [Vector(p) for p in ballast])
    # 墩顶到桥头之间那一小段的钢盖板（桥面钢梁到此为止，往南是实体）
    AxisBox(name, "Steel", -2.4, 2.4, 0.2, 0.235, z0, z0 + 0.5)


# ---------------------------------------------------------------------------
# 炸药、导火索、起爆器
# ---------------------------------------------------------------------------
CHARGES = []


def Pack(piece, x0, x1, y0, y1, z0, z1, straps=2, axis="z"):
    AxisBox(piece, "Charge", x0, x1, y0, y1, z0, z1)
    for k in range(straps):
        f = (k + 1) / (straps + 1)
        if axis == "z":
            zc = z0 + (z1 - z0) * f
            AxisBox(piece, "Cable", x0 - 0.012, x1 + 0.012, y0 - 0.012, y1 + 0.012, zc - 0.018, zc + 0.018)
        else:
            yc = y0 + (y1 - y0) * f
            AxisBox(piece, "Cable", x0 - 0.012, x1 + 0.012, yc - 0.018, yc + 0.018, z0 - 0.012, z1 + 0.012)


def Polyline(piece, points, size=0.016):
    for a, b in zip(points, points[1:]):
        Beam(piece, "Cable", a, b, size, size, xaxis=(0, 1, 0) if abs(Vector(b).y - Vector(a).y) < 0.9 * (Vector(b) - Vector(a)).length else (1, 0, 0))


PIER_PACK_Z = (HALF_SPAN + 0.15, HALF_SPAN + 0.75)     # 墩顶上药包的 z：钢梁端头（11.95）与桥头颈（13.3）之间的空档
PIER_GROUND_Y = -0.85                                   # 沙滩上爆炸尘环用的地面高度


def WoodCrate(centre, size, yaw, tint_straps=True):
    """一只木药箱（Charge 材质 = 木箱配方）：箱身 + 两道钢带 + 盖板压条。yaw 绕 y。"""
    c, s = math.cos(yaw), math.sin(yaw)
    ax = Vector((c, 0, -s))
    az = Vector((s, 0, c))
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    centre = Vector(centre)
    Box("Crates", "Charge", centre, ax * hx, Vector((0, hy, 0)), az * hz)
    if tint_straps:
        for f in (-0.55, 0.55):
            Box("Crates", "Cable", centre + ax * (hx * f), ax * 0.018, Vector((0, hy + 0.012, 0)), az * (hz + 0.012))
        Box("Crates", "Timber", centre + Vector((0, hy + 0.012, 0)), ax * (hx * 0.92), Vector((0, 0.012, 0)), az * (hz * 0.16))


def Charges():
    top = YB + BC_H / 2
    for s in (-1, 1):
        x = s * TX
        for dz in (-0.44, 0.44):
            Pack("Charges", x - 0.17, x + 0.17, top + 0.005, top + 0.29, dz - 0.22, dz + 0.22)
        xin = x - s * 0.16
        Pack("Charges", xin - s * 0.27, xin, 1.0, 1.44, -0.13, 0.13, axis="y")
        # 1 号墩顶上的药包：钢梁端头以南、桥头颈以北的那一格
        Pack("Charges", x - 0.25, x + 0.25, SEAT_Y + 0.005, SEAT_Y + 0.30, PIER_PACK_Z[0], PIER_PACK_Z[1])
        CHARGES.append({"t": 0.0, "x": x, "y": YB + 0.1, "z": 0.0, "radius": 12.0, "main": True, "groundY": WATER_TOP})
        CHARGES.append({"t": 0.05, "x": xin - s * 0.13, "y": 1.22, "z": 0.0, "radius": 7.0, "main": False, "groundY": WATER_TOP})
        CHARGES.append({"t": 0.12, "x": x, "y": SEAT_Y + 0.15, "z": (PIER_PACK_Z[0] + PIER_PACK_Z[1]) / 2, "radius": 11.0,
                        "main": False, "groundY": PIER_GROUND_Y})
        # 导爆索：跨中各药包沿下弦内侧上沿拉到南端，翻过端头落到墩顶
        cy = top + 0.02
        xi = x - s * (BC_W / 2 - 0.05)
        Polyline("CableBridge", [(xin - s * 0.13, 1.0, 0.0), (xi, cy, 0.3), (xi, cy, 0.44)])
        Polyline("CableBridge", [(xi, cy, -0.44), (xi, cy, 0.44), (xi, cy, BEAR - 0.72)])
        Polyline("CableBridge", [(xi, cy, BEAR - 0.3), (xi, cy, BEAR + 0.3), (xi, 0.0, HALF_SPAN + 0.12),
                                 (x, SEAT_Y + 0.03, HALF_SPAN + 0.3), (x, SEAT_Y + 0.03, PIER_PACK_Z[0] + 0.02)])
    # 墩顶横跨的一根：两个墩顶药包之间（钢梁端头正下方 0.1 m 的缝里），再从东端翻下墩身
    zc = HALF_SPAN + 0.05
    edge_x = PIER_HL + math.sqrt(max(0.05, PIER_R ** 2 - (zc - P1) ** 2))
    Polyline("CableBridge", [(-TX, SEAT_Y + 0.03, PIER_PACK_Z[0] + 0.02), (-TX, SEAT_Y + 0.03, zc), (TX, SEAT_Y + 0.03, zc),
                             (TX, SEAT_Y + 0.03, PIER_PACK_Z[0] + 0.02)])
    ground_start = (edge_x + 0.05, TerrainAt(edge_x + 0.05, zc) + 0.02, zc)
    Polyline("CableBridge", [(TX, SEAT_Y + 0.03, zc), (edge_x - 0.1, SEAT_Y + 0.03, zc), (edge_x + 0.04, SEAT_Y - 0.25, zc),
                             (edge_x + 0.06, ground_start[1] + 0.4, zc), ground_start])
    # 1 号墩脚下：爆破手蹲的地方 —— 木药箱堆在墩东头，一卷线放在沙地上
    crew = TERRAIN["crew"]
    cx = sum(p["x"] for p in crew) / len(crew)
    cz = sum(p["z"] for p in crew) / len(crew)
    g = lambda x, z: TerrainAt(x, z)
    bx = edge_x + 0.75
    WoodCrate((bx, g(bx, P1 - 0.35) + 0.27, P1 - 0.35), (0.92, 0.54, 0.6), 0.1)
    WoodCrate((bx + 0.06, g(bx, P1 + 0.5) + 0.27, P1 + 0.5), (0.88, 0.54, 0.58), -0.12)
    WoodCrate((bx + 0.02, g(bx, P1 - 0.35) + 0.54 + 0.24, P1 - 0.3), (0.78, 0.46, 0.5), 0.55)
    # 地面导线：从墩东头顺沙地绕开桥头的石栏拉出去，再顺着路堤肩一路拉到起爆器
    ex, ez = TERRAIN["exploder"]["x"], TERRAIN["exploder"]["z"]
    path = [(ground_start[0], ground_start[2]), (edge_x + 1.6, P1 + 1.1), (5.6, 14.2), (5.5, 16.6), (5.0, 19.0), (4.2, 21.0),
            (3.4, 21.5), (3.8, 24.5), (4.2, 28.0), (3.6, 31.0), (3.3, 34.5), (3.9, 38.0), (4.6, 42.0), (4.3, 46.0),
            (ex + 0.4, ez - 0.6), (ex, ez)]
    pts = [(x, TerrainAt(x, z) + 0.02, z) for (x, z) in path]
    Polyline("CableGround", pts, 0.018)
    # 一卷线：三圈八边形，放在药箱旁的沙地上（导线的一头连着它）
    coil_c = Vector((bx + 1.2, 0, P1 + 2.6))
    coil_c.y = TerrainAt(coil_c.x, coil_c.z) + 0.03
    for ring, (radius, dy) in enumerate(((0.36, 0.0), (0.30, 0.032), (0.24, 0.064))):
        ring_pts = [(coil_c.x + radius * math.cos(a * math.pi / 4), coil_c.y + dy, coil_c.z + radius * math.sin(a * math.pi / 4))
                    for a in range(9)]
        Polyline("CableGround", ring_pts, 0.03)
    Polyline("CableGround", [(coil_c.x - 0.36, coil_c.y, coil_c.z), (coil_c.x - 0.9, coil_c.y - 0.01, coil_c.z - 0.9),
                             (5.6, TerrainAt(5.6, 14.2) + 0.02, 14.2)], 0.018)
    g_ex = TerrainAt(ex, ez)
    AxisBox("Exploder", "Timber", ex - 0.17, ex + 0.17, g_ex - 0.02, g_ex + 0.22, ez - 0.13, ez + 0.13)
    AxisBox("Exploder", "Steel", ex - 0.178, ex + 0.178, g_ex + 0.2, g_ex + 0.235, ez - 0.138, ez + 0.138)
    AxisBox("Exploder", "Steel", ex + 0.1, ex + 0.13, g_ex + 0.235, g_ex + 0.26, ez + 0.05, ez + 0.08)
    AxisBox("ExploderHandle", "Steel", ex - 0.011, ex + 0.011, g_ex + 0.235, g_ex + 0.52, ez - 0.011, ez + 0.011)
    AxisBox("ExploderHandle", "Timber", ex - 0.16, ex + 0.16, g_ex + 0.5, g_ex + 0.54, ez - 0.02, ez + 0.02)
    return {"x": ex, "y": g_ex + 0.235, "z": ez, "handleTravel": 0.2}


def Fragments():
    rng = random.Random(5)
    for k in range(10):
        s = -1 if k % 2 == 0 else 1
        c = Vector((s * TX + rng.uniform(-0.08, 0.08), YB + rng.uniform(-0.1, 0.1), rng.uniform(-0.7, 0.7)))
        d = Vector((rng.uniform(-1, 1), rng.uniform(-0.4, 0.4), rng.uniform(-1, 1))).normalized()
        length = rng.uniform(0.28, 0.62)
        Beam("Fragment%d" % k, "Steel", c - d * length / 2, c + d * length / 2,
             rng.uniform(0.05, 0.13), rng.uniform(0.02, 0.07), xaxis=tuple(d.orthogonal()))


# ---------------------------------------------------------------------------
# 坍塌
# ---------------------------------------------------------------------------
def GroundAt(x, z):
    """碎件能落脚的最高面：地形，加上不动的桥体（墩顶、两孔永久桥面、南引桥）。1 号墩帽石已被炸飞，墩顶按剩下的算。"""
    h = TerrainAt(x, z)
    ax = abs(x)
    for zp, top in ((P1, PIER_TOP_COURSE), (P2, SEAT_Y), (P3, SEAT_Y)):
        if abs(z - zp) <= PIER_R and ax <= PIER_HL + PIER_R:
            h = max(h, top)
    if ax <= 2.7 and (P3 <= z <= P2 or P3 - 2 * HALF_SPAN <= z <= P3):
        h = max(h, PLANK_TOP)                         # 中孔与北孔的桥面
    if HALF_SPAN + 0.05 <= z <= 19.0:                 # 南引桥（颈与桥头实体）
        if ax <= 2.85:
            h = max(h, TIE_TOP)
        elif ax <= 3.2 and z >= 13.3:
            h = max(h, 0.85)
    return h


def InWater(p):
    return WATER_Z0 < p.z < WATER_Z1 and p.y < WATER_TOP


def DryAt(x, z):
    return not (WATER_Z0 < z < WATER_Z1) or GroundAt(x, z) > WATER_TOP + 0.05


def GroundGrad(x, z, d=0.3):
    return Vector(((GroundAt(x + d, z) - GroundAt(x - d, z)) / (2 * d), 0,
                   (GroundAt(x, z + d) - GroundAt(x, z - d)) / (2 * d)))


def PieceVerts(name, pivot):
    return [Vector(v) - pivot for v in PIECES[name].verts]


def Corners(verts):
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    return [Vector((hi.x if i & 1 else lo.x, hi.y if i & 2 else lo.y, hi.z if i & 4 else lo.z)) for i in range(8)]


def SpanRotation(angle, roll):
    return (Matrix.Rotation(angle, 4, "X") @ Matrix.Rotation(roll, 4, "Z")).to_quaternion()


def SolveSpanAngle(verts, hinge, sign, roll, clearance=0.04):
    """找坍塌角：自由端最低点落在河底上方 clearance。sign=+1 北半孔（绕 x 正转，自由端往 +z 去）。"""
    verts = [v for v in verts if abs(v.z) > 5.0][::2]

    def MinGap(a):
        q = SpanRotation(sign * a, roll)
        worst = 9.0
        for v in verts:
            w = hinge + q @ v
            if abs(w.z) < BEAR + 0.3:
                worst = min(worst, w.y - TerrainAt(w.x, w.z))
        return worst
    lo, hi = 0.0, 1.2
    for _ in range(40):
        mid = (lo + hi) / 2
        if MinGap(mid) > clearance:
            lo = mid
        else:
            hi = mid
    return lo


def Smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


class SpanMotion:
    def __init__(self, final, t0, t_hit, kick, bounce, creep):
        self.final, self.t0, self.kick, self.bounce, self.creep = final, t0, kick, bounce, creep
        self.a_hit = final - creep
        self.t_hit = t_hit
        self.alpha = 2 * self.a_hit / (t_hit - t0) ** 2

    def Angle(self, t):
        if t <= 0:
            return 0.0
        k = -self.kick * math.sin(math.pi * min(1.0, t / 0.26)) if t < 0.26 else 0.0
        if t < self.t_hit:
            return 0.5 * self.alpha * max(0.0, t - self.t0) ** 2 + k
        dt = t - self.t_hit
        b = 0.0
        if dt < 0.34:
            b = -self.bounce * math.sin(math.pi * dt / 0.34)
        elif dt < 0.56:
            b = -0.3 * self.bounce * math.sin(math.pi * (dt - 0.34) / 0.22)
        return self.a_hit + b + self.creep * (1 - math.exp(-dt / 1.3))


def SimulateDebris(name, pivot, v0, w0, start, rng):
    verts = PieceVerts(name, pivot)
    corners = Corners(verts)
    size = max((corners[7] - corners[0]).length, 0.05)
    pos, vel, w = pivot.copy(), Vector(v0), Vector(w0)
    q = Quaternion()
    t, dt = 0.0, 1.0 / 240.0
    frames, events = [], []
    asleep, contact, splashed, landed = False, 0.0, False, False
    settle = None
    for f in range(FRAMES):
        target = f / FPS
        while t < target - 1e-9:
            t += dt
            if t < start:
                continue
            if asleep:
                # 停稳之后把最短的那根轴扳到竖直：一块板、一片桁架不会立着落地
                if settle and settle[3] < 1.0:
                    progress = min(1.0, (t - settle[0]) / 0.4)
                    q = settle[1].slerp(settle[2], Smooth(progress))
                    world = [pos + q @ c for c in corners]
                    pos.y -= min(p.y - GroundAt(p.x, p.z) for p in world)
                    settle[3] = progress
                continue
            wet = InWater(pos)
            g = 3.2 if wet else 9.81
            vel.y -= g * dt
            vel *= math.exp(-(3.2 if wet else 0.03) * dt)
            w *= math.exp(-(2.4 if wet else 0.05) * dt)
            pos += vel * dt
            ang = w.length * dt
            if ang > 1e-9:
                q = Quaternion(w.normalized(), ang) @ q
                q.normalize()
            world = [pos + q @ c for c in corners]
            lowest = min(world, key=lambda p: p.y)
            if not splashed and lowest.y < WATER_TOP and not DryAt(lowest.x, lowest.z):
                splashed = True
                events.append({"t": round(t, 3), "type": "water", "x": round(lowest.x, 2), "y": round(WATER_TOP, 2),
                               "z": round(lowest.z, 2), "size": round(size, 2), "speed": round(vel.length, 1),
                               "piece": name, "material": DominantMaterial(name)})
            gaps = [(p.y - GroundAt(p.x, p.z), p) for p in world]
            gap, cp = min(gaps, key=lambda g: g[0])
            if gap < 0:
                pos.y -= gap
                grad = GroundGrad(cp.x, cp.z)
                steep = grad.length > 0.7
                if steep:
                    # 陡坡（河岸 50°、桥台前沿的台阶）上停不住：顺着坡往下滑
                    down = -grad.normalized()
                    slope = grad.length
                    acc = 9.81 * slope / (1 + slope * slope)
                    vel.x += down.x * acc * dt
                    vel.z += down.z * acc * dt
                if vel.y < 0:
                    speed = vel.length
                    if not landed and DryAt(cp.x, cp.z) and speed > 3.0:
                        landed = True
                        events.append({"t": round(t, 3), "type": "land", "x": round(cp.x, 2), "y": round(cp.y, 2),
                                       "z": round(cp.z, 2), "size": round(size, 2), "speed": round(speed, 1),
                                       "piece": name, "material": DominantMaterial(name)})
                    vel.y = -vel.y * (0.0 if not DryAt(cp.x, cp.z) else 0.18)
                    keep = 0.92 if steep else 0.5
                    vel.x *= keep
                    vel.z *= keep
                    w *= 0.55
                contact += dt
                if vel.length < 0.55 and contact > 0.12 and not steep:
                    asleep = True
                    ext = corners[7] - corners[0]
                    axis = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))][min(range(3), key=lambda i: ext[i])]
                    u = q @ axis
                    up = Vector((0, 1 if u.y >= 0 else -1, 0))
                    settle = [t, q.copy(), (u.rotation_difference(up) @ q).normalized(), 0.0]
            else:
                contact = 0.0
        frames.append((pos.copy(), q.copy()))
    return frames, events


def DominantMaterial(name):
    g = PIECES[name]
    counts = {}
    for m in g.mats:
        counts[m] = counts.get(m, 0) + 1
    return max(counts, key=counts.get)


def Collapse():
    rng = random.Random(1938)
    tracks, events = {}, []
    pivots = {}
    # --- 两个半孔 -----------------------------------------------------------
    # 北半孔：以北端支座（2 号墩顶）为铰折进河里（V 的一条臂），自由端落在真实河底上。
    # 南半孔：1 号墩顶的帽石与支座被药包掀飞 —— 整孔往北滑出墩顶、贴着墩的北面刮下去、落进河里。
    # 从南岸安全区看（几乎顺着桥轴），这一下才读得出来：离玩家最近的那座门架整个沉下去了；
    # 只让南半孔也绕南端铰折，门架原地不动，炸完的桥从南边看跟没炸一样（2026-09-28 实拍）。
    # 节奏故意放慢（真实下落约 0.7 s）：大结构看起来就该慢，而且要等火球散开一点才看得见。
    north_pivot = Vector((0, -0.35, -BEAR))
    north_roll = 0.06
    nv = PieceVerts("NorthSpan", north_pivot)
    north_final = SolveSpanAngle(nv, north_pivot, 1, north_roll)
    north = SpanMotion(north_final, 0.3, 2.25, 0.006, 0.02, 0.012)
    south_pivot = Vector((0, -0.35, BEAR + 0.35))     # 南端下弦底
    sv = PieceVerts("SouthSpan", south_pivot)
    sfree = [v for v in sv if v.z < -6.0][::3]
    south_roll, south_yaw = -0.11, 0.035
    # 南端滑出墩顶 3 m（到墩的北面、水下陡坎上方），落到那儿的河底上方 0.15 m：3 m 水深里门架沉下去大半
    south_slide, south_land = 3.0, 1.75
    south_drop = max(2.0, min(3.6, -0.35 - (TerrainAt(0.35, BEAR + 0.35 - south_slide) + 0.15)))
    g_eff = 2 * south_drop / (south_land - 0.4) ** 2
    pivots["NorthSpan"], pivots["SouthSpan"] = north_pivot, south_pivot

    def SouthEnd(t):
        kick = 0.12 * math.sin(math.pi * min(1.0, (t - 0.12) / 0.36)) if 0.12 < t < 0.48 else 0.0
        fall = min(south_drop, 0.5 * g_eff * max(0.0, t - 0.4) ** 2)
        bounce = 0.1 * math.sin(math.pi * (t - south_land) / 0.3) if south_land < t < south_land + 0.3 else 0.0
        return Vector((0.35 * Smooth((t - 0.4) / 1.4), -0.35 + kick - fall + bounce,
                       BEAR + 0.35 - south_slide * Smooth((t - 0.12) / 0.75)))

    def SouthRotation(t, pitch):
        k = Smooth((t - 0.4) / 1.4)
        return (Matrix.Rotation(-pitch, 4, "X") @ Matrix.Rotation(south_roll * k, 4, "Z")
                @ Matrix.Rotation(south_yaw * k, 4, "Y")).to_quaternion()

    def SouthPitchMax(t, end):
        def Gap(pitch):
            q = SouthRotation(t, pitch)
            return min((end + q @ v).y - TerrainAt((end + q @ v).x, (end + q @ v).z) for v in sfree)
        if Gap(-0.3) < 0.05:
            return -0.3
        lo, hi = -0.3, 0.7
        for _ in range(26):
            mid = (lo + hi) / 2
            if Gap(mid) > 0.05:
                lo = mid
            else:
                hi = mid
        return lo

    def Crawl(name, frames_list, free_verts, t_stop):
        entered = False
        for f, (p, q) in enumerate(frames_list):
            t = f / FPS
            ends = [p + q @ v for v in free_verts[::5]]
            lowest = min(ends, key=lambda w: w.y)
            if not entered and lowest.y < WATER_TOP and not DryAt(lowest.x, lowest.z):
                entered = True
                for x in (-TX, 0.0, TX):
                    events.append({"t": round(t, 3), "type": "water", "x": x, "y": round(WATER_TOP, 2),
                                   "z": round(lowest.z, 2), "size": 6.0, "speed": 6.0, "piece": name, "material": "Steel"})
            if entered and f % 6 == 0 and t < t_stop:
                # 水线沿着桥身往桥台方向爬：每 0.2 s 在当时入水的位置补一口水花（再密就挤爆烟池）
                wet = [w for w in ends if abs(w.y - WATER_TOP) < 0.35 and not DryAt(w.x, w.z)]
                if wet:
                    zc = sum(w.z for w in wet) / len(wet)
                    events.append({"t": round(t, 3), "type": "water", "x": round(rng.uniform(-TX, TX), 2),
                                   "y": round(WATER_TOP, 2), "z": round(zc, 2), "size": 3.5, "speed": 4.0,
                                   "piece": name, "material": "Steel"})

    frames = []
    for f in range(FRAMES):
        t = f / FPS
        a = north.Angle(t)
        frames.append((north_pivot.copy(), SpanRotation(a, north_roll * Smooth(a / max(1e-6, north.final)))))
    tracks["NorthSpan"] = frames
    nfree = [v for v in nv if v.z > (BEAR - CUT - 1.6)]
    Crawl("NorthSpan", frames, nfree, north.t_hit + 0.1)
    end = frames[int(north.t_hit * FPS)]
    tip = min((end[0] + end[1] @ v for v in nfree[::5]), key=lambda w: w.y)
    events.append({"t": round(north.t_hit, 3), "type": "slam", "x": 0.0, "y": round(tip.y, 2), "z": round(tip.z, 2),
                   "size": 12.0, "speed": 8.0, "piece": "NorthSpan", "material": "Steel"})

    frames, pitch, contact_t = [], 0.0, None
    for f in range(FRAMES):
        t = f / FPS
        end_pos = SouthEnd(t)
        want = 0.5 * 0.42 * max(0.0, t - 0.1) ** 2
        cap = SouthPitchMax(t, end_pos)
        if contact_t is None and want >= cap and t > 0.2:
            contact_t = t
        pitch = min(want, cap)
        frames.append((end_pos, SouthRotation(t, pitch)))
    tracks["SouthSpan"] = frames
    Crawl("SouthSpan", frames, sfree, south_land + 0.1)
    for t_event, where in ((contact_t or 1.1, "free"), (south_land, "end")):
        p, q = frames[min(FRAMES - 1, int(round(t_event * FPS)))]
        point = (p + q @ min(sfree, key=lambda v: v.z)) if where == "free" else p
        events.append({"t": round(t_event, 3), "type": "slam", "x": round(point.x, 2), "y": round(point.y, 2),
                       "z": round(point.z, 2), "size": 12.0 if where == "end" else 9.0, "speed": 8.0,
                       "piece": "SouthSpan", "material": "Steel"})
    south_final = pitch
    # --- 碎件 ---------------------------------------------------------------
    def Launch(name):
        if name.startswith("CentreTruss"):
            s = -1 if name.endswith("W") else 1
            return (s * rng.uniform(3.0, 4.2), rng.uniform(6.0, 7.4), rng.uniform(-0.6, 0.6)), \
                   (rng.uniform(-0.7, 0.7), rng.uniform(-0.3, 0.3), -s * rng.uniform(1.4, 2.0)), 0.0
        if name == "CentreFloor":
            return (rng.uniform(-0.4, 0.4), 2.6, rng.uniform(-0.3, 0.3)), (rng.uniform(0.5, 0.9), 0.1, rng.uniform(-0.4, 0.4)), 0.0
        if name == "CentreBracing":
            return (rng.uniform(-1.4, 1.4), 11.5, rng.uniform(-1.2, 1.2)), \
                   (rng.uniform(-2.5, 2.5), rng.uniform(-2.5, 2.5), rng.uniform(-2.5, 2.5)), 0.0
        if name.startswith("DeckChunk"):
            side = -1 if name[9] == "W" else 1
            band = int(name[10])
            return (side * rng.uniform(1.5, 5.5), rng.uniform(8.0, 14.0), (band - 1) * rng.uniform(1.5, 4.5) + rng.uniform(-1, 1)), \
                   (rng.uniform(-8, 8), rng.uniform(-5, 5), rng.uniform(-8, 8)), 0.0
        if name.startswith("RailBit"):
            side = -1 if name[7] == "W" else 1
            zs = -1 if name[8] == "N" else 1
            return (side * rng.uniform(1.0, 3.0), rng.uniform(7.0, 11.0), zs * rng.uniform(2.0, 5.0)), \
                   (rng.uniform(3, 6) * zs, rng.uniform(-2, 2), rng.uniform(-3, 3)), 0.0
        if name.startswith("Fragment"):
            k = int(name[8:])
            if k in (3, 6):      # 两块往南岸飞：落在玩家前面十来米
                d = Vector((rng.uniform(-0.15, 0.25), 0.78, 0.62)).normalized()
                speed = rng.uniform(17.0, 18.6)
            elif k == 8:
                d = Vector((rng.uniform(-0.2, 0.2), 0.75, -0.66)).normalized()
                speed = rng.uniform(15.0, 17.0)
            else:
                d = Vector((rng.uniform(-1, 1), rng.uniform(0.6, 1.6), rng.uniform(-1, 1))).normalized()
                speed = rng.uniform(10.0, 21.0)
            return tuple(d * speed), (rng.uniform(-14, 14), rng.uniform(-14, 14), rng.uniform(-14, 14)), 0.0
        if name.startswith("Pier1Cap"):
            # 墩顶帽石：药包在墩顶正中，石块顺着径向往外飞（北面进河、东西两头与南面落沙滩 / 桥头）
            c = sum((Vector(v) for v in PIECES[name].verts), Vector()) / len(PIECES[name].verts)
            radial = Vector((c.x, 0, c.z - P1))
            radial = radial.normalized() if radial.length > 0.3 else Vector((0, 0, -1))
            return (radial.x * rng.uniform(2.0, 4.6), rng.uniform(3.0, 6.5), radial.z * rng.uniform(2.0, 4.6)), \
                   (rng.uniform(-3, 3), rng.uniform(-2, 2), rng.uniform(-3, 3)), 0.12
        if name.startswith("Pier1Shoe"):
            side = -1 if name.endswith("W") else 1
            return (side * rng.uniform(3.0, 5.0), rng.uniform(5.0, 8.0), -rng.uniform(1.0, 3.0)), \
                   (rng.uniform(-7, 7), rng.uniform(-7, 7), rng.uniform(-7, 7)), 0.12
        raise ValueError(name)

    for name in sorted(PIECES):
        if KindOf(name) != "debris":
            continue
        verts = [Vector(v) for v in PIECES[name].verts]
        lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
        hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
        pivot = (lo + hi) / 2
        pivots[name] = pivot
        v0, w0, start = Launch(name)
        frames, ev = SimulateDebris(name, pivot, v0, w0, start, rng)
        tracks[name] = frames
        events.extend(ev)
    events.sort(key=lambda e: e["t"])
    return tracks, events, pivots, {"northFinal": north_final, "southFinal": south_final,
                                    "northHit": north.t_hit, "southHit": south_land, "southContact": contact_t or 0}


# ---------------------------------------------------------------------------
# Blender 场景
# ---------------------------------------------------------------------------
def ClearScene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def Materials():
    mats = {}
    for key, name in MATERIAL_NAME.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = REVIEW_COLOR[key]
            bsdf.inputs["Roughness"].default_value = 0.85
            bsdf.inputs["Metallic"].default_value = 0.4 if key == "Steel" else 0.0
        m.diffuse_color = REVIEW_COLOR[key]
        mats[key] = m
    return mats


SHARED_MESH = {}


def MakeObject(name, pivot, mats, collection):
    g = PIECES[name]
    keys = sorted(set(g.mats))
    # 两个永久孔共用同一份网格（Geo.share 相同）：导出的 glTF 里是两个节点指同一个 mesh，体积不翻倍
    mesh = SHARED_MESH.get(g.share) if g.share else None
    if mesh is None:
        mesh = bpy.data.meshes.new(name)
        verts = [(v[0] - pivot.x, v[1] - pivot.y, v[2] - pivot.z) for v in g.verts]
        mesh.from_pydata(verts, [], g.faces)
        mesh.update()
        for key in keys:
            mesh.materials.append(mats[key])
        index = {k: i for i, k in enumerate(keys)}
        mesh.polygons.foreach_set("material_index", [index[m] for m in g.mats])
        uv = mesh.uv_layers.new(name="UVMap")
        flat = []
        for quad in g.uvs:
            for u, v in quad:
                flat.extend((u, v))
        uv.data.foreach_set("uv", flat)
        mesh.update()
        if g.share:
            SHARED_MESH[g.share] = mesh
    obj = bpy.data.objects.new(name, mesh)
    obj.location = pivot
    obj.rotation_mode = "QUATERNION"
    collection.objects.link(obj)
    return obj


def Keyframe(obj, frames):
    for f, (p, q) in enumerate(frames):
        obj.location = p
        obj.rotation_quaternion = q
        obj.keyframe_insert("location", frame=f)
        obj.keyframe_insert("rotation_quaternion", frame=f)
    action = obj.animation_data.action if obj.animation_data else None
    if action is not None:
        for fc in getattr(action, "fcurves", []):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def Triangles(name):
    return 2 * len(PIECES[name].faces)


def ReviewScene(collection):
    """只进审查渲染的地形与水面（不导出）。"""
    grid, h = TERRAIN["grid"], TERRAIN["heights"]
    verts, faces = [], []
    nx = len(h[0])
    for iz, row in enumerate(h):
        for ix, y in enumerate(row):
            verts.append((grid["x0"] + ix * grid["step"], y, grid["z0"] + iz * grid["step"]))
    for iz in range(len(h) - 1):
        for ix in range(nx - 1):
            a = iz * nx + ix
            faces.append((a, a + nx, a + nx + 1, a + 1))
    mesh = bpy.data.meshes.new("ReviewTerrain")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    m = bpy.data.materials.new("ReviewGround")
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.3, 0.26, 0.19, 1)
    mesh.materials.append(m)
    obj = bpy.data.objects.new("ReviewTerrain", mesh)
    collection.objects.link(obj)
    w = bpy.data.meshes.new("ReviewWater")
    xw = TERRAIN["grid"]["x1"]
    w.from_pydata([(-xw, WATER_TOP, WATER_Z0), (xw, WATER_TOP, WATER_Z0), (xw, WATER_TOP, WATER_Z1),
                   (-xw, WATER_TOP, WATER_Z1)], [], [(0, 3, 2, 1)])
    wm = bpy.data.materials.new("ReviewWater")
    wm.use_nodes = True
    wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.24, 0.33, 0.36, 1)
    w.materials.append(wm)
    wobj = bpy.data.objects.new("ReviewWater", w)
    collection.objects.link(wobj)
    sun = bpy.data.lights.new("ReviewSun", "SUN")
    sun.energy = 3.5
    sobj = bpy.data.objects.new("ReviewSun", sun)
    sobj.matrix_world = LookAt(Vector((30, 60, 40)), Vector((0, 0, 0)))
    collection.objects.link(sobj)


def LookAt(eye, target):
    fwd = (target - eye).normalized()
    up = Vector((0, 1, 0))
    right = fwd.cross(up).normalized()
    cam_up = right.cross(fwd)
    m = Matrix((right, cam_up, -fwd)).transposed().to_4x4()
    m.translation = eye
    return m


def RenderReview(collection):
    scene = bpy.context.scene
    out = os.path.join(SOURCE_DIR, "Review")
    os.makedirs(out, exist_ok=True)
    cam = bpy.data.cameras.new("ReviewCamera")
    cam.lens = 30
    cam.clip_end = 400
    cobj = bpy.data.objects.new("ReviewCamera", cam)
    collection.objects.link(cobj)
    scene.camera = cobj
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = 960, 540
    scene.render.image_settings.file_format = "PNG"
    world = scene.world or bpy.data.worlds.new("ReviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.62, 0.62, 0.6, 1)
        bg.inputs["Strength"].default_value = 0.9
    safe = TERRAIN["blastSafe"]
    views = {
        "BlastSafe": (Vector((safe["x"], TerrainAt(safe["x"], safe["z"]) + 1.65, safe["z"])), Vector((0, 1.0, 0))),
        "EastBank": (Vector((36, 6.0, 26)), Vector((0, 0.0, -6))),
        "SouthDeck": (Vector((1.2, 2.4, 30)), Vector((0, 1.5, 0))),
        "Pier1": (Vector((12.5, 0.9, 19)), Vector((0.5, -0.3, 11))),
        "Aerial": (Vector((30, 60, 30)), Vector((0, 0, -22))),
    }
    shots = []
    for label, (eye, target) in views.items():
        cobj.matrix_world = LookAt(eye, target)
        for frame in ((0, 15, 36, 54, 72, 180) if os.environ.get("RAIL_BRIDGE_RENDER") != "final" else (0, 180)):
            scene.frame_set(frame)
            path = os.path.join(out, "RailBridge_%s_f%03d.png" % (label, frame))
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            shots.append(path)
    scene.frame_set(0)
    return shots


def Main(render=True):
    global PIECES, KIND, CHARGES, FORCE, CUTTING, SHARED_MESH
    PIECES, KIND, CHARGES, SHARED_MESH = {}, {}, [], {}
    UV_RNG.seed(1938)
    # 1. 永久孔的模板（中孔、北孔共用一份几何）：桁架 + 横梁纵梁联结系 + 桥面 + 两端支座，全进 "__Tmpl"
    FORCE, CUTTING = "__Tmpl", False
    Truss(-1)
    Truss(1)
    CrossMembers()
    SpanDeck(91, blasted=False)
    for s in (-1, 1):
        Shoe("__Tmpl", s * TX, -BEAR)
        Shoe("__Tmpl", s * TX, BEAR)
    FORCE, CUTTING = None, True
    template = PIECES.pop("__Tmpl")
    KIND.pop("__Tmpl", None)
    static_pivots = {}
    for name, zc in (("SpanMid", SPAN_B), ("SpanNorth", SPAN_C)):
        g = Piece(name, "static")
        g.verts = [(v[0], v[1], v[2] + zc) for v in template.verts]
        g.faces, g.mats, g.uvs, g.share = template.faces, template.mats, template.uvs, "PermanentSpan"
        static_pivots[name] = Vector((0, 0, zc))
    # 2. 被炸的最南一孔：按跨中节间切开，南北两半各自成件
    Truss(-1)
    Truss(1)
    CrossMembers()
    SpanDeck(77, blasted=True)
    for s in (-1, 1):
        Shoe("Piers", s * TX, -BEAR)                       # 北端支座：留在 2 号墩上
        Shoe("Pier1Shoe" + Side(s), s * TX, BEAR)          # 南端支座：1 号墩的药包把它连床石一起掀飞
    # 3. 三个墩、北桥台、南引桥与两头的引道
    Pier(P1, blasted=True)
    Pier(P2)
    Pier(P3)
    AbutmentNorthBuild()
    ApproachSouth()
    ApproachDeck("AbutmentNorth", SPAN_C - HALF_SPAN, NORTH_GAP_Z, 61)
    ApproachDeck("ApproachSouth", HALF_SPAN, SOUTH_GAP_Z, 63)
    exploder = Charges()
    Fragments()
    tracks, events, pivots, solved = Collapse()
    pivots.update(static_pivots)

    ClearScene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, FRAMES - 1
    mats = Materials()
    export = bpy.data.collections.new("RailBridgeExport")
    review = bpy.data.collections.new("RailBridgeReview")
    scene.collection.children.link(export)
    scene.collection.children.link(review)
    objects = {}
    for name in sorted(PIECES):
        pivot = pivots.get(name)
        if pivot is None:
            if name == "ExploderHandle":
                pivot = Vector((exploder["x"], exploder["y"], exploder["z"]))
            else:
                pivot = Vector((0, 0, 0))
            pivots[name] = pivot
        objects[name] = MakeObject(name, pivot, mats, export)
    for name, frames in tracks.items():
        Keyframe(objects[name], frames)
    ReviewScene(review)

    os.makedirs(MODEL_DIR, exist_ok=True)
    glb = os.path.join(MODEL_DIR, "Model_RailBridge.glb")
    for obj in scene.objects:
        obj.select_set(obj.name in export.objects)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_yup=False,
                              export_apply=False, export_animations=True, export_animation_mode="SCENE",
                              export_force_sampling=True, export_frame_range=True, export_materials="EXPORT",
                              export_cameras=False, export_lights=False, export_extras=False,
                              export_normals=False)
    pieces = []
    for name in sorted(PIECES):
        g = PIECES[name]
        pv = pivots[name]
        final = tracks.get(name, [(pv, Quaternion())])[-1]
        verts = [final[0] + final[1] @ (Vector(v) - pv) for v in g.verts]
        low = min(verts, key=lambda w: w.y)
        bmin = [round(min(v[i] for v in g.verts), 3) for i in range(3)]
        bmax = [round(max(v[i] for v in g.verts), 3) for i in range(3)]
        pieces.append({
            "name": name, "kind": KindOf(name), "triangles": Triangles(name),
            "materials": sorted(set(g.mats)), "pivot": [round(c, 4) for c in pv],
            "bounds": {"min": bmin, "max": bmax},
            "final": {"position": [round(c, 4) for c in final[0]],
                      "quaternion": [round(final[1].x, 5), round(final[1].y, 5), round(final[1].z, 5), round(final[1].w, 5)],
                      "lowest": [round(low.x, 3), round(low.y, 3), round(low.z, 3)],
                      "groundBelowLowest": round(GroundAt(low.x, low.z), 3),
                      "wet": bool(WATER_Z0 < final[0].z < WATER_Z1 and final[0].y < WATER_TOP + 0.5)},
        })
    data = {
        "note": "Generated by _blender/Script_BuildRailBridge.py; bridge-local metres (x east, y up, z south).",
        "origin": TERRAIN["origin"], "fps": FPS, "duration": DURATION, "frames": FRAMES,
        "terrainSha256": hashlib.sha256(TERRAIN_TEXT.replace("\r\n", "\n").encode("utf-8")).hexdigest(),
        "water": TERRAIN["water"], "deckTopY": PLANK_TOP, "trussX": TX, "bearZ": BEAR, "faceZ": FACE, "cutZ": CUT,
        "topY": TopY(3) + TC_H / 2 + 0.03,
        "layout": {"spanCentres": {"SpanSouth": SPAN_A, "SpanMid": SPAN_B, "SpanNorth": SPAN_C},
                   "piers": {"Pier1": P1, "Pier2": P2, "Pier3": P3}, "pierTopY": SEAT_Y, "pier1StumpY": PIER_TOP_COURSE,
                   "pierHalfLength": PIER_HL, "pierRadius": PIER_R,
                   "blastedSpan": "SpanSouth", "crew": TERRAIN["crew"]},
        "solved": {k: round(v, 4) for k, v in solved.items()},
        "charges": CHARGES, "exploder": exploder,
        "pieces": pieces, "events": events,
        "triangles": sum(p["triangles"] for p in pieces),
    }
    with open(os.path.join(MODEL_DIR, "Data_RailBridge.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    os.makedirs(SOURCE_DIR, exist_ok=True)
    shots = RenderReview(review) if render else []
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE_DIR, "Model_RailBridge.blend"))
    report = {"pieces": len(pieces), "triangles": data["triangles"], "events": len(events),
              "solved": data["solved"], "glbBytes": os.path.getsize(glb), "shots": shots}
    print(json.dumps(report, ensure_ascii=False))
    return report


if __name__ == "__main__":
    Main(render=os.environ.get("RAIL_BRIDGE_RENDER", "1") != "0")

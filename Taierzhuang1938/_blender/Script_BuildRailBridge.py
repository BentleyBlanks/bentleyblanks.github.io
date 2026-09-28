# -*- coding: utf-8 -*-
"""Script_BuildRailBridge.py —— 北沙河铁路桥（第一关 18「奉令毁桥」）的模型与坍塌动画。

口径：Taierzhuang1938/docs/Data_RailBridge.md。

一座单孔铆接钢桁架下承桥（普拉特式、折线上弦，跨 23.2 m、桁高 5.4–6.2 m），
两端料石桥台带八字翼墙；桥面是横梁 + 纵梁 + 枕木 + 纵铺木板 + 两股钢轨。
18 阶段桥上已经预埋好炸药（跨中下弦、跨中竖杆、南端支座），导火索沿下弦走到
南桥台再顺地面拉到安全区的起爆器。

坍塌是**程序算出来的关键帧**，不是 Blender 刚体解算：
  · 跨中一整个节间（|z| < CUT）被炸飞成若干块碎件；
  · 北半孔以北桥台前沿为铰向河里折下去，自由端落在真实的河底高度上；
  · 南端支座连帽石同时被炸掉，南半孔整孔滑出桥座、贴着前墙刮下去落进河槽
    （从南岸顺着桥轴看，只有这样才看得出桥没了）；
  · 碎件按抛体 + 自旋积分，落在从游戏地形导出的高度场上（Data_RailBridgeTerrain.json），
    进水就减速沉底并记一条溅水事件。
全部坐标**直接按游戏轴建**（Y 上、X 东、Z 南，原点 = 桥心 (-77, 0, 153)），导出时
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
APPROACH = 12.0                          # |z| 超过它的桥面属于桥台（不动）
DECK_END = 16.0                          # 与轨道样条的断口 gapZ 对齐
SEAT_Y = -0.47
COPING_Y0 = -0.77

WATER_TOP = TERRAIN["water"]["top"]
WATER_HALF = TERRAIN["water"]["halfW"]
RIVER_Z = TERRAIN["water"]["riverZ"]

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
    __slots__ = ("verts", "faces", "mats", "uvs")

    def __init__(self):
        self.verts, self.faces, self.mats, self.uvs = [], [], [], []


PIECES = {}
KIND = {}
UV_RNG = random.Random(1938)
HEXA_FACES = ((1, 3, 7, 5), (0, 4, 6, 2), (2, 6, 7, 3), (0, 1, 5, 4), (4, 5, 7, 6), (0, 2, 3, 1))


def Piece(name, kind):
    if name not in PIECES:
        PIECES[name] = Geo()
        KIND[name] = kind
    return PIECES[name]


def KindOf(name):
    if name.startswith("Abutment"):
        return "static"
    if name in ("NorthSpan", "SouthSpan"):
        return "span"
    if name in ("Charges", "CableBridge"):
        return "charges"
    if name == "CableGround":
        return "cable"
    if name == "Exploder":
        return "exploder"
    if name == "ExploderHandle":
        return "handle"
    return "debris"


def Quad(piece, mat, quad, offset):
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


def Member(rule, mat, a, b, w, h, xaxis=(1, 0, 0), cuts=TRUSS_CUTS):
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
# 桥台（sigma = -1 北、+1 南）
# ---------------------------------------------------------------------------
def Abutment(sigma):
    name = "AbutmentNorth" if sigma < 0 else "AbutmentSouth"
    rng = random.Random(41 if sigma < 0 else 43)
    Z = lambda v: sigma * v
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
    # 帽石（桥座前沿，外挑 0.12）：南桥台的帽石在起爆时被支座药包掀飞，所以逐块成件
    x = -4.35
    k = 0
    while x < 4.35:
        x1 = min(4.35, x + rng.uniform(0.85, 1.2))
        piece = name if sigma < 0 else "SouthCoping%d" % k
        AxisBox(piece, "Stone", x + 0.012, x1 - 0.012, COPING_Y0 + 0.01, SEAT_Y, Z(FACE - 0.12), Z(BEAR))
        x = x1
        k += 1
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
    # 支座：床石 + 铸钢座。北端留在桥台上；南端连床石一起被炸飞（SouthShoe*）
    for s in (-1, 1):
        piece = name if sigma < 0 else "SouthShoe" + Side(s)
        AxisBox(piece, "Stone", s * TX - 0.52, s * TX + 0.52, SEAT_Y, -0.40, Z(BEAR - 0.46), Z(BEAR + 0.44))
        AxisBox(piece, "Steel", s * TX - 0.31, s * TX + 0.31, -0.40, -0.345, Z(BEAR - 0.32), Z(BEAR + 0.32))
        AxisBox(piece, "Steel", s * TX - 0.36, s * TX + 0.36, -0.40, -0.37, Z(BEAR - 0.38), Z(BEAR + 0.38))


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
def TieTop(z):
    if abs(z) <= 13.0:
        return TIE_TOP
    return max(TIE_TOP, TerrainAt(0, z) + 0.03)


def Deck():
    rng = random.Random(77)
    ties = []
    z = -DECK_END + 0.12
    while z <= DECK_END - 0.1:
        ties.append(z)
        z += 0.55
    for z in ties:
        top = TieTop(z)
        half = TIE_HALF + rng.uniform(-0.05, 0.05)
        dz = rng.uniform(-0.02, 0.02)
        x0 = -half + rng.uniform(-0.03, 0.03)
        if Region(z) == "Centre":
            RuleBox(DeckRule, "Timber", x0, -0.01, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
            RuleBox(DeckRule, "Timber", 0.01, x0 + 2 * half, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
        else:
            RuleBox(DeckRule, "Timber", x0, x0 + 2 * half, top - TIE_H, top, z + dz - TIE_W / 2, z + dz + TIE_W / 2)
    # 木板：轨间一条、轨外两条；每块板随机在 3–4.5 m 处对接，接缝错开
    strips = [(-0.6, 0.6), (0.82, 2.6), (-2.6, -0.82)]
    for x0, x1 in strips:
        n = max(1, round((x1 - x0) / 0.3))
        w = (x1 - x0) / n
        for k in range(n):
            px0, px1 = x0 + k * w + 0.012, x0 + (k + 1) * w - 0.012
            cuts = list(DECK_CUTS)
            zc = -12.9 + rng.uniform(0.5, 3.5)
            while zc < 12.9:
                cuts.append(zc)
                zc += rng.uniform(3.0, 4.5)
            cuts = sorted(set(round(c, 4) for c in cuts if -12.9 < c < 12.9))
            edges = [-12.9] + cuts + [12.9]
            for za, zb in zip(edges, edges[1:]):
                if zb - za < 0.05:
                    continue
                RuleBox(DeckRule, "Timber", px0, px1, TIE_TOP, PLANK_TOP - rng.uniform(0, 0.008), za + 0.006, zb - 0.006)
    # 钢轨：轨底 / 轨腰 / 轨头三段。桥上一段平直；引道上逐枕跟着地面走
    profile = ((0.0625, TIE_TOP, TIE_TOP + 0.015), (0.009, TIE_TOP + 0.015, PLANK_TOP - 0.035),
               (0.032, PLANK_TOP - 0.035, PLANK_TOP))
    for sx in (-1, 1):
        x = sx * RAIL_X
        edges = [-13.0, -APPROACH, -CUT, 0.0, CUT, APPROACH, 13.0]
        for za, zb in zip(edges, edges[1:]):
            for hw, y0, y1 in profile:
                RuleBox(RailRule, "Steel", x - hw, x + hw, y0, y1, za + 0.004, zb - 0.004)
        for sign in (-1, 1):
            zs = [13.0] + [abs(z) for z in ties if abs(z) > 13.0 and z * sign > 0] + [DECK_END]
            zs = sorted(set(zs))
            for za, zb in zip(zs, zs[1:]):
                ya, yb = TieTop(sign * za), TieTop(sign * zb)
                for hw, y0, y1 in profile:
                    a = Vector((x, (ya + y0 - TIE_TOP + ya + y1 - TIE_TOP) / 2, sign * za))
                    b = Vector((x, (yb + y0 - TIE_TOP + yb + y1 - TIE_TOP) / 2, sign * zb))
                    Beam("AbutmentNorth" if sign < 0 else "AbutmentSouth", "Steel", a, b, 2 * hw, y1 - y0)


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


def Charges():
    top = YB + BC_H / 2
    for s in (-1, 1):
        x = s * TX
        for dz in (-0.44, 0.44):
            Pack("Charges", x - 0.17, x + 0.17, top + 0.005, top + 0.29, dz - 0.22, dz + 0.22)
        xin = x - s * 0.16
        Pack("Charges", xin - s * 0.27, xin, 1.0, 1.44, -0.13, 0.13, axis="y")
        Pack("Charges", x - 0.17, x + 0.17, top + 0.005, top + 0.27, BEAR - 0.72, BEAR - 0.3)
        CHARGES.append({"t": 0.0, "x": x, "y": YB + 0.1, "z": 0.0, "radius": 12.0, "main": True})
        CHARGES.append({"t": 0.05, "x": xin - s * 0.13, "y": 1.22, "z": 0.0, "radius": 7.0, "main": False})
        CHARGES.append({"t": 0.12, "x": x, "y": top + 0.1, "z": BEAR - 0.5, "radius": 8.0, "main": False})
        # 导爆索：各药包沿下弦内侧上沿拉到南端
        cy = top + 0.02
        xi = x - s * (BC_W / 2 - 0.05)
        Polyline("CableBridge", [(xin - s * 0.13, 1.0, 0.0), (xi, cy, 0.3), (xi, cy, 0.44)])
        Polyline("CableBridge", [(xi, cy, -0.44), (xi, cy, 0.44), (xi, cy, BEAR - 0.72)])
        Polyline("CableBridge", [(xi, cy, BEAR - 0.3), (xi, cy, BEAR + 0.3), (s * 2.4, 0.2, 12.2), (2.5, 0.4, 13.4)])
    # 地面导线：从南桥台背后顺着路堤肩一路拉到起爆器
    ex, ez = TERRAIN["exploder"]["x"], TERRAIN["exploder"]["z"]
    path = [(2.5, 13.4), (3.1, 14.6), (3.4, 16.5), (3.8, 19.5), (4.2, 23.0), (3.6, 26.0), (3.3, 29.5),
            (3.9, 33.0), (4.6, 37.0), (4.3, 41.0), (ex + 0.4, ez - 0.6), (ex, ez)]
    pts = []
    for (x, z) in path:
        y = TerrainAt(x, z) + 0.02
        if abs(z) < 14.5:
            y = max(y, 0.4)
        pts.append((x, y, z))
    Polyline("CableGround", pts, 0.018)
    g = TerrainAt(ex, ez)
    AxisBox("Exploder", "Timber", ex - 0.17, ex + 0.17, g - 0.02, g + 0.22, ez - 0.13, ez + 0.13)
    AxisBox("Exploder", "Steel", ex - 0.178, ex + 0.178, g + 0.2, g + 0.235, ez - 0.138, ez + 0.138)
    AxisBox("Exploder", "Steel", ex + 0.1, ex + 0.13, g + 0.235, g + 0.26, ez + 0.05, ez + 0.08)
    AxisBox("ExploderHandle", "Steel", ex - 0.011, ex + 0.011, g + 0.235, g + 0.52, ez - 0.011, ez + 0.011)
    AxisBox("ExploderHandle", "Timber", ex - 0.16, ex + 0.16, g + 0.5, g + 0.54, ez - 0.02, ez + 0.02)
    return {"x": ex, "y": g + 0.235, "z": ez, "handleTravel": 0.2}


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
    h = TerrainAt(x, z)
    az = abs(z)
    if 10.6 <= az <= 17.0 and abs(x) <= 4.35:
        top = SEAT_Y if az < 12.2 else 0.12
        if z > 0 and az < BEAR:
            top = COPING_Y0          # 南桥台前沿的帽石已被炸飞
        if 12.05 <= az <= 14.4 and abs(x) <= 3.0:
            top = TIE_TOP
        if 12.0 <= az <= 12.9 and abs(x) <= 2.62:
            top = PLANK_TOP
        h = max(h, top)
    return h


def InWater(p):
    return abs(p.z - RIVER_Z) < WATER_HALF and p.y < WATER_TOP


def DryAt(x, z):
    return abs(z - RIVER_Z) >= WATER_HALF or GroundAt(x, z) > WATER_TOP + 0.05


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
            if abs(w.z) < FACE - 0.05:
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
    # 北半孔：以北桥台前沿为铰折进河里（V 的一条臂），自由端落在真实河底上。
    # 南半孔：南端支座连帽石一起被炸掉 —— 整孔往北滑出桥座、贴着桥台前墙刮下去、落进河里。
    # 从南岸安全区看（几乎顺着桥轴），这一下才读得出来：离玩家最近的那座门架整个沉下去了；
    # 只让南半孔也绕南端铰折，门架原地不动，炸完的桥从南边看跟没炸一样（2026-09-28 实拍）。
    # 节奏故意放慢（真实下落约 0.7 s）：大结构看起来就该慢，而且要等火球散开一点才看得见。
    north_pivot = Vector((0, -0.35, -FACE))
    north_roll = 0.06
    nv = PieceVerts("NorthSpan", north_pivot)
    north_final = SolveSpanAngle(nv, north_pivot, 1, north_roll)
    north = SpanMotion(north_final, 0.3, 2.25, 0.006, 0.02, 0.012)
    south_pivot = Vector((0, -0.35, BEAR + 0.35))     # 南端下弦底
    sv = PieceVerts("SouthSpan", south_pivot)
    sfree = [v for v in sv if v.z < -6.0][::3]
    south_roll, south_yaw = -0.11, 0.035
    south_drop, south_slide, south_land = 2.95, 1.4, 1.75
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
    nfree = [v for v in nv if abs(v.z) > (FACE - CUT - 0.8)]
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
        if name.startswith("SouthCoping"):
            c = sum((Vector(v) for v in PIECES[name].verts), Vector()) / len(PIECES[name].verts)
            return (c.x * rng.uniform(0.2, 0.55), rng.uniform(2.0, 5.0), -rng.uniform(2.0, 4.8)), \
                   (rng.uniform(-3, 3), rng.uniform(-2, 2), rng.uniform(-3, 3)), 0.12
        if name.startswith("SouthShoe"):
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


def MakeObject(name, pivot, mats, collection):
    g = PIECES[name]
    keys = sorted(set(g.mats))
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
    w.from_pydata([(-26, WATER_TOP, -WATER_HALF), (26, WATER_TOP, -WATER_HALF), (26, WATER_TOP, WATER_HALF),
                   (-26, WATER_TOP, WATER_HALF)], [], [(0, 3, 2, 1)])
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
        "BlastSafe": (Vector((safe["x"], TerrainAt(safe["x"], safe["z"]) + 1.65, safe["z"])), Vector((0, 2.0, 0))),
        "EastBank": (Vector((34, 5.0, 6)), Vector((0, 0.5, 0))),
        "SouthDeck": (Vector((1.2, 2.4, 24)), Vector((0, 2.0, -4))),
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
    global PIECES, KIND, CHARGES
    PIECES, KIND, CHARGES = {}, {}, []
    Abutment(-1)
    Abutment(1)
    Truss(-1)
    Truss(1)
    CrossMembers()
    Deck()
    exploder = Charges()
    Fragments()
    tracks, events, pivots, solved = Collapse()

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
        pieces.append({
            "name": name, "kind": KindOf(name), "triangles": Triangles(name),
            "materials": sorted(set(g.mats)), "pivot": [round(c, 4) for c in pv],
            "final": {"position": [round(c, 4) for c in final[0]],
                      "quaternion": [round(final[1].x, 5), round(final[1].y, 5), round(final[1].z, 5), round(final[1].w, 5)],
                      "lowest": [round(low.x, 3), round(low.y, 3), round(low.z, 3)],
                      "groundBelowLowest": round(GroundAt(low.x, low.z), 3),
                      "wet": bool(abs(final[0].z - RIVER_Z) < WATER_HALF and final[0].y < WATER_TOP + 0.5)},
        })
    data = {
        "note": "Generated by _blender/Script_BuildRailBridge.py; bridge-local metres (x east, y up, z south).",
        "origin": TERRAIN["origin"], "fps": FPS, "duration": DURATION, "frames": FRAMES,
        "terrainSha256": hashlib.sha256(TERRAIN_TEXT.replace("\r\n", "\n").encode("utf-8")).hexdigest(),
        "water": TERRAIN["water"], "deckTopY": PLANK_TOP, "trussX": TX, "bearZ": BEAR, "faceZ": FACE, "cutZ": CUT,
        "topY": TopY(3) + TC_H / 2 + 0.03,
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

# -*- coding: utf-8 -*-
"""Script_BuildPontoonBridge.py —— 北沙河木船浮桥（第一关 18「奉令炸浮桥」）的模型与坍塌动画。

取代铁路桥（Script_BuildRailBridge.py）：回援尾队走浮桥过北沙河，奉令炸掉的也是浮桥。结构、流程、件表口径
照抄铁路桥脚本（Geo/Quad/Hexa/Box/Beam 几何收集、抛体+入水+停稳、Keyframe、glTF 导出、Data json），不同处：

  · 21 条并排拴住的平底木船（长 6.6、宽 2.2 沿 x、垂直桥轴，中心 z = 33 − 3·i，船间水缝 0.8 m、两头各伸出桥面 1.9 m，
    干舷 0.52 m，船头朝上游 = −x，船头带绞盘 / 铁锚 / 缆桩），船上 2 根纵梁 + 横铺木板窄桥面
    （宽 2.8、顶 −0.28，比舷缘高 0.32 m、比水面高 0.84 m），两侧绳栏（细木桩 + 两道粗绳 + 桩顶竹竿），芦苇束 / 绳圈；
  · 两岸各一段短木栈搭在入泥的木桩上（南 z 37.4、北 z −33.8），岸桩缠绳，上游缆斜拉到岸桩或入水的锚；
  · 被炸的是 i=9…13 五条船（河心偏北，中心船 i=11 在局部原点；每条拆成 船头半 / 船尾半 / 船底中段 三块，桥面板成簇飞散，
    木屑碎片抛得更远），i=7、8（南）与 i=14、15（北）被冲击波掀得翻倾、缆断、2–3 s 内沉下大半（脚本关键帧，不解算）；
  · 南截（0…6 号船）不动；北截（16…20 号船）整体绕北端岸桩缓缓向下游（+x）摆到 ≈3.5°（外观）；
  · 木件入水后减速、浮起、在水面停住并随水缓漂；铁件（绞盘、锚）沉底。

全部坐标**直接按游戏轴建**（Y 上、X 东、Z 南，原点 = 世界 (-77, 0, 122) = 被炸段中心），导出时 export_yup=False ——
在 Blender 视口里看模型是躺着的，这是刻意的（与 TzmCore / 铁路桥同一约定）。

产物：
  Model/Model_PontoonBridge.glb    网格（每块一个节点）+ 各物体一段 "Collapse" 动画（30 fps）
  Model/Data_PontoonBridge.json    件表、事件（入水 / 落地）、末态与三角统计
  <SOURCE_DIR>/Model_PontoonBridge.blend 与 Review/*.png（只留本机）

在本任务的独立 Blender 里跑（BlenderMCP）：
  node scripts/Script_BlenderMcp.mjs start --task PontoonBridge
  node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<worktree>/Taierzhuang1938/_blender/Script_BuildPontoonBridge.py', run_name='__main__')"
地形改了先重跑 _blender/Script_ExportPontoonBridgeTerrain.mjs。
环境变量：PONTOON_BRIDGE_SOURCE_DIR 源工程目录；PONTOON_BRIDGE_RENDER=0 不渲 / final 只渲首末帧 / 1 全渲；
PONTOON_BRIDGE_VIEWS=Cover,Head 只渲指定机位；PONTOON_BRIDGE_FRAMES=0,90 指定帧。
"""
import bpy
import json
import math
import os
import random
import hashlib
import re
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
MODEL_DIR = os.path.join(PROJECT, "Model")
SOURCE_DIR = os.environ.get("PONTOON_BRIDGE_SOURCE_DIR",
                            r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/PontoonBridge")
TERRAIN_PATH = os.path.join(HERE, "Data_PontoonBridgeTerrain.json")
TERRAIN_TEXT = open(TERRAIN_PATH, "r", encoding="utf-8").read()
TERRAIN = json.loads(TERRAIN_TEXT)

FPS = 30
DURATION = 6.0
FRAMES = int(round(DURATION * FPS)) + 1

# ---------------------------------------------------------------------------
# 尺寸（米，桥局部坐标）
# ---------------------------------------------------------------------------
WATER_TOP = TERRAIN["water"]["top"]
WATER_Z0 = TERRAIN["water"]["z0"]
WATER_Z1 = TERRAIN["water"]["z1"]
DECK_TOP = TERRAIN["deck"]["topY"]                # -0.47
DECK_W = TERRAIN["deck"]["w"]                     # 2.8
DECK_HALF = DECK_W / 2
LAYOUT = TERRAIN["layout"]
BOAT = LAYOUT["boat"]
N_BOATS, BOAT_LEN, BOAT_BEAM, PITCH = BOAT["count"], BOAT["length"], BOAT["beam"], BOAT["pitch"]
FREEBOARD = BOAT["freeboard"]
BOAT_Z = [b["z"] for b in LAYOUT["boats"]]
BLASTED = list(range(BOAT["blasted"][0], BOAT["blasted"][1] + 1))     # 9..13
SINKING = list(BOAT["sinking"])                                        # 7, 8, 14, 15
CI = (BLASTED[0] + BLASTED[-1]) // 2                                   # 中心船（局部 z = 0）：11
SOUTH_LAST = min(SINKING) - 1                                          # 南截最后一条船：6
NORTH_FIRST = max(SINKING) + 1                                         # 北截第一条船：16
HEAD_S, HEAD_N = LAYOUT["heads"]["south"], LAYOUT["heads"]["north"]  # 37.4, -33.8
assert N_BOATS == 21 and BLASTED == [9, 10, 11, 12, 13] and SINKING == [7, 8, 14, 15] and PITCH == 3
assert BOAT_Z[0] == 33 and abs(BOAT_Z[CI]) < 1e-6, "桥局部原点必须是中心船的中心（被炸段中心）"

HALF_L, HALF_W = BOAT_LEN / 2, BOAT_BEAM / 2          # 3.3, 1.1
Y_BOT = WATER_TOP - 0.28                              # 平底（吃水 0.28）
Y_GUN = WATER_TOP + FREEBOARD                         # 舷缘顶（干舷 0.52 → −0.60；比桥面低 0.32：纵梁骑在舷上，桥面板再上去）
STRINGER_X, STRINGER_W = 0.9, 0.18
STRINGER_TOP = DECK_TOP - 0.05                         # 板厚 0.05
STRINGER_H = STRINGER_TOP - Y_GUN + 0.02               # 纵梁从舷缘 −0.02 立到板底（0.29）
PLANK_D, PLANK_GAP, PLANK_T = 0.22, 0.02, 0.05
PLANK_PITCH = PLANK_D + PLANK_GAP
RAIL_X = 1.46
BREAK_S, BREAK_N = 13.5, -13.5                         # 南截 / 北截的断口 z（layout.spans）
BANK_Z = BOAT_Z[0] + 1.6                               # 南栈从这里起（0 号船北端之外）；桥面板顶过了它要顺泥面爬起来
NORTH_STUB_Z = BOAT_Z[-1] - 1.5                        # 北栈从末条船南端起
NORTH_PIVOT = Vector((0.0, DECK_TOP, HEAD_N + 0.5))    # 北截摆动的铰（北端岸桩处）
NORTH_SWING = math.radians(3.5)
ZSH = 12.0                                             # 岸上杂物沿用旧局部坐标（原点世界 z 134）的 z，+12 = 现在的局部 z（同一世界位置）

TILE = {"Timber": 1.0, "Hull": 1.1, "Rope": 0.4, "Reed": 0.5, "Iron": 0.9, "Crate": 0.6, "Charge": 0.6, "Cable": 0.5}
MATERIAL_NAME = {k: "PontoonBridge" + k for k in TILE}
REVIEW_COLOR = {"Timber": (0.36, 0.29, 0.21, 1), "Hull": (0.13, 0.10, 0.075, 1), "Rope": (0.55, 0.43, 0.24, 1),
                "Reed": (0.70, 0.60, 0.36, 1), "Iron": (0.06, 0.065, 0.07, 1), "Crate": (0.52, 0.42, 0.27, 1),
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


def Smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


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
# 面序号：0 = +x，1 = −x，2 = +y，3 = −y，4 = +z，5 = −z（按 Box 的三根轴，Beam 里指沿 xa/ya/zn 的三根轴）


def BoatNo(name):
    """'Boat11Stern' / 'Deck9_1' / 'SinkBoat7' 里的船号。"""
    return int(re.match(r"(?:Boat|Deck|SinkBoat)(\d+)", name).group(1))


def KindOf(name):
    if name in ("BankSouth", "BankNorth", "SouthSection", "Crates"):
        return "static"
    if name == "NorthSection":
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


def Piece(name):
    if name not in PIECES:
        PIECES[name] = Geo()
        KIND[name] = KindOf(name)
    return PIECES[name]


def Quad(piece, mat, quad, offset):
    g = Piece(piece)
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


def QuadH(piece, mat, pts, hint, offset=(0.0, 0.0)):
    """一个四边形，绕序按 hint（期望外法线方向）自动翻正；面积近零的退化面直接丢。"""
    q = [Vector(p) for p in pts]
    n1 = (q[1] - q[0]).cross(q[3] - q[0])
    n2 = (q[2] - q[1]).cross(q[0] - q[1])
    n = n1 + n2
    if n1.length < 1e-6 and n2.length < 1e-6:
        return
    if hint is not None and n.dot(Vector(hint)) < 0:
        q = [q[0], q[3], q[2], q[1]]
    Quad(piece, mat, q, offset)


def Hexa(piece, mat, c, skip=(), keep=None):
    c = [Vector(p) for p in c]
    if (c[1] - c[0]).cross(c[2] - c[0]).dot(c[4] - c[0]) < 0:
        c = [c[1], c[0], c[3], c[2], c[5], c[4], c[7], c[6]]
    offset = (UV_RNG.random() * 4, UV_RNG.random() * 4)
    for k, f in enumerate(HEXA_FACES):
        if k in skip:
            continue
        quad = [c[i] for i in f]
        if keep is not None:
            n = (quad[1] - quad[0]).cross(quad[3] - quad[0])
            if n.length < 1e-12 or not keep(n.normalized()):
                continue
        Quad(piece, mat, quad, offset)


def Box(piece, mat, centre, X, Y, Z, skip=(), keep=None):
    centre = Vector(centre)
    corners = []
    for i in range(8):
        sx = 1 if i & 1 else -1
        sy = 1 if i & 2 else -1
        sz = 1 if i & 4 else -1
        corners.append(centre + X * sx + Y * sy + Z * sz)
    Hexa(piece, mat, corners, skip, keep)


def AxisBox(piece, mat, x0, x1, y0, y1, z0, z1, skip=(), keep=None):
    if x0 > x1:
        x0, x1 = x1, x0
    if z0 > z1:
        z0, z1 = z1, z0
    if y0 > y1:
        y0, y1 = y1, y0
    Box(piece, mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
        Vector(((x1 - x0) / 2, 0, 0)), Vector((0, (y1 - y0) / 2, 0)), Vector((0, 0, (z1 - z0) / 2)), skip, keep)


def Beam(piece, mat, a, b, w, h, xaxis=(1, 0, 0), skip=(), keep=None):
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
    Box(piece, mat, (a + b) / 2, xa * (w / 2), ya * (h / 2), zn * (length / 2), skip, keep)


def Tube(piece, mat, a, b, size):
    """两端不封口的细方管：绳、导线、链。"""
    a, b = Vector(a), Vector(b)
    d = b - a
    ref = (0, 1, 0) if abs(d.normalized().y) < 0.9 else (1, 0, 0)
    Beam(piece, mat, a, b, size, size, xaxis=ref, skip=(4, 5))


def RopeLine(piece_of, mat, a, b, size, sag=0.0, n=2):
    """一段绳（带下垂）；每一小段按自己的中点归属件（piece_of(mid) 返回件名，返回 None 则不造）。"""
    a, b = Vector(a), Vector(b)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.y -= sag * 4 * t * (1 - t)
        pts.append(p)
    for p0, p1 in zip(pts, pts[1:]):
        name = piece_of((p0 + p1) / 2)
        if name:
            Tube(name, mat, p0, p1, size)


def Cylinder(piece, mat, cx, cz, r, y0, y1, n=6, cap=True, phase=0.0, offset=None):
    off = offset or (UV_RNG.random() * 4, UV_RNG.random() * 4)
    ring = [(cx + r * math.cos(phase + 2 * math.pi * k / n), cz + r * math.sin(phase + 2 * math.pi * k / n)) for k in range(n)]
    for k in range(n):
        (ax, az), (bx, bz) = ring[k], ring[(k + 1) % n]
        mx, mz = (ax + bx) / 2 - cx, (az + bz) / 2 - cz
        QuadH(piece, mat, [(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], (mx, 0, mz), off)
    if cap:
        top = [(x, y1, z) for x, z in ring]
        for i in range(1, n - 1, 2):
            idx = [0, i, i + 1, (i + 2) % n]
            QuadH(piece, mat, [top[j] for j in idx], (0, 1, 0), off)


def Band(piece, mat, cx, cz, r, y0, y1, n=6):
    """一圈绳（缠桩）：只有外壁的短圆筒。"""
    Cylinder(piece, mat, cx, cz, r, y0, y1, n=n, cap=False, phase=UV_RNG.random() * 1.0)


# ---------------------------------------------------------------------------
# 归属：桥面 z → 件名。一条船管 [zc+1.5, zc−1.5) 三米；南栈 / 北栈在船列之外。
# ---------------------------------------------------------------------------
def BoatIndex(z):
    return int(math.floor((BOAT_Z[0] + PITCH / 2 - z) / PITCH))


CLUSTER_CUTS = {}      # 被炸船 → 桥面板簇的分界 z（从南到北）


def PlanClusters():
    rng = random.Random(509)
    for b in BLASTED:
        zc = BOAT_Z[b]
        if abs(b - CI) <= 1:
            CLUSTER_CUTS[b] = [zc + 0.5 + rng.uniform(-0.2, 0.2), zc - 0.55 + rng.uniform(-0.2, 0.2)]
        else:
            CLUSTER_CUTS[b] = [zc + rng.uniform(-0.35, 0.35)]


def ClusterName(b, z):
    k = sum(1 for c in CLUSTER_CUTS[b] if c > z)
    return "Deck%d_%d" % (b, k)


def OwnerZ(z):
    i = BoatIndex(z)
    if i < 0:
        return "BankSouth"
    if i > N_BOATS - 1:
        return "BankNorth"
    if i <= SOUTH_LAST:
        return "SouthSection"
    if i in SINKING:
        return "SinkBoat%d" % i
    if i in BLASTED:
        return ClusterName(i, z)
    return "NorthSection"


def OwnerOfPoint(p):
    return OwnerZ(p.z)


def GroundMaxAcross(z):
    return max(TerrainAt(x, z) for x in (-1.4, 0.0, 1.4))


def DeckTopAt(z):
    """桥面顶：只有南栈头一小截会被泥岸顶上去（岸面比桥面高）。"""
    if z > BANK_Z:
        return max(DECK_TOP, GroundMaxAcross(z) + 0.05)
    return DECK_TOP


# ---------------------------------------------------------------------------
# 船体
# ---------------------------------------------------------------------------
OUTER = [(-1, 1.0, 0.0), (-1, 2 / 3, 0.0), (-1, 2 / 3, 0.04), (-1, 1 / 3, 0.0), (-1, 1 / 3, 0.04), (-1, 0.0, 0.0),
         (1, 0.0, 0.0), (1, 1 / 3, 0.04), (1, 1 / 3, 0.0), (1, 2 / 3, 0.04), (1, 2 / 3, 0.0), (1, 1.0, 0.0)]
SEG_HINT = {0: (0, 0, -1), 1: (0, -1, 0), 2: (0, 0, -1), 3: (0, -1, 0), 4: (0, 0, -1), 5: (0, -1, 0),
            6: (0, 0, 1), 7: (0, -1, 0), 8: (0, 0, 1), 9: (0, -1, 0), 10: (0, 0, 1)}
WALL_IN = 0.05
FLOOR_T = 0.045


def HalfBeam(x):
    ax = abs(x)
    if ax <= 2.2:
        return HALF_W
    t = min(1.0, (ax - 2.2) / 1.1)
    return HALF_W - 0.53 * t * t


def BottomHalf(x):
    return HalfBeam(x) * 0.80


def BottomY(x):
    ax = abs(x)
    if ax <= 2.2:
        return Y_BOT
    t = min(1.0, (ax - 2.2) / 1.1)
    return Y_BOT + 0.34 * t * t


def GunwaleY(x):
    ax = abs(x)
    if ax <= 2.0:
        return Y_GUN
    t = min(1.0, (ax - 2.0) / 1.3)
    return Y_GUN + 0.30 * t * t


def OuterPoint(j, x, zc, hmax=1.0):
    side, h, inset = OUTER[j]
    h = min(h, hmax)
    y0, y1 = BottomY(x), GunwaleY(x)
    w, wb = HalfBeam(x), BottomHalf(x)
    return Vector((x, y0 + (y1 - y0) * h, zc + side * (wb + (w - wb) * h - inset)))


def InnerPoint(side, h, x, zc):
    y0, y1 = BottomY(x), GunwaleY(x)
    w, wb = HalfBeam(x), BottomHalf(x)
    y = y0 + (y1 - y0) * h
    y = max(y, y0 + FLOOR_T)
    return Vector((x, y, zc + side * (wb + (w - wb) * h - WALL_IN)))


def HullShell(piece, zc, xs, hmax=None, cut_lo=None, cut_hi=None, cap_lo=False, cap_hi=False, off=(0.0, 0.0)):
    """一段船壳（外壳带搭接木条、内壳、舷缘压条、可选的艏艉封板与断口）。xs：站位 x 升序；
    cut_lo/cut_hi：首/末站的逐点 x 偏移（12 个外点，长度 12），造参差断口；hmax(x)：该 x 处壳高上限（0..1）。"""
    hm = hmax or (lambda x: 1.0)
    outs, ins = [], []
    n = len(xs)
    for s, x0 in enumerate(xs):
        cut = cut_lo if s == 0 else (cut_hi if s == n - 1 else None)
        po = []
        for j in range(12):
            x = x0 + (cut[j] if cut else 0.0)
            po.append(OuterPoint(j, x, zc, hm(x)))
        xin = [po[0].x, po[5].x, po[6].x, po[11].x]
        hin = [hm(xin[0]), 0.0, 0.0, hm(xin[3])]
        end_shift = 0.0
        if s == 0 and cap_lo:
            end_shift = WALL_IN
        if s == n - 1 and cap_hi:
            end_shift = -WALL_IN
        pin = [InnerPoint(-1, hin[0], xin[0] + end_shift, zc), InnerPoint(-1, 0.0, xin[1] + end_shift, zc),
               InnerPoint(1, 0.0, xin[2] + end_shift, zc), InnerPoint(1, hin[3], xin[3] + end_shift, zc)]
        outs.append(po)
        ins.append(pin)
    o = off
    for s in range(n - 1):
        for j in range(11):
            QuadH(piece, "Hull", [outs[s][j], outs[s][j + 1], outs[s + 1][j + 1], outs[s + 1][j]], SEG_HINT[j],
                  (o[0] + 0.37 * (j // 2), o[1] + 0.21 * (j // 2)))
        QuadH(piece, "Hull", [ins[s][0], ins[s][1], ins[s + 1][1], ins[s + 1][0]], (0, 0, 1), o)
        QuadH(piece, "Hull", [ins[s][1], ins[s][2], ins[s + 1][2], ins[s + 1][1]], (0, 1, 0), (o[1], o[0]))
        QuadH(piece, "Hull", [ins[s][2], ins[s][3], ins[s + 1][3], ins[s + 1][2]], (0, 0, -1), o)
        QuadH(piece, "Hull", [outs[s][0], outs[s + 1][0], ins[s + 1][0], ins[s][0]], (0, 1, 0), o)
        QuadH(piece, "Hull", [outs[s][11], outs[s + 1][11], ins[s + 1][3], ins[s][3]], (0, 1, 0), o)
    for s, sgn, on in ((0, -1, cap_lo), (n - 1, 1, cap_hi)):
        if not on:
            continue
        po, pi = outs[s], ins[s]
        for j in range(5):
            QuadH(piece, "Hull", [po[j], po[j + 1], po[10 - j], po[11 - j]], (sgn, 0, 0), o)
        QuadH(piece, "Hull", [pi[0], pi[1], pi[2], pi[3]], (-sgn, 0, 0), o)
        QuadH(piece, "Hull", [po[0], po[11], pi[3], pi[0]], (0, 1, 0), o)
    for s, sgn, cut in ((0, -1, cut_lo), (n - 1, 1, cut_hi)):
        if not cut:
            continue
        po = outs[s]
        hs = [OUTER[j][1] for j in range(12)]
        hs = [min(h, hm(po[j].x)) for j, h in enumerate(hs)]
        for side, idx in ((-1, [0, 1, 2, 3, 4, 5]), (1, [11, 10, 9, 8, 7, 6])):
            inner = [InnerPoint(side, hs[j], po[j].x, zc) for j in idx]
            for a, b in ((0, 1), (2, 3), (4, 5)):
                QuadH(piece, "Hull", [po[idx[a]], po[idx[b]], inner[b], inner[a]], (sgn, 0, 0), o)
            for a in (1, 3):
                QuadH(piece, "Hull", [po[idx[a]], po[idx[a + 1]], inner[a + 1], inner[a]], (sgn, 0, 0), o)
        floor_l = InnerPoint(-1, 0.0, po[5].x, zc)
        floor_r = InnerPoint(1, 0.0, po[6].x, zc)
        QuadH(piece, "Hull", [po[5], po[6], floor_r, floor_l], (sgn, 0, 0), o)


def Ribs(pc, zc, xs, hmax=None, rng=None):
    """内侧横向肋：底肋 + 两舷各一根（只造朝内的面，省三角）。"""
    hm = hmax or (lambda x: 1.0)
    for x in xs:
        piece = pc(x)
        y0 = BottomY(x) + FLOOR_T
        wb = BottomHalf(x) - WALL_IN
        Beam(piece, "Timber", (x, y0 + 0.02, zc - wb), (x, y0 + 0.02, zc + wb), 0.07, 0.045, xaxis=(1, 0, 0),
             keep=lambda n: n.y > 0.5)
        htop = min(0.97, hm(x))
        if htop < 0.15:
            continue
        for side in (-1, 1):
            a = InnerPoint(side, 0.0, x, zc)
            b = InnerPoint(side, htop, x, zc)
            inward = Vector((0, 0.45, -side)).normalized()
            Beam(piece, "Timber", a + Vector((0, 0.02, -side * 0.01)), b + Vector((0, -0.01, -side * 0.01)), 0.07, 0.045,
                 xaxis=(1, 0, 0), keep=lambda n, inward=inward: n.dot(inward) > 0.5)


def StemPosts(pc, zc):
    for sgn in (-1, 1):
        x0, x1 = sgn * 3.24, sgn * 3.44
        Beam(pc(sgn * 3.3), "Timber", (x0, BottomY(3.3) - 0.06, zc), (x1, GunwaleY(3.3) + 0.14, zc), 0.17, 0.15,
             xaxis=(0, 0, 1))


def Reeds(pc, zc, rng, n_bundles):
    """芦苇束：船里躺着的细长扁盒束（两根扁盒叠成一束）。"""
    for _ in range(n_bundles):
        side = rng.choice((-1, 1))
        x = rng.choice((-1, 1)) * rng.uniform(1.75, 2.9)
        piece = pc(x)
        w = HalfBeam(x) - 0.22
        z0 = zc + side * rng.uniform(0.15, max(0.2, w - 0.15))
        ang = rng.uniform(-0.35, 0.35) + (math.pi / 2 if rng.random() < 0.35 else 0.0)
        d = Vector((math.cos(ang), 0, math.sin(ang)))
        ln = rng.uniform(0.7, 1.15)
        y = BottomY(x) + FLOOR_T + 0.09
        c = Vector((x, y, z0))
        Beam(piece, "Reed", c - d * ln / 2, c + d * ln / 2, 0.15, 0.08, xaxis=(0, 1, 0), skip=(3,))
        c2 = c + Vector((0, 0.05, 0.03))
        d2 = Vector((math.cos(ang + 0.2), 0.03, math.sin(ang + 0.2))).normalized()
        Beam(piece, "Reed", c2 - d2 * ln * 0.4, c2 + d2 * ln * 0.5, 0.09, 0.05, xaxis=(0, 1, 0), skip=(3,))


def RopeCoil(pc, zc, rng):
    x = rng.choice((-1, 1)) * rng.uniform(2.0, 2.7)
    z0 = zc + rng.uniform(-0.25, 0.25)
    y = BottomY(x) + FLOOR_T
    Cylinder(pc(x), "Rope", x, z0, 0.17, y, y + 0.14, n=8)


def ReedHeap(pc, zc, rng):
    """一小垛立着靠舷的芦苇：几根细长扁条从舱底斜出舷缘之上，从船外看得见。"""
    side = rng.choice((-1, 1))
    x = rng.choice((-1, 1)) * rng.uniform(1.9, 2.8)
    piece = pc(x)
    z0 = zc + side * (HalfBeam(x) - 0.28)
    base_y = BottomY(x) + FLOOR_T + 0.02
    for k in range(4):
        bx = x + rng.uniform(-0.18, 0.18)
        a = Vector((bx, base_y, z0 + rng.uniform(-0.05, 0.05)))
        tip = Vector((bx + rng.uniform(-0.3, 0.3), GunwaleY(bx) + rng.uniform(0.18, 0.5), z0 + side * rng.uniform(0.12, 0.3)))
        Beam(piece, "Reed", a, tip, 0.06, 0.035, xaxis=(1, 0, 0), skip=(4, 5))


def Winch(piece, x, zc):
    """船头小绞盘（x 是带符号的位置：−x = 船头朝西 / 上游）：木垫梁 + 铸铁立筒（半径 0.14、高 0.5）+ 箍 + 两根横杆 + 缠绳。"""
    yb = GunwaleY(x) - 0.02
    Beam(piece, "Timber", (x, yb + 0.03, zc - 0.85), (x, yb + 0.03, zc + 0.85), 0.2, 0.08, xaxis=(1, 0, 0))
    y0 = yb + 0.07
    Cylinder(piece, "Iron", x, zc, 0.14, y0, y0 + 0.5, n=6)
    Cylinder(piece, "Iron", x, zc, 0.185, y0, y0 + 0.09, n=6)
    Cylinder(piece, "Iron", x, zc, 0.185, y0 + 0.42, y0 + 0.5, n=6)
    Cylinder(piece, "Rope", x, zc, 0.155, y0 + 0.15, y0 + 0.34, n=6)
    Beam(piece, "Timber", (x, y0 + 0.4, zc - 0.44), (x, y0 + 0.4, zc + 0.44), 0.05, 0.05, xaxis=(1, 0, 0))
    Beam(piece, "Timber", (x - 0.33, y0 + 0.31, zc - 0.26), (x + 0.33, y0 + 0.31, zc + 0.26), 0.05, 0.05, xaxis=(0, 1, 0))
    # 绞盘后面一根缆桩（船头柱旁的木墩）
    sgn = 1 if x > 0 else -1
    Cylinder(piece, "Timber", x - sgn * 0.55, zc + 0.5, 0.09, yb, yb + 0.42, n=6)


def Anchor(piece, x, zc, side):
    """铁锚：搁在船头舷上的锚杆 + 横档 + 两只锚爪，链子翻过艏柱垂进水里。x 带符号（−x = 船头朝西 / 上游）：
    按 x 的符号把整套往船头那一头镜像。"""
    sg = 1 if x > 0 else -1
    ax = abs(x)
    X = lambda d: sg * (ax + d)
    z0 = zc + side * 0.30
    Beam(piece, "Iron", (X(-0.55), GunwaleY(ax - 0.55) + 0.02, z0), (X(0.45), GunwaleY(ax + 0.45) + 0.05, z0), 0.06, 0.06)
    Beam(piece, "Iron", (X(-0.5), GunwaleY(ax - 0.5) + 0.05, z0 - 0.3), (X(-0.5), GunwaleY(ax - 0.5) + 0.05, z0 + 0.3), 0.045, 0.045)
    tip = (X(0.45), GunwaleY(ax + 0.45) + 0.05, z0)
    Beam(piece, "Iron", tip, (X(0.6), tip[1] - 0.12, z0 + 0.22), 0.05, 0.05)
    Beam(piece, "Iron", tip, (X(0.6), tip[1] - 0.12, z0 - 0.22), 0.05, 0.05)
    chain = [(X(-0.55), GunwaleY(ax - 0.55) + 0.05, z0), (X(-0.2), GunwaleY(ax - 0.2) + 0.12, z0 + side * 0.1),
             (sg * (HALF_L + 0.12), GunwaleY(HALF_L) + 0.02, z0 + side * 0.12), (sg * (HALF_L + 0.2), Y_GUN - 0.3, z0 + side * 0.13),
             (sg * (HALF_L + 0.24), Y_GUN - 0.9, z0 + side * 0.14)]
    for a, b in zip(chain, chain[1:]):
        Tube(piece, "Iron", a, b, 0.035)


def TotalTris():
    return sum(2 * len(g.faces) for g in PIECES.values())


def BuildBoat(i, rng):
    """第 i 条船的船体与船内杂物。返回该船的布置信息（给 layout 用）。"""
    zc = BOAT_Z[i]
    tris0 = TotalTris()
    off = (rng.random() * 4, rng.random() * 4)
    winch = i % 3 == 2                      # 2, 5, 8, 11（中心船）, 14, 17, 20
    anchor = i in (1, 4, CI - 1, 13, 18)
    anchor_side = 1 if i % 2 else -1
    info = {"i": i, "z": zc, "winch": winch, "anchor": anchor}
    rib_xs = [-2.7, -1.8, -0.9, 0.0, 0.9, 1.8, 2.7]
    if i in BLASTED:
        jr = random.Random(700 + i)
        cut = 1.55 + jr.uniform(-0.08, 0.08)

        def pc(x):
            return "Boat%dBow" % i if x < -1.7 else ("Boat%dStern" % i if x > 1.7 else "Boat%dKeel" % i)
        phase = jr.random() * 6.28

        def hm_keel(x):
            # 桥面（±1.4）底下的船中段：完好时看不见，炸后露出参差的低舷；|x| ≥ 1.1 一律满高，
            # 这样三块碎片在 t=0 拼回一条完整的船（相邻两块共用同一组断口偏移）
            if abs(x) >= 1.1:
                return 1.0
            return 0.15 + 0.32 * (0.5 + 0.5 * math.sin(x * 5.3 + phase)) + 0.08 * math.sin(x * 13.0)
        co_hi = [jr.uniform(-0.3, 0.3) for _ in range(12)]     # 船头半 / 船底段的共用断口
        co_lo = [jr.uniform(-0.3, 0.3) for _ in range(12)]     # 船尾半 / 船底段的共用断口
        HullShell("Boat%dStern" % i, zc, [cut, 2.2, 2.75, HALF_L], cut_lo=co_hi, cap_hi=True, off=off)      # 东半（船尾）
        HullShell("Boat%dBow" % i, zc, [-HALF_L, -2.75, -2.2, -cut], cut_hi=co_lo, cap_lo=True, off=off)    # 西半（船头，朝上游）
        HullShell("Boat%dKeel" % i, zc, [-cut, -1.1, 0.0, 1.1, cut], hmax=hm_keel, cut_lo=co_lo, cut_hi=co_hi, off=off)
        Ribs(pc, zc, rib_xs, hmax=hm_keel)
        StemPosts(pc, zc)
    elif i in SINKING:
        name = "SinkBoat%d" % i
        pc = lambda x: name
        HullShell(name, zc, [-HALF_L, -2.75, -2.2, 0.0, 2.2, 2.75, HALF_L], cap_lo=True, cap_hi=True, off=off)
        Ribs(pc, zc, rib_xs)
        StemPosts(pc, zc)
    else:
        name = "SouthSection" if i <= SOUTH_LAST else "NorthSection"
        pc = lambda x: name
        HullShell(name, zc, [-HALF_L, -2.75, -2.2, 0.0, 2.2, 2.75, HALF_L], cap_lo=True, cap_hi=True, off=off)
        Ribs(pc, zc, rib_xs)
        StemPosts(pc, zc)
    fr = random.Random(900 + i)
    Reeds(pc, zc, fr, 2 if i % 2 else 3)
    RopeCoil(pc, zc, fr)
    ReedHeap(pc, zc, fr)
    if winch:                               # 船头朝上游（−x）：绞盘、铁锚都在西头
        Winch("Winch%d" % CI if i == CI else pc(-2.45), -2.45, zc)
    if anchor:
        Anchor("Anchor%d" % (CI - 1) if i == CI - 1 else pc(-2.7), -2.6, zc, anchor_side)
    info["triangles"] = TotalTris() - tris0
    return info


# ---------------------------------------------------------------------------
# 桥面、纵梁、绳栏
# ---------------------------------------------------------------------------
# 断口处的断板（从断口往外数第 k 块）：x 范围、往上翘的俯仰、东端下垂的横滚
BREAK_PLANKS_S = {0: (-1.4, 0.35, 0.16, -0.20), 1: (-1.4, 1.05, 0.07, 0.0), 2: (-0.7, 1.4, 0.03, 0.05), 3: (-1.4, 1.4, 0.03, 0.0)}
BREAK_PLANKS_N = {0: (-0.3, 1.4, 0.15, 0.22), 1: (-1.4, 0.75, 0.08, 0.0), 2: (-1.4, 1.4, 0.03, -0.04), 3: (-1.4, 1.4, 0.02, 0.0)}


def BuildPlanks():
    rng = random.Random(77)
    k = 0
    while True:
        ztop = HEAD_S - PLANK_PITCH * k
        zc = ztop - PLANK_D / 2
        if zc < HEAD_N + PLANK_D / 2:
            break
        k += 1
        owner = OwnerZ(zc)
        x0, x1, pitch, roll = -DECK_HALF, DECK_HALF, 0.0, 0.0
        special = False
        if owner == "SouthSection" and zc - BREAK_S < 4 * PLANK_PITCH:
            idx = int((zc - BREAK_S) / PLANK_PITCH)
            if idx in BREAK_PLANKS_S:
                x0, x1, pitch, roll = BREAK_PLANKS_S[idx]
                special = True
        if owner == "NorthSection" and BREAK_N - zc < 4 * PLANK_PITCH:
            idx = int((BREAK_N - zc) / PLANK_PITCH)
            if idx in BREAK_PLANKS_N:
                x0, x1, pitch, roll = BREAK_PLANKS_N[idx]
                special = True
        if not special and rng.random() < 0.05:
            if rng.random() < 0.5:
                x0 += rng.uniform(0.35, 0.7)
            else:
                x1 -= rng.uniform(0.35, 0.7)
        top = DeckTopAt(zc) + rng.uniform(-0.006, 0.006)
        cx = (x0 + x1) / 2 + rng.uniform(-0.012, 0.012)
        hl = (x1 - x0) / 2 - 0.004
        m = Matrix.Rotation(-pitch, 3, "X") @ Matrix.Rotation(roll, 3, "Z")
        centre = Vector((cx, top - PLANK_T / 2, zc)) + Vector((0, 0.03 * math.sin(pitch) * 0, 0))
        if special and pitch > 0.1:
            centre.y += 0.02
        static = owner in ("SouthSection", "NorthSection", "BankSouth", "BankNorth")
        keep = (lambda n: n.y > 0.5 or abs(n.x) > 0.5) if (static and not special) else None
        Box(owner, "Timber", centre, m @ Vector((hl, 0, 0)), m @ Vector((0, PLANK_T / 2, 0)),
            m @ Vector((0, 0, PLANK_D / 2 - rng.uniform(0.0, 0.012))), keep=keep)


def StringerSegments(z_from, z_to, x, cuts):
    """[z_from, z_to]（z_from > z_to）沿 cuts（降序）切成若干段。"""
    pts = [z_from] + [c for c in cuts if z_to < c < z_from] + [z_to]
    return list(zip(pts, pts[1:]))


def AddStringer(owner, x, za, zb, ramp=False):
    if ramp and za > BANK_Z:
        z_mid = BANK_Z
        Beam(owner, "Timber", (x, STRINGER_TOP - STRINGER_H / 2, zb), (x, STRINGER_TOP - STRINGER_H / 2, z_mid), STRINGER_W, STRINGER_H)
        yb = DeckTopAt(za) - PLANK_T - STRINGER_H / 2
        Beam(owner, "Timber", (x, STRINGER_TOP - STRINGER_H / 2, z_mid), (x, yb, za), STRINGER_W, STRINGER_H)
        return
    Beam(owner, "Timber", (x, STRINGER_TOP - STRINGER_H / 2, zb), (x, STRINGER_TOP - STRINGER_H / 2, za), STRINGER_W, STRINGER_H)


def BuildStringers():
    rng = random.Random(31)
    for sx in (-STRINGER_X, STRINGER_X):
        # 南栈：栈头 → 0 号船北端（末端顺泥岸爬起来）
        AddStringer("BankSouth", sx, HEAD_S - 0.02, BANK_Z - 0.03, ramp=True)
        # 北栈：末条船南端 → 栈头
        AddStringer("BankNorth", sx, NORTH_STUB_Z - 0.02, HEAD_N + 0.02)
        for i in range(N_BOATS):
            zc = BOAT_Z[i]
            za, zb = zc + 1.5 + 0.03, zc - 1.5 - 0.03
            if i == SOUTH_LAST:                            # 南截断口：西梁多伸出一截、东梁短
                zb = BREAK_S - (0.42 if sx < 0 else -0.18)
                za += 0.0
            if i == NORTH_FIRST:                           # 北截断口
                za = BREAK_N + (0.30 if sx < 0 else -0.36)
            if i in BLASTED:
                cuts = [c + (0.28 if sx > 0 else -0.22) for c in CLUSTER_CUTS[i]]
                for a, b in StringerSegments(za, zb, sx, sorted(cuts, reverse=True)):
                    owner = ClusterName(i, (a + b) / 2)
                    Beam(owner, "Timber", (sx, STRINGER_TOP - STRINGER_H / 2, b + 0.01), (sx, STRINGER_TOP - STRINGER_H / 2, a - 0.01),
                         STRINGER_W, STRINGER_H)
                continue
            owner = OwnerZ(zc)
            AddStringer(owner, sx, za, zb)


POST_ZS = [HEAD_S - 0.4 - PITCH * k for k in range(int((HEAD_S - HEAD_N) / PITCH))] + [HEAD_N + 0.25]   # 37.0, 34.0, … 最后一根钉在北栈头


def ClipRail(owner, a, b):
    """静态 / 摆动截的绳栏在断口处不能连着已沉的船：越过断口的一头剪到断口内并下垂。"""
    a, b = Vector(a), Vector(b)
    if owner == "SouthSection":
        for p, q in ((a, b), (b, a)):
            if p.z < BREAK_S + 0.05:
                t = (q.z - (BREAK_S + 0.25)) / (q.z - p.z) if abs(q.z - p.z) > 1e-6 else 0
                new = q.lerp(p, max(0.0, min(1.0, t)))
                new.y -= 0.32
                new.x += 0.05
                if p is a:
                    a = new
                else:
                    b = new
    if owner == "NorthSection":
        for p, q in ((a, b), (b, a)):
            if p.z > BREAK_N - 0.05:
                t = (q.z - (BREAK_N - 0.25)) / (q.z - p.z) if abs(q.z - p.z) > 1e-6 else 0
                new = q.lerp(p, max(0.0, min(1.0, t)))
                new.y -= 0.32
                new.x -= 0.05
                if p is a:
                    a = new
                else:
                    b = new
    return a, b


def BuildRails():
    rng = random.Random(64)
    for side in (-1, 1):
        x = side * RAIL_X
        posts = []
        for z in POST_ZS:
            zj = z + rng.uniform(-0.12, 0.12)
            base = DeckTopAt(zj) - 0.03
            h = rng.uniform(0.97, 1.05)
            piece = OwnerZ(zj)
            xj = x + side * rng.uniform(-0.01, 0.03)
            AxisBox(piece, "Timber", xj - 0.05, xj + 0.05, base, base + h, zj - 0.05, zj + 0.05, skip=(3,))
            posts.append((xj, base, h, zj, piece))
        for (xa, ba, ha, za, _), (xb, bb, hb, zb, _) in zip(posts, posts[1:]):
            for frac, sag in ((0.45, 0.05), (0.9, 0.035)):
                a = Vector((xa - side * 0.06, ba + ha * frac, za))
                b = Vector((xb - side * 0.06, bb + hb * frac, zb))
                pts = []
                n = 2
                for k in range(n + 1):
                    t = k / n
                    p = a.lerp(b, t)
                    p.y -= sag * 4 * t * (1 - t)
                    pts.append(p)
                for p0, p1 in zip(pts, pts[1:]):
                    owner = OwnerOfPoint((p0 + p1) / 2)
                    q0, q1 = ClipRail(owner, p0, p1)
                    Tube(owner, "Rope", q0, q1, 0.04)
            # 桩顶横竹竿
            a = Vector((xa - side * 0.02, ba + ha + 0.03, za + 0.15))
            b = Vector((xb - side * 0.02, bb + hb + 0.03, zb - 0.15))
            owner = OwnerOfPoint((a + b) / 2)
            q0, q1 = ClipRail(owner, a, b)
            Beam(owner, "Reed", q0, q1, 0.055, 0.055, xaxis=(1, 0, 0))
        # 桩上绳扣
        for (xa, ba, ha, za, piece) in posts:
            Cylinder(piece, "Rope", xa, za, 0.075, ba + ha * 0.9 - 0.04, ba + ha * 0.9 + 0.05, n=4, cap=False, phase=0.78)


# ---------------------------------------------------------------------------
# 两岸：栈桥桩、岸桩、缆、药箱、铁丝网、起爆器、导线、药包
# ---------------------------------------------------------------------------
STAKES = []       # layout 用
CABLES = []


def BigStake(piece, x, z, top, wraps, rng, sink=0.5):
    g = TerrainAt(x, z)
    Cylinder(piece, "Timber", x, z, 0.14, g - sink, g + top, n=6, phase=rng.random())
    for k in range(wraps):
        y1 = g + top - 0.06 - k * 0.11
        Band(piece, "Rope", x, z, 0.172, y1 - 0.09, y1, n=6)
    STAKES.append({"piece": piece, "x": round(x, 2), "z": round(z, 2), "top": round(g + top, 3)})


def TrestlePiles():
    rng = random.Random(21)
    # 南栈：四对，桩头缠粗绳（从栈头往船方向，桩脚插进陡泥岸 / 浅水）
    for z in (HEAD_S - 0.3, HEAD_S - 1.3, HEAD_S - 2.3, HEAD_S - 3.2):
        for sx in (-1.58, 1.58):
            x = sx + rng.uniform(-0.04, 0.04)
            g = TerrainAt(x, z)
            Cylinder("BankSouth", "Timber", x, z, 0.105, g - 0.5, DECK_TOP + 0.13, n=6, phase=rng.random())
            Band("BankSouth", "Rope", x, z, 0.135, DECK_TOP - 0.12, DECK_TOP + 0.05, n=6)
            Band("BankSouth", "Rope", x, z, 0.135, DECK_TOP - 0.28, DECK_TOP - 0.16, n=6)
    # 北栈：四对，坡下的两对插进水里
    for z in (-29.2, -30.4, -31.6, -32.8, HEAD_N + 0.3):
        for sx in (-1.58, 1.58):
            x = sx + rng.uniform(-0.04, 0.04)
            g = TerrainAt(x, z)
            Cylinder("BankNorth", "Timber", x, z, 0.105, g - 0.4, DECK_TOP + 0.13, n=6, phase=rng.random())
            Band("BankNorth", "Rope", x, z, 0.135, DECK_TOP - 0.12, DECK_TOP + 0.05, n=6)
            Band("BankNorth", "Rope", x, z, 0.135, DECK_TOP - 0.30, DECK_TOP - 0.17, n=6)


SHORE_STAKE_W = (-3.4, HEAD_S + 0.4)       # 南岸西边的缆桩（上游缆拴在这里；泥垄东端在 x −6.2 之外，桩不踩在垄上）
SHORE_STAKE_E = (5.6, HEAD_S + 1.0)        # 东边的缆桩（下游缆）


def BankStakes():
    rng = random.Random(23)
    for (x, z, top) in ((-2.4, HEAD_S + 1.9, 1.05), (3.7, HEAD_S + 0.7, 0.95), (SHORE_STAKE_W[0], SHORE_STAKE_W[1], 1.15),
                        (SHORE_STAKE_E[0], SHORE_STAKE_E[1], 1.0)):
        BigStake("BankSouth", x, z, top, rng.choice((3, 4, 5)), rng)
    for (x, z, top) in ((-2.6, HEAD_N - 1.7, 1.1), (2.9, HEAD_N - 1.1, 0.95), (-5.6, HEAD_N - 2.5, 1.05), (5.5, HEAD_N - 1.9, 1.0)):
        BigStake("BankNorth", x, z, top, rng.choice((3, 4, 5)), rng, sink=0.4)


def Mooring(piece, start, end, size=0.05, sag=0.16, n=4, name=""):
    """一根缆：start 在船上、end 在桩 / 水里，稍有下垂。整根归 piece。"""
    a, b = Vector(start), Vector(end)
    pts = []
    for k in range(n + 1):
        t = k / n
        p = a.lerp(b, t)
        p.y -= sag * 4 * t * (1 - t)
        pts.append(p)
    for p0, p1 in zip(pts, pts[1:]):
        Tube(piece, "Rope", p0, p1, size)
    CABLES.append({"piece": piece, "from": [round(c, 2) for c in a], "to": [round(c, 2) for c in b], "note": name})


def BuildMoorings():
    st = lambda i, side=0: Vector((-HALF_L - 0.04, Y_GUN + 0.22, BOAT_Z[i] + side))
    # 南截：0 号船艉→西岸桩；3 号船艉→入水的锚；6 号船艉→入水的锚
    Mooring("SouthSection", st(0, 0.2), (SHORE_STAKE_W[0], TerrainAt(*SHORE_STAKE_W) + 0.85, SHORE_STAKE_W[1]), name="shore")
    Mooring("SouthSection", st(3, 0.25), (-9.5, Y_GUN - 1.6, BOAT_Z[3] + 4.5), name="anchor", sag=0.05)
    Mooring("SouthSection", st(SOUTH_LAST, -0.2), (-9.4, Y_GUN - 1.8, BOAT_Z[SOUTH_LAST] - 4.2), name="anchor", sag=0.05)
    # 北截：17、19 号船艉→入水的锚；20 号船艉→北岸桩
    for i, (dx, dz) in ((NORTH_FIRST + 1, (-8.6, -4.2)), (NORTH_FIRST + 3, (-9.0, 3.4))):
        Mooring("NorthSection", st(i, 0.15), (-HALF_L + dx, Y_GUN - 1.8, BOAT_Z[i] + dz), name="anchor", sag=0.05)
    Mooring("NorthSection", st(N_BOATS - 1, -0.25), (-2.6, TerrainAt(-2.6, HEAD_N - 1.7) + 0.7, HEAD_N - 1.7), name="shore")
    # 中间几条船（被炸区的邻船）的上游缆：崩断，只剩绳头挂在船艉上
    for i in SINKING + BLASTED:
        piece = "SinkBoat%d" % i if i in SINKING else "Boat%dBow" % i
        a = st(i, 0.1)
        Mooring(piece, a, a + Vector((-0.75, -0.22, -0.4 + 0.15 * (i % 3))), size=0.05, sag=0.05, n=2, name="snapped")
    # 岸桩上再拴一根东侧的下游缆（船头 → 岸桩）
    Mooring("SouthSection", Vector((HALF_L + 0.04, Y_GUN + 0.22, BOAT_Z[0] + 0.3)),
            (SHORE_STAKE_E[0], TerrainAt(*SHORE_STAKE_E) + 0.7, SHORE_STAKE_E[1]), name="shore-down")


def WoodCrate(centre, size, yaw, piece="Crates"):
    c, s = math.cos(yaw), math.sin(yaw)
    ax = Vector((c, 0, -s))
    az = Vector((s, 0, c))
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    centre = Vector(centre)
    Box(piece, "Crate", centre, ax * hx, Vector((0, hy, 0)), az * hz)
    for f in (-0.55, 0.55):
        Box(piece, "Iron", centre + ax * (hx * f), ax * 0.018, Vector((0, hy + 0.012, 0)), az * (hz + 0.012))
    Box(piece, "Timber", centre + Vector((0, hy + 0.012, 0)), ax * (hx * 0.92), Vector((0, 0.012, 0)), az * (hz * 0.16))


def WireCoil(piece, cx, cz, radius=0.45):
    """一卷铁丝网：几圈叠着的圆环束（Iron）。"""
    rng = random.Random(88)
    g = TerrainAt(cx, cz)
    for ring in range(6):
        r = radius * rng.uniform(0.9, 1.0)
        y = g + 0.05 + ring * 0.055
        rot = rng.random()
        n = 9
        pts = [(cx + r * math.cos(rot + 2 * math.pi * k / n), y + 0.02 * math.sin(k * 1.7), cz + r * math.sin(rot + 2 * math.pi * k / n))
               for k in range(n + 1)]
        for a, b in zip(pts, pts[1:]):
            Tube(piece, "Iron", a, b, 0.035)
    for ring in range(2):                                 # 竖着的两圈（卷筒的侧壁）
        r = radius * 0.5
        y = g + 0.19
        n = 8
        pts = [(cx + radius * 0.6 * math.cos(2 * math.pi * k / n + ring), y + r * 0.5 * math.sin(2 * math.pi * k / n + ring), cz + 0.0 * k)
               for k in range(n + 1)]
        for a, b in zip(pts, pts[1:]):
            Tube(piece, "Iron", a, b, 0.03)


def RopeHeap(piece, cx, cz, radius, rng):
    g = TerrainAt(cx, cz)
    for k in range(3):
        r = radius * (1.0 - 0.18 * k)
        y0 = g + 0.02 + k * 0.07
        Cylinder(piece, "Rope", cx + rng.uniform(-0.03, 0.03), cz + rng.uniform(-0.03, 0.03), r, y0, y0 + 0.08, n=8)


def BuildCrates():
    rng = random.Random(57)
    g = TerrainAt
    # 两摞药箱：crew 落位 x +5.4（桥轴东侧），z 43.2 / 45.2（局部 = 世界 z 165.2 / 167.2），朝西 —— 箱摞在他们西侧、桥头东侧
    ax, az = 3.85, 30.5 + ZSH
    WoodCrate((ax, g(ax, az) + 0.27, az), (0.92, 0.54, 0.6), 0.1)
    WoodCrate((ax - 0.04, g(ax, az + 1.0) + 0.27, az + 1.0), (0.88, 0.54, 0.58), -0.12)
    WoodCrate((ax - 0.02, g(ax, az) + 0.54 + 0.24, az + 0.05), (0.8, 0.46, 0.5), 0.5)
    WoodCrate((ax + 0.05, g(ax, az + 1.0) + 0.54 + 0.24, az + 1.0), (0.76, 0.44, 0.5), -0.35)
    bx, bz = 4.15, 33.4 + ZSH
    WoodCrate((bx, g(bx, bz) + 0.27, bz), (0.9, 0.54, 0.6), -0.08)
    WoodCrate((bx - 0.05, g(bx, bz + 0.98) + 0.27, bz + 0.98), (0.86, 0.52, 0.58), 0.14)
    WoodCrate((bx - 0.02, g(bx, bz + 0.5) + 0.54 + 0.23, bz + 0.5), (0.8, 0.46, 0.5), 0.6)
    # 一卷铁丝网、绳圈、木桩
    WireCoil("Crates", 2.55, 32.6 + ZSH)
    for (x, z, r) in ((2.75, 29.5 + ZSH, 0.32), (1.95, 35.0 + ZSH, 0.26), (-2.2, 30.4 + ZSH, 0.3)):
        RopeHeap("Crates", x, z, r, rng)
    for (x, z, top, lean) in ((2.35, 28.9 + ZSH, 0.9, -0.12), (-2.1, 28.3 + ZSH, 0.75, 0.1), (1.9, 27.4 + ZSH, 0.6, -0.18), (-3.0, 29.6 + ZSH, 0.7, -0.05)):
        gg = g(x, z)
        a = Vector((x, gg - 0.3, z))
        b = Vector((x + lean, gg + top, z + lean * 0.4))
        Beam("Crates", "Timber", a, b, 0.11, 0.11, xaxis=(0, 0, 1))
        Band("Crates", "Rope", b.x, b.z, 0.09, b.y - 0.2, b.y - 0.08, n=4)
    # 水边立着的芦苇丛（南岸水线 z 35.9 以南的陡岸沿上）
    for k in range(7):
        cx = rng.uniform(-6.5, 9.5)
        cz = rng.uniform(HEAD_S - 0.8, HEAD_S + 2.4)
        if abs(cx) < 2.3:
            cx += 3.4 * (1 if cx >= 0 else -1)
        for s_ in range(5):
            bx_ = cx + rng.uniform(-0.25, 0.25)
            bz_ = cz + rng.uniform(-0.25, 0.25)
            a = Vector((bx_, g(bx_, bz_) - 0.05, bz_))
            tip = Vector((bx_ + rng.uniform(-0.35, 0.35), g(bx_, bz_) + rng.uniform(0.9, 1.5), bz_ + rng.uniform(-0.25, 0.25)))
            Beam("Crates", "Reed", a, tip, 0.05, 0.03, xaxis=(1, 0, 0))
    # 泥滩上散着的芦苇束
    for k in range(10):
        x = rng.uniform(-5.0, 8.5)
        z = rng.uniform(HEAD_S + 1.0, HEAD_S + 8.0)
        if abs(x) < 1.7 and z < HEAD_S + 3.0:
            x += 2.6 * (1 if x >= 0 else -1)
        ang = rng.uniform(0, math.pi)
        d = Vector((math.cos(ang), 0, math.sin(ang)))
        ln = rng.uniform(0.7, 1.2)
        c = Vector((x, g(x, z) + 0.05, z))
        Beam("Crates", "Reed", c - d * ln / 2, c + d * ln / 2, 0.16, 0.08, xaxis=(0, 1, 0), skip=(3,))
        c2 = c + Vector((0.02, 0.05, 0.03))
        Beam("Crates", "Reed", c2 - d * ln * 0.4, c2 + d * ln * 0.45, 0.1, 0.05, xaxis=(0, 1, 0), skip=(3,))
    # 桥面上、绳栏脚下堆的芦苇（南截 / 北截 / 栈桥各几束）
    for (piece, z, side) in (("SouthSection", 29.6, -1), ("SouthSection", 20.4, 1), ("SouthSection", 17.0, -1),
                             ("NorthSection", -17.6, -1), ("NorthSection", -22.5, 1), ("NorthSection", -28.6, -1),
                             ("BankSouth", HEAD_S - 1.4, 1), ("BankNorth", -30.0, -1)):
        x = side * 1.15
        c = Vector((x, DeckTopAt(z) + 0.05, z))
        d = Vector((0.15 * side, 0, 1)).normalized()
        Beam(piece, "Reed", c - d * 0.55, c + d * 0.55, 0.22, 0.1, xaxis=(1, 0, 0), skip=(3,))
        Beam(piece, "Reed", c + Vector((0.05, 0.07, 0.1)) - d * 0.4, c + Vector((0.05, 0.07, 0.1)) + d * 0.45, 0.14, 0.07, xaxis=(1, 0, 0), skip=(3,))


CHARGES = []


def Pack(piece, x0, x1, y0, y1, z0, z1, straps=2, axis="z"):
    AxisBox(piece, "Charge", x0, x1, y0, y1, z0, z1)
    for k in range(straps):
        f = (k + 1) / (straps + 1)
        if axis == "z":
            zc = z0 + (z1 - z0) * f
            AxisBox(piece, "Cable", x0 - 0.012, x1 + 0.012, y0 - 0.012, y1 + 0.012, zc - 0.018, zc + 0.018)
        else:
            xc = x0 + (x1 - x0) * f
            AxisBox(piece, "Cable", xc - 0.018, xc + 0.018, y0 - 0.012, y1 + 0.012, z0 - 0.012, z1 + 0.012)


def Polyline(piece, points, size=0.018):
    for a, b in zip(points, points[1:]):
        Tube(piece, "Cable", a, b, size)


CHARGE_T = {CI: 0.0, CI - 1: 0.04, CI + 1: 0.04, CI - 2: 0.08, CI + 2: 0.08}
CHARGE_X = -1.55


def BuildCharges():
    cy0, cy1 = Y_GUN - 0.36, Y_GUN - 0.04                 # 药包吊在舷缘以下、船里侧
    for b in BLASTED:
        zc = BOAT_Z[b]
        # 药包吊在桥面西缘下面、船里侧（木箱药包 + 钢带），两根吊绳拴在纵梁上
        Pack("Charges", CHARGE_X - 0.25, CHARGE_X + 0.25, cy0, cy1, zc - 0.22, zc + 0.22, straps=2, axis="x")
        for dz in (-0.16, 0.16):
            Tube("Charges", "Cable", (CHARGE_X + 0.2, cy1, zc + dz), (-STRINGER_X + 0.05, STRINGER_TOP - 0.07, zc + dz), 0.02)
        CHARGES.append({"t": CHARGE_T[b], "x": CHARGE_X, "y": round((cy0 + cy1) / 2, 3), "z": zc, "radius": 12.0 if abs(b - CI) <= 1 else 8.0,
                        "main": abs(b - CI) <= 1, "groundY": WATER_TOP})
    CHARGES.sort(key=lambda c: (c["t"], -c["z"]))
    # 导爆索：从每个药包爬上桥面西缘（x −1.30），沿桥面往南拉到南栈头，一路翻下栈头接地面导线
    x = -1.30
    for b in BLASTED:
        zc = BOAT_Z[b]
        Polyline("CableBridge", [(CHARGE_X, cy1, zc), (CHARGE_X + 0.12, cy1 + 0.1, zc), (x - 0.06, DECK_TOP + 0.02, zc + 0.05), (x, DECK_TOP + 0.02, zc + 0.3)])
    zn, zs = BOAT_Z[BLASTED[-1]] + 0.3, BOAT_Z[BLASTED[0]] + 0.3
    zs_list = [zn, zs]
    z = zs + 4.0
    while z < HEAD_S - 1.0:
        zs_list.append(z)
        z += 4.0
    zs_list.append(HEAD_S - 0.3)
    for a, b in zip(zs_list, zs_list[1:]):
        # 走一条略带曲折的线，每段抬高一点点，压在板缝上
        Polyline("CableBridge", [(x + 0.04 * math.sin(a), DeckTopAt(a) + 0.02, a), (x + 0.04 * math.sin(b), DeckTopAt(b) + 0.02, b)])
    Polyline("CableBridge", [(x, DeckTopAt(zn) + 0.02, zn), (x, DECK_TOP + 0.02, zn - 0.6)])
    top = DeckTopAt(HEAD_S - 0.3)
    Polyline("CableBridge", [(x, top + 0.02, HEAD_S - 0.3), (x - 0.1, top + 0.01, HEAD_S),
                             (x - 0.22, TerrainAt(x - 0.22, HEAD_S + 0.3) + 0.05, HEAD_S + 0.3)])


def BuildGroundCable():
    ex, ez = TERRAIN["exploder"]["x"], TERRAIN["exploder"]["z"]
    g = TerrainAt
    # 导线从栈头出来，沿泥地往东南拉到起爆器（桥轴东侧），路上绕过药箱与线卷
    run = [(-1.55, HEAD_S + 0.5), (-1.0, HEAD_S + 1.9), (0.0, HEAD_S + 3.6), (1.0, HEAD_S + 5.2), (0.6, HEAD_S + 6.8),
           (1.6, HEAD_S + 8.4), (ex - 1.2, ez - 0.9), (ex + 0.05, ez - 0.35), (ex, ez)]
    pts = [(x, g(x, z) + 0.02, z) for (x, z) in run]
    Polyline("CableGround", pts, 0.02)
    # 线卷：药箱旁的泥地上一小卷（三圈八边形）
    cx, cz = 2.05, 33.1 + ZSH
    cy = g(cx, cz) + 0.03
    for ring, (radius, dy) in enumerate(((0.3, 0.0), (0.25, 0.032), (0.2, 0.064))):
        ring_pts = [(cx + radius * math.cos(a * math.pi / 4), cy + dy, cz + radius * math.sin(a * math.pi / 4)) for a in range(9)]
        Polyline("CableGround", ring_pts, 0.03)
    Polyline("CableGround", [(cx - 0.3, cy, cz), (cx - 0.55, cy - 0.01, cz - 0.4), (1.0, g(1.0, HEAD_S + 5.2) + 0.02, HEAD_S + 5.2)], 0.02)
    g_ex = g(ex, ez)
    AxisBox("Exploder", "Timber", ex - 0.17, ex + 0.17, g_ex - 0.02, g_ex + 0.22, ez - 0.13, ez + 0.13)
    AxisBox("Exploder", "Iron", ex - 0.178, ex + 0.178, g_ex + 0.2, g_ex + 0.235, ez - 0.138, ez + 0.138)
    AxisBox("Exploder", "Iron", ex + 0.1, ex + 0.13, g_ex + 0.235, g_ex + 0.26, ez + 0.05, ez + 0.08)
    AxisBox("ExploderHandle", "Iron", ex - 0.011, ex + 0.011, g_ex + 0.235, g_ex + 0.52, ez - 0.011, ez + 0.011)
    AxisBox("ExploderHandle", "Timber", ex - 0.16, ex + 0.16, g_ex + 0.5, g_ex + 0.54, ez - 0.02, ez + 0.02)
    return {"x": ex, "y": g_ex + 0.235, "z": ez, "handleTravel": 0.2}


N_SPLINTERS = 8


def BuildSplinters():
    rng = random.Random(5)
    for k in range(N_SPLINTERS):
        c = Vector((rng.uniform(-1.3, 1.3), DECK_TOP - 0.2, rng.uniform(-6.5, 6.5)))
        d = Vector((rng.uniform(-1, 1), rng.uniform(-0.4, 0.4), rng.uniform(-1, 1))).normalized()
        length = rng.uniform(0.32, 0.8)
        if k in (2, 5, 7):
            Beam("Splinter%d" % k, "Timber", c - d * length / 2, c + d * length / 2, rng.uniform(0.07, 0.11), rng.uniform(0.07, 0.11),
                 xaxis=tuple(d.orthogonal()))
        else:
            Beam("Splinter%d" % k, "Hull" if k % 3 == 1 else "Timber", c - d * length / 2, c + d * length / 2,
                 rng.uniform(0.06, 0.16), rng.uniform(0.02, 0.05), xaxis=tuple(d.orthogonal()))


# ---------------------------------------------------------------------------
# 坍塌
# ---------------------------------------------------------------------------
def GroundAt(x, z):
    """碎件能落脚的最高面：地形，加上不动的南栈 / 南截桥面（北截会摆，不算）。"""
    h = TerrainAt(x, z)
    if abs(x) <= DECK_HALF + 0.1 and BREAK_S <= z <= HEAD_S:
        h = max(h, DeckTopAt(z))
    if abs(x) <= DECK_HALF + 0.1 and HEAD_N <= z <= NORTH_STUB_Z:
        h = max(h, DECK_TOP)
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


def DominantMaterial(name):
    g = PIECES[name]
    counts = {}
    for m in g.mats:
        counts[m] = counts.get(m, 0) + 1
    return max(counts, key=counts.get)


def Floats(name):
    return not (name.startswith("Winch") or name.startswith("Anchor"))


FLOW = Vector((0.26, 0.0, 0.0))     # 水面缓漂（向下游 +x）


def SimulateDebris(name, pivot, v0, w0, start, rng):
    verts = PieceVerts(name, pivot)
    corners = Corners(verts)
    size = max((corners[7] - corners[0]).length, 0.05)
    thick = min(corners[7].x - corners[0].x, corners[7].y - corners[0].y, corners[7].z - corners[0].z)
    draft = max(0.05, min(0.32, 0.5 * thick))
    floats = Floats(name)
    pos, vel, w = pivot.copy(), Vector(v0), Vector(w0)
    q = Quaternion()
    t, dt = 0.0, 1.0 / 240.0
    frames, events = [], []
    asleep, contact, splashed, landed = False, 0.0, False, False
    settle = None
    bob_phase = rng.uniform(0, 6.28)
    wet_time = 0.0
    axes = [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))]
    ext = corners[7] - corners[0]
    short_axis = axes[min(range(3), key=lambda i: ext[i])]
    for f in range(FRAMES):
        target = f / FPS
        while t < target - 1e-9:
            t += dt
            if t < start:
                continue
            if asleep:
                if settle and settle[3] < 1.0:
                    progress = min(1.0, (t - settle[0]) / 0.4)
                    q = settle[1].slerp(settle[2], Smooth(progress))
                    world = [pos + q @ c for c in corners]
                    pos.y -= min(p.y - GroundAt(p.x, p.z) for p in world)
                    settle[3] = progress
                continue
            in_river = WATER_Z0 < pos.z < WATER_Z1
            launched = t > start + 0.3
            wet = InWater(pos) and launched
            g = 3.2 if wet else 9.81
            world = [pos + q @ c for c in corners]
            lowest = min(world, key=lambda p: p.y)
            floating = floats and in_river and launched and lowest.y < WATER_TOP and not DryAt(lowest.x, lowest.z)
            if floating:
                # 木件：浮力 ≈ 重力 × 入水深度 / 吃水，纵向强阻尼；水平随水缓漂；姿态慢慢扳平
                wet_time += dt
                sub = max(0.0, min(2.5, (WATER_TOP - lowest.y) / draft))
                vel.y += (-9.81 + 9.81 * sub) * dt
                vel.y *= math.exp(-3.4 * dt)
                vel.x += (FLOW.x - vel.x) * 0.9 * dt
                vel.z += (0.0 - vel.z) * 0.9 * dt
                vel.x *= math.exp(-1.3 * dt)
                vel.z *= math.exp(-1.3 * dt)
                w *= math.exp(-2.4 * dt)
                u = q @ short_axis
                up = Vector((0, 1 if u.y >= 0 else -1, 0))
                flat = (u.rotation_difference(up) @ q).normalized()
                if wet_time > 0.4:
                    q = q.slerp(flat, 1 - math.exp(-1.6 * dt))
            else:
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
            if not splashed and launched and vel.y < 0 and lowest.y < WATER_TOP and not DryAt(lowest.x, lowest.z):
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
                if vel.length < 0.55 and contact > 0.12 and not steep and not floating:
                    asleep = True
                    u = q @ short_axis
                    up = Vector((0, 1 if u.y >= 0 else -1, 0))
                    settle = [t, q.copy(), (u.rotation_difference(up) @ q).normalized(), 0.0]
            else:
                contact = 0.0
        p_out = pos.copy()
        if floats and wet_time > 0.6 and not asleep:
            p_out.y += 0.012 * math.sin(2 * math.pi * 0.55 * (f / FPS) + bob_phase) * min(1.0, (wet_time - 0.6))
        frames.append((p_out, q.copy()))
    return frames, events


def Rot(axis, a):
    return Matrix.Rotation(a, 4, axis)


def SinkMotion(i):
    """被冲击波掀翻倾、缆崩断、2–3 s 沉下大半的邻船（脚本关键帧）。"""
    zc = BOAT_Z[i]
    south = zc > 0                              # 南侧船：断口在北（−z），向 −z 边翘起
    # 按与中心船的序号差 k 取参数（−4、−3 南侧两条，+3、+4 北侧两条）
    spec = {-4: (0.31, -0.21, 0.10, 1.12, 0.38, 0.50), -3: (0.46, 0.16, -0.09, 1.42, 0.34, 0.90),
            3: (-0.47, -0.17, -0.12, 1.47, 0.36, 0.95), 4: (-0.30, 0.23, 0.09, 1.10, 0.32, 0.45)}[i - CI]
    roll_peak, pitch_f, yaw_f, drop_f, roll_frac, drift_z = spec
    start = {-4: 0.14, -3: 0.09, 3: 0.09, 4: 0.14}[i - CI]
    pivot = Vector((0.0, Y_GUN - 0.27, zc))
    frames = []
    for f in range(FRAMES):
        t = f / FPS
        tt = max(0.0, t - start)
        rise = Smooth(tt / 0.55)
        roll = roll_peak * rise * (1 - (1 - roll_frac) * Smooth((tt - 0.7) / 2.0))
        pitch = pitch_f * Smooth((tt - 0.5) / 2.3)
        yaw = yaw_f * Smooth((tt - 0.2) / 2.0)
        kick = 0.22 * math.sin(math.pi * min(1.0, tt / 0.55)) if tt < 0.55 else 0.0
        drop = -drop_f * Smooth((tt - 0.55) / 2.4)
        bob = 0.03 * math.sin(2.3 * max(0.0, tt - 2.9)) * math.exp(-0.9 * max(0.0, tt - 2.9)) if tt > 2.9 else 0.0
        dz = (drift_z if south else -drift_z) * Smooth(tt / 3.0) * 0.6
        dx = 0.55 * Smooth(tt / 3.5)
        q = (Rot("Y", yaw) @ Rot("Z", pitch) @ Rot("X", roll)).to_quaternion()
        frames.append((pivot + Vector((dx, kick + drop + bob, dz)), q))
    return pivot, frames


def NorthSwing():
    frames = []
    for f in range(FRAMES):
        t = f / FPS
        a = NORTH_SWING * Smooth((t - 0.15) / 5.2) + 0.006 * math.sin(3.1 * max(0.0, t - 0.1)) * math.exp(-1.2 * max(0.0, t - 0.1))
        bob = 0.05 * math.sin(2 * math.pi * 0.38 * t) * math.exp(-t / 2.4) * Smooth(t * 5)
        frames.append((NORTH_PIVOT + Vector((0, bob, 0)), Rot("Y", a).to_quaternion()))
    return frames


def Collapse():
    rng = random.Random(1938)
    tracks, events, pivots, solved = {}, [], {}, {}
    tracks["NorthSection"] = NorthSwing()
    pivots["NorthSection"] = NORTH_PIVOT.copy()
    solved["northSwingDeg"] = round(math.degrees(NORTH_SWING), 2)
    sink_final = {}
    for i in SINKING:
        pivot, frames = SinkMotion(i)
        name = "SinkBoat%d" % i
        tracks[name] = frames
        pivots[name] = pivot
        p, q = frames[-1]
        sink_final[i] = round(p.y - pivot.y, 2)
        # 翘起那一舷拍水：一条 water 事件；艏艉先没的那头再补一条
        tt = {-4: 0.5, -3: 0.42, 3: 0.42, 4: 0.5}[i - CI]
        edge = -1 if BOAT_Z[i] > 0 else 1
        events.append({"t": tt, "type": "water", "x": 0.0, "y": round(WATER_TOP, 2), "z": round(BOAT_Z[i] + edge * 0.6, 2),
                       "size": 7.3, "speed": 4.0, "piece": name, "material": "Hull"})
    solved["sinkDrop"] = {str(k): v for k, v in sink_final.items()}

    def Launch(name):
        # 起爆错开：药包 t = 0 / 0.04 / 0.08，碎件在自己那条船的药包响后 0.02 s 起飞
        if name.startswith("Boat") or name.startswith("Deck"):
            b = BoatNo(name)
            start = CHARGE_T[b] + 0.02
            if name.endswith("Stern"):                 # 东半（船尾）往下游（+x）飞
                return (rng.uniform(2.0, 5.0), rng.uniform(5.0, 10.0), rng.uniform(-2.8, 2.8)), rand_spin(3.0, 8.0), start
            if name.endswith("Bow"):                   # 西半（船头）往上游（−x）飞
                return (-rng.uniform(2.0, 5.0), rng.uniform(5.0, 10.0), rng.uniform(-2.8, 2.8)), rand_spin(3.0, 8.0), start
            if name.endswith("Keel"):
                return (rng.uniform(-1.2, 1.2), rng.uniform(4.5, 7.5), rng.uniform(-1.5, 1.5)), rand_spin(1.5, 4.0), start
            k = int(name.split("_")[1])
            zc = BOAT_Z[b]
            cuts = CLUSTER_CUTS[b]
            edges = [zc + 1.5] + cuts + [zc - 1.5]
            zmid = (edges[k] + edges[k + 1]) / 2 - zc
            return (rng.uniform(-4.0, 4.0), rng.uniform(8.0, 14.0), zmid * rng.uniform(1.6, 3.2) + rng.uniform(-1.0, 1.0)), \
                rand_spin(3.0, 8.0), start
        if name == "Winch%d" % CI:
            return (-rng.uniform(2.0, 4.0), rng.uniform(5.0, 8.0), rng.uniform(-1.5, 1.5)), rand_spin(2.0, 4.0), 0.02
        if name == "Anchor%d" % (CI - 1):
            return (-rng.uniform(1.0, 3.0), rng.uniform(5.0, 8.0), rng.uniform(-1.5, 1.5)), rand_spin(2.0, 5.0), 0.06
        if name.startswith("Splinter"):
            k = int(name[8:])
            if k in (3, 6):                # 往南岸飞：落在射位（z 40.7）北面十来米的浅水 / 陡岸
                d = Vector((rng.uniform(-0.3, -0.1), 0.78, 0.62)).normalized()
                speed = rng.uniform(16.8, 18.2)
            elif k == 1:
                d = Vector((rng.uniform(-0.2, 0.2), 0.75, -0.66)).normalized()
                speed = rng.uniform(15.0, 17.0)
            else:
                d = Vector((rng.uniform(-1, 1), rng.uniform(0.6, 1.6), rng.uniform(-1, 1))).normalized()
                speed = rng.uniform(10.0, 19.0)
            return tuple(d * speed), rand_spin(6.0, 14.0), 0.02 + 0.02 * (k % 3)
        raise ValueError(name)

    def rand_spin(lo, hi):
        d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
        return tuple(d * rng.uniform(lo, hi))

    for name in sorted(PIECES):
        if KindOf(name) != "debris" or name in tracks:
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
    # 事件只留 size ≥ 1.0 的大件，总数 ≤ 40
    events = [e for e in events if e["size"] >= 1.0]
    events.sort(key=lambda e: e["t"])
    while len(events) > 40:
        events.remove(min(events, key=lambda e: e["size"]))
    return tracks, events, pivots, solved


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
            bsdf.inputs["Metallic"].default_value = 0.4 if key == "Iron" else 0.0
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
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.30, 0.25, 0.17, 1)
    mesh.materials.append(m)
    obj = bpy.data.objects.new("ReviewTerrain", mesh)
    collection.objects.link(obj)
    # 只为审查渲染：高度场往外按边缘值平推 60 m，免得远机位（BlastSafe z 67）站在地形外面
    sv, sf = [], []
    x0, x1, z0, z1 = grid["x0"], grid["x1"], grid["z0"], grid["z1"]
    pad = 60.0
    for iz in range(len(h) - 1):
        for (xa, xb, ha, hb, sgn) in ((x1, x1 + pad, h[iz][-1], h[iz][-1], 1), (x0 - pad, x0, h[iz][0], h[iz][0], -1)):
            za, zb = z0 + iz * grid["step"], z0 + (iz + 1) * grid["step"]
            base = len(sv)
            sv += [(xa, ha, za), (xb, hb, za), (xb, hb, zb), (xa, ha, zb)]
            sf.append((base, base + 1, base + 2, base + 3))
    for (za, zb, row) in ((z1, z1 + pad, h[-1]), (z0 - pad, z0, h[0])):
        for ix in range(nx - 1):
            xa, xb = x0 + ix * grid["step"], x0 + (ix + 1) * grid["step"]
            base = len(sv)
            sv += [(xa, row[ix], za), (xb, row[ix + 1], za), (xb, row[ix + 1], zb), (xa, row[ix], zb)]
            sf.append((base, base + 1, base + 2, base + 3))
    skirt = bpy.data.meshes.new("ReviewSkirt")
    skirt.from_pydata(sv, [], sf)
    skirt.update()
    skirt.materials.append(m)
    collection.objects.link(bpy.data.objects.new("ReviewSkirt", skirt))
    w = bpy.data.meshes.new("ReviewWater")
    xw = TERRAIN["grid"]["x1"]
    w.from_pydata([(-xw, WATER_TOP, WATER_Z0), (xw, WATER_TOP, WATER_Z0), (xw, WATER_TOP, WATER_Z1),
                   (-xw, WATER_TOP, WATER_Z1)], [], [(0, 3, 2, 1)])
    wm = bpy.data.materials.new("ReviewWater")
    wm.use_nodes = True
    wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.20, 0.27, 0.29, 1)
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
    cover = TERRAIN["cover"]
    hs, bz0 = HEAD_S, BOAT_Z[0]
    views = {
        "Head": (Vector((-1.5, TerrainAt(-1.5, hs + 3) + 1.65, hs + 3)), Vector((0, -0.4, -22)), 30),
        "Cover": (Vector((cover["x"], TerrainAt(cover["x"], cover["z"]) + 1.6, cover["z"])), Vector((1.5, -0.2, -4)), 30),
        "BlastSafe": (Vector((safe["x"], TerrainAt(safe["x"], safe["z"]) + 1.65, safe["z"])), Vector((0, 0.5, 0)), 30),
        "Aerial": (Vector((22, 48, 58)), Vector((0, -1, 4)), 30),
        "Side": (Vector((-30, 4.5, 6)), Vector((0, -0.6, 0)), 30),
        "Close": (Vector((-6.5, 1.6, 20.5)), Vector((0, -0.6, 14)), 30),
        "Detail": (Vector((6.5, 1.4, 34.5)), Vector((2.0, -0.8, 30.5)), 35),
        "Bank": (Vector((-9.5, 2.4, hs + 6)), Vector((0.0, -0.6, hs + 2.5)), 30),
        "NorthBank": (Vector((-9.0, 2.2, -24.0)), Vector((0.0, -0.8, -33.0)), 30),
        "Sink": (Vector((-14, 3.0, 20)), Vector((0, -1.2, 9)), 35),
        "BreakS": (Vector((-6.5, 2.6, 3.0)), Vector((0, -0.8, 14.0)), 35),
        "BreakN": (Vector((-6.5, 2.6, -4.0)), Vector((0, -0.8, -14.5)), 35),
    }
    want_views = os.environ.get("PONTOON_BRIDGE_VIEWS")
    if want_views:
        views = {k: v for k, v in views.items() if k in want_views.split(",")}
    else:
        views = {k: v for k, v in views.items() if k in ("Head", "Cover", "BlastSafe", "Aerial")}
    default_frames = (0, 15, 45, 90, 180) if os.environ.get("PONTOON_BRIDGE_RENDER") != "final" else (0, 180)
    want_frames = os.environ.get("PONTOON_BRIDGE_FRAMES")
    frames = tuple(int(f) for f in want_frames.split(",")) if want_frames else default_frames
    shots = []
    for label, (eye, target, lens) in views.items():
        cam.lens = lens
        cobj.matrix_world = LookAt(eye, target)
        for frame in frames:
            scene.frame_set(frame)
            path = os.path.join(out, "PontoonBridge_%s_f%03d.png" % (label, frame))
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            shots.append(path)
    scene.frame_set(0)
    return shots


def Main(render=True):
    global PIECES, KIND, CHARGES, STAKES, CABLES, CLUSTER_CUTS
    PIECES, KIND, CHARGES, STAKES, CABLES, CLUSTER_CUTS = {}, {}, [], [], [], {}
    UV_RNG.seed(1938)
    PlanClusters()
    boat_info = []
    rng = random.Random(11)
    for i in range(N_BOATS):
        boat_info.append(BuildBoat(i, rng))
    BuildPlanks()
    BuildStringers()
    BuildRails()
    TrestlePiles()
    BankStakes()
    BuildMoorings()
    BuildCrates()
    BuildCharges()
    exploder = BuildGroundCable()
    BuildSplinters()
    tracks, events, pivots, solved = Collapse()
    sink_top = {}
    for i in SINKING:
        name = "SinkBoat%d" % i
        p, q = tracks[name][-1]
        vs = [p + q @ (Vector(v) - pivots[name]) for v in PIECES[name].verts]
        sink_top[str(i)] = {"highestY": round(max(v.y for v in vs), 3), "lowestY": round(min(v.y for v in vs), 3),
                            "deckMeanY": round(p.y + (DECK_TOP - pivots[name].y), 3)}
    solved["sinkFinal"] = sink_top
    # 只有 CHARGES 排序后与 charges[] 一致；这里不再动

    ClearScene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, FRAMES - 1
    mats = Materials()
    export = bpy.data.collections.new("PontoonBridgeExport")
    review = bpy.data.collections.new("PontoonBridgeReview")
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
    glb = os.path.join(MODEL_DIR, "Model_PontoonBridge.glb")
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
    layout = {
        "boatLength": BOAT_LEN, "boatBeam": BOAT_BEAM, "pitch": PITCH, "boats": boat_info,
        "blasted": BLASTED, "sinking": SINKING, "deckHalfWidth": DECK_HALF, "deckTopY": DECK_TOP,
        "heads": {"south": HEAD_S, "north": HEAD_N}, "southBreakZ": BREAK_S, "northBreakZ": BREAK_N,
        "northPivot": [round(c, 3) for c in NORTH_PIVOT], "northSwingDeg": round(math.degrees(NORTH_SWING), 2),
        "deckClusters": {str(b): CLUSTER_CUTS[b] for b in BLASTED}, "railX": RAIL_X, "postZs": [round(z, 2) for z in POST_ZS],
        "stakes": STAKES, "cables": CABLES, "crew": TERRAIN["crew"], "cover": TERRAIN["cover"], "blastSafe": TERRAIN["blastSafe"],
        "exploder": TERRAIN["exploder"],
    }
    data = {
        "note": "Generated by _blender/Script_BuildPontoonBridge.py; bridge-local metres (x east, y up, z south).",
        "origin": TERRAIN["origin"], "fps": FPS, "duration": DURATION, "frames": FRAMES,
        "terrainSha256": hashlib.sha256(TERRAIN_TEXT.replace("\r\n", "\n").encode("utf-8")).hexdigest(),
        "water": TERRAIN["water"], "deckTopY": DECK_TOP,
        "layout": layout, "solved": solved,
        "charges": CHARGES, "exploder": exploder,
        "pieces": pieces, "events": events,
        "triangles": sum(p["triangles"] for p in pieces),
    }
    with open(os.path.join(MODEL_DIR, "Data_PontoonBridge.json"), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    os.makedirs(SOURCE_DIR, exist_ok=True)
    mode = os.environ.get("PONTOON_BRIDGE_RENDER", "1")
    shots = RenderReview(review) if (render and mode != "0") else []
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE_DIR, "Model_PontoonBridge.blend"))
    animated = sum(1 for p in pieces if p["name"] in tracks)
    report = {"pieces": len(pieces), "animatedNodes": animated, "triangles": data["triangles"], "events": len(events),
              "solved": data["solved"], "glbBytes": os.path.getsize(glb), "shots": shots}
    print(json.dumps(report, ensure_ascii=False))
    return report


if __name__ == "__main__":
    Main(render=os.environ.get("PONTOON_BRIDGE_RENDER", "1") != "0")

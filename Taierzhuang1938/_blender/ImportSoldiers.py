# -*- coding: utf-8 -*-
"""把免费的带骨骼人物网格转成游戏用的 13 关节 TZM。

来源（均为可商用免费许可，见文件末尾 CREDITS）：
  · Quaternius Ultimate Animated Character Pack（CC0）
      BlueSoldier_Male  → SoldierNra（灰蓝军装、头盔并进布料桶，不当钢盔）
      Soldier_Male      → SoldierIja（橄榄军装 + 钢盔桶）
  · 骨架层级与 Script_Actor.mjs / BuildSoldiers.py 逐字对齐，姿态代码一行不改。
  · 游戏禁止 SkinnedMesh（SSAO overrideMaterial 没有 skinning），所以这里把
    网格按最近的骨头刚体拆开，动画仍走 Actor 逐帧写关节旋转。

用法：
  python Taierzhuang1938/_blender/ImportSoldiers.py
"""

from __future__ import annotations

import base64
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "_src", "Quaternius")
OUT = os.path.abspath(os.path.join(HERE, "..", "Model"))
TILE = 0.6  # 与 TzmCore TILE_METERS["cloth"] 一致


def Dimensions(height):
    H = height
    return {
        "height": H,
        "ankleY": 0.055 * H, "kneeY": 0.285 * H, "hipY": 0.520 * H, "waistY": 0.600 * H,
        "shoulderY": 0.820 * H, "neckY": 0.855 * H, "headCenterY": 0.930 * H,
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


def JointWorld(d):
    """Actor 静止姿势里每根关节的世界坐标。旋转全是 0，所以就是位移链。"""
    H = d["height"]
    hips = (0.0, d["hipY"], 0.0)
    chest = (0.0, d["waistY"], 0.0)
    neck = (0.0, d["neckY"], 0.0)
    shL = (-d["shoulderHalf"], d["shoulderY"] - 0.02 * H, 0.0)
    shR = (d["shoulderHalf"], d["shoulderY"] - 0.02 * H, 0.0)
    elL = (shL[0], shL[1] - d["upperArmLen"], 0.0)
    elR = (shR[0], shR[1] - d["upperArmLen"], 0.0)
    thL = (-d["hipHalf"], d["hipY"], 0.0)
    thR = (d["hipHalf"], d["hipY"], 0.0)
    knL = (thL[0], thL[1] - d["thighLen"], 0.0)
    knR = (thR[0], thR[1] - d["thighLen"], 0.0)
    anL = (knL[0], knL[1] - d["shinLen"], 0.0)
    anR = (knR[0], knR[1] - d["shinLen"], 0.0)
    return {
        "hips": hips, "chest": chest, "neck": neck,
        "shoulderL": shL, "shoulderR": shR, "elbowL": elL, "elbowR": elR,
        "thighL": thL, "thighR": thR, "kneeL": knL, "kneeR": knR,
        "ankleL": anL, "ankleR": anR,
    }


def Sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def Add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def Scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def Dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def Cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def Length(a):
    return math.sqrt(Dot(a, a))


def Normalize(a):
    n = Length(a)
    return a if n < 1e-9 else Scale(a, 1.0 / n)


def RotateY(p, yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    return (c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2])


def RotationBetween(from_dir, to_dir):
    """返回把 from_dir 转到 to_dir 的 3x3 行主序矩阵。"""
    a = Normalize(from_dir)
    b = Normalize(to_dir)
    v = Cross(a, b)
    c = Dot(a, b)
    if c > 0.9999:
        return ((1, 0, 0), (0, 1, 0), (0, 0, 1))
    if c < -0.9999:
        axis = Normalize(Cross(a, (1, 0, 0))) if abs(a[0]) < 0.9 else Normalize(Cross(a, (0, 1, 0)))
        # 180°：Rodrigues with c=-1
        x, y, z = axis
        return (
            (2 * x * x - 1, 2 * x * y, 2 * x * z),
            (2 * y * x, 2 * y * y - 1, 2 * y * z),
            (2 * z * x, 2 * z * y, 2 * z * z - 1),
        )
    vx, vy, vz = v
    skew = ((0, -vz, vy), (vz, 0, -vx), (-vy, vx, 0))
    k = 1.0 / (1.0 + c)
    # I + skew + skew^2 * k
    def Mul(m, n):
        return tuple(tuple(sum(m[i][k] * n[k][j] for k in range(3)) for j in range(3)) for i in range(3))
    skew2 = Mul(skew, skew)
    ident = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
    out = []
    for i in range(3):
        out.append(tuple(ident[i][j] + skew[i][j] + skew2[i][j] * k for j in range(3)))
    return tuple(out)


def ApplyMat(m, p):
    return (
        m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2],
        m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2],
        m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2],
    )


def DistPointSeg(p, a, b):
    ab = Sub(b, a)
    denom = Dot(ab, ab) or 1e-9
    t = max(0.0, min(1.0, Dot(Sub(p, a), ab) / denom))
    proj = Add(a, Scale(ab, t))
    return Length(Sub(p, proj))


def ParseObj(path):
    verts, norms, faces = [], [], []
    material = "uniform"
    with open(path, "r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line[0] == "#":
                continue
            if line.startswith("usemtl "):
                material = line.split(None, 1)[1].strip()
                continue
            bits = line.split()
            if bits[0] == "v":
                verts.append((float(bits[1]), float(bits[2]), float(bits[3])))
            elif bits[0] == "vn":
                norms.append((float(bits[1]), float(bits[2]), float(bits[3])))
            elif bits[0] == "f":
                corners = []
                for tok in bits[1:]:
                    parts = tok.split("/")
                    vi = int(parts[0]) - 1
                    ni = int(parts[2]) - 1 if len(parts) > 2 and parts[2] else -1
                    corners.append((vi, ni))
                if len(corners) < 3:
                    continue
                for i in range(1, len(corners) - 1):
                    faces.append((corners[0], corners[i], corners[i + 1], material))
    return verts, norms, faces


def BBox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def TransformMesh(verts, norms, yaw=0.0, scale=1.0, offset=(0, 0, 0)):
    out_v, out_n = [], []
    for p in verts:
        q = RotateY(Scale(p, scale), yaw)
        out_v.append(Add(q, offset))
    for n in norms:
        q = RotateY(Scale(n, 1.0), yaw)
        out_n.append(Normalize(q))
    return out_v, out_n


def FaceCentroidZ(verts, faces, material):
    acc, n = 0.0, 0
    for a, b, c, mat in faces:
        if mat != material:
            continue
        acc += (verts[a[0]][2] + verts[b[0]][2] + verts[c[0]][2]) / 3.0
        n += 1
    return acc / n if n else 0.0


def StraightenArms(verts, norms, d):
    """Quaternius 是 A-pose。Actor 静止姿势手臂沿 −Y。把两侧胳膊收到身侧。"""
    H = d["height"]
    shY = d["shoulderY"] - 0.02 * H
    for side, shX, key in ((-1, -d["shoulderHalf"], "L"), (1, d["shoulderHalf"], "R")):
        shoulder = (shX, shY, 0.0)
        arm = []
        for i, p in enumerate(verts):
            if p[1] < d["waistY"] - 0.04 * H:
                continue
            if side < 0 and p[0] > -0.08 * H:
                continue
            if side > 0 and p[0] < 0.08 * H:
                continue
            arm.append(i)
        if len(arm) < 8:
            continue
        centroid = Scale(tuple(sum(verts[i][a] for i in arm) / len(arm) for a in range(3)), 1.0)
        current = Sub(centroid, shoulder)
        if Length(current) < 0.04:
            continue
        matrix = RotationBetween(current, (0.0, -1.0, 0.0))
        for i in arm:
            rel = Sub(verts[i], shoulder)
            verts[i] = Add(shoulder, ApplyMat(matrix, rel))
            if i < len(norms):
                norms[i] = Normalize(ApplyMat(matrix, norms[i]))
    return verts, norms


def ClassifyJoint(p, mat, d):
    """按世界坐标把一个顶点派到 13 根骨头之一。头盔/脸强制走脖子。"""
    H = d["height"]
    x, y, z = p
    low = mat in ("Helmet", "Face")
    if low or y >= d["neckY"] - 0.02 * H:
        return "neck"
    if y <= d["ankleY"] + 0.04 * H:
        return "ankleL" if x < 0 else "ankleR"
    if y < d["hipY"] - 0.02 * H:
        left = x < 0
        if y > d["kneeY"] + 0.02 * H:
            return "thighL" if left else "thighR"
        return "kneeL" if left else "kneeR"
    # 上身：先看是不是胳膊（A-pose 拉直後 |x| 仍可能略宽）
    if y > d["waistY"] and abs(x) > d["chestHalf"] + 0.02 * H:
        left = x < 0
        shY = d["shoulderY"] - 0.02 * H
        if y > shY - d["upperArmLen"] * 0.55:
            return "shoulderL" if left else "shoulderR"
        return "elbowL" if left else "elbowR"
    if y >= d["waistY"] - 0.02 * H:
        return "chest"
    return "hips"


def MapMaterial(src, side):
    """能并进军装的零件一律并掉：24 人同屏时每多一个桶就是 +24 draw call。"""
    name = (src or "").strip()
    if name in ("Face",):
        return "skin"
    if side == "ija" and name == "Helmet":
        return "helmet"
    if name in ("Helmet", "Main", "DarkGreen", "Black", "Grey", "Skin",
                "Hat", "Shirt", "Pants", "Vest", "Belt", "Hair"):
        return "uniform"
    return "uniform"


def StarFan(radius, points, inner):
    """平面五角/十二芒，朝 −Z，绕序朝外。"""
    ring = []
    for i in range(points * 2):
        ang = math.pi * i / points - math.pi / 2
        r = radius if i % 2 == 0 else inner
        ring.append((math.cos(ang) * r, math.sin(ang) * r, 0.0))
    tris = []
    for i in range(len(ring)):
        a = ring[i]
        b = ring[(i + 1) % len(ring)]
        tris.append(((0.0, 0.0, 0.0), a, b))
    return tris


def DiscFan(radius, seg=12):
    tris = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        b = 2 * math.pi * (i + 1) / seg
        tris.append((
            (0.0, 0.0, 0.0),
            (math.cos(a) * radius, math.sin(a) * radius, 0.0),
            (math.cos(b) * radius, math.sin(b) * radius, 0.0),
        ))
    return tris


def PlaceOnHead(tris, d, z_push):
    """徽章贴在脸前。局部系是 neck 关节。"""
    hy = d["headCenterY"] - d["neckY"]
    out = []
    for a, b, c in tris:
        def P(p):
            return (p[0], p[1] + hy + 0.012 * d["height"], p[2] + z_push)
        out.append((P(a), P(b), P(c)))
    return out


def MakeUv(p, n):
    ax, ay, az = abs(n[0]), abs(n[1]), abs(n[2])
    if az >= ax and az >= ay:
        return (p[0] / TILE, p[1] / TILE)
    if ax >= ay:
        return (p[2] / TILE, p[1] / TILE)
    return (p[0] / TILE, p[2] / TILE)


def FaceNormal(a, b, c):
    return Normalize(Cross(Sub(b, a), Sub(c, a)))


def B64(fmt, values):
    if not values:
        return ""
    return base64.b64encode(struct.pack("<%d%s" % (len(values), fmt), *values)).decode("ascii")


def Quantize(positions, normals, uvs, indices):
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
    wide = count > 65535
    return {
        "count": count,
        "posMin": [round(v, 6) for v in pmin],
        "posScale": pscale,
        "uvMin": [round(v, 5) for v in umin],
        "uvScale": uscale,
        "pos": B64("H", qpos),
        "nrm": B64("b", qnrm),
        "uv": B64("H", quv),
        "idxBits": 32 if wide else 16,
        "idxCount": len(indices),
        "idx": B64("I" if wide else "H", indices),
        "material": None,
    }


def BuildMesh(tris):
    """tris: list of ((p,n,uv),(p,n,uv),(p,n,uv))."""
    lookup = {}
    positions, normals, uvs, indices = [], [], [], []
    for tri in tris:
        for p, n, uv in tri:
            key = (round(p[0], 5), round(p[1], 5), round(p[2], 5),
                   round(n[0], 4), round(n[1], 4), round(n[2], 4),
                   round(uv[0], 4), round(uv[1], 4))
            idx = lookup.get(key)
            if idx is None:
                idx = len(lookup)
                lookup[key] = idx
                positions.extend(p)
                normals.extend(n)
                uvs.extend(uv)
            indices.append(idx)
    return Quantize(positions, normals, uvs, indices)


def NodeTree(d):
    """返回 (nodes, name→index)。nodes 是 TZM 节点表的骨架，稍后填 meshes。"""
    H = d["height"]
    spec = [
        ("root", -1, (0, 0, 0), False),
        ("body", 0, (0, d["hipY"], 0), False),
        ("hips", 1, (0, 0, 0), True),
        ("chest", 2, (0, d["waistY"] - d["hipY"], 0), True),
        ("neck", 3, (0, d["neckY"] - d["waistY"], 0), True),
        ("shoulderL", 3, (-d["shoulderHalf"], d["shoulderY"] - d["waistY"] - 0.02 * H, 0), True),
        ("elbowL", 5, (0, -d["upperArmLen"], 0), True),
        ("shoulderR", 3, (d["shoulderHalf"], d["shoulderY"] - d["waistY"] - 0.02 * H, 0), True),
        ("elbowR", 7, (0, -d["upperArmLen"], 0), True),
        ("thighL", 2, (-d["hipHalf"], 0, 0), True),
        ("kneeL", 9, (0, -d["thighLen"], 0), True),
        ("ankleL", 10, (0, -d["shinLen"], 0), True),
        ("thighR", 2, (d["hipHalf"], 0, 0), True),
        ("kneeR", 12, (0, -d["thighLen"], 0), True),
        ("ankleR", 13, (0, -d["shinLen"], 0), True),
        ("eyes", 4, (0, d["headH"] * 0.05, -d["headD"] * 0.42), False),
        ("gripL", 6, (0, -d["forearmLen"] * 0.96, 0.010), False),
        ("gripR", 8, (0, -d["forearmLen"] * 0.96, 0.010), False),
        ("weaponMount", 3, (0.10, 0.12 * H, -0.08), False),
        ("slingBack", 3, (0, 0.04 * H, 0.10), False),
    ]
    nodes = []
    names = {}
    for name, parent, t, joint in spec:
        names[name] = len(nodes)
        entry = {"name": name, "parent": parent, "t": [round(v, 6) for v in t], "r": [0.0, 0.0, 0.0]}
        if joint:
            entry["joint"] = True
        nodes.append(entry)
    return nodes, names


def Convert(obj_path, name, side, height, notes):
    verts, norms, faces = ParseObj(obj_path)
    if not verts or not faces:
        raise RuntimeError("空 OBJ：%s" % obj_path)
    lo, hi = BBox(verts)
    span = hi[1] - lo[1]
    if span < 0.2:
        raise RuntimeError("身高不像人：%.3f m" % span)
    scale = height / span
    verts, norms = TransformMesh(verts, norms, yaw=0.0, scale=scale, offset=(0, -lo[1] * scale, 0))
    # 脸朝 +Z 的话转到 −Z（全场约定正面是 −Z）
    if FaceCentroidZ(verts, faces, "Face") > 0.02:
        verts, norms = TransformMesh(verts, norms, yaw=math.pi, scale=1.0, offset=(0, 0, 0))
    d = Dimensions(height)
    verts, norms = StraightenArms(verts, norms, d)
    world = JointWorld(d)

    buckets = {}  # (joint, material) -> list of tri (p,n,uv)*3
    for a, b, c, src_mat in faces:
        pa, pb, pc = verts[a[0]], verts[b[0]], verts[c[0]]
        centroid = Scale(Add(Add(pa, pb), pc), 1.0 / 3.0)
        joint = ClassifyJoint(centroid, src_mat, d)
        material = MapMaterial(src_mat, side)
        fn = FaceNormal(pa, pb, pc)
        origin = world[joint]
        tri = []
        for corner, nidx in (a, b, c):
            p = Sub(verts[corner], origin)
            n = norms[nidx] if 0 <= nidx < len(norms) else fn
            if Dot(n, n) < 1e-8:
                n = fn
            uv = MakeUv(verts[corner], n)
            tri.append((p, n, uv))
        buckets.setdefault((joint, material), []).append(tuple(tri))

    # 帽徽 / 五角星 / 领章：全场唯二的高饱和识别点，模型原件没有，必须补。
    if side == "nra":
        disc = PlaceOnHead(DiscFan(0.016, 14), d, -d["headD"] * 0.54)
        star = PlaceOnHead(StarFan(0.0112, 12, 0.0052), d, -d["headD"] * 0.55)
        origin = world["neck"]
        n = (0.0, 0.0, -1.0)
        for mat, src in (("accentA", disc), ("accentB", star)):
            for a, b, c in src:
                tri = tuple((Sub(p, origin), n, MakeUv(p, n)) for p in (a, b, c))
                buckets.setdefault(("neck", mat), []).append(tri)
    else:
        star = PlaceOnHead(StarFan(0.021, 5, 0.0092), d, -d["headD"] * 0.62)
        origin = world["neck"]
        n = (0.0, 0.0, -1.0)
        for a, b, c in star:
            tri = tuple((Sub(p, origin), n, MakeUv(p, n)) for p in (a, b, c))
            buckets.setdefault(("neck", "accentB"), []).append(tri)
        # 昭五式步兵红领章：胸口两侧两块小方（chest 局部系）
        chest_origin = world["chest"]
        cy = (d["neckY"] - 0.016 * d["height"]) - d["waistY"]
        cz = -d["chestDepth"] * 1.02
        n_chest = (0.0, 0.0, -1.0)
        for side_x in (-1, 1):
            cx = side_x * d["chestHalf"] * 0.58
            bl = (cx - 0.014, cy - 0.010, cz)
            tl = (cx - 0.014, cy + 0.010, cz)
            tr = (cx + 0.014, cy + 0.010, cz)
            br = (cx + 0.014, cy - 0.010, cz)
            for a, b, c in ((bl, tl, tr), (bl, tr, br)):
                wa, wb, wc = Add(a, chest_origin), Add(b, chest_origin), Add(c, chest_origin)
                tri = (
                    (a, n_chest, MakeUv(wa, n_chest)),
                    (b, n_chest, MakeUv(wb, n_chest)),
                    (c, n_chest, MakeUv(wc, n_chest)),
                )
                buckets.setdefault(("chest", "accentA"), []).append(tri)

    nodes, names = NodeTree(d)
    meshes = []
    total_tris = 0
    bmin = [1e9, 1e9, 1e9]
    bmax = [-1e9, -1e9, -1e9]
    for (joint, material), tris in sorted(buckets.items()):
        block = BuildMesh(tris)
        block["material"] = material
        mesh_id = len(meshes)
        meshes.append(block)
        total_tris += block["idxCount"] // 3
        node = nodes[names[joint]]
        node.setdefault("meshes", []).append(mesh_id)
        origin = world[joint]
        count = block["count"]
        # 用未量化的三角更新根空间包围盒
        for tri in tris:
            for p, _n, _uv in tri:
                w = Add(p, origin)
                for a in range(3):
                    bmin[a] = min(bmin[a], w[a])
                    bmax[a] = max(bmax[a], w[a])

    doc = {
        "format": "tzm",
        "version": 1,
        "name": name,
        "units": "meters",
        "axis": "Y-up, -Z forward",
        "generator": "Taierzhuang1938/_blender/ImportSoldiers.py",
        "notes": notes,
        "triangles": total_tris,
        "bounds": {
            "min": [round(v, 5) for v in bmin],
            "max": [round(v, 5) for v in bmax],
        },
        "nodes": nodes,
        "meshes": meshes,
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".tzm.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(doc, handle, ensure_ascii=False, separators=(",", ":"))
    joints = sum(1 for n in nodes if n.get("joint"))
    mounts = [n["name"] for n in nodes if not n.get("meshes")]
    materials = sorted({m["material"] for m in meshes})
    size = os.path.getsize(path)
    print("%-12s tris=%-5d blocks=%-3d nodes=%-3d joints=%-2d %6.1f KB  h=%.3f  mats=%s"
          % (name, total_tris, len(meshes), len(nodes), joints, size / 1024.0,
             bmax[1] - bmin[1], ",".join(materials)))
    return {
        "name": name, "category": "soldier", "file": name + ".tzm.json",
        "triangles": total_tris, "meshBlocks": len(meshes), "nodes": len(nodes),
        "joints": joints, "bytes": size, "materials": materials,
        "mounts": mounts, "bounds": doc["bounds"],
    }


def PatchIndex(entries):
    path = os.path.join(OUT, "Index.json")
    if os.path.exists(path):
        index = json.loads(open(path, encoding="utf-8").read())
    else:
        index = {"format": "tzm-index", "version": 1, "generator": "ImportSoldiers.py",
                 "budget": {"soldier": 3200, "weapon": 900, "prop": 400, "vehicle": 1600},
                 "models": []}
    index["budget"]["soldier"] = max(int(index.get("budget", {}).get("soldier", 0)), 3200)
    by_name = {m["name"]: m for m in index.get("models", [])}
    for entry in entries:
        by_name[entry["name"]] = entry
    # 保持原顺序，新的士兵仍排在最前
    order = []
    seen = set()
    for entry in entries:
        order.append(entry)
        seen.add(entry["name"])
    for model in index.get("models", []):
        if model["name"] not in seen:
            order.append(model)
    index["models"] = order
    index["generator"] = "Taierzhuang1938/_blender/ImportSoldiers.py + BuildAll.py"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, indent=1)
    print("Index.json 已写入 %s" % path)


CREDITS = """Quaternius Ultimate Animated Character Pack (Nov 2019), CC0 1.0.
https://quaternius.com/packs/ultimatedanimatedcharacter.html
https://opengameart.org/content/animated-characters-pack
BlueSoldier_Male → 中方；Soldier_Male → 日方。
网格刚体绑到游戏 13 关节，动画仍走 Script_Actor 的姿态机。
"""


JOBS = [
    ("SoldierNra", "nra", 1.66, os.path.join(SRC, "BlueSoldier_Male.obj"),
     "Quaternius BlueSoldier_Male（CC0）。国民革命军第 2 集团军步兵："
     "灰蓝土布军装、布料头盔（不当钢盔）、青天白日帽徽。"),
    ("SoldierIja", "ija", 1.62, os.path.join(SRC, "Soldier_Male.obj"),
     "Quaternius Soldier_Male（CC0）。濑谷支队步兵：橄榄军装 + 钢盔桶 + 步兵星。"
     "1938 年 3—4 月无屁帘。"),
]


def main():
    entries = []
    for name, side, height, obj_path, notes in JOBS:
        if not os.path.isfile(obj_path):
            raise SystemExit("找不到源模型 %s —— 先从 Quaternius 包解出 OBJ" % obj_path)
        entries.append(Convert(obj_path, name, side, height, notes))
    PatchIndex(entries)
    credits_path = os.path.join(OUT, "Data_MeshCredits.txt")
    with open(credits_path, "w", encoding="utf-8") as handle:
        handle.write(CREDITS)
    print("BUILD_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

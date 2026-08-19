# -*- coding: utf-8 -*-
"""GlbToTzm — 把混元3D / glTF 模型转成《血战台儿庄》的 .tzm.json。

核心约束（来自 Script_MeshLoad.mjs / TzmCore.py）：
  - 不写 SkinnedMesh；动画靠运行时逐帧改关节 rotation。
  - 节点层级 + 每节点量化网格 + 材质名。
  - 节点顺序必须父在前、子在后（topological）。

因此本脚本对静态网格会按身高比例生成一套与 SoldierNra 对齐的关节名；
如果 glb 自带 skin，则按权重把三角面拆成关节刚体块。所有顶点最终落到
所属关节的局部坐标系里，运行时旋转该关节即可带动对应几何。
"""

import base64
import json
import math
import os
import struct
import sys


# ---------------------------------------------------------------------------
# 小型向量 / 矩阵库（纯 Python，无 numpy）
# ---------------------------------------------------------------------------

def vec3(x=0.0, y=0.0, z=0.0):
    return [float(x), float(y), float(z)]


def vadd(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def vsub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def vmul(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return [a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]]


def vlen(a):
    return math.sqrt(vdot(a, a))


def vnorm(a):
    l = vlen(a) or 1.0
    return [a[0] / l, a[1] / l, a[2] / l]


def mat_identity():
    return [[1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]]


def mat_translation(t):
    return [[1, 0, 0, t[0]],
            [0, 1, 0, t[1]],
            [0, 0, 1, t[2]],
            [0, 0, 0, 1]]


def mat_scale(s):
    if isinstance(s, (int, float)):
        s = [s, s, s]
    return [[s[0], 0, 0, 0],
            [0, s[1], 0, 0],
            [0, 0, s[2], 0],
            [0, 0, 0, 1]]


def mat_rotation_quaternion(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w),     2 * (x * z + y * w),     0],
            [2 * (x * y + z * w),     1 - 2 * (x * x + z * z), 2 * (y * z - x * w),     0],
            [2 * (x * z - y * w),     2 * (y * z + x * w),     1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1]]


def mat_mul(a, b):
    out = [[0] * 4 for _ in range(4)]
    for i in range(4):
        for j in range(4):
            s = 0.0
            for k in range(4):
                s += a[i][k] * b[k][j]
            out[i][j] = s
    return out


def mat_transform(m, v):
    x = v[0]; y = v[1]; z = v[2]
    return [m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
            m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
            m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3]]


def mat_transform33(m, v):
    """用 3x3 矩阵乘 3 维向量（法线变换用，不带平移）。"""
    x, y, z = v
    return [m[0][0] * x + m[0][1] * y + m[0][2] * z,
            m[1][0] * x + m[1][1] * y + m[1][2] * z,
            m[2][0] * x + m[2][1] * y + m[2][2] * z]


def mat_normal(m):
    """返回 3x3 法线矩阵（逆转置左上 3x3，再归一化列）。"""
    a = m
    inv = mat_invert(a)
    t = [[inv[j][i] for j in range(3)] for i in range(3)]
    for i in range(3):
        col = [t[j][i] for j in range(3)]
        l = math.sqrt(sum(c * c for c in col)) or 1.0
        for j in range(3):
            t[j][i] = col[j] / l
    return t


def mat_invert(m):
    a = [row[:] for row in m]
    n = 4
    inv = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for i in range(n):
        pivot = a[i][i]
        if abs(pivot) < 1e-12:
            for k in range(i + 1, n):
                if abs(a[k][i]) > abs(pivot):
                    a[i], a[k] = a[k], a[i]
                    inv[i], inv[k] = inv[k], inv[i]
                    pivot = a[i][i]
                    break
            pivot = pivot or 1e-12
        for j in range(n):
            a[i][j] /= pivot
            inv[i][j] /= pivot
        for k in range(n):
            if k == i:
                continue
            factor = a[k][i]
            for j in range(n):
                a[k][j] -= factor * a[i][j]
                inv[k][j] -= factor * inv[i][j]
    return inv


def quat_to_euler_xyz(q):
    x, y, z, w = q
    sinr_cosp = 2 * (w * x + y * z)
    cosr_cosp = 1 - 2 * (x * x + y * y)
    rx = math.atan2(sinr_cosp, cosr_cosp)
    sinp = 2 * (w * y - z * x)
    if abs(sinp) >= 1:
        ry = math.copysign(math.pi / 2, sinp)
    else:
        ry = math.asin(sinp)
    siny_cosp = 2 * (w * z + x * y)
    cosy_cosp = 1 - 2 * (y * y + z * z)
    rz = math.atan2(siny_cosp, cosy_cosp)
    return [rx, ry, rz]


# ---------------------------------------------------------------------------
# glTF / GLB 解析
# ---------------------------------------------------------------------------

COMPONENT_SIZES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        raise ValueError("不是 GLB 文件")
    version, total_len = struct.unpack_from("<II", data, 4)
    offset = 12
    json_chunk = None
    bin_chunk = None
    while offset < total_len:
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        chunk_data = data[offset + 8: offset + 8 + chunk_len]
        if chunk_type == 0x4E4F534A:
            json_chunk = json.loads(chunk_data.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            bin_chunk = chunk_data
        offset += 8 + chunk_len
    if json_chunk is None:
        raise ValueError("GLB 缺少 JSON chunk")
    return json_chunk, bin_chunk


class GltfData:
    def __init__(self, doc, bin_data):
        self.doc = doc
        self.bin = bin_data
        self.buffers = self._load_buffers()

    def _load_buffers(self):
        buffers = []
        for b in self.doc.get("buffers", []):
            uri = b.get("uri", "")
            if uri.startswith("data:application/octet-stream;base64,"):
                buffers.append(base64.b64decode(uri.split(",", 1)[1]))
            elif not uri and self.bin is not None:
                buffers.append(self.bin)
            else:
                raise ValueError("暂不支持外部 buffer URI: %s" % uri)
        return buffers

    def _read_buffer_view(self, idx):
        bv = self.doc["bufferViews"][idx]
        buf = self.buffers[bv["buffer"]]
        off = bv.get("byteOffset", 0)
        length = bv["byteLength"]
        return buf[off: off + length], bv.get("byteStride", 0)

    def _read_accessor(self, idx):
        acc = self.doc["accessors"][idx]
        ctype = acc["componentType"]
        typ = acc["type"]
        count = acc["count"]
        bv_idx = acc.get("bufferView")
        normalized = acc.get("normalized", False)
        if bv_idx is None:
            return [0] * count * self._type_components(typ)
        raw, stride = self._read_buffer_view(bv_idx)
        acc_off = acc.get("byteOffset", 0)
        comp_size = COMPONENT_SIZES[ctype]
        comps = self._type_components(typ)
        item_size = comp_size * comps
        fmt = self._struct_fmt(ctype)
        out = []
        for i in range(count):
            base = acc_off + i * (stride or item_size)
            vals = struct.unpack_from("<" + fmt * comps, raw, base)
            if normalized:
                if ctype in (5120, 5122):  # signed
                    vals = tuple(v / 127.0 for v in vals)
                else:
                    vals = tuple(v / 255.0 for v in vals)
            if comps == 1:
                out.append(vals[0])
            else:
                out.append(list(vals))
        return out

    @staticmethod
    def _type_components(typ):
        return {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[typ]

    @staticmethod
    def _struct_fmt(ctype):
        return {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[ctype]


# ---------------------------------------------------------------------------
# 节点世界变换
# ---------------------------------------------------------------------------

def node_local_matrix(node):
    if "matrix" in node:
        m = node["matrix"]
        return [m[i * 4: (i + 1) * 4] for i in range(4)]
    t = node.get("translation", [0, 0, 0])
    r = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    m = mat_translation(t)
    if r != [0, 0, 0, 1]:
        m = mat_mul(m, mat_rotation_quaternion(r))
    if s != [1, 1, 1]:
        m = mat_mul(m, mat_scale(s))
    return m


def compute_world_matrices(nodes, scene=None):
    scenes = []
    if scene is None:
        scene = 0
    scenes = nodes[0].get("__doc", {}).get("scenes", []) if nodes else []
    # 重新从 doc 拿 scenes
    pass


def build_world_matrices(doc):
    nodes = doc.get("nodes", [])
    world = [None] * len(nodes)

    def walk(idx, parent_m):
        local = node_local_matrix(nodes[idx])
        w = mat_mul(parent_m, local)
        world[idx] = w
        for c in nodes[idx].get("children", []):
            walk(c, w)

    scene_idx = doc.get("scene", 0)
    scene = doc.get("scenes", [{}])[scene_idx]
    root = mat_identity()
    for nidx in scene.get("nodes", []):
        walk(nidx, root)
    return world


# ---------------------------------------------------------------------------
# 默认人形骨架（与 Script_Actor Dimensions 对齐）
# ---------------------------------------------------------------------------

def make_humanoid_skeleton(height, width=None, depth=None):
    """返回 (nodes, joints_mask)。nodes 元素为 dict：name, parent_index, t, joint, meshes。"""
    H = height
    W = width or H * 0.30
    # 直接复用 Script_Actor 里的关键高度
    ankleY = 0.055 * H
    kneeY = 0.285 * H
    hipY = 0.520 * H
    waistY = 0.600 * H
    shoulderY = 0.820 * H
    neckY = 0.855 * H
    headCenterY = 0.930 * H
    shoulderHalf = 0.113 * H
    hipHalf = 0.050 * H
    upperArmLen = 0.165 * H
    forearmLen = 0.155 * H
    thighLen = hipY - kneeY
    shinLen = kneeY - ankleY

    entries = [
        # name, parent, t, is_joint
        ("root", -1, [0, 0, 0], False),
        ("body", 0, [0, waistY, 0], False),
        ("hips", 1, [0, 0, 0], True),
        ("chest", 2, [0, shoulderY - waistY, 0], True),
        ("neck", 3, [0, neckY - shoulderY, 0], True),
        ("head", 4, [0, headCenterY - neckY, 0], False),
        ("eyes", 5, [0, 0, 0.05 * H], False),
        ("shoulderL", 3, [-shoulderHalf, 0, 0], True),
        ("elbowL", 7, [0, -upperArmLen, 0], True),
        ("handL", 8, [0, -forearmLen, 0], False),
        ("gripL", 8, [0, -forearmLen - 0.02 * H, 0.01 * H], False),
        ("shoulderR", 3, [shoulderHalf, 0, 0], True),
        ("elbowR", 11, [0, -upperArmLen, 0], True),
        ("handR", 12, [0, -forearmLen, 0], False),
        ("gripR", 12, [0, -forearmLen - 0.02 * H, 0.01 * H], False),
        ("weaponMount", 3, [0, 0, -0.05 * H], False),
        ("slingBack", 3, [0, 0, 0.05 * H], False),
        ("thighL", 2, [-hipHalf, 0, 0], True),
        ("calfL", 17, [0, -thighLen, 0], True),
        ("footL", 18, [0, -shinLen, 0], False),
        ("kneeL", 18, [0, -shinLen * 0.5, 0.02 * H], False),
        ("thighR", 2, [hipHalf, 0, 0], True),
        ("calfR", 21, [0, -thighLen, 0], True),
        ("footR", 22, [0, -shinLen, 0], False),
        ("kneeR", 22, [0, -shinLen * 0.5, 0.02 * H], False),
    ]
    return entries


# ---------------------------------------------------------------------------
# 网格提取与关节划分
# ---------------------------------------------------------------------------

def extract_mesh(gltf, mesh_idx):
    """返回 (positions, normals, uvs, joints, weights, indices) 列表，每项对应一个 primitive。"""
    mesh = gltf.doc["meshes"][mesh_idx]
    out = []
    for prim in mesh.get("primitives", []):
        attrs = prim["attributes"]
        pos = gltf._read_accessor(attrs["POSITION"])
        normals = gltf._read_accessor(attrs.get("NORMAL", -1)) if "NORMAL" in attrs else None
        uvs = gltf._read_accessor(attrs.get("TEXCOORD_0", -1)) if "TEXCOORD_0" in attrs else None
        joints = gltf._read_accessor(attrs.get("JOINTS_0", -1)) if "JOINTS_0" in attrs else None
        weights = gltf._read_accessor(attrs.get("WEIGHTS_0", -1)) if "WEIGHTS_0" in attrs else None
        indices = None
        if "indices" in prim:
            indices = gltf._read_accessor(prim["indices"])
        else:
            indices = list(range(len(pos)))
        # 补齐 normals / uvs
        if normals is None:
            normals = [[0, 1, 0] for _ in pos]
        if uvs is None:
            uvs = [[0, 0] for _ in pos]
        out.append((pos, normals, uvs, joints, weights, indices))
    return out


def nearest_joint(world_positions, skeleton_worlds):
    """为每个顶点返回最近关节的索引（在 skeleton_worlds 中的顺序）。"""
    assigns = [0] * len(world_positions)
    for i, p in enumerate(world_positions):
        best = 0
        bestd = 1e9
        for j, jw in enumerate(skeleton_worlds):
            jp = [jw[0][3], jw[1][3], jw[2][3]]
            d = (p[0] - jp[0]) ** 2 + (p[1] - jp[1]) ** 2 + (p[2] - jp[2]) ** 2
            if d < bestd:
                bestd = d
                best = j
        assigns[i] = best
    return assigns


def skin_assign(joints, weights):
    """为每个顶点返回权重最大关节在 skin joint 列表中的局部索引。"""
    out = []
    for jw, ww in zip(joints, weights):
        best = max(range(len(ww)), key=lambda k: ww[k])
        out.append(jw[best])
    return out


# ---------------------------------------------------------------------------
# 量化 / TZM 导出
# ---------------------------------------------------------------------------

def decimate_mesh(positions, normals, uvs, indices, target_tris):
    """顶点聚类减面。positions/normals/uvs 是点列表，indices 是三角索引平面列表。"""
    if target_tris <= 0 or len(indices) // 3 <= target_tris:
        return positions, normals, uvs, indices
    bmin = [min(p[i] for p in positions) for i in range(3)]
    bmax = [max(p[i] for p in positions) for i in range(3)]
    span = max(bmax[i] - bmin[i] for i in range(3))
    if span <= 0:
        return positions, normals, uvs, indices
    cell = span / math.sqrt(target_tris)
    for _ in range(24):
        remap = {}
        new_pos = []
        new_nrm = []
        new_uv = []
        inv = 1.0 / cell
        for vi, (p, n, u) in enumerate(zip(positions, normals, uvs)):
            key = (int(math.floor(p[0] * inv)),
                   int(math.floor(p[1] * inv)),
                   int(math.floor(p[2] * inv)))
            if key not in remap:
                remap[key] = len(new_pos)
                new_pos.append([p[0], p[1], p[2]])
                new_nrm.append([n[0], n[1], n[2]])
                new_uv.append([u[0], u[1]])
        new_idx = []
        seen = set()
        for i in range(0, len(indices), 3):
            a = remap.get((int(math.floor(positions[indices[i]][0] * inv)),
                           int(math.floor(positions[indices[i]][1] * inv)),
                           int(math.floor(positions[indices[i]][2] * inv))))
            b = remap.get((int(math.floor(positions[indices[i + 1]][0] * inv)),
                           int(math.floor(positions[indices[i + 1]][1] * inv)),
                           int(math.floor(positions[indices[i + 1]][2] * inv))))
            c = remap.get((int(math.floor(positions[indices[i + 2]][0] * inv)),
                           int(math.floor(positions[indices[i + 2]][1] * inv)),
                           int(math.floor(positions[indices[i + 2]][2] * inv))))
            if a is None or b is None or c is None:
                continue
            if a == b or b == c or c == a:
                continue
            tri_key = tuple(sorted((a, b, c)))
            if tri_key in seen:
                continue
            seen.add(tri_key)
            new_idx.extend([a, b, c])
        positions, normals, uvs, indices = new_pos, new_nrm, new_uv, new_idx
        if len(indices) // 3 <= target_tris:
            break
        cell *= 1.3
    return positions, normals, uvs, indices


def quantize_mesh(positions, normals, uvs, indices, material="uniform"):
    if not positions:
        return None
    count = len(positions)
    pmin = [min(p[0] for p in positions), min(p[1] for p in positions), min(p[2] for p in positions)]
    pmax = [max(p[0] for p in positions), max(p[1] for p in positions), max(p[2] for p in positions)]
    pscale = [max(pmax[i] - pmin[i], 1e-6) / 65535.0 for i in range(3)]
    qpos = []
    for p in positions:
        for a in range(3):
            qpos.append(max(0, min(65535, int(round((p[a] - pmin[a]) / pscale[a])))))

    umin = [min(u[0] for u in uvs) if uvs else 0.0, min(u[1] for u in uvs) if uvs else 0.0]
    umax = [max(u[0] for u in uvs) if uvs else 1.0, max(u[1] for u in uvs) if uvs else 1.0]
    uscale = [max(umax[i] - umin[i], 1e-6) / 65535.0 for i in range(2)]
    quv = []
    for u in uvs:
        for a in range(2):
            quv.append(max(0, min(65535, int(round((u[a] - umin[a]) / uscale[a])))))

    qnrm = [max(-127, min(127, int(round(v * 127.0)))) for n in normals for v in n]

    wide = count > 65535
    idx_fmt = "I" if wide else "H"
    return {
        "count": count,
        "posMin": [round(v, 6) for v in pmin],
        "posScale": pscale,
        "uvMin": [round(v, 5) for v in umin],
        "uvScale": uscale,
        "pos": base64.b64encode(struct.pack("<%dH" % len(qpos), *qpos)).decode("ascii"),
        "nrm": base64.b64encode(struct.pack("<%db" % len(qnrm), *qnrm)).decode("ascii"),
        "uv": base64.b64encode(struct.pack("<%dH" % len(quv), *quv)).decode("ascii"),
        "idxBits": 32 if wide else 16,
        "idxCount": len(indices),
        "idx": base64.b64encode(struct.pack("<%d%s" % (len(indices), idx_fmt), *indices)).decode("ascii"),
        "material": material,
    }


def material_for_joint(name):
    """按关节区域给出材质名（须落在游戏材质白名单内）。

    转换阶段无法可靠区分"步枪枪托是木/枪管是钢"，这里把整段武器挂点
    统一按 steel 处理；脸/手按 skin；脚按 shoe；其余按 uniform。
    这些值都已被游戏材质库识别（见 Script_MeshLoad 的 materials 传入约定）。
    """
    if name in ("gripL", "gripR", "weaponMount", "slingBack"):
        return "steel"
    if name in ("head", "handL", "handR"):
        return "skin"
    if name in ("footL", "footR"):
        return "shoe"
    return "uniform"


def convert(glb_path, out_path, options=None):
    options = options or {}
    doc, bin_data = read_glb(glb_path)
    gltf = GltfData(doc, bin_data)

    world_mats = build_world_matrices(doc)

    # 取首个场景的根节点，收集所有 mesh 节点
    scene_idx = doc.get("scene", 0)
    scene = doc.get("scenes", [{}])[scene_idx]
    root_nodes = scene.get("nodes", [])

    all_positions = []
    all_normals = []
    all_uvs = []
    all_tris = []  # 每项是 (v0,v1,v2, node_world_matrix)

    for nidx in root_nodes:
        node = doc["nodes"][nidx]
        if "mesh" not in node:
            continue
        nw = world_mats[nidx] or mat_identity()
        primitives = extract_mesh(gltf, node["mesh"])
        for pos, normals, uvs, joints, weights, indices in primitives:
            for p in pos:
                all_positions.append(mat_transform(nw, p))
            nmat = mat_normal(nw)
            for n in normals:
                all_normals.append(vnorm(mat_transform33(nmat, n)))
            all_uvs.extend(uvs)
            # 三角化
            for i in range(0, len(indices), 3):
                all_tris.append((indices[i], indices[i + 1], indices[i + 2], nw))

    if not all_positions:
        raise ValueError("GLB 中没有可读取的网格")

    # 包围盒
    bmin = [min(p[0] for p in all_positions), min(p[1] for p in all_positions), min(p[2] for p in all_positions)]
    bmax = [max(p[0] for p in all_positions), max(p[1] for p in all_positions), max(p[2] for p in all_positions)]
    height = bmax[1] - bmin[1]
    width = bmax[0] - bmin[0]
    depth = bmax[2] - bmin[2]

    # 默认把人形正面转向 -Z（glTF 常见 +Z 朝前，游戏是 -Z 朝前）
    if options.get("face_negative_z", True):
        flip_y = mat_rotation_quaternion([0, 1, 0, 0])  # Y 轴 180° 四元数 (x,y,z,w)
        for i in range(len(all_positions)):
            all_positions[i] = mat_transform(flip_y, all_positions[i])
        # 重新计算包围盒
        bmin = [min(p[0] for p in all_positions), min(p[1] for p in all_positions), min(p[2] for p in all_positions)]
        bmax = [max(p[0] for p in all_positions), max(p[1] for p in all_positions), max(p[2] for p in all_positions)]
        # 法线也翻转
        flip_n = mat_normal(flip_y)
        for i in range(len(all_normals)):
            all_normals[i] = vnorm(mat_transform33(flip_n, all_normals[i]))

    # 生成骨架
    skeleton = make_humanoid_skeleton(height, width, depth)
    skel_worlds = []
    for entry in skeleton:
        parent = entry["parent"] if isinstance(entry, dict) else entry[1]
        t = entry["t"] if isinstance(entry, dict) else entry[2]
        local = mat_translation(t)
        if parent < 0:
            w = local
        else:
            w = mat_mul(skel_worlds[parent], local)
        skel_worlds.append(w)

    # 顶点 -> 骨架关节 映射
    use_skin = False
    assign = [None] * len(all_positions)
    # 如果某个 primitive 有 skin，按 skin；否则按最近关节
    cursor = 0
    for nidx in root_nodes:
        node = doc["nodes"][nidx]
        if "mesh" not in node:
            continue
        nw = world_mats[nidx] or mat_identity()
        mesh_idx = node["mesh"]
        mesh = doc["meshes"][mesh_idx]
        for prim in mesh.get("primitives", []):
            attrs = prim["attributes"]
            pos = gltf._read_accessor(attrs["POSITION"])
            count = len(pos)
            prim_start = cursor
            cursor += count
            if "JOINTS_0" in attrs and "skin" in node:
                skin = doc["skins"][node["skin"]]
                skin_joints = skin["joints"]
                inv_mats = gltf._read_accessor(skin["inverseBindMatrices"]) if "inverseBindMatrices" in skin else None
                jw = gltf._read_accessor(attrs["JOINTS_0"])
                ww = gltf._read_accessor(attrs["WEIGHTS_0"])
                for v in range(count):
                    best = max(range(4), key=lambda k: ww[v][k])
                    joint_node_idx = skin_joints[jw[v][best]]
                    # 找到该 joint 在 skeleton 中的索引（我们生成的骨架没有 glb 关节，映射到最近骨架关节）
                    jw_world = world_mats[joint_node_idx]
                    jp = [jw_world[0][3], jw_world[1][3], jw_world[2][3]]
                    best_s = nearest_joint([mat_transform(nw, pos[v])], skel_worlds)[0]
                    assign[prim_start + v] = best_s
                use_skin = True
            else:
                prim_pos_world = [mat_transform(nw, pos[v]) for v in range(count)]
                part = nearest_joint(prim_pos_world, skel_worlds)
                for v in range(count):
                    assign[prim_start + v] = part[v]

    # 如果 model 方向已经翻转，重新为所有顶点分配最近关节
    assign = nearest_joint(all_positions, skel_worlds)

    # 按关节收集三角形（顶点去重到各关节局部系）。verts 与 tris 分开放，
    # 避免混合列表导致索引错位。
    joint_verts = [[] for _ in skeleton]
    joint_tris = [[] for _ in skeleton]
    joint_lookup = [{} for _ in skeleton]
    for (i0, i1, i2, _) in all_tris:
        j0 = assign[i0]
        j1 = assign[i1]
        j2 = assign[i2]
        # 三角面归属：取出现次数最多的关节，避免一个三角拆到三个关节
        js = (j0, j1, j2)
        best_j = max(set(js), key=js.count)
        verts = joint_verts[best_j]
        lookup = joint_lookup[best_j]
        inv_w = mat_invert(skel_worlds[best_j])
        nmat = mat_normal(inv_w)
        out_idx = []
        for src_i in (i0, i1, i2):
            key = (round(all_positions[src_i][0], 5),
                   round(all_positions[src_i][1], 5),
                   round(all_positions[src_i][2], 5),
                   round(all_normals[src_i][0], 3),
                   round(all_normals[src_i][1], 3),
                   round(all_normals[src_i][2], 3),
                   round(all_uvs[src_i][0], 4),
                   round(all_uvs[src_i][1], 4))
            if key not in lookup:
                lookup[key] = len(verts)
                lp = mat_transform(inv_w, all_positions[src_i])
                ln = vnorm(mat_transform33(nmat, all_normals[src_i]))
                verts.append((lp, ln, all_uvs[src_i]))
            out_idx.append(lookup[key])
        if out_idx[0] != out_idx[1] and out_idx[1] != out_idx[2] and out_idx[2] != out_idx[0]:
            joint_tris[best_j].append(out_idx)

    # 构造 TZM 节点与 mesh 块：先按原始三角数比例分配目标，再分别减面
    tz_nodes = []
    tz_meshes = []
    total_tris = 0
    bounds_min = [1e9, 1e9, 1e9]
    bounds_max = [-1e9, -1e9, -1e9]
    target_total = options.get("target_tris", 1800)

    # 先收集每个关节的原始 verts/tris
    joint_raw = []
    raw_counts = []
    for idx, entry in enumerate(skeleton):
        verts = joint_verts[idx]
        tris = joint_tris[idx]
        joint_raw.append((verts, tris))
        raw_counts.append(len(tris))
    total_raw = sum(raw_counts) or 1

    for idx, entry in enumerate(skeleton):
        name, parent, t, is_joint = entry
        entry_obj = {
            "name": name,
            "parent": parent,
            "t": [round(v, 6) for v in t],
            "r": [0.0, 0.0, 0.0],
        }
        if is_joint:
            entry_obj["joint"] = True
        verts, tris = joint_raw[idx]
        if verts and tris:
            positions = [vert[0] for vert in verts]
            normals = [vert[1] for vert in verts]
            uvs = [vert[2] for vert in verts]
            indices = [i for tri in tris for i in tri]
            share = len(tris) / total_raw
            target_joint = max(4, int(target_total * share))
            positions, normals, uvs, indices = decimate_mesh(positions, normals, uvs, indices, target_joint)
            block = quantize_mesh(positions, normals, uvs, indices, material=material_for_joint(name))
            if block:
                entry_obj["meshes"] = [len(tz_meshes)]
                tz_meshes.append(block)
                total_tris += len(indices) // 3
                # 更新包围盒（世界空间）
                for i in range(0, len(indices), 3):
                    for vi in indices[i:i + 3]:
                        p = mat_transform(skel_worlds[idx], positions[vi])
                        for a in range(3):
                            bounds_min[a] = min(bounds_min[a], p[a])
                            bounds_max[a] = max(bounds_max[a], p[a])
        tz_nodes.append(entry_obj)

    # 修正 body 节点位置：它已经在 waistY，hips 相对它为 0
    # root 在原点，包围盒脚底应当接近 y=0
    # 如果脚底不在 0 附近，整体下移
    dy = bounds_min[1]
    if abs(dy) > 0.02:
        for entry in tz_nodes:
            entry["t"][1] -= dy
        bounds_min[1] -= dy
        bounds_max[1] -= dy

    tzm = {
        "format": "tzm",
        "version": 1,
        "name": options.get("name", "GeneratedSoldier"),
        "units": "meters",
        "axis": "Y-up, -Z forward",
        "generator": "GlbToTzm / Script_GlbToTzm.py",
        "notes": options.get("notes", "从图生3D glb 转换，含人形关节层级，兼容逐关节旋转动画。"),
        "triangles": total_tris,
        "bounds": {"min": [round(v, 5) for v in bounds_min], "max": [round(v, 5) for v in bounds_max]},
        "nodes": tz_nodes,
        "meshes": tz_meshes,
    }

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tzm, f, ensure_ascii=False, separators=(",", ":"))
    return total_tris, len(tz_meshes), len(tz_nodes), os.path.getsize(out_path)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="glb -> tzm.json converter for Taierzhuang1938")
    parser.add_argument("glb", help="input .glb path")
    parser.add_argument("out", help="output .tzm.json path")
    parser.add_argument("--name", default="GeneratedSoldier", help="model name")
    parser.add_argument("--notes", default="", help="model notes")
    parser.add_argument("--face-negative-z", type=lambda s: s.lower() in ("1", "true", "yes"), default=True,
                        help="rotate 180 around Y so model faces -Z (default true)")
    parser.add_argument("--target-tris", type=int, default=1800,
                        help="target triangle budget for the output (default 1800)")
    args = parser.parse_args()
    opts = {"name": args.name, "notes": args.notes, "face_negative_z": args.face_negative_z, "target_tris": args.target_tris}
    tris, blocks, nodes, size = convert(args.glb, args.out, opts)
    print(f"OK triangles={tris} blocks={blocks} nodes={nodes} bytes={size}")


if __name__ == "__main__":
    main()

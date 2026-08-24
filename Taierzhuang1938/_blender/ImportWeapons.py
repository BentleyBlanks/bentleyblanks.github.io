# -*- coding: utf-8 -*-
"""把外部免费枪模（OBJ / glTF）收进武器规范系，再交给 WriteTzm。

坐标系与 BuildWeapons.py 一致：右手握把 = 原点、枪管沿 -Z、膛线轴 y = +0.035。
步枪还把枪托底板放到 z = +0.255；驳壳枪按原程序化模型，击锤后端约 z = +0.046。

外部模型保留几何与材质分区。运行时给 steel/wood 分区绑定 512px authored PBR；
源包自带的 2K/4K 图不直接进 Pages，避免每把枪重复背一套大图。
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from TzmCore import Box, Decimate, Join, Node, Transform

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "_import", "Source"))

BORE = 0.035
BUTT_Z = 0.255
PISTOL_REAR_Z = 0.046
T_STEEL = "gunSteel"
T_WOOD = "gunWood"
BUDGET = 6000


def _Src(name):
    return os.path.join(SRC, name)


# 每把枪对应一份可再分发的免费源。史实对应写在 Data_SourceLicenses.md。
#
# 外部模型的木/钢分区有三种喂法，按来源模型的结构选一种：
#   nameBucket —— 按**对象祖先节点名**分桶（Sketchfab 的 UModeler 拆件经常把
#                 All_Wood 整组挂在网格的父节点上，比材质名可靠）。
#   matName    —— 按**材质名**分桶（颜色写在 baseColorFactor 里的低模）。
#   colorSplit —— 按**面采样的漫反射颜色**分桶（整枪共用一张图、只有贴图里有木色）。
# 不带这三种的走 matIndex / 槽名启发式。所有源图的 2K/4K 贴图都不进 Pages，
# 运行时统一绑 steel/wood 两套 512px authored PBR（见 Data_SourceLicenses.md）。
SOURCES = {
    "ZhongZheng": {
        "file": os.path.join("Model_PolyHavenBoltActionRifle762",
                             "bolt_action_rifle_7_62_1k.gltf"),
        "lengthM": 1.110,
        "kind": "rifle",
        "colorSplit": True,
        "skip": ("bolt_action_rifle_7_62_scope", "bolt_action_rifle_7_62_wrap",
                 "bolt_action_rifle_7_62_bullet_54mm"),
        "note": "CC0 Bolt Action Rifle 7.62（Poly Haven）→ 中正式。去掉现代瞄准镜、"
                "包布与独立子弹，只保留木托、机匣、枪机、扳机和机械瞄具；"
                "全长按中正式史实 1.110 m 缩放。",
    },
    "HanYang": {
        "file": os.path.join("Model_Gewehr88", "scene.gltf"),
        "lengthM": 1.250,
        "kind": "rifle",
        "matName": {"Material": "wood", "Material.004": "steel", "Material.005": "steel",
                    "Material.006": "steel", "Material.007": "steel"},
        "noDetails": True,
        "mounts": {"muzzleZ": -1.003, "gripZ": -0.418, "sightZ": -0.160,
                   "magY": BORE - 0.050, "magZ": -0.040},
        "note": "CC-BY Gewehr 88（Sketchfab / TastyTony）→ 汉阳八八式。整长套筒、"
                "曼利夏漏夹弹仓与露出式通条是八八式自带的剪影，不再用 Kar98k 拉长加套筒。"
                "全长按史实 1.250 m。",
    },
    "Type38": {
        "file": os.path.join("Model_Type38Arisaka", "scene.gltf"),
        "lengthM": 1.276,
        "kind": "rifle",
        # UModeler 拆件：木器整组叫 All_Wood，钢件按 End_Barrel / Receiver2 /
        # Front_Barrel / Bolt_Part / Trigger / Type38_Magazine 等组名分散。
        # 背带条按木色桶走（皮革/帆布读作棕件，别读成蓝钢条）。
        "nameBucket": {"All_Wood": "wood", "Sling_Front": "wood",
                       "Sling_BackStock": "wood", "Sling2": "wood"},
        "mounts": {"muzzleZ": -1.029, "gripZ": -0.443, "sightZ": -0.185,
                   "magY": BORE - 0.036, "magZ": -0.060},
        # The first-person eye sits 140 mm behind the sight.  Keep the rear
        # receiver and stock as a separately named node so the viewmodel can
        # hide only that near-plane geometry while aiming; leaving it merged
        # into the steel/wood body turns its clipped cross-section into a
        # screen-filling rectangular block.
        "adsNearZ": -0.112,
        "note": "CC-BY Type 38 Arisaka rifle（Sketchfab / Snijboer）→ 三八式。"
                "防尘滑盖、直拉机柄、护翼准星、两道箍与通条齐备；全长按史实 1.276 m。",
    },
    # ZB-26 仍走程序化（BuildWeapons.BuildZb26）：Sketchfab 的 CC-BY 候选
    # （Larkien 17.4k 面 / TTadive 9.5k 面）在 Blender 5.1 的减面上都卡在
    # ~0.70 减不下去（全局 / 逐连通岛 / dissolve 三种路都试过），三角预算
    # 6000 是任务书性能红线，放行不了。详见 Data_SourceLicenses.md。
    "Mauser96": {
        "file": "Model_MauserC96.glb",
        "lengthM": 0.288,
        "kind": "pistol",
        "skip": ("Boom", "Reload", "Near"),
        "note": "CC0 Mauser C96（itch.io / Plewr）。Boom 是枪口焰网格，丢掉。",
    },
    "ServicePistol": {
        "file": os.path.join("Model_PolyHavenServicePistol", "service_pistol_1k.gltf"),
        "lengthM": 0.222,
        "kind": "pistol",
        # 页面里的上下两把其实是同一支枪的闭锁 / 空仓挂机状态。实战模型使用
        # pistol_a（套筒闭合），pistol_b 留作来源参考，不把一支开膛枪塞进枪套。
        "skip": ("service_pistol_pistol_b", "service_pistol_slide_b",
                 "service_pistol_hammer_b", "service_pistol_trigger_b",
                 "service_pistol_magazine_loaded", "service_pistol_magazine_empty",
                 "service_pistol_bullet"),
        "noDetails": True,
        "note": "CC0 Service Pistol（Poly Haven）。保留闭锁状态 A 的枪身、套筒、"
                "击锤与扳机，移除展示用弹匣、子弹及空仓挂机状态 B；全长 0.222 m。",
    },
}


def _ImportFile(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise ValueError("不支持的枪模格式：%s" % path)


def _GuessMaterial(slot_name, index, mat_index, mat_name=None, forced=None):
    """决定一个面/零件的桶。优先级：强制桶（按节点名）→ 材质名表 → 槽索引表
    → 名称启发式（wood/stock/grab/grip/handle）→ 默认 steel。"""
    if forced:
        return forced
    if mat_name and slot_name in mat_name:
        return mat_name[slot_name]
    if mat_index and index in mat_index:
        return mat_index[index]
    name = (slot_name or "").lower()
    if any(key in name for key in ("wood", "stock", "grab", "grip", "handle")):
        return "wood"
    return "steel"


def _ObjectBucket(obj, name_bucket):
    """按对象自身的名字链（含祖先）匹配 nameBucket 的键。

    Sketchfab 导出把 UModeler 的部件组名放在**父节点**上，网格对象本身通常叫
    defaultMaterial —— 只读 obj.name 会全部落空。反例是重建的 Blender 命名
    defaultMaterial.008，所以链上任何一层命中都算数。
    """
    if not name_bucket:
        return None
    chain = []
    node = obj
    while node is not None:
        chain.append(node.name)
        node = node.parent
    for key, bucket in name_bucket.items():
        if any(key in name for name in chain):
            return bucket
    return None


def _BaseColorImage(material):
    """取 Principled BSDF 的 Base Color 纹理图像（导入的 glTF 材质）。"""
    if material is None or not material.use_nodes:
        return None
    tree = material.node_tree
    if tree is None:
        return None
    principled = None
    for node in tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            principled = node
            break
    if principled is not None:
        link = principled.inputs.get("Base Color")
        for conn in (link.links if link else []):
            if conn.from_node.type == "TEX_IMAGE" and conn.from_node.image:
                return conn.from_node.image
    for node in tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            return node.image
    return None


def _SplitByColor(part, image):
    """把一份 bmesh 按漫反射采样色拆成 (steel, wood)。

    只用来喂"整枪只有一张贴图"的模型：木器在贴图里是棕的（r 明显大于 b），
    钢件是灰/蓝灰（r≈b）。采样的是 Blender 导入后的图像与 UV，双向一致，
    不需要额外翻转。tile 模式下 UV 会越界（>1 或 <0），取模到 [0,1)。
    """
    if image is None or image.size[0] < 1 or image.size[1] < 1:
        return part, None
    pixel_count = image.size[0] * image.size[1]
    pixels = image.pixels[:] or [0.0] * (pixel_count * 4)
    uv_layer = part.loops.layers.uv.active
    w, h = image.size
    steel = bmesh.new()
    wood = bmesh.new()
    steel_verts = {}
    wood_verts = {}

    def Target(bm, map_v, face):
        return (bm, map_v)

    for face in part.faces:
        if uv_layer is None:
            bucket = "steel"
        else:
            u = v = 0.0
            base = (0, 0)
            for loop in face.loops:
                u += loop[uv_layer].uv.x
                v += loop[uv_layer].uv.y
            u /= len(face.loops)
            v /= len(face.loops)
            x = min(w - 1, int((u % 1.0) * w))
            y = min(h - 1, int((v % 1.0) * h))
            idx = (y * w + x) * 4
            r, g, b = pixels[idx], pixels[idx + 1], pixels[idx + 2]
            # 木色：红通道明显高于蓝，且红>绿>蓝的整体趋势
            bucket = "wood" if (r - b) > 0.05 and (r - g) > 0.015 else "steel"
        bm, remap = Target(wood if bucket == "wood" else steel,
                           wood_verts if bucket == "wood" else steel_verts, face)
        verts = [remap.setdefault(v.index, bm.verts.new(v.co)) for v in face.verts]
        try:
            new_f = bm.faces.new(verts)
            new_f.smooth = face.smooth
        except ValueError:
            pass  # 重复面：丢
    part.free()
    if not wood.faces:
        wood.free()
        wood = None
    if not steel.faces:
        steel.free()
        steel = None
    return steel, wood


def _Collect(mat_index=None, skip=(), name_bucket=None, mat_name=None, color_split=False):
    """把场景里的网格按 steel/wood 收成两个 bmesh。跳过 skip 里的对象名。"""
    skip = {s.lower() for s in skip}
    buckets = {"steel": [], "wood": []}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        stem = obj.name.split(".")[0].lower()
        if obj.name.lower() in skip or stem in skip:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        raw = bmesh.new()
        raw.from_mesh(mesh)
        bmesh.ops.transform(raw, matrix=evaluated.matrix_world, verts=raw.verts[:])
        evaluated.to_mesh_clear()
        raw.faces.ensure_lookup_table()
        forced = _ObjectBucket(obj, name_bucket)
        if color_split:
            image = None
            if obj.material_slots and obj.material_slots[0].material:
                image = _BaseColorImage(obj.material_slots[0].material)
            steel_part, wood_part = _SplitByColor(raw, image)
            for bucket, part in (("steel", steel_part), ("wood", wood_part)):
                if part is not None and part.faces:
                    buckets[bucket].append(part)
            continue
        by_slot = {}
        for face in raw.faces:
            by_slot.setdefault(face.material_index, []).append(face)
        slots = obj.material_slots
        for slot_i, faces in by_slot.items():
            slot_name = ""
            if slot_i < len(slots) and slots[slot_i].material:
                slot_name = slots[slot_i].material.name
            material = _GuessMaterial(slot_name, slot_i, mat_index, mat_name, forced)
            part = raw.copy()
            drop = [f for f in part.faces if f.material_index != slot_i]
            bmesh.ops.delete(part, geom=drop, context="FACES")
            loose = [v for v in part.verts if not v.link_faces]
            if loose:
                bmesh.ops.delete(part, geom=loose, context="VERTS")
            if part.faces:
                buckets[material].append(part)
            else:
                part.free()
        raw.free()
    out = {}
    for material, parts in buckets.items():
        if not parts:
            continue
        joined = Join(*parts)
        # 导入模常有「枪管正好贴在机匣前脸」的共面缝，焊 1.5 mm 让审计当成一整块
        bmesh.ops.remove_doubles(joined, verts=joined.verts[:], dist=0.0015)
        joined.normal_update()
        out[material] = joined
    return out


def _Aabb(bms):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for bm in bms:
        for vert in bm.verts:
            lo.x, lo.y, lo.z = min(lo.x, vert.co.x), min(lo.y, vert.co.y), min(lo.z, vert.co.z)
            hi.x, hi.y, hi.z = max(hi.x, vert.co.x), max(hi.y, vert.co.y), max(hi.z, vert.co.z)
    return lo, hi


def _Xform(bms, matrix):
    for bm in bms:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        bm.normal_update()


def _AlignLongAxisToZ(bms, roll=1.0):
    lo, hi = _Aabb(bms)
    span = hi - lo
    axis = max(range(3), key=lambda i: span[i])
    if axis == 0:
        rot = Matrix.Rotation(-math.pi * 0.5, 4, "Y")
    elif axis == 1:
        rot = Matrix.Rotation(math.pi * 0.5, 4, "X")
    else:
        rot = Matrix.Identity(4)
    _Xform(bms, rot)
    # 长轴落位后，剩下两轴里跨度大的是「上下」。Sketchfab 的 Z-up 导出（没带
    # -90° 旋转包装）会把高度留在 X 上，枪就侧躺 —— 绕 Z 转 90° 放回 Y。
    # 方向由 roll（±1）控制，装进 SOURCES 便于按模型订正。
    lo, hi = _Aabb(bms)
    span = hi - lo
    if span[0] > span[1]:
        _Xform(bms, Matrix.Rotation(math.pi * 0.5 * roll, 4, "Z"))


def _FlipIfGripIsAbove(bms, wood, steel):
    """木握把 / 枪托腹应当在膛线轴下方。驳壳枪的扫帚柄尤其明显。"""
    if wood is None or steel is None or not wood.verts or not steel.verts:
        return
    wood_y = sum(v.co.y for v in wood.verts) / len(wood.verts)
    steel_y = sum(v.co.y for v in steel.verts) / len(steel.verts)
    if wood_y > steel_y:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Z"))


def _FlipIfStockIsForward(bms, wood):
    """木料重心应当靠近枪托（+Z）。驳壳枪的木握把也在后端。"""
    if wood is None or not wood.verts:
        return
    centroid = Vector((0.0, 0.0, 0.0))
    for vert in wood.verts:
        centroid += vert.co
    centroid /= len(wood.verts)
    if centroid.z < 0.0:
        _Xform(bms, Matrix.Rotation(math.pi, 4, "Y"))


def _Place(bms, steel, wood, length_m, kind):
    lo, hi = _Aabb(bms)
    current = hi.z - lo.z
    if current < 1e-4:
        raise RuntimeError("导入的枪模厚度为零")
    _Xform(bms, Matrix.Diagonal((length_m / current, length_m / current, length_m / current, 1.0)))
    lo, hi = _Aabb(bms)

    rear_z = BUTT_Z if kind == "rifle" else PISTOL_REAR_Z
    shift_z = rear_z - hi.z

    barrel_y = BORE
    if steel is not None and steel.verts:
        muzzle_cut = lo.z + (hi.z - lo.z) * 0.12
        ys = [v.co.y for v in steel.verts if v.co.z < muzzle_cut]
        if ys:
            barrel_y = sum(ys) / len(ys)
    shift_y = BORE - barrel_y
    shift_x = -0.5 * (lo.x + hi.x)
    _Xform(bms, Matrix.Translation((shift_x, shift_y, shift_z)))


def _SplitIslands(bm):
    """按顶点连通把一张 bmesh 拆成若干独立 bmesh（原 bm 不动）。

    有些来源模型是几百个小壳体叠出来的 —— 全局 DECIMATE 的 ratio 是「总面数
    比例」，单壳体反复碰撞误差后整体根本减不动（捷克式实测卡在 0.70 上限）。
    逐个壳体减面才能真的到比例。
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
    groups = {}
    for face in bm.faces:
        groups.setdefault(Find(face.verts[0].index), []).append(face)
    out = []
    for faces in groups.values():
        part = bm.copy()
        part.faces.index_update()
        keep = {f.index for f in faces}
        drop = [f for f in part.faces if f.index not in keep]
        bmesh.ops.delete(part, geom=drop, context="FACES")
        loose_v = [v for v in part.verts if not v.link_faces]
        if loose_v:
            bmesh.ops.delete(part, geom=loose_v, context="VERTS")
        loose_e = [e for e in part.edges if not e.link_faces]
        if loose_e:
            bmesh.ops.delete(part, geom=loose_e, context="EDGES")
        if part.faces:
            out.append(part)
    return out


def _DecimateToBudget(bms, budget=BUDGET):
    # OBJ 的面可能是四边，WriteTzm 会三角化；按 max(len(f.verts)-2, 1) 估三角数
    def Est(list_):
        return sum(sum(max(len(f.verts) - 2, 1) for f in bm.faces) for bm in list_)

    if Est(bms) <= budget:
        return None

    # 1) 按连通岛逐个减面。多壳体来源（Sketchfab 拆件模型 = 一两百个独立壳体）
    #    的全局 collapse 减到一半就停（捷克式实测卡在 0.70），因为壳与壳之间的
    #    互相穿插让 quadric 无处下手；**在干净的原始网格上**逐个壳体减才能到比例
    #    —— 顺序必须是先分岛、后全局，反过来（先全局后分岛）只会拿到被揉坏的网格。
    islands = []          # (bucketIndex, bmesh)
    for idx, bm in enumerate(bms):
        islands.extend((idx, part) for part in _SplitIslands(bm))
    movable = [(idx, part) for idx, part in islands if Est([part]) > 12]
    total = sum(Est([part]) for _, part in movable)
    if total > budget * 0.92:
        per_ratio = max(0.12, 0.85 * (budget * 0.92) / float(total))
        done = []
        for idx, part in islands:
            if Est([part]) <= 12:
                done.append((idx, part))
                continue
            reduced = Decimate(part, per_ratio)
            part.free()
            done.append((idx, reduced))
        buckets = {}
        for idx, part in done:
            buckets.setdefault(idx, []).append(part)
        merged = []
        for idx in sorted(buckets):
            merged.append(Join(*buckets[idx]))
        if Est(merged) <= budget:
            return merged
        # 分岛减面没达标也要**用这份结果**继续跑全局（不能 free 了再回头引用）
    else:
        merged = [bm for _, bm in islands]

    # 2) 兜底：全局 collapse 数轮（DECIMATE 的 ratio 按**面数**实现、预算按三角数，
    #    四边折算留 0.85 余量；减不动就收下这份结果，不硬压到塌质量）。
    replaced = list(merged)
    for _ in range(3):
        estimated = Est(replaced)
        if estimated <= budget:
            break
        ratio = max(0.12, 0.85 * (budget * 0.92) / float(estimated))
        prev_faces = sum(len(bm.faces) for bm in replaced)
        next_ = []
        for bm in replaced:
            decimated = Decimate(bm, ratio)
            bm.free()
            next_.append(decimated)
        unchanged = sum(len(bm.faces) for bm in next_) >= prev_faces
        replaced = next_
        if unchanged:
            break
    return replaced


def _BevelForFirstPerson(bms):
    """Give hard-surface imports a real highlight roll instead of razor edges."""
    for bm in bms:
        candidates = []
        for edge in bm.edges:
            if len(edge.link_faces) != 2:
                continue
            if edge.calc_face_angle(0.0) > math.radians(28.0):
                candidates.append(edge)
        if not candidates:
            continue
        try:
            bmesh.ops.bevel(bm, geom=candidates, offset=0.00075, segments=2, affect="EDGES")
            bm.normal_update()
        except Exception as error:
            print("[ImportWeapons] bevel skipped: %s" % error)


def _AddJacket(steel, length_m):
    """汉阳造的套筒：φ32 薄壁，从机匣插到枪口附近。"""
    from BuildWeapons import TubeAlongZ
    muzzle_z = -(length_m - BUTT_Z)
    jacket = TubeAlongZ(-0.100, muzzle_z + 0.055, 0.0162, 0.0158, segments=10)
    steel = Join(steel, jacket)
    bmesh.ops.remove_doubles(steel, verts=steel.verts[:], dist=1e-4)
    steel.normal_update()
    return steel


def _AddHistoricalDetails(name, steel, wood, length_m):
    """Layer the recognisable service features onto the license-safe base meshes.

    The donor Kar98k has the right Mauser family proportions but omits the small
    parts which make a close-up read as a Zhongzheng rather than a generic game
    rifle.  These additions are deliberately separate, slightly embedded meshes:
    they keep the source licence boundary clean while giving the first-person
    silhouette real bands, guides and hardware.
    """
    from BuildWeapons import TubeAlongZ

    muzzle_z = -(length_m - BUTT_Z)
    steel_parts = []

    def SteelBox(w, h, d, *, x=0.0, y=0.0, z=0.0, rz=0.0):
        part = Box(w, h, d, bevel=0.0012, segments=2)
        Transform(part, x=x, y=y, z=z, rz=rz)
        steel_parts.append(part)

    if name == "ZhongZheng":
        # Clip guide and the two wide barrel bands identify the Mauser-standard
        # Chinese rifle in close view; a thin cleaning rod completes the fore-end.
        SteelBox(0.028, 0.008, 0.050, y=BORE + 0.028, z=-0.046)
        for z in (-0.315, -0.585):
            steel_parts.append(TubeAlongZ(z + 0.007, z - 0.007, 0.0172, 0.0172,
                                          segments=12, y=BORE))
        steel_parts.append(TubeAlongZ(-0.250, muzzle_z + 0.085, 0.0018, 0.0018,
                                      segments=8, y=BORE - 0.022))

    elif name == "HanYang":
        # The Gewehr-88-pattern jacket gets stepped retaining collars.  The
        # exposed cleaning rod and clip-guide stop the long rifle reading as an
        # up-scaled Kar98k.
        SteelBox(0.028, 0.008, 0.050, y=BORE + 0.028, z=-0.046)
        for z in (-0.345, -0.720):
            steel_parts.append(TubeAlongZ(z + 0.008, z - 0.008, 0.0176, 0.0176,
                                          segments=12, y=BORE))
        steel_parts.append(TubeAlongZ(-0.250, muzzle_z + 0.095, 0.0018, 0.0018,
                                      segments=8, y=BORE - 0.022))

    elif name == "Mauser96":
        # C96: long right-side extractor, rear sight base and lanyard boss.  The
        # source model has the major silhouette; these small forms supply the
        # recognisable machined planes at first-person distance.
        SteelBox(0.006, 0.006, 0.072, x=0.014, y=BORE + 0.024, z=-0.090)
        SteelBox(0.022, 0.012, 0.020, y=BORE + 0.022, z=-0.042)
        SteelBox(0.012, 0.010, 0.012, y=-0.082, z=0.018)
        if wood is not None:
            panels = []
            for side in (-1.0, 1.0):
                panel = Box(0.0038, 0.056, 0.060, bevel=0.0010, segments=2)
                Transform(panel, x=side * 0.0185, y=-0.042, z=-0.010, rz=0.10)
                panels.append(panel)
            wood = Join(wood, *panels)

    if steel_parts:
        steel = Join(steel, *steel_parts)
        bmesh.ops.remove_doubles(steel, verts=steel.verts[:], dist=1e-4)
        steel.normal_update()
    if wood is not None:
        bmesh.ops.remove_doubles(wood, verts=wood.verts[:], dist=1e-4)
        wood.normal_update()
    return steel, wood


def _Mounts(node, length_m, kind, lo, hi, spec):
    """挂空节点。默认值沿用历史枪模的通用配方；spec["mounts"] 里的键可逐项覆盖
    （muzzleZ / gripZ / sightZ / magY / magZ），与程序化 BuildWeapons.Mounts 对齐。"""
    muzzle_z = lo.z - 0.006
    if kind == "rifle":
        defaults = {"muzzleZ": muzzle_z, "gripZ": muzzle_z * 0.58,
                    "sightZ": -0.165 * (length_m / 1.110),
                    "magY": BORE - 0.045, "magZ": -0.055}
    else:
        defaults = {"muzzleZ": muzzle_z, "gripZ": -0.055,
                    "sightZ": -0.078, "magY": BORE - 0.040, "magZ": -0.062}
    cfg = dict(defaults)
    cfg.update(spec.get("mounts") or {})
    node.Child("muzzle", t=(0.0, BORE, cfg["muzzleZ"]))
    node.Child("gripR", t=(0.0, 0.0, 0.0))
    node.Child("gripL", t=(0.0, -0.012, cfg["gripZ"]))
    node.Child("sight", t=(0.0, BORE + 0.020, cfg["sightZ"]))
    node.Child("magazine", t=(0.0, cfg["magY"], cfg["magZ"]))


def _SplitAdsNear(bm, cut_z):
    """Split faces behind ``cut_z`` into an ADS-only hide node.

    Imported rifles arrive as one bmesh per material.  At ADS the camera is
    intentionally aligned to the sight, so the rear receiver/stock straddles
    its near plane.  Keeping those faces in the normal body mesh produces a
    large clipped rectangle.  A face-level split retains the full asset for
    world/hip views and gives the first-person rig a precise hide target.
    """
    body = bm.copy()
    near = bm.copy()
    for part, want_near in ((body, False), (near, True)):
        drop = []
        for face in part.faces:
            center_z = sum(vertex.co.z for vertex in face.verts) / len(face.verts)
            is_near = center_z > cut_z
            if is_near != want_near:
                drop.append(face)
        if drop:
            bmesh.ops.delete(part, geom=drop, context="FACES")
        loose = [vertex for vertex in part.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(part, geom=loose, context="VERTS")
        part.normal_update()
    return body, near


def BuildImported(name):
    spec = SOURCES[name]
    path = _Src(spec["file"])
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _ImportFile(path)
    buckets = _Collect(spec.get("matIndex"), spec.get("skip", ()),
                       name_bucket=spec.get("nameBucket"),
                       mat_name=spec.get("matName"),
                       color_split=spec.get("colorSplit", False))
    if "steel" not in buckets:
        raise RuntimeError("%s 导入后没有钢件" % name)
    wood = buckets.get("wood")
    steel = buckets["steel"]
    bms = [bm for bm in (steel, wood) if bm is not None]
    _AlignLongAxisToZ(bms, spec.get("roll", 1.0))
    _FlipIfStockIsForward(bms, wood)
    _FlipIfGripIsAbove(bms, wood, steel)
    _Place(bms, steel, wood, spec["lengthM"], spec["kind"])
    if not spec.get("noBevel"):
        _BevelForFirstPerson(bms)
    if spec.get("jacket") and steel is not None:
        steel = _AddJacket(steel, spec["lengthM"])
        bms = [bm for bm in (steel, wood) if bm is not None]
    if not spec.get("noDetails"):
        steel, wood = _AddHistoricalDetails(name, steel, wood, spec["lengthM"])
    bms = [bm for bm in (steel, wood) if bm is not None]
    decimated = _DecimateToBudget(bms)
    if decimated is not None:
        steel = decimated[0]
        wood = decimated[1] if len(decimated) > 1 else None
        bms = [bm for bm in (steel, wood) if bm is not None]
    lo, hi = _Aabb(bms)
    root = Node("root")
    body = root.Child("body")
    cut_z = spec.get("adsNearZ")
    if cut_z is not None:
        steel, near_steel = _SplitAdsNear(steel, cut_z)
        if wood is not None:
            wood, near_wood = _SplitAdsNear(wood, cut_z)
        else:
            near_wood = None
        ads_near = root.Child("adsNear")
        if near_wood is not None and near_wood.faces:
            ads_near.Add("wood", near_wood, tile=T_WOOD)
        elif near_wood is not None:
            near_wood.free()
        if near_steel.faces:
            ads_near.Add("steel", near_steel, tile=T_STEEL)
        else:
            near_steel.free()
    if wood is not None:
        body.Add("wood", wood, tile=T_WOOD)
    body.Add("steel", steel, tile=T_STEEL)
    _Mounts(body, spec["lengthM"], spec["kind"], lo, hi, spec)
    return root


def BuilderFor(name):
    spec = SOURCES.get(name)
    if not spec:
        return None
    if not os.path.isfile(_Src(spec["file"])):
        return None

    def _Build():
        return BuildImported(name)
    _Build.__name__ = "BuildImported_%s" % name
    _Build.imported = True
    return _Build

# -*- coding: utf-8 -*-
"""Script_BuildBurntTimberPile.py —— 第一关远景烟柱脚下的「焦木堆」（Script_FirstLevelSmokeOrigins 的 timber / barrels 两种）。

旧版是 11 根同样粗细的方条 + 每四根一根纯自发光红，泛光一推整根是一条平红棒。
这里改成 3 个塌落木架变体（A/B 全堆，C 矮堆给油桶火堆用）：
  · wood   —— 烧焦梁木：六棱截面、两端劈裂参差、沿长度微弯、粗细有波动；UV 的 V 沿长度（贴图木纹竖向），1 m 一个循环
  · coals  —— 缩在木料缝里的几块炭核（只有它带弱自发光，其余木头不发光）
  · ash    —— 木堆底下一层薄灰烬盘

建模用 Blender Z 向上；导出时换成游戏轴（game = (x, z, -y)），写 Data_BurntTimberPile.mjs（整数量化，运行时同步读，
不需要异步加载 GLB —— Script_FirstLevelSmokeOrigins 的构造函数是同步的，并把几何按材质并进一个合批网格）。

在本任务的独立 Blender 里跑：
  node scripts/Script_BlenderMcp.mjs start --task BurntTimberPile
  node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_BuildBurntTimberPile.py
"""
import bpy, bmesh, math, random, json, os
from mathutils import Vector, Matrix, Euler

ROOT = r"C:\Users\Bentl\Documents\Program\bentleyblanks.github.io\.claude\worktrees\red-element-performance-a812b8\Taierzhuang1938"
OUT = os.path.join(ROOT, "Data_BurntTimberPile.mjs")
SRC = r"C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\BurntTimberPile_20260930"
os.makedirs(SRC, exist_ok=True)

SIDES = 6
PROFILE = [(math.cos(k / 6 * 6.28318 + .5236) * .62, math.sin(k / 6 * 6.28318 + .5236) * .62) for k in range(6)]  # 六棱（烧圆的梁）


def Clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            block.remove(item)


def Mat(name, color, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = .95
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 1.2
    return m


def LogMesh(bm, rng, length, w, h, splinter=1.0, nseg=2, bend=.05):
    """一根烧焦梁木：沿局部 X 轴，中心在原点。返回 bmesh 里新增的顶点/面。"""
    uv = bm.loops.layers.uv.verify()
    rings = []
    perim = 2 * (w + h) * 1.25
    bend_y, bend_z = (rng.random() - .5) * 2 * bend, (rng.random() - .5) * 2 * bend
    for i in range(nseg + 1):
        t = i / nseg
        x = -length / 2 + length * t
        ring = []
        end = i == 0 or i == nseg
        for k, (py, pz) in enumerate(PROFILE):
            s = 1 - (.05 if end else 0)               # 端部烧细
            wob = 1 + (rng.random() - .5) * .16       # 炭化不均
            y = py * w * s * wob + bend_y * math.sin(math.pi * t)
            z = pz * h * s * wob + bend_z * math.sin(math.pi * t)
            xx = x
            if end:                                   # 劈裂参差：端面沿长向乱伸缩
                xx += (rng.random() - .35) * .06 * length * splinter * (1 if i else -1)
            ring.append(bm.verts.new((xx, y, z)))
        rings.append(ring)
    for i in range(nseg):
        for k in range(SIDES):
            a, b = rings[i][k], rings[i][(k + 1) % SIDES]
            c, d = rings[i + 1][(k + 1) % SIDES], rings[i + 1][k]
            f = bm.faces.new((a, b, c, d))
            for loop, vert, kk in zip(f.loops, (a, b, c, d), (k, k + 1, k + 1, k)):
                loop[uv].uv = (kk / SIDES * perim, vert.co.x)
    # 端帽：一个凸出/凹进的中心点扇形，像劈断的茬口
    for i, sign in ((0, -1), (nseg, 1)):
        ring = rings[i]
        cx = ring[0].co.x + sign * (rng.random() * .035 * length * splinter + .01)
        c = bm.verts.new((cx, (rng.random() - .5) * w * .3, (rng.random() - .5) * h * .3))
        for k in range(SIDES):
            a, b = ring[k], ring[(k + 1) % SIDES]
            f = bm.faces.new((c, b, a) if sign < 0 else (c, a, b))
            for loop in f.loops:
                loop[uv].uv = (loop.vert.co.y, loop.vert.co.z)


def AddTransformed(bm_all, build, matrix):
    tmp = bmesh.new()
    build(tmp)
    bmesh.ops.transform(tmp, matrix=matrix, verts=tmp.verts)
    return tmp


def Place(bm_all, rng, length, w, h, pos, yaw, pitch=0., roll=0., splinter=1.):
    tmp = bmesh.new()
    LogMesh(tmp, rng, length, w, h, splinter)
    m = Matrix.Translation(pos) @ Euler((roll, pitch, yaw), "XYZ").to_matrix().to_4x4()
    bmesh.ops.transform(tmp, matrix=m, verts=tmp.verts)
    Merge(bm_all, tmp)


def Merge(bm_all, tmp):
    uv_all = bm_all.loops.layers.uv.verify()
    uv_tmp = tmp.loops.layers.uv.verify()
    remap = {}
    for v in tmp.verts:
        remap[v] = bm_all.verts.new(v.co)
    for f in tmp.faces:
        nf = bm_all.faces.new([remap[v] for v in f.verts])
        for l_new, l_old in zip(nf.loops, f.loops):
            l_new[uv_all].uv = l_old[uv_tmp].uv
    tmp.free()


def Pile(variant):
    """返回 {wood, coals, ash} 三个 bmesh，Z 向上，原点在木堆中心地面。"""
    rng = random.Random({"A": 11, "B": 47, "C": 93}[variant])
    wood, coals, ash = bmesh.new(), bmesh.new(), bmesh.new()
    R = rng.random
    def J(a): return (R() - .5) * 2 * a

    if variant in ("A", "B"):
        thick = lambda: .17 + R() * .07
        # 第 0 层：四根大致平行的底梁
        zs = [-.62, -.2, .2, .6]
        for zz in zs:
            t = thick(); L = 1.9 + R() * .7
            Place(wood, rng, L, t, t * (.9 + R() * .2), Vector((J(.25), zz + J(.06), t / 2 * .95)), J(.2))
        # 第 1 层：三根横跨（垂直方向），搭在底梁上
        for xx in (-.62, .05, .72):
            t = thick(); L = 1.5 + R() * .5
            Place(wood, rng, L, t, t, Vector((xx + J(.1), J(.12), .17 + t / 2 * .9)), math.pi / 2 + J(.22), J(.05))
        # 第 2 层：两根，其中一根滑塌斜靠
        t = thick()
        Place(wood, rng, 1.8, t, t, Vector((-.15, -.30, .44 + t / 2)), J(.15), J(.04))
        Place(wood, rng, 1.6, t * .95, t, Vector((.35, .34, .34 + .18)), .3 + J(.2), -.30, J(.15))
        # 一根斜靠的大梁：一头着地，一头搭上堆顶
        Place(wood, rng, 2.5, .21, .19, Vector((-1.15 if variant == "A" else 1.15, .0, .56)),
              (0 if variant == "A" else math.pi) + J(.35), math.radians(-32) if variant == "A" else math.radians(32), 0, 1.4)
        # 掉在堆外的两三截
        for a in (R() * 6.28, R() * 6.28, R() * 6.28):
            rr = 1.7 + R() * .5; L = .7 + R() * .8; t = .13 + R() * .05
            Place(wood, rng, L, t, t, Vector((math.cos(a) * rr, math.sin(a) * rr, t / 2)), R() * 6.28, J(.05), J(.3), 1.5)
        # 两块烧剩的薄木板
        for i in range(2):
            a = R() * 6.28; rr = .5 + R() * .7
            Place(wood, rng, .9 + R() * .5, .045, .26, Vector((math.cos(a) * rr, math.sin(a) * rr, .45 + R() * .3)),
                  R() * 6.28, J(.4), J(.6), 1.2)
        ncoal, ash_r = 5, 1.55
    else:
        # 矮堆：油桶火堆的木料，摊得开、不高
        for i in range(5):
            a = i / 5 * 6.28 + J(.3); rr = .55 + R() * .55; L = 1.2 + R() * .8; t = .15 + R() * .06
            Place(wood, rng, L, t, t, Vector((math.cos(a) * rr, math.sin(a) * rr, t / 2 + (.12 if i > 2 else 0))), a + math.pi / 2 + J(.6), J(.06), J(.15), 1.2)
        for i in range(2):
            a = R() * 6.28
            Place(wood, rng, 1.0, .05, .24, Vector((math.cos(a) * .3, math.sin(a) * .3, .3)), R() * 6.28, J(.4), J(.5), 1.2)
        ncoal, ash_r = 3, 1.3

    # 炭核：夹在木料底下缝里的几块，深红暗橙（只有它们带弱自发光）
    for i in range(ncoal):
        a = R() * 6.28; rr = R() ** .7 * (ash_r * .55)
        r0 = .09 + R() * .07
        bmesh.ops.create_icosphere(coals, subdivisions=1, radius=r0)
        verts = coals.verts[-12:]
        m = Matrix.Translation((math.cos(a) * rr, math.sin(a) * rr, r0 * .7)) @ Matrix.Diagonal((1.3 + R() * .5, 1.0 + R() * .3, .7, 1))
        bmesh.ops.transform(coals, matrix=m, verts=verts)

    # 灰烬盘：中间厚边缘薄，边缘不规则
    ring_n, ring_k = 16, 2
    uv = ash.loops.layers.uv.verify()
    center = ash.verts.new((0, 0, .06))
    rings = []
    for j in range(1, ring_k + 1):
        rr = ash_r * j / ring_k
        rings.append([ash.verts.new((math.cos(i / ring_n * 6.28318) * rr * (.82 + R() * .34),
                                     math.sin(i / ring_n * 6.28318) * rr * (.82 + R() * .34),
                                     .06 * (1 - j / ring_k) + .006)) for i in range(ring_n)])
    def Face(vs):
        f = ash.faces.new(vs)
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / 1.5, l.vert.co.y / 1.5)
    for i in range(ring_n):
        Face((center, rings[0][(i + 1) % ring_n], rings[0][i]))
        Face((rings[0][i], rings[0][(i + 1) % ring_n], rings[1][(i + 1) % ring_n], rings[1][i]))
    return {"wood": wood, "coals": coals, "ash": ash}


def ToObject(bm, name, mat, collection, offset=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = offset
    obj.data.materials.append(mat)
    collection.objects.link(obj)
    return obj


def Export(variants):
    """各变体各材质：顶点位置（游戏轴，毫米整数）、平滑法线（×127 整数）、UV（×1000 整数）、索引。"""
    out = {}
    stats = {}
    for name, objs in variants.items():
        out[name] = {}
        for key, obj in objs.items():
            mesh = obj.data
            mesh.calc_loop_triangles()
            # 法线：同位置顶点（UV 缝上重复的）取平均，别在 u 缝上出一条硬棱
            acc = {}
            for v in mesh.vertices:
                k = tuple(round(c * 1000) for c in v.co)
                acc.setdefault(k, Vector())
                acc[k] += v.normal
            pos, nor, uvs, idx, seen = [], [], [], [], {}
            planar = mesh.uv_layers.active is None      # 炭核没有 UV：按位置平铺
            uv_layer = None if planar else mesh.uv_layers.active.data
            for tri in mesh.loop_triangles:
                for loop_index, vert_index in zip(tri.loops, tri.vertices):
                    v = mesh.vertices[vert_index]
                    uv = (v.co.x + v.co.y * .37, v.co.z + v.co.y * .61) if planar else uv_layer[loop_index].uv
                    ck = (vert_index, round(uv[0] * 1000), round(uv[1] * 1000))
                    if ck not in seen:
                        seen[ck] = len(pos) // 3
                        n = acc[tuple(round(c * 1000) for c in v.co)].normalized()
                        gx, gy, gz = v.co.x, v.co.z, -v.co.y          # Blender Z-up → 游戏 Y-up
                        pos += [round(gx * 1000), round(gy * 1000), round(gz * 1000)]
                        nor += [round(n.x * 127), round(n.z * 127), round(-n.y * 127)]
                        uvs += [round(uv[0] * 1000), round(uv[1] * 1000)]
                    idx.append(seen[ck])
            # 绕序：Y 翻转（z→-y 是旋转，手性不变），无需翻面
            out[name][key] = {"p": pos, "n": nor, "uv": uvs, "i": idx}
            stats[f"{name}.{key}"] = len(idx) // 3
    return out, stats


def Main():
    Clear()
    coll = bpy.data.collections.new("BurntTimberPile")
    bpy.context.scene.collection.children.link(coll)
    mats = {"wood": Mat("Charred", (.06, .05, .045)), "coals": Mat("Coals", (.25, .05, .02), (.9, .22, .04)),
            "ash": Mat("Ash", (.10, .095, .09))}
    variants = {}
    for n, variant in enumerate("ABC"):
        parts = Pile(variant)
        objs = {}
        for key, bm in parts.items():
            objs[key] = ToObject(bm, f"Pile{variant}_{key}", mats[key], coll, (n * 6.0, 0, 0))
            bm.free()
        variants[variant] = objs
    # 预览用的地面和灯
    bpy.ops.mesh.primitive_plane_add(size=24, location=(6, 0, -.005))
    bpy.context.object.data.materials.append(Mat("Ground", (.33, .27, .2)))
    out, stats = Export(variants)
    header = ("// 焦木堆几何（自动生成，勿手改）：_blender/Script_BuildBurntTimberPile.py 建模 → 导出。\n"
              "// 游戏轴（Y 上）；p = 位置×1000 整数（毫米）、n = 法线×127 整数、uv = UV×1000 整数（1 m 一个贴图循环，V 沿木料长度）、i = 三角索引。\n"
              "// 变体 A/B 是全堆（第一关 26 处焦木火堆），C 是矮堆（18 处油桶火堆）。三个材质键：wood 焦木 / coals 炭核 / ash 灰烬盘。\n"
              "// 源工程：OneDrive/AI/Models/Blender/Taierzhuang1938/BurntTimberPile_20260930/Model_BurntTimberPile.blend\n")
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(header + "export const BURNT_TIMBER_PILE = Object.freeze(" + json.dumps(out, separators=(",", ":")) + ");\n")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SRC, "Model_BurntTimberPile.blend"))
    print(json.dumps({"tris": stats, "bytes": os.path.getsize(OUT)}, indent=1))


Main()

"""均匀密度展 UV：长件沿枪身横切 → smart_project（不拉满正方形）→ 每 8 cm 分段 → 轴对齐、凹形紧排。
被 Script_HanYang173RRebake.py import；单独跑时（HANYANG_UNWRAP_TEST=1）只在游戏网格上试展，报贴图利用率与像素/毫米。"""
import bpy, bmesh, math
from mathutils import Vector


def SplitLong(obj, step=0.08):
    """沿枪身（Blender Y）每 step 米切一段：各段 UV 平移开，原来跨段连着的岛就断开，交给 pack 重排。"""
    me = obj.data; mw = obj.matrix_world
    ys = [(mw @ v.co).y for v in me.vertices]; y0 = min(ys); n = int((max(ys) - y0) / step) + 1
    if n <= 1: return 1
    bm = bmesh.new(); bm.from_mesh(me); uvl = bm.loops.layers.uv.active
    for f in bm.faces:
        k = min(n - 1, int(((mw @ f.calc_center_median()).y - y0) / step))
        if k:
            for l in f.loops: l[uvl].uv += Vector((3.0 * k, 0))
    bm.to_mesh(me); bm.free(); return n


def Slice(obj, step=0.06, src=None):
    """沿枪身每 step 米横切一刀：减面后长零件的三角形从头跨到尾，不切开就没法分段排布。
    形状不变（切点在原边上）；切完从源网格重新传角法线（同 Script_HanYang173RGame 的做法）。"""
    me = obj.data; mw = obj.matrix_world; inv = mw.inverted()
    ys = [(mw @ v.co).y for v in me.vertices]; y0, y1 = min(ys), max(ys)
    if y1 - y0 <= 2 * step: return 0
    bm = bmesh.new(); bm.from_mesh(me); cuts = 0
    y = y0 + step
    while y < y1 - step * 0.3:
        co = inv @ Vector((0, y, 0)); no = (inv.to_3x3().transposed() @ Vector((0, 1, 0))).normalized()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
        y += step; cuts += 1
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    if src is not None:
        bpy.context.view_layer.objects.active = obj
        m = obj.modifiers.new('SourceCornerNormals', 'DATA_TRANSFER'); m.object = src; m.use_loop_data = True
        m.data_types_loops = {'CUSTOM_NORMAL'}; m.loop_mapping = 'POLYINTERP_NEAREST'
        bpy.ops.object.modifier_apply(modifier=m.name)
    return cuts


def Unwrap(obj, src=None, sliced=False):
    if not sliced: Slice(obj, src=src)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    pieces = SplitLong(obj)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, rotate_method='AXIS_ALIGNED', shape_method='CONCAVE', margin_method='FRACTION', margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    return pieces


def Measure(obj, res):
    me = obj.data; me.calc_loop_triangles(); uv = me.uv_layers.active.data; mw = obj.matrix_world
    a3 = 0.0; auv = 0.0
    for t in me.loop_triangles:
        p = [mw @ me.vertices[v].co for v in t.vertices]; u = [uv[l].uv for l in t.loops]
        a3 += (p[1] - p[0]).cross(p[2] - p[0]).length / 2
        auv += abs((u[1] - u[0]).cross(u[2] - u[0])) / 2
    return {"coverage": round(auv, 3), "pxPerMm": round(math.sqrt(auv / a3) * res / 1000, 2)}


if __name__ == "__main__" and __import__("os").environ.get("HANYANG_UNWRAP_TEST"):
    import os
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.environ["HANYANG_GAME_GLB"], merge_vertices=True)
    for spec in os.environ["HANYANG_REBAKE_PARTS"].split(","):
        name, res = spec.split(":"); obj = bpy.data.objects[name]
        for o in bpy.data.objects: o.select_set(False)
        obj.select_set(True)
        before = Measure(obj, int(res))
        pieces = Unwrap(obj)
        print("UNWRAP", name, res, "old", before, "new", Measure(obj, int(res)), "splitPieces", pieces, flush=True)

"""汉阳造 173R 重烘（2026-11-03）：给游戏 60k 网格的指定零件重新展密度均匀的 UV，
从作者源工程的原始节点材质 selected-to-active 烘到 60k 网格上。
Dots 原交付把 smart_project 的岛拉满正方形（scale_to_bounds=True），长零件沿长度拉长 9–11 倍；这里不拉。
环境变量：HANYANG_GAME_GLB（Script_HanYang173RGame.py 出的 60k GLB，不是已经重烘过的）、
HANYANG_REBAKE_OUT（输出目录）、HANYANG_REBAKE_PARTS（"名字:边长,名字:边长"）；
可选 HANYANG_REBAKE_SAMPLES / _EXTRUSION / _RAY。用法与零件清单见 Model/HanYang173R/Data_HanYang173R.md。
之后用 _import/Script_HanYang173RRebakeAssemble.py 拼回游戏 GLB。
"""
import bpy, os, sys, math, json, time
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import Script_HanYang173RRebakeUnwrap as unwrap

SRC = r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/DotsDelivery/HanYang_173R_Editable_Source/Source_173R_WristTailExterior_Author_WIP.blend"
GAME = os.environ["HANYANG_GAME_GLB"]
OUT = Path(os.environ["HANYANG_REBAKE_OUT"]); OUT.mkdir(parents=True, exist_ok=True)
PARTS = [(p.split(":")[0], int(p.split(":")[1])) for p in os.environ["HANYANG_REBAKE_PARTS"].split(",") if p]
SAMPLES = int(os.environ.get("HANYANG_REBAKE_SAMPLES", "4"))

bpy.ops.wm.open_mainfile(filepath=SRC, load_ui=False, use_scripts=False)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
sc.render.threads_mode = 'FIXED'; sc.render.threads = 8
bk = sc.render.bake
bk.use_selected_to_active = True; bk.use_cage = False
bk.cage_extrusion = float(os.environ.get("HANYANG_REBAKE_EXTRUSION", "0.0015")); bk.max_ray_distance = float(os.environ.get("HANYANG_REBAKE_RAY", "0.003"))
bk.use_clear = True; bk.target = 'IMAGE_TEXTURES'; bk.margin_type = 'EXTEND'
bk.normal_space = 'TANGENT'; bk.normal_r = 'POS_X'; bk.normal_g = 'POS_Y'; bk.normal_b = 'POS_Z'

names_before = {o.name for o in bpy.data.objects}
bpy.ops.import_scene.gltf(filepath=GAME, merge_vertices=True)
imported = {o.name: o for o in bpy.context.selected_objects if o.type == 'MESH'}
def GameObj(name):
    for n, o in imported.items():
        if n == name + ".001" or (n == name and n not in names_before): return o
    raise KeyError(name)

report = []
for name, res in PARTS:
    t0 = time.time()
    S = bpy.data.objects[name]; G = GameObj(name)
    for o in bpy.data.objects: o.select_set(False)
    # ---- 源：复制材质，记下 Principled / 输出的原连线（照原交付脚本的做法）
    saved = []
    for i, m in enumerate(list(S.data.materials)):
        q = m.copy(); S.data.materials[i] = q
        p = next(n for n in q.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        out = next(n for n in q.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
        saved.append((q, p, out, [(l.from_socket, l.to_socket) for l in out.inputs['Surface'].links]))
    # ---- 目标：60k 网格，新 UV（不拉满正方形）
    bpy.context.view_layer.objects.active = G; G.select_set(True)
    me = G.data
    while len(me.uv_layers): me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap"); uv.active_render = True; me.uv_layers.active = uv
    unwrap_info = {"slices": unwrap.Slice(G, src=S)}
    unwrap.Unwrap(G, src=None, sliced=True)
    unwrap_info.update(unwrap.Measure(G, res))
    tm = bpy.data.materials.new("REBAKE_" + name); tm.use_nodes = True
    tx = tm.node_tree.nodes.new('ShaderNodeTexImage'); tm.node_tree.nodes.active = tx
    me.materials.clear(); me.materials.append(tm)
    S.select_set(True); G.select_set(True); bpy.context.view_layer.objects.active = G
    bk.margin = 32 if res >= 4096 else 16
    files = {}
    for role in ['BaseColor', 'ORM', 'Normal']:
        im = bpy.data.images.new(f"RB_{name}_{role}", width=res, height=res, alpha=False, float_buffer=True)
        im.colorspace_settings.name = 'sRGB' if role == 'BaseColor' else 'Non-Color'
        tx.image = im
        for q, p, out, links in saved:
            tree = q.node_tree
            for l in list(out.inputs['Surface'].links): tree.links.remove(l)
            if role == 'Normal':
                for a, b in links: tree.links.new(a, b)
            else:
                em = tree.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1
                if role == 'BaseColor':
                    sock = p.inputs['Base Color']
                    if sock.is_linked: tree.links.new(sock.links[0].from_socket, em.inputs['Color'])
                    else: em.inputs['Color'].default_value = sock.default_value
                else:
                    comb = tree.nodes.new('ShaderNodeCombineColor'); comb.mode = 'RGB'; comb.inputs['Red'].default_value = 1
                    for dest, src in [('Green', 'Roughness'), ('Blue', 'Metallic')]:
                        sock = p.inputs[src]
                        if sock.is_linked: tree.links.new(sock.links[0].from_socket, comb.inputs[dest])
                        else: comb.inputs[dest].default_value = sock.default_value
                    tree.links.new(comb.outputs[0], em.inputs['Color'])
                tree.links.new(em.outputs[0], out.inputs['Surface'])
        bpy.ops.object.bake(type='NORMAL' if role == 'Normal' else 'EMIT')
        path = OUT / f"{name}_{role}.png"
        tmp = bpy.data.scenes.new('PBR_SAVE'); vs = tmp.view_settings
        vs.view_transform = 'Standard'; vs.look = 'None'; vs.exposure = 0; vs.gamma = 1
        ims = tmp.render.image_settings; ims.file_format = 'PNG'; ims.color_mode = 'RGB'; ims.color_depth = '16' if role == 'Normal' else '8'; ims.compression = 15
        im.save_render(str(path), scene=tmp); bpy.data.scenes.remove(tmp); bpy.data.images.remove(im)
        files[role] = str(path); print("REBAKE_MAP", name, role, round(time.time() - t0, 1), flush=True)
    # ---- 导出这一件的几何（只有新 UV），给 node 拼回游戏 GLB
    S.name = name + "__src"; G.name = name
    for o in bpy.data.objects: o.select_set(False)
    G.select_set(True); bpy.context.view_layer.objects.active = G
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{name}.glb"), export_format='GLB', use_selection=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=True, export_materials='NONE', export_extras=False, export_apply=False)
    report.append({"part": name, "res": res, "seconds": round(time.time() - t0, 1), "files": files, "unwrap": unwrap_info, "triangles": len(G.data.loop_triangles)})
    print("REBAKE_DONE", name, round(time.time() - t0, 1), flush=True)
(OUT / "Data_RebakeReport.json").write_text(json.dumps(report, indent=2))

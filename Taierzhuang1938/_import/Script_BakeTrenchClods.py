"""Reference 10 soil silhouettes. Run only through Script_BlenderMcp exec/runpy.

Six deterministic aggregate shapes follow the imagegen prototype sheet. Fine pores
and crumbs come from the Lovart earth PBR at runtime, not extra draw calls.
"""
import bpy, bmesh, math, random, json
from pathlib import Path

project = Path(__file__).resolve().parents[1]
source = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen')
expected = source / 'Scene_TrenchClods.blend'
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != expected.resolve():
    raise RuntimeError('Refusing another Blender project: ' + bpy.data.filepath)
source.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
material = bpy.data.materials.new('Material_TrenchLooseEarth')
material.diffuse_color = (.165, .122, .077, 1)
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .95
names = ['Aggregate', 'BrokenWedge', 'Flake', 'RootBound', 'CutShoulder', 'Cluster']
records = []
for kind, name in enumerate(names):
    rng = random.Random(101009 + kind * 23)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    # Broad nonuniform masses, local chipped margins and a buried underside.
    # Coordinates normalized to a one-metre horizontal radius, Z up in Blender.
    for vertex in bm.verts:
        p = vertex.co
        f = 1 + .16 * math.sin(p.x*7+p.y*5+kind) + .11 * math.cos(p.y*9-p.z*8)
        f += rng.uniform(-.10, .10)
        p *= f
        if kind == 1:
            p.z = min(p.z, .6 + p.x*.32)
            p.x += p.z*.20
        elif kind == 2:
            p.z = max(-.38, min(.48, p.z*.58))
            p.y *= .77
        elif kind == 3:
            p.z = min(p.z, .72 + .08*math.sin(p.x*10))
        elif kind == 4:
            p.y = max(p.y, -.40 + .14*p.z)
            p.z = min(p.z, .77)
        elif kind == 5:
            p.z += .19 * math.sin(p.x*4) * math.cos(p.y*5)
            p.x *= 1.12
        p.z = max(p.z, -.58)
    bm.normal_update()
    mesh = bpy.data.meshes.new('Mesh_Trench' + name)
    bm.to_mesh(mesh); bm.free(); mesh.update()
    obj = bpy.data.objects.new('Trench' + name + 'High', mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    decimate = obj.modifiers.new('Aggregate silhouette budget', 'DECIMATE')
    decimate.ratio = .5
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    mesh = obj.data
    # Keep the authored radius contract independent of subdivision count.
    radius=max(math.hypot(vertex.co.x,vertex.co.y) for vertex in mesh.vertices)
    for vertex in mesh.vertices:
        vertex.co.x *= 1.12/radius; vertex.co.y *= 1.12/radius
    # Silhouette carries the broken edges; smooth normals keep shallow embedded
    # faces from becoming black triangular facets when conformed to a slope.
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        for loopIndex in polygon.loop_indices:
            p = mesh.vertices[mesh.loops[loopIndex].vertex_index].co
            uv.data[loopIndex].uv = ((p.x+1.3)/2.6, (p.y+1.3)/2.6)
    obj['Prototype'] = 'Reference_TrenchClodKit.png / approved Reference_TrenchEarth_10.png'
    obj['RuntimeUnits'] = 'Normalized radius; deterministic placement scales to metres'
    obj.select_set(False)
    low = obj.copy(); low.data = obj.data.copy(); low.name = 'Trench' + name + 'Low'
    obj.data.name = 'Mesh_Trench' + name + 'High'; low.data.name = 'Mesh_Trench' + name + 'Low'
    bpy.context.collection.objects.link(low)
    bpy.context.view_layer.objects.active = low; low.select_set(True)
    decimate = low.modifiers.new('Small aggregate silhouette budget', 'DECIMATE'); decimate.ratio = .25
    bpy.ops.object.modifier_apply(modifier=decimate.name); low.select_set(False)
    for level in (obj, low):
        mesh = level.data
        records.append({'name':level.name, 'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),
            'gltfBounds':[[min(v.co.x for v in mesh.vertices),min(v.co.z for v in mesh.vertices),-max(v.co.y for v in mesh.vertices)],
                          [max(v.co.x for v in mesh.vertices),max(v.co.z for v in mesh.vertices),-min(v.co.y for v in mesh.vertices)]]})
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(project/'Model'/'Model_TrenchClods.glb'), export_format='GLB',
    use_selection=True, export_yup=True, export_materials='EXPORT', export_animations=False)
bpy.context.scene['SourceReference'] = 'Imagegen prototype six-piece kit; user-approved image 10, 2026-10-09'
bpy.ops.wm.save_as_mainfile(filepath=str(expected))
(source/'Data_TrenchClodBounds.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'source':str(expected),'models':records,'triangles':sum(r['triangles'] for r in records)}))

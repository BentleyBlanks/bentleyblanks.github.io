"""Reference 10 soil silhouettes. Run only through Script_BlenderMcp exec/runpy.

Six deterministic aggregate shapes follow the imagegen prototype sheet. Fine pores
and crumbs come from the Lovart earth PBR at runtime, not extra draw calls.
"""
import bpy, bmesh, math, random, json
from mathutils import Vector
from pathlib import Path

project = Path(__file__).resolve().parents[1]
source = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen/ClusterLowLod')
expected = source / 'Scene_TrenchClodClusterLowLod.blend'
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != expected.resolve():
    raise RuntimeError('Refusing another Blender project: ' + bpy.data.filepath)
source.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mesh in list(bpy.data.meshes):
    if not mesh.users:bpy.data.meshes.remove(mesh)
for datablocks in (bpy.data.cameras,bpy.data.lights):
    for block in list(datablocks):
        if not block.users:datablocks.remove(block)
for mat in list(bpy.data.materials):
    if not mat.users:bpy.data.materials.remove(mat)
material = bpy.data.materials.new('Material_TrenchLooseEarth')
material.diffuse_color = (.165, .122, .077, 1)
material.use_nodes = True
material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.165,.122,.077,1)
material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .95
names = ['Aggregate', 'BrokenWedge', 'Flake', 'RootBound', 'CutShoulder', 'Cluster']
records = []
for kind, name in enumerate(names):
    rng = random.Random(101009 + kind * 23)
    bm = bmesh.new()
    parts = {
        0:[((0,0,-.08),(.60,.59,.68)),((-.65,-.16,.04),(.48,.48,.53)),((.63,-.12,.13),(.49,.48,.52)),((-.08,.61,.02),(.49,.45,.52)),((.08,-.60,-.08),(.48,.43,.47))],
        1:[((-.12,0,-.02),(.94,.77,.88)),((.47,.31,-.03),(.60,.55,.61))],
        3:[((-.32,-.08,-.08),(.67,.63,.69)),((.54,-.19,.03),(.48,.54,.61)),((.09,.56,-.02),(.54,.44,.57))],
        5:[((-.53,-.37,-.04),(.52,.49,.59)),((.44,-.38,.03),(.56,.47,.60)),((-.38,.41,-.02),(.52,.52,.65)),((.52,.38,-.05),(.50,.47,.51)),((.03,.02,.03),(.55,.49,.67))],
    }.get(kind,[((0,0,0),(1,1,1))])
    for part,(offset,scale) in enumerate(parts):
        offset=tuple(v+rng.uniform(-.06,.06) for v in offset)
        scale=tuple(v*rng.uniform(.92,1.08) for v in scale)
        result=bmesh.ops.create_icosphere(bm,subdivisions=3,radius=1)
        for vertex in result['verts']:
            p=vertex.co
            for axis in range(3):p[axis]=math.copysign(abs(p[axis])**.94,p[axis])
            f=1+.08*math.sin(p.x*8.1+p.y*6.7+kind)+.05*math.cos(p.y*9.7-p.z*7.1+part)
            f+=rng.uniform(-.045,.045)
            for axis in range(3):p[axis]=p[axis]*f*scale[axis]+offset[axis]
    bm.normal_update()
    mesh=bpy.data.meshes.new('Mesh_Trench'+name)
    bm.to_mesh(mesh);bm.free();mesh.update()
    obj=bpy.data.objects.new('Trench'+name+'High',mesh)
    bpy.context.collection.objects.link(obj);mesh.materials.append(material)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    if len(parts)>1:
        remesh=obj.modifiers.new('Joined cohesive aggregates','REMESH')
        remesh.mode='VOXEL';remesh.voxel_size=.07;remesh.use_smooth_shade=True
        bpy.ops.object.modifier_apply(modifier=remesh.name)
    # Closed planar fractures, rather than a noisy sphere flattened at arbitrary
    # vertices. The sole remains solid when a chunk overhangs the trench crown.
    bm=bmesh.new();bm.from_mesh(obj.data)
    cutPlanes=[]
    def Cut(co,normal,outer):
        cutPlanes.append((Vector(co),Vector(normal)))
        result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=co,plane_no=normal,clear_outer=outer,clear_inner=not outer,dist=1e-6)
        edges=[element for element in result['geom_cut'] if isinstance(element,bmesh.types.BMEdge) and element.is_boundary]
        if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
    Cut((0,0,-.52),(0,0,1),False)
    if kind==0:Cut((0,0,.78),(-.15,.12,1),True)
    elif kind==1:Cut((0,0,.45),(-.42,.10,1),True)
    elif kind==2:
        Cut((0,0,.38),(0,0,1),True)
        for vertex in bm.verts:vertex.co.y*=.77
    elif kind==3:Cut((0,0,.63),(-.08,.06,1),True)
    elif kind==4:
        Cut((0,-.43,0),(0,1,-.12),False)
        Cut((0,0,.76),(0,0,1),True)
    elif kind==5:Cut((.85,0,0),(1,.18,-.12),True)
    # Fresh earth breaks are not perfectly machined planes. Add small coherent
    # relief at fracture rims while keeping the buried sole closed and level.
    for vertex in bm.verts:
        if abs(vertex.co.z+.52)<1e-5:continue
        original=vertex.co.copy()
        for co,normal in cutPlanes[1:]:
            normal=normal.normalized()
            if abs((original-co).dot(normal))<1e-5:
                ripple=.028*math.sin(original.x*6.3+original.y*8.1+kind)
                ripple+=.022*math.cos(original.y*10.7+original.z*7.7+kind)
                vertex.co+=normal*ripple
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
    decimate=obj.modifiers.new('Aggregate silhouette budget','DECIMATE')
    decimate.ratio=min(1,160/triangles)
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    mesh=obj.data
    top=max(vertex.co.z for vertex in mesh.vertices)
    targetTop=[1.10,.90,.48,.80,.78,1.05][kind]
    for vertex in mesh.vertices:vertex.co.z*=targetTop/top
    # Keep the authored radius contract independent of subdivision count.
    radius=max(math.hypot(vertex.co.x,vertex.co.y) for vertex in mesh.vertices)
    for vertex in mesh.vertices:
        vertex.co.x *= 1.12/radius; vertex.co.y *= 1.12/radius
    mesh.update()
    for polygon in mesh.polygons:polygon.use_smooth=True
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
    decimate = low.modifiers.new('Small aggregate silhouette budget', 'DECIMATE'); decimate.ratio = .35
    bpy.ops.object.modifier_apply(modifier=decimate.name); low.select_set(False)
    if kind==5:
        # Three solid crumbs follow the prototype cluster. Decimating the five-
        # lobe union to 56 faces left wide plates bridging its shallow valleys.
        # Spend the same 56 faces on two icosahedra and one eight-sided bipyramid.
        bm=bmesh.new();clusterRng=random.Random(117118)
        lobes=[((-.44,-.19,-.05),(.64,.56,.80)),
               ((.38,-.16,.04),(.60,.58,.68)),
               ((.01,.42,-.04),(.55,.49,.63))]
        for part,(offset,scale) in enumerate(lobes):
            if part<2:
                verts=bmesh.ops.create_icosphere(bm,subdivisions=1,radius=1)['verts']
            else:
                ring=[bm.verts.new((math.cos(i*math.tau/8),math.sin(i*math.tau/8),0)) for i in range(8)]
                bottom=bm.verts.new((0,0,-1));top=bm.verts.new((.08,-.06,1))
                for i in range(8):
                    bm.faces.new((bottom,ring[(i+1)%8],ring[i]))
                    bm.faces.new((ring[i],ring[(i+1)%8],top))
                verts=ring+[bottom,top]
            turn=clusterRng.uniform(-.5,.5)
            for vertex in verts:
                p=vertex.co;f=clusterRng.uniform(.91,1.09)
                x=p.x*math.cos(turn)-p.y*math.sin(turn)
                y=p.x*math.sin(turn)+p.y*math.cos(turn)
                p.x=x*f*scale[0]+offset[0];p.y=y*f*scale[1]+offset[1]
                p.z=p.z*f*scale[2]+offset[2]
        top=max(v.co.z for v in bm.verts)
        radius=max(math.hypot(v.co.x,v.co.y) for v in bm.verts)
        for v in bm.verts:
            v.co.x*=1.12/radius;v.co.y*=1.12/radius
            v.co.z=max(-.52,v.co.z*1.05/top)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(low.data);bm.free();low.data.update()
        for polygon in low.data.polygons:polygon.use_smooth=True
        while low.data.uv_layers:low.data.uv_layers.remove(low.data.uv_layers[0])
        uv=low.data.uv_layers.new(name='UVMap')
        for polygon in low.data.polygons:
            for loopIndex in polygon.loop_indices:
                p=low.data.vertices[low.data.loops[loopIndex].vertex_index].co
                uv.data[loopIndex].uv=((p.x+1.3)/2.6,(p.y+1.3)/2.6)
        assert sum(len(p.vertices)-2 for p in low.data.polygons)==56
    for level in (obj, low):
        # Split only genuinely sharp breaks after each LOD is decimated.
        bpy.context.view_layer.objects.active=level;level.select_set(True)
        crease=level.modifiers.new('Broken earth creases','EDGE_SPLIT')
        crease.split_angle=math.radians(70);crease.use_edge_angle=True;crease.use_edge_sharp=False
        bpy.ops.object.modifier_apply(modifier=crease.name);level.select_set(False)
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
